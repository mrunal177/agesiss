import { CONFIG } from '../config';
import {
  BoundingBox,
  BoxMode,
  ColorCalibration,
  ColorRangeHSV,
  HandData,
  ObjectState,
  PerceptionFrame,
  Point2D,
  RegionOfInterest,
  TrackedObject,
} from '../types';
import { EventDetector } from './eventDetector';
import { FSMEngine } from './fsmEngine';
import { GestureController, GestureStatus } from './gestureController';
import { HandTracker, HandTrackingResult } from './handTracker';
import { Logger } from './logger';
import { PerceptionPipeline } from './perception';
import { VirtualCamera } from './virtualCamera';
import { VoiceQueue } from './voiceQueue';

export type SessionState = 'idle' | 'running' | 'paused' | 'complete';

export interface HeartbeatMetrics {
  framesGrabbed: number;
  framesProcessed: number;
  processingFPS: number;
  redBlobArea: number | null;
  yellowBlobArea: number | null;
  handStatus: 'landmarks' | 'motion' | 'none';
  boxChangeRatio: number;
  eventsEmitted: number;
  fsmIdx: number;
  isBlackFrame: boolean;
  isLoopRunning: boolean;
  stuckCounters: {
    framesProcessed: boolean;
    redBlob: boolean;
    yellowBlob: boolean;
    hand: boolean;
    boxSensor: boolean;
  };
  isBoxGrabbedByWebcam?: boolean;
  handGesture?: string;
  isHandGrabbing?: boolean;
  isPinching?: boolean;
  pinchDistance?: number;
  gestureStatus?: GestureStatus;
}

export interface SelfTestCheckItem {
  id: string;
  label: string;
  passed: boolean;
  progress: number; // 0 to 1
  detail?: string;
  hint?: string;
}

export interface RunnerState {
  sessionState: SessionState;
  heartbeat: HeartbeatMetrics;
  boxROI: RegionOfInterest;
  targetROI: RegionOfInterest;
  boxMode: BoxMode;
  colors: ColorCalibration;
  isCalibrating: boolean;
  calibrationMode: 'none' | 'move_box' | 'move_target' | 'sample_red' | 'sample_yellow';
  isSelfTestActive: boolean;
  selfTestRemainingSec: number;
  selfTestResults: SelfTestCheckItem[] | null;
  trackedObjects: TrackedObject[];
  blurScore: number;
  isBlurry: boolean;
  sourceMode: 'live' | 'virtual' | 'replay';
  activeScenarioId: string;
  isBoxGrabbedByWebcam?: boolean;
  handData?: HandData;
  gestureStatus: GestureStatus;
  mirrorWebcam: boolean;
}

// Default zones: Box ROI = central 50% of 320x240; Target = bottom-right 25%
export const DEFAULT_CENTRAL_BOX_ROI: RegionOfInterest = {
  x: 80,
  y: 60,
  w: 160,
  h: 120,
};

export const DEFAULT_BOTTOM_RIGHT_TARGET_ROI: RegionOfInterest = {
  x: 200,
  y: 140,
  w: 100,
  h: 80,
};

export const DEFAULT_HSV_COLORS: ColorCalibration = {
  red: [
    { hMin: 0, hMax: 10, sMin: 120, sMax: 255, vMin: 80, vMax: 255 },
    { hMin: 170, hMax: 180, sMin: 120, sMax: 255, vMin: 80, vMax: 255 },
  ],
  yellow: [
    { hMin: 20, hMax: 35, sMin: 120, sMax: 255, vMin: 100, vMax: 255 },
  ],
};

export class PerceptionRunner {
  // Processing Canvas (offscreen 320x240)
  public procCanvas: HTMLCanvasElement;
  public procCtx: CanvasRenderingContext2D;

  // External DOM element hooks
  private videoEl: HTMLVideoElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  // Modules
  public pipeline: PerceptionPipeline;
  public detector: EventDetector;
  public fsm: FSMEngine;
  public logger: Logger;
  public voice: VoiceQueue;
  public virtualCamera: VirtualCamera;

  // Configuration & State
  public sessionState: SessionState = 'idle';
  public boxROI: RegionOfInterest = { ...DEFAULT_CENTRAL_BOX_ROI };
  public targetROI: RegionOfInterest = { ...DEFAULT_BOTTOM_RIGHT_TARGET_ROI };
  public boxMode: BoxMode = 'A';
  public colors: ColorCalibration = { ...DEFAULT_HSV_COLORS };
  public sourceMode: 'live' | 'virtual' | 'replay' = 'live';
  public activeScenarioId: string = 'TC-01';

  // Webcam Hand & Finger Tracking with Grab & Gesture State Machine
  public handTracker: HandTracker = new HandTracker();
  public gestureController: GestureController = new GestureController();
  public mirrorWebcam: boolean = true;
  public isBoxGrabbedByWebcam: boolean = false;
  private webcamGrabOffset: Point2D | null = null;
  public currentHandData: HandData = { present: false, fingertips: [] };
  public currentGestureStatus: GestureStatus = {
    state: 'IDLE',
    primaryText: 'POINT TO AN OBJECT',
    secondaryText: 'Use your index finger to target an object',
    targetedObject: null,
    holdingObject: null,
    indexTip: null,
    thumbTip: null,
    pinchPoint: null,
    pinchDistance: 50,
    isPinching: false,
    inTargetZone: false,
    handPresent: false,
  };

  // Calibration
  public isCalibrating: boolean = false;
  public calibrationMode: 'none' | 'move_box' | 'move_target' | 'sample_red' | 'sample_yellow' = 'none';
  private liveMaskSampleType: 'red' | 'yellow' | null = null;

  // Image & Motion memory
  private prevGray: Uint8ClampedArray | null = null;
  private closedBoxBaseline: { gray: Uint8ClampedArray; meanLum: number } | null = null;
  private blackFrameCount: number = 0;
  private isBlackFrame: boolean = false;

  // Heartbeat Counters
  private framesGrabbed: number = 0;
  private framesProcessed: number = 0;
  private lastProcessedCount: number = 0;
  private lastHeartbeatT: number = performance.now();
  private instantFPS: number = 0;
  private redBlobArea: number | null = null;
  private yellowBlobArea: number | null = null;
  private handStatus: 'landmarks' | 'motion' | 'none' = 'none';
  private boxChangeRatio: number = 0;
  private eventsEmittedCount: number = 0;

