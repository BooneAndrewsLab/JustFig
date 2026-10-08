/**
 * The path-following kinds (note 04): lipid bilayer, DNA/RNA helix and
 * membrane receptors. Each samples `obj.path` at a fixed arc length and
 * builds its units from the tangent and normal there. Units of one colour
 * are merged into one `<path>`, so 2,000 lipids are three DOM nodes.
 */
import { shiftLightness } from '@/core/color/color';
import {
  type PathSample,
  type Polyline,
  flatten,
  offsetPt,
  sampleEvery,
} from '@/core/geometry/sampling';
import type { PathNode, Vec2 } from '@/core/model/types';

import { type Prim, type Sub, circle, ellipseNodes, line, pathPrim, poly } from '../prims';
import { type RenderInput, defineKind } from '../types';

/** The object's path as a polyline; a straight line across the frame when it has none. */
function polyOf(input: RenderInput, closed: boolean): Polyline {
  const nodes: readonly PathNode[] = input.path ?? [
    { x: 0, y: input.h / 2 },
    { x: input.w, y: input.h / 2 },
  ];
  return flatten(nodes, closed, 0.5);
}

/** An arch across a w × h frame, or an oval inset by `pad` when closed. */
function archPath(w: number, h: number, closed: boolean, pad: number): PathNode[] {
  if (closed) {
    const rx = Math.max(1, w / 2 - pad);
    const ry = Math.max(1, h / 2 - pad);
    return ellipseNodes(w / 2, h / 2, rx, ry);
  }
  const y = h / 2;
  const bend = Math.max(0, Math.min(h / 2 - pad, 14));
  return [
    { x: pad, y, out: { x: w * 0.3, y: y - bend } },
    { x: w - pad, y, in: { x: w * 0.7, y: y + bend } },
  ];
}

/** Local unit coordinates (u along the tangent, v along the normal) → frame-local. */
const place = (s: PathSample, side: number) => (u: number, v: number) => {
  const o = offsetPt(s, side * v);
  return { x: o.x + s.tx * u, y: o.y + s.ty * u };
};

// --- lipid bilayer ---------------------------------------------------------------

export interface BilayerParams {
  readonly closed: boolean;
  readonly spacing: number;
  readonly tail: number;
  readonly gap: number;
  readonly tails: 'straight' | 'wavy';
  readonly outline: boolean;
}

const bilayerReach = (p: BilayerParams): number => p.gap / 2 + p.tail + p.spacing;

/** At most this many lipids per leaflet: 12,000 in all, still a few DOM nodes. */
const MAX_LIPIDS = 6000;

