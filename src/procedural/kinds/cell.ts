/**
 * A eukaryotic cell with organelle toggles (note 04): each organelle has
 * its own colour slot. Placement is seeded, so the same params always
 * draw the same cell.
 */
import { shiftLightness } from '@/core/color/color';
import type { PathNode, Vec2 } from '@/core/model/types';

import { type Prim, type Sub, arcNodes, circle, ellipseNodes, pathPrim, poly } from '../prims';
import { defineKind } from '../types';
import { rng } from './util';

export interface CellParams {
  readonly shape: 'round' | 'irregular';
  readonly nucleus: boolean;
  readonly nucleolus: boolean;
  readonly er: boolean;
  readonly golgi: boolean;
  readonly mitochondria: number;
  readonly lysosomes: number;
  readonly vesicles: number;
  readonly membrane: number;
  readonly seed: number;
}

/** A smooth closed blob through points (Catmull-Rom as cubics). */
function blob(pts: readonly Vec2[]): PathNode[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n] ?? p;
    const b = pts[(i + 1) % n] ?? p;
    const tx = (b.x - a.x) / 6;
    const ty = (b.y - a.y) / 6;
    return { x: p.x, y: p.y, in: { x: p.x - tx, y: p.y - ty }, out: { x: p.x + tx, y: p.y + ty } };
  });
}

