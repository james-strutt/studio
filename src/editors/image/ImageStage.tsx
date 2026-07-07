import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Stage,
  Layer as KonvaLayer,
  Image as KonvaImage,
  Text,
  Rect,
  Shape,
  Line,
  Arrow,
  Circle,
  Group,
  Transformer,
} from "react-konva";
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
  type DrawLayer,
  type ArrowLayer,
  type BadgeLayer,
} from "@/editors/image/imageModel";
import { layerFilters, filterAttrs } from "@/editors/image/konvaFilters";
import { useHtmlImage } from "@/editors/image/useHtmlImage";

type Register = (node: Konva.Node | null) => void;

const adjustKey = (l: Layer): string => (l.adjust ? Object.values(l.adjust).join(",") : "");

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

function commonProps(layer: Layer, selectMode: boolean): Record<string, unknown> {
  const adjust = layer.adjust;
  const filterProps = hasAdjust(adjust) ? { filters: layerFilters(adjust), ...filterAttrs(adjust!) } : {};
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
    draggable: !layer.locked && selectMode,
    listening: !layer.locked && selectMode,
    onMouseDown: () => useImageStore.getState().select(layer.id),
    onTap: () => useImageStore.getState().select(layer.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      dispatch("image.setLayerProp", { id: layer.id, patch: { x: e.target.x(), y: e.target.y() } }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      void dispatch("image.setLayerProp", {
        id: layer.id,
        patch: { x: n.x(), y: n.y(), rotation: n.rotation(), scaleX: n.scaleX(), scaleY: n.scaleY() },
      });
    },
    ...filterProps,
  };
}

function RasterNode({ layer, register, sel }: { layer: RasterLayer; register: Register; sel: boolean }): JSX.Element {
  const img = useHtmlImage(layer.src);
  const ready = !!img;
  const setRef = useCachedRef(register, hasAdjust(layer.adjust) && ready, `${adjustKey(layer)}|${layer.width}x${layer.height}|${ready}`);
  return <KonvaImage ref={setRef} {...commonProps(layer, sel)} image={img} width={layer.width} height={layer.height} />;
}

function TextNode({ layer, register, sel }: { layer: TextLayer; register: Register; sel: boolean }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), `${adjustKey(layer)}|${layer.text}|${layer.fontSize}`);
  return <Text ref={setRef} {...commonProps(layer, sel)} text={layer.text} fontSize={layer.fontSize} fontFamily={layer.fontFamily} fill={layer.fill} />;
}

function ShapeNode({ layer, register, sel }: { layer: ShapeLayer; register: Register; sel: boolean }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), `${adjustKey(layer)}|${layer.width}x${layer.height}`);
  const stroke = layer.strokeWidth > 0 ? layer.stroke : undefined;
  if (layer.shape === "rect") {
    return <Rect ref={setRef} {...commonProps(layer, sel)} width={layer.width} height={layer.height} fill={layer.fill} stroke={stroke} strokeWidth={layer.strokeWidth} />;
  }
  return (
    <Shape
      ref={setRef}
      {...commonProps(layer, sel)}
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

function DrawNode({ layer, register, sel }: { layer: DrawLayer; register: Register; sel: boolean }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), adjustKey(layer));
  return <Line ref={setRef} {...commonProps(layer, sel)} points={layer.points} stroke={layer.stroke} strokeWidth={layer.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} />;
}

function ArrowNode({ layer, register, sel }: { layer: ArrowLayer; register: Register; sel: boolean }): JSX.Element {
  const setRef = useCachedRef(register, hasAdjust(layer.adjust), adjustKey(layer));
  return <Arrow ref={setRef} {...commonProps(layer, sel)} points={layer.points} stroke={layer.stroke} fill={layer.stroke} strokeWidth={layer.strokeWidth} pointerLength={layer.strokeWidth * 3} pointerWidth={layer.strokeWidth * 3} />;
}

