/**
 * A sequence snippet (note 04, issue 75): a short DNA, RNA or protein sequence set in the
 * monospace face, one glyph per cell with an explicit x/y, wrapped into rows of the frame's
 * width. Above each row sit a numbering ruler and the annotations (a bar with a label over it:
 * a mutation `p.R175H`, a primer); highlights are filled rectangles behind the letters. All
 * fills are merged into one `<path>` per colour. Text sizes stay in points when the frame is
 * resized; only the wrap width follows the frame.
 */
import { type Prim, type Sub, pathPrim, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { byColour, text } from './util';

export type Highlight = Readonly<{ start: number; end: number; color: string }>;
export type Annotation = Readonly<{ label: string; start: number; end: number; color: string }>;

export interface SequenceParams {
  readonly sequence: string;
  readonly first: number;
  readonly ruler: boolean;
  readonly interval: number;
  readonly highlights: readonly Highlight[];
  readonly annotations: readonly Annotation[];
  /** Points. */
  readonly size: number;
}

/** Residues kept; more would be a chromosome, not a snippet. */
export const MAX_RESIDUES = 200;
const LIMIT = 100_000;
const HIGHLIGHT_COLOURS = ['#ffe08a', '#a6e3a1', '#a9d6f5', '#f4b6c2', '#d9c2f0'];

/** Cousine's advance, as a multiple of the size (1229 / 2048 em), plus a little air. */
const ADVANCE = 1229 / 2048;
const CELL = ADVANCE * 1.15;
/** A generous width of one character of the (proportional) label and number text. */
const EST = 0.6;

/** Letters, gap `-` and stop `*` only, upper case, at most `MAX_RESIDUES`. */
export function cleanSequence(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z*-]/g, '')
    .slice(0, MAX_RESIDUES);
}

const labelSize = (size: number) => size * 0.85;
const numSize = (size: number) => size * 0.75;
const levelH = (size: number) => size * 0.3 + labelSize(size);

/** Greedy levels: each span goes in the first level it fits in. */
function levels(spans: readonly (readonly [number, number])[], gap: number): number[] {
  const ends: number[] = [];
  return spans.map(([a, b]) => {
    let r = ends.findIndex((e) => a >= e + gap);
    if (r < 0) r = ends.length;
    ends[r] = b;
    return r;
  });
}

const itemRange = (it: Item): string =>
  `${String(it['start'])}${it['end'] === it['start'] ? '' : `–${String(it['end'])}`}`;

