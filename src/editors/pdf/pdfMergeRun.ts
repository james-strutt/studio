import { loadPdf } from "@/editors/pdf/pdfDocument";
import { resolveOutlineTree } from "@/editors/pdf/pdfOutlineResolve";
import { mergeDocs, type MergeInput } from "@/editors/pdf/pdfMutations";
import { usePdfStore } from "@/editors/pdf/pdfStore";

/**
 * Build a merge input from raw PDF bytes, resolving its outline via a throwaway
 * pdf.js document (so bookmarks survive the merge with correct destinations).
 */
export async function pdfInputFromBytes(bytes: Uint8Array): Promise<MergeInput> {
  const { doc } = await loadPdf(bytes);
  try {
    const outline = await resolveOutlineTree(doc);
    return { kind: "pdf", bytes, outline };
  } finally {
    void doc.destroy();
  }
}

/**
 * Run a merge and open the result as a new tab. Merge creates a fresh document
 * rather than mutating an open one, so — like extract/split — it carries no undo
 * entry; the source tabs are untouched. Shared by the `pdf.merge` command and
 * the merge-tray UI.
 */
export async function performMerge(inputs: MergeInput[], name = "merged.pdf"): Promise<void> {
  if (inputs.length === 0) return;
  const merged = await mergeDocs(inputs);
  await usePdfStore.getState().openBytes(name, merged);
}
