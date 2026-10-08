/**
 * The export torture fixture (note 03): every primitive, rotated and
 * flipped objects, every arrowhead, sub/sup with Greek in all three fonts,
 * group opacity, a recoloured icon, an imported SVG, a PNG, a 2×2 panel
 * layout with auto labels and a 384-well plate. Deterministic: fixed ids,
 * text frames sized by the real layout. `npm run fixtures` writes
 * torture.jfig; a test fails if the checked-in file drifts from this.
 */
import { type Id, asId } from '@/core/model/ids';
import { createDoc, hex, INK } from '@/core/model/factory';
import { localise } from '@/core/model/factory';
import type {
  Asset,
  Figure,
  Frame,
  Head,
  HeadKind,
  Obj,
  PathNode,
  Run,
  ShapeStyle,
  Text,
} from '@/core/model/types';
import { mmToPt } from '@/core/units';
import { fitText } from '@/core/text/layout';
import { hashAsset } from '@/io/assets';

export const TORTURE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<g data-part="dish"><ellipse cx="50" cy="58" rx="44" ry="30" fill="#d9e8f5" data-slot="s1" data-tone="0.08"/>' +
  '<ellipse cx="50" cy="52" rx="44" ry="30" fill="#56b4e9" data-slot="s1"/>' +
  '<ellipse cx="50" cy="52" rx="44" ry="30" fill="none" stroke="#1f2933" stroke-width="2.5" data-slot="outline"/></g>' +
  '<g data-part="colonies"><circle cx="35" cy="48" r="6" fill="#e69f00" data-slot="s2"/>' +
  '<circle cx="60" cy="58" r="5" fill="#e69f00" data-slot="s2" data-tone="-0.12"/>' +
  '<circle cx="62" cy="40" r="4" fill="#e69f00" data-slot="s2"/></g></svg>';

const IMPORTED_SVG =
  '<?xml version="1.0"?><!-- an editor export --><svg xmlns="http://www.w3.org/2000/svg" width="60pt" height="40pt" viewBox="0 0 60 40">' +
  '<style>.a{fill:#cc79a7;stroke:#000}</style><defs><linearGradient id="g"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#009e73"/></linearGradient></defs>' +
  '<rect class="a" x="2" y="2" width="56" height="36" rx="6"/><circle cx="20" cy="20" r="10" style="fill:url(#g)"/>' +
  '<script>alert(1)</script><path d="M35 30 L55 10" stroke="rgb(0, 114, 178)" stroke-width="3"/></svg>';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR42mNgKNoERM/mMwARChunBBYhMBu3BB3sAABJt1UhTDnhuAAAAABJRU5ErkJggg==';

const ICON: Asset = {
  kind: 'icon',
  svg: TORTURE_ICON_SVG,
  slots: [
    { id: 's1', label: 'Dish', default: '#56b4e9' },
    { id: 's2', label: 'Colonies', default: '#e69f00' },
    { id: 'outline', label: 'Outline', default: '#1f2933' },
  ],
  recolor: 'slots',
  meta: {
    library: 'stub',
    libraryVersion: '0.1.0',
    id: 'petri-dish',
    title: 'Petri dish',
    source: 'House icons',
    author: 'Test Author',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    originalUrl: 'https://example.org/petri-dish',
    shareAlike: false,
  },
};
const IMAGE: Asset = {
  kind: 'image',
  mime: 'image/png',
  dataBase64: PNG_BASE64,
  meta: { name: 'checker.png', credit: 'Checker by the test suite', width: 8, height: 8 },
};
const SVGIMPORT: Asset = {
  kind: 'svgImport',
  svg: IMPORTED_SVG,
  meta: { name: 'shapes.svg', width: 60, height: 40 },
};

const assetHash = hashAsset;

