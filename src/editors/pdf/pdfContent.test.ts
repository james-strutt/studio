import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef } from "pdf-lib";
import {
  addTextWatermark,
  addHeaderFooter,
  resizePages,
  setPageBackground,
  addLink,
} from "@/editors/pdf/pdfContent";

async function makePdf(n: number, w = 400, h = 500): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < n; i++) pdf.addPage([w, h]);
  return pdf.save();
}

const WM = { opacity: 0.2, fontSize: 48, rotation: 45, tiled: false, color: { r: 0.5, g: 0.5, b: 0.5 } };

describe("pdf content editing", () => {
  it("watermark keeps the page count and stays loadable", async () => {
    const out = await addTextWatermark(await makePdf(3), "DRAFT", WM);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it("resizes pages to a named size", async () => {
    const out = await resizePages(await makePdf(2), [0, 1], "a4", false);
    const page = (await PDFDocument.load(out)).getPage(0);
    expect([Math.round(page.getWidth()), Math.round(page.getHeight())]).toEqual([595, 842]);
  });

  it("background prepends a content stream (drawn behind)", async () => {
    const out = await setPageBackground(await makePdf(1), [0], { r: 1, g: 1, b: 0.9 });
    const page = (await PDFDocument.load(out)).getPage(0);
    const contents = page.node.get(PDFName.of("Contents"));
    expect(contents instanceof PDFArray).toBe(true);
    expect((contents as PDFArray).size()).toBeGreaterThanOrEqual(1);
  });

  it("adds a URI link annotation", async () => {
    const out = await addLink(await makePdf(1), 0, [10, 10, 100, 30], {
      kind: "uri",
      uri: "https://example.com",
    });
    const pdf = await PDFDocument.load(out);
    const annots = pdf.getPage(0).node.Annots()!;
    const link = annots.lookup(0, PDFDict);
    const subtype = link.get(PDFName.of("Subtype"));
    expect(subtype instanceof PDFName && subtype.asString()).toBe("/Link");
    expect(link.get(PDFName.of("A")) instanceof PDFRef).toBe(true);
  });

  it("adds a go-to-page link", async () => {
    const out = await addLink(await makePdf(3), 0, [10, 10, 100, 30], { kind: "page", page: 2 });
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPage(0).node.Annots()!.size()).toBe(1);
  });

  it("header/footer keeps the document loadable with page numbers", async () => {
    const out = await addHeaderFooter(await makePdf(2), {
      header: "Confidential",
      footer: "Studio",
      pageNumbers: true,
      bates: { prefix: "DOC", start: 1, digits: 5 },
      fontSize: 9,
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
