/**
 * A bacterium (note 58): a prokaryote is its own kind rather than a cell with half its fields
 * switched off. Rod, coccus or curved rod; Gram-negative (outer membrane, thin wall) or
 * Gram-positive (thick wall) envelope; capsule, nucleoid, plasmids, ribosomes, flagella, pili.
 * Placement is seeded, so the same params always draw the same bacterium.
 */
import { shiftLightness } from '@/core/color/color';
import type { PathNode, Vec2 } from '@/core/model/types';

import {
  type Prim,
  type StyleId,
  type Sub,
  arcNodes,
  circle,
  joinNodes,
  line,
  lookOf,
  pathPrim,
  poly,
  rect,
} from '../prims';
import { type KindPreset, defineKind } from '../types';
import { clamp, mix, rng } from './util';

export interface BacteriumParams {
  readonly style: StyleId;
  readonly shape: 'rod' | 'coccus' | 'vibrio';
  readonly envelope: 'negative' | 'positive';
  readonly capsule: boolean;
  readonly nucleoid: boolean;
  readonly plasmids: number;
  readonly ribosomes: number;
  readonly flagella: 'none' | 'polar' | 'tuft' | 'peritrichous';
  readonly pili: number;
  readonly membrane: number;
  readonly seed: number;
}

/** The curved rod: an arc of the unit circle this wide (radians), this thick (unit half-width). */
const VIBRIO_SPAN = 1.6;
const VIBRIO_HALF = 0.22;
const A0 = -Math.PI / 2 - VIBRIO_SPAN / 2;
const A1 = -Math.PI / 2 + VIBRIO_SPAN / 2;

/** A band of half-width `t` round the unit arc, with round ends, in unit space. */
function vibrioNodes(t: number): PathNode[] {
  const e = { x: Math.cos(A1), y: Math.sin(A1) };
  const s = { x: Math.cos(A0), y: Math.sin(A0) };
  return joinNodes(
    arcNodes(0, 0, 1 + t, A0, A1),
    arcNodes(e.x, e.y, t, A1, A1 + Math.PI),
    arcNodes(0, 0, 1 - t, A1, A0),
    arcNodes(s.x, s.y, t, A0 + Math.PI, A0 + 2 * Math.PI),
  );
}

/** Distance from `q` to the polyline `pts`. */
function distTo(pts: readonly Vec2[], q: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return best;
}

const TYPE: Partial<BacteriumParams> = {
  shape: 'rod',
  envelope: 'negative',
  capsule: false,
  flagella: 'none',
  pili: 0,
};
const type = (
  id: string,
  label: string,
  over: Partial<BacteriumParams>,
  size?: { w: number; h: number },
): KindPreset<BacteriumParams> => ({
  id,
  label,
  group: 'Bacteria',
  params: { ...TYPE, ...over },
  ...(size ? { size } : {}),
});

