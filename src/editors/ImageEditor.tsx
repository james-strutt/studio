import { useEffect } from "react";
import "@/editors/image/image.css";
import { useImageStore } from "@/editors/image/useImageStore";
import { ImageToolbar } from "@/editors/image/ImageToolbar";
import { ImageStage } from "@/editors/image/ImageStage";
import { ImageLayersPanel } from "@/editors/image/ImageLayersPanel";
import { ImageAdjustPanel } from "@/editors/image/ImageAdjustPanel";
import { dispatch } from "@/commands/history";

function importFile(file: File, name = file.name): void {
  if (!file.type.startsWith("image/")) return;
  void file.arrayBuffer().then((buf) =>
    dispatch("image.addImageFile", { bytes: new Uint8Array(buf), name }),
  );
}

export function ImageEditor(): JSX.Element {
  const doc = useImageStore((s) => s.doc);

  // Paste an image from the clipboard while the image editor is active.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) importFile(file, "Pasted image");
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) importFile(file);
  };

  return (
    <div className="editor-fill" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ImageToolbar />
      {doc ? (
        <div className="img-body">
          <ImageStage />
          <div className="img-right">
            <ImageLayersPanel />
            <ImageAdjustPanel />
          </div>
        </div>
      ) : (
        <div className="img-empty">
          <div className="placeholder">
            <span className="kicker">Image editor</span>
            <span className="headline">Add, drop, or paste an image</span>
            <button className="btn btn-primary" onClick={() => void dispatch("image.addImage", {})}>
              Add image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
