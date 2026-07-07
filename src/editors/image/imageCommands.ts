import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { getFileService } from "@/files/fileService";
import { downloadFile } from "@/files/download";
import { useImageStore } from "@/editors/image/useImageStore";
import { scaleCanvas, encodeCanvas, extFor } from "@/editors/image/imageExport";
import {
  rasterLayer,
  textLayer,
  shapeLayer,
  drawLayer,
  arrowLayer,
  badgeLayer,
  reorder,
  cropDoc,
  resizeCanvas,
  resizeImage,
  flipCanvas,
  rotateCanvas,
  type Layer,
  type ImageDoc,
} from "@/editors/image/imageModel";

interface Snapshot {
  prev: Layer[];
  prevSel: string | null;
}

function mutate(
  producer: (layers: Layer[]) => { layers: Layer[]; selectedId?: string | null },
): Snapshot | null {
  const doc = useImageStore.getState().getDoc();
  if (!doc) return null;
  const snap: Snapshot = { prev: doc.layers, prevSel: doc.selectedId };
  const { layers, selectedId } = producer(doc.layers);
  useImageStore.getState().setLayers(layers, selectedId);
  return snap;
}

function undoMutate(_a: unknown, snap: Snapshot | null): void {
  if (snap) useImageStore.getState().setLayers(snap.prev, snap.prevSel);
}

interface DocSnapshot {
  prev: ImageDoc;
}

function mutateDoc(fn: (doc: ImageDoc) => ImageDoc): DocSnapshot | null {
  const doc = useImageStore.getState().getDoc();
  if (!doc) return null;
  useImageStore.getState().replaceDoc(fn(doc));
  return { prev: doc };
}

function undoDoc(_a: unknown, snap: DocSnapshot | null): void {
  if (snap) useImageStore.getState().replaceDoc(snap.prev);
}

/** Shared raster import: decode bytes, size a document if none, add a layer. */
async function addRaster(bytes: Uint8Array, name: string): Promise<Snapshot | null> {
  const blob = new Blob([Uint8Array.from(bytes)]);
  const url = URL.createObjectURL(blob);
  const bmp = await createImageBitmap(blob);
  const store = useImageStore.getState();
  if (!store.getDoc()) store.createDoc(name, bmp.width, bmp.height);
  return mutate((layers) => {
    const l = rasterLayer(url, bmp.width, bmp.height, name);
    return { layers: [...layers, l], selectedId: l.id };
  });
}

registerCommand({
  id: "image.addImage",
  title: "Add image layer",
  editor: "image",
  schema: z.object({}),
  run: async () => {
    const file = await getFileService().open({
      accept: [".png", ".jpg", ".jpeg", ".webp", ".avif"],
    });
    if (!file) return null;
    return addRaster(file.data, file.name);
  },
  undo: undoMutate,
});

// Import from drag-drop / clipboard paste (bytes already in hand).
registerCommand({
  id: "image.addImageFile",
  title: "Import image",
  editor: "image",
  schema: z.object({ bytes: z.instanceof(Uint8Array), name: z.string().default("Pasted image") }),
  run: ({ bytes, name }) => addRaster(bytes, name),
  undo: undoMutate,
});

