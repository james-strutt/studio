import { getCommand, type CommandContext } from "@/commands/registry";

interface Entry {
  id: string;
  args: unknown;
  patch: unknown;
  ctx: CommandContext;
}

const stacks = new Map<string, { undo: Entry[]; redo: Entry[] }>();
const listeners = new Set<() => void>();

function stackFor(documentId: string): { undo: Entry[]; redo: Entry[] } {
  let s = stacks.get(documentId);
  if (!s) {
    s = { undo: [], redo: [] };
    stacks.set(documentId, s);
  }
  return s;
}

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function dispatch(
  id: string,
  rawArgs: unknown,
  documentId = "default",
): Promise<unknown> {
  const cmd = getCommand(id);
  if (!cmd) throw new Error(`Unknown command: ${id}`);
  const ctx: CommandContext = { documentId };
  const args = cmd.schema.parse(rawArgs);
  const patch = await cmd.run(args, ctx);
  if (cmd.undo) {
    const s = stackFor(documentId);
    s.undo.push({ id, args, patch, ctx });
    s.redo = [];
    emit();
  }
  return patch;
}

export async function undo(documentId = "default"): Promise<boolean> {
  const s = stackFor(documentId);
  const entry = s.undo.pop();
  if (!entry) return false;
  const cmd = getCommand(entry.id);
  await cmd?.undo?.(entry.args, entry.patch, entry.ctx);
  s.redo.push(entry);
  emit();
  return true;
}

export async function redo(documentId = "default"): Promise<boolean> {
  const s = stackFor(documentId);
  const entry = s.redo.pop();
  if (!entry) return false;
  const cmd = getCommand(entry.id);
  if (!cmd) return false;
  const patch = await cmd.run(entry.args, entry.ctx);
  s.undo.push({ ...entry, patch });
  emit();
  return true;
}

export function historyState(documentId = "default"): {
  canUndo: boolean;
  canRedo: boolean;
} {
  const s = stackFor(documentId);
  return { canUndo: s.undo.length > 0, canRedo: s.redo.length > 0 };
}
