/**
 * The document model (note 02). Everything is immutable plain data; every
 * change goes through a named edit (`core/edits`). Units are points.
 */
import type { Id } from './ids';

export type AssetHash = string;
export type SlotId = string;
export type SwatchId = string;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type Paint = { readonly hex: string } | { readonly swatch: SwatchId };

export interface Swatch {
  readonly id: SwatchId;
  readonly name: string;
  readonly hex: string;
}

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface ShapeStyle {
  readonly fill: Paint | null;
  readonly stroke: Paint | null;
  readonly strokeWidth: number;
  readonly dash?: readonly number[];
  readonly cap: LineCap;
  readonly join: LineJoin;
}

/** Top-left of the unrotated box; flipped about, then rotated about, its centre. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Degrees, clockwise on screen, about the frame centre. */
  readonly rotation: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface Base {
  readonly id: Id;
  readonly name?: string;
  readonly frame: Frame;
  readonly opacity: number;
  readonly locked?: boolean;
  readonly hidden?: boolean;
}

/** A path vertex with optional cubic handles, frame-local; no handle = corner. */
export interface PathNode {
  readonly x: number;
  readonly y: number;
  readonly in?: Vec2;
  readonly out?: Vec2;
}

export const HEAD_KINDS = [
  'none',
  'triangle',
  'open',
  'stealth',
  'bar',
  'circle',
  'diamond',
] as const;
export type HeadKind = (typeof HEAD_KINDS)[number];

export interface Head {
  readonly kind: HeadKind;
  /** Head length as a multiple of the stroke width. */
  readonly size: number;
}

export const FONT_IDS = ['arimo', 'tinos', 'cousine'] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface Run {
  readonly text: string;
  readonly font: FontId;
  /** Points. */
  readonly size: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly script?: 'sub' | 'sup';
  readonly color: Paint;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface Rect extends Base {
  readonly type: 'rect';
  readonly rx: number;
  readonly style: ShapeStyle;
}

export interface Ellipse extends Base {
  readonly type: 'ellipse';
  readonly style: ShapeStyle;
}

export interface PathObj extends Base {
  readonly type: 'path';
  readonly nodes: readonly PathNode[];
  readonly closed: boolean;
  readonly style: ShapeStyle;
}

export interface Arrow extends Base {
  readonly type: 'arrow';
  readonly nodes: readonly PathNode[];
  readonly start: Head;
  readonly end: Head;
  readonly style: ShapeStyle;
  /** Binding to objects: Phase 4; kept losslessly now. */
  readonly bind?: { readonly start?: Id; readonly end?: Id };
}

export interface Text extends Base {
  readonly type: 'text';
  /** Paragraphs of runs. */
  readonly runs: readonly (readonly Run[])[];
  readonly align: TextAlign;
  /** Line height as a multiple of the largest run size on the line. */
  readonly lineHeight: number;
  readonly autoWidth: boolean;
  readonly styleRef?: Id;
}

export interface Icon extends Base {
  readonly type: 'icon';
  readonly asset: AssetHash;
  /** Overrides only; defaults come from the asset's SlotDefs. */
  readonly slots: Readonly<Record<SlotId, Paint>>;
  readonly lockAspect: true;
}

export interface Rect4 {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Image extends Base {
  readonly type: 'image';
  /** The whole picture, kept so a crop can be changed or undone (note 20). */
  readonly asset: AssetHash;
  /** What is shown, in pixels of `asset` (its `meta` size); none = all of it. */
  readonly crop?: Rect4;
  /**
   * The pixels of `crop`, re-encoded as their own image asset (note 20): the
   * export subset has no clipping, so this is what is drawn when `crop` is set.
   */
  readonly cropped?: AssetHash;
}

export interface Procedural extends Base {
  readonly type: 'procedural';
  readonly kind: string;
  readonly kindVersion: number;
  readonly params: unknown;
  readonly path?: readonly PathNode[];
  readonly slots: Readonly<Record<SlotId, Paint>>;
  /** An `svgImport` asset drawn when the kind is unknown to this version. */
  readonly snapshot?: AssetHash;
}

export interface Group extends Base {
  readonly type: 'group';
  /** In page coordinates; the group's frame is their bounds, rotation 0. */
  readonly children: readonly Obj[];
}

export interface Panel extends Base {
  readonly type: 'panel';
  readonly label: string;
  readonly autoLabel: boolean;
  readonly showLabel: boolean;
  readonly showBorder: boolean;
  /** In page coordinates. */
  readonly children: readonly Obj[];
}

export interface Embedded extends Base {
  readonly type: 'embedded';
  readonly source: { readonly app: string; readonly format: string; readonly payload: unknown };
  readonly snapshot: AssetHash;
}

export type Obj =
  Rect | Ellipse | PathObj | Arrow | Text | Icon | Image | Procedural | Group | Panel | Embedded;

export type ObjType = Obj['type'];

export type Container = Group | Panel;

export interface Layer {
  readonly id: Id;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  /** Bottom to top. */
  readonly children: readonly Obj[];
}

export interface PageSize {
  readonly w: number;
  readonly h: number;
  readonly preset?: string;
}

export interface Page {
  readonly id: Id;
  readonly name: string;
  readonly size: PageSize;
  readonly background: Paint | null;
  readonly layers: readonly Layer[];
}

export interface TextStyle {
  readonly id: Id;
  readonly name: string;
  readonly font: FontId;
  readonly size: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color: Paint;
}

export type PanelLabelFormat = 'A' | 'a' | '(a)' | '(A)' | 'a)';

export interface PanelLabelStyle {
  readonly format: PanelLabelFormat;
  readonly font: FontId;
  readonly size: number;
  readonly bold: boolean;
  /** Offset of the label's top-left from the panel's top-left, points. */
  readonly offset: Vec2;
}

export interface Doc {
  readonly id: Id;
  readonly title: string;
  readonly palette: readonly Swatch[];
  readonly textStyles: readonly TextStyle[];
  readonly panelLabelStyle: PanelLabelStyle;
  readonly pages: readonly Page[];
  /** Whether exports carry the credit-line footer; default on (note 03). */
  readonly creditFooter: boolean;
}

export interface SlotDef {
  readonly id: SlotId;
  readonly label: string;
  /** Hex colour. */
  readonly default: string;
}

export interface IconMeta {
  readonly library: string;
  readonly libraryVersion: string;
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly author?: string;
  /** SPDX id. */
  readonly license: string;
  readonly licenseUrl: string;
  readonly originalUrl: string;
  readonly shareAlike: boolean;
}

export interface UserAssetMeta {
  /** The file name it was imported from. */
  readonly name: string;
  /** Credit the user wants shown in the attribution line, if any. */
  readonly credit?: string;
  /** Intrinsic size in pixels (images) or points (SVG). */
  readonly width: number;
  readonly height: number;
}

export type Asset =
  | {
      readonly kind: 'icon';
      readonly svg: string;
      readonly slots: readonly SlotDef[];
      readonly recolor: 'slots' | 'whole';
      readonly meta: IconMeta;
    }
  | {
      readonly kind: 'image';
      readonly mime: string;
      readonly dataBase64: string;
      readonly meta: UserAssetMeta;
    }
  | { readonly kind: 'svgImport'; readonly svg: string; readonly meta: UserAssetMeta };

export type Assets = Readonly<Record<AssetHash, Asset>>;

/** What the editor holds: the document and the assets it uses. */
export interface Figure {
  readonly doc: Doc;
  readonly assets: Assets;
}
