import "@/editors/pdf/pdf.css";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { PdfTabs } from "@/editors/pdf/PdfTabs";
import { PdfToolbar } from "@/editors/pdf/PdfToolbar";
import { PdfAnnotToolbar } from "@/editors/pdf/PdfAnnotToolbar";
import { PdfViewer } from "@/editors/pdf/PdfViewer";
import { PdfSidebar } from "@/editors/pdf/PdfSidebar";
import { dispatch } from "@/commands/history";

export function PdfEditor(): JSX.Element {
  const active = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId));
  const sidebar = usePdfStore((s) => s.sidebar);

  return (
    <div className="editor-fill">
      <PdfTabs />
      <PdfToolbar />
      {active && <PdfAnnotToolbar />}
      {active ? (
        <div className="pdf-body">
          {sidebar && <PdfSidebar doc={active} />}
          <PdfViewer key={active.id} doc={active} />
        </div>
      ) : (
        <div className="pdf-empty">
          <div className="placeholder">
            <span className="kicker">PDF editor</span>
            <span className="headline">Open a PDF to begin</span>
            <button className="btn btn-primary" onClick={() => void dispatch("pdf.open", {})}>
              Open PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
