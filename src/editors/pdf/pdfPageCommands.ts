import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { getFileService } from "@/files/fileService";
import { downloadFile } from "@/files/download";
import {
  deletePages,
  rotatePages,
  duplicatePages,
  movePage,
  insertBlankPage,
  insertFromPdf,
  insertImage,
  cropPages,
  extractPages,
  splitEveryN,
  splitByRanges,
  splitByTargetSize,
  type MergeInput,
} from "@/editors/pdf/pdfMutations";
import { parsePageRanges } from "@/editors/pdf/pdfRanges";
import { destToPageIndex } from "@/editors/pdf/pdfDest";
import { resolveOutlineTree } from "@/editors/pdf/pdfOutlineResolve";
import { pdfInputFromBytes, performMerge } from "@/editors/pdf/pdfMergeRun";

const noArgs = z.object({});
const A4: [number, number] = [595, 842];

interface UndoPatch {
  docId: string;
  prev: Uint8Array;
}

async function mutateActive(
  transform: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<UndoPatch | null> {
  const d = usePdfStore.getState().getActive();
  if (!d) return null;
  const prev = d.bytes;
  const next = await transform(prev);
  await usePdfStore.getState().replaceBytes(d.id, next);
  return { docId: d.id, prev };
}

async function undoMutation(_a: unknown, patch: UndoPatch | null): Promise<void> {
  if (patch) await usePdfStore.getState().replaceBytes(patch.docId, patch.prev);
}

function targetPages(): number[] {
  const s = usePdfStore.getState();
  const d = s.getActive();
  if (!d) return [];
  return s.selection.length ? [...s.selection].sort((a, b) => a - b) : [d.currentPage - 1];
}

registerCommand({
  id: "pdf.deleteSelected",
  title: "Delete selected pages",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = usePdfStore.getState().getActive();
    let pages = targetPages();
    if (d && pages.length >= d.numPages) pages = pages.slice(0, d.numPages - 1); // keep one page
    return mutateActive((bytes) => deletePages(bytes, pages));
  },
  undo: undoMutation,
});

const rotations: { id: string; title: string; delta: number }[] = [
  { id: "pdf.rotatePagesCw", title: "Rotate selected pages clockwise", delta: 90 },
  { id: "pdf.rotatePagesCcw", title: "Rotate selected pages anticlockwise", delta: -90 },
];
for (const r of rotations) {
  registerCommand({
    id: r.id,
    title: r.title,
    editor: "pdf",
    schema: noArgs,
    run: () => mutateActive((bytes) => rotatePages(bytes, targetPages(), r.delta)),
    undo: undoMutation,
  });
}

registerCommand({
  id: "pdf.duplicateSelected",
  title: "Duplicate selected pages",
  editor: "pdf",
  schema: noArgs,
  run: () => mutateActive((bytes) => duplicatePages(bytes, targetPages())),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.insertBlank",
  title: "Insert blank page",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = usePdfStore.getState().getActive();
    const at = d ? d.currentPage : 0;
    return mutateActive((bytes) => insertBlankPage(bytes, at, A4));
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.movePage",
  title: "Move page",
  editor: "pdf",
  schema: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }),
  run: ({ from, to }) => mutateActive((bytes) => movePage(bytes, from, to)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.cropPages",
  title: "Crop pages",
  editor: "pdf",
  // `box` is in PDF points (origin bottom-left); the crop dialog builds it. When
  // `pages` is omitted it falls back to the current selection / current page.
  schema: z.object({
    box: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    pages: z.array(z.number().int().nonnegative()).optional(),
  }),
  run: ({ box, pages }) => {
    const target = pages && pages.length ? pages : targetPages();
    return mutateActive((bytes) => cropPages(bytes, target, box));
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.insertFromPdf",
  title: "Insert pages from another PDF",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const file = await getFileService().open({ accept: [".pdf"] });
    if (!file) return null;
    const d = usePdfStore.getState().getActive();
    const at = d ? d.currentPage : 0;
    return mutateActive((bytes) => insertFromPdf(bytes, file.data, at));
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.insertImage",
  title: "Insert page from image",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const file = await getFileService().open({ accept: [".png", ".jpg", ".jpeg"] });
    if (!file) return null;
    const isPng = /\.png$/i.test(file.name);
    const d = usePdfStore.getState().getActive();
    const at = d ? d.currentPage : 0;
    return mutateActive((bytes) => insertImage(bytes, file.data, isPng, at));
  },
  undo: undoMutation,
});

