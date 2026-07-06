export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a crop rectangle drawn on the page preview into a PDF crop box.
 *
 * The preview uses top-left origin CSS pixels at `scale` (preview px per PDF
 * point). PDF user space uses a bottom-left origin in points, so the Y axis is
 * flipped: a rect `h` px tall sitting `y` px from the top maps to a box whose
 * bottom edge is `pageHeightPts - (y + h)/scale` up from the page bottom.
 *
 * Assumes the preview was rendered without view rotation and the page has no
 * intrinsic /Rotate (the common case); rotated media is out of scope here.
 */
export function cropRectToPdfBox(rect: PreviewRect, scale: number, pageHeightPts: number): PdfBox {
  return {
    x: rect.x / scale,
    y: pageHeightPts - (rect.y + rect.h) / scale,
    width: rect.w / scale,
    height: rect.h / scale,
  };
}
