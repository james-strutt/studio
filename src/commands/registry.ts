import type { ZodType, ZodTypeDef } from "zod";
import type { EditorId } from "@/store/useShellStore";

export interface CommandContext {
  documentId: string;
}

export interface CommandDef<A = void, P = void> {
  id: string;
  title: string;
  editor?: EditorId | "global";
  shortcut?: string;
  schema: ZodType<A, ZodTypeDef, unknown>;
  run: (args: A, ctx: CommandContext) => P | Promise<P>;
  undo?: (args: A, patch: P, ctx: CommandContext) => void | Promise<void>;
}

const registry = new Map<string, CommandDef<unknown, unknown>>();

export function registerCommand<A, P>(def: CommandDef<A, P>): void {
  if (registry.has(def.id)) {
    throw new Error(`Command already registered: ${def.id}`);
  }
  registry.set(def.id, def as unknown as CommandDef<unknown, unknown>);
}

export function getCommand(id: string): CommandDef<unknown, unknown> | undefined {
  return registry.get(id);
}

export function allCommands(): CommandDef<unknown, unknown>[] {
  return [...registry.values()];
}
