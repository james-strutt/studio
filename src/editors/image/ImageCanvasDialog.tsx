import { useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import type { ImageDoc } from "@/editors/image/imageModel";

type Mode = "resize" | "canvas" | "crop";

const RATIOS: { label: string; r: number | null }[] = [
  { label: "Free", r: null },
  { label: "1:1", r: 1 },
  { label: "4:3", r: 4 / 3 },
  { label: "3:2", r: 3 / 2 },
  { label: "16:9", r: 16 / 9 },
  { label: "9:16", r: 9 / 16 },
];

export function ImageCanvasDialog({ doc, onClose }: { doc: ImageDoc; onClose: () => void }): JSX.Element {
  const [mode, setMode] = useState<Mode>("resize");
  const [rW, setRW] = useState(doc.width);
  const [cW, setCW] = useState(doc.width);
  const [cH, setCH] = useState(doc.height);
  const [anchor, setAnchor] = useState<"center" | "top-left">("center");
  const [crop, setCrop] = useState({ x: 0, y: 0, w: doc.width, h: doc.height });

  const aspect = doc.width / doc.height;

  const applyRatio = (r: number | null): void => {
    if (r === null) return;
    let w = Math.min(doc.width, doc.height * r);
    let h = w / r;
    if (h > doc.height) {
      h = doc.height;
      w = h * r;
    }
    setCrop({ x: (doc.width - w) / 2, y: (doc.height - h) / 2, w, h });
  };

  const apply = (): void => {
    if (mode === "resize") void dispatch("image.resizeImage", { factor: rW / doc.width });
    else if (mode === "canvas") void dispatch("image.resizeCanvas", { width: cW, height: cH, anchor });
    else void dispatch("image.crop", { x: crop.x, y: crop.y, width: crop.w, height: crop.h });
    onClose();
  };

  return (
    <Modal
      title="Canvas"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Canvas mode">
        <button aria-pressed={mode === "resize"} onClick={() => setMode("resize")}>
          Resize image
        </button>
        <button aria-pressed={mode === "canvas"} onClick={() => setMode("canvas")}>
          Canvas size
        </button>
        <button aria-pressed={mode === "crop"} onClick={() => setMode("crop")}>
          Crop
        </button>
      </div>

      {mode === "resize" && (
        <label className="field">
          <span className="field-label">Width (px) — height scales to keep aspect</span>
          <input
            className="input"
            type="number"
            min={1}
            value={rW}
            onChange={(e) => setRW(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
          <span className="field-hint">
            → {rW} × {Math.round(rW / aspect)} px
          </span>
        </label>
      )}

      {mode === "canvas" && (
        <>
          <div className="pdf-cal-row">
            <label className="field">
              <span className="field-label">Width</span>
              <input className="input" type="number" min={1} value={cW} onChange={(e) => setCW(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
            </label>
            <label className="field">
              <span className="field-label">Height</span>
              <input className="input" type="number" min={1} value={cH} onChange={(e) => setCH(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
            </label>
          </div>
          <div className="seg" role="group" aria-label="Anchor">
            <button aria-pressed={anchor === "center"} onClick={() => setAnchor("center")}>
              Centre
            </button>
            <button aria-pressed={anchor === "top-left"} onClick={() => setAnchor("top-left")}>
              Top-left
            </button>
          </div>
        </>
      )}

      {mode === "crop" && (
        <>
          <div className="img-ratios">
            {RATIOS.map((p) => (
              <button key={p.label} className="btn btn-quiet" onClick={() => applyRatio(p.r)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="pdf-cal-row">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <label key={k} className="field">
                <span className="field-label">{k.toUpperCase()}</span>
                <input
                  className="input"
                  type="number"
                  value={Math.round(crop[k])}
                  onChange={(e) => setCrop((c) => ({ ...c, [k]: Number(e.target.value) || 0 }))}
                />
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
