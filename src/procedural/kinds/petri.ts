/** Petri dish with seeded colony patterns (note 04): random, streak, spot dilutions, pinned grid or lawn. */
import { shiftLightness } from '@/core/color/color';
import type { Vec2 } from '@/core/model/types';

import { type Prim, type Sub, circle, pathPrim, poly } from '../prims';
import { defineKind } from '../types';
import { mix, rng } from './util';

export interface PetriParams {
  readonly pattern: 'random' | 'streak' | 'spots' | 'grid' | 'lawn' | 'none';
  readonly count: number;
  readonly size: number;
  readonly variation: number;
  readonly seed: number;
  readonly lid: boolean;
}

export const petriDish = defineKind<PetriParams>({
  kind: 'petriDish',
  version: 1,
  title: 'Petri dish',
  category: 'Lab',
  description:
    'An agar plate with colonies: random, streaked, spotted dilutions, a pinned grid or a lawn.',
  defaultSize: { w: 150, h: 150 },
  fields: [
    {
      key: 'pattern',
      label: 'Colonies',
      type: 'enum',
      options: [
        { value: 'random', label: 'Scattered' },
        { value: 'streak', label: 'Streak (three zones)' },
        { value: 'spots', label: 'Spot dilutions' },
        { value: 'grid', label: 'Pinned grid' },
        { value: 'lawn', label: 'Lawn' },
        { value: 'none', label: 'None (empty plate)' },
      ],
      default: 'random',
    },
    {
      key: 'count',
      label: 'Number',
      type: 'int',
      min: 0,
      max: 1536,
      default: 60,
      showIf: (p) => p['pattern'] !== 'lawn' && p['pattern'] !== 'none',
    },
    {
      key: 'size',
      label: 'Colony size',
      type: 'number',
      min: 0.5,
      max: 30,
      step: 0.25,
      unit: 'pt',
      default: 3.5,
    },
    {
      key: 'variation',
      label: 'Size variation',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
    },
    {
      key: 'seed',
      label: 'Arrangement',
      type: 'int',
      min: 0,
      max: 99999,
      default: 7,
      help: 'Another number gives another arrangement.',
    },
    { key: 'lid', label: 'Lid rim', type: 'bool', default: true },
  ],
  slots: [
    { id: 'dish', label: 'Dish', default: '#9aa5b1' },
    { id: 'agar', label: 'Agar', default: '#f5e6b8' },
    { id: 'colony', label: 'Colonies', default: '#fffcf0' },
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(0, Math.min(w, h) / 2 - 0.5);
    const dish = slots['dish'] ?? '#9aa5b1';
    const agar = slots['agar'] ?? '#f5e6b8';
    const colony = slots['colony'] ?? '#fffcf0';
    out.push(
      ...pathPrim([circle(cx, cy, R)], {
        fill: mix(agar, '#ffffff', 0.5),
        stroke: dish,
        sw: Math.max(0.3, R * 0.025),
      }),
    );
    out.push(
      ...pathPrim([circle(cx, cy, R * 0.93)], {
        fill: agar,
        stroke: shiftLightness(agar, -0.08),
        sw: Math.max(0.2, R * 0.008),
      }),
    );
    if (p.lid)
      out.push(
        ...pathPrim([circle(cx, cy, R * 0.975)], {
          stroke: shiftLightness(dish, 0.15),
          sw: Math.max(0.2, R * 0.01),
        }),
      );
    const Ra = R * 0.86;
    const rand = rng(p.seed);
    const size = Math.min(p.size, Math.max(0.1, R * 0.12));
    const rOf = () => size * (1 - p.variation * 0.75 * rand());
    const subs: Sub[] = [];
    const inside = (q: Vec2, r: number) => Math.hypot(q.x - cx, q.y - cy) <= Ra - r;
    const scatter = (n: number, c: Vec2, rad: number) => {
      for (let i = 0, tries = 0; i < n && tries < n * 8; tries += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand()) * rad;
        const r = rOf();
        const q = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
        if (!inside(q, r)) continue;
        subs.push(circle(q.x, q.y, r));
        i += 1;
      }
    };
    const stroke = {
      fill: colony,
      stroke: shiftLightness(colony, -0.12),
      sw: Math.max(0.15, size * 0.08),
    };
    switch (p.pattern) {
      case 'none':
        break;
      case 'lawn':
        out.push(...pathPrim([circle(cx, cy, Ra)], { fill: mix(agar, colony, 0.75) }));
        break;
      case 'random':
        scatter(p.count, { x: cx, y: cy }, Ra);
        break;
      case 'grid': {
        const n = Math.max(1, Math.ceil(Math.sqrt(p.count)));
        const side = Ra * Math.SQRT2 * 0.95;
        const pitch = side / n;
        const r0 = Math.min(size, pitch * 0.42);
        for (let i = 0; i < p.count; i += 1) {
          const q = {
            x: cx - side / 2 + ((i % n) + 0.5) * pitch,
            y: cy - side / 2 + (Math.floor(i / n) + 0.5) * pitch,
          };
          subs.push(circle(q.x, q.y, r0 * (1 - p.variation * 0.6 * rand())));
        }
        break;
      }
      case 'spots': {
        // Rows of 10-fold dilutions: the first spot is confluent, then fewer colonies each step.
        const cols = 5;
        const rows = 3;
        const pitch = (Ra * 1.5) / cols;
        const spotR = pitch * 0.4;
        for (let r = 0; r < rows; r += 1)
          for (let c = 0; c < cols; c += 1) {
            const q = {
              x: cx - (pitch * (cols - 1)) / 2 + c * pitch,
              y: cy + (r - (rows - 1) / 2) * pitch * 1.1,
            };
            if (c === 0) subs.push(circle(q.x, q.y, spotR));
            else scatter(Math.round(Math.max(1, p.count) / 10 ** (c - 1)), q, spotR - size);
          }
        break;
      }
      case 'streak': {
        // Three zones, each a zig-zag: a smear, then colonies thinning out.
        const zone = (a0: number, n: number, dense: boolean) => {
          const pts: Vec2[] = [];
          for (let k = 0; k <= 6; k += 1) {
            const a = a0 + (k / 6) * (Math.PI * 0.55);
            const d = Ra * (k % 2 === 0 ? 0.85 : 0.35);
            pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
          }
          if (dense) {
            out.push(
              ...pathPrim([poly(pts)], {
                stroke: mix(agar, colony, 0.8),
                sw: Math.max(0.3, size * 1.6),
                cap: 'round',
                join: 'round',
              }),
            );
            return;
          }
          for (let i = 0; i < n; i += 1) {
            const t = rand() * (pts.length - 1);
            const k = Math.min(pts.length - 2, Math.floor(t));
            const a = pts[k];
            const b = pts[k + 1];
            if (!a || !b) continue;
            const f = t - k;
            const r = rOf();
            const q = {
              x: a.x + (b.x - a.x) * f + (rand() - 0.5) * size * 1.5,
              y: a.y + (b.y - a.y) * f + (rand() - 0.5) * size * 1.5,
            };
            if (inside(q, r)) subs.push(circle(q.x, q.y, r));
          }
        };
        zone(-Math.PI * 0.95, 0, true);
        zone(-Math.PI * 0.25, Math.round(p.count * 0.75), false);
        zone(Math.PI * 0.45, Math.round(p.count * 0.25), false);
        break;
      }
    }
    out.push(...pathPrim(subs, stroke));
    return out;
  },
  overhang: () => 0,
});
