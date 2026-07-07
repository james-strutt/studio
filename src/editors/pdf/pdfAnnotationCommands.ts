import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { mutateActive, undoMutation } from "@/editors/pdf/pdfMutate";
import { addTextMarkupPages } from "@/editors/pdf/pdfAnnotations";

const rgbSchema = z.object({ r: z.number(), g: z.number(), b: z.number() });
const rectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const groupSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  rects: z.array(rectSchema),
});

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
