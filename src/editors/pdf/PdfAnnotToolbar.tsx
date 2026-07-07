import { usePdfStore, type AnnotTool } from "@/editors/pdf/pdfStore";
import { ANNOT_COLORS } from "@/editors/pdf/annotColors";
import { PdfStampMenu } from "@/editors/pdf/PdfStampMenu";
import { PdfSignMenu } from "@/editors/pdf/PdfSignMenu";

const TOOLS: { id: AnnotTool; label: string; glyph: string }[] = [
  { id: "select", label: "Select / text", glyph: "⌶" },
  { id: "ink", label: "Freehand", glyph: "✎" },
  { id: "rect", label: "Rectangle", glyph: "▭" },
  { id: "ellipse", label: "Ellipse", glyph: "◯" },
  { id: "line", label: "Line", glyph: "╱" },
  { id: "arrow", label: "Arrow", glyph: "↗" },
  { id: "polygon", label: "Polygon", glyph: "⬠" },
  { id: "note", label: "Sticky note", glyph: "🗨" },
  { id: "text", label: "Text box", glyph: "T" },
];

const MEASURE_TOOLS: { id: AnnotTool; label: string; glyph: string }[] = [
  { id: "calibrate", label: "Calibrate scale", glyph: "⚖" },
  { id: "distance", label: "Distance", glyph: "↔" },
  { id: "perimeter", label: "Perimeter", glyph: "⟌" },
  { id: "area", label: "Area", glyph: "▱" },
];

const WIDTHS = [1, 2, 4, 6];

export function PdfAnnotToolbar(): JSX.Element {
  const tool = usePdfStore((s) => s.annotTool);
  const colorId = usePdfStore((s) => s.annotColorId);
  const annotWidth = usePdfStore((s) => s.annotWidth);
  const fill = usePdfStore((s) => s.annotFill);
  const calibration = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId)?.calibration);
  const setTool = usePdfStore((s) => s.setAnnotTool);
  const setColor = usePdfStore((s) => s.setAnnotColorId);
  const setWidth = usePdfStore((s) => s.setAnnotWidth);
  const setFill = usePdfStore((s) => s.setAnnotFill);

  return (
    <div className="pdf-annot-toolbar">
      <div className="seg" role="group" aria-label="Annotation tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            aria-pressed={tool === t.id}
            title={t.label}
            aria-label={t.label}
            onClick={() => setTool(t.id)}
          >
            {t.glyph}
          </button>
        ))}
      </div>
      <span className="pdf-toolbar-sep" aria-hidden="true" />
      <div className="pdf-annot-swatches" role="group" aria-label="Colour">
        {ANNOT_COLORS.map((c) => (
          <button
            key={c.id}
            className={`pdf-swatch${c.id === colorId ? " is-active" : ""}`}
            style={{ background: c.css }}
            title={c.label}
            aria-label={`${c.label} colour`}
            aria-pressed={c.id === colorId}
            onClick={() => setColor(c.id)}
          />
        ))}
      </div>
      <span className="pdf-toolbar-sep" aria-hidden="true" />
      <div className="seg" role="group" aria-label="Stroke width">
        {WIDTHS.map((w) => (
          <button key={w} aria-pressed={annotWidth === w} onClick={() => setWidth(w)}>
            {w}
          </button>
        ))}
      </div>
      <button
        className="btn btn-ghost"
        aria-pressed={fill}
        title="Fill shapes"
        onClick={() => setFill(!fill)}
      >
        {fill ? "Filled" : "Outline"}
      </button>
      <span className="pdf-toolbar-sep" aria-hidden="true" />
      <PdfStampMenu />
      <PdfSignMenu />
      <span className="pdf-toolbar-sep" aria-hidden="true" />
      <div className="seg" role="group" aria-label="Measure">
        {MEASURE_TOOLS.map((t) => (
          <button
            key={t.id}
            aria-pressed={tool === t.id}
            title={t.label}
            aria-label={t.label}
            onClick={() => setTool(t.id)}
          >
            {t.glyph}
          </button>
        ))}
      </div>
      <span className="pdf-annot-scale" title="Measurement scale">
        {calibration ? `1 ${calibration.unit} = ${Math.round(calibration.pointsPerUnit)} pt` : "uncalibrated"}
      </span>
    </div>
  );
}
