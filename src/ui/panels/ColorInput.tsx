/** A colour control: the native picker, Okabe-Ito quick swatches and, where allowed, "none". */
import { OKABE_ITO, resolvePaint } from '@/core/color/color';
import type { Paint, Swatch } from '@/core/model/types';

interface Props {
  readonly label: string;
  readonly value: Paint | null;
  readonly palette: readonly Swatch[];
  readonly onChange: (p: Paint | null, live?: boolean) => void;
  readonly allowNone?: boolean;
}

export function ColorInput({ label, value, palette, onChange, allowNone = false }: Props) {
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