registerCommand({
  id: "image.addText",
  title: "Add text layer",
  editor: "image",
  schema: z.object({ text: z.string().default("Text"), x: z.number().optional(), y: z.number().optional() }),
  run: ({ text, x, y }) => {
    ensureDoc();
    return mutate((layers) => {
      const l = textLayer(text, x, y);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.addShape",
  title: "Add shape layer",
  editor: "image",
  schema: z.object({ shape: z.enum(["rect", "ellipse"]).default("rect") }),
  run: ({ shape }) => {
    ensureDoc();
    return mutate((layers) => {
      const l = shapeLayer(shape);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.addDraw",
  title: "Add brush stroke",
  editor: "image",
  schema: z.object({ points: z.array(z.number()), stroke: z.string(), strokeWidth: z.number().positive() }),
  run: ({ points, stroke, strokeWidth }) => {
    ensureDoc();
    return mutate((layers) => {
      const l = drawLayer(points, stroke, strokeWidth);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.addArrow",
  title: "Add arrow",
  editor: "image",
  schema: z.object({
    points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    stroke: z.string(),
    strokeWidth: z.number().positive(),
  }),
  run: ({ points, stroke, strokeWidth }) => {
    ensureDoc();
    return mutate((layers) => {
      const l = arrowLayer(points, stroke, strokeWidth);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.addBadge",
  title: "Add numbered step",
  editor: "image",
  schema: z.object({ x: z.number(), y: z.number(), fill: z.string() }),
  run: ({ x, y, fill }) => {
    ensureDoc();
    return mutate((layers) => {
      const next = layers.filter((l) => l.type === "badge").length + 1;
      const l = badgeLayer(next, x, y, fill);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.removeLayer",
  title: "Delete layer",
  editor: "image",
  schema: z.object({ id: z.string() }),
  run: ({ id }) =>
    mutate((layers) => ({ layers: layers.filter((l) => l.id !== id), selectedId: null })),
  undo: undoMutate,
});

registerCommand({
  id: "image.reorderLayer",
  title: "Reorder layer",
  editor: "image",
  schema: z.object({ from: z.number().int(), to: z.number().int() }),
  run: ({ from, to }) => mutate((layers) => ({ layers: reorder(layers, from, to) })),
  undo: undoMutate,
});

registerCommand({
  id: "image.setLayerProp",
  title: "Update layer",
  editor: "image",
  schema: z.object({ id: z.string(), patch: z.record(z.string(), z.unknown()) }),
  run: ({ id, patch }) =>
    mutate((layers) => ({
      layers: layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    })),
  undo: undoMutate,
});

registerCommand({
  id: "image.crop",
  title: "Crop canvas",
  editor: "image",
  schema: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }),
  run: ({ x, y, width, height }) => mutateDoc((doc) => cropDoc(doc, x, y, width, height)),
  undo: undoDoc,
});

registerCommand({
  id: "image.resizeCanvas",
  title: "Resize canvas",
  editor: "image",
  schema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    anchor: z.enum(["top-left", "center"]).default("center"),
  }),
  run: ({ width, height, anchor }) => mutateDoc((doc) => resizeCanvas(doc, width, height, anchor)),
  undo: undoDoc,
});

registerCommand({
  id: "image.resizeImage",
  title: "Resize image",
  editor: "image",
  schema: z.object({ factor: z.number().positive() }),
  run: ({ factor }) => mutateDoc((doc) => resizeImage(doc, factor)),
  undo: undoDoc,
});

registerCommand({
  id: "image.flip",
  title: "Flip canvas",
  editor: "image",
  schema: z.object({ axis: z.enum(["h", "v"]) }),
  run: ({ axis }) => mutateDoc((doc) => flipCanvas(doc, axis)),
  undo: undoDoc,
});

registerCommand({
  id: "image.rotateCanvas",
  title: "Rotate canvas 90°",
  editor: "image",
  schema: z.object({ dir: z.enum(["cw", "ccw"]).default("cw") }),
  run: ({ dir }) => mutateDoc((doc) => rotateCanvas(doc, dir)),
  undo: undoDoc,
});

registerCommand({
  id: "image.exportImage",
  title: "Export image",
  editor: "image",
  schema: z.object({
    format: z.enum(["png", "jpeg", "webp", "avif"]).default("png"),
    quality: z.number().min(0.1).max(1).default(0.92),
    scale: z.number().positive().default(1),
  }),
  run: async ({ format, quality, scale }) => {
    const store = useImageStore.getState();
    const doc = store.getDoc();
    const canvas = store.exporter?.();
    if (!doc || !canvas) return;
    const bytes = await encodeCanvas(scaleCanvas(canvas, scale), format, quality);
    if (!bytes) return;
    downloadFile(`${doc.name.replace(/\.[^.]+$/, "")}.${extFor(format)}`, bytes);
  },
});

function ensureDoc(): void {
  const store = useImageStore.getState();
  if (!store.getDoc()) store.createDoc("Untitled", 1280, 800);
}
