/**
 * The `.jfig` codec (note 02): plain JSON, hand-decoded, with migrations.
 * Writing is deterministic (canonical key order, unused assets dropped), so
 * the same figure always gives the same bytes. A file from a newer app is
 * refused rather than guessed at.
 */
import { asId } from '@/core/model/ids';
import {
  FONT_IDS,
  HEAD_KINDS,
  type Asset,
  type Assets,
  type Doc,
  type Figure,
  type Frame,
  type Head,
  type IconMeta,
  type Layer,
  type Obj,
  type Page,
  type Paint,
  type PanelLabelStyle,
  type PathNode,
  type Run,
  type ShapeStyle,
  type SlotDef,
  type Swatch,
  type TextStyle,
  type UserAssetMeta,
  type Vec2,
} from '@/core/model/types';
import { usedAssets } from '@/core/model/tree';

import {
  DecodeError,
  type Json,
  type JsonObject,
  Path,
  bool,
  flag,
  int,
  list,
  nonNeg,
  num,
  obj,
  oneOf,
  opt,
  str,
} from './decode';

/** Permanent format id: deliberately not the display name (note 01). */
export const FORMAT = 'justfig';
export const FRAGMENT_FORMAT = 'justfig-fragment';

/** One function per schema step: `MIGRATIONS[i]` turns version i + 1 into version i + 2. */
export type Migration = (doc: JsonObject) => JsonObject;

export const MIGRATIONS: readonly Migration[] = [];

export const SCHEMA_VERSION = MIGRATIONS.length + 1;

/** A file that cannot be opened; the message is for the user. */
export class JfigError extends Error {
  override readonly name = 'JfigError';
}

export interface SavedFigure extends Figure {
  /** App name and version that wrote the file (provenance only). */
  readonly app: { readonly name: string; readonly version: string };
}

// --- writing ------------------------------------------------------------------

const FIRST_KEYS = ['format', 'schemaVersion', 'id', 'type', 'kind', 'name'];

function keyOrder(a: string, b: string): number {
  const ia = FIRST_KEYS.indexOf(a);
  const ib = FIRST_KEYS.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A value with object keys in canonical order and `undefined` members dropped. */
export function canonical(v: unknown): Json {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v))
      throw new JfigError('Cannot save a non-finite number.');
    return v as Json;
  }
  if (Array.isArray(v)) return v.map(canonical);
  const out: Record<string, Json> = {};
  for (const k of Object.keys(v).sort(keyOrder)) {
    const x = (v as Record<string, unknown>)[k];
    if (x !== undefined) out[k] = canonical(x);
  }
  return out;
}

/** Assets the document uses, in hash order. */
function keptAssets(figure: Figure): Assets {
  const out: Record<string, Asset> = {};
  for (const h of [...usedAssets(figure.doc)].sort()) {
    const a = figure.assets[h];
    if (a) out[h] = a;
  }
  return out;
}

export function writeJfig(figure: Figure, app: { name: string; version: string }): string {
  const file = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    app,
    document: figure.doc,
    assets: keptAssets(figure),
  };
  return `${JSON.stringify(canonical(file), null, 1)}\n`;
}

// --- reading ------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

function hexStr(v: unknown, p: Path): string {
  const s = str(v, p);
  if (!HEX.test(s)) p.fail('expected a colour like #1a2b3c');
  return s.toLowerCase();
}

function vec(v: unknown, p: Path): Vec2 {
  const o = obj(v, p);
  return { x: num(o['x'], p.key('x')), y: num(o['y'], p.key('y')) };
}

export function paint(v: unknown, p: Path): Paint {
  const o = obj(v, p);
  if (o['hex'] !== undefined) return { hex: hexStr(o['hex'], p.key('hex')) };
  if (o['swatch'] !== undefined) return { swatch: str(o['swatch'], p.key('swatch')) };
  return p.fail('expected a colour ({hex} or {swatch})');
}

const paintOrNull = (v: unknown, p: Path): Paint | null => (v === null ? null : paint(v, p));

function frameOf(v: unknown, p: Path): Frame {
  const o = obj(v, p);
  return {
    x: num(o['x'], p.key('x')),
    y: num(o['y'], p.key('y')),
    w: nonNeg(o['w'], p.key('w')),
    h: nonNeg(o['h'], p.key('h')),
    rotation: num(o['rotation'], p.key('rotation')),
    ...flag(o, 'flipX', p),
    ...flag(o, 'flipY', p),
  };
}

