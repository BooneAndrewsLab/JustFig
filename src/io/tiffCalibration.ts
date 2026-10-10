/**
 * What a TIFF says about its pixel size and its channels (note 43, issue 65):
 * OME-XML (`PhysicalSizeX` with its unit), ImageJ's description (`unit=`,
 * `channels=`, `images=`) and the plain resolution tags. Pure on strings and
 * numbers. The pixel size is only derived where the file states it; a value
 * that looks like a default (72 or 96 dpi) is not taken for a calibration.
 */
import type { TiffMeta } from './tiffDecode';

/** What an ImageJ description says (`ImageJ=1.53t\nimages=3\nchannels=3\nunit=micron`). */
export interface ImageJInfo {
  readonly images?: number;
  readonly channels?: number;
  readonly slices?: number;
  readonly frames?: number;
  readonly unit?: string;
  readonly spacing?: number;
}

export function parseImageJ(description: string | undefined): ImageJInfo | null {
  if (!description?.startsWith('ImageJ=')) return null;
  const kv = new Map<string, string>();
  for (const line of description.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0) kv.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const int = (k: string): number | undefined => {
    const n = Number(kv.get(k));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const spacing = Number(kv.get('spacing'));
  const out: {
    -readonly [K in keyof ImageJInfo]: ImageJInfo[K];
  } = {};
  for (const k of ['images', 'channels', 'slices', 'frames'] as const) {
    const n = int(k);
    if (n !== undefined) out[k] = n;
  }
  const unit = kv.get('unit');
  if (unit !== undefined) out.unit = unit;
  if (kv.has('spacing') && Number.isFinite(spacing)) out.spacing = spacing;
  return out;
}

/** What the first `<Pixels>` of an OME-XML description says. */
export interface OmeInfo {
  /** µm per pixel, when `PhysicalSizeX` is given in a known unit. */
  readonly pixelSizeX?: number;
  readonly pixelSizeY?: number;
  readonly sizeC: number;
  readonly sizeZ: number;
  readonly sizeT: number;
  /** E.g. `XYCZT`: the order the planes follow, fastest first. */
  readonly dimensionOrder: string;
}

/** µm in one of a unit: OME symbols and ImageJ's names. */
const UNIT_UM: Record<string, number> = {
  µm: 1,
  μm: 1,
  um: 1,
  micron: 1,
  microns: 1,
  micrometer: 1,
  micrometre: 1,
  nm: 0.001,
  nanometer: 0.001,
  nanometre: 0.001,
  mm: 1000,
  millimeter: 1000,
  millimetre: 1000,
  cm: 10000,
  centimeter: 10000,
  centimetre: 10000,
  m: 1e6,
  meter: 1e6,
  metre: 1e6,
  å: 1e-4,
  angstrom: 1e-4,
  inch: 25400,
  in: 25400,
};

export const unitInMicrons = (unit: string): number | undefined =>
  UNIT_UM[
    unit
      .trim()
      .replace(/\\u00b5|\\u03bc/gi, 'µ')
      .toLowerCase()
  ];

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];

export function parseOme(description: string | undefined): OmeInfo | null {
  if (description === undefined || !/<OME[\s>:]/.test(description)) return null;
  const tag = /<(?:\w+:)?Pixels\b[^>]*>/.exec(description)?.[0];
  if (tag === undefined) return null;
  const size = (name: string): number => {
    const n = Number(attr(tag, name));
    return Number.isInteger(n) && n > 0 ? n : 1;
  };
  const physical = (axis: 'X' | 'Y'): number | undefined => {
    const v = Number(attr(tag, `PhysicalSize${axis}`));
    // OME's default unit is the micrometre.
    const k = unitInMicrons(attr(tag, `PhysicalSize${axis}Unit`) ?? 'µm');
    return Number.isFinite(v) && v > 0 && k !== undefined ? v * k : undefined;
  };
  const x = physical('X');
  const y = physical('Y');
  return {
    ...(x === undefined ? {} : { pixelSizeX: x }),
    ...(y === undefined ? {} : { pixelSizeY: y }),
    sizeC: size('SizeC'),
    sizeZ: size('SizeZ'),
    sizeT: size('SizeT'),
    dimensionOrder: attr(tag, 'DimensionOrder') ?? 'XYZCT',
  };
}

/** The page index of channel `c` (first slice, first time point) in an OME file. */
export function omePage(o: OmeInfo, c: number): number {
  const order = o.dimensionOrder.replace(/^XY/, '');
  let stride = 1;
  for (const ch of order) {
    if (ch === 'C') return c * stride;
    stride *= ch === 'Z' ? o.sizeZ : o.sizeT;
  }
  return c;
}

/** The pixel size the scale bar can take: sensible values only (its field's range). */
const sane = (um: number | undefined): number | undefined =>
  um !== undefined && Number.isFinite(um) && um >= 0.0001 && um <= 1000 ? um : undefined;

/** Resolutions a program writes when it knows nothing (pixels per inch). */
const DEFAULT_DPI = [1, 72, 96, 150, 300, 600];

export interface Calibration {
  /** µm per pixel. */
  readonly pixelSize: number;
  readonly source: 'ome' | 'imagej' | 'resolution';
  /** The vertical pixel size differs from the horizontal by over 1 %. */
  readonly notSquare: boolean;
}

/**
 * The pixel size in µm that a page of a TIFF states, or null. Order: OME-XML,
 * then ImageJ's `unit=` with the resolution tags, then the resolution tags
 * alone in centimetres or inches (not at a default dpi, which no instrument
 * means).
 */
export function calibrationOf(meta: TiffMeta): Calibration | null {
  const ome = parseOme(meta.description);
  if (ome) {
    const x = sane(ome.pixelSizeX);
    if (x === undefined) return null;
    const y = ome.pixelSizeY;
    return {
      pixelSize: x,
      source: 'ome',
      notSquare: y !== undefined && Math.abs(y / x - 1) > 0.01,
    };
  }
  const xr = meta.xResolution;
  const yr = meta.yResolution;
  if (xr === undefined || !(xr > 0)) return null;
  const notSquare = yr !== undefined && yr > 0 && Math.abs(yr / xr - 1) > 0.01;
  const ij = parseImageJ(meta.description);
  if (ij?.unit !== undefined) {
    const k = unitInMicrons(ij.unit);
    // ImageJ stores pixels per unit in the resolution tags, whatever the unit tag says.
    const um = k === undefined ? undefined : sane(k / xr);
    return um === undefined ? null : { pixelSize: um, source: 'imagej', notSquare };
  }
  if (meta.resolutionUnit === 3) {
    const um = sane(10000 / xr);
    return um === undefined ? null : { pixelSize: um, source: 'resolution', notSquare };
  }
  if (meta.resolutionUnit === 2 && !DEFAULT_DPI.includes(Math.round(xr))) {
    const um = sane(25400 / xr);
    return um === undefined ? null : { pixelSize: um, source: 'resolution', notSquare };
  }
  return null;
}
