import { useEffect, useRef } from 'react';

import type { History } from '@/core/history';
import type { Figure } from '@/core/model/types';
import { withKey } from './keyBindings';
import { store } from './state/store';
import { useMenu } from './useMenu';

interface Props {
  /** The front figure's history. */
  readonly history: History<Figure>;
  /** The resolved key bindings, for the shortcuts in the tooltips. */
  readonly bound: ReadonlyMap<string, string>;
}

/**
 * Undo and Redo with a dropdown listing every recorded change, newest first,
 * so the user can see what each step did and jump straight to any state
 * (note 56, PlasmidPop's `HistoryMenu`).
 */
export function HistoryMenu({ history, bound }: Props) {
  const { open, toggle, close, ref, trigger, list, onTriggerKeyDown, onListKeyDown } = useMenu();
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const current = currentRef.current as { scrollIntoView?: Element['scrollIntoView'] } | null;
    current?.scrollIntoView?.({ block: 'nearest' }); // jsdom has no scrollIntoView
  }, [open]);

  const undo = store.undoLabel();
  const redo = store.redoLabel();
  const { labels, position } = history;
  // Newest first, so the list reads like the undo stack; the opened state is last.
  const entries = [
    ...labels.map((label, i) => ({ label, position: i + 1 })).reverse(),
    { label: 'Opened figure', position: 0 },
  ];

  return (
    <div className="menu history" ref={ref}>
      <div className="segmented" role="group" aria-label="History">
        <button
          type="button"
          disabled={!undo}
          title={withKey(undo ?? 'Nothing to undo', 'undo', bound)}
          onClick={() => {
            store.undo();
          }}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!redo}
          title={withKey(redo ?? 'Nothing to redo', 'redo', bound)}
          onClick={() => {
            store.redo();
          }}
        >
          Redo
        </button>
        <button
          ref={trigger}
          type="button"
          className="segmented__caret"
          aria-label="History"
          title="Show the list of changes"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? 'history-menu' : undefined}
          disabled={labels.length === 0}
          onClick={toggle}
          onKeyDown={onTriggerKeyDown}
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && (
        <div
          ref={list}
          id="history-menu"
          className="menu__list history__list"
          role="menu"
          aria-label="Changes"
          onKeyDown={onListKeyDown}
        >
          {entries.map((entry) => {
            const current = entry.position === position;
            const undone = entry.position > position;
            return (
              <button
                key={entry.position}
                ref={current ? currentRef : undefined}
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={current}
                className={`menu__item history__item${current ? ' history__item--current' : ''}${
                  undone ? ' history__item--undone' : ''
                }`}
                title={
                  current
                    ? 'Current state'
                    : undone
                      ? 'Redo up to this change'
                      : entry.position === 0
                        ? 'Undo everything'
                        : 'Undo back to this change'
                }
                onClick={() => {
                  close();
                  store.jumpHistory(entry.position);
                }}
              >
                <span className="history__step">
                  {entry.position === 0 ? '' : String(entry.position)}
                </span>
                <span className="history__label">{entry.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
