import { formatShortcut } from "@/lib/platform";

export function CommandStrip({
  onOpenPalette,
}: {
  onOpenPalette: () => void;
}): JSX.Element {
  return (
    <div className="cmd">
      <button className="cmd-input" onClick={onOpenPalette} aria-label="Open command palette">
        <span className="prompt-mark">›</span>
        <span>Type a command, or ask: "cut the silences and add captions"</span>
      </button>
      <kbd>{formatShortcut("Mod+K")}</kbd>
    </div>
  );
}
