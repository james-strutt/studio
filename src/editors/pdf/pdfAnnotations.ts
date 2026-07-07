import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFDict,
  PDFRef,
  StandardFonts,
  type PDFPage,
} from "pdf-lib";

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

/* ---------------------------------------------------------------------------
 * Drawing annotations (P1.10): ink, shapes, sticky notes, text boxes.
 * Each is a real PDF annotation with a baked appearance stream. Geometry is in
 * PDF points; the draw overlay maps pointer coordinates before dispatching.
 * ------------------------------------------------------------------------- */

const ROUND_CAPS = "1 J 1 j\n";

function strokeSetup(color: RGB, width: number): string {
  return `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} RG\n${fmt(width)} w\n${ROUND_CAPS}`;
}

function escPdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ellipsePath(x0: number, y0: number, x1: number, y1: number): string {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  const kx = rx * 0.5523;
  const ky = ry * 0.5523;
  return [
    `${fmt(cx + rx)} ${fmt(cy)} m`,
    `${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
    `${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)} c`,
    `${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
    `${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)} c`,
  ].join("\n");
}

/** Freehand ink: one or more polylines, each a flat [x,y,x,y,…] array. */
export async function addInk(
  bytes: Bytes,
  pageIndex: number,
  paths: number[][],
  color: RGB,
  width: number,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const pts = paths.flat();
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  const pad = width + 2;
  const bbox: Rect = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ];
  let content = strokeSetup(color, width);
  for (const path of paths) {
    for (let i = 0; i < path.length; i += 2) {
      content += `${fmt(path[i])} ${fmt(path[i + 1])} ${i === 0 ? "m" : "l"} `;
    }
    content += "S\n";
  }
  const apRef = makeAppearance(pdf, bbox, content);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Ink",
    Rect: bbox,
    InkList: paths,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    BS: { W: width },
  });
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

export type ShapeKind = "Square" | "Circle";

