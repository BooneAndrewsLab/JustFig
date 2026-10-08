/**
 * Plasmid map (note 04): a circular (or linear) sequence with annotated
 * features, redrawn in house style. It is also the target of PlasmidPop's
 * copy-map command (note 05): PlasmidPop writes exactly these params.
 * Positions are 1-based and inclusive, as in GenBank; a feature across the
 * origin of a circular sequence has start > end.
 */
import { shiftLightness } from '@/core/color/color';
import type { PathNode } from '@/core/model/types';

import { type Prim, type Sub, arcNodes, circle, joinNodes, line, pathPrim, poly } from '../prims';
import { measure } from '@/core/text/layout';

import { type Item, defineKind } from '../types';
import { byColour, clamp, fmtInt, niceStep, text } from './util';

export type Feature = Readonly<{
  name: string;
  start: number;
  end: number;
  strand: 1 | -1 | 0;
  type: string;
  color: string;
}>;

export interface PlasmidParams {
  readonly name: string;
  readonly length: number;
  readonly topology: 'circular' | 'linear';
  readonly features: readonly Feature[];
  readonly showName: boolean;
  readonly showLength: boolean;
  readonly showTicks: boolean;
  readonly showLabels: boolean;
  readonly ring: number;
  readonly labelSize: number;
  /** Features shorter than this share of the sequence are drawn without a label (percent). */
  readonly minLabelPct: number;
}

export const MAX_BP = 100_000_000;

/** Colours by GenBank feature key (colourblind-safe), for features without one. */
const TYPE_COLOURS: Readonly<Record<string, string>> = {
  cds: '#0072b2',
  gene: '#56b4e9',
  promoter: '#009e73',
  terminator: '#d55e00',
  rep_origin: '#e69f00',
  origin: '#e69f00',
  primer_bind: '#cc79a7',
  protein_bind: '#cc79a7',
  misc_feature: '#9aa5b1',
  regulatory: '#f0e442',
  polya_signal: '#d55e00',
  enhancer: '#009e73',
};

export const featureColour = (f: Pick<Feature, 'color' | 'type'>): string =>
  f.color !== ''
    ? f.color
    : Object.hasOwn(TYPE_COLOURS, f.type.toLowerCase())
      ? (TYPE_COLOURS[f.type.toLowerCase()] ?? '#7b8794')
      : '#7b8794';

const DEFAULT_FEATURES: readonly Feature[] = [
  { name: 'AmpR', start: 1626, end: 2486, strand: -1, type: 'CDS', color: '' },
  { name: 'ori', start: 867, end: 1455, strand: -1, type: 'rep_origin', color: '' },
  { name: 'lacZα', start: 146, end: 469, strand: -1, type: 'CDS', color: '#56b4e9' },
  { name: 'lac promoter', start: 514, end: 544, strand: -1, type: 'promoter', color: '' },
  { name: 'MCS', start: 397, end: 453, strand: 0, type: 'misc_feature', color: '' },
  { name: 'AmpR promoter', start: 2487, end: 2591, strand: -1, type: 'promoter', color: '' },
];

const FEATURE_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', maxLength: 80, default: 'feature' },
  { key: 'start', label: 'Start', type: 'int', min: 1, max: MAX_BP, unit: 'bp', default: 1 },
  { key: 'end', label: 'End', type: 'int', min: 1, max: MAX_BP, unit: 'bp', default: 100 },
  {
    key: 'strand',
    label: 'Strand',
    type: 'enum',
    options: [
      { value: 1, label: 'Forward →' },
      { value: -1, label: 'Reverse ←' },
      { value: 0, label: 'None' },
    ],
    default: 1,
  },
  { key: 'type', label: 'Type', type: 'text', maxLength: 40, default: 'misc_feature' },
  { key: 'color', label: 'Colour', type: 'color', default: '', auto: true },
] as const;

/** Whether a feature is long enough (share of the sequence) to carry a label. */
export function labelled(p: PlasmidParams, f: Feature): boolean {
  if (!p.showLabels || f.name.trim() === '') return false;
  const bp = (f.end >= f.start ? f.end : f.end + p.length) - f.start + 1;
  return (bp / Math.max(1, p.length)) * 100 >= p.minLabelPct;
}

const measureLabel = (s: string, size: number): number =>
  measure({ text: s, font: 'arimo', size, color: { hex: '#000000' } }, s);

/** Circle geometry: angle of a 1-based position (clockwise from 12 o'clock). */
const angleOf = (pos: number, len: number): number =>
  -Math.PI / 2 + (2 * Math.PI * (pos - 1)) / len;

