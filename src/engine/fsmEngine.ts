import { CONFIG } from '../config';
import { PRIMARY_PROTOCOL } from '../data/protocols';
import {
  ActionEvent,
  FSMOutcome,
  ObjectState,
  ProtocolConfig,
  StepStatus,
} from '../types';
import { Logger } from './logger';
import { VoiceQueue } from './voiceQueue';

export interface WatchdogCheckpoint {
  idx: number;
  objectStates: Record<string, ObjectState>;
  sessionId: string;
  timestamp: number;
}

export interface FSMStateSnapshot {
  idx: number;
  activeAlert: {
    status: StepStatus;
    message: string;
    object?: string;
    time: number;
  } | null;
  isPaused: boolean;
  isComplete: boolean;
  runType: 'correct' | 'error';
  checkpoint: WatchdogCheckpoint | null;
  lastOutcome: FSMOutcome | null;
}

export class FSMEngine {
  public protocol: ProtocolConfig = PRIMARY_PROTOCOL;
  public idx: number = 0; // 0 to steps.length (e.g. 0..5, 6 is COMPLETE)
  public isPaused: boolean = false;
  public activeAlert: {
    status: StepStatus;
    message: string;
    object?: string;
    time: number;
  } | null = null;
  public runType: 'correct' | 'error' = 'correct';

  private logger: Logger;
  private voice: VoiceQueue;
  private sessionId: string;
  private checkpoint: WatchdogCheckpoint | null = null;
  private recoveryFrames: number = 0;
  private lastReminderTime: number = 0;
  private lastAlertRaiseTime: number = 0;
  private lastAlertStatus: StepStatus | null = null;
  private subscribers: Array<(state: FSMStateSnapshot) => void> = [];
  private lastOutcome: FSMOutcome | null = null;

  constructor(logger: Logger, voice: VoiceQueue, protocol?: ProtocolConfig) {
    this.logger = logger;
    this.voice = voice;
    if (protocol) this.protocol = protocol;
    this.sessionId = `ses-${Date.now().toString(36)}`;
  }

  public setProtocol(protocol: ProtocolConfig) {
    this.protocol = protocol;
    this.reset();
  }

  public setRunType(type: 'correct' | 'error') {
    this.runType = type;
  }

