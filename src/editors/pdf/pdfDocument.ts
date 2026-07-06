import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageSize {
  width: number;
  height: number;
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pageSizes: PageSize[];
}

/**
 * Parse bytes into a renderable pdf.js document plus every page's base
 * (scale-1) size, which the virtualised viewer needs up front to lay out
 * slots without rendering. pdf.js detaches the passed buffer, so callers
 * that keep the original bytes for pdf-lib must NOT share this copy.
 */
export async function loadPdf(data: Uint8Array): Promise<LoadedPdf> {
  const doc = await getDocument({ data: data.slice() }).promise;
  const pageSizes = await Promise.all(
    Array.from({ length: doc.numPages }, async (_v, i) => {
      const page = await doc.getPage(i + 1);
      const { width, height } = page.getViewport({ scale: 1 });
      return { width, height };
    }),
  );
  return { doc, pageSizes };
}
