/**
 * Procedural objects (note 04): a kind is a pure function from declarative
 * params to drawing primitives. The Inspector is generated from the
 * kind's fields, so a kind has no UI code of its own.
 */
import type { PathNode, SlotDef } from '@/core/model/types';

import type { Prim } from './prims';

export type Scalar = number | string | boolean;
export type Item = Readonly<Record<string, Scalar>>;
/** Well id (`A1`, `AF48`) → `#rrggbb`. */
export type WellMap = Readonly<Record<string, string>>;
export type ParamValue = Scalar | readonly Item[] | WellMap;
export type Params = Readonly<Record<string, ParamValue>>;

interface FieldBase {
  readonly key: string;
  readonly label: string;
  /** One line shown under the control. */
  readonly help?: string;
  /** Hide the control (the value is kept) unless this holds. */
  readonly showIf?: (p: Params) => boolean;
}

export interface NumberField extends FieldBase {
  readonly type: 'number' | 'int';
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly default: number;
}

export interface EnumField extends FieldBase {
  readonly type: 'enum';
  readonly options: readonly { readonly value: string | number; readonly label: string }[];
  readonly default: string | number;
}

export interface BoolField extends FieldBase {
  readonly type: 'bool';
  readonly default: boolean;
}

export interface TextField extends FieldBase {
  readonly type: 'text';
  readonly maxLength: number;
  readonly default: string;
  readonly placeholder?: string;
}

/** A free colour (not a slot): `#rrggbb`, or `''` meaning automatic when `auto` is set. */
export interface ColorField extends FieldBase {
  readonly type: 'color';
  readonly default: string;
  readonly auto?: boolean;
}

export type ScalarField = NumberField | EnumField | BoolField | TextField | ColorField;

/** A list of records (gel lanes, plasmid features, protein domains). */
export interface ListField extends FieldBase {
  readonly type: 'list';
  readonly item: readonly ScalarField[];
  readonly min: number;
  readonly max: number;
  readonly default: readonly Item[];
  /** The row title in the Inspector. */
  readonly itemTitle: (it: Item, index: number) => string;
  /** A new row, appended by "Add". */
  readonly newItem: (p: Params, items: readonly Item[]) => Item;
}

/** Colours per well of a plate; `rows`/`cols` come from the params. */
export interface WellMapField extends FieldBase {
  readonly type: 'wellMap';
  readonly grid: (p: Params) => { readonly rows: number; readonly cols: number };
}

export type Field = ScalarField | ListField | WellMapField;

export interface RenderInput {
  /** Frame size, points; the kind draws in 0..w × 0..h. */
  readonly w: number;
  readonly h: number;
  /** Frame-local path, for path-following kinds. */
  readonly path?: readonly PathNode[];
  /** Resolved slot colours (overrides over defaults), `#rrggbb`. */
  readonly slots: Readonly<Record<string, string>>;
}

export interface ProceduralKind<P = Params> {
  readonly kind: string;
  readonly version: number;
  readonly title: string;
  readonly category: string;
  /** One sentence for the Objects panel. */
  readonly description: string;
  /**
   * Extra words an icon search finds this kind by, besides its title (note 04): what a
   * biologist would type looking for it, e.g. "microplate" or "electrophoresis".
   */
  readonly keywords: readonly string[];
  readonly fields: readonly Field[];
  readonly slots: readonly SlotDef[];
  /** Path-following kinds draw along `obj.path`. */
  readonly usesPath?: 'open' | 'closed';
  readonly defaultSize: { readonly w: number; readonly h: number };
  /** Path-following kinds: the path a new object gets, frame-local in a w × h frame. */
  readonly defaultPath?: (w: number, h: number, closed: boolean) => PathNode[];
  /** Cross-field fixes after the generic decode (e.g. feature ends within the length). */
  readonly fix?: (p: P) => P;
  /** Old `kindVersion` params → this version's (raw JSON in, raw JSON out). */
  readonly migrate?: (raw: unknown, from: number) => unknown;
  /** How far the drawing may reach past the frame (or path), points. */
  readonly overhang?: (p: P) => number;
  /**
   * PURE: messages the Inspector shows under the fields (a Newick string that does not parse).
   * The render still draws something; nothing here throws.
   */
  readonly problems?: (p: P) => readonly string[];
  /** PURE: params → primitives in frame-local points. */
  readonly render: (p: P, input: RenderInput) => readonly Prim[];
}

/** Kinds are written against their own params type; the registry holds them generically. */
export const defineKind = <P>(k: ProceduralKind<P>): ProceduralKind =>
  k as unknown as ProceduralKind;
