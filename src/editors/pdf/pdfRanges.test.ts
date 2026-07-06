import { describe, it, expect } from "vitest";
import { parsePageRanges } from "@/editors/pdf/pdfRanges";

describe("parsePageRanges", () => {
  it("parses a mixed spec into 0-based inclusive pairs", () => {
    expect(parsePageRanges("1-3, 5, 8-10", 10)).toEqual([
      [0, 2],
      [4, 4],
      [7, 9],
    ]);
  });

  it("normalises reversed ranges", () => {
    expect(parsePageRanges("5-3", 10)).toEqual([[2, 4]]);
  });

  it("clamps the high end to the page count", () => {
    expect(parsePageRanges("8-100", 10)).toEqual([[7, 9]]);
  });

  it("drops fully out-of-range and unparseable tokens", () => {
    expect(parsePageRanges("20, abc, 2", 10)).toEqual([[1, 1]]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePageRanges("  1 - 2 ", 10)).toEqual([[0, 1]]);
  });

  it("returns nothing for an empty spec", () => {
    expect(parsePageRanges("", 10)).toEqual([]);
  });
});
