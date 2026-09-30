import { CONFIG, DEFAULT_BOX_ROI, DEFAULT_TARGET_ROI } from '../config';
import {
  BoundingBox,
  ColorCalibration,
  ColorRangeHSV,
  HandData,
  Point2D,
  RegionOfInterest,
} from '../types';

export interface FrameQualityMetrics {
  blurScore: number;
  fps: number;
  isBlurry: boolean;
  isLowFPS: boolean;
}

export class PerceptionPipeline {
  public boxROI: RegionOfInterest = { ...DEFAULT_BOX_ROI };
  public targetROI: RegionOfInterest = { ...DEFAULT_TARGET_ROI };
  public colors: ColorCalibration = {
    red: [
      { hMin: 0, hMax: 10, sMin: 120, sMax: 255, vMin: 80, vMax: 255 },
      { hMin: 170, hMax: 180, sMin: 120, sMax: 255, vMin: 80, vMax: 255 },
    ],
    yellow: [
      { hMin: 20, hMax: 35, sMin: 120, sMax: 255, vMin: 100, vMax: 255 },
    ],
  };

  private prevFrameGray: Uint8ClampedArray | null = null;
  private prevFrameT: number = 0;
  private emaFPS: number = 20;
  private smoothedRedCentroid: Point2D | null = null;
  private smoothedYellowCentroid: Point2D | null = null;

  constructor(options?: {
    boxROI?: RegionOfInterest;
    targetROI?: RegionOfInterest;
    colors?: ColorCalibration;
  }) {
    if (options?.boxROI) this.boxROI = options.boxROI;
    if (options?.targetROI) this.targetROI = options.targetROI;
    if (options?.colors) this.colors = options.colors;
  }

  public setCalibration(boxROI: RegionOfInterest, targetROI: RegionOfInterest, colors: ColorCalibration) {
    this.boxROI = boxROI;
    this.targetROI = targetROI;
    this.colors = colors;
  }

