/**
 * The icon browser (note 01): a category picker, search (the library's
 * MiniSearch index, loaded on the first query), sprite-sheet thumbnails,
 * click to place at the centre of the view or drag onto the canvas, the
 * share-alike opt-in, and the library credits. A search also lists the
 * scientific objects it matches (note 04), first and tagged "Adjustable".
 * Hovering or keyboard-focusing a tile shows a large preview (IconPreview).
 */
import { useEffect, useMemo, useState } from 'react';

import type { IconEntry, LibraryManifest } from '@/icons/manifest';
import { matchKinds, matchPresets } from '@/procedural/search';

import { ICON_DRAG_TYPE } from '../canvas/view';
import { IconPreview } from './IconPreview';
import { type Box, PREVIEW_ID, PreviewTimer } from './previewTimer';
import { ObjectTile, ObjectsShelf } from './ObjectsShelf';
import { getLibrary, placeIcon } from '../state/session';

const TILE = 48;
const SA_KEY = 'justfig.showShareAlike';
const CAT_KEY = 'justfig.iconCategory';

function stored(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the setting lasts for this session only.
  }
}

/** Whether share-alike icons are shown (the user's opt-in, off by default). */
const showShareAlike = (): boolean => stored(SA_KEY) === '1';

interface Previewed {
  readonly entry: IconEntry;
  readonly el: HTMLElement;
}

