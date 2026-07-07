import { useRef } from "react";
import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";
import type { BlendMode, Layer } from "@/editors/image/imageModel";

const BLENDS: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
];

function setProp(id: string, patch: Record<string, unknown>): void {
  void dispatch("image.setLayerProp", { id, patch });
}

export function ImageLayersPanel(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const select = useImageStore((s) => s.select);
  const dragFrom = useRef<number | null>(null);

  if (!doc) return <aside className="img-layers" />;

  // Display front-to-back (top of the visual stack first).
  const display = doc.layers.map((layer, i) => ({ layer, index: i })).reverse();

  const onDrop = (toDisplay: number): void => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null) return;
    // Convert display positions back to model indices.
    const fromModel = doc.layers.length - 1 - from;
    const toModel = doc.layers.length - 1 - toDisplay;
    if (fromModel !== toModel) void dispatch("image.reorderLayer", { from: fromModel, to: toModel });
  };

  return (
    <aside className="img-layers" aria-label="Layers">
      <div className="img-layers-head">Layers</div>
      <div className="img-layers-list">
        {doc.layers.length === 0 && <div className="pdf-panel-empty">No layers yet.</div>}
        {display.map(({ layer }, di) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            selected={doc.selectedId === layer.id}
            onSelect={() => select(layer.id)}
            onDragStart={() => (dragFrom.current = di)}
            onDrop={() => onDrop(di)}
          />
        ))}
      </div>
    </aside>
  );
}

function LayerRow({
  layer,
  selected,
  onSelect,
  onDragStart,
  onDrop,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}): JSX.Element {
  return (
    <div
      className={`img-layer${selected ? " is-selected" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
    >
      <div className="img-layer-top">
        <button
          className="btn btn-ghost"
          title={layer.visible ? "Hide" : "Show"}
          aria-pressed={layer.visible}
          onClick={(e) => {
            e.stopPropagation();
            setProp(layer.id, { visible: !layer.visible });
          }}
        >
          {layer.visible ? "◉" : "◌"}
        </button>
        <span className="img-layer-name">{layer.name}</span>
        <button
          className="btn btn-ghost"
          title={layer.locked ? "Unlock" : "Lock"}
          aria-pressed={layer.locked}
          onClick={(e) => {
            e.stopPropagation();
            setProp(layer.id, { locked: !layer.locked });
          }}
        >
          {layer.locked ? "🔒" : "🔓"}
        </button>
      </div>
      <div className="img-layer-controls" onClick={(e) => e.stopPropagation()}>
        <input
          className="img-opacity"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={(e) => setProp(layer.id, { opacity: Number(e.target.value) })}
          title="Opacity"
        />
        <select
          className="input img-blend"
          value={layer.blend}
          onChange={(e) => setProp(layer.id, { blend: e.target.value })}
          title="Blend mode"
        >
          {BLENDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