export const bacterium = defineKind<BacteriumParams>({
  kind: 'bacterium',
  version: 1,
  title: 'Bacterium',
  category: 'Cell',
  description:
    'A bacterium: rod, coccus or curved rod, Gram-negative or Gram-positive, with nucleoid, plasmids, flagella and pili.',
  keywords: [
    'bacteria',
    'prokaryote',
    'prokaryotic',
    'microbe',
    'gram',
    'coli',
    'bacillus',
    'coccus',
    'flagellum',
    'pilus',
    'capsule',
    'nucleoid',
    'plasmid',
  ],
  defaultSize: { w: 240, h: 110 },
  styles: ['line-art', 'cartoon'],
  fields: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'enum',
      options: [
        { value: 'rod', label: 'Rod (bacillus)' },
        { value: 'coccus', label: 'Sphere (coccus)' },
        { value: 'vibrio', label: 'Curved rod (vibrio)' },
      ],
      default: 'rod',
    },
    {
      key: 'envelope',
      label: 'Envelope',
      type: 'enum',
      options: [
        { value: 'negative', label: 'Gram-negative (outer membrane)' },
        { value: 'positive', label: 'Gram-positive (thick wall)' },
      ],
      default: 'negative',
    },
    { key: 'capsule', label: 'Capsule', type: 'bool', default: false },
    { key: 'nucleoid', label: 'Nucleoid', type: 'bool', default: true },
    { key: 'plasmids', label: 'Plasmids', type: 'int', min: 0, max: 6, default: 2 },
    { key: 'ribosomes', label: 'Ribosomes', type: 'int', min: 0, max: 200, default: 40 },
    {
      key: 'flagella',
      label: 'Flagella',
      type: 'enum',
      options: [
        { value: 'none', label: 'None' },
        { value: 'polar', label: 'One at a pole' },
        { value: 'tuft', label: 'Tuft at a pole' },
        { value: 'peritrichous', label: 'All around' },
      ],
      default: 'polar',
    },
    { key: 'pili', label: 'Pili', type: 'int', min: 0, max: 40, default: 0 },
    {
      key: 'membrane',
      label: 'Membrane width',
      type: 'number',
      min: 0.25,
      max: 6,
      step: 0.25,
      unit: 'pt',
      default: 1.5,
    },
    { key: 'seed', label: 'Arrangement', type: 'int', min: 0, max: 99999, default: 7 },
  ],
  slots: [
    { id: 'cytoplasm', label: 'Cytoplasm', default: '#e8f1df' },
    { id: 'membrane', label: 'Membrane', default: '#6f9a5a' },
    { id: 'wall', label: 'Cell wall', default: '#c9dba8' },
    { id: 'capsule', label: 'Capsule', default: '#eef2e8' },
    { id: 'nucleoid', label: 'Nucleoid', default: '#5b7fb5' },
    { id: 'plasmid', label: 'Plasmids', default: '#c0504d' },
    { id: 'ribosome', label: 'Ribosomes', default: '#8a6fae' },
    { id: 'flagellum', label: 'Flagella', default: '#6b6b6b' },
    { id: 'pilus', label: 'Pili', default: '#8f8f8f' },
  ],
  presets: [
    type(
      'e-coli',
      'Gram-negative rod (E. coli)',
      { flagella: 'peritrichous', pili: 16 },
      { w: 260, h: 150 },
    ),
    type(
      'bacillus',
      'Gram-positive rod (Bacillus)',
      { envelope: 'positive', flagella: 'peritrichous' },
      { w: 260, h: 150 },
    ),
    type(
      'coccus',
      'Gram-positive coccus (Staphylococcus)',
      { shape: 'coccus', envelope: 'positive' },
      { w: 140, h: 140 },
    ),
    type('vibrio', 'Curved rod (Vibrio)', { shape: 'vibrio', flagella: 'polar' }),
    type('encapsulated', 'Encapsulated rod (Klebsiella)', { capsule: true }),
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const rand = rng(p.seed);
    const slot = (k: string) => slots[k] ?? '#999999';
    const pad = Math.min(w, h) * 0.02;
    // The box the body fills: flagella and pili need room round it.
    const ex = p.pili > 0 ? Math.min(w, h) * 0.1 : 0;
    let x0 = pad + ex;
    let x1 = w - pad - ex;
    let y0 = pad + ex;
    let y1 = h - pad - ex;
    if (p.flagella === 'polar' || p.flagella === 'tuft') x1 = Math.min(x1, w * 0.62);
    else if (p.flagella === 'peritrichous') {
      x0 = Math.max(x0, w * 0.16);
      x1 = Math.min(x1, w * 0.84);
      y0 = Math.max(y0, h * 0.28);
      y1 = Math.min(y1, h * 0.72);
    }
    const bw = Math.max(0, x1 - x0);
    const bh = Math.max(0, y1 - y0);
    const mx = x0 + bw / 2;
    const my = y0 + bh / 2;
    const envF = p.envelope === 'negative' ? 0.16 : 0.28;
    const capF = p.capsule ? 0.45 : 0;

    // The centreline, the outer half-width, and the outline at any half-width.
    let centre: Vec2[];
    let hOut: number;
    let shapeAt: (half: number) => Sub;
    if (p.shape === 'vibrio') {
      const unit = vibrioNodes(VIBRIO_HALF);
      const all = unit.flatMap((n) => [n, ...(n.in ? [n.in] : []), ...(n.out ? [n.out] : [])]);
      const ux0 = Math.min(...all.map((q) => q.x));
      const ux1 = Math.max(...all.map((q) => q.x));
      const uy0 = Math.min(...all.map((q) => q.y));
      const uy1 = Math.max(...all.map((q) => q.y));
      const s = Math.min(bw / (ux1 - ux0), bh / (uy1 - uy0));
      const tx = mx - ((ux0 + ux1) / 2) * s;
      const ty = my - ((uy0 + uy1) / 2) * s;
      const tf = (q: Vec2): Vec2 => ({ x: tx + q.x * s, y: ty + q.y * s });
      hOut = VIBRIO_HALF * s;
      centre = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = A0 + ((A1 - A0) * i) / 16;
        centre.push(tf({ x: Math.cos(a), y: Math.sin(a) }));
      }
      shapeAt = (half) => ({
        t: 'poly',
        nodes: vibrioNodes(s > 0 ? half / s : 0).map((n): PathNode => ({
          ...tf(n),
          ...(n.in ? { in: tf(n.in) } : {}),
          ...(n.out ? { out: tf(n.out) } : {}),
        })),
        closed: true,
      });
    } else {
      hOut = p.shape === 'coccus' ? Math.min(bw, bh) / 2 : Math.min(bh / 2, bw / 5);
      const a = { x: p.shape === 'coccus' ? mx : x0 + hOut, y: my };
      const b = { x: p.shape === 'coccus' ? mx : x1 - hOut, y: my };
      centre = [a, b];
      shapeAt = (half) => rect(a.x - half, a.y - half, b.x - a.x + 2 * half, 2 * half, half);
    }
    const H = hOut / (1 + envF + capF);
    const hs = H * (1 + envF);
    const m = Math.min(p.membrane, H * 0.08);
    const look = lookOf(p.style, Math.max(0.3, m));
    // The envelope's layers share one wobble, so they stay concentric.
    const layer = (half: number): Sub => look.organic(shapeAt(half), p.seed);
    const first = centre[0] ?? { x: mx, y: my };
    const last = centre[centre.length - 1] ?? first;
    const mid = centre[Math.floor(centre.length / 2)] ?? first;
    const midPt = centre.length === 2 ? { x: (first.x + last.x) / 2, y: first.y } : mid;
    const inFrame = (q: Vec2): Vec2 => ({
      x: clamp(q.x, pad, Math.max(pad, w - pad)),
      y: clamp(q.y, pad, Math.max(pad, h - pad)),
    });
    /** How far a ray from `q` runs before the frame (less the padding). */
    const reach = (q: Vec2, a: number): number => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const tx = c > 1e-9 ? (w - pad - q.x) / c : c < -1e-9 ? (pad - q.x) / c : Infinity;
      const ty = s > 1e-9 ? (h - pad - q.y) / s : s < -1e-9 ? (pad - q.y) / s : Infinity;
      return Math.max(0, Math.min(tx, ty));
    };
    /** A point on the envelope and the outward direction, at `t` (0..1) along one side. */
    const surface = (t: number, side: number): { q: Vec2; a: number } => {
      const n = centre.length - 1;
      const f = clamp(t, 0, 1) * Math.max(n, 0);
      const i = Math.min(Math.floor(f), Math.max(0, n - 1));
      const a = centre[i] ?? first;
      const b = centre[i + 1] ?? a;
      const c = { x: a.x + (b.x - a.x) * (f - i), y: a.y + (b.y - a.y) * (f - i) };
      const along = b.x === a.x && b.y === a.y ? 0 : Math.atan2(b.y - a.y, b.x - a.x);
      // Normals fan out towards the ends, so the poles get their share.
      const dir = along + side * (Math.PI / 2) - side * (t - 0.5) * 1.6;
      return { q: { x: c.x + Math.cos(dir) * hs, y: c.y + Math.sin(dir) * hs }, a: dir };
    };
    const wave = (q: Vec2, a: number, len: number): Sub => {
      const pts: Vec2[] = [];
      const c = Math.cos(a);
      const s = Math.sin(a);
      const amp = len * 0.07;
      for (let i = 0; i <= 40; i += 1) {
        const t = (i / 40) * len;
        const o = amp * Math.sin((i / 40) * 2.5 * 2 * Math.PI) * Math.min(1, i / 6);
        pts.push(inFrame({ x: q.x + c * t - s * o, y: q.y + s * t + c * o }));
      }
      return poly(pts);
    };

    // Flagella and pili first, so the body covers their roots.
    const flag: Sub[] = [];
    if (p.flagella === 'polar' || p.flagella === 'tuft') {
      const prev = centre[centre.length - 2] ?? last;
      const a =
        prev.x === last.x && prev.y === last.y ? 0 : Math.atan2(last.y - prev.y, last.x - prev.x);
      const pole = { x: last.x + Math.cos(a) * hs * 0.9, y: last.y + Math.sin(a) * hs * 0.9 };
      for (const k of p.flagella === 'tuft' ? [-0.35, 0, 0.35] : [0]) {
        // A curved rod's pole points askew; its flagellum swings back towards the long axis.
        const d = a * 0.4 + k;
        flag.push(wave(pole, d, reach(pole, d) * 0.85));
      }
    } else if (p.flagella === 'peritrichous') {
      for (let i = 0; i < 8; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const { q, a } = surface((Math.floor(i / 2) + 0.2 + rand() * 0.6) / 4, side);
        // They trail behind (to the left), as when the cell swims.
        const d = a + side * 0.5;
        flag.push(wave(q, d, Math.min(reach(q, d), hOut * 3) * 0.95));
      }
    }
    out.push(
      ...pathPrim(
        flag,
        look.line({
          stroke: slot('flagellum'),
          sw: Math.max(0.3, H * 0.06),
          cap: 'round',
          join: 'round',
        }),
      ),
    );
    const pili: Sub[] = [];
    for (let i = 0; i < p.pili; i += 1) {
      const { q, a } = surface((i + rand()) / p.pili, i % 2 === 0 ? -1 : 1);
      const len = Math.min(capF > 0 ? H * 0.9 : H * 0.5, reach(q, a));
      pili.push(line(q, inFrame({ x: q.x + Math.cos(a) * len, y: q.y + Math.sin(a) * len })));
    }
    out.push(
      ...pathPrim(
        pili,
        look.line({ stroke: slot('pilus'), sw: Math.max(0.2, H * 0.025), cap: 'round' }),
      ),
    );

    // The envelope, outside in.
    if (p.capsule) {
      const cc = slot('capsule');
      out.push(
        ...pathPrim(
          [layer(hOut)],
          look.body({
            fill: cc,
            stroke: shiftLightness(cc, -0.12),
            sw: Math.max(0.2, m * 0.5),
          }),
        ),
      );
    }
    const wc = slot('wall');
    const memb = slot('membrane');
    if (p.envelope === 'negative') {
      out.push(...pathPrim([layer(hs)], look.body({ fill: wc, stroke: memb, sw: m })));
      out.push(
        ...pathPrim(
          [layer(H * (1 + envF / 2))],
          look.line({
            stroke: shiftLightness(wc, -0.25),
            sw: Math.max(0.2, m * 0.5),
          }),
        ),
      );
    } else
      out.push(
        ...pathPrim(
          [layer(hs)],
          look.body({
            fill: wc,
            stroke: shiftLightness(wc, -0.25),
            sw: Math.max(0.2, m * 0.6),
          }),
        ),
      );
    const cyto = slot('cytoplasm');
    out.push(...pathPrim([layer(H)], look.body({ fill: cyto, stroke: memb, sw: m })));
    if (p.shape !== 'vibrio')
      out.push(
        ...look.highlight(
          (first.x + last.x) / 2,
          first.y,
          Math.abs(last.x - first.x) / 2 + H,
          H,
          cyto,
        ),
      );

    // Inside: the nucleoid in the middle, plasmids and ribosomes round it.
    const lx = p.shape === 'rod' ? Math.max(H * 0.5, Math.abs(last.x - first.x) * 0.3) : H * 0.55;
    const ly = H * 0.45;
    const inNucleoid = (q: Vec2, r: number) =>
      p.nucleoid && ((q.x - midPt.x) / (lx + r)) ** 2 + ((q.y - midPt.y) / (ly + r)) ** 2 < 1;
    const bx0 = Math.min(...centre.map((q) => q.x)) - H;
    const bx1 = Math.max(...centre.map((q) => q.x)) + H;
    const by0 = Math.min(...centre.map((q) => q.y)) - H;
    const by1 = Math.max(...centre.map((q) => q.y)) + H;
    const spot = (r: number): Vec2 | null => {
      for (let t = 0; t < 30; t += 1) {
        const q = { x: bx0 + rand() * (bx1 - bx0), y: by0 + rand() * (by1 - by0) };
        if (distTo(centre, q) < H * 0.92 - r - m && !inNucleoid(q, r)) return q;
      }
      return null;
    };
    if (p.nucleoid) {
      const nc = slot('nucleoid');
      const region: Vec2[] = [];
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * 2 * Math.PI;
        const k = 0.8 + rand() * 0.2;
        region.push({ x: midPt.x + Math.cos(a) * lx * k, y: midPt.y + Math.sin(a) * ly * k });
      }
      out.push(
        ...pathPrim(
          [poly(region, true)],
          look.detail({ fill: mix(nc, cyto, 0.75), join: 'round' }),
        ),
      );
      const dna: Vec2[] = [];
      for (let i = 0; i < 36; i += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand()) * 0.7;
        dna.push({ x: midPt.x + Math.cos(a) * lx * d, y: midPt.y + Math.sin(a) * ly * d });
      }
      out.push(
        ...pathPrim(
          [poly(dna)],
          look.line({
            stroke: nc,
            sw: Math.max(0.2, H * 0.03),
            cap: 'round',
            join: 'round',
          }),
        ),
      );
    }
    const pr = H * 0.12;
    const rings: Sub[] = [];
    for (let i = 0; i < p.plasmids; i += 1) {
      const q = spot(pr);
      if (q) rings.push(circle(q.x, q.y, pr));
    }
    out.push(
      ...pathPrim(rings, look.line({ stroke: slot('plasmid'), sw: Math.max(0.2, pr * 0.3) })),
    );
    const rr = H * 0.035 * look.bigger;
    const ribo: Sub[] = [];
    for (let i = 0; i < look.parts(p.ribosomes); i += 1) {
      const q = spot(rr);
      if (q) ribo.push(circle(q.x, q.y, rr));
    }
    out.push(...pathPrim(ribo, look.mark({ fill: slot('ribosome') })));
    return out;
  },
});
