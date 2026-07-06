import { describe, it, expect } from "vitest";
import { cropRectToPdfBox } from "@/editors/pdf/cropMath";

describe("cropRectToPdfBox", () => {
  it("maps a full-page rect to the whole page (0,0,w,h)", () => {
    // A4 at 595×842 pt rendered at scale 0.5 → 297.5×421 preview px.
    const box = cropRectToPdfBox({ x: 0, y: 0, w: 297.5, h: 421 }, 0.5, 842);
    expect(box).toEqual({ x: 0, y: 0, width: 595, height: 842 });
  });

  it("flips the Y axis for a top-anchored crop", () => {
    // Top-left 100×50 px crop at scale 1 on an 842pt-tall page.
    const box = cropRectToPdfBox({ x: 10, y: 20, w: 100, h: 50 }, 1, 842);
    expect(box).toEqual({ x: 10, y: 842 - 70, width: 100, height: 50 });
  });

  it("accounts for scale in both position and size", () => {
    const box = cropRectToPdfBox({ x: 50, y: 40, w: 200, h: 100 }, 0.5, 400);
    // divide by scale: x=100, w=400, h=200; y = 400 - (40+100)/0.5 = 400 - 280 = 120
    expect(box).toEqual({ x: 100, y: 120, width: 400, height: 200 });
  });

  it("keeps a centred crop symmetric top and bottom", () => {
    // 300pt-tall page, crop the middle third (100pt tall) at scale 1.
    const box = cropRectToPdfBox({ x: 0, y: 100, w: 100, h: 100 }, 1, 300);
    expect(box.y).toBe(100); // 100pt from the bottom, matching 100pt from the top
    expect(box.height).toBe(100);
  });
});
