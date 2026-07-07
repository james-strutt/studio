import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";

export function ImageToolbar(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const selectedId = doc?.selectedId ?? null;

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
        <span className="img-doc-size">
          {doc.width} × {doc.height}
        </span>
      )}
      <button
        className="btn btn-danger"
        disabled={!selectedId}
        onClick={() => selectedId && void dispatch("image.removeLayer", { id: selectedId })}
      >
        Delete layer
      </button>
    </div>
  );
}
