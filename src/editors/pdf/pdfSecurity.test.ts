import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addPassword, removePassword, isEncrypted, permissionsInt, ALLOW_ALL } from "@/editors/pdf/pdfSecurity";

async function makePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]);
  return pdf.save();
}

describe("pdf security (mupdf)", () => {
  it("computes a permissions integer with feature bits", () => {
    const none = permissionsInt({
      print: false,
      modify: false,
      copy: false,
      annotate: false,
      fillForms: false,
      extract: false,
      assemble: false,
      printHighRes: false,
    });
    expect(permissionsInt(ALLOW_ALL) & 0x4).toBe(0x4); // print bit set
    expect(none & 0x4).toBe(0); // print bit clear
  });

  it("encrypts a PDF so it needs a password, and the password authenticates", async () => {
    const enc = await addPassword(await makePdf(), { userPassword: "hunter2" });
    expect(await isEncrypted(enc)).toBe(true);
  });

  it("round-trips: encrypt then remove password yields an openable PDF", async () => {
    const enc = await addPassword(await makePdf(), { userPassword: "hunter2" });
    const dec = await removePassword(enc, "hunter2");
    expect(await isEncrypted(dec)).toBe(false);
    // pdf-lib can load the decrypted output.
    expect((await PDFDocument.load(dec)).getPageCount()).toBe(1);
  });

  it("rejects a wrong password on removal", async () => {
    const enc = await addPassword(await makePdf(), { userPassword: "hunter2" });
    await expect(removePassword(enc, "wrong")).rejects.toThrow();
  });
});
