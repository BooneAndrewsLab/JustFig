/**
 * fast-check arbitraries for the document model: any value these make is a
 * valid document, so codec round trips can be property-tested.
 */
import fc from 'fast-check';

import { asId } from '@/core/model/ids';
import {
  FONT_IDS,
  HEAD_KINDS,
  type Asset,
  type Doc,
  type Frame,
  type Note,
  type NoteReply,
  type Obj,
  type Paint,
  type PathNode,
  type Run,
  type ShapeStyle,
} from '@/core/model/types';

/** Finite, no -0 (JSON writes it as 0). */
const real = (min = -1e4, max = 1e4) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((x) => (x === 0 ? 0 : x));
const pos = (max = 1e4) => real(0, max);
const id = fc.stringMatching(/^o_[0-9a-f]{16}$/).map(asId);
const hex = fc.stringMatching(/^#[0-9a-f]{6}$/);
const text = fc.string({ maxLength: 12 });
const maybe = <K extends string, T>(
  key: K,
  arb: fc.Arbitrary<T>,
): fc.Arbitrary<Partial<Record<K, T>>> =>
  fc.option(arb, { nil: undefined }).map((v): Partial<Record<K, T>> => {
    const out: Partial<Record<K, T>> = {};
    if (v !== undefined) out[key] = v;
    return out;
  });
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const trueOrAbsent = <K extends string>(key: K) =>
  fc.boolean().map((b) => (b ? { [key]: true } : {}));

export const paintArb: fc.Arbitrary<Paint> = fc.oneof(
  hex.map((h) => ({ hex: h })),
  fc.stringMatching(/^sw_[0-9a-f]{4}$/).map((s) => ({ swatch: s })),
);

const vec = fc.record({ x: real(), y: real() });

export const frameArb: fc.Arbitrary<Frame> = fc
  .tuple(
    fc.record({ x: real(), y: real(), w: pos(), h: pos(), rotation: real(-360, 360) }),
    trueOrAbsent('flipX'),
    trueOrAbsent('flipY'),
  )
  .map(([f, a, b]) => ({ ...f, ...a, ...b }));

const styleArb: fc.Arbitrary<ShapeStyle> = fc
  .tuple(
    fc.record({
      fill: fc.option(paintArb, { nil: null }),
      stroke: fc.option(paintArb, { nil: null }),
      strokeWidth: pos(20),
      cap: fc.constantFrom('butt', 'round', 'square'),
      join: fc.constantFrom('miter', 'round', 'bevel'),
    }),
    maybe('dash', fc.array(pos(20), { maxLength: 4 })),
  )
  .map(([s, d]) => ({ ...s, ...d }));

const nodeArb: fc.Arbitrary<PathNode> = fc
  .tuple(vec, maybe('in', vec), maybe('out', vec))
  .map(([p, i, o]) => ({ ...p, ...i, ...o }));

const runArb: fc.Arbitrary<Run> = fc
  .tuple(
    fc.record({ text, font: fc.constantFrom(...FONT_IDS), size: pos(72), color: paintArb }),
    trueOrAbsent('bold'),
    trueOrAbsent('italic'),
    maybe('script', fc.constantFrom('sub' as const, 'sup' as const)),
  )
  .map(([r, b, i, s]) => ({ ...r, ...b, ...i, ...s }));

const baseArb = fc
  .tuple(
    fc.record({ id, frame: frameArb, opacity: real(0, 1) }),
    maybe('name', text),
    trueOrAbsent('locked'),
    trueOrAbsent('hidden'),
  )
  .map(([b, n, l, h]) => ({ ...b, ...n, ...l, ...h }));

const headArb = fc.record({ kind: fc.constantFrom(...HEAD_KINDS), size: pos(20) });
const asset = fc.constantFrom('h0001', 'h0002');

const json = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)) as unknown);

