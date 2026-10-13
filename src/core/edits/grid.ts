/**
 * Arrange in grid (issue 2, note 11): lays the selected objects out in
 * rows × columns, each in a cell that becomes a lettered panel. The layout
 * (`gridLayout`) is pure box arithmetic; the edit (`arrangeInGrid`) moves
 * and scales the objects with the same `resizeOne` step as every resize,
 * so paths and arrows bake the scale and icons and images transform.
 */
import { type Box, unionBoxes } from '../geometry/matrix';
import { objBounds, translateObj } from '../geometry/transform';
import { createPanel } from '../model/factory';
import type { Id } from '../model/ids';
import { ROW_TOLERANCE, inReadingOrder } from '../model/panels';
import type { Obj, Page, Panel, PanelLabelStyle } from '../model/types';
import { type Edit, EditError, resizeOne, withPage } from './edits';
import { type PlotSizing, keepPlotText } from './plotSize';

export type GridHAlign = 'left' | 'center' | 'right';
export type GridVAlign = 'top' | 'middle' | 'bottom';

export interface GridOptions {
  readonly rows: number;
  readonly cols: number;
  /** Space between cells, points. */
  readonly gutter: number;
  /** Where an object sits in its cell when it is smaller than the cell. */
  readonly hAlign: GridHAlign;
  readonly vAlign: GridVAlign;
  /** Scale each object to its column width so the grid spans the page width. */
  readonly fitWidth: boolean;
  /** Keep a band above each object for its panel letter. */
  readonly letterRoom: boolean;
}

export const GRID_DEFAULTS: Omit<GridOptions, 'rows' | 'cols'> = {
  gutter: 8.5, // 3 mm
  hAlign: 'center',
  vAlign: 'top',
  fitWidth: true,
  letterRoom: true,
};

/** A starting shape for n objects: one row up to three, then near square, wider than tall. */
export function gridShape(n: number): { rows: number; cols: number } {
  const count = Math.max(1, Math.floor(n));
  const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  return { rows: Math.ceil(count / cols), cols };
}

export interface GridItem {
  /** The object's bounds now. */
  readonly box: Box;
  /** Height kept free above the object in its cell (for the letter), points. */
  readonly room: number;
}

export interface GridPlace {
  /** The whole cell: the panel's frame. */
  readonly cell: Box;
  /** Where the object's bounds go. */
  readonly target: Box;
}

/**
 * Cells for items already in reading order, filled row by row. Without a
 * width, a column is as wide as its widest object and nothing scales; with
 * one, the columns share it equally and each object is scaled (keeping its
 * proportions) to its column width, and with a height too, no taller than
 * an equal share of it (so a tall narrow object shrinks and sits aligned in
 * its full-width cell). A row is as tall as its tallest object plus its room.
 */
export function gridLayout(
  items: readonly GridItem[],
  o: {
    readonly cols: number;
    readonly gutter: number;
    readonly hAlign: GridHAlign;
    readonly vAlign: GridVAlign;
    readonly origin: { readonly x: number; readonly y: number };
    readonly width?: number;
    /** With a width: the vertical space for the whole grid; no object is scaled taller than its share. */
    readonly height?: number;
  },
): GridPlace[] {
  const cols = Math.max(1, Math.floor(o.cols));
  const g = Math.max(0, o.gutter);
  const rows = Math.ceil(items.length / cols);
  const fitW = o.width === undefined ? undefined : Math.max(1, (o.width - (cols - 1) * g) / cols);
  const capH =
    fitW !== undefined && o.height !== undefined ? (o.height - (rows - 1) * g) / rows : undefined;
  const sizes = items.map(({ box, room }) => {
    let k = fitW !== undefined && box.w > 0 ? fitW / box.w : 1;
    if (capH !== undefined && box.h > 0) k = Math.min(k, Math.max(1, capH - room) / box.h);
    return { w: box.w * k, h: box.h * k };
  });
  const colW = Array.from(
    { length: cols },
    (_, c) => fitW ?? Math.max(0, ...sizes.filter((_, i) => i % cols === c).map((s) => s.w)),
  );
  const rowH = Array.from({ length: rows }, (_, r) =>
    Math.max(
      0,
      ...items.flatMap((it, i) => {
        const s = sizes[i];
        return Math.floor(i / cols) === r && s ? [s.h + it.room] : [];
      }),
    ),
  );
  const offset = (sizes: readonly number[], k: number) =>
    sizes.slice(0, k).reduce((a, b) => a + b, 0) + k * g;
  return items.map((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const s = sizes[i] ?? { w: 0, h: 0 };
    const cell = {
      x: o.origin.x + offset(colW, c),
      y: o.origin.y + offset(rowH, r),
      w: colW[c] ?? 0,
      h: rowH[r] ?? 0,
    };
    const freeW = cell.w - s.w;
    const freeH = cell.h - it.room - s.h;
    const x = cell.x + (o.hAlign === 'left' ? 0 : o.hAlign === 'center' ? freeW / 2 : freeW);
    const y =
      cell.y + it.room + (o.vAlign === 'top' ? 0 : o.vAlign === 'middle' ? freeH / 2 : freeH);
    return { cell, target: { x, y, w: s.w, h: s.h } };
  });
}

/** Room above an object for a letter in this label style: its offset plus one line. */
/** Fit to page width keeps this far (points) from each side edge, so outer strokes are not clipped. */
export const PAGE_EDGE = 2;

export const letterBand = (s: PanelLabelStyle): number => s.offset.y + s.size;

/** Moves an object's bounds `from` onto `to`, scaling only when the size changes. */
function place(o: Obj, from: Box, to: Box): Obj {
  return Math.abs(to.w - from.w) < 1e-9 && Math.abs(to.h - from.h) < 1e-9
    ? translateObj(o, to.x - from.x, to.y - from.y)
    : resizeOne(o, from, to);
}

