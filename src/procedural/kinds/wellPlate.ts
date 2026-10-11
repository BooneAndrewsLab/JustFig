/**
 * Multi-well plate, 6 to 1536 wells, with a colour per well (note 04).
 * Wells of one colour are one `<path>`, so a full 1536-well plate is a
 * handful of DOM nodes.
 */
import { type Prim, type Sub, circle, pathPrim, poly, rect } from '../prims';
import { type WellMap, defineKind } from '../types';
import { byColour, mix, rowLabel, text } from './util';

export const PLATE_FORMATS = {
  '6': { rows: 2, cols: 3 },
  '12': { rows: 3, cols: 4 },
  '24': { rows: 4, cols: 6 },
  '48': { rows: 6, cols: 8 },
  '96': { rows: 8, cols: 12 },
  '384': { rows: 16, cols: 24 },
  '1536': { rows: 32, cols: 48 },
} as const;
export type PlateFormat = keyof typeof PLATE_FORMATS;

export interface WellPlateParams {
  readonly format: PlateFormat;
  readonly shape: 'circle' | 'square';
  readonly showLabels: boolean;
  readonly outline: boolean;
  readonly wells: WellMap;
}

export const gridOf = (format: unknown): { rows: number; cols: number } =>
  PLATE_FORMATS[
    (Object.hasOwn(PLATE_FORMATS, String(format)) ? String(format) : '96') as PlateFormat
  ];

export const wellId = (row: number, col: number): string => `${rowLabel(row)}${String(col + 1)}`;

/** Where the wells go in a w × h frame. */
export function plateLayout(p: WellPlateParams, w: number, h: number) {
  const { rows, cols } = gridOf(p.format);
  const pad = Math.min(w, h) * 0.05;
  const probe = Math.min((w - 2 * pad) / (cols + 1), (h - 2 * pad) / (rows + 1));
  const label = p.showLabels ? Math.max(0, Math.min(9, probe * 0.55)) : 0;
  const left = pad + (p.showLabels ? label * 1.7 : 0);
  const top = pad + (p.showLabels ? label * 1.5 : 0);
  const gw = Math.max(0, w - left - pad);
  const gh = Math.max(0, h - top - pad);
  const pitch = Math.max(0, Math.min(gw / cols, gh / rows));
  const x0 = left + (gw - pitch * cols) / 2;
  const y0 = top + (gh - pitch * rows) / 2;
  return { rows, cols, pitch, x0, y0, label, left, top, pad };
}

/** A 96-well map with `colour(row, col)` per well; `null` leaves the well empty. */
function layout96(colour: (row: number, col: number) => string | null): WellMap {
  const out: Record<string, string> = {};
  for (let r = 0; r < 8; r += 1)
    for (let c = 0; c < 12; c += 1) {
      const hex = colour(r, c);
      if (hex !== null) out[wellId(r, c)] = hex;
    }
  return out;
}

const SAMPLE = '#56b4e9';
const NEG = '#999999';
const POS = '#d55e00';
const BLANK = '#d9dee3';
/** Concentration `t` (0 lowest, 1 highest) as a shade of `hue`. */
const shade = (hue: string, t: number): string => mix('#ffffff', hue, 0.15 + 0.85 * t);

/** Layout presets (note 58): pure data, computed once at load. */
const LAYOUTS = {
  controls: layout96((_r, c) => (c === 0 ? NEG : c === 11 ? POS : SAMPLE)),
  edges: layout96((r, c) => (r === 0 || r === 7 || c === 0 || c === 11 ? BLANK : SAMPLE)),
  dilution: layout96((_r, c) => shade('#0072b2', (11 - c) / 11)),
  // Standards in duplicate down columns 1-2, 24 samples in triplicate (alternating shades), blanks.
  standards: layout96((r, c) =>
    c < 2
      ? shade('#e69f00', (7 - r) / 7)
      : c === 11
        ? BLANK
        : Math.floor((c - 2) / 3) % 2 === 0
          ? SAMPLE
          : '#0072b2',
  ),
  // Drug A rises down the rows, drug B across the columns.
  checkerboard: layout96((r, c) => mix(shade('#0072b2', r / 7), '#d55e00', (c / 11) * 0.7)),
} as const;

