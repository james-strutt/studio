export type ExportFormat = "png" | "jpeg" | "webp" | "avif";

export function mimeFor(format: ExportFormat): string {
  return format === "jpeg"
    ? "image/jpeg"
    : format === "webp"
      ? "image/webp"
      : format === "avif"
        ? "image/avif"
        : "image/png";
}

export function extFor(format: ExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export const LOSSY: ExportFormat[] = ["jpeg", "webp", "avif"];

/** Downscale a canvas by a factor (1 = unchanged), high-quality smoothing. */
export function scaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  if (factor === 1) return src;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(src.width * factor));
  out.height = Math.max(1, Math.round(src.height * factor));
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  return out;
}

/** Encode a canvas to bytes; returns null if the browser can't encode that format. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mimeFor(format), quality));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

export interface BatchInput {
  name: string;
  bytes: Uint8Array;
}
export interface BatchOptions {
  format: ExportFormat;
  quality: number;
  maxWidth?: number;
  rename?: string; // pattern with {n} → 1-based index
}

/**
 * Convert / resize / rename a set of images. Each is decoded, optionally
 * downscaled to `maxWidth`, re-encoded, and renamed. Browser-only (canvas).
 */
export async function batchProcess(
  files: BatchInput[],
  opts: BatchOptions,
): Promise<BatchInput[]> {
  const out: BatchInput[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(f.bytes)]));
    let w = bmp.width;
    let h = bmp.height;
    if (opts.maxWidth && w > opts.maxWidth) {
      h = Math.round((h * opts.maxWidth) / w);
      w = opts.maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const bytes = await encodeCanvas(canvas, opts.format, opts.quality);
    if (!bytes) continue;
    const base = opts.rename
      ? opts.rename.replace(/\{n\}/g, String(i + 1))
      : f.name.replace(/\.[^.]+$/, "");
    out.push({ name: `${base}.${extFor(opts.format)}`, bytes });
  }
  return out;
}