function BadgeNode({ layer, register, sel }: { layer: BadgeLayer; register: Register; sel: boolean }): JSX.Element {
  const setRef = useCachedRef(register, false, "");
  return (
    <Group ref={setRef} {...commonProps(layer, sel)}>
      <Circle radius={layer.radius} fill={layer.fill} />
      <Text
        text={String(layer.number)}
        fontSize={layer.radius}
        fontStyle="bold"
        fill="#ffffff"
        width={layer.radius * 2}
        height={layer.radius * 2}
        offsetX={layer.radius}
        offsetY={layer.radius}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
}

function LayerNode({ layer, register, sel }: { layer: Layer; register: Register; sel: boolean }): JSX.Element {
  switch (layer.type) {
    case "raster":
      return <RasterNode layer={layer} register={register} sel={sel} />;
    case "text":
      return <TextNode layer={layer} register={register} sel={sel} />;
    case "shape":
      return <ShapeNode layer={layer} register={register} sel={sel} />;
    case "draw":
      return <DrawNode layer={layer} register={register} sel={sel} />;
    case "arrow":
      return <ArrowNode layer={layer} register={register} sel={sel} />;
    case "badge":
      return <BadgeNode layer={layer} register={register} sel={sel} />;
  }
}

const hex = (v: number): string => v.toString(16).padStart(2, "0");

export function ImageStage(): JSX.Element {
  const doc = useImageStore((s) => s.doc);
  const tool = useImageStore((s) => s.tool);
  const brushColor = useImageStore((s) => s.brushColor);
  const brushSize = useImageStore((s) => s.brushSize);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const drawing = useRef(false);
  const brushRef = useRef<number[]>([]);
  const [preview, setPreview] = useState<number[]>([]);
  const [arrow, setArrow] = useState<[number, number, number, number] | null>(null);
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
    const node = tool === "select" && selectedId ? nodeRefs.current.get(selectedId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers, tool]);

  const setExporter = useImageStore((s) => s.setExporter);
  const pad = 48;
  const scale = doc ? Math.min((size.w - pad) / doc.width, (size.h - pad) / doc.height, 4) || 1 : 1;
  const offsetX = doc ? (size.w - doc.width * scale) / 2 : 0;
  const offsetY = doc ? (size.h - doc.height * scale) / 2 : 0;

  // Expose a 1:1 composited canvas for export (transformer hidden during capture).
  useEffect(() => {
    if (!doc) {
      setExporter(null);
      return;
    }
    setExporter(() => {
      const stage = stageRef.current;
      if (!stage) return null;
      const tr = trRef.current;
      const kept = tr?.nodes() ?? [];
      tr?.nodes([]);
      tr?.getLayer()?.batchDraw();
      const canvas = stage.toCanvas({
        x: offsetX,
        y: offsetY,
        width: doc.width * scale,
        height: doc.height * scale,
        pixelRatio: 1 / scale,
      });
      tr?.nodes(kept);
      tr?.getLayer()?.batchDraw();
      return canvas;
    });
    return () => setExporter(null);
  }, [doc, offsetX, offsetY, scale, setExporter]);

  if (!doc) return <div className="img-stage-wrap" ref={wrapRef} />;
  const toDoc = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - offsetX) / scale,
    y: (p.y - offsetY) / scale,
  });

  const sample = (stage: Konva.Stage, p: { x: number; y: number }): void => {
    const canvas = stage.toCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    useImageStore.getState().setBrushColor(`#${hex(d[0])}${hex(d[1])}${hex(d[2])}`);
    useImageStore.getState().setTool("select");
  };

  const onDown = (): void => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return;
    if (tool === "select") {
      // Nothing listening under the pointer (background rect is non-listening) → deselect.
      if (!stage.getIntersection(p)) useImageStore.getState().select(null);
      return;
    }
    const d = toDoc(p);
    if (tool === "brush") {
      brushRef.current = [d.x, d.y];
      setPreview([d.x, d.y]);
      drawing.current = true;
    } else if (tool === "arrow") {
      setArrow([d.x, d.y, d.x, d.y]);
      drawing.current = true;
    } else if (tool === "badge") {
      void dispatch("image.addBadge", { x: d.x, y: d.y, fill: brushColor });
    } else if (tool === "text") {
      void dispatch("image.addText", { text: "Text", x: d.x, y: d.y });
      useImageStore.getState().setTool("select");
    } else if (tool === "eyedropper") {
      sample(stage, p);
    }
  };

  const onMove = (): void => {
    if (!drawing.current) return;
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    const d = toDoc(p);
    if (tool === "brush") {
      brushRef.current.push(d.x, d.y);
      setPreview([...brushRef.current]);
    } else if (tool === "arrow") {
      setArrow((a) => (a ? [a[0], a[1], d.x, d.y] : a));
    }
  };

  const onUp = (): void => {
    if (!drawing.current) return;
    drawing.current = false;
    if (tool === "brush") {
      const pts = brushRef.current;
      brushRef.current = [];
      setPreview([]);
      if (pts.length >= 4) void dispatch("image.addDraw", { points: pts, stroke: brushColor, strokeWidth: brushSize });
    } else if (tool === "arrow" && arrow) {
      const [x1, y1, x2, y2] = arrow;
      setArrow(null);
      if (Math.hypot(x2 - x1, y2 - y1) > 4) {
        void dispatch("image.addArrow", { points: [x1, y1, x2, y2], stroke: brushColor, strokeWidth: brushSize });
      }
    }
  };

  const selectMode = tool === "select";
  const cursor = tool === "select" ? "default" : tool === "eyedropper" ? "copy" : "crosshair";

  return (
    <div className="img-stage-wrap" ref={wrapRef} style={{ cursor }}>
      <Stage ref={stageRef} width={size.w} height={size.h} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}>
        <KonvaLayer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
          <Rect x={0} y={0} width={doc.width} height={doc.height} fill="#ffffff" shadowBlur={12} shadowOpacity={0.18} listening={false} />
          {doc.layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              sel={selectMode}
              register={(n) => {
                if (n) nodeRefs.current.set(layer.id, n);
                else nodeRefs.current.delete(layer.id);
              }}
            />
          ))}
          {preview.length > 1 && (
            <Line points={preview} stroke={brushColor} strokeWidth={brushSize} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
          )}
          {arrow && (
            <Arrow points={arrow} stroke={brushColor} fill={brushColor} strokeWidth={brushSize} pointerLength={brushSize * 3} pointerWidth={brushSize * 3} listening={false} />
          )}
          <Transformer ref={trRef} rotateEnabled ignoreStroke keepRatio={false} />
        </KonvaLayer>
      </Stage>
    </div>
  );
}
