import { PDFDocument, degrees } from "pdf-lib";

type Bytes = Uint8Array;

async function load(bytes: Bytes): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

/** Remove pages (0-based indices). Removes high-to-low so indices stay valid. */
export async function deletePages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const pdf = await load(bytes);
  [...new Set(indices)].sort((a, b) => b - a).forEach((i) => pdf.removePage(i));
  return pdf.save();
}

/** Rotate pages by a delta (degrees), added to each page's existing rotation. */
export async function rotatePages(bytes: Bytes, indices: number[], delta: number): Promise<Bytes> {
  const pdf = await load(bytes);
  for (const i of indices) {
    const page = pdf.getPage(i);
    const angle = (((page.getRotation().angle + delta) % 360) + 360) % 360;
    page.setRotation(degrees(angle));
  }
  return pdf.save();
}

/** Duplicate pages, inserting each copy immediately after its original. */
export async function duplicatePages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const pdf = await load(bytes);
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const copies = await pdf.copyPages(pdf, sorted);
  let added = 0;
  sorted.forEach((idx, k) => {
    pdf.insertPage(idx + 1 + added, copies[k]);
    added++;
  });
  return pdf.save();
}

/**
 * Move a page from `from` to final index `to` (0-based in the result),
 * preserving its content/annotations.
 */
export async function movePage(bytes: Bytes, from: number, to: number): Promise<Bytes> {
  const pdf = await load(bytes);
  const page = pdf.getPage(from);
  pdf.removePage(from);
  pdf.insertPage(Math.max(0, Math.min(to, pdf.getPageCount())), page);
  return pdf.save();
}

export async function insertBlankPage(
  bytes: Bytes,
  atIndex: number,
  size: [number, number],
): Promise<Bytes> {
  const pdf = await load(bytes);
  pdf.insertPage(atIndex, size);
  return pdf.save();
}

export async function insertFromPdf(
  bytes: Bytes,
  otherBytes: Bytes,
  atIndex: number,
): Promise<Bytes> {
  const pdf = await load(bytes);
  const other = await load(otherBytes);
  const pages = await pdf.copyPages(other, other.getPageIndices());
  pages.forEach((p, k) => pdf.insertPage(atIndex + k, p));
  return pdf.save();
}

export async function insertImage(
  bytes: Bytes,
  imgBytes: Bytes,
  isPng: boolean,
  atIndex: number,
): Promise<Bytes> {
  const pdf = await load(bytes);
  const img = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);
  const page = pdf.insertPage(atIndex, [img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return pdf.save();
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropPages(bytes: Bytes, indices: number[], box: CropBox): Promise<Bytes> {
  const pdf = await load(bytes);
  for (const i of indices) {
    pdf.getPage(i).setCropBox(box.x, box.y, box.width, box.height);
  }
  return pdf.save();
}

/** Copy the given pages into a fresh document. */
export async function extractPages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, [...new Set(indices)].sort((a, b) => a - b));
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

/** Split into chunks of at most n pages each. */
export async function splitEveryN(bytes: Bytes, n: number): Promise<Bytes[]> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const outs: Bytes[] = [];
  for (let start = 0; start < total; start += n) {
    const out = await PDFDocument.create();
    const idxs: number[] = [];
    for (let i = start; i < Math.min(start + n, total); i++) idxs.push(i);
    const pages = await out.copyPages(src, idxs);
    pages.forEach((p) => out.addPage(p));
    outs.push(await out.save());
  }
  return outs;
}

/** Concatenate multiple PDFs into one. */
export async function mergeDocs(byteList: Bytes[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  for (const bytes of byteList) {
    const src = await load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}