  // Stuck counters (seconds stuck at 0)
  private stuckSeconds = {
    framesProcessed: 0,
    redBlob: 0,
    yellowBlob: 0,
    hand: 0,
    boxSensor: 0,
  };

  // Self-Test State
  public isSelfTestActive: boolean = false;
  private selfTestRemainingSec: number = 45;
  private selfTestTimerId: any = null;
  private selfTestCounters = {
    redFrames: 0,
    yellowFrames: 0,
    handInBoxFrames: 0,
    handInTargetFrames: 0,
    motionFrames: 0,
    touchDurationMs: 0,
    releaseDurationMs: 0,
    touchState: 'none' as 'none' | 'touching' | 'released',
  };

  // Execution Loop
  private animId: number | null = null;
  private isRunningLoop: boolean = false;
  private lastLoopT: number = 0;
  private replayFrames: PerceptionFrame[] = [];
  private replayIdx: number = 0;

  // Subscribers
  private subscribers: Array<(state: RunnerState) => void> = [];
  private lastStoreNotifyT: number = 0;

  constructor(logger: Logger, voice: VoiceQueue, fsm: FSMEngine) {
    this.logger = logger;
    this.voice = voice;
    this.fsm = fsm;

    this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = CONFIG.PROC_W;
    this.procCanvas.height = CONFIG.PROC_H;
    const ctx = this.procCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create processing 2D context');
    this.procCtx = ctx;

    this.pipeline = new PerceptionPipeline({
      boxROI: this.boxROI,
      targetROI: this.targetROI,
      colors: this.colors,
    });

    this.detector = new EventDetector({
      boxROI: this.boxROI,
      targetROI: this.targetROI,
      boxMode: this.boxMode,
    });

    this.virtualCamera = new VirtualCamera(this.boxROI, this.targetROI);

    // Start 1-second interval for heartbeat stuck counter checks & self-test
    setInterval(() => this.onHeartbeatTick(), 1000);
  }