function style(v: unknown, p: Path): ShapeStyle {
  const o = obj(v, p);
  return {
    fill: paintOrNull(o['fill'], p.key('fill')),
    stroke: paintOrNull(o['stroke'], p.key('stroke')),
    strokeWidth: nonNeg(o['strokeWidth'], p.key('strokeWidth')),
    ...opt(o, 'dash', p, (x, q) => list(x, q, nonNeg)),
    cap: oneOf(o['cap'], p.key('cap'), ['butt', 'round', 'square'] as const),
    join: oneOf(o['join'], p.key('join'), ['miter', 'round', 'bevel'] as const),
  };
}

function node(v: unknown, p: Path): PathNode {
  const o = obj(v, p);
  return {
    x: num(o['x'], p.key('x')),
    y: num(o['y'], p.key('y')),
    ...opt(o, 'in', p, vec),
    ...opt(o, 'out', p, vec),
  };
}

function head(v: unknown, p: Path): Head {
  const o = obj(v, p);
  return {
    kind: oneOf(o['kind'], p.key('kind'), HEAD_KINDS),
    size: nonNeg(o['size'], p.key('size')),
  };
}

function run(v: unknown, p: Path): Run {
  const o = obj(v, p);
  return {
    text: str(o['text'], p.key('text')),
    font: oneOf(o['font'], p.key('font'), FONT_IDS),
    size: nonNeg(o['size'], p.key('size')),
    ...flag(o, 'bold', p),
    ...flag(o, 'italic', p),
    ...opt(o, 'script', p, (x, q) => oneOf(x, q, ['sub', 'sup'] as const)),
    color: paint(o['color'], p.key('color')),
  };
}

function slotMap(v: unknown, p: Path): Record<string, Paint> {
  const o = obj(v, p);
  const out: Record<string, Paint> = {};
  for (const [k, x] of Object.entries(o)) out[k] = paint(x, p.key(k));
  return out;
}

const OBJ_TYPES = [
  'rect',
  'ellipse',
  'path',
  'arrow',
  'text',
  'icon',
  'image',
  'procedural',
  'group',
  'panel',
  'embedded',
] as const;

export function object(v: unknown, p: Path): Obj {
  const o = obj(v, p);
  const type = oneOf(o['type'], p.key('type'), OBJ_TYPES);
  const base = {
    id: asId(str(o['id'], p.key('id'))),
    ...opt(o, 'name', p, str),
    frame: frameOf(o['frame'], p.key('frame')),
    opacity: num(o['opacity'], p.key('opacity')),
    ...flag(o, 'locked', p),
    ...flag(o, 'hidden', p),
  };
  if (base.opacity < 0 || base.opacity > 1) p.key('opacity').fail('expected 0 to 1');
  switch (type) {
    case 'rect':
      return {
        ...base,
        type,
        rx: nonNeg(o['rx'], p.key('rx')),
        style: style(o['style'], p.key('style')),
      };
    case 'ellipse':
      return { ...base, type, style: style(o['style'], p.key('style')) };
    case 'path':
      return {
        ...base,
        type,
        nodes: list(o['nodes'], p.key('nodes'), node),
        closed: bool(o['closed'], p.key('closed')),
        style: style(o['style'], p.key('style')),
      };
    case 'arrow':
      return {
        ...base,
        type,
        nodes: list(o['nodes'], p.key('nodes'), node),
        start: head(o['start'], p.key('start')),
        end: head(o['end'], p.key('end')),
        style: style(o['style'], p.key('style')),
        ...opt(o, 'bind', p, (x, q) => {
          const b = obj(x, q);
          return {
            ...opt(b, 'start', q, (y, r) => asId(str(y, r))),
            ...opt(b, 'end', q, (y, r) => asId(str(y, r))),
          };
        }),
      };
    case 'text':
      return {
        ...base,
        type,
        runs: list(o['runs'], p.key('runs'), (x, q) => list(x, q, run)),
        align: oneOf(o['align'], p.key('align'), ['left', 'center', 'right'] as const),
        lineHeight: nonNeg(o['lineHeight'], p.key('lineHeight')),
        autoWidth: bool(o['autoWidth'], p.key('autoWidth')),
        ...opt(o, 'styleRef', p, (x, q) => asId(str(x, q))),
      };
    case 'icon':
      return {
        ...base,
        type,
        asset: str(o['asset'], p.key('asset')),
        slots: slotMap(o['slots'], p.key('slots')),
        lockAspect: true,
      };
    case 'image':
      return {
        ...base,
        type,
        asset: str(o['asset'], p.key('asset')),
        ...opt(o, 'crop', p, (x, q) => {
          const c = obj(x, q);
          return {
            x: num(c['x'], q.key('x')),
            y: num(c['y'], q.key('y')),
            w: nonNeg(c['w'], q.key('w')),
            h: nonNeg(c['h'], q.key('h')),
          };
        }),
      };
    case 'procedural':
      return {
        ...base,
        type,
        kind: str(o['kind'], p.key('kind')),
        kindVersion: int(o['kindVersion'], p.key('kindVersion')),
        params: o['params'] ?? null,
        ...opt(o, 'path', p, (x, q) => list(x, q, node)),
        slots: slotMap(o['slots'], p.key('slots')),
        ...opt(o, 'snapshot', p, str),
      };
    case 'group':
      return { ...base, type, children: list(o['children'], p.key('children'), object) };
    case 'panel':
      return {
        ...base,
        type,
        label: str(o['label'], p.key('label')),
        autoLabel: bool(o['autoLabel'], p.key('autoLabel')),
        showLabel: bool(o['showLabel'], p.key('showLabel')),
        showBorder: bool(o['showBorder'], p.key('showBorder')),
        children: list(o['children'], p.key('children'), object),
      };
    case 'embedded': {
      const s = obj(o['source'], p.key('source'));
      return {
        ...base,
        type,
        source: {
          app: str(s['app'], p.key('source').key('app')),
          format: str(s['format'], p.key('source').key('format')),
          payload: s['payload'] ?? null,
        },
        snapshot: str(o['snapshot'], p.key('snapshot')),
      };
    }
  }
}

