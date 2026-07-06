import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";
import { PdfPage } from "@/editors/pdf/PdfPage";
import {
  buildLayout,
  fitPageScale,
  fitWidthScale,
  INNER_GAP,
  PAD,
} from "@/editors/pdf/pdfLayout";

const OVERSCAN = 1;

function computeScale(doc: PdfDoc, containerW: number, containerH: number): number {
  const availW = Math.max(containerW - PAD * 2, 1);
  const availH = Math.max(containerH - PAD * 2, 1);
  switch (doc.zoomMode) {
    case "fit-width":
      return fitWidthScale(doc.pageSizes, doc.rotation, doc.viewMode, availW);
    case "fit-page":
      return fitPageScale(doc.pageSizes, doc.rotation, doc.viewMode, doc.currentPage - 1, availW, availH);
    case "actual":
      return 1;
    case "custom":
      return doc.customScale;
  }
}

export function PdfViewer({ doc }: { doc: PdfDoc }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [range, setRange] = useState({ start: 0, end: 0 });
  const setEffectiveScale = usePdfStore((s) => s.setEffectiveScale);
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage);
  const scrollTarget = usePdfStore((s) => s.scrollTarget);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // clientWidth/Height are reliable integer layout metrics; contentRect can
    // read stale/zero under a CSS `zoom` ancestor. Measure once synchronously,
    // then keep in sync via the observer.
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => computeScale(doc, size.w, size.h), [doc, size.w, size.h]);

  const layout = useMemo(
    () => buildLayout(doc.pageSizes, scale, doc.rotation, doc.viewMode),
    [doc.pageSizes, scale, doc.rotation, doc.viewMode],
  );

  useEffect(() => {
    setEffectiveScale(doc.id, scale);
  }, [doc.id, scale, setEffectiveScale]);

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight } = el;
    const { rows } = layout;
    let start = 0;
    let end = 0;
    let currentPage = 1;
    const centre = scrollTop + clientHeight / 2;
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i].top;
      const b = t + rows[i].height;
      if (b < scrollTop) start = i + 1;
      if (t <= scrollTop + clientHeight) end = i;
      if (t <= centre) currentPage = rows[i].pages[0] + 1;
    }
    setRange({ start: Math.max(0, start - OVERSCAN), end: Math.min(rows.length - 1, end + OVERSCAN) });
    setCurrentPage(doc.id, currentPage);
  }, [layout, doc.id, setCurrentPage]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, size.h]);

  const onScroll = useCallback(() => {
    requestAnimationFrame(recompute);
  }, [recompute]);

  const lastJump = useRef(0);
  useEffect(() => {
    if (!scrollTarget || scrollTarget.nonce === lastJump.current) return;
    lastJump.current = scrollTarget.nonce;
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.min(Math.max(scrollTarget.page, 1), doc.numPages) - 1;
    const row = layout.rows.find((r) => r.pages.includes(idx));
    if (row) el.scrollTo({ top: row.top - PAD });
  }, [scrollTarget, layout.rows, doc.numPages]);

  const scrollToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.min(Math.max(page, 1), doc.numPages) - 1;
      const row = layout.rows.find((r) => r.pages.includes(idx));
      if (row) el.scrollTo({ top: row.top - PAD });
    },
    [layout.rows, doc.numPages],
  );

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
      e.preventDefault();
      scrollToPage(doc.currentPage + (doc.viewMode === "single" ? 1 : 2));
    } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
      e.preventDefault();
      scrollToPage(doc.currentPage - (doc.viewMode === "single" ? 1 : 2));
    } else if (e.key === "Home") {
      e.preventDefault();
      scrollToPage(1);
    } else if (e.key === "End") {
      e.preventDefault();
      scrollToPage(doc.numPages);
    }
  };

  const rows: number[] = [];
  const lastRow = layout.rows.length - 1;
  for (let i = Math.max(0, range.start); i <= Math.min(range.end, lastRow); i++) rows.push(i);

  return (
    <div
      ref={scrollRef}
      className={`pdf-scroll${doc.darkPage ? " pdf-dark" : ""}`}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      aria-label={`${doc.name}, ${doc.numPages} pages`}
    >
      <div className="pdf-canvas-area" style={{ height: layout.total }}>
        {rows.map((ri) => {
          const row = layout.rows[ri];
          return (
            <div
              key={ri}
              className="pdf-row"
              style={{ top: row.top, height: row.height, gap: INNER_GAP }}
            >
              {row.pages.map((p, ci) => (
                <div
                  key={p}
                  className="pdf-page-slot"
                  style={{ width: row.dims[ci].w, height: row.dims[ci].h }}
                >
                  <PdfPage doc={doc.doc} pageNumber={p + 1} scale={scale} rotation={doc.rotation} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
