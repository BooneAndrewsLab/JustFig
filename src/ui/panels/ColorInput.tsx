/**
 * A colour control: the native picker, the figure's swatches (choosing one
 * links the colour to it, note 07), Okabe-Ito quick colours and, where
 * allowed, "none". With `copy` (procedural params, whose colours carry
 * meaning) a swatch click stores its hex by value, never a link, so a later
 * palette change leaves the colour alone.
 */
import { OKABE_ITO, resolvePaint } from '@/core/color/color';
import type { Paint, Swatch } from '@/core/model/types';

interface Props {
  readonly label: string;
  readonly value: Paint | null;
  readonly palette: readonly Swatch[];
  readonly onChange: (p: Paint | null, live?: boolean) => void;
  readonly allowNone?: boolean;
  /** Swatches copy their hex instead of linking. */
  readonly copy?: boolean;
}

export function ColorInput({
  label,
  value,
  palette,
  onChange,
  allowNone = false,
  copy = false,
}: Props) {
  const hex = value === null ? '#ffffff' : resolvePaint(value, palette);
  return (
    <div className="row">
      <label>{label}</label>
      <input
        type="color"
        aria-label={label}
        className={`swatch${value === null ? ' none' : ''}`}
        value={hex}
        onChange={(e) => {
          onChange({ hex: e.target.value }, true);
        }}
      />
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {copy && palette.length > 0 && (
          <span
            className="note"
            title="Choosing a palette swatch copies its colour; later palette changes leave it alone."
          >
            Palette (copies):
          </span>
        )}
        {palette.map((sw) => {
          const linked = value !== null && 'swatch' in value && value.swatch === sw.id;
          return (
            <button
              key={sw.id}
              type="button"
              className={copy ? 'swatch' : 'swatch linked'}
              title={
                copy
                  ? `${sw.name} ${sw.hex} (copies the colour; not linked to the palette)`
                  : `${sw.name} (linked: follows the swatch)`
              }
              aria-label={`${label} swatch ${sw.name}`}
              aria-pressed={copy ? undefined : linked}
              style={{ background: sw.hex, width: 14, height: 14 }}
              onClick={() => {
                onChange(copy ? { hex: sw.hex } : { swatch: sw.id });
              }}
            />
          );
        })}
        {palette.length > 0 && <span className="swatch-sep" aria-hidden="true" />}
        {OKABE_ITO.concat(['#ffffff']).map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            title={c}
            aria-label={`${label} ${c}`}
            style={{ background: c, width: 14, height: 14 }}
            onClick={() => {
              onChange({ hex: c });
            }}
          />
        ))}
        {allowNone && (
          <button
            type="button"
            className="swatch none"
            title="None"
            aria-label={`${label} none`}
            style={{ width: 14, height: 14 }}
            onClick={() => {
              onChange(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
