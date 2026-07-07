import { useState } from "react";
import { Modal } from "@/shell/Modal";
import { dispatch } from "@/commands/history";

type Tab = "watermark" | "headfoot" | "size" | "background";
type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function PdfContentDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>("watermark");

  // Watermark
  const [wmText, setWmText] = useState("DRAFT");
  const [wmOpacity, setWmOpacity] = useState(0.15);
  const [wmSize, setWmSize] = useState(60);
  const [wmRot, setWmRot] = useState(45);
  const [wmTiled, setWmTiled] = useState(false);
  const [wmColor, setWmColor] = useState("#808080");

  // Header / footer
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [pageNums, setPageNums] = useState(true);
  const [batesOn, setBatesOn] = useState(false);
  const [batesPrefix, setBatesPrefix] = useState("DOC");
  const [batesStart, setBatesStart] = useState(1);
  const [batesDigits, setBatesDigits] = useState(6);

  // Page size / background
  const [size, setSize] = useState<"a4" | "letter" | "legal" | "a3">("a4");
  const [scaleContent, setScaleContent] = useState(true);
  const [bgColor, setBgColor] = useState("#fffef5");

  const apply = (): void => {
    if (tab === "watermark") {
      void dispatch("pdf.addWatermark", {
        text: wmText,
        opacity: wmOpacity,
        fontSize: wmSize,
        rotation: wmRot,
        tiled: wmTiled,
        color: hexToRgb(wmColor),
      });
    } else if (tab === "headfoot") {
      void dispatch("pdf.addHeaderFooter", {
        header: header || undefined,
        footer: footer || undefined,
        pageNumbers: pageNums,
        bates: batesOn ? { prefix: batesPrefix, start: batesStart, digits: batesDigits } : undefined,
        fontSize: 9,
      });
    } else if (tab === "size") {
      void dispatch("pdf.resizePages", { size, scaleContent });
    } else {
      void dispatch("pdf.setBackground", { color: hexToRgb(bgColor), allPages: true });
    }
    onClose();
  };

  return (
    <Modal
      title="Page setup"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Page setup tool">
        <button aria-pressed={tab === "watermark"} onClick={() => setTab("watermark")}>
          Watermark
        </button>
        <button aria-pressed={tab === "headfoot"} onClick={() => setTab("headfoot")}>
          Header/Footer
        </button>
        <button aria-pressed={tab === "size"} onClick={() => setTab("size")}>
          Page size
        </button>
        <button aria-pressed={tab === "background"} onClick={() => setTab("background")}>
          Background
        </button>
      </div>

      {tab === "watermark" && (
        <>
          <label className="field">
            <span className="field-label">Text</span>
            <input className="input" value={wmText} onChange={(e) => setWmText(e.target.value)} />
          </label>
          <div className="pdf-cal-row">
            <label className="field">
              <span className="field-label">Opacity {Math.round(wmOpacity * 100)}%</span>
              <input type="range" min={0.02} max={1} step={0.02} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">Size</span>
              <input className="input" type="number" value={wmSize} onChange={(e) => setWmSize(Number(e.target.value) || 60)} />
            </label>
          </div>
          <div className="pdf-cal-row">
            <label className="field">
              <span className="field-label">Rotation°</span>
              <input className="input" type="number" value={wmRot} onChange={(e) => setWmRot(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="field-label">Colour</span>
              <input type="color" className="img-color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Tiled</span>
              <input type="checkbox" checked={wmTiled} onChange={(e) => setWmTiled(e.target.checked)} />
            </label>
          </div>
        </>
      )}

      {tab === "headfoot" && (
        <>
          <label className="field">
            <span className="field-label">Header</span>
            <input className="input" value={header} onChange={(e) => setHeader(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Footer</span>
            <input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} />
          </label>
          <label className="pdf-menu-check">
            <input type="checkbox" checked={pageNums} onChange={(e) => setPageNums(e.target.checked)} />
            Page numbers (n / total)
          </label>
          <label className="pdf-menu-check">
            <input type="checkbox" checked={batesOn} onChange={(e) => setBatesOn(e.target.checked)} />
            Bates numbering
          </label>
          {batesOn && (
            <div className="pdf-cal-row">
              <label className="field">
                <span className="field-label">Prefix</span>
                <input className="input" value={batesPrefix} onChange={(e) => setBatesPrefix(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Start</span>
                <input className="input" type="number" value={batesStart} onChange={(e) => setBatesStart(Number(e.target.value) || 1)} />
              </label>
              <label className="field">
                <span className="field-label">Digits</span>
                <input className="input" type="number" value={batesDigits} onChange={(e) => setBatesDigits(Number(e.target.value) || 6)} />
              </label>
            </div>
          )}
        </>
      )}

      {tab === "size" && (
        <>
          <label className="field">
            <span className="field-label">Page size (selection, or all pages)</span>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="legal">Legal</option>
              <option value="a3">A3</option>
            </select>
          </label>
          <label className="pdf-menu-check">
            <input type="checkbox" checked={scaleContent} onChange={(e) => setScaleContent(e.target.checked)} />
            Scale content to fit
          </label>
        </>
      )}

      {tab === "background" && (
        <label className="field">
          <span className="field-label">Background colour (all pages)</span>
          <input type="color" className="img-color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
        </label>
      )}
    </Modal>
  );
}
