import { describe, it, expect } from "vitest";
import { reorder, textLayer, shapeLayer, blendToComposite } from "@/editors/image/imageModel";

describe("image model", () => {
  it("reorders a layer immutably", () => {
    expect(reorder([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(reorder([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
  });

  it("leaves the list unchanged for out-of-range source", () => {
    const list = [1, 2, 3];
    expect(reorder(list, 9, 0)).toBe(list);
  });

  it("builds layers with sensible defaults", () => {
    const t = textLayer("Hello");
    expect(t).toMatchObject({ type: "text", visible: true, opacity: 1, blend: "normal" });
    const s = shapeLayer("ellipse");
    expect(s).toMatchObject({ type: "shape", shape: "ellipse", locked: false });
  });

  it("maps blend modes to composite operations", () => {
    expect(blendToComposite("normal")).toBe("source-over");
    expect(blendToComposite("multiply")).toBe("multiply");
  });
});
