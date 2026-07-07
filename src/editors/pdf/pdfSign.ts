import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Rect } from "@/editors/pdf/pdfAnnotations";

type Bytes = Uint8Array;

/**
 * Draw a signature image directly onto the page content (not as an annotation),
 * so it is inherently flattened into the saved PDF. An optional date line is
 * printed just below. `rect` is in PDF points.
 */
export async function placeSignature(
  bytes: Bytes,
  pageIndex: number,
  rect: Rect,
  imgBytes: Bytes,
  isPng: boolean,
  dateText?: string,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const img = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);
  const [x0, y0, x1, y1] = rect;
  page.drawImage(img, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  if (dateText) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(dateText, { x: x0, y: y0 - 12, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
  }
  return pdf.save();
}
