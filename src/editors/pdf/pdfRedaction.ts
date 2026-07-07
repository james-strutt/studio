import type { PDFDocument as MuPDFDocument, PDFPage, Quad, Rect } from "mupdf";

type Bytes = Uint8Array;

function quadToRect(q: Quad): Rect {
  const xs = [q[0], q[2], q[4], q[6]];
  const ys = [q[1], q[3], q[5], q[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * True redaction: for each needle, find every occurrence and remove it from the
 * content stream (mupdf redaction annotations + applyRedactions), not just cover
 * it. The saved file has the text genuinely gone.
 */
export async function redactText(bytes: Bytes, needles: string[]): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  const clean = needles.map((n) => n.trim()).filter(Boolean);
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as PDFPage;
    let added = false;
    for (const needle of clean) {
      for (const quads of page.search(needle, 500)) {
        for (const q of quads) {
          page.createAnnotation("Redact").setRect(quadToRect(q));
          added = true;
        }
      }
    }
    if (added) page.applyRedactions(true);
  }
  return doc.saveToBuffer("garbage=deduplicate").asUint8Array();
}

const PATTERNS: Record<string, RegExp> = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  phone: /\+?\d[\d ().-]{7,}\d/g,
};

/** Redact everything matching a built-in or custom pattern (regex over page text). */
export async function redactPattern(
  bytes: Bytes,
  kind: "email" | "phone" | "custom",
  custom?: string,
): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  const re = kind === "custom" ? new RegExp(custom ?? "", "g") : PATTERNS[kind];
  const found = new Set<string>();
  for (let i = 0; i < doc.countPages(); i++) {
    const text = (doc.loadPage(i) as PDFPage).toStructuredText().asText();
    for (const m of text.matchAll(re)) found.add(m[0].trim());
  }
  if (found.size === 0) return bytes;
  return redactText(bytes, [...found]);
}

/** Redact explicit rectangles on a page (mupdf top-left coords). */
export async function redactRects(bytes: Bytes, pageIndex: number, rects: Rect[]): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  const page = doc.loadPage(pageIndex) as PDFPage;
  for (const rect of rects) page.createAnnotation("Redact").setRect(rect);
  page.applyRedactions(true);
  return doc.saveToBuffer("garbage=deduplicate").asUint8Array();
}

const META_KEYS = [
  "info:Title",
  "info:Author",
  "info:Subject",
  "info:Keywords",
  "info:Creator",
  "info:Producer",
];

/** One-click sanitise: clear document metadata and garbage-collect the file. */
export async function sanitise(bytes: Bytes): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  for (const key of META_KEYS) {
    try {
      doc.setMetaData(key, "");
    } catch {
      /* key may not exist */
    }
  }
  return doc.saveToBuffer("garbage=deduplicate").asUint8Array();
}
