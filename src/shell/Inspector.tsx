import { useShellStore } from "@/store/useShellStore";
import { useDemoStore } from "@/commands/demoCommand";
import { dispatch, undo } from "@/commands/history";

/* Placeholder inspector. The demo section is the P0.6 acceptance surface:
   run a registered command, watch state change, undo reverses it. */
export function Inspector(): JSX.Element {
  const activeEditor = useShellStore((s) => s.activeEditor);
  const count = useDemoStore((s) => s.count);

  return (
    <aside className="insp" aria-label="Inspector">
      <h3>{activeEditor.toUpperCase()} inspector</h3>
      <p>Context and properties for the selected element appear here.</p>
      <hr />
      <h3>
        Command demo <span className="badge badge-neutral">count {count}</span>
      </h3>
      <div className="shell-top-right" style={{ gap: "var(--space-2)" }}>
        <button className="btn btn-quiet" onClick={() => void dispatch("demo.increment", {})}>
          Run command
        </button>
        <button className="btn btn-ghost" onClick={() => void undo()}>
          Undo
        </button>
      </div>
    </aside>
  );
}
