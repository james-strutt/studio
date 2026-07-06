import { describe, it, expect, beforeEach } from "vitest";
import "@/commands/coreCommands";
import { dispatch, undo, redo, historyState } from "@/commands/history";
import { useDemoStore } from "@/commands/demoCommand";

describe("command history", () => {
  beforeEach(() => useDemoStore.getState().set(0));

  it("runs a command and reverses it with undo/redo", async () => {
    await dispatch("demo.increment", { by: 3 });
    expect(useDemoStore.getState().count).toBe(3);

    await undo();
    expect(useDemoStore.getState().count).toBe(0);

    await redo();
    expect(useDemoStore.getState().count).toBe(3);
  });

  it("rejects args that fail the zod schema", async () => {
    await expect(dispatch("demo.increment", { by: "nope" })).rejects.toThrow();
  });

  it("does not push query-only commands onto the undo stack", async () => {
    const doc = "doc-query-only";
    await dispatch("editor.pdf", {}, doc);
    expect(historyState(doc).canUndo).toBe(false);
  });
});
