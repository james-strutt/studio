import { useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { usePdfStore, type PdfDoc } from "@/editors/pdf/pdfStore";

interface Match {
  page: number;
  snippet: string;
}

const textCache = new WeakMap<PDFDocumentProxy, string[]>();

async function getPageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  const cached = textCache.get(doc);
  if (cached) return cached;
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  textCache.set(doc, texts);
  return texts;
}

function findMatches(texts: string[], query: string): Match[] {
  const q = query.toLowerCase();
  const out: Match[] = [];
  texts.forEach((text, pi) => {
    const lower = text.toLowerCase();
    let idx = lower.indexOf(q);
    while (idx !== -1) {
      const start = Math.max(0, idx - 24);
      const prefix = start > 0 ? "…" : "";
      out.push({ page: pi + 1, snippet: `${prefix}${text.slice(start, idx + q.length + 28).trim()}…` });
      idx = lower.indexOf(q, idx + q.length);
    }
  });
  return out;
}

export function PdfSearch({ doc }: { doc: PdfDoc }): JSX.Element {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const jumpTo = usePdfStore((s) => s.jumpTo);

  const run = async (): Promise<void> => {
    if (query.trim().length === 0) {
      setMatches(null);
      return;
    }
    setBusy(true);
    const texts = await getPageTexts(doc.doc);
    const found = findMatches(texts, query.trim());
    setMatches(found);
    setActive(0);
    setBusy(false);
    if (found.length > 0) jumpTo(found[0].page);
  };

  const step = (delta: number): void => {
    if (!matches || matches.length === 0) return;
    const next = (active + delta + matches.length) % matches.length;
    setActive(next);
    jumpTo(matches[next].page);
  };

  return (
    <div className="pdf-search">
      <div className="pdf-search-bar">
        <input
          className="input"
          placeholder="Search document"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
        />
      </div>
      {matches && (
        <div className="pdf-search-nav">
          <span>
            {matches.length === 0 ? "No matches" : `${active + 1} / ${matches.length}`}
          </span>
          <button className="btn btn-ghost" aria-label="Previous match" onClick={() => step(-1)}>
            ‹
          </button>
          <button className="btn btn-ghost" aria-label="Next match" onClick={() => step(1)}>
            ›
          </button>
        </div>
      )}
      {busy && <div className="pdf-panel-empty">Searching…</div>}
      {matches && matches.length > 0 && (
        <ul className="pdf-search-results">
          {matches.map((m, i) => (
            <li key={i}>
              <button
                className={`pdf-search-result${i === active ? " is-active" : ""}`}
                onClick={() => {
                  setActive(i);
                  jumpTo(m.page);
                }}
              >
                <span className="pdf-search-page">p.{m.page}</span>
                <span className="pdf-search-snippet">{m.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
