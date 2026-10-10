/**
 * Compare two saved versions, or a version and the figure now (note 23): side
 * by side or as an onion skin, drawn by the one renderer (`PageView`), with
 * the objects that differ outlined. A changed or removed object can be brought
 * back into the open figure from the version that had it.
 */
import { useEffect, useState } from 'react';

import { restoreObject } from '@/core/edits/restoreObject';
import { figureCounts } from '@/core/edits/version';
import { objBounds } from '@/core/geometry/transform';
import { type PageDiff, diffCount, diffDocuments, objectsById } from '@/core/model/diff';
import type { Id } from '@/core/model/ids';
import type { Figure, Obj, Page } from '@/core/model/types';
import type { NamedSummary } from '@/io/storage';

import { PageView } from '../canvas/PageView';
import { figure, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { loadVersion } from '../state/versions';
import { Dialog } from './Dialog';

const NOW = 'now';

interface Source {
  readonly id: string;
  readonly name: string;
  readonly figure: Figure;
  readonly isNow: boolean;
}

type Mode = 'side' | 'onion';
type Kind = 'added' | 'removed' | 'changed';

const KIND_COLOR: Record<Kind, string> = {
  added: '#1a9850',
  removed: '#d73027',
  changed: '#e08a00',
};
const KIND_LABEL: Record<Kind, string> = { added: 'Added', removed: 'Removed', changed: 'Changed' };

const counts = (f: Figure) => {
  const c = figureCounts(f);
  return `${String(c.pages)} page${c.pages === 1 ? '' : 's'}, ${String(c.objects)} object${c.objects === 1 ? '' : 's'}`;
};

const label = (o: Obj) => o.name ?? o.type;

interface Entry {
  readonly id: Id;
  readonly kind: Kind;
}

const entriesOf = (d: PageDiff | undefined): Entry[] =>
  d
    ? [
        ...d.changed.map((id) => ({ id, kind: 'changed' as const })),
        ...d.added.map((id) => ({ id, kind: 'added' as const })),
        ...d.removed.map((id) => ({ id, kind: 'removed' as const })),
      ]
    : [];

/** One side's page: the page itself plus outlines of what differs there. */
function PageSvg({
  fig,
  page,

  entries,
  selected,
  title,
  underlay,
}: {
  fig: Figure;
  page: Page | undefined;
  entries: readonly Entry[];
  selected: Id | null;
  title: string;
  /** Onion skin: the older page drawn at reduced opacity over this one. */
  underlay?: { fig: Figure; page: Page | undefined } | undefined;
}) {
  // The faded page keeps no background of its own, or it would wash out the page below.
  const faded = underlay?.page ? { ...underlay.page, background: null } : undefined;
  const shape = page ?? underlay?.page;
  if (!shape) return <p className="version-nopage">No such page</p>;
  const mine = page ? objectsById(page) : new Map<Id, Obj>();
  const theirs = underlay?.page ? objectsById(underlay.page) : new Map<Id, Obj>();
  return (
    <svg
      className="version-page"
      viewBox={`0 0 ${String(shape.size.w)} ${String(shape.size.h)}`}
      role="img"
      aria-label={title}
    >
      {page ? (
        <PageView page={page} figure={fig} />
      ) : (
        <rect width={shape.size.w} height={shape.size.h} fill="#ffffff" />
      )}
      {underlay && faded && (
        <g opacity={0.5} data-onion="older">
          <PageView page={faded} figure={underlay.fig} />
        </g>
      )}
      <g fill="none" pointerEvents="none">
        {entries.map((e) => {
          const o = mine.get(e.id) ?? theirs.get(e.id);
          if (!o) return null;
          const b = objBounds(o);
          const sel = e.id === selected;
          return (
            <rect
              key={e.id}
              data-diff={e.kind}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              stroke={KIND_COLOR[e.kind]}
              strokeWidth={sel ? 4 : 1.5}
              strokeDasharray={e.kind === 'removed' ? '5 3' : undefined}
            />
          );
        })}
      </g>
    </svg>
  );
}

export function CompareView({
  rows,
  first,
  firstFigure,
  onRestore,
  onBack,
}: {
  rows: readonly NamedSummary[];
  first: NamedSummary;
  firstFigure: Figure;
  /** Restore the whole of a saved version (asks first, in the parent). */
  onRestore: (row: NamedSummary) => void;
  onBack: () => void;
}) {
  const s = useAppState();
  const now = figure(s);
  const [loaded, setLoaded] = useState<Readonly<Record<string, Figure>>>({
    [first.id]: firstFigure,
  });
  const [olderId, setOlderId] = useState(first.id);
  const [newerId, setNewerId] = useState(NOW);
  const [mode, setMode] = useState<Mode>('side');
  const [pageId, setPageId] = useState<Id | null>(null);
  const [selected, setSelected] = useState<Id | null>(null);

  // A version picked in a menu is read when first chosen.
  useEffect(() => {
    let live = true;
    for (const id of [olderId, newerId]) {
      if (id === NOW || loaded[id]) continue;
      void loadVersion(id).then((v) => {
        if (!live) return;
        if (!v) {
          store.notify('That version can no longer be read.', 'error');
          setOlderId(first.id);
          setNewerId(NOW);
          return;
        }
        setLoaded((l) => ({ ...l, [id]: v.figure }));
      });
    }
    return () => {
      live = false;
    };
  }, [olderId, newerId, loaded, first.id]);

  const source = (id: string): Source | null => {
    if (id === NOW) return { id, name: 'Now', figure: now, isNow: true };
    const fig = loaded[id];
    const row = rows.find((r) => r.id === id);
    return fig && row ? { id, name: row.name, figure: fig, isNow: false } : null;
  };
  const older = source(olderId);
  const newer = source(newerId);

  const diffs = older && newer ? diffDocuments(older.figure.doc, newer.figure.doc) : [];
  const at = Math.max(
    0,
    diffs.findIndex((d) => d.pageId === (pageId ?? s.pageId)),
  );
  const d = diffs[at];
  const entries = entriesOf(d);
  const total = diffs.reduce((n, x) => n + diffCount(x), 0);
  const olderPage = older?.figure.doc.pages.find((p) => p.id === d?.pageId);
  const newerPage = newer?.figure.doc.pages.find((p) => p.id === d?.pageId);
  const olderObjs = olderPage ? objectsById(olderPage) : new Map<Id, Obj>();
  const newerObjs = newerPage ? objectsById(newerPage) : new Map<Id, Obj>();
  const sel = entries.find((e) => e.id === selected) ?? null;
  const pageInNow = now.doc.pages.some((p) => p.id === d?.pageId);

  const restoreFrom = (src: Source, o: Obj) => {
    if (!d) return;
    if (store.edit(restoreObject(d.pageId, o, src.figure, src.name)))
      store.notify(`Restored the ${label(o)} from “${src.name}”. Undo brings back what you had.`);
  };

  const sides = [older, newer] as const;
  const pickers = (
    <div className="row version-pickers">
      {(
        [
          ['Older', olderId, setOlderId],
          ['Newer', newerId, setNewerId],
        ] as const
      ).map(([text, value, set]) => (
        <label key={text}>
          {text}{' '}
          <select
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setSelected(null);
            }}
          >
            <option value={NOW}>Now (the open figure)</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );

  return (
    <Dialog title="Compare versions" onClose={onBack}>
      {pickers}
      {older && newer && (
        <p className="note">
          <strong>{older.name}</strong>: {counts(older.figure)}. {newer.name}:{' '}
          {counts(newer.figure)}. {String(total)} difference{total === 1 ? '' : 's'}.
        </p>
      )}
      <fieldset className="version-mode">
        <legend>View</legend>
        {(
          [
            ['side', 'Side by side'],
            ['onion', 'Onion skin'],
          ] as const
        ).map(([m, text]) => (
          <label key={m}>
            <input
              type="radio"
              name="compare-mode"
              checked={mode === m}
              onChange={() => {
                setMode(m);
              }}
            />{' '}
            {text}
          </label>
        ))}
      </fieldset>
      {diffs.length > 1 && (
        <div className="row version-pager">
          <button
            type="button"
            disabled={at === 0}
            onClick={() => {
              setPageId(diffs[at - 1]?.pageId ?? null);
              setSelected(null);
            }}
          >
            Previous page
          </button>
          <span aria-live="polite">
            Page {String(at + 1)} of {String(diffs.length)}
            {d ? `: ${d.name}` : ''}
          </span>
          <button
            type="button"
            disabled={at >= diffs.length - 1}
            onClick={() => {
              setPageId(diffs[at + 1]?.pageId ?? null);
              setSelected(null);
            }}
          >
            Next page
          </button>
        </div>
      )}
      {older && newer && d && mode === 'side' && (
        <div className="version-compare">
          <figure>
            <PageSvg
              fig={older.figure}
              page={olderPage}
              entries={entries.filter((e) => e.kind !== 'added')}
              selected={selected}
              title={`Page ${String(at + 1)} of ${older.name}`}
            />
            <figcaption>{older.name}</figcaption>
          </figure>
          <figure>
            <PageSvg
              fig={newer.figure}
              page={newerPage}
              entries={entries.filter((e) => e.kind !== 'removed')}
              selected={selected}
              title={`Page ${String(at + 1)} of ${newer.name}`}
            />
            <figcaption>{newer.name}</figcaption>
          </figure>
        </div>
      )}
      {older && newer && d && mode === 'onion' && (
        <div className="version-compare version-onion">
          <figure>
            <PageSvg
              fig={newer.figure}
              page={newerPage}
              underlay={{ fig: older.figure, page: olderPage }}
              entries={entries}
              selected={selected}
              title={`Page ${String(at + 1)}: ${older.name} over ${newer.name}`}
            />
            <figcaption>
              {older.name} (faded) over {newer.name}
            </figcaption>
          </figure>
        </div>
      )}
      <p className="note">
        Outlines:{' '}
        {(
          [
            ['changed', 'changed'],
            ['added', 'added (newer only)'],
            ['removed', 'removed (older only, dashed)'],
          ] as const
        ).map(([k, text]) => (
          <span key={k} className="version-key">
            <span
              className="version-swatch"
              aria-hidden="true"
              style={{
                borderColor: KIND_COLOR[k],
                borderStyle: k === 'removed' ? 'dashed' : 'solid',
              }}
            />
            {text}
          </span>
        ))}
      </p>
      {entries.length === 0 ? (
        <p>No differences on this page.</p>
      ) : (
        <ul className="recent-list version-changes" aria-label="Changed objects">
          {entries.map((e) => {
            const o = newerObjs.get(e.id) ?? olderObjs.get(e.id);
            return (
              <li key={e.id} className="recent-row">
                <button
                  type="button"
                  aria-pressed={e.id === selected}
                  onClick={() => {
                    setSelected(e.id === selected ? null : e.id);
                  }}
                >
                  {KIND_LABEL[e.kind]}: {o ? label(o) : e.id}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sel && (
        <div className="row version-object-actions">
          {sides.map((src, i) => {
            const o = (i === 0 ? olderObjs : newerObjs).get(sel.id);
            if (!src || src.isNow || !o) return null;
            return (
              <button
                key={src.id}
                type="button"
                disabled={!pageInNow}
                onClick={() => {
                  restoreFrom(src, o);
                }}
              >
                Restore this object from {src.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="actions">
        <button type="button" onClick={onBack}>
          Back
        </button>
        {older && !older.isNow && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              const row = rows.find((r) => r.id === older.id);
              if (row) onRestore(row);
            }}
          >
            Restore this version
          </button>
        )}
      </div>
    </Dialog>
  );
}