interface Label {
  readonly text: string;
  readonly mid: number;
  ax: number;
  ay: number;
  y: number;
  readonly right: boolean;
}

/** Labels on one side, pushed apart vertically, kept inside [top, bottom]. */
function spread(labels: Label[], gap: number, top: number, bottom: number): void {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i += 1) {
    const prev = labels[i - 1];
    const cur = labels[i];
    if (prev && cur && cur.y < prev.y + gap) cur.y = prev.y + gap;
  }
  const last = labels[labels.length - 1];
  if (last && last.y > bottom) {
    last.y = bottom;
    for (let i = labels.length - 2; i >= 0; i -= 1) {
      const next = labels[i + 1];
      const cur = labels[i];
      if (next && cur && cur.y > next.y - gap) cur.y = next.y - gap;
    }
  }
  for (const l of labels) l.y = clamp(l.y, top, bottom);
}

function circular(p: PlasmidParams, w: number, h: number, slots: Record<string, string>): Prim[] {
  const out: Prim[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const R0 = Math.max(0, Math.min(w, h) / 2);
  const ls = p.labelSize;
  // At least 4% of the radius: arc handles reach 3.4% past their circle.
  const band = Math.max(
    R0 * 0.04,
    p.showLabels ? Math.min(R0 * 0.35, ls * 5) : Math.min(R0 * 0.08, 4),
  );
  const r = Math.max(R0 - band - p.ring / 2, R0 * 0.3);
  const ring = Math.min(p.ring, r * 0.6);
  const ink = slots['text'] ?? '#1f2933';
  const backbone = slots['backbone'] ?? '#52606d';
  const L = p.length;

  out.push(...pathPrim([circle(cx, cy, r)], { stroke: backbone, sw: Math.max(0.5, ring * 0.12) }));

  if (p.showTicks && r > 20) {
    const step = niceStep(L, 8);
    const ticks: Sub[] = [];
    const inner = r - ring / 2 - 1;
    const tl = Math.min(4, ring * 0.4);
    for (let pos = step; pos < L && ticks.length < 50; pos += step) {
      const a = angleOf(pos + 1, L);
      const c = Math.cos(a);
      const s = Math.sin(a);
      ticks.push(
        line(
          { x: cx + c * inner, y: cy + s * inner },
          { x: cx + c * (inner - tl), y: cy + s * (inner - tl) },
        ),
      );
      const tr = inner - tl - ls * 0.9;
      if (tr > ls * 2)
        out.push(
          text(
            L >= 10000 ? `${String(pos / 1000)} kb` : fmtInt(pos),
            cx + c * tr,
            cy + s * tr,
            ls * 0.8,
            ink,
          ),
        );
    }
    out.push(...pathPrim(ticks, { stroke: backbone, sw: 0.5 }));
  }

  const ro = r + ring / 2;
  const ri = r - ring / 2;
  const shapes: { colour: string; sub: Sub }[] = [];
  const labels: Label[] = [];
  for (const f of p.features) {
    const end = f.end >= f.start ? f.end : f.end + L;
    const a0 = angleOf(f.start, L);
    const a1 = angleOf(end + 1, L);
    const span = a1 - a0;
    if (!(span > 0)) continue;
    const head = f.strand === 0 ? 0 : Math.min(span * 0.5, ring / r);
    let nodes: PathNode[];
    if (f.strand === 1)
      nodes = joinNodes(
        arcNodes(cx, cy, ro, a0, a1 - head),
        [{ x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }],
        arcNodes(cx, cy, ri, a1 - head, a0),
      );
    else if (f.strand === -1)
      nodes = joinNodes(
        [{ x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }],
        arcNodes(cx, cy, ro, a0 + head, a1),
        arcNodes(cx, cy, ri, a1, a0 + head),
      );
    else nodes = joinNodes(arcNodes(cx, cy, ro, a0, a1), arcNodes(cx, cy, ri, a1, a0));
    shapes.push({ colour: featureColour(f), sub: { t: 'poly', nodes, closed: true } });
    if (labelled(p, f)) {
      const mid = (a0 + a1) / 2;
      const rl = Math.min(R0 - 1, ro + ls * 1.2);
      labels.push({
        text: f.name,
        mid,
        ax: cx + Math.cos(mid) * ro,
        ay: cy + Math.sin(mid) * ro,
        y: cy + Math.sin(mid) * rl,
        right: Math.cos(mid) >= 0,
      });
    }
  }
  for (const [colour, list] of byColour(shapes, (s) => s.colour))
    out.push(
      ...pathPrim(
        list.map((s) => s.sub),
        { fill: colour, stroke: shiftLightness(colour, -0.15), sw: 0.4, join: 'round' },
      ),
    );

  if (labels.length > 0) {
    const gap = ls * 1.15;
    const leaders: Sub[] = [];
    for (const right of [true, false]) {
      const side = labels.filter((l) => l.right === right);
      spread(side, gap, Math.min(ls * 0.6, h / 2), Math.max(h - ls * 0.6, h / 2));
      for (const l of side) {
        const dy = l.y - cy;
        const rl = Math.min(R0 - 1, ro + ls * 1.2);
        const dx = Math.sqrt(Math.max(0, rl * rl - dy * dy));
        const x = clamp(cx + (right ? dx + ls * 0.4 : -dx - ls * 0.4), 0, w);
        leaders.push(line({ x: l.ax, y: l.ay }, { x: clamp(x + (right ? -1 : 1), 0, w), y: l.y }));
        out.push(text(l.text, x, l.y, ls, ink, { anchor: right ? 'start' : 'end' }));
      }
    }
    out.push(...pathPrim(leaders, { stroke: shiftLightness(ink, 0.35), sw: 0.4 }));
  }

  const cs = Math.min(clamp(r * 0.16, 1, ls * 1.6), R0 * 0.7);
  const lines: { s: string; bold: boolean }[] = [];
  if (p.showName && p.name.trim() !== '') lines.push({ s: p.name, bold: true });
  if (p.showLength) lines.push({ s: `${fmtInt(L)} bp`, bold: false });
  lines.forEach((ln, i) =>
    out.push(
      text(ln.s, cx, cy + (i - (lines.length - 1) / 2) * cs * 1.3, ln.bold ? cs : cs * 0.85, ink, {
        bold: ln.bold,
      }),
    ),
  );
  return out;
}

function linear(p: PlasmidParams, w: number, h: number, slots: Record<string, string>): Prim[] {
  const out: Prim[] = [];
  const ls = p.labelSize;
  const ink = slots['text'] ?? '#1f2933';
  const backbone = slots['backbone'] ?? '#52606d';
  const pad = Math.min(w * 0.05, 12);
  const x0 = pad;
  const x1 = Math.max(x0, w - pad);
  const y = h / 2;
  const L = p.length;
  const fh = Math.min(p.ring, h * 0.18);
  const xOf = (pos: number) => x0 + ((x1 - x0) * (pos - 1)) / L;
  out.push(
    ...pathPrim([line({ x: x0, y }, { x: x1, y })], {
      stroke: backbone,
      sw: Math.max(0.5, fh * 0.15),
    }),
  );
  const shapes: { colour: string; sub: Sub }[] = [];
  const rowsAbove: number[] = [];
  const rowsBelow: number[] = [];
  const sorted = [...p.features].sort(
    (x, y) => Math.min(x.start, x.end) - Math.min(y.start, y.end),
  );
  for (const f of sorted) {
    const a = xOf(Math.min(f.start, f.end));
    const b = xOf(Math.max(f.start, f.end) + 1);
    if (!(b > a)) continue;
    const yc = f.strand === 1 ? y - fh * 0.75 : f.strand === -1 ? y + fh * 0.75 : y;
    const top = yc - fh / 2;
    const bot = yc + fh / 2;
    const hd = f.strand === 0 ? 0 : Math.min((b - a) * 0.5, fh * 0.8);
    const pts =
      f.strand === 1
        ? [
            { x: a, y: top },
            { x: b - hd, y: top },
            { x: b, y: yc },
            { x: b - hd, y: bot },
            { x: a, y: bot },
          ]
        : f.strand === -1
          ? [
              { x: a + hd, y: top },
              { x: b, y: top },
              { x: b, y: bot },
              { x: a + hd, y: bot },
              { x: a, y: yc },
            ]
          : [
              { x: a, y: top },
              { x: b, y: top },
              { x: b, y: bot },
              { x: a, y: bot },
            ];
    shapes.push({ colour: featureColour(f), sub: poly(pts, true) });
    if (labelled(p, f)) {
      // Stack labels that would overlap a neighbour's on the same side into further rows.
      const below = f.strand === -1;
      const x = clamp((a + b) / 2, 0, w);
      const half = measureLabel(f.name, ls) / 2 + ls * 0.3;
      const rows = below ? rowsBelow : rowsAbove;
      let row = rows.findIndex((right) => right <= x - half);
      if (row < 0) row = rows.length < 4 ? rows.length : rows.indexOf(Math.min(...rows));
      rows[row] = x + half;
      const ly = below ? bot + ls * (0.9 + row * 1.15) : top - ls * (0.9 + row * 1.15);
      out.push(text(f.name, x, clamp(ly, 0, h), ls, ink));
    }
  }
  for (const [colour, list] of byColour(shapes, (s) => s.colour))
    out.push(
      ...pathPrim(
        list.map((s) => s.sub),
        { fill: colour, stroke: shiftLightness(colour, -0.15), sw: 0.4, join: 'round' },
      ),
    );
  if (p.showTicks) {
    const step = niceStep(L, 6);
    const ticks: Sub[] = [];
    const ty = clamp(y + fh * 1.5 + ls * 1.4, 0, h);
    for (let pos = 0; pos <= L && ticks.length < 50; pos += step) {
      const x = xOf(pos + 1);
      ticks.push(line({ x, y: clamp(ty - ls * 0.9, 0, h) }, { x, y: clamp(ty - ls * 0.5, 0, h) }));
      out.push(
        text(
          L >= 10000 ? `${String(pos / 1000)} kb` : fmtInt(pos),
          x,
          clamp(ty + ls * 0.1, 0, h),
          ls * 0.8,
          ink,
        ),
      );
    }
    out.push(...pathPrim(ticks, { stroke: backbone, sw: 0.5 }));
  }
  const title = [p.showName ? p.name.trim() : '', p.showLength ? `${fmtInt(L)} bp` : '']
    .filter((s) => s !== '')
    .join(' · ');
  if (title !== '')
    out.push(
      text(title, x0, clamp(ls * 1.1, 0, h), ls * 1.15, ink, { anchor: 'start', bold: true }),
    );
  return out;
}

export const plasmidMap = defineKind<PlasmidParams>({
  kind: 'plasmidMap',
  version: 1,
  title: 'Plasmid map',
  category: 'Molecules',
  description: 'A circular or linear map with features; PlasmidPop maps paste in as these.',
  keywords: ['plasmid', 'vector', 'construct', 'circular', 'backbone', 'dna'],
  defaultSize: { w: 300, h: 300 },
  fields: [
    { key: 'name', label: 'Name', type: 'text', maxLength: 200, default: 'pUC19' },
    { key: 'length', label: 'Length', type: 'int', min: 1, max: MAX_BP, unit: 'bp', default: 2686 },
    {
      key: 'topology',
      label: 'Topology',
      type: 'enum',
      options: [
        { value: 'circular', label: 'Circular' },
        { value: 'linear', label: 'Linear' },
      ],
      default: 'circular',
    },
    {
      key: 'features',
      label: 'Features',
      type: 'list',
      item: FEATURE_FIELDS,
      min: 0,
      max: 500,
      default: DEFAULT_FEATURES,
      itemTitle: (it: Item, i: number) =>
        `${typeof it['name'] === 'string' && it['name'] !== '' ? it['name'] : `Feature ${String(i + 1)}`} (${String(it['start'])}–${String(it['end'])})`,
      newItem: (p, items) => {
        const len = typeof p['length'] === 'number' ? p['length'] : 1000;
        const start = Math.max(1, Math.round(len / 2));
        return {
          name: `feature ${String(items.length + 1)}`,
          start,
          end: Math.min(len, start + Math.max(1, Math.round(len / 10))),
          strand: 1,
          type: 'misc_feature',
          color: '',
        };
      },
    },
    { key: 'showName', label: 'Name in the middle', type: 'bool', default: true },
    { key: 'showLength', label: 'Length', type: 'bool', default: true },
    { key: 'showTicks', label: 'Scale ticks', type: 'bool', default: true },
    { key: 'showLabels', label: 'Feature labels', type: 'bool', default: true },
    {
      key: 'ring',
      label: 'Feature width',
      type: 'number',
      min: 2,
      max: 40,
      step: 0.5,
      unit: 'pt',
      default: 11,
    },
    {
      key: 'labelSize',
      label: 'Label size',
      type: 'number',
      min: 3,
      max: 18,
      step: 0.5,
      unit: 'pt',
      default: 7,
    },
    {
      key: 'minLabelPct',
      label: 'Smallest labelled feature',
      type: 'number',
      min: 0,
      max: 100,
      step: 0.1,
      unit: '% of length',
      default: 1,
    },
  ],
  slots: [
    { id: 'backbone', label: 'Backbone', default: '#52606d' },
    { id: 'text', label: 'Text', default: '#1f2933' },
  ],
  fix: (p) => ({
    ...p,
    features: p.features.map((f) => ({
      ...f,
      start: Math.min(f.start, p.length),
      end: Math.min(f.end, p.length),
      // A wrap is only meaningful on a circle; a linear map draws the span.
    })),
  }),
  render(p, { w, h, slots }) {
    return p.topology === 'circular' ? circular(p, w, h, slots) : linear(p, w, h, slots);
  },
});
