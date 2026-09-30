import { Point2D, RegionOfInterest } from '../types';
import { HandTrackingResult } from './handTracker';

export type GestureStateMachineState =
  | 'IDLE'
  | 'HAND_DETECTED'
  | 'INDEX_OVER_OBJECT'
  | 'OBJECT_TARGETED'
  | 'PICKED_HOLDING'
  | 'MOVE_HAND'
  | 'TARGET_ZONE_REACHED'
  | 'PLACED';

export type TargetedObject = 'red' | 'yellow' | 'box' | null;

export interface GestureStatus {
  state: GestureStateMachineState;
  primaryText: string;
  secondaryText: string;
  targetedObject: TargetedObject;
  holdingObject: 'red' | 'yellow' | null;
  indexTip: Point2D | null;
  thumbTip: Point2D | null;
  pinchPoint: Point2D | null;
  pinchDistance: number;
  isPinching: boolean;
  inTargetZone: boolean;
  handPresent: boolean;
}

export class GestureController {
  public state: GestureStateMachineState = 'IDLE';
  public holdingObject: 'red' | 'yellow' | null = null;
  public targetedObject: TargetedObject = null;
  public statusText: string = 'POINT TO AN OBJECT';
  public subText: string = 'Point → Pinch to Pick → Move → Release to Place.';

  // Position history for smoothing
  private smoothedIndexTip: Point2D | null = null;
  private lastPinchState: boolean = false;
  private pinchHoldFrames: number = 0;
  private releaseFrames: number = 0;
  private targetDwellFrames: number = 0;
  private placedConfirmationFrames: number = 0;
  private lastPlacedObject: 'red' | 'yellow' | null = null;

  // Grace counter for brief hand tracking dropouts while holding
  private trackingDropFrames: number = 0;

