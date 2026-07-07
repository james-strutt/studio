import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { mutateActive, undoMutation } from "@/editors/pdf/pdfMutate";
import { setFieldValue, flattenForm } from "@/editors/pdf/acroForm";
import { placeSignature } from "@/editors/pdf/pdfSign";

const valueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("check"), checked: z.boolean() }),
  z.object({ kind: z.literal("choice"), option: z.string() }),
]);

registerCommand({
  id: "pdf.fillField",
  title: "Fill form field",
  editor: "pdf",
  schema: z.object({ name: z.string(), value: valueSchema }),
  run: ({ name, value }) => mutateActive((bytes) => setFieldValue(bytes, name, value)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.flattenForm",
  title: "Flatten form fields",
  editor: "pdf",
  schema: z.object({}),
  run: () => mutateActive((bytes) => flattenForm(bytes)),
  undo: undoMutation,
});

registerCommand({
  id: "pdf.placeSignature",
  title: "Place signature",
  editor: "pdf",
  schema: z.object({
    pageIndex: z.number().int().nonnegative(),
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    bytes: z.instanceof(Uint8Array),
    isPng: z.boolean().default(true),
    date: z.string().optional(),
  }),
  run: ({ pageIndex, rect, bytes, isPng, date }) =>
    mutateActive((doc) => placeSignature(doc, pageIndex, rect, bytes, isPng, date)),
  undo: undoMutation,
});
