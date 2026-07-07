import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdf } from "@/editors/pdf/pdfConvert";

const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("imagesToPdf", () => {
  it("makes one page per image", async () => {
    const out = await imagesToPdf([
      { bytes: PNG_1PX, isPng: true },
      { bytes: PNG_1PX, isPng: true },
    ]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("sizes pages to a fixed page in a4 mode", async () => {
    const out = await imagesToPdf([{ bytes: PNG_1PX, isPng: true }], "a4");
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it("sizes pages to the image in image mode", async () => {
    const out = await imagesToPdf([{ bytes: PNG_1PX, isPng: true }], "image");
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(Math.round(page.getWidth())).toBe(1);
    expect(Math.round(page.getHeight())).toBe(1);
  });
});
