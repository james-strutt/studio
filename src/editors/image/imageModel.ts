export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "difference"
  | "exclusion";

export type LayerType = "raster" | "text" | "shape";

interface BaseLayer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blend: BlendMode;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface RasterLayer extends BaseLayer {
  type: "raster";
  src: string; // object URL or data URL
  width: number;
  height: number;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "ellipse";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type Layer = RasterLayer | TextLayer | ShapeLayer;

export interface ImageDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: Layer[]; // index 0 = bottom of the stack
  selectedId: string | null;
}

/** Map a blend mode to its canvas globalCompositeOperation. */
export function blendToComposite(blend: BlendMode): string {
  return blend === "normal" ? "source-over" : blend;
}

const baseDefaults = (): Omit<BaseLayer, "id" | "type" | "name"> => ({
  visible: true,
  locked: false,
  opacity: 1,
  blend: "normal",
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
});

let counter = 0;
function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function rasterLayer(src: string, width: number, height: number, name = "Image"): RasterLayer {
  return { ...baseDefaults(), id: makeId("raster"), type: "raster", name, src, width, height };
}

export function textLayer(text: string, x = 40, y = 40): TextLayer {
  return {
    ...baseDefaults(),
    id: makeId("text"),
    type: "text",
    name: text.slice(0, 20) || "Text",
    x,
    y,
    text,
    fontSize: 48,
    fontFamily: "Instrument Sans Variable, sans-serif",
    fill: "#111111",
  };
}

export function shapeLayer(shape: "rect" | "ellipse", x = 40, y = 40): ShapeLayer {
  return {
    ...baseDefaults(),
    id: makeId("shape"),
    type: "shape",
    name: shape === "rect" ? "Rectangle" : "Ellipse",
    x,
    y,
    shape,
    width: 200,
    height: 140,
    fill: "#B45309",
    stroke: "#111111",
    strokeWidth: 0,
  };
}

/** Reorder a layer from one index to another (immutably). */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}
