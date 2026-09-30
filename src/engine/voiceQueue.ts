import { CONFIG } from '../config';

export interface SpokenLine {
  id: string;
  text: string;
  timestamp: string;
  type: 'guidance' | 'alert' | 'status';
}

export class VoiceQueue {
  private queue: Array<{ text: string; isAlert: boolean; type: 'guidance' | 'alert' | 'status' }> = [];
  private history: SpokenLine[] = [];
  private lastAlertTime: Map<string, number> = new Map();
  private lastSpokenText: string = '';
  private isSpeaking: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 1.0;
  private isHeadless: boolean = false;
  private onTranscriptUpdate?: (transcript: SpokenLine[]) => void;

  constructor(options?: { isHeadless?: boolean; onTranscriptUpdate?: (t: SpokenLine[]) => void }) {
    this.isHeadless = !!options?.isHeadless;
    this.onTranscriptUpdate = options?.onTranscriptUpdate;
  }

  public setHeadless(headless: boolean) {
    this.isHeadless = headless;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getHistory(): SpokenLine[] {
    return [...this.history];
  }

  public getRawHistoryTexts(): string[] {
    return this.history.map((h) => h.text);
  }

  public clearHistory() {
    this.history = [];
    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate(this.history);
    }
  }

  public speak(text: string, isAlert: boolean = false, type: 'guidance' | 'alert' | 'status' = 'guidance', alertKey?: string): boolean {
    const now = performance.now();

    // Alert cooldown check
    if (isAlert && alertKey) {
      const lastTime = this.lastAlertTime.get(alertKey);
      if (lastTime && now - lastTime < CONFIG.ALERT_COOLDOWN_MS) {
        return false;
      }
      this.lastAlertTime.set(alertKey, now);
    }

    const item: SpokenLine = {
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      text,
      timestamp: new Date().toTimeString().split(' ')[0],
      type,
    };

    this.history.push(item);
    this.lastSpokenText = text;
    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate([...this.history]);
    }

    if (this.isHeadless) {
      return true;
    }

    if (this.isMuted) {
      return true;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return true;
    }

    if (isAlert) {
      // Alerts pre-empt queued speech
      window.speechSynthesis.cancel();
      this.queue = [];
      this.speakImmediate(text);
    } else {
      this.queue.push({ text, isAlert, type });
      if (!this.isSpeaking) {
        this.processQueue();
      }
    }

    return true;
  }

  private processQueue() {
    if (this.queue.length === 0 || this.isMuted) {
      this.isSpeaking = false;
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    this.isSpeaking = true;
    this.speakImmediate(next.text, () => {
      this.isSpeaking = false;
      this.processQueue();
    });
  }

  private speakImmediate(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = this.volume;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (onEnd) onEnd();
    }
  }

  public replayLast() {
    if (this.lastSpokenText) {
      this.speak(this.lastSpokenText, true, 'guidance');
    }
  }

  public stop() {
    this.queue = [];
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
  }
}