// Extract / split / merge produce new files rather than mutating in place, so
// they carry no undo entry.
registerCommand({
  id: "pdf.extractSelected",
  title: "Extract selected pages to a new PDF",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const d = usePdfStore.getState().getActive();
    const pages = targetPages();
    if (!d || pages.length === 0) return;
    const out = await extractPages(d.bytes, pages);
    await usePdfStore.getState().openBytes(`extract-${d.name}`, out);
  },
});

function downloadParts(baseName: string, label: string, parts: Uint8Array[]): void {
  const base = baseName.replace(/\.pdf$/i, "");
  parts.forEach((part, i) => downloadFile(`${base}-${label}${i + 1}.pdf`, part));
}

registerCommand({
  id: "pdf.splitEveryN",
  title: "Split into files of N pages",
  editor: "pdf",
  schema: z.object({ n: z.number().int().positive().default(10) }),
  run: async ({ n }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    downloadParts(d.name, "part", await splitEveryN(d.bytes, n));
  },
});

registerCommand({
  id: "pdf.splitByRanges",
  title: "Split by page ranges",
  editor: "pdf",
  // `spec` is a 1-based range string, e.g. "1-3, 5, 8-10"; one file per range.
  schema: z.object({ spec: z.string().default("") }),
  run: async ({ spec }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const ranges = parsePageRanges(spec, d.numPages);
    if (ranges.length === 0) return;
    downloadParts(d.name, "range", await splitByRanges(d.bytes, ranges));
  },
});

registerCommand({
  id: "pdf.splitByTargetSize",
  title: "Split under a target file size",
  editor: "pdf",
  schema: z.object({ mb: z.number().positive().default(10) }),
  run: async ({ mb }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    downloadParts(d.name, "part", await splitByTargetSize(d.bytes, mb * 1024 * 1024));
  },
});

registerCommand({
  id: "pdf.splitByBookmark",
  title: "Split by top-level bookmark",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const outline = await d.doc.getOutline();
    if (!outline || outline.length === 0) return;
    // Resolve each top-level bookmark to its 0-based start page.
    const starts: number[] = [];
    for (const item of outline) {
      const idx = await destToPageIndex(d.doc, item.dest as string | unknown[] | null);
      if (idx !== null) starts.push(idx);
    }
    const bounds = [...new Set(starts)].sort((a, b) => a - b);
    if (bounds.length === 0) return;
    // Each section runs from one bookmark's page up to (but not including) the
    // next. Any pages before the first bookmark ride with the first section.
    const ranges: [number, number][] = bounds.map((start, k) => {
      const from = k === 0 ? 0 : start;
      const to = k + 1 < bounds.length ? bounds[k + 1] - 1 : d.numPages - 1;
      return [from, to] as [number, number];
    });
    downloadParts(d.name, "section", await splitByRanges(d.bytes, ranges));
  },
});

registerCommand({
  id: "pdf.merge",
  title: "Merge PDFs into a new document",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const files = await getFileService().openMultiple({ accept: [".pdf"] });
    if (files.length === 0) return;
    const active = usePdfStore.getState().getActive();
    const inputs: MergeInput[] = [];
    // The active document leads, then each picked file in selection order. The
    // richer drag-to-order tray lives in PdfMergeDialog.
    if (active) {
      inputs.push({ kind: "pdf", bytes: active.bytes, outline: await resolveOutlineTree(active.doc) });
    }
    for (const f of files) inputs.push(await pdfInputFromBytes(f.data));
    await performMerge(inputs);
  },
});
