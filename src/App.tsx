import { useEffect, useState } from "react";
import { useShellStore } from "@/store/useShellStore";
import { TopBar } from "@/shell/TopBar";
import { ToolRail } from "@/shell/ToolRail";
import { Inspector } from "@/shell/Inspector";
import { CommandStrip } from "@/shell/CommandStrip";
import { CommandPalette } from "@/palette/CommandPalette";
import { PdfEditor } from "@/editors/PdfEditor";
import { ImageEditor } from "@/editors/ImageEditor";
import { VideoEditor } from "@/editors/VideoEditor";
import { undo, redo } from "@/commands/history";

const editors = { pdf: PdfEditor, image: ImageEditor, video: VideoEditor };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function App(): JSX.Element {
  const theme = useShellStore((s) => s.theme);
  const activeEditor = useShellStore((s) => s.activeEditor);
  const inspectorOpen = useShellStore((s) => s.panels.inspector);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !isTypingTarget(e.target)) {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Editor = editors[activeEditor];

  return (
    <div className="app">
      <TopBar />
      <div
        className="shell-main"
        style={inspectorOpen ? undefined : { gridTemplateColumns: "44px 1fr" }}
      >
        <ToolRail />
        <div className="stage">
          <Editor />
        </div>
        {inspectorOpen && <Inspector />}
      </div>
      <CommandStrip onOpenPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
