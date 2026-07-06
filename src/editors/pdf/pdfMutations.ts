import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  PDFHexString,
  type PDFContext,
  degrees,
} from "pdf-lib";

type Bytes = Uint8Array;

async function load(bytes: Bytes): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

/** Remove pages (0-based indices). Removes high-to-low so indices stay valid. */
export async function deletePages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const pdf = await load(bytes);
  [...new Set(indices)].sort((a, b) => b - a).forEach((i) => pdf.removePage(i));
  return pdf.save();
}

/** Rotate pages by a delta (degrees), added to each page's existing rotation. */
export async function rotatePages(bytes: Bytes, indices: number[], delta: number): Promise<Bytes> {
  const pdf = await load(bytes);
  for (const i of indices) {
    const page = pdf.getPage(i);
    const angle = (((page.getRotation().angle + delta) % 360) + 360) % 360;
    page.setRotation(degrees(angle));
  }
  return pdf.save();
}

/** Duplicate pages, inserting each copy immediately after its original. */
export async function duplicatePages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const pdf = await load(bytes);
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const copies = await pdf.copyPages(pdf, sorted);
  let added = 0;
  sorted.forEach((idx, k) => {
    pdf.insertPage(idx + 1 + added, copies[k]);
    added++;
  });
  return pdf.save();
}

/**
 * Move a page from `from` to final index `to` (0-based in the result),
 * preserving its content/annotations.
 */
export async function movePage(bytes: Bytes, from: number, to: number): Promise<Bytes> {
  const pdf = await load(bytes);
  const page = pdf.getPage(from);
  pdf.removePage(from);
  pdf.insertPage(Math.max(0, Math.min(to, pdf.getPageCount())), page);
  return pdf.save();
}

export async function insertBlankPage(
  bytes: Bytes,
  atIndex: number,
  size: [number, number],
): Promise<Bytes> {
  const pdf = await load(bytes);
  pdf.insertPage(atIndex, size);
  return pdf.save();
}

export async function insertFromPdf(
  bytes: Bytes,
  otherBytes: Bytes,
  atIndex: number,
): Promise<Bytes> {
  const pdf = await load(bytes);
  const other = await load(otherBytes);
  const pages = await pdf.copyPages(other, other.getPageIndices());
  pages.forEach((p, k) => pdf.insertPage(atIndex + k, p));
  return pdf.save();
}

export async function insertImage(
  bytes: Bytes,
  imgBytes: Bytes,
  isPng: boolean,
  atIndex: number,
): Promise<Bytes> {
  const pdf = await load(bytes);
  const img = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);
  const page = pdf.insertPage(atIndex, [img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return pdf.save();
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropPages(bytes: Bytes, indices: number[], box: CropBox): Promise<Bytes> {
  const pdf = await load(bytes);
  for (const i of indices) {
    pdf.getPage(i).setCropBox(box.x, box.y, box.width, box.height);
  }
  return pdf.save();
}

/** Build a fresh single document from the given source page indices, in order. */
async function docFromPages(src: PDFDocument, indices: number[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

/** Copy the given pages into a fresh document. */
export async function extractPages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const src = await load(bytes);
  return docFromPages(src, [...new Set(indices)].sort((a, b) => a - b));
}

/** Split into chunks of at most n pages each. */
export async function splitEveryN(bytes: Bytes, n: number): Promise<Bytes[]> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const outs: Bytes[] = [];
  for (let start = 0; start < total; start += n) {
    const idxs: number[] = [];
    for (let i = start; i < Math.min(start + n, total); i++) idxs.push(i);
    outs.push(await docFromPages(src, idxs));
  }
  return outs;
}

/**
 * Split into one output per range. Ranges are inclusive 0-based [start, end]
 * pairs; they are clamped to the document and empty ranges are skipped. Ranges
 * may overlap or repeat pages — each produces its own file.
 */
export async function splitByRanges(bytes: Bytes, ranges: [number, number][]): Promise<Bytes[]> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const outs: Bytes[] = [];
  for (const [start, end] of ranges) {
    const lo = Math.max(0, Math.min(start, end));
    const hi = Math.min(total - 1, Math.max(start, end));
    if (hi < lo) continue;
    const idxs: number[] = [];
    for (let i = lo; i <= hi; i++) idxs.push(i);
    outs.push(await docFromPages(src, idxs));
  }
  return outs;
}

/**
 * Greedily pack consecutive pages into chunks each ≤ maxBytes. A single page
 * that alone exceeds the target still ships on its own (never dropped). This
 * re-saves growing chunks to measure them, so it is O(pages²) saves worst
 * case — acceptable for interactive splitting of everyday documents.
 */
export async function splitByTargetSize(bytes: Bytes, maxBytes: number): Promise<Bytes[]> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const outs: Bytes[] = [];
  let i = 0;
  while (i < total) {
    let best: Bytes | null = null;
    let bestEnd = i;
    for (let end = i; end < total; end++) {
      const idxs: number[] = [];
      for (let k = i; k <= end; k++) idxs.push(k);
      const data = await docFromPages(src, idxs);
      if (data.length <= maxBytes || end === i) {
        best = data;
        bestEnd = end;
        if (data.length > maxBytes) break; // lone oversized page — ship it alone
      } else {
        break;
      }
    }
    outs.push(best as Bytes);
    i = bestEnd + 1;
  }
  return outs;
}

