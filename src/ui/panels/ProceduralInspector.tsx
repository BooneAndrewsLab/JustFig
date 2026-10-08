/**
 * The Inspector of a procedural object, generated from its kind's fields
 * (note 04): no kind has UI code of its own. Every control is a named edit;
 * typing in one field merges into one undo step.
 */
import { useState } from 'react';

import { updateObjects } from '@/core/edits/edits';
import type { Id } from '@/core/model/ids';
import type { Paint, PathObj, Procedural } from '@/core/model/types';
import { convertObjects, makeFromPath, setParams } from '@/procedural/edits';
import { visibleFields } from '@/procedural/params';
import { allKinds, resolveProcedural } from '@/procedural/registry';
import type {
  Field,
  Item,
  ListField,
  ParamValue,
  Params,
  Scalar,
  ScalarField,
  WellMap,
} from '@/procedural/types';

import { analytics } from '../analytics';
import { type AppState, currentPage, figure, store } from '../state/store';
import { ColorInput } from './ColorInput';
import { WellMapEditor } from './WellMapEditor';

const fieldKey = (id: Id, field: string) => `param:${field}:${id}`;

function setParam(
  s: AppState,
  o: Procedural,
  field: string,
  label: string,
  fn: (p: Params) => Params,
) {
  store.edit(setParams(currentPage(s).id, o.id, label, fn), {
    coalesce: fieldKey(o.id, field),
    keepSelection: true,
  });
}

