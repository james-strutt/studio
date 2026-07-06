import { useEffect, useState } from "react";
import type { PdfDoc } from "@/editors/pdf/pdfStore";
import { usePdfStore } from "@/editors/pdf/pdfStore";

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

async function destToPage(doc: PdfDoc["doc"], dest: string | unknown[] | null): Promise<number | null> {
  if (!dest) return null;
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!explicit || explicit.length === 0) return null;
  try {
    const index = await doc.getPageIndex(explicit[0] as Parameters<typeof doc.getPageIndex>[0]);
    return index + 1;
  } catch {
    return null;
  }
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
              const page = await destToPage(doc, n.dest);
              if (page) jumpTo(page);
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
