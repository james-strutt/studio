import { useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";
import { ALLOW_ALL, type Permissions } from "@/editors/pdf/pdfSecurity";

const PERM_LABELS: { key: keyof Permissions; label: string }[] = [
  { key: "print", label: "Printing" },
  { key: "printHighRes", label: "High-res printing" },
  { key: "copy", label: "Copying text" },
  { key: "modify", label: "Editing" },
  { key: "annotate", label: "Annotating" },
  { key: "fillForms", label: "Filling forms" },
  { key: "extract", label: "Accessibility extract" },
  { key: "assemble", label: "Assembling pages" },
];

export function PdfProtectDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<"protect" | "remove">("protect");
  const [userPw, setUserPw] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [perms, setPerms] = useState<Permissions>({ ...ALLOW_ALL });
  const [removePw, setRemovePw] = useState("");

  const protect = (): void => {
    if (!userPw && !ownerPw) return;
    void dispatch("pdf.addPassword", {
      userPassword: userPw || undefined,
      ownerPassword: ownerPw || undefined,
      permissions: perms,
    });
    onClose();
  };

  const remove = (): void => {
    void dispatch("pdf.removePassword", { password: removePw });
    onClose();
  };

  return (
    <Modal
      title="Password & permissions"
      onClose={onClose}
      footer={
        tab === "protect" ? (
          <>
            <span className="field-hint" style={{ marginRight: "auto" }}>
              Saves a protected copy (AES-256)
            </span>
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!userPw && !ownerPw} onClick={protect}>
              Protect & save
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={remove}>
              Choose file & unlock
            </button>
          </>
        )
      }
    >
      <div className="seg" role="group" aria-label="Mode">
        <button aria-pressed={tab === "protect"} onClick={() => setTab("protect")}>
          Protect
        </button>
        <button aria-pressed={tab === "remove"} onClick={() => setTab("remove")}>
          Remove
        </button>
      </div>

      {tab === "protect" ? (
        <>
          <label className="field">
            <span className="field-label">Open password (leave blank for none)</span>
            <input className="input" type="password" value={userPw} onChange={(e) => setUserPw(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Permissions (owner) password</span>
            <input className="input" type="password" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} />
          </label>
          <div className="field-label">Allowed with permissions password:</div>
          <div className="pdf-perms">
            {PERM_LABELS.map((p) => (
              <label key={p.key} className="pdf-menu-check">
                <input
                  type="checkbox"
                  checked={perms[p.key]}
                  onChange={(e) => setPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                />
                {p.label}
              </label>
            ))}
          </div>
        </>
      ) : (
        <label className="field">
          <span className="field-label">Current password</span>
          <input className="input" type="password" value={removePw} onChange={(e) => setRemovePw(e.target.value)} />
          <span className="field-hint">Choose the encrypted PDF after clicking unlock.</span>
        </label>
      )}
    </Modal>
  );
}
