/**
 * The icon browser (Phase 1 stub library, note 01): categories, a search
 * box, thumbnails (the SVGs themselves for now); click places an icon at
 * the centre of the view, drag places it where it is dropped.
 */
import { useEffect, useState } from 'react';

import type { IconEntry, LibraryManifest } from '@/icons/manifest';

import { ICON_DRAG_TYPE } from '../canvas/view';
import { getLibrary, placeIcon } from '../state/session';

export function IconBrowser() {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [icons, setIcons] = useState<readonly IconEntry[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const lib = getLibrary();
    lib
      .manifest()
      .then((m) => {
        setManifest(m);
        return lib.search('');
      })
      .then(setIcons)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'The icon library could not be loaded.');
      });
  }, []);

  useEffect(() => {
    let live = true;
    void getLibrary()
      .search(query)
      .then((r) => {
        if (live) setIcons(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [query]);

  const lib = getLibrary();
  return (
    <aside className="icons-panel" aria-label="Icons">
      <header>
        <input
          type="search"
          placeholder="Search icons…"
          aria-label="Search icons"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </header>
      <div className="icons-scroll">
        {error && <p className="note">{error}</p>}
        {manifest?.categories.map((c) => {
          const list = icons.filter((i) => i.category === c.id);
          if (list.length === 0) return null;
          return (
            <div key={c.id}>
              <h3>{c.title}</h3>
              <div className="icon-grid">
                {list.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="icon-tile"
                    title={`${e.title} — ${e.meta.source}, ${e.meta.license}`}
                    aria-label={`Place ${e.title}`}
                    data-icon={e.id}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(ICON_DRAG_TYPE, e.id);
                      ev.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      void placeIcon(e);
                    }}
                  >
                    <img src={lib.svgUrl(e)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {manifest && icons.length === 0 && <p className="note">No icons match “{query}”.</p>}
        <p className="note" style={{ marginTop: 12 }}>
          Stub library {manifest?.version}: house icons and Health Icons, all CC0.
        </p>
      </div>
    </aside>
  );
}
