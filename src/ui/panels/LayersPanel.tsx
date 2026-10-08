/** Layers (note 01): the page's layers, top first, each with its objects; select, hide, lock, reorder. */
import { useState } from 'react';

import { addLayer, deleteLayer, moveLayer, updateLayer, updateObjects } from '@/core/edits/edits';
import type { Id } from '@/core/model/ids';
import type { Layer, Obj } from '@/core/model/types';
import { plainText } from '@/core/text/layout';

import { currentPage, store } from '../state/store';
import { useAppState } from '../state/useAppState';

function objName(o: Obj): string {
  if (o.name) return o.name;
  if (o.type === 'text') return `“${plainText(o).slice(0, 24)}”`;
  return o.type.charAt(0).toUpperCase() + o.type.slice(1);
}

function ObjRow({
  o,
  depth,
  selected,
  pageId,
}: {
  o: Obj;
  depth: number;
  selected: ReadonlySet<Id>;
  pageId: Id;
}) {
  const [open, setOpen] = useState(false);
  const kids = o.type === 'group' || o.type === 'panel' ? o.children : [];
  return (
    <li>
      <div
        className={`item${selected.has(o.id) ? ' selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={(e) => {
          const cur = store.getState().selection;
          store.select(
            e.shiftKey
              ? cur.includes(o.id)
                ? cur.filter((x) => x !== o.id)
                : [...cur, o.id]
              : [o.id],
          );
        }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <span className="name">{objName(o)}</span>
        <button
          type="button"
          title={o.hidden ? 'Show' : 'Hide'}
          aria-label={`${o.hidden ? 'Show' : 'Hide'} ${objName(o)}`}
          onClick={(e) => {
            e.stopPropagation();
            store.edit(
              updateObjects(pageId, [o.id], o.hidden ? 'Show' : 'Hide', (x) =>
                x.hidden ? (({ hidden: _h, ...rest }) => rest)(x) : { ...x, hidden: true },
              ),
            );
          }}
        >
          {o.hidden ? '◌' : '●'}
        </button>
        <button
          type="button"
          title={o.locked ? 'Unlock' : 'Lock'}
          aria-label={`${o.locked ? 'Unlock' : 'Lock'} ${objName(o)}`}
          onClick={(e) => {
            e.stopPropagation();
            store.edit(
              updateObjects(pageId, [o.id], o.locked ? 'Unlock' : 'Lock', (x) =>
                x.locked ? (({ locked: _l, ...rest }) => rest)(x) : { ...x, locked: true },
              ),
            );
          }}
        >
          {o.locked ? '🔒' : '🔓'}
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {[...kids].reverse().map((c) => (
            <ObjRow key={c.id} o={c} depth={depth + 1} selected={selected} pageId={pageId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LayerBlock({
  l,
  pageId,
  selected,
  canDelete,
}: {
  l: Layer;
  pageId: Id;
  selected: ReadonlySet<Id>;
  canDelete: boolean;
}) {
  return (
    <li>
      <div className="item layer-head">
        <span
          className="name"
          title="Double-click to rename"
          onDoubleClick={() => {
            const name = prompt('Layer name', l.name);
            if (name !== null && name.trim() !== '')
              store.edit(
                updateLayer(pageId, l.id, 'Rename layer', (x) => ({ ...x, name: name.trim() })),
              );
          }}
        >
          {l.name}
        </span>
        <button
          type="button"
          title="Raise layer"
          aria-label={`Raise ${l.name}`}
          onClick={() => store.edit(moveLayer(pageId, l.id, 1))}
        >
          ↑
        </button>
        <button
          type="button"
          title="Lower layer"
          aria-label={`Lower ${l.name}`}
          onClick={() => store.edit(moveLayer(pageId, l.id, -1))}
        >
          ↓
        </button>
        <button
          type="button"
          title={l.visible ? 'Hide layer' : 'Show layer'}
          aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`}
          onClick={() =>
            store.edit(
              updateLayer(pageId, l.id, l.visible ? 'Hide layer' : 'Show layer', (x) => ({
                ...x,
                visible: !x.visible,
              })),
            )
          }
        >
          {l.visible ? '●' : '◌'}
        </button>
        <button
          type="button"
          title={l.locked ? 'Unlock layer' : 'Lock layer'}
          aria-label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name}`}
          onClick={() =>
            store.edit(
              updateLayer(pageId, l.id, l.locked ? 'Unlock layer' : 'Lock layer', (x) => ({
                ...x,
                locked: !x.locked,
              })),
            )
          }
        >
          {l.locked ? '🔒' : '🔓'}
        </button>
        {canDelete && (
          <button
            type="button"
            title="Delete layer"
            aria-label={`Delete ${l.name}`}
            onClick={() => {
              if (confirm(`Delete ${l.name} and its objects?`))
                store.edit(deleteLayer(pageId, l.id));
            }}
          >
            ✕
          </button>
        )}
      </div>
      <ul>
        {[...l.children].reverse().map((o) => (
          <ObjRow key={o.id} o={o} depth={1} selected={selected} pageId={pageId} />
        ))}
      </ul>
    </li>
  );
}

export function LayersPanel() {
  const s = useAppState();
  const page = currentPage(s);
  const selected = new Set(s.selection);
  return (
    <section className="section layers" aria-label="Layers">
      <h2 style={{ display: 'flex', justifyContent: 'space-between' }}>
        Layers
        <button type="button" onClick={() => store.edit(addLayer(page.id))}>
          + Layer
        </button>
      </h2>
      <ul>
        {[...page.layers].reverse().map((l) => (
          <LayerBlock
            key={l.id}
            l={l}
            pageId={page.id}
            selected={selected}
            canDelete={page.layers.length > 1}
          />
        ))}
      </ul>
    </section>
  );
}
