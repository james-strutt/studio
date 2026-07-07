import { useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";

type Tab = "text" | "pattern" | "sanitise";

export function PdfRedactDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>("text");
  const [words, setWords] = useState("");
  const [kind, setKind] = useState<"email" | "phone" | "custom">("email");
  const [custom, setCustom] = useState("");

  const apply = (): void => {
    if (tab === "text") {
      const needles = words.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
      if (needles.length) void dispatch("pdf.redactText", { needles });
    } else if (tab === "pattern") {
      void dispatch("pdf.redactPattern", { kind, custom: kind === "custom" ? custom : undefined });
    } else {
      void dispatch("pdf.sanitise", {});
    }
    onClose();
  };

  return (
    <Modal
      title="Redact & sanitise"
      onClose={onClose}
      footer={
        <>
          <span className="field-hint" style={{ marginRight: "auto" }}>
            Content is removed, not just hidden
          </span>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply}>
            {tab === "sanitise" ? "Sanitise" : "Redact"}
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Redaction mode">
        <button aria-pressed={tab === "text"} onClick={() => setTab("text")}>
          Text
        </button>
        <button aria-pressed={tab === "pattern"} onClick={() => setTab("pattern")}>
          Pattern
        </button>
        <button aria-pressed={tab === "sanitise"} onClick={() => setTab("sanitise")}>
          Sanitise
        </button>
      </div>

      {tab === "text" && (
        <label className="field">
          <span className="field-label">Words / phrases to redact (comma or newline separated)</span>
          <textarea className="input" rows={4} value={words} onChange={(e) => setWords(e.target.value)} />
        </label>
      )}

      {tab === "pattern" && (
        <>
          <label className="field">
            <span className="field-label">Pattern</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="email">Email addresses</option>
              <option value="phone">Phone numbers</option>
              <option value="custom">Custom regex</option>
            </select>
          </label>
          {kind === "custom" && (
            <label className="field">
              <span className="field-label">Regular expression</span>
              <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. \\bDOB\\b" />
            </label>
          )}
        </>
      )}

      {tab === "sanitise" && (
        <span className="field-hint">Clears document metadata (title/author/etc.) and garbage-collects the file.</span>
      )}
    </Modal>
  );
}