export const bilayer = defineKind<BilayerParams>({
  kind: 'bilayer',
  version: 1,
  title: 'Lipid bilayer',
  category: 'Cell',
  description:
    'A phospholipid bilayer along a path; draw a path with the pen and turn it into one.',
  keywords: ['membrane', 'lipid', 'phospholipid', 'leaflet', 'liposome', 'vesicle'],
  usesPath: 'open',
  defaultSize: { w: 280, h: 80 },
  defaultPath: (w, h, closed) => archPath(w, h, closed, 15),
  fields: [
    { key: 'closed', label: 'Closed (vesicle)', type: 'bool', default: false },
    {
      key: 'spacing',
      label: 'Head size',
      type: 'number',
      min: 1,
      max: 20,
      step: 0.5,
      unit: 'pt',
      default: 6,
    },
    {
      key: 'tail',
      label: 'Tail length',
      type: 'number',
      min: 1,
      max: 40,
      step: 0.5,
      unit: 'pt',
      default: 8,
    },
    {
      key: 'gap',
      label: 'Leaflet gap',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.25,
      unit: 'pt',
      default: 1,
    },
    {
      key: 'tails',
      label: 'Tails',
      type: 'enum',
      options: [
        { value: 'straight', label: 'Straight' },
        { value: 'wavy', label: 'Kinked' },
      ],
      default: 'straight',
    },
    { key: 'outline', label: 'Head outlines', type: 'bool', default: true },
  ],
  slots: [
    { id: 'head', label: 'Heads', default: '#e8a33d' },
    { id: 'tail', label: 'Tails', default: '#7b8794' },
  ],
  overhang: bilayerReach,
  render(p, input) {
    const pl = polyOf(input, p.closed);
    const samples = sampleEvery(pl, p.spacing, MAX_LIPIDS);
    const r = p.spacing * 0.45;
    const heads: Sub[] = [];
    const tails: Sub[] = [];
    const g = p.gap / 2;
    for (const s of samples)
      for (const side of [1, -1]) {
        const at = place(s, side);
        heads.push(circle(at(0, g + p.tail + r).x, at(0, g + p.tail + r).y, r));
        for (const du of [-r * 0.4, r * 0.4]) {
          if (p.tails === 'straight') tails.push(line(at(du, g + p.tail), at(du, g)));
          else
            tails.push(
              poly([
                at(du, g + p.tail),
                at(du, g + p.tail * 0.5),
                at(du + (du > 0 ? r * 0.5 : -r * 0.5), g),
              ]),
            );
        }
      }
    const head = input.slots['head'] ?? '#e8a33d';
    const sw = Math.max(0.2, p.spacing * 0.06);
    return [
      ...pathPrim(tails, { stroke: input.slots['tail'] ?? null, sw, cap: 'round', join: 'round' }),
      ...pathPrim(heads, {
        fill: head,
        ...(p.outline ? { stroke: shiftLightness(head, -0.18), sw: sw * 0.8 } : {}),
      }),
    ];
  },
});

// --- DNA / RNA helix -------------------------------------------------------------

export interface HelixParams {
  readonly molecule: 'dna' | 'rna';
  readonly pitch: number;
  readonly radius: number;
  readonly groove: number;
  readonly bases: boolean;
  readonly perTurn: number;
  readonly width: number;
}

export const helix = defineKind<HelixParams>({
  kind: 'helix',
  version: 1,
  title: 'DNA / RNA',
  category: 'Molecules',
  description: 'A double helix (or an RNA strand) along a path, with base-pair ticks.',
  keywords: ['dna', 'rna', 'helix', 'double', 'nucleic', 'strand', 'base pair'],
  usesPath: 'open',
  defaultSize: { w: 260, h: 50 },
  defaultPath: (w, h) => [
    { x: 12, y: h / 2 },
    { x: w - 12, y: h / 2 },
  ],
  fields: [
    {
      key: 'molecule',
      label: 'Molecule',
      type: 'enum',
      options: [
        { value: 'dna', label: 'Double-stranded DNA' },
        { value: 'rna', label: 'Single-stranded RNA' },
      ],
      default: 'dna',
    },
    {
      key: 'pitch',
      label: 'Turn length',
      type: 'number',
      min: 4,
      max: 300,
      step: 1,
      unit: 'pt',
      default: 40,
    },
    {
      key: 'radius',
      label: 'Radius',
      type: 'number',
      min: 1,
      max: 60,
      step: 0.5,
      unit: 'pt',
      default: 9,
    },
    {
      key: 'groove',
      label: 'Groove offset',
      type: 'number',
      min: 0.05,
      max: 0.5,
      step: 0.01,
      unit: 'turn',
      default: 0.38,
      showIf: (p) => p['molecule'] === 'dna',
    },
    { key: 'bases', label: 'Base ticks', type: 'bool', default: true },
    {
      key: 'perTurn',
      label: 'Bases per turn',
      type: 'int',
      min: 2,
      max: 24,
      default: 10,
      showIf: (p) => p['bases'] === true,
    },
    {
      key: 'width',
      label: 'Strand width',
      type: 'number',
      min: 0.25,
      max: 8,
      step: 0.25,
      unit: 'pt',
      default: 1.75,
    },
  ],
  slots: [
    { id: 'strand1', label: 'Strand 1', default: '#0072b2' },
    { id: 'strand2', label: 'Strand 2', default: '#d55e00' },
    { id: 'bases', label: 'Bases', default: '#9aa5b1' },
  ],
  overhang: (p) => p.radius + p.width,
  render(p, input) {
    const pl = polyOf(input, false);
    const L = pl.length;
    if (L <= 0) return [];
    const step = Math.max(0.5, Math.min(p.pitch / 24, L / 2), L / 20000);
    const pts = sampleEvery(pl, step, 20000);
    const k = (2 * Math.PI) / p.pitch;
    const phase2 = 2 * Math.PI * p.groove;
    const on = (s: PathSample, phase: number): Vec2 =>
      offsetPt(s, p.radius * Math.sin(k * s.s + phase));
    const out: Prim[] = [];
    if (p.bases) {
      const ticks: Sub[] = [];
      const every = Math.max(p.pitch / p.perTurn, L / 10000);
      for (const s of sampleEvery(pl, every, 10000)) {
        const a = on(s, 0);
        if (p.molecule === 'dna') ticks.push(line(a, on(s, phase2)));
        else {
          // RNA: a short base pointing to the side its backbone is on.
          const sn = Math.sin(k * s.s);
          ticks.push(line(a, offsetPt(s, p.radius * sn - Math.sign(sn || 1) * p.radius * 0.9)));
        }
      }
      out.push(
        ...pathPrim(ticks, {
          stroke: input.slots['bases'] ?? null,
          sw: Math.max(0.25, p.width * 0.55),
          cap: 'round',
        }),
      );
    }
    const strands: [string, number][] = [['strand1', 0]];
    if (p.molecule === 'dna') strands.push(['strand2', phase2]);
    for (const [slot, ph] of strands)
      out.push(
        ...pathPrim([poly(pts.map((s) => on(s, ph)))], {
          stroke: input.slots[slot] ?? null,
          sw: p.width,
          cap: 'round',
          join: 'round',
        }),
      );
    return out;
  },
});

