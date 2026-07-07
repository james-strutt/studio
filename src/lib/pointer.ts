export interface Point {
  x: number;
  y: number;
}

/**
 * The app shell runs under a global CSS zoom (see global.css), so client
 * (visual) coordinates are larger than element-layout pixels by the zoom
 * factor. Everything that maps pointer events onto canvases/overlays must go
 * through these helpers rather than raw `clientX - rect.left`.
 */

/** Visual→layout scale factors for an element (also corrects CSS transforms). */
export function localScale(el: HTMLElement): Point {
  const r = el.getBoundingClientRect();
  return {
    x: r.width > 0 ? el.clientWidth / r.width || 1 : 1,
    y: r.height > 0 ? el.clientHeight / r.height || 1 : 1,
  };
}

/** Element-local layout-px position of a client coordinate. */
export function localPoint(el: HTMLElement, clientX: number, clientY: number): Point {
  const r = el.getBoundingClientRect();
  const s = localScale(el);
  return { x: (clientX - r.left) * s.x, y: (clientY - r.top) * s.y };
}

/** Client coords → page-layout coords for `position: fixed` UI (popups, menus). */
export function fixedPosition(clientX: number, clientY: number): Point {
  const doc = document.documentElement;
  const s = doc.clientWidth / doc.getBoundingClientRect().width || 1;
  return { x: clientX * s, y: clientY * s };
}
