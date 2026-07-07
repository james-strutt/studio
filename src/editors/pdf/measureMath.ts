import type { MeasureCalibration } from "@/editors/pdf/pdfStore";
import type { MeasureKind } from "@/editors/pdf/pdfAnnotations";

/** Total length of a polyline given as a flat [x,y,…] array, in the same units. */
export function pathLength(points: number[]): number {
  let sum = 0;
  for (let i = 2; i < points.length; i += 2) {
    sum += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return sum;
}

/** Shoelace area of a closed polygon, always positive. */
export function polygonArea(points: number[]): number {
  const n = points.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return Math.abs(a) / 2;
}

/** Closed-polygon perimeter. */
export function polygonPerimeter(points: number[]): number {
  return pathLength([...points, points[0], points[1]]);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Format a raw point-space measurement into a display string, converting to the
 * calibrated unit when available (area uses squared units). Uncalibrated values
 * fall back to points.
 */
export function formatMeasure(
  valuePts: number,
  kind: MeasureKind,
  cal: MeasureCalibration | null,
): string {
  if (!cal || cal.pointsPerUnit <= 0) {
    return kind === "area" ? `${round(valuePts)} pt²` : `${round(valuePts)} pt`;
  }
  if (kind === "area") {
    return `${round(valuePts / cal.pointsPerUnit ** 2)} ${cal.unit}²`;
  }
  return `${round(valuePts / cal.pointsPerUnit)} ${cal.unit}`;
}
