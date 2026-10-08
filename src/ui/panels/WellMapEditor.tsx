/**
 * The well-colour editor of a plate (note 04): paint wells with a brush
 * colour (click or drag; Alt or the eraser clears), or paste a block from a
 * spreadsheet. One stroke of painting is one undo step.
 */
import { memo, useRef, useState } from 'react';

import { OKABE_ITO } from '@/core/color/color';
import { rowLabel } from '@/procedural/kinds/util';
import { type PastedWells, wellId, wellsFromTable } from '@/procedural/kinds/wellPlate';
import type { Params, WellMap, WellMapField } from '@/procedural/types';

interface Props {
  readonly field: WellMapField;
  readonly params: Params;
  readonly value: WellMap;
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

export function WellMapEditor({ field, params, value, onChange }: Props) {
  const { rows, cols } = field.grid(params);
  const [brush, setBrush] = useState<string>(OKABE_ITO[5] ?? '#0072b2');
  const [erase, setErase] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [legend, setLegend] = useState<PastedWells | null>(null);
  const painting = useRef<{ erase: boolean; stroke: number } | null>(null);
  const strokes = useRef(0);
  const cell = Math.max(3, Math.min(14, Math.floor(220 / cols)));
  const W = cols * cell;
  const H = rows * cell;

  const paintAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = painting.current;
    if (!p) return;
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * rows);
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;
    const id = wellId(row, col);
    const cur = value[id];
    if (p.erase ? cur === undefined : cur === brush) return;
    const next: Record<string, string> = p.erase
      ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== id))
      : { ...value, [id]: brush };
    onChange(next, `Paint wells ${String(p.stroke)}`);
  };

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
        role="grid"
        aria-label="Wells: click or drag to paint"
        width={W}
        height={H}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          strokes.current += 1;
          painting.current = { erase: erase || e.altKey, stroke: strokes.current };
          paintAt(e);
        }}
        onPointerMove={paintAt}
        onPointerUp={() => {
          painting.current = null;
        }}
      >
        <WellGrid rows={rows} cols={cols} cell={cell} value={value} />
      </svg>
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