/* ---------------------------------------------------------------------------
 * Merge (P1.8)
 *
 * pdf-lib's copyPages carries a page's content and its widget annotations, but
 * it does NOT register those widgets in the destination's AcroForm, nor copy
 * the document outline. So a naive concat loses interactive form fields and all
 * bookmarks. The merge below restores both:
 *   - form fields: every copied widget's root field is registered in the output
 *     AcroForm /Fields (collision-safe field names across sources);
 *   - bookmarks: a fresh outline is rebuilt from the callers' page-index trees,
 *     with destinations pointing at the copied pages.
 * Outline destinations are resolved to page indices by the caller (pdf.js does
 * this robustly, including named destinations); this layer only maps indices to
 * the copied pages so it stays pure pdf-lib and unit-testable in node.
 * ------------------------------------------------------------------------- */

const T = PDFName.of("T");
const PARENT = PDFName.of("Parent");
const SUBTYPE = PDFName.of("Subtype");
const WIDGET = PDFName.of("Widget");
const FIELDS = PDFName.of("Fields");
const ACRO_FORM = PDFName.of("AcroForm");

/** One caller-supplied outline entry: title + 0-based page within its source. */
export interface MergeOutlineItem {
  title: string;
  pageIndex: number | null;
  children: MergeOutlineItem[];
}

export type MergeInput =
  | { kind: "pdf"; bytes: Bytes; outline?: MergeOutlineItem[] }
  | { kind: "image"; bytes: Bytes; isPng: boolean };

/** Outline node after page indices are mapped to output page refs. */
interface OutlineNode {
  title: string;
  dest: PDFRef | null;
  children: OutlineNode[];
}

function ensureAcroForm(out: PDFDocument): { form: PDFDict; fields: PDFArray } {
  let form = out.catalog.lookupMaybe(ACRO_FORM, PDFDict);
  if (!form) {
    form = out.context.obj({}) as PDFDict;
    form.set(FIELDS, out.context.obj([]));
    out.catalog.set(ACRO_FORM, out.context.register(form));
  } else if (!form.lookupMaybe(FIELDS, PDFArray)) {
    form.set(FIELDS, out.context.obj([]));
  }
  return { form, fields: form.lookup(FIELDS, PDFArray) };
}

/** Climb the /Parent chain from a widget to its root field. */
function rootFieldRef(ctx: PDFContext, widgetRef: PDFRef): PDFRef {
  let ref = widgetRef;
  const seen = new Set<string>();
  for (;;) {
    const obj = ctx.lookup(ref);
    if (!(obj instanceof PDFDict)) break;
    const parent = obj.get(PARENT);
    if (!(parent instanceof PDFRef) || seen.has(parent.toString())) break;
    seen.add(parent.toString());
    ref = parent;
  }
  return ref;
}

function fieldName(ctx: PDFContext, ref: PDFRef): string | null {
  const dict = ctx.lookup(ref);
  if (!(dict instanceof PDFDict)) return null;
  let t = dict.get(T);
  if (t instanceof PDFRef) t = ctx.lookup(t);
  return t instanceof PDFString || t instanceof PDFHexString ? t.decodeText() : null;
}

