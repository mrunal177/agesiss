import { Point2D, RegionOfInterest } from '../types';
import { HandTrackingResult } from './handTracker';

export type GestureStateMachineState =
  | 'IDLE'
  | 'HAND_DETECTED'
  | 'POINT_TO_LID'
  | 'PINCH_TO_GRAB_LID'
  | 'LIFT_SLIDE_UP'
  | 'RELEASE_TO_OPEN'
  | 'BOX_OPENED'
  | 'POINTING_AT_RED'
  | 'HOLDING_RED'
  | 'RED_TARGET_REACHED'
  | 'RED_PLACED'
  | 'POINTING_AT_YELLOW'
  | 'HOLDING_YELLOW'
  | 'YELLOW_TARGET_REACHED'
  | 'YELLOW_PLACED'
  | 'COMPLETE';

export type TargetedObject = 'red' | 'yellow' | 'box' | null;

export interface GestureStatus {
  state: GestureStateMachineState;
  primaryText: string;
  secondaryText: string;
  targetedObject: TargetedObject;
  holdingObject: 'red' | 'yellow' | null;
  isHoldingLid: boolean;
  lidSlideProgress: number;
  indexTip: Point2D | null;
  thumbTip: Point2D | null;
  pinchPoint: Point2D | null;
  pinchDistance: number;
  isPinching: boolean;
  inTargetZone: boolean;
  inRedTarget: boolean;
  inYellowTarget: boolean;
  handPresent: boolean;
}

export class GestureController {
  public state: GestureStateMachineState = 'IDLE';
  public holdingObject: 'red' | 'yellow' | null = null;
  public targetedObject: TargetedObject = null;
  public isHoldingLid: boolean = false;
  public lidSlideProgress: number = 0;
  public isRedPlaced: boolean = false;
  public isYellowPlaced: boolean = false;
  public statusText: string = 'POINT TO LID';
  public subText: string = 'POINT TO LID → PINCH TO GRAB LID → LIFT / SLIDE UP → RELEASE TO OPEN';

  // Lid tracking variables
  private lidGrabStartY: number | null = null;
  private initialLidOffset: number = 0;