// --- membrane receptors ------------------------------------------------------------

export interface ReceptorParams {
  readonly closed: boolean;
  readonly protein: 'rtk' | 'gpcr' | 'channel' | 'transporter' | 'antibody';
  readonly spacing: number;
  readonly size: number;
  readonly side: 'out' | 'in';
  readonly membrane: boolean;
  readonly thickness: number;
}

const receptorReach = (p: ReceptorParams): number => p.thickness / 2 + p.size * 2.2;

/** One protein's subpaths in local (u, v) unit space: v = 0 is the membrane middle. */
function unit(p: ReceptorParams, at: (u: number, v: number) => Vec2) {
  const s = p.size;
  const m = p.thickness / 2;
  const main: Sub[] = [];
  const accent: Sub[] = [];
  const box = (u0: number, u1: number, v0: number, v1: number): Sub =>
    poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], true);
  const dot = (u: number, v: number, r: number): Sub => {
    const c = at(u, v);
    return circle(c.x, c.y, r);
  };
  switch (p.protein) {
    case 'rtk':
      main.push(box(-s * 0.12, s * 0.12, -m - s * 0.3, m + s * 0.3));
      main.push(dot(0, m + s * 0.65, s * 0.38), dot(0, m + s * 1.4, s * 0.38));
      accent.push(dot(0, -m - s * 0.75, s * 0.45));
      break;
    case 'gpcr':
      for (let i = 0; i < 7; i += 1) {
        const u = (i - 3) * s * 0.22;
        main.push(box(u - s * 0.08, u + s * 0.08, -m - s * 0.15, m + s * 0.15));
      }
      accent.push(dot(0, m + s * 0.45, s * 0.25));
      break;
    case 'channel':
      main.push(box(-s * 0.65, -s * 0.14, -m - s * 0.35, m + s * 0.35));
      main.push(box(s * 0.14, s * 0.65, -m - s * 0.35, m + s * 0.35));
      break;
    case 'transporter':
      main.push(box(-s * 0.5, s * 0.5, -m - s * 0.35, m + s * 0.35));
      accent.push(dot(0, 0, s * 0.22));
      break;
    case 'antibody': {
      const stem = (u0: number, v0: number, u1: number, v1: number) =>
        poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], true);
      main.push(stem(-s * 0.1, -m - s * 0.2, s * 0.1, m + s * 0.9));
      // Two arms, each a short rotated bar (a parallelogram along the arm).
      for (const dir of [-1, 1]) {
        const a = at(0, m + s * 0.9);
        const b = at(dir * s * 0.7, m + s * 1.9);
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        const hw = s * 0.12;
        const ox = (nx / len) * hw;
        const oy = (ny / len) * hw;
        main.push(
          poly(
            [
              { x: a.x + ox, y: a.y + oy },
              { x: b.x + ox, y: b.y + oy },
              { x: b.x - ox, y: b.y - oy },
              { x: a.x - ox, y: a.y - oy },
            ],
            true,
          ),
        );
        accent.push(circle(b.x, b.y, s * 0.16));
      }
      break;
    }
  }
  return { main, accent };
}

