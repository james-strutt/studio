import { usePdfStore, type PdfDoc, type SidebarTab } from "@/editors/pdf/pdfStore";
import { PdfThumbnails } from "@/editors/pdf/PdfThumbnails";
import { PdfOutline } from "@/editors/pdf/PdfOutline";
import { PdfSearch } from "@/editors/pdf/PdfSearch";
import { PdfComments } from "@/editors/pdf/PdfComments";
import { PdfForm } from "@/editors/pdf/PdfForm";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "thumbnails", label: "Pages" },
  { id: "outline", label: "Outline" },
  { id: "search", label: "Search" },
  { id: "comments", label: "Comments" },
  { id: "form", label: "Form" },
];

export function PdfSidebar({ doc }: { doc: PdfDoc }): JSX.Element {
  const sidebar = usePdfStore((s) => s.sidebar);
  const setSidebar = usePdfStore((s) => s.setSidebar);

  return (
    <aside className="pdf-sidebar">
      <div className="pdf-sidebar-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={sidebar === t.id}
            onClick={() => setSidebar(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pdf-sidebar-body">
        {sidebar === "thumbnails" && <PdfThumbnails doc={doc} />}
        {sidebar === "outline" && <PdfOutline doc={doc} />}
        {sidebar === "search" && <PdfSearch doc={doc} />}
        {sidebar === "comments" && <PdfComments doc={doc} />}
        {sidebar === "form" && <PdfForm doc={doc} />}
      </div>
    </aside>
  );
}