/** One scalar control (also used inside list rows). */
function ScalarControl({
  f,
  value,
  onChange,
  idPrefix,
}: {
  f: ScalarField;
  value: Scalar;
  onChange: (v: Scalar) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${f.key}`;
  switch (f.type) {
    case 'number':
    case 'int':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <input
            id={id}
            type="number"
            value={typeof value === 'number' ? Math.round(value * 100) / 100 : ''}
            min={f.min}
            max={f.max}
            step={f.step ?? (f.type === 'int' ? 1 : 0.5)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
            }}
          />
          {f.unit && <span className="note">{f.unit}</span>}
        </div>
      );
    case 'enum':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <select
            id={id}
            value={String(value)}
            onChange={(e) => {
              const o = f.options.find((x) => String(x.value) === e.target.value);
              if (o) onChange(o.value);
            }}
          >
            {f.options.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'bool':
      return (
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => {
                onChange(e.target.checked);
              }}
            />{' '}
            {f.label}
          </label>
        </div>
      );
    case 'text':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : ''}
            maxLength={f.maxLength}
            {...(f.placeholder ? { placeholder: f.placeholder } : {})}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        </div>
      );
    case 'color': {
      const hex = typeof value === 'string' ? value : '';
      return (
        <>
          <ColorInput
            label={f.label}
            value={hex === '' ? null : { hex }}
            palette={[]}
            allowNone={f.auto === true}
            onChange={(p: Paint | null) => {
              onChange(p === null ? '' : 'hex' in p ? p.hex : f.default);
            }}
          />
          {f.auto === true && hex === '' && <p className="note">Automatic colour</p>}
        </>
      );
    }
  }
}

function ListControl({
  f,
  items,
  params,
  onChange,
  idPrefix,
}: {
  f: ListField;
  items: readonly Item[];
  params: Params;
  onChange: (items: readonly Item[], what: string) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    const a = items[i];
    const b = items[j];
    if (!a || !b) return;
    const next = [...items];
    next[i] = b;
    next[j] = a;
    onChange(next, `Reorder ${f.label.toLowerCase()}`);
    setOpen(j);
  };
  return (
    <div className="param-list" aria-label={f.label}>
      <div className="row">
        <label>{f.label}</label>
        <span className="note">{items.length}</span>
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={open === i ? 'open' : undefined}>
            <div className="row">
              <button
                type="button"
                className="link item-title"
                aria-expanded={open === i}
                onClick={() => {
                  setOpen(open === i ? null : i);
                }}
              >
                {f.itemTitle(it, i)}
              </button>
              <span className="spacer" style={{ flex: 1 }} />
              <button
                type="button"
                title="Move up"
                aria-label={`Move ${f.itemTitle(it, i)} up`}
                disabled={i === 0}
                onClick={() => {
                  move(i, -1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                aria-label={`Move ${f.itemTitle(it, i)} down`}
                disabled={i === items.length - 1}
                onClick={() => {
                  move(i, 1);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                title="Remove"
                aria-label={`Remove ${f.itemTitle(it, i)}`}
                disabled={items.length <= f.min}
                onClick={() => {
                  onChange(
                    items.filter((_, j) => j !== i),
                    `Remove ${f.label.toLowerCase()}`,
                  );
                  setOpen(null);
                }}
              >
                ✕
              </button>
            </div>
            {open === i &&
              f.item.map((sf) => (
                <ScalarControl
                  key={sf.key}
                  f={sf}
                  idPrefix={`${idPrefix}-${String(i)}`}
                  value={it[sf.key] ?? sf.default}
                  onChange={(v) => {
                    onChange(
                      items.map((x, j) => (j === i ? { ...x, [sf.key]: v } : x)),
                      `${sf.label} (${f.label.toLowerCase()})`,
                    );
                  }}
                />
              ))}
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          type="button"
          disabled={items.length >= f.max}
          onClick={() => {
            onChange([...items, f.newItem(params, items)], `Add ${f.label.toLowerCase()}`);
            setOpen(items.length);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function FieldControl({
  s,
  o,
  f,
  params,
}: {
  s: AppState;
  o: Procedural;
  f: Field;
  params: Params;
}) {
  const v: ParamValue | undefined = params[f.key];
  const idPrefix = `p-${o.id}`;
  const set = (value: ParamValue, label: string, field = f.key) => {
    setParam(s, o, field, label, (p) => ({ ...p, [f.key]: value }));
  };
  let control;
  if (f.type === 'list')
    control = (
      <ListControl
        f={f}
        items={Array.isArray(v) ? (v as readonly Item[]) : []}
        params={params}
        idPrefix={idPrefix}
        onChange={(items, what) => {
          set(items, what, `${f.key}:${what}`);
        }}
      />
    );
  else if (f.type === 'wellMap')
    control = (
      <WellMapEditor
        field={f}
        params={params}
        value={(v ?? {}) as WellMap}
        onChange={(m, what) => {
          set(m, what, `${f.key}:${what}`);
        }}
      />
    );
  else
    control = (
      <ScalarControl
        f={f}
        idPrefix={idPrefix}
        value={(v as Scalar | undefined) ?? f.default}
        onChange={(x) => {
          set(x, f.label);
        }}
      />
    );
  return (
    <>
      {control}
      {f.help && <p className="note">{f.help}</p>}
    </>
  );
}

export function ProceduralSection({ s, obj }: { s: AppState; obj: Procedural }) {
  const fig = figure(s);
  const page = currentPage(s);
  const r = resolveProcedural(obj);
  const convert = () => {
    if (store.edit(convertObjects(page.id, [obj], fig.doc.palette)))
      analytics.track('procedural', 'convert');
  };
  if (!r)
    return (
      <section className="section" aria-label="Procedural object">
        <h2>{obj.kind}</h2>
        <p className="note">
          Made with a newer version of this app (kind “{obj.kind}”, version {obj.kindVersion}). It
          is shown from its saved picture and kept as it is.
        </p>
        {obj.snapshot !== undefined && (
          <div className="row">
            <button type="button" onClick={convert}>
              Convert to picture
            </button>
          </div>
        )}
      </section>
    );
  const { kind, params } = r;
  const ids = [obj.id];
  return (
    <>
      <section className="section procedural" aria-label={kind.title}>
        <h2>{kind.title}</h2>
        {visibleFields(kind.fields, params).map((f) => (
          <FieldControl key={f.key} s={s} o={obj} f={f} params={params} />
        ))}
      </section>
      {kind.slots.length > 0 && (
        <section className="section" aria-label="Colours">
          <h2>Colours</h2>
          {kind.slots.map((slot) => (
            <ColorInput
              key={slot.id}
              label={slot.label}
              value={obj.slots[slot.id] ?? { hex: slot.default }}
              palette={fig.doc.palette}
              onChange={(p: Paint | null) => {
                if (p)
                  store.edit(
                    updateObjects(page.id, ids, `Recolour ${slot.label.toLowerCase()}`, (o) =>
                      o.type === 'procedural' ? { ...o, slots: { ...o.slots, [slot.id]: p } } : o,
                    ),
                    { coalesce: fieldKey(obj.id, `slot-${slot.id}`), keepSelection: true },
                  );
              }}
            />
          ))}
          <div className="row">
            <button
              type="button"
              disabled={Object.keys(obj.slots).length === 0}
              onClick={() => {
                store.edit(
                  updateObjects(page.id, ids, 'Reset colours', (o) =>
                    o.type === 'procedural' ? { ...o, slots: {} } : o,
                  ),
                  { keepSelection: true },
                );
              }}
            >
              Reset colours
            </button>
          </div>
        </section>
      )}
      <section className="section" aria-label="Shapes">
        <div className="row">
          <button
            type="button"
            title="Replace it by plain shapes you can edit one by one (it stops being editable as a whole)"
            onClick={convert}
          >
            Convert to shapes
          </button>
        </div>
      </section>
    </>
  );
}

/** For a drawn path: turn it into a membrane, helix or receptor row along it. */
export function PathKindsSection({ s, path }: { s: AppState; path: PathObj }) {
  const kinds = allKinds().filter((k) => k.usesPath);
  if (kinds.length === 0) return null;
  return (
    <section className="section" aria-label="Follow this path">
      <h2>Follow this path</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {kinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => {
              if (store.edit(makeFromPath(currentPage(s).id, path, k.kind)))
                analytics.track('procedural', 'from-path');
            }}
          >
            {k.title}
          </button>
        ))}
      </div>
    </section>
  );
}
