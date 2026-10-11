/**
 * The Objects shelf (note 04): one tile per procedural kind, drawn by the
 * kind itself with its defaults. Click places one at the view centre; drag
 * drops it where it lands. An icon search also lists the kinds it matches
 * (`matchKinds`), with the same tile tagged "Adjustable".
 */
import { useEffect, useState } from 'react';

import { createProcedural } from '@/procedural/edits';
import { allKinds } from '@/procedural/registry';
import type { ProceduralKind } from '@/procedural/types';
import { proceduralNodes } from '@/render/procedural';
import { nodeToSvgString } from '@/render/svgNode';

import { KIND_DRAG_TYPE } from '../canvas/view';
import { placeProcedural } from '../state/session';

const thumbs = new Map<string, string>();

function thumb(k: ProceduralKind): string {
  let t = thumbs.get(k.kind);
  if (t === undefined) {
    const o = createProcedural(k, { x: k.defaultSize.w / 2, y: k.defaultSize.h / 2 });
    const nodes = proceduralNodes(o, 'outline', false, []) ?? [];
    const { w, h } = k.defaultSize;
    const pad = Math.max(w, h) * 0.06;
    t =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(-pad)} ${String(-pad)} ${String(w + 2 * pad)} ${String(h + 2 * pad)}">` +
      nodes.map((n) => nodeToSvgString(n)).join('') +
      '</svg>';
    thumbs.set(k.kind, t);
  }
  return t;
}

/**
 * One kind's tile: click (or Enter) places it at the view centre, drag drops it. `tagged`
 * marks it "Adjustable" where it sits among icon search results.
 */
export function ObjectTile({
  kind: k,
  thumbnail = true,
  tagged = false,
}: {
  kind: ProceduralKind;
  thumbnail?: boolean;
  tagged?: boolean;
}) {
  return (
    <button
      type="button"
      className={tagged ? 'object-tile tagged' : 'object-tile'}
      data-kind={k.kind}
      title={`${k.title} — ${k.description}`}
      aria-label={tagged ? `Add ${k.title} (adjustable object)` : `Add ${k.title}`}
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(KIND_DRAG_TYPE, k.kind);
        ev.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        placeProcedural(k.kind);
      }}
    >
      {thumbnail && (
        <span
          className="object-thumb"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: thumb(k) }}
        />
      )}
      <span className="object-name">{k.title}</span>
      {tagged && (
        <span className="adjustable-tag" aria-hidden="true">
          Adjustable
        </span>
      )}
    </button>
  );
}

const OPEN_KEY = 'justfig.objectsOpen';

function storedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function ObjectsShelf() {
  const [open, setOpen] = useState(storedOpen);
  // Drawing every kind (text layout included) took ~130 ms on the first
  // render: the tiles fill in on the next tick, after the page has painted.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDrawn(true);
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, []);
  return (
    <details
      className="objects-shelf"
      open={open}
      onToggle={(e) => {
        const o = e.currentTarget.open;
        setOpen(o);
        try {
          localStorage.setItem(OPEN_KEY, o ? '1' : '0');
        } catch {
          // Storage blocked: the shelf just forgets.
        }
      }}
    >
      <summary>Scientific objects</summary>
      <p className="note objects-hint">
        Redrawn from settings: change wells, lanes, organelles or features in the Inspector.
      </p>
      <div className="objects-grid">
        {allKinds().map((k) => (
          <ObjectTile key={k.kind} kind={k} thumbnail={open && drawn} />
        ))}
      </div>
    </details>
  );
}
