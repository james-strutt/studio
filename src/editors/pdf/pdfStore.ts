import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf, type PageSize } from "@/editors/pdf/pdfDocument";

export type ZoomMode = "fit-width" | "fit-page" | "actual" | "custom";
export type ViewMode = "single" | "two-up" | "spread";
export type SidebarTab = "thumbnails" | "outline" | "search" | "comments" | "form";
export type AnnotTool =
  | "select"
  | "ink"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "note"
  | "text"
  | "calibrate"
  | "distance"
  | "perimeter"
  | "area";

export interface PdfDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  pageSizes: PageSize[];
  numPages: number;
  dirty: boolean;
  zoomMode: ZoomMode;
  customScale: number;
  effectiveScale: number;
  rotation: number;
  currentPage: number;
  viewMode: ViewMode;
  darkPage: boolean;
  calibration: MeasureCalibration | null;
}

/** Points-per-unit scale for measurement tools, e.g. { unit: "m", pointsPerUnit: 42.3 }. */
export interface MeasureCalibration {
  unit: string;
  pointsPerUnit: number;
}

interface PdfStore {
  docs: PdfDoc[];
  activeId: string | null;
  sidebar: SidebarTab | null;
  scrollTarget: { page: number; nonce: number } | null;
  selection: number[];
  annotTool: AnnotTool;
  annotColorId: string;
  annotWidth: number;
  annotFill: boolean;
  setAnnotTool: (tool: AnnotTool) => void;
  setAnnotColorId: (id: string) => void;
  setAnnotWidth: (w: number) => void;
  setAnnotFill: (fill: boolean) => void;
  setCalibration: (id: string, cal: MeasureCalibration | null) => void;
  openBytes: (name: string, bytes: Uint8Array) => Promise<string>;
  replaceBytes: (id: string, bytes: Uint8Array) => Promise<void>;
  markSaved: (id: string, name?: string) => void;
  closeDoc: (id: string) => void;
  setActive: (id: string) => void;
  toggleSelect: (index: number, additive: boolean) => void;
  selectRangeTo: (index: number) => void;
  clearSelection: () => void;
  setZoom: (id: string, mode: ZoomMode, customScale?: number) => void;
  setEffectiveScale: (id: string, scale: number) => void;
  rotateView: (id: string, delta: number) => void;
  setCurrentPage: (id: string, page: number) => void;
  setViewMode: (id: string, mode: ViewMode) => void;
  toggleDarkPage: (id: string) => void;
  setSidebar: (tab: SidebarTab | null) => void;
  jumpTo: (page: number) => void;
  getActive: () => PdfDoc | undefined;
}

function patchDoc(docs: PdfDoc[], id: string, patch: Partial<PdfDoc>): PdfDoc[] {
  return docs.map((d) => (d.id === id ? { ...d, ...patch } : d));
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  docs: [],
  activeId: null,
  sidebar: "thumbnails",
  scrollTarget: null,
  selection: [],
  annotTool: "select",
  annotColorId: "amber",
  annotWidth: 2,
  annotFill: false,
  setAnnotTool: (annotTool) => set({ annotTool }),
  setAnnotColorId: (annotColorId) => set({ annotColorId }),
  setAnnotWidth: (annotWidth) => set({ annotWidth }),
  setAnnotFill: (annotFill) => set({ annotFill }),
  setCalibration: (id, calibration) =>
    set((s) => ({ docs: patchDoc(s.docs, id, { calibration }) })),

  async openBytes(name, bytes) {
    const { doc, pageSizes } = await loadPdf(bytes);
    const id = crypto.randomUUID();
    const entry: PdfDoc = {
      id,
      name,
      bytes,
      doc,
      pageSizes,
      numPages: doc.numPages,
      dirty: false,
      zoomMode: "fit-width",
      customScale: 1,
      effectiveScale: 1,
      rotation: 0,
      currentPage: 1,
      viewMode: "single",
      darkPage: false,
      calibration: null,
    };
    set((s) => ({ docs: [...s.docs, entry], activeId: id }));
    return id;
  },

  async replaceBytes(id, bytes) {
    const { doc, pageSizes } = await loadPdf(bytes);
    set((s) => {
      const prev = s.docs.find((d) => d.id === id);
      const currentPage = Math.min(prev?.currentPage ?? 1, doc.numPages);
      return {
        docs: patchDoc(s.docs, id, {
          bytes,
          doc,
          pageSizes,
          numPages: doc.numPages,
          dirty: true,
          currentPage,
        }),
        selection: [],
      };
    });
  },

  markSaved: (id, name) =>
    set((s) => ({
      docs: patchDoc(s.docs, id, { dirty: false, ...(name ? { name } : {}) }),
    })),

  closeDoc(id) {
    set((s) => {
      const docs = s.docs.filter((d) => d.id !== id);
      const activeId =
        s.activeId === id ? (docs[docs.length - 1]?.id ?? null) : s.activeId;
      return { docs, activeId, selection: [] };
    });
  },

  setActive: (activeId) => set({ activeId, selection: [] }),

  toggleSelect: (index, additive) =>
    set((s) => {
      if (!additive) return { selection: [index] };
      return s.selection.includes(index)
        ? { selection: s.selection.filter((i) => i !== index) }
        : { selection: [...s.selection, index] };
    }),

  selectRangeTo: (index) =>
    set((s) => {
      const anchor = s.selection.length ? s.selection[s.selection.length - 1] : index;
      const [lo, hi] = anchor <= index ? [anchor, index] : [index, anchor];
      const range = [];
      for (let i = lo; i <= hi; i++) range.push(i);
      return { selection: range };
    }),

  clearSelection: () => set({ selection: [] }),

  setZoom: (id, mode, customScale) =>
    set((s) => ({
      docs: patchDoc(s.docs, id, {
        zoomMode: mode,
        ...(customScale !== undefined ? { customScale } : {}),
      }),
    })),

  setEffectiveScale: (id, scale) =>
    set((s) => {
      const doc = s.docs.find((d) => d.id === id);
      if (!doc || doc.effectiveScale === scale) return s;
      return { docs: patchDoc(s.docs, id, { effectiveScale: scale }) };
    }),

  rotateView: (id, delta) =>
    set((s) => {
      const doc = s.docs.find((d) => d.id === id);
      if (!doc) return s;
      return { docs: patchDoc(s.docs, id, { rotation: (((doc.rotation + delta) % 360) + 360) % 360 }) };
    }),

  setCurrentPage: (id, page) => set((s) => ({ docs: patchDoc(s.docs, id, { currentPage: page }) })),

  setViewMode: (id, viewMode) => set((s) => ({ docs: patchDoc(s.docs, id, { viewMode }) })),

  toggleDarkPage: (id) =>
    set((s) => {
      const doc = s.docs.find((d) => d.id === id);
      if (!doc) return s;
      return { docs: patchDoc(s.docs, id, { darkPage: !doc.darkPage }) };
    }),

  setSidebar: (sidebar) => set({ sidebar }),

  jumpTo: (page) =>
    set((s) => ({ scrollTarget: { page, nonce: (s.scrollTarget?.nonce ?? 0) + 1 } })),

  getActive: () => get().docs.find((d) => d.id === get().activeId),
}));
