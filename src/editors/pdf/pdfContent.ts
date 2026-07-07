import { PDFDocument, PDFName, PDFArray, PDFRef, PDFString, StandardFonts, degrees, rgb } from "pdf-lib";
import type { RGB } from "@/editors/pdf/pdfAnnotations";

type Bytes = Uint8Array;

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [842, 1191],
};
export type PageSizeName = keyof typeof PAGE_SIZES;

export interface WatermarkOptions {
  opacity: number;
  fontSize: number;
  rotation: number;
  tiled: boolean;
  color: RGB;
}

/** Draw a text watermark on every page (single centred, or tiled). */
export async function addTextWatermark(
  bytes: Bytes,
  text: string,
  opts: WatermarkOptions,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(opts.color.r, opts.color.g, opts.color.b);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const draw = (x: number, y: number): void =>
      page.drawText(text, {
        x,
        y,
        size: opts.fontSize,
        font,
        color,
        opacity: opts.opacity,
        rotate: degrees(opts.rotation),
      });
    if (opts.tiled) {
      const stepX = opts.fontSize * text.length * 0.7 + 80;
      const stepY = opts.fontSize * 3 + 40;
      for (let y = 0; y < height + stepY; y += stepY) {
        for (let x = -stepX; x < width; x += stepX) draw(x, y);
      }
    } else {
      const w = font.widthOfTextAtSize(text, opts.fontSize);
      draw(width / 2 - (w / 2) * Math.cos((opts.rotation * Math.PI) / 180), height / 2);
    }
  }
  return pdf.save();
}

export interface HeaderFooterOptions {
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
  bates?: { prefix: string; start: number; digits: number };
  fontSize: number;
}

/** Add header/footer text, page numbers, and/or Bates numbering to every page. */
export async function addHeaderFooter(bytes: Bytes, opts: HeaderFooterOptions): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = opts.fontSize;
  const color = rgb(0.25, 0.25, 0.25);
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const margin = 28;
    if (opts.header) page.drawText(opts.header, { x: margin, y: height - margin, size, font, color });
    if (opts.footer) page.drawText(opts.footer, { x: margin, y: margin - size, size, font, color });
    if (opts.pageNumbers) {
      const label = `${i + 1} / ${pages.length}`;
      const w = font.widthOfTextAtSize(label, size);
      page.drawText(label, { x: width - margin - w, y: margin - size, size, font, color });
    }
    if (opts.bates) {
      const n = String(opts.bates.start + i).padStart(opts.bates.digits, "0");
      page.drawText(`${opts.bates.prefix}${n}`, { x: width - margin - 120, y: height - margin, size, font, color });
    }
  });
  return pdf.save();
}

/** Resize pages to a named size, optionally stretching content to fit. */
export async function resizePages(
  bytes: Bytes,
  indices: number[],
  sizeName: PageSizeName,
  scaleContent: boolean,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const [w, h] = PAGE_SIZES[sizeName];
  for (const i of indices) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    if (scaleContent) page.scaleContent(w / width, h / height);
    page.setSize(w, h);
  }
  return pdf.save();
}

/** Fill the page background with a colour, drawn behind existing content. */
export async function setPageBackground(bytes: Bytes, indices: number[], color: RGB): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const contentsKey = PDFName.of("Contents");
  for (const i of indices) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    const ops = `q ${color.r} ${color.g} ${color.b} rg 0 0 ${width} ${height} re f Q\n`;
    const bgRef = pdf.context.register(pdf.context.flateStream(ops));
    const existing = page.node.get(contentsKey);
    const arr = pdf.context.obj([]) as PDFArray;
    arr.push(bgRef);
    if (existing instanceof PDFRef) arr.push(existing);
    else if (existing instanceof PDFArray) {
      for (let k = 0; k < existing.size(); k++) arr.push(existing.get(k));
    }
    page.node.set(contentsKey, arr);
  }
  return pdf.save();
}

export type LinkTarget = { kind: "uri"; uri: string } | { kind: "page"; page: number };

/** Add a clickable link annotation (URI or internal go-to-page) over a rect. */
export async function addLink(
  bytes: Bytes,
  pageIndex: number,
  rect: [number, number, number, number],
  target: LinkTarget,
): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const action = pdf.context.obj({ Type: "Action", S: target.kind === "uri" ? "URI" : "GoTo" });
  if (target.kind === "uri") action.set(PDFName.of("URI"), PDFString.of(target.uri));
  else {
    const destPage = pdf.getPage(Math.max(0, Math.min(target.page, pdf.getPageCount() - 1)));
    const dest = pdf.context.obj([]) as PDFArray;
    dest.push(destPage.ref);
    dest.push(PDFName.of("Fit"));
    action.set(PDFName.of("D"), dest);
  }
  const annot = pdf.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: rect,
    Border: [0, 0, 0],
  });
  annot.set(PDFName.of("A"), pdf.context.register(action));
  let annots = page.node.Annots();
  if (!annots) {
    annots = pdf.context.obj([]) as PDFArray;
    page.node.set(PDFName.of("Annots"), annots);
  }
  annots.push(pdf.context.register(annot));
  return pdf.save();
}
