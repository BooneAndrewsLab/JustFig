/**
 * Tiling patterns (hatching; issue 37, note 13): pdf.js hands a pattern fill
 * over as `['TilingPattern', colour, cellOps, matrix, bbox, xstep, ystep,
 * paintType, …]`. `pageToSvg` runs the cell's operators once per cell that
 * can touch the filled area, each cut to the cell's box and to the path, so
 * hatching ends up as plain lines and shapes (the export subset has no
 * `<pattern>`). This module reads the IR and works out which cells to run,
 * with a cap so a very fine pattern over a big area cannot blow up an import.
 */
import { type Matrix, IDENTITY, apply, determinant } from '../svg/matrix';
import type { PdfOpList } from './pageToSvg';

type Box = readonly [number, number, number, number];

export interface Tiling {
  /** The cell's operators, in pattern space. */
  readonly ops: PdfOpList;
  /** Pattern space → the space it is painted in (the page's, or a form's), set by the caller. */
  readonly matrix: Matrix;
  /** The cell's box in pattern space; each copy is clipped to it. */
  readonly bbox: Box;
  readonly xstep: number;
  readonly ystep: number;
  /** Uncoloured patterns (paint type 2) take this colour from `scn`; null for coloured ones. */
  readonly colour: string | null;
}

/** At most this many cells are run for one fill; a finer pattern becomes a flat fill. */
export const MAX_TILES = 5000;
/** …and at most this many cell operators in all (cells × the cell's length)… */
export const MAX_TILE_OPS = 200_000;
/** …and on one page, all its pattern fills together. */
export const MAX_PAGE_TILE_OPS = 1_000_000;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

function opList(v: unknown): PdfOpList | null {
  if (v === null || typeof v !== 'object') return null;
  const { fnArray, argsArray } = v as Partial<PdfOpList>;
  if (!fnArray || !argsArray || typeof fnArray.length !== 'number') return null;
  return { fnArray, argsArray };
}

/** pdf.js's tiling pattern IR → a `Tiling`, or null when it is not one or is unusable. */
export function readTiling(ir: unknown): Tiling | null {
  if (!Array.isArray(ir) || ir[0] !== 'TilingPattern') return null;
  const ops = opList(ir[2]);
  const m = Array.isArray(ir[3]) || ArrayBuffer.isView(ir[3]) ? Array.from(ir[3] as number[]) : [];
  const matrix = m.length === 6 && m.every(Number.isFinite) ? (m as unknown as Matrix) : IDENTITY;
  const b = Array.isArray(ir[4]) || ArrayBuffer.isView(ir[4]) ? Array.from(ir[4] as number[]) : [];
  const [x0, y0, x1, y1] = b.map(num);
  const xstep = Math.abs(num(ir[5]));
  const ystep = Math.abs(num(ir[6]));
  if (!ops || x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined)
    return null;
  const bbox: Box = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  if (!bbox.every(Number.isFinite) || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return null;
  if (!(xstep > 0) || !(ystep > 0)) return null;
  const colour = ir[7] === 2 && typeof ir[1] === 'string' ? ir[1] : null;
  return { ops, matrix, bbox, xstep, ystep, colour };
}

/**
 * The cell offsets (in pattern space) whose box can touch `area` (a box in
 * the space `m` maps pattern space to), or null when there are more than the
 * caps allow (`budget`: the cell operators the page has left). Empty when
 * `m` is degenerate.
 */
export function tileOffsets(
  t: Tiling,
  m: Matrix,
  area: Box,
  budget = MAX_TILE_OPS,
): [number, number][] | null {
  const det = determinant(m);
  if (!Number.isFinite(det) || det === 0) return [];
  const inv: Matrix = [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
  const corners = [
    apply(inv, area[0], area[1]),
    apply(inv, area[2], area[1]),
    apply(inv, area[2], area[3]),
    apply(inv, area[0], area[3]),
  ];
  const us = corners.map((p) => p[0]);
  const vs = corners.map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const i0 = Math.ceil((u0 - t.bbox[2]) / t.xstep);
  const i1 = Math.floor((u1 - t.bbox[0]) / t.xstep);
  const j0 = Math.ceil((v0 - t.bbox[3]) / t.ystep);
  const j1 = Math.floor((v1 - t.bbox[1]) / t.ystep);
  const n = Math.max(0, i1 - i0 + 1) * Math.max(0, j1 - j0 + 1);
  if (!Number.isFinite(n)) return null;
  const ops = n * Math.max(1, t.ops.fnArray.length);
  if (n > MAX_TILES || ops > Math.min(MAX_TILE_OPS, budget)) return null;
  const out: [number, number][] = [];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) out.push([i * t.xstep, j * t.ystep]);
  return out;
}

/**
 * Elements a pattern fill wrote, with paths of the same paint joined into one
 * (first-seen order), so a hatched bar is a few paths, not one per cell.
 * Left as they are when there is anything but plain paths among them.
 */
export function joinPaths(els: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const el of els) {
    const m = /^<path d="([^"]*)" (.*)\/>$/.exec(el);
    if (!m) return [...els];
    const attrs = m[2] ?? '';
    const d = dropInvisible(m[1] ?? '', attrs);
    if (!d) continue;
    const g = groups.get(attrs);
    if (g) g.push(d);
    else groups.set(attrs, [d]);
  }
  return [...groups].map(([attrs, ds]) => `<path d="${ds.join('')}" ${attrs}/>`);
}

/**
 * Path data (absolute M/L/C/Z, as `pageToSvg` writes it) without the
 * subpaths that paint nothing: with no area when only filled (a hatch line
 * matplotlib also fills, cut to a cell), a single point when stroked with
 * butt caps (a line cut at a cell's corner).
 */
function dropInvisible(d: string, attrs: string): string {
  const stroked = /(^| )stroke="(?!none)/.test(attrs);
  const filled = !/(^| )fill="none"/.test(attrs);
  const dots = stroked && /stroke-linecap="(round|square)"/.test(attrs);
  return d
    .split(/(?=M)/)
    .filter((sub) => {
      const n = (sub.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i] ?? 0, n[i + 1] ?? 0]);
      if (stroked) {
        const [x, y] = pts[0] ?? [0, 0];
        const point = pts.every((p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6);
        return !point || dots;
      }
      if (!filled) return false;
      let area = 0;
      pts.forEach(([x0, y0], i) => {
        const [x1, y1] = pts[(i + 1) % pts.length] ?? [x0, y0];
        area += x0 * y1 - x1 * y0;
      });
      return Math.abs(area) / 2 > 1e-4;
    })
    .join('');
}
