import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import {
  addTextMarkup,
  addInk,
  addShape,
  addLine,
  addPolygon,
  addTextNote,
  addFreeText,
  addStampText,
  addStampImage,
  annotationSubtypes,
  type Rect,
} from "@/editors/pdf/pdfAnnotations";

// 1x1 transparent PNG.
const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

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

describe("drawing annotations", () => {
  const RED = { r: 0.9, g: 0.2, b: 0.2 };

  it("writes an Ink annotation with an InkList and appearance", async () => {
    const out = await addInk(await onePage(), 0, [[100, 100, 150, 160, 200, 120]], RED, 2);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Ink"]);
    const a = firstAnnot(pdf);
    expect(a.lookup(PDFName.of("InkList"), PDFArray).size()).toBe(1);
    expect(a.has(PDFName.of("AP"))).toBe(true);
  });

  it("writes Square and Circle shapes with fill (/IC)", async () => {
    for (const kind of ["Square", "Circle"] as const) {
      const out = await addShape(await onePage(), 0, kind, [100, 100, 300, 200], RED, 2, {
        r: 1,
        g: 1,
        b: 0,
      });
      const pdf = await PDFDocument.load(out);
      expect(annotationSubtypes(pdf, 0)).toEqual([kind]);
      const a = firstAnnot(pdf);
      expect(a.has(PDFName.of("IC"))).toBe(true);
      expect(a.has(PDFName.of("AP"))).toBe(true);
    }
  });

  it("writes a Line with arrowhead endings", async () => {
    const out = await addLine(await onePage(), 0, [100, 100, 300, 200], RED, 2, true);
    const pdf = await PDFDocument.load(out);
    const a = firstAnnot(pdf);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Line"]);
    expect(a.lookup(PDFName.of("L"), PDFArray).size()).toBe(4);
    expect(a.lookup(PDFName.of("LE"), PDFArray).size()).toBe(2);
  });

  it("writes a closed Polygon with vertices", async () => {
    const out = await addPolygon(await onePage(), 0, [100, 100, 200, 100, 150, 200], RED, 2);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Polygon"]);
    expect(firstAnnot(pdf).lookup(PDFName.of("Vertices"), PDFArray).size()).toBe(6);
  });

  it("writes a sticky Text note carrying its contents", async () => {
    const out = await addTextNote(await onePage(), 0, 120, 700, "please review", RED);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Text"]);
    expect(firstAnnot(pdf).has(PDFName.of("Contents"))).toBe(true);
  });

  it("writes a FreeText box with a /DA and appearance", async () => {
    const out = await addFreeText(await onePage(), 0, [100, 600, 300, 700], "Note\ntwo lines", RED, 12);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["FreeText"]);
    const a = firstAnnot(pdf);
    expect(a.has(PDFName.of("DA"))).toBe(true);
    expect(a.has(PDFName.of("AP"))).toBe(true);
  });

  it("writes a text Stamp with a label", async () => {
    const out = await addStampText(await onePage(), 0, [100, 600, 260, 644], "APPROVED", {
      r: 0.2,
      g: 0.6,
      b: 0.3,
    });
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Stamp"]);
    expect(firstAnnot(pdf).has(PDFName.of("AP"))).toBe(true);
  });

  it("writes an image Stamp embedding a PNG", async () => {
    const out = await addStampImage(await onePage(), 0, [100, 600, 200, 700], PNG_1PX, true);
    const pdf = await PDFDocument.load(out);
    expect(annotationSubtypes(pdf, 0)).toEqual(["Stamp"]);
    expect(firstAnnot(pdf).has(PDFName.of("AP"))).toBe(true);
  });
});
