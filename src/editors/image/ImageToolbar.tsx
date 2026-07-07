import { useState } from "react";
import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";
import { ImageCanvasDialog } from "@/editors/image/ImageCanvasDialog";

export function ImageToolbar(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const selectedId = doc?.selectedId ?? null;
  const [canvasOpen, setCanvasOpen] = useState(false);

  return (
    <div className="img-toolbar">
      <button className="btn btn-quiet" onClick={() => void dispatch("image.addImage", {})}>
        Add image
      </button>
      <button className="btn btn-quiet" onClick={() => void dispatch("image.addText", { text: "Text" })}>
        Text
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
    </div>
  );
}
