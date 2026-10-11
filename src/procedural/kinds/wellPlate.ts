/**
 * Multi-well plate, 6 to 1536 wells, with a colour per well (note 04).
 * Wells of one colour are one `<path>`, so a full 1536-well plate is a
 * handful of DOM nodes.
 */
import { type Prim, type StyleId, type Sub, circle, lookOf, pathPrim, poly, rect } from '../prims';
import { type KindWizard, type Params, type WellMap, defineKind } from '../types';
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
  readonly style: StyleId;
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

/** Condition colours: Okabe-Ito hues the controls do not use, then lighter and darker tiers. */
const CONDITION_HUES = ['#56b4e9', '#e69f00', '#009e73', '#0072b2', '#cc79a7', '#f0e442'];
const TIERS = [
  (h: string) => h,
  (h: string) => mix('#ffffff', h, 0.5),
  (h: string) => mix(h, '#000000', 0.35),
  (h: string) => mix('#ffffff', h, 0.25),
];
/** Distinct colours before they repeat. */
export const CONDITION_COLOURS = CONDITION_HUES.length * TIERS.length;

/** Condition `i`'s colour (0-based), repeating after `CONDITION_COLOURS`. */
export function conditionColour(i: number): string {
  const n = i % CONDITION_COLOURS;
  const tier = TIERS[Math.floor(n / CONDITION_HUES.length)] ?? ((h: string) => h);
  return tier(CONDITION_HUES[n % CONDITION_HUES.length] ?? SAMPLE);
}

/** The plate map's control and blank colours. */
export const PLATE_MAP_COLOURS = { negative: NEG, positive: POS, blank: BLANK } as const;

const MAX_CONDITIONS = 384;
const MAX_REPLICATES = 48;

/** The plate map wizard's answers (note 58), decoded. Never stored. */
export interface PlateMapAnswers {
  readonly format: PlateFormat;
  readonly conditions: number;
  readonly replicates: number;
  readonly direction: 'across' | 'down';
  readonly controls: 'none' | 'negative' | 'both';
  readonly controlPlace: 'columns' | 'rows';
  readonly blankEdges: boolean;
}

export interface PlateMap {
  readonly format: PlateFormat;
  readonly wells: WellMap;
  /** How many conditions got their replicates, and how many groups would fit at most. */
  readonly placed: number;
  readonly capacity: number;
}

function pick<T extends string>(a: Params, key: string, ok: readonly T[], fallback: T): T {
  const v = a[key];
  return ok.find((x) => x === v) ?? fallback;
}

function int(a: Params, key: string, min: number, max: number, fallback: number): number {
  const v = a[key];
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
}

/** The answers, any value out of range or unknown falling back to its default. */
export function plateMapAnswers(a: Params): PlateMapAnswers {
  return {
    format: pick(a, 'format', Object.keys(PLATE_FORMATS) as PlateFormat[], '96'),
    conditions: int(a, 'conditions', 1, MAX_CONDITIONS, 8),
    replicates: int(a, 'replicates', 1, MAX_REPLICATES, 3),
    direction: pick(a, 'direction', ['across', 'down'], 'across'),
    controls: pick(a, 'controls', ['none', 'negative', 'both'], 'both'),
    controlPlace: pick(a, 'controlPlace', ['columns', 'rows'], 'columns'),
    blankEdges: a['blankEdges'] === true,
  };
}

/**
 * PURE: the plate map the answers describe. Blank edges take the outer ring; controls take the
 * first (negative) and last (positive) column or row of what is left; each condition then gets
 * `replicates` neighbouring wells, side by side in a row or one under another in a column, a
 * group never split over two rows (or columns) when one is long enough. Conditions that do not
 * fit are left out (`placed` says how many fit); wells nobody uses stay empty.
 */
