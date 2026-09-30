import { CONFIG } from '../config';
import { HandData, HandLandmark, Point2D, RegionOfInterest } from '../types';

export interface HandTrackingResult extends HandData {
  source: 'mediapipe' | 'computervision' | 'none';
  pinchDistance?: number;
  isPinching?: boolean;
}

export class HandTracker {
  private mediaPipeLandmarker: any = null;
  private isMediaPipeLoading: boolean = false;
  private mediaPipeFailed: boolean = false;
  private lastMediaPipeT: number = 0;

  // Smoothing filters
  private smoothedPalm: Point2D | null = null;
  private smoothedPinch: Point2D | null = null;
  private grabConfidenceCounter: number = 0;
  private releaseConfidenceCounter: number = 0;
  private currentGrabbing: boolean = false;
  private currentPinching: boolean = false;

  constructor() {
    this.initMediaPipeAsync();
  }

  /**
   * Attempt asynchronous load of MediaPipe HandLandmarker with CDN wasm/model
   */
  private async initMediaPipeAsync() {
    if (typeof window === 'undefined' || this.isMediaPipeLoading || this.mediaPipeLandmarker) return;
    this.isMediaPipeLoading = true;

    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      try {
        this.mediaPipeLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuErr) {
        // Fallback to CPU delegate if GPU unsupported
        this.mediaPipeLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
      // eslint-disable-next-line no-console
      console.log('[HandTracker] MediaPipe HandLandmarker initialized successfully');
    } catch (err) {
      this.mediaPipeFailed = true;
      // eslint-disable-next-line no-console
      console.log('[HandTracker] MediaPipe unavailable, utilizing high-speed local Computer Vision hand tracker');
    } finally {
      this.isMediaPipeLoading = false;
    }
  }

  /**
   * Process a webcam video frame or canvas image to extract hand, fingers, and grab/pinch gesture
   */
  public processFrame(
    videoEl: HTMLVideoElement | null,
    imageData: ImageData,
    now: number = performance.now(),
    mirror: boolean = false
  ): HandTrackingResult {
    // 1. Try MediaPipe if loaded and video is available
    if (this.mediaPipeLandmarker && videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
      try {
        const mpTimestamp = Math.max(this.lastMediaPipeT + 1, Math.round(now));
        this.lastMediaPipeT = mpTimestamp;
        const results = this.mediaPipeLandmarker.detectForVideo(videoEl, mpTimestamp);

        if (results && results.landmarks && results.landmarks.length > 0) {
          const lms: HandLandmark[] = results.landmarks[0];
          return this.processMediaPipeLandmarks(lms, mirror);
        }
      } catch (err) {
        // Fall back to Computer Vision
      }
    }

    // 2. High-speed local Computer Vision hand and finger tracker
    return this.processComputerVision(imageData, mirror);
  }

