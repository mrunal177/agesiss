import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

// Ground station telemetry in-memory cache & log file
const LOG_FILE = path.resolve(__dirname, 'ground_telemetry.jsonl');
const RTSP_TARGET = process.env.RTSP_TARGET || 'rtsp://localhost:8554/aegis';
const inMemoryLogs: any[] = [];

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health / Status endpoint (Ground Station Relay)
app.get(['/api/status', '/api/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'nominal',
    service: 'AEGIS Ground Relay',
    timestamp: new Date().toISOString(),
    rtsp_target: RTSP_TARGET,
  });
});

// Ground Station Protocol specification
app.get('/api/protocol', (_req: Request, res: Response) => {
  res.json({
    id: 'protocol-bas-01',
    name: 'Space Biology Payload: Object Transfer Protocol',
    version: '1.0',
    steps: [
      { id: 1, name: 'OPEN_BOX', type: 'OPEN', object: 'box', voice: 'Please open the box.' },
      { id: 2, name: 'PICK_RED', type: 'PICK', object: 'red', voice: 'Please pick the red object.' },
      { id: 3, name: 'PLACE_RED', type: 'PLACE', object: 'red', voice: 'Please place the red object in the target zone.' },
      { id: 4, name: 'PICK_YELLOW', type: 'PICK', object: 'yellow', voice: 'Please pick the yellow object.' },
      { id: 5, name: 'PLACE_YELLOW', type: 'PLACE', object: 'yellow', voice: 'Please place the yellow object in the target zone.' },
    ],
    preconditions: ['Box closed', 'Red and yellow inside box', 'Target zone empty'],
    postconditions: ['Box open', 'Red and yellow in TARGET_ZONE'],
  });
});

// Ground Station Log ingestion
app.post('/api/log', (req: Request, res: Response) => {
  try {
    const entry = req.body;
    inMemoryLogs.push(entry);
    if (inMemoryLogs.length > 500) {
      inMemoryLogs.shift();
    }
    // Asynchronously write to file
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8', () => {});
    res.json({ saved: true, timestamp: entry.timestamp || new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to persist telemetry log' });
  }
});

// Ground Station Log query
app.get('/api/logs', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '100', 10);
  res.json(inMemoryLogs.slice(-limit));
});

// Server-side Gemini API Client
let genAI: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY || '';
if (apiKey) {
  try {
    genAI = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('[AEGIS Server] Could not initialize Gemini SDK:', err);
  }
}

// Server-side Gemini: Interpret Frame
app.post('/api/gemini/interpret', async (req: Request, res: Response) => {
  const { jpegBase64 } = req.body || {};
  if (!genAI || !apiKey) {
    return res.status(503).json({
      error: 'Gemini API not configured on server (GEMINI_API_KEY missing)',
      isOnline: false,
    });
  }

  if (!jpegBase64) {
    return res.status(400).json({ error: 'Missing jpegBase64 payload' });
  }

  try {
    const cleanBase64 = jpegBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `Analyze this biological experiment payload frame. Return strictly valid JSON:
{
  "box_open": boolean,
  "red_state": "UNSEEN" | "INSIDE_BOX" | "HELD" | "TARGET_ZONE" | "OUTSIDE",
  "yellow_state": "UNSEEN" | "INSIDE_BOX" | "HELD" | "TARGET_ZONE" | "OUTSIDE",
  "hand_holding": "red" | "yellow" | null,
  "current_action": "OPENING_BOX" | "PICKING" | "PLACING" | "IDLE"
}`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({
        isOnline: true,
        box_open: !!parsed.box_open,
        red_state: parsed.red_state || 'INSIDE_BOX',
        yellow_state: parsed.yellow_state || 'INSIDE_BOX',
        hand_holding: parsed.hand_holding || null,
        current_action: parsed.current_action || 'IDLE',
        timestamp: new Date().toTimeString().split(' ')[0],
      });
    }

    return res.json({
      isOnline: true,
      rawText: text,
      timestamp: new Date().toTimeString().split(' ')[0],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gemini inference failed' });
  }
});

// Server-side Gemini: Parse Natural Protocol
app.post('/api/gemini/parse-protocol', async (req: Request, res: Response) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text in request body' });
  }

  if (!genAI || !apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  try {
    const prompt = `Convert the following procedure into a JSON array of protocol steps matching type:
[
  { "id": 1, "name": "OPEN_BOX", "type": "OPEN", "object": "box", "voice": "Please open the box." },
  { "id": 2, "name": "PICK_RED", "type": "PICK", "object": "red", "voice": "Please pick the red object." }
]
Procedure:
"${text}"
Return ONLY raw JSON array. Allowed type: "OPEN"|"PICK"|"PLACE". Allowed object: "box"|"red"|"yellow".`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const responseText = response.text || '';
    const match = responseText.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const steps = parsed.map((s: any, idx: number) => ({
          id: idx + 1,
          name: s.name || `${s.type}_${(s.object || 'OBJ').toUpperCase()}`,
          type: s.type || 'PICK',
          object: s.object || 'red',
          voice: s.voice || `Please ${s.type.toLowerCase()} the ${s.object}.`,
        }));
        return res.json({ steps });
      }
    }

    return res.status(422).json({ error: 'Could not parse response into steps', raw: responseText });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gemini parsing failed' });
  }
});

// WebSocket Server for Video Stream Relay (/ws/stream)
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  let totalBytes = 0;
  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (Buffer.isBuffer(data)) {
      totalBytes += data.length;
    } else if (Array.isArray(data)) {
      data.forEach((b) => (totalBytes += b.length));
    }
  });

  ws.on('close', () => {
    // Stream closed cleanly
  });

  ws.on('error', () => {});
});

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/ws/stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Mount Vite or static files
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, host, () => {
    console.log(`[AEGIS] System running on http://${host}:${port}`);
  });
}

startServer();
