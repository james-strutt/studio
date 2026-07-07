import type { Clip } from "@/editors/video/videoModel";
import { containRect } from "@/editors/video/engine/renderMath";

/** Everything a canvas needs to draw one clip's frame: src rect + centred dst + fx. */
export interface DrawSpec {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  cx: number; // draw centre, project px
  cy: number;
  dstW: number;
  dstH: number;
  rotation: number; // degrees
  alpha: number;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/**
 * Compute how a clip's frame maps onto the project canvas at a moment:
 * crop (source fractions) → contain fit → Ken Burns lerp → static transform.
 */
export function computeDrawSpec(
  clip: Clip,
  frameW: number,
  frameH: number,
  projW: number,
  projH: number,
  progress: number,
): DrawSpec {
  const crop = clip.crop;
  const srcX = (crop?.x ?? 0) * frameW;
  const srcY = (crop?.y ?? 0) * frameH;
  const srcW = (crop?.w ?? 1) * frameW;
  const srcH = (crop?.h ?? 1) * frameH;

  const base = containRect(srcW, srcH, projW, projH);
  let scale = 1;
  let dx = 0;
  let dy = 0;

  if (clip.panZoom) {
    const pz = clip.panZoom;
    scale *= lerp(pz.fromScale, pz.toScale, progress);
    dx += lerp(pz.fromX, pz.toX, progress) * projW;
    dy += lerp(pz.fromY, pz.toY, progress) * projH;
  }

  const t = clip.transform;
  if (t) {
    scale *= t.scale;
    dx += t.x;
    dy += t.y;
  }

  return {
    srcX,
    srcY,
    srcW,
    srcH,
    cx: projW / 2 + dx,
    cy: projH / 2 + dy,
    dstW: base.w * scale,
    dstH: base.h * scale,
    rotation: t?.rotation ?? 0,
    alpha: t?.opacity ?? 1,
  };
}

/** Paint a frame per its DrawSpec (shared by play, still, and export paths). */
export function paintSpec(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  spec: DrawSpec,
  alphaMult = 1,
  dxExtra = 0,
): void {
  ctx.save();
  ctx.globalAlpha = spec.alpha * alphaMult;
  ctx.translate(spec.cx + dxExtra, spec.cy);
  if (spec.rotation) ctx.rotate((spec.rotation * Math.PI) / 180);
  ctx.drawImage(
    frame,
    spec.srcX,
    spec.srcY,
    spec.srcW,
    spec.srcH,
    -spec.dstW / 2,
    -spec.dstH / 2,
    spec.dstW,
    spec.dstH,
  );
  ctx.restore();
}
