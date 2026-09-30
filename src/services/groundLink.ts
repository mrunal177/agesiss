// Ground Link Client for AEGIS
// Handles REST telemetry transmission and binary video WebSocket streaming

import { FSMOutcome } from '../types';

export interface GroundLinkStatus {
  connected: boolean;
  streaming: boolean;
  endpoint: string;
  wsUrl: string;
  bytesSent: number;
  bitrateKbps: number;
  lastError?: string;
}

export class GroundLinkService {
  private host: string = 'localhost:8000';
  private ws: WebSocket | null = null;
  private isStreaming: boolean = false;
  private bytesSent: number = 0;
  private lastBytesSent: number = 0;
  private lastBitrateCalcT: number = 0;
  private currentBitrate: number = 0;
  private isConnected: boolean = false;
  private subscribers: Array<(status: GroundLinkStatus) => void> = [];

  constructor(host: string = 'localhost:8000') {
    this.host = host;
    this.checkHealth();
  }

  public setHost(host: string) {
    this.host = host.trim();
    this.checkHealth();
  }

  public subscribe(cb: (status: GroundLinkStatus) => void) {
    this.subscribers.push(cb);
    cb(this.getStatus());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notify() {
    const s = this.getStatus();
    for (const sub of this.subscribers) {
      sub(s);
    }
  }

  public getStatus(): GroundLinkStatus {
    return {
      connected: this.isConnected,
      streaming: this.isStreaming,
      endpoint: `http://${this.host}`,
      wsUrl: `ws://${this.host}/ws/stream`,
      bytesSent: this.bytesSent,
      bitrateKbps: Math.round(this.currentBitrate),
    };
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://${this.host}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.isConnected = res.ok;
    } catch {
      this.isConnected = false;
    }
    this.notify();
    return this.isConnected;
  }

  public async sendLog(outcome: FSMOutcome): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const res = await fetch(`http://${this.host}/api/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outcome),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public startStreaming(): boolean {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    try {
      this.ws = new WebSocket(`ws://${this.host}/ws/stream`);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.isStreaming = true;
        this.isConnected = true;
        this.lastBitrateCalcT = performance.now();
        this.lastBytesSent = this.bytesSent;
        this.notify();
      };

      this.ws.onclose = () => {
        this.isStreaming = false;
        this.currentBitrate = 0;
        this.notify();
      };

      this.ws.onerror = () => {
        this.isStreaming = false;
        this.notify();
      };

      return true;
    } catch {
      this.isStreaming = false;
      this.notify();
      return false;
    }
  }

  public sendVideoChunk(chunk: Blob | ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (chunk instanceof Blob) {
      chunk.arrayBuffer().then((buf) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(buf);
          this.trackBytes(buf.byteLength);
        }
      });
    } else {
      this.ws.send(chunk);
      this.trackBytes(chunk.byteLength);
    }
  }

  private trackBytes(size: number) {
    this.bytesSent += size;
    const now = performance.now();
    const dt = (now - this.lastBitrateCalcT) / 1000;
    if (dt >= 1.0) {
      const deltaBytes = this.bytesSent - this.lastBytesSent;
      this.currentBitrate = (deltaBytes * 8) / (dt * 1024); // kbps
      this.lastBitrateCalcT = now;
      this.lastBytesSent = this.bytesSent;
      this.notify();
    }
  }

  public stopStreaming() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignored
      }
      this.ws = null;
    }
    this.isStreaming = false;
    this.currentBitrate = 0;
    this.notify();
  }
}
