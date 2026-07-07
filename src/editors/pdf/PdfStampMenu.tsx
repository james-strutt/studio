import { useEffect, useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { fixedPosition } from "@/lib/pointer";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { getFileService } from "@/files/fileService";
import { listStamps, saveStamp, deleteStamp, type StoredStamp } from "@/editors/pdf/stampStore";
import type { RGB } from "@/editors/pdf/pdfAnnotations";

const PRESETS: { label: string; color: RGB; css: string }[] = [
  { label: "APPROVED", color: { r: 0.2, g: 0.6, b: 0.3 }, css: "#339955" },
  { label: "DRAFT", color: { r: 0.98, g: 0.75, b: 0.14 }, css: "#FBBF24" },
  { label: "CONFIDENTIAL", color: { r: 0.9, g: 0.22, b: 0.21 }, css: "#E63836" },
  { label: "FINAL", color: { r: 0.26, g: 0.55, b: 0.96 }, css: "#428CF5" },
];

function centre(): { pageIndex: number; cx: number; cy: number } | null {
  const d = usePdfStore.getState().getActive();
  if (!d) return null;
  const pageIndex = d.currentPage - 1;
  const ps = d.pageSizes[pageIndex];
  return { pageIndex, cx: ps.width / 2, cy: ps.height / 2 };
}

export function PdfStampMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [stamps, setStamps] = useState<StoredStamp[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) void listStamps().then(setStamps);
  }, [open]);

  const toggle = (): void => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        const p = fixedPosition(r.left, r.bottom);
        setPos({ left: p.x, top: p.y + 4 });
      }
    }
    setOpen((o) => !o);
  };

  const placeText = (label: string, color: RGB): void => {
    const c = centre();
    if (!c) return;
    const w = Math.max(120, label.length * 11);
    const h = 40;
    void dispatch("pdf.addStampText", {
      pageIndex: c.pageIndex,
      rect: [c.cx - w / 2, c.cy - h / 2, c.cx + w / 2, c.cy + h / 2],
      label,
      color,
    });
    setOpen(false);
  };

  const placeImage = async (stamp: StoredStamp): Promise<void> => {
    const c = centre();
    if (!c) return;
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(stamp.bytes)]));
    const s = 160 / Math.max(bmp.width, bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    void dispatch("pdf.addStampImage", {
      pageIndex: c.pageIndex,
      rect: [c.cx - w / 2, c.cy - h / 2, c.cx + w / 2, c.cy + h / 2],
      bytes: stamp.bytes,
      isPng: stamp.isPng,
    });
    setOpen(false);
  };

  const upload = async (): Promise<void> => {
    const file = await getFileService().open({ accept: [".png", ".jpg", ".jpeg"] });
    if (!file) return;
    const isPng = /\.png$/i.test(file.name);
    const saved = await saveStamp(file.name, file.data, isPng);
    setStamps((prev) => [...prev, saved]);
  };

  const remove = async (id: string): Promise<void> => {
    await deleteStamp(id);
    setStamps((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="pdf-stamp-menu">
      <button ref={btnRef} className="btn btn-quiet" aria-expanded={open} onClick={toggle}>
        Stamp ▾
      </button>
      {open && (
        <>
          <div className="pdf-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="pdf-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
            <div className="pdf-menu-label">Presets</div>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="pdf-menu-item"
                onClick={() => placeText(p.label, p.color)}
              >
                <span className="pdf-stamp-chip" style={{ borderColor: p.css, color: p.css }}>
                  {p.label}
                </span>
              </button>
            ))}
            <div className="pdf-menu-label">Custom</div>
            {stamps.map((s) => (
              <div key={s.id} className="pdf-menu-row">
                <button className="pdf-menu-item" onClick={() => void placeImage(s)}>
                  {s.name}
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void remove(s.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="pdf-menu-item" onClick={() => void upload()}>
              Upload image…
            </button>
          </div>
        </>
      )}
    </div>
  );
}
