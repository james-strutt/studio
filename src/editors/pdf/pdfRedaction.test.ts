import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { redactText, redactPattern } from "@/editors/pdf/pdfRedaction";

async function makePdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 500]);
  lines.forEach((t, i) => page.drawText(t, { x: 40, y: 440 - i * 30, size: 16, font }));
  return pdf.save();
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  let out = "";
  for (let i = 0; i < doc.countPages(); i++) {
    out += (doc.loadPage(i) as import("mupdf").PDFPage).toStructuredText().asText();
  }
  return out;
}

describe("true redaction (mupdf) — AC: redacted terms unrecoverable", () => {
  it("removes a redacted word from the extractable text, keeping the rest", async () => {
    const src = await makePdf(["public heading", "the secret is 42", "more public text"]);
    expect(await extractText(src)).toContain("secret");
    const out = await redactText(src, ["secret"]);
    const text = await extractText(out);
    expect(text).not.toContain("secret");
    expect(text).toContain("public");
  });

  it("pattern-redacts emails", async () => {
    const src = await makePdf(["contact alice@example.com now", "keep this line"]);
    const out = await redactPattern(src, "email");
    const text = await extractText(out);
    expect(text).not.toContain("alice@example.com");
    expect(text).toContain("keep this line");
  });
});
