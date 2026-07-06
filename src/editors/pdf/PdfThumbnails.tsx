import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";
import { PdfPage } from "@/editors/pdf/PdfPage";
import { dispatch } from "@/commands/history";

const THUMB_W = 132;
const LABEL_H = 24;
const GAP = 10;
const OVERSCAN = 3;

function ThumbActions(): JSX.Element {
  return (
    <div className="pdf-thumb-actions">
      <button className="btn btn-ghost" title="Rotate" onClick={() => void dispatch("pdf.rotatePagesCw", {})}>
        ⟳
      </button>
      <button className="btn btn-ghost" title="Duplicate" onClick={() => void dispatch("pdf.duplicateSelected", {})}>
        ⧉
      </button>
      <button className="btn btn-ghost" title="Extract" onClick={() => void dispatch("pdf.extractSelected", {})}>
        ⇱
      </button>
      <button className="btn btn-danger" title="Delete" onClick={() => void dispatch("pdf.deleteSelected", {})}>
        ✕
      </button>
    </div>
  );
}

export function PdfThumbnails({ doc }: { doc: PdfDoc }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 8 });
  const dragFrom = useRef<number | null>(null);
  const jumpTo = usePdfStore((s) => s.jumpTo);
  const selection = usePdfStore((s) => s.selection);
  const toggleSelect = usePdfStore((s) => s.toggleSelect);
  const selectRangeTo = usePdfStore((s) => s.selectRangeTo);

  const layout = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let top = GAP;
    for (const s of doc.pageSizes) {
      const thumbH = THUMB_W * (s.height / s.width);
      offsets.push(top);
      heights.push(thumbH);
      top += thumbH + LABEL_H + GAP;
    }
    return { offsets, heights, total: top };
  }, [doc.pageSizes]);

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight } = el;
    let start = 0;
    let end = 0;
    for (let i = 0; i < layout.offsets.length; i++) {
      if (layout.offsets[i] + layout.heights[i] < scrollTop) start = i + 1;
      if (layout.offsets[i] <= scrollTop + clientHeight) end = i;
    }
    setRange({
      start: Math.max(0, start - OVERSCAN),
      end: Math.min(layout.offsets.length - 1, end + OVERSCAN),
    });
  }, [layout]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  const onThumbClick = (e: React.MouseEvent, i: number): void => {
    if (e.shiftKey) selectRangeTo(i);
    else if (e.ctrlKey || e.metaKey) toggleSelect(i, true);
    else {
      toggleSelect(i, false);
      jumpTo(i + 1);
    }
  };

  const onDrop = (to: number): void => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from !== null && from !== to) void dispatch("pdf.movePage", { from, to });
  };

  const visible: number[] = [];
  for (let i = range.start; i <= Math.min(range.end, layout.offsets.length - 1); i++) visible.push(i);

  return (
    <div className="pdf-thumbs-wrap">
      {selection.length > 0 && (
        <div className="pdf-thumb-bar">
          <span>{selection.length} selected</span>
          <ThumbActions />
        </div>
      )}
      <div className="pdf-thumbs" ref={scrollRef} onScroll={() => requestAnimationFrame(recompute)}>
        <div style={{ position: "relative", height: layout.total }}>
          {visible.map((i) => {
            const selected = selection.includes(i);
            const current = doc.currentPage === i + 1;
            return (
              <div
                key={i}
                className={`pdf-thumb${current ? " is-current" : ""}${selected ? " is-selected" : ""}`}
                style={{ top: layout.offsets[i], height: layout.heights[i] + LABEL_H }}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                draggable
                onDragStart={() => (dragFrom.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onClick={(e) => onThumbClick(e, i)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && jumpTo(i + 1)}
              >
                <div className="pdf-thumb-page" style={{ width: THUMB_W, height: layout.heights[i] }}>
                  <PdfPage doc={doc.doc} pageNumber={i + 1} scale={THUMB_W / doc.pageSizes[i].width} rotation={0} />
                </div>
                <span className="pdf-thumb-label">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