export const sequenceSnippet = defineKind<SequenceParams>({
  kind: 'sequence',
  version: 1,
  title: 'Sequence snippet',
  category: 'Lab',
  description:
    'A short DNA, RNA or protein sequence with a numbering ruler, highlighted residues and labelled bars.',
  keywords: [
    'sequence',
    'dna',
    'rna',
    'protein',
    'peptide',
    'amino',
    'nucleotide',
    'residue',
    'mutation',
    'primer',
    'alignment',
    'codon',
    'snippet',
  ],
  defaultSize: { w: 300, h: 56 },
  fields: [
    {
      key: 'sequence',
      label: 'Sequence',
      help: `DNA, RNA or protein; letters, - and * are kept, upper-cased, up to ${String(MAX_RESIDUES)} residues.`,
      type: 'text',
      maxLength: 2000,
      default: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG',
      placeholder: 'ATGGCC…',
    },
    {
      key: 'first',
      label: 'First residue number',
      type: 'int',
      min: -LIMIT,
      max: LIMIT,
      default: 1,
    },
    { key: 'ruler', label: 'Numbering ruler', type: 'bool', default: true },
    {
      key: 'interval',
      label: 'Number every',
      type: 'int',
      min: 5,
      max: 1000,
      unit: 'residues',
      default: 10,
      showIf: (p) => p['ruler'] === true,
    },
    {
      key: 'highlights',
      label: 'Highlights',
      type: 'list',
      min: 0,
      max: 20,
      item: [
        {
          key: 'start',
          label: 'From',
          help: 'Residue numbers, counted from the first residue number.',
          type: 'int',
          min: -LIMIT,
          max: LIMIT,
          default: 1,
        },
        { key: 'end', label: 'To', type: 'int', min: -LIMIT, max: LIMIT, default: 1 },
        { key: 'color', label: 'Colour', type: 'color', default: '#ffe08a' },
      ],
      default: [],
      itemTitle: (it: Item, i: number) => `Highlight ${String(i + 1)} (${itemRange(it)})`,
      newItem: (p, items) => {
        const f = typeof p['first'] === 'number' ? p['first'] : 1;
        return {
          start: f,
          end: f + 2,
          color: HIGHLIGHT_COLOURS[items.length % HIGHLIGHT_COLOURS.length] ?? '#ffe08a',
        };
      },
    },
    {
      key: 'annotations',
      label: 'Annotations',
      type: 'list',
      min: 0,
      max: 20,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 24, default: 'p.R175H' },
        {
          key: 'start',
          label: 'From',
          help: 'For one residue, give the same number twice.',
          type: 'int',
          min: -LIMIT,
          max: LIMIT,
          default: 1,
        },
        { key: 'end', label: 'To', type: 'int', min: -LIMIT, max: LIMIT, default: 1 },
        { key: 'color', label: 'Colour', type: 'color', default: '', auto: true },
      ],
      default: [{ label: 'p.R175H', start: 13, end: 15, color: '' }],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['label'] === 'string' && it['label'] !== '' ? it['label'] : `Annotation ${String(i + 1)}`} (${itemRange(it)})`,
      newItem: (p, items) => {
        const f = typeof p['first'] === 'number' ? p['first'] : 1;
        return { label: `Label ${String(items.length + 1)}`, start: f, end: f, color: '' };
      },
    },
    {
      key: 'size',
      label: 'Text size',
      type: 'number',
      min: 4,
      max: 24,
      step: 0.5,
      unit: 'pt',
      default: 9,
    },
  ],
  slots: [
    { id: 'text', label: 'Letters', default: '#1f2933' },
    { id: 'ruler', label: 'Ruler', default: '#52606d' },
    { id: 'mark', label: 'Annotations', default: '#d55e00' },
  ],
  fix: (p) => {
    const sequence = cleanSequence(p.sequence);
    return sequence === p.sequence ? p : { ...p, sequence };
  },
  // Rows are stacked downwards from the top of the frame, so a frame too small for the text
  // lets it run out below (at most every residue on its own row, every annotation on its own
  // level), and the longest label or number hangs out sideways.
  overhang: (p) => {
    const s = p.size;
    const longest = Math.max(
      0,
      ...p.annotations.map((a) => EST * labelSize(s) * a.label.length),
      EST * numSize(s) * 8,
    );
    return MAX_RESIDUES * (s * 3.5 + p.annotations.length * levelH(s)) + longest + 2 * s;
  },
  render(p, { w, slots }) {
    const s = p.size;
    const seq = cleanSequence(p.sequence);
    const len = seq.length;
    if (len === 0) return [];
    const ink = slots['text'] ?? '#1f2933';
    const rulerInk = slots['ruler'] ?? '#52606d';
    const markInk = slots['mark'] ?? '#d55e00';
    const cell = s * CELL;
    const perRow = Math.max(1, Math.floor(w / cell));
    const nRows = Math.ceil(len / perRow);
    const lab = labelSize(s);
    const nums = numSize(s);
    const thick = Math.max(0.5, s * 0.1);
    const rowGap = s * 0.5;
    const resH = s * 1.25;
    const rulerH = p.ruler ? nums * 1.2 + s * 0.2 : 0;

    // Annotations and highlights as index ranges within the sequence, ends inclusive.
    const toRange = (a: number, b: number): readonly [number, number] | null => {
      const lo = Math.min(a, b) - p.first;
      const hi = Math.max(a, b) - p.first;
      return hi < 0 || lo > len - 1 ? null : [Math.max(0, lo), Math.min(len - 1, hi)];
    };
    const marks = p.annotations.flatMap((a) => {
      const r = toRange(a.start, a.end);
      return r ? [{ a, lo: r[0], hi: r[1], colour: a.color === '' ? markInk : a.color }] : [];
    });
    const lights = p.highlights.flatMap((h) => {
      const r = toRange(h.start, h.end);
      return r ? [{ lo: r[0], hi: r[1], colour: h.color }] : [];
    });

    const fills: { sub: Sub; color: string }[] = [];
    const labels: Prim[] = [];
    const glyphs: Prim[] = [];
    const fill = (sub: Sub, color: string) => fills.push({ sub, color });

    let top = 0;
    for (let r = 0; r < nRows; r++) {
      const i0 = r * perRow;
      const i1 = Math.min(len, i0 + perRow) - 1;
      const xL = (i: number) => (i - i0) * cell;

      // Annotation segments in this row, stacked in levels (0 nearest the letters).
      const segs = marks
        .filter((m) => m.hi >= i0 && m.lo <= i1)
        .map((m) => {
          const lo = Math.max(m.lo, i0);
          const hi = Math.min(m.hi, i1);
          const a = xL(lo);
          const b = xL(hi) + cell;
          const named = m.lo >= i0 && m.a.label !== '';
          const half = named ? (EST * lab * m.a.label.length) / 2 : 0;
          const c = (a + b) / 2;
          const cx = named ? Math.min(Math.max(c, half), Math.max(half, w - half)) : c;
          return { m, a, b, named, cx, half };
        })
        .sort((u, v) => u.a - v.a);
      const lvl = levels(
        segs.map((g) => [Math.min(g.a, g.cx - g.half), Math.max(g.b, g.cx + g.half)] as const),
        s * 0.4,
      );
      const nLev = segs.length === 0 ? 0 : Math.max(...lvl) + 1;

      const rulerTop = top;
      const bandTop = rulerTop + rulerH;
      const resTop = bandTop + nLev * levelH(s);
      const baseline = resTop + s * 0.95;

      // Highlights behind the letters.
      for (const h of lights)
        if (h.hi >= i0 && h.lo <= i1) {
          const a = xL(Math.max(h.lo, i0));
          const b = xL(Math.min(h.hi, i1)) + cell;
          fill(rect(a, resTop + s * 0.1, b - a, s * 1.04), h.colour);
        }

      // Letters, one glyph each at its own column.
      for (let i = i0; i <= i1; i++)
        glyphs.push(
          text(seq.charAt(i), xL(i) + cell / 2, baseline, s, ink, {
            anchor: 'middle',
            baseline: 'alphabetic',
            mono: true,
          }),
        );

      // Annotation bars with end legs, and labels over them.
      segs.forEach((g, k) => {
        const l = lvl[k] ?? 0;
        const barBottom = resTop - l * levelH(s) - s * 0.05;
        const inset = cell * 0.1;
        const x0 = g.a + inset;
        const x1 = g.b - inset;
        const leg = s * 0.2;
        fill(rect(x0, barBottom - thick, x1 - x0, thick), g.m.colour);
        // A leg at each true end of the annotation (not at a wrap).
        if (g.m.lo >= i0) fill(rect(x0, barBottom - thick, thick, leg + thick), g.m.colour);
        if (g.m.hi <= i1) fill(rect(x1 - thick, barBottom - thick, thick, leg + thick), g.m.colour);
        if (g.named)
          labels.push(
            text(g.m.a.label, g.cx, barBottom - thick - lab * 0.2, lab, g.m.colour, {
              anchor: 'middle',
              baseline: 'alphabetic',
            }),
          );
      });

      // Numbering ruler: every `interval`th residue, and the row's first when there is room.
      if (p.ruler) {
        const numAt = (i: number) => p.first + i;
        const ticks: number[] = [];
        for (let i = i0; i <= i1; i++)
          if (((numAt(i) % p.interval) + p.interval) % p.interval === 0) ticks.push(i);
        const start = ticks[0];
        const nums0 = String(numAt(i0)).length;
        const room =
          start === undefined ||
          (start - i0) * cell >= 0.5 * nums * EST * (nums0 + String(numAt(start)).length) + s * 0.3;
        // Centred over the residue, unless the number would run past the row's ends.
        const numX = (i: number) => {
          const half = (EST * nums * String(numAt(i)).length) / 2;
          return Math.min(Math.max(xL(i) + cell / 2, half), Math.max(half, w - half));
        };
        const at = start === i0 || !room ? ticks : [i0, ...ticks];
        for (const i of at)
          labels.push(
            text(String(numAt(i)), numX(i), rulerTop + nums * 0.9, nums, rulerInk, {
              anchor: 'middle',
              baseline: 'alphabetic',
            }),
          );
      }
      top = resTop + resH + rowGap;
    }

    const out: Prim[] = [];
    for (const [color, list] of byColour(fills, (f) => f.color))
      out.push(
        ...pathPrim(
          list.map((f) => f.sub),
          { fill: color },
        ),
      );
    out.push(...glyphs, ...labels);
    return out;
  },
});
