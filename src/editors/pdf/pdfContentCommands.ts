import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { mutateActive, undoMutation, targetPages } from "@/editors/pdf/pdfMutate";
import {
  addTextWatermark,
  addHeaderFooter,
  resizePages,
  setPageBackground,
  addLink,
} from "@/editors/pdf/pdfContent";

const rgbSchema = z.object({ r: z.number(), g: z.number(), b: z.number() });

registerCommand({
  id: "pdf.addWatermark",
  title: "Add watermark",
  editor: "pdf",
  schema: z.object({
    text: z.string().default("DRAFT"),
    opacity: z.number().min(0).max(1).default(0.15),
    fontSize: z.number().positive().default(60),
    rotation: z.number().default(45),
    tiled: z.boolean().default(false),
    color: rgbSchema.default({ r: 0.5, g: 0.5, b: 0.5 }),
  }),
  run: ({ text, opacity, fontSize, rotation, tiled, color }) =>
    mutateActive((bytes) => addTextWatermark(bytes, text, { opacity, fontSize, rotation, tiled, color })),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addHeaderFooter",
  title: "Add header / footer / Bates numbering",
  editor: "pdf",
  schema: z.object({
    header: z.string().optional(),
    footer: z.string().optional(),
    pageNumbers: z.boolean().default(false),
    bates: z
      .object({ prefix: z.string(), start: z.number().int(), digits: z.number().int().positive() })
      .optional(),
    fontSize: z.number().positive().default(9),
  }),
  run: (opts) => mutateActive((bytes) => addHeaderFooter(bytes, opts)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.resizePages",
  title: "Resize pages",
  editor: "pdf",
  schema: z.object({
    size: z.enum(["a4", "letter", "legal", "a3"]).default("a4"),
    scaleContent: z.boolean().default(true),
  }),
  run: ({ size, scaleContent }) => {
    const selected = targetPages();
    return mutateActive(async (bytes) => {
      const indices = selected.length ? selected : await everyIndex(bytes);
      return resizePages(bytes, indices, size, scaleContent);
    });
  },
  undo: undoMutation,
});

registerCommand({
  id: "pdf.setBackground",
  title: "Set page background colour",
  editor: "pdf",
  schema: z.object({ color: rgbSchema, allPages: z.boolean().default(true) }),
  run: ({ color, allPages }) =>
    mutateActive(async (bytes) => {
      const indices = allPages ? await everyIndex(bytes) : targetPages();
      return setPageBackground(bytes, indices, color);
    }),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.addLink",
  title: "Add link",
  editor: "pdf",
  schema: z.object({
    pageIndex: z.number().int().nonnegative(),
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    target: z.union([
      z.object({ kind: z.literal("uri"), uri: z.string() }),
      z.object({ kind: z.literal("page"), page: z.number().int().nonnegative() }),
    ]),
  }),
  run: ({ pageIndex, rect, target }) => mutateActive((bytes) => addLink(bytes, pageIndex, rect, target)),
  undo: undoMutation,
});

async function everyIndex(bytes: Uint8Array): Promise<number[]> {
  const { PDFDocument } = await import("pdf-lib");
  const n = (await PDFDocument.load(bytes)).getPageCount();
  return Array.from({ length: n }, (_v, i) => i);
}
