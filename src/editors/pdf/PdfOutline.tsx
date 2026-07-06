import { useEffect, useState } from "react";
import type { PdfDoc } from "@/editors/pdf/pdfStore";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { destToPageIndex } from "@/editors/pdf/pdfDest";

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

function OutlineItems({ nodes, doc }: { nodes: OutlineNode[]; doc: PdfDoc["doc"] }): JSX.Element {
  const jumpTo = usePdfStore((s) => s.jumpTo);
  return (
    <ul className="pdf-outline-list">
      {nodes.map((n, i) => (
        <li key={i}>
          <button
            className="pdf-outline-item"
            onClick={async () => {
              const index = await destToPageIndex(doc, n.dest);
              if (index !== null) jumpTo(index + 1);
            }}
          >
            {n.title}
          </button>
          {n.items.length > 0 && <OutlineItems nodes={n.items} doc={doc} />}
        </li>
      ))}
    </ul>
  );
}

export function PdfOutline({ doc }: { doc: PdfDoc }): JSX.Element {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);

  useEffect(() => {
    let alive = true;
    void doc.doc.getOutline().then((o) => {
      if (alive) setOutline((o as OutlineNode[] | null) ?? []);
    });
    return () => {
      alive = false;
    };
  }, [doc.doc]);

  if (outline === null) return <div className="pdf-panel-empty">Loading outline…</div>;
  if (outline.length === 0) return <div className="pdf-panel-empty">This document has no bookmarks.</div>;
  return (
    <div className="pdf-outline">
      <OutlineItems nodes={outline} doc={doc.doc} />
    </div>
  );
}