/** Rectangle (/Square) or ellipse (/Circle) over a rect, optional fill. */
export async function addShape(
  bytes: Bytes,
  pageIndex: number,
  kind: ShapeKind,
  rect: Rect,
  color: RGB,
  width: number,
  fill: RGB | null = null,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const [x0, y0, x1, y1] = rect;
  const hw = width / 2;
  const op = fill ? "B" : "S";
  let c = strokeSetup(color, width);
  if (fill) c += `${fmt(fill.r)} ${fmt(fill.g)} ${fmt(fill.b)} rg\n`;
  if (kind === "Square") {
    c += `${fmt(x0 + hw)} ${fmt(y0 + hw)} ${fmt(x1 - x0 - width)} ${fmt(y1 - y0 - width)} re\n${op}\n`;
  } else {
    c += `${ellipsePath(x0 + hw, y0 + hw, x1 - hw, y1 - hw)}\n${op}\n`;
  }
  const apRef = makeAppearance(pdf, rect, c);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: kind,
    Rect: rect,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    BS: { W: width },
  });
  if (fill) annot.set(PDFName.of("IC"), pdf.context.obj([fill.r, fill.g, fill.b]));
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Straight line, optionally with an arrowhead at the end point. */
export async function addLine(
  bytes: Bytes,
  pageIndex: number,
  p: [number, number, number, number],
  color: RGB,
  width: number,
  arrow: boolean,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const [x1, y1, x2, y2] = p;
  const head = Math.max(6, width * 3);
  const pad = head + width + 2;
  const bbox: Rect = [
    Math.min(x1, x2) - pad,
    Math.min(y1, y2) - pad,
    Math.max(x1, x2) + pad,
    Math.max(y1, y2) + pad,
  ];
  let c = strokeSetup(color, width);
  c += `${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S\n`;
  if (arrow) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const a1 = ang + Math.PI * 0.83;
    const a2 = ang - Math.PI * 0.83;
    c += `${fmt(x2 + Math.cos(a1) * head)} ${fmt(y2 + Math.sin(a1) * head)} m ${fmt(x2)} ${fmt(y2)} l ${fmt(x2 + Math.cos(a2) * head)} ${fmt(y2 + Math.sin(a2) * head)} l S\n`;
  }
  const apRef = makeAppearance(pdf, bbox, c);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Line",
    Rect: bbox,
    L: [x1, y1, x2, y2],
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    BS: { W: width },
    LE: arrow ? ["None", "OpenArrow"] : ["None", "None"],
  });
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Closed polygon through the given [x,y,x,y,…] vertices. */
export async function addPolygon(
  bytes: Bytes,
  pageIndex: number,
  vertices: number[],
  color: RGB,
  width: number,
  fill: RGB | null = null,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const xs = vertices.filter((_, i) => i % 2 === 0);
  const ys = vertices.filter((_, i) => i % 2 === 1);
  const pad = width + 2;
  const bbox: Rect = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ];
  let c = strokeSetup(color, width);
  if (fill) c += `${fmt(fill.r)} ${fmt(fill.g)} ${fmt(fill.b)} rg\n`;
  for (let i = 0; i < vertices.length; i += 2) {
    c += `${fmt(vertices[i])} ${fmt(vertices[i + 1])} ${i === 0 ? "m" : "l"} `;
  }
  c += `h\n${fill ? "B" : "S"}\n`;
  const apRef = makeAppearance(pdf, bbox, c);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Polygon",
    Rect: bbox,
    Vertices: vertices,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    BS: { W: width },
  });
  if (fill) annot.set(PDFName.of("IC"), pdf.context.obj([fill.r, fill.g, fill.b]));
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Sticky note (/Text) anchored with its top-left at (x, y), with a baked icon. */
export async function addTextNote(
  bytes: Bytes,
  pageIndex: number,
  x: number,
  y: number,
  contents: string,
  color: RGB,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const size = 20;
  const rect: Rect = [x, y - size, x + size, y];
  // A simple filled rounded square so the note shows on the canvas.
  let c = `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg\n`;
  c += `${fmt(x + 1)} ${fmt(y - size + 1)} ${fmt(size - 2)} ${fmt(size - 2)} re\nf\n`;
  c += `1 1 1 RG\n1 w\n${fmt(x + 5)} ${fmt(y - 6)} m ${fmt(x + size - 5)} ${fmt(y - 6)} l S\n`;
  c += `${fmt(x + 5)} ${fmt(y - 10)} m ${fmt(x + size - 5)} ${fmt(y - 10)} l S\n`;
  c += `${fmt(x + 5)} ${fmt(y - 14)} m ${fmt(x + size - 7)} ${fmt(y - 14)} l S\n`;
  const apRef = makeAppearance(pdf, rect, c);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: rect,
    Name: "Comment",
    Open: false,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
  });
  finishAnnotation(pdf, annot, apRef, { contents });
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Free-text box (/FreeText) with a baked Helvetica appearance. */
export async function addFreeText(
  bytes: Bytes,
  pageIndex: number,
  rect: Rect,
  contents: string,
  color: RGB,
  fontSize: number,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const [x0, , , y1] = rect;
  const lines = contents.split("\n");
  let c = `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg\n`;
  c += `BT\n/Helv ${fmt(fontSize)} Tf\n${fmt(fontSize * 1.2)} TL\n`;
  c += `${fmt(x0 + 2)} ${fmt(y1 - fontSize)} Td\n`;
  lines.forEach((ln, i) => {
    c += `(${escPdfText(ln)}) Tj\n`;
    if (i < lines.length - 1) c += "T*\n";
  });
  c += "ET\n";
  const apRef = makeAppearance(pdf, rect, c, { Font: { Helv: font.ref } });
  const da = `/Helv ${fmt(fontSize)} Tf ${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg`;
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "FreeText",
    Rect: rect,
    F: F_PRINT,
  });
  annot.set(PDFName.of("Contents"), PDFString.of(contents));
  annot.set(PDFName.of("DA"), PDFString.of(da));
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

export type MeasureKind = "distance" | "perimeter" | "area";

/**
 * A measurement annotation: draws the geometry (line / open polyline / closed
 * polygon) plus a baked value label, and stores the label in /Contents.
 * `points` is a flat [x,y,…] array in PDF points.
 */
