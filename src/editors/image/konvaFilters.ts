import { Factory } from "konva/lib/Factory";
import { Node, type FilterFunction, type Filter } from "konva/lib/Node";
import { Brighten } from "konva/lib/filters/Brighten";
import { Contrast } from "konva/lib/filters/Contrast";
import { HSL } from "konva/lib/filters/HSL";
import { hasAdjust, type LayerAdjust } from "@/editors/image/imageModel";

// Custom node attributes read by the custom filters below. Distinct names so
// they don't collide with Konva's built-in filter params (brightness/contrast/…).
// addGetterSetter's types only allow known Node keys, so widen for our attrs.
const addAttr = Factory.addGetterSetter as unknown as (
  ctor: typeof Node,
  attr: string,
  def: number,
) => void;
addAttr(Node, "temperatureAmount", 0);
addAttr(Node, "sharpenAmount", 0);
addAttr(Node, "vignetteAmount", 0);

interface FilterNode extends Node {
  temperatureAmount(): number;
  sharpenAmount(): number;
  vignetteAmount(): number;
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Warm/cool: push red up and blue down (or vice versa). amount -1..1. */
export const Temperature: FilterFunction = function (imageData: ImageData) {
  const t = (this as FilterNode).temperatureAmount();
  if (!t) return;
  const d = imageData.data;
  const r = t * 45;
  const b = -t * 45;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + r);
    d[i + 2] = clamp(d[i + 2] + b);
  }
};

/** Radial darkening toward the edges. amount 0..1. */
export const Vignette: FilterFunction = function (imageData: ImageData) {
  const amount = (this as FilterNode).vignetteAmount();
  if (!amount) return;
  const { width, height, data } = imageData;
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.hypot(x - cx, y - cy) / maxD;
      const f = 1 - amount * Math.pow(dist, 2.2);
      const i = (y * width + x) * 4;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
};

/** 3×3 unsharp-style sharpen. amount 0..1. */
export const Sharpen: FilterFunction = function (imageData: ImageData) {
  const k = (this as FilterNode).sharpenAmount();
  if (!k) return;
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const idx = i + c;
        const val =
          src[idx] * (1 + 4 * k) -
          k * (src[idx - 4] + src[idx + 4] + src[idx - width * 4] + src[idx + width * 4]);
        data[idx] = clamp(val);
      }
    }
  }
};

/** The Konva filter chain for a layer's adjustments (empty when all zero). */
export function layerFilters(adjust?: LayerAdjust): Filter[] {
  if (!hasAdjust(adjust)) return [];
  return [Brighten, Contrast, HSL, Temperature, Sharpen, Vignette];
}

/** The Konva node attributes that feed the filter chain. */
export function filterAttrs(adjust: LayerAdjust): Record<string, number> {
  return {
    brightness: adjust.exposure,
    contrast: adjust.contrast,
    saturation: adjust.saturation,
    temperatureAmount: adjust.temperature,
    sharpenAmount: adjust.sharpen,
    vignetteAmount: adjust.vignette,
  };
}
