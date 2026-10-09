/**
 * Review note markers (note 24): screen-only, drawn over the page in the
 * canvas overlay, never through `objectToNode`, so no export can carry one.
 * Clicking one opens the note in the Notes panel, which is also the
 * keyboard way to reach every note.
 */
import type { Id } from '@/core/model/ids';
import { noteAnchor } from '@/core/model/notes';
import { findObj } from '@/core/model/tree';
import type { Doc, Page, Vec2 } from '@/core/model/types';

import { type NoteDraft, type View, store } from '../state/store';

const R = 9;

/** Where a note's marker is now: on its object if that is still there. */
function markerPoint(page: Page, n: { at: Vec2; object?: Id }): Vec2 {
  const o = n.object === undefined ? undefined : findObj(page, n.object);
  return o ? noteAnchor(o) : n.at;
}

export function NoteMarkers({
  doc,
  page,
  view,
  active,
  draft,
}: {
  doc: Doc;
  page: Page;
  view: View;
  active: Id | null;
  draft: NoteDraft | null;
}) {
  const scr = (p: Vec2) => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });
  return (
    <g data-testid="note-markers">
      {doc.notes.map((n, i) => {
        if (n.page !== page.id) return null;
        const a = scr(markerPoint(page, n));
        const on = n.id === active;
        return (
          <g
            key={n.id}
            data-testid="note-marker"
            data-note={n.id}
            transform={`translate(${String(a.x)} ${String(a.y)})`}
            opacity={n.resolved === true && !on ? 0.45 : 1}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              store.setActiveNote(n.id);
            }}
          >
            <title>{`Note ${String(i + 1)}${n.resolved === true ? ' (resolved)' : ''}`}</title>
            <path
              d={`M0 0 L${String(R * 0.3)} ${String(-R)} L${String(R)} ${String(-R * 0.3)} Z`}
              fill={n.resolved === true ? '#ffffff' : '#e69f00'}
              stroke={on ? '#0072b2' : '#5c3d00'}
              strokeWidth={on ? 2 : 1}
            />
            <circle
              cx={R}
              cy={-R}
              r={R}
              fill={n.resolved === true ? '#ffffff' : '#e69f00'}
              stroke={on ? '#0072b2' : '#5c3d00'}
              strokeWidth={on ? 2.5 : 1}
            />
            <text
              x={R}
              y={-R + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontFamily="sans-serif"
              fill="#1f2328"
              pointerEvents="none"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
      {draft?.page === page.id && (
        <circle
          data-testid="note-draft-marker"
          cx={scr(draft.at).x + R}
          cy={scr(draft.at).y - R}
          r={R}
          fill="#fff3d6"
          stroke="#e69f00"
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      )}
    </g>
  );
}