export function plateMap(raw: Params): PlateMap {
  const a = plateMapAnswers(raw);
  const { rows, cols } = PLATE_FORMATS[a.format];
  const wells: Record<string, string> = {};
  let r0 = 0;
  let r1 = rows - 1;
  let c0 = 0;
  let c1 = cols - 1;
  if (a.blankEdges) {
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1)
        if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) wells[wellId(r, c)] = BLANK;
    r0 += 1;
    r1 -= 1;
    c0 += 1;
    c1 -= 1;
  }
  const byColumn = a.controlPlace === 'columns';
  const control = (colour: string, at: number) => {
    if (byColumn) for (let r = r0; r <= r1; r += 1) wells[wellId(r, at)] = colour;
    else for (let c = c0; c <= c1; c += 1) wells[wellId(at, c)] = colour;
  };
  if (a.controls !== 'none' && r0 <= r1 && c0 <= c1) {
    control(NEG, byColumn ? c0 : r0);
    if (byColumn) c0 += 1;
    else r0 += 1;
    if (a.controls === 'both' && r0 <= r1 && c0 <= c1) {
      control(POS, byColumn ? c1 : r1);
      if (byColumn) c1 -= 1;
      else r1 -= 1;
    }
  }
  // The sample area as lines of wells along the replicates' direction.
  const lines: { r: number; c: number }[][] = [];
  if (a.direction === 'across')
    for (let r = r0; r <= r1; r += 1) {
      const l = [];
      for (let c = c0; c <= c1; c += 1) l.push({ r, c });
      if (l.length > 0) lines.push(l);
    }
  else
    for (let c = c0; c <= c1; c += 1) {
      const l = [];
      for (let r = r0; r <= r1; r += 1) l.push({ r, c });
      if (l.length > 0) lines.push(l);
    }
  const len = lines[0]?.length ?? 0;
  const n = a.replicates;
  const groups: { r: number; c: number }[][] = [];
  if (n <= len) {
    for (const l of lines) for (let g = 0; g + n <= len; g += n) groups.push(l.slice(g, g + n));
  } else {
    const flat = lines.flat();
    for (let g = 0; g + n <= flat.length; g += n) groups.push(flat.slice(g, g + n));
  }
  const placed = Math.min(a.conditions, groups.length);
  for (let i = 0; i < placed; i += 1)
    for (const w of groups[i] ?? []) wells[wellId(w.r, w.c)] = conditionColour(i);
  return { format: a.format, wells, placed, capacity: groups.length };
}

/** The well plate's wizard (note 58): format, conditions × replicates, controls → well map. */
export const plateMapWizard: KindWizard<WellPlateParams> = {
  title: 'Plate map wizard',
  steps: [
    {
      question: 'Which plate?',
      fields: [
        {
          key: 'format',
          label: 'Wells',
          type: 'enum',
          options: Object.keys(PLATE_FORMATS).map((k) => ({ value: k, label: `${k}-well` })),
          default: '96',
        },
      ],
    },
    {
      question: 'What goes on it?',
      fields: [
        {
          key: 'conditions',
          label: 'Conditions',
          type: 'int',
          min: 1,
          max: MAX_CONDITIONS,
          default: 8,
          help: 'Samples, treatments or strains: each gets a colour of its own.',
        },
        {
          key: 'replicates',
          label: 'Replicates',
          type: 'int',
          min: 1,
          max: MAX_REPLICATES,
          default: 3,
        },
        {
          key: 'direction',
          label: 'Replicates go',
          type: 'enum',
          options: [
            { value: 'across', label: 'Side by side in a row' },
            { value: 'down', label: 'One under another in a column' },
          ],
          default: 'across',
        },
      ],
    },
    {
      question: 'Where do the controls go?',
      fields: [
        {
          key: 'controls',
          label: 'Controls',
          type: 'enum',
          options: [
            { value: 'none', label: 'None' },
            { value: 'negative', label: 'Negative only' },
            { value: 'both', label: 'Negative and positive' },
          ],
          default: 'both',
        },
        {
          key: 'controlPlace',
          label: 'Controls fill',
          type: 'enum',
          options: [
            { value: 'columns', label: 'The first and last columns' },
            { value: 'rows', label: 'The first and last rows' },
          ],
          default: 'columns',
          help: 'Negative controls first (grey), positive controls last (orange).',
          showIf: (p) => p['controls'] !== 'none',
        },
        {
          key: 'blankEdges',
          label: 'Leave the edge wells blank (edge effect)',
          type: 'bool',
          default: false,
        },
      ],
    },
  ],
  build(answers) {
    const m = plateMap(answers);
    return { format: m.format, wells: m.wells };
  },
  problems(answers) {
    const a = plateMapAnswers(answers);
    const m = plateMap(answers);
    const out: string[] = [];
    if (m.capacity === 0) out.push('No wells are left for samples: choose a bigger plate.');
    else if (m.placed < a.conditions)
      out.push(
        `Only ${String(m.placed)} of ${String(a.conditions)} conditions fit in ` +
          `${String(a.replicates)} replicates on a ${a.format}-well plate.`,
      );
    if (m.placed > CONDITION_COLOURS)
      out.push(`Colours repeat after ${String(CONDITION_COLOURS)} conditions.`);
    return out;
  },
};

