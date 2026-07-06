import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { usePdfStore, type ZoomMode, type ViewMode, type PdfDoc } from "@/editors/pdf/pdfStore";
import { getFileService } from "@/files/fileService";

const noArgs = z.object({});
const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

function active(): PdfDoc | undefined {
  return usePdfStore.getState().getActive();
}

registerCommand({
  id: "pdf.open",
  title: "Open PDF",
  editor: "pdf",
  schema: noArgs,
  run: async () => {
    const file = await getFileService().open({ accept: [".pdf"] });
    if (file) await usePdfStore.getState().openBytes(file.name, file.data);
  },
});

registerCommand({
  id: "pdf.zoomIn",
  title: "Zoom in",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = active();
    if (d) usePdfStore.getState().setZoom(d.id, "custom", Math.min(d.effectiveScale * ZOOM_STEP, MAX_SCALE));
  },
});

registerCommand({
  id: "pdf.zoomOut",
  title: "Zoom out",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = active();
    if (d) usePdfStore.getState().setZoom(d.id, "custom", Math.max(d.effectiveScale / ZOOM_STEP, MIN_SCALE));
  },
});

const fitModes: { id: string; title: string; mode: ZoomMode }[] = [
  { id: "pdf.fitWidth", title: "Fit width", mode: "fit-width" },
  { id: "pdf.fitPage", title: "Fit page", mode: "fit-page" },
  { id: "pdf.actualSize", title: "Actual size (100%)", mode: "actual" },
];

for (const f of fitModes) {
  registerCommand({
    id: f.id,
    title: f.title,
    editor: "pdf",
    schema: noArgs,
    run: () => {
      const d = active();
      if (d) usePdfStore.getState().setZoom(d.id, f.mode);
    },
  });
}

registerCommand({
  id: "pdf.rotateCw",
  title: "Rotate view clockwise",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = active();
    if (d) usePdfStore.getState().rotateView(d.id, 90);
  },
});

registerCommand({
  id: "pdf.rotateCcw",
  title: "Rotate view anticlockwise",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = active();
    if (d) usePdfStore.getState().rotateView(d.id, -90);
  },
});

const viewModes: { id: string; title: string; mode: ViewMode }[] = [
  { id: "pdf.viewSingle", title: "View: single page", mode: "single" },
  { id: "pdf.viewTwoUp", title: "View: two-up", mode: "two-up" },
  { id: "pdf.viewSpread", title: "View: book spread", mode: "spread" },
];

for (const v of viewModes) {
  registerCommand({
    id: v.id,
    title: v.title,
    editor: "pdf",
    schema: noArgs,
    run: () => {
      const d = active();
      if (d) usePdfStore.getState().setViewMode(d.id, v.mode);
    },
  });
}

registerCommand({
  id: "pdf.toggleDarkPage",
  title: "Toggle dark-mode page rendering",
  editor: "pdf",
  schema: noArgs,
  run: () => {
    const d = active();
    if (d) usePdfStore.getState().toggleDarkPage(d.id);
  },
});
