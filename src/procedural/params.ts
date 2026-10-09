/**
 * The generic params decoder (note 04): any JSON in, params that satisfy
 * the kind's fields out. Wrong types fall back to the field's default,
 * numbers are clamped, lists are capped, colours normalised. It never
 * throws, so a damaged or hand-written fragment still draws.
 */
import type { Field, Item, ParamValue, Params, ScalarField, WellMap } from './types';

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const WELL = /^[A-Z]{1,2}[1-9]\d{0,1}$/;
/** More than any plate has; a bound on what a pasted map can hold. */
const MAX_WELLS = 1536;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s))
    return `#${s
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase();
  return null;
}

export function decodeScalar(f: ScalarField, v: unknown): ParamValue {
  switch (f.type) {
    case 'number':
    case 'int': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return f.default;
      const r = f.type === 'int' ? Math.round(n) : n;
      return Math.min(f.max, Math.max(f.min, r));
    }
    case 'enum': {
      const hit = f.options.find((o) => o.value === v || String(o.value) === String(v));
      return hit ? hit.value : f.default;
    }
    case 'bool':
      return typeof v === 'boolean' ? v : f.default;
    case 'text':
      if (typeof v === 'number' && Number.isFinite(v)) return String(v).slice(0, f.maxLength);
      return typeof v === 'string' ? v.slice(0, f.maxLength) : f.default;
    case 'color': {
      if (f.auto === true && v === '') return '';
      return normHex(v) ?? f.default;
    }
  }
}

function decodeItem(fields: readonly ScalarField[], v: unknown): Item {
  const o = isRecord(v) ? v : {};
  const out: Record<string, ParamValue> = {};
  for (const f of fields) out[f.key] = decodeScalar(f, o[f.key]);
  return out as Item;
}

function decodeWellMap(v: unknown): WellMap {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const k of Object.keys(v).sort()) {
    const hex = normHex(v[k]);
    if (!hex || !WELL.test(k)) continue;
    out[k] = hex;
    n += 1;
    if (n >= MAX_WELLS) break;
  }
  return out;
}

function decodeField(f: Field, v: unknown): ParamValue {
  if (f.type === 'list') {
    const raw = Array.isArray(v) ? v : f.default;
    const items = raw.slice(0, f.max).map((x) => decodeItem(f.item, x));
    for (let i = 0; items.length < f.min; i += 1)
      items.push(decodeItem(f.item, f.default[i % Math.max(1, f.default.length)]));
    return items;
  }
  if (f.type === 'wellMap') return decodeWellMap(v);
  return decodeScalar(f, v);
}

/** Params from any JSON, in field order. */
export function decodeParams(fields: readonly Field[], raw: unknown): Params {
  const o = isRecord(raw) ? raw : {};
  const out: Record<string, ParamValue> = {};
  for (const f of fields) out[f.key] = decodeField(f, o[f.key]);
  return out;
}

export const defaultParams = (fields: readonly Field[]): Params => decodeParams(fields, {});

/** Visible fields for these params. */
export const visibleFields = (fields: readonly Field[], p: Params): Field[] =>
  fields.filter((f) => f.showIf === undefined || f.showIf(p));

/** Shown to two decimals, or as many as the field's step has (a pixel size of 0.0645 µm). */
export function roundTo(v: number, step: number | undefined): number {
  const decimals = Math.max(2, (String(step ?? 1).split('.')[1] ?? '').length);
  const k = 10 ** Math.min(decimals, 8);
  return Math.round(v * k) / k;
}
