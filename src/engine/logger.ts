import { FSMOutcome } from '../types';

const DB_NAME = 'aegis_telemetry_db';
const STORE_NAME = 'events';

export class Logger {
  private events: FSMOutcome[] = [];
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private subscribers: Array<(events: FSMOutcome[]) => void> = [];

  constructor() {
    this.initIndexedDB();
  }

  private initIndexedDB() {
    if (typeof window === 'undefined' || !window.indexedDB) {
      this.dbPromise = Promise.resolve(null);
      return;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    // Load existing items into memory
    this.loadFromDB();
  }

  private async loadFromDB() {
    const db = await this.dbPromise;
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (Array.isArray(req.result) && req.result.length > 0) {
          this.events = req.result;
          this.notifySubscribers();
        }
      };
    } catch {
      // Memory fallback
    }
  }

  public subscribe(cb: (events: FSMOutcome[]) => void) {
    this.subscribers.push(cb);
    cb(this.getEvents());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notifySubscribers() {
    const copy = this.getEvents();
    for (const sub of this.subscribers) {
      sub(copy);
    }
  }

  public log(event: FSMOutcome) {
    // Format timestamp as HH:MM:SS if not set
    if (!event.timestamp) {
      event.timestamp = new Date().toTimeString().split(' ')[0];
    }
    // Round confidence to 2 decimals
    event.confidence = Number(event.confidence.toFixed(2));

    this.events.push(event);
    this.notifySubscribers();

    // Async persist to IndexedDB
    this.dbPromise?.then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(event);
      } catch {
        // Ignored
      }
    });
  }

  public getEvents(): FSMOutcome[] {
    return [...this.events];
  }

  public getExactJSONLogs(): Array<{
    timestamp: string;
    step: number;
    action: string;
    expected: string;
    status: string;
    confidence: number;
  }> {
    return this.events.map((e) => ({
      timestamp: e.timestamp,
      step: e.step,
      action: e.action,
      expected: e.expected,
      status: e.status,
      confidence: e.confidence,
    }));
  }

  public clear() {
    this.events = [];
    this.notifySubscribers();
    this.dbPromise?.then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
      } catch {
        // Ignored
      }
    });
  }

  public updateAlertReview(index: number, review: 'valid' | 'false') {
    if (this.events[index]) {
      this.events[index].alertReview = review;
      this.notifySubscribers();
    }
  }

  public getMetrics() {
    const total = this.events.length;
    if (total === 0) {
      return {
        totalEvents: 0,
        stepAccuracy: null,
        falseAlerts: 0,
        avgAlertLatency: null,
        hasData: false,
      };
    }

    const successes = this.events.filter((e) => e.status === 'SUCCESS').length;
    const alerts = this.events.filter(
      (e) =>
        e.status === 'OUT_OF_SEQUENCE' ||
        e.status === 'SKIPPED_STEP' ||
        e.status === 'REPEATED_STEP' ||
        e.status === 'LOST' ||
        e.status === 'WRONG_OBJECT_OR_ZONE'
    );

    // False alerts = reviewed as False OR occurred during a designated "correct" run
    const falseAlerts = alerts.filter(
      (a) => a.alertReview === 'false' || a.runType === 'correct'
    ).length;

    const latencies = alerts
      .map((a) => a.latencyMs)
      .filter((l): l is number => typeof l === 'number' && !isNaN(l) && l > 0);

    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length
        : null;

    // Accuracy: successes / (successes + verified error steps)
    const accuracy =
      total > 0 ? (successes / total) * 100 : 100;

    return {
      totalEvents: total,
      stepAccuracy: Number(accuracy.toFixed(1)),
      falseAlerts,
      avgAlertLatency: avgLatency !== null ? Number(avgLatency.toFixed(1)) : null,
      hasData: true,
    };
  }

  public exportJSON(): string {
    return JSON.stringify(this.getEvents(), null, 2);
  }

  public exportCSV(): string {
    const headers = [
      'timestamp',
      'step',
      'action',
      'expected',
      'status',
      'confidence',
      'latencyMs',
      'runType',
      'alertReview',
    ];
    const rows = this.events.map((e) => [
      `"${e.timestamp}"`,
      e.step,
      `"${e.action}"`,
      `"${e.expected}"`,
      `"${e.status}"`,
      e.confidence,
      e.latencyMs ?? '',
      `"${e.runType ?? ''}"`,
      `"${e.alertReview ?? ''}"`,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
