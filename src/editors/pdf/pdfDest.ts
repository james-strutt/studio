import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Resolve a pdf.js outline destination (named string or explicit array) to a
 * 0-based page index, or null if it can't be resolved. Shared by the outline
 * panel and split-by-bookmark.
 */
export async function destToPageIndex(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> {
  if (!dest) return null;
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!explicit || explicit.length === 0) return null;
  try {
    return await doc.getPageIndex(explicit[0] as Parameters<typeof doc.getPageIndex>[0]);
  } catch {
    return null;
  }
}
