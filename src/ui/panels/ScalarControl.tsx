/** One generated control for a scalar field (note 04): the Inspector's, list rows' and wizards'. */
import type { Paint, Swatch } from '@/core/model/types';
import { roundTo } from '@/procedural/params';
import type { Scalar, ScalarField } from '@/procedural/types';

import { ColorInput } from './ColorInput';
import { NumBox } from './NumBox';

export function ScalarControl({
  f,
  value,
  onChange,
  idPrefix,
  palette,
}: {
  f: ScalarField;
  value: Scalar;
  onChange: (v: Scalar) => void;
  idPrefix: string;
  palette: readonly Swatch[];
}) {
  const id = `${idPrefix}-${f.key}`;
  switch (f.type) {
    case 'number':
    case 'int':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <NumBox
            id={id}
            value={typeof value === 'number' ? roundTo(value, f.step) : ''}
            min={f.min}
            max={f.max}
            step={f.step ?? (f.type === 'int' ? 1 : 0.5)}
            unit={f.unit}
            onChange={(raw) => {
              const v = Number(raw);
              if (raw !== '' && Number.isFinite(v)) onChange(v);
            }}
          />
        </div>
      );
    case 'enum':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <select
            id={id}
            value={String(value)}
            onChange={(e) => {
              const o = f.options.find((x) => String(x.value) === e.target.value);
              if (o) onChange(o.value);
            }}
          >
            {f.options.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'bool':
      return (
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => {
                onChange(e.target.checked);
              }}
            />{' '}
            {f.label}
          </label>
        </div>
      );
    case 'text':
      return (
        <div className="row">
          <label htmlFor={id}>{f.label}</label>
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : ''}
            maxLength={f.maxLength}
            {...(f.placeholder ? { placeholder: f.placeholder } : {})}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        </div>
      );
    case 'color': {
      const hex = typeof value === 'string' ? value : '';
      return (
        <>
          <ColorInput
            label={f.label}
            value={hex === '' ? null : { hex }}
            palette={palette}
            copy
            allowNone={f.auto === true}
            onChange={(p: Paint | null) => {
              onChange(p === null ? '' : 'hex' in p ? p.hex : f.default);
            }}
          />
          {f.auto === true && hex === '' && <p className="note">Automatic colour</p>}
        </>
      );
    }
  }
}
