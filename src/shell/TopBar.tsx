import { useShellStore, type EditorId } from "@/store/useShellStore";
import { dispatch } from "@/commands/history";

const EDITORS: { id: EditorId; label: string }[] = [
  { id: "pdf", label: "PDF" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

export function TopBar(): JSX.Element {
  const active = useShellStore((s) => s.activeEditor);

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
        <span className="badge badge-neutral">saved</span>
        <button className="btn btn-primary">Export</button>
      </div>
    </header>
  );
}
