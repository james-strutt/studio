import { PDFDocument, PDFName, PDFDict, PDFRef, PDFString, PDFHexString } from "pdf-lib";

export interface CommentItem {
  obj: number;
  gen: number;
  page: number; // 1-based
  subtype: string;
  author: string;
  contents: string;
  irt: number | null; // parent object number if this is a reply/state
  state: string | null;
}

const SKIP = new Set(["Link", "Popup", "Widget"]);

function textOf(v: unknown): string {
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : "";
}

/**
 * Read every meaningful annotation from the document via pdf-lib (which exposes
 * /IRT and /State, unlike pdf.js) so the comment panel can show threads and
 * resolved state. Object numbers are stable within these bytes, which is what
 * the reply/resolve commands reference.
 */
export async function readComments(bytes: Uint8Array): Promise<CommentItem[]> {
  const pdf = await PDFDocument.load(bytes);
  const ctx = pdf.context;
  const out: CommentItem[] = [];
  pdf.getPages().forEach((page, pi) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      if (!(ref instanceof PDFRef)) continue;
      const dict = ctx.lookup(ref);
      if (!(dict instanceof PDFDict)) continue;
      const st = dict.get(PDFName.of("Subtype"));
      const subtype = st instanceof PDFName ? st.asString().replace(/^\//, "") : "";
      if (SKIP.has(subtype)) continue;
      const resolve = (key: string): unknown => {
        let v = dict.get(PDFName.of(key));
        if (v instanceof PDFRef) v = ctx.lookup(v);
        return v;
      };
      const irtRaw = dict.get(PDFName.of("IRT"));
      out.push({
        obj: ref.objectNumber,
        gen: ref.generationNumber,
        page: pi + 1,
        subtype,
        author: textOf(resolve("T")),
        contents: textOf(resolve("Contents")),
        irt: irtRaw instanceof PDFRef ? irtRaw.objectNumber : null,
        state: textOf(resolve("State")) || null,
      });
    }
  });
  return out;
}
