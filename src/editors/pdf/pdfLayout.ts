import type { PageSize } from "@/editors/pdf/pdfDocument";
import type { ViewMode } from "@/editors/pdf/pdfStore";

export const PAD = 16;
export const GAP = 16;
export const INNER_GAP = 12;

export interface Dim {
  w: number;
  h: number;
}

export interface Row {
  pages: number[];
  dims: Dim[];
  top: number;
  height: number;
  width: number;
}

export interface Layout {
  rows: Row[];
  total: number;
}

export function displayedDim(base: PageSize, scale: number, rotation: number): Dim {
  const w = base.width * scale;
  const h = base.height * scale;
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

/** Group page indices into display rows for the given view mode. */
export function groupRows(numPages: number, viewMode: ViewMode): number[][] {
  const idx = Array.from({ length: numPages }, (_v, i) => i);
  if (viewMode === "single") return idx.map((i) => [i]);
  if (viewMode === "two-up") {
    const rows: number[][] = [];
    for (let i = 0; i < numPages; i += 2) rows.push(idx.slice(i, i + 2));
    return rows;
  }
  // spread: cover page alone, then facing pairs
  const rows: number[][] = [[0]];
  for (let i = 1; i < numPages; i += 2) rows.push(idx.slice(i, i + 2));
  return rows;
}

export function buildLayout(
  pageSizes: PageSize[],
  scale: number,
  rotation: number,
  viewMode: ViewMode,
): Layout {
  const groups = groupRows(pageSizes.length, viewMode);
  const rows: Row[] = [];
  let top = PAD;
  for (const pages of groups) {
    const dims = pages.map((p) => displayedDim(pageSizes[p], scale, rotation));
    const width = dims.reduce((a, d) => a + d.w, 0) + INNER_GAP * (dims.length - 1);
    const height = Math.max(...dims.map((d) => d.h));
    rows.push({ pages, dims, top, height, width });
    top += height + GAP;
  }
  return { rows, total: top - GAP + PAD };
}

/**
 * Scale that fits the widest row's content to the available width, accounting
 * for the fixed inner gap between facing pages.
 */
export function fitWidthScale(
  pageSizes: PageSize[],
  rotation: number,
  viewMode: ViewMode,
  availW: number,
): number {
  const groups = groupRows(pageSizes.length, viewMode);
  let best = Infinity;
  for (const pages of groups) {
    const content = pages.reduce((a, p) => a + displayedDim(pageSizes[p], 1, rotation).w, 0);
    const avail = Math.max(availW - INNER_GAP * (pages.length - 1), 1);
    best = Math.min(best, avail / content);
  }
  return best === Infinity ? 1 : best;
}

/** Scale that fits the row containing the current page fully into the viewport. */
export function fitPageScale(
  pageSizes: PageSize[],
  rotation: number,
  viewMode: ViewMode,
  currentPageIndex: number,
  availW: number,
  availH: number,
): number {
  const groups = groupRows(pageSizes.length, viewMode);
  const row = groups.find((r) => r.includes(currentPageIndex)) ?? groups[0];
  const content = row.reduce((a, p) => a + displayedDim(pageSizes[p], 1, rotation).w, 0);
  const maxH = Math.max(...row.map((p) => displayedDim(pageSizes[p], 1, rotation).h));
  const availWAdj = Math.max(availW - INNER_GAP * (row.length - 1), 1);
  return Math.min(availWAdj / content, availH / maxH);
}
