/**
 * Swatch-linked recolouring (note 07). A paint is either a fixed `{hex}`
 * or a `{swatch}` reference into `doc.palette`; changing a swatch recolours
 * every use at once. These edits link a figure's colours to swatches,
 * change, add and remove swatches, and apply a built-in palette.
 */
import { resolvePaint } from '@/core/color/color';
import { type Edit, updateDoc } from '@/core/edits/edits';
import { createDoc, createLayer, createPage } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { mapObjs } from '@/core/model/tree';
import type { Doc, Obj, Paint, ShapeStyle, Swatch } from '@/core/model/types';
import { getKind } from '@/procedural/registry';

import { type BuiltInPalette, isNeutral } from './palettes';

type PaintFn = (p: Paint) => Paint;

/**
 * Every paint in the document passed through `fn`. With `slotDefaults`,
 * procedural objects' default slot colours are passed too (and become
 * overrides when `fn` changes them). Icon defaults are never touched: an
 * override on a CC BY icon credits it as modified (note 03).
 */
function mapDocPaints(doc: Doc, fn: PaintFn, slotDefaults = false): Doc {
  const style = (s: ShapeStyle): ShapeStyle => {
    const fill = s.fill ? fn(s.fill) : null;
    const stroke = s.stroke ? fn(s.stroke) : null;
    return fill === s.fill && stroke === s.stroke ? s : { ...s, fill, stroke };
  };
  const slots = (
    over: Readonly<Record<string, Paint>>,
    defaults: readonly { id: string; default: string }[],
  ): Readonly<Record<string, Paint>> => {
    let changed = false;
    const out: Record<string, Paint> = {};
    for (const [k, p] of Object.entries(over)) {
      const q = fn(p);
      if (q !== p) changed = true;
      out[k] = q;
    }
    for (const d of defaults) {
      if (out[d.id]) continue;
      const base = { hex: d.default };
      const q = fn(base);
      if (q !== base) {
        out[d.id] = q;
        changed = true;
      }
    }
    return changed ? out : over;
  };
  const obj = (o: Obj): Obj => {
    switch (o.type) {
      case 'rect':
      case 'ellipse':
      case 'path':
      case 'arrow': {
        const s = style(o.style);
        return s === o.style ? o : { ...o, style: s };
      }
      case 'text': {
        const runs = o.runs.map((para) =>
          para.map((r) => {
            const color = fn(r.color);
            return color === r.color ? r : { ...r, color };
          }),
        );
        const changed = runs.some((para, i) => para.some((r, j) => r !== o.runs[i]?.[j]));
        // A step badge's colour (note 48); its plain number's run follows on reconcile.
        if (o.step) {
          const paint = fn(o.step.paint);
          if (paint !== o.step.paint) return { ...o, runs, step: { ...o.step, paint } };
        }
        return changed ? { ...o, runs } : o;
      }
      case 'icon': {
        const s = slots(o.slots, []);
        return s === o.slots ? o : { ...o, slots: s };
      }
      case 'procedural': {
        const k = slotDefaults ? getKind(o.kind) : undefined;
        const s = slots(o.slots, k ? k.slots : []);
        return s === o.slots ? o : { ...o, slots: s };
      }
      case 'image':
      case 'group':
      case 'panel':
      case 'embedded':
        return o;
    }
  };
  const pages = doc.pages.map((p) => {
    const background = p.background ? fn(p.background) : null;
    const layers = p.layers.map((l) => {
      const children = mapObjs(l.children, obj);
      return children === l.children ? l : { ...l, children };
    });
    const same = background === p.background && layers.every((l, i) => l === p.layers[i]);
    return same ? p : { ...p, background, layers };
  });
  const textStyles = doc.textStyles.map((t) => {
    const color = fn(t.color);
    return color === t.color ? t : { ...t, color };
  });
  return { ...doc, pages, textStyles };
}

