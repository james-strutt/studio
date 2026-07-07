import { useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { usePdfStore, type AnnotTool } from "@/editors/pdf/pdfStore";
import { ANNOT_COLORS, DEFAULT_ANNOT_COLOR } from "@/editors/pdf/annotColors";

interface Pt {
  x: number;
  y: number;
}

const DRAG_TOOLS: AnnotTool[] = ["ink", "rect", "ellipse", "line", "arrow", "text"];

export function PdfDrawOverlay({
  pageIndex,
  scale,
  pageHeightPts,
}: {
  pageIndex: number;
  scale: number;
  pageHeightPts: number;
}): JSX.Element {
  const tool = usePdfStore((s) => s.annotTool);
  const colorId = usePdfStore((s) => s.annotColorId);
  const widthPt = usePdfStore((s) => s.annotWidth);
  const fillOn = usePdfStore((s) => s.annotFill);
  const color = ANNOT_COLORS.find((c) => c.id === colorId) ?? DEFAULT_ANNOT_COLOR;

  const ref = useRef<HTMLDivElement>(null);
  const inkRef = useRef<Pt[]>([]);
  const [drag, setDrag] = useState<{ start: Pt; cur: Pt } | null>(null);
  const [ink, setInk] = useState<Pt[]>([]);
  const [verts, setVerts] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [popup, setPopup] = useState<{ kind: "note" | "text"; box: number[] } | null>(null);
  const [text, setText] = useState("");

  const rgb = color.rgb;
  const strokePx = Math.max(1, widthPt * scale);
  const local = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toX = (x: number): number => x / scale;
  const toY = (y: number): number => pageHeightPts - y / scale;

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!DRAG_TOOLS.includes(tool)) return;
    const p = local(e);
    ref.current?.setPointerCapture(e.pointerId);
    if (tool === "ink") {
      inkRef.current = [p];
      setInk([p]);
    }
    setDrag({ start: p, cur: p });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = local(e);
    if (tool === "polygon") {
      setCursor(p);
      return;
    }
    if (!drag) return;
    if (tool === "ink") {
      inkRef.current.push(p);
      setInk([...inkRef.current]);
    }
    setDrag((d) => (d ? { ...d, cur: p } : d));
  };

  const onPointerUp = (): void => {
    if (tool === "ink") {
      const pts = inkRef.current;
      inkRef.current = [];
      setInk([]);
      setDrag(null);
      if (pts.length >= 2) {
        const flat = pts.flatMap((q) => [toX(q.x), toY(q.y)]);
        void dispatch("pdf.addInk", { pageIndex, paths: [flat], color: rgb, width: widthPt });
      }
      return;
    }
    if (!drag) return;
    const { start: a, cur: b } = drag;
    setDrag(null);
    const nx0 = Math.min(a.x, b.x);
    const nx1 = Math.max(a.x, b.x);
    const ny0 = Math.min(a.y, b.y);
    const ny1 = Math.max(a.y, b.y);
    if (tool === "rect" || tool === "ellipse") {
      if (nx1 - nx0 < 3 || ny1 - ny0 < 3) return;
      const rect = [toX(nx0), toY(ny1), toX(nx1), toY(ny0)];
      void dispatch("pdf.addShape", {
        pageIndex,
        kind: tool === "rect" ? "Square" : "Circle",
        rect,
        color: rgb,
        width: widthPt,
        fill: fillOn ? rgb : null,
      });
    } else if (tool === "line" || tool === "arrow") {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 3) return;
      const p = [toX(a.x), toY(a.y), toX(b.x), toY(b.y)];
      void dispatch("pdf.addLine", {
        pageIndex,
        p,
        color: rgb,
        width: widthPt,
        arrow: tool === "arrow",
      });
    } else if (tool === "text") {
      const box =
        nx1 - nx0 < 12 || ny1 - ny0 < 12 ? [nx0, ny0, nx0 + 160, ny0 + 60] : [nx0, ny0, nx1, ny1];
      setText("");
      setPopup({ kind: "text", box });
    }
  };

  const onClick = (e: React.MouseEvent): void => {
    if (tool === "note") {
      const p = local(e);
      setText("");
      setPopup({ kind: "note", box: [p.x, p.y] });
    } else if (tool === "polygon") {
      setVerts((v) => [...v, local(e)]);
    }
  };

  const closePolygon = (): void => {
    if (verts.length >= 3) {
      const flat = verts.flatMap((q) => [toX(q.x), toY(q.y)]);
      void dispatch("pdf.addPolygon", {
        pageIndex,
        vertices: flat,
        color: rgb,
        width: widthPt,
        fill: fillOn ? rgb : null,
      });
    }
    setVerts([]);
    setCursor(null);
  };

  const submitPopup = (): void => {
    if (!popup) return;
    if (popup.kind === "note") {
      const [x, y] = popup.box;
      void dispatch("pdf.addNote", {
        pageIndex,
        x: toX(x),
        y: toY(y),
        contents: text,
        color: rgb,
      });
    } else {
      const [x0, y0, x1, y1] = popup.box;
      void dispatch("pdf.addTextBox", {
        pageIndex,
        rect: [toX(x0), toY(y1), toX(x1), toY(y0)],
        contents: text || " ",
        color: rgb,
        fontSize: 14,
      });
    }
    setPopup(null);
    setText("");
  };

  // In-progress preview geometry.
  const previews: JSX.Element[] = [];
  if (drag && (tool === "rect" || tool === "ellipse" || tool === "text")) {
    const x = Math.min(drag.start.x, drag.cur.x);
    const y = Math.min(drag.start.y, drag.cur.y);
    const w = Math.abs(drag.cur.x - drag.start.x);
    const h = Math.abs(drag.cur.y - drag.start.y);
    previews.push(
      tool === "ellipse" ? (
        <ellipse key="p" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
      ) : (
        <rect key="p" x={x} y={y} width={w} height={h} strokeDasharray={tool === "text" ? "4 3" : undefined} />
      ),
    );
  }
  if (drag && (tool === "line" || tool === "arrow")) {
    previews.push(
      <line key="p" x1={drag.start.x} y1={drag.start.y} x2={drag.cur.x} y2={drag.cur.y} />,
    );
  }
  if (ink.length > 1) {
    previews.push(<polyline key="ink" points={ink.map((p) => `${p.x},${p.y}`).join(" ")} />);
  }
  if (verts.length > 0) {
    const pts = [...verts, ...(cursor ? [cursor] : [])];
    previews.push(<polyline key="poly" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />);
  }

  return (
    <div
      ref={ref}
      className="pdf-draw-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onDoubleClick={tool === "polygon" ? closePolygon : undefined}
    >
      <svg
        className="pdf-draw-svg"
        style={{ stroke: color.css, strokeWidth: strokePx, fill: fillOn ? color.css : "none" }}
      >
        {previews}
      </svg>
      {popup && (
        <div
          className="pdf-annot-popup"
          style={{ left: popup.box[0], top: popup.box[1] }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className="input"
            autoFocus
            rows={3}
            placeholder={popup.kind === "note" ? "Note…" : "Text…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="pdf-annot-popup-actions">
            <button className="btn btn-quiet" onClick={() => setPopup(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submitPopup}>
              Add
            </button>
          </div>
        </div>
      )}
      {tool === "polygon" && verts.length >= 3 && (
        <button
          className="btn btn-primary pdf-poly-finish"
          onClick={closePolygon}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Finish polygon
        </button>
      )}
    </div>
  );
}
