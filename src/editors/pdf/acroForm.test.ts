import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFormFields, setFieldValue, flattenForm } from "@/editors/pdf/acroForm";

/** A page carrying one field of each supported type. */
async function makeForm(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 500]);
  const form = pdf.getForm();
  form.createTextField("name").addToPage(page, { x: 10, y: 460, width: 120, height: 18 });
  form.createCheckBox("agree").addToPage(page, { x: 10, y: 430, width: 14, height: 14 });
  const radio = form.createRadioGroup("plan");
  radio.addOptionToPage("A", page, { x: 10, y: 400, width: 14, height: 14 });
  radio.addOptionToPage("B", page, { x: 40, y: 400, width: 14, height: 14 });
  const dd = form.createDropdown("colour");
  dd.addOptions(["red", "green", "blue"]);
  dd.addToPage(page, { x: 10, y: 360, width: 100, height: 18 });
  return pdf.save();
}

describe("AcroForm fill", () => {
  it("reads every field type with its options", async () => {
    const fields = await readFormFields(await makeForm());
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.name.type).toBe("text");
    expect(byName.agree.type).toBe("checkbox");
    expect(byName.plan).toMatchObject({ type: "radio", options: ["A", "B"] });
    expect(byName.colour).toMatchObject({ type: "dropdown", options: ["red", "green", "blue"] });
  });

  it("fills text, checkbox, radio and dropdown values", async () => {
    let bytes = await makeForm();
    bytes = await setFieldValue(bytes, "name", { kind: "text", text: "Ada" });
    bytes = await setFieldValue(bytes, "agree", { kind: "check", checked: true });
    bytes = await setFieldValue(bytes, "plan", { kind: "choice", option: "B" });
    bytes = await setFieldValue(bytes, "colour", { kind: "choice", option: "green" });
    const byName = Object.fromEntries((await readFormFields(bytes)).map((f) => [f.name, f]));
    expect(byName.name.value).toBe("Ada");
    expect(byName.agree.checked).toBe(true);
    expect(byName.plan.value).toBe("B");
    expect(byName.colour.value).toBe("green");
  });

  it("flatten removes all interactive fields", async () => {
    let bytes = await makeForm();
    bytes = await setFieldValue(bytes, "name", { kind: "text", text: "Ada" });
    bytes = await flattenForm(bytes);
    expect(await readFormFields(bytes)).toHaveLength(0);
  });
});