export const wellPlate = defineKind<WellPlateParams>({
  kind: 'wellPlate',
  version: 1,
  title: 'Well plate',
  category: 'Lab',
  description: 'A 6- to 1536-well plate; paint wells or paste a layout from a spreadsheet.',
  keywords: ['well', '96', '384', 'microplate', 'microtiter', 'multiwell', 'elisa', 'layout'],
  defaultSize: { w: 240, h: 160 },
  fields: [
    {
      key: 'format',
      label: 'Wells',
      type: 'enum',
      options: Object.keys(PLATE_FORMATS).map((k) => ({ value: k, label: `${k}-well` })),
      default: '96',
    },
    {
      key: 'shape',
      label: 'Well shape',
      type: 'enum',
      options: [
        { value: 'circle', label: 'Round' },
        { value: 'square', label: 'Square' },
      ],
      default: 'circle',
    },
    { key: 'showLabels', label: 'Row and column labels', type: 'bool', default: true },
    { key: 'outline', label: 'Well outlines', type: 'bool', default: true },
    {
      key: 'wells',
      label: 'Well colours',
      type: 'wellMap',
      grid: (p) => gridOf(p['format']),
    },
  ],
  slots: [
    { id: 'plate', label: 'Plate', default: '#eef2f6' },
    { id: 'well', label: 'Empty wells', default: '#ffffff' },
    { id: 'rim', label: 'Outlines', default: '#52606d' },
    { id: 'text', label: 'Labels', default: '#3e4c59' },
  ],
  presets: [
    {
      id: 'controls-in-columns',
      label: 'Controls in fixed columns',
      params: { format: '96', wells: LAYOUTS.controls },
    },
    {
      id: 'blank-edges',
      label: 'Blank edge wells',
      params: { format: '96', wells: LAYOUTS.edges },
    },
    {
      id: 'dilution-gradient',
      label: 'Dilution gradient',
      params: { format: '96', wells: LAYOUTS.dilution },
    },
    {
      id: 'standard-curve',
      label: 'Standard curve and triplicates',
      params: { format: '96', wells: LAYOUTS.standards },
    },
    {
      id: 'checkerboard',
      label: 'Drug-combination checkerboard',
      params: { format: '96', wells: LAYOUTS.checkerboard },
    },
  ],
  render(p, { w, h, slots }) {
    const L = plateLayout(p, w, h);
    const out: Prim[] = [];
    const ch = Math.min(w, h) * 0.08;
    const body = poly(
      [
        { x: ch, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: 0, y: ch },
      ],
      true,
    );
    out.push(
      ...pathPrim([body], {
        fill: slots['plate'] ?? null,
        stroke: slots['rim'] ?? null,
        sw: 0.75,
        join: 'round',
      }),
    );
    const r = L.pitch * 0.4;
    const wellSub = (row: number, col: number): Sub => {
      const cx = L.x0 + (col + 0.5) * L.pitch;
      const cy = L.y0 + (row + 0.5) * L.pitch;
      return p.shape === 'circle'
        ? circle(cx, cy, r)
        : rect(cx - r, cy - r, 2 * r, 2 * r, r * 0.15);
    };
    const cells: { row: number; col: number; colour: string }[] = [];
    for (let row = 0; row < L.rows; row += 1)
      for (let col = 0; col < L.cols; col += 1)
        cells.push({
          row,
          col,
          colour: p.wells[wellId(row, col)] ?? slots['well'] ?? '#ffffff',
        });
    if (r > 0) {
      for (const [colour, list] of byColour(cells, (c) => c.colour))
        out.push(
          ...pathPrim(
            list.map((c) => wellSub(c.row, c.col)),
            { fill: colour },
          ),
        );
      if (p.outline)
        out.push(
          ...pathPrim(
            cells.map((c) => wellSub(c.row, c.col)),
            { stroke: slots['rim'] ?? null, sw: Math.min(0.5, L.pitch * 0.06) },
          ),
        );
    }
    if (p.showLabels && L.label > 0.5) {
      const colour = slots['text'] ?? '#000000';
      for (let col = 0; col < L.cols; col += 1)
        out.push(
          text(
            String(col + 1),
            L.x0 + (col + 0.5) * L.pitch,
            L.top - L.label * 0.8,
            L.label,
            colour,
          ),
        );
      for (let row = 0; row < L.rows; row += 1)
        out.push(
          text(
            rowLabel(row),
            L.left - L.label * 0.85,
            L.y0 + (row + 0.5) * L.pitch,
            L.label,
            colour,
          ),
        );
    }
    return out;
  },
});