  /**
   * Process a single perception frame with webcam hand tracking data
   */
  public update(
    hand: HandTrackingResult,
    redPos: Point2D,
    yellowPos: Point2D,
    boxROI: RegionOfInterest,
    targetROI: RegionOfInterest,
    fsmIdx: number,
    isBoxOpen: boolean
  ): {
    gestureStatus: GestureStatus;
    newRedPos?: Point2D;
    newYellowPos?: Point2D;
    actionTrigger?: 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'OPEN_BOX';
  } {
    let actionTrigger: 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'OPEN_BOX' | undefined;
    let newRedPos: Point2D | undefined;
    let newYellowPos: Point2D | undefined;

    // Handle temporary placed confirmation display
    if (this.placedConfirmationFrames > 0) {
      this.placedConfirmationFrames--;
      if (this.placedConfirmationFrames === 0) {
        this.lastPlacedObject = null;
      }
    }

    // 1. NO HAND DETECTED
    if (!hand.present) {
      if (this.holdingObject) {
        this.trackingDropFrames++;
        // Allow up to 10 frames (~300ms) of occlusion grace before dropping held object
        if (this.trackingDropFrames > 10) {
          this.holdingObject = null;
          this.trackingDropFrames = 0;
        }
      }

      this.smoothedIndexTip = null;
      this.state = 'IDLE';
      this.statusText = 'HAND NOT DETECTED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
      this.targetedObject = null;

      return {
        gestureStatus: this.getSnapshot(false, null, null, null, 0, false, false),
      };
    }

    // 2. HAND DETECTED
    this.trackingDropFrames = 0;
    const rawTip = hand.indexTip || hand.pinchPoint || (hand.fingertips.length > 0 ? hand.fingertips[0] : hand.palmCenter);
    if (!rawTip) {
      this.state = 'HAND_DETECTED';
      this.statusText = 'HAND DETECTED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
      return {
        gestureStatus: this.getSnapshot(true, null, null, null, 0, false, false),
      };
    }

    // Exponential smoothing for steady targeting
    this.smoothedIndexTip = this.smoothPoint(this.smoothedIndexTip, rawTip, 0.75);
    const indexTip = this.smoothedIndexTip;
    const thumbTip = hand.thumbTip || null;
    const pinchPoint = hand.pinchPoint || indexTip;

    // Pinch evaluation with hysteresis
    const pinchDist = typeof hand.pinchDistance === 'number' ? hand.pinchDistance : 50;
    let isPinching = false;
    if (this.lastPinchState) {
      // While pinching, must open wider than 42px to release
      isPinching = pinchDist <= 42 && hand.isPinching !== false;
    } else {
      // While open, must close tighter than 35px or have explicit pinch flag
      isPinching = pinchDist <= 35 || hand.isPinching === true || hand.isGrabbing === true || hand.gesture === 'pinch';
    }
    this.lastPinchState = isPinching;

    if (isPinching) {
      this.pinchHoldFrames++;
      this.releaseFrames = 0;
    } else {
      this.releaseFrames++;
      this.pinchHoldFrames = 0;
    }

    // Target zone bounds check (with slight margin)
    const inTargetZone =
      indexTip.x >= targetROI.x - 10 &&
      indexTip.x <= targetROI.x + targetROI.w + 10 &&
      indexTip.y >= targetROI.y - 10 &&
      indexTip.y <= targetROI.y + targetROI.h + 10;

    // Box bounds check
    const inBoxZone =
      indexTip.x >= boxROI.x &&
      indexTip.x <= boxROI.x + boxROI.w &&
      indexTip.y >= boxROI.y &&
      indexTip.y <= boxROI.y + boxROI.h;

    // Distances from index tip to objects
    const distToRed = Math.hypot(indexTip.x - redPos.x, indexTip.y - redPos.y);
    const distToYellow = Math.hypot(indexTip.x - yellowPos.x, indexTip.y - yellowPos.y);

    // Interactive targeting radius (38px for comfortable webcam fingertip targeting)
    const TARGET_RADIUS = 38;

    // =========================================================================
    // CASE A: CURRENTLY HOLDING AN OBJECT (PICKED / HOLDING -> MOVE -> RELEASE -> PLACE)
    // =========================================================================
    if (this.holdingObject === 'red') {
      // Specimen follows user's index fingertip smoothly on the video
      newRedPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };

      if (inTargetZone) {
        this.targetDwellFrames++;
        this.state = 'TARGET_ZONE_REACHED';
        this.statusText = 'TARGET ZONE REACHED';
        this.subText = 'RELEASE PINCH TO PLACE RED SPECIMEN';

        // Check for PINCH RELEASE
        if (!isPinching && this.releaseFrames >= 1) {
          // PLACE ACTION EXECUTED!
          this.holdingObject = null;
          this.state = 'PLACED';
          this.statusText = 'RED PLACED';
          this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
          this.lastPlacedObject = 'red';
          this.placedConfirmationFrames = 45; // ~1.5s
          actionTrigger = 'PLACE_RED';

          // Clamp resting position inside target zone tray slot 1
          newRedPos = {
            x: Math.round(targetROI.x + 35),
            y: Math.round(targetROI.y + 45),
          };
        }
      } else {
        this.targetDwellFrames = 0;
        this.state = 'PICKED_HOLDING';
        this.statusText = 'HOLDING RED — MOVE TO TARGET';
        this.subText = 'Move hand to green target zone while pinching';

        // If user releases pinch before reaching target zone, drop it at current position
        if (!isPinching && this.releaseFrames >= 5) {
          this.holdingObject = null;
          this.state = 'IDLE';
          this.statusText = 'RED RELEASED';
          this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
        }
      }

      return {
        gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
        newRedPos,
        actionTrigger,
      };
    }

    if (this.holdingObject === 'yellow') {
      // Specimen follows user's index fingertip smoothly on the video
      newYellowPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };

      if (inTargetZone) {
        this.targetDwellFrames++;
        this.state = 'TARGET_ZONE_REACHED';
        this.statusText = 'TARGET ZONE REACHED';
        this.subText = 'RELEASE PINCH TO PLACE YELLOW REAGENT';

        // Check for PINCH RELEASE
        if (!isPinching && this.releaseFrames >= 1) {
          // PLACE ACTION EXECUTED!
          this.holdingObject = null;
          this.state = 'PLACED';
          this.statusText = 'YELLOW PLACED';
          this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
          this.lastPlacedObject = 'yellow';
          this.placedConfirmationFrames = 45;
          actionTrigger = 'PLACE_YELLOW';

          // Clamp resting position inside target zone tray slot 2
          newYellowPos = {
            x: Math.round(targetROI.x + 85),
            y: Math.round(targetROI.y + 45),
          };
        }
      } else {
        this.targetDwellFrames = 0;
        this.state = 'PICKED_HOLDING';
        this.statusText = 'HOLDING YELLOW — MOVE TO TARGET';
        this.subText = 'Move hand to green target zone while pinching';

        if (!isPinching && this.releaseFrames >= 5) {
          this.holdingObject = null;
          this.state = 'IDLE';
          this.statusText = 'YELLOW RELEASED';
          this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
        }
      }

