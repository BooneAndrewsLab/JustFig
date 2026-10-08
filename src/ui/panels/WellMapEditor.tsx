/**
 * The well-colour editor of a plate (note 04): paint wells with a brush
 * colour (click or drag; Alt or the eraser clears), or paste a block from a
 * spreadsheet. One stroke of painting is one undo step. From the keyboard
 * (note 09): arrow keys move a cursor, Space or Enter paints, Delete
 * clears, Shift+arrows paint as they move.
 */
import { memo, useRef, useState } from 'react';

import { OKABE_ITO } from '@/core/color/color';
import type { Swatch } from '@/core/model/types';
import { rowLabel } from '@/procedural/kinds/util';
import { type PastedWells, wellId, wellsFromTable } from '@/procedural/kinds/wellPlate';
import type { Params, WellMap, WellMapField } from '@/procedural/types';

interface Props {
  readonly field: WellMapField;
  readonly params: Params;
  readonly value: WellMap;
  /** The document palette: offered as brush colours, copied by value (note 07). */
  readonly palette?: readonly Swatch[];
  readonly onChange: (m: WellMap, what: string) => void;
}

/** The wells, redrawn only when the colours or the grid change (not on every move of the plate). */
const WellGrid = memo(function WellGrid({
  rows,
  cols,
  cell,
  value,
}: {
  rows: number;
  cols: number;
  cell: number;
  value: WellMap;
}) {
  return (
    <>
      <rect width={cols * cell} height={rows * cell} fill="#eef2f6" />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const id = wellId(r, c);
          return (
            <rect
              key={id}
              data-well={id}
              x={c * cell + 0.5}
              y={r * cell + 0.5}
              width={cell - 1}
              height={cell - 1}
              rx={cell / 2}
              fill={value[id] ?? '#ffffff'}
              stroke="#9aa5b1"
              strokeWidth={cell > 6 ? 0.5 : 0}
            >
              <title>{id}</title>
            </rect>
          );
        }),
      )}
    </>
  );
});

/**
 * Stroke numbers name the undo steps; module-level so that a re-render
 * that remounts the editor (a change of selection or params) never reuses
 * one, and a run of keys stays one step across it.
 */
const strokes = { n: 0 };
const keyStroke: { run: { stroke: number; at: number } | null } = { run: null };

