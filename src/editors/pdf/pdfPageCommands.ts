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
  extractPages,
  splitEveryN,
  mergeDocs,
} from "@/editors/pdf/pdfMutations";

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

registerCommand({
  id: "pdf.splitEveryN",
  title: "Split into files of N pages",
  editor: "pdf",
  schema: z.object({ n: z.number().int().positive().default(10) }),
  run: async ({ n }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const parts = await splitEveryN(d.bytes, n);
    const base = d.name.replace(/\.pdf$/i, "");
    parts.forEach((part, i) => downloadFile(`${base}-part${i + 1}.pdf`, part));
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
    const byteList = active ? [active.bytes, ...files.map((f) => f.data)] : files.map((f) => f.data);
    const merged = await mergeDocs(byteList);
    await usePdfStore.getState().openBytes("merged.pdf", merged);
  },
});