export function buildTorture(): Figure {
  let n = 0;
  const id = (): Id => asId(`o_${(n++).toString(16).padStart(16, '0')}`);
  const f = (x: number, y: number, w: number, h: number, extra: Partial<Frame> = {}): Frame => ({
    x,
    y,
    w,
    h,
    rotation: 0,
    ...extra,
  });
  const style = (
    fill: string | null,
    stroke: string | null,
    sw = 1,
    extra: Partial<ShapeStyle> = {},
  ): ShapeStyle => ({
    fill: fill === null ? null : hex(fill),
    stroke: stroke === null ? null : hex(stroke),
    strokeWidth: sw,
    cap: 'round',
    join: 'round',
    ...extra,
  });
  const path = (
    nodes: PathNode[],
    closed: boolean,
    s: ShapeStyle,
    extra: Partial<Frame> = {},
  ): Obj => {
    const { f: fr, local } = localise(nodes);
    return {
      id: id(),
      type: 'path',
      frame: { ...fr, ...extra },
      opacity: 1,
      nodes: local,
      closed,
      style: s,
    };
  };
  const arrow = (nodes: PathNode[], end: HeadKind, start: HeadKind = 'none', sw = 1.5): Obj => {
    const { f: fr, local } = localise(nodes);
    const head = (k: HeadKind): Head => ({ kind: k, size: 4 });
    return {
      id: id(),
      type: 'arrow',
      frame: fr,
      opacity: 1,
      nodes: local,
      start: head(start),
      end: head(end),
      style: style(null, INK, sw),
    };
  };
  const run = (text: string, over: Partial<Run> = {}): Run => ({
    text,
    font: 'arimo',
    size: 10,
    color: hex(INK),
    ...over,
  });
  const text = (x: number, y: number, runs: Run[][], over: Partial<Text> = {}): Obj =>
    fitText({
      id: id(),
      type: 'text',
      frame: f(x, y, 10, 10),
      opacity: 1,
      runs,
      align: 'left',
      lineHeight: 1.2,
      autoWidth: true,
      ...over,
    });

  const iconHash = assetHash(ICON);
  const imageHash = assetHash(IMAGE);
  const svgHash = assetHash(SVGIMPORT);

  const W = mmToPt(297);
  const H = mmToPt(210);
  const pw = (W - 3 * 20) / 2;
  const ph = (H - 3 * 20) / 2;
  const px = [20, 40 + pw];
  const py = [20, 40 + ph];
  const at = (i: number, j: number) => ({ x: px[i] ?? 0, y: py[j] ?? 0 });

  // A: primitives, transforms, group opacity.
  const a = at(0, 0);
  const panelA: Obj[] = [
    {
      id: id(),
      type: 'rect',
      frame: f(a.x + 20, a.y + 30, 60, 40),
      opacity: 1,
      rx: 8,
      style: style('#56b4e9', INK, 1),
    },
    {
      id: id(),
      type: 'ellipse',
      frame: f(a.x + 95, a.y + 30, 50, 40),
      opacity: 1,
      style: style('#e69f00', INK, 2),
    },
    {
      id: id(),
      type: 'rect',
      frame: f(a.x + 165, a.y + 30, 50, 30, { rotation: 30 }),
      opacity: 1,
      rx: 0,
      style: style('#009e73', null, 0),
    },
    {
      id: id(),
      type: 'rect',
      frame: f(a.x + 235, a.y + 30, 60, 30),
      opacity: 1,
      rx: 0,
      style: style(null, '#d55e00', 1.5, { dash: [4, 2] }),
    },
    path(
      [
        { x: a.x + 20, y: a.y + 120, out: { x: a.x + 40, y: a.y + 80 } },
        {
          x: a.x + 80,
          y: a.y + 120,
          in: { x: a.x + 60, y: a.y + 90 },
          out: { x: a.x + 90, y: a.y + 140 },
        },
        { x: a.x + 50, y: a.y + 150 },
      ],
      true,
      style('#cc79a7', INK, 1),
    ),
    path(
      [
        { x: a.x + 100, y: a.y + 150 },
        { x: a.x + 120, y: a.y + 100 },
        { x: a.x + 140, y: a.y + 140 },
        { x: a.x + 160, y: a.y + 95 },
      ],
      false,
      style(null, '#0072b2', 2, { cap: 'butt', join: 'miter' }),
      { flipX: true },
    ),
    {
      id: id(),
      type: 'ellipse',
      frame: f(a.x + 180, a.y + 100, 50, 20, { rotation: -45, flipY: true }),
      opacity: 1,
      style: style('#f0e442', INK, 1),
    },
    {
      id: id(),
      type: 'group',
      frame: f(a.x + 240, a.y + 90, 60, 60),
      opacity: 0.5,
      children: [
        {
          id: id(),
          type: 'rect',
          frame: f(a.x + 240, a.y + 90, 40, 40),
          opacity: 1,
          rx: 0,
          style: style('#d55e00', null, 0),
        },
        {
          id: id(),
          type: 'ellipse',
          frame: f(a.x + 260, a.y + 110, 40, 40),
          opacity: 0.8,
          style: style('#0072b2', null, 0),
        },
      ],
    },
  ];

  // B: every arrowhead, straight and curved, start heads, the inhibition bar.
  const b = at(1, 0);
  const kinds: HeadKind[] = ['triangle', 'open', 'stealth', 'bar', 'circle', 'diamond', 'none'];
  const panelB: Obj[] = kinds.map((k, i) =>
    arrow(
      [
        { x: b.x + 20, y: b.y + 30 + i * 18 },
        { x: b.x + 140, y: b.y + 30 + i * 18 },
      ],
      k,
      i % 2 === 0 ? 'none' : k,
      i === 3 ? 2 : 1.5,
    ),
  );
  panelB.push(
    arrow(
      [
        { x: b.x + 170, y: b.y + 150, out: { x: b.x + 170, y: b.y + 60 } },
        { x: b.x + 300, y: b.y + 40, in: { x: b.x + 220, y: b.y + 30 } },
      ],
      'triangle',
      'circle',
      1,
    ),
    arrow(
      [
        { x: b.x + 180, y: b.y + 170 },
        { x: b.x + 240, y: b.y + 120 },
        { x: b.x + 300, y: b.y + 170 },
      ],
      'stealth',
      'none',
      3,
    ),
  );

  // C: text: sub/sup, Greek, three fonts, bold/italic, wrapping, alignment, rotation.
  const c = at(0, 1);
  const panelC: Obj[] = [
    text(
      c.x + 20,
      c.y + 25,
      [
        [
          run('IL-1β → NF-κB, '),
          run('Ca'),
          run('2+', { script: 'sup' }),
          run(' and H'),
          run('2', { script: 'sub' }),
          run('O'),
        ],
      ],
      {},
    ),
    text(c.x + 20, c.y + 50, [
      [
        run('Tinos α-tubulin', { font: 'tinos', size: 12 }),
        run(' 10', { font: 'tinos', size: 12 }),
        run('−6', { font: 'tinos', size: 12, script: 'sup' }),
      ],
    ]),
    text(c.x + 20, c.y + 75, [
      [
        run('Cousine µM ± SD', { font: 'cousine', size: 9 }),
        run(' bold', { font: 'cousine', size: 9, bold: true }),
      ],
    ]),
    text(c.x + 20, c.y + 95, [
      [
        run('Bold ', { bold: true }),
        run('italic ', { italic: true }),
        run('both', { bold: true, italic: true }),
        run(' Δψ', { color: hex('#d55e00') }),
      ],
    ]),
    text(
      c.x + 20,
      c.y + 120,
      [
        [run('A centred paragraph that wraps across several lines of the box width.', { size: 8 })],
        [run('Second paragraph', { size: 8, italic: true })],
      ],
      { autoWidth: false, align: 'center', frame: f(c.x + 20, c.y + 120, 120, 10) },
    ),
    text(c.x + 190, c.y + 120, [[run('Rotated 90°, right', { size: 9 })]], {
      frame: f(c.x + 190, c.y + 120, 10, 10, { rotation: -90 }),
    }),
    text(
      c.x + 220,
      c.y + 40,
      [[run('Right aligned', { size: 9 })], [run('two lines', { size: 9 })]],
      { align: 'right' },
    ),
  ];

  // D: recoloured icon, imported SVG, PNG and a 384-well plate.
  const d = at(1, 1);
  const panelD: Obj[] = [
    {
      id: id(),
      type: 'icon',
      frame: f(d.x + 15, d.y + 25, 60, 60),
      opacity: 1,
      asset: iconHash,
      slots: { s1: hex('#cc79a7'), s2: hex('#009e73') },
      lockAspect: true,
    },
    {
      id: id(),
      type: 'icon',
      frame: f(d.x + 15, d.y + 95, 40, 40, { rotation: 20 }),
      opacity: 1,
      asset: iconHash,
      slots: {},
      lockAspect: true,
    },
    { id: id(), type: 'image', frame: f(d.x + 85, d.y + 25, 60, 40), opacity: 1, asset: svgHash },
    { id: id(), type: 'image', frame: f(d.x + 85, d.y + 80, 40, 40), opacity: 1, asset: imageHash },
  ];
  const plate: Obj[] = [];
  const x0 = d.x + 160;
  const y0 = d.y + 40;
  const pitch = 5.5;
  for (let r = 0; r < 16; r += 1)
    for (let col = 0; col < 24; col += 1)
      plate.push({
        id: id(),
        type: 'ellipse',
        frame: f(x0 + col * pitch, y0 + r * pitch, 4.5, 4.5),
        opacity: 1,
        style: style((r * 24 + col) % 7 === 0 ? '#0072b2' : '#ffffff', '#52606d', 0.3),
      });
  plate.unshift({
    id: id(),
    type: 'rect',
    frame: f(x0 - 4, y0 - 4, 24 * pitch + 7, 16 * pitch + 7),
    opacity: 1,
    rx: 3,
    style: style('#e4e7eb', INK, 0.75),
  });
  panelD.push({
    id: id(),
    type: 'group',
    frame: f(x0 - 4, y0 - 4, 24 * pitch + 7, 16 * pitch + 7),
    opacity: 1,
    children: plate,
  });

  const panel = (i: number, j: number, children: Obj[]): Obj => ({
    id: id(),
    type: 'panel',
    frame: f(px[i] ?? 0, py[j] ?? 0, pw, ph),
    opacity: 1,
    label: '',
    autoLabel: true,
    showLabel: true,
    showBorder: true,
    children,
  });

  const doc0 = createDoc('Torture');
  const page0 = doc0.pages[0];
  const layer0 = page0?.layers[0];
  if (!page0 || !layer0) throw new Error('createDoc gave no page');
  const doc = {
    ...doc0,
    id: asId('d_0000000000000001'),
    pages: [
      {
        ...page0,
        id: asId('pg_0000000000000001'),
        size: { w: W, h: H, preset: 'a4-landscape' },
        layers: [
          {
            ...layer0,
            id: asId('ly_0000000000000001'),
            children: [
              panel(1, 1, panelD),
              panel(0, 0, panelA),
              panel(1, 0, panelB),
              panel(0, 1, panelC),
            ],
          },
        ],
      },
    ],
  };
  return { doc, assets: { [iconHash]: ICON, [imageHash]: IMAGE, [svgHash]: SVGIMPORT } };
}
