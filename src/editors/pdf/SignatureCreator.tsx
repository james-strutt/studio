import { useRef, useState } from "react";
import { Modal } from "@/shell/Modal";
import { getFileService } from "@/files/fileService";
import { saveSignature, type StoredSignature } from "@/editors/pdf/signatureStore";

type Mode = "draw" | "type" | "upload";

const TYPE_FONTS = [
  '32px "Segoe Script", "Bradley Hand", cursive',
  'italic 34px "Palatino Linotype", "Book Antiqua", serif',
  '30px "Comic Sans MS", "Chalkboard", cursive',
];

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(new Uint8Array());
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)));
    }, "image/png");
  });
}

export function SignatureCreator({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (sig: StoredSignature) => void;
}): JSX.Element {
  const [mode, setMode] = useState<Mode>("draw");
  const [typed, setTyped] = useState("");
  const [fontIdx, setFontIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const ctx = (): CanvasRenderingContext2D | null => canvasRef.current?.getContext("2d") ?? null;
  const posn = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e: React.PointerEvent): void => {
    const c = ctx();
    if (!c) return;
    drawing.current = true;
    c.lineWidth = 2.5;
    c.lineCap = "round";
    c.strokeStyle = "#111";
    c.beginPath();
    c.moveTo(...posn(e));
  };
  const move = (e: React.PointerEvent): void => {
    const c = ctx();
    if (!drawing.current || !c) return;
    c.lineTo(...posn(e));
    c.stroke();
  };
  const clear = (): void => {
    const c = ctx();
    if (c && canvasRef.current) c.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const renderTyped = (): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    const c = canvas.getContext("2d")!;
    c.font = TYPE_FONTS[fontIdx];
    const w = Math.max(120, c.measureText(typed || " ").width + 40);
    canvas.width = w;
    canvas.height = 80;
    const c2 = canvas.getContext("2d")!;
    c2.font = TYPE_FONTS[fontIdx];
    c2.fillStyle = "#111";
    c2.textBaseline = "middle";
    c2.fillText(typed, 20, 44);
    return canvas;
  };

  const save = async (): Promise<void> => {
    let bytes: Uint8Array | null = null;
    let name = "Signature";
    if (mode === "draw" && canvasRef.current) {
      bytes = await canvasToPng(canvasRef.current);
    } else if (mode === "type" && typed.trim()) {
      bytes = await canvasToPng(renderTyped());
      name = typed.trim();
    } else if (mode === "upload") {
      const file = await getFileService().open({ accept: [".png"] });
      if (file) {
        bytes = file.data;
        name = file.name;
      }
    }
    if (!bytes || bytes.length === 0) return;
    const sig = await saveSignature(name, bytes);
    onSaved(sig);
    onClose();
  };

  return (
    <Modal
      title="Create signature"
      onClose={onClose}
      footer={
        <>
          {mode === "draw" && (
            <button className="btn btn-quiet" style={{ marginRight: "auto" }} onClick={clear}>
              Clear
            </button>
          )}
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            Save signature
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Signature mode">
        <button aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>
          Draw
        </button>
        <button aria-pressed={mode === "type"} onClick={() => setMode("type")}>
          Type
        </button>
        <button aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>
          Upload
        </button>
      </div>

      {mode === "draw" && (
        <canvas
          ref={canvasRef}
          className="sig-canvas"
          width={460}
          height={160}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        />
      )}

      {mode === "type" && (
        <>
          <input
            className="input"
            placeholder="Type your name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="sig-fonts">
            {TYPE_FONTS.map((f, i) => (
              <button
                key={i}
                className={`sig-font-option${i === fontIdx ? " is-active" : ""}`}
                style={{ font: f }}
                onClick={() => setFontIdx(i)}
              >
                {typed || "Signature"}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "upload" && (
        <span className="field-hint">Choose a transparent PNG of your signature when you save.</span>
      )}
    </Modal>
  );
}