/** Build a valid /Outlines structure under parentRef, returning its endpoints. */
function buildOutlineItems(
  ctx: PDFContext,
  items: OutlineNode[],
  parentRef: PDFRef,
): { first: PDFRef; last: PDFRef; count: number } {
  const refs = items.map(() => ctx.nextRef());
  let total = 0;
  items.forEach((item, i) => {
    const dict = ctx.obj({}) as PDFDict;
    dict.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
    dict.set(PARENT, parentRef);
    if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
    if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
    if (item.dest) {
      const dest = ctx.obj([]) as PDFArray;
      dest.push(item.dest);
      dest.push(PDFName.of("Fit"));
      dict.set(PDFName.of("Dest"), dest);
    }
    total += 1;
    if (item.children.length) {
      const child = buildOutlineItems(ctx, item.children, refs[i]);
      dict.set(PDFName.of("First"), child.first);
      dict.set(PDFName.of("Last"), child.last);
      dict.set(PDFName.of("Count"), PDFNumber.of(child.count)); // positive = open
      total += child.count;
    }
    ctx.assign(refs[i], dict);
  });
  return { first: refs[0], last: refs[refs.length - 1], count: total };
}

function attachOutline(out: PDFDocument, items: OutlineNode[]): void {
  if (items.length === 0) return;
  const ctx = out.context;
  const rootRef = ctx.nextRef();
  const built = buildOutlineItems(ctx, items, rootRef);
  const root = ctx.obj({}) as PDFDict;
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), built.first);
  root.set(PDFName.of("Last"), built.last);
  root.set(PDFName.of("Count"), PDFNumber.of(built.count));
  ctx.assign(rootRef, root);
  out.catalog.set(PDFName.of("Outlines"), rootRef);
}

/**
 * Merge PDFs and images into one document, preserving the form fields and
 * bookmarks of every source. Inputs are combined in order; the first document's
 * pages come first.
 */
export async function mergeDocs(inputs: MergeInput[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  const ctx = out.context;
  const { fields } = ensureAcroForm(out);
  const usedNames = new Set<string>();
  const addedRoots = new Set<string>();
  const combinedOutline: OutlineNode[] = [];
  let anyFields = false;

  for (const input of inputs) {
    if (input.kind === "image") {
      const img = input.isPng ? await out.embedPng(input.bytes) : await out.embedJpg(input.bytes);
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      continue;
    }

    const src = await load(input.bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));

    // Register form fields carried by the copied widget annotations.
    for (const page of copied) {
      const annots = page.node.Annots();
      if (!annots) continue;
      for (let j = 0; j < annots.size(); j++) {
        const el = annots.get(j);
        if (!(el instanceof PDFRef)) continue;
        const annot = ctx.lookup(el);
        if (!(annot instanceof PDFDict) || annot.get(SUBTYPE) !== WIDGET) continue;
        const rootRef = rootFieldRef(ctx, el);
        if (addedRoots.has(rootRef.toString())) continue;
        addedRoots.add(rootRef.toString());
        const name = fieldName(ctx, rootRef);
        if (name !== null) {
          let unique = name;
          let n = 2;
          while (usedNames.has(unique)) unique = `${name}-${n++}`;
          usedNames.add(unique);
          if (unique !== name) {
            const dict = ctx.lookup(rootRef);
            if (dict instanceof PDFDict) dict.set(T, PDFHexString.fromText(unique));
          }
        }
        fields.push(rootRef);
        anyFields = true;
      }
    }

    // Remap this source's outline (page indices) to the copied page refs.
    if (input.outline?.length) {
      const remap = (nodes: MergeOutlineItem[]): OutlineNode[] =>
        nodes.map((it) => ({
          title: it.title,
          dest:
            it.pageIndex !== null && it.pageIndex >= 0 && it.pageIndex < copied.length
              ? copied[it.pageIndex].ref
              : null,
          children: remap(it.children),
        }));
      combinedOutline.push(...remap(input.outline));
    }
  }

  // Drop the AcroForm we created if no fields turned up. We deliberately do NOT
  // set /NeedAppearances: the copied widget /AP streams already carry correct
  // appearances, and forcing regeneration without a merged /DR can blank fields
  // in some viewers.
  if (!anyFields) out.catalog.delete(ACRO_FORM);
  attachOutline(out, combinedOutline);
  return out.save();
}
