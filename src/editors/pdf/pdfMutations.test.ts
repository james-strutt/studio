import { describe, it, expect } from "vitest";
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRef, PDFString, PDFHexString } from "pdf-lib";
import {
  deletePages,
  rotatePages,
  duplicatePages,
  movePage,
  insertBlankPage,
  extractPages,
  splitEveryN,
  splitByRanges,
  splitByTargetSize,
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

/** A one-page PDF carrying a single text form field. */
async function makeFormPdf(fieldName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 300]);
  const field = pdf.getForm().createTextField(fieldName);
  field.setText("value");
  field.addToPage(page, { x: 10, y: 10, width: 120, height: 20 });
  return pdf.save();
}

/** Walk a merged document's outline into a flat list of title + 1-based page. */
function outlineEntries(pdf: PDFDocument): { title: string; page: number | null }[] {
  const ctx = pdf.context;
  const pageIndexByRef = new Map<string, number>();
  pdf.getPages().forEach((p, i) => pageIndexByRef.set(p.ref.toString(), i));

  const outlinesRef = pdf.catalog.get(PDFName.of("Outlines"));
  if (!(outlinesRef instanceof PDFRef)) return [];
  const out: { title: string; page: number | null }[] = [];

  const titleOf = (dict: PDFDict): string => {
    const t = dict.get(PDFName.of("Title"));
    return t instanceof PDFString || t instanceof PDFHexString ? t.decodeText() : "";
  };
  const pageOf = (dict: PDFDict): number | null => {
    const destRaw = dict.get(PDFName.of("Dest"));
    const arr = destRaw instanceof PDFRef ? ctx.lookup(destRaw) : destRaw;
    if (!(arr instanceof PDFArray)) return null;
    const first = arr.get(0);
    if (!(first instanceof PDFRef)) return null;
    const idx = pageIndexByRef.get(first.toString());
    return idx === undefined ? null : idx + 1;
  };

  const walk = (ref: unknown): void => {
    while (ref instanceof PDFRef) {
      const dict = ctx.lookup(ref);
      if (!(dict instanceof PDFDict)) break;
      out.push({ title: titleOf(dict), page: pageOf(dict) });
      const first = dict.get(PDFName.of("First"));
      if (first instanceof PDFRef) walk(first);
      ref = dict.get(PDFName.of("Next"));
    }
  };

  const root = ctx.lookup(outlinesRef);
  if (root instanceof PDFDict) walk(root.get(PDFName.of("First")));
  return out;
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

  it("splits into one file per range, preserving order", async () => {
    const parts = await splitByRanges(await makePdf(10), [
      [0, 2],
      [4, 4],
      [7, 9],
    ]);
    expect(parts.length).toBe(3);
    expect(await widths(parts[0])).toEqual([200, 201, 202]);
    expect(await widths(parts[1])).toEqual([204]);
    expect(await widths(parts[2])).toEqual([207, 208, 209]);
  });

  it("clamps ranges and skips empty ones", async () => {
    const parts = await splitByRanges(await makePdf(4), [
      [2, 100],
      [10, 20],
    ]);
    expect(parts.length).toBe(1);
    expect(await widths(parts[0])).toEqual([202, 203]);
  });

  it("target-size split preserves every page in order", async () => {
    // maxBytes=1 forces each page onto its own file (the lone-oversized path).
    const parts = await splitByTargetSize(await makePdf(5), 1);
    expect(parts.length).toBe(5);
    const flat: number[] = [];
    for (const p of parts) flat.push(...(await widths(p)));
    expect(flat).toEqual([200, 201, 202, 203, 204]);
  });

  it("target-size split packs all pages when the budget is ample", async () => {
    const parts = await splitByTargetSize(await makePdf(6), 10 * 1024 * 1024);
    expect(parts.length).toBe(1);
    expect((await load(parts[0])).getPageCount()).toBe(6);
  });

  it("merges documents in order", async () => {
    const merged = await mergeDocs([
      { kind: "pdf", bytes: await makePdf(2) },
      { kind: "pdf", bytes: await makePdf(3) },
    ]);
    expect((await load(merged)).getPageCount()).toBe(5);
  });

  it("preserves form fields of every source document (AC)", async () => {
    const merged = await mergeDocs([
      { kind: "pdf", bytes: await makeFormPdf("alpha") },
      { kind: "pdf", bytes: await makeFormPdf("beta") },
    ]);
    const names = (await load(merged))
      .getForm()
      .getFields()
      .map((f) => f.getName())
      .sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("keeps colliding field names unique across sources", async () => {
    const merged = await mergeDocs([
      { kind: "pdf", bytes: await makeFormPdf("name") },
      { kind: "pdf", bytes: await makeFormPdf("name") },
    ]);
    const names = (await load(merged))
      .getForm()
      .getFields()
      .map((f) => f.getName())
      .sort();
    expect(names).toEqual(["name", "name-2"]);
  });

  it("preserves bookmarks, remapping destinations to the merged pages (AC)", async () => {
    const merged = await mergeDocs([
      {
        kind: "pdf",
        bytes: await makePdf(3),
        outline: [
          { title: "A", pageIndex: 0, children: [{ title: "A.1", pageIndex: 2, children: [] }] },
        ],
      },
      { kind: "pdf", bytes: await makePdf(2), outline: [{ title: "B", pageIndex: 1, children: [] }] },
    ]);
    // Source 1 → merged pages 1..3, source 2 → merged pages 4..5.
    expect(outlineEntries(await load(merged))).toEqual([
      { title: "A", page: 1 },
      { title: "A.1", page: 3 },
      { title: "B", page: 5 },
    ]);
  });

  it("drops the AcroForm when no source has form fields", async () => {
    const merged = await mergeDocs([
      { kind: "pdf", bytes: await makePdf(2) },
      { kind: "pdf", bytes: await makePdf(2) },
    ]);
    expect((await load(merged)).catalog.has(PDFName.of("AcroForm"))).toBe(false);
  });
});