  /**
   * MediaPipe 21 3D Landmarks parsing for pinch & grab
   */
  private processMediaPipeLandmarks(landmarks: HandLandmark[], mirror: boolean = false): HandTrackingResult {
    const W = CONFIG.PROC_W;
    const H = CONFIG.PROC_H;

    // Scale normalized [0, 1] to frame pixels (apply mirror if enabled)
    const pts = landmarks.map((lm) => ({
      x: mirror ? (1.0 - lm.x) * W : lm.x * W,
      y: lm.y * H,
      z: lm.z,
    }));

    const wrist = pts[0];
    const thumbTip = pts[4];
    const indexTip = pts[8];
    const middleTip = pts[12];
    const ringTip = pts[16];
    const pinkyTip = pts[20];
    const palmCenter = pts[9]; // Middle finger MCP joint

    const fingertips: Point2D[] = [thumbTip, indexTip, middleTip, ringTip, pinkyTip].map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));

    // Pinch distance between thumb tip and index tip (and thumb to middle tip)
    const pinchDistThumbIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const pinchDistThumbMiddle = Math.hypot(thumbTip.x - middleTip.x, thumbTip.y - middleTip.y);
    const minPinchDist = Math.min(pinchDistThumbIndex, pinchDistThumbMiddle);

    // Grab / Fist detection: distance of all fingertips from wrist vs their MCP base
    const indexDistWrist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
    const middleDistWrist = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
    const ringDistWrist = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
    const pinkyDistWrist = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
    const avgTipDistWrist = (indexDistWrist + middleDistWrist + ringDistWrist + pinkyDistWrist) / 4;

    const palmSpan = Math.hypot(palmCenter.x - wrist.x, palmCenter.y - wrist.y);
    const isFistGrab = avgTipDistWrist < palmSpan * 1.35;
    
    // Dynamic pinch hysteresis: tighter threshold to engage, looser to release
    if (this.currentPinching) {
      if (minPinchDist > 42) {
        this.currentPinching = false;
      }
    } else {
      if (minPinchDist < 34) {
        this.currentPinching = true;
      }
    }
    const isFingerPinch = this.currentPinching;

    const rawIsGrabbing = isFingerPinch || isFistGrab;

    // Temporal filter on grabbing to prevent jitter
    if (rawIsGrabbing) {
      this.grabConfidenceCounter++;
      this.releaseConfidenceCounter = 0;
      if (this.grabConfidenceCounter >= 2) {
        this.currentGrabbing = true;
      }
    } else {
      this.releaseConfidenceCounter++;
      if (this.releaseConfidenceCounter >= 2) {
        this.grabConfidenceCounter = 0;
        this.currentGrabbing = false;
      }
    }

    const rawPinchPoint: Point2D = isFingerPinch
      ? {
          x: (thumbTip.x + indexTip.x) / 2,
          y: (thumbTip.y + indexTip.y) / 2,
        }
      : {
          x: indexTip.x,
          y: indexTip.y,
        };

    const smoothedPinch = this.smoothPinch(rawPinchPoint);
    const smoothedPalm = this.smoothPalm({ x: palmCenter.x, y: palmCenter.y });

    const gesture: HandData['gesture'] = isFingerPinch ? 'pinch' : isFistGrab ? 'grab' : 'open';

    return {
      present: true,
      fingertips,
      palmCenter: smoothedPalm,
      thumbTip: { x: Math.round(thumbTip.x), y: Math.round(thumbTip.y) },
      indexTip: { x: Math.round(indexTip.x), y: Math.round(indexTip.y) },
      isGrabbing: this.currentGrabbing,
      isPinching: this.currentPinching,
      gesture,
      pinchPoint: smoothedPinch,
      pinchDistance: Math.round(minPinchDist),
      rawLandmarks: landmarks,
      confidence: 0.95,
      source: 'mediapipe',
    };
  }

  /**
   * Fast, reliable standalone Computer Vision hand, fingertip, and pinch detector
   * Works on any browser with zero network or WASM requirements
   */
  private processComputerVision(imageData: ImageData, mirror: boolean = false): HandTrackingResult {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    let totalX = 0;
    let totalY = 0;
    let skinPixelCount = 0;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    // Sample pixels with step 2 for 4x speedup (runs in ~1ms)
    const skinMask = new Uint8Array((w * h) / 4);
    let maskIdx = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Kovacs / Peer-reviewed YCbCr & RGB human skin threshold
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        const isSkin =
          cb >= 75 &&
          cb <= 130 &&
          cr >= 132 &&
          cr <= 175 &&
          r > 55 &&
          g > 35 &&
          b > 20 &&
          r > b &&
          r > g &&
          Math.abs(r - g) > 8;

        if (isSkin) {
          skinMask[maskIdx] = 1;
          skinPixelCount++;
          totalX += x;
          totalY += y;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        maskIdx++;
      }
    }

    // Minimum area for a valid hand blob in frame
    const minHandPixels = 250;
    if (skinPixelCount < minHandPixels) {
      this.currentGrabbing = false;
      this.currentPinching = false;
      this.grabConfidenceCounter = 0;
      this.releaseConfidenceCounter = 0;
      return {
        present: false,
        fingertips: [],
        palmCenter: undefined,
        isGrabbing: false,
        isPinching: false,
        gesture: 'none',
        confidence: 0,
        source: 'computervision',
      };
    }

    const rawPalmX = mirror ? (w - totalX / skinPixelCount) : (totalX / skinPixelCount);
    const rawPalmY = totalY / skinPixelCount;
    const palmCenter = this.smoothPalm({ x: rawPalmX, y: rawPalmY });

    const bboxW = Math.max(20, maxX - minX);
    const bboxH = Math.max(20, maxY - minY);

    // Find fingertip extremities (peaks pointing away from palm center)
    const candidateFingertips: Point2D[] = [];
    maskIdx = 0;
    for (let y = minY; y <= maxY; y += 4) {
      for (let x = minX; x <= maxX; x += 4) {
        const subX = Math.floor(x / 2);
        const subY = Math.floor(y / 2);
        const mIdx = subY * (w / 2) + subX;

        if (skinMask[mIdx]) {
          const ptX = mirror ? (w - x) : x;
          const dist = Math.hypot(ptX - palmCenter.x, y - palmCenter.y);
          if (dist > 0.65 * Math.max(bboxW, bboxH) / 2 && y <= palmCenter.y + 15) {
            let isDistinct = true;
            for (const c of candidateFingertips) {
              if (Math.hypot(c.x - ptX, c.y - y) < 18) {
                isDistinct = false;
                break;
              }
            }
            if (isDistinct && candidateFingertips.length < 5) {
              candidateFingertips.push({ x: ptX, y });
            }
          }
        }
      }
    }

    // Sort extremities: topmost is index finger
    candidateFingertips.sort((a, b) => a.y - b.y);

    const indexTip = candidateFingertips.length > 0 ? candidateFingertips[0] : { x: palmCenter.x, y: palmCenter.y - 25 };
    const thumbTip = candidateFingertips.length > 1
      ? candidateFingertips[1]
      : { x: palmCenter.x - 20, y: palmCenter.y - 10 };

    // Pinch detection via fingertip proximity
    const tipDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isPinching = tipDist < 34;
    this.currentPinching = isPinching;
    this.currentGrabbing = isPinching;

    const rawPinchPoint: Point2D = isPinching
      ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 }
      : { x: indexTip.x, y: indexTip.y };

    const smoothedPinch = this.smoothPinch(rawPinchPoint);

    return {
      present: true,
      fingertips: candidateFingertips.length > 0 ? candidateFingertips : [indexTip],
      palmCenter,
      thumbTip,
      indexTip,
      isGrabbing: this.currentGrabbing,
      isPinching: this.currentPinching,
      gesture: isPinching ? 'pinch' : 'open',
      pinchPoint: smoothedPinch,
      pinchDistance: Math.round(tipDist),
      confidence: 0.85,
      source: 'computervision',
    };
  }

  /**
   * Determine if hand is grabbing the box and compute new moved ROI
   */
  public handleBoxGrab(
    boxROI: RegionOfInterest,
    hand: HandData,
    isCurrentlyGrabbed: boolean,
    currentOffset: Point2D | null
  ): {
    isGrabbed: boolean;
    newBoxROI: RegionOfInterest | null;
    grabOffset: Point2D | null;
    grabTarget: 'box' | 'lid' | null;
  } {
    if (!hand.present) {
      return { isGrabbed: false, newBoxROI: null, grabOffset: null, grabTarget: null };
    }

    const grabPt = hand.pinchPoint || hand.palmCenter;
    if (!grabPt) {
      return { isGrabbed: false, newBoxROI: null, grabOffset: null, grabTarget: null };
    }

    // Box bounds with a generous interactive grab margin
    const margin = 25;
    const inBoxMargin =
      grabPt.x >= boxROI.x - margin &&
      grabPt.x <= boxROI.x + boxROI.w + margin &&
      grabPt.y >= boxROI.y - margin &&
      grabPt.y <= boxROI.y + boxROI.h + margin;

    // Check if grabbing specifically near top lid handle
    const inLidHandle =
      grabPt.x >= boxROI.x + boxROI.w / 2 - 40 &&
      grabPt.x <= boxROI.x + boxROI.w / 2 + 40 &&
      grabPt.y >= boxROI.y - 30 &&
      grabPt.y <= boxROI.y + 35;

    // If currently grabbed:
    if (isCurrentlyGrabbed && currentOffset) {
      // Release if hand opened / fingers unpinched
      if (!hand.isGrabbing) {
        return { isGrabbed: false, newBoxROI: null, grabOffset: null, grabTarget: null };
      }

      // Moving the box with hand
      const targetX = grabPt.x - currentOffset.x;
      const targetY = grabPt.y - currentOffset.y;

      // Frame bounds clamping
      const clampedX = Math.max(0, Math.min(CONFIG.PROC_W - boxROI.w, Math.round(targetX)));
      const clampedY = Math.max(0, Math.min(CONFIG.PROC_H - boxROI.h, Math.round(targetY)));

      return {
        isGrabbed: true,
        newBoxROI: { ...boxROI, x: clampedX, y: clampedY },
        grabOffset: currentOffset,
        grabTarget: 'box',
      };
    }

    // Not currently grabbed: check if user pinches / grabs on or near the box
    if (hand.isGrabbing && inBoxMargin) {
      const grabTarget = inLidHandle ? 'lid' : 'box';
      const grabOffset: Point2D = {
        x: grabPt.x - boxROI.x,
        y: grabPt.y - boxROI.y,
      };

      return {
        isGrabbed: true,
        newBoxROI: null, // Just initiated this frame
        grabOffset,
        grabTarget,
      };
    }

    return { isGrabbed: false, newBoxROI: null, grabOffset: null, grabTarget: null };
  }

  private smoothPalm(raw: Point2D): Point2D {
    if (!this.smoothedPalm) {
      this.smoothedPalm = { ...raw };
    } else {
      this.smoothedPalm = {
        x: Math.round(0.7 * raw.x + 0.3 * this.smoothedPalm.x),
        y: Math.round(0.7 * raw.y + 0.3 * this.smoothedPalm.y),
      };
    }
    return this.smoothedPalm;
  }

  private smoothPinch(raw: Point2D): Point2D {
    if (!this.smoothedPinch) {
      this.smoothedPinch = { ...raw };
    } else {
      this.smoothedPinch = {
        x: Math.round(0.75 * raw.x + 0.25 * this.smoothedPinch.x),
        y: Math.round(0.75 * raw.y + 0.25 * this.smoothedPinch.y),
      };
    }
    return this.smoothedPinch;
  }
}
