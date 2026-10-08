/**
 * The figure's palette (note 07): its swatches, each recolouring every use
 * linked to it; built-in palettes (colourblind-safe ones marked) applied to
 * the whole figure; linking and unlinking; and the colour-vision preview.
 */
import { useState } from 'react';

import { PALETTES, paletteById } from '@/palette/palettes';
import {
  addSwatch,
  applyPalette,
  docColours,
  linkColours,
  removeSwatch,
  renameSwatch,
  setSwatch,
  unlinkColours,
} from '@/palette/recolor';

import { analytics } from '../analytics';
import { type AppState, type Vision, figure, store } from '../state/store';

const VISIONS: readonly { id: Vision; label: string }[] = [
  { id: 'normal', label: 'Normal colour vision' },
  { id: 'deuteranopia', label: 'Deuteranopia (green-blind)' },
  { id: 'protanopia', label: 'Protanopia (red-blind)' },
  { id: 'tritanopia', label: 'Tritanopia (blue-blind)' },
  { id: 'greyscale', label: 'Greyscale (printing)' },
];

export function PaletteSection({ s }: { s: AppState }) {
  const doc = figure(s).doc;
  const [choice, setChoice] = useState('okabe-ito');
  const chosen = paletteById(choice);
  const fixedColours = docColours(doc).length;
  return (
    <section className="section" aria-label="Palette">
      <h2>Palette</h2>
      {doc.palette.length === 0 ? (
        <p className="note">
          No swatches yet. Apply a palette, or link the figure’s colours, and a change to a swatch
          recolours everything that uses it.
        </p>
      ) : (
        <ul className="swatch-list" aria-label="Swatches">
          {doc.palette.map((sw) => (
            <li key={sw.id} className="row">
              <input
                type="color"
                className="swatch"
                aria-label={`Colour of ${sw.name}`}
                value={sw.hex}
                onChange={(e) => {
                  store.edit(setSwatch(sw.id, e.target.value), { coalesce: `swatch:${sw.id}` });
                }}
              />
              <input
                type="text"
                aria-label={`Name of swatch ${sw.name}`}
                value={sw.name}
                onChange={(e) => {
                  store.edit(renameSwatch(sw.id, e.target.value), {
                    coalesce: `swatch-name:${sw.id}`,
                  });
                }}
              />
              <button
                type="button"
                className="icon"
                aria-label={`Remove swatch ${sw.name}`}
                title="Remove (its uses keep the colour)"
                onClick={() => {
                  store.edit(removeSwatch(sw.id));
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <label htmlFor="palette-choice">Palette</label>
        <select
          id="palette-choice"
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
          }}
        >
          {(['qualitative', 'sequential'] as const).map((k) => (
            <optgroup key={k} label={k === 'qualitative' ? 'Categories' : 'Ordered (sequential)'}>
              {PALETTES.filter((p) => p.kind === k).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.colourblindSafe ? ' ✓ colourblind-safe' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {chosen && (
        <div className="row palette-preview" aria-hidden="true">
          {chosen.colours.map((c) => (
            <span key={c} className="swatch" style={{ background: c, width: 16, height: 16 }} />
          ))}
        </div>
      )}
      {chosen && !chosen.colourblindSafe && (
        <p className="note warn" role="note">
          {chosen.name} is not colourblind-safe: some of its colours look alike to about 1 in 12
          men. Check with the colour-vision preview below.
        </p>
      )}
      <div className="row">
        <button
          type="button"
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return;
            store.edit(applyPalette(chosen));
            analytics.track('palette', 'apply', chosen.id);
          }}
        >
          Apply to figure
        </button>
        <button
          type="button"
          onClick={() => {
            store.edit(addSwatch('#0072b2'));
          }}
        >
          Add swatch
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          title={`Make each of the figure’s ${String(fixedColours)} colours a swatch`}
          onClick={() => {
            store.edit(linkColours());
            analytics.track('palette', 'link');
          }}
        >
          Link colours
        </button>
        <button
          type="button"
          disabled={doc.palette.length === 0}
          title="Fix every colour as it is now; swatches stay for later use"
          onClick={() => {
            store.edit(unlinkColours());
          }}
        >
          Unlink
        </button>
      </div>
      <div className="row">
        <label htmlFor="vision">Preview as</label>
        <select
          id="vision"
          value={s.vision}
          onChange={(e) => {
            store.setVision(e.target.value as Vision);
          }}
        >
          {VISIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
