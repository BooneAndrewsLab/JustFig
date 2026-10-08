/**
 * The procedural kind registry (note 04). An object whose kind is unknown
 * here, or newer than ours, is not drawn by a kind: it shows its cached
 * snapshot and is kept untouched (never dropped).
 */
import { resolvePaint } from '@/core/color/color';
import type { Procedural, Swatch } from '@/core/model/types';

import { KINDS } from './kinds';
import { decodeParams } from './params';
import type { Prim } from './prims';
import type { Params, ProceduralKind } from './types';

const byKind = new Map<string, ProceduralKind>(KINDS.map((k) => [k.kind, k]));

export const getKind = (kind: string): ProceduralKind | undefined => byKind.get(kind);
export const allKinds = (): readonly ProceduralKind[] => KINDS;

export interface Resolved {
  readonly kind: ProceduralKind;
  readonly params: Params;
}

const decoded = new WeakMap<object, { kindVersion: number; kind: string; r: Resolved }>();

/** The object's kind and decoded (migrated, validated) params, or null when unknown here. */
export function resolveProcedural(
  o: Pick<Procedural, 'kind' | 'kindVersion' | 'params'>,
): Resolved | null {
  const kind = byKind.get(o.kind);
  if (!kind || o.kindVersion > kind.version || o.kindVersion < 1) return null;
  const key = typeof o.params === 'object' && o.params !== null ? o.params : null;
  const hit = key ? decoded.get(key) : undefined;
  if (hit?.kind === o.kind && hit.kindVersion === o.kindVersion) return hit.r;
  const raw =
    o.kindVersion < kind.version && kind.migrate ? kind.migrate(o.params, o.kindVersion) : o.params;
  const p = decodeParams(kind.fields, raw);
  const r = { kind, params: kind.fix ? kind.fix(p) : p };
  if (key) decoded.set(key, { kind: o.kind, kindVersion: o.kindVersion, r });
  return r;
}

/** Slot colours in effect: the object's overrides over the kind's defaults. */
export function slotHexes(
  kind: ProceduralKind,
  overrides: Procedural['slots'],
  palette: readonly Swatch[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of kind.slots) {
    const o = overrides[s.id];
    out[s.id] = o ? resolvePaint(o, palette) : s.default;
  }
  return out;
}

interface Cached {
  readonly path: Procedural['path'];
  readonly w: number;
  readonly h: number;
  readonly slots: string;
  readonly prims: readonly Prim[];
}

const rendered = new WeakMap<object, Cached>();

/**
 * The object's primitives, frame-local. Cached on the params, path and
 * size, so moving or rotating an object never regenerates it.
 */
export function proceduralPrims(o: Procedural, palette: readonly Swatch[]): readonly Prim[] | null {
  const r = resolveProcedural(o);
  if (!r) return null;
  const slots = slotHexes(r.kind, o.slots, palette);
  const slotKey = Object.values(slots).join();
  const key = typeof o.params === 'object' && o.params !== null ? o.params : o;
  const hit = rendered.get(key);
  if (
    hit !== undefined &&
    hit.path === o.path &&
    hit.w === o.frame.w &&
    hit.h === o.frame.h &&
    hit.slots === slotKey
  )
    return hit.prims;
  const prims = r.kind.render(r.params, {
    w: o.frame.w,
    h: o.frame.h,
    ...(o.path ? { path: o.path } : {}),
    slots,
  });
  rendered.set(key, { path: o.path, w: o.frame.w, h: o.frame.h, slots: slotKey, prims });
  return prims;
}
