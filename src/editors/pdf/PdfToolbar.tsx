import { usePdfStore } from "@/editors/pdf/pdfStore";
import { dispatch } from "@/commands/history";

export function PdfToolbar(): JSX.Element {
  const doc = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId));
  const sidebar = usePdfStore((s) => s.sidebar);
  const setSidebar = usePdfStore((s) => s.setSidebar);

  return (
    <div className="pdf-toolbar">
      <button
        className="btn btn-ghost"
        aria-label="Toggle sidebar"
        aria-pressed={sidebar !== null}
        onClick={() => setSidebar(sidebar ? null : "thumbnails")}
      >
        ☰
      </button>
      <button className="btn btn-quiet" onClick={() => void dispatch("pdf.open", {})}>
        Open
      </button>
      {doc && (
        <>
          <div className="seg" role="group" aria-label="Zoom mode">
            <button aria-pressed={doc.zoomMode === "fit-width"} onClick={() => void dispatch("pdf.fitWidth", {})}>
              Fit width
            </button>
            <button aria-pressed={doc.zoomMode === "fit-page"} onClick={() => void dispatch("pdf.fitPage", {})}>
              Fit page
            </button>
            <button aria-pressed={doc.zoomMode === "actual"} onClick={() => void dispatch("pdf.actualSize", {})}>
              100%
            </button>
          </div>
          <button className="btn btn-ghost" aria-label="Zoom out" onClick={() => void dispatch("pdf.zoomOut", {})}>
            -
          </button>
          <span className="pdf-zoom-label">{Math.round(doc.effectiveScale * 100)}%</span>
          <button className="btn btn-ghost" aria-label="Zoom in" onClick={() => void dispatch("pdf.zoomIn", {})}>
            +
          </button>
          <button className="btn btn-ghost" aria-label="Rotate clockwise" onClick={() => void dispatch("pdf.rotateCw", {})}>
            ⟳
          </button>
          <div className="seg" role="group" aria-label="View mode">
            <button aria-pressed={doc.viewMode === "single"} onClick={() => void dispatch("pdf.viewSingle", {})}>
              Single
            </button>
            <button aria-pressed={doc.viewMode === "two-up"} onClick={() => void dispatch("pdf.viewTwoUp", {})}>
              Two-up
            </button>
            <button aria-pressed={doc.viewMode === "spread"} onClick={() => void dispatch("pdf.viewSpread", {})}>
              Spread
            </button>
          </div>
          <button
            className="btn btn-ghost"
            aria-label="Dark page"
            aria-pressed={doc.darkPage}
            onClick={() => void dispatch("pdf.toggleDarkPage", {})}
          >
            ◑
          </button>
          <span className="pdf-page-label">
            {doc.currentPage} / {doc.numPages}
          </span>
        </>
      )}
    </div>
  );
}
