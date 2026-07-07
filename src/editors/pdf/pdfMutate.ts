import { usePdfStore } from "@/editors/pdf/pdfStore";

export interface UndoPatch {
  docId: string;
  prev: Uint8Array;
}

/**
 * Apply a byte transform to the active document and record enough to undo it.
 * Shared by every in-place PDF mutation command (page ops, annotations, forms).
 */
export async function mutateActive(
  transform: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<UndoPatch | null> {
  const d = usePdfStore.getState().getActive();
  if (!d) return null;
  const prev = d.bytes;
  const next = await transform(prev);
  await usePdfStore.getState().replaceBytes(d.id, next);
  return { docId: d.id, prev };
}

export async function undoMutation(_a: unknown, patch: UndoPatch | null): Promise<void> {
  if (patch) await usePdfStore.getState().replaceBytes(patch.docId, patch.prev);
}

/** The pages a command should act on: the current selection, else the current page. */
export function targetPages(): number[] {
  const s = usePdfStore.getState();
  const d = s.getActive();
  if (!d) return [];
  return s.selection.length ? [...s.selection].sort((a, b) => a - b) : [d.currentPage - 1];
}