const leafArb: fc.Arbitrary<Obj> = fc.oneof(
  fc
    .tuple(baseArb, pos(50), styleArb)
    .map(([b, rx, style]): Obj => ({ ...b, type: 'rect', rx, style })),
  fc.tuple(baseArb, styleArb).map(([b, style]): Obj => ({ ...b, type: 'ellipse', style })),
  fc
    .tuple(baseArb, fc.array(nodeArb, { minLength: 2, maxLength: 5 }), fc.boolean(), styleArb)
    .map(([b, nodes, closed, style]): Obj => ({ ...b, type: 'path', nodes, closed, style })),
  fc
    .tuple(baseArb, fc.array(nodeArb, { minLength: 2, maxLength: 4 }), headArb, headArb, styleArb)
    .map(([b, nodes, start, end, style]): Obj => ({
      ...b,
      type: 'arrow',
      nodes,
      start,
      end,
      style,
    })),
  fc
    .tuple(
      baseArb,
      fc.array(fc.array(runArb, { maxLength: 3 }), { minLength: 1, maxLength: 3 }),
      fc.constantFrom('left', 'center', 'right'),
      pos(3),
      fc.boolean(),
    )
    .map(([b, runs, align, lineHeight, autoWidth]): Obj => ({
      ...b,
      type: 'text',
      runs,
      align,
      lineHeight,
      autoWidth,
    })),
  fc
    .tuple(baseArb, asset, fc.dictionary(fc.constantFrom('s1', 's2', 'outline'), paintArb))
    .map(([b, a, slots]): Obj => ({ ...b, type: 'icon', asset: a, slots, lockAspect: true })),
  fc
    .tuple(
      baseArb,
      asset,
      fc.option(
        fc.tuple(
          fc.nat(50),
          fc.nat(50),
          fc.integer({ min: 1, max: 50 }),
          fc.nat(10),
          asset,
          fc.option(fc.integer({ min: -179, max: 180 }), { nil: undefined }),
        ),
        { nil: undefined },
      ),
      fc.option(
        fc.array(
          fc.record({
            asset,
            color: hex,
            on: fc.boolean(),
            min: fc.nat(254),
            max: fc.integer({ min: 1, max: 255 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        { nil: undefined },
      ),
      fc.option(
        fc
          .record({
            min: fc.nat(254),
            max: fc.integer({ min: 1, max: 255 }),
            invert: fc.boolean(),
            base: asset,
          })
          .filter((l) => l.min < l.max),
        { nil: undefined },
      ),
    )
    .map(([b, a, c, channels, levels]): Obj => ({
      ...b,
      type: 'image',
      asset: a,
      ...(c ? { crop: { x: c[0], y: c[1], w: c[2], h: c[3] }, cropped: c[4] } : {}),
      ...(c?.[5] === undefined ? {} : { turn: c[5] }),
      ...(channels ? { channels } : {}),
      ...(levels ? { levels } : {}),
    })),
  fc
    .tuple(baseArb, fc.string(), fc.nat(5), json, asset)
    .map(([b, kind, kindVersion, params, snapshot]): Obj => ({
      ...b,
      type: 'procedural',
      kind,
      kindVersion,
      params,
      slots: {},
      snapshot,
    })),
);

export const objArb: fc.Arbitrary<Obj> = fc.letrec<{ obj: Obj }>((tie) => ({
  obj: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leafArb,
    fc
      .tuple(baseArb, fc.array(tie('obj'), { maxLength: 3 }))
      .map(([b, children]): Obj => ({ ...b, type: 'group', children })),
    fc
      .tuple(
        baseArb,
        text,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.array(tie('obj'), { maxLength: 3 }),
      )
      .map(([b, label, autoLabel, showLabel, showBorder, children]): Obj => ({
        ...b,
        type: 'panel',
        label,
        autoLabel,
        showLabel,
        showBorder,
        children,
      })),
  ),
})).obj;

const PAGE_ID = asId('pg_0000000000000000');

const replyArb: fc.Arbitrary<NoteReply> = fc.record({
  id: fc.stringMatching(/^n_[0-9a-f]{16}$/).map(asId),
  text: fc.string({ maxLength: 40 }),
  author: text,
  time: fc.nat(),
});

/** Review notes (note 24): on a point, or pinned to an object id (one that may be gone). */
export const noteArb: fc.Arbitrary<Note> = fc
  .tuple(
    replyArb,
    vec,
    maybe('object', id),
    trueOrAbsent('resolved'),
    fc.array(replyArb, { maxLength: 3 }),
  )
  .map(([r, at, object, resolved, replies]) => ({
    ...r,
    page: PAGE_ID,
    at,
    ...object,
    ...resolved,
    replies,
  }));

export const docArb: fc.Arbitrary<Doc> = fc
  .tuple(
    text,
    fc.array(objArb, { maxLength: 6 }),
    pos(2000),
    pos(2000),
    fc.option(paintArb, { nil: null }),
    fc.boolean(),
    fc.array(noteArb, { maxLength: 3 }),
  )
  .map(([title, children, w, h, background, creditFooter, notes]) => ({
    id: asId('d_0000000000000000'),
    title,
    palette: [{ id: 'sw_0001', name: 'Blue', hex: '#0072b2' }],
    textStyles: [],
    panelLabelStyle: { format: 'A', font: 'arimo', size: 12, bold: true, offset: { x: 4, y: 4 } },
    pages: [
      {
        id: PAGE_ID,
        name: 'Page 1',
        size: { w, h },
        background,
        layers: [
          {
            id: asId('ly_0000000000000000'),
            name: 'Layer 1',
            visible: true,
            locked: false,
            children,
          },
        ],
      },
    ],
    creditFooter,
    notes,
  }));

const meta = { name: 'x.png', width: 10, height: 10 };
export const ASSETS: Record<string, Asset> = {
  h0001: { kind: 'image', mime: 'image/png', dataBase64: 'iVBORw0KGgo=', meta },
  h0002: { kind: 'svgImport', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', meta },
};
