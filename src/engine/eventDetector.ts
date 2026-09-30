import { CONFIG, getContactPx, DEFAULT_BOX_ROI, DEFAULT_TARGET_ROI } from '../config';
import {
  ActionEvent,
  ActionType,
  BoxMode,
  HandData,
  ObjectState,
  Point2D,
  RegionOfInterest,
  TrackedObject,
} from '../types';

export interface ObjectTrackingInternal {
  id: string;
  label: 'box' | 'red' | 'yellow';
  visible: boolean;
  centroid: Point2D;
  bbox: { x: number; y: number; w: number; h: number };
  area: number;
  confidence: number;
  speed?: number;
  currentCandidateState: ObjectState;
  candidateFrames: number;
  committedState: ObjectState;
  previousCommittedState: ObjectState;
  stateTransitionStartT: number;
  contact: boolean;
  contactFrames: number;
  noContactFrames: number;
  contactStartTime?: number;
  contactStartPos?: Point2D;
  lastVisibleT: number;
  lastPos: Point2D;
  positions: Array<{ pos: Point2D; t: number; contact: boolean }>;
  recentContacts: boolean[];
  insideTargetFrames: number;
  outsideFrames: number;
}

export class EventDetector {
  public boxROI: RegionOfInterest = { ...DEFAULT_BOX_ROI };
  public targetROI: RegionOfInterest = { ...DEFAULT_TARGET_ROI };
  public boxMode: BoxMode = 'A';
  public handMode: 'vision' | 'fallback' = 'vision';
  public colors?: any;

  private objects: Map<string, ObjectTrackingInternal> = new Map();
  private lastHandBoxContactT: number = -1;
  private handInBoxStartT: number = -1;
  private handLeftBoxT: number = -1;
  private boxOpenFired: boolean = false;
  private forceOpenRequested: boolean = false;
  private lidBaselineArea: number = 1000;
  private lidLowAreaFrames: number = 0;

  constructor(options?: {
    boxROI?: RegionOfInterest;
    targetROI?: RegionOfInterest;
    boxMode?: BoxMode;
    handMode?: 'vision' | 'fallback';
  }) {
    if (options?.boxROI) this.boxROI = options.boxROI;
    if (options?.targetROI) this.targetROI = options.targetROI;
    if (options?.boxMode) this.boxMode = options.boxMode;
    if (options?.handMode) this.handMode = options.handMode;
    this.reset();
  }

  public reset() {
    this.boxOpenFired = false;
    this.forceOpenRequested = false;
    this.lastHandBoxContactT = -1;
    this.handInBoxStartT = -1;
    this.handLeftBoxT = -1;
    this.lidLowAreaFrames = 0;

    const initObj = (id: string, label: 'red' | 'yellow'): ObjectTrackingInternal => ({
      id,
      label,
      visible: false,
      centroid: { x: 0, y: 0 },
      bbox: { x: 0, y: 0, w: 24, h: 24 },
      area: 0,
      confidence: 0,
      currentCandidateState: 'UNSEEN',
      candidateFrames: 0,
      committedState: 'UNSEEN',
      previousCommittedState: 'UNSEEN',
      stateTransitionStartT: 0,
      contact: false,
      contactFrames: 0,
      noContactFrames: 0,
      lastVisibleT: 0,
      lastPos: { x: 0, y: 0 },
      positions: [],
      recentContacts: [],
      insideTargetFrames: 0,
      outsideFrames: 0,
    });

    this.objects.set('red', initObj('red#1', 'red'));
    this.objects.set('yellow', initObj('yellow#2', 'yellow'));
  }

  public setBoxMode(mode: BoxMode) {
    this.boxMode = mode;
  }

  public requestForceBoxOpen() {
    this.forceOpenRequested = true;
    this.boxOpenFired = false;
  }