/** The distinct colours a document uses, most used first (hex, lower case). */
export function docColours(doc: Doc): string[] {
  const count = new Map<string, number>();
  mapDocPaints(
    doc,
    (p) => {
      const h = resolvePaint(p, doc.palette).toLowerCase();
      count.set(h, (count.get(h) ?? 0) + 1);
      return p;
    },
    true,
  );
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

const neutralName = (hex: string): string => {
  if (hex === '#ffffff') return 'White';
  if (hex === '#000000') return 'Black';
  return 'Grey';
};

/**
 * Links every fixed colour to a swatch (one per distinct colour, reusing a
 * swatch that already has it), so applying a palette later recolours the
 * whole figure. Procedural default colours are linked too.
 */
export function linkColours(): Edit {
  return updateDoc('Link colours to the palette', (doc) => {
    const palette: Swatch[] = [...doc.palette];
    const byHex = new Map<string, Id>();
    for (const s of palette)
      if (!byHex.has(s.hex.toLowerCase())) byHex.set(s.hex.toLowerCase(), s.id as Id);
    let n = palette.filter((s) => !isNeutral(s.hex)).length;
    const next = mapDocPaints(
      doc,
      (p) => {
        if ('swatch' in p) return p;
        const h = p.hex.toLowerCase();
        let id = byHex.get(h);
        if (id === undefined) {
          id = newId('sw');
          byHex.set(h, id);
          const neutral = isNeutral(h);
          if (!neutral) n += 1;
          palette.push({ id, name: neutral ? neutralName(h) : `Colour ${String(n)}`, hex: h });
        }
        return { swatch: id };
      },
      true,
    );
    return { ...next, palette };
  });
}

/** Changes one swatch's colour: every linked use follows. */
export const setSwatch = (id: string, hex: string): Edit =>
  updateDoc('Change swatch', (d) => ({
    ...d,
    palette: d.palette.map((s) => (s.id === id ? { ...s, hex } : s)),
  }));

export const renameSwatch = (id: string, name: string): Edit =>
  updateDoc('Rename swatch', (d) => ({
    ...d,
    palette: d.palette.map((s) => (s.id === id ? { ...s, name } : s)),
  }));

export const addSwatch = (hex: string, name?: string): Edit =>
  updateDoc('Add swatch', (d) => ({
    ...d,
    palette: [
      ...d.palette,
      { id: newId('sw'), name: name ?? `Colour ${String(d.palette.length + 1)}`, hex },
    ],
  }));

/** Removes a swatch; its uses keep its colour as a fixed colour. */
export const removeSwatch = (id: string): Edit =>
  updateDoc('Remove swatch', (d) => {
    const s = d.palette.find((x) => x.id === id);
    if (!s) return d;
    const baked = mapDocPaints(d, (p) => ('swatch' in p && p.swatch === id ? { hex: s.hex } : p));
    return { ...baked, palette: d.palette.filter((x) => x.id !== id) };
  });

/**
 * Objects with every swatch link replaced by its colour, for use in another
 * figure whose palette does not have those swatches (presets, note 22).
 */
export function bakedSwatches(objs: readonly Obj[], palette: readonly Swatch[]): Obj[] {
  const page = { ...createPage(), layers: [{ ...createLayer(), children: objs }] };
  const doc = { ...createDoc(), palette, pages: [page] };
  const out = mapDocPaints(doc, (p) => ('swatch' in p ? { hex: resolvePaint(p, palette) } : p));
  return [...(out.pages[0]?.layers[0]?.children ?? [])];
}

/** Every link undone: the figure keeps its look with fixed colours. */
export const unlinkColours = (): Edit =>
  updateDoc('Unlink colours', (d) => ({
    ...mapDocPaints(d, (p) => ('swatch' in p ? { hex: resolvePaint(p, d.palette) } : p)),
  }));

/**
 * The document's swatches recoloured from a built-in palette, in order:
 * the n-th colourful swatch takes the palette's n-th colour (cycling);
 * neutral swatches (black, white, greys) keep theirs. A document with no
 * colourful swatches gets the palette's colours as new swatches.
 */
export function paletteApplied(doc: Doc, p: BuiltInPalette): Swatch[] {
  if (doc.palette.every((s) => isNeutral(s.hex)))
    return [
      ...doc.palette,
      ...p.colours.map((hex, i) => ({ id: newId('sw'), name: `${p.name} ${String(i + 1)}`, hex })),
    ];
  let i = 0;
  return doc.palette.map((s) => {
    if (isNeutral(s.hex)) return s;
    const hex = p.colours[i % p.colours.length] ?? s.hex;
    i += 1;
    return { ...s, hex };
  });
}

/** Links every colour (one undo step with the change) and applies the palette: the whole figure recolours. */
export const applyPalette = (p: BuiltInPalette): Edit => ({
  label: `Apply ${p.name} palette`,
  apply: (f) => {
    const linked = linkColours().apply(f);
    return { ...linked, doc: { ...linked.doc, palette: paletteApplied(linked.doc, p) } };
  },
});