function layer(v: unknown, p: Path): Layer {
  const o = obj(v, p);
  return {
    id: asId(str(o['id'], p.key('id'))),
    name: str(o['name'], p.key('name')),
    visible: bool(o['visible'], p.key('visible')),
    locked: bool(o['locked'], p.key('locked')),
    children: list(o['children'], p.key('children'), object),
  };
}

function page(v: unknown, p: Path): Page {
  const o = obj(v, p);
  const s = obj(o['size'], p.key('size'));
  const sp = p.key('size');
  return {
    id: asId(str(o['id'], p.key('id'))),
    name: str(o['name'], p.key('name')),
    size: {
      w: nonNeg(s['w'], sp.key('w')),
      h: nonNeg(s['h'], sp.key('h')),
      ...opt(s, 'preset', sp, str),
    },
    background: paintOrNull(o['background'], p.key('background')),
    layers: list(o['layers'], p.key('layers'), layer),
  };
}

function swatch(v: unknown, p: Path): Swatch {
  const o = obj(v, p);
  return {
    id: str(o['id'], p.key('id')),
    name: str(o['name'], p.key('name')),
    hex: hexStr(o['hex'], p.key('hex')),
  };
}

function textStyle(v: unknown, p: Path): TextStyle {
  const o = obj(v, p);
  return {
    id: asId(str(o['id'], p.key('id'))),
    name: str(o['name'], p.key('name')),
    font: oneOf(o['font'], p.key('font'), FONT_IDS),
    size: nonNeg(o['size'], p.key('size')),
    ...flag(o, 'bold', p),
    ...flag(o, 'italic', p),
    color: paint(o['color'], p.key('color')),
  };
}

function labelStyle(v: unknown, p: Path): PanelLabelStyle {
  const o = obj(v, p);
  return {
    format: oneOf(o['format'], p.key('format'), ['A', 'a', '(a)', '(A)', 'a)'] as const),
    font: oneOf(o['font'], p.key('font'), FONT_IDS),
    size: nonNeg(o['size'], p.key('size')),
    bold: bool(o['bold'], p.key('bold')),
    offset: vec(o['offset'], p.key('offset')),
  };
}

export function docOf(v: unknown, p: Path): Doc {
  const o = obj(v, p);
  const pages = list(o['pages'], p.key('pages'), page);
  if (pages.length === 0) p.key('pages').fail('a figure needs at least one page');
  return {
    id: asId(str(o['id'], p.key('id'))),
    title: str(o['title'], p.key('title')),
    palette: list(o['palette'], p.key('palette'), swatch),
    textStyles: list(o['textStyles'], p.key('textStyles'), textStyle),
    panelLabelStyle: labelStyle(o['panelLabelStyle'], p.key('panelLabelStyle')),
    pages,
    creditFooter: bool(o['creditFooter'], p.key('creditFooter')),
  };
}

function slotDef(v: unknown, p: Path): SlotDef {
  const o = obj(v, p);
  return {
    id: str(o['id'], p.key('id')),
    label: str(o['label'], p.key('label')),
    default: hexStr(o['default'], p.key('default')),
  };
}

