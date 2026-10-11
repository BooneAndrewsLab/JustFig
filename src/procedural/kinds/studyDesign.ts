/**
 * A study design (note 42, issue 76): several arms stacked on one shared time axis. Each arm
 * has a name and n written at the left, a thin guide line, markers at time points with one
 * glyph per kind (injection a down-pointing triangle, dosing a filled circle, sampling an open
 * circle, endpoint a cross) and treatment bars under the markers. The axis helpers are the
 * timeline's (`tickTimes`, `tickText`); the lists follow its list-field syntax. Everything is a
 * fill, so the drawing is one `<path>` per colour for the guides, one for the bars and one for
 * the markers, drawn over them. Text sizes stay in points; only the axis length follows the frame.
 */
import type { PathNode } from '@/core/model/types';

import { type Prim, type Sub, arcNodes, pathPrim, poly, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { WORD, est, luminance, rows, tickText, tickTimes } from './timeline';
import type { TimeUnit, TimelineParams } from './timeline';
import { byColour, clamp, text } from './util';

export type MarkKind = 'inject' | 'dose' | 'sample' | 'endpoint';

export type StudyArm = Readonly<{ name: string; n: number; color: string }>;
export type StudyMark = Readonly<{ arm: number; time: number; kind: MarkKind }>;
export type StudyBar = Readonly<{
  /** 1-based arm; 0 draws the bar on every arm. */
  arm: number;
  start: number;
  end: number;
  label: string;
  color: string;
}>;

export interface StudyDesignParams {
  readonly start: number;
  readonly end: number;
  readonly unit: TimeUnit;
  readonly tickLabels: 'prefix' | 'unit' | 'none';
  readonly step: number;
  readonly arms: readonly StudyArm[];
  readonly marks: readonly StudyMark[];
  readonly bars: readonly StudyBar[];
  readonly legend: boolean;
  readonly arrow: boolean;
  readonly size: number;
}

const LIMIT = 100_000;
const MIN_SPAN = 0.001;
const BAR_COLOURS = ['#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#f0e442', '#0072b2'];
const KIND_WORD: Record<MarkKind, string> = {
  inject: 'Injection',
  dose: 'Dosing',
  sample: 'Sampling',
  endpoint: 'Endpoint',
};
const KINDS: readonly MarkKind[] = ['inject', 'dose', 'sample', 'endpoint'];

const SLOT_DEFAULT: Record<MarkKind, string> = {
  inject: '#d55e00',
  dose: '#0072b2',
  sample: '#009e73',
  endpoint: '#1f2933',
};

/** Glyphs as subpaths centred on (x, y), half-size g. */
function glyph(kind: MarkKind, x: number, y: number, g: number): Sub[] {
  switch (kind) {
    case 'inject':
      return [
        poly(
          [
            { x: x - g, y: y - g },
            { x: x + g, y: y - g },
            { x, y: y + g },
          ],
          true,
        ),
      ];
    case 'dose': {
      const nodes: PathNode[] = arcNodes(x, y, g, 0, Math.PI * 2);
      return [{ t: 'poly', nodes, closed: true }];
    }
    case 'sample': {
      // A ring: the inner circle runs the other way, so the nonzero fill leaves a hole.
      const outer: PathNode[] = arcNodes(x, y, g, 0, Math.PI * 2);
      const inner: PathNode[] = arcNodes(x, y, g * 0.55, Math.PI * 2, 0);
      return [
        { t: 'poly', nodes: outer, closed: true },
        { t: 'poly', nodes: inner, closed: true },
      ];
    }
    case 'endpoint': {
      const t = g * 0.17;
      const d = g * 0.9;
      return [
        poly(
          [
            { x: x - d + t, y: y - d - t },
            { x: x - d - t, y: y - d + t },
            { x: x + d - t, y: y + d + t },
            { x: x + d + t, y: y + d - t },
          ],
          true,
        ),
        poly(
          [
            { x: x + d - t, y: y - d - t },
            { x: x + d + t, y: y - d + t },
            { x: x - d + t, y: y + d + t },
            { x: x - d - t, y: y + d - t },
          ],
          true,
        ),
      ];
    }
  }
}

const markH = (s: number) => s * 2.2;
const barRowH = (s: number) => s * 1.3;

const armLabel = (a: StudyArm): string => (a.n > 0 ? `${a.name} (n = ${String(a.n)})` : a.name);

/** The timeline's axis helpers take its params; the study design only has the axis ones. */
const axisParams = (p: StudyDesignParams): TimelineParams => ({
  start: p.start,
  end: p.end,
  unit: p.unit,
  tickLabels: p.tickLabels,
  step: p.step,
  events: [],
  ranges: [],
  side: 'below',
  arrow: p.arrow,
  size: p.size,
});

export const studyDesign = defineKind<StudyDesignParams>({
  kind: 'studyDesign',
  version: 1,
  title: 'Study design',
  category: 'Lab',
  description:
    'Study arms stacked on one time axis, with injection, dosing, sampling and endpoint markers and treatment bars.',
  keywords: [
    'study',
    'design',
    'cohort',
    'arm',
    'animal',
    'mouse',
    'mice',
    'clinical',
    'trial',
    'group',
    'timepoint',
    'endpoint',
    'sampling',
  ],
  defaultSize: { w: 380, h: 150 },
  fields: [
    {
      key: 'start',
      label: 'Axis start',
      type: 'number',
      min: -LIMIT,
      max: LIMIT,
      step: 1,
      default: 0,
    },
    {
      key: 'end',
      label: 'Axis end',
      type: 'number',
      min: -LIMIT,
      max: LIMIT,
      step: 1,
      default: 21,
    },
    {
      key: 'unit',
      label: 'Unit',
      type: 'enum',
      options: [
        { value: 'hours', label: 'Hours' },
        { value: 'days', label: 'Days' },
        { value: 'weeks', label: 'Weeks' },
      ],
      default: 'days',
    },
    {
      key: 'tickLabels',
      label: 'Tick labels',
      type: 'enum',
      options: [
        { value: 'prefix', label: 'Day 7 / 24 h' },
        { value: 'unit', label: 'Numbers, unit at the end' },
        { value: 'none', label: 'None' },
      ],
      default: 'prefix',
    },
    {
      key: 'step',
      label: 'Tick step',
      help: '0 picks a step that leaves the labels room.',
      type: 'number',
      min: 0,
      max: LIMIT,
      step: 1,
      default: 0,
    },
    {
      key: 'arms',
      label: 'Arms',
      type: 'list',
      min: 1,
      max: 8,
      item: [
        { key: 'name', label: 'Group', type: 'text', maxLength: 40, default: 'Group' },
        {
          key: 'n',
          label: 'n',
          help: '0 leaves n out of the label.',
          type: 'int',
          min: 0,
          max: 100_000,
          default: 8,
        },
        { key: 'color', label: 'Guide line', type: 'color', default: '#9aa5b1' },
      ],
      default: [
        { name: 'Vehicle', n: 8, color: '#9aa5b1' },
        { name: 'Drug A', n: 8, color: '#9aa5b1' },
      ],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['name'] === 'string' && it['name'] !== '' ? it['name'] : 'Arm'} (arm ${String(i + 1)})`,
      newItem: (_p, items) => ({
        name: `Group ${String(items.length + 1)}`,
        n: 8,
        color: '#9aa5b1',
      }),
    },
    {
      key: 'marks',
      label: 'Markers',
      type: 'list',
      min: 0,
      max: 80,
      item: [
        {
          key: 'arm',
          label: 'Arm',
          help: 'The arm’s number in the list above.',
          type: 'int',
          min: 1,
          max: 8,
          default: 1,
        },
        {
          key: 'time',
          label: 'Time',
          type: 'number',
          min: -LIMIT,
          max: LIMIT,
          step: 1,
          default: 0,
        },
        {
          key: 'kind',
          label: 'Marker',
          type: 'enum',
          options: [
            { value: 'inject', label: 'Injection (triangle)' },
            { value: 'dose', label: 'Dosing (filled circle)' },
            { value: 'sample', label: 'Sampling (open circle)' },
            { value: 'endpoint', label: 'Endpoint (cross)' },
          ],
          default: 'dose',
        },
      ],
      default: [
        { arm: 1, time: 0, kind: 'inject' },
        { arm: 1, time: 7, kind: 'sample' },
        { arm: 1, time: 14, kind: 'sample' },
        { arm: 1, time: 21, kind: 'endpoint' },
        { arm: 2, time: 0, kind: 'inject' },
        { arm: 2, time: 3, kind: 'dose' },
        { arm: 2, time: 7, kind: 'sample' },
        { arm: 2, time: 14, kind: 'sample' },
        { arm: 2, time: 21, kind: 'endpoint' },
      ],
      itemTitle: (it: Item) =>
        `Arm ${String(it['arm'])}: ${KIND_WORD[it['kind'] as MarkKind]} (${String(it['time'])})`,
      newItem: (p, items) => {
        const s = typeof p['start'] === 'number' ? p['start'] : 0;
        const e = typeof p['end'] === 'number' ? p['end'] : 10;
        return {
          arm: 1,
          time: Number((s + (e - s) / 2).toPrecision(4)),
          kind: items.length % 2 === 0 ? 'dose' : 'sample',
        };
      },
    },
    {
      key: 'bars',
      label: 'Treatment bars',
      type: 'list',
      min: 0,
      max: 20,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 40, default: 'Treatment' },
        {
          key: 'arm',
          label: 'Arm',
          help: '0 draws the bar on every arm.',
          type: 'int',
          min: 0,
          max: 8,
          default: 0,
        },
        {
          key: 'start',
          label: 'From',
          type: 'number',
          min: -LIMIT,
          max: LIMIT,
          step: 1,
          default: 0,
        },
        { key: 'end', label: 'To', type: 'number', min: -LIMIT, max: LIMIT, step: 1, default: 1 },
        { key: 'color', label: 'Colour', type: 'color', default: '#56b4e9' },
      ],
      default: [{ label: 'Drug A, daily', arm: 2, start: 3, end: 14, color: '#56b4e9' }],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['label'] === 'string' && it['label'] !== '' ? it['label'] : `Bar ${String(i + 1)}`} (${String(it['start'])}–${String(it['end'])})`,
      newItem: (p, items) => {
        const s = typeof p['start'] === 'number' ? p['start'] : 0;
        const e = typeof p['end'] === 'number' ? p['end'] : 10;
        return {
          label: `Treatment ${String(items.length + 1)}`,
          arm: 0,
          start: s,
          end: e,
          color: BAR_COLOURS[items.length % BAR_COLOURS.length] ?? '#56b4e9',
        };
      },
    },
    { key: 'legend', label: 'Legend of markers', type: 'bool', default: true },
    { key: 'arrow', label: 'Arrow at the end', type: 'bool', default: true },
    {
      key: 'size',
      label: 'Text size',
      type: 'number',
      min: 4,
      max: 24,
      step: 0.5,
      unit: 'pt',
      default: 8,
    },
  ],
  presets: [
    {
      id: 'mouse-treatment-schedule',
      label: 'Mouse treatment schedule',
      params: {
        start: 0,
        end: 28,
        unit: 'days',
        tickLabels: 'prefix',
        step: 7,
        arms: [
          { name: 'Vehicle', n: 8, color: '#9aa5b1' },
          { name: 'Drug', n: 8, color: '#9aa5b1' },
          { name: 'Drug + anti-PD-1', n: 8, color: '#9aa5b1' },
        ],
        marks: [
          { arm: 1, time: 0, kind: 'inject' },
          { arm: 1, time: 14, kind: 'sample' },
          { arm: 1, time: 28, kind: 'endpoint' },
          { arm: 2, time: 0, kind: 'inject' },
          { arm: 2, time: 14, kind: 'sample' },
          { arm: 2, time: 28, kind: 'endpoint' },
          { arm: 3, time: 0, kind: 'inject' },
          { arm: 3, time: 14, kind: 'sample' },
          { arm: 3, time: 28, kind: 'endpoint' },
        ],
        bars: [
          { label: 'Vehicle, daily', arm: 1, start: 7, end: 21, color: '#9aa5b1' },
          { label: 'Drug, daily', arm: 2, start: 7, end: 21, color: '#56b4e9' },
          { label: 'Drug, daily', arm: 3, start: 7, end: 21, color: '#56b4e9' },
          { label: 'anti-PD-1, every 3 days', arm: 3, start: 7, end: 21, color: '#e69f00' },
        ],
        legend: true,
      },
    },
    {
      id: 'dose-and-sample',
      label: 'Dosing with timed sampling',
      params: {
        start: 0,
        end: 24,
        unit: 'hours',
        tickLabels: 'prefix',
        step: 4,
        arms: [
          { name: 'Vehicle', n: 5, color: '#9aa5b1' },
          { name: 'Compound', n: 5, color: '#9aa5b1' },
        ],
        marks: [
          { arm: 1, time: 0, kind: 'dose' },
          { arm: 1, time: 4, kind: 'sample' },
          { arm: 1, time: 8, kind: 'sample' },
          { arm: 1, time: 24, kind: 'endpoint' },
          { arm: 2, time: 0, kind: 'dose' },
          { arm: 2, time: 4, kind: 'sample' },
          { arm: 2, time: 8, kind: 'sample' },
          { arm: 2, time: 24, kind: 'endpoint' },
        ],
        bars: [],
        legend: true,
      },
    },
  ],
  slots: [
    { id: 'axis', label: 'Axis', default: '#1f2933' },
    { id: 'text', label: 'Text', default: '#1f2933' },
    { id: 'inject', label: 'Injection', default: SLOT_DEFAULT.inject },
    { id: 'dose', label: 'Dosing', default: SLOT_DEFAULT.dose },
    { id: 'sample', label: 'Sampling', default: SLOT_DEFAULT.sample },
    { id: 'endpoint', label: 'Endpoint', default: SLOT_DEFAULT.endpoint },
  ],
  fix: (p) => {
    if (p.end - p.start >= MIN_SPAN) return p;
    if (p.start <= LIMIT - 1) return { ...p, end: p.start + 1 };
    return { ...p, start: LIMIT - 1, end: LIMIT };
  },
  // Text and rows keep their size in points: at most every arm, every bar on its own row on
  // every arm, the longest label and (for the legend) four words reach past a small frame.
  overhang: (p) => {
    const s = p.size;
    const longest = Math.max(
      0,
      ...p.arms.map((a) => est(armLabel(a), s)),
      ...p.bars.map((b) => est(b.label, s)),
      est(tickText(p, p.start), s),
      est(tickText(p, p.end), s),
      est(WORD[p.unit][1], s),
    );
    return (
      s * 8 +
      p.arms.length * markH(s) +
      p.bars.length * (barRowH(s) + s * 0.3) * Math.max(1, p.arms.length) +
      longest +
      (p.legend ? s * 28 : 0)
    );
  },
  render(p, { w, h, slots }) {
    const s = p.size;
    const axisInk = slots['axis'] ?? '#1f2933';
    const ink = slots['text'] ?? '#1f2933';
    const kindInk = (k: MarkKind) => slots[k] ?? SLOT_DEFAULT[k];
    const thick = Math.max(0.5, s * 0.1);
    const g = s * 0.5;
    const ax = axisParams(p);

    // Horizontal: names at the left, the axis from there to the right margin.
    const gap = s * 0.7;
    const labelW = Math.max(0, ...p.arms.map((a) => est(armLabel(a), s)));
    const x0 = Math.min(w * 0.4, labelW + gap + g);
    const unitWord = p.tickLabels === 'unit' ? WORD[p.unit][1] : '';
    const arrowLen = p.arrow ? s * 0.9 : 0;
    const mrLabel =
      p.tickLabels === 'unit'
        ? arrowLen + s * 0.5 + est(unitWord, s)
        : Math.max(arrowLen, g, p.tickLabels === 'none' ? 0 : est(tickText(p, p.end), s) / 2 + 1);
    const x1 = Math.max(x0, w - Math.min(w * 0.3, mrLabel + s * 0.3));
    const span = p.end - p.start;
    const xOf = (t: number) => x0 + ((x1 - x0) * (clamp(t, p.start, p.end) - p.start)) / span;
    const inside = (t: number) => t >= p.start - 1e-9 && t <= p.end + 1e-9;

    // Bars of each arm go in rows under its markers; a label that does not fit goes beside.
    const bh = barRowH(s);
    const armBars = p.arms.map((_, ai) => {
      const list = p.bars
        .filter(
          (b) =>
            (b.arm === 0 || b.arm === ai + 1) &&
            Math.max(b.start, b.end) >= p.start &&
            Math.min(b.start, b.end) <= p.end,
        )
        .map((b) => {
          const a = xOf(Math.min(b.start, b.end));
          const c = xOf(Math.max(b.start, b.end));
          const tw = est(b.label, s);
          const fits = b.label === '' || tw + s <= c - a;
          const after = c + s * 0.4 + tw <= w || a - s * 0.4 - tw < 0;
          const ext = fits ? [a, c] : after ? [a, c + s * 0.4 + tw] : [a - s * 0.4 - tw, c];
          return { b, a, c, fits, after, ext: [ext[0] ?? a, ext[1] ?? c] as const };
        });
      const lane = rows(
        list.map((v) => v.ext),
        s * 0.3,
      );
      const nLanes = list.length === 0 ? 0 : Math.max(...lane) + 1;
      return { list, lane, nLanes };
    });
    const armH = armBars.map(
      (a) => markH(s) + a.nLanes * (bh + s * 0.15) + (a.nLanes > 0 ? s * 0.2 : 0),
    );
    const tickLen = s * 0.45;
    const numsEnd = p.tickLabels === 'none' ? tickLen : tickLen + s * 0.3 + s;
    const legendKinds = KINDS.filter((k) => p.marks.some((m) => m.kind === k));
    const legendH = p.legend && legendKinds.length > 0 ? s * 2 : 0;
    const total = armH.reduce((a, b) => a + b, 0) + s * 0.4 + numsEnd + legendH;
    const top = (h - total) / 2;

    const lines: { sub: Sub; color: string }[] = [];
    const barFills: { sub: Sub; color: string }[] = [];
    const markFills: { sub: Sub; color: string }[] = [];
    const labels: Prim[] = [];

    let y = top;
    p.arms.forEach((a, ai) => {
      const cy = y + markH(s) / 2;
      lines.push({ sub: rect(x0, cy - thick / 4, x1 - x0, thick / 2), color: a.color });
      labels.push(text(armLabel(a), x0 - gap, cy, s, ink, { anchor: 'end', baseline: 'middle' }));
      const ab = armBars[ai];
      ab?.list.forEach((v, i) => {
        const yTop = y + markH(s) + s * 0.1 + (ab.lane[i] ?? 0) * (bh + s * 0.15);
        barFills.push({
          sub: rect(v.a, yTop, Math.max(0, v.c - v.a), bh, Math.min(bh * 0.25, (v.c - v.a) / 2)),
          color: v.b.color,
        });
        if (v.b.label === '') return;
        const ym = yTop + bh / 2;
        if (v.fits) {
          const onBar = luminance(v.b.color) > 0.35 ? '#1f2933' : '#ffffff';
          labels.push(text(v.b.label, (v.a + v.c) / 2, ym, s, onBar, { baseline: 'middle' }));
        } else if (v.after)
          labels.push(
            text(v.b.label, v.c + s * 0.4, ym, s, ink, { anchor: 'start', baseline: 'middle' }),
          );
        else
          labels.push(
            text(v.b.label, v.a - s * 0.4, ym, s, ink, { anchor: 'end', baseline: 'middle' }),
          );
      });
      for (const m of p.marks)
        if (m.arm === ai + 1 && inside(m.time))
          for (const sub of glyph(m.kind, xOf(m.time), cy, g))
            markFills.push({ sub, color: kindInk(m.kind) });
      y += armH[ai] ?? 0;
    });

    // The shared axis under the last arm.
    const axisY = y + s * 0.4;
    lines.push({ sub: rect(x0, axisY - thick / 2, x1 - x0, thick), color: axisInk });
    if (p.arrow) {
      const aw = s * 0.32;
      lines.push({
        sub: poly(
          [
            { x: x1, y: axisY - aw },
            { x: x1 + arrowLen, y: axisY },
            { x: x1, y: axisY + aw },
          ],
          true,
        ),
        color: axisInk,
      });
    }
    const tickW = thick * 0.9;
    for (const t of tickTimes(ax, x1 - x0)) {
      const x = xOf(t);
      lines.push({ sub: rect(x - tickW / 2, axisY, tickW, tickLen), color: axisInk });
      if (p.tickLabels !== 'none')
        labels.push(
          text(tickText(ax, t), x, axisY + tickLen + s * 0.3, s, ink, {
            anchor: 'middle',
            baseline: 'top',
          }),
        );
    }
    if (p.tickLabels === 'unit')
      labels.push(
        text(unitWord, x1 + arrowLen + s * 0.5, axisY, s, ink, {
          anchor: 'start',
          baseline: 'middle',
        }),
      );

    // Legend: a glyph and its word for each kind of marker used.
    if (legendH > 0) {
      const ly = axisY + numsEnd + s * 1.1;
      let lx = x0;
      for (const k of legendKinds) {
        for (const sub of glyph(k, lx + g, ly, g)) markFills.push({ sub, color: kindInk(k) });
        labels.push(
          text(KIND_WORD[k], lx + g * 2 + s * 0.4, ly, s, ink, {
            anchor: 'start',
            baseline: 'middle',
          }),
        );
        lx += g * 2 + s * 0.4 + est(KIND_WORD[k], s) + s * 1.2;
      }
    }

    const out: Prim[] = [];
    for (const layer of [lines, barFills, markFills])
      for (const [color, list] of byColour(layer, (f) => f.color))
        out.push(
          ...pathPrim(
            list.map((f) => f.sub),
            { fill: color },
          ),
        );
    out.push(...labels);
    return out;
  },
});
