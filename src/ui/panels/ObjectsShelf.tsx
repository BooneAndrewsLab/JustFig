/**
 * The Objects shelf (note 04): one tile per procedural kind, drawn by the
 * kind itself with its defaults. Click places one at the view centre; drag
 * drops it where it lands.
 */
import { useState } from 'react';

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
      <div className="objects-grid" role="list">
        {allKinds().map((k) => (
          <button
            key={k.kind}
            type="button"
            role="listitem"
            className="object-tile"
            data-kind={k.kind}
            title={`${k.title} — ${k.description}`}
            aria-label={`Add ${k.title}`}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData(KIND_DRAG_TYPE, k.kind);
              ev.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              placeProcedural(k.kind);
            }}
          >
            {open && (
              <span
                className="object-thumb"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: thumb(k) }}
              />
            )}
            <span className="object-name">{k.title}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
