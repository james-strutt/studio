import { useCallback, useEffect, useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { fixedPosition } from "@/lib/pointer";
import { ANNOT_COLORS, DEFAULT_ANNOT_COLOR } from "@/editors/pdf/annotColors";
import type { MarkupGroup, MarkupSubtype, Rect } from "@/editors/pdf/pdfAnnotations";

const SUBTYPES: { id: MarkupSubtype; label: string; glyph: string }[] = [
  { id: "Highlight", label: "Highlight", glyph: "▮" },
  { id: "Underline", label: "Underline", glyph: "U̲" },
  { id: "StrikeOut", label: "Strikethrough", glyph: "S̶" },
  { id: "Squiggly", label: "Squiggly", glyph: "∿" },
];

/** Map a live text selection to per-page line rects in PDF points. */
function selectionGroups(range: Range): MarkupGroup[] {
  const byPage = new Map<number, Rect[]>();
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width < 1 || rect.height < 1) continue;
    const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const layer = (el as HTMLElement | null)?.closest?.(".pdf-text-layer") as HTMLElement | null;
    if (!layer) continue;
    const pageIndex = Number(layer.dataset.pageIndex);
    const pageHeight = Number(layer.dataset.pageHeight);
    if (!Number.isFinite(pageIndex) || !Number.isFinite(pageHeight) || pageHeight <= 0) continue;
    const lr = layer.getBoundingClientRect();
    const s = lr.height / pageHeight; // preview px per PDF point
    const x0 = (rect.left - lr.left) / s;
    const x1 = (rect.right - lr.left) / s;
    const yTop = pageHeight - (rect.top - lr.top) / s;
    const yBot = pageHeight - (rect.bottom - lr.top) / s;
    const r: Rect = [x0, Math.min(yTop, yBot), x1, Math.max(yTop, yBot)];
    const list = byPage.get(pageIndex);
    if (list) list.push(r);
    else byPage.set(pageIndex, [r]);
  }
  return [...byPage].map(([pageIndex, rects]) => ({ pageIndex, rects }));
}

export function PdfMarkupLayer({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
}): JSX.Element | null {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(DEFAULT_ANNOT_COLOR);
  const groupsRef = useRef<MarkupGroup[]>([]);

  const refresh = useCallback((): void => {
    const sel = window.getSelection();
    const container = scrollRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPos(null);
      return;
    }
    const groups = selectionGroups(range);
    groupsRef.current = groups;
    if (groups.every((g) => g.rects.length === 0)) {
      setPos(null);
      return;
    }
    const b = range.getBoundingClientRect();
    const p = fixedPosition(b.left, b.top);
    setPos({ x: Math.max(8, p.x), y: Math.max(8, p.y - 46) });
  }, [scrollRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    const el = scrollRef.current;
    el?.addEventListener("scroll", refresh, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", refresh);
      el?.removeEventListener("scroll", refresh);
    };
  }, [refresh, scrollRef]);

  const apply = (subtype: MarkupSubtype): void => {
    const groups = groupsRef.current;
    if (!groups.length) return;
    void dispatch("pdf.addMarkup", { groups, subtype, color: color.rgb });
    window.getSelection()?.removeAllRanges();
    setPos(null);
  };

  if (!pos) return null;

  return (
    <div
      className="pdf-markup-toolbar"
      style={{ left: pos.x, top: pos.y }}
      // Keep the text selection alive when interacting with the toolbar.
      onMouseDown={(e) => e.preventDefault()}
    >
      {SUBTYPES.map((s) => (
        <button
          key={s.id}
          className="btn btn-ghost"
          title={s.label}
          aria-label={s.label}
          onClick={() => apply(s.id)}
        >
          {s.glyph}
        </button>
      ))}
      <span className="pdf-markup-sep" aria-hidden="true" />
      {ANNOT_COLORS.map((c) => (
        <button
          key={c.id}
          className={`pdf-swatch${c.id === color.id ? " is-active" : ""}`}
          style={{ background: c.css }}
          title={c.label}
          aria-label={`${c.label} colour`}
          aria-pressed={c.id === color.id}
          onClick={() => setColor(c)}
        />
      ))}
    </div>
  );
}
