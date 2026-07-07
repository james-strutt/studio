import { PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Bytes = Uint8Array;

export type PageSizeMode = "image" | "a4" | "letter";
const SIZES: Record<"a4" | "letter", [number, number]> = { a4: [595, 842], letter: [612, 792] };

export interface ImageInput {
  bytes: Bytes;
  isPng: boolean;
}

/**
 * Build a PDF from images, one per page. `mode` "image" sizes each page to its
 * image; "a4"/"letter" centre the image on a fixed page with a small margin.
 */
export async function imagesToPdf(images: ImageInput[], mode: PageSizeMode = "image"): Promise<Bytes> {
  const pdf = await PDFDocument.create();
  for (const im of images) {
    const img = im.isPng ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes);
    if (mode === "image") {
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      const [pw, ph] = SIZES[mode];
      const page = pdf.addPage([pw, ph]);
      const s = Math.min(pw / img.width, ph / img.height) * 0.92;
      const w = img.width * s;
      const h = img.height * s;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  return pdf.save();
}

/** Extract the plain text of every page (pdf.js), separated by form feeds. */
export async function pdfToText(doc: PDFDocumentProxy): Promise<string> {
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n\n\f\n\n");
}

/**
 * Re-compress by rasterising each page to a JPEG at `dpi`/`quality` and
 * rebuilding the PDF at the original page dimensions. Ideal for scans (already
 * raster); for text/vector PDFs this trades selectable text for size. True
 * structure-preserving image downsampling + font subsetting awaits mupdf.
 */
export async function rasterCompress(
  doc: PDFDocumentProxy,
  opts: { dpi: number; quality: number },
): Promise<Bytes> {
  const scale = opts.dpi / 72;
  const out = await PDFDocument.create();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const pts = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff"; // JPEG has no alpha; flatten transparency to white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", opts.quality));
    if (!blob) continue;
    const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const p = out.addPage([pts.width, pts.height]);
    p.drawImage(jpg, { x: 0, y: 0, width: pts.width, height: pts.height });
  }
  return out.save();
}

const TARGET_LADDER: { dpi: number; quality: number }[] = [
  { dpi: 150, quality: 0.72 },
  { dpi: 120, quality: 0.62 },
  { dpi: 100, quality: 0.52 },
  { dpi: 84, quality: 0.44 },
  { dpi: 72, quality: 0.36 },
];

/** Step down DPI/quality until the output fits `maxBytes` (or the smallest tried). */
export async function compressToTarget(doc: PDFDocumentProxy, maxBytes: number): Promise<Bytes> {
  let smallest: Bytes | null = null;
  for (const step of TARGET_LADDER) {
    const bytes = await rasterCompress(doc, step);
    if (!smallest || bytes.length < smallest.length) smallest = bytes;
    if (bytes.length <= maxBytes) return bytes;
  }
  return smallest as Bytes;
}

export interface RenderedPage {
  name: string;
  bytes: Bytes;
}

/**
 * Render each page to a raster image (pdf.js → canvas). Browser-only.
 * `format` is "png" or "jpeg"; `scale` sets the output DPI (1 ≈ 72 dpi).
 */
export async function pdfToImages(
  doc: PDFDocumentProxy,
  baseName: string,
  format: "png" | "jpeg" = "png",
  scale = 2,
  quality = 0.9,
): Promise<RenderedPage[]> {
  const out: RenderedPage[] = [];
  const mime = format === "png" ? "image/png" : "image/jpeg";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, quality));
    if (!blob) continue;
    out.push({
      name: `${baseName}-p${String(i).padStart(2, "0")}.${format === "png" ? "png" : "jpg"}`,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  return out;
}