/**
 * `place` measured by `boxOf`. What an object draws past its frame (gel lane
 * labels, issue 44) keeps its point size when the object scales, so after a
 * scale its drawn box misses `to` by that part times (1 − scale). Each further
 * uniform step from where it landed leaves (1 − that step) of the miss and
 * keeps the picture's aspect ratio; a few steps bring it under 0.01 pt.
 */
function placeDrawn(o: Obj, from: Box, to: Box, boxOf: (o: Obj) => Box): Obj {
  let r = place(o, from, to);
  if (boxOf === objBounds) return r;
  for (let i = 0; i < 6; i++) {
    const b = boxOf(r);
    if (b.w <= 0 || b.h <= 0) return r;
    const k = Math.min(to.w / b.w, to.h / b.h);
    const off = Math.max(Math.abs(b.x - to.x), Math.abs(b.y - to.y));
    if (Math.abs(k - 1) * Math.max(b.w, b.h) < 0.01 && off < 0.01) return r;
    r = place(r, b, { x: to.x, y: to.y, w: b.w * k, h: b.h * k });
  }
  return r;
}

/**
 * An arrow attached at both ends follows its targets (note 06): it is never a cell
 * of its own, `reconcileBindings` re-routes it once they have moved.
 */
export const isBoundArrow = (o: Obj): boolean =>
  o.type === 'arrow' && o.bind?.start !== undefined && o.bind.end !== undefined;

/**
 * One named edit: each selected object (top-level or on a panel, except arrows bound at both ends) goes into
 * its own new auto-lettered panel; a selected panel becomes a cell itself,
 * its contents moved (and scaled) with it. Objects are taken in reading
 * order of where they are now, so the letters follow the rough arrangement
 * on the page. Locked objects, and objects inside groups, are left alone.
 */
export function arrangeInGrid(
  pageId: Id,
  ids: readonly Id[],
  opts: GridOptions,
  plots: PlotSizing = 'scale',
  boxOf: (o: Obj) => Box = objBounds,
): Edit {
  const result: Id[] = [];
  return {
    label: 'Arrange in grid',
    get select() {
      return result;
    },
    apply: (f) => {
      const next = withPage(f, pageId, (p) => {
        result.length = 0;
        return arrangePage(p, ids, opts, letterBand(f.doc.panelLabelStyle), result, boxOf);
      });
      return plots === 'keep' ? keepPlotText(f, next, pageId) : next;
    },
  };
}

function arrangePage(
  p: Page,
  ids: readonly Id[],
  opts: GridOptions,
  band: number,
  out: Id[],
  boxOf: (o: Obj) => Box,
): Page {
  const set = new Set(ids);
  const found: Obj[] = [];
  for (const layer of p.layers) {
    if (layer.locked) continue;
    for (const o of layer.children) {
      if (set.has(o.id)) {
        if (o.locked !== true && !isBoundArrow(o)) found.push(o);
      } else if (o.type === 'panel')
        for (const c of o.children)
          if (set.has(c.id) && c.locked !== true && !isBoundArrow(c)) found.push(c);
    }
  }
  if (found.length === 0) throw new EditError('Select the objects to arrange (unlocked ones).');
  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = Math.max(1, Math.floor(opts.rows));
  if (rows * cols < found.length)
    throw new EditError(
      `${String(rows)} × ${String(cols)} cells cannot hold ${String(found.length)} objects.`,
    );

  const ordered = inReadingOrder(found, boxOf, (first) =>
    Math.max(ROW_TOLERANCE, boxOf(first).h / 2),
  );
  const items = ordered.map((o) => ({
    box: boxOf(o),
    room: opts.letterRoom && o.type !== 'panel' ? band : 0,
  }));
  const all = unionBoxes(items.map((it) => it.box));
  const places = gridLayout(items, {
    cols,
    gutter: opts.gutter,
    hAlign: opts.hAlign,
    vAlign: opts.vAlign,
    origin: opts.fitWidth ? { x: PAGE_EDGE, y: PAGE_EDGE } : { x: all.x, y: all.y },
    ...(opts.fitWidth ? { width: p.size.w - 2 * PAGE_EDGE, height: p.size.h - 2 * PAGE_EDGE } : {}),
  });

  const replaced = new Map<Id, Panel>();
  ordered.forEach((o, i) => {
    const at = places[i];
    const item = items[i];
    if (!at || !item) return;
    const frame = { x: at.cell.x, y: at.cell.y, w: at.cell.w, h: at.cell.h, rotation: 0 };
    const panel: Panel =
      o.type === 'panel'
        ? {
            ...o,
            frame: { ...o.frame, ...frame },
            children: o.children.map((c) => place(c, item.box, at.target)),
          }
        : { ...createPanel(frame), children: [placeDrawn(o, item.box, at.target, boxOf)] };
    replaced.set(o.id, panel);
    out.push(panel.id);
  });

  return {
    ...p,
    layers: p.layers.map((layer) => {
      const hit = (o: Obj): boolean =>
        replaced.has(o.id) || (o.type === 'panel' && o.children.some((c) => replaced.has(c.id)));
      if (!layer.children.some(hit)) return layer;
      const children = layer.children.flatMap((o): Obj[] => {
        const r = replaced.get(o.id);
        if (r) return [r];
        if (!hit(o) || o.type !== 'panel') return [o];
        // Taken off a panel: the new panels sit just above the one they left.
        return [
          { ...o, children: o.children.filter((c) => !replaced.has(c.id)) },
          ...o.children.flatMap((c) => {
            const n = replaced.get(c.id);
            return n ? [n] : [];
          }),
        ];
      });
      return { ...layer, children };
    }),
  };
}
