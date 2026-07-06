import { create } from "zustand";

export type EditorId = "pdf" | "image" | "video";
export type ThemeId = "lightbox" | "grade";

function initialTheme(): ThemeId {
  if (typeof window === "undefined") return "lightbox";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "grade" : "lightbox";
}

interface ShellState {
  activeEditor: EditorId;
  theme: ThemeId;
  panels: { inspector: boolean };
  setEditor: (id: EditorId) => void;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
  togglePanel: (panel: keyof ShellState["panels"]) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  activeEditor: "pdf",
  theme: initialTheme(),
  panels: { inspector: true },
  setEditor: (activeEditor) => set({ activeEditor }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "lightbox" ? "grade" : "lightbox" })),
  togglePanel: (panel) =>
    set((s) => ({ panels: { ...s.panels, [panel]: !s.panels[panel] } })),
}));