  public subscribe(cb: (state: RunnerState) => void) {
    this.subscribers.push(cb);
    cb(this.getState());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notify() {
    const s = this.getState();
    for (const sub of this.subscribers) {
      sub(s);
    }
  }

  public getState(): RunnerState {
    return {
      sessionState: this.sessionState,
      heartbeat: {
        framesGrabbed: this.framesGrabbed,
        framesProcessed: this.framesProcessed,
        processingFPS: Math.round(this.instantFPS),
        redBlobArea: this.redBlobArea,
        yellowBlobArea: this.yellowBlobArea,
        handStatus: this.handStatus,
        boxChangeRatio: Math.round(this.boxChangeRatio),
        eventsEmitted: this.eventsEmittedCount,
        fsmIdx: this.fsm.idx,
        isBlackFrame: this.isBlackFrame,
        isLoopRunning: this.isRunningLoop,
        stuckCounters: {
          framesProcessed: this.stuckSeconds.framesProcessed >= 5,
          redBlob: this.stuckSeconds.redBlob >= 5,
          yellowBlob: this.stuckSeconds.yellowBlob >= 5,
          hand: this.stuckSeconds.hand >= 5,
          boxSensor: this.stuckSeconds.boxSensor >= 5,
        },
        isPinching: this.currentGestureStatus.isPinching,
        pinchDistance: this.currentGestureStatus.pinchDistance,
        gestureStatus: this.currentGestureStatus,
      },
      boxROI: { ...this.boxROI },
      targetROI: { ...this.targetROI },
      boxMode: this.boxMode,
      colors: { ...this.colors },
      isCalibrating: this.isCalibrating,
      calibrationMode: this.calibrationMode,
      isSelfTestActive: this.isSelfTestActive,
      selfTestRemainingSec: this.selfTestRemainingSec,
      selfTestResults: this.getSelfTestResults(),
      trackedObjects: this.detector.getTrackedObjects(),
      blurScore: 100,
      isBlurry: false,
      sourceMode: this.sourceMode,
      activeScenarioId: this.activeScenarioId,
      handData: this.currentHandData,
      gestureStatus: this.currentGestureStatus,
      mirrorWebcam: this.mirrorWebcam,
    };
  }

  public setMirrorWebcam(mirror: boolean) {
    this.mirrorWebcam = mirror;
    this.notify();
  }

  public setVideoElement(video: HTMLVideoElement | null) {
    this.videoEl = video;
  }

  public setOverlayCanvas(canvas: HTMLCanvasElement | null) {
    this.overlayCanvas = canvas;
    this.overlayCtx = canvas ? canvas.getContext('2d') : null;
  }

  public setReplayFrames(frames: PerceptionFrame[]) {
    this.replayFrames = frames;
    this.replayIdx = 0;
  }

  public setSourceMode(mode: 'live' | 'virtual' | 'replay') {
    this.sourceMode = mode;
    this.notify();
  }

  public setSessionState(st: SessionState) {
    this.sessionState = st;
    if (st === 'running') {
      this.fsm.isPaused = false;
    } else if (st === 'paused') {
      this.fsm.isPaused = true;
    }
    this.notify();
  }

  public updateROIs(box: RegionOfInterest, target: RegionOfInterest) {
    this.boxROI = { ...box };
    this.targetROI = { ...target };
    this.virtualCamera.updateROIs(this.boxROI, this.targetROI);
    this.pipeline.boxROI = this.boxROI;
    this.pipeline.targetROI = this.targetROI;
    this.detector.boxROI = this.boxROI;
    this.detector.targetROI = this.targetROI;
    this.notify();
  }

  public updateColors(colors: ColorCalibration) {
    this.colors = colors;
    this.pipeline.colors = colors;
    this.notify();
  }

  public setBoxMode(mode: BoxMode) {
    this.boxMode = mode;
    this.detector.setBoxMode(mode);
    this.notify();
  }

  public triggerBoxOpen() {
    this.virtualCamera.setBoxOpen(true);
    this.detector.requestForceBoxOpen();
    if (this.sessionState === 'idle') {
      this.fsm.startExperiment();
      this.setSessionState('running');
    }
    if (this.fsm.idx === 0) {
      const ev = this.detector.triggerBoxOpen();
      this.eventsEmittedCount++;
      this.fsm.onAction(ev);
    }
    this.notify();
  }

  public captureClosedBoxBaseline() {
    if (this.prevGray) {
      const W = CONFIG.PROC_W;
      let sum = 0;
      let count = 0;
      for (let y = this.boxROI.y; y < this.boxROI.y + this.boxROI.h; y++) {
        for (let x = this.boxROI.x; x < this.boxROI.x + this.boxROI.w; x++) {
          sum += this.prevGray[y * W + x];
          count++;
        }
      }
      this.closedBoxBaseline = {
        gray: new Uint8ClampedArray(this.prevGray),
        meanLum: count > 0 ? sum / count : 100,
      };
      this.boxChangeRatio = 0;
      this.notify();
    }
  }

  public sampleColorAt(normalizedX: number, normalizedY: number, targetColor: 'red' | 'yellow') {
    const px = Math.max(0, Math.min(CONFIG.PROC_W - 1, Math.round(normalizedX * CONFIG.PROC_W)));
    const py = Math.max(0, Math.min(CONFIG.PROC_H - 1, Math.round(normalizedY * CONFIG.PROC_H)));

    try {
      const imgData = this.procCtx.getImageData(0, 0, CONFIG.PROC_W, CONFIG.PROC_H);
      const newRanges = this.pipeline.calibratePatch(imgData, px, py);
      if (targetColor === 'red') {
        this.colors = { ...this.colors, red: newRanges };
      } else {
        this.colors = { ...this.colors, yellow: newRanges };
      }
      this.pipeline.colors = this.colors;
      this.notify();
    } catch {
      // Ignored
    }
  }

  /**
   * Main Engine Lifecycle - Outside React
   */
  public start() {
    if (this.isRunningLoop) return;
    this.isRunningLoop = true;
    this.lastLoopT = performance.now();

    const loop = (timestamp: number) => {
      if (!this.isRunningLoop) return;
      this.animId = requestAnimationFrame(loop);

      // Throttle loop to ~25-30 FPS (~33ms)
      if (timestamp - this.lastLoopT < 32) return;
      const dt = (timestamp - this.lastLoopT) / 1000;
      this.lastLoopT = timestamp;
      if (dt > 0) {
        this.instantFPS = 0.2 * (1 / dt) + 0.8 * this.instantFPS;
      }

      this.stepFrame(timestamp);
    };

    this.animId = requestAnimationFrame(loop);
  }

  public stop() {
    this.isRunningLoop = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  /**
   * Single frame execution step
   */
  private stepFrame(now: number) {
    const W = CONFIG.PROC_W;
    const H = CONFIG.PROC_H;

    let redObs = { visible: false, centroid: { x: 0, y: 0 }, bbox: { x: 0, y: 0, w: 20, h: 20 }, area: 0 };
    let yellowObs = { visible: false, centroid: { x: 0, y: 0 }, bbox: { x: 0, y: 0, w: 20, h: 20 }, area: 0 };
    let handData: HandData = { present: false, fingertips: [], palmCenter: undefined };
    let currentBoxOpenSignal: boolean | undefined = undefined;

    if (this.sourceMode === 'live' || this.sourceMode === 'virtual') {
      const video = this.videoEl;
      let frameSource: CanvasImageSource | null = null;

      const isVideoReady =
        this.sourceMode === 'live' &&
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        !video.paused;

      if (isVideoReady && video) {
        frameSource = video;
        this.procCtx.drawImage(frameSource, 0, 0, W, H);
      } else {
        // Use Virtual Space Payload Camera
        this.virtualCamera.render();
        frameSource = this.virtualCamera.canvas;
        this.procCtx.drawImage(frameSource, 0, 0, W, H);
      }

      this.framesGrabbed++;
      const imgData = this.procCtx.getImageData(0, 0, W, H);

      // Track user's hand & fingertips in real-time from webcam
      const handRes = this.handTracker.processFrame(
        isVideoReady && video ? video : null,
        imgData,
        now,
        this.mirrorWebcam
      );
      this.currentHandData = handRes;

      if (handRes.present) {
        handData = handRes;
        this.handStatus = handRes.source === 'mediapipe' ? 'landmarks' : 'motion';
      }

      // Execute Real Webcam Finger Control State Machine:
      // Point -> Pinch to Pick -> Move -> Release to Place
      const gestureRes = this.gestureController.update(
        handRes,
        this.virtualCamera.redPos,
        this.virtualCamera.yellowPos,
        this.boxROI,
        this.targetROI,
        this.fsm.idx,
        this.virtualCamera.boxOpen
      );
      this.currentGestureStatus = gestureRes.gestureStatus;

      // 5. While pinching, the RED/YELLOW object MUST FOLLOW THE INDEX FINGERTIP POSITION on the video
      if (gestureRes.newRedPos) {
        this.virtualCamera.redPos = gestureRes.newRedPos;
      }
      if (gestureRes.newYellowPos) {
        this.virtualCamera.yellowPos = gestureRes.newYellowPos;
      }

      // Handle gesture action triggers
      if (gestureRes.actionTrigger) {
        if (gestureRes.actionTrigger === 'OPEN_BOX') {
          this.triggerBoxOpen();
        } else if (gestureRes.actionTrigger === 'PICK_RED') {
          this.virtualCamera.handHolding = 'red';
          if (this.sessionState === 'idle') {
            this.fsm.startExperiment();
            this.setSessionState('running');
          }
          if (this.fsm.idx === 1) {
            const ev = this.detector.triggerManualPick('red', now);
            this.eventsEmittedCount++;
            this.fsm.onAction(ev);
          }
        } else if (gestureRes.actionTrigger === 'PLACE_RED') {
          this.virtualCamera.handHolding = 'none';
          if (this.fsm.idx === 2) {
            const ev = this.detector.triggerManualPlace('red', now);
            this.eventsEmittedCount++;
            this.fsm.onAction(ev);
          }
        } else if (gestureRes.actionTrigger === 'PICK_YELLOW') {
          this.virtualCamera.handHolding = 'yellow';
          if (this.sessionState === 'idle') {
            this.fsm.startExperiment();
            this.setSessionState('running');
          }
          if (this.fsm.idx === 3) {
            const ev = this.detector.triggerManualPick('yellow', now);
            this.eventsEmittedCount++;
            this.fsm.onAction(ev);
          }
        } else if (gestureRes.actionTrigger === 'PLACE_YELLOW') {
          this.virtualCamera.handHolding = 'none';
          if (this.fsm.idx === 4) {
            const ev = this.detector.triggerManualPlace('yellow', now);
            this.eventsEmittedCount++;
            this.fsm.onAction(ev);
          }
        }
      }

      // If interactive overlay is active during live webcam, composite updated specimens onto procCtx
      if (isVideoReady && video) {
        if (
          this.virtualCamera.showInteractiveOverlayOnLive ||
          this.virtualCamera.handVisible ||
          this.virtualCamera.boxOpen
        ) {
          this.virtualCamera.render();
          this.procCtx.save();
          this.procCtx.globalAlpha = 0.95;
          this.procCtx.drawImage(this.virtualCamera.canvas, 0, 0, W, H);
          this.procCtx.restore();
        }
      }

      const data = imgData.data;

      // 1. Mean luminance calculation & black frame detection
      let lumSum = 0;
      const totalPixels = W * H;
      const currentGray = new Uint8ClampedArray(totalPixels);

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        currentGray[j] = lum;
        lumSum += lum;
      }

      const meanLum = lumSum / totalPixels;
      if (meanLum < 5) {
        this.blackFrameCount++;
        if (this.blackFrameCount >= 30) {
          this.isBlackFrame = true;
        }
      } else {
        this.blackFrameCount = 0;
        this.isBlackFrame = false;
      }

      // 2. Color segmentation for Red and Yellow
      const redSeg = this.pipeline.segmentColor(imgData, this.colors.red);
      const yellowSeg = this.pipeline.segmentColor(imgData, this.colors.yellow);

      redObs = {
        visible: redSeg.visible,
        centroid: this.pipeline.smoothCentroid('red', redSeg.centroid),
        bbox: redSeg.bbox,
        area: redSeg.area,
      };

      yellowObs = {
        visible: yellowSeg.visible,
        centroid: this.pipeline.smoothCentroid('yellow', yellowSeg.centroid),
        bbox: yellowSeg.bbox,
        area: yellowSeg.area,
      };

      this.redBlobArea = redSeg.visible ? redSeg.area : null;
      this.yellowBlobArea = yellowSeg.visible ? yellowSeg.area : null;

      // 3. Motion fallback tracking using prevGray
      let motionPixelsInFrame = 0;
      let motionInBoxCount = 0;
      let motionInTargetCount = 0;

      if (this.prevGray && this.prevGray.length === currentGray.length) {
        let handMotionDetected = false;
        let handMotionPos: Point2D | null = null;

        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            const idx = y * W + x;
            const diff = Math.abs(currentGray[idx] - this.prevGray[idx]);
            if (diff > 25) {
              motionPixelsInFrame += 4;
              if (
                x >= this.boxROI.x &&
                x <= this.boxROI.x + this.boxROI.w &&
                y >= this.boxROI.y &&
                y <= this.boxROI.y + this.boxROI.h
              ) {
                motionInBoxCount += 4;
              }
              if (
                x >= this.targetROI.x &&
                x <= this.targetROI.x + this.targetROI.w &&
                y >= this.targetROI.y &&
                y <= this.targetROI.y + this.targetROI.h
              ) {
                motionInTargetCount += 4;
              }
              if (!handMotionPos) {
                handMotionPos = { x, y };
              }
            }
          }
        }

        // Motion coverage calculation
        const motionCoverage = motionPixelsInFrame / totalPixels;

        // Check contact on objects
        const redContact = this.pipeline.estimateFallbackContact(currentGray, W, H, redObs.bbox);
        const yellowContact = this.pipeline.estimateFallbackContact(currentGray, W, H, yellowObs.bbox);

        if (!handRes.present) {
          if (motionPixelsInFrame > 0.02 * totalPixels) {
            handData = {
              present: true,
              fingertips: handMotionPos ? [handMotionPos] : [],
              palmCenter: handMotionPos || undefined,
            };
            this.handStatus = 'motion';
          } else {
            this.handStatus = 'none';
          }
        }

        // Update Self-Test checks
        if (this.isSelfTestActive) {
          if (motionCoverage >= 0.05) this.selfTestCounters.motionFrames++;
          if (motionInBoxCount > 0.05 * (this.boxROI.w * this.boxROI.h)) {
            this.selfTestCounters.handInBoxFrames++;
            this.selfTestCounters.touchDurationMs += 33;
          } else {
            if (this.selfTestCounters.touchDurationMs >= 500) {
              this.selfTestCounters.releaseDurationMs += 33;
            }
          }
          if (motionInTargetCount > 0.05 * (this.targetROI.w * this.targetROI.h)) {
            this.selfTestCounters.handInTargetFrames++;
          }
        }
      }

      // 4. Box Sensor changeRatio %
      let boxLumSum = 0;
      let boxPixelCount = 0;
      for (let y = this.boxROI.y; y < this.boxROI.y + this.boxROI.h; y += 2) {
        for (let x = this.boxROI.x; x < this.boxROI.x + this.boxROI.w; x += 2) {
          boxLumSum += currentGray[y * W + x];
          boxPixelCount++;
        }
      }
      const curBoxLum = boxPixelCount > 0 ? boxLumSum / boxPixelCount : 100;

      if (this.closedBoxBaseline) {
        const base = Math.max(1, this.closedBoxBaseline.meanLum);
        this.boxChangeRatio = Math.min(100, (Math.abs(curBoxLum - base) / base) * 100);
      } else {
        // Fallback: motion inside box as change ratio
        this.boxChangeRatio = Math.min(100, (motionInBoxCount / Math.max(1, this.boxROI.w * this.boxROI.h)) * 100);
      }

      // Determine box open signal for EventDetector
      if (this.sourceMode === 'virtual') {
        currentBoxOpenSignal = this.virtualCamera.boxOpen;
      } else if (this.sourceMode === 'live') {
        const handInBoxArea =
          handData.present &&
          ((handData.palmCenter &&
            this.detector.isInsideROI(handData.palmCenter, this.boxROI, 1.2)) ||
            (handData.fingertips.length > 0 &&
              this.detector.isInsideROI(handData.fingertips[0], this.boxROI, 1.2)) ||
            motionInBoxCount > 60);

        currentBoxOpenSignal =
          this.virtualCamera.boxOpen ||
          this.boxChangeRatio >= 15 ||
          motionInBoxCount > 0.015 * (this.boxROI.w * this.boxROI.h) ||
          handInBoxArea;
      }

      // Store previous frame grayscale
      if (!this.prevGray || this.prevGray.length !== currentGray.length) {
        this.prevGray = new Uint8ClampedArray(currentGray);
      } else {
        this.prevGray.set(currentGray);
      }
    } else {
      // Replay mode from deterministic scenario frames
      if (this.replayFrames.length > 0) {
        this.replayIdx = (this.replayIdx + 1) % this.replayFrames.length;
        const frame = this.replayFrames[this.replayIdx];
        redObs = {
          visible: frame.red.visible,
          centroid: frame.red.centroid,
          bbox: frame.red.bbox,
          area: frame.red.area || 300,
        };
        yellowObs = {
          visible: frame.yellow.visible,
          centroid: frame.yellow.centroid,
          bbox: frame.yellow.bbox,
          area: frame.yellow.area || 300,
        };
        handData = {
          present: frame.hand.present,
          fingertips: frame.hand.fingertips,
          palmCenter: frame.hand.palmCenter,
        };
        currentBoxOpenSignal = frame.boxOpenSignal;
        this.redBlobArea = redObs.visible ? redObs.area : null;
        this.yellowBlobArea = yellowObs.visible ? yellowObs.area : null;
        this.handStatus = handData.present ? 'landmarks' : 'none';
        this.boxChangeRatio = currentBoxOpenSignal ? 85 : 12;
      }
    }

