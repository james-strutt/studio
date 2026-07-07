import { describe, it, expect } from "vitest";
import { clampZoom, snapTime, tickStep } from "@/editors/video/timelineMath";

describe("timeline math", () => {
  it("picks a tick step that keeps labels ~90px apart", () => {
    expect(tickStep(50)).toBe(2); // 2s * 50px = 100px
    expect(tickStep(500)).toBe(0.25);
    expect(tickStep(4)).toBe(30);
    expect(tickStep(0.01)).toBe(1800); // floor at the largest step
  });

  it("snaps to the nearest candidate within the pixel threshold", () => {
    // 8px threshold at 50px/s = 0.16s
    expect(snapTime(10.1, [10], 50)).toBe(10);
    expect(snapTime(10.3, [10], 50)).toBe(10.3); // too far
    expect(snapTime(5.05, [5, 5.08], 50)).toBe(5.08); // nearest wins
  });

  it("clamps zoom to sane bounds", () => {
    expect(clampZoom(1)).toBe(4);
    expect(clampZoom(9999)).toBe(500);
    expect(clampZoom(50)).toBe(50);
  });
});