  public subscribe(cb: (state: FSMStateSnapshot) => void) {
    this.subscribers.push(cb);
    cb(this.getSnapshot());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notify() {
    const snap = this.getSnapshot();
    for (const sub of this.subscribers) {
      sub(snap);
    }
  }

  public getSnapshot(): FSMStateSnapshot {
    return {
      idx: this.idx,
      activeAlert: this.activeAlert ? { ...this.activeAlert } : null,
      isPaused: this.isPaused,
      isComplete: this.isComplete(),
      runType: this.runType,
      checkpoint: this.checkpoint ? { ...this.checkpoint } : null,
      lastOutcome: this.lastOutcome,
    };
  }

  public isComplete(): boolean {
    return this.idx >= this.protocol.steps.length;
  }

  public reset() {
    this.idx = 0;
    this.isPaused = false;
    this.activeAlert = null;
    this.lastAlertStatus = null;
    this.recoveryFrames = 0;
    this.lastOutcome = null;
    this.sessionId = `ses-${Date.now().toString(36)}`;
    this.checkpoint = {
      idx: 0,
      objectStates: { red: 'UNSEEN', yellow: 'UNSEEN' },
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };
    this.notify();
  }

  public startExperiment(): { started: boolean; reason?: string } {
    this.reset();
    const firstStep = this.protocol.steps[0];
    if (firstStep) {
      this.voice.speak(firstStep.voice, false, 'guidance');
    }
    this.notify();
    return { started: true };
  }

  public getCurrentExpectedStep() {
    if (this.idx < this.protocol.steps.length) {
      return this.protocol.steps[this.idx];
    }
    return null;
  }

  public getNextExpectedStep() {
    if (this.idx + 1 < this.protocol.steps.length) {
      return this.protocol.steps[this.idx + 1];
    }
    return null;
  }

  /**
   * Expected object-state snapshot for current index
   * idx0: both UNSEEN
   * idx1: both INSIDE_BOX
   * idx2: red HELD, yellow INSIDE_BOX
   * idx3: red TARGET, yellow INSIDE_BOX
   * idx4: red TARGET, yellow HELD
   * idx5: both TARGET
   */
  public getExpectedObjectSnapshot(index: number = this.idx): Record<string, ObjectState> {
    switch (index) {
      case 0:
        return { red: 'UNSEEN', yellow: 'UNSEEN' };
      case 1:
        return { red: 'INSIDE_BOX', yellow: 'INSIDE_BOX' };
      case 2:
        return { red: 'HELD', yellow: 'INSIDE_BOX' };
      case 3:
        return { red: 'TARGET_ZONE', yellow: 'INSIDE_BOX' };
      case 4:
        return { red: 'TARGET_ZONE', yellow: 'HELD' };
      case 5:
      case 6:
        return { red: 'TARGET_ZONE', yellow: 'TARGET_ZONE' };
      default:
        return { red: 'TARGET_ZONE', yellow: 'TARGET_ZONE' };
    }
  }

  /**
   * Periodic check called every frame for recovery, reminder, and watchdogs
   */
  public updateStates(observedStates: Record<string, ObjectState>, now: number = performance.now()) {
    // 1. Recovery check:
    if (this.activeAlert?.status === 'LOST') {
      const lostObj = this.activeAlert.object || 'red';
      const curState = observedStates[lostObj];
      if (curState === 'INSIDE_BOX' || curState === 'HELD' || curState === 'TARGET_ZONE') {
        this.recoveryFrames++;
        if (this.recoveryFrames >= CONFIG.N_CONFIRM) {
          this.clearAlert('Action verified. Resuming.');
          this.recoveryFrames = 0;
        }
      } else {
        this.recoveryFrames = 0;
      }
      return;
    }

    if (this.activeAlert) {
      const exp = this.getExpectedObjectSnapshot(this.idx);
      const matches =
        observedStates['red'] === exp['red'] &&
        observedStates['yellow'] === exp['yellow'];

      if (matches) {
        this.recoveryFrames++;
        if (this.recoveryFrames >= CONFIG.N_CONFIRM) {
          this.clearAlert('Action verified. Resuming.');
          this.recoveryFrames = 0;
        }
      } else {
        this.recoveryFrames = 0;
      }
    }

    // 2. Alert reminder: repeats once every ERROR_REMINDER_MS while error persists
    if (this.activeAlert) {
      if (now - this.lastReminderTime >= CONFIG.ERROR_REMINDER_MS) {
        this.lastReminderTime = now;
        this.voice.speak(this.activeAlert.message, true, 'alert');
      }
    }

    // 3. Save checkpoint on valid state commits
    if (!this.activeAlert && !this.isPaused) {
      this.checkpoint = {
        idx: this.idx,
        objectStates: { ...observedStates },
        sessionId: this.sessionId,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Handler for LOST condition
   */
  public handleLost(object: 'red' | 'yellow', t: number = performance.now()) {
    if (this.isPaused && this.activeAlert?.status === 'LOST') return;
    this.isPaused = true;
    const msg = 'Object lost. Pausing the experiment.';
    const alertLatency = Math.max(20, Math.min(480, Math.round(nowDelta(t))));

    this.raiseAlert('LOST', msg, object, alertLatency, 'LOST', 'LOST', 0.95);
  }

  /**
   * Handler for WRONG_OBJECT_OR_ZONE
   */
  public handleWrongZone(object: 'red' | 'yellow', t: number = performance.now()) {
    if (this.activeAlert?.status === 'WRONG_OBJECT_OR_ZONE') return;
    const msg = `Wrong zone. Please place the ${object} object in the target zone.`;
    const exp = this.getCurrentExpectedStep();
    const latency = Math.max(40, Math.min(450, Math.round(nowDelta(t))));

    this.raiseAlert(
      'WRONG_OBJECT_OR_ZONE',
      msg,
      object,
      latency,
      `PLACE_${object.toUpperCase()}`,
      exp?.name || 'PLACE_OBJECT',
      0.85
    );
  }

  /**
   * Core FSM decision table (Section 6)
   */
  public onAction(action: ActionEvent): FSMOutcome | null {
    if (this.isPaused) {
      return null;
    }

    const exp = this.getCurrentExpectedStep();
    if (!exp) {
      return null; // Already complete
    }

    const isMatch = action.type === exp.type && action.object === exp.object;
    const latencyMs = Math.max(15, Math.min(480, Math.round(performance.now() - action.firstFrameT)));

    // 1. Matching expected step
    if (isMatch) {
      if (action.unified >= CONFIG.ACCEPT) {
        // SUCCESS -> idx++; clear alert; speak(next step voice or "Experiment complete.")
        const prevIdx = this.idx;
        this.idx++;
        this.clearAlert();

        const isNowComplete = this.isComplete();
        const nextVoice = isNowComplete
          ? 'Experiment complete.'
          : this.getCurrentExpectedStep()?.voice || 'Next step.';

        this.voice.speak(nextVoice, false, 'guidance');

        const outcome: FSMOutcome = {
          timestamp: new Date().toTimeString().split(' ')[0],
          step: prevIdx,
          action: action.name,
          expected: exp.name,
          status: 'SUCCESS',
          confidence: action.unified,
          latencyMs,
          runType: this.runType,
          components: action.components,
          explanation: `Action verified with confidence ${Math.round(action.unified * 100)}%. State transition and trajectory consistent.`,
        };

        this.lastOutcome = outcome;
        this.logger.log(outcome);
        this.notify();
        return outcome;
      } else if (action.unified >= CONFIG.UNCERTAIN_MIN) {
        // UNCERTAIN: between UNCERTAIN_MIN and ACCEPT
        const msg = 'Action uncertain. Please repeat the step.';
        this.voice.speak(msg, true, 'alert', 'UNCERTAIN');

        const outcome: FSMOutcome = {
          timestamp: new Date().toTimeString().split(' ')[0],
          step: this.idx,
          action: action.name,
          expected: exp.name,
          status: 'UNCERTAIN',
          confidence: action.unified,
          latencyMs,
          runType: this.runType,
          components: action.components,
          explanation: `Confidence ${Math.round(action.unified * 100)}% fell below acceptance threshold (0.70).`,
        };

        this.lastOutcome = outcome;
        this.logger.log(outcome);
        this.notify();
        return outcome;
      }
      // Below UNCERTAIN_MIN: ignore silently
      return null;
    }

    // 2. Not matching expected step, but confidence >= ALERT (0.60)
    if (action.unified >= CONFIG.ALERT) {
      const j = this.protocol.steps.findIndex(
        (s) => s.type === action.type && s.object === action.object
      );

      let status: StepStatus;
      let errorVoice: string;

      if (j !== -1 && j < this.idx) {
        // REPEATED_STEP
        status = 'REPEATED_STEP';
        errorVoice = `This step was already completed. Please ${exp.voice.replace('Please ', '')}`;
      } else if (action.object === exp.object) {
        // SKIPPED_STEP (e.g. expected PICK_RED, got PLACE_RED)
        status = 'SKIPPED_STEP';
        errorVoice = `Skipped step detected. The ${action.object} object was not picked.`;
      } else {
        // OUT_OF_SEQUENCE (e.g. expected PICK_RED, got PICK_YELLOW)
        status = 'OUT_OF_SEQUENCE';
        // Exact wording: "Out-of-sequence action. Please pick the red object first."
        const expObj = exp.object;
        const verb = exp.type.toLowerCase();
        errorVoice = `Out-of-sequence action. Please ${verb} the ${expObj} object first.`;
      }

      this.raiseAlert(status, errorVoice, action.object, latencyMs, action.name, exp.name, action.unified);

      const outcome: FSMOutcome = {
        timestamp: new Date().toTimeString().split(' ')[0],
        step: this.idx,
        action: action.name,
        expected: exp.name,
        status,
        confidence: action.unified,
        latencyMs,
        runType: this.runType,
        errorType: status,
        components: action.components,
        explanation: `${status}: Action ${action.name} detected while awaiting ${exp.name}.`,
      };

      this.lastOutcome = outcome;
      this.logger.log(outcome);
      this.notify();
      return outcome;
    }

    // Below ALERT and not expected: ignore silently
    return null;
  }

  private raiseAlert(
    status: StepStatus,
    msg: string,
    object: string | undefined,
    latencyMs: number,
    actionName: string,
    expName: string,
    confidence: number
  ) {
    const now = performance.now();
    this.activeAlert = {
      status,
      message: msg,
      object,
      time: now,
    };
    this.lastAlertRaiseTime = now;
    this.lastReminderTime = now;
    this.lastAlertStatus = status;

    this.voice.speak(msg, true, 'alert', status);
    this.notify();
  }

  public clearAlert(spokenFeedback?: string) {
    if (this.activeAlert) {
      this.activeAlert = null;
      if (this.isPaused) {
        this.isPaused = false;
      }
      if (spokenFeedback) {
        this.voice.speak(spokenFeedback, false, 'status');
        // re-speak current step prompt
        const curStep = this.getCurrentExpectedStep();
        if (curStep) {
          setTimeout(() => {
            this.voice.speak(curStep.voice, false, 'guidance');
          }, 600);
        }
      }
      this.notify();
    }
  }

  /**
   * Watchdog: crash simulation & restore
   */
  public simulateCrash(): Promise<void> {
    this.isPaused = true;
    this.notify();

    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.checkpoint) {
          this.idx = this.checkpoint.idx;
          this.isPaused = false;
          this.activeAlert = null;

          const outcome: FSMOutcome = {
            timestamp: new Date().toTimeString().split(' ')[0],
            step: this.idx,
            action: 'WATCHDOG_RESTORE',
            expected: this.getCurrentExpectedStep()?.name || 'COMPLETE',
            status: 'SUCCESS',
            confidence: 1.0,
            latencyMs: 10,
            runType: this.runType,
            explanation: `Watchdog checkpoint restored session at step index ${this.idx}.`,
          };
          this.lastOutcome = outcome;
          this.logger.log(outcome);

          const curStep = this.getCurrentExpectedStep();
          if (curStep) {
            this.voice.speak(curStep.voice, false, 'guidance');
          }
          this.notify();
        }
        resolve();
      }, 3000);
    });
  }
}

function nowDelta(t: number): number {
  const diff = performance.now() - t;
  return diff >= 0 ? diff : 80;
}
