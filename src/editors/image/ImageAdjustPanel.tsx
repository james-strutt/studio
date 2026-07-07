import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";
import { ADJUST_PRESETS, DEFAULT_ADJUST, type Layer, type LayerAdjust } from "@/editors/image/imageModel";

const FONTS: { label: string; value: string }[] = [
  { label: "Sans", value: "Instrument Sans Variable, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Mono", value: "Spline Sans Mono Variable, monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times", value: "Times New Roman, serif" },
];

function LayerProps({ layer }: { layer: Layer }): JSX.Element | null {
  const set = (patch: Record<string, unknown>): void =>
    void dispatch("image.setLayerProp", { id: layer.id, patch });

  if (layer.type === "text") {
    return (
      <div className="img-props">
        <label className="img-adjust-row">
          <span className="img-adjust-label">Font</span>
          <select className="input" value={layer.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="img-prop-row">
          <input className="input" type="number" min={4} value={layer.fontSize} title="Font size" onChange={(e) => set({ fontSize: Number(e.target.value) || 12 })} />
          <input type="color" className="img-color" value={layer.fill} title="Text colour" onChange={(e) => set({ fill: e.target.value })} />
        </div>
      </div>
    );
  }
  if (layer.type === "shape") {
    return (
      <div className="img-prop-row">
        <input type="color" className="img-color" value={layer.fill} title="Fill" onChange={(e) => set({ fill: e.target.value })} />
        <input type="color" className="img-color" value={layer.stroke} title="Stroke" onChange={(e) => set({ stroke: e.target.value })} />
        <input className="input" type="number" min={0} value={layer.strokeWidth} title="Stroke width" onChange={(e) => set({ strokeWidth: Number(e.target.value) || 0 })} />
      </div>
    );
  }
  if (layer.type === "draw" || layer.type === "arrow") {
    return (
      <div className="img-prop-row">
        <input type="color" className="img-color" value={layer.stroke} title="Colour" onChange={(e) => set({ stroke: e.target.value })} />
        <input className="input" type="number" min={1} value={layer.strokeWidth} title="Width" onChange={(e) => set({ strokeWidth: Number(e.target.value) || 1 })} />
      </div>
    );
  }
  if (layer.type === "badge") {
    return (
      <div className="img-prop-row">
        <input type="color" className="img-color" value={layer.fill} title="Colour" onChange={(e) => set({ fill: e.target.value })} />
      </div>
    );
  }
  return null;
}

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
      <LayerProps layer={selected} />
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
