import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { drawInvisibleWords, type OcrWord } from "@/editors/pdf/pdfTextLayer";

interface TessWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TessData {
  words?: TessWord[];
  blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: TessWord[] }> }> }>;
}

/** tesseract.js exposes words either top-level or nested under blocks/paras/lines. */
function extractWords(data: unknown): TessWord[] {
  const d = data as TessData;
  if (d.words?.length) return d.words;
  const out: TessWord[] = [];
  for (const b of d.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? []) out.push(...(l.words ?? []));
  return out;
}

const OCR_DPI = 180;

/**
 * OCR every page: render it to a canvas (pdf.js), recognise text with
 * tesseract.js, and write an invisible text layer positioned over the image so
 * the scanned page becomes searchable and copyable. Browser-only (canvas +
 * tesseract). Language data downloads on first use, then is cached.
 */
export async function ocrPdf(
  bytes: Uint8Array,
  pdfjsDoc: PDFDocumentProxy,
  onProgress?: (p: number) => void,
): Promise<Uint8Array> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const s = OCR_DPI / 72;
  const n = pdfjsDoc.numPages;
  try {
    for (let i = 1; i <= n; i++) {
      onProgress?.((i - 1) / n);
      const page = await pdfjsDoc.getPage(i);
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const result = await worker.recognize(canvas, {}, { blocks: true });
      const tessWords = extractWords(result.data);
      const pdfPage = pdf.getPage(i - 1);
      const ph = pdfPage.getSize().height;
      const words: OcrWord[] = tessWords.map((w) => ({
        text: w.text,
        x: w.bbox.x0 / s,
        y: ph - w.bbox.y1 / s,
        size: Math.max(4, (w.bbox.y1 - w.bbox.y0) / s),
      }));
      drawInvisibleWords(pdfPage, font, words);
    }
  } finally {
    await worker.terminate();
  }
  onProgress?.(1);
  return pdf.save();
}
