/**
 * An experiment timeline (note 04, issue 52): "day 0 injection, day 7 boost, day 14 harvest".
 * A time axis with ticks, events marked by a tick, a triangle or a bracket and labelled on
 * one side (stacked in rows when they would collide), and ranges (treatments, time on a diet)
 * drawn as bars on the other side, below the tick labels. Everything is a fill, so the
 * drawing is one `<path>` per colour; text sizes stay in points when the frame is resized,
 * and only the axis length follows the frame.
 */
import { parseHex } from '@/core/color/color';

import { type Prim, type Sub, pathPrim, poly, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { byColour, clamp, niceStep, text } from './util';

export type TimeUnit = 'hours' | 'days' | 'weeks';
export type Marker = 'tick' | 'triangle' | 'bracket';

export type TimelineEvent = Readonly<{
  time: number;
  label: string;
  marker: Marker;
  /** Where a bracket ends (other markers ignore it). */
  end: number;
  /** `''`: the Markers colour. */
  color: string;
}>;

export type TimelineRange = Readonly<{ start: number; end: number; label: string; color: string }>;

export interface TimelineParams {
  readonly start: number;
  readonly end: number;
  readonly unit: TimeUnit;
  /** `prefix`: "Day 7"; `unit`: "7" and the unit after the axis; `none`: no tick labels. */
  readonly tickLabels: 'prefix' | 'unit' | 'none';
  /** 0: automatic. */
  readonly step: number;
  readonly events: readonly TimelineEvent[];
  readonly ranges: readonly TimelineRange[];
  readonly side: 'above' | 'below';
  readonly arrow: boolean;
  /** Points. */
  readonly size: number;
}

const LIMIT = 100_000;
const MAX_TICKS = 200;
const MIN_SPAN = 0.001;
const RANGE_COLOURS = ['#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#f0e442', '#0072b2'];

/** A generous estimate of a label's width (no font metrics in a pure render). */
export const est = (s: string, size: number): number => 0.56 * size * s.length;
/** Up to four significant digits, no trailing zeros. */
const num = (v: number): string => String(Number(v.toPrecision(4)));

export const WORD: Record<TimeUnit, [one: string, many: string]> = {
  hours: ['Hour', 'hours'],
  days: ['Day', 'days'],
  weeks: ['Week', 'weeks'],
};

/** "Day 7", "Week 2", or "24 h" (hours read better as a suffix). */
export function tickText(p: Pick<TimelineParams, 'unit' | 'tickLabels'>, t: number): string {
  if (p.tickLabels === 'none') return '';
  if (p.tickLabels === 'unit') return num(t);
  return p.unit === 'hours' ? `${num(t)} h` : `${WORD[p.unit][0]} ${num(t)}`;
}

/** Tick times: the typed step, or a 1-2-5 step giving labels room. */
export function tickTimes(p: TimelineParams, axisLen: number): number[] {
  const span = p.end - p.start;
  const widest = Math.max(
    est(tickText(p, p.start), p.size),
    est(tickText(p, p.end), p.size),
    p.size,
  );
  const target = clamp(Math.floor(axisLen / (widest * 1.8)), 1, 10);
  // Weeks of days and whole days of hours read better than a 1-2-5 step, when they fit.
  const natural = p.unit === 'days' ? 7 : p.unit === 'hours' ? 24 : 0;
  const n = natural > 0 ? span / natural : 0;
  // Whole units once the axis spans a few: "Day 0.5" is rarely meant.
  const auto =
    Number.isInteger(n) && n >= 2 && n <= target
      ? natural
      : Math.max(niceStep(span, target), span >= 2 ? 1 : 0);
  const step = p.step > 0 && span / p.step <= MAX_TICKS ? p.step : auto;
  const out: number[] = [];
  const first = Math.ceil(p.start / step - 1e-9);
  for (let i = first; out.length <= MAX_TICKS; i++) {
    const t = Number((i * step).toPrecision(12));
    if (t > p.end + 1e-9 * Math.max(1, Math.abs(p.end))) break;
    out.push(t);
  }
  return out;
}

export const luminance = (hex: string): number => {
  const c = parseHex(hex);
  if (!c) return 0;
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
};

/** Greedy rows: each span goes in the first row it fits in. */
export function rows(spans: readonly (readonly [number, number])[], gap: number): number[] {
  const ends: number[] = [];
  return spans.map(([a, b]) => {
    let r = ends.findIndex((e) => a >= e + gap);
    if (r < 0) r = ends.length;
    ends[r] = b;
    return r;
  });
}

const lineH = (size: number) => size * 1.3;
const barH = (size: number) => size * 1.6;

export const timeline = defineKind<TimelineParams>({
  kind: 'timeline',
  version: 1,
  title: 'Experiment timeline',
  category: 'Lab',
  description: 'A time axis with events (injection, boost, harvest) and treatment periods as bars.',
  keywords: [
    'timeline',
    'schedule',
    'time',
    'day',
    'week',
    'hour',
    'injection',
    'treatment',
    'regimen',
    'dosing',
    'protocol',
    'course',
  ],
  defaultSize: { w: 360, h: 90 },
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
      default: 14,
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
      key: 'events',
      label: 'Events',
      type: 'list',
      min: 0,
      max: 40,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 40, default: 'Event' },
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
          key: 'marker',
          label: 'Marker',
          type: 'enum',
          options: [
            { value: 'triangle', label: 'Triangle' },
            { value: 'tick', label: 'Tick' },
            { value: 'bracket', label: 'Bracket' },
          ],
          default: 'triangle',
        },
        {
          key: 'end',
          label: 'Bracket end',
          help: 'Brackets only: the time the bracket reaches.',
          type: 'number',
          min: -LIMIT,
          max: LIMIT,
          step: 1,
          default: 0,
        },
        { key: 'color', label: 'Colour', type: 'color', default: '', auto: true },
      ],
      default: [
        { label: 'Injection', time: 0, marker: 'triangle', end: 0, color: '' },
        { label: 'Boost', time: 7, marker: 'triangle', end: 7, color: '' },
        { label: 'Harvest', time: 14, marker: 'triangle', end: 14, color: '' },
      ],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['label'] === 'string' && it['label'] !== '' ? it['label'] : `Event ${String(i + 1)}`} (${String(it['time'])})`,
      newItem: (p, items) => {
        const s = typeof p['start'] === 'number' ? p['start'] : 0;
        const e = typeof p['end'] === 'number' ? p['end'] : 10;
        const t = Number((s + (e - s) / 2).toPrecision(4));
        return {
          label: `Event ${String(items.length + 1)}`,
          time: t,
          marker: 'triangle',
          end: t,
          color: '',
        };
      },
    },
    {
      key: 'ranges',
      label: 'Periods',
      type: 'list',
      min: 0,
      max: 20,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 40, default: 'Treatment' },
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
      default: [{ label: 'Doxycycline', start: 3, end: 10, color: '#56b4e9' }],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['label'] === 'string' && it['label'] !== '' ? it['label'] : `Period ${String(i + 1)}`} (${String(it['start'])}–${String(it['end'])})`,
      newItem: (p, items) => {
        const s = typeof p['start'] === 'number' ? p['start'] : 0;
        const e = typeof p['end'] === 'number' ? p['end'] : 10;
        return {
          label: `Period ${String(items.length + 1)}`,
          start: s,
          end: e,
          color: RANGE_COLOURS[items.length % RANGE_COLOURS.length] ?? '#56b4e9',
        };
      },
    },
    {
      key: 'side',
      label: 'Event labels',
      type: 'enum',
      options: [
        { value: 'above', label: 'Above the axis' },
        { value: 'below', label: 'Below the axis' },
      ],
      default: 'above',
    },
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
  slots: [
    { id: 'axis', label: 'Axis', default: '#1f2933' },
    { id: 'marker', label: 'Markers', default: '#d55e00' },
    { id: 'text', label: 'Text', default: '#1f2933' },
  ],
  // The axis start must come before its end; a time span of (almost) zero would draw nothing.
  fix: (p) => {
    if (p.end - p.start >= MIN_SPAN) return p;
    if (p.start <= LIMIT - 1) return { ...p, end: p.start + 1 };
    return { ...p, start: LIMIT - 1, end: LIMIT };
  },
  // Text keeps its size in points, so on a small frame the stack of labels, the tick labels
  // and the bars reach out past it: at most every event on its own row, every period on its
  // own lane, and the longest label sticking out sideways.
  overhang: (p) => {
    const s = p.size;
    const longest = Math.max(
      0,
      ...p.events.map((e) => est(e.label, s)),
      ...p.ranges.map((r) => est(r.label, s)),
      est(tickText(p, p.start), s),
      est(tickText(p, p.end), s),
      est(WORD[p.unit][1], s),
    );
    return (
      s * 6 + p.events.length * lineH(s) + p.ranges.length * (barH(s) + s * 0.4) + longest + s * 2
    );
  },
  render(p, { w, h, slots }) {
    const s = p.size;
    const axisInk = slots['axis'] ?? '#1f2933';
    const ink = slots['text'] ?? '#1f2933';
    const markInk = slots['marker'] ?? '#d55e00';
    const fills: { sub: Sub; color: string }[] = [];
    const labels: Prim[] = [];
    const fill = (sub: Sub, color: string) => fills.push({ sub, color });

    // Horizontal: room for the first and last tick label, and the unit or the arrow.
    const unitWord = p.tickLabels === 'unit' ? WORD[p.unit][1] : '';
    const arrowLen = p.arrow ? s * 0.9 : 0;
    const ml = Math.min(
      w * 0.3,
      p.tickLabels === 'none' ? s * 0.5 : est(tickText(p, p.start), s) / 2 + 1,
    );
    const mrLabel =
      p.tickLabels === 'unit'
        ? arrowLen + s * 0.5 + est(unitWord, s)
        : Math.max(arrowLen, p.tickLabels === 'none' ? 0 : est(tickText(p, p.end), s) / 2 + 1);
    const mr = Math.min(w * 0.3, mrLabel + s * 0.3);
    const x0 = ml;
    const x1 = Math.max(x0, w - mr);
    const span = p.end - p.start;
    const xOf = (t: number) => x0 + ((x1 - x0) * (clamp(t, p.start, p.end) - p.start)) / span;
    const inside = (t: number) => t >= p.start - 1e-9 && t <= p.end + 1e-9;

    // Events (label side): marker, then label rows stacked outwards.
    const events = p.events
      .filter((e) => inside(e.time))
      .map((e) => {
        const a = xOf(e.time);
        const b = e.marker === 'bracket' ? xOf(e.end) : a;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const c = (lo + hi) / 2;
        const half = est(e.label, s) / 2;
        // Centred over the marker, unless that would run past the frame: then flush with it.
        const cx = clamp(c, half, Math.max(half, w - half));
        return { e, lo, hi, cx, half };
      })
      .sort((u, v) => u.cx - v.cx);
    const evRow = rows(
      events.map((v) => [v.cx - v.half, v.cx + v.half] as const),
      s * 0.6,
    );
    const nRows = events.length === 0 ? 0 : Math.max(...evRow) + 1;
    const thick = Math.max(0.5, s * 0.1);
    const markZone = events.length === 0 ? 0 : s * 0.95;
    const rowAt = (r: number) => markZone + s * 0.35 + r * lineH(s);
    const up = nRows === 0 ? markZone : rowAt(nRows - 1) + s;

    // Ticks, tick labels and period bars (the other side).
    const tickLen = s * 0.45;
    const numsTop = tickLen + s * 0.3;
    const numsEnd = p.tickLabels === 'none' ? tickLen : numsTop + s;
    const ranges = p.ranges
      .filter((r) => Math.max(r.start, r.end) >= p.start && Math.min(r.start, r.end) <= p.end)
      .map((r) => {
        const a = xOf(Math.min(r.start, r.end));
        const b = xOf(Math.max(r.start, r.end));
        const tw = est(r.label, s);
        const fits = r.label === '' || tw + s <= b - a;
        // A label that does not fit goes after the bar, or before it near the frame's end.
        const after = b + s * 0.4 + tw <= w || a - s * 0.4 - tw < 0;
        const ext = fits ? [a, b] : after ? [a, b + s * 0.4 + tw] : [a - s * 0.4 - tw, b];
        return { r, a, b, fits, after, ext: [ext[0] ?? a, ext[1] ?? b] as const };
      });
    const lane = rows(
      ranges.map((g) => g.ext),
      s * 0.3,
    );
    const nLanes = ranges.length === 0 ? 0 : Math.max(...lane) + 1;
    const bh = barH(s);
    const laneAt = (l: number) => numsEnd + s * 0.6 + l * (bh + s * 0.4);
    const down = nLanes === 0 ? numsEnd : laneAt(nLanes - 1) + bh;

    // Vertical: centre the whole stack in the frame; `dir` points from the axis to the labels.
    const dir = p.side === 'above' ? -1 : 1;
    const labelExtent = p.side === 'above' ? up : down;
    const axisY = (h - (up + down)) / 2 + labelExtent;
    const at = (d: number, sign: number) => axisY + sign * d;
    /** A text box occupying distances d … d + size from the axis on that side. */
    const boxText = (str: string, x: number, d: number, sign: number, color: string) =>
      sign > 0
        ? text(str, x, at(d, sign), s, color, { anchor: 'middle', baseline: 'top' })
        : text(str, x, at(d + s * 0.22, sign), s, color, {
            anchor: 'middle',
            baseline: 'alphabetic',
          });

    // The axis, its arrow and its ticks.
    fill(rect(x0, axisY - thick / 2, x1 - x0, thick), axisInk);
    if (p.arrow) {
      const aw = s * 0.32;
      fill(
        poly(
          [
            { x: x1, y: axisY - aw },
            { x: x1 + arrowLen, y: axisY },
            { x: x1, y: axisY + aw },
          ],
          true,
        ),
        axisInk,
      );
    }
    const other = -dir;
    const tickW = thick * 0.9;
    const ticks = tickTimes(p, x1 - x0);
    // Minor ticks every whole unit, when the step is longer and there is room for them.
    const major = ticks.length > 1 ? (ticks[1] ?? 0) - (ticks[0] ?? 0) : span;
    if (major > 1 && span <= 31 && (x1 - x0) / span >= s * 0.4) {
      const y0 = at(0, other);
      const y1 = at(tickLen * 0.55, other);
      for (let t = Math.ceil(p.start); t <= p.end; t++)
        if (!ticks.some((m) => Math.abs(m - t) < 1e-9))
          fill(rect(xOf(t) - tickW / 2, Math.min(y0, y1), tickW, Math.abs(y1 - y0)), axisInk);
    }
    for (const t of ticks) {
      const x = xOf(t);
      const y0 = at(0, other);
      const y1 = at(tickLen, other);
      fill(rect(x - tickW / 2, Math.min(y0, y1), tickW, Math.abs(y1 - y0)), axisInk);
      if (p.tickLabels !== 'none') {
        const label = boxText(tickText(p, t), x, numsTop, other, ink);
        labels.push(label);
      }
    }
    if (p.tickLabels === 'unit')
      labels.push(
        text(unitWord, x1 + arrowLen + s * 0.5, axisY, s, ink, {
          anchor: 'start',
          baseline: 'middle',
        }),
      );

    // Event markers, stems to labels in outer rows, and the labels.
    const mw = thick * 1.1;
    events.forEach((v, i) => {
      const color = v.e.color === '' ? markInk : v.e.color;
      const row = evRow[i] ?? 0;
      const yA = at(thick / 2, dir);
      const yM = at(markZone, dir);
      if (v.e.marker === 'triangle') {
        const half = s * 0.42;
        fill(
          poly(
            [
              { x: v.lo, y: yA },
              { x: v.lo - half, y: yM },
              { x: v.lo + half, y: yM },
            ],
            true,
          ),
          color,
        );
      } else if (v.e.marker === 'tick') {
        const y0 = at(tickLen, other);
        fill(rect(v.lo - mw, Math.min(y0, yM), mw * 2, Math.abs(yM - y0)), color);
      } else {
        // A bracket: legs from near the axis out to a bar spanning the period.
        const yL = at(markZone * 0.35, dir);
        const legs = [v.lo, v.hi];
        for (const x of legs)
          fill(rect(x - mw / 2, Math.min(yL, yM), mw, Math.abs(yM - yL)), color);
        fill(
          rect(v.lo - mw / 2, Math.min(yM, at(markZone - mw, dir)), v.hi - v.lo + mw, mw),
          color,
        );
      }
      const dRow = rowAt(row);
      if (row > 0) {
        const xs = v.e.marker === 'bracket' ? (v.lo + v.hi) / 2 : v.lo;
        const ya = at(markZone, dir);
        const yb = at(dRow - s * 0.2, dir);
        fill(rect(xs - thick / 4, Math.min(ya, yb), thick / 2, Math.abs(yb - ya)), color);
      }
      labels.push(boxText(v.e.label, v.cx, dRow, dir, ink));
    });

    // Period bars, with their labels inside when they fit.
    ranges.forEach((g, i) => {
      const d = laneAt(lane[i] ?? 0);
      const yTop = Math.min(at(d, other), at(d + bh, other));
      fill(
        rect(g.a, yTop, Math.max(0, g.b - g.a), bh, Math.min(bh * 0.25, (g.b - g.a) / 2)),
        g.r.color,
      );
      if (g.r.label === '') return;
      const ym = yTop + bh / 2;
      if (g.fits) {
        const onBar = luminance(g.r.color) > 0.35 ? '#1f2933' : '#ffffff';
        labels.push(text(g.r.label, (g.a + g.b) / 2, ym, s, onBar, { baseline: 'middle' }));
      } else if (g.after)
        labels.push(
          text(g.r.label, g.b + s * 0.4, ym, s, ink, { anchor: 'start', baseline: 'middle' }),
        );
      else
        labels.push(
          text(g.r.label, g.a - s * 0.4, ym, s, ink, { anchor: 'end', baseline: 'middle' }),
        );
    });

    const out: Prim[] = [];
    for (const [color, list] of byColour(fills, (f) => f.color))
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
