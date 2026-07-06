import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { undo, redo } from "@/commands/history";
import { useShellStore, type EditorId } from "@/store/useShellStore";
import "@/commands/demoCommand";

const noArgs = z.object({});

registerCommand({
  id: "view.toggleTheme",
  title: "Toggle theme (Lightbox / Grade)",
  editor: "global",
  shortcut: "Mod+Shift+L",
  schema: noArgs,
  run: () => {
    useShellStore.getState().toggleTheme();
  },
});

registerCommand({
  id: "edit.undo",
  title: "Undo",
  editor: "global",
  shortcut: "Mod+Z",
  schema: noArgs,
  run: () => {
    void undo();
  },
});

registerCommand({
  id: "edit.redo",
  title: "Redo",
  editor: "global",
  shortcut: "Mod+Shift+Z",
  schema: noArgs,
  run: () => {
    void redo();
  },
});

const editors: { id: EditorId; title: string }[] = [
  { id: "pdf", title: "PDF" },
  { id: "image", title: "Image" },
  { id: "video", title: "Video" },
];

for (const e of editors) {
  registerCommand({
    id: `editor.${e.id}`,
    title: `Switch to ${e.title} editor`,
    editor: "global",
    schema: noArgs,
    run: () => {
      useShellStore.getState().setEditor(e.id);
    },
  });
}
