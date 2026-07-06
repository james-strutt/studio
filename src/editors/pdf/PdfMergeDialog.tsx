import { useRef, useState } from "react";
import { Modal } from "@/shell/Modal";
import { getFileService } from "@/files/fileService";
import { pdfInputFromBytes, performMerge } from "@/editors/pdf/pdfMergeRun";
import type { MergeInput } from "@/editors/pdf/pdfMutations";
import type { PdfDoc } from "@/editors/pdf/pdfStore";

interface TrayItem {
  id: string;
  name: string;
  kind: "pdf" | "image";
  isPng: boolean;
  bytes: Uint8Array;
}

function classify(name: string): { kind: "pdf" | "image"; isPng: boolean } {
  if (/\.png$/i.test(name)) return { kind: "image", isPng: true };
  if (/\.(jpe?g)$/i.test(name)) return { kind: "image", isPng: false };
  return { kind: "pdf", isPng: false };
}

export function PdfMergeDialog({ doc, onClose }: { doc: PdfDoc; onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<TrayItem[]>([
    { id: doc.id, name: doc.name, kind: "pdf", isPng: false, bytes: doc.bytes },
  ]);
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);

  const addFiles = async (): Promise<void> => {
    const files = await getFileService().openMultiple({
      accept: [".pdf", ".png", ".jpg", ".jpeg"],
    });
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        bytes: f.data,
        ...classify(f.name),
      })),
    ]);
  };

  const remove = (id: string): void => setItems((prev) => prev.filter((it) => it.id !== id));

  const reorder = (to: number): void => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const combine = async (): Promise<void> => {
    setBusy(true);
    try {
      const inputs: MergeInput[] = [];
      for (const it of items) {
        if (it.kind === "image") inputs.push({ kind: "image", bytes: it.bytes, isPng: it.isPng });
        else inputs.push(await pdfInputFromBytes(it.bytes));
      }
      await performMerge(inputs);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Merge into a new document"
      onClose={onClose}
      footer={
        <>
          <span className="field-hint" style={{ marginRight: "auto" }}>
            {items.length} item{items.length === 1 ? "" : "s"} · combined top to bottom
          </span>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || items.length < 2}
            onClick={() => void combine()}
          >
            {busy ? "Combining…" : "Combine"}
          </button>
        </>
      }
    >
      <button className="btn btn-quiet" onClick={() => void addFiles()}>
        Add PDFs or images…
      </button>
      <ul className="merge-tray">
        {items.map((it, i) => (
          <li
            key={it.id}
            className="merge-item"
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(i)}
          >
            <span className="merge-grip" aria-hidden="true">
              ⠿
            </span>
            <span className="merge-index">{i + 1}</span>
            <span className="merge-kind">{it.kind === "image" ? "IMG" : "PDF"}</span>
            <span className="merge-name">{it.name}</span>
            <button
              className="btn btn-ghost"
              aria-label={`Remove ${it.name}`}
              onClick={() => remove(it.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {items.length < 2 && (
        <span className="field-hint">Add at least one more file to merge.</span>
      )}
    </Modal>
  );
}
