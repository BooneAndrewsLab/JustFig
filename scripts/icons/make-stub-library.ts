/**
 * Builds the Phase 1 stub icon library into public/lib/stub/ in the real
 * library layout (src/icons/manifest.ts, note 01): ~40 geometric house
 * icons drawn here, in the house style (100×100 grid, 2.5-unit outline in
 * slot `outline`, flat fills in up to 3 slots, shading by `data-tone`
 * only), plus vendored Health Icons (CC0, scripts/icons/healthicons/).
 *
 *   node scripts/icons/make-stub-library.ts
 *
 * Deterministic: the same sources give the same files. Phase 2's
 * `justfig-icons` repository replaces this with the full pipeline.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { contentHash } from '../../src/core/model/hash.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, 'public', 'lib', 'stub');
const VERSION = '0.1.0';
const OUTLINE = '#1f2933';

interface Slot {
  id: string;
  label: string;
  default: string;
}
interface Def {
  id: string;
  title: string;
  tags: string[];
  category: string;
  slots: Slot[];
  body: string;
}

const CATEGORIES: Record<string, string> = {
  lab: 'Lab equipment',
  cells: 'Cells and organelles',
  molecules: 'Molecules',
  organisms: 'Organisms',
  symbols: 'Symbols',
  anatomy: 'Anatomy and medical',
};

// --- drawing helpers: each painted element belongs to exactly one slot ---------------

const fill = (shape: string, slot: string, color: string, tone = 0): string =>
  shape.replace(
    /\/>$/,
    ` fill="${color}" data-slot="${slot}"${tone ? ` data-tone="${String(tone)}"` : ''}/>`,
  );
const line = (shape: string, w = 2.5): string =>
  shape.replace(
    /\/>$/,
    ` fill="none" stroke="${OUTLINE}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round" data-slot="outline"/>`,
  );
/** A shape filled in a slot and outlined. */
const both = (shape: string, slot: string, color: string, tone = 0): string =>
  fill(shape, slot, color, tone) + line(shape);
const part = (name: string, ...els: string[]): string =>
  `<g data-part="${name}">${els.join('')}</g>`;

const P = (d: string) => `<path d="${d}"/>`;
const C = (cx: number, cy: number, r: number) =>
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(r)}"/>`;
const E = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse cx="${String(cx)}" cy="${String(cy)}" rx="${String(rx)}" ry="${String(ry)}"/>`;
const R = (x: number, y: number, w: number, h: number, r = 0) =>
  `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}"${r ? ` rx="${String(r)}"` : ''}/>`;

const OUT: Slot = { id: 'outline', label: 'Outline', default: OUTLINE };
const s = (id: string, label: string, color: string): Slot => ({ id, label, default: color });
// Okabe-Ito based defaults.
const BLUE = '#56b4e9';
const ORANGE = '#e69f00';
const GREEN = '#009e73';
const YELLOW = '#f0e442';
const DBLUE = '#0072b2';
const RED = '#d55e00';
const PINK = '#cc79a7';
const GLASS = '#e4f1fb';

const liquid = (c = BLUE) => s('s1', 'Liquid', c);
const vessel = (c = GLASS) => s('s2', 'Vessel', c);

