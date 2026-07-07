import { describe, it, expect } from "vitest";
import { computeDrawSpec } from "@/editors/video/engine/clipRender";
import {
  addClip,
  emptyProject,
  makeClip,
  previousAbutting,
  transitionProgress,
  transitionTail,
  type Clip,
} from "@/editors/video/videoModel";

const baseClip = (): Clip => makeClip("v1", "s1", 0, 0, 10);

describe("computeDrawSpec", () => {
  it("centres a contain fit with no crop/transform", () => {
    const spec = computeDrawSpec(baseClip(), 3840, 2160, 1920, 1080, 0);
    expect(spec).toMatchObject({
      srcX: 0,
      srcY: 0,
      srcW: 3840,
      srcH: 2160,
      cx: 960,
      cy: 540,
      dstW: 1920,
      dstH: 1080,
      rotation: 0,
      alpha: 1,
    });
  });

  it("applies crop as source fractions", () => {
    const clip = { ...baseClip(), crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } };
    const spec = computeDrawSpec(clip, 1000, 1000, 1920, 1080, 0);
    expect(spec).toMatchObject({ srcX: 250, srcY: 250, srcW: 500, srcH: 500 });
    expect(spec.dstW).toBe(1080); // square crop contains to height
  });

  it("lerps Ken Burns scale and offset by progress", () => {
    const clip = {
      ...baseClip(),
      panZoom: { fromScale: 1, toScale: 1.2, fromX: 0, fromY: 0, toX: 0.1, toY: 0 },
    };
    const mid = computeDrawSpec(clip, 1920, 1080, 1920, 1080, 0.5);
    expect(mid.dstW).toBeCloseTo(1920 * 1.1);
    expect(mid.cx).toBeCloseTo(960 + 0.05 * 1920);
  });

  it("applies static transform scale, offset, rotation, opacity", () => {
    const clip = {
      ...baseClip(),
      transform: { x: 100, y: -50, scale: 0.5, rotation: 90, opacity: 0.7 },
    };
    const spec = computeDrawSpec(clip, 1920, 1080, 1920, 1080, 0);
    expect(spec).toMatchObject({ cx: 1060, cy: 490, dstW: 960, rotation: 90, alpha: 0.7 });
  });
});

describe("transitions", () => {
  it("finds the abutting predecessor and reports progress inside the window", () => {
    let p = emptyProject();
    const a = makeClip("v1", "s1", 0, 0, 4);
    const b: Clip = { ...makeClip("v1", "s1", 4, 0, 4), transition: { type: "dissolve", duration: 1 } };
    p = addClip(addClip(p, a), b);
    expect(previousAbutting(p, b)?.id).toBe(a.id);
    expect(transitionProgress(b, 4)).toBe(0);
    expect(transitionProgress(b, 4.5)).toBe(0.5);
    expect(transitionProgress(b, 5)).toBeNull(); // window is [start, start+dur)
    expect(transitionProgress(a, 2)).toBeNull(); // no transition on A
  });

  it("computes the decode tail a clip must supply for the next clip's transition", () => {
    let p = emptyProject();
    const a = makeClip("v1", "s1", 0, 0, 4);
    const b: Clip = { ...makeClip("v1", "s1", 4, 0, 4), transition: { type: "wipe", duration: 0.8 } };
    p = addClip(addClip(p, a), b);
    expect(transitionTail(p, a)).toBe(0.8);
    expect(transitionTail(p, b)).toBe(0);
  });
});
