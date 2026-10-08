/**
 * Arrange in grid (note 11): rows × columns, gutter, alignment and fit to
 * the page width for the selection; applying it is one named edit.
 */
import { useState } from 'react';

import {
  GRID_DEFAULTS,
  type GridHAlign,
  type GridVAlign,
  arrangeInGrid,
  gridShape,
} from '@/core/edits/grid';
import { formatLength, fromUnit } from '@/core/units';

import { analytics } from '../analytics';
import { currentPage, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

const clampInt = (v: number, max: number): number =>
  Math.min(Math.max(1, Math.floor(Number.isFinite(v) ? v : 1)), Math.max(1, max));

export function GridDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const page = currentPage(s);
  const sel = selectedObjects(s).filter((o) => o.locked !== true);
  const n = sel.length;
  const u = s.units;
  const [shape, setShape] = useState(() => gridShape(n));
  const [gutter, setGutter] = useState(() => formatLength(GRID_DEFAULTS.gutter, u));
  const [hAlign, setHAlign] = useState<GridHAlign>(GRID_DEFAULTS.hAlign);
  const [vAlign, setVAlign] = useState<GridVAlign>(GRID_DEFAULTS.vAlign);
  const [fitWidth, setFitWidth] = useState(GRID_DEFAULTS.fitWidth);
  const [letterRoom, setLetterRoom] = useState(GRID_DEFAULTS.letterRoom);
  const gutterPt = fromUnit(Number(gutter), u);
  const ok = n > 0 && shape.rows * shape.cols >= n && Number.isFinite(gutterPt) && gutterPt >= 0;

  const apply = () => {
    if (!ok) return;
    const done = store.edit(
      arrangeInGrid(
        page.id,
        sel.map((o) => o.id),
        { ...shape, gutter: gutterPt, hAlign, vAlign, fitWidth, letterRoom },
      ),
    );
    if (done) analytics.track('arrange', 'grid');
    onClose();
  };

  return (
    <Dialog title="Arrange in grid" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <fieldset>
          <legend>Grid</legend>
          <div className="row">
            <label htmlFor="grid-cols">Columns</label>
            <input
              id="grid-cols"
              type="number"
              min={1}
              max={n}
              value={shape.cols}
              onChange={(e) => {
                const cols = clampInt(Number(e.target.value), n);
                setShape({ cols, rows: Math.ceil(n / cols) });
              }}
            />
            <label htmlFor="grid-rows">Rows</label>
            <input
              id="grid-rows"
              type="number"
              min={1}
              max={n}
              value={shape.rows}
              onChange={(e) => {
                const rows = clampInt(Number(e.target.value), n);
                setShape({ rows, cols: Math.ceil(n / rows) });
              }}
            />
          </div>
          <div className="row">
            <label htmlFor="grid-gutter">Gutter ({u})</label>
            <input
              id="grid-gutter"
              type="number"
              min={0}
              step={u === 'in' ? 0.01 : 0.5}
              value={gutter}
              onChange={(e) => {
                setGutter(e.target.value);
              }}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend>In each cell</legend>
          <div className="row">
            <label htmlFor="grid-halign">Horizontal</label>
            <select
              id="grid-halign"
              value={hAlign}
              onChange={(e) => {
                setHAlign(e.target.value as GridHAlign);
              }}
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
            <label htmlFor="grid-valign">Vertical</label>
            <select
              id="grid-valign"
              value={vAlign}
              onChange={(e) => {
                setVAlign(e.target.value as GridVAlign);
              }}
            >
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={fitWidth}
                onChange={(e) => {
                  setFitWidth(e.target.checked);
                }}
              />{' '}
              Fit to page width ({formatLength(page.size.w, u)} {u})
            </label>
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={letterRoom}
                onChange={(e) => {
                  setLetterRoom(e.target.checked);
                }}
              />{' '}
              Leave room for panel letters
            </label>
          </div>
        </fieldset>
        <p className="note" role="status">
          {n === 0
            ? 'Select unlocked objects to arrange.'
            : `${String(n)} ${n === 1 ? 'object' : 'objects'}, each in its own lettered panel, in reading order.`}
        </p>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ok}>
            Arrange
          </button>
        </div>
      </form>
    </Dialog>
  );
}
