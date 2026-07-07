import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { getFileService } from "@/files/fileService";
import { useImageStore } from "@/editors/image/useImageStore";
import { rasterLayer, textLayer, shapeLayer, reorder, type Layer } from "@/editors/image/imageModel";

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
    const blob = new Blob([Uint8Array.from(file.data)]);
    const url = URL.createObjectURL(blob);
    const bmp = await createImageBitmap(blob);
    const store = useImageStore.getState();
    if (!store.getDoc()) store.createDoc(file.name, bmp.width, bmp.height);
    return mutate((layers) => {
      const l = rasterLayer(url, bmp.width, bmp.height, file.name);
      return { layers: [...layers, l], selectedId: l.id };
    });
  },
  undo: undoMutate,
});

registerCommand({
  id: "image.addText",
  title: "Add text layer",
  editor: "image",
  schema: z.object({ text: z.string().default("Text") }),
  run: ({ text }) => {
    ensureDoc();
    return mutate((layers) => {
      const l = textLayer(text);
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

function ensureDoc(): void {
  const store = useImageStore.getState();
  if (!store.getDoc()) store.createDoc("Untitled", 1280, 800);
}
