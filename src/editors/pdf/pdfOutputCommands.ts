import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { usePdfStore } from "@/editors/pdf/pdfStore";
import { getFileService } from "@/files/fileService";

const noArgs = z.object({});

// Save/export produce a file on disk from the active document's current bytes.
// They do not mutate the document, so they carry no undo entry. Saving marks
// the tab clean (and adopts the chosen filename on web/Electron save dialogs).
registerCommand({
  id: "pdf.save",
  title: "Save PDF",
  editor: "pdf",
  shortcut: "Mod+S",
  schema: noArgs,
  run: async () => {
    const d = usePdfStore.getState().getActive();
    if (!d) return;
    const savedName = await getFileService().save(d.name, d.bytes);
    if (savedName) usePdfStore.getState().markSaved(d.id, savedName);
  },
});
