import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";

export function PdfTabs(): JSX.Element | null {
  const docs = usePdfStore((s) => s.docs);
  const activeId = usePdfStore((s) => s.activeId);
  const setActive = usePdfStore((s) => s.setActive);
  const closeDoc = usePdfStore((s) => s.closeDoc);

  if (docs.length === 0) return null;

  const onClose = (e: React.MouseEvent, d: PdfDoc): void => {
    e.stopPropagation();
    // ponytail: native confirm for the unsaved-changes guard. Swap for the
    // themed ConfirmModal when one exists. dirty stays false until P1.5+ edits.
    if (d.dirty && !window.confirm(`Close ${d.name}? Unsaved changes will be lost.`)) return;
    closeDoc(d.id);
  };

  return (
    <div className="pdf-tabs" role="tablist">
      {docs.map((d) => (
        <div
          key={d.id}
          className="pdf-tab"
          role="tab"
          aria-selected={d.id === activeId}
          tabIndex={0}
          onClick={() => setActive(d.id)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(d.id)}
        >
          {d.dirty && <span className="dot" aria-label="Unsaved changes" />}
          <span>{d.name}</span>
          <button className="close" aria-label={`Close ${d.name}`} onClick={(e) => onClose(e, d)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
