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

export type LayerType = "raster" | "text" | "shape" | "draw" | "arrow" | "badge";

/** Non-destructive per-layer adjustment amounts (native filter param ranges). */
export interface LayerAdjust {
  exposure: number; // Brighten brightness, -1..1
  contrast: number; // Contrast, -100..100
  saturation: number; // HSL saturation, -2..2
  temperature: number; // custom warm/cool, -1..1
  sharpen: number; // custom, 0..1
  vignette: number; // custom, 0..1
}

export const DEFAULT_ADJUST: LayerAdjust = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  sharpen: 0,
  vignette: 0,
};

export function hasAdjust(a?: LayerAdjust): boolean {
  return !!a && Object.values(a).some((v) => v !== 0);
}

/** One-click filter looks built from adjustment presets. */
export const ADJUST_PRESETS: { name: string; adjust: LayerAdjust }[] = [
  { name: "Reset", adjust: DEFAULT_ADJUST },
  { name: "Vivid", adjust: { ...DEFAULT_ADJUST, contrast: 22, saturation: 0.6 } },
  { name: "B&W", adjust: { ...DEFAULT_ADJUST, saturation: -2, contrast: 12 } },
  { name: "Warm", adjust: { ...DEFAULT_ADJUST, temperature: 0.4, exposure: 0.05 } },
  { name: "Cool", adjust: { ...DEFAULT_ADJUST, temperature: -0.4 } },
  { name: "Fade", adjust: { ...DEFAULT_ADJUST, contrast: -16, exposure: 0.08, saturation: -0.4, vignette: 0.2 } },
];

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
  adjust?: LayerAdjust;
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

export interface DrawLayer extends BaseLayer {
  type: "draw";
  points: number[]; // [x,y,x,y,…] in doc space
  stroke: string;
  strokeWidth: number;
}

export interface ArrowLayer extends BaseLayer {
  type: "arrow";
  points: [number, number, number, number]; // x1,y1,x2,y2
  stroke: string;
  strokeWidth: number;
}

export interface BadgeLayer extends BaseLayer {
  type: "badge";
  number: number;
  radius: number;
  fill: string;
}

export type Layer = RasterLayer | TextLayer | ShapeLayer | DrawLayer | ArrowLayer | BadgeLayer;

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

export function drawLayer(points: number[], stroke: string, strokeWidth: number): DrawLayer {
  return { ...baseDefaults(), id: makeId("draw"), type: "draw", name: "Brush", points, stroke, strokeWidth };
}

export function arrowLayer(
  points: [number, number, number, number],
  stroke: string,
  strokeWidth: number,
): ArrowLayer {
  return { ...baseDefaults(), id: makeId("arrow"), type: "arrow", name: "Arrow", points, stroke, strokeWidth };
}

export function badgeLayer(number: number, x: number, y: number, fill = "#B45309"): BadgeLayer {
  return { ...baseDefaults(), id: makeId("badge"), type: "badge", name: `Step ${number}`, x, y, number, radius: 18, fill };
}

/** Reorder a layer from one index to another (immutably). */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/* ---- document transforms (P2.2), all pure ---- */

/** Crop the canvas to (x,y,w,h); layers shift by (-x,-y) so content stays put. */
export function cropDoc(doc: ImageDoc, x: number, y: number, w: number, h: number): ImageDoc {
  return {
    ...doc,
    width: Math.round(w),
    height: Math.round(h),
    layers: doc.layers.map((l) => ({ ...l, x: l.x - x, y: l.y - y })),
  };
}

/** Change canvas dimensions without scaling content; anchor centres or keeps top-left. */
export function resizeCanvas(
  doc: ImageDoc,
  width: number,
  height: number,
  anchor: "top-left" | "center" = "top-left",
): ImageDoc {
  const dx = anchor === "center" ? (width - doc.width) / 2 : 0;
  const dy = anchor === "center" ? (height - doc.height) / 2 : 0;
  return {
    ...doc,
    width: Math.round(width),
    height: Math.round(height),
    layers: doc.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })),
  };
}

/** Scale the whole image (content + canvas) by a factor. */
export function resizeImage(doc: ImageDoc, factor: number): ImageDoc {
  return {
    ...doc,
    width: Math.round(doc.width * factor),
    height: Math.round(doc.height * factor),
    layers: doc.layers.map((l) => ({
      ...l,
      x: l.x * factor,
      y: l.y * factor,
      scaleX: l.scaleX * factor,
      scaleY: l.scaleY * factor,
    })),
  };
}

/** Mirror the canvas; each layer mirrors around its origin (negated scale) + reposition. */
export function flipCanvas(doc: ImageDoc, axis: "h" | "v"): ImageDoc {
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      axis === "h"
        ? { ...l, x: doc.width - l.x, scaleX: -l.scaleX }
        : { ...l, y: doc.height - l.y, scaleY: -l.scaleY },
    ),
  };
}

/** Rotate the canvas 90° (dims swap); each layer's origin maps and rotation shifts ±90°. */
export function rotateCanvas(doc: ImageDoc, dir: "cw" | "ccw"): ImageDoc {
  const { width: W, height: H } = doc;
  return {
    ...doc,
    width: H,
    height: W,
    layers: doc.layers.map((l) =>
      dir === "cw"
        ? { ...l, x: H - l.y, y: l.x, rotation: l.rotation + 90 }
        : { ...l, x: l.y, y: W - l.x, rotation: l.rotation - 90 },
    ),
  };
}
