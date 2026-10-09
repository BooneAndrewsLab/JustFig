/**
 * New from a template or example (note 08): cards with live thumbnails; choosing one starts a
 * new figure. The My presets tab (note 22) lists the user's saved presets: choosing one adds it
 * to the current page; presets are renamed, deleted, exported and imported here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { boundsOf } from '@/core/geometry/transform';
import { cloneObjects } from '@/core/model/clone';
import { createDoc, createLayer, createPage } from '@/core/model/factory';
import { exportSvg } from '@/export/svg';
import { type GalleryEntry, GALLERY } from '@/gallery/gallery';
import { PRESETS_EXT, type Preset } from '@/io/presets';
import { MAX_NAME, PRESET_CAPS } from '@/io/storage';
import { BRAND } from '@/brand';

import { analytics } from '../analytics';
import {
  type KeptPreset,
  deletePreset,
  exportPresets,
  importPresets,
  listPresets,
  openGallery,
  placePreset,
  renamePreset,
} from '../state/session';
import { Dialog } from './Dialog';

type GalleryTab = GalleryEntry['kind'] | 'presets';

const TABS: readonly [GalleryTab, string][] = [
  ['template', 'Templates'],
  ['example', 'Examples'],
  ['presets', 'My presets'],
];

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function thumbnail(e: GalleryEntry): string {
  const fig = e.build();
  const page = fig.doc.pages[0];
  if (!page) return '';
  return svgUrl(exportSvg(fig, page, { textMode: 'outline', footer: false, background: true }, ''));
}

/** A preset drawn on a page just its size, with a small margin. */
function presetThumbnail(p: Preset): string {
  try {
    const b = boundsOf(p.fragment.objects);
    const m = Math.max(4, Math.max(b.w, b.h) * 0.05);
    const page = {
      ...createPage(),
      size: { w: Math.max(b.w, 1) + 2 * m, h: Math.max(b.h, 1) + 2 * m },
      layers: [{ ...createLayer(), children: cloneObjects(p.fragment.objects, m - b.x, m - b.y) }],
    };
    const fig = { doc: { ...createDoc(), pages: [page] }, assets: p.fragment.assets };
    return svgUrl(
      exportSvg(fig, page, { textMode: 'outline', footer: false, background: true }, ''),
    );
  } catch {
    return '';
  }
}

export function GalleryDialog({
  onClose,
  onSaveTemplate,
}: {
  onClose: () => void;
  onSaveTemplate: () => void;
}) {
  const [tab, setTab] = useState<GalleryTab>('template');
  const thumbs = useMemo(() => new Map(GALLERY.map((e) => [e.id, thumbnail(e)])), []);
  const [presets, setPresets] = useState<KeptPreset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<KeptPreset | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const presetThumbs = useMemo(
    () => new Map((presets ?? []).map((p) => [p.id, presetThumbnail(p)])),
    [presets],
  );

  const refresh = useCallback(async () => {
    try {
      setPresets(await listPresets());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    let live = true;
    listPresets().then(
      (r) => {
        if (live) setPresets(r);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  if (deleting) {
    return (
      <Dialog
        title="Delete this preset?"
        onClose={() => {
          setDeleting(null);
        }}
      >
        <p>
          Delete the preset <strong>{deleting.name}</strong> from this browser? It cannot be brought
          back unless you have exported it to a file.
        </p>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setDeleting(null);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void deletePreset(deleting.id).then(() => {
                setDeleting(null);
                return refresh();
              });
            }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    );
  }

  const commit = (id: string) => {
    setRenaming(null);
    void renamePreset(id, draft).then(refresh);
  };

  return (
    <Dialog title="Templates and examples" onClose={onClose}>
      <div className="tabs" role="tablist" aria-label="Gallery">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'presets' ? (
        <>
          <p className="note">
            Selections you saved with Save as preset… in the Inspector, kept in this browser (up to{' '}
            {String(PRESET_CAPS.maxRows)}). Choosing one adds it to the current page. Export them to
            a file to share with your lab.
          </p>
          {failed && (
            <p className="warn" role="alert">
              This browser would not let the app read its kept presets.
            </p>
          )}
          {presets?.length === 0 && (
            <p>No presets yet. Select some objects and choose Save as preset… in the Inspector.</p>
          )}
          <div role="tabpanel">
            <ul className="gallery-grid" aria-label="My presets">
              {presets?.map((p) => (
                <li key={p.id} className="preset-item" data-preset={p.id}>
                  {renaming === p.id ? (
                    <input
                      aria-label={`New name for ${p.name}`}
                      value={draft}
                      maxLength={MAX_NAME}
                      autoFocus
                      onChange={(e) => {
                        setDraft(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commit(p.id);
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setRenaming(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="gallery-card"
                      aria-label={`Place ${p.name}`}
                      onClick={() => {
                        placePreset(p);
                        onClose();
                      }}
                    >
                      <img src={presetThumbs.get(p.id)} alt="" />
                      <strong>{p.name}</strong>
                    </button>
                  )}
                  <div className="preset-actions">
                    <button
                      type="button"
                      aria-label={`Rename ${p.name}`}
                      onClick={() => {
                        setDraft(p.name);
                        setRenaming(p.id);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      aria-label={`Export ${p.name}`}
                      onClick={() => {
                        exportPresets([p], p.name);
                      }}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        setDeleting(p);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <input
            ref={importInput}
            type="file"
            hidden
            data-testid="preset-import-input"
            accept={`${PRESETS_EXT},${BRAND.mime}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importPresets(f).then(refresh);
            }}
          />
        </>
      ) : (
        <>
          <p className="note">
            {tab === 'template'
              ? 'Empty layouts to fill in: panels sized for a journal column.'
              : 'Finished figures to take apart. Their colours are linked to the palette, so applying another palette recolours them.'}{' '}
            Starting one keeps your current figure in Recent figures.
          </p>
          <div role="tabpanel">
            <ul className="gallery-grid">
              {GALLERY.filter((e) => e.kind === tab).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="gallery-card"
                    data-entry={e.id}
                    onClick={() => {
                      openGallery(e);
                      analytics.track('gallery', 'open', e.id);
                      onClose();
                    }}
                  >
                    <img src={thumbs.get(e.id)} alt="" />
                    <strong>{e.title}</strong>
                    <span>{e.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="actions">
        {tab === 'presets' && (
          <>
            <button type="button" onClick={() => importInput.current?.click()}>
              Import presets…
            </button>
            <button
              type="button"
              disabled={!presets || presets.length === 0}
              onClick={() => {
                if (presets) exportPresets(presets, 'presets');
              }}
            >
              Export all presets
            </button>
          </>
        )}
        <button
          type="button"
          title="For contributors: write this figure or selection as the source of a built-in gallery entry"
          onClick={onSaveTemplate}
        >
          Save as template source…
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
