import { describe, it, expect } from "vitest";
import {
  reorder,
  textLayer,
  shapeLayer,
  blendToComposite,
  cropDoc,
  resizeCanvas,
  resizeImage,
  flipCanvas,
  rotateCanvas,
  hasAdjust,
  DEFAULT_ADJUST,
  ADJUST_PRESETS,
  type ImageDoc,
  type ShapeLayer,
} from "@/editors/image/imageModel";

function docWith(layer: Partial<ShapeLayer>): ImageDoc {
  return {
    id: "d",
    name: "d",
    width: 400,
    height: 300,
    selectedId: null,
    layers: [{ ...shapeLayer("rect"), ...layer }],
  };
}

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

describe("document transforms", () => {
  it("crops: canvas shrinks and layers shift so content stays put", () => {
    const out = cropDoc(docWith({ x: 100, y: 80 }), 50, 40, 200, 150);
    expect([out.width, out.height]).toEqual([200, 150]);
    expect([out.layers[0].x, out.layers[0].y]).toEqual([50, 40]);
  });

  it("resizeCanvas center anchor keeps content centred", () => {
    const out = resizeCanvas(docWith({ x: 10, y: 10 }), 500, 400, "center");
    expect([out.width, out.height]).toEqual([500, 400]);
    expect([out.layers[0].x, out.layers[0].y]).toEqual([10 + 50, 10 + 50]);
  });

  it("resizeImage scales dimensions, positions and layer scale", () => {
    const out = resizeImage(docWith({ x: 100, y: 100, scaleX: 1, scaleY: 1 }), 0.5);
    expect([out.width, out.height]).toEqual([200, 150]);
    expect([out.layers[0].x, out.layers[0].scaleX]).toEqual([50, 0.5]);
  });

  it("flip horizontal mirrors x and negates scaleX", () => {
    const out = flipCanvas(docWith({ x: 120, scaleX: 1 }), "h");
    expect(out.layers[0].x).toBe(400 - 120);
    expect(out.layers[0].scaleX).toBe(-1);
  });

  it("rotate cw swaps dimensions and maps the origin", () => {
    const out = rotateCanvas(docWith({ x: 30, y: 40, rotation: 0 }), "cw");
    expect([out.width, out.height]).toEqual([300, 400]);
    // (x,y)=(30,40) -> (H - y, x) = (300 - 40, 30)
    expect([out.layers[0].x, out.layers[0].y]).toEqual([260, 30]);
    expect(out.layers[0].rotation).toBe(90);
  });
});

describe("adjustments", () => {
  it("hasAdjust is false for defaults, true when any value is set", () => {
    expect(hasAdjust(undefined)).toBe(false);
    expect(hasAdjust(DEFAULT_ADJUST)).toBe(false);
    expect(hasAdjust({ ...DEFAULT_ADJUST, contrast: 10 })).toBe(true);
  });

  it("every preset is a full adjust object, and Reset clears", () => {
    const reset = ADJUST_PRESETS.find((p) => p.name === "Reset")!;
    expect(hasAdjust(reset.adjust)).toBe(false);
    expect(ADJUST_PRESETS.every((p) => Object.keys(p.adjust).length === 6)).toBe(true);
  });
});