export async function addMeasurement(
  bytes: Bytes,
  pageIndex: number,
  kind: MeasureKind,
  points: number[],
  label: string,
  color: RGB,
  width: number,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);

  // Label anchor: midpoint (distance), centroid (area), last vertex (perimeter).
  let lx: number;
  let ly: number;
  if (kind === "distance") {
    lx = (points[0] + points[2]) / 2 + 4;
    ly = (points[1] + points[3]) / 2 + 4;
  } else if (kind === "area") {
    lx = xs.reduce((a, b) => a + b, 0) / xs.length;
    ly = ys.reduce((a, b) => a + b, 0) / ys.length;
  } else {
    lx = points[points.length - 2] + 4;
    ly = points[points.length - 1] + 4;
  }
  const fontSize = 10;
  const labelW = font.widthOfTextAtSize(label, fontSize);

  const pad = width + 4;
  const bbox: Rect = [
    Math.min(Math.min(...xs), lx) - pad,
    Math.min(Math.min(...ys), ly) - pad,
    Math.max(Math.max(...xs), lx + labelW) + pad,
    Math.max(Math.max(...ys), ly + fontSize) + pad,
  ];

  let c = strokeSetup(color, width);
  for (let i = 0; i < points.length; i += 2) {
    c += `${fmt(points[i])} ${fmt(points[i + 1])} ${i === 0 ? "m" : "l"} `;
  }
  if (kind === "area") c += "h ";
  c += "S\n";
  // White label backing for legibility, then the value text.
  c += `1 1 1 rg\n${fmt(lx - 2)} ${fmt(ly - 2)} ${fmt(labelW + 4)} ${fmt(fontSize + 4)} re\nf\n`;
  c += `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg\n`;
  c += `BT\n/F0 ${fmt(fontSize)} Tf\n${fmt(lx)} ${fmt(ly)} Td\n(${escPdfText(label)}) Tj\nET\n`;

  const apRef = makeAppearance(pdf, bbox, c, { Font: { F0: font.ref } });
  const subtype = kind === "distance" ? "Line" : kind === "area" ? "Polygon" : "PolyLine";
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: subtype,
    Rect: bbox,
    C: [color.r, color.g, color.b],
    F: F_PRINT,
    BS: { W: width },
  });
  if (kind === "distance") annot.set(PDFName.of("L"), pdf.context.obj(points));
  else annot.set(PDFName.of("Vertices"), pdf.context.obj(points));
  finishAnnotation(pdf, annot, apRef, { contents: label });
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Text stamp (/Stamp) — a bordered label like "APPROVED", centred in `rect`. */
export async function addStampText(
  bytes: Bytes,
  pageIndex: number,
  rect: Rect,
  label: string,
  color: RGB,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0;
  const h = y1 - y0;
  const fontSize = Math.min(h * 0.5, (w / Math.max(1, label.length)) * 1.6);
  const textW = font.widthOfTextAtSize(label, fontSize);
  const tx = x0 + (w - textW) / 2;
  const ty = y0 + (h - fontSize) / 2 + fontSize * 0.12;
  let c = `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} RG\n2 w\n`;
  c += `${fmt(x0 + 1.5)} ${fmt(y0 + 1.5)} ${fmt(w - 3)} ${fmt(h - 3)} re\nS\n`;
  c += `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg\n`;
  c += `BT\n/F0 ${fmt(fontSize)} Tf\n${fmt(tx)} ${fmt(ty)} Td\n(${escPdfText(label)}) Tj\nET\n`;
  const apRef = makeAppearance(pdf, rect, c, { Font: { F0: font.ref } });
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Stamp",
    Rect: rect,
    Name: "Approved",
    C: [color.r, color.g, color.b],
    F: F_PRINT,
  });
  finishAnnotation(pdf, annot, apRef, { contents: label });
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/** Image stamp (/Stamp) drawing an embedded PNG/JPG in `rect`. */
export async function addStampImage(
  bytes: Bytes,
  pageIndex: number,
  rect: Rect,
  imgBytes: Bytes,
  isPng: boolean,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const img = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0;
  const h = y1 - y0;
  const c = `q\n${fmt(w)} 0 0 ${fmt(h)} ${fmt(x0)} ${fmt(y0)} cm\n/Im0 Do\nQ\n`;
  const apRef = makeAppearance(pdf, rect, c, { XObject: { Im0: img.ref } });
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Stamp",
    Rect: rect,
    F: F_PRINT,
  });
  finishAnnotation(pdf, annot, apRef);
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

const F_HIDDEN = 2; // annotation flag: hide from page display (replies live in the panel)

/** Add a reply (/Text with /IRT) to a parent annotation, hidden from the page. */
export async function addReply(
  bytes: Bytes,
  pageIndex: number,
  parent: { obj: number; gen: number },
  contents: string,
  author = "You",
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [0, 0, 0, 0],
    IRT: PDFRef.of(parent.obj, parent.gen),
    ReplyType: "R",
    F: F_HIDDEN,
  });
  annot.set(PDFName.of("Contents"), PDFString.of(contents));
  annot.set(PDFName.of("T"), PDFString.of(author));
  appendAnnotation(pdf, page, annot);
  return pdf.save();
}

/**
 * Set a review state on an annotation by appending a state reply
 * (/StateModel Review, /State), the PDF-standard way to mark resolved/reopened.
 */
export async function setAnnotState(
  bytes: Bytes,
  pageIndex: number,
  parent: { obj: number; gen: number },
  state: "Completed" | "None",
  author = "You",
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [0, 0, 0, 0],
    IRT: PDFRef.of(parent.obj, parent.gen),
    StateModel: "Review",
    F: F_HIDDEN,
  });
  annot.set(PDFName.of("State"), PDFString.of(state));
  annot.set(PDFName.of("T"), PDFString.of(author));
  appendAnnotation(pdf, page, annot);
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
