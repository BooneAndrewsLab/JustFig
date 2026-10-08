/**
 * Small hand-written JSON decoders (as BarelySig's bsig.ts): each takes a
 * value and the path it was read from, and throws a `DecodeError` naming
 * that path, so a damaged file says where it is damaged.
 */

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };
export type JsonObject = Readonly<Record<string, Json>>;

export class DecodeError extends Error {
  override readonly name = 'DecodeError';
}

export class Path {
  constructor(private readonly parts: readonly string[] = []) {}
  key(k: string): Path {
    return new Path([...this.parts, k]);
  }
  index(i: number): Path {
    return new Path([...this.parts, `[${String(i)}]`]);
  }
  toString(): string {
    return this.parts.join('.').replace(/\.\[/g, '[');
  }
  fail(what: string): never {
    throw new DecodeError(`${this.toString()}: ${what}`);
  }
}

export function obj(v: unknown, p: Path): JsonObject {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) p.fail('expected an object');
  return v as JsonObject;
}

export function arr(v: unknown, p: Path): readonly Json[] {
  if (!Array.isArray(v)) p.fail('expected a list');
  return v as readonly Json[];
}

export function list<T>(v: unknown, p: Path, each: (x: Json, p: Path) => T): T[] {
  return arr(v, p).map((x, i) => each(x, p.index(i)));
}

export function str(v: unknown, p: Path): string {
  if (typeof v !== 'string') p.fail('expected text');
  return v;
}

export function num(v: unknown, p: Path): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) p.fail('expected a finite number');
  return v;
}

export function nonNeg(v: unknown, p: Path): number {
  const n = num(v, p);
  if (n < 0) p.fail('expected a number ≥ 0');
  return n;
}

export function int(v: unknown, p: Path): number {
  const n = num(v, p);
  if (!Number.isInteger(n)) p.fail('expected a whole number');
  return n;
}

export function bool(v: unknown, p: Path): boolean {
  if (typeof v !== 'boolean') p.fail('expected true or false');
  return v;
}

export function oneOf<T extends string>(v: unknown, p: Path, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v))
    p.fail(`expected one of ${allowed.join(', ')}`);
  return v as T;
}

/** `{ [key]: decoded }` when present, `{}` when absent, for exactOptionalPropertyTypes. */
export function opt<K extends string, T>(
  o: JsonObject,
  key: K,
  p: Path,
  decode: (v: Json, p: Path) => T,
): Partial<Record<K, T>> {
  const v = o[key];
  return v === undefined ? {} : ({ [key]: decode(v, p.key(key)) } as Record<K, T>);
}

/** An optional boolean kept only when true, so files stay small and round trips stable. */
export function flag<K extends string>(o: JsonObject, key: K, p: Path): Partial<Record<K, true>> {
  const v = o[key];
  if (v === undefined) return {};
  return bool(v, p.key(key)) ? ({ [key]: true } as Record<K, true>) : {};
}