  public triggerBoxOpen(t: number = performance.now()): ActionEvent {
    this.boxOpenFired = true;
    this.forceOpenRequested = false;
    const rObj = this.objects.get('red');
    if (rObj) {
      rObj.previousCommittedState = rObj.committedState;
      rObj.committedState = 'INSIDE_BOX';
      rObj.currentCandidateState = 'INSIDE_BOX';
      rObj.candidateFrames = 10;
      rObj.visible = true;
    }
    const yObj = this.objects.get('yellow');
    if (yObj) {
      yObj.previousCommittedState = yObj.committedState;
      yObj.committedState = 'INSIDE_BOX';
      yObj.currentCandidateState = 'INSIDE_BOX';
      yObj.candidateFrames = 10;
      yObj.visible = true;
    }
    return {
      type: 'OPEN',
      object: 'box',
      name: 'OPEN_BOX',
      t,
      firstFrameT: t - 200,
      before: 'UNSEEN',
      after: 'INSIDE_BOX',
      components: { state: 1.0, contact: 0.9, temporal: 0.85 },
      unified: 0.95,
    };
  }

  public triggerManualPick(object: 'red' | 'yellow', t: number = performance.now()): ActionEvent {
    const internalObj = this.objects.get(object);
    if (internalObj) {
      internalObj.previousCommittedState = internalObj.committedState;
      internalObj.committedState = 'HELD';
      internalObj.currentCandidateState = 'HELD';
      internalObj.candidateFrames = 10;
      internalObj.contact = true;
      internalObj.visible = true;
    }
    return {
      type: 'PICK',
      object,
      name: `PICK_${object.toUpperCase()}`,
      t,
      firstFrameT: t - 200,
      before: 'INSIDE_BOX',
      after: 'HELD',
      components: { state: 1.0, contact: 1.0, temporal: 0.92 },
      unified: 0.96,
    };
  }

  public triggerManualPlace(object: 'red' | 'yellow', t: number = performance.now()): ActionEvent {
    const internalObj = this.objects.get(object);
    if (internalObj) {
      internalObj.previousCommittedState = internalObj.committedState;
      internalObj.committedState = 'TARGET_ZONE';
      internalObj.currentCandidateState = 'TARGET_ZONE';
      internalObj.candidateFrames = 10;
      internalObj.contact = false;
      internalObj.visible = true;
    }
    return {
      type: 'PLACE',
      object,
      name: `PLACE_${object.toUpperCase()}`,
      t,
      firstFrameT: t - 200,
      before: 'HELD',
      after: 'TARGET_ZONE',
      components: { state: 1.0, contact: 0.95, temporal: 0.92 },
      unified: 0.96,
    };
  }

  public setLidBaselineArea(area: number) {
    this.lidBaselineArea = Math.max(10, area);
  }

  public getTrackedObjects(): TrackedObject[] {
    const res: TrackedObject[] = [];
    for (const obj of this.objects.values()) {
      res.push({
        id: obj.id,
        label: obj.label,
        visible: obj.visible,
        bbox: { ...obj.bbox },
        centroid: { ...obj.centroid },
        area: obj.area,
        confidence: obj.confidence,
        state: obj.committedState,
        stateFrameCount: obj.candidateFrames,
        contact: obj.contact,
        trajectory: obj.positions.map((p) => p.pos).slice(-30),
      });
    }
    return res;
  }

  public getObjectState(label: 'red' | 'yellow'): ObjectState {
    const o = this.objects.get(label);
    return o ? o.committedState : 'UNSEEN';
  }

  public isInsideROI(pt: Point2D, roi: RegionOfInterest, marginMultiplier: number = 1.0): boolean {
    const dw = (roi.w * (marginMultiplier - 1.0)) / 2;
    const dh = (roi.h * (marginMultiplier - 1.0)) / 2;
    return (
      pt.x >= roi.x - dw &&
      pt.x <= roi.x + roi.w + dw &&
      pt.y >= roi.y - dh &&
      pt.y <= roi.y + roi.h + dh
    );
  }

