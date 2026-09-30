// Core domain types for AEGIS
// Pure TypeScript - no React dependencies

export type ObjectState =
  | 'UNSEEN'
  | 'INSIDE_BOX'
  | 'HELD'
  | 'TARGET_ZONE'
  | 'OUTSIDE'
  | 'LOST';

export type ActionType = 'OPEN' | 'PICK' | 'PLACE';

export type StepAction =
  | 'OPEN_BOX'
  | 'PICK_RED'
  | 'PLACE_RED'
  | 'PICK_YELLOW'
  | 'PLACE_YELLOW';

export type StepStatus =
  | 'SUCCESS'
  | 'OUT_OF_SEQUENCE'
  | 'SKIPPED_STEP'
  | 'REPEATED_STEP'
  | 'UNCERTAIN'
  | 'LOST'
  | 'WRONG_OBJECT_OR_ZONE';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface TrackedObject {
  id: string; // 'box#0', 'red#1', 'yellow#2'
  label: 'box' | 'red' | 'yellow';
  visible: boolean;
  bbox: BoundingBox;
  centroid: Point2D;
  area: number;
  confidence: number;
  speed?: number;
  state: ObjectState;
  stateFrameCount: number;
  contact: boolean;
  contactStartTime?: number;
  contactStartPos?: Point2D;
  lastVisibleTime?: number;
  lastPos?: Point2D;
  trajectory: Point2D[];
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandData {
  present: boolean;
  fingertips: Point2D[]; // landmarks 4, 8, 12, 16, 20
  palmCenter?: Point2D;
  rawLandmarks?: HandLandmark[];
  isGrabbing?: boolean;
  isPinching?: boolean;
  gesture?: 'pinch' | 'grab' | 'open' | 'pointing' | 'motion' | 'none';
  pinchPoint?: Point2D;
  thumbTip?: Point2D;
  indexTip?: Point2D;
  pinchDistance?: number;
  isBoxGrabbed?: boolean;
  confidence?: number;
}

export interface RegionOfInterest {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActionConfidenceComponents {
  state: number;
  contact: number;
  temporal: number;
}

export interface ActionEvent {
  type: ActionType;
  object: 'box' | 'red' | 'yellow';
  name: string; // e.g. 'OPEN_BOX', 'PICK_RED'
  t: number;
  firstFrameT: number;
  before: ObjectState;
  after: ObjectState;
  components: ActionConfidenceComponents;
  unified: number;
  noPick?: boolean;
}

export interface FSMOutcome {
  action: string;
  expected: string;
  status: StepStatus;
  confidence: number;
  step: number; // idx at event time
  timestamp: string; // HH:MM:SS
  errorType?: StepStatus;
  latencyMs?: number;
  trace?: string;
  runType?: 'correct' | 'error';
  alertReview?: 'valid' | 'false';
  components?: ActionConfidenceComponents;
  beforeSnapshot?: Record<string, ObjectState>;
  afterSnapshot?: Record<string, ObjectState>;
  explanation?: string;
}

export interface ProtocolStep {
  id: number;
  name: string;
  type: ActionType;
  object: 'box' | 'red' | 'yellow';
  voice: string;
  hint?: string;
}

export interface ProtocolConfig {
  id: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
  preconditions: string[];
  postconditions: string[];
}

export type BoxMode = 'A' | 'B' | 'C';

export interface ColorRangeHSV {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export interface ColorCalibration {
  red: ColorRangeHSV[]; // two ranges for wrap-around [0,10] and [170,180]
  yellow: ColorRangeHSV[];
  lid?: ColorRangeHSV[];
}

export interface SetupCalibration {
  boxROI: RegionOfInterest;
  targetROI: RegionOfInterest;
  boxMode: BoxMode;
  colors: ColorCalibration;
  lidBaselineArea?: number;
  lidBaselineCentroid?: Point2D;
}

export interface PerceptionFrame {
  t: number;
  red: {
    visible: boolean;
    centroid: Point2D;
    bbox: BoundingBox;
    area?: number;
  };
  yellow: {
    visible: boolean;
    centroid: Point2D;
    bbox: BoundingBox;
    area?: number;
  };
  hand: {
    present: boolean;
    fingertips: Point2D[];
    palmCenter?: Point2D;
  };
  boxOpenSignal?: boolean;
  lidArea?: number;
  lidCentroid?: Point2D;
}