const HOUSE: Def[] = [
  // Lab equipment
  {
    id: 'test-tube',
    title: 'Test tube',
    tags: ['tube', 'glass', 'sample'],
    category: 'lab',
    slots: [liquid(), vessel(), OUT],
    body:
      part('vessel', fill(P('M38 8H62V78A12 12 0 0 1 38 78Z'), 's2', GLASS)) +
      part('liquid', fill(P('M38 50H62V78A12 12 0 0 1 38 78Z'), 's1', BLUE)) +
      line(P('M38 8V78A12 12 0 0 0 62 78V8')) +
      line(P('M33 8H67')),
  },
  {
    id: 'microcentrifuge-tube',
    title: 'Microcentrifuge tube',
    tags: ['eppendorf', 'tube', '1.5 ml'],
    category: 'lab',
    slots: [liquid(), vessel(), OUT],
    body:
      part('vessel', fill(P('M36 22H64V50L54 90H46L36 50Z'), 's2', GLASS)) +
      part('liquid', fill(P('M38 58H62L54 90H46Z'), 's1', BLUE)) +
      line(P('M36 22H64V50L54 90H46L36 50Z')) +
      both(R(32, 12, 36, 10, 2), 's2', GLASS, -0.1) +
      line(P('M68 16C80 16 80 30 68 30')),
  },
  {
    id: 'conical-tube',
    title: 'Conical tube (15/50 ml)',
    tags: ['falcon', 'tube', 'centrifuge'],
    category: 'lab',
    slots: [liquid(), vessel(), s('s3', 'Cap', DBLUE), OUT],
    body:
      fill(P('M36 20H64V72L54 92H46L36 72Z'), 's2', GLASS) +
      fill(P('M36 46H64V72L54 92H46L36 72Z'), 's1', BLUE) +
      line(P('M36 20H64V72L54 92H46L36 72Z')) +
      both(R(33, 6, 34, 14, 2), 's3', DBLUE) +
      line(P('M44 34H56M44 46H56M44 58H56'), 1.5),
  },
  {
    id: 'erlenmeyer-flask',
    title: 'Erlenmeyer flask',
    tags: ['flask', 'conical', 'culture'],
    category: 'lab',
    slots: [liquid(GREEN), vessel(), OUT],
    body:
      fill(P('M42 10H58V36L84 84A6 6 0 0 1 79 92H21A6 6 0 0 1 16 84L42 36Z'), 's2', GLASS) +
      fill(P('M29 60H71L84 84A6 6 0 0 1 79 92H21A6 6 0 0 1 16 84Z'), 's1', GREEN) +
      line(P('M42 10V36L16 84A6 6 0 0 0 21 92H79A6 6 0 0 0 84 84L58 36V10')) +
      line(P('M38 10H62')),
  },
  {
    id: 'beaker',
    title: 'Beaker',
    tags: ['glass', 'liquid', 'buffer'],
    category: 'lab',
    slots: [liquid(), vessel(), OUT],
    body:
      fill(P('M22 14H78V86A6 6 0 0 1 72 92H28A6 6 0 0 1 22 86Z'), 's2', GLASS) +
      fill(P('M22 48H78V86A6 6 0 0 1 72 92H28A6 6 0 0 1 22 86Z'), 's1', BLUE) +
      line(P('M16 10L22 16V86A6 6 0 0 0 28 92H72A6 6 0 0 0 78 86V14')) +
      line(P('M60 30H78M66 44H78M60 58H78'), 1.5),
  },
  {
    id: 'petri-dish',
    title: 'Petri dish',
    tags: ['agar', 'plate', 'colonies', 'culture'],
    category: 'lab',
    slots: [s('s1', 'Agar', '#f5e6a8'), s('s2', 'Colonies', ORANGE), OUT],
    body:
      part(
        'dish',
        fill(E(50, 58, 44, 28), 's1', '#f5e6a8', -0.08),
        both(E(50, 52, 44, 28), 's1', '#f5e6a8'),
      ) +
      part(
        'colonies',
        fill(C(35, 48, 6), 's2', ORANGE),
        fill(C(60, 58, 5), 's2', ORANGE, -0.1),
        fill(C(62, 42, 4), 's2', ORANGE),
        fill(C(44, 62, 3.5), 's2', ORANGE, 0.08),
      ),
  },
  {
    id: 'pipette',
    title: 'Pipette',
    tags: ['micropipette', 'pipetting', 'gilson'],
    category: 'lab',
    slots: [s('s1', 'Body', BLUE), s('s2', 'Tip', '#f2f4f6'), OUT],
    body:
      both(R(40, 8, 20, 10, 3), 's1', BLUE, -0.12) +
      both(P('M38 18H62L58 62H42Z'), 's1', BLUE) +
      both(R(44, 62, 12, 8), 's1', BLUE, 0.12) +
      both(P('M45 70H55L51 94H49Z'), 's2', '#f2f4f6'),
  },
  {
    id: 'pipette-tip',
    title: 'Pipette tip',
    tags: ['tip', 'pipetting'],
    category: 'lab',
    slots: [s('s1', 'Tip', YELLOW), OUT],
    body: both(P('M34 8H66L62 30L53 92H47L38 30Z'), 's1', YELLOW) + line(P('M38 30H62'), 1.5),
  },
  {
    id: 'culture-flask',
    title: 'Cell culture flask',
    tags: ['t75', 'flask', 'culture', 'cells'],
    category: 'lab',
    slots: [liquid(PINK), vessel(), s('s3', 'Cap', DBLUE), OUT],
    body:
      fill(P('M14 30H66L80 44V82H14Z'), 's2', GLASS) +
      fill(P('M14 66H80V82H14Z'), 's1', PINK) +
      line(P('M14 30H66L80 44V82H14Z')) +
      both(P('M66 30L76 20L88 32L80 40Z'), 's3', DBLUE),
  },
  {
    id: 'media-bottle',
    title: 'Media bottle',
    tags: ['bottle', 'medium', 'reagent'],
    category: 'lab',
    slots: [liquid(PINK), vessel(), s('s3', 'Cap', DBLUE), OUT],
    body:
      fill(P('M38 22H62V30L76 42V88A4 4 0 0 1 72 92H28A4 4 0 0 1 24 88V42L38 30Z'), 's2', GLASS) +
      fill(P('M24 54H76V88A4 4 0 0 1 72 92H28A4 4 0 0 1 24 88Z'), 's1', PINK) +
      line(P('M38 22H62V30L76 42V88A4 4 0 0 1 72 92H28A4 4 0 0 1 24 88V42L38 30Z')) +
      both(R(36, 8, 28, 14, 2), 's3', DBLUE),
  },
  {
    id: 'microscope-slide',
    title: 'Microscope slide',
    tags: ['slide', 'coverslip', 'specimen'],
    category: 'lab',
    slots: [s('s1', 'Specimen', PINK), vessel(), OUT],
    body:
      both(R(6, 34, 88, 32, 2), 's2', GLASS) +
      both(R(10, 38, 18, 24), 's2', GLASS, -0.08) +
      fill(E(60, 50, 14, 9), 's1', PINK) +
      line(R(42, 38, 36, 24), 1.5),
  },
  {
    id: 'cuvette',
    title: 'Cuvette',
    tags: ['spectrophotometer', 'absorbance', 'od600'],
    category: 'lab',
    slots: [liquid(YELLOW), vessel(), OUT],
    body:
      fill(R(34, 14, 32, 76, 2), 's2', GLASS) +
      fill(R(34, 44, 32, 46, 2), 's1', YELLOW) +
      line(R(34, 14, 32, 76, 2)) +
      line(P('M40 14V90'), 1.5),
  },
  {
    id: 'well-plate',
    title: 'Multi-well plate',
    tags: ['96-well', 'plate', 'assay', 'microplate'],
    category: 'lab',
    slots: [s('s1', 'Wells', BLUE), s('s2', 'Plate', '#e4e7eb'), OUT],
    body:
      both(R(6, 22, 88, 58, 5), 's2', '#e4e7eb') +
      part(
        'wells',
        ...[0, 1, 2, 3].flatMap((r) =>
          [0, 1, 2, 3, 4, 5].map((c) =>
            fill(C(19 + c * 12.4, 34 + r * 11.4, 4.2), 's1', BLUE, (r + c) % 3 === 0 ? -0.15 : 0),
          ),
        ),
      ),
  },
  {
    id: 'cryovial',
    title: 'Cryovial',
    tags: ['vial', 'freezer', 'liquid nitrogen', 'storage'],
    category: 'lab',
    slots: [liquid(), vessel(), s('s3', 'Cap', RED), OUT],
    body:
      fill(P('M38 30H62V84A8 8 0 0 1 54 92H46A8 8 0 0 1 38 84Z'), 's2', GLASS) +
      fill(P('M38 60H62V84A8 8 0 0 1 54 92H46A8 8 0 0 1 38 84Z'), 's1', BLUE) +
      line(P('M38 30H62V84A8 8 0 0 1 54 92H46A8 8 0 0 1 38 84Z')) +
      both(R(35, 8, 30, 22, 3), 's3', RED) +
      line(P('M41 14V24M47 14V24M53 14V24M59 14V24'), 1.5),
  },
  // Cells and organelles
  {
    id: 'animal-cell',
    title: 'Animal cell',
    tags: ['cell', 'eukaryote', 'nucleus', 'mammalian'],
    category: 'cells',
    slots: [s('s1', 'Cytoplasm', '#fbd3c0'), s('s2', 'Nucleus', '#8e6fb4'), OUT],
    body:
      part(
        'membrane',
        both(
          P('M50 8C74 6 94 26 92 50C90 76 72 94 48 92C22 90 6 72 8 48C10 24 28 9 50 8Z'),
          's1',
          '#fbd3c0',
        ),
      ) +
      part(
        'nucleus',
        both(C(52, 50, 17), 's2', '#8e6fb4'),
        fill(C(56, 46, 5), 's2', '#8e6fb4', -0.15),
      ),
  },
  {
    id: 'bacterium-rod',
    title: 'Bacterium (rod)',
    tags: ['bacillus', 'e. coli', 'prokaryote', 'microbe'],
    category: 'cells',
    slots: [s('s1', 'Cell', GREEN), OUT],
    body:
      line(P('M14 50C6 44 6 58 0 54'), 2) +
      both(R(14, 32, 72, 36, 18), 's1', GREEN) +
      fill(E(50, 50, 22, 7), 's1', GREEN, -0.12),
  },
  {
    id: 'bacterium-coccus',
    title: 'Bacteria (cocci)',
    tags: ['coccus', 'staphylococcus', 'prokaryote', 'microbe'],
    category: 'cells',
    slots: [s('s1', 'Cells', PINK), OUT],
    body: [C(32, 38, 16), C(62, 32, 16), C(46, 64, 16), C(74, 62, 14)]
      .map((c, i) => both(c, 's1', PINK, i % 2 ? -0.08 : 0))
      .join(''),
  },
  {
    id: 'yeast',
    title: 'Yeast (budding)',
    tags: ['saccharomyces', 'fungus', 'budding', 'cerevisiae'],
    category: 'cells',
    slots: [s('s1', 'Cell', '#f3d58a'), OUT],
    body:
      both(E(42, 54, 30, 26), 's1', '#f3d58a') +
      both(E(76, 34, 14, 12), 's1', '#f3d58a', 0.06) +
      fill(C(38, 52, 8), 's1', '#f3d58a', -0.15),
  },
  {
    id: 'neuron',
    title: 'Neuron',
    tags: ['nerve', 'axon', 'dendrite', 'brain'],
    category: 'cells',
    slots: [s('s1', 'Soma', '#f6a6b2'), OUT],
    body:
      line(P('M38 40L14 18M36 52L8 56M44 34L40 8M52 56L90 88M84 82L94 76M80 78L82 92'), 3) +
      both(C(44, 46, 14), 's1', '#f6a6b2') +
      fill(C(44, 46, 5), 's1', '#f6a6b2', -0.2),
  },
  {
    id: 'red-blood-cell',
    title: 'Red blood cell',
    tags: ['erythrocyte', 'rbc', 'blood'],
    category: 'cells',
    slots: [s('s1', 'Cell', '#d64545'), OUT],
    body:
      both(E(50, 50, 40, 28), 's1', '#d64545') + fill(E(50, 50, 22, 13), 's1', '#d64545', -0.12),
  },
  {
    id: 'mitochondrion',
    title: 'Mitochondrion',
    tags: ['mitochondria', 'organelle', 'atp', 'cristae'],
    category: 'cells',
    slots: [s('s1', 'Outer membrane', ORANGE), s('s2', 'Matrix', '#fbe3b5'), OUT],
    body:
      both(E(50, 50, 44, 24), 's1', ORANGE) +
      both(E(50, 50, 37, 17), 's2', '#fbe3b5') +
      line(P('M22 38V58M32 64V44M42 36V56M52 64V44M62 36V56M72 64V44'), 2),
  },
  {
    id: 'nucleus',
    title: 'Nucleus',
    tags: ['organelle', 'chromatin', 'nucleolus', 'dna'],
    category: 'cells',
    slots: [s('s1', 'Nucleus', '#8e6fb4'), OUT],
    body:
      both(C(50, 50, 40), 's1', '#8e6fb4', 0.1) +
      fill(C(58, 42, 12), 's1', '#8e6fb4', -0.15) +
      line(P('M26 58C32 50 38 66 44 58M48 74C54 66 60 80 66 72'), 1.5),
  },
  {
    id: 'vesicle',
    title: 'Vesicle',
    tags: ['exosome', 'liposome', 'organelle', 'transport'],
    category: 'cells',
    slots: [s('s1', 'Lumen', '#d9f0e8'), s('s2', 'Membrane', GREEN), OUT],
    body:
      both(C(50, 50, 34), 's2', GREEN) +
      both(C(50, 50, 26), 's1', '#d9f0e8') +
      fill(C(44, 46, 4), 's2', GREEN) +
      fill(C(56, 56, 3), 's2', GREEN),
  },
  {
    id: 'golgi',
    title: 'Golgi apparatus',
    tags: ['organelle', 'cisternae', 'secretion'],
    category: 'cells',
    slots: [s('s1', 'Cisternae', '#e0a3d0'), OUT],
    body: [18, 32, 46, 60]
      .map((y, i) =>
        both(
          P(
            `M16 ${String(y + 10)}C30 ${String(y - 4)} 70 ${String(y - 4)} 84 ${String(y + 10)}L84 ${String(y + 18)}C70 ${String(y + 4)} 30 ${String(y + 4)} 16 ${String(y + 18)}Z`,
          ),
          's1',
          '#e0a3d0',
          i * -0.05,
        ),
      )
      .join(''),
  },
  // Molecules
  {
    id: 'protein',
    title: 'Protein (globular)',
    tags: ['protein', 'enzyme', 'molecule'],
    category: 'molecules',
    slots: [s('s1', 'Protein', DBLUE), OUT],
    body: [C(36, 40, 18), C(60, 36, 16), C(62, 62, 18), C(38, 64, 14)]
      .map((c, i) => both(c, 's1', DBLUE, [0, 0.08, -0.08, 0.14][i] ?? 0))
      .join(''),
  },
  {
    id: 'antibody',
    title: 'Antibody (IgG)',
    tags: ['igg', 'immunoglobulin', 'antibody', 'immunology'],
    category: 'molecules',
    slots: [s('s1', 'Heavy chain', DBLUE), s('s2', 'Light chain', BLUE), OUT],
    body:
      both(R(44, 50, 12, 40, 6), 's1', DBLUE) +
      both(P('M44 52L22 18L32 12L52 46Z'), 's1', DBLUE) +
      both(P('M56 52L78 18L68 12L48 46Z'), 's1', DBLUE) +
      both(P('M24 30L12 12L20 6L32 22Z'), 's2', BLUE) +
      both(P('M76 30L88 12L80 6L68 22Z'), 's2', BLUE),
  },
  {
    id: 'receptor',
    title: 'Membrane receptor',
    tags: ['receptor', 'gpcr', 'membrane', 'signalling'],
    category: 'molecules',
    slots: [s('s1', 'Receptor', GREEN), s('s2', 'Membrane', '#f5e0b8'), OUT],
    body:
      both(R(4, 50, 92, 22), 's2', '#f5e0b8') +
      both(R(38, 18, 24, 74, 10), 's1', GREEN) +
      fill(R(38, 50, 24, 22), 's1', GREEN, -0.12),
  },
  {
    id: 'dna-helix',
    title: 'DNA double helix',
    tags: ['dna', 'helix', 'gene', 'nucleic acid'],
    category: 'molecules',
    slots: [s('s1', 'Strand 1', DBLUE), s('s2', 'Strand 2', ORANGE), OUT],
    body:
      line(P('M36 16H64M30 34H70M36 52H64M30 70H70M36 88H64'), 2) +
      P('M30 6C30 26 70 26 70 46C70 66 30 66 30 86').replace(
        '/>',
        ` fill="none" stroke="${DBLUE}" stroke-width="6" stroke-linecap="round" data-slot="s1"/>`,
      ) +
      P('M70 6C70 26 30 26 30 46C30 66 70 66 70 86').replace(
        '/>',
        ` fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round" data-slot="s2"/>`,
      ),
  },
  {
    id: 'rna-strand',
    title: 'RNA strand',
    tags: ['rna', 'mrna', 'transcript', 'nucleic acid'],
    category: 'molecules',
    slots: [s('s1', 'Strand', RED), OUT],
    body:
      P('M6 50C18 26 30 26 42 50S66 74 78 50S90 34 94 40').replace(
        '/>',
        ` fill="none" stroke="${RED}" stroke-width="6" stroke-linecap="round" data-slot="s1"/>`,
      ) + line(P('M18 38V26M30 32V20M54 62V74M66 68V80M86 44V32'), 2),
  },
  {
    id: 'lipid-bilayer',
    title: 'Lipid bilayer',
    tags: ['membrane', 'phospholipid', 'bilayer'],
    category: 'molecules',
    slots: [s('s1', 'Heads', ORANGE), OUT],
    body:
      line(
        P([10, 26, 42, 58, 74, 90].map((x) => `M${String(x)} 30V46M${String(x)} 54V70`).join('')),
        2,
      ) +
      [10, 26, 42, 58, 74, 90]
        .flatMap((x) => [both(C(x, 24, 6), 's1', ORANGE), both(C(x, 76, 6), 's1', ORANGE)])
        .join(''),
  },
  {
    id: 'ligand',
    title: 'Ligand',
    tags: ['ligand', 'small molecule', 'drug', 'agonist'],
    category: 'molecules',
    slots: [s('s1', 'Ligand', RED), OUT],
    body: both(P('M50 14L86 78H14Z'), 's1', RED),
  },
  {
    id: 'enzyme',
    title: 'Enzyme',
    tags: ['enzyme', 'catalysis', 'active site', 'protein'],
    category: 'molecules',
    slots: [s('s1', 'Enzyme', PINK), s('s2', 'Substrate', YELLOW), OUT],
    body:
      both(P('M50 10A40 40 0 1 0 86 64L54 50L86 36A40 40 0 0 0 50 10Z'), 's1', PINK) +
      both(C(84, 50, 8), 's2', YELLOW),
  },
  // Organisms
  {
    id: 'mouse',
    title: 'Mouse',
    tags: ['mouse', 'rodent', 'mus musculus', 'animal model'],
    category: 'organisms',
    slots: [s('s1', 'Fur', '#c9ced6'), s('s2', 'Ears', '#f4b6c2'), OUT],
    body:
      line(P('M14 70C4 66 6 50 18 52'), 2.5) +
      both(P('M18 66C18 40 44 30 64 38C78 30 92 44 92 58C92 66 84 70 74 70Z'), 's1', '#c9ced6') +
      both(C(70, 34, 9), 's2', '#f4b6c2') +
      fill(C(84, 52, 2.5), 's1', OUTLINE),
  },
  {
    id: 'zebrafish',
    title: 'Zebrafish',
    tags: ['fish', 'danio rerio', 'animal model'],
    category: 'organisms',
    slots: [s('s1', 'Body', '#f2d16b'), s('s2', 'Stripes', DBLUE), OUT],
    body:
      both(P('M8 50C24 32 62 30 78 50C62 70 24 68 8 50Z'), 's1', '#f2d16b') +
      both(P('M78 50L94 36V64Z'), 's1', '#f2d16b', -0.08) +
      P('M22 46H70M24 54H70').replace(
        '/>',
        ` fill="none" stroke="${DBLUE}" stroke-width="3" data-slot="s2"/>`,
      ) +
      fill(C(18, 47, 2.5), 's1', OUTLINE),
  },
  {
    id: 'plant',
    title: 'Plant (seedling)',
    tags: ['arabidopsis', 'plant', 'seedling', 'leaf'],
    category: 'organisms',
    slots: [s('s1', 'Leaves', GREEN), s('s2', 'Pot', '#c97b4a'), OUT],
    body:
      line(P('M50 70V36'), 3) +
      both(P('M50 44C36 44 24 34 22 20C38 20 48 30 50 44Z'), 's1', GREEN) +
      both(P('M50 36C60 36 74 28 78 14C62 14 52 22 50 36Z'), 's1', GREEN, 0.08) +
      both(P('M30 70H70L64 92H36Z'), 's2', '#c97b4a'),
  },
  // Symbols
  {
    id: 'plus',
    title: 'Plus',
    tags: ['add', 'positive', 'treatment'],
    category: 'symbols',
    slots: [s('s1', 'Fill', GREEN), OUT],
    body: both(P('M40 14H60V40H86V60H60V86H40V60H14V40H40Z'), 's1', GREEN),
  },
  {
    id: 'cross',
    title: 'Cross',
    tags: ['no', 'knockout', 'blocked', 'times'],
    category: 'symbols',
    slots: [s('s1', 'Fill', RED), OUT],
    body: both(
      P('M24 12L50 38L76 12L88 24L62 50L88 76L76 88L50 62L24 88L12 76L38 50L12 24Z'),
      's1',
      RED,
    ),
  },
  {
    id: 'lightning',
    title: 'Stimulus (lightning)',
    tags: ['stimulus', 'activation', 'shock', 'energy'],
    category: 'symbols',
    slots: [s('s1', 'Fill', YELLOW), OUT],
    body: both(P('M58 6L22 56H46L38 94L78 40H54Z'), 's1', YELLOW),
  },
  {
    id: 'clock',
    title: 'Time (clock)',
    tags: ['time', 'incubation', 'hours', 'timepoint'],
    category: 'symbols',
    slots: [s('s1', 'Face', '#f2f4f6'), OUT],
    body: both(C(50, 50, 40), 's1', '#f2f4f6') + line(P('M50 24V50L66 60'), 4),
  },
];