export const receptors = defineKind<ReceptorParams>({
  kind: 'receptors',
  version: 1,
  title: 'Membrane proteins',
  category: 'Cell',
  description: 'Receptors, channels or transporters spaced along a membrane path.',
  keywords: ['receptor', 'channel', 'transporter', 'membrane', 'transmembrane', 'gpcr', 'protein'],
  usesPath: 'open',
  defaultSize: { w: 280, h: 110 },
  defaultPath: (w, h, closed) => archPath(w, h, closed, 42),
  fields: [
    { key: 'closed', label: 'Closed (cell)', type: 'bool', default: false },
    {
      key: 'protein',
      label: 'Protein',
      type: 'enum',
      options: [
        { value: 'rtk', label: 'Receptor tyrosine kinase' },
        { value: 'gpcr', label: 'GPCR (7 helices)' },
        { value: 'channel', label: 'Ion channel' },
        { value: 'transporter', label: 'Transporter' },
        { value: 'antibody', label: 'Y-shaped receptor' },
      ],
      default: 'rtk',
    },
    {
      key: 'spacing',
      label: 'Spacing',
      type: 'number',
      min: 4,
      max: 400,
      step: 1,
      unit: 'pt',
      default: 48,
    },
    {
      key: 'size',
      label: 'Size',
      type: 'number',
      min: 2,
      max: 60,
      step: 0.5,
      unit: 'pt',
      default: 14,
    },
    {
      key: 'side',
      label: 'Outside is',
      type: 'enum',
      options: [
        { value: 'out', label: 'Above / left of the path' },
        { value: 'in', label: 'Below / right of the path' },
      ],
      default: 'out',
    },
    { key: 'membrane', label: 'Draw membrane', type: 'bool', default: true },
    {
      key: 'thickness',
      label: 'Membrane width',
      type: 'number',
      min: 1,
      max: 30,
      step: 0.5,
      unit: 'pt',
      default: 10,
    },
  ],
  slots: [
    { id: 'protein', label: 'Protein', default: '#4e79a7' },
    { id: 'accent', label: 'Domain / ligand', default: '#f28e2b' },
    { id: 'membrane', label: 'Membrane', default: '#f3dfb5' },
  ],
  overhang: receptorReach,
  render(p, input) {
    const pl = polyOf(input, p.closed);
    const out: Prim[] = [];
    if (p.membrane && pl.pts.length > 1)
      out.push(
        ...pathPrim([poly(pl.pts, pl.closed)], {
          stroke: input.slots['membrane'] ?? null,
          sw: p.thickness,
          join: 'round',
        }),
      );
    const side = p.side === 'out' ? -1 : 1;
    const main: Sub[] = [];
    const accent: Sub[] = [];
    for (const s of sampleEvery(pl, p.spacing, 2000)) {
      const u = unit(p, place(s, side));
      main.push(...u.main);
      accent.push(...u.accent);
    }
    const protein = input.slots['protein'] ?? '#4e79a7';
    const edge = { stroke: shiftLightness(protein, -0.2), sw: Math.max(0.25, p.size * 0.04) };
    out.push(...pathPrim(main, { fill: protein, ...edge, join: 'round' }));
    out.push(...pathPrim(accent, { fill: input.slots['accent'] ?? null, ...edge }));
    return out;
  },
});
