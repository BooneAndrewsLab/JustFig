/**
 * The generic stepper (note 58): a few questions, one page each, asked with the same generated
 * controls as the Inspector, inside `Dialog` (focus trap, Escape closes). It knows nothing of
 * kinds: it gets steps and gives back answers. Enter goes to the next step (Finish on the last),
 * Back and Next move between them, and the answers live only as long as the dialog.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Swatch } from '@/core/model/types';
import { decodeParams, visibleFields } from '@/procedural/params';
import type { Params, ScalarField, WizardStep } from '@/procedural/types';

import { ScalarControl } from '../panels/ScalarControl';
import { Dialog } from './Dialog';

export function WizardDialog({
  title,
  steps,
  finishLabel = 'Finish',
  problems,
  preview,
  palette = [],
  onFinish,
  onClose,
}: {
  title: string;
  steps: readonly WizardStep[];
  finishLabel?: string;
  /** Live messages about the answers so far (decoded), shown under the questions. */
  problems?: (answers: Params) => readonly string[];
  /** A picture of what the answers so far give (decoded). */
  preview?: (answers: Params) => ReactNode;
  palette?: readonly Swatch[];
  /** The answers, decoded against every step's fields. */
  onFinish: (answers: Params) => void;
  onClose: () => void;
}) {
  const fields = steps.flatMap((s) => s.fields);
  const [raw, setRaw] = useState<Params>(() => decodeParams(fields, {}));
  const [at, setAt] = useState(0);
  const body = useRef<HTMLFieldSetElement>(null);
  const first = useRef(true);
  const answers = decodeParams(fields, raw);
  const step = steps[at];
  const last = at === steps.length - 1;

  // A new step: focus its first control (the dialog itself focuses the first one on opening).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    body.current?.querySelector<HTMLElement>('input, select, button')?.focus();
  }, [at]);

  if (!step) return null;
  const shown = visibleFields(step.fields, answers) as ScalarField[];
  const messages = problems?.(answers) ?? [];
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="wizard"
        onKeyDown={(e) => {
          // Enter on a select or a checkbox goes on too, as it does in a text or number field.
          const t = e.target;
          if (
            e.key === 'Enter' &&
            (t instanceof HTMLSelectElement ||
              (t instanceof HTMLInputElement && t.type === 'checkbox'))
          ) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (last) onFinish(answers);
          else setAt(at + 1);
        }}
      >
        <p className="note wizard__step" aria-live="polite">
          Step {at + 1} of {steps.length}
        </p>
        <fieldset ref={body}>
          <legend>{step.question}</legend>
          {shown.map((f) => (
            <div key={f.key}>
              <ScalarControl
                f={f}
                idPrefix="wizard"
                palette={palette}
                value={(raw[f.key] as typeof f.default | undefined) ?? f.default}
                onChange={(v) => {
                  setRaw({ ...raw, [f.key]: v });
                }}
              />
              {f.help && <p className="note">{f.help}</p>}
            </div>
          ))}
        </fieldset>
        {preview && (
          <div className="wizard__preview" aria-hidden="true">
            {preview(answers)}
          </div>
        )}
        <div aria-live="polite">
          {messages.map((m) => (
            <p key={m} className="note warn">
              {m}
            </p>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={at === 0}
            onClick={() => {
              setAt(at - 1);
            }}
          >
            Back
          </button>
          <button type="submit" className="primary">
            {last ? finishLabel : 'Next'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
