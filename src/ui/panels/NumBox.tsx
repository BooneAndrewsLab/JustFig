/**
 * A number input with its unit inside the box and a slim ▴▾ column at the right (note 59). The
 * `<input type="number">` keeps its name, min, max and step, and ArrowUp/Down still step it; the
 * native spinner is hidden and the two buttons call `stepUp()`/`stepDown()` on it, so they honour
 * the same bounds. They are not tabbable: the keyboard already has the arrow keys.
 */
import { type InputHTMLAttributes, useRef } from 'react';

export function NumBox({
  unit,
  onChange,
  className,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  unit?: string | undefined;
  /** The value as typed or stepped; '' while the field is being cleared. */
  onChange: (raw: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const spin = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el || el.disabled) return;
    if (el.value === '') el.value = String(input.min ?? 0);
    if (dir === 1) el.stepUp();
    else el.stepDown();
    onChange(el.value);
  };
  return (
    <span className={className === undefined ? 'numbox' : `numbox ${className}`}>
      <input
        ref={ref}
        type="number"
        {...input}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {unit !== undefined && (
        <span className="numbox__unit" aria-hidden="true">
          {unit}
        </span>
      )}
      <span className="numbox__spin" aria-hidden="true">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            spin(1);
          }}
        >
          <svg viewBox="0 0 8 8" width="8" height="8">
            <path d="M1.5 5.5 4 3l2.5 2.5" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            spin(-1);
          }}
        >
          <svg viewBox="0 0 8 8" width="8" height="8">
            <path d="M1.5 2.5 4 5l2.5-2.5" />
          </svg>
        </button>
      </span>
    </span>
  );
}