export const wellPlate = defineKind<WellPlateParams>({
  kind: 'wellPlate',
  version: 1,
  title: 'Well plate',
  category: 'Lab',
  description: 'A 6- to 1536-well plate; paint wells or paste a layout from a spreadsheet.',
  keywords: ['well', '96', '384', 'microplate', 'microtiter', 'multiwell', 'elisa', 'layout'],
  defaultSize: { w: 240, h: 160 },
  styles: ['line-art', 'cartoon'],
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
  wizard: plateMapWizard,
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
    const wellW = Math.min(0.5, L.pitch * 0.06);
    const look = lookOf(p.style, wellW);
    out.push(
      ...pathPrim(
        [look.organic(body, 1)],
        look.body({
          fill: slots['plate'] ?? null,
          stroke: slots['rim'] ?? null,
          sw: 0.75,
          join: 'round',
        }),
      ),
    );
    const r = L.pitch * 0.4;
    // Hand-drawn wells only where they stay few enough to see (and to draw quickly).
    const wobbly = L.rows * L.cols <= 384;
    const wellSub = (row: number, col: number): Sub => {
      const cx = L.x0 + (col + 0.5) * L.pitch;
      const cy = L.y0 + (row + 0.5) * L.pitch;
      const s =
        p.shape === 'circle'
          ? circle(cx, cy, r)
          : rect(cx - r, cy - r, 2 * r, 2 * r, r * 0.15 * look.bigger);
      return wobbly ? look.organic(s, row * 131 + col) : s;
    };
    const cells: { sub: Sub; colour: string; painted: boolean }[] = [];
    for (let row = 0; row < L.rows; row += 1)
      for (let col = 0; col < L.cols; col += 1) {
        const painted = p.wells[wellId(row, col)];
        cells.push({
          sub: wellSub(row, col),
          colour: painted ?? slots['well'] ?? '#ffffff',
          painted: painted !== undefined,
        });
      }
    if (r > 0) {
      // Painted wells are data (distinct ink tints in line art); empty ones plain fill (paper).
      const tone = look.marks(cells.filter((c) => c.painted).map((c) => c.colour));
      for (const list of byColour(cells, (c) => `${c.painted ? 'p' : 'e'}${c.colour}`).values()) {
        const first = list[0];
        if (!first) continue;
        out.push(
          ...pathPrim(
            list.map((c) => c.sub),
            { fill: first.painted ? tone(first.colour) : look.fill(first.colour) },
          ),
        );
      }
      if (p.outline || look.outlines)
        out.push(
          ...pathPrim(
            cells.map((c) => c.sub),
            look.body({ stroke: slots['rim'] ?? null, sw: wellW }),
          ),
        );
    }
    if (p.showLabels && L.label > 0.5) {
      const colour = look.text(slots['text'] ?? '#000000');
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
