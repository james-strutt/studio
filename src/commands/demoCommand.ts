import { z } from "zod";
import { create } from "zustand";
import { registerCommand } from "@/commands/registry";

interface DemoState {
  count: number;
  set: (n: number) => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  count: 0,
  set: (count) => set({ count }),
}));

const argsSchema = z.object({ by: z.number().int().default(1) });

registerCommand<{ by: number }, { by: number }>({
  id: "demo.increment",
  title: "Demo: increment counter",
  editor: "global",
  schema: argsSchema,
  run: ({ by }) => {
    useDemoStore.getState().set(useDemoStore.getState().count + by);
    return { by };
  },
  undo: (_args, { by }) => {
    useDemoStore.getState().set(useDemoStore.getState().count - by);
  },
});
