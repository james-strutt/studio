import { useEffect, useRef } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  /** Render a selectable pdf.js text layer over the canvas (main viewer only). */
  textLayer?: boolean;
  /** Unrotated page height in points — attached to the text layer for markup mapping. */
  pageHeightPts?: number;
}

export function PdfPage({
  doc,
  pageNumber,
  scale,
  rotation,
  textLayer = false,
  pageHeightPts,
}: PdfPageProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale, rotation });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      task = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        /* render cancelled by cleanup; expected */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale, rotation]);

  useEffect(() => {
    if (!textLayer) return;
    const container = textRef.current;
    if (!container) return;
    let cancelled = false;
    let layer: TextLayer | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale, rotation });
      container.replaceChildren();
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
      try {
        await layer.render();
      } catch {
        /* cancelled */
      }
    })();

    return () => {
      cancelled = true;
      layer?.cancel();
    };
  }, [doc, pageNumber, scale, rotation, textLayer]);

  return (
    <div className="pdf-page-inner">
      <canvas ref={canvasRef} className="pdf-canvas" />
      {textLayer && (
        <div
          ref={textRef}
          className="pdf-text-layer"
          data-page-index={pageNumber - 1}
          data-page-height={pageHeightPts}
          style={{ ["--scale-factor" as string]: scale }}
        />
      )}
    </div>
  );
}
