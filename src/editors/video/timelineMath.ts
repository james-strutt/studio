export const timeToPx = (t: number, pxPerSecond: number): number => t * pxPerSecond;
export const pxToTime = (px: number, pxPerSecond: number): number => px / pxPerSecond;

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
const MIN_MAJOR_TICK_PX = 90;

/** Major ruler tick interval (seconds) so labels sit at least ~90 px apart. */
export function tickStep(pxPerSecond: number): number {
  for (const step of TICK_STEPS) {
    if (step * pxPerSecond >= MIN_MAJOR_TICK_PX) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/**
 * Snap a time to the nearest candidate within `thresholdPx` on screen.
 * Returns the original time when nothing is close enough.
 */
export function snapTime(
  t: number,
  candidates: number[],
  pxPerSecond: number,
  thresholdPx = 8,
): number {
  let best = t;
  let bestDist = thresholdPx / pxPerSecond;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Snap a moving clip by either edge: whichever of start/end lands closest to a
 * candidate wins. Returns the adjusted start.
 */
export function snapMove(
  start: number,
  duration: number,
  candidates: number[],
  pxPerSecond: number,
  thresholdPx = 8,
): number {
  const snappedStart = snapTime(start, candidates, pxPerSecond, thresholdPx);
  const snappedEnd = snapTime(start + duration, candidates, pxPerSecond, thresholdPx);
  const startSnapped = snappedStart !== start;
  const endSnapped = snappedEnd !== start + duration;
  const byStart = Math.abs(snappedStart - start);
  const byEnd = Math.abs(snappedEnd - (start + duration));
  if (startSnapped && (!endSnapped || byStart <= byEnd)) return snappedStart;
  if (endSnapped) return snappedEnd - duration;
  return start;
}

export const MIN_PX_PER_SECOND = 4;
export const MAX_PX_PER_SECOND = 500;

export function clampZoom(pxPerSecond: number): number {
  return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond));
}
