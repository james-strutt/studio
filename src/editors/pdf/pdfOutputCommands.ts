import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { getFileService } from "@/files/fileService";
import { downloadFile } from "@/files/download";
import { imagesToPdf, pdfToText, pdfToImages, rasterCompress, compressToTarget } from "@/editors/pdf/pdfConvert";
import { mutateActive, undoMutation } from "@/editors/pdf/pdfMutate";

const noArgs = z.object({});

// Save/export produce a file on disk from the active document's current bytes.
// They do not mutate the document, so they carry no undo entry. Saving marks
// the tab clean (and adopts the chosen filename on web/Electron save dialogs).
registerCommand({
  id: "pdf.save",
  title: "Save PDF",
  editor: "pdf",
  shortcut: "Mod+S",
  schema: noArgs,
  run: async () => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const savedName = await getFileService().save(d.name, d.bytes);
    if (savedName) usePdfStore.getState().markSaved(d.id, savedName);
  },
});

registerCommand({
  id: "pdf.imagesToPdf",
  title: "Create PDF from images",
  editor: "pdf",
  schema: z.object({ mode: z.enum(["image", "a4", "letter"]).default("image") }),
  run: async ({ mode }) => {
    const files = await getFileService().openMultiple({ accept: [".png", ".jpg", ".jpeg"] });
    if (files.length === 0) return;
    const images = files.map((f) => ({ bytes: f.data, isPng: /\.png$/i.test(f.name) }));
    const out = await imagesToPdf(images, mode);
    await usePdfStore.getState().openBytes("images.pdf", out);
  },
});

registerCommand({
  id: "pdf.exportText",
  title: "Export as plain text",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const text = await pdfToText(d.doc);
    downloadFile(`${d.name.replace(/\.pdf$/i, "")}.txt`, new TextEncoder().encode(text));
  },
});

registerCommand({
  id: "pdf.exportImages",
  title: "Export pages as images",
  editor: "pdf",
  schema: z.object({ format: z.enum(["png", "jpeg"]).default("png"), scale: z.number().positive().default(2) }),
  run: async ({ format, scale }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const base = d.name.replace(/\.pdf$/i, "");
    const pages = await pdfToImages(d.doc, base, format, scale);
    pages.forEach((p) => downloadFile(p.name, p.bytes));
  },
});

// Compress rasterises via the active doc's pdf.js proxy, so the transform reads
// `d.doc` rather than its bytes argument. Undo restores the pre-compress bytes.
registerCommand({
  id: "pdf.compress",
  title: "Compress PDF (raster)",
  editor: "pdf",
  schema: z.object({ dpi: z.number().positive().default(120), quality: z.number().min(0.1).max(1).default(0.6) }),
  run: ({ dpi, quality }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return null;
    return mutateActive(() => rasterCompress(d.doc, { dpi, quality }));
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.compressTarget",
  title: "Compress PDF under a target size",
  editor: "pdf",
  schema: z.object({ mb: z.number().positive().default(10) }),
  run: ({ mb }) => {
    const d = usePdfStore.getState().getActive();
    if (!d) return null;
    return mutateActive(() => compressToTarget(d.doc, mb * 1024 * 1024));
  },
  undo: undoMutation,
});
