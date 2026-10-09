/**
 * The Inspector (note 01): the properties of the selection, or of the
 * page and figure when nothing is selected. Every change is a named edit;
 * typing in one field merges into one undo step (coalesce per field).
 */
import { type ReactNode, useState } from 'react';

import {
  alignObjects,
  distributeObjects,
  flipObjects,
  groupObjects,
  moveObjects,
  reorderObjects,
  matchSize,
  resizeObjects,
  setBackground,
  setCreditFooter,
  setLabelStyle,
  ungroupObjects,
  updateDoc,
  updateObjects,
  updatePage,
} from '@/core/edits/edits';
import {
  type LineTarget,
  type StyleChange,
  type TextTarget,
  currentStyle,
  matchStyles,
  plotOf,
  setStyles,
  styleSample,
  styleTargets,
} from '@/core/edits/style';
import { needsModifiedNote } from '@/core/attribution/attribution';
import { center } from '@/core/geometry/matrix';
import { boundsOf, normAngle, objBounds, rebase, rotateObj } from '@/core/geometry/transform';
import type { Id } from '@/core/model/ids';
import { findObj } from '@/core/model/tree';
import {
  HEAD_KINDS,
  FONT_IDS,
  type FontId,
  type HeadKind,
  type Obj,
  type Paint,
  type PanelLabelFormat,
  type ShapeStyle,
  type TextAlign,
} from '@/core/model/types';
import { PAGE_PRESETS, presetSize } from '@/core/presets/pages';
import { recipeFile } from '@/io/barelysig';
import { drawnBoundsIn } from '@/procedural/bounds';
import { addScaleBar, labelGelImage } from '@/procedural/edits';
import { formatLength, fromUnit, toUnit } from '@/core/units';

import { analytics } from '../analytics';
import { type AppState, currentPage, figure, selectedObjects, store } from '../state/store';
import { download, safeName } from '../state/session';
import { useAppState } from '../state/useAppState';
import { resolveBindings, withKey } from '../keyBindings';
import { ColorInput } from './ColorInput';
import { PaletteSection } from './PaletteSection';
import { PathKindsSection, ProceduralSection } from './ProceduralInspector';

const HEAD_LABEL: Record<HeadKind, string> = {
  none: 'None',
  triangle: 'Triangle',
  open: 'Open',
  stealth: 'Stealth',
  bar: 'Bar (inhibition ⊣)',
  circle: 'Circle',
  diamond: 'Diamond',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        step={step}
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix}
    </label>
  );
}

const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

const key = (field: string, ids: readonly Id[]) => `field:${field}:${ids.join(',')}`;

function edit(s: AppState, ids: readonly Id[], field: string, label: string, fn: (o: Obj) => Obj) {
  store.edit(updateObjects(currentPage(s).id, ids, label, fn), {
    coalesce: key(field, ids),
    keepSelection: true,
  });
}

function restyle(
  s: AppState,
  objs: readonly Obj[],
  field: string,
  label: string,
  patch: Partial<ShapeStyle>,
) {
  edit(
    s,
    objs.map((o) => o.id),
    field,
    label,
    (o) => ('style' in o ? { ...o, style: { ...o.style, ...patch } } : o),
  );
}

export function Inspector({ onArrangeGrid }: { onArrangeGrid: () => void }) {
  const s = useAppState();
  const sel = selectedObjects(s);
  return sel.length === 0 ? (
    <PageInspector s={s} />
  ) : (
    <SelectionInspector s={s} sel={sel} onArrangeGrid={onArrangeGrid} />
  );
}