const HEALTH_ICONS: { file: string; title: string; tags: string[]; category: string }[] = [
  {
    file: 'bacteria',
    title: 'Bacteria',
    tags: ['microbe', 'germ', 'infection'],
    category: 'cells',
  },
  {
    file: 'blood-cells',
    title: 'Blood cells',
    tags: ['blood', 'erythrocyte', 'leukocyte'],
    category: 'cells',
  },
  {
    file: 'blood-drop',
    title: 'Blood drop',
    tags: ['blood', 'sample', 'drop'],
    category: 'anatomy',
  },
  {
    file: 'cell-nuclei',
    title: 'Cell nuclei',
    tags: ['nucleus', 'cells', 'tissue'],
    category: 'cells',
  },
  { file: 'dna', title: 'DNA', tags: ['dna', 'genetics', 'helix'], category: 'molecules' },
  { file: 'heart-organ', title: 'Heart', tags: ['heart', 'organ', 'cardiac'], category: 'anatomy' },
  { file: 'kidneys', title: 'Kidneys', tags: ['kidney', 'organ', 'renal'], category: 'anatomy' },
  { file: 'liver', title: 'Liver', tags: ['liver', 'organ', 'hepatic'], category: 'anatomy' },
  { file: 'lungs', title: 'Lungs', tags: ['lung', 'organ', 'respiratory'], category: 'anatomy' },
  {
    file: 'microscope',
    title: 'Microscope',
    tags: ['microscopy', 'imaging', 'lab'],
    category: 'lab',
  },
  { file: 'syringe', title: 'Syringe', tags: ['injection', 'needle', 'dose'], category: 'lab' },
  { file: 'test-tubes', title: 'Test tubes', tags: ['tubes', 'rack', 'samples'], category: 'lab' },
  { file: 'virus', title: 'Virus', tags: ['virus', 'pathogen', 'infection'], category: 'cells' },
  {
    file: 'animal-rat',
    title: 'Rat',
    tags: ['rat', 'rodent', 'animal model'],
    category: 'organisms',
  },
  {
    file: 'mosquito',
    title: 'Mosquito',
    tags: ['mosquito', 'insect', 'vector'],
    category: 'organisms',
  },
];

