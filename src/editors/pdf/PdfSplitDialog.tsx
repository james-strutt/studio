import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { parsePageRanges } from "@/editors/pdf/pdfRanges";
import { destToPageIndex } from "@/editors/pdf/pdfDest";
import type { PdfDoc } from "@/editors/pdf/pdfStore";

type Mode = "everyN" | "ranges" | "size" | "bookmark";

const MODES: { id: Mode; label: string }[] = [
  { id: "everyN", label: "Every N" },
  { id: "ranges", label: "Ranges" },
  { id: "size", label: "File size" },
  { id: "bookmark", label: "Bookmarks" },
];

export function PdfSplitDialog({ doc, onClose }: { doc: PdfDoc; onClose: () => void }): JSX.Element {
  const [mode, setMode] = useState<Mode>("everyN");
  const [n, setN] = useState(10);
  const [spec, setSpec] = useState("");
  const [mb, setMb] = useState(10);
  const [bookmarkCount, setBookmarkCount] = useState<number | null>(null);

  const rangeCount = useMemo(
    () => parsePageRanges(spec, doc.numPages).length,
    [spec, doc.numPages],
  );

  // Resolve how many top-level bookmarks actually point at a page, so the
  // Bookmarks mode can tell the user up front whether there is anything to
  // split on.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const outline = await doc.doc.getOutline();
      if (!outline) {
        if (alive) setBookmarkCount(0);
        return;
      }
      let count = 0;
      for (const item of outline) {
        const idx = await destToPageIndex(doc.doc, item.dest as string | unknown[] | null);
        if (idx !== null) count++;
      }
      if (alive) setBookmarkCount(count);
    })();
    return () => {
      alive = false;
    };
  }, [doc.doc]);

  const submit = (): void => {
    if (mode === "everyN") void dispatch("pdf.splitEveryN", { n });
    else if (mode === "ranges") void dispatch("pdf.splitByRanges", { spec });
    else if (mode === "size") void dispatch("pdf.splitByTargetSize", { mb });
    else void dispatch("pdf.splitByBookmark", {});
    onClose();
  };

  const canSubmit =
    mode === "everyN"
      ? n >= 1
      : mode === "ranges"
        ? rangeCount > 0
        : mode === "size"
          ? mb > 0
          : (bookmarkCount ?? 0) > 0;

  const partCount =
    mode === "everyN"
      ? Math.ceil(doc.numPages / Math.max(1, n))
      : mode === "ranges"
        ? rangeCount
        : mode === "bookmark"
          ? (bookmarkCount ?? 0)
          : null;

  return (
    <Modal
      title={`Split “${doc.name}”`}
      onClose={onClose}
      footer={
        <>
          <span className="field-hint" style={{ marginRight: "auto" }}>
            {partCount !== null
              ? `${partCount} file${partCount === 1 ? "" : "s"}`
              : "Files sized to fit"}
          </span>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
            Split
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Split mode">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "everyN" && (
        <label className="field">
          <span className="field-label">Pages per file</span>
          <input
            className="input"
            type="number"
            min={1}
            max={doc.numPages}
            value={n}
            onChange={(e) => setN(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          <span className="field-hint">{doc.numPages} pages total</span>
        </label>
      )}

      {mode === "ranges" && (
        <label className="field">
          <span className="field-label">Page ranges</span>
          <input
            className="input"
            placeholder="e.g. 1-3, 5, 8-10"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
          />
          <span className="field-hint">
            One file per range · pages 1–{doc.numPages} · {rangeCount} valid range
            {rangeCount === 1 ? "" : "s"}
          </span>
        </label>
      )}

      {mode === "size" && (
        <label className="field">
          <span className="field-label">Maximum size per file (MB)</span>
          <input
            className="input"
            type="number"
            min={0.1}
            step={0.5}
            value={mb}
            onChange={(e) => setMb(Math.max(0.1, Number(e.target.value) || 0.1))}
          />
          <span className="field-hint">
            Consecutive pages are packed until each file is under the limit.
          </span>
        </label>
      )}

      {mode === "bookmark" && (
        <div className="field">
          <span className="field-label">Split at each top-level bookmark</span>
          <span className="field-hint">
            {bookmarkCount === null
              ? "Reading bookmarks…"
              : bookmarkCount === 0
                ? "This document has no usable top-level bookmarks."
                : `${bookmarkCount} section${bookmarkCount === 1 ? "" : "s"} — one file each.`}
          </span>
        </div>
      )}
    </Modal>
  );
}
