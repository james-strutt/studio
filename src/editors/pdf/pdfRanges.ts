/**
 * Parse a human page-range spec like "1-3, 5, 8-10" into inclusive 0-based
 * [start, end] pairs. Input is 1-based (what users see). Whitespace is ignored,
 * reversed ranges (e.g. "5-3") are normalised, values are clamped to
 * [1, totalPages], and unparseable/out-of-range tokens are skipped rather than
 * throwing — the UI validates emptiness for feedback.
 */
export function parsePageRanges(spec: string, totalPages: number): [number, number][] {
  const out: [number, number][] = [];
  for (const raw of spec.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    const lo = Math.max(1, Math.min(a, b));
    const hi = Math.min(totalPages, Math.max(a, b));
    if (lo > totalPages || hi < 1 || lo > hi) continue;
    out.push([lo - 1, hi - 1]);
  }
  return out;
}