    this.framesProcessed++;

    // 5. Update Guided Self-Test counters
    if (this.isSelfTestActive) {
      if (redObs.visible && (redObs.area || 0) >= CONFIG.MIN_BLOB_AREA) {
        this.selfTestCounters.redFrames++;
      }
      if (yellowObs.visible && (yellowObs.area || 0) >= CONFIG.MIN_BLOB_AREA) {
        this.selfTestCounters.yellowFrames++;
      }
    }

    // 6. Run EventDetector
    // In 'idle' state, overlays & box sensor still update, but events are ONLY processed & dispatched to FSM when 'running'!
    if (this.sessionState === 'running') {
      const detectionRes = this.detector.processFrame(
        now,
        redObs,
        yellowObs,
        handData,
        this.fsm.idx,
        currentBoxOpenSignal
      );

      if (detectionRes.lostDetected) {
        this.fsm.handleLost(detectionRes.lostDetected.object, detectionRes.lostDetected.t);
      }
      if (detectionRes.wrongZoneDetected) {
        this.fsm.handleWrongZone(detectionRes.wrongZoneDetected.object, detectionRes.wrongZoneDetected.t);
      }
      for (const ev of detectionRes.events) {
        this.eventsEmittedCount++;
        this.fsm.onAction(ev);
      }

      this.fsm.updateStates(
        {
          red: this.detector.getObjectState('red'),
          yellow: this.detector.getObjectState('yellow'),
        },
        now
      );

      if (this.fsm.isComplete()) {
        this.sessionState = 'complete';
      }
    }

