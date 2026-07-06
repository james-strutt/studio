import { describe, it, expect } from "vitest";
import { groupRows, buildLayout, fitWidthScale, PAD, GAP } from "@/editors/pdf/pdfLayout";

const A4 = { width: 595, height: 842 };
const sizes = Array.from({ length: 6 }, () => A4);

describe("pdf layout", () => {
  it("groups pages into rows per view mode", () => {
    expect(groupRows(4, "single")).toEqual([[0], [1], [2], [3]]);
    expect(groupRows(4, "two-up")).toEqual([[0, 1], [2, 3]]);
    // spread: cover alone, then facing pairs
    expect(groupRows(5, "spread")).toEqual([[0], [1, 2], [3, 4]]);
  });

  it("fits a single page to the available width", () => {
    expect(fitWidthScale(sizes, 0, "single", 1190)).toBeCloseTo(2, 5);
  });

  it("fits two-up to both pages plus the inner gap", () => {
    // (1202 - 12) / (595 * 2) = 1
    expect(fitWidthScale(sizes, 0, "two-up", 1202)).toBeCloseTo(1, 5);
  });

  it("stacks single-mode rows at correct offsets", () => {
    const { rows, total } = buildLayout(sizes, 1, 0, "single");
    expect(rows).toHaveLength(6);
    expect(rows[0].top).toBe(PAD);
    expect(rows[1].top).toBe(PAD + A4.height + GAP);
    expect(total).toBeGreaterThan(A4.height * 6);
  });

  it("swaps width/height when rotated 90 degrees", () => {
    const { rows } = buildLayout(sizes, 1, 90, "single");
    expect(rows[0].width).toBeCloseTo(A4.height, 5);
    expect(rows[0].height).toBeCloseTo(A4.width, 5);
  });
});
