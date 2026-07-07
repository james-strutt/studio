import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Text, Rect, Shape, Transformer } from "react-konva";
import type Konva from "konva";
import { dispatch } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";
import {
  blendToComposite,
  hasAdjust,
  type Layer,
  type RasterLayer,
  type TextLayer,
  type ShapeLayer,
} from "@/editors/image/imageModel";
import { layerFilters, filterAttrs } from "@/editors/image/konvaFilters";
import { useHtmlImage } from "@/editors/image/useHtmlImage";

type Register = (node: Konva.Node | null) => void;

const adjustKey = (l: Layer): string => (l.adjust ? Object.values(l.adjust).join(",") : "");

/** A ref callback that also registers with the transformer and (re)caches for filters. */
function useCachedRef(register: Register, shouldCache: boolean, cacheKey: string): Register {
  const ref = useRef<Konva.Node | null>(null);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    if (shouldCache) n.cache();
    else n.clearCache();
    n.getLayer()?.batchDraw();
  }, [shouldCache, cacheKey]);
  return (n) => {
    ref.current = n;
    register(n);
  };
}

function commonProps(layer: Layer): Record<string, unknown> {
  const adjust = layer.adjust;
  const filterProps = hasAdjust(adjust)
    ? { filters: layerFilters(adjust), ...filterAttrs(adjust!) }
    : {};
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    opacity: layer.opacity,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    visible: layer.visible,
    globalCompositeOperation: blendToComposite(layer.blend) as GlobalCompositeOperation,
    draggable: !layer.locked,
    listening: !layer.locked,
    onMouseDown: () => useImageStore.getState().select(layer.id),
    onTap: () => useImageStore.getState().select(layer.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      dispatch("image.setLayerProp", { id: layer.id, patch: { x: e.target.x(), y: e.target.y() } }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      void dispatch("image.setLayerProp", {
        id: layer.id,
        patch: {
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          scaleX: n.scaleX(),
          scaleY: n.scaleY(),
        },
      });
    },
    ...filterProps,
  };
}

function RasterNode({ layer, register }: { layer: RasterLayer; register: Register }): JSX.Element {
  const img = useHtmlImage(layer.src);
  const ready = !!img;
  const setRef = useCachedRef(
    register,
    hasAdjust(layer.adjust) && ready,
    `${adjustKey(layer)}|${layer.width}x${layer.height}|${ready}`,
  );
  return <KonvaImage ref={setRef} {...commonProps(layer)} image={img} width={layer.width} height={layer.height} />;
}

function TextNode({ layer, register }: { layer: TextLayer; register: Register }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), `${adjustKey(layer)}|${layer.text}|${layer.fontSize}`);
  return (
    <Text
      ref={setRef}
      {...commonProps(layer)}
      text={layer.text}
      fontSize={layer.fontSize}
      fontFamily={layer.fontFamily}
      fill={layer.fill}
    />
  );
}

function ShapeNode({ layer, register }: { layer: ShapeLayer; register: Register }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), `${adjustKey(layer)}|${layer.width}x${layer.height}`);
  const stroke = layer.strokeWidth > 0 ? layer.stroke : undefined;
  if (layer.shape === "rect") {
    return (
      <Rect ref={setRef} {...commonProps(layer)} width={layer.width} height={layer.height} fill={layer.fill} stroke={stroke} strokeWidth={layer.strokeWidth} />
    );
  }
  return (
    <Shape
      ref={setRef}
      {...commonProps(layer)}
      width={layer.width}
      height={layer.height}
      fill={layer.fill}
      stroke={stroke}
      strokeWidth={layer.strokeWidth}
      sceneFunc={(ctx, shape) => {
        const w = layer.width;
        const h = layer.height;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

function LayerNode({ layer, register }: { layer: Layer; register: Register }): JSX.Element {
  if (layer.type === "raster") return <RasterNode layer={layer} register={register} />;
  if (layer.type === "text") return <TextNode layer={layer} register={register} />;
  return <ShapeNode layer={layer} register={register} />;
}

export function ImageStage(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedId = doc?.selectedId ?? null;
  const layers = doc?.layers;
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current.get(selectedId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers]);

  if (!doc) return <div className="img-stage-wrap" ref={wrapRef} />;

  const pad = 48;
  const scale = Math.min((size.w - pad) / doc.width, (size.h - pad) / doc.height, 4) || 1;
  const offsetX = (size.w - doc.width * scale) / 2;
  const offsetY = (size.h - doc.height * scale) / 2;

  return (
    <div className="img-stage-wrap" ref={wrapRef}>
      <Stage
        width={size.w}
        height={size.h}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) useImageStore.getState().select(null);
        }}
      >
        <KonvaLayer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
          <Rect x={0} y={0} width={doc.width} height={doc.height} fill="#ffffff" shadowBlur={12} shadowOpacity={0.18} listening={false} />
          {doc.layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              register={(n) => {
                if (n) nodeRefs.current.set(layer.id, n);
                else nodeRefs.current.delete(layer.id);
              }}
            />
          ))}
          <Transformer ref={trRef} rotateEnabled ignoreStroke keepRatio={false} />
        </KonvaLayer>
      </Stage>
    </div>
  );
}
