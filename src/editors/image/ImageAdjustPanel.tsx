import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";
import { ADJUST_PRESETS, DEFAULT_ADJUST, type LayerAdjust } from "@/editors/image/imageModel";

const SLIDERS: { key: keyof LayerAdjust; label: string; min: number; max: number; step: number }[] = [
  { key: "exposure", label: "Exposure", min: -1, max: 1, step: 0.02 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "Saturation", min: -2, max: 2, step: 0.05 },
  { key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.02 },
  { key: "sharpen", label: "Sharpen", min: 0, max: 1, step: 0.02 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.02 },
];

export function ImageAdjustPanel(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const selected = doc?.layers.find((l) => l.id === doc.selectedId);

  if (!selected) {
    return <div className="img-adjust img-adjust-empty">Select a layer to adjust it.</div>;
  }

  const adjust: LayerAdjust = { ...DEFAULT_ADJUST, ...selected.adjust };
  const set = (patch: Partial<LayerAdjust>): void => {
    void dispatch("image.setLayerProp", {
      id: selected.id,
      patch: { adjust: { ...adjust, ...patch } },
    });
  };

  return (
    <div className="img-adjust">
      <div className="img-adjust-head">Adjustments</div>
      <div className="img-presets">
        {ADJUST_PRESETS.map((p) => (
          <button key={p.name} className="btn btn-quiet" onClick={() => set(p.adjust)}>
            {p.name}
          </button>
        ))}
      </div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="img-adjust-row">
          <span className="img-adjust-label">
            {s.label}
            <span className="img-adjust-val">{adjust[s.key]}</span>
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={adjust[s.key]}
            onChange={(e) => set({ [s.key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