/** Okabe-Ito without black: categorical well colours for pasted text values. */
const CATEGORICAL = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'];

/** Light → dark for pasted numbers (viridis-like, colourblind-safe). */
const RAMP = ['#fde725', '#7ad151', '#22a884', '#2a788e', '#414487', '#440154'];

function ramp(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const a = RAMP[i] ?? '#000000';
  const b = RAMP[i + 1] ?? a;
  const f = x - i;
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  const c = [0, 1, 2].map((k) =>
    Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * f)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${c.join('')}`;
}

export interface PastedWells {
  readonly wells: Record<string, string>;
  /** Text values and the colour each got, for a legend. */
  readonly categories: readonly { readonly value: string; readonly colour: string }[];
  readonly range: { readonly min: number; readonly max: number } | null;
}

/** One line split at `delim`; a "double-quoted" field may contain the delimiter ("" is a quote). */
function splitRow(line: string, delim: string): string[] {
  if (!line.includes('"')) return line.split(delim);
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quoted) {
      if (ch === '"' && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * A block copied from a spreadsheet, or the text of a .csv/.tsv file (tab- or comma-separated) → well
 * colours, top-left cell at `A1`. A leading header row (1, 2, 3 …) and
 * label column (A, B, C …) are skipped. Hex colours are used as they are;
 * numbers map onto a colourblind-safe ramp; other text gets one
 * categorical colour per distinct value; empty cells stay empty.
 */
export function wellsFromTable(table: string, rows: number, cols: number): PastedWells {
  let grid = table
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l, i, a) => l.trim() !== '' || i < a.length - 1)
    .map((l) => splitRow(l, l.includes('\t') ? '\t' : ',').map((c) => c.trim()));
  while (grid.length > 0 && (grid[grid.length - 1] ?? []).every((c) => c === '')) grid.pop();
  const head = grid[0] ?? [];
  if (head.length > 1 && head.slice(1).every((c, i) => c === String(i + 1))) grid = grid.slice(1);
  if (grid.length > 0 && grid.every((r, i) => (r[0] ?? '').toUpperCase() === rowLabel(i)))
    grid = grid.map((r) => r.slice(1));
  const cells: { id: string; v: string }[] = [];
  grid.slice(0, rows).forEach((r, row) => {
    r.slice(0, cols).forEach((v, col) => {
      if (v !== '') cells.push({ id: wellId(row, col), v });
    });
  });
  const nums = cells
    .filter((c) => !c.v.startsWith('#'))
    .map((c) => Number(c.v))
    .filter((n) => Number.isFinite(n));
  const allNumeric =
    nums.length > 0 && nums.length === cells.filter((c) => !c.v.startsWith('#')).length;
  const min = allNumeric ? Math.min(...nums) : 0;
  const max = allNumeric ? Math.max(...nums) : 0;
  const cats = new Map<string, string>();
  const wells: Record<string, string> = {};
  for (const c of cells) {
    const hex = /^#[0-9a-f]{6}$/i.test(c.v) ? c.v.toLowerCase() : null;
    if (hex) wells[c.id] = hex;
    else if (allNumeric) wells[c.id] = ramp(max > min ? (Number(c.v) - min) / (max - min) : 0.5);
    else {
      let colour = cats.get(c.v);
      if (!colour) {
        colour = CATEGORICAL[cats.size % CATEGORICAL.length] ?? '#999999';
        cats.set(c.v, colour);
      }
      wells[c.id] = colour;
    }
  }
  return {
    wells,
    categories: [...cats].map(([value, colour]) => ({ value, colour })),
    range: allNumeric ? { min, max } : null,
  };
}