    // 7. Draw to Overlay Canvas
    this.renderOverlay();

    // 8. Throttle state notification to ~10 Hz (every 100ms)
    if (now - this.lastStoreNotifyT >= 100) {
      this.lastStoreNotifyT = now;
      this.notify();
    }
  }

  /**
   * Heartbeat 1-second interval
   */
  private onHeartbeatTick() {
    const deltaFrames = this.framesProcessed - this.lastProcessedCount;
    this.lastProcessedCount = this.framesProcessed;

    if (deltaFrames === 0) {
      this.stuckSeconds.framesProcessed++;
    } else {
      this.stuckSeconds.framesProcessed = 0;
    }

    if (!this.redBlobArea || this.redBlobArea === 0) {
      this.stuckSeconds.redBlob++;
    } else {
      this.stuckSeconds.redBlob = 0;
    }

    if (!this.yellowBlobArea || this.yellowBlobArea === 0) {
      this.stuckSeconds.yellowBlob++;
    } else {
      this.stuckSeconds.yellowBlob = 0;
    }

    if (this.handStatus === 'none') {
      this.stuckSeconds.hand++;
    } else {
      this.stuckSeconds.hand = 0;
    }

    if (this.boxChangeRatio === 0) {
      this.stuckSeconds.boxSensor++;
    } else {
      this.stuckSeconds.boxSensor = 0;
    }

    // Self-test countdown
    if (this.isSelfTestActive) {
      if (this.selfTestRemainingSec > 0) {
        this.selfTestRemainingSec--;
      } else {
        this.isSelfTestActive = false;
      }
    }

    this.notify();
  }

  /**
   * Self-test control
   */
  public startSelfTest() {
    this.isSelfTestActive = true;
    this.selfTestRemainingSec = 45;
    this.selfTestCounters = {
      redFrames: 0,
      yellowFrames: 0,
      handInBoxFrames: 0,
      handInTargetFrames: 0,
      motionFrames: 0,
      touchDurationMs: 0,
      releaseDurationMs: 0,
      touchState: 'none',
    };
    this.notify();
  }

  public stopSelfTest() {
    this.isSelfTestActive = false;
    this.notify();
  }

  public getSelfTestResults(): SelfTestCheckItem[] {
    const c = this.selfTestCounters;
    return [
      {
        id: 'ST-01',
        label: 'Hold the red object in view',
        passed: c.redFrames >= 10,
        progress: Math.min(1.0, c.redFrames / 10),
        detail: `${c.redFrames}/10 frames`,
        hint: 'Red not detected: recalibrate red or reduce glare',
      },
      {
        id: 'ST-02',
        label: 'Hold the yellow object in view',
        passed: c.yellowFrames >= 10,
        progress: Math.min(1.0, c.yellowFrames / 10),
        detail: `${c.yellowFrames}/10 frames`,
        hint: 'Yellow not detected: recalibrate yellow or adjust lighting',
      },
      {
        id: 'ST-03',
        label: 'Move your hand into the box region',
        passed: c.handInBoxFrames >= 10,
        progress: Math.min(1.0, c.handInBoxFrames / 10),
        detail: `${c.handInBoxFrames}/10 frames`,
        hint: 'Hand not detected in box: ensure box ROI covers chamber entrance',
      },
      {
        id: 'ST-04',
        label: 'Move your hand into the target zone',
        passed: c.handInTargetFrames >= 1,
        progress: Math.min(1.0, c.handInTargetFrames / 5),
        detail: `${c.handInTargetFrames} frames`,
        hint: 'Target zone motion absent: verify target ROI placement',
      },
      {
        id: 'ST-05',
        label: 'Wave your hand quickly',
        passed: c.motionFrames >= 5,
        progress: Math.min(1.0, c.motionFrames / 5),
        detail: `${c.motionFrames}/5 frames`,
        hint: 'Motion coverage < 5%: ensure camera is receiving fresh frames',
      },
      {
        id: 'ST-06',
        label: 'Touch the box and release',
        passed: c.touchDurationMs >= 500 && c.releaseDurationMs >= 300,
        progress: Math.min(1.0, (c.touchDurationMs + c.releaseDurationMs) / 800),
        detail: `${Math.round(c.touchDurationMs)}ms touch / ${Math.round(c.releaseDurationMs)}ms release`,
        hint: 'Touch & release rule C not fired: dwell hand for 500ms then remove',
      },
    ];
  }

  /**
   * Render overlays onto overlayCanvas (synchronized to video resolution)
   */
  private renderOverlay() {
    const canvas = this.overlayCanvas;
    if (!canvas) return;
    const ctx = this.overlayCtx;
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const scaleX = w / CONFIG.PROC_W;
    const scaleY = h / CONFIG.PROC_H;

    const video = this.videoEl;
    const isPhysicalWebcamPlaying =
      this.sourceMode === 'live' &&
      video &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      !video.paused;

    // When physical webcam is not displaying under the canvas, render virtual payload background!
    if (!isPhysicalWebcamPlaying) {
      if (this.sourceMode === 'replay' && this.replayFrames.length > 0) {
        const frame = this.replayFrames[this.replayIdx];
        if (frame) {
          this.virtualCamera.boxOpen = !!frame.boxOpenSignal;
          if (frame.red.visible) this.virtualCamera.redPos = frame.red.centroid;
          if (frame.yellow.visible) this.virtualCamera.yellowPos = frame.yellow.centroid;
          if (frame.hand.present && frame.hand.palmCenter) {
            this.virtualCamera.handVisible = true;
            this.virtualCamera.handPos = frame.hand.palmCenter;
          } else {
            this.virtualCamera.handVisible = false;
          }
          this.virtualCamera.render();
        }
      }
      ctx.drawImage(this.virtualCamera.canvas, 0, 0, w, h);
    } else {
      // In live webcam mode: If interactive overlay is enabled (default true), render the virtual payload objects (lid, red vial, yellow vial, hand)
      // directly on top of the webcam feed so the user can interactively slide open the lid and move vials on-screen!
      if (this.virtualCamera.showInteractiveOverlayOnLive) {
        ctx.save();
        // Render box chamber & lid inside boxROI
        const bX = this.boxROI.x * scaleX;
        const bY = this.boxROI.y * scaleY;
        const bW = this.boxROI.w * scaleX;
        const bH = this.boxROI.h * scaleY;

        // Render interior container base
        ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
        ctx.fillRect(bX, bY, bW, bH);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bX, bY, bW, bH);

        // Rack slots inside box
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(bX + 15 * scaleX, bY + 20 * scaleY, 50 * scaleX, 80 * scaleY);
        ctx.fillRect(bX + 85 * scaleX, bY + 20 * scaleY, 50 * scaleX, 80 * scaleY);

        // Render specimens (Red & Yellow)
        const objRadius = 11 * Math.min(scaleX, scaleY);
        const now = performance.now();

        // Red Specimen Vial
        const rX = this.virtualCamera.redPos.x * scaleX;
        const rY = this.virtualCamera.redPos.y * scaleY;

        const isRedTargeted = this.currentGestureStatus.targetedObject === 'red';
        const isRedHolding = this.currentGestureStatus.holdingObject === 'red';

        // 3. Highlight RED object when index fingertip is over RED
        if (isRedTargeted || isRedHolding) {
          ctx.save();
          const pulseR = objRadius + 8 + Math.sin(now / 150) * 3;
          ctx.strokeStyle = isRedHolding ? '#10b981' : '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(rX, rY, pulseR, 0, Math.PI * 2);
          ctx.stroke();

          // Reticle corner brackets
          const brk = pulseR + 4;
          ctx.beginPath();
          ctx.moveTo(rX - brk, rY - 6); ctx.lineTo(rX - brk, rY - brk); ctx.lineTo(rX - 6, rY - brk);
          ctx.moveTo(rX + brk, rY - 6); ctx.lineTo(rX + brk, rY - brk); ctx.lineTo(rX + 6, rY - brk);
          ctx.moveTo(rX - brk, rY + 6); ctx.lineTo(rX - brk, rY + brk); ctx.lineTo(rX - 6, rY + brk);
          ctx.moveTo(rX + brk, rY + 6); ctx.lineTo(rX + brk, rY + brk); ctx.lineTo(rX + 6, rY + brk);
          ctx.stroke();

          // Highlighting text above specimen
          ctx.fillStyle = isRedHolding ? '#34d399' : '#38bdf8';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            isRedHolding ? '✊ PINCHING RED · MOVE TO TARGET' : '🎯 POINTING AT RED · PINCH TO PICK',
            rX,
            rY - pulseR - 6
          );
          ctx.textAlign = 'start';
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(rX, rY + 4, objRadius, objRadius / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        const redGrad = ctx.createRadialGradient(rX - 3, rY - 3, 2, rX, rY, objRadius);
        redGrad.addColorStop(0, '#ff4d4d');
        redGrad.addColorStop(0.7, '#e60000');
        redGrad.addColorStop(1, '#990000');
        ctx.fillStyle = redGrad;
        ctx.beginPath();
        ctx.arc(rX, rY, objRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isRedHolding ? '#34d399' : '#ffffff';
        ctx.lineWidth = isRedHolding ? 2.5 : 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(rX, rY - 5 * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();

        if (!isRedTargeted && !isRedHolding) {
          ctx.fillStyle = '#fca5a5';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('🔴 RED (PINCH TO PICK)', rX - 44, rY - 14);
        }

        // Yellow Reagent Vial
        const yX = this.virtualCamera.yellowPos.x * scaleX;
        const yY = this.virtualCamera.yellowPos.y * scaleY;

        const isYellowTargeted = this.currentGestureStatus.targetedObject === 'yellow';
        const isYellowHolding = this.currentGestureStatus.holdingObject === 'yellow';

        // 8. Highlight YELLOW object when index fingertip is over YELLOW
        if (isYellowTargeted || isYellowHolding) {
          ctx.save();
          const pulseR = objRadius + 8 + Math.sin(now / 150) * 3;
          ctx.strokeStyle = isYellowHolding ? '#10b981' : '#facc15';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(yX, yY, pulseR, 0, Math.PI * 2);
          ctx.stroke();

          // Reticle corner brackets
          const brk = pulseR + 4;
          ctx.beginPath();
          ctx.moveTo(yX - brk, yY - 6); ctx.lineTo(yX - brk, yY - brk); ctx.lineTo(yX - 6, yY - brk);
          ctx.moveTo(yX + brk, yY - 6); ctx.lineTo(yX + brk, yY - brk); ctx.lineTo(yX + 6, yY - brk);
          ctx.moveTo(yX - brk, yY + 6); ctx.lineTo(yX - brk, yY + brk); ctx.lineTo(yX - 6, yY + brk);
          ctx.moveTo(yX + brk, yY + 6); ctx.lineTo(yX + brk, yY + brk); ctx.lineTo(yX + 6, yY + brk);
          ctx.stroke();

          // Highlighting text above specimen
          ctx.fillStyle = isYellowHolding ? '#34d399' : '#facc15';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            isYellowHolding ? '✊ PINCHING YELLOW · MOVE TO TARGET' : '🎯 POINTING AT YELLOW · PINCH TO PICK',
            yX,
            yY - pulseR - 6
          );
          ctx.textAlign = 'start';
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(yX, yY + 4, objRadius, objRadius / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        const yellowGrad = ctx.createRadialGradient(yX - 3, yY - 3, 2, yX, yY, objRadius);
        yellowGrad.addColorStop(0, '#ffea4d');
        yellowGrad.addColorStop(0.7, '#eab308');
        yellowGrad.addColorStop(1, '#a16207');
        ctx.fillStyle = yellowGrad;
        ctx.beginPath();
        ctx.arc(yX, yY, objRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isYellowHolding ? '#34d399' : '#ffffff';
        ctx.lineWidth = isYellowHolding ? 2.5 : 1.5;
        ctx.stroke();

        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.arc(yX, yY - 5 * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();

        if (!isYellowTargeted && !isYellowHolding) {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('🟡 YELLOW (PINCH TO PICK)', yX - 52, yY - 14);
        }

        // Render On-Screen Box Lid (if not fully open)
        const lidSlide = this.virtualCamera.boxOpen
          ? Math.max(0.7, this.virtualCamera.lidSlideOffset)
          : this.virtualCamera.lidSlideOffset;

        if (lidSlide < 0.95) {
          const lidYOffset = -lidSlide * (bH * 0.9);
          const lidXOffset = -lidSlide * 15;
          const curLidY = bY + lidYOffset;
          const curLidX = bX + lidXOffset;

          // Lid shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(curLidX + 4, curLidY + 6, bW, bH);

          // Lid body (semi-translucent space-grade polymer lid)
          const lidGrad = ctx.createLinearGradient(curLidX, curLidY, curLidX + bW, curLidY + bH);
          lidGrad.addColorStop(0, 'rgba(51, 65, 85, 0.95)');
          lidGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.95)');
          lidGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
          ctx.fillStyle = lidGrad;
          ctx.fillRect(curLidX, curLidY, bW, bH);

          // Seam border
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(curLidX, curLidY, bW, bH);

          // Interactive central latch handle
          const hW = 100 * scaleX;
          const hH = 30 * scaleY;
          const hX = curLidX + bW / 2 - hW / 2;
          const hY = curLidY + bH / 2 - hH / 2;

          ctx.fillStyle = '#0284c7';
          ctx.fillRect(hX, hY, hW, hH);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(hX, hY, hW, hH);

          // Latch ridges
          ctx.fillStyle = '#ffffff';
          for (let i = -30; i <= 30; i += 12) {
            ctx.fillRect(hX + hW / 2 + i - 1, hY + 6, 2.5, hH - 12);
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('▲ WAVE OR PINCH TO OPEN LID ▲', curLidX + bW / 2, curLidY + bH / 2 + 32);
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#7dd3fc';
          ctx.fillText('BOX LATCH (POINT & PINCH)', curLidX + bW / 2, curLidY + bH / 2 - 20);
          ctx.textAlign = 'start';
        } else {
          // Open folded lid tab at top
          ctx.fillStyle = 'rgba(55, 65, 81, 0.9)';
          ctx.fillRect(bX, bY - 18 * scaleY, bW, 16 * scaleY);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bX, bY - 18 * scaleY, bW, 16 * scaleY);

          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('✓ CHAMBER LID OPEN', bX + 8, bY - 6 * scaleY);
        }

        // Draw astronaut hand if visible
        if (this.virtualCamera.handVisible) {
          const vhX = this.virtualCamera.handPos.x * scaleX;
          const vhY = this.virtualCamera.handPos.y * scaleY;
          ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
          ctx.beginPath();
          ctx.arc(vhX, vhY, 14 * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.restore();
      } else if (this.virtualCamera.handVisible) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.virtualCamera.canvas, 0, 0, w, h);
        ctx.restore();
      }
    }

    // 1. Box ROI (cyan/emerald)
    const bX = this.boxROI.x * scaleX;
    const bY = this.boxROI.y * scaleY;
    const bW = this.boxROI.w * scaleX;
    const bH = this.boxROI.h * scaleY;

    const isStep0 = this.fsm.idx === 0 && this.sessionState !== 'complete';
    const isBoxActionActive = isStep0 && (this.boxChangeRatio >= 15 || this.virtualCamera.boxOpen);

    if (isBoxActionActive) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3;
      ctx.strokeRect(bX, bY, bW, bH);

      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('✓ ACTION DETECTED · BOX OPENING', bX + 6, bY + 16);
    } else if (isStep0) {
      // Highlighted for Step 1
      ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(bX, bY, bW, bH);
      ctx.setLineDash([]);

      ctx.fillStyle = '#0891B2';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('BOX REGION — Wave hand or open lid here', bX + 6, bY + 16);
    } else {
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bX, bY, bW, bH);
      ctx.setLineDash([]);

      ctx.fillStyle = '#06B6D4';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('BOX REGION', bX + 6, bY + 16);
    }

    // 2. Target Zone (emerald)
    const tX = this.targetROI.x * scaleX;
    const tY = this.targetROI.y * scaleY;
    const tW = this.targetROI.w * scaleX;
    const tH = this.targetROI.h * scaleY;

    const isHoldingAny = !!this.currentGestureStatus.holdingObject;
    if (isHoldingAny) {
      // 6. Highlight target zone prominently when user is carrying specimen
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.fillRect(tX, tY, tW, tH);
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(tX, tY, tW, tH);

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('🎯 TARGET ZONE: RELEASE PINCH TO PLACE', tX + 6, tY + 20);
    } else {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(tX, tY, tW, tH);
      ctx.setLineDash([]);

      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('TARGET ZONE', tX + 6, tY + 16);
    }

    // 3. Tracked Objects (Bounding boxes, label, state chip, payload-relative x/y)
    const tracked = this.detector.getTrackedObjects();
    for (const obj of tracked) {
      if (!obj.visible) continue;
      const isRed = obj.label === 'red';
      const colorHex = isRed ? '#EF4444' : '#EAB308';

      const ox = obj.bbox.x * scaleX;
      const oy = obj.bbox.y * scaleY;
      const ow = obj.bbox.w * scaleX;
      const oh = obj.bbox.h * scaleY;

      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(ox, oy, ow, oh);

      // Trajectory trail
      if (obj.trajectory.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = isRed ? 'rgba(239, 68, 68, 0.5)' : 'rgba(234, 179, 8, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < obj.trajectory.length; i++) {
          const pt = obj.trajectory[i];
          const px = pt.x * scaleX;
          const py = pt.y * scaleY;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Payload-relative normalized coords (0-1 relative to Box ROI)
      const relX = ((obj.centroid.x - this.boxROI.x) / this.boxROI.w).toFixed(2);
      const relY = ((obj.centroid.y - this.boxROI.y) / this.boxROI.h).toFixed(2);

      // Object label tag
      ctx.fillStyle = 'rgba(11, 14, 23, 0.9)';
      ctx.fillRect(ox, Math.max(0, oy - 22), 140, 20);
      ctx.fillStyle = colorHex;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(
        `${obj.id.toUpperCase()} · ${obj.state} · (${relX},${relY})`,
        ox + 4,
        Math.max(14, oy - 8)
      );
    }

    // 4. Real Webcam Hand & Index Fingertip Control Overlay
    if (this.currentHandData.present && this.currentHandData.indexTip) {
      ctx.save();
      const fx = this.currentHandData.indexTip.x * scaleX;
      const fy = this.currentHandData.indexTip.y * scaleY;
      const isPinching = this.currentGestureStatus.isPinching;

      // Draw tether line between fingertip and held specimen
      if (this.currentGestureStatus.holdingObject === 'red') {
        const rx = this.virtualCamera.redPos.x * scaleX;
        const ry = this.virtualCamera.redPos.y * scaleY;
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (this.currentGestureStatus.holdingObject === 'yellow') {
        const yx = this.virtualCamera.yellowPos.x * scaleX;
        const yy = this.virtualCamera.yellowPos.y * scaleY;
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(yx, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Thumb Tip & connecting pinch line
      if (this.currentHandData.thumbTip) {
        const tx = this.currentHandData.thumbTip.x * scaleX;
        const ty = this.currentHandData.thumbTip.y * scaleY;

        ctx.fillStyle = isPinching ? '#10b981' : '#06b6d4';
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isPinching ? 'rgba(16, 185, 129, 0.85)' : 'rgba(6, 182, 212, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isPinching) {
        // Pinching icon
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(fx, fy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('🤏 PINCH', fx + 14, fy + 4);
      } else {
        // Pointing Reticle
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy, 11, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(fx - 15, fy); ctx.lineTo(fx - 5, fy);
        ctx.moveTo(fx + 5, fy); ctx.lineTo(fx + 15, fy);
        ctx.moveTo(fx, fy - 15); ctx.lineTo(fx, fy - 5);
        ctx.moveTo(fx, fy + 5); ctx.lineTo(fx, fy + 15);
        ctx.stroke();

        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#67e8f9';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('👉 INDEX FINGER', fx + 16, fy + 4);
      }
      ctx.restore();
    }

    // 5. Top Guidance HUD Bar
    ctx.save();
    const hudW = w - 24;
    const hudH = 26;
    const hudX = 12;
    const hudY = 8;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(hudX, hudY, hudW, hudH);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(hudX, hudY, hudW, hudH);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('✋ WEBCAM FINGER CONTROL:', hudX + 8, hudY + 17);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '500 10px monospace';
    ctx.fillText('Point → Pinch to Pick → Move → Release to Place.', hudX + 172, hudY + 17);

    // Right status badge
    const badgeText = this.currentGestureStatus.primaryText;
    ctx.font = 'bold 10px monospace';
    const bWidth = ctx.measureText(badgeText).width + 16;
    const bLeft = hudX + hudW - bWidth - 6;

    const isSuccess = badgeText.includes('PLACED') || badgeText.includes('BOX');
    const isWarn = badgeText.includes('HOLDING') || badgeText.includes('TARGETED');
    ctx.fillStyle = isSuccess ? 'rgba(16, 185, 129, 0.25)' : isWarn ? 'rgba(234, 179, 8, 0.25)' : 'rgba(6, 182, 212, 0.25)';
    ctx.fillRect(bLeft, hudY + 3, bWidth, hudH - 6);
    ctx.strokeStyle = isSuccess ? '#10b981' : isWarn ? '#eab308' : '#06b6d4';
    ctx.strokeRect(bLeft, hudY + 3, bWidth, hudH - 6);

    ctx.fillStyle = isSuccess ? '#34d399' : isWarn ? '#fde047' : '#67e8f9';
    ctx.fillText(badgeText, bLeft + 8, hudY + 17);
    ctx.restore();

    // 6. Calibration handles if in Calibration mode
    if (this.isCalibrating) {
      const drawHandles = (x: number, y: number, w: number, h: number, color: string) => {
        ctx.fillStyle = color;
        const s = 8;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.fillRect(x + w - s / 2, y - s / 2, s, s);
        ctx.fillRect(x - s / 2, y + h - s / 2, s, s);
        ctx.fillRect(x + w - s / 2, y + h - s / 2, s, s);
      };
      drawHandles(bX, bY, bW, bH, '#06B6D4');
      drawHandles(tX, tY, tW, tH, '#10B981');
    }
  }
}
