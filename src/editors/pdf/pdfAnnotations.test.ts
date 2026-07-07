import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import { addTextMarkup, annotationSubtypes, type Rect } from "@/editors/pdf/pdfAnnotations";

async function onePage(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  return pdf.save();
}

function firstAnnot(pdf: PDFDocument): PDFDict {
  const annots = pdf.getPage(0).node.Annots();
  if (!annots) throw new Error("no annots");
  return annots.lookup(0, PDFDict);
}

const YELLOW = { r: 1, g: 0.9, b: 0.2 };
const line: Rect = [100, 700, 300, 715];

describe("text markup annotations", () => {
  it("writes a Highlight with QuadPoints, colour and an appearance stream", async () => {
    const out = await addTextMarkup(await onePage(), 0, [line], "Highlight", YELLOW);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Highlight"]);
    const a = firstAnnot(pdf);
    // one quad = 8 numbers
    expect(a.lookup(PDFName.of("QuadPoints"), PDFArray).size()).toBe(8);
    expect(a.lookup(PDFName.of("Rect"), PDFArray).size()).toBe(4);
    expect(a.has(PDFName.of("AP"))).toBe(true);
  });

  it("supports underline / strike-out / squiggly subtypes", async () => {
    for (const st of ["Underline", "StrikeOut", "Squiggly"] as const) {
      const out = await addTextMarkup(await onePage(), 0, [line], st, YELLOW);
      const pdf = await PDFDocument.load(out);
      expect(annotationSubtypes(pdf, 0)).toEqual([st]);
      expect(firstAnnot(pdf).has(PDFName.of("AP"))).toBe(true);
    }
  });

  it("spans multiple line rects in one annotation (QuadPoints grows by 8 per line)", async () => {
    const rects: Rect[] = [
      [100, 700, 300, 715],
      [100, 680, 260, 695],
    ];
    const out = await addTextMarkup(await onePage(), 0, rects, "Highlight", YELLOW);
    const pdf = await PDFDocument.load(out);
    expect(firstAnnot(pdf).lookup(PDFName.of("QuadPoints"), PDFArray).size()).toBe(16);
  });

  it("stores note text as /Contents when provided", async () => {
    const out = await addTextMarkup(await onePage(), 0, [line], "Highlight", YELLOW, {
      contents: "check this",
      author: "James",
    });
    const pdf = await PDFDocument.load(out);
    const a = firstAnnot(pdf);
    expect(a.has(PDFName.of("Contents"))).toBe(true);
    expect(a.has(PDFName.of("T"))).toBe(true);
  });
});
