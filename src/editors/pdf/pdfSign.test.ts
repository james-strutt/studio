import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { placeSignature } from "@/editors/pdf/pdfSign";

const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function onePage(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 500]);
  return pdf.save();
}

describe("signature placement", () => {
  it("draws the image into page content (no annotation) and stays loadable", async () => {
    const out = await placeSignature(await onePage(), 0, [50, 50, 200, 110], PNG_1PX, true, "2026-07-07");
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPageCount()).toBe(1);
    // Signature is baked into content, not added as an annotation.
    expect(pdf.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    // The page now references at least one XObject (the embedded image).
    const res = pdf.getPage(0).node.lookup(PDFName.of("Resources"), PDFDict);
    expect(res.has(PDFName.of("XObject"))).toBe(true);
  });
});