function PageInspector({ s }: { s: AppState }) {
  const fig = figure(s);
  const page = currentPage(s);
  const u = s.units;
  const ls = fig.doc.panelLabelStyle;
  return (
    <>
      <Section title="Page">
        <div className="row">
          <label htmlFor="page-preset">Size</label>
          <select
            id="page-preset"
            value={page.size.preset ?? ''}
            onChange={(e) => {
              const size = presetSize(e.target.value);
              if (size) store.edit(updatePage(page.id, 'Page size', (p) => ({ ...p, size })));
            }}
          >
            <option value="">Custom</option>
            {(['Journal', 'Paper', 'Screen'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {PAGE_PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid2">
          <Num
            label={`W (${u})`}
            value={toUnit(page.size.w, u)}
            min={1}
            onChange={(v) => {
              store.edit(
                updatePage(page.id, 'Page size', (p) => ({
                  ...p,
                  size: { w: fromUnit(v, u), h: p.size.h },
                })),
                { coalesce: `page-w:${page.id}` },
              );
            }}
          />
          <Num
            label={`H (${u})`}
            value={toUnit(page.size.h, u)}
            min={1}
            onChange={(v) => {
              store.edit(
                updatePage(page.id, 'Page size', (p) => ({
                  ...p,
                  size: { w: p.size.w, h: fromUnit(v, u) },
                })),
                { coalesce: `page-h:${page.id}` },
              );
            }}
          />
        </div>
        <ColorInput
          label="Background"
          value={page.background}
          palette={fig.doc.palette}
          allowNone
          onChange={(p) => {
            store.edit(setBackground(page.id, p), { coalesce: `bg:${page.id}` });
          }}
        />
        <div className="row">
          <label htmlFor="units">Units</label>
          <select
            id="units"
            value={u}
            onChange={(e) => {
              store.setUnits(e.target.value === 'in' ? 'in' : 'mm');
            }}
          >
            <option value="mm">Millimetres</option>
            <option value="in">Inches</option>
          </select>
        </div>
      </Section>
      <Section title="Figure">
        <div className="row">
          <label htmlFor="label-format">Panel labels</label>
          <select
            id="label-format"
            value={ls.format}
            onChange={(e) => {
              store.edit(setLabelStyle({ ...ls, format: e.target.value as PanelLabelFormat }));
            }}
          >
            {(['A', 'a', '(a)', '(A)', 'a)'] as const).map((f) => (
              <option key={f} value={f}>
                {f}, {f.replace('A', 'B').replace('a', 'b')}, …
              </option>
            ))}
          </select>
        </div>
        <div className="grid2">
          <Num
            label="Size (pt)"
            value={ls.size}
            min={4}
            max={72}
            onChange={(v) => {
              store.edit(setLabelStyle({ ...ls, size: v }), { coalesce: 'label-size' });
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={ls.bold}
              onChange={(e) => {
                store.edit(setLabelStyle({ ...ls, bold: e.target.checked }));
              }}
            />
            Bold
          </label>
        </div>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={fig.doc.creditFooter}
              onChange={(e) => {
                store.edit(setCreditFooter(e.target.checked));
              }}
            />{' '}
            Credit line in exports
          </label>
        </div>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={s.snap}
              onChange={(e) => {
                store.setSnap(e.target.checked);
              }}
            />{' '}
            Snap to objects and page
          </label>
        </div>
        <div className="row">
          <label htmlFor="doc-title">Title</label>
          <input
            id="doc-title"
            type="text"
            value={fig.doc.title}
            onChange={(e) => {
              const title = e.target.value;
              store.edit(
                updateDoc('Rename figure', (d) => ({ ...d, title })),
                { coalesce: 'title' },
              );
            }}
          />
        </div>
      </Section>
      <PaletteSection s={s} />
    </>
  );
}

function SelectionInspector({
  s,
  sel,
  onArrangeGrid,
}: {
  s: AppState;
  sel: readonly Obj[];
  onArrangeGrid: () => void;
}) {
  const fig = figure(s);
  const page = currentPage(s);
  const u = s.units;
  const ids = sel.map((o) => o.id);
  const box = boundsOf(sel);
  const one = sel.length === 1 ? sel[0] : undefined;
  const refObj = sel[0];
  const styled = sel.filter((o): o is Extract<Obj, { style: ShapeStyle }> => 'style' in o);
  const first = styled[0];
  const pageBox = { x: 0, y: 0, w: page.size.w, h: page.size.h };
  const hasPlot = styleTargets(sel).some((o) => plotOf(o, fig.assets) !== null);

  const setBox = (patch: Partial<typeof box>, field: string) => {
    const to = { ...box, ...patch };
    const k = key(field, ids);
    if (to.w !== box.w || to.h !== box.h) {
      // Typing "120" passes through 1 and 12: a plot keeping its text is redrawn from the
      // start of the field's run each time, so no step in between leaves a trace.
      const from = hasPlot && s.plotSizing === 'keep' ? store.runStart(k) : undefined;
      const fromPage = from?.doc.pages.find((p) => p.id === page.id);
      const was = fromPage ? ids.map((id) => findObj(fromPage, id)) : [];
      const ok = was.every((o): o is Obj => o !== undefined) && was.length > 0;
      const start = ok ? boundsOf(was) : box;
      const e = resizeObjects(page.id, ids, start, { ...start, ...patch }, s.plotSizing);
      store.edit(e, { coalesce: k, keepSelection: true, ...(ok && from ? { from } : {}) });
    } else
      store.edit(moveObjects(page.id, ids, to.x - box.x, to.y - box.y), {
        coalesce: k,
        keepSelection: true,
      });
  };

  return (
    <>
      <Section title={one ? (one.name ?? cap(one.type)) : `${String(sel.length)} objects`}>
        <div className="grid2">
          <Num
            label={`X`}
            value={toUnit(box.x, u)}
            onChange={(v) => {
              setBox({ x: fromUnit(v, u) }, 'x');
            }}
            step={0.5}
          />
          <Num
            label={`Y`}
            value={toUnit(box.y, u)}
            onChange={(v) => {
              setBox({ y: fromUnit(v, u) }, 'y');
            }}
            step={0.5}
          />
          <Num
            label={`W`}
            value={toUnit(box.w, u)}
            min={0.1}
            onChange={(v) => {
              setBox({ w: Math.max(0.1, fromUnit(v, u)) }, 'w');
            }}
            step={0.5}
          />
          <Num
            label={`H`}
            value={toUnit(box.h, u)}
            min={0.1}
            onChange={(v) => {
              setBox({ h: Math.max(0.1, fromUnit(v, u)) }, 'h');
            }}
            step={0.5}
          />
          {one && one.type !== 'group' && one.type !== 'panel' && (
            <Num
              label="Rotate °"
              value={one.frame.rotation}
              onChange={(v) => {
                const c = center(boundsOf([one]));
                edit(s, ids, 'rot', 'Rotate', (o) =>
                  rotateObj(o, c, normAngle(v - o.frame.rotation)),
                );
              }}
            />
          )}
          <Num
            label="Opacity %"
            value={Math.round((one?.opacity ?? 1) * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => {
              edit(s, ids, 'opacity', 'Opacity', (o) => ({
                ...o,
                opacity: Math.min(1, Math.max(0, v / 100)),
              }));
            }}
          />
        </div>
        <p className="note" style={{ margin: '4px 0' }}>
          {formatLength(box.w, u)} × {formatLength(box.h, u)} {u}
        </p>
        {hasPlot && (
          <div className="row">
            <label title="Resizing an imported plot scales its axes and data only: its text, line widths and tick lengths stay as they are (remembered in this browser)">
              <input
                type="checkbox"
                checked={s.plotSizing === 'keep'}
                onChange={(e) => {
                  store.setPlotSizing(e.target.checked ? 'keep' : 'scale');
                }}
              />{' '}
              Keep plot text and line sizes
            </label>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            title="Flip horizontally"
            onClick={() => store.edit(flipObjects(page.id, ids, 'x', sel))}
          >
            ⇋ Flip H
          </button>
          <button
            type="button"
            title="Flip vertically"
            onClick={() => store.edit(flipObjects(page.id, ids, 'y', sel))}
          >
            ⇵ Flip V
          </button>
          <button
            type="button"
            title="Bring to front (])"
            onClick={() => store.edit(reorderObjects(page.id, ids, 'front'))}
          >
            Front
          </button>
          <button
            type="button"
            title="Send to back ([)"
            onClick={() => store.edit(reorderObjects(page.id, ids, 'back'))}
          >
            Back
          </button>
        </div>
        {sel.length > 1 && refObj && (
          <div className="row" style={{ flexWrap: 'wrap' }} aria-label="Match size">
            {(
              [
                ['Same width', 'Match width to the first selected object', 'w'],
                ['Same height', 'Match height to the first selected object', 'h'],
                ['Same size', 'Match width and height to the first selected object', 'wh'],
              ] as const
            ).map(([text, title, dims]) => (
              <button
                key={dims}
                type="button"
                title={title}
                onClick={() => {
                  const ref = objBounds(refObj);
                  store.edit(
                    matchSize(
                      page.id,
                      sel,
                      {
                        ...(dims.includes('w') ? { w: ref.w } : {}),
                        ...(dims.includes('h') ? { h: ref.h } : {}),
                      },
                      s.plotSizing,
                    ),
                    { keepSelection: true },
                  );
                }}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        {sel.length > 1 && (
          <div className="row">
            <button
              type="button"
              title={withKey(
                'Lay the selection out in rows and columns, each in a lettered panel',
                'grid',
                resolveBindings(s.keyBindings),
              )}
              onClick={onArrangeGrid}
            >
              Arrange in grid…
            </button>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap' }} aria-label="Align">
          {(
            [
              ['left', '⇤', 'Align left'],
              ['hcenter', '↔', 'Align centres'],
              ['right', '⇥', 'Align right'],
              ['top', '⤒', 'Align top'],
              ['vcenter', '↕', 'Align middles'],
              ['bottom', '⤓', 'Align bottom'],
            ] as const
          ).map(([edge, glyph, title]) => (
            <button
              key={edge}
              type="button"
              className="icon"
              title={sel.length === 1 ? `${title} (to the page)` : title}
              aria-label={title}
              onClick={() =>
                store.edit(
                  alignObjects(page.id, sel, edge, pageBox, drawnBoundsIn(fig.doc.palette)),
                )
              }
            >
              {glyph}
            </button>
          ))}
          {sel.length > 2 && (
            <>
              <button
                type="button"
                title="Distribute horizontally"
                onClick={() =>
                  store.edit(distributeObjects(page.id, sel, 'x', drawnBoundsIn(fig.doc.palette)))
                }
              >
                ⋯
              </button>
              <button
                type="button"
                title="Distribute vertically"
                onClick={() =>
                  store.edit(distributeObjects(page.id, sel, 'y', drawnBoundsIn(fig.doc.palette)))
                }
              >
                ⋮
              </button>
            </>
          )}
        </div>
        <div className="row">
          {sel.length > 1 && (
            <button type="button" onClick={() => store.edit(groupObjects(page.id, ids))}>
              Group (Ctrl+G)
            </button>
          )}
          {sel.some((o) => o.type === 'group') && (
            <button type="button" onClick={() => store.edit(ungroupObjects(page.id, ids))}>
              Ungroup
            </button>
          )}
        </div>
      </Section>

      {first && (
        <Section title="Style">
          {styled.some(
            (o) => o.type === 'rect' || o.type === 'ellipse' || (o.type === 'path' && o.closed),
          ) && (
            <ColorInput
              label="Fill"
              value={first.style.fill}
              palette={fig.doc.palette}
              allowNone
              onChange={(p) => {
                restyle(s, styled, 'fill', 'Fill colour', { fill: p });
              }}
            />
          )}
          <ColorInput
            label="Stroke"
            value={first.style.stroke}
            palette={fig.doc.palette}
            allowNone={!styled.some((o) => o.type === 'arrow')}
            onChange={(p) => {
              restyle(s, styled, 'stroke', 'Stroke colour', { stroke: p });
            }}
          />
          <div className="grid2">
            <Num
              label="Width (pt)"
              value={first.style.strokeWidth}
              min={0}
              step={0.25}
              onChange={(v) => {
                restyle(s, styled, 'sw', 'Stroke width', { strokeWidth: Math.max(0, v) });
              }}
            />
            <label>
              Dash
              <select
                aria-label="Dash"
                value={
                  first.style.dash === undefined
                    ? 'solid'
                    : first.style.dash[0] === first.style.strokeWidth
                      ? 'dotted'
                      : 'dashed'
                }
                onChange={(e) => {
                  const w = Math.max(first.style.strokeWidth, 0.5);
                  edit(
                    s,
                    styled.map((o) => o.id),
                    'dash',
                    'Dash',
                    (o) => {
                      if (!('style' in o)) return o;
                      const { dash: _d, ...rest } = o.style;
                      if (e.target.value === 'solid') return { ...o, style: rest };
                      return {
                        ...o,
                        style: {
                          ...rest,
                          dash: e.target.value === 'dotted' ? [w, w * 2] : [w * 4, w * 2],
                        },
                      };
                    },
                  );
                }}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
            {one?.type === 'rect' && (
              <Num
                label="Corner (pt)"
                value={one.rx}
                min={0}
                onChange={(v) => {
                  edit(s, ids, 'rx', 'Corner radius', (o) =>
                    o.type === 'rect' ? { ...o, rx: Math.max(0, v) } : o,
                  );
                }}
              />
            )}
          </div>
        </Section>
      )}

      <TextAndLinesSection s={s} sel={sel} />

      {one?.type === 'arrow' && <ArrowSection s={s} arrow={one} />}
      {one?.type === 'text' && <TextSection s={s} text={one} />}
      {one?.type === 'icon' && <IconSection s={s} icon={one} />}
      {one?.type === 'panel' && <PanelSection s={s} panel={one} />}
      {one?.type === 'image' && <ImageSection s={s} image={one} />}
      {one?.type === 'embedded' && <EmbeddedSection obj={one} />}
      {one?.type === 'procedural' && <ProceduralSection s={s} obj={one} />}
      {one?.type === 'path' && <PathKindsSection s={s} path={one} />}
    </>
  );
}

const TEXT_TARGETS: readonly (readonly [TextTarget, string])[] = [
  ['all', 'All text'],
  ['tick', 'Plot tick labels'],
  ['label', 'Other plot text (titles, legends)'],
];
const LINE_TARGETS: readonly (readonly [LineTarget, string])[] = [
  ['all', 'All lines'],
  ['tick', 'Plot ticks'],
  ['axis', 'Plot axes and grid lines'],
  ['data', 'Other plot lines (data, legends)'],
];

/**
 * Fonts, text sizes and line widths across the selection, reaching inside
 * imported plots (note 16): shown for an imported plot or several objects.
 */
function TextAndLinesSection({ s, sel }: { s: AppState; sel: readonly Obj[] }) {
  const [textTarget, setTextTarget] = useState<TextTarget>('all');
  const [lineTarget, setLineTarget] = useState<LineTarget>('all');
  const fig = figure(s);
  const page = currentPage(s);
  const targets = styleTargets(sel);
  const hasPlot = targets.some((o) => plotOf(o, fig.assets) !== null);
  const tt = hasPlot ? textTarget : 'all';
  const lt = hasPlot ? lineTarget : 'all';
  const cur = currentStyle(sel, fig.assets, tt, lt);
  const anyText = hasPlot || targets.some((o) => o.type === 'text');
  const anyLine = hasPlot || targets.some((o) => 'style' in o);
  if (!(hasPlot || (sel.length > 1 && (anyText || anyLine)))) return null;
  const ref = sel[0];
  const refSample = ref ? styleSample(ref, fig.assets) : null;
  const canMatch =
    sel.length > 1 &&
    refSample !== null &&
    (refSample.text !== undefined || refSample.line !== undefined);
  const ids = sel.map((o) => o.id);
  const apply = (change: StyleChange, field: string, label: string) => {
    store.edit(setStyles(page.id, sel, { ...change, textTarget: tt, lineTarget: lt }, label), {
      coalesce: key(`style-${field}-${tt}-${lt}`, ids),
      keepSelection: true,
    });
  };
  return (
    <Section title="Text and lines">
      {hasPlot && (
        <div className="row">
          <label htmlFor="style-text-target">Text</label>
          <select
            id="style-text-target"
            value={tt}
            onChange={(e) => {
              setTextTarget(e.target.value as TextTarget);
            }}
          >
            {TEXT_TARGETS.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </div>
      )}
      {cur.text && (
        <div className="grid2">
          <label>
            Font
            <select
              aria-label="Font of the text"
              value={cur.text.font}
              onChange={(e) => {
                apply({ font: e.target.value as FontId }, 'font', 'Font');
              }}
            >
              {FONT_IDS.map((f) => (
                <option key={f} value={f}>
                  {cap(f)}
                </option>
              ))}
            </select>
          </label>
          <Num
            label="Text size (pt)"
            value={cur.text.size}
            min={1}
            step={0.5}
            onChange={(v) => {
              if (v > 0) apply({ size: v }, 'size', 'Font size');
            }}
          />
        </div>
      )}
      {hasPlot && (
        <div className="row">
          <label htmlFor="style-line-target">Lines</label>
          <select
            id="style-line-target"
            value={lt}
            onChange={(e) => {
              setLineTarget(e.target.value as LineTarget);
            }}
          >
            {LINE_TARGETS.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </div>
      )}
      {cur.line !== undefined && (
        <div className="grid2">
          <Num
            label="Line width (pt)"
            value={cur.line}
            min={0}
            step={0.25}
            onChange={(v) => {
              if (v > 0) apply({ lineWidth: v }, 'width', 'Line width');
            }}
          />
        </div>
      )}
      {sel.length > 1 && (
        <div className="row">
          <button
            type="button"
            disabled={!canMatch}
            title="Give every selected object the fonts, text sizes and line widths of the first selected object"
            onClick={() => {
              store.edit(matchStyles(page.id, sel), { keepSelection: true });
            }}
          >
            Same text and lines
          </button>
        </div>
      )}
    </Section>
  );
}

function EmbeddedSection({ obj }: { obj: Extract<Obj, { type: 'embedded' }> }) {
  const bsig = recipeFile(obj);
  return (
    <Section title={`From ${obj.source.app}`}>
      <p className="note">
        Drawn from the picture {obj.source.app} made, at its own size. To change the graph, edit it
        in {obj.source.app} and import it again.
      </p>
      {bsig !== null && (
        <div className="row">
          <button
            type="button"
            onClick={() => {
              download(bsig, `${safeName(obj.name ?? 'graph')}.bsig`, 'application/json');
            }}
          >
            Download .bsig for BarelySig
          </button>
        </div>
      )}
    </Section>
  );
}

function ArrowSection({ s, arrow }: { s: AppState; arrow: Extract<Obj, { type: 'arrow' }> }) {
  const ids = [arrow.id];
  const [a, b] = [arrow.nodes[0], arrow.nodes[arrow.nodes.length - 1]];
  const bend = (() => {
    if (arrow.nodes.length !== 2 || !a || !b || !a.out) return 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = a.out.x - (a.x + dx / 3);
    const oy = a.out.y - (a.y + dy / 3);
    return Math.round(((ox * -dy + oy * dx) / len / len) * 100);
  })();
  const setHead = (end: 'start' | 'end', patch: Partial<{ kind: HeadKind; size: number }>) => {
    edit(s, ids, `head-${end}`, end === 'start' ? 'Start head' : 'End head', (o) =>
      o.type === 'arrow' ? { ...o, [end]: { ...o[end], ...patch } } : o,
    );
  };
  return (
    <Section title="Arrow">
      {(['start', 'end'] as const).map((end) => (
        <div className="row" key={end}>
          <label htmlFor={`head-${end}`}>{end === 'start' ? 'Start' : 'End'}</label>
          <select
            id={`head-${end}`}
            value={arrow[end].kind}
            onChange={(e) => {
              setHead(end, { kind: e.target.value as HeadKind });
            }}
          >
            {HEAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {HEAD_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      ))}
      {(['start', 'end'] as const).map((end) => {
        const id = arrow.bind?.[end];
        if (id === undefined) return null;
        const t = findObj(currentPage(s), id);
        return (
          <div className="row" key={`bind-${end}`}>
            <span className="muted" data-testid={`bound-${end}`}>
              {end === 'start' ? 'Start' : 'End'} attached to {t?.name ?? cap(t?.type ?? 'object')}
            </span>
            <button
              type="button"
              aria-label={`Detach the ${end === 'start' ? 'start' : 'end'} of the arrow`}
              onClick={() => {
                store.edit(
                  updateObjects(currentPage(s).id, ids, 'Detach arrow', (o) => {
                    if (o.type !== 'arrow' || !o.bind) return o;
                    const { [end]: _gone, ...rest } = o.bind;
                    const { bind: _b, ...plain } = o;
                    return Object.keys(rest).length > 0 ? { ...o, bind: rest } : plain;
                  }),
                  { keepSelection: true },
                );
              }}
            >
              Detach
            </button>
          </div>
        );
      })}
      <div className="grid2">
        <Num
          label="Head size"
          value={arrow.end.size}
          min={1}
          max={20}
          step={0.5}
          onChange={(v) => {
            edit(s, ids, 'head-size', 'Head size', (o) =>
              o.type === 'arrow'
                ? { ...o, start: { ...o.start, size: v }, end: { ...o.end, size: v } }
                : o,
            );
          }}
        />
        {arrow.nodes.length === 2 && (
          <Num
            label="Curve %"
            value={bend}
            min={-100}
            max={100}
            step={5}
            onChange={(v) => {
              edit(s, ids, 'bend', 'Curve arrow', (o) => {
                if (o.type !== 'arrow' || o.nodes.length !== 2) return o;
                const [p, q] = o.nodes;
                if (!p || !q) return o;
                const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
                const nx = (-(q.y - p.y) / len) * len * (v / 100);
                const ny = ((q.x - p.x) / len) * len * (v / 100);
                const c1 = { x: p.x + (q.x - p.x) / 3 + nx, y: p.y + (q.y - p.y) / 3 + ny };
                const c2 = {
                  x: p.x + ((q.x - p.x) * 2) / 3 + nx,
                  y: p.y + ((q.y - p.y) * 2) / 3 + ny,
                };
                const nodes =
                  v === 0
                    ? [
                        { x: p.x, y: p.y },
                        { x: q.x, y: q.y },
                      ]
                    : [
                        { x: p.x, y: p.y, out: c1 },
                        { x: q.x, y: q.y, in: c2 },
                      ];
                return rebase({ ...o, nodes });
              });
            }}
          />
        )}
      </div>
    </Section>
  );
}

function TextSection({ s, text }: { s: AppState; text: Extract<Obj, { type: 'text' }> }) {
  const ids = [text.id];
  const firstRun = text.runs[0]?.[0];
  const allRuns = (
    fn: (r: NonNullable<typeof firstRun>) => NonNullable<typeof firstRun>,
    field: string,
    label: string,
  ) => {
    edit(s, ids, field, label, (o) =>
      o.type === 'text' ? { ...o, runs: o.runs.map((p) => p.map(fn)) } : o,
    );
  };
  return (
    <Section title="Text">
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            store.editText(text.id);
          }}
        >
          Edit text
        </button>
      </div>
      <div className="row">
        <label htmlFor="text-font">Font</label>
        <select
          id="text-font"
          value={firstRun?.font ?? 'arimo'}
          onChange={(e) => {
            allRuns((r) => ({ ...r, font: e.target.value as FontId }), 'font', 'Font');
          }}
        >
          {FONT_IDS.map((f) => (
            <option key={f} value={f}>
              {cap(f)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid2">
        <Num
          label="Size (pt)"
          value={firstRun?.size ?? 10}
          min={2}
          step={0.5}
          onChange={(v) => {
            allRuns((r) => ({ ...r, size: v }), 'size', 'Font size');
          }}
        />
        <label>
          Align
          <select
            aria-label="Align"
            value={text.align}
            onChange={(e) => {
              edit(s, ids, 'align', 'Text alignment', (o) =>
                o.type === 'text' ? { ...o, align: e.target.value as TextAlign } : o,
              );
            }}
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={text.autoWidth}
            onChange={(e) => {
              edit(s, ids, 'autow', 'Auto width', (o) =>
                o.type === 'text' ? { ...o, autoWidth: e.target.checked } : o,
              );
            }}
          />
          Auto width
        </label>
        <Num
          label="Line height"
          value={text.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          onChange={(v) => {
            edit(s, ids, 'lh', 'Line height', (o) =>
              o.type === 'text' ? { ...o, lineHeight: v } : o,
            );
          }}
        />
      </div>
      <ColorInput
        label="Colour"
        value={firstRun?.color ?? null}
        palette={figure(s).doc.palette}
        onChange={(p) => {
          if (p) allRuns((r) => ({ ...r, color: p }), 'color', 'Text colour');
        }}
      />
    </Section>
  );
}

function IconSection({ s, icon }: { s: AppState; icon: Extract<Obj, { type: 'icon' }> }) {
  const fig = figure(s);
  const asset = fig.assets[icon.asset];
  if (asset?.kind !== 'icon') return null;
  const ids = [icon.id];
  return (
    <Section title="Icon colours">
      {asset.slots.map((slot) => (
        <ColorInput
          key={slot.id}
          label={slot.label}
          value={icon.slots[slot.id] ?? { hex: slot.default }}
          palette={fig.doc.palette}
          onChange={(p: Paint | null) => {
            if (p)
              edit(s, ids, `slot-${slot.id}`, `Recolour ${slot.label.toLowerCase()}`, (o) =>
                o.type === 'icon' ? { ...o, slots: { ...o.slots, [slot.id]: p } } : o,
              );
          }}
        />
      ))}
      <div className="row">
        <button
          type="button"
          disabled={Object.keys(icon.slots).length === 0}
          onClick={() => {
            edit(s, ids, 'slot-reset', 'Reset icon colours', (o) =>
              o.type === 'icon' ? { ...o, slots: {} } : o,
            );
          }}
        >
          Reset colours
        </button>
      </div>
      <p className="note">
        {asset.meta.title} · {asset.meta.source}
        {asset.meta.author ? `, ${asset.meta.author}` : ''} · {asset.meta.license}
        {asset.meta.shareAlike ? ' (share-alike)' : ''}
      </p>
      {Object.keys(icon.slots).length > 0 && needsModifiedNote(asset.meta.license) && (
        <p className="note">
          Recoloured: the credit line calls it “modified”, as its licence asks.
        </p>
      )}
    </Section>
  );
}

function PanelSection({ s, panel }: { s: AppState; panel: Extract<Obj, { type: 'panel' }> }) {
  const ids = [panel.id];
  return (
    <Section title="Panel">
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={panel.autoLabel}
            onChange={(e) => {
              edit(s, ids, 'auto', 'Panel label', (o) =>
                o.type === 'panel' ? { ...o, autoLabel: e.target.checked } : o,
              );
            }}
          />{' '}
          Automatic label
        </label>
      </div>
      {!panel.autoLabel && (
        <div className="row">
          <label htmlFor="panel-label">Label</label>
          <input
            id="panel-label"
            type="text"
            value={panel.label}
            onChange={(e) => {
              const label = e.target.value;
              edit(s, ids, 'label', 'Panel label', (o) =>
                o.type === 'panel' ? { ...o, label } : o,
              );
            }}
          />
        </div>
      )}
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={panel.showLabel}
            onChange={(e) => {
              edit(s, ids, 'show', 'Show label', (o) =>
                o.type === 'panel' ? { ...o, showLabel: e.target.checked } : o,
              );
            }}
          />{' '}
          Show label
        </label>
      </div>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={panel.showBorder}
            onChange={(e) => {
              edit(s, ids, 'border', 'Panel border', (o) =>
                o.type === 'panel' ? { ...o, showBorder: e.target.checked } : o,
              );
            }}
          />{' '}
          Show border
        </label>
      </div>
    </Section>
  );
}

function ImageSection({ s, image }: { s: AppState; image: Extract<Obj, { type: 'image' }> }) {
  const asset = figure(s).assets[image.asset];
  if (!asset || asset.kind === 'icon') return null;
  return (
    <Section title={asset.kind === 'image' ? 'Image' : 'Imported SVG'}>
      <p className="note">{asset.meta.name}</p>
      <div className="row">
        <label htmlFor="credit">Credit</label>
        <input
          id="credit"
          type="text"
          placeholder="e.g. Photo: A. Author"
          value={asset.meta.credit ?? ''}
          onChange={(e) => {
            const credit = e.target.value;
            store.edit(
              {
                label: 'Image credit',
                apply: (f) => {
                  const a = f.assets[image.asset];
                  if (!a || a.kind === 'icon') return f;
                  const { credit: _c, ...meta } = a.meta;
                  return {
                    ...f,
                    assets: {
                      ...f.assets,
                      [image.asset]: {
                        ...a,
                        meta: credit.trim() === '' ? meta : { ...meta, credit },
                      },
                    },
                  };
                },
              },
              { coalesce: `credit:${image.asset}` },
            );
          }}
        />
      </div>
      {asset.kind === 'image' && (
        <div className="row">
          <button
            type="button"
            title="Add lane labels and ladder sizes over this gel picture, grouped with it"
            onClick={() => {
              if (store.edit(labelGelImage(currentPage(s).id, image)))
                analytics.track('procedural', 'gel-labels');
            }}
          >
            Label gel lanes
          </button>
          <button
            type="button"
            title="Add a scale bar calibrated from this picture's pixel size, grouped with it"
            onClick={() => {
              if (store.edit(addScaleBar(currentPage(s).id, image)))
                analytics.track('procedural', 'scale-bar');
            }}
          >
            Add scale bar
          </button>
        </div>
      )}
    </Section>
  );
}
