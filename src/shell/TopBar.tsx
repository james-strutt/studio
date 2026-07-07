import { useShellStore, type EditorId } from "@/store/useShellStore";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { useImageStore } from "@/editors/image/useImageStore";
import { dispatch } from "@/commands/history";

const EDITORS: { id: EditorId; label: string }[] = [
  { id: "pdf", label: "PDF" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

export function TopBar(): JSX.Element {
  const active = useShellStore((s) => s.activeEditor);
  const activePdf = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId));
  const hasImageDoc = useImageStore((s) => !!s.doc);
  const canSave = active === "pdf" && !!activePdf;
  const canExport = canSave || (active === "image" && hasImageDoc);

  const onExport = (): void => {
    if (active === "pdf" && activePdf) void dispatch("pdf.save", {});
    else if (active === "image" && hasImageDoc) void dispatch("image.exportImage", {});
  };

  return (
    <header className="shell-top">
      <span className="shell-brand cropmark">Studio</span>
      <div className="seg" role="group" aria-label="Editor">
        {EDITORS.map((e) => (
          <button
            key={e.id}
            aria-pressed={active === e.id}
            onClick={() => void dispatch(`editor.${e.id}`, {})}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="shell-top-right">
        {canSave && (
          <span className={`badge ${activePdf.dirty ? "badge-caution" : "badge-neutral"}`}>
            {activePdf.dirty ? "unsaved" : "saved"}
          </span>
        )}
        <button className="btn btn-primary" disabled={!canExport} onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}
