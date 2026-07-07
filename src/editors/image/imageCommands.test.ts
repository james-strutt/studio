import { describe, it, expect, beforeEach } from "vitest";
import "@/editors/image/imageCommands";
import { dispatch, undo } from "@/commands/history";
import { useImageStore } from "@/editors/image/useImageStore";

const DOC = "imgtest";
const layers = () => useImageStore.getState().getDoc()!.layers;

beforeEach(() => {
  useImageStore.getState().createDoc("t", 200, 200);
});

describe("image commands", () => {
  it("adds a text layer and undoes it", async () => {
    await dispatch("image.addText", { text: "Hi" }, DOC);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].type).toBe("text");
    await undo(DOC);
    expect(layers()).toHaveLength(0);
  });

  it("reorders and updates layer props with undo", async () => {
    await dispatch("image.addShape", { shape: "rect" }, DOC);
    await dispatch("image.addText", { text: "A" }, DOC);
    const textId = layers()[1].id;
    await dispatch("image.setLayerProp", { id: textId, patch: { opacity: 0.5 } }, DOC);
    expect(layers()[1].opacity).toBe(0.5);
    await undo(DOC);
    expect(layers()[1].opacity).toBe(1);

    await dispatch("image.reorderLayer", { from: 0, to: 1 }, DOC);
    expect(layers()[0].id).toBe(textId);
  });

  it("removes a layer", async () => {
    await dispatch("image.addShape", { shape: "ellipse" }, DOC);
    const id = layers()[0].id;
    await dispatch("image.removeLayer", { id }, DOC);
    expect(layers()).toHaveLength(0);
  });
});
