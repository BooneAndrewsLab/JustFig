/**
 * Labels for a gel photo (note 18, issue 13): a lane-label row over N evenly
 * spaced lanes and ladder sizes down one side. The frame is the gel picture's
 * own box and the labels hang outside it (`overhang`), so lane positions are
 * fractions of the picture: grouped with it, resizing keeps every label on its
 * lane while the text keeps its size in points.
 */
import { type Prim, line, pathPrim } from '../prims';
import { type Item, defineKind } from '../types';
import { text } from './util';

export interface SizeMark {
  readonly label: string;
  /** Down from the top of the picture, percent of its height. */
  readonly at: number;
}

export interface GelLabelsParams {
  readonly lanes: readonly { readonly label: string }[];
  /** Centres of the first and last lane, percent of the picture's width. */
  readonly first: number;
  readonly last: number;
  readonly angle: 0 | 45 | 90;
  readonly sizes: readonly SizeMark[];
  readonly side: 'left' | 'right';
  readonly ticks: boolean;
  /** Points. */
  readonly size: number;
}

/** A generous width of one character, as a multiple of the size (for the stated reach). */
const CHAR = 0.65;

const longest = (xs: readonly string[]): number => xs.reduce((n, s) => Math.max(n, s.length), 0);

export const gelLabels = defineKind<GelLabelsParams>({
  kind: 'gelLabels',
  version: 1,
  title: 'Gel lane labels',
  category: 'Lab',
  description: 'Lane labels and ladder sizes for a gel photo, laid over the picture.',
  keywords: ['gel', 'lane', 'ladder', 'marker', 'western', 'blot', 'photo', 'label'],
  defaultSize: { w: 200, h: 140 },
  fields: [
    {
      key: 'lanes',
      label: 'Lanes',
      type: 'list',
      min: 1,
      max: 40,
      item: [{ key: 'label', label: 'Label', type: 'text', maxLength: 24, default: '' }],
      default: ['L', '1', '2', '3', '4', '5'].map((label) => ({ label })),
      itemTitle: (it: Item, i: number) =>
        `Lane ${String(i + 1)}${typeof it['label'] === 'string' && it['label'] !== '' ? ` “${it['label']}”` : ''}`,
      newItem: (_p, items) => ({ label: String(items.length) }),
    },
    {
      key: 'first',
      label: 'First lane at',
      help: 'Centre of the first lane, from the left edge of the picture.',
      type: 'number',
      min: 0,
      max: 100,
      step: 0.5,
      unit: '%',
      default: 8,
    },
    {
      key: 'last',
      label: 'Last lane at',
      help: 'Centre of the last lane; the lanes in between are evenly spaced.',
      type: 'number',
      min: 0,
      max: 100,
      step: 0.5,
      unit: '%',
      default: 92,
    },
    {
      key: 'angle',
      label: 'Label angle',
      type: 'enum',
      options: [
        { value: 0, label: 'Level' },
        { value: 45, label: 'Slanted (45°)' },
        { value: 90, label: 'Upright (90°)' },
      ],
      default: 0,
    },
    {
      key: 'sizes',
      label: 'Ladder sizes',
      type: 'list',
      min: 0,
      max: 30,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 16, default: '' },
        {
          key: 'at',
          label: 'Height',
          help: 'Down from the top of the picture.',
          type: 'number',
          min: 0,
          max: 100,
          step: 0.5,
          unit: '%',
          default: 50,
        },
      ],
      default: [
        { label: '10 kb', at: 15 },
        { label: '3 kb', at: 40 },
        { label: '1 kb', at: 68 },
      ],
      itemTitle: (it: Item, i: number) =>
        typeof it['label'] === 'string' && it['label'] !== ''
          ? `“${it['label']}”`
          : `Size ${String(i + 1)}`,
      newItem: () => ({ label: '', at: 50 }),
    },
    {
      key: 'side',
      label: 'Sizes on',
      type: 'enum',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
      default: 'left',
    },
    { key: 'ticks', label: 'Size ticks', type: 'bool', default: true },
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
  slots: [{ id: 'text', label: 'Text', default: '#1f2933' }],
  overhang: (p) => {
    const gap = p.size * 0.4;
    const top =
      gap + p.size * (1 + (p.angle === 0 ? 0 : CHAR * longest(p.lanes.map((l) => l.label))));
    const side = gap + p.size * (0.6 + CHAR * longest(p.sizes.map((s) => s.label)));
    return Math.max(top, side) + p.size;
  },
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const ink = slots['text'] ?? '#1f2933';
    const gap = p.size * 0.4;
    const n = p.lanes.length;
    p.lanes.forEach((l, k) => {
      if (l.label.trim() === '') return;
      const t = n > 1 ? k / (n - 1) : 0;
      const x = (w * (p.first + (p.last - p.first) * t)) / 100;
      out.push(
        p.angle === 0
          ? text(l.label, x, -gap, p.size, ink, { baseline: 'alphabetic' })
          : text(l.label, x, -gap, p.size, ink, {
              anchor: 'start',
              rotation: -p.angle,
            }),
      );
    });
    const tick = p.ticks ? p.size * 0.6 : 0;
    const left = p.side === 'left';
    const edge = left ? 0 : w;
    const dir = left ? -1 : 1;
    const marks = p.sizes.filter((s) => s.label.trim() !== '');
    for (const s of marks) {
      const y = (h * s.at) / 100;
      out.push(
        text(s.label, edge + dir * (tick + gap), y, p.size, ink, {
          anchor: left ? 'end' : 'start',
        }),
      );
    }
    if (tick > 0 && marks.length > 0)
      out.push(
        ...pathPrim(
          marks.map((s) => {
            const y = (h * s.at) / 100;
            return line({ x: edge + dir * tick, y }, { x: edge, y });
          }),
          { stroke: ink, sw: Math.max(0.5, p.size / 16), cap: 'butt' },
        ),
      );
    return out;
  },
});
