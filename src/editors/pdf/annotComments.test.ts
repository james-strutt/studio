import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addTextNote, addReply, setAnnotState } from "@/editors/pdf/pdfAnnotations";
import { readComments } from "@/editors/pdf/annotComments";

async function onePage(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  return pdf.save();
}

const RED = { r: 0.9, g: 0.2, b: 0.2 };

describe("comment reading (threads + state)", () => {
  it("reads a note's contents and page", async () => {
    const out = await addTextNote(await onePage(), 0, 100, 700, "look here", RED);
    const items = await readComments(out);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ subtype: "Text", page: 1, contents: "look here", irt: null });
  });

  it("threads a reply under its parent via /IRT", async () => {
    let bytes = await addTextNote(await onePage(), 0, 100, 700, "root", RED);
    const parent = (await readComments(bytes))[0];
    bytes = await addReply(bytes, 0, { obj: parent.obj, gen: parent.gen }, "a reply");
    const items = await readComments(bytes);
    const reply = items.find((i) => i.irt !== null);
    expect(reply?.contents).toBe("a reply");
    expect(reply?.irt).toBe(parent.obj);
  });

  it("records a resolved state via a review-state reply", async () => {
    let bytes = await addTextNote(await onePage(), 0, 100, 700, "root", RED);
    const parent = (await readComments(bytes))[0];
    bytes = await setAnnotState(bytes, 0, { obj: parent.obj, gen: parent.gen }, "Completed");
    const items = await readComments(bytes);
    const state = items.find((i) => i.state);
    expect(state?.state).toBe("Completed");
    expect(state?.irt).toBe(parent.obj);
  });
});