/** Keyboard focus only: a click focuses the tile too, and places the icon instead. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function Tile({
  entry,
  manifest,
  previewed,
  timer,
}: {
  entry: IconEntry;
  manifest: LibraryManifest;
  previewed: boolean;
  timer: PreviewTimer<Previewed>;
}) {
  const lib = getLibrary();
  const t = lib.thumb(manifest, entry, TILE);
  return (
    <button
      type="button"
      className="icon-tile"
      aria-label={`Place ${entry.title}`}
      aria-describedby={previewed ? PREVIEW_ID : undefined}
      data-icon={entry.id}
      draggable
      onMouseEnter={(ev) => {
        timer.hover({ entry, el: ev.currentTarget });
      }}
      onMouseLeave={() => {
        timer.leave();
      }}
      onFocus={(ev) => {
        if (focusVisible(ev.currentTarget)) timer.focus({ entry, el: ev.currentTarget });
      }}
      onBlur={() => {
        timer.dismiss();
      }}
      onKeyDown={(ev) => {
        // Escape closes the preview first; the next one reaches the editor (deselect).
        if (ev.key === 'Escape' && timer.current !== null) {
          ev.stopPropagation();
          timer.dismiss();
        }
      }}
      onDragStart={(ev) => {
        timer.dismiss();
        ev.dataTransfer.setData(ICON_DRAG_TYPE, entry.id);
        ev.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        timer.dismiss();
        void placeIcon(entry);
      }}
    >
      {t ? (
        <span
          className="icon-thumb"
          aria-hidden="true"
          style={{
            backgroundImage: t.image,
            backgroundPosition: `${String(t.x)}px ${String(t.y)}px`,
            backgroundSize: `${String(t.sheetWidth)}px auto`,
          }}
        />
      ) : (
        <img src={lib.svgUrl(entry)} alt="" loading="lazy" />
      )}
      {entry.meta.shareAlike && (
        <span className="sa-badge" title="Share-alike (CC BY-SA)">
          SA
        </span>
      )}
    </button>
  );
}

export function IconBrowser({ onCredits }: { onCredits: () => void }) {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [category, setCategory] = useState<string | null>(stored(CAT_KEY));
  // The icons shown, and which query/category/opt-in they answer (loading while it differs).
  const [result, setResult] = useState<{ key: string; icons: readonly IconEntry[] }>({
    key: '',
    icons: [],
  });
  const [query, setQuery] = useState('');
  const [sa, setSa] = useState(showShareAlike);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ entry: IconEntry; el: HTMLElement; anchor: Box } | null>(
    null,
  );
  const [timer] = useState(
    () =>
      new PreviewTimer<Previewed>((v) => {
        setPreview(v && { ...v, anchor: v.el.getBoundingClientRect() });
      }),
  );
  useEffect(
    () => () => {
      timer.dismiss();
    },
    [timer],
  );

  useEffect(() => {
    getLibrary()
      .manifest()
      .then((m) => {
        setManifest(m);
        setCategory((c) =>
          c !== null && m.categories.some((x) => x.id === c) ? c : (m.categories[0]?.id ?? null),
        );
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'The icon library could not be loaded.');
      });
  }, []);

  useEffect(() => {
    if (!manifest) return;
    let live = true;
    const lib = getLibrary();
    const q = query.trim();
    const key = `${q}|${category ?? ''}|${String(sa)}`;
    const p =
      q !== ''
        ? lib.search(q, { shareAlike: sa })
        : category !== null
          ? lib.category(category, { shareAlike: sa })
          : Promise.resolve([]);
    p.then(
      (r) => {
        if (live) setResult({ key, icons: r });
      },
      (e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : 'The icon library could not be loaded.');
        setResult({ key, icons: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [manifest, category, query, sa]);

  const total = manifest?.categories.reduce(
    (n, c) => n + c.count - (sa ? 0 : (c.shareAlike ?? 0)),
    0,
  );
  const searching = query.trim() !== '';
  const loading = result.key !== `${query.trim()}|${category ?? ''}|${String(sa)}`;
  const icons = result.icons;
  const objects = useMemo(() => matchKinds(query), [query]);
  const presets = useMemo(() => matchPresets(query), [query]);
  const found = objects.length + presets.length;
  const objectCount =
    found === 0 ? '' : `${String(found)} adjustable object${found === 1 ? '' : 's'}, `;
  return (
    <aside className="icons-panel" aria-label="Icons">
      <ObjectsShelf />
      <header>
        <input
          type="search"
          placeholder={total ? `Search ${total.toLocaleString('en-US')} icons…` : 'Search icons…'}
          aria-label="Search icons"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <select
          aria-label="Icon category"
          value={category ?? ''}
          disabled={searching || !manifest}
          onChange={(e) => {
            setCategory(e.target.value);
            store(CAT_KEY, e.target.value);
          }}
        >
          {manifest?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.count - (sa ? 0 : (c.shareAlike ?? 0))})
            </option>
          ))}
        </select>
      </header>
      <div
        className="icons-scroll"
        data-testid="icon-results"
        aria-busy={loading}
        onScroll={(ev) => {
          // The preview follows its tile (focus scrolls it into view), and goes once it is out of sight.
          if (!preview) return;
          const r = preview.el.getBoundingClientRect();
          const view = ev.currentTarget.getBoundingClientRect();
          if (r.bottom <= view.top || r.top >= view.bottom) timer.dismiss();
          else setPreview({ ...preview, anchor: r });
        }}
      >
        {error && <p className="note">{error}</p>}
        {searching && !loading && (
          <p className="note" role="status">
            {objectCount}
            {icons.length === 0
              ? `No icons match “${query.trim()}”.`
              : `${String(icons.length)}${icons.length >= 240 ? '+' : ''} icons`}
          </p>
        )}
        {searching && found > 0 && (
          <>
            <h3>
              Scientific objects <span className="kind-hint">· redrawn from settings</span>
            </h3>
            <div className="object-results">
              {objects.map((k) => (
                <ObjectTile key={k.kind} kind={k} tagged />
              ))}
              {presets.map((m) => (
                <ObjectTile
                  key={`${m.kind.kind}/${m.preset.id}`}
                  kind={m.kind}
                  preset={m.preset}
                  tagged
                />
              ))}
            </div>
            <h3>
              Icons <span className="kind-hint">· fixed drawings</span>
            </h3>
          </>
        )}
        {manifest && (
          <div className="icon-grid">
            {icons.map((e) => (
              <Tile
                key={e.id}
                entry={e}
                manifest={manifest}
                previewed={preview?.entry.id === e.id}
                timer={timer}
              />
            ))}
          </div>
        )}
        {preview && icons.some((e) => e.id === preview.entry.id) && (
          <IconPreview
            entry={preview.entry}
            anchor={preview.anchor}
            svgUrl={getLibrary().svgUrl(preview.entry)}
            onPointerEnter={() => {
              timer.keep();
            }}
            onPointerLeave={() => {
              timer.leave();
            }}
          />
        )}
      </div>
      <footer className="icons-footer">
        <label title="CC BY-SA icons: a figure that adapts one must be shared under the same licence">
          <input
            type="checkbox"
            checked={sa}
            onChange={(e) => {
              setSa(e.target.checked);
              store(SA_KEY, e.target.checked ? '1' : '0');
            }}
          />{' '}
          Show share-alike (CC BY-SA) icons
        </label>
        <button type="button" className="link" onClick={onCredits}>
          Icon credits and licences
        </button>
        {manifest && (
          <span className="note">
            Library {manifest.version}: {manifest.sources.map((s) => s.name).join(', ')}
          </span>
        )}
      </footer>
    </aside>
  );
}
