/**
 * A eukaryotic cell with organelle toggles (note 04): each organelle has
 * its own colour slot. Placement is seeded, so the same params always
 * draw the same cell. Version 2 (note 58) adds what the cell-type presets
 * need: a cell wall, a central vacuole, chloroplasts, a bud, apical
 * microvilli, a neuron outline, mitosis and apoptosis. Prokaryotes are
 * their own kind (`bacterium`).
 */
import { shiftLightness } from '@/core/color/color';
import type { PathNode, Vec2 } from '@/core/model/types';

import {
  type Prim,
  type StyleId,
  type Sub,
  arcNodes,
  circle,
  ellipseNodes,
  line,
  lookOf,
  pathPrim,
  poly,
  rect,
} from '../prims';
import { type KindPreset, defineKind } from '../types';
import { clamp, rng } from './util';

export interface CellParams {
  readonly style: StyleId;
  readonly shape: 'round' | 'irregular' | 'box' | 'neuron';
  readonly wall: number;
  readonly nucleus: boolean;
  readonly nucleolus: boolean;
  readonly er: boolean;
  readonly golgi: boolean;
  readonly mitochondria: number;
  readonly lysosomes: number;
  readonly vesicles: number;
  readonly vacuole: number;
  readonly chloroplasts: number;
  readonly bud: number;
  readonly microvilli: number;
  readonly division: 'none' | 'metaphase' | 'telophase';
  readonly apoptotic: boolean;
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

/** The cleavage furrow of a dividing cell: the height kept at `u` (-1..1 across the cell). */
const furrow = (u: number): number => 1 - 0.55 * Math.exp(-((u / 0.22) ** 2));

/** What every cell-type preset names, so choosing one replaces the previous type entirely. */
const ANIMAL: Partial<CellParams> = {
  shape: 'round',
  wall: 0,
  nucleus: true,
  nucleolus: true,
  er: true,
  golgi: true,
  mitochondria: 5,
  lysosomes: 4,
  vesicles: 8,
  vacuole: 0,
  chloroplasts: 0,
  bud: 0,
  microvilli: 0,
  division: 'none',
  apoptotic: false,
};
const ANIMAL_SLOTS = { cytoplasm: '#fdebd3', membrane: '#c98b4f' };
const type = (
  id: string,
  label: string,
  over: Partial<CellParams>,
  rest: Omit<KindPreset<CellParams>, 'id' | 'label' | 'group' | 'params'> = {},
): KindPreset<CellParams> => ({
  id,
  label,
  group: 'Cell types',
  params: { ...ANIMAL, ...over },
  slots: { ...ANIMAL_SLOTS, ...rest.slots },
  ...(rest.size ? { size: rest.size } : {}),
});

const notNeuron = (p: Readonly<Record<string, unknown>>) => p['shape'] !== 'neuron';
const interphase = (p: Readonly<Record<string, unknown>>) =>
  notNeuron(p) && p['division'] === 'none';

export const cell = defineKind<CellParams>({
  kind: 'cell',
  version: 2,
  title: 'Cell',
  category: 'Cell',
  description:
    'A eukaryotic cell (animal, plant, yeast, neuron, epithelial); switch organelles on and off and colour each one.',
  keywords: [
    'eukaryotic',
    'animal',
    'plant',
    'yeast',
    'neuron',
    'epithelial',
    'organelle',
    'nucleus',
    'mitochondria',
    'golgi',
    'reticulum',
    'lysosome',
    'chloroplast',
    'vacuole',
    'mitosis',
    'apoptosis',
  ],
  defaultSize: { w: 220, h: 160 },
  styles: ['line-art', 'cartoon', 'textbook', 'fluorescence', 'em', 'brightfield'],
  fields: [
    {
      key: 'shape',
      label: 'Outline',
      type: 'enum',
      options: [
        { value: 'round', label: 'Oval' },
        { value: 'irregular', label: 'Irregular' },
        { value: 'box', label: 'Rounded box' },
        { value: 'neuron', label: 'Neuron' },
      ],
      default: 'round',
    },
    {
      key: 'wall',
      label: 'Cell wall',
      help: 'Plants and fungi; 0 for none.',
      type: 'number',
      min: 0,
      max: 12,
      step: 0.5,
      unit: 'pt',
      default: 0,
      showIf: notNeuron,
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
      key: 'vacuole',
      label: 'Vacuole size',
      help: 'Share of the cell; a large one presses the nucleus to the side. 0 for none.',
      type: 'number',
      min: 0,
      max: 0.8,
      step: 0.05,
      default: 0,
    },
    { key: 'chloroplasts', label: 'Chloroplasts', type: 'int', min: 0, max: 30, default: 0 },
    {
      key: 'bud',
      label: 'Bud size',
      help: 'A daughter bud on the right, as a share of the mother; 0 for none.',
      type: 'number',
      min: 0,
      max: 0.8,
      step: 0.05,
      default: 0,
      showIf: interphase,
    },
    {
      key: 'microvilli',
      label: 'Microvilli',
      help: 'Along the top (apical) edge; the nucleus moves to the base.',
      type: 'int',
      min: 0,
      max: 40,
      default: 0,
      showIf: interphase,
    },
    {
      key: 'division',
      label: 'Division',
      type: 'enum',
      options: [
        { value: 'none', label: 'None' },
        { value: 'metaphase', label: 'Metaphase' },
        { value: 'telophase', label: 'Telophase (cleaving)' },
      ],
      default: 'none',
      showIf: (p) => notNeuron(p) && p['apoptotic'] !== true,
    },
    { key: 'apoptotic', label: 'Apoptotic (blebbing)', type: 'bool', default: false },
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
    { id: 'wall', label: 'Cell wall', default: '#b5c77d' },
    { id: 'vacuole', label: 'Vacuole', default: '#d6ebf5' },
    { id: 'chloroplast', label: 'Chloroplasts', default: '#5c9e47' },
    { id: 'chromosome', label: 'Chromosomes', default: '#5b3f99' },
    { id: 'spindle', label: 'Spindle', default: '#8696a8' },
  ],
  presets: [
    type('animal', 'Animal cell', {}),
    type(
      'plant',
      'Plant cell',
      {
        shape: 'box',
        wall: 5,
        golgi: false,
        mitochondria: 4,
        lysosomes: 0,
        vesicles: 4,
        vacuole: 0.7,
        chloroplasts: 10,
      },
      { slots: { cytoplasm: '#eef5dc', membrane: '#7d9a4e' } },
    ),
    type(
      'budding-yeast',
      'Budding yeast',
      {
        wall: 2.5,
        golgi: false,
        mitochondria: 4,
        lysosomes: 0,
        vesicles: 4,
        vacuole: 0.35,
        bud: 0.55,
      },
      {
        slots: { cytoplasm: '#f7efdc', membrane: '#b08850', wall: '#d8c39a' },
        size: { w: 200, h: 120 },
      },
    ),
    type(
      'neuron',
      'Neuron',
      { shape: 'neuron', mitochondria: 4, lysosomes: 2, vesicles: 6 },
      { size: { w: 280, h: 150 } },
    ),
    type(
      'epithelial',
      'Polarised epithelial cell',
      { shape: 'box', microvilli: 12, mitochondria: 6 },
      { size: { w: 110, h: 190 } },
    ),
    type('metaphase', 'Mitosis (metaphase)', { division: 'metaphase', golgi: false }),
    type('telophase', 'Dividing cell (telophase)', {
      division: 'telophase',
      golgi: false,
      mitochondria: 6,
    }),
    type('apoptotic', 'Apoptotic cell', {
      shape: 'irregular',
      apoptotic: true,
      mitochondria: 3,
      lysosomes: 2,
      vesicles: 4,
    }),
  ],
  migrate: (raw, from) =>
    from < 2 && typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? {
          ...raw,
          wall: 0,
          vacuole: 0,
          chloroplasts: 0,
          bud: 0,
          microvilli: 0,
          division: 'none',
          apoptotic: false,
        }
      : raw,
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const rand = rng(p.seed);
    const slot = (k: string) => slots[k] ?? '#999999';
    const m = Math.min(p.membrane, Math.min(w, h) * 0.05);
    const neuron = p.shape === 'neuron';
    const division = neuron || p.apoptotic ? 'none' : p.division;
    const dividing = division !== 'none';
    const wallW = neuron ? 0 : Math.min(p.wall, Math.min(w, h) * 0.12);
    const bud = neuron || dividing ? 0 : p.bud;
    const villi = neuron || dividing ? 0 : p.microvilli;
    const polar = villi > 0;
    const cyto = slot('cytoplasm');
    const memb = slot('membrane');
    const look = lookOf(p.style, Math.max(0.3, m));
    // The cell's own fill and outline in this style; concentric outlines share one wobble.
    const cellStyle = { fill: cyto, stroke: memb, sw: m };
    const cs = look.body(cellStyle);
    const hand = (s: Sub): Sub => look.organic(s, p.seed);
    // A micrograph's ground (black, EM grey, brightfield) under the whole frame.
    out.push(...look.ground(w, h));

    // The box the cell (with its wall) fills: microvilli take a band at the top, blebs a margin.
    const vh = polar ? Math.min(h * 0.16, w * 0.2) : 0;
    const br = p.apoptotic ? Math.min(w, h - vh) * 0.07 : 0;
    const bx0 = br;
    const bx1 = w - br;
    const by0 = vh + br;
    const by1 = h - br;
    // Outer radii (the wall's, or the membrane's without one) and the centre.
    let cx: number;
    let cy: number;
    let rxO: number;
    let ryO: number;
    let rs = 0;
    if (neuron) {
      rs = Math.max(0, Math.min(h * 0.22, w * 0.13) - m);
      cx = w * 0.3;
      cy = h / 2;
      rxO = rs;
      ryO = rs;
    } else {
      ryO = Math.max(0, (by1 - by0) / 2 - m);
      rxO = Math.max(0, ((bx1 - bx0) / 2 - m) / (1 + 0.85 * bud));
      cx = bx0 + m + rxO;
      cy = (by0 + by1) / 2;
    }
    const rx = Math.max(0, rxO - wallW);
    const ry = Math.max(0, ryO - wallW);
    // Organelles: outlines in proportion to them, not to the cell.
    const org = lookOf(p.style, Math.max(0.25, Math.min(m, Math.min(rx, ry) * 0.012) * 0.6));
    // The irregular outline's wobble is drawn first, as version 1 did, so old cells keep their look.
    const ks: number[] = [];
    if (p.shape === 'irregular') for (let i = 0; i < 9; i += 1) ks.push(0.86 + rand() * 0.1);
    const outlineAt = (ex: number, ey: number): Sub => {
      if (division === 'telophase') {
        const pts: Vec2[] = [];
        for (let i = 0; i < 32; i += 1) {
          const a = (i / 32) * 2 * Math.PI;
          const u = Math.cos(a);
          pts.push({ x: cx + u * ex, y: cy + Math.sin(a) * ey * furrow(u) });
        }
        return { t: 'poly', nodes: blob(pts), closed: true };
      }
      if (p.shape === 'irregular') {
        const pts = ks.map((k, i) => {
          const a = (i / 9) * 2 * Math.PI;
          return { x: cx + Math.cos(a) * ex * k, y: cy + Math.sin(a) * ey * k };
        });
        return { t: 'poly', nodes: blob(pts), closed: true };
      }
      if (p.shape === 'box') return rect(cx - ex, cy - ey, 2 * ex, 2 * ey, Math.min(ex, ey) * 0.3);
      return { t: 'poly', nodes: ellipseNodes(cx, cy, ex, ey), closed: true };
    };
    // The bud sits on the mother's right, overlapping it a little.
    const budAt = (e: number): Sub => {
      const bxr = rxO * bud;
      return {
        t: 'poly',
        nodes: ellipseNodes(
          cx + rxO + bxr * 0.7,
          cy,
          Math.max(0, bxr - e),
          Math.max(0, ryO * bud - e),
        ),
        closed: true,
      };
    };

    if (polar) {
      // Microvilli: fingers up from the apical edge, their bases hidden under the cell.
      const span = p.shape === 'box' ? Math.max(0, rxO - Math.min(rxO, ryO) * 0.3) : rxO * 0.75;
      const step = (2 * span) / villi;
      const fw = Math.min(step * 0.6, vh * 0.5);
      const fingers: Sub[] = [];
      for (let i = 0; i < villi; i += 1) {
        const x = cx - span + step * (i + 0.5);
        const u = rxO > 0 ? (x - cx) / rxO : 0;
        const edge = p.shape === 'box' ? cy - ryO : cy - ryO * Math.sqrt(Math.max(0, 1 - u * u));
        const deep =
          p.shape === 'irregular' ? cy - ryO * 0.8 * Math.sqrt(Math.max(0, 1 - u * u)) : edge;
        const top = edge - vh * 0.9;
        fingers.push(rect(x - fw / 2, top, fw, Math.max(0, deep + fw - top), fw / 2));
      }
      out.push(...look.paint('body', fingers, { fill: cyto, stroke: memb, sw: m * 0.7 }));
    }
    if (p.apoptotic) {
      // Membrane blebs: bulges centred on the outline, the cell drawn over their inner halves.
      const blebs: Sub[] = [];
      for (let i = 0; i < 7; i += 1) {
        const a = ((i + 0.2 + rand() * 0.6) / 7) * 2 * Math.PI;
        const r = br * (0.7 + rand() * 0.3);
        blebs.push(circle(cx + Math.cos(a) * rxO * 0.95, cy + Math.sin(a) * ryO * 0.95, r));
      }
      out.push(
        ...look.paint(
          'body',
          blebs.map((b, i) => look.organic(b, i)),
          { fill: cyto, stroke: memb, sw: m * 0.8 },
        ),
      );
    }

    if (neuron) drawNeuron();
    else {
      if (wallW > 0) {
        const wc = slot('wall');
        const ws = {
          fill: wc,
          stroke: shiftLightness(wc, -0.2),
          sw: Math.max(0.2, Math.min(m, wallW) * 0.5),
        };
        // The bud first, so the mother covers the neck; the bud's wall, then its cytoplasm.
        if (bud > 0) out.push(...look.paint('body', [hand(budAt(0))], ws));
        if (bud > 0) out.push(...look.paint('body', [hand(budAt(wallW))], cellStyle));
        out.push(...look.paint('body', [hand(outlineAt(rxO, ryO))], ws));
      } else if (bud > 0) out.push(...look.paint('body', [hand(budAt(0))], cellStyle));
      out.push(...look.paint('body', [hand(outlineAt(rx, ry))], cellStyle));
      out.push(...look.highlight(cx, cy, rx, ry, cyto));
    }

    function drawNeuron(): void {
      const pad = Math.min(w, h) * 0.04;
      const cl = (q: Vec2): Vec2 => ({
        x: clamp(q.x, pad, Math.max(pad, w - pad)),
        y: clamp(q.y, pad, Math.max(pad, h - pad)),
      });
      const tP = rs * 0.28;
      const tB = rs * 0.13;
      const tA = rs * 0.2;
      const along = (a: number, d: number): Vec2 => ({
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
      });
      const primary: Sub[] = [];
      const branches: Sub[] = [];
      // How far a ray from `q` runs before the frame, less a margin for the tube's width.
      const edge = pad + tP / 2 + m;
      const reach = (q: Vec2, a: number): number => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const tx = c > 1e-9 ? (w - edge - q.x) / c : c < -1e-9 ? (edge - q.x) / c : Infinity;
        const ty = s > 1e-9 ? (h - edge - q.y) / s : s < -1e-9 ? (edge - q.y) / s : Infinity;
        return Math.max(0, Math.min(tx, ty));
      };
      for (const deg of [-115, -150, 180, 150, 115]) {
        const a = ((deg + (rand() - 0.5) * 20) * Math.PI) / 180;
        const len = Math.min(
          rs * (1.9 + rand() * 0.6),
          Math.max(0, reach({ x: cx, y: cy }, a) - rs),
        );
        const mid = cl(along(a, rs + len * 0.55));
        primary.push(poly([along(a, rs * 0.7), mid, cl(along(a, rs + len))]));
        for (const s of [-1, 1]) {
          const b = a + s * (0.45 + rand() * 0.2);
          const bl = Math.min(len * 0.55, reach(mid, b));
          branches.push(
            poly([mid, cl({ x: mid.x + Math.cos(b) * bl, y: mid.y + Math.sin(b) * bl })]),
          );
        }
      }
      // The axon runs right to a fan of terminals ending in boutons.
      const ax = Math.max(cx + rs, w * 0.8);
      const axon = [
        poly([
          { x: cx + rs * 0.7, y: cy },
          cl({ x: (cx + ax) / 2, y: cy + rs * 0.12 }),
          cl({ x: ax, y: cy }),
        ]),
      ];
      const rb = rs * 0.18;
      const terms: Sub[] = [];
      const boutons: Sub[] = [];
      for (const k of [-1, 0, 1]) {
        const e = {
          x: clamp(w - pad - rb, rb, Math.max(rb, w - rb)),
          y: clamp(cy + k * h * 0.2, rb, Math.max(rb, h - rb)),
        };
        terms.push(poly([cl({ x: ax, y: cy }), e]));
        boutons.push(circle(e.x, e.y, rb));
      }
      // A tube is its outline stroke with the fill colour stroked narrower over it.
      const rim = cs.stroke ?? memb;
      const inner = cs.fill ?? cyto;
      const ow = cs.sw ?? m;
      const tube = (subs: Sub[], t: number, colour: string, extra: number) =>
        pathPrim(subs, { stroke: colour, sw: t + extra, cap: 'round', join: 'round' });
      out.push(
        ...tube(primary, tP, rim, 2 * ow),
        ...tube([...branches, ...terms], tB, rim, 2 * ow),
        ...tube(axon, tA, rim, 2 * ow),
      );
      out.push(
        ...look.paint(
          'body',
          [hand({ t: 'poly', nodes: ellipseNodes(cx, cy, rs, rs), closed: true })],
          cellStyle,
        ),
      );
      out.push(
        ...tube(primary, tP, inner, 0),
        ...tube([...branches, ...terms], tB, inner, 0),
        ...tube(axon, tA, inner, 0),
      );
      out.push(...look.paint('body', boutons, cellStyle));
      const rf = Math.max(0, rs - ow / 2);
      out.push(
        ...pathPrim([hand({ t: 'poly', nodes: ellipseNodes(cx, cy, rf, rf), closed: true })], {
          fill: inner,
        }),
      );
    }

    // Everything else sits inside an ellipse a bit smaller than the cell.
    const ix = rx * 0.8;
    const iy = ry * 0.8;
    const vac = p.vacuole;
    const pressed = vac >= 0.45;
    let nx = cx - rx * 0.2;
    let ny = cy;
    let nrx = rx * 0.3;
    let nry = ry * 0.36;
    if (polar) {
      nx = cx;
      ny = cy + ry * 0.4;
      nrx = rx * 0.42;
      nry = ry * 0.22;
    } else if (pressed) {
      nx = cx - rx * 0.68;
      nrx = rx * 0.18;
      nry = ry * 0.3;
    }
    // Regions organelles keep clear of: the nucleus (or nuclei, or the spindle) and the vacuole.
    const nuclei: { x: number; y: number; rx: number; ry: number }[] = [];
    if (division === 'metaphase') nuclei.push({ x: cx, y: cy, rx: rx * 0.62, ry: ry * 0.42 });
    else if (division === 'telophase')
      for (const s of [-1, 1])
        nuclei.push({ x: cx + s * rx * 0.5, y: cy, rx: rx * 0.18, ry: ry * 0.3 });
    else if (p.nucleus) nuclei.push({ x: nx, y: ny, rx: nrx, ry: nry });
    const inNucleus = (q: Vec2, pad: number) =>
      nuclei.some((n) => ((q.x - n.x) / (n.rx + pad)) ** 2 + ((q.y - n.y) / (n.ry + pad)) ** 2 < 1);
    // A small vacuole sits right of the nucleus; a large one fills the middle, leaving a rim.
    const vrx = rx * vac * 0.95;
    const vry = ry * vac;
    const vx = cx + rx * (pressed ? 0.1 : clamp(0.8 - vac * 0.95, 0.1, 0.8));
    const inVacuole = (q: Vec2, pad: number) =>
      vac > 0 && ((q.x - vx) / (vrx + pad)) ** 2 + ((q.y - cy) / (vry + pad)) ** 2 < 1;
    const golgi = p.golgi && !dividing;
    const u = Math.min(rx, ry);
    const gx = polar ? cx : cx + rx * 0.38;
    const gy = polar ? cy - ry * 0.12 : cy;
    const inGolgi = (q: Vec2, pad: number) =>
      golgi &&
      (polar
        ? Math.abs(q.x - gx) < u * 0.35 + pad && Math.abs(q.y - gy) < u * 0.2 + pad
        : Math.abs(q.x - gx) < rx * 0.12 + pad && Math.abs(q.y - cy) < ry * 0.3 + pad);
    const outside = (q: Vec2, pad: number) =>
      division === 'telophase' &&
      Math.abs(q.y - cy) > iy * furrow(rx > 0 ? (q.x - cx) / rx : 0) - pad;
    /** A free place for an organelle of radius `r`; `onVacuole` lets it overlap the vacuole's edge. */
    const spot = (r: number, onVacuole = false): Vec2 | null => {
      for (let t = 0; t < 30; t += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand());
        // A box cell has room in its corners: sample a rectangle there.
        const q =
          p.shape === 'box'
            ? {
                x: cx + (a / Math.PI - 1) * Math.max(0, rx * 0.9 - r),
                y: cy + (2 * d * d - 1) * Math.max(0, ry * 0.9 - r),
              }
            : {
                x: cx + Math.cos(a) * d * Math.max(0, ix - r),
                y: cy + Math.sin(a) * d * Math.max(0, iy - r),
              };
        if (
          !inNucleus(q, r + rx * 0.08) &&
          !inGolgi(q, r) &&
          !inVacuole(q, onVacuole ? 0 : r) &&
          !outside(q, r)
        )
          return q;
      }
      return null;
    };

