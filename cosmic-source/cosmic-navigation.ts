// Keep the seven visual generations, but require half the zoom effort.
export const COSMIC_ZOOM_GAIN = 2;
export const PINCH_MIN_DISTANCE = 32;

export function pinchZoomTarget(anchorDistance: number, anchorTarget: number, distance: number, gain = 1) {
  // A gesture stays anchored to its starting pose, rather than accumulating
  // noisy per-pointer deltas. Ignore nearly touching fingertips.
  if (distance < PINCH_MIN_DISTANCE || anchorDistance < PINCH_MIN_DISTANCE) return anchorTarget;
  return anchorTarget * Math.pow(anchorDistance / distance, 1.15 * gain);
}
