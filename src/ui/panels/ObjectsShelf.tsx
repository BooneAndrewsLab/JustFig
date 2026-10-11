/**
 * The Objects shelf (note 04): one tile per procedural kind, drawn by the
 * kind itself with its defaults. Click places one at the view centre; drag
 * drops it where it lands. A kind with presets (note 58) also gets its
 * starting points, under a disclosure, and its wizard's button there too. An icon search also lists the kinds
 * and presets it matches (`matchKinds`, `matchPresets`), tagged "Adjustable".
 */
import { useEffect, useState } from 'react';

import { createProcedural } from '@/procedural/edits';
import { createFromPreset, groupedPresets, presetsOf } from '@/procedural/presets';
import { allKinds } from '@/procedural/registry';
import type { KindPreset, ProceduralKind } from '@/procedural/types';

import { KIND_DRAG_TYPE, kindDragData } from '../canvas/view';
import { placeProcedural } from '../state/session';
import { KindWizardButton } from '../dialogs/KindWizardDialog';
import { procSvg } from './kindSvg';

const thumbs = new Map<string, string>();

/** A tile's picture, drawn by the kind itself: its defaults, or a preset (cached by kind and preset id). */
function thumb(k: ProceduralKind, preset?: KindPreset): string {
  const key = preset ? `${k.kind}/${preset.id}` : k.kind;
  let t = thumbs.get(key);
  if (t === undefined) {
    const { w, h } = preset?.size ?? k.defaultSize;
    const at = { x: w / 2, y: h / 2 };
    const o = preset ? createFromPreset(k, preset, at) : createProcedural(k, at);
    t = procSvg(o);
    thumbs.set(key, t);
  }
  return t;
}

/**
 * One kind's tile, or one of its presets' (note 58): click (or Enter) places it at the view
 * centre, drag drops it. `tagged` marks it "Adjustable" where it sits among icon search results.
 */
export function ObjectTile({
  kind: k,
  preset,
  thumbnail = true,
  tagged = false,
}: {
  kind: ProceduralKind;
  preset?: KindPreset;
  thumbnail?: boolean;
  tagged?: boolean;
}) {
  const name = preset ? preset.label : k.title;
  const what = preset ? `${k.title}: ${preset.label}` : k.title;
  return (
    <button
      type="button"
      className={tagged ? 'object-tile tagged' : 'object-tile'}
      data-kind={k.kind}
      data-preset={preset?.id}
      title={preset ? what : `${k.title} — ${k.description}`}
      aria-label={tagged ? `Add ${what} (adjustable object)` : `Add ${what}`}
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(KIND_DRAG_TYPE, kindDragData(k.kind, preset?.id));
        ev.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        placeProcedural(k.kind, undefined, preset?.id);
      }}
    >
      {thumbnail && (
        <span
          className="object-thumb"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: thumb(k, preset) }}
        />
      )}
      <span className="object-name">{name}</span>
      {tagged && (
        <span className="adjustable-tag" aria-hidden="true">
          Adjustable
        </span>
      )}
    </button>
  );
}

/**
 * A kind's presets (note 58) behind a disclosure, grouped; their pictures are drawn only once
 * it is opened.
 */
function PresetTiles({ kind: k, drawn }: { kind: ProceduralKind; drawn: boolean }) {
  const [open, setOpen] = useState(false);
  const groups = groupedPresets(k);
  const names = presetsOf(k).map((p) => p.label);
  return (
    <details
      className="object-presets"
      data-kind={k.kind}
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
      }}
    >
      <summary title={names.join(', ')}>
        {k.title} starting points <span className="note">({String(names.length)})</span>
      </summary>
      <KindWizardButton kind={k} />
      {groups.map((g) => (
        <div key={g.group} role="group" aria-label={g.group || `${k.title} starting points`}>
          {g.group !== '' && <p className="object-presets-group">{g.group}</p>}
          <div className="objects-grid">
            {g.presets.map((p) => (
              <ObjectTile key={p.id} kind={k} preset={p} thumbnail={open && drawn} />
            ))}
          </div>
        </div>
      ))}
    </details>
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
      {allKinds()
        .filter((k) => presetsOf(k).length > 0 || k.wizard !== undefined)
        .map((k) => (
          <PresetTiles key={k.kind} kind={k} drawn={open && drawn} />
        ))}
    </details>
  );
}
