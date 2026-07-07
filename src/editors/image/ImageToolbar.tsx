import { useState } from "react";
import { dispatch } from "@/commands/history";
import { useImageStore, type ImageTool } from "@/editors/image/useImageStore";
import { ImageCanvasDialog } from "@/editors/image/ImageCanvasDialog";
import { ImageExportDialog } from "@/editors/image/ImageExportDialog";

const TOOLS: { id: ImageTool; label: string; glyph: string }[] = [
  { id: "select", label: "Select / move", glyph: "⌶" },
  { id: "brush", label: "Brush", glyph: "✎" },
  { id: "arrow", label: "Arrow", glyph: "↗" },
  { id: "text", label: "Text", glyph: "T" },
  { id: "badge", label: "Numbered step", glyph: "①" },
  { id: "eyedropper", label: "Eyedropper", glyph: "⚲" },
];

export function ImageToolbar(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const tool = useImageStore((s) => s.tool);
  const brushColor = useImageStore((s) => s.brushColor);
  const brushSize = useImageStore((s) => s.brushSize);
  const setTool = useImageStore((s) => s.setTool);
  const setBrushColor = useImageStore((s) => s.setBrushColor);
  const setBrushSize = useImageStore((s) => s.setBrushSize);
  const selectedId = doc?.selectedId ?? null;
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="img-toolbar">
      <button className="btn btn-quiet" onClick={() => void dispatch("image.addImage", {})}>
        Add image
      </button>
      <button className="btn btn-quiet" onClick={() => void dispatch("image.addShape", { shape: "rect" })}>
        Rectangle
      </button>
      <button
        className="btn btn-quiet"
        onClick={() => void dispatch("image.addShape", { shape: "ellipse" })}
      >
        Ellipse
      </button>
      <span className="pdf-toolbar-sep" aria-hidden="true" />
      <div className="seg" role="group" aria-label="Tool">
        {TOOLS.map((t) => (
          <button key={t.id} aria-pressed={tool === t.id} title={t.label} aria-label={t.label} onClick={() => setTool(t.id)}>
            {t.glyph}
          </button>
        ))}
      </div>
      <input
        type="color"
        className="img-color"
        value={brushColor}
        title="Tool colour"
        onChange={(e) => setBrushColor(e.target.value)}
      />
      <input
        type="range"
        className="img-brush-size"
        min={1}
        max={40}
        value={brushSize}
        title={`Brush size ${brushSize}`}
        onChange={(e) => setBrushSize(Number(e.target.value))}
      />
      {doc && (
        <>
          <span className="pdf-toolbar-sep" aria-hidden="true" />
          <button className="btn btn-ghost" title="Rotate anticlockwise" onClick={() => void dispatch("image.rotateCanvas", { dir: "ccw" })}>
            ⟲
          </button>
          <button className="btn btn-ghost" title="Rotate clockwise" onClick={() => void dispatch("image.rotateCanvas", { dir: "cw" })}>
            ⟳
          </button>
          <button className="btn btn-ghost" title="Flip horizontal" onClick={() => void dispatch("image.flip", { axis: "h" })}>
            ⇋
          </button>
          <button className="btn btn-ghost" title="Flip vertical" onClick={() => void dispatch("image.flip", { axis: "v" })}>
            ⥯
          </button>
          <button className="btn btn-quiet" onClick={() => setCanvasOpen(true)}>
            Canvas…
          </button>
          <button className="btn btn-quiet" onClick={() => setExportOpen(true)}>
            Export…
          </button>
          <span className="img-doc-size">
            {doc.width} × {doc.height}
          </span>
        </>
      )}
      <button
        className="btn btn-danger"
        disabled={!selectedId}
        onClick={() => selectedId && void dispatch("image.removeLayer", { id: selectedId })}
      >
        Delete layer
      </button>
      {doc && canvasOpen && <ImageCanvasDialog doc={doc} onClose={() => setCanvasOpen(false)} />}
      {exportOpen && <ImageExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
