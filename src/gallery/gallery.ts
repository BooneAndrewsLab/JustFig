/**
 * The templates and examples gallery (note 08). An entry is code: a
 * `build()` that makes a fresh figure from the model's factories and
 * `createProcedural`, so every entry is typechecked against the current
 * schema, gets fresh ids each time, and can never go stale the way a
 * saved file could. Templates are empty layouts to fill in; examples are
 * finished figures to take apart. Colours are swatch-linked (note 07), so
 * "Apply palette" recolours a whole example.
 */
import { reconcileBindings } from '@/core/model/binding';
import {
  INK,
  createArrow,
  createDoc,
  createEllipse,
  createPage,
  createPanel,
  createRect,
  createText,
  defaultRun,
  frame,
} from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type {
  Arrow,
  Doc,
  Figure,
  Head,
  Obj,
  Paint,
  Run,
  ShapeStyle,
  Swatch,
} from '@/core/model/types';
import { fitText } from '@/core/text/layout';
import { createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';

export interface GalleryEntry {
  /** Stable, kebab-case; analytics and tests name entries by it. */
  readonly id: string;
  readonly title: string;
  /** One sentence for the card. */
  readonly description: string;
  readonly kind: 'template' | 'example';
  readonly build: () => Figure;
}

// --- helpers -------------------------------------------------------------------

/** A palette of named swatches, and paints linked to them. */
function swatches<K extends string>(
  colours: Readonly<Record<K, string>>,
): { palette: Swatch[]; sw: (k: K) => Paint } {
  const ids = new Map<K, string>();
  const palette: Swatch[] = [];
  for (const [name, hex] of Object.entries(colours) as [K, string][]) {
    const id = newId('sw');
    ids.set(name, id);
    palette.push({ id, name: name.charAt(0).toUpperCase() + name.slice(1), hex });
  }
  return { palette, sw: (k) => ({ swatch: ids.get(k) ?? '' }) };
}

const style = (fill: Paint | null, stroke: Paint | null, strokeWidth = 1): ShapeStyle => ({
  fill,
  stroke,
  strokeWidth,
  cap: 'round',
  join: 'round',
});

function label(x: number, y: number, text: string, over: Partial<Run> = {}, w?: number): Obj {
  const t = createText(x, y, [[defaultRun(text, { size: 9, ...over })]]);
  const sized = w === undefined ? t : { ...t, autoWidth: false, frame: { ...t.frame, w } };
  return fitText({ ...sized, align: w === undefined ? 'left' : 'center' });
}

/** A label centred in a box. */
function centred(o: Obj, text: string, over: Partial<Run> = {}): Obj {
  const t = label(o.frame.x, 0, text, over, o.frame.w);
  return { ...t, frame: { ...t.frame, y: o.frame.y + (o.frame.h - t.frame.h) / 2 } };
}

/** An arrow attached to two objects (note 06); its ends are solved when the figure is built. */
function link(a: Obj, b: Obj, paint: Paint, end: Head = { kind: 'triangle', size: 4 }): Arrow {
  const c = (o: Obj) => ({ x: o.frame.x + o.frame.w / 2, y: o.frame.y + o.frame.h / 2 });
  return {
    ...createArrow([c(a), c(b)], end, { kind: 'none', size: 4 }, style(null, paint, 1.25)),
    bind: { start: { id: a.id }, end: { id: b.id } },
  };
}

/** An object moved and resized to a box (not for path-following kinds). */
const placed = <T extends Obj>(o: T, x: number, y: number, w: number, h: number): T => ({
  ...o,
  frame: { ...o.frame, x, y, w, h },
});

function kind(id: string) {
  const k = getKind(id);
  if (!k) throw new Error(`unknown kind ${id}`);
  return k;
}

/** A one-page figure from objects; bound arrows solved. */
function figureOf(doc: Doc, objs: readonly Obj[], preset?: string): Figure {
  const base = createPage('Page 1', preset);
  const page = {
    ...base,
    layers: base.layers.map((l, i) => (i === 0 ? { ...l, children: objs } : l)),
  };
  const fig: Figure = { doc: { ...doc, pages: [page] }, assets: {} };
  return reconcileBindings({ doc: { ...doc, pages: [] }, assets: {} }, fig);
}

/** Panels in a grid filling the page with a margin and gutter. */
function grid(cols: number, rows: number, preset: string, title: string): Figure {
  const page = createPage('Page 1', preset);
  const m = 8;
  const g = 10;
  const w = (page.size.w - 2 * m - (cols - 1) * g) / cols;
  const h = (page.size.h - 2 * m - (rows - 1) * g) / rows;
  const panels: Obj[] = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1)
      panels.push(createPanel(frame(m + c * (w + g), m + r * (h + g), w, h)));
  return figureOf(createDoc(title), panels, preset);
}

// --- entries -------------------------------------------------------------------

