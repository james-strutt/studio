import { useEffect, useState } from "react";
import type { VideoCodec } from "mediabunny";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { estimateSize, pickCodec } from "@/editors/video/engine/exporter";
import { EXPORT_PRESETS, resolveExportOptions } from "@/editors/video/videoCommands";

const CODEC_LABELS: Record<string, string> = { avc: "H.264", vp9: "VP9", av1: "AV1" };

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function VideoExportDialog({ onClose }: { onClose: () => void }): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  const exportStatus = useVideoStore((s) => s.exportStatus);
  const [preset, setPreset] = useState("1080p");
  const [codec, setCodec] = useState<VideoCodec | "">("");
  const [codecs, setCodecs] = useState<VideoCodec[]>([]);

  useEffect(() => {
    if (!project) return;
    const p = EXPORT_PRESETS[preset];
    let live = true;
    void pickCodec(p.width || project.width, p.height || project.height).then((usable) => {
      if (!live) return;
      setCodecs(usable);
      setCodec((c) => (c && usable.includes(c) ? c : (usable[0] ?? "")));
    });
    return () => {
      live = false;
    };
  }, [preset, project]);

  if (!project) return null;
  const opts = resolveExportOptions(preset, (codec || "avc") as VideoCodec, project);

  return (
    <Modal
      title="Export video"
      onClose={onClose}
      footer={
        exportStatus ? (
          <button className="btn btn-quiet" onClick={() => exportStatus.cancel()}>
            Cancel export
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!codec}
            onClick={() => void dispatch("video.export", { preset, codec: codec || undefined })}
          >
            Export MP4
          </button>
        )
      }
    >
      <div className="vid-form">
        <label className="vid-form-row">
          Preset
          <select
            className="input"
            value={preset}
            disabled={Boolean(exportStatus)}
            onChange={(e) => setPreset(e.target.value)}
          >
            {Object.entries(EXPORT_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="vid-form-row">
          Codec
          <select
            className="input"
            value={codec}
            disabled={Boolean(exportStatus)}
            onChange={(e) => setCodec(e.target.value as VideoCodec)}
          >
            {codecs.map((c) => (
              <option key={c} value={c}>
                {CODEC_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <p className="vid-form-hint">
          {opts.width}×{opts.height} · {project.fps} fps · estimated{" "}
          {formatBytes(estimateSize(project, opts))}
        </p>
        {exportStatus && (
          <div className="vid-export-progress">
            <div
              className="vid-export-progress-fill"
              style={{ width: `${Math.round(exportStatus.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
