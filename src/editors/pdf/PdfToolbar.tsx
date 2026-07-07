import { useState } from "react";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { dispatch } from "@/commands/history";
import { PdfSplitDialog } from "@/editors/pdf/PdfSplitDialog";
import { PdfMergeDialog } from "@/editors/pdf/PdfMergeDialog";
import { PdfCropDialog } from "@/editors/pdf/PdfCropDialog";
import { PdfContentDialog } from "@/editors/pdf/PdfContentDialog";
import { PdfProtectDialog } from "@/editors/pdf/PdfProtectDialog";
import { PdfRedactDialog } from "@/editors/pdf/PdfRedactDialog";

export function PdfToolbar(): JSX.Element {
  const doc = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId));
  const sidebar = usePdfStore((s) => s.sidebar);
  const setSidebar = usePdfStore((s) => s.setSidebar);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [protectOpen, setProtectOpen] = useState(false);
  const [redactOpen, setRedactOpen] = useState(false);

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
          <span className="pdf-toolbar-sep" aria-hidden="true" />
          <button className="btn btn-quiet" onClick={() => setCropOpen(true)}>
            Crop…
          </button>
          <button className="btn btn-quiet" onClick={() => setSplitOpen(true)}>
            Split…
          </button>
          <button className="btn btn-quiet" onClick={() => setMergeOpen(true)}>
            Merge…
          </button>
          <button className="btn btn-quiet" onClick={() => setSetupOpen(true)}>
            Page setup…
          </button>
          <button className="btn btn-quiet" onClick={() => setProtectOpen(true)}>
            Protect…
          </button>
          <button className="btn btn-quiet" onClick={() => setRedactOpen(true)}>
            Redact…
          </button>
          <span className="pdf-page-label">
            {doc.currentPage} / {doc.numPages}
          </span>
        </>
      )}
      {doc && cropOpen && <PdfCropDialog doc={doc} onClose={() => setCropOpen(false)} />}
      {doc && splitOpen && <PdfSplitDialog doc={doc} onClose={() => setSplitOpen(false)} />}
      {doc && mergeOpen && <PdfMergeDialog doc={doc} onClose={() => setMergeOpen(false)} />}
      {doc && setupOpen && <PdfContentDialog onClose={() => setSetupOpen(false)} />}
      {doc && protectOpen && <PdfProtectDialog onClose={() => setProtectOpen(false)} />}
      {doc && redactOpen && <PdfRedactDialog onClose={() => setRedactOpen(false)} />}
    </div>
  );
}
