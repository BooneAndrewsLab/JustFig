/**
 * The right column as three tabs (note 59): Inspector, Layers, Notes. One panel shows at a
 * time, so the Layers list never moves when the Inspector's height changes with the
 * selection. Selecting on the canvas or in Layers never switches the tab; opening or
 * starting a note does (the store), since the note is read and typed in Notes.
 *
 * A tablist with automatic activation: Left/Right, Home and End move between tabs and show
 * the one reached. The panels stay mounted and are hidden with the `hidden` attribute, so
 * the Layers list keeps its open groups and scroll position across a switch.
 */
import type { KeyboardEvent, ReactNode } from 'react';

import { SIDE_TABS, type SideTab, figure, store } from '../state/store';
import { useAppState } from '../state/useAppState';

const LABEL: Readonly<Record<SideTab, string>> = {
  inspector: 'Inspector',
  layers: 'Layers',
  notes: 'Notes',
};

export function SideTabs({
  inspector,
  layers,
  notes,
}: {
  inspector: ReactNode;
  layers: ReactNode;
  notes: ReactNode;
}) {
  const s = useAppState();
  const panels: Readonly<Record<SideTab, ReactNode>> = { inspector, layers, notes };
  const openNotes = figure(s).doc.notes.filter((n) => n.resolved !== true).length;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = SIDE_TABS.length;
    const go = (j: number) => {
      const next = SIDE_TABS[((j % n) + n) % n];
      if (next === undefined) return;
      // The arrows are the tablist's, not a nudge of the selection.
      e.preventDefault();
      e.stopPropagation();
      store.setSideTab(next);
      document.getElementById(`sidetab-${next}`)?.focus();
    };
    if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(n - 1);
  };

  return (
    <>
      <div className="sidetabs" role="tablist" aria-label="Panels">
        {SIDE_TABS.map((t, i) => {
          const active = t === s.sideTab;
          const count = t === 'notes' && openNotes > 0 ? openNotes : 0;
          return (
            <button
              key={t}
              type="button"
              id={`sidetab-${t}`}
              className="sidetab"
              role="tab"
              aria-selected={active}
              aria-controls={`sidepanel-${t}`}
              aria-label={count > 0 ? `${LABEL[t]}, ${String(count)} open` : undefined}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                store.setSideTab(t);
              }}
              onKeyDown={(e) => {
                onKey(e, i);
              }}
            >
              {LABEL[t]}
              {count > 0 && (
                <span className="sidetab-count" aria-hidden="true">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {SIDE_TABS.map((t) => (
        <div
          key={t}
          id={`sidepanel-${t}`}
          className="side__panel"
          role="tabpanel"
          aria-labelledby={`sidetab-${t}`}
          hidden={t !== s.sideTab}
        >
          {panels[t]}
        </div>
      ))}
    </>
  );
}