export const cell = defineKind<CellParams>({
  kind: 'cell',
  version: 1,
  title: 'Cell',
  category: 'Cell',
  description: 'An animal cell; switch organelles on and off and colour each one.',
  keywords: [
    'eukaryotic',
    'animal',
    'organelle',
    'nucleus',
    'mitochondria',
    'golgi',
    'reticulum',
    'lysosome',
  ],
  defaultSize: { w: 220, h: 160 },
  fields: [
    {
      key: 'shape',
      label: 'Outline',
      type: 'enum',
      options: [
        { value: 'round', label: 'Oval' },
        { value: 'irregular', label: 'Irregular' },
      ],
      default: 'round',
    },
    { key: 'nucleus', label: 'Nucleus', type: 'bool', default: true },
    {
      key: 'nucleolus',
      label: 'Nucleolus',
      type: 'bool',
      default: true,
      showIf: (p) => p['nucleus'] === true,
    },
    {
      key: 'er',
      label: 'Endoplasmic reticulum',
      type: 'bool',
      default: true,
      showIf: (p) => p['nucleus'] === true,
    },
    { key: 'golgi', label: 'Golgi apparatus', type: 'bool', default: true },
    { key: 'mitochondria', label: 'Mitochondria', type: 'int', min: 0, max: 30, default: 5 },
    { key: 'lysosomes', label: 'Lysosomes', type: 'int', min: 0, max: 40, default: 4 },
    { key: 'vesicles', label: 'Vesicles', type: 'int', min: 0, max: 60, default: 8 },
    {
      key: 'membrane',
      label: 'Membrane width',
      type: 'number',
      min: 0.25,
      max: 8,
      step: 0.25,
      unit: 'pt',
      default: 2,
    },
    { key: 'seed', label: 'Arrangement', type: 'int', min: 0, max: 99999, default: 3 },
  ],
  slots: [
    { id: 'cytoplasm', label: 'Cytoplasm', default: '#fdebd3' },
    { id: 'membrane', label: 'Membrane', default: '#c98b4f' },
    { id: 'nucleus', label: 'Nucleus', default: '#c3b1e1' },
    { id: 'nucleolus', label: 'Nucleolus', default: '#6f52a6' },
    { id: 'er', label: 'ER', default: '#76a9d6' },
    { id: 'golgi', label: 'Golgi', default: '#e58fb7' },
    { id: 'mitochondria', label: 'Mitochondria', default: '#ee8a55' },
    { id: 'lysosome', label: 'Lysosomes', default: '#7fbf7b' },
    { id: 'vesicle', label: 'Vesicles', default: '#efcb4f' },
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const rand = rng(p.seed);
    const m = Math.min(p.membrane, Math.min(w, h) * 0.05);
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(0, w / 2 - m);
    const ry = Math.max(0, h / 2 - m);
    const slot = (k: string) => slots[k] ?? '#999999';
    let outline: Sub;
    if (p.shape === 'irregular') {
      const pts: Vec2[] = [];
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * 2 * Math.PI;
        const k = 0.86 + rand() * 0.1;
        pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
      }
      outline = { t: 'poly', nodes: blob(pts), closed: true };
    } else outline = { t: 'poly', nodes: ellipseNodes(cx, cy, rx, ry), closed: true };
    out.push(...pathPrim([outline], { fill: slot('cytoplasm'), stroke: slot('membrane'), sw: m }));
    // Everything else sits inside an ellipse a bit smaller than the cell.
    const ix = rx * 0.8;
    const iy = ry * 0.8;
    const nx = cx - rx * 0.2;
    const nrx = rx * 0.3;
    const nry = ry * 0.36;
    const inNucleus = (q: Vec2, pad: number) =>
      p.nucleus && ((q.x - nx) / (nrx + pad)) ** 2 + ((q.y - cy) / (nry + pad)) ** 2 < 1;
    const gx = cx + rx * 0.38;
    const inGolgi = (q: Vec2, pad: number) =>
      p.golgi && Math.abs(q.x - gx) < rx * 0.12 + pad && Math.abs(q.y - cy) < ry * 0.3 + pad;
    const spot = (r: number): Vec2 | null => {
      for (let t = 0; t < 30; t += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand());
        const q = {
          x: cx + Math.cos(a) * d * Math.max(0, ix - r),
          y: cy + Math.sin(a) * d * Math.max(0, iy - r),
        };
        if (!inNucleus(q, r + rx * 0.08) && !inGolgi(q, r)) return q;
      }
      return null;
    };
    if (p.nucleus) {
      if (p.er) {
        const er: Sub[] = [];
        for (let k = 1; k <= 3; k += 1) {
          const f = 1 + k * 0.17;
          const nodes = arcNodes(0, 0, 1, -Math.PI * 0.55, Math.PI * 0.55).map((n): PathNode => {
            const tf = (v: Vec2) => ({ x: nx + v.x * nrx * f, y: cy + v.y * nry * f });
            return {
              ...tf(n),
              ...(n.in ? { in: tf(n.in) } : {}),
              ...(n.out ? { out: tf(n.out) } : {}),
            };
          });
          er.push({ t: 'poly', nodes, closed: false });
        }
        out.push(
          ...pathPrim(er, {
            stroke: slot('er'),
            sw: Math.max(0.3, Math.min(rx, ry) * 0.04),
            cap: 'round',
          }),
        );
      }
      out.push(
        ...pathPrim([{ t: 'poly', nodes: ellipseNodes(nx, cy, nrx, nry), closed: true }], {
          fill: slot('nucleus'),
          stroke: shiftLightness(slot('nucleus'), -0.2),
          sw: Math.max(0.3, m * 0.6),
        }),
      );
      if (p.nucleolus)
        out.push(
          ...pathPrim([circle(nx + nrx * 0.2, cy - nry * 0.15, Math.min(nrx, nry) * 0.32)], {
            fill: slot('nucleolus'),
          }),
        );
    }
    if (p.golgi) {
      const g: Sub[] = [];
      for (let k = 0; k < 4; k += 1) {
        const x = gx + (k - 1.5) * rx * 0.06;
        g.push(
          poly([
            { x: x - rx * 0.04, y: cy - ry * 0.26 },
            { x: x + rx * 0.02, y: cy },
            { x: x - rx * 0.04, y: cy + ry * 0.26 },
          ]),
        );
      }
      out.push(
        ...pathPrim(g, {
          stroke: slot('golgi'),
          sw: Math.max(0.3, Math.min(rx, ry) * 0.045),
          cap: 'round',
          join: 'round',
        }),
      );
    }
    const mito: Sub[] = [];
    const cristae: Sub[] = [];
    const ml = Math.min(rx, ry) * 0.16;
    for (let i = 0; i < p.mitochondria; i += 1) {
      const q = spot(ml);
      if (!q) continue;
      const a = rand() * Math.PI;
      mito.push({ t: 'poly', nodes: ellipseNodes(q.x, q.y, ml, ml * 0.45, a), closed: true });
      const c = Math.cos(a);
      const s = Math.sin(a);
      const zig: Vec2[] = [];
      for (let k = 0; k <= 6; k += 1) {
        const u = (k / 6 - 0.5) * ml * 1.4;
        const v = (k % 2 === 0 ? -1 : 1) * ml * 0.25;
        zig.push({ x: q.x + u * c - v * s, y: q.y + u * s + v * c });
      }
      cristae.push(poly(zig));
    }
    const mc = slot('mitochondria');
    out.push(
      ...pathPrim(mito, {
        fill: mc,
        stroke: shiftLightness(mc, -0.2),
        sw: Math.max(0.2, ml * 0.08),
      }),
    );
    out.push(
      ...pathPrim(cristae, {
        stroke: shiftLightness(mc, -0.25),
        sw: Math.max(0.15, ml * 0.07),
        join: 'round',
      }),
    );
    const dots = (n: number, r: number, colour: string) => {
      const subs: Sub[] = [];
      for (let i = 0; i < n; i += 1) {
        const q = spot(r);
        if (q) subs.push(circle(q.x, q.y, r));
      }
      out.push(
        ...pathPrim(subs, {
          fill: colour,
          stroke: shiftLightness(colour, -0.2),
          sw: Math.max(0.15, r * 0.15),
        }),
      );
    };
    dots(p.lysosomes, Math.min(rx, ry) * 0.06, slot('lysosome'));
    dots(p.vesicles, Math.min(rx, ry) * 0.035, slot('vesicle'));
    return out;
  },
});
