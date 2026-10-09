/**
 * A calibrated scale bar for a micrograph (note 19, issue 6). The frame is the
 * picture's own box and the calibration is the picture's: its width in pixels
 * and the pixel size in µm. The bar's length is therefore a fraction of the
 * frame (µm ÷ µm-per-pixel ÷ pixels), so grouped with the picture it stays
 * correct through any resize, while its thickness, margin and text keep their
 * size in points.
 */
import { pathPrim, type Prim, rect } from '../prims';
import { defineKind } from '../types';
import { text } from './util';

export type Corner = 'br' | 'bl' | 'tr' | 'tl';

export interface ScaleBarParams {
  /** µm per pixel of the picture. */
  readonly pixelSize: number;
  /** The picture's width in pixels. */
  readonly imageWidth: number;
  /** µm. */
  readonly length: number;
  /** Empty: written from the length ("10 µm", "500 nm"). */
  readonly label: string;
  readonly showLabel: boolean;
  readonly corner: Corner;
  /** Points. */
  readonly thickness: number;
  readonly margin: number;
  readonly size: number;
}

/** A generous width of one character, as a multiple of the size (for the stated reach). */
const CHAR = 0.65;

/** Up to four significant digits, no trailing zeros. */
const num = (v: number): string => String(Number(v.toPrecision(4)));

/** "10 µm", "500 nm" or "1.5 mm" for a length in µm. */
export function lengthLabel(um: number): string {
  if (um < 1) return `${num(um * 1000)} nm`;
  if (um >= 1000) return `${num(um / 1000)} mm`;
  return `${num(um)} µm`;
}

/** The bar's length in points on a frame `w` wide (never longer than the frame). */
export function barLength(p: ScaleBarParams, w: number): number {
  return Math.min(w, (w * p.length) / p.pixelSize / p.imageWidth);
}

const labelOf = (p: ScaleBarParams): string =>
  p.label.trim() === '' ? lengthLabel(p.length) : p.label;

export const scaleBar = defineKind<ScaleBarParams>({
  kind: 'scaleBar',
  version: 1,
  title: 'Scale bar',
  category: 'Lab',
  description: 'A scale bar for a micrograph, calibrated from its pixel size.',
  keywords: ['scale', 'bar', 'micrograph', 'microscopy', 'micron', 'µm', 'calibration', 'image'],
  defaultSize: { w: 200, h: 150 },
  fields: [
    {
      key: 'pixelSize',
      label: 'Pixel size',
      help: 'From the microscope or image metadata, e.g. 0.065 µm for a 100× objective.',
      type: 'number',
      min: 0.0001,
      max: 1000,
      step: 0.0001,
      unit: 'µm/px',
      default: 0.1,
    },
    {
      key: 'imageWidth',
      label: 'Image width',
      help: 'The picture’s width in pixels; set for you by Add scale bar.',
      type: 'int',
      min: 1,
      max: 100000,
      unit: 'px',
      default: 1000,
    },
    {
      key: 'length',
      label: 'Bar length',
      type: 'number',
      min: 0.001,
      max: 100000,
      step: 1,
      unit: 'µm',
      default: 10,
    },
    { key: 'showLabel', label: 'Label', type: 'bool', default: true },
    {
      key: 'label',
      label: 'Label text',
      help: 'Leave empty to write the length.',
      type: 'text',
      maxLength: 24,
      default: '',
      placeholder: 'automatic',
      showIf: (p) => p['showLabel'] === true,
    },
    {
      key: 'corner',
      label: 'Corner',
      type: 'enum',
      options: [
        { value: 'br', label: 'Bottom right' },
        { value: 'bl', label: 'Bottom left' },
        { value: 'tr', label: 'Top right' },
        { value: 'tl', label: 'Top left' },
      ],
      default: 'br',
    },
    {
      key: 'thickness',
      label: 'Thickness',
      type: 'number',
      min: 0.25,
      max: 20,
      step: 0.25,
      unit: 'pt',
      default: 3,
    },
    {
      key: 'margin',
      label: 'Margin',
      help: 'From the edges of the picture.',
      type: 'number',
      min: 0,
      max: 72,
      step: 0.5,
      unit: 'pt',
      default: 6,
    },
    {
      key: 'size',
      label: 'Text size',
      type: 'number',
      min: 4,
      max: 24,
      step: 0.5,
      unit: 'pt',
      default: 8,
      showIf: (p) => p['showLabel'] === true,
    },
  ],
  slots: [
    { id: 'bar', label: 'Bar', default: '#ffffff' },
    { id: 'text', label: 'Text', default: '#ffffff' },
  ],
  // On a frame smaller than the margins, the bar and label reach out past it.
  overhang: (p) => p.margin + p.thickness + p.size * (1.5 + CHAR * labelOf(p).length),
  render(p, { w, h, slots }) {
    const len = barLength(p, w);
    const right = p.corner === 'br' || p.corner === 'tr';
    const bottom = p.corner === 'br' || p.corner === 'bl';
    const x = right ? w - p.margin - len : p.margin;
    const y = bottom ? h - p.margin - p.thickness : p.margin;
    const out: Prim[] = [];
    if (len > 0)
      out.push(...pathPrim([rect(x, y, len, p.thickness)], { fill: slots['bar'] ?? '#ffffff' }));
    if (p.showLabel) {
      const gap = p.size * 0.3;
      const ty = bottom ? y - gap : y + p.thickness + gap;
      const label = labelOf(p);
      // Centred over the bar, unless that would run off the picture's edge: then flush with
      // the bar's outer end.
      const half = (0.55 * label.length * p.size) / 2;
      const c = x + len / 2;
      const wide = right ? c + half > w : c - half < 0;
      const [tx, anchor] = !wide
        ? [x + len / 2, 'middle' as const]
        : right
          ? [x + len, 'end' as const]
          : [x, 'start' as const];
      out.push(
        text(label, tx, ty, p.size, slots['text'] ?? '#ffffff', {
          anchor,
          baseline: bottom ? 'alphabetic' : 'top',
        }),
      );
    }
    return out;
  },
});
