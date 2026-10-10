/**
 * Saved versions of the open figure (note 23): name and keep the figure as it
 * is now; later compare versions (side by side or onion skin), restore it
 * (one undo step), rename or delete it. Confirmations are asked here, never
 * with the browser's confirm box.
 */
import { useCallback, useEffect, useState } from 'react';

import type { Figure } from '@/core/model/types';
import { MAX_NAME, type NamedSummary, VERSION_CAPS } from '@/io/storage';

import { analytics } from '../analytics';
import { store } from '../state/store';
import {
  deleteVersion,
  listVersions,
  loadVersion,
  renameVersion,
  restoreSavedVersion,
  saveVersion,
  suggestedVersionName,
} from '../state/versions';
import { CompareView } from './CompareView';
import { Dialog } from './Dialog';

type View =
  | { kind: 'list' }
  | { kind: 'compare'; row: NamedSummary; saved: Figure }
  | { kind: 'restore'; row: NamedSummary }
  | { kind: 'delete'; row: NamedSummary };

export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<NamedSummary[] | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [name, setName] = useState(() => suggestedVersionName());
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await listVersions());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    let live = true;
    listVersions().then(
      (r) => {
        if (live) setRows(r);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const back = () => {
    setView({ kind: 'list' });
  };

  if (view.kind === 'compare')
    return (
      <CompareView
        rows={rows ?? [view.row]}
        first={view.row}
        firstFigure={view.saved}
        onBack={back}
        onRestore={(row) => {
          setView({ kind: 'restore', row });
        }}
      />
    );

  if (view.kind === 'restore')
    return (
      <Dialog key="restore" title="Restore this version?" onClose={back}>
        <p>
          Make the figure what it was in <strong>{view.row.name}</strong>? What you have now is
          replaced; Undo brings it back.
        </p>
        <div className="actions">
          <button type="button" onClick={back}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void restoreSavedVersion(view.row.id).then((ok) => {
                if (ok) onClose();
                else back();
              });
            }}
          >
            Restore
          </button>
        </div>
      </Dialog>
    );

  if (view.kind === 'delete')
    return (
      <Dialog key="delete" title="Delete this version?" onClose={back}>
        <p>
          Delete <strong>{view.row.name}</strong> from this browser? It cannot be brought back.
        </p>
        <div className="actions">
          <button type="button" onClick={back}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void deleteVersion(view.row.id).then(() => {
                back();
                return refresh();
              });
            }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    );

  const commit = (id: string) => {
    setRenaming(null);
    void renameVersion(id, draft).then(refresh);
  };

  const compare = (r: NamedSummary) => {
    void loadVersion(r.id).then((v) => {
      if (!v) {
        store.notify('That version can no longer be read.', 'error');
        return;
      }
      analytics.track('version', 'compare');
      setView({ kind: 'compare', row: r, saved: v.figure });
    });
  };

  return (
    <Dialog key="list" title="Saved versions" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void saveVersion(name).then(async (ok) => {
            setBusy(false);
            if (ok) {
              setName(suggestedVersionName());
              await refresh();
            }
          });
        }}
      >
        <p className="note">
          Keep the figure as it is now under a name (“sent to PI”, “before revision”), to compare or
          restore later. Versions stay in this browser, up to {String(VERSION_CAPS.maxPerOwner)} per
          figure; they are not in the saved file.
        </p>
        <div className="row">
          <label htmlFor="version-name">Version name</label>
          <input
            id="version-name"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <button type="submit" disabled={busy || name.trim() === ''}>
            Save version
          </button>
        </div>
      </form>
      {failed && (
        <p className="warn" role="alert">
          This browser would not let the app read its saved versions.
        </p>
      )}
      {rows?.length === 0 && <p>No saved versions of this figure yet.</p>}
      <ul className="recent-list" aria-label="Saved versions">
        {rows?.map((r) => (
          <li key={r.id} className="recent-row version-row">
            <div className="recent-info">
              {renaming === r.id ? (
                <input
                  aria-label={`New name for ${r.name}`}
                  value={draft}
                  maxLength={MAX_NAME}
                  autoFocus
                  onChange={(e) => {
                    setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(r.id);
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <strong>{r.name}</strong>
              )}
              <span className="note">
                <time dateTime={new Date(r.updatedAt).toISOString()}>
                  {new Date(r.updatedAt).toLocaleString()}
                </time>
              </span>
            </div>
            <div className="recent-actions">
              {renaming === r.id ? (
                <button
                  type="button"
                  onClick={() => {
                    commit(r.id);
                  }}
                >
                  Save name
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={`Compare ${r.name}`}
                    onClick={() => {
                      compare(r);
                    }}
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    aria-label={`Restore ${r.name}`}
                    onClick={() => {
                      setView({ kind: 'restore', row: r });
                    }}
                  >
                    Restore…
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${r.name}`}
                    onClick={() => {
                      setDraft(r.name);
                      setRenaming(r.id);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => {
                      setView({ kind: 'delete', row: r });
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
