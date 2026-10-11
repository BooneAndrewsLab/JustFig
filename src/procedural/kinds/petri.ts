/** Petri dish with seeded colony patterns (note 04): random, streak, spot dilutions, pinned grid, lawn tetrad dissection a strain by dilution spot grid, antibiotic discs, plaques, two colony colours or colony morphology (note 58). */
import { shiftLightness } from '@/core/color/color';
import type { Vec2 } from '@/core/model/types';

import { type Prim, type Sub, circle, pathPrim, poly, rect } from '../prims';
import { defineKind } from '../types';
import { mix, rng, text } from './util';

export interface PetriParams {
  readonly plate: 'round' | 'rect';
  readonly pattern: 'random' | 'streak' | 'spots' | 'grid' | 'lawn' | 'tetrads' | 'none';
  readonly count: number;
  readonly size: number;
  readonly variation: number;
  readonly seed: number;
  readonly lid: boolean;
  readonly tetrads: number;
  readonly segregation: 'mixed' | '2:2' | '4:0' | '3:1' | '1:3' | '0:4';
  readonly dead: number;
  readonly missing: number;
  readonly tetradLabels: boolean;
  readonly spotRows: number;
  readonly spotCols: number;
  readonly rowLabels: boolean;
  readonly discs: number;
  readonly haloSize: number;
  readonly plaques: number;
  readonly plaqueSize: number;
  readonly markerShare: number;
  readonly morphology: 'smooth' | 'wrinkled' | 'filamentous' | 'petite' | 'sectored';
}

/** Patterns of separate colonies: the ones whose colour mix and shape can be set. */
const hasColonies = (p: { readonly pattern?: unknown }) =>
  p.pattern === 'random' || p.pattern === 'streak' || p.pattern === 'spots' || p.pattern === 'grid';

/** Strain row names: A to H. */
const rowName = (r: number) => String.fromCharCode(65 + (r % 26));

/** An SBS single-well plate, 127.8 x 85.5 mm, in points. */
const SBS_PLATE = { w: 362, h: 242 };

