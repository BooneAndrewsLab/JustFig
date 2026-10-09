/**
 * The open figures, one tab each (note 25, after PlasmidPop's
 * DocumentTabs): Recent… at the start, a tablist of the figures with an
 * unsaved dot and a close ×, and + for a new figure. The tablist holds tabs
 * only: the × is for the mouse, and the keyboard closes the focused tab with
 * Delete (or Alt+W anywhere). Tabs reorder by drag, with a drag type of
 * their own so the canvas's file and icon drops never take one.
 */
import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react';

import { analytics } from '../analytics';
import { withKey, resolveBindings } from '../keyBindings';
import { closeTab, newFigure } from '../state/session';
import { type TabState, figure, isUnsaved, store } from '../state/store';
import { useAppState } from '../state/useAppState';

/** The MIME type a dragged tab carries, so nothing else dropped here is taken for one. */
const TAB_TYPE = 'application/x-justfig-tab';

export function TabStrip({ onRecent }: { readonly onRecent: () => void }) {
  const s = useAppState();
  const bound = resolveBindings(s.keyBindings);
  const list = useRef<HTMLDivElement>(null);
  // A tab being dragged, and the gap it would drop into: 0 before the first tab.
  const [drag, setDrag] = useState<{ readonly key: string; readonly gap: number | null } | null>(
    null,
  );

  const focusTab = (key: string) => {
    // After the store has re-rendered the strip with the new front tab.
    requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus();
    });
  };

  const onKey = (e: KeyboardEvent, i: number, t: TabState) => {
    const go = (j: number) => {
      const next = s.tabs[(j + s.tabs.length) % s.tabs.length];
      if (!next) return;
      store.activate(next.key);
      focusTab(next.key);
    };
    const keys: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => {
        go(i - 1);
      },
      ArrowRight: () => {
        go(i + 1);
      },
      Home: () => {
        go(0);
      },
      End: () => {
        go(s.tabs.length - 1);
      },
      Delete: () => {
        closeTab(t.key);
        focusTab(store.getState().front);
      },
    };
    const run = e.altKey || e.ctrlKey || e.metaKey ? undefined : keys[e.key];
    if (!run) return;
    // Handled here: the app's own Delete and arrow keys must not also act on the selection.
    e.preventDefault();
    e.stopPropagation();
    run();
  };

  return (
    <nav className="tabstrip" aria-label="Figures">
      <button
        type="button"
        className="tabstrip-recent"
        title={withKey('Reopen a figure kept in this browser', 'recent', bound)}
        onClick={onRecent}
      >
        Recent…
      </button>
      <div className="tabstrip-list" role="tablist" aria-label="Open figures" ref={list}>
        {s.tabs.map((t, i) => {
          const active = t.key === s.front;
          const title = figure(t).doc.title || 'Untitled';
          const unsaved = isUnsaved(t);
          const drop = drag?.gap === i ? ' drop-before' : drag?.gap === i + 1 ? ' drop-after' : '';
          const isTab = (e: DragEvent): boolean => e.dataTransfer.types.includes(TAB_TYPE);
          return (
            <div
              key={t.key}
              data-tab={t.key}
              role="tab"
              tabIndex={active ? 0 : -1}
              aria-selected={active}
              aria-controls={active ? 'figure-canvas' : undefined}
              aria-label={`${title}${unsaved ? ', unsaved' : ''}`}
              title={`${title}${unsaved ? '\nChanged since last saved to a file' : ''}`}
              className={`tabstrip-tab${active ? ' active' : ''}${drop}`}
              draggable
              onClick={() => {
                store.activate(t.key);
              }}
              onKeyDown={(e) => {
                onKey(e, i, t);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_TYPE, t.key);
                e.dataTransfer.effectAllowed = 'move';
                setDrag({ key: t.key, gap: null });
              }}
              onDragOver={(e) => {
                if (!isTab(e) || drag === null) return;
                // Claimed, so nothing else takes it for a file being dropped.
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const box = e.currentTarget.getBoundingClientRect();
                const gap = e.clientX > box.left + box.width / 2 ? i + 1 : i;
                if (gap !== drag.gap) setDrag({ ...drag, gap });
              }}
              onDrop={(e) => {
                if (!isTab(e) || drag?.gap == null) return;
                e.preventDefault();
                const from = s.tabs.findIndex((x) => x.key === drag.key);
                // The gap is counted with the dragged tab still in place.
                store.move(drag.key, from < drag.gap ? drag.gap - 1 : drag.gap);
                analytics.trackOnce('tabs', 'move');
                setDrag(null);
              }}
              onDragEnd={() => {
                setDrag(null);
              }}
            >
              <span className="tabstrip-name">{title}</span>
              {unsaved && (
                <span className="tabstrip-dot" aria-hidden="true">
                  •
                </span>
              )}
              <span
                className="tabstrip-close"
                aria-hidden="true"
                title={withKey(
                  'Close this tab (the figure stays in Recent figures)',
                  'tab-close',
                  bound,
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.key);
                }}
              >
                ×
              </span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="tabstrip-new"
        aria-label="New figure in a tab"
        title="Start a new figure in a tab of its own"
        onClick={newFigure}
      >
        +
      </button>
    </nav>
  );
}
