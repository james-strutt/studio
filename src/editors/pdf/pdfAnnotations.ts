import { PDFDocument, PDFName, PDFString, PDFDict, type PDFPage, type PDFRef } from "pdf-lib";

type Bytes = Uint8Array;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** A text-line rectangle in PDF points: [x0, y0, x1, y1] (lower-left, upper-right). */
export type Rect = [number, number, number, number];
export type MarkupSubtype = "Highlight" | "Underline" | "StrikeOut" | "Squiggly";

const F_PRINT = 4; // annotation flag: print

function fmt(x: number): string {
  return (Math.round(x * 1000) / 1000).toString();
}

function unionRect(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r[0]));
  const y0 = Math.min(...rects.map((r) => r[1]));
  const x1 = Math.max(...rects.map((r) => r[2]));
  const y1 = Math.max(...rects.map((r) => r[3]));
  return [x0, y0, x1, y1];
}

/** Register `dict` and append it to the page's /Annots (creating it if absent). */
export function appendAnnotation(pdf: PDFDocument, page: PDFPage, dict: PDFDict): PDFRef {
  const ref = pdf.context.register(dict);
  let annots = page.node.Annots();
  if (!annots) {
    annots = pdf.context.obj([]);
    page.node.set(PDFName.of("Annots"), annots);
  }
  annots.push(ref);
  return ref;
}

/** Build a form-XObject appearance stream from a raw content string. */
export function makeAppearance(
  pdf: PDFDocument,
  bbox: Rect,
  content: string,
  resources: Record<string, unknown> = {},
): PDFRef {
  const dict = {
    Type: "XObject",
    Subtype: "Form",
    FormType: 1,
    BBox: bbox,
    Resources: resources,
  } as Parameters<typeof pdf.context.flateStream>[1];
  return pdf.context.register(pdf.context.flateStream(content, dict));
}

/** Attach an /AP appearance dict and optional text fields to an annotation dict. */
export function finishAnnotation(
  pdf: PDFDocument,
  annot: PDFDict,
  apRef: PDFRef,
  opts: { contents?: string; author?: string } = {},
): void {
  annot.set(PDFName.of("AP"), pdf.context.obj({ N: apRef }));
  if (opts.contents) annot.set(PDFName.of("Contents"), PDFString.of(opts.contents));
  if (opts.author) annot.set(PDFName.of("T"), PDFString.of(opts.author));
}

function markupContent(
  rects: Rect[],
  subtype: MarkupSubtype,
  { r, g, b }: RGB,
): { content: string; resources: Record<string, unknown> } {
  if (subtype === "Highlight") {
    let c = `/GS0 gs\n${fmt(r)} ${fmt(g)} ${fmt(b)} rg\n`;
    for (const [x0, y0, x1, y1] of rects) {
      c += `${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)} re\n`;
    }
    c += "f\n";
    return {
      content: c,
      resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", ca: 0.4 } } },
    };
  }

  let c = `${fmt(r)} ${fmt(g)} ${fmt(b)} RG\n`;
  for (const [x0, y0, x1, y1] of rects) {
    const h = y1 - y0;
    const lw = Math.max(0.6, h * 0.06);
    if (subtype === "Underline") {
      const y = y0 + h * 0.1;
      c += `${fmt(lw)} w\n${fmt(x0)} ${fmt(y)} m ${fmt(x1)} ${fmt(y)} l S\n`;
    } else if (subtype === "StrikeOut") {
      const y = y0 + h * 0.5;
      c += `${fmt(lw)} w\n${fmt(x0)} ${fmt(y)} m ${fmt(x1)} ${fmt(y)} l S\n`;
    } else {
      // Squiggly — a zigzag along the baseline.
      const y = y0 + h * 0.1;
      const amp = Math.max(1, h * 0.08);
      const step = Math.max(2, h * 0.25);
      c += `${fmt(lw)} w\n${fmt(x0)} ${fmt(y)} m `;
      let x = x0;
      let up = true;
      while (x < x1) {
        x = Math.min(x + step, x1);
        c += `${fmt(x)} ${fmt(up ? y + amp : y)} l `;
        up = !up;
      }
      c += "S\n";
    }
  }
  return { content: c, resources: {} };
}

/** Add one text-markup annotation to an already-open document. */
export function addMarkupToPage(
  pdf: PDFDocument,
  pageIndex: number,
  rects: Rect[],
  subtype: MarkupSubtype,
  color: RGB,
  opts: { contents?: string; author?: string } = {},
): void {
  const page = pdf.getPage(pageIndex);
  const bbox = unionRect(rects);
  // QuadPoints per PDF spec: upper-left, upper-right, lower-left, lower-right.
  const quadPoints = rects.flatMap(([x0, y0, x1, y1]) => [x0, y1, x1, y1, x0, y0, x1, y0]);
  const { content, resources } = markupContent(rects, subtype, color);
  const apRef = makeAppearance(pdf, bbox, content, resources);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: subtype,
    Rect: bbox,
    QuadPoints: quadPoints,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    CA: subtype === "Highlight" ? 0.4 : 1,
  });
  finishAnnotation(pdf, annot, apRef, opts);
  appendAnnotation(pdf, page, annot);
}

/**
 * Add a text-markup annotation (highlight / underline / strike-out / squiggly)
 * over the given line rectangles, as a proper PDF annotation with QuadPoints and
 * a baked appearance stream so it renders in any viewer.
 */
export async function addTextMarkup(
  bytes: Bytes,
  pageIndex: number,
  rects: Rect[],
  subtype: MarkupSubtype,
  color: RGB,
  opts: { contents?: string; author?: string } = {},
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  addMarkupToPage(pdf, pageIndex, rects, subtype, color, opts);
  return pdf.save();
}

export interface MarkupGroup {
  pageIndex: number;
  rects: Rect[];
}

/**
 * Apply one markup across several pages (a selection that spans a page break)
 * in a single load/save, so it lands as one undo step.
 */
export async function addTextMarkupPages(
  bytes: Bytes,
  groups: MarkupGroup[],
  subtype: MarkupSubtype,
  color: RGB,
  opts: { contents?: string; author?: string } = {},
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  for (const g of groups) {
    if (g.rects.length) addMarkupToPage(pdf, g.pageIndex, g.rects, subtype, color, opts);
  }
  return pdf.save();
}

/** Read every annotation subtype on a page — used by tests and the comment list. */
export function annotationSubtypes(pdf: PDFDocument, pageIndex: number): string[] {
  const annots = pdf.getPage(pageIndex).node.Annots();
  if (!annots) return [];
  const out: string[] = [];
  for (let i = 0; i < annots.size(); i++) {
    const dict = annots.lookup(i, PDFDict);
    const st = dict?.get(PDFName.of("Subtype"));
    if (st instanceof PDFName) out.push(st.asString().replace(/^\//, ""));
  }
  return out;
}
