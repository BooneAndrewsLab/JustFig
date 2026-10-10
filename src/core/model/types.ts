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
  /** This text is a numbered step badge on another object (note 48). */
  readonly step?: StepLink;
}

export const STEP_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
/** The corner of the target's bounds a step badge's centre sits at (plus its offset). */
export type StepAnchor = (typeof STEP_ANCHORS)[number];

export const STEP_VARIANTS = ['circle', 'plain'] as const;
export type StepVariant = (typeof STEP_VARIANTS)[number];

/**
 * What makes a text a step badge (note 48). The number is derived (reading
 * order of the targets in the badge's group or page) and, with the badge's
 * position and size, written into the text only by `reconcileBindings`.
 */
export interface StepLink {
  /** The object the badge is attached to; deleting it deletes the badge. */
  readonly target: Id;
  readonly anchor: StepAnchor;
  /** From the anchor corner to the badge's centre, points. */
  readonly offset: Vec2;
  /** A filled circle with a white number, or the number alone. */
  readonly variant: StepVariant;
  /** The circle's fill, or the plain number's colour. */
  readonly paint: Paint;
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

/**
 * One channel of a merged picture (note 21): a single-channel picture shown in
 * `color`, its display range `min`..`max` (0–255) stretched to full brightness.
 */
export interface Channel {
  /** The channel's own picture, as imported; its brightest of R, G, B is the intensity. */
  readonly asset: AssetHash;
  /** `#rrggbb`. */
  readonly color: string;
  /** Off: left out of the merge, kept for later. */
  readonly on: boolean;
  /** Intensity shown black (0–254). */
  readonly min: number;
  /** Intensity shown at full `color` (1–255, above `min`). */
  readonly max: number;
}

/**
 * Levels and invert for one picture (note 27): `min`..`max` (0–255) stretched
 * to the full range on every colour component, then optionally inverted.
 * `base` is the picture before this (the plain picture or the channel merge),
 * kept so levels can be changed or removed without compounding; `Image.asset`
 * is then the baked result.
 */
export interface Levels {
  /** Value shown black (0–254). */
  readonly min: number;
  /** Value shown full (1–255, above `min`). */
  readonly max: number;
  readonly invert: boolean;
  /** The picture the levels were applied to, unadjusted. */
  readonly base: AssetHash;
}

/**
 * What makes a picture a magnified inset of a region of another (note 44):
 * the region is its own `crop` (with `turn`) in pixels of the source's
 * `asset`; the outline box on the source and the connector lines are plain
 * objects named here, laid out only by `reconcileBindings` (note 06).
 */
export interface InsetLink {
  /** The picture the region is of. */
  readonly source: Id;
  /** The outline rectangle on the source; dragging it re-crops the inset. */
  readonly box: Id;
  /** The connector lines (open two-node paths), box corners to inset corners. */
  readonly lines: readonly Id[];
  /** `crop` changed since `cropped` was baked: the app re-bakes the pixels. */
  readonly stale?: boolean;
}

export interface Image extends Base {
  readonly type: 'image';
  /**
   * The whole picture, kept so a crop can be changed or undone (note 20).
   * With `channels`, the merge of them, baked (note 21).
   */
  readonly asset: AssetHash;
  /**
   * What is shown, in pixels of `asset` (its `meta` size), or of `asset`
   * turned by `turn`; none = all of it. A see-through picture's backdrop (an
   * `svgImport`) is cropped with its picture, in its `meta` units (note 20).
   */
  readonly crop?: Rect4;
  /**
   * Degrees (clockwise) the pixels of `asset` are turned, resampled, before
   * `crop` is taken (issue 48, note 20): a crop level on the page of a turned
   * picture. `crop` is then in pixels of the turned picture (its bounding box,
   * same pixel size). Only with `crop`; none = not turned.
   */
  readonly turn?: number;
  /**
   * The pixels of `crop`, re-encoded as their own image asset (note 20): the
   * export subset has no clipping, so this is what is drawn when `crop` is set.
   */
  readonly cropped?: AssetHash;
  /**
   * A pseudocoloured merge (note 21): the channels `asset` is baked from, kept
   * so a channel can be recoloured, re-ranged or turned off later.
   */
  readonly channels?: readonly Channel[];
  /**
   * Levels and invert over the whole picture (note 27): `asset` is `levels.base`
   * adjusted, baked. Applied after a merge and before a crop.
   */
  readonly levels?: Levels;
  /**
   * The pictures of one "Split channels" row (note 45), this one included: a crop or levels
   * change on one is offered to the rest. Ids that no longer exist are ignored.
   */
  readonly splitSet?: readonly Id[];
  /** A magnified inset of a region of another picture (note 44). */
  readonly inset?: InsetLink;
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

/** A reply under a review note (note 24). */
export interface NoteReply {
  readonly id: Id;
  /** Plain text, shown as text only. */
  readonly text: string;
  /** Who wrote it, as they typed their name; '' when they gave none. */
  readonly author: string;
  /** When it was written, ms since 1970. */
  readonly time: number;
}

/**
 * A review note (note 24): a comment on a page, kept in the file, never
 * drawn by the renderer and never exported.
 */
export interface Note extends NoteReply {
  readonly page: Id;
  /**
   * Where the marker is, page points. For a note on an object it follows the
   * object (`reconcileNotes`), so it stays put if the object is deleted.
   */
  readonly at: Vec2;
  /** The object it is pinned to, if any. */
  readonly object?: Id;
  readonly resolved?: boolean;
  readonly replies: readonly NoteReply[];
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
  /** Review notes (note 24), in the order they were added. */
  readonly notes: readonly Note[];
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
  /**
   * µm per pixel, when the file stated it (TIFF import, note 43): a scale bar
   * placed on the picture takes it. Baked pictures (levels, merge) carry it on.
   */
  readonly pixelSize?: number;
  /**
   * Marks a 16-bit greyscale PNG kept as the unadjusted source of a picture
   * (note 43): the brightest sample in it (1-65535), which the Levels sliders
   * span. The browser shows such a PNG as 8-bit, so it is never drawn; the
   * baked 8-bit picture is.
   */
  readonly peak?: number;
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
