/** Protein domain bar (note 04): a backbone with domains drawn to scale, a residue ruler and termini. */
import { shiftLightness } from '@/core/color/color';

import { type Prim, type Sub, ellipseNodes, line, pathPrim, poly, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { byColour, clamp, fmtInt, niceStep, text } from './util';

export type Domain = Readonly<{
  name: string;
  start: number;
  end: number;
  color: string;
  shape: 'box' | 'rounded' | 'ellipse' | 'hexagon';
}>;

export interface DomainParams {
  readonly length: number;
  readonly domains: readonly Domain[];
  readonly height: number;
  readonly showLabels: boolean;
  readonly showScale: boolean;
  readonly showTermini: boolean;
}

const MAX_AA = 100_000;
const PALETTE = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00'];

export const proteinDomains = defineKind<DomainParams>({
  kind: 'proteinDomains',
  version: 1,
  title: 'Protein domains',
  category: 'Molecules',
  description: 'A protein as a bar with its domains to scale, a residue ruler and N/C termini.',
  defaultSize: { w: 320, h: 70 },
  fields: [
    { key: 'length', label: 'Length', type: 'int', min: 1, max: MAX_AA, unit: 'aa', default: 600 },
    {
      key: 'domains',
      label: 'Domains',
      type: 'list',
      min: 0,
      max: 200,
      item: [
        { key: 'name', label: 'Name', type: 'text', maxLength: 60, default: 'domain' },
        { key: 'start', label: 'Start', type: 'int', min: 1, max: MAX_AA, unit: 'aa', default: 1 },
        { key: 'end', label: 'End', type: 'int', min: 1, max: MAX_AA, unit: 'aa', default: 50 },
        { key: 'color', label: 'Colour', type: 'color', default: '#0072b2' },
        {
          key: 'shape',
          label: 'Shape',
          type: 'enum',
          options: [
            { value: 'rounded', label: 'Rounded box' },
            { value: 'box', label: 'Box' },
            { value: 'ellipse', label: 'Oval' },
            { value: 'hexagon', label: 'Hexagon' },
          ],
          default: 'rounded',
        },
      ],
      default: [
        { name: 'SH3', start: 60, end: 120, color: '#0072b2', shape: 'rounded' },
        { name: 'SH2', start: 140, end: 240, color: '#e69f00', shape: 'rounded' },
        { name: 'Kinase', start: 270, end: 520, color: '#009e73', shape: 'box' },
      ],
      itemTitle: (it: Item, i: number) =>
        `${typeof it['name'] === 'string' && it['name'] !== '' ? it['name'] : `Domain ${String(i + 1)}`} (${String(it['start'])}–${String(it['end'])})`,
      newItem: (p, items) => {
        const len = typeof p['length'] === 'number' ? p['length'] : 100;
        return {
          name: `Domain ${String(items.length + 1)}`,
          start: 1,
          end: Math.max(1, Math.round(len / 5)),
          color: PALETTE[items.length % PALETTE.length] ?? '#0072b2',
          shape: 'rounded',
        };
      },
    },
    {
      key: 'height',
      label: 'Domain height',
      type: 'number',
      min: 2,
      max: 60,
      step: 0.5,
      unit: 'pt',
      default: 18,
    },
    { key: 'showLabels', label: 'Domain names', type: 'bool', default: true },
    { key: 'showScale', label: 'Residue ruler', type: 'bool', default: true },
    { key: 'showTermini', label: 'N and C termini', type: 'bool', default: true },
  ],
  slots: [
    { id: 'backbone', label: 'Backbone', default: '#9aa5b1' },
    { id: 'text', label: 'Text', default: '#1f2933' },
  ],
  fix: (p) => ({
    ...p,
    domains: p.domains.map((d) => {
      const a = Math.min(d.start, d.end, p.length);
      const b = Math.min(Math.max(d.start, d.end), p.length);
      return { ...d, start: a, end: b };
    }),
  }),
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const ink = slots['text'] ?? '#1f2933';
    const ts = clamp(Math.min(h * 0.16, 8), 1, 8);
    const termW = p.showTermini ? ts * 1.6 : 0;
    const x0 = Math.min(w / 2, termW + 2);
    const x1 = Math.max(x0, w - termW - 2);
    const scaleH = p.showScale ? ts * 2.4 : 0;
    const dh = Math.min(p.height, Math.max(0, h - scaleH) * 0.9);
    const y = clamp((h - scaleH) / 2, dh / 2, h - dh / 2);
    const xOf = (aa: number) => x0 + ((x1 - x0) * (aa - 1)) / p.length;
    const bb = Math.min(dh, Math.max(0.5, dh * 0.25));
    out.push(
      ...pathPrim([rect(x0, y - bb / 2, x1 - x0, bb, bb / 2)], { fill: slots['backbone'] ?? null }),
    );
    const shapes: { colour: string; sub: Sub }[] = [];
    for (const d of p.domains) {
      const a = xOf(d.start);
      const b = xOf(d.end + 1);
      const ww = Math.max(0, Math.min(b, x1) - a);
      const top = y - dh / 2;
      let sub: Sub;
      switch (d.shape) {
        case 'box':
          sub = rect(a, top, ww, dh, 0);
          break;
        case 'rounded':
          sub = rect(a, top, ww, dh, Math.min(dh * 0.3, ww / 2));
          break;
        case 'ellipse':
          sub = { t: 'poly', nodes: ellipseNodes(a + ww / 2, y, ww / 2, dh / 2), closed: true };
          break;
        case 'hexagon': {
          const k = Math.min(dh * 0.35, ww / 2);
          sub = poly(
            [
              { x: a, y },
              { x: a + k, y: top },
              { x: a + ww - k, y: top },
              { x: a + ww, y },
              { x: a + ww - k, y: top + dh },
              { x: a + k, y: top + dh },
            ],
            true,
          );
          break;
        }
      }
      shapes.push({ colour: d.color, sub });
      if (p.showLabels && d.name.trim() !== '' && dh > 3)
        out.push(text(d.name, a + ww / 2, y, Math.min(dh * 0.5, 9), '#ffffff', { bold: true }));
    }
    // Domains under their names: put them before the labels.
    const domainPrims: Prim[] = [];
    for (const [colour, list] of byColour(shapes, (s) => s.colour))
      domainPrims.push(
        ...pathPrim(
          list.map((s) => s.sub),
          { fill: colour, stroke: shiftLightness(colour, -0.18), sw: 0.5, join: 'round' },
        ),
      );
    out.splice(1, 0, ...domainPrims);
    if (p.showTermini) {
      out.push(text('N', Math.max(0, x0 - 2), y, ts, ink, { anchor: 'end', bold: true }));
      out.push(text('C', Math.min(w, x1 + 2), y, ts, ink, { anchor: 'start', bold: true }));
    }
    if (p.showScale) {
      const ry = clamp(y + dh / 2 + ts * 0.6, 0, h);
      const step = niceStep(p.length, 6);
      const ticks: Sub[] = [line({ x: x0, y: ry }, { x: x1, y: ry })];
      for (let aa = 0; aa <= p.length && ticks.length < 60; aa += step) {
        const x = xOf(Math.max(1, aa));
        ticks.push(line({ x, y: ry }, { x, y: clamp(ry + ts * 0.4, 0, h) }));
        out.push(text(fmtInt(Math.max(1, aa)), x, clamp(ry + ts * 1.1, 0, h), ts * 0.85, ink));
      }
      out.push(...pathPrim(ticks, { stroke: slots['backbone'] ?? null, sw: 0.5 }));
    }
    return out;
  },
});
