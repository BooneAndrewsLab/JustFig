/**
 * A kind's wizard (note 58) in the generic stepper: a button that opens it, a live preview drawn
 * by the kind itself, and on Finish either a new object at the view centre (the Objects shelf)
 * or one named edit on the selected object (the Inspector). Nothing here is per kind.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { Procedural } from '@/core/model/types';
import type { ProceduralKind } from '@/procedural/types';
import { applyWizard, createFromWizard, wizardProblems } from '@/procedural/wizard';

import { analytics } from '../analytics';
import { procSvg } from '../panels/kindSvg';
import { placeFromWizard } from '../state/session';
import { currentPage, figure, store } from '../state/store';
import { WizardDialog } from './WizardDialog';

/** Opens the kind's wizard; with `target`, Finish applies it to that object instead of placing one. */
export function KindWizardButton({
  kind: k,
  target,
}: {
  kind: ProceduralKind;
  target?: Procedural;
}) {
  const [open, setOpen] = useState(false);
  const w = k.wizard;
  if (!w) return null;
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="wizard-open"
        data-kind={k.kind}
        title={
          target
            ? `Answer a few questions to lay out this ${k.title.toLowerCase()}`
            : `Answer a few questions to add a ${k.title.toLowerCase()}`
        }
        onClick={() => {
          setOpen(true);
        }}
      >
        {w.title}…
      </button>
      {open &&
        createPortal(
          <WizardDialog
            title={w.title}
            steps={w.steps}
            finishLabel={target ? 'Apply' : 'Add'}
            problems={(a) => wizardProblems(w, a)}
            preview={(a) => (
              <span
                dangerouslySetInnerHTML={{
                  __html: procSvg(createFromWizard(k, a, { x: 0, y: 0 })),
                }}
              />
            )}
            palette={figure(store.getState()).doc.palette}
            onClose={close}
            onFinish={(a) => {
              close();
              if (!target) {
                placeFromWizard(k.kind, a);
                return;
              }
              const page = currentPage(store.getState()).id;
              if (store.edit(applyWizard(page, target.id, k, a), { keepSelection: true }))
                analytics.track('preset', 'wizard', `${k.kind}/apply`);
            }}
          />,
          document.body,
        )}
    </>
  );
}