const HOUSE_META = {
  source: 'House icons',
  author: 'JustFig contributors',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
};
const HI_META = {
  source: 'Health Icons',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
};
const HI_COMMIT = '36887b268d2cb61f8d91622ad459bdf07910c2b0';

function svgDoc(viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
}

interface Entry {
  id: string;
  title: string;
  tags: string[];
  category: string;
  hash: string;
  svg: string;
  slots: Slot[];
  recolor: 'slots';
  meta: Record<string, unknown>;
}

function main(): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'svg'), { recursive: true });
  mkdirSync(join(out, 'shards'), { recursive: true });
  const entries: Entry[] = [];
  const add = (
    id: string,
    title: string,
    tags: string[],
    category: string,
    slots: Slot[],
    svg: string,
    meta: Record<string, unknown>,
  ) => {
    const hash = contentHash(svg);
    writeFileSync(join(out, 'svg', `${hash}.svg`), svg);
    entries.push({
      id,
      title,
      tags,
      category,
      hash,
      svg: `svg/${hash}.svg`,
      slots,
      recolor: 'slots',
      meta: { library: 'stub', libraryVersion: VERSION, id, title, ...meta, shareAlike: false },
    });
  };
  for (const d of HOUSE) {
    add(d.id, d.title, d.tags, d.category, d.slots, svgDoc('0 0 100 100', d.body), {
      ...HOUSE_META,
      originalUrl: `https://github.com/BooneAndrewsLab/JustFig/blob/main/scripts/icons/make-stub-library.ts#${d.id}`,
    });
  }
  const hiDir = join(here, 'healthicons');
  const available = new Set(readdirSync(hiDir));
  for (const h of HEALTH_ICONS) {
    if (!available.has(`${h.file}.svg`)) throw new Error(`missing Health Icon ${h.file}`);
    const raw = readFileSync(join(hiDir, `${h.file}.svg`), 'utf8');
    const vb = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 48 48';
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const body = inner
      .replace(/fill="currentColor"/g, `fill="#333333" data-slot="s1"`)
      .replace(/\s+/g, ' ')
      .trim();
    add(
      `hi-${h.file}`,
      h.title,
      h.tags,
      h.category,
      [{ id: 's1', label: 'Colour', default: '#333333' }],
      svgDoc(vb, body),
      {
        ...HI_META,
        originalUrl: `https://github.com/resolvetosavelives/healthicons/blob/${HI_COMMIT}/public/icons/svg/filled/${h.file}.svg`,
      },
    );
  }
  const categories = Object.entries(CATEGORIES).map(([id, title]) => {
    const icons = entries
      .filter((e) => e.category === id)
      .sort((a, b) => a.title.localeCompare(b.title));
    writeFileSync(
      join(out, 'shards', `${id}.json`),
      `${JSON.stringify({ category: id, icons }, null, 1)}\n`,
    );
    return { id, title, count: icons.length, shard: `shards/${id}.json` };
  });
  const manifest = {
    format: 'justfig-icons',
    formatVersion: 1,
    library: 'stub',
    version: VERSION,
    categories,
    sources: [
      {
        id: 'house',
        name: HOUSE_META.source,
        homepage: 'https://github.com/BooneAndrewsLab/JustFig',
        license: 'CC0-1.0',
        licenseUrl: HOUSE_META.licenseUrl,
      },
      {
        id: 'healthicons',
        name: HI_META.source,
        homepage: 'https://healthicons.org/',
        license: 'CC0-1.0',
        licenseUrl: HI_META.licenseUrl,
      },
    ],
  };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  // eslint-disable-next-line no-console
  console.log(
    `stub library: ${String(entries.length)} icons in ${String(categories.length)} categories`,
  );
}

main();
