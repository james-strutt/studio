import { create } from "zustand";
import type { ImageDoc, Layer } from "@/editors/image/imageModel";

interface ImageStore {
  doc: ImageDoc | null;
  createDoc: (name: string, width: number, height: number) => void;
  setLayers: (layers: Layer[], selectedId?: string | null) => void;
  select: (id: string | null) => void;
  getDoc: () => ImageDoc | null;
}

let docCounter = 0;

export const useImageStore = create<ImageStore>((set, get) => ({
  doc: null,

  createDoc: (name, width, height) => {
    docCounter += 1;
    set({
      doc: { id: `imgdoc-${docCounter}`, name, width, height, layers: [], selectedId: null },
    });
  },

  // Layer-list replacement is the single write path; commands snapshot the old
  // list for undo. selectedId defaults to unchanged.
  setLayers: (layers, selectedId) =>
    set((s) => {
      if (!s.doc) return s;
      return {
        doc: {
          ...s.doc,
          layers,
          selectedId: selectedId === undefined ? s.doc.selectedId : selectedId,
        },
      };
    }),

  select: (id) => set((s) => (s.doc ? { doc: { ...s.doc, selectedId: id } } : s)),

  getDoc: () => get().doc,
}));
