import { create } from 'zustand';
import { CONFIG } from '../config';
import { PRIMARY_PROTOCOL } from '../data/protocols';
import { EventDetector } from '../engine/eventDetector';
import { FSMEngine } from '../engine/fsmEngine';
import { Logger } from '../engine/logger';
import {
  DEFAULT_BOTTOM_RIGHT_TARGET_ROI,
  DEFAULT_CENTRAL_BOX_ROI,
  DEFAULT_HSV_COLORS,
  HeartbeatMetrics,
  PerceptionRunner,
  SelfTestCheckItem,
  SessionState,
} from '../engine/runner';
import { SpokenLine, VoiceQueue } from '../engine/voiceQueue';
import { GeminiService, SceneInterpretation } from '../services/geminiService';
import { GroundLinkService, GroundLinkStatus } from '../services/groundLink';
import {
  BoxMode,
  ColorCalibration,
  FSMOutcome,
  ProtocolConfig,
  RegionOfInterest,
  StepStatus,
  TrackedObject,
} from '../types';

export type ScreenId =
  | 'overview'
  | 'live'
  | 'verification'
  | 'protocol'
  | 'events'
  | 'recordings'
  | 'model'
  | 'architecture'
  | 'tests';

export interface RecordedSegment {
  id: string;
  timestamp: string;
  durationSec: number;
  sizeBytes: number;
  url: string;
  blob: Blob;
}

export interface AegisState {
  // Navigation
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;

  // Singletons
  runner: PerceptionRunner;
  detector: EventDetector;
  logger: Logger;
  voice: VoiceQueue;
  fsm: FSMEngine;
  gemini: GeminiService;
  groundLink: GroundLinkService;

  // Session State (FIX 5)
  sessionState: SessionState;

  // Pipeline Heartbeat (FIX 6)
  heartbeat: HeartbeatMetrics;

  // Telemetry & FSM
  protocol: ProtocolConfig;
  fsmIdx: number;
  activeAlert: {
    status: StepStatus;
    message: string;
    object?: string;
    time: number;
  } | null;
  isPaused: boolean;
  isComplete: boolean;
  runType: 'correct' | 'error';
  lastOutcome: FSMOutcome | null;
  events: FSMOutcome[];
  transcript: SpokenLine[];

  // Perception & Zones (FIX 3 & FIX 4)
  trackedObjects: TrackedObject[];
  fps: number;
  blurScore: number;
  isBlurry: boolean;
  isLowFPS: boolean;
  handMode: 'vision' | 'fallback';
  boxMode: BoxMode;
  boxROI: RegionOfInterest;
  targetROI: RegionOfInterest;
  colors: ColorCalibration;
  isDefaultZonesHintDismissed: boolean;

  // Interactive Live Calibration (FIX 4)
  isCalibrating: boolean;
  calibrationMode: 'none' | 'move_box' | 'move_target' | 'sample_red' | 'sample_yellow';

  // Guided Self-Test (FIX 7)
  isSelfTestActive: boolean;
  selfTestRemainingSec: number;
  selfTestResults: SelfTestCheckItem[] | null;

  // Source & Replay
  sourceMode: 'live' | 'virtual' | 'replay';
  activeScenarioId: string;

  // Ground link
  groundStatus: GroundLinkStatus;

  // Advisory AI
  sceneInterpretation: SceneInterpretation | null;

  // Setup Wizard & Guided Walkthrough
  isSetupWizardOpen: boolean;
  isWalkthroughActive: boolean;
  walkthroughStep: number;

  // Recording
  isRecording: boolean;
  recordings: RecordedSegment[];
  totalVideoBytes: number;

  // Actions
  setProtocol: (p: ProtocolConfig) => void;
  setRunType: (t: 'correct' | 'error') => void;
  setSourceMode: (m: 'live' | 'virtual' | 'replay') => void;
  toggleVirtualBox: () => void;
  triggerBoxOpen: () => void;
  executeVirtualStep: (stepName: 'OPEN' | 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'WAVE_HAND' | 'TOUCH_BOX' | 'AUTO_PLAY') => Promise<void>;
  setBoxMode: (m: BoxMode) => void;
  setROIs: (box: RegionOfInterest, target: RegionOfInterest) => void;
  setColors: (colors: ColorCalibration) => void;
  setIsCalibrating: (cal: boolean) => void;
  setCalibrationMode: (mode: 'none' | 'move_box' | 'move_target' | 'sample_red' | 'sample_yellow') => void;
  sampleColorAt: (normX: number, normY: number, target: 'red' | 'yellow') => void;
  captureClosedBoxBaseline: () => void;
  dismissDefaultZonesHint: () => void;
  openSetupWizard: () => void;
  closeSetupWizard: () => void;
  startWalkthrough: () => void;
  stopWalkthrough: () => void;
  nextWalkthroughStep: () => void;
  prevWalkthroughStep: () => void;
  addRecordingSegment: (seg: RecordedSegment) => void;
  clearRecordings: () => void;
  toggleRecording: () => void;
  startSession: (bypassPreflight?: boolean) => { started: boolean; error?: string };
  pauseSession: () => void;
  resumeSession: () => void;
  resetSession: () => void;
  clearAlert: () => void;
  startSelfTest: () => void;
  stopSelfTest: () => void;
}