  /**
   * Computes Laplacian variance on grayscale image data to assess blur
   */
  public computeBlur(gray: Uint8ClampedArray, w: number, h: number): number {
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // 3x3 Laplacian kernel: [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const c = gray[y * w + x];
        const val =
          gray[(y - 1) * w + x] +
          gray[(y + 1) * w + x] +
          gray[y * w + (x - 1)] +
          gray[y * w + (x + 1)] -
          4 * c;

        sum += val;
        sumSq += val * val;
        count++;
      }
    }

    if (count === 0) return 100;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return Math.max(0, variance);
  }

  /**
   * Analyzes frame quality: Laplacian variance and FPS
   */
  public analyzeFrameQuality(
    imageData: ImageData,
    now: number = performance.now()
  ): { quality: FrameQualityMetrics; gray: Uint8ClampedArray } {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const gray = new Uint8ClampedArray(w * h);

    // Convert RGBA -> Grayscale
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    const blurScore = this.computeBlur(gray, w, h);

    // Update FPS via EMA
    if (this.prevFrameT > 0) {
      const dt = (now - this.prevFrameT) / 1000;
      if (dt > 0) {
        const instantFPS = 1 / dt;
        this.emaFPS = 0.2 * instantFPS + 0.8 * this.emaFPS;
      }
    }
    this.prevFrameT = now;

    return {
      quality: {
        blurScore: Math.round(blurScore),
        fps: Math.round(this.emaFPS),
        isBlurry: blurScore < CONFIG.BLUR_MIN,
        isLowFPS: this.emaFPS < CONFIG.FPS_MIN,
      },
      gray,
    };
  }

  /**
   * Color segmentation using calibrated HSV ranges
   */
  public segmentColor(
    imageData: ImageData,
    colorRanges: ColorRangeHSV[]
  ): {
    visible: boolean;
    bbox: BoundingBox;
    centroid: Point2D;
    area: number;
    confidence: number;
  } {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let totalX = 0;
    let totalY = 0;
    let count = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // RGB -> HSV (OpenCV scale: H: 0-180, S: 0-255, V: 0-255)
        const [hVal, sVal, vVal] = rgbToHsv(r, g, b);

        let match = false;
        for (const range of colorRanges) {
          if (
            hVal >= range.hMin &&
            hVal <= range.hMax &&
            sVal >= range.sMin &&
            sVal <= range.sMax &&
            vVal >= range.vMin &&
            vVal <= range.vMax
          ) {
            match = true;
            break;
          }
        }

        if (match) {
          count++;
          totalX += x;
          totalY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Multiply count by 4 since we subsampled by step 2
    const totalArea = count * 4;
    const visible = totalArea >= CONFIG.MIN_BLOB_AREA;

    if (!visible) {
      return {
        visible: false,
        bbox: { x: 0, y: 0, w: 20, h: 20 },
        centroid: { x: 0, y: 0 },
        area: totalArea,
        confidence: 0,
      };
    }

    const bboxW = Math.max(16, maxX - minX);
    const bboxH = Math.max(16, maxY - minY);
    const rawCentroid: Point2D = {
      x: totalX / count,
      y: totalY / count,
    };

    const bboxArea = bboxW * bboxH;
    const solidity = bboxArea > 0 ? Math.min(1.0, totalArea / bboxArea) : 0.7;
    const confidence = Math.min(1.0, totalArea / (1.5 * CONFIG.MIN_BLOB_AREA)) * solidity;

    return {
      visible: true,
      bbox: { x: minX, y: minY, w: bboxW, h: bboxH },
      centroid: rawCentroid,
      area: totalArea,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  /**
   * Calibrate a color from an interactive click on the 9x9 patch
   */
  public calibratePatch(
    imageData: ImageData,
    clickX: number,
    clickY: number
  ): ColorRangeHSV[] {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    const hList: number[] = [];
    const sList: number[] = [];
    const vList: number[] = [];

    const half = 4;
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = Math.max(0, Math.min(w - 1, clickX + dx));
        const py = Math.max(0, Math.min(h - 1, clickY + dy));
        const idx = (py * w + px) * 4;
        const [hVal, sVal, vVal] = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
        hList.push(hVal);
        sList.push(sVal);
        vList.push(vVal);
      }
    }

    hList.sort((a, b) => a - b);
    sList.sort((a, b) => a - b);
    vList.sort((a, b) => a - b);

    const medianH = hList[Math.floor(hList.length / 2)];
    const medianS = sList[Math.floor(sList.length / 2)];
    const medianV = vList[Math.floor(vList.length / 2)];

    const sMin = Math.max(90, medianS - 70);
    const vMin = Math.max(60, medianV - 80);

    // If red wraps around 0/180
    if (medianH <= 12 || medianH >= 168) {
      return [
        { hMin: 0, hMax: 15, sMin, sMax: 255, vMin, vMax: 255 },
        { hMin: 165, hMax: 180, sMin, sMax: 255, vMin, vMax: 255 },
      ];
    }

    return [
      {
        hMin: Math.max(0, medianH - 12),
        hMax: Math.min(180, medianH + 12),
        sMin,
        sMax: 255,
        vMin,
        vMax: 255,
      },
    ];
  }

  /**
   * Fallback motion estimation when HandLandmarker is unavailable
   */
  public estimateFallbackContact(
    gray: Uint8ClampedArray,
    w: number,
    h: number,
    bbox: BoundingBox
  ): boolean {
    if (!this.prevFrameGray || this.prevFrameGray.length !== gray.length) {
      this.prevFrameGray = new Uint8ClampedArray(gray);
      return false;
    }

    const ringRadius = 1.2 * Math.max(18, 0.6 * Math.hypot(bbox.w, bbox.h));
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;

    let totalRingPixels = 0;
    let motionPixels = 0;

    const minX = Math.max(0, Math.floor(cx - ringRadius));
    const maxX = Math.min(w - 1, Math.ceil(cx + ringRadius));
    const minY = Math.max(0, Math.floor(cy - ringRadius));
    const maxY = Math.min(h - 1, Math.ceil(cy + ringRadius));

    for (let y = minY; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= bbox.w / 2 && d <= ringRadius) {
          totalRingPixels++;
          const idx = y * w + x;
          const diff = Math.abs(gray[idx] - this.prevFrameGray[idx]);
          if (diff > 25) {
            motionPixels++;
          }
        }
      }
    }

    this.prevFrameGray.set(gray);
    if (totalRingPixels === 0) return false;
    return motionPixels / totalRingPixels >= 0.08;
  }

  /**
   * Smooth centroid with EMA alpha=0.6
   */
  public smoothCentroid(label: 'red' | 'yellow', raw: Point2D): Point2D {
    if (label === 'red') {
      if (!this.smoothedRedCentroid) {
        this.smoothedRedCentroid = { ...raw };
      } else {
        this.smoothedRedCentroid = {
          x: 0.6 * raw.x + 0.4 * this.smoothedRedCentroid.x,
          y: 0.6 * raw.y + 0.4 * this.smoothedRedCentroid.y,
        };
      }
      return this.smoothedRedCentroid;
    } else {
      if (!this.smoothedYellowCentroid) {
        this.smoothedYellowCentroid = { ...raw };
      } else {
        this.smoothedYellowCentroid = {
          x: 0.6 * raw.x + 0.4 * this.smoothedYellowCentroid.x,
          y: 0.6 * raw.y + 0.4 * this.smoothedYellowCentroid.y,
        };
      }
      return this.smoothedYellowCentroid;
    }
  }
}

/**
 * Standard OpenCV scale RGB to HSV
 * R, G, B in [0, 255]
 * Returns [H (0-180), S (0-255), V (0-255)]
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h = Math.round(h * 30); // 0-180 scale
    if (h < 0) h += 180;
  }

  const s = max === 0 ? 0 : Math.round((delta / max) * 255);
  const v = Math.round(max * 255);

  return [h, s, v];
}