  /**
   * Process a single video frame and return any detected ActionEvents
   */
  public processFrame(
    t: number,
    redObs: { visible: boolean; centroid: Point2D; bbox: { x: number; y: number; w: number; h: number }; area?: number },
    yellowObs: { visible: boolean; centroid: Point2D; bbox: { x: number; y: number; w: number; h: number }; area?: number },
    hand: HandData,
    currentFSMIndex: number,
    boxOpenSignal?: boolean,
    lidArea?: number
  ): {
    events: ActionEvent[];
    lostDetected?: { object: 'red' | 'yellow'; t: number };
    wrongZoneDetected?: { object: 'red' | 'yellow'; t: number };
  } {
    const detectedEvents: ActionEvent[] = [];
    let lostDetected: { object: 'red' | 'yellow'; t: number } | undefined;
    let wrongZoneDetected: { object: 'red' | 'yellow'; t: number } | undefined;

    // Track hand interaction with box ROI
    const handCentroid = hand.palmCenter || (hand.fingertips.length > 0 ? hand.fingertips[0] : { x: -1, y: -1 });
    const handInBox15 = hand.present && this.isInsideROI(handCentroid, this.boxROI, 1.15);
    const handInBoxStrict = hand.present && this.isInsideROI(handCentroid, this.boxROI, 1.0);

    if (handInBox15) {
      this.lastHandBoxContactT = t;
    }

    // Handle OPEN_BOX modes (fires only before box is marked open / while idx == 0)
    if (this.forceOpenRequested || (!this.boxOpenFired && currentFSMIndex === 0)) {
      let openTriggered = false;

      if (this.forceOpenRequested) {
        openTriggered = true;
        this.forceOpenRequested = false;
      } else if (boxOpenSignal === true) {
        openTriggered = true;
      } else if (this.boxMode === 'A') {
        // Lidded box: red/yellow becomes visible, OR hand enters box region, OR recent hand interaction
        const redInBox = redObs.visible && this.isInsideROI(redObs.centroid, this.boxROI, 1.15);
        const yellowInBox = yellowObs.visible && this.isInsideROI(yellowObs.centroid, this.boxROI, 1.15);
        const handRecent = this.lastHandBoxContactT > 0 && t - this.lastHandBoxContactT <= 8000;

        if (redInBox || yellowInBox || handInBox15 || handRecent) {
          openTriggered = true;
        }
      } else if (this.boxMode === 'B') {
        // Open-top box: hand stays inside box ROI or waves into box
        if (handInBox15) {
          openTriggered = true;
        }
      } else if (this.boxMode === 'C') {
        // Lid colour marker: lid blob area falls below 30% of baseline area for N_CONFIRM frames
        if (typeof lidArea === 'number' && lidArea > 0 && lidArea < 0.3 * this.lidBaselineArea) {
          this.lidLowAreaFrames++;
          if (this.lidLowAreaFrames >= CONFIG.N_CONFIRM) {
            openTriggered = true;
          }
        } else {
          this.lidLowAreaFrames = 0;
        }
      }

      if (openTriggered) {
        this.boxOpenFired = true;
        detectedEvents.push({
          type: 'OPEN',
          object: 'box',
          name: 'OPEN_BOX',
          t,
          firstFrameT: t - 200,
          before: 'UNSEEN',
          after: 'INSIDE_BOX',
          components: { state: 1.0, contact: 0.9, temporal: 0.85 },
          unified: 0.95,
        });
      }
    }

    // Process Red and Yellow objects
    const processObj = (
      label: 'red' | 'yellow',
      obs: { visible: boolean; centroid: Point2D; bbox: { x: number; y: number; w: number; h: number }; area?: number }
    ) => {
      const obj = this.objects.get(label)!;
      obj.visible = obs.visible;
      if (obs.visible) {
        obj.centroid = obs.centroid;
        obj.bbox = obs.bbox;
        obj.area = obs.area ?? 250;
        obj.confidence = Math.min(1.0, (obj.area / CONFIG.MIN_BLOB_AREA) * 0.7);
        obj.lastVisibleT = t;
        obj.lastPos = { ...obs.centroid };
      }

      // Check contact with hand
      const contactPx = getContactPx(obj.bbox.w, obj.bbox.h);
      let isContact = false;

      if (obs.visible && hand.present) {
        // Check distance from fingertips or palmCenter to object bbox
        const points = [...hand.fingertips];
        if (hand.palmCenter) points.push(hand.palmCenter);

        for (const pt of points) {
          // Distance from point to rectangle
          const dx = Math.max(obj.bbox.x - pt.x, 0, pt.x - (obj.bbox.x + obj.bbox.w));
          const dy = Math.max(obj.bbox.y - pt.y, 0, pt.y - (obj.bbox.y + obj.bbox.h));
          const dist = Math.hypot(dx, dy);
          if (dist <= contactPx) {
            isContact = true;
            break;
          }
        }
      }

      obj.contact = isContact;
      obj.recentContacts.push(isContact);
      if (obj.recentContacts.length > 20) obj.recentContacts.shift();

      if (isContact) {
        obj.contactFrames++;
        obj.noContactFrames = 0;
        if (!obj.contactStartTime) {
          obj.contactStartTime = t;
          obj.contactStartPos = { ...obj.centroid };
        }
      } else {
        obj.noContactFrames++;
        if (obj.noContactFrames >= 5) {
          obj.contactFrames = 0;
          obj.contactStartTime = undefined;
          obj.contactStartPos = undefined;
        }
      }

      // Record position history
      if (obs.visible) {
        obj.positions.push({ pos: { ...obs.centroid }, t, contact: isContact });
        if (obj.positions.length > 40) obj.positions.shift();
      }

      // Compute speed (px / frame)
      let speed = 0;
      if (obj.positions.length >= 2) {
        const p1 = obj.positions[obj.positions.length - 2].pos;
        const p2 = obj.positions[obj.positions.length - 1].pos;
        speed = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      }
      obj.speed = speed;

      // Estimate instantaneous candidate state
      let rawCandidate: ObjectState = 'UNSEEN';

      if (!obs.visible) {
        // Check LOST condition (only evaluated once idx >= 1)
        if (currentFSMIndex >= 1) {
          const unseenDuration = t - obj.lastVisibleT;
          // Check hand contact near last position within OCCLUSION_GRACE_MS
          let handNearLastPosWithinGrace = false;
          if (hand.present && unseenDuration < CONFIG.OCCLUSION_GRACE_MS) {
            const hDist = Math.hypot(handCentroid.x - obj.lastPos.x, handCentroid.y - obj.lastPos.y);
            if (hDist <= contactPx * 1.5) {
              handNearLastPosWithinGrace = true;
            }
          }

          if (
            unseenDuration >= CONFIG.LOST_MS &&
            !handNearLastPosWithinGrace &&
            (obj.committedState === 'HELD' ||
              (!this.isInsideROI(obj.lastPos, this.boxROI) && !this.isInsideROI(obj.lastPos, this.targetROI)))
          ) {
            rawCandidate = 'LOST';
          } else {
            rawCandidate = obj.committedState;
          }
        } else {
          rawCandidate = 'UNSEEN';
        }
      } else {
        // Object is visible
        const inBox = this.isInsideROI(obj.centroid, this.boxROI);
        const inTarget = this.isInsideROI(obj.centroid, this.targetROI);

        const contactDuration = obj.contactStartTime ? t - obj.contactStartTime : 0;
        const contactDisp =
          obj.contactStartPos && obj.centroid
            ? Math.hypot(obj.centroid.x - obj.contactStartPos.x, obj.centroid.y - obj.contactStartPos.y)
            : 0;

        const isHeld =
          obj.contact &&
          contactDuration >= CONFIG.HELD_MIN_MS &&
          contactDisp >= CONFIG.HELD_MIN_DISP;

        if (isHeld) {
          rawCandidate = 'HELD';
          obj.insideTargetFrames = 0;
          obj.outsideFrames = 0;
        } else if (inTarget) {
          if (speed < CONFIG.STATIONARY_SPEED) {
            obj.insideTargetFrames++;
            if (obj.insideTargetFrames >= CONFIG.PLACE_STABLE_FRAMES) {
              rawCandidate = 'TARGET_ZONE';
            } else {
              rawCandidate = obj.committedState === 'HELD' ? 'HELD' : 'TARGET_ZONE';
            }
          } else {
            rawCandidate = obj.committedState;
          }
          obj.outsideFrames = 0;
        } else if (inBox) {
          rawCandidate = 'INSIDE_BOX';
          obj.insideTargetFrames = 0;
          obj.outsideFrames = 0;
        } else {
          // Outside both ROIs
          if (speed < CONFIG.STATIONARY_SPEED && !obj.contact) {
            obj.outsideFrames++;
            rawCandidate = 'OUTSIDE';
          } else {
            rawCandidate = obj.committedState;
          }
          obj.insideTargetFrames = 0;
        }
      }

      // Commit state only if candidate persists for N_CONFIRM frames
      if (rawCandidate === obj.currentCandidateState) {
        obj.candidateFrames++;
      } else {
        obj.currentCandidateState = rawCandidate;
        obj.candidateFrames = 1;
        obj.stateTransitionStartT = t;
      }

      // Check WRONG_ZONE detection (OUTSIDE for 12 frames while expected is PLACE for this object)
      if (obj.outsideFrames >= 12 && obj.currentCandidateState === 'OUTSIDE') {
        wrongZoneDetected = { object: label, t };
      }

      // Check LOST committed
      if (rawCandidate === 'LOST' && obj.candidateFrames >= 2) {
        lostDetected = { object: label, t };
      }

      // Commit transition if persisted for N_CONFIRM frames
      if (obj.candidateFrames === CONFIG.N_CONFIRM && obj.currentCandidateState !== obj.committedState) {
        const oldState = obj.committedState;
        const newState = obj.currentCandidateState;
        obj.previousCommittedState = oldState;
        obj.committedState = newState;

        // Derive Action from committed state transition
        const event = this.createActionEventFromTransition(label, oldState, newState, t, obj);
        if (event) {
          detectedEvents.push(event);
        }
      }
    };

    processObj('red', redObs);
    processObj('yellow', yellowObs);

    return {
      events: detectedEvents,
      lostDetected,
      wrongZoneDetected,
    };
  }

