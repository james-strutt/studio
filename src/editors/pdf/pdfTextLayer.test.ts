import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addInvisibleText } from "@/editors/pdf/pdfTextLayer";

async function blankPage(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 500]);
  return pdf.save();
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  return (doc.loadPage(0) as import("mupdf").PDFPage).toStructuredText().asText();
}

describe("invisible OCR text layer", () => {
  it("makes drawn words extractable (searchable) though invisible", async () => {
    const out = await addInvisibleText(await blankPage(), 0, [
      { text: "searchable", x: 40, y: 400, size: 14 },
      { text: "invisible", x: 40, y: 380, size: 14 },
    ]);
    const text = await extractText(out);
    expect(text).toContain("searchable");
    expect(text).toContain("invisible");
  });

  it("skips words the base font cannot encode without throwing", async () => {
    // The ✓ glyph isn't in WinAnsi; it should be skipped, "ok" kept.
    const out = await addInvisibleText(await blankPage(), 0, [
      { text: "ok", x: 40, y: 400, size: 14 },
      { text: "✓✓✓", x: 40, y: 380, size: 14 },
    ]);
    expect(await extractText(out)).toContain("ok");
  });
});