    const intact = p.nucleus && !dividing && !p.apoptotic;
    if (intact && p.er) {
      const a0 = polar ? -Math.PI * 0.95 : -Math.PI * 0.55;
      const a1 = polar ? -Math.PI * 0.05 : Math.PI * 0.55;
      const er: Sub[] = [];
      for (let k = 1; k <= 3; k += 1) {
        const f = 1 + k * 0.17;
        const nodes = arcNodes(0, 0, 1, a0, a1).map((n): PathNode => {
          const tf = (v: Vec2) => ({ x: nx + v.x * nrx * f, y: ny + v.y * nry * f });
          return {
            ...tf(n),
            ...(n.in ? { in: tf(n.in) } : {}),
            ...(n.out ? { out: tf(n.out) } : {}),
          };
        });
        er.push({ t: 'poly', nodes, closed: false });
      }
      out.push(
        ...org.paint('line', er, {
          stroke: slot('er'),
          sw: Math.max(0.3, Math.min(rx, ry) * 0.04),
          cap: 'round',
        }),
      );
    }
    if (vac > 0) {
      const vc = slot('vacuole');
      out.push(
        ...look.paint(
          'body',
          [hand({ t: 'poly', nodes: ellipseNodes(vx, cy, vrx, vry), closed: true })],
          {
            fill: vc,
            stroke: shiftLightness(vc, -0.2),
            sw: Math.max(0.2, m * 0.5),
          },
        ),
      );
    }
    const nc = slot('nucleus');
    if (intact) {
      out.push(
        ...look.paint(
          'body',
          [hand({ t: 'poly', nodes: ellipseNodes(nx, ny, nrx, nry), closed: true })],
          {
            fill: nc,
            stroke: shiftLightness(nc, -0.2),
            sw: Math.max(0.3, m * 0.6),
          },
          true,
        ),
      );
      if (p.nucleolus)
        out.push(
          ...look.paint(
            'detail',
            [circle(nx + nrx * 0.2, ny - nry * 0.15, Math.min(nrx, nry) * 0.32)],
            { fill: slot('nucleolus') },
          ),
        );
      out.push(...look.highlight(nx, ny, nrx, nry, nc));
    } else if (p.nucleus && p.apoptotic && !dividing) {
      // Karyorrhexis: the condensed nucleus breaks into dense fragments.
      const frags: Sub[] = [];
      const fr = Math.min(nrx, nry) * 0.36;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * 2 * Math.PI + rand() * 0.6;
        frags.push(
          circle(
            nx + Math.cos(a) * nrx * 0.5,
            ny + Math.sin(a) * nry * 0.5,
            fr * (0.7 + rand() * 0.3),
          ),
        );
      }
      out.push(...look.paint('mark', frags, { fill: shiftLightness(nc, -0.25) }, true));
    }
    if (division === 'metaphase') drawMetaphase();
    if (division === 'telophase') drawTelophase();

    function drawMetaphase(): void {
      const sp = slot('spindle');
      const cs = Math.min(rx, ry) * 0.06;
      const poles = [-1, 1].map((s) => ({ x: cx + s * rx * 0.55, y: cy }));
      const chrom: Vec2[] = [];
      for (let i = 0; i < 7; i += 1) chrom.push({ x: cx, y: cy + (i - 3) * ry * 0.11 });
      const fibres: Sub[] = [];
      for (const [i, pole] of poles.entries()) {
        for (const c of chrom) fibres.push(line(pole, c));
        const dir = i === 0 ? Math.PI : 0;
        for (let k = -2; k <= 2; k += 1) {
          const a = dir + k * 0.45;
          fibres.push(
            line(pole, { x: pole.x + Math.cos(a) * rx * 0.2, y: pole.y + Math.sin(a) * ry * 0.2 }),
          );
        }
      }
      out.push(
        ...look.paint('line', fibres, { stroke: sp, sw: Math.max(0.2, Math.min(rx, ry) * 0.012) }),
      );
      out.push(
        ...look.paint(
          'mark',
          poles.map((q) => circle(q.x, q.y, cs * 0.7)),
          { fill: shiftLightness(sp, -0.25) },
        ),
      );
      const xs: Sub[] = [];
      for (const c of chrom) {
        xs.push(line({ x: c.x - cs, y: c.y - cs * 0.6 }, { x: c.x + cs, y: c.y + cs * 0.6 }));
        xs.push(line({ x: c.x - cs, y: c.y + cs * 0.6 }, { x: c.x + cs, y: c.y - cs * 0.6 }));
      }
      out.push(
        ...look.paint(
          'line',
          xs,
          { stroke: slot('chromosome'), sw: Math.max(0.2, cs * 0.55), cap: 'round' },
          true,
        ),
      );
    }

    function drawTelophase(): void {
      const mid: Sub[] = [];
      for (let k = 0; k < 4; k += 1) {
        const y = cy + (k - 1.5) * ry * 0.07;
        mid.push(line({ x: cx - rx * 0.24, y }, { x: cx + rx * 0.24, y }));
      }
      out.push(
        ...look.paint('line', mid, {
          stroke: slot('spindle'),
          sw: Math.max(0.2, Math.min(rx, ry) * 0.015),
        }),
      );
      const subs = nuclei.map((n, i): Sub =>
        look.organic(
          { t: 'poly', nodes: ellipseNodes(n.x, n.y, n.rx, n.ry), closed: true },
          p.seed + i,
        ),
      );
      out.push(
        ...look.paint(
          'body',
          subs,
          {
            fill: nc,
            stroke: shiftLightness(nc, -0.2),
            sw: Math.max(0.3, m * 0.6),
          },
          true,
        ),
      );
    }

    if (golgi) {
      const g: Sub[] = [];
      for (let k = 0; k < 4; k += 1) {
        if (polar) {
          const y = gy + (k - 1.5) * u * 0.09;
          g.push(
            poly([
              { x: gx - u * 0.3, y: y + u * 0.05 },
              { x: gx, y: y - u * 0.03 },
              { x: gx + u * 0.3, y: y + u * 0.05 },
            ]),
          );
          continue;
        }
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
        ...org.paint('line', g, {
          stroke: slot('golgi'),
          sw: Math.max(0.3, Math.min(rx, ry) * 0.045),
          cap: 'round',
          join: 'round',
        }),
      );
    }
    const mito: Sub[] = [];
    const cristae: Sub[] = [];
    const ml = Math.min(rx, ry) * 0.16 * look.bigger;
    for (let i = 0; i < look.parts(p.mitochondria); i += 1) {
      const q = spot(ml);
      if (!q) continue;
      const a = rand() * Math.PI;
      mito.push(
        look.organic(
          { t: 'poly', nodes: ellipseNodes(q.x, q.y, ml, ml * 0.45, a), closed: true },
          i,
        ),
      );
      const c = Math.cos(a);
      const s = Math.sin(a);
      const zig: Vec2[] = [];
      for (let k = 0; k <= 6; k += 1) {
        const uu = (k / 6 - 0.5) * ml * 1.4;
        const v = (k % 2 === 0 ? -1 : 1) * ml * 0.25;
        zig.push({ x: q.x + uu * c - v * s, y: q.y + uu * s + v * c });
      }
      cristae.push(poly(zig));
    }
    const mc = slot('mitochondria');
    out.push(
      ...org.paint('organelle', mito, {
        fill: mc,
        stroke: shiftLightness(mc, -0.2),
        sw: Math.max(0.2, ml * 0.08),
      }),
    );
    out.push(
      ...org.paint('line', cristae, {
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
        ...org.paint('detail', subs, {
          fill: colour,
          stroke: shiftLightness(colour, -0.2),
          sw: Math.max(0.15, r * 0.15),
        }),
      );
    };
    const u0 = Math.min(rx, ry) * look.bigger;
    dots(look.parts(p.lysosomes), u0 * 0.06, slot('lysosome'));
    dots(look.parts(p.vesicles), u0 * 0.035, slot('vesicle'));
    if (p.chloroplasts > 0) {
      // Lens-shaped chloroplasts with a few grana stacks across them.
      const cl = u0 * 0.13;
      const lens: Sub[] = [];
      const grana: Sub[] = [];
      for (let i = 0; i < look.parts(p.chloroplasts); i += 1) {
        const q = spot(cl, true);
        if (!q) continue;
        const a = rand() * Math.PI;
        lens.push(
          look.organic(
            { t: 'poly', nodes: ellipseNodes(q.x, q.y, cl, cl * 0.5, a), closed: true },
            i,
          ),
        );
        const c = Math.cos(a);
        const s = Math.sin(a);
        for (const k of [-0.5, 0, 0.5]) {
          const x0 = q.x + k * cl * c;
          const y0 = q.y + k * cl * s;
          grana.push(
            line(
              { x: x0 + s * cl * 0.25, y: y0 - c * cl * 0.25 },
              { x: x0 - s * cl * 0.25, y: y0 + c * cl * 0.25 },
            ),
          );
        }
      }
      const cc = slot('chloroplast');
      out.push(
        ...org.paint('organelle', lens, {
          fill: cc,
          stroke: shiftLightness(cc, -0.2),
          sw: Math.max(0.2, cl * 0.08),
        }),
      );
      out.push(
        ...org.paint('line', grana, {
          stroke: shiftLightness(cc, -0.3),
          sw: Math.max(0.2, cl * 0.12),
          cap: 'round',
        }),
      );
    }
    return out;
  },
});