      return {
        gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
        newYellowPos,
        actionTrigger,
      };
    }

    // =========================================================================
    // CASE B: NOT HOLDING AN OBJECT (INDEX FINGER TARGETING & PINCH TO PICK)
    // =========================================================================

    // Step 0: If Box is closed and hand is at box lid, allow pinch to open or wave to open
    if (fsmIdx === 0 && !isBoxOpen) {
      if (inBoxZone) {
        this.targetedObject = 'box';
        this.state = 'OBJECT_TARGETED';
        this.statusText = 'BOX TARGETED';
        this.subText = isPinching ? 'OPENING BOX...' : 'Pinch or wave hand over box to open lid';

        if (isPinching) {
          actionTrigger = 'OPEN_BOX';
        }
        return {
          gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
          actionTrigger,
        };
      }
    }

    // Check targeting of RED OBJECT
    if (distToRed <= TARGET_RADIUS) {
      this.targetedObject = 'red';
      this.state = 'OBJECT_TARGETED';
      this.statusText = 'RED TARGETED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';

      // PINCH = thumb + index finger close together → PICK the object
      if (isPinching && this.pinchHoldFrames >= 1) {
        this.holdingObject = 'red';
        this.state = 'PICKED_HOLDING';
        this.statusText = 'HOLDING RED — MOVE TO TARGET';
        this.subText = 'Move hand to green target zone while pinching';
        actionTrigger = 'PICK_RED';
        newRedPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };
      }

      return {
        gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
        newRedPos,
        actionTrigger,
      };
    }

    // Check targeting of YELLOW OBJECT
    if (distToYellow <= TARGET_RADIUS) {
      this.targetedObject = 'yellow';
      this.state = 'OBJECT_TARGETED';
      this.statusText = 'YELLOW TARGETED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';

      // PINCH = thumb + index finger close together → PICK the object
      if (isPinching && this.pinchHoldFrames >= 1) {
        this.holdingObject = 'yellow';
        this.state = 'PICKED_HOLDING';
        this.statusText = 'HOLDING YELLOW — MOVE TO TARGET';
        this.subText = 'Move hand to green target zone while pinching';
        actionTrigger = 'PICK_YELLOW';
        newYellowPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };
      }

      return {
        gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
        newYellowPos,
        actionTrigger,
      };
    }

    // Default: Hand is visible in camera view, but not currently over red or yellow
    this.targetedObject = null;
    this.state = 'HAND_DETECTED';

    if (this.placedConfirmationFrames > 0 && this.lastPlacedObject) {
      this.state = 'PLACED';
      this.statusText = this.lastPlacedObject === 'red' ? 'RED PLACED' : 'YELLOW PLACED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
    } else {
      this.statusText = 'HAND DETECTED';
      this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
    }

    return {
      gestureStatus: this.getSnapshot(true, indexTip, thumbTip, pinchPoint, pinchDist, isPinching, inTargetZone),
    };
  }

  public reset() {
    this.state = 'IDLE';
    this.holdingObject = null;
    this.targetedObject = null;
    this.statusText = 'POINT TO AN OBJECT';
    this.subText = 'Point → Pinch to Pick → Move → Release to Place.';
    this.smoothedIndexTip = null;
    this.lastPinchState = false;
    this.pinchHoldFrames = 0;
    this.releaseFrames = 0;
    this.targetDwellFrames = 0;
    this.placedConfirmationFrames = 0;
    this.lastPlacedObject = null;
  }

  private smoothPoint(prev: Point2D | null, curr: Point2D, alpha: number = 0.7): Point2D {
    if (!prev) return { ...curr };
    return {
      x: Math.round(alpha * curr.x + (1 - alpha) * prev.x),
      y: Math.round(alpha * curr.y + (1 - alpha) * prev.y),
    };
  }

  private getSnapshot(
    handPresent: boolean,
    indexTip: Point2D | null,
    thumbTip: Point2D | null,
    pinchPoint: Point2D | null,
    pinchDistance: number,
    isPinching: boolean,
    inTargetZone: boolean
  ): GestureStatus {
    return {
      state: this.state,
      primaryText: this.statusText,
      secondaryText: this.subText,
      targetedObject: this.targetedObject,
      holdingObject: this.holdingObject,
      indexTip,
      thumbTip,
      pinchPoint,
      pinchDistance: Math.round(pinchDistance),
      isPinching,
      inTargetZone,
      handPresent,
    };
  }
}
