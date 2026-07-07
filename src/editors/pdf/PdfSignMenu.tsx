import { useEffect, useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import {
  listSignatures,
  deleteSignature,
  type StoredSignature,
} from "@/editors/pdf/signatureStore";
import { SignatureCreator } from "@/editors/pdf/SignatureCreator";

export function PdfSignMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [creating, setCreating] = useState(false);
  const [sigs, setSigs] = useState<StoredSignature[]>([]);
  const [dated, setDated] = useState(true);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) void listSignatures().then(setSigs);
  }, [open]);

  const toggle = (): void => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4 });
    }
    setOpen((o) => !o);
  };

  const place = async (sig: StoredSignature): Promise<void> => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const pageIndex = d.currentPage - 1;
    const ps = d.pageSizes[pageIndex];
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(sig.bytes)]));
    const w = 180;
    const h = (bmp.height / bmp.width) * w;
    const cx = ps.width / 2;
    const cy = ps.height / 2;
    void dispatch("pdf.placeSignature", {
      pageIndex,
      rect: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
      bytes: sig.bytes,
      isPng: true,
      date: dated ? `Signed ${new Date().toLocaleDateString()}` : undefined,
    });
    setOpen(false);
  };

  const remove = async (id: string): Promise<void> => {
    await deleteSignature(id);
    setSigs((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="pdf-stamp-menu">
      <button ref={btnRef} className="btn btn-quiet" aria-expanded={open} onClick={toggle}>
        Sign ▾
      </button>
      {open && (
        <>
          <div className="pdf-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="pdf-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
            <label className="pdf-menu-check">
              <input type="checkbox" checked={dated} onChange={(e) => setDated(e.target.checked)} />
              Add date
            </label>
            <div className="pdf-menu-label">Signatures</div>
            {sigs.length === 0 && <div className="pdf-panel-empty">None saved yet.</div>}
            {sigs.map((s) => (
              <div key={s.id} className="pdf-menu-row">
                <button className="pdf-menu-item pdf-sig-item" onClick={() => void place(s)}>
                  <img
                    className="pdf-sig-thumb"
                    alt={s.name}
                    src={URL.createObjectURL(new Blob([Uint8Array.from(s.bytes)], { type: "image/png" }))}
                  />
                </button>
                <button className="btn btn-ghost" aria-label={`Delete ${s.name}`} onClick={() => void remove(s.id)}>
                  ✕
                </button>
              </div>
            ))}
            <button className="pdf-menu-item" onClick={() => setCreating(true)}>
              Create signature…
            </button>
          </div>
        </>
      )}
      {creating && (
        <SignatureCreator
          onClose={() => setCreating(false)}
          onSaved={(sig) => setSigs((prev) => [...prev, sig])}
        />
      )}
    </div>
  );
}
