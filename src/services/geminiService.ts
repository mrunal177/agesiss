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
  constructor() {}

  public isAvailable(): boolean {
    return true;
  }

  /**
   * Interpret downscaled video frame JPEG (Advisory only via server proxy)
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

    if (!jpegBase64) {
      return fallback;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000); // 4s deadline

      const res = await fetch('/api/gemini/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jpegBase64 }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          ...fallback,
          latencyMs: Math.round(performance.now() - t0),
        };
      }

      const data = await res.json();
      return {
        isOnline: true,
        latencyMs: Math.round(performance.now() - t0),
        box_open: !!data.box_open,
        red_state: data.red_state || 'INSIDE_BOX',
        yellow_state: data.yellow_state || 'INSIDE_BOX',
        hand_holding: data.hand_holding || null,
        current_action: data.current_action || 'IDLE',
        timestamp: data.timestamp || new Date().toTimeString().split(' ')[0],
        rawText: data.rawText,
      };
    } catch {
      return {
        ...fallback,
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  }

  /**
   * Natural-language text -> structured steps via server-side Gemini or deterministic regex fallback
   */
  public async parseNaturalProtocol(text: string): Promise<ProtocolStep[]> {
    // 1. Check if server can parse with Gemini
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/gemini/parse-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
          return data.steps;
        }
      }
    } catch {
      // Fall through to regex
    }

    // 2. Deterministic regex fallback
    return this.parseWithRegex(text);
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
