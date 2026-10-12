/**
 * Agarose gel (note 04): lanes with bands placed by size on a log scale,
 * a ladder, lane labels and ladder sizes. Bands of one shade are one
 * `<path>`; intensity blends the band colour into the gel colour. Only the
 * photo style's glow and uneven light use plain fill/stroke opacity.
 */
import { type Prim, type StyleId, type Sub, glowRings, lookOf, pathPrim, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { byColour, clamp, fmtInt, mix, text } from './util';

export const LADDERS: Readonly<Record<string, readonly number[]>> = {
  '1kb': [10000, 8000, 6000, 5000, 4000, 3000, 2500, 2000, 1500, 1000, 750, 500, 250],
  '100bp': [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100],
  none: [],
};

export interface Lane {
  readonly label: string;
  readonly ladder: boolean;
  readonly bands: string;
}

export interface GelParams {
  readonly style: StyleId;
  readonly ladder: '1kb' | '100bp' | 'none';
  readonly lanes: readonly Lane[];
  readonly look: 'stained' | 'inverted';
  readonly showLabels: boolean;
  readonly showSizes: boolean;
  readonly wells: boolean;
}

/** "3000, 1500:0.4, 800" → sizes in bp with intensities 0..1 (default 1). At most 40 bands. */
export function parseBands(s: string): { bp: number; i: number }[] {
  const out: { bp: number; i: number }[] = [];
  for (const part of s.split(/[,;\s]+/)) {
    const m = /^(\d+(?:\.\d+)?)\s*(k?)(?:b|bp)?(?::(\d*\.?\d+))?$/i.exec(part.trim());
    if (!m?.[1]) continue;
    const bp = Number(m[1]) * (m[2] ? 1000 : 1);
    const i = m[3] === undefined ? 1 : clamp(Number(m[3]), 0, 1);
    if (bp >= 1 && bp <= 1e6 && Number.isFinite(i)) out.push({ bp, i });
    if (out.length >= 40) break;
  }
  return out;
}

export const gel = defineKind<GelParams>({
  kind: 'gel',
  version: 1,
  title: 'Agarose gel',
  category: 'Lab',
  description: 'A gel with a ladder and lanes of bands; type band sizes in bp.',
  keywords: ['agarose', 'electrophoresis', 'ladder', 'band', 'lane', 'pcr', 'dna'],
  defaultSize: { w: 220, h: 170 },
  styles: ['line-art', 'cartoon', 'textbook', 'photo'],
  fields: [
    {
      key: 'ladder',
      label: 'Ladder',
      type: 'enum',
      options: [
        { value: '1kb', label: '1 kb ladder' },
        { value: '100bp', label: '100 bp ladder' },
        { value: 'none', label: 'None' },
      ],
      default: '1kb',
    },
    {
      key: 'lanes',
      label: 'Lanes',
      type: 'list',
      min: 1,
      max: 30,
      item: [
        { key: 'label', label: 'Label', type: 'text', maxLength: 24, default: '' },
        { key: 'ladder', label: 'Ladder lane', type: 'bool', default: false },
        {
          key: 'bands',
          label: 'Bands (bp)',
          type: 'text',
          maxLength: 300,
          default: '',
          placeholder: '3000, 1500:0.4',
        },
      ],
      default: [
        { label: 'L', ladder: true, bands: '' },
        { label: '1', ladder: false, bands: '3000, 1200' },
        { label: '2', ladder: false, bands: '3000, 1200:0.4, 700' },
        { label: '3', ladder: false, bands: '4500' },
        { label: '–', ladder: false, bands: '' },
      ],
      itemTitle: (it: Item, i: number) =>
        `Lane ${String(i + 1)}${typeof it['label'] === 'string' && it['label'] !== '' ? ` “${it['label']}”` : ''}${it['ladder'] === true ? ' (ladder)' : ''}`,
      newItem: (_p, items) => ({ label: String(items.length), ladder: false, bands: '' }),
    },
    {
      key: 'look',
      label: 'Look',
      type: 'enum',
      options: [
        { value: 'stained', label: 'Stained (light bands on dark)' },
        { value: 'inverted', label: 'Inverted (dark bands on light)' },
      ],
      default: 'stained',
    },
    { key: 'showLabels', label: 'Lane labels', type: 'bool', default: true },
    { key: 'showSizes', label: 'Ladder sizes', type: 'bool', default: true },
    { key: 'wells', label: 'Wells', type: 'bool', default: true },
  ],
  slots: [
    { id: 'gel', label: 'Gel', default: '#2b2f36' },
    { id: 'band', label: 'Bands', default: '#f5f7fa' },
    { id: 'text', label: 'Text', default: '#1f2933' },
  ],
  presets: [
    {
      id: 'colony-pcr',
      label: 'Colony PCR check',
      params: {
        ladder: '1kb',
        lanes: [
          { label: 'L', ladder: true, bands: '' },
          // Colonies 1-6: most carry the 1.5 kb insert, 3 has none and 6 is faint.
          { label: '1', ladder: false, bands: '1500' },
          { label: '2', ladder: false, bands: '1500' },
          { label: '3', ladder: false, bands: '' },
          { label: '4', ladder: false, bands: '1500' },
          { label: '5', ladder: false, bands: '1500' },
          { label: '6', ladder: false, bands: '1500:0.3' },
          { label: '+', ladder: false, bands: '1500' },
          { label: '–', ladder: false, bands: '' },
        ],
      },
    },
    {
      id: 'restriction-digest',
      label: 'Restriction digest',
      params: {
        ladder: '1kb',
        lanes: [
          { label: 'L', ladder: true, bands: '' },
          { label: 'Uncut', ladder: false, bands: '3500, 6000:0.4' },
          { label: 'EcoRI', ladder: false, bands: '5400' },
          { label: 'BamHI', ladder: false, bands: '3000, 2400' },
          { label: 'E + B', ladder: false, bands: '3000, 1600, 800' },
        ],
      },
    },
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const dark = slots['gel'] ?? '#2b2f36';
    const light = slots['band'] ?? '#f5f7fa';
    const look = lookOf(p.style, clamp(Math.min(w, h) * 0.005, 0.3, 1));
    // On paper (line art) bands are always dark on a light gel.
    const stained = p.look === 'stained' && !look.onPaper;
    // A photo: a UV-lit stained gel (violet-black, glowing pink-orange bands) or a scanned
    // inverted one (grey bands with a soft edge on near-white).
    const photo = look.photo;
    const gelC = photo ? (stained ? '#1c1226' : '#eceaee') : stained ? dark : light;
    const bandC = photo ? (stained ? '#ffd9c4' : '#2a2730') : stained ? light : dark;
    const ink = look.text(slots['text'] ?? '#1f2933');
    const ts = clamp(Math.min(w, h) * 0.05, 1, 8);
    const ladder = LADDERS[p.ladder] ?? [];
    const left = p.showSizes && ladder.length > 0 ? ts * 3.4 : 0;
    const top = p.showLabels ? ts * 1.8 : 0;
    const gx = Math.min(left, w * 0.4);
    const gy = Math.min(top, h * 0.3);
    const gw = Math.max(0, w - gx);
    const gh = Math.max(0, h - gy);
    const slab = look.organic(rect(gx, gy, gw, gh, Math.min(3, gw * 0.02) * look.bigger), 1);
    // A plain slab in every style: tone bands in a rectangle read as a patch, not shading.
    out.push(...pathPrim([slab], look.body({ fill: gelC })));
    // The transilluminator lights the middle of the gel more than its edges.
    if (photo)
      for (const k of [0.92, 0.8, 0.68, 0.56, 0.44])
        out.push(
          ...pathPrim(
            [
              rect(
                gx + (gw * (1 - k)) / 2,
                gy + gh * (1 - k) * 0.6,
                gw * k,
                gh * k,
                Math.min(gw, gh) * k * 0.45,
              ),
            ],
            {
              fill: stained ? '#7a44a8' : '#ffffff',
              alpha: stained ? 0.07 : 0.22,
            },
          ),
        );
    const n = p.lanes.length;
    const pitch = gw / Math.max(1, n);
    const bw = pitch * 0.72;
    const bh = clamp(gh * 0.022, 0.3, 6);
    const lanes = p.lanes.map((l) =>
      l.ladder
        ? ladder.map((bp) => ({ bp, i: bp === 3000 || bp === 500 ? 1 : 0.75 }))
        : parseBands(l.bands),
    );
    const all = lanes.flat().map((b) => b.bp);
    const hi = Math.log(Math.max(...all, ...ladder, 1000) * 1.3);
    const lo = Math.log(Math.max(1, Math.min(...all, ...ladder, 1000) * 0.75));
    const y0 = gy + gh * 0.1;
    const y1 = gy + gh * 0.95;
    const yOf = (bp: number) =>
      hi > lo ? y0 + ((hi - Math.log(bp)) / (hi - lo)) * (y1 - y0) : (y0 + y1) / 2;
    if (p.wells) {
      const wellSubs: Sub[] = [];
      for (let k = 0; k < n; k += 1)
        wellSubs.push(
          rect(
            gx + k * pitch + (pitch - bw) / 2,
            gy + gh * 0.03,
            bw,
            Math.min(bh * 1.6, gh * 0.04),
          ),
        );
      out.push(
        ...pathPrim(
          wellSubs,
          look.detail({
            fill: photo && stained ? mix(gelC, '#ffffff', 0.1) : mix(gelC, '#000000', 0.35),
          }),
        ),
      );
    }
    const bands: { colour: string; sub: Sub }[] = [];
    lanes.forEach((bs, k) => {
      const x = gx + k * pitch + (pitch - bw) / 2;
      for (const b of bs) {
        const y = clamp(yOf(b.bp), gy + bh / 2, gy + gh - bh / 2);
        // Intensity in tenths: few distinct shades, so few paths.
        const shade = Math.round(clamp(b.i, 0, 1) * 10) / 10;
        bands.push({
          colour: mix(gelC, bandC, 0.15 + 0.85 * shade),
          sub: rect(x, y - bh / 2, bw, bh, bh * 0.3 * look.bigger),
        });
      }
    });
    const groups = [...byColour(bands, (b) => b.colour)];
    // Photo: each band glows (stained) or blurs (inverted) as far as half its height.
    if (photo)
      for (const [colour, list] of groups)
        out.push(
          ...glowRings(
            list.map((b) => b.sub),
            stained ? mix(colour, '#ff6a3d', 0.5) : colour,
            0,
            3,
            bh * 0.3,
            stained ? 1 : 0.5,
          ),
        );
    for (const [colour, list] of groups)
      out.push(
        ...pathPrim(
          list.map((b) => b.sub),
          look.mark({ fill: colour }),
        ),
      );
    if (p.showLabels)
      p.lanes.forEach((l, k) => {
        if (l.label.trim() !== '') out.push(text(l.label, gx + (k + 0.5) * pitch, gy / 2, ts, ink));
      });
    const ladderLane = p.lanes.findIndex((l) => l.ladder);
    if (p.showSizes && ladderLane >= 0 && left > 0)
      for (let i = 0, last = -Infinity; i < ladder.length; i += 1) {
        const bp = ladder[i] ?? 1;
        // Skip a size whose label would overlap the one above it.
        if (yOf(bp) - last < ts * 0.85) continue;
        last = yOf(bp);
        out.push(
          text(
            bp >= 1000 ? `${String(bp / 1000)} kb` : fmtInt(bp),
            Math.max(0, gx - ts * 0.3),
            clamp(yOf(bp), 0, h),
            ts * 0.8,
            ink,
            { anchor: 'end' },
          ),
        );
      }
    return out;
  },
});
