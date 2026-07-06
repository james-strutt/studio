import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  deletePages,
  rotatePages,
  duplicatePages,
  movePage,
  insertBlankPage,
  extractPages,
  splitEveryN,
  mergeDocs,
} from "@/editors/pdf/pdfMutations";

// Each page i gets width 200+i so ordering can be asserted after moves.
async function makePdf(n: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < n; i++) pdf.addPage([200 + i, 300]);
  return pdf.save();
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

async function widths(bytes: Uint8Array): Promise<number[]> {
  const pdf = await load(bytes);
  return pdf.getPages().map((p) => Math.round(p.getWidth()));
}

describe("pdf mutations", () => {
  it("deletes pages high-to-low", async () => {
    expect(await widths(await deletePages(await makePdf(5), [1, 3]))).toEqual([200, 202, 204]);
  });

  it("rotates only the targeted pages", async () => {
    const pdf = await load(await rotatePages(await makePdf(2), [0], 90));
    expect(pdf.getPage(0).getRotation().angle).toBe(90);
    expect(pdf.getPage(1).getRotation().angle).toBe(0);
  });

  it("duplicates pages adjacent to their originals", async () => {
    expect(await widths(await duplicatePages(await makePdf(3), [0, 2]))).toEqual([200, 200, 201, 202, 202]);
  });

  it("moves a page to a new position preserving order", async () => {
    expect(await widths(await movePage(await makePdf(4), 0, 3))).toEqual([201, 202, 203, 200]);
  });

  it("inserts a blank page at an index", async () => {
    expect(await widths(await insertBlankPage(await makePdf(2), 1, [999, 300]))).toEqual([200, 999, 201]);
  });

  it("extracts pages into a fresh doc", async () => {
    expect(await widths(await extractPages(await makePdf(10), [4, 2, 0]))).toEqual([200, 202, 204]);
  });

  it("splits into chunks of at most N", async () => {
    const parts = await splitEveryN(await makePdf(10), 4);
    expect(parts.length).toBe(3);
    expect((await load(parts[0])).getPageCount()).toBe(4);
    expect((await load(parts[2])).getPageCount()).toBe(2);
  });

  it("merges documents in order", async () => {
    const merged = await mergeDocs([await makePdf(2), await makePdf(3)]);
    expect((await load(merged)).getPageCount()).toBe(5);
  });
});
