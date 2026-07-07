import { describe, it, expect } from "vitest";
import { pathLength, polygonArea, polygonPerimeter, formatMeasure } from "@/editors/pdf/measureMath";

describe("measure math", () => {
  it("sums polyline segment lengths", () => {
    expect(pathLength([0, 0, 3, 4, 3, 9])).toBe(10); // 5 + 5
  });

  it("computes polygon area via the shoelace formula", () => {
    // A 10×10 square.
    expect(polygonArea([0, 0, 10, 0, 10, 10, 0, 10])).toBe(100);
  });

  it("computes polygon perimeter including the closing edge", () => {
    expect(polygonPerimeter([0, 0, 10, 0, 10, 10, 0, 10])).toBe(40);
  });

  it("formats uncalibrated values in points", () => {
    expect(formatMeasure(123.456, "distance", null)).toBe("123.46 pt");
    expect(formatMeasure(200, "area", null)).toBe("200 pt²");
  });

  it("converts to calibrated units (area squared)", () => {
    const cal = { unit: "m", pointsPerUnit: 10 };
    expect(formatMeasure(55, "distance", cal)).toBe("5.5 m");
    expect(formatMeasure(500, "area", cal)).toBe("5 m²"); // 500 / 10^2
  });
});
