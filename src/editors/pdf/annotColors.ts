import type { RGB } from "@/editors/pdf/pdfAnnotations";

/** Shared annotation colour palette, drawn from the Leader-amber theme family. */
export const ANNOT_COLORS: { id: string; label: string; rgb: RGB; css: string }[] = [
  { id: "amber", label: "Amber", rgb: { r: 0.98, g: 0.75, b: 0.14 }, css: "#FBBF24" },
  { id: "yellow", label: "Yellow", rgb: { r: 1, g: 0.92, b: 0.23 }, css: "#FFEB3B" },
  { id: "green", label: "Green", rgb: { r: 0.3, g: 0.79, b: 0.35 }, css: "#4CAF59" },
  { id: "blue", label: "Blue", rgb: { r: 0.26, g: 0.55, b: 0.96 }, css: "#428CF5" },
  { id: "pink", label: "Pink", rgb: { r: 0.96, g: 0.35, b: 0.6 }, css: "#F55A99" },
  { id: "red", label: "Red", rgb: { r: 0.9, g: 0.22, b: 0.21 }, css: "#E63836" },
];

export const DEFAULT_ANNOT_COLOR = ANNOT_COLORS[0];
