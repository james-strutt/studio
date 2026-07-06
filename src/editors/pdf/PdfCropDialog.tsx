import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";
import { cropRectToPdfBox } from "@/editors/pdf/cropMath";

const MAX_W = 480;
const MAX_H = 560;
const MIN = 16; // smallest crop side, in preview px

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = "nw" | "ne" | "sw" | "se";
interface Drag {
  mode: "move" | "draw" | Corner;
  startX: number;
  startY: number;
  start: Rect;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

export function PdfCropDialog({ doc, onClose }: { doc: PdfDoc; onClose: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const selection = usePdfStore((s) => s.selection);

  const pageNumber = Math.min(Math.max(doc.currentPage, 1), doc.numPages);
  const base = doc.pageSizes[pageNumber - 1];

  const { scale, imgW, imgH } = useMemo(() => {
    const s = Math.min(MAX_W / base.width, MAX_H / base.height);
    return { scale: s, imgW: Math.floor(base.width * s), imgH: Math.floor(base.height * s) };
  }, [base.width, base.height]);

  const [rect, setRect] = useState<Rect>(() => ({
    x: imgW * 0.08,
    y: imgH * 0.08,
    w: imgW * 0.84,
    h: imgH * 0.84,
  }));

  // Render the page preview.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const page = await doc.doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale, rotation: 0 });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      task = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        /* cancelled */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc.doc, pageNumber, scale]);

  // Pointer drag: move / draw / corner-resize.
  useEffect(() => {
    const point = (e: PointerEvent): { x: number; y: number } => {
      const rc = containerRef.current?.getBoundingClientRect();
      if (!rc) return { x: 0, y: 0 };
      return { x: clamp(e.clientX - rc.left, 0, imgW), y: clamp(e.clientY - rc.top, 0, imgH) };
    };
    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      const { x, y } = point(e);
      const s = d.start;
      if (d.mode === "move") {
        setRect({
          x: clamp(s.x + (x - d.startX), 0, imgW - s.w),
          y: clamp(s.y + (y - d.startY), 0, imgH - s.h),
          w: s.w,
          h: s.h,
        });
      } else if (d.mode === "draw") {
        setRect({
          x: Math.min(d.startX, x),
          y: Math.min(d.startY, y),
          w: Math.abs(x - d.startX),
          h: Math.abs(y - d.startY),
        });
      } else {
        const left = s.x;
        const top = s.y;
        const right = s.x + s.w;
        const bottom = s.y + s.h;
        const west = d.mode === "nw" || d.mode === "sw";
        const north = d.mode === "nw" || d.mode === "ne";
        const nl = west ? clamp(x, 0, right - MIN) : left;
        const nr = west ? right : clamp(x, left + MIN, imgW);
        const nt = north ? clamp(y, 0, bottom - MIN) : top;
        const nb = north ? bottom : clamp(y, top + MIN, imgH);
        setRect({ x: nl, y: nt, w: nr - nl, h: nb - nt });
      }
    };
    const onUp = (): void => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [imgW, imgH]);

  const startDrag = (mode: Drag["mode"]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rc = containerRef.current?.getBoundingClientRect();
    const px = rc ? clamp(e.clientX - rc.left, 0, imgW) : 0;
    const py = rc ? clamp(e.clientY - rc.top, 0, imgH) : 0;
    dragRef.current = { mode, startX: px, startY: py, start: { ...rect } };
    if (mode === "draw") setRect({ x: px, y: py, w: 0, h: 0 });
  };

  const applySelected = selection.length > 1;
  const targetCount = applySelected ? selection.length : 1;

  // Convert the preview rect (px, top-left origin) to PDF points (bottom-left).
  const toBox = (): { x: number; y: number; width: number; height: number } =>
    cropRectToPdfBox(rect, scale, base.height);

  const apply = (): void => {
    const pages = applySelected ? [...selection] : [pageNumber - 1];
    void dispatch("pdf.cropPages", { box: toBox(), pages });
    onClose();
  };

  const reset = (): void => setRect({ x: 0, y: 0, w: imgW, h: imgH });

  const box = toBox();
  const valid = rect.w >= MIN && rect.h >= MIN;
  const corners: Corner[] = ["nw", "ne", "sw", "se"];

  return (
    <Modal
      title={`Crop page ${pageNumber}`}
      onClose={onClose}
      footer={
        <>
          <span className="field-hint" style={{ marginRight: "auto" }}>
            {Math.round(box.width)} × {Math.round(box.height)} pt · {targetCount} page
            {targetCount === 1 ? "" : "s"}
          </span>
          <button className="btn btn-quiet" onClick={reset}>
            Reset
          </button>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={apply}>
            Apply crop
          </button>
        </>
      }
    >
      <div
        className="crop-stage"
        ref={containerRef}
        style={{ width: imgW, height: imgH }}
        onPointerDown={startDrag("draw")}
      >
        <canvas ref={canvasRef} className="crop-canvas" />
        <div
          className="crop-rect"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          onPointerDown={startDrag("move")}
        >
          {corners.map((c) => (
            <span
              key={c}
              className={`crop-handle crop-${c}`}
              onPointerDown={startDrag(c)}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
      {applySelected ? (
        <span className="field-hint">Crop applies to all {selection.length} selected pages.</span>
      ) : (
        <span className="field-hint">Drag to draw a crop region, or move and resize the box.</span>
      )}
    </Modal>
  );
}