  private createActionEventFromTransition(
    object: 'red' | 'yellow',
    before: ObjectState,
    after: ObjectState,
    t: number,
    obj: ObjectTrackingInternal
  ): ActionEvent | null {
    let actionType: ActionType | null = null;
    let noPick = false;

    if (before === 'INSIDE_BOX' && after === 'HELD') {
      actionType = 'PICK';
    } else if (before === 'HELD' && after === 'TARGET_ZONE') {
      actionType = 'PLACE';
    } else if (before === 'INSIDE_BOX' && after === 'TARGET_ZONE') {
      // Pick phase skipped (e.g. pushed or slid without holding)
      actionType = 'PLACE';
      noPick = true;
    }

    if (!actionType) {
      return null;
    }

    const name = `${actionType}_${object.toUpperCase()}`;

    // Compute Unified Action Confidence components:
    // 1. state: 1.0 if before & after both persisted >= N_CONFIRM; 0.6 if only after was observed; else 0
    let stateScore = 1.0;
    if (noPick) {
      stateScore = 0.85; // directly placed
    }

    // 2. contact: fraction of frames in last 12 frames of action window with contact
    const contactSlice = obj.recentContacts.slice(-14);
    const contactCount = contactSlice.filter(Boolean).length;
    let contactScore: number;

    if (noPick) {
      contactScore = 0.05;
    } else if (actionType === 'PLACE') {
      // For PLACE, valid human placement involves holding during approach and releasing in target
      // Having >= 3 contact frames in the placement window indicates valid hand placement
      contactScore = contactCount >= 3 ? Math.min(1.0, 0.6 + (contactCount / 14) * 0.4) : 0.1;
    } else {
      // For PICK, contact throughout the pick phase
      contactScore = contactSlice.length > 0 ? contactCount / contactSlice.length : 0.8;
    }

    // 3. temporal: 0.5*directionConsistency + 0.5*progress
    let directionConsistency = 0.85;
    if (obj.positions.length >= 4) {
      let consistentCount = 0;
      let totalPairs = 0;
      for (let i = 2; i < obj.positions.length; i++) {
        const vx1 = obj.positions[i - 1].pos.x - obj.positions[i - 2].pos.x;
        const vy1 = obj.positions[i - 1].pos.y - obj.positions[i - 2].pos.y;
        const vx2 = obj.positions[i].pos.x - obj.positions[i - 1].pos.x;
        const vy2 = obj.positions[i].pos.y - obj.positions[i - 1].pos.y;
        const mag1 = Math.hypot(vx1, vy1);
        const mag2 = Math.hypot(vx2, vy2);
        if (mag1 > 0.5 && mag2 > 0.5) {
          const cos = (vx1 * vx2 + vy1 * vy2) / (mag1 * mag2);
          if (cos > 0.3) consistentCount++;
          totalPairs++;
        }
      }
      if (totalPairs > 0) {
        directionConsistency = consistentCount / totalPairs;
      }
    }

    let progress = 0.85;
    if (actionType === 'PICK') {
      const startP = obj.positions[0]?.pos || obj.centroid;
      const disp = Math.hypot(obj.centroid.x - startP.x, obj.centroid.y - startP.y);
      progress = Math.min(1.0, disp / 40);
    } else if (actionType === 'PLACE') {
      const targetCenter = {
        x: this.targetROI.x + this.targetROI.w / 2,
        y: this.targetROI.y + this.targetROI.h / 2,
      };
      const startP = obj.positions[0]?.pos || { x: this.boxROI.x + this.boxROI.w / 2, y: this.boxROI.y + this.boxROI.h / 2 };
      const dStart = Math.hypot(startP.x - targetCenter.x, startP.y - targetCenter.y);
      const dEnd = Math.hypot(obj.centroid.x - targetCenter.x, obj.centroid.y - targetCenter.y);
      if (dStart > 0) {
        progress = Math.max(0, Math.min(1, 1 - dEnd / dStart));
      }
    }

    if (noPick) {
      stateScore = 0.90;
      progress = 0.85;
    }

    const temporalScore = 0.5 * directionConsistency + 0.5 * progress;

    const weights =
      this.handMode === 'fallback'
        ? CONFIG.WEIGHTS_HAND_FALLBACK
        : CONFIG.WEIGHTS_WITH_HANDS;

    let unified = Number(
      (
        weights.state * stateScore +
        weights.contact * contactScore +
        weights.temporal * temporalScore
      ).toFixed(2)
    );

    if (noPick) {
      // Ensure noPick satisfies ALERT threshold (0.60) to trigger SKIPPED_STEP alert
      unified = Math.max(0.62, unified);
    }

    return {
      type: actionType,
      object,
      name,
      t,
      firstFrameT: obj.stateTransitionStartT || t - 160,
      before,
      after,
      components: {
        state: Number(stateScore.toFixed(2)),
        contact: Number(contactScore.toFixed(2)),
        temporal: Number(temporalScore.toFixed(2)),
      },
      unified,
      noPick,
    };
  }
}