export const petriDish = defineKind<PetriParams>({
  kind: 'petriDish',
  version: 5,
  title: 'Petri dish',
  category: 'Lab',
  description:
    'An agar plate with colonies: random, streaked, spotted dilutions, a pinned grid, a lawn or a tetrad dissection.',
  keywords: [
    'agar',
    'plate',
    'colony',
    'colonies',
    'bacteria',
    'yeast',
    'culture',
    'streak',
    'tetrad',
    'tetrads',
    'dissection',
    'spores',
  ],
  defaultSize: { w: 150, h: 150 },
  fields: [
    {
      key: 'plate',
      label: 'Plate',
      type: 'enum',
      options: [
        { value: 'round', label: 'Round dish' },
        { value: 'rect', label: 'Rectangular plate' },
      ],
      default: 'round',
      help: 'A rectangular single-well plate (PlusPlate, OmniTray) fills the frame: resize it to 127.8 x 85.5 mm for the SBS footprint that 384 and 1536 pinned grids sit on.',
    },
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
        { value: 'tetrads', label: 'Tetrad dissection' },
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
      showIf: (p) =>
        p['pattern'] !== 'lawn' && p['pattern'] !== 'none' && p['pattern'] !== 'tetrads',
    },
    {
      key: 'tetrads',
      label: 'Tetrads',
      type: 'int',
      min: 1,
      max: 24,
      default: 8,
      help: 'One column of four spores (a to d) per tetrad.',
      showIf: (p) => p['pattern'] === 'tetrads',
    },
    {
      key: 'segregation',
      label: 'Segregation',
      type: 'enum',
      options: [
        { value: 'mixed', label: 'Mostly 2:2, some others' },
        { value: '2:2', label: '2:2' },
        { value: '4:0', label: '4:0' },
        { value: '3:1', label: '3:1' },
        { value: '1:3', label: '1:3' },
        { value: '0:4', label: '0:4' },
      ],
      default: '2:2',
      help: 'Spores of the usual colour : spores of the marker colour in each tetrad.',
      showIf: (p) => p['pattern'] === 'tetrads',
    },
    {
      key: 'dead',
      label: 'Dead spores',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      default: 0,
      help: 'Spores that germinated but stopped as a tiny microcolony.',
      showIf: (p) => p['pattern'] === 'tetrads',
    },
    {
      key: 'missing',
      label: 'Missing spores',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      default: 0,
      help: 'Spores that did not grow at all: an empty spot.',
      showIf: (p) => p['pattern'] === 'tetrads',
    },
    {
      key: 'tetradLabels',
      label: 'Tetrad numbers',
      type: 'bool',
      default: true,
      showIf: (p) => p['pattern'] === 'tetrads',
    },
    {
      key: 'spotRows',
      label: 'Strains (rows)',
      type: 'int',
      min: 1,
      max: 8,
      default: 3,
      showIf: (p) => p['pattern'] === 'spots',
    },
    {
      key: 'spotCols',
      label: 'Dilutions (columns)',
      type: 'int',
      min: 2,
      max: 8,
      default: 5,
      help: 'The first spot is confluent, each next one a 10-fold dilution of it.',
      showIf: (p) => p['pattern'] === 'spots',
    },
    {
      key: 'rowLabels',
      label: 'Row labels',
      type: 'bool',
      default: false,
      help: 'A, B, C... beside each strain row.',
      showIf: (p) => p['pattern'] === 'spots',
    },
    {
      key: 'discs',
      label: 'Antibiotic discs',
      type: 'int',
      min: 0,
      max: 8,
      default: 0,
      help: 'Paper discs on the lawn, each with a clear inhibition halo.',
      showIf: (p) => p['pattern'] === 'lawn',
    },
    {
      key: 'haloSize',
      label: 'Halo width',
      type: 'number',
      min: 0,
      max: 40,
      step: 1,
      unit: 'pt',
      default: 12,
      help: 'Clear zone beyond the disc edge; it varies a little between discs.',
      showIf: (p) => p['pattern'] === 'lawn' && Number(p['discs']) > 0,
    },
    {
      key: 'plaques',
      label: 'Plaques',
      type: 'int',
      min: 0,
      max: 300,
      default: 0,
      help: 'Clear spots where phage lysed the lawn.',
      showIf: (p) => p['pattern'] === 'lawn',
    },
    {
      key: 'plaqueSize',
      label: 'Plaque size',
      type: 'number',
      min: 0.5,
      max: 10,
      step: 0.25,
      unit: 'pt',
      default: 2,
      showIf: (p) => p['pattern'] === 'lawn' && Number(p['plaques']) > 0,
    },
    {
      key: 'markerShare',
      label: 'Marker colour share',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      default: 0,
      help: 'Share of colonies drawn in the marker colour, for blue/white or red/white screens.',
      showIf: hasColonies,
    },
    {
      key: 'morphology',
      label: 'Colony shape',
      type: 'enum',
      options: [
        { value: 'smooth', label: 'Smooth' },
        { value: 'wrinkled', label: 'Wrinkled' },
        { value: 'filamentous', label: 'Filamentous' },
        { value: 'petite', label: 'Petite (small)' },
        { value: 'sectored', label: 'Sectored (marker wedge)' },
      ],
      default: 'smooth',
      showIf: hasColonies,
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
    { id: 'marker', label: 'Marker colonies', default: '#c0392b' },
  ],
  // Fields added in versions 2 to 5 take their defaults (3 x 5 spots, no discs or plaques, smooth single-colour colonies, a round dish), so older params stand as they are.
  migrate: (raw) => raw,
  // Patterns set only params and media only slot colours, so one of each combines (note 58).
  presets: [
    {
      id: 'streak',
      label: 'Single-colony streak',
      group: 'Patterns',
      params: { pattern: 'streak', count: 40 },
    },
    {
      id: 'spot-dilutions',
      label: 'Spot dilutions',
      group: 'Patterns',
      params: { pattern: 'spots', count: 40 },
    },
    {
      id: 'strain-dilutions',
      label: 'Strains by 10-fold dilutions',
      group: 'Patterns',
      params: { pattern: 'spots', count: 400, spotRows: 4, spotCols: 6, rowLabels: true },
    },
    {
      id: 'pinned-grid',
      label: 'Pinned grid',
      group: 'Patterns',
      params: { pattern: 'grid', count: 96, variation: 0.1 },
    },
    { id: 'lawn', label: 'Lawn', group: 'Patterns', params: { pattern: 'lawn' } },
    {
      id: 'disk-diffusion',
      label: 'Disk diffusion (antibiotic discs)',
      group: 'Patterns',
      params: { pattern: 'lawn', discs: 5, haloSize: 12 },
    },
    {
      id: 'phage-plaques',
      label: 'Phage plaques',
      group: 'Patterns',
      params: { pattern: 'lawn', plaques: 40, plaqueSize: 2 },
    },
    {
      id: 'blue-white',
      label: 'Blue/white screening',
      group: 'Patterns',
      params: { pattern: 'random', count: 70, markerShare: 25, size: 3 },
      slots: { agar: '#f2dfa7', colony: '#fffcf0', marker: '#2f6fbf' },
    },
    {
      id: 'ade2-sectoring',
      label: 'Red/white sectored colonies',
      group: 'Patterns',
      params: { pattern: 'grid', count: 36, size: 5, variation: 0.1, morphology: 'sectored' },
      slots: { marker: '#c0392b' },
    },
    {
      id: 'wrinkled-colonies',
      label: 'Wrinkled colonies',
      group: 'Patterns',
      params: { pattern: 'random', count: 12, size: 9, morphology: 'wrinkled' },
    },
    {
      id: 'tetrad-dissection',
      label: 'Tetrad dissection',
      group: 'Patterns',
      params: {
        pattern: 'tetrads',
        tetrads: 8,
        segregation: '2:2',
        size: 4,
        variation: 0.15,
        tetradLabels: true,
      },
    },
    { id: 'empty', label: 'Empty plate', group: 'Patterns', params: { pattern: 'none' } },
    {
      id: 'round-dish',
      label: 'Round dish',
      group: 'Plates',
      params: { plate: 'round' },
      size: { w: 150, h: 150 },
    },
    {
      id: 'rect-plate',
      label: 'Rectangular plate (SBS)',
      group: 'Plates',
      params: { plate: 'rect' },
      size: SBS_PLATE,
    },
    {
      id: 'pinned-384',
      label: '384 pinned grid (rectangular plate)',
      group: 'Plates',
      params: { plate: 'rect', pattern: 'grid', count: 384, size: 4, variation: 0.1 },
      size: SBS_PLATE,
    },
    {
      id: 'sga-1536',
      label: 'SGA 1536 pinned grid (rectangular plate)',
      group: 'Plates',
      params: { plate: 'rect', pattern: 'grid', count: 1536, size: 2, variation: 0.15 },
      size: SBS_PLATE,
    },
    { id: 'lb', label: 'LB', group: 'Media', slots: { agar: '#f2dfa7', colony: '#fffcf0' } },
    { id: 'ypd', label: 'YPD', group: 'Media', slots: { agar: '#e3b46c', colony: '#fff4e0' } },
    {
      id: 'sc-dropout',
      label: 'SC/dropout',
      group: 'Media',
      slots: { agar: '#f7f0d6', colony: '#fffaf0' },
    },
    {
      id: 'blood-agar',
      label: 'Blood agar',
      group: 'Media',
      slots: { agar: '#a31d1d', colony: '#e6e1d3' },
    },
    {
      id: 'macconkey',
      label: 'MacConkey',
      group: 'Media',
      slots: { agar: '#c9708f', colony: '#d81b60' },
    },
    { id: 'x-gal', label: 'X-gal', group: 'Media', slots: { agar: '#f2dfa7', colony: '#2f6fbf' } },
    {
      id: 'chocolate-agar',
      label: 'Chocolate agar',
      group: 'Media',
      slots: { agar: '#6b4226', colony: '#d9d2c3' },
    },
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(0, Math.min(w, h) / 2 - 0.5);
    const dish = slots['dish'] ?? '#9aa5b1';
    const agar = slots['agar'] ?? '#f5e6b8';
    const colony = slots['colony'] ?? '#fffcf0';
    const isRect = p.plate === 'rect';
    // Rectangular plate: the whole frame, rim, agar and the area colonies may use, as insets of the short side.
    const hw = Math.max(0, w / 2 - 0.5);
    const box = (k: number) => {
      const i = R * k;
      return rect(
        cx - hw + i,
        cy - R + i,
        Math.max(0, 2 * (hw - i)),
        Math.max(0, 2 * (R - i)),
        Math.max(0, R * 0.12 - i * 0.5),
      );
    };
    if (isRect) {
      out.push(
        ...pathPrim([box(0)], {
          fill: mix(agar, '#ffffff', 0.5),
          stroke: dish,
          sw: Math.max(0.3, R * 0.025),
        }),
      );
      out.push(
        ...pathPrim([box(0.05)], {
          fill: agar,
          stroke: shiftLightness(agar, -0.08),
          sw: Math.max(0.2, R * 0.008),
        }),
      );
      if (p.lid)
        out.push(
          ...pathPrim([box(0.02)], {
            stroke: shiftLightness(dish, 0.15),
            sw: Math.max(0.2, R * 0.01),
          }),
        );
    } else {
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
    }
    // Where colonies may go: half-extents of the usable area (a rectangle, or the circle of radius Ra).
    const Ra = R * 0.86;
    const ux = isRect ? hw - R * 0.1 : Ra;
    const uy = isRect ? R - R * 0.1 : Ra;
    const rand = rng(p.seed);
    const size = Math.min(p.size, Math.max(0.1, R * 0.12));
    const rOf = () => size * (1 - p.variation * 0.75 * rand());
    let subs: Sub[] = [];
    // Confluent spots: never reshaped or recoloured.
    const solid = new Set<Sub>();
    const lawnFeatures = () => {
      const clear = shiftLightness(agar, -0.05);
      const discR = Math.max(0.5, R * 0.09);
      const n = Math.min(8, Math.max(0, p.discs));
      const discs: Sub[] = [];
      const halos: Sub[] = [];
      for (let i = 0; i < n; i += 1) {
        const d = n === 1 ? 0 : Ra * 0.5;
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const q = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        const halo = Math.min(p.haloSize * (1 - p.variation * 0.5 * rand()), Ra - d - discR);
        if (halo > 0) halos.push(circle(q.x, q.y, discR + halo));
        discs.push(circle(q.x, q.y, discR));
      }
      out.push(...pathPrim(halos, { fill: agar, stroke: clear, sw: Math.max(0.15, R * 0.006) }));
      out.push(
        ...pathPrim(discs, { fill: '#f7f4ec', stroke: '#b9b4a6', sw: Math.max(0.2, R * 0.008) }),
      );
      const pl: Sub[] = [];
      for (let i = 0, tries = 0; i < p.plaques && tries < p.plaques * 8; tries += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand()) * Ra;
        const r = p.plaqueSize * (1 - p.variation * 0.5 * rand());
        const q = isRect
          ? { x: cx + (rand() * 2 - 1) * ux, y: cy + (rand() * 2 - 1) * uy }
          : { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        if (!inside(q, r)) continue;
        pl.push(circle(q.x, q.y, r));
        i += 1;
      }
      out.push(
        ...pathPrim(pl, { fill: agar, stroke: clear, sw: Math.max(0.1, p.plaqueSize * 0.12) }),
      );
    };
    const inside = (q: Vec2, r: number) =>
      isRect
        ? Math.abs(q.x - cx) <= ux - r && Math.abs(q.y - cy) <= uy - r
        : Math.hypot(q.x - cx, q.y - cy) <= Ra - r;
    const scatter = (n: number, c: Vec2, rad: number, k = 1) => {
      for (let i = 0, tries = 0; i < n && tries < n * 8; tries += 1) {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand()) * rad;
        const r = rOf() * k;
        const q = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
        if (!inside(q, r)) continue;
        subs.push(circle(q.x, q.y, r));
        i += 1;
      }
    };
    const markerSubs: Sub[] = [];
    const stroke = {
      fill: colony,
      stroke: shiftLightness(colony, -0.12),
      sw: Math.max(0.15, size * 0.08),
    };
    switch (p.pattern) {
      case 'none':
        break;
      case 'lawn':
        out.push(
          ...pathPrim(
            [isRect ? rect(cx - ux, cy - uy, 2 * ux, 2 * uy, R * 0.05) : circle(cx, cy, Ra)],
            {
              fill: mix(agar, colony, 0.75),
            },
          ),
        );
        lawnFeatures();
        break;
      case 'random':
        if (isRect) {
          // Uniform over the whole rectangle, not a disc inside it.
          for (let i = 0, tries = 0; i < p.count && tries < p.count * 8; tries += 1) {
            const r = rOf();
            const q = { x: cx + (rand() * 2 - 1) * ux, y: cy + (rand() * 2 - 1) * uy };
            if (!inside(q, r)) continue;
            subs.push(circle(q.x, q.y, r));
            i += 1;
          }
        } else scatter(p.count, { x: cx, y: cy }, Ra);
        break;
      case 'grid': {
        if (isRect) {
          // Rows and columns in the aspect of the plate (48 x 32 for 1536 on an SBS plate), filled row by row.
          const cols = Math.max(1, Math.round(Math.sqrt(p.count * (R > 0 ? hw / R : 1))));
          const rows = Math.max(1, Math.ceil(p.count / cols));
          const pitch = Math.min((ux * 1.9) / cols, (uy * 1.9) / rows);
          const r0 = Math.min(size, pitch * 0.42);
          for (let i = 0; i < p.count; i += 1) {
            const q = {
              x: cx + ((i % cols) - (cols - 1) / 2) * pitch,
              y: cy + (Math.floor(i / cols) - (rows - 1) / 2) * pitch,
            };
            subs.push(circle(q.x, q.y, r0 * (1 - p.variation * 0.6 * rand())));
          }
          break;
        }
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
        // Strain rows of 10-fold dilutions: the first spot is confluent, then fewer colonies each step.
        const cols = Math.max(1, p.spotCols);
        const rows = Math.max(1, p.spotRows);
        const lab = p.rowLabels ? 1 : 0;
        const pitch = Math.min((Ra * 1.5) / cols, (Ra * 1.9) / Math.hypot(cols + lab, rows * 1.1));
        const spotR = pitch * 0.4;
        // Colonies in a small spot stay small enough to count; 3 x 5 on a normal dish is unchanged.
        const spotSize = Math.min(size, spotR * 0.5);
        const x0 = cx - (pitch * (cols - 1)) / 2 + lab * pitch * 0.5;
        const ink = mix(dish, '#000000', 0.5);
        for (let r = 0; r < rows; r += 1) {
          const y = cy + (r - (rows - 1) / 2) * pitch * 1.1;
          if (p.rowLabels)
            out.push(text(rowName(r), x0 - pitch * 0.95, y, Math.max(1, pitch * 0.5), ink));
          for (let c = 0; c < cols; c += 1) {
            const q = { x: x0 + c * pitch, y };
            if (c === 0) {
              const big = circle(q.x, q.y, spotR);
              solid.add(big);
              subs.push(big);
            } else
              scatter(
                Math.round(Math.max(1, p.count) / 10 ** (c - 1)),
                q,
                spotR - spotSize,
                spotSize / size,
              );
          }
        }
        break;
      }
      case 'tetrads': {
        // One column of four spores (a to d) per tetrad, in bands of at most eight columns.
        const n = Math.max(1, p.tetrads);
        const perBand = Math.min(n, 8);
        const bands = Math.ceil(n / perBand);
        const lab = p.tetradLabels ? 0.8 : 0;
        const rowsTotal = bands * (4 + lab) + (bands - 1) * 0.6;
        const pitch = (Ra * 0.95 * 2) / Math.hypot(perBand, rowsTotal);
        const r0 = Math.min(size, pitch * 0.42);
        const ink = mix(dish, '#000000', 0.5);
        const x0 = cx - ((perBand - 1) * pitch) / 2;
        const y0 = cy - (rowsTotal * pitch) / 2;
        for (let t = 0; t < n; t += 1) {
          const band = Math.floor(t / perBand);
          const col = t % perBand;
          const inBand = Math.min(perBand, n - band * perBand);
          const x = x0 + (col + (perBand - inBand) / 2) * pitch;
          const top = y0 + band * (4 + lab + 0.6) * pitch;
          if (p.tetradLabels)
            out.push(text(String(t + 1), x, top + pitch * 0.4, Math.max(1, pitch * 0.5), ink));
          // How many of the four spores carry the marker.
          let mut: number;
          if (p.segregation === 'mixed') {
            const u = rand();
            mut = u < 0.7 ? 2 : u < 0.8 ? 1 : u < 0.9 ? 3 : u < 0.95 ? 0 : 4;
          } else mut = 4 - Number(p.segregation.charAt(0));
          const order = [0, 1, 2, 3]
            .map((i) => ({ i, k: rand() }))
            .sort((a, b) => a.k - b.k)
            .map((o) => o.i);
          for (let s = 0; s < 4; s += 1) {
            const q = { x, y: top + (lab + s + 0.5) * pitch };
            const u = rand();
            const r = r0 * (1 - p.variation * 0.6 * rand());
            const isMarker = order.indexOf(s) < mut;
            if (u < p.missing / 100) continue;
            if (u < (p.missing + p.dead) / 100) subs.push(circle(q.x, q.y, r * 0.25));
            else (isMarker ? markerSubs : subs).push(circle(q.x, q.y, r));
          }
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
    const marker = slots['marker'] ?? '#c0392b';
    const wedges: Sub[] = [];
    const lines: Sub[] = [];
    if (hasColonies(p)) {
      // Colour mix: a share of the colonies take the marker colour.
      if (p.markerShare > 0) {
        const keep: Sub[] = [];
        for (const s of subs)
          (!solid.has(s) && rand() * 100 < p.markerShare ? markerSubs : keep).push(s);
        subs = keep;
      }
      // Shape: reshape each colony and add wrinkles, filaments or a marker wedge.
      const shape = (s: Sub, sector: boolean): Sub => {
        if (s.t !== 'circle') return s;
        const { cx: x, cy: y, r } = s;
        const at = (a: number, d: number): Vec2 => ({
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d,
        });
        switch (p.morphology) {
          case 'petite':
            return circle(x, y, r * 0.5);
          case 'wrinkled': {
            const a0 = rand() * 2 * Math.PI;
            const pts: Vec2[] = [];
            for (let k = 0; k < 14; k += 1)
              pts.push(at((k / 14) * 2 * Math.PI, r * (1 + (rand() - 0.5) * 0.24)));
            for (let k = 0; k < 5; k += 1) {
              const a = a0 + (k / 5) * 2 * Math.PI + (rand() - 0.5) * 0.5;
              lines.push(poly([at(a, r * 0.2), at(a + 0.25, r * 0.55), at(a, r * 0.85)]));
            }
            return poly(pts, true);
          }
          case 'filamentous': {
            const a0 = rand() * 2 * Math.PI;
            for (let k = 0; k < 10; k += 1) {
              const a = a0 + (k / 10) * 2 * Math.PI + (rand() - 0.5) * 0.3;
              lines.push(poly([at(a, r * 0.7), at(a + 0.12, r * (1.1 + rand() * 0.4))]));
            }
            return circle(x, y, r * 0.8);
          }
          case 'sectored': {
            if (sector) {
              const a0 = rand() * 2 * Math.PI;
              const span = (0.4 + rand() * 0.6) * Math.PI;
              const pts: Vec2[] = [{ x, y }];
              for (let k = 0; k <= 8; k += 1) pts.push(at(a0 + (k / 8) * span, r));
              wedges.push(poly(pts, true));
            }
            return s;
          }
          case 'smooth':
            return s;
        }
      };
      if (p.morphology !== 'smooth') {
        subs = subs.map((s) => (solid.has(s) ? s : shape(s, true)));
        const m = markerSubs.map((s) => shape(s, false));
        markerSubs.length = 0;
        markerSubs.push(...m);
      }
    }
    out.push(...pathPrim(subs, stroke));
    if (wedges.length > 0)
      out.push(
        ...pathPrim(wedges, { fill: marker, stroke: shiftLightness(marker, -0.12), sw: stroke.sw }),
      );
    if (markerSubs.length > 0) {
      out.push(
        ...pathPrim(markerSubs, {
          fill: marker,
          stroke: shiftLightness(marker, -0.12),
          sw: stroke.sw,
        }),
      );
    }
    if (lines.length > 0)
      out.push(
        ...pathPrim(lines, {
          stroke: shiftLightness(colony, -0.3),
          sw: Math.max(0.1, size * 0.06),
          cap: 'round',
        }),
      );
    return out;
  },
  overhang: () => 0,
});
