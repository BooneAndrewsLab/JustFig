/**
 * What a generated gallery entry builds its figure with (note 08, "Save as
 * template"): literal objects, assets and document settings, given fresh
 * ids and with attached arrows solved, as the hand-written entries do.
 */
import { reconcileBindings } from '@/core/model/binding';
import { cloneObjects } from '@/core/model/clone';
import { createDoc, createPage } from '@/core/model/factory';
import type { Assets, Doc, Figure, Obj, Page } from '@/core/model/types';

/** The document settings a template keeps: everything but ids and pages. */
export type TemplateDoc = Omit<Doc, 'id' | 'pages'>;
/** The page a template keeps: its size and background. */
export type TemplatePage = Omit<Page, 'id' | 'layers'>;

/** A one-page figure with fresh ids; `objects` go on the first layer. */
export function templateFigure(
  doc: TemplateDoc,
  page: TemplatePage,
  objects: readonly Obj[],
  assets: Assets,
): Figure {
  const base = createPage(page.name);
  const layers = base.layers.map((l, i) =>
    i === 0 ? { ...l, children: cloneObjects(objects) } : l,
  );
  const made: Doc = { ...createDoc(doc.title), ...doc, pages: [{ ...base, ...page, layers }] };
  return reconcileBindings({ doc: { ...made, pages: [] }, assets }, { doc: made, assets });
}
