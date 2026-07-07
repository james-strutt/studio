import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { mutateActive, undoMutation } from "@/editors/pdf/pdfMutate";
import {
  addTextMarkupPages,
  addInk,
  addShape,
  addLine,
  addPolygon,
  addTextNote,
  addFreeText,
  addStampText,
  addStampImage,
  addMeasurement,
  addReply,
  setAnnotState,
} from "@/editors/pdf/pdfAnnotations";

const rgbSchema = z.object({ r: z.number(), g: z.number(), b: z.number() });
const rectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const groupSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  rects: z.array(rectSchema),
});
const pageIdx = z.number().int().nonnegative();
const width = z.number().positive();

// Text-selection markup. `groups` carries the marked line rectangles per page
// (a selection can cross a page boundary), so the whole markup lands as one
// undoable mutation.
registerCommand({
  id: "pdf.addMarkup",
  title: "Add text markup",
  editor: "pdf",
  schema: z.object({
    groups: z.array(groupSchema),
    subtype: z.enum(["Highlight", "Underline", "StrikeOut", "Squiggly"]),
    color: rgbSchema,
  }),
  run: ({ groups, subtype, color }) => {
    if (groups.every((g) => g.rects.length === 0)) return null;
    return mutateActive((bytes) => addTextMarkupPages(bytes, groups, subtype, color));
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addInk",
  title: "Add freehand ink",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    paths: z.array(z.array(z.number())),
    color: rgbSchema,
    width,
  }),
  run: ({ pageIndex, paths, color, width }) =>
    mutateActive((bytes) => addInk(bytes, pageIndex, paths, color, width)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addShape",
  title: "Add shape",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    kind: z.enum(["Square", "Circle"]),
    rect: rectSchema,
    color: rgbSchema,
    width,
    fill: rgbSchema.nullable().default(null),
  }),
  run: ({ pageIndex, kind, rect, color, width, fill }) =>
    mutateActive((bytes) => addShape(bytes, pageIndex, kind, rect, color, width, fill)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addLine",
  title: "Add line or arrow",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    p: rectSchema,
    color: rgbSchema,
    width,
    arrow: z.boolean().default(false),
  }),
  run: ({ pageIndex, p, color, width, arrow }) =>
    mutateActive((bytes) => addLine(bytes, pageIndex, p, color, width, arrow)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addPolygon",
  title: "Add polygon",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    vertices: z.array(z.number()),
    color: rgbSchema,
    width,
    fill: rgbSchema.nullable().default(null),
  }),
  run: ({ pageIndex, vertices, color, width, fill }) =>
    mutateActive((bytes) => addPolygon(bytes, pageIndex, vertices, color, width, fill)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addNote",
  title: "Add sticky note",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    x: z.number(),
    y: z.number(),
    contents: z.string(),
    color: rgbSchema,
  }),
  run: ({ pageIndex, x, y, contents, color }) =>
    mutateActive((bytes) => addTextNote(bytes, pageIndex, x, y, contents, color)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addTextBox",
  title: "Add text box",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    rect: rectSchema,
    contents: z.string(),
    color: rgbSchema,
    fontSize: z.number().positive().default(14),
  }),
  run: ({ pageIndex, rect, contents, color, fontSize }) =>
    mutateActive((bytes) => addFreeText(bytes, pageIndex, rect, contents, color, fontSize)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addStampText",
  title: "Add stamp",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    rect: rectSchema,
    label: z.string(),
    color: rgbSchema,
  }),
  run: ({ pageIndex, rect, label, color }) =>
    mutateActive((bytes) => addStampText(bytes, pageIndex, rect, label, color)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addStampImage",
  title: "Add image stamp",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    rect: rectSchema,
    bytes: z.instanceof(Uint8Array),
    isPng: z.boolean(),
  }),
  run: ({ pageIndex, rect, bytes, isPng }) =>
    mutateActive((doc) => addStampImage(doc, pageIndex, rect, bytes, isPng)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addMeasurement",
  title: "Add measurement",
  editor: "pdf",
  schema: z.object({
    pageIndex: pageIdx,
    kind: z.enum(["distance", "perimeter", "area"]),
    points: z.array(z.number()),
    label: z.string(),
    color: rgbSchema,
    width,
  }),
  run: ({ pageIndex, kind, points, label, color, width }) =>
    mutateActive((bytes) => addMeasurement(bytes, pageIndex, kind, points, label, color, width)),
  undo: undoMutation,
});

const parentSchema = z.object({
  pageIndex: pageIdx,
  parent: z.object({ obj: z.number().int(), gen: z.number().int() }),
});

registerCommand({
  id: "pdf.addReply",
  title: "Reply to comment",
  editor: "pdf",
  schema: parentSchema.extend({ contents: z.string() }),
  run: ({ pageIndex, parent, contents }) =>
    mutateActive((bytes) => addReply(bytes, pageIndex, parent, contents)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.setCommentState",
  title: "Resolve or reopen comment",
  editor: "pdf",
  schema: parentSchema.extend({ state: z.enum(["Completed", "None"]) }),
  run: ({ pageIndex, parent, state }) =>
    mutateActive((bytes) => setAnnotState(bytes, pageIndex, parent, state)),
  undo: undoMutation,
});
