import { useEffect, useState } from "react";
import { type PdfDoc } from "@/editors/pdf/pdfStore";
import { dispatch } from "@/commands/history";
import { readFormFields, type FormField, type FieldValue } from "@/editors/pdf/acroForm";

function FieldRow({ field }: { field: FormField }): JSX.Element {
  const fill = (value: FieldValue): void => {
    void dispatch("pdf.fillField", { name: field.name, value });
  };

  return (
    <label className="pdf-form-field">
      <span className="pdf-form-name">{field.name}</span>
      {field.type === "text" && (
        <input
          className="input"
          defaultValue={field.value}
          onBlur={(e) => fill({ kind: "text", text: e.target.value })}
        />
      )}
      {field.type === "checkbox" && (
        <input
          type="checkbox"
          checked={field.checked}
          onChange={(e) => fill({ kind: "check", checked: e.target.checked })}
        />
      )}
      {(field.type === "radio" || field.type === "dropdown" || field.type === "optionlist") && (
        <select
          className="input"
          value={field.value || field.selected[0] || ""}
          onChange={(e) => fill({ kind: "choice", option: e.target.value })}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

export function PdfForm({ doc }: { doc: PdfDoc }): JSX.Element {
  const [fields, setFields] = useState<FormField[] | null>(null);

  useEffect(() => {
    let alive = true;
    setFields(null);
    void readFormFields(doc.bytes).then((f) => alive && setFields(f));
    return () => {
      alive = false;
    };
  }, [doc.bytes]);

  if (fields === null) return <div className="pdf-panel-empty">Reading form…</div>;
  if (fields.length === 0) return <div className="pdf-panel-empty">This PDF has no form fields.</div>;

  return (
    <div className="pdf-form">
      <div className="pdf-form-bar">
        <span>
          {fields.length} field{fields.length === 1 ? "" : "s"}
        </span>
        <button className="btn btn-quiet" onClick={() => void dispatch("pdf.flattenForm", {})}>
          Flatten
        </button>
      </div>
      <div className="pdf-form-fields">
        {fields.map((f) => (
          <FieldRow key={f.name} field={f} />
        ))}
      </div>
    </div>
  );
}
