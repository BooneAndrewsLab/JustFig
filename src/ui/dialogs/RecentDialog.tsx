/**
 * Recent figures (note 02): every figure autosaved in this browser, newest
 * first, with a thumbnail. Open, rename, download as .jfig and delete (asked
 * in this dialog, never with the browser's confirm box).
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { type FigureSummary, MAX_FIGURES, type StorageUsage, storageUsage } from '@/io/storage';

import {
  currentId,
  deleteRecent,
  downloadRecent,
  listRecent,
  openIds,
  openRecent,
  renameRecent,
} from '../state/session';
import { Dialog } from './Dialog';

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${String(Math.max(1, Math.round(n / 1024)))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * The kept figures as a list with every action, and the storage line; the
 * Recent dialog and the front page (note 57) share it. `onOpened` runs after
 * a figure came forward; `onRows` reports the list (the front page hides its
 * section while there is none); `intro` is the dialog's explanation.
 */
export function RecentList({
  onOpened,
  onRows,
  intro,
  emptyText = true,
  keepList = false,
}: {
  onOpened?: () => void;
  onRows?: (rows: FigureSummary[]) => void;
  intro?: ReactNode;
  emptyText?: boolean;
  /** Keep the list on screen under the delete confirmation (the front page). */
  keepList?: boolean;
}) {
  const [rows, setRows] = useState<FigureSummary[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<FigureSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const here = currentId();
  const open = openIds();

  const refresh = useCallback(async () => {
    try {
      setRows(await listRecent());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    let live = true;
    listRecent().then(
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

  useEffect(() => {
    let live = true;
    void storageUsage().then((u) => {
      if (live) setUsage(u);
    });
    return () => {
      live = false;
    };
  }, [rows]);

  useEffect(() => {
    if (rows) onRows?.(rows);
  }, [rows, onRows]);

  const confirm = deleting && (
    <Dialog
      title="Delete this figure?"
      onClose={() => {
        setDeleting(null);
      }}
    >
      <p>
        Delete <strong>{deleting.title}</strong> and its saved versions from this browser? It cannot
        be brought back unless you have saved it as a file.
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
            void deleteRecent(deleting.id).then(() => {
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
  if (deleting && !keepList) return confirm;

  const commit = (id: string) => {
    setRenaming(null);
    void renameRecent(id, draft).then(refresh);
  };

  return (
    <>
      {confirm}
      {intro}
      {usage?.usage != null && (
        <p className="note" data-testid="storage-usage">
          This browser has {formatBytes(usage.usage)}
          {usage.quota != null ? ` of about ${formatBytes(usage.quota)} available` : ''} in use by
          the app.{' '}
          {usage.persistent === true
            ? 'The browser has agreed to keep it.'
            : usage.persistent === false
              ? 'The browser may clear it if the computer runs low on space.'
              : ''}
        </p>
      )}
      {failed && (
        <p className="warn" role="alert">
          This browser would not let the app read its kept figures.
        </p>
      )}
      {emptyText && rows?.length === 0 && (
        <p>No figures are kept yet. Start drawing and one appears here.</p>
      )}
      <ul className="recent-list" aria-label="Recent figures">
        {rows?.map((r) => (
          <li key={r.id} className="recent-row" data-figure={r.id}>
            {r.thumb ? (
              <img src={r.thumb} alt="" width={80} />
            ) : (
              <span className="recent-nothumb" aria-hidden="true" />
            )}
            <div className="recent-info">
              {renaming === r.id ? (
                <input
                  aria-label={`New title for ${r.title}`}
                  value={draft}
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
                <strong>{r.title || 'Untitled'}</strong>
              )}
              <span className="note">
                {r.id === here ? 'Open now · ' : open.has(r.id) ? 'Open in a tab · ' : ''}
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
                    className="primary"
                    aria-label={`Open ${r.title}`}
                    onClick={() => {
                      void openRecent(r.id).then((ok) => {
                        if (ok) onOpened?.();
                      });
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${r.title}`}
                    onClick={() => {
                      setDraft(r.title);
                      setRenaming(r.id);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Download ${r.title} as .jfig`}
                    onClick={() => {
                      void downloadRecent(r.id);
                    }}
                  >
                    Download .jfig
                  </button>
                  {!open.has(r.id) && (
                    <button
                      type="button"
                      aria-label={`Delete ${r.title}`}
                      onClick={() => {
                        setDeleting(r);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RecentDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Recent figures" onClose={onClose}>
      <RecentList
        onOpened={onClose}
        intro={
          <p className="note">
            Figures are kept in this browser as you work. The {String(MAX_FIGURES)} most recent are
            kept; older ones are dropped, except figures with saved versions. Save a file for
            anything you want to keep for good.
          </p>
        }
      />
      <div className="actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
