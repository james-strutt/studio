import { useEffect, useRef, useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { getFileService } from "@/files/fileService";
import { downloadFile } from "@/files/download";
import { useImageStore } from "@/editors/image/useImageStore";
import {
  encodeCanvas,
  scaleCanvas,
  batchProcess,
  LOSSY,
  type ExportFormat,
} from "@/editors/image/imageExport";

const FORMATS: ExportFormat[] = ["png", "jpeg", "webp", "avif"];

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ImageExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const exporter = useImageStore((s) => s.exporter);
  const [mode, setMode] = useState<"single" | "batch">("single");

  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(0.92);
  const [scalePct, setScalePct] = useState(100);
  const [size, setSize] = useState<number | null>(null);
  const [dims, setDims] = useState<[number, number] | null>(null);
  const token = useRef(0);

  // Live filesize preview.
  useEffect(() => {
    if (mode !== "single") return;
    const canvas = exporter?.();
    if (!canvas) return;
    const scaled = scaleCanvas(canvas, scalePct / 100);
    setDims([scaled.width, scaled.height]);
    const mine = ++token.current;
    void encodeCanvas(scaled, format, quality).then((b) => {
      if (mine === token.current) setSize(b ? b.length : null);
    });
  }, [exporter, mode, format, quality, scalePct]);

  const exportSingle = (): void => {
    void dispatch("image.exportImage", { format, quality, scale: scalePct / 100 });
    onClose();
  };

  // Batch state.
  const [bFormat, setBFormat] = useState<ExportFormat>("jpeg");
  const [bQuality, setBQuality] = useState(0.85);
  const [bMaxWidth, setBMaxWidth] = useState(1920);
  const [bRename, setBRename] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const runBatch = async (): Promise<void> => {
    const files = await getFileService().openMultiple({ accept: [".png", ".jpg", ".jpeg", ".webp", ".avif"] });
    if (files.length === 0) return;
    setBusy(true);
    try {
      const out = await batchProcess(
        files.map((f) => ({ name: f.name, bytes: f.data })),
        { format: bFormat, quality: bQuality, maxWidth: bMaxWidth || undefined, rename: bRename || undefined },
      );
      out.forEach((o) => downloadFile(o.name, o.bytes));
      setCount(out.length);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export"
      onClose={onClose}
      footer={
        mode === "single" ? (
          <>
            <span className="field-hint" style={{ marginRight: "auto" }}>
              {dims ? `${dims[0]}×${dims[1]} · ` : ""}
              {size === null ? "—" : human(size)}
            </span>
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={exportSingle}>
              Export
            </button>
          </>
        ) : (
          <>
            <span className="field-hint" style={{ marginRight: "auto" }}>
              {count !== null ? `${count} file${count === 1 ? "" : "s"} exported` : "Pick a folder of images"}
            </span>
            <button className="btn btn-quiet" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void runBatch()}>
              {busy ? "Processing…" : "Choose files & run"}
            </button>
          </>
        )
      }
    >
      <div className="seg" role="group" aria-label="Export mode">
        <button aria-pressed={mode === "single"} onClick={() => setMode("single")}>
          This image
        </button>
        <button aria-pressed={mode === "batch"} onClick={() => setMode("batch")}>
          Batch
        </button>
      </div>

      {mode === "single" ? (
        <>
          <label className="field">
            <span className="field-label">Format</span>
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {LOSSY.includes(format) && (
            <label className="field">
              <span className="field-label">Quality {Math.round(quality * 100)}</span>
              <input type="range" min={0.1} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          )}
          <label className="field">
            <span className="field-label">Scale {scalePct}%</span>
            <input type="range" min={10} max={100} step={5} value={scalePct} onChange={(e) => setScalePct(Number(e.target.value))} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Format</span>
            <select className="input" value={bFormat} onChange={(e) => setBFormat(e.target.value as ExportFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {LOSSY.includes(bFormat) && (
            <label className="field">
              <span className="field-label">Quality {Math.round(bQuality * 100)}</span>
              <input type="range" min={0.1} max={1} step={0.01} value={bQuality} onChange={(e) => setBQuality(Number(e.target.value))} />
            </label>
          )}
          <label className="field">
            <span className="field-label">Max width (px, 0 = keep)</span>
            <input className="input" type="number" min={0} value={bMaxWidth} onChange={(e) => setBMaxWidth(Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span className="field-label">Rename pattern (use {"{n}"} for index)</span>
            <input className="input" placeholder="e.g. export-{n}" value={bRename} onChange={(e) => setBRename(e.target.value)} />
          </label>
        </>
      )}
    </Modal>
  );
}
