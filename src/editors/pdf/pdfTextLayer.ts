import { PDFDocument, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";

export interface OcrWord {
  text: string;
  x: number; // PDF points, left
  y: number; // PDF points, baseline (bottom of the word box)
  size: number; // PDF points
}

/**
 * Draw words as a fully transparent (opacity 0) text layer. The glyphs are
 * invisible but the text-showing operators are present, so the page becomes
 * searchable and copyable — the standard OCR "invisible text layer". Words the
 * base font can't encode are skipped rather than throwing.
 */
export function drawInvisibleWords(page: PDFPage, font: PDFFont, words: OcrWord[]): void {
  for (const w of words) {
    if (!w.text.trim()) continue;
    try {
      page.drawText(w.text, { x: w.x, y: w.y, size: Math.max(2, w.size), font, opacity: 0 });
    } catch {
      /* un-encodable glyph for the base font — skip this word */
    }
  }
}

/** Add an invisible text layer to one page (testable wrapper). */
export async function addInvisibleText(
  bytes: Uint8Array,
  pageIndex: number,
  words: OcrWord[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  drawInvisibleWords(pdf.getPage(pageIndex), font, words);
  return pdf.save();
}
