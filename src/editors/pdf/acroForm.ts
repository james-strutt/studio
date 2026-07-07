import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from "pdf-lib";

type Bytes = Uint8Array;

export type FieldType =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "optionlist"
  | "button"
  | "signature"
  | "unknown";

export interface FormField {
  name: string;
  type: FieldType;
  value: string;
  checked: boolean;
  options: string[];
  selected: string[];
}

/** Read every AcroForm field with its current value and (for choices) options. */
export async function readFormFields(bytes: Bytes): Promise<FormField[]> {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  return form.getFields().map((f): FormField => {
    const name = f.getName();
    const base: FormField = { name, type: "unknown", value: "", checked: false, options: [], selected: [] };
    if (f instanceof PDFTextField) return { ...base, type: "text", value: f.getText() ?? "" };
    if (f instanceof PDFCheckBox) return { ...base, type: "checkbox", checked: f.isChecked() };
    if (f instanceof PDFRadioGroup)
      return { ...base, type: "radio", value: f.getSelected() ?? "", options: f.getOptions() };
    if (f instanceof PDFDropdown)
      return {
        ...base,
        type: "dropdown",
        value: f.getSelected()[0] ?? "",
        options: f.getOptions(),
        selected: f.getSelected(),
      };
    if (f instanceof PDFOptionList)
      return { ...base, type: "optionlist", options: f.getOptions(), selected: f.getSelected() };
    return base;
  });
}

export type FieldValue =
  | { kind: "text"; text: string }
  | { kind: "check"; checked: boolean }
  | { kind: "choice"; option: string };

/** Set one field's value by name, regenerating its appearance. */
export async function setFieldValue(bytes: Bytes, name: string, value: FieldValue): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const field = form.getFields().find((f) => f.getName() === name);
  if (!field) return bytes;
  if (value.kind === "text" && field instanceof PDFTextField) {
    field.setText(value.text);
  } else if (value.kind === "check" && field instanceof PDFCheckBox) {
    if (value.checked) field.check();
    else field.uncheck();
  } else if (value.kind === "choice") {
    if (field instanceof PDFRadioGroup) field.select(value.option);
    else if (field instanceof PDFDropdown) field.select(value.option);
    else if (field instanceof PDFOptionList) field.select(value.option);
  }
  return pdf.save();
}

/** Flatten all form fields into static page content (removes interactivity). */
export async function flattenForm(bytes: Bytes): Promise<Bytes> {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  form.flatten();
  return pdf.save();
}