export function iconMeta(v: unknown, p: Path): IconMeta {
  const o = obj(v, p);
  return {
    library: str(o['library'], p.key('library')),
    libraryVersion: str(o['libraryVersion'], p.key('libraryVersion')),
    id: str(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    source: str(o['source'], p.key('source')),
    ...opt(o, 'author', p, str),
    license: str(o['license'], p.key('license')),
    licenseUrl: str(o['licenseUrl'], p.key('licenseUrl')),
    originalUrl: str(o['originalUrl'], p.key('originalUrl')),
    shareAlike: bool(o['shareAlike'], p.key('shareAlike')),
  };
}

function userMeta(v: unknown, p: Path): UserAssetMeta {
  const o = obj(v, p);
  return {
    name: str(o['name'], p.key('name')),
    ...opt(o, 'credit', p, str),
    width: nonNeg(o['width'], p.key('width')),
    height: nonNeg(o['height'], p.key('height')),
  };
}

export function asset(v: unknown, p: Path): Asset {
  const o = obj(v, p);
  const kind = oneOf(o['kind'], p.key('kind'), ['icon', 'image', 'svgImport'] as const);
  switch (kind) {
    case 'icon':
      return {
        kind,
        svg: str(o['svg'], p.key('svg')),
        slots: list(o['slots'], p.key('slots'), slotDef),
        recolor: oneOf(o['recolor'], p.key('recolor'), ['slots', 'whole'] as const),
        meta: iconMeta(o['meta'], p.key('meta')),
      };
    case 'image':
      return {
        kind,
        mime: oneOf(o['mime'], p.key('mime'), ['image/png', 'image/jpeg'] as const),
        dataBase64: str(o['dataBase64'], p.key('dataBase64')),
        meta: userMeta(o['meta'], p.key('meta')),
      };
    case 'svgImport':
      return { kind, svg: str(o['svg'], p.key('svg')), meta: userMeta(o['meta'], p.key('meta')) };
  }
}

export function assetsOf(v: unknown, p: Path): Record<string, Asset> {
  const o = obj(v, p);
  const out: Record<string, Asset> = {};
  for (const [k, x] of Object.entries(o)) out[k] = asset(x, p.key(k));
  return out;
}

/** Runs a document through the migration chain up to the current schema. */
export function migrate(
  doc: JsonObject,
  migrations: readonly Migration[] = MIGRATIONS,
): JsonObject {
  const current = migrations.length + 1;
  const v = doc['schemaVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new JfigError('This file is damaged: it has no valid schema version.');
  }
  if (v > current) {
    throw new JfigError(
      `This figure was saved by a newer version of the app (file format ${String(v)}; ` +
        `this version opens up to ${String(current)}). Reload the page to update the app, then open it again.`,
    );
  }
  let out = doc;
  for (let i = v - 1; i < migrations.length; i += 1) {
    const step = migrations[i];
    if (step) out = { ...step(out), schemaVersion: i + 2 };
  }
  return out;
}

function parse(text: string): JsonObject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new JfigError('This is not a figure file (it is not valid JSON).');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new JfigError('This is not a figure file.');
  }
  return raw as JsonObject;
}

export function readJfig(text: string): SavedFigure {
  const raw = parse(text);
  if (raw['format'] !== FORMAT) throw new JfigError('This is not a figure file.');
  const file = migrate(raw);
  const root = new Path(['file']);
  try {
    const a = obj(file['app'], root.key('app'));
    const doc = docOf(file['document'], root.key('document'));
    const assets = assetsOf(file['assets'], root.key('assets'));
    for (const h of usedAssets(doc)) {
      if (!(h in assets)) root.key('assets').fail(`missing asset ${h}`);
    }
    return {
      app: {
        name: str(a['name'], root.key('app').key('name')),
        version: str(a['version'], root.key('app').key('version')),
      },
      doc,
      assets,
    };
  } catch (e: unknown) {
    if (e instanceof DecodeError) throw new JfigError(`This file is damaged (${e.message}).`);
    throw e;
  }
}

// --- fragments (clipboard and sibling interchange) -------------------------------

export interface Fragment {
  readonly objects: readonly Obj[];
  readonly assets: Assets;
}

export function writeFragment(f: Fragment): string {
  return JSON.stringify(
    canonical({
      format: FRAGMENT_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      objects: f.objects,
      assets: f.assets,
    }),
  );
}

/** A fragment from clipboard text, or null when the text is not one. Throws JfigError when it is one but damaged. */
export function readFragment(text: string): Fragment | null {
  let raw: JsonObject;
  try {
    raw = parse(text);
  } catch {
    return null;
  }
  if (raw['format'] !== FRAGMENT_FORMAT) return null;
  const v = migrate(raw);
  const root = new Path(['fragment']);
  try {
    return {
      objects: list(v['objects'], root.key('objects'), object),
      assets: assetsOf(v['assets'], root.key('assets')),
    };
  } catch (e: unknown) {
    if (e instanceof DecodeError)
      throw new JfigError(`The pasted objects are damaged (${e.message}).`);
    throw e;
  }
}
