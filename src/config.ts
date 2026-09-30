// AEGIS System Configuration & Constants
// Exactly matches SIH26174 Specification

export const CONFIG = {
  PROC_W: 320,
  PROC_H: 240,
  N_CONFIRM: 5,                     // frames a state must persist
  HELD_MIN_MS: 400,                 // contact time to count as a pick
  HELD_MIN_DISP: 20,                // px moved while in contact to count as a pick
  STATIONARY_SPEED: 1.5,            // px/frame
  PLACE_STABLE_FRAMES: 8,
  LOST_MS: 1000,
  OCCLUSION_GRACE_MS: 700,
  ACCEPT: 0.70,                     // confidence needed to ADVANCE the FSM
  ALERT: 0.60,                      // confidence needed to raise an error alert
  UNCERTAIN_MIN: 0.45,              // between UNCERTAIN_MIN and ACCEPT (for expected action) = UNCERTAIN
  MIN_BLOB_AREA: 0.003 * 320 * 240, // 230.4 px
  BLUR_MIN: 60,                     // Laplacian variance threshold
  FPS_MIN: 15,
  ALERT_COOLDOWN_MS: 4000,
  ERROR_REMINDER_MS: 10000,
  SEGMENT_MS: 10000,                // recording segment length (10s)
  WEIGHTS_WITH_HANDS: {
    state: 0.45,
    contact: 0.30,
    temporal: 0.25,
  },
  WEIGHTS_HAND_FALLBACK: {
    state: 0.60,
    contact: 0.00,
    temporal: 0.40,
  },
} as const;

/**
 * Calculates dynamic contact threshold: max(18, 0.6 * objectBBoxDiagonal)
 */
export function getContactPx(bboxWidth: number = 24, bboxHeight: number = 24): number {
  const diagonal = Math.hypot(bboxWidth, bboxHeight);
  return Math.max(18, 0.6 * diagonal);
}

export const DEFAULT_BOX_ROI = {
  x: 20,
  y: 40,
  w: 120,
  h: 150,
};

export const DEFAULT_TARGET_ROI = {
  x: 180,
  y: 40,
  w: 120,
  h: 150,
};
