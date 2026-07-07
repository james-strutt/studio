import "@/editors/image/image.css";
import { useImageStore } from "@/editors/image/useImageStore";
import { ImageToolbar } from "@/editors/image/ImageToolbar";
import { ImageStage } from "@/editors/image/ImageStage";
import { ImageLayersPanel } from "@/editors/image/ImageLayersPanel";
import { dispatch } from "@/commands/history";

export function ImageEditor(): JSX.Element {
  const doc = useImageStore((s) => s.doc);

  return (
    <div className="editor-fill">
      <ImageToolbar />
      {doc ? (
        <div className="img-body">
          <ImageStage />
          <ImageLayersPanel />
        </div>
      ) : (
        <div className="img-empty">
          <div className="placeholder">
            <span className="kicker">Image editor</span>
            <span className="headline">Add an image or start from a shape</span>
            <button className="btn btn-primary" onClick={() => void dispatch("image.addImage", {})}>
              Add image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
