/**
 * Numbered step badges (note 48): Number steps puts one badge on each
 * selected object, Add step one on a single object, as one named edit. The
 * badges are added unlaid, directly above their targets; their number, size
 * and position are written by `reconcileBindings` (`model/steps.ts`), which
 * runs after this edit like after every other.
 */
import { objBounds } from '../geometry/transform';
import { type Id, newId } from '../model/ids';
import { anchorPoint, isStep } from '../model/steps';
import { mapPageObjs, pageObjects } from '../model/tree';
import type {
  Doc,
  Obj,
  Paint,
  PanelLabelStyle,
  StepAnchor,
  StepLink,
  StepVariant,
  Text,
} from '../model/types';
import { type Edit, EditError, updateObjects, withPage } from './edits';

/** The colour of the swatch a figure's first badges add to its palette. */
export const STEP_COLOUR = '#0072b2';

/** A badge on `target` with no number yet (reconcile lays it out). */
export function stepBadge(
  target: Obj,
  paint: Paint,
  style: PanelLabelStyle,
  variant: StepVariant = 'circle',
  anchor: StepAnchor = 'top-left',
): Text {
  const at = anchorPoint(objBounds(target), anchor);
  const step: StepLink = { target: target.id, anchor, offset: { x: 0, y: 0 }, variant, paint };
  return {
    id: newId('o'),
    type: 'text',
    name: 'Step badge',
    frame: { x: at.x, y: at.y, w: 0, h: 0, rotation: 0 },
    opacity: 1,
    runs: [[{ text: '', font: style.font, size: style.size, color: paint }]],
    align: 'center',
    lineHeight: 1,
    autoWidth: false,
    step,
  };
}

/**
 * The paint new badges take: the one the figure's badges already use, else a
 * "Steps" swatch (added to the palette when missing) so palettes recolour it.
 */
function stepPaint(doc: Doc): { paint: Paint; doc: Doc } {
  for (const p of doc.pages)
    for (const o of pageObjects(p)) if (isStep(o)) return { paint: o.step.paint, doc };
  const sw = doc.palette.find((s) => s.name === 'Steps');
  if (sw) return { paint: { swatch: sw.id }, doc };
  const id = newId('sw');
  return {
    paint: { swatch: id },
    doc: { ...doc, palette: [...doc.palette, { id, name: 'Steps', hex: STEP_COLOUR }] },
  };
}

/**
 * Number steps (several objects) or Add step (one): a badge on each object
 * that is not a badge and has none yet, numbered in reading order.
 */
export function numberSteps(pageId: Id, ids: readonly Id[]): Edit {
  return {
    label: ids.length === 1 ? 'Add step' : 'Number steps',
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const has = new Set<Id>();
      for (const o of pageObjects(page)) if (isStep(o)) has.add(o.step.target);
      const want = new Set(ids);
      const targets = [...pageObjects(page)].filter(
        (o) => want.has(o.id) && !isStep(o) && !has.has(o.id),
      );
      if (targets.length === 0)
        throw new EditError(
          ids.length === 1
            ? 'That object already has a step.'
            : 'Those objects already have steps.',
        );
      const { paint, doc } = stepPaint(f.doc);
      const style = doc.panelLabelStyle;
      const badges = new Map(targets.map((t) => [t.id, stepBadge(t, paint, style)]));
      const next = { ...f, doc };
      return withPage(next, pageId, (p) =>
        mapPageObjs(p, (o) => {
          const b = badges.get(o.id);
          return b ? [o, b] : o;
        }),
      );
    },
  };
}

/** The badge's circle or plain look. */
export const setStepVariant = (pageId: Id, ids: readonly Id[], variant: StepVariant): Edit =>
  updateObjects(pageId, ids, 'Step style', (o) =>
    o.type === 'text' && o.step ? { ...o, step: { ...o.step, variant } } : o,
  );

/** The badge's colour (a swatch link keeps it recolourable). */
export const setStepPaint = (pageId: Id, ids: readonly Id[], paint: Paint): Edit =>
  updateObjects(pageId, ids, 'Step colour', (o) =>
    o.type === 'text' && o.step ? { ...o, step: { ...o.step, paint } } : o,
  );

/** The corner of its object the badge sits at (its offset from it reset). */
export const setStepAnchor = (pageId: Id, ids: readonly Id[], anchor: StepAnchor): Edit =>
  updateObjects(pageId, ids, 'Step corner', (o) =>
    o.type === 'text' && o.step ? { ...o, step: { ...o.step, anchor, offset: { x: 0, y: 0 } } } : o,
  );
