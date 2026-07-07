import type { ClipText } from "@/editors/video/videoModel";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draw a clip's title text with a legibility outline. Shared by play and still paths. */
export function drawClipText(
  ctx: CanvasRenderingContext2D,
  text: ClipText,
  width: number,
  height: number,
): void {
  if (!text.content) return;
  ctx.save();
  ctx.font = `600 ${text.size}px "Instrument Sans Variable", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, text.size / 12);
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.fillStyle = text.color;
  const x = text.x * width;
  const y = text.y * height;
  ctx.strokeText(text.content, x, y);
  ctx.fillText(text.content, x, y);
  ctx.restore();
}

/** Largest rect with the source aspect ratio that fits inside dst, centred (letterbox). */
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}