  // Position history for smoothing
  private smoothedIndexTip: Point2D | null = null;
  private lastPinchState: boolean = false;
  private pinchHoldFrames: number = 0;
  private releaseFrames: number = 0;
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
    isBoxOpen: boolean,
    currentLidOffset: number = 0
  ): {
    gestureStatus: GestureStatus;
    newRedPos?: Point2D;
    newYellowPos?: Point2D;
    newLidOffset?: number;
    actionTrigger?: 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'OPEN_BOX';
  } {
    let actionTrigger: 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'OPEN_BOX' | undefined;
    let newRedPos: Point2D | undefined;
    let newYellowPos: Point2D | undefined;
    let newLidOffset: number | undefined;

    // Handle temporary placed confirmation display
    if (this.placedConfirmationFrames > 0) {
      this.placedConfirmationFrames--;
      if (this.placedConfirmationFrames === 0) {
        this.lastPlacedObject = null;
      }
    }

    // 1. NO HAND DETECTED
    if (!hand.present) {
      if (this.holdingObject || this.isHoldingLid) {
        this.trackingDropFrames++;
        if (this.trackingDropFrames > 12) {
          this.holdingObject = null;
          this.isHoldingLid = false;
          this.lidGrabStartY = null;
          this.trackingDropFrames = 0;
        }
      }

      this.smoothedIndexTip = null;
      this.state = 'IDLE';
      this.targetedObject = null;

      if (!isBoxOpen && fsmIdx === 0) {
        this.statusText = 'POINT TO LID';
        this.subText = 'POINT TO LID → PINCH TO GRAB LID → LIFT / SLIDE UP → RELEASE TO OPEN';
      } else if (fsmIdx === 1) {
        this.statusText = 'POINT TO RED';
        this.subText = 'Point index finger at red specimen → Pinch to Pick';
      } else if (fsmIdx === 2) {
        this.statusText = 'HOLDING RED';
        this.subText = 'Move hand to RED TARGET';
      } else if (fsmIdx === 3) {
        this.statusText = 'POINT TO YELLOW';
        this.subText = 'Point index finger at yellow reagent → Pinch to Pick';
      } else if (fsmIdx === 4) {
        this.statusText = 'HOLDING YELLOW';
        this.subText = 'Move hand to YELLOW TARGET';
      } else if (fsmIdx >= 5) {
        this.statusText = 'EXPERIMENT COMPLETED';
        this.subText = 'Experiment completed successfully.';
      }

      return {
        gestureStatus: this.getSnapshot(false, null, null, null, 0, false, false, false, false),
      };
    }

    // 2. HAND DETECTED
    this.trackingDropFrames = 0;
    const rawTip = hand.indexTip || hand.pinchPoint || (hand.fingertips.length > 0 ? hand.fingertips[0] : hand.palmCenter);
    if (!rawTip) {
      this.state = 'HAND_DETECTED';
      return {
        gestureStatus: this.getSnapshot(true, null, null, null, 0, false, false, false, false),
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
      isPinching = pinchDist <= 44 && hand.isPinching !== false;
    } else {
      isPinching = pinchDist <= 36 || hand.isPinching === true || hand.isGrabbing === true || hand.gesture === 'pinch';
    }
    this.lastPinchState = isPinching;

    if (isPinching) {
      this.pinchHoldFrames++;
      this.releaseFrames = 0;
    } else {
      this.releaseFrames++;
      this.pinchHoldFrames = 0;
    }

    // Compute two sub-target zones: RED TARGET (Left) & YELLOW TARGET (Right)
    const tX = targetROI.x;
    const tY = targetROI.y;
    const tW = targetROI.w;
    const tH = targetROI.h;

    const rSlotW = Math.round((tW - 16) / 2);
    const rSlotH = tH - 26;
    const rTargetX = tX + 5;
    const rTargetY = tY + 18;

    const ySlotW = Math.round((tW - 16) / 2);
    const ySlotH = tH - 26;
    const yTargetX = tX + 9 + rSlotW;
    const yTargetY = tY + 18;

    const inRedTarget =
      indexTip.x >= rTargetX - 15 &&
      indexTip.x <= rTargetX + rSlotW + 15 &&
      indexTip.y >= rTargetY - 15 &&
      indexTip.y <= rTargetY + rSlotH + 15;

    const inYellowTarget =
      indexTip.x >= yTargetX - 15 &&
      indexTip.x <= yTargetX + ySlotW + 15 &&
      indexTip.y >= yTargetY - 15 &&
      indexTip.y <= yTargetY + ySlotH + 15;

    const inTargetZone =
      indexTip.x >= tX - 15 &&
      indexTip.x <= tX + tW + 15 &&
      indexTip.y >= tY - 15 &&
      indexTip.y <= tY + tH + 15;

    // Distances from index tip to objects
    const distToRed = Math.hypot(indexTip.x - redPos.x, indexTip.y - redPos.y);
    const distToYellow = Math.hypot(indexTip.x - yellowPos.x, indexTip.y - yellowPos.y);
    const TARGET_RADIUS = 38;

    // =========================================================================
    // STEP 0: TOUCHLESS BOX-LID OPENING
    // Before PICK_RED, user must touchless open the lid with hand gesture:
    // POINT TO LID → PINCH TO GRAB LID → LIFT / SLIDE UP → RELEASE TO OPEN
    // =========================================================================
    if (!isBoxOpen && fsmIdx === 0) {
      const lidSlide = currentLidOffset;
      const bX = boxROI.x;
      const bY = boxROI.y;
      const bW = boxROI.w;
      const bH = boxROI.h;

      const curLidY = bY - lidSlide * (bH * 0.9);
      const curLidX = bX - lidSlide * 15;

      const latchCenterX = curLidX + bW / 2;
      const latchCenterY = curLidY + bH / 2;
      const distToLatch = Math.hypot(indexTip.x - latchCenterX, indexTip.y - latchCenterY);

      const isOverLid =
        (indexTip.x >= curLidX - 15 &&
          indexTip.x <= curLidX + bW + 15 &&
          indexTip.y >= curLidY - 20 &&
          indexTip.y <= curLidY + bH + 20) ||
        distToLatch <= 48;

      // Case A: User has grabbed the lid with pinch
      if (this.isHoldingLid) {
        this.targetedObject = 'box';

        // While pinching, lid follows fingertip upward
        const startY = this.lidGrabStartY ?? indexTip.y;
        const dy = startY - indexTip.y; // Positive when moving upward
        const liftDelta = dy / Math.max(30, bH * 0.65);
        const newOffset = Math.max(0, Math.min(1.0, this.initialLidOffset + liftDelta));
        this.lidSlideProgress = newOffset;
        newLidOffset = newOffset;

        // Check if user releases pinch
        if (!isPinching && this.releaseFrames >= 1) {
          this.isHoldingLid = false;
          this.lidGrabStartY = null;

          if (newOffset >= 0.65) {
            // RELEASE TO OPEN: Lid reaches open position and pinch released!
            actionTrigger = 'OPEN_BOX';
            newLidOffset = 1.0;
            this.state = 'BOX_OPENED';
            this.statusText = 'BOX OPENED';
            this.subText = 'Box opened. Please pick the red object.';
          } else {
            // User released before reaching open threshold -> slides back closed
            newLidOffset = 0.0;
            this.state = 'POINT_TO_LID';
            this.statusText = 'POINT TO LID';
            this.subText = 'PINCH TO GRAB LID';
          }
        } else {
          // User is still pinching and holding the lid
          if (newOffset >= 0.65) {
            this.state = 'RELEASE_TO_OPEN';
            this.statusText = 'RELEASE TO OPEN';
            this.subText = 'Release pinch to finish opening the box';

            if (newOffset >= 0.92) {
              // Lifted past top -> automatically open!
              this.isHoldingLid = false;
              this.lidGrabStartY = null;
              actionTrigger = 'OPEN_BOX';
              newLidOffset = 1.0;
              this.state = 'BOX_OPENED';
              this.statusText = 'BOX OPENED';
              this.subText = 'Box opened. Please pick the red object.';
            }
          } else {
            this.state = 'LIFT_SLIDE_UP';
            this.statusText = 'LIFT / SLIDE UP';
            this.subText = 'Move hand upward to slide/lift lid open';
          }
        }

        return {
          gestureStatus: this.getSnapshot(
            true,
            indexTip,
            thumbTip,
            pinchPoint,
            pinchDist,
            isPinching,
            inTargetZone,
            inRedTarget,
            inYellowTarget
          ),
          newLidOffset,
          actionTrigger,
        };
      }

      // Case B: Not holding lid yet
      if (isOverLid) {
        this.targetedObject = 'box';

        if (isPinching && this.pinchHoldFrames >= 1) {
          // Pinch initiated over lid latch!
          this.isHoldingLid = true;
          this.lidGrabStartY = indexTip.y;
          this.initialLidOffset = currentLidOffset;
          this.state = 'LIFT_SLIDE_UP';
          this.statusText = 'LIFT / SLIDE UP';
          this.subText = 'Move hand upward to slide/lift lid open';
        } else {
          // Pointing at lid
          this.state = 'PINCH_TO_GRAB_LID';
          this.statusText = 'PINCH TO GRAB LID';
          this.subText = 'Pinch thumb and index finger together to grab lid';
        }
      } else {
        this.targetedObject = null;
        this.state = 'POINT_TO_LID';
        this.statusText = 'POINT TO LID';
        this.subText = 'Point index finger at the box lid latch';
      }

      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
        newLidOffset,
        actionTrigger,
      };
    }

    // =========================================================================
    // STEP 1-4: TOUCHLESS PICK / PLACE FOR RED & YELLOW SPECIMENS
    // POINT → PINCH → PICK → MOVE HAND → OBJECT FOLLOWS FINGER → RELEASE → PLACE
    // =========================================================================

    // Case 1: Currently holding RED specimen
    if (this.holdingObject === 'red') {
      newRedPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };

      if (inRedTarget || inTargetZone) {
        this.state = 'RED_TARGET_REACHED';
        this.statusText = 'RED TARGET REACHED';
        this.subText = 'RELEASE PINCH TO PLACE RED OBJECT';

        if (!isPinching && this.releaseFrames >= 1) {
          this.holdingObject = null;
          this.isRedPlaced = true;
          this.state = 'RED_PLACED';
          this.statusText = 'RED PLACED · LOCKED';
          this.subText = 'Red object placed successfully. Please pick the yellow object.';
          this.lastPlacedObject = 'red';
          this.placedConfirmationFrames = 60;
          actionTrigger = 'PLACE_RED';

          // Snap resting position into center of RED TARGET
          newRedPos = {
            x: Math.round(rTargetX + rSlotW / 2),
            y: Math.round(rTargetY + rSlotH / 2),
          };
        }
      } else {
        this.state = 'HOLDING_RED';
        this.statusText = 'HOLDING RED OBJECT';
        this.subText = 'Red object picked. Move it to the red target.';

        if (!isPinching && this.releaseFrames >= 6) {
          this.holdingObject = null;
          this.state = 'HAND_DETECTED';
          this.statusText = 'RED DROPPED';
          this.subText = 'Pinch red object to pick again';
        }
      }

      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
        newRedPos,
        actionTrigger,
      };
    }

    // Case 2: Currently holding YELLOW specimen
    if (this.holdingObject === 'yellow') {
      newYellowPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };

      if (inYellowTarget || inTargetZone) {
        this.state = 'YELLOW_TARGET_REACHED';
        this.statusText = 'YELLOW TARGET REACHED';
        this.subText = 'RELEASE PINCH TO PLACE YELLOW OBJECT';

        if (!isPinching && this.releaseFrames >= 1) {
          this.holdingObject = null;
          this.isYellowPlaced = true;
          this.state = 'YELLOW_PLACED';
          this.statusText = 'YELLOW PLACED · LOCKED';
          this.subText = 'Experiment completed successfully.';
          this.lastPlacedObject = 'yellow';
          this.placedConfirmationFrames = 60;
          actionTrigger = 'PLACE_YELLOW';

          // Snap resting position into center of YELLOW TARGET
          newYellowPos = {
            x: Math.round(yTargetX + ySlotW / 2),
            y: Math.round(yTargetY + ySlotH / 2),
          };
        }
      } else {
        this.state = 'HOLDING_YELLOW';
        this.statusText = 'HOLDING YELLOW OBJECT';
        this.subText = 'Yellow object picked. Move it to the yellow target.';

        if (!isPinching && this.releaseFrames >= 6) {
          this.holdingObject = null;
          this.state = 'HAND_DETECTED';
          this.statusText = 'YELLOW DROPPED';
          this.subText = 'Pinch yellow object to pick again';
        }
      }

      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
        newYellowPos,
        actionTrigger,
      };
    }

    // If Red is already placed or FSM advanced past step 2, ensure red is locked
    if (fsmIdx >= 3) {
      this.isRedPlaced = true;
    }
    if (fsmIdx >= 5) {
      this.isYellowPlaced = true;
    }

    // Case 3: Pick RED (only if RED IS NOT YET PLACED!)
    if (!this.isRedPlaced && (fsmIdx === 1 || (fsmIdx === 2 && !this.holdingObject))) {
      if (distToRed <= TARGET_RADIUS) {
        this.targetedObject = 'red';
        this.state = 'POINTING_AT_RED';
        this.statusText = 'RED TARGETED';
        this.subText = 'PINCH TO PICK RED OBJECT';

        if (isPinching && this.pinchHoldFrames >= 1) {
          this.holdingObject = 'red';
          this.state = 'HOLDING_RED';
          this.statusText = 'HOLDING RED OBJECT';
          this.subText = 'Red object picked. Move it to the red target.';
          actionTrigger = 'PICK_RED';
          newRedPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };
        }
      } else {
        this.targetedObject = null;
        this.state = 'HAND_DETECTED';
        this.statusText = 'POINT TO RED';
        this.subText = 'Point index finger at red specimen → Pinch to Pick';
      }

      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
        newRedPos,
        actionTrigger,
      };
    }

    // Case 4: Pick YELLOW (only if Red is already placed and Yellow is not yet placed)
    if (!this.isYellowPlaced && (fsmIdx === 3 || (fsmIdx === 4 && !this.holdingObject) || (this.isRedPlaced && fsmIdx <= 4 && !this.holdingObject))) {
      if (distToYellow <= TARGET_RADIUS) {
        this.targetedObject = 'yellow';
        this.state = 'POINTING_AT_YELLOW';
        this.statusText = 'YELLOW TARGETED';
        this.subText = 'PINCH TO PICK YELLOW OBJECT';

        if (isPinching && this.pinchHoldFrames >= 1) {
          this.holdingObject = 'yellow';
          this.state = 'HOLDING_YELLOW';
          this.statusText = 'HOLDING YELLOW OBJECT';
          this.subText = 'Yellow object picked. Move it to the yellow target.';
          actionTrigger = 'PICK_YELLOW';
          newYellowPos = { x: Math.round(indexTip.x), y: Math.round(indexTip.y) };
        }
      } else {
        this.targetedObject = null;
        this.state = 'HAND_DETECTED';
        this.statusText = 'POINT TO YELLOW';
        this.subText = 'Point index finger at yellow reagent → Pinch to Pick';
      }

      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
        newYellowPos,
        actionTrigger,
      };
    }

    // Case 5: Experiment Complete
    if (fsmIdx >= 5) {
      this.targetedObject = null;
      this.state = 'COMPLETE';
      this.statusText = 'EXPERIMENT COMPLETED';
      this.subText = 'Experiment completed successfully.';
      return {
        gestureStatus: this.getSnapshot(
          true,
          indexTip,
          thumbTip,
          pinchPoint,
          pinchDist,
          isPinching,
          inTargetZone,
          inRedTarget,
          inYellowTarget
        ),
      };
    }

    // General fallback
    this.targetedObject = null;
    this.state = 'HAND_DETECTED';
    this.statusText = 'HAND DETECTED';
    this.subText = 'Point → Pinch to Pick → Move → Release to Place.';

    return {
      gestureStatus: this.getSnapshot(
        true,
        indexTip,
        thumbTip,
        pinchPoint,
        pinchDist,
        isPinching,
        inTargetZone,
        inRedTarget,
        inYellowTarget
      ),
    };
  }

  public reset() {
    this.state = 'IDLE';
    this.holdingObject = null;
    this.targetedObject = null;
    this.isHoldingLid = false;
    this.lidSlideProgress = 0;
    this.lidGrabStartY = null;
    this.initialLidOffset = 0;
    this.statusText = 'POINT TO LID';
    this.subText = 'POINT TO LID → PINCH TO GRAB LID → LIFT / SLIDE UP → RELEASE TO OPEN';
    this.smoothedIndexTip = null;
    this.lastPinchState = false;
    this.pinchHoldFrames = 0;
    this.releaseFrames = 0;
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
    inTargetZone: boolean,
    inRedTarget: boolean,
    inYellowTarget: boolean
  ): GestureStatus {
    return {
      state: this.state,
      primaryText: this.statusText,
      secondaryText: this.subText,
      targetedObject: this.targetedObject,
      holdingObject: this.holdingObject,
      isHoldingLid: this.isHoldingLid,
      lidSlideProgress: this.lidSlideProgress,
      indexTip,
      thumbTip,
      pinchPoint,
      pinchDistance: Math.round(pinchDistance),
      isPinching,
      inTargetZone,
      inRedTarget,
      inYellowTarget,
      handPresent,
    };
  }
}
