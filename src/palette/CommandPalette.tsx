import { useEffect, useMemo, useRef, useState } from "react";
import { allCommands, type CommandDef } from "@/commands/registry";
import { dispatch } from "@/commands/history";
import { formatShortcut } from "@/lib/platform";

// ponytail: naive subsequence match, no ranking lib. Swap for fuse.js only if
// typo-tolerance or weighted fields become necessary.
function score(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let ti = 0;
  let total = 0;
  let streak = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    streak = idx === ti ? streak + 1 : 0;
    total += 1 + streak;
    ti = idx + 1;
  }
  return total - t.length * 0.01;
}

function filterCommands(query: string): CommandDef<unknown, unknown>[] {
  return allCommands()
    .map((cmd) => ({ cmd, s: score(query, cmd.title) }))
    .filter((r): r is { cmd: CommandDef<unknown, unknown>; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.cmd);
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterCommands(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const run = (cmd: CommandDef<unknown, unknown> | undefined): void => {
    if (!cmd) return;
    onClose();
    void dispatch(cmd.id, {});
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[selected]);
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {results.length === 0 ? (
          <div className="palette-empty">No matching commands</div>
        ) : (
          <ul className="palette-list" role="listbox">
            {results.map((cmd, i) => (
              <li
                key={cmd.id}
                className="palette-item"
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => run(cmd)}
              >
                <span className="title">{cmd.title}</span>
                <span className="meta">{cmd.shortcut ? formatShortcut(cmd.shortcut) : cmd.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
