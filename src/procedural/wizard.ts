/**
 * Kind wizards (note 58): a few answers, asked by one generic stepper, that fill many params.
 * The answers are never stored; only the params `build` makes of them reach the object.
 */
import type { Edit } from '@/core/edits/edits';
import type { Id } from '@/core/model/ids';
import type { Procedural, Vec2 } from '@/core/model/types';

import { createProcedural } from './edits';
import { decodeParams } from './params';
import { applyOver } from './presets';
import type { KindWizard, Params, ProceduralKind, ScalarField } from './types';

/** Every question's fields, in step order. */
export const wizardFields = (w: KindWizard): readonly ScalarField[] =>
  w.steps.flatMap((s) => s.fields);

/** Answers decoded like params: the defaults for `{}`, anything else clamped to its field. */
export const wizardAnswers = (w: KindWizard, raw: unknown = {}): Params =>
  decodeParams(wizardFields(w), raw);

/** The params the answers give (the answers decoded first, so `build` sees only valid ones). */
export const wizardParams = (w: KindWizard, raw: unknown): Params =>
  w.build(wizardAnswers(w, raw)) as Params;

/** What the answers cannot give, for the stepper to show before finishing. */
export const wizardProblems = (w: KindWizard, raw: unknown): readonly string[] =>
  w.problems?.(wizardAnswers(w, raw)) ?? [];

/** A new object of the kind from the answers, centred on `at`. */
export function createFromWizard(k: ProceduralKind, raw: unknown, at: Vec2): Procedural {
  if (!k.wizard) return createProcedural(k, at);
  return createProcedural(k, at, wizardParams(k.wizard, raw));
}

/** The wizard's params on an existing object: one named edit setting only the keys it builds. */
export function applyWizard(pageId: Id, id: Id, k: ProceduralKind, raw: unknown): Edit {
  const w = k.wizard;
  return applyOver(pageId, id, k, w ? w.title : k.title, {
    params: w ? wizardParams(w, raw) : {},
  });
}
