import { GoogleGenAI } from '@google/genai';
import { ProtocolStep } from '../types';

export interface SceneInterpretation {
  isOnline: boolean;
  latencyMs: number;
  box_open: boolean;
  red_state: string;
  yellow_state: string;
  hand_holding: string | null;
  current_action: string;
  rawText?: string;
  timestamp: string;
  message?: string;
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string = '';

  constructor() {
    this.apiKey =
      (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
      '';

    if (this.apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      } catch {
        this.ai = null;
      }
    }
  }

  public isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Interpret downscaled video frame JPEG (Advisory only)
   */
  public async interpretFrame(jpegBase64: string): Promise<SceneInterpretation> {
    const t0 = performance.now();
    const fallback: SceneInterpretation = {
      isOnline: false,
      latencyMs: 0,
      box_open: false,
      red_state: 'INSIDE_BOX',
      yellow_state: 'INSIDE_BOX',
      hand_holding: null,
      current_action: 'MONITORING',
      timestamp: new Date().toTimeString().split(' ')[0],
      message: 'Offline — local pipeline active',
    };

    if (!this.ai) {
      return fallback;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000); // 3s deadline

      const prompt = `Analyze this biological experiment payload frame. Return strictly valid JSON:
{
  "box_open": boolean,
  "red_state": "UNSEEN" | "INSIDE_BOX" | "HELD" | "TARGET_ZONE" | "OUTSIDE",
  "yellow_state": "UNSEEN" | "INSIDE_BOX" | "HELD" | "TARGET_ZONE" | "OUTSIDE",
  "hand_holding": "red" | "yellow" | null,
  "current_action": "OPENING_BOX" | "PICKING" | "PLACING" | "IDLE"
}`;

      // Clean base64 header if present
      const cleanBase64 = jpegBase64.replace(/^data:image\/\w+;base64,/, '');

      const response = await this.ai.models.generateContent({
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

      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - t0);
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isOnline: true,
          latencyMs,
          box_open: !!parsed.box_open,
          red_state: parsed.red_state || 'INSIDE_BOX',
          yellow_state: parsed.yellow_state || 'INSIDE_BOX',
          hand_holding: parsed.hand_holding || null,
          current_action: parsed.current_action || 'IDLE',
          timestamp: new Date().toTimeString().split(' ')[0],
        };
      }

      return {
        ...fallback,
        isOnline: true,
        latencyMs,
        rawText: text,
      };
    } catch {
      return {
        ...fallback,
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  }

  /**
   * Natural-language text -> structured steps via Gemini or deterministic regex fallback
   */
  public async parseNaturalProtocol(text: string): Promise<ProtocolStep[]> {
    // 1. Deterministic regex fallback for open|pick|place ... red|yellow|box
    const deterministicSteps = this.parseWithRegex(text);

    if (!this.ai) {
      return deterministicSteps;
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

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const responseText = response.text || '';
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s, idx) => ({
            id: idx + 1,
            name: s.name || `${s.type}_${(s.object || 'OBJ').toUpperCase()}`,
            type: s.type || 'PICK',
            object: s.object || 'red',
            voice: s.voice || `Please ${s.type.toLowerCase()} the ${s.object}.`,
          }));
        }
      }
    } catch {
      // Use deterministic fallback
    }

    return deterministicSteps;
  }

  private parseWithRegex(text: string): ProtocolStep[] {
    const lines = text.split(/[\n.;]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
    const steps: ProtocolStep[] = [];
    let stepId = 1;

    for (const line of lines) {
      if (line.includes('open') && line.includes('box')) {
        steps.push({
          id: stepId++,
          name: 'OPEN_BOX',
          type: 'OPEN',
          object: 'box',
          voice: 'Please open the box.',
        });
      } else if (line.includes('pick') || line.includes('grasp') || line.includes('take')) {
        const obj = line.includes('yellow') ? 'yellow' : 'red';
        steps.push({
          id: stepId++,
          name: `PICK_${obj.toUpperCase()}`,
          type: 'PICK',
          object: obj,
          voice: `Please pick the ${obj} object.`,
        });
      } else if (line.includes('place') || line.includes('deposit') || line.includes('put') || line.includes('transfer')) {
        const obj = line.includes('yellow') ? 'yellow' : 'red';
        steps.push({
          id: stepId++,
          name: `PLACE_${obj.toUpperCase()}`,
          type: 'PLACE',
          object: obj,
          voice: `Please place the ${obj} object in the target zone.`,
        });
      }
    }

    if (steps.length === 0) {
      // Default to standard sequence
      return [
        { id: 1, name: 'OPEN_BOX', type: 'OPEN', object: 'box', voice: 'Please open the box.' },
        { id: 2, name: 'PICK_RED', type: 'PICK', object: 'red', voice: 'Please pick the red object.' },
        { id: 3, name: 'PLACE_RED', type: 'PLACE', object: 'red', voice: 'Please place the red object in the target zone.' },
        { id: 4, name: 'PICK_YELLOW', type: 'PICK', object: 'yellow', voice: 'Please pick the yellow object.' },
        { id: 5, name: 'PLACE_YELLOW', type: 'PLACE', object: 'yellow', voice: 'Please place the yellow object in the target zone.' },
      ];
    }

    return steps;
  }
}
