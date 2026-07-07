import { useEffect, useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { useVideoStore } from "@/editors/video/useVideoStore";
import {
  makeClipText,
  type Clip,
  type ClipCrop,
  type ClipText,
  type ClipTransform,
  type PanZoom,
} from "@/editors/video/videoModel";

const FONTS: { label: string; value: string }[] = [
  { label: "Instrument Sans", value: '"Instrument Sans Variable", sans-serif' },
  { label: "Spline Sans Mono", value: '"Spline Sans Mono Variable", monospace' },
  { label: "Georgia", value: "Georgia, serif" },
];

export function ClipTextDialog({ clip, onClose }: { clip: Clip; onClose: () => void }): JSX.Element {
  const [text, setText] = useState<ClipText>(clip.text ?? makeClipText(""));
  const setShowSafeAreas = useVideoStore((s) => s.setShowSafeAreas);

  useEffect(() => {
    setShowSafeAreas(true);
    return () => setShowSafeAreas(false);
  }, [setShowSafeAreas]);

  const patch = (p: Partial<ClipText>): void => setText((t) => ({ ...t, ...p }));

  return (
    <Modal
      title="Title text"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-quiet"
            onClick={() => {
              void dispatch("video.setClipTextStyle", { clipId: clip.id, text: null });
              onClose();
            }}
          >
            Remove text
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              void dispatch("video.setClipTextStyle", { clipId: clip.id, text });
              onClose();
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="vid-form">
        <label className="vid-form-row">
          Text
          <input
            className="input"
            value={text.content}
            autoFocus
            onChange={(e) => patch({ content: e.target.value })}
          />
        </label>
        <label className="vid-form-row">
          Font
          <select
            className="input"
            value={text.font ?? FONTS[0].value}
            onChange={(e) => patch({ font: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="vid-form-row">
          Size
          <input
            className="input"
            type="number"
            min={12}
            max={400}
            value={text.size}
            onChange={(e) => patch({ size: Number(e.target.value) || 64 })}
          />
        </label>
        <label className="vid-form-row">
          Colour
          <input
            type="color"
            value={text.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        <label className="vid-form-row">
          Horizontal
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={text.x}
            onChange={(e) => patch({ x: Number(e.target.value) })}
          />
        </label>
        <label className="vid-form-row">
          Vertical
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={text.y}
            onChange={(e) => patch({ y: Number(e.target.value) })}
          />
        </label>
        <p className="vid-form-hint">
          Safe-area guides are shown on the preview: outer = action safe (90%), inner = title
          safe (80%).
        </p>
      </div>
    </Modal>
  );
}

type PanZoomPreset = "none" | "zoom-in" | "zoom-out" | "pan-lr" | "pan-rl" | "custom";

const PAN_ZOOM_PRESETS: Record<Exclude<PanZoomPreset, "none" | "custom">, PanZoom> = {
  "zoom-in": { fromScale: 1, toScale: 1.12, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  "zoom-out": { fromScale: 1.12, toScale: 1, fromX: 0, fromY: 0, toX: 0, toY: 0 },
  "pan-lr": { fromScale: 1.08, toScale: 1.08, fromX: -0.04, fromY: 0, toX: 0.04, toY: 0 },
  "pan-rl": { fromScale: 1.08, toScale: 1.08, fromX: 0.04, fromY: 0, toX: -0.04, toY: 0 },
};

function presetOf(pz: PanZoom | undefined): PanZoomPreset {
  if (!pz) return "none";
  for (const [key, value] of Object.entries(PAN_ZOOM_PRESETS)) {
    if (JSON.stringify(value) === JSON.stringify(pz)) return key as PanZoomPreset;
  }
  return "custom";
}

const IDENTITY: ClipTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const FULL_CROP: ClipCrop = { x: 0, y: 0, w: 1, h: 1 };

export function ClipMotionDialog({ clip, onClose }: { clip: Clip; onClose: () => void }): JSX.Element {
  const [transform, setTransform] = useState<ClipTransform>(clip.transform ?? IDENTITY);
  const [crop, setCrop] = useState<ClipCrop>(clip.crop ?? FULL_CROP);
  const [preset, setPreset] = useState<PanZoomPreset>(presetOf(clip.panZoom));

  const patchT = (p: Partial<ClipTransform>): void => setTransform((t) => ({ ...t, ...p }));
  const patchC = (p: Partial<ClipCrop>): void => setCrop((c) => ({ ...c, ...p }));

  const apply = (): void => {
    const panZoom =
      preset === "custom"
        ? (clip.panZoom ?? null)
        : preset === "none"
          ? null
          : PAN_ZOOM_PRESETS[preset];
    void dispatch("video.setClipMotion", {
      clipId: clip.id,
      transform: JSON.stringify(transform) === JSON.stringify(IDENTITY) ? null : transform,
      crop: JSON.stringify(crop) === JSON.stringify(FULL_CROP) ? null : crop,
      panZoom,
    });
    onClose();
  };

  const num = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    step = 0.01,
  ): JSX.Element => (
    <label className="vid-form-cell">
      {label}
      <input
        className="input"
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );

  return (
    <Modal
      title="Crop, transform & Ken Burns"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={apply}>
          Apply
        </button>
      }
    >
      <div className="vid-form">
        <span className="vid-form-heading">Transform</span>
        <div className="vid-form-grid">
          {num("X (px)", transform.x, (x) => patchT({ x }), 1)}
          {num("Y (px)", transform.y, (y) => patchT({ y }), 1)}
          {num("Scale", transform.scale, (scale) => patchT({ scale: scale || 1 }))}
          {num("Rotation°", transform.rotation, (rotation) => patchT({ rotation }), 1)}
          {num("Opacity", transform.opacity, (opacity) =>
            patchT({ opacity: Math.max(0, Math.min(1, opacity)) }),
          )}
        </div>
        <span className="vid-form-heading">Crop (fractions of source)</span>
        <div className="vid-form-grid">
          {num("X", crop.x, (x) => patchC({ x }))}
          {num("Y", crop.y, (y) => patchC({ y }))}
          {num("W", crop.w, (w) => patchC({ w: w || 1 }))}
          {num("H", crop.h, (h) => patchC({ h: h || 1 }))}
        </div>
        <span className="vid-form-heading">Ken Burns</span>
        <select
          className="input"
          value={preset}
          onChange={(e) => setPreset(e.target.value as PanZoomPreset)}
        >
          <option value="none">None</option>
          <option value="zoom-in">Slow zoom in</option>
          <option value="zoom-out">Slow zoom out</option>
          <option value="pan-lr">Pan left → right</option>
          <option value="pan-rl">Pan right → left</option>
          {preset === "custom" && <option value="custom">Custom (keep)</option>}
        </select>
      </div>
    </Modal>
  );
}