export function WellMapEditor({ field, params, value, palette = [], onChange }: Props) {
  const { rows, cols } = field.grid(params);
  const [brush, setBrush] = useState<string>(OKABE_ITO[5] ?? '#0072b2');
  const [erase, setErase] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [legend, setLegend] = useState<PastedWells | null>(null);
  const painting = useRef<{ erase: boolean; stroke: number } | null>(null);
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  const cell = Math.max(3, Math.min(14, Math.floor(220 / cols)));
  const W = cols * cell;
  const H = rows * cell;

  const paintWell = (row: number, col: number, clear: boolean, stroke: number) => {
    const id = wellId(row, col);
    const cur = value[id];
    if (clear ? cur === undefined : cur === brush) return;
    const next: Record<string, string> = clear
      ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== id))
      : { ...value, [id]: brush };
    onChange(next, `Paint wells ${String(stroke)}`);
  };

  const paintAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = painting.current;
    if (!p) return;
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * rows);
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;
    paintWell(row, col, p.erase, p.stroke);
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const at = cursor ?? { r: 0, c: 0 };
    const move: Readonly<Record<string, [number, number]>> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Home: [0, -cols],
      End: [0, cols],
    };
    const d = move[e.key];
    // A run of keys within a second and a half is one undo step, like a drag.
    const stroke = () => {
      const k = keyStroke.run;
      if (k && Date.now() - k.at < 1500) {
        k.at = Date.now();
        return k.stroke;
      }
      strokes.n += 1;
      keyStroke.run = { stroke: strokes.n, at: Date.now() };
      return strokes.n;
    };
    if (d) {
      const r = Math.max(0, Math.min(rows - 1, at.r + d[0]));
      const c = Math.max(0, Math.min(cols - 1, at.c + d[1]));
      setCursor({ r, c });
      if (e.shiftKey) paintWell(r, c, erase, stroke());
    } else if (e.key === ' ' || e.key === 'Enter') {
      setCursor(at);
      paintWell(at.r, at.c, erase, stroke());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      setCursor(at);
      paintWell(at.r, at.c, true, stroke());
    } else return;
    // The keys belong to the grid here, not to the canvas (nudging the plate).
    e.preventDefault();
    e.stopPropagation();
  };
  const cursorId = cursor ? wellId(cursor.r, cursor.c) : null;

  return (
    <div className="wellmap">
      <div className="row">
        <label>Brush</label>
        <input
          type="color"
          className="swatch"
          aria-label="Brush colour"
          value={brush}
          onChange={(e) => {
            setBrush(e.target.value);
            setErase(false);
          }}
        />
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {palette.length > 0 && (
            <span
              className="note"
              title="Choosing a palette swatch copies its colour; later palette changes leave the wells alone."
            >
              Palette (copies):
            </span>
          )}
          {palette.map((sw) => (
            <button
              key={sw.id}
              type="button"
              className="swatch"
              title={`${sw.name} ${sw.hex} (copies the colour; not linked to the palette)`}
              aria-label={`Brush swatch ${sw.name}`}
              style={{ background: sw.hex, width: 14, height: 14 }}
              onClick={() => {
                setBrush(sw.hex);
                setErase(false);
              }}
            />
          ))}
          {palette.length > 0 && <span className="swatch-sep" aria-hidden="true" />}
          {OKABE_ITO.slice(1).map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              title={c}
              aria-label={`Brush ${c}`}
              style={{ background: c, width: 14, height: 14 }}
              onClick={() => {
                setBrush(c);
                setErase(false);
              }}
            />
          ))}
        </div>
      </div>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={erase}
            onChange={(e) => {
              setErase(e.target.checked);
            }}
          />{' '}
          Eraser
        </label>
      </div>
      <svg
        className="wellmap-grid"
        role="application"
        tabIndex={0}
        aria-label="Wells: click or drag to paint; or arrow keys to move, Space to paint, Delete to clear, Shift+arrows to paint while moving"
        aria-describedby="wellmap-status"
        onKeyDown={onKey}
        onFocus={() => {
          setCursor((c) => c ?? { r: 0, c: 0 });
        }}
        width={W}
        height={H}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          strokes.n += 1;
          keyStroke.run = null;
          painting.current = { erase: erase || e.altKey, stroke: strokes.n };
          paintAt(e);
        }}
        onPointerMove={paintAt}
        onPointerUp={() => {
          painting.current = null;
        }}
      >
        <WellGrid rows={rows} cols={cols} cell={cell} value={value} />
        {cursor && (
          <rect
            className="wellmap-cursor"
            x={cursor.c * cell}
            y={cursor.r * cell}
            width={cell}
            height={cell}
            fill="none"
            stroke="#d55e00"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        )}
      </svg>
      <p id="wellmap-status" className="sr-only" aria-live="polite">
        {cursorId ? `${cursorId}: ${value[cursorId] ?? 'empty'}` : ''}
      </p>
      <p className="note">
        {Object.keys(value).length} of {rows * cols} wells coloured · rows A–{rowLabel(rows - 1)},
        columns 1–{cols}
      </p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            setPaste(paste === null ? '' : null);
          }}
        >
          Paste from spreadsheet…
        </button>
        <button
          type="button"
          disabled={Object.keys(value).length === 0}
          onClick={() => {
            onChange({}, 'Clear wells');
            setLegend(null);
          }}
        >
          Clear
        </button>
      </div>
      {paste !== null && (
        <div className="wellmap-paste">
          <textarea
            aria-label="Spreadsheet cells"
            rows={5}
            placeholder={
              'Copy a block of cells (top-left = A1) and paste it here.\nNumbers become a colour ramp, words a colour each, #hex is used as is.'
            }
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
            }}
          />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={paste.trim() === ''}
              onClick={() => {
                const r = wellsFromTable(paste, rows, cols);
                onChange({ ...value, ...r.wells }, 'Paste wells');
                setLegend(r);
                setPaste(null);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {legend && (legend.categories.length > 0 || legend.range) && (
        <ul className="wellmap-legend" aria-label="Pasted values">
          {legend.categories.map((c) => (
            <li key={c.value}>
              <span className="swatch" style={{ background: c.colour, width: 10, height: 10 }} />{' '}
              {c.value}
            </li>
          ))}
          {legend.range && (
            <li>
              Ramp: {legend.range.min} (light) → {legend.range.max} (dark)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