function signalling(): Figure {
  const { palette, sw } = swatches({
    ligand: '#e69f00',
    receptor: '#0072b2',
    kinase: '#009e73',
    factor: '#cc79a7',
    inhibitor: '#d55e00',
    ink: INK,
  });
  const ink = sw('ink');
  const memb = createProcedural(kind('bilayer'), { x: 260, y: 115 });
  const ligand = createEllipse(frame(240, 22, 40, 26), style(sw('ligand'), ink));
  const receptor = createRect(frame(235, 95, 50, 40), style(sw('receptor'), ink), 8);
  const kinase = createRect(frame(235, 185, 50, 30), style(sw('kinase'), ink), 15);
  const tf = createEllipse(frame(330, 280, 60, 30), style(sw('factor'), ink));
  const gene = createRect(frame(400, 330, 90, 26), style(null, ink), 3);
  const drug = createEllipse(frame(110, 185, 40, 30), style(sw('inhibitor'), ink));
  const nucleus = createRect(frame(220, 255, 280, 110), style(null, ink, 0.75), 20);
  return figureOf({ ...createDoc('Signalling pathway'), palette }, [
    memb,
    nucleus,
    ligand,
    receptor,
    kinase,
    tf,
    gene,
    drug,
    centred(ligand, 'Ligand', { color: ink }),
    centred(receptor, 'Receptor', { color: { hex: '#ffffff' } }),
    centred(kinase, 'Kinase', { color: { hex: '#ffffff' } }),
    centred(tf, 'TF', { color: ink, bold: true }),
    centred(gene, 'Target gene', { color: ink, italic: true }),
    centred(drug, 'Drug', { color: ink }),
    label(232, 345, 'Nucleus', { color: ink, size: 8 }),
    link(ligand, receptor, ink),
    link(receptor, kinase, ink),
    link(kinase, tf, ink),
    link(tf, gene, ink),
    link(drug, kinase, sw('inhibitor'), { kind: 'bar', size: 4 }),
  ]);
}

function workflow(): Figure {
  const { palette, sw } = swatches({ step: '#56b4e9', accent: '#0072b2', ink: INK });
  const ink = sw('ink');
  const dish = placed(createProcedural(kind('petriDish'), { x: 0, y: 0 }), 20, 70, 120, 120);
  const plate = placed(createProcedural(kind('wellPlate'), { x: 0, y: 0 }), 175, 70, 190, 127);
  const readout = createRect(frame(400, 100, 100, 60), style(sw('step'), ink), 6);
  const schedule = placed(
    createProcedural(
      kind('timeline'),
      { x: 0, y: 0 },
      {
        end: 3,
        unit: 'days',
        events: [
          { label: 'Seed', time: 0, marker: 'triangle', end: 0, color: '' },
          { label: 'Treat', time: 1, marker: 'triangle', end: 1, color: '' },
          { label: 'Read out', time: 3, marker: 'triangle', end: 3, color: '' },
        ],
        ranges: [{ label: 'Drug', start: 1, end: 3, color: '#56b4e9' }],
      },
    ),
    20,
    250,
    480,
    90,
  );
  const steps = [
    label(30, 40, '1. Culture', { color: ink, bold: true }),
    label(190, 40, '2. Treat in a 96-well plate', { color: ink, bold: true }),
    label(390, 40, '3. Read out', { color: ink, bold: true }),
    label(30, 245, 'Schedule', { color: ink, bold: true }),
  ];
  return figureOf({ ...createDoc('Experimental workflow'), palette }, [
    dish,
    plate,
    readout,
    schedule,
    ...steps,
    centred(readout, 'Plate reader', { color: ink }),
    link(dish, plate, sw('accent')),
    link(plate, readout, sw('accent')),
  ]);
}

function cloning(): Figure {
  const { palette, sw } = swatches({ ink: INK });
  const ink = sw('ink');
  const map = placed(createProcedural(kind('plasmidMap'), { x: 0, y: 0 }), 18, 70, 260, 260);
  const gel = placed(createProcedural(kind('gel'), { x: 0, y: 0 }), 303, 90, 200, 155);
  return figureOf({ ...createDoc('Cloning and verification'), palette }, [
    {
      ...createPanel(frame(8, 8, 280, 380)),
      children: [map, label(30, 40, 'Construct', { color: ink, bold: true })],
    },
    {
      ...createPanel(frame(298, 8, 212, 380)),
      children: [gel, label(320, 40, 'Diagnostic digest', { color: ink, bold: true })],
    },
    link(map, gel, ink),
  ]);
}

export const GALLERY: readonly GalleryEntry[] = [
  {
    id: 'panels-2x2',
    title: 'Four panels, two columns',
    description: 'A 2 × 2 grid of lettered panels on a Nature double-column page (183 mm).',
    kind: 'template',
    build: () => grid(2, 2, 'nature-2', 'Four-panel figure'),
  },
  {
    id: 'panels-1x3',
    title: 'Three panels in a row',
    description: 'Three lettered panels across a Cell full-width page (174 mm).',
    kind: 'template',
    build: () => grid(3, 1, 'cell-2', 'Three-panel figure'),
  },
  {
    id: 'panels-single',
    title: 'Single column, two panels',
    description: 'Two stacked panels on a one-column page (89 mm).',
    kind: 'template',
    build: () => grid(1, 2, 'nature-1', 'Single-column figure'),
  },
  {
    id: 'signalling-pathway',
    title: 'Signalling pathway',
    description:
      'A ligand, receptor, kinase cascade and transcription factor, with an inhibitor, on a membrane; the arrows stay attached as you move things.',
    kind: 'example',
    build: signalling,
  },
  {
    id: 'experimental-workflow',
    title: 'Experimental workflow',
    description:
      'Culture, treatment in a 96-well plate and read-out, joined by attached arrows, over a timeline of the schedule.',
    kind: 'example',
    build: workflow,
  },
  {
    id: 'cloning',
    title: 'Cloning and verification',
    description: 'A plasmid map and a diagnostic gel in two lettered panels.',
    kind: 'example',
    build: cloning,
  },
];