// Instantiate single core instances
const initialLogger = new Logger();
const initialVoice = new VoiceQueue();
const initialFsm = new FSMEngine(initialLogger, initialVoice, PRIMARY_PROTOCOL);
const initialGemini = new GeminiService();
const initialGroundLink = new GroundLinkService();

// Create the single runner instance (FIX 1)
const runner = new PerceptionRunner(initialLogger, initialVoice, initialFsm);
// Start the runner loop immediately outside React
runner.start();

export const useAegisStore = create<AegisState>((set, get) => {
  // Sync Logger to state
  initialLogger.subscribe((events) => {
    set({ events });
  });

  // Sync Voice transcripts to state
  initialVoice['onTranscriptUpdate'] = (transcript) => {
    set({ transcript: [...transcript] });
  };

  // Sync FSM snapshots
  initialFsm.subscribe((snap) => {
    set({
      fsmIdx: snap.idx,
      activeAlert: snap.activeAlert,
      isPaused: snap.isPaused,
      isComplete: snap.isComplete,
      runType: snap.runType,
      lastOutcome: snap.lastOutcome,
    });
  });

  // Sync Ground Link status
  initialGroundLink.subscribe((groundStatus) => {
    set({ groundStatus });
  });

  // Subscribe to Runner state updates (~10 Hz)
  runner.subscribe((rState) => {
    set({
      sessionState: rState.sessionState,
      heartbeat: rState.heartbeat,
      boxROI: rState.boxROI,
      targetROI: rState.targetROI,
      boxMode: rState.boxMode,
      colors: rState.colors,
      isCalibrating: rState.isCalibrating,
      calibrationMode: rState.calibrationMode,
      isSelfTestActive: rState.isSelfTestActive,
      selfTestRemainingSec: rState.selfTestRemainingSec,
      selfTestResults: rState.selfTestResults,
      trackedObjects: rState.trackedObjects,
      blurScore: rState.blurScore,
      isBlurry: rState.isBlurry,
      fps: rState.heartbeat.processingFPS,
      sourceMode: rState.sourceMode,
      activeScenarioId: rState.activeScenarioId,
    });
  });

  return {
    activeScreen: 'overview',
    setActiveScreen: (screen) => set({ activeScreen: screen }),

    runner,
    detector: runner.detector,
    logger: initialLogger,
    voice: initialVoice,
    fsm: initialFsm,
    gemini: initialGemini,
    groundLink: initialGroundLink,

    sessionState: 'idle',
    heartbeat: runner.getState().heartbeat,

    protocol: PRIMARY_PROTOCOL,
    fsmIdx: 0,
    activeAlert: null,
    isPaused: false,
    isComplete: false,
    runType: 'correct',
    lastOutcome: null,
    events: [],
    transcript: [],

    trackedObjects: [],
    fps: 25,
    blurScore: 110,
    isBlurry: false,
    isLowFPS: false,
    handMode: 'vision',
    boxMode: 'A',
    boxROI: { ...DEFAULT_CENTRAL_BOX_ROI },
    targetROI: { ...DEFAULT_BOTTOM_RIGHT_TARGET_ROI },
    colors: { ...DEFAULT_HSV_COLORS },
    isDefaultZonesHintDismissed: false,

    isCalibrating: false,
    calibrationMode: 'none',

    isSelfTestActive: false,
    selfTestRemainingSec: 45,
    selfTestResults: null,

    sourceMode: 'live',
    activeScenarioId: 'TC-01',

    groundStatus: initialGroundLink.getStatus(),
    sceneInterpretation: null,

    isSetupWizardOpen: false,
    isWalkthroughActive: false,
    walkthroughStep: 0,

    isRecording: false,
    recordings: [],
    totalVideoBytes: 0,

    setProtocol: (protocol) => {
      get().fsm.setProtocol(protocol);
      set({ protocol });
    },

    setRunType: (runType) => {
      get().fsm.setRunType(runType);
      set({ runType });
    },

    setSourceMode: (sourceMode) => {
      runner.setSourceMode(sourceMode);
      set({ sourceMode });
    },

    toggleVirtualBox: () => {
      runner.virtualCamera.toggleBox();
    },

    triggerBoxOpen: () => {
      runner.triggerBoxOpen();
    },

    executeVirtualStep: async (stepName) => {
      switch (stepName) {
        case 'OPEN':
          await runner.virtualCamera.executeStepOpenBox();
          runner.triggerBoxOpen();
          break;
        case 'PICK_RED':
          runner.pickObject('red');
          await runner.virtualCamera.executeStepPickRed();
          break;
        case 'PLACE_RED':
          await runner.virtualCamera.executeStepPlaceRed();
          runner.placeObject('red');
          break;
        case 'PICK_YELLOW':
          runner.pickObject('yellow');
          await runner.virtualCamera.executeStepPickYellow();
          break;
        case 'PLACE_YELLOW':
          await runner.virtualCamera.executeStepPlaceYellow();
          runner.placeObject('yellow');
          break;
        case 'WAVE_HAND':
          await runner.virtualCamera.waveHand();
          break;
        case 'TOUCH_BOX':
          await runner.virtualCamera.touchBoxAndRelease();
          break;
        case 'AUTO_PLAY':
          await runner.virtualCamera.startAutoPlay();
          break;
      }
    },

    setBoxMode: (boxMode) => {
      runner.setBoxMode(boxMode);
      set({ boxMode });
    },

    setROIs: (boxROI, targetROI) => {
      runner.updateROIs(boxROI, targetROI);
      set({ boxROI, targetROI });
    },

    setColors: (colors) => {
      runner.updateColors(colors);
      set({ colors });
    },

    setIsCalibrating: (isCalibrating) => {
      runner.isCalibrating = isCalibrating;
      set({ isCalibrating });
    },

    setCalibrationMode: (calibrationMode) => {
      runner.calibrationMode = calibrationMode;
      set({ calibrationMode });
    },

    sampleColorAt: (normX, normY, target) => {
      runner.sampleColorAt(normX, normY, target);
    },

    captureClosedBoxBaseline: () => {
      runner.captureClosedBoxBaseline();
    },

    dismissDefaultZonesHint: () => {
      set({ isDefaultZonesHintDismissed: true });
    },

    openSetupWizard: () => set({ isSetupWizardOpen: true }),
    closeSetupWizard: () => set({ isSetupWizardOpen: false }),

    startWalkthrough: () => set({ isWalkthroughActive: true, walkthroughStep: 0 }),
    stopWalkthrough: () => set({ isWalkthroughActive: false }),
    nextWalkthroughStep: () =>
      set((state) => ({ walkthroughStep: Math.min(10, state.walkthroughStep + 1) })),
    prevWalkthroughStep: () =>
      set((state) => ({ walkthroughStep: Math.max(0, state.walkthroughStep - 1) })),

    addRecordingSegment: (seg) =>
      set((state) => ({
        recordings: [seg, ...state.recordings],
        totalVideoBytes: state.totalVideoBytes + seg.sizeBytes,
      })),

    clearRecordings: () => set({ recordings: [], totalVideoBytes: 0 }),

    toggleRecording: () => set((state) => ({ isRecording: !state.isRecording })),

    // FIX 5: Start Session
    startSession: (bypassPreflight = false) => {
      // Unlock speech
      initialVoice.setMuted(false);

      if (!bypassPreflight) {
        // Preflight check
        const tracked = runner.detector.getTrackedObjects();
        const redObj = tracked.find((o) => o.label === 'red');
        const yellowObj = tracked.find((o) => o.label === 'yellow');
        if (runner.boxMode === 'A' && redObj?.state === 'TARGET_ZONE') {
          return {
            started: false,
            error: 'Preflight failed: Target zone is not empty prior to start.',
          };
        }
      }

      runner.detector.reset();
      runner.fsm.startExperiment();
      runner.setSessionState('running');
      return { started: true };
    },

    pauseSession: () => {
      runner.setSessionState('paused');
    },

    resumeSession: () => {
      runner.setSessionState('running');
    },

    resetSession: () => {
      runner.resetSessionState();
    },

    clearAlert: () => {
      runner.fsm.clearAlert('Action verified. Resuming.');
    },

    startSelfTest: () => {
      runner.startSelfTest();
    },

    stopSelfTest: () => {
      runner.stopSelfTest();
    },
  };
});
