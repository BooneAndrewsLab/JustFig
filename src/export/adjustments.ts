/**
 * The "Image adjustments" statement (note 37, issue 68), derived from the document and
 * never stored, for a Methods section: which panels had levels or inversion applied, that
 * the adjustment was linear and over the whole image, and which panels had none. A pure
 * function of the figure, like `legendText`.
 */
import { levelsOf } from '@/core/edits/levels';
import { ownObjects, panelLabels, readingOrder } from '@/core/model/panels';
import { walk } from '@/core/model/tree';
import type { Figure, Image, Obj, Panel } from '@/core/model/types';

/** "(b)" and "B." both read as "B" in a sentence. */
const letterOf = (label: string): string => label.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

const join = (parts: readonly string[]): string =>
  parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;

/** "panel B", "panels B and C", with pictures outside any panel as a last item. */
function where(panels: readonly string[], outside: boolean): string {
  const parts = [
    ...(panels.length === 0 ? [] : [`${panels.length === 1 ? 'panel' : 'panels'} ${join(panels)}`]),
    ...(outside ? ['pictures outside the lettered panels'] : []),
  ];
  return join(parts);
}

/** The statement as plain text; empty when no picture has levels or inversion. */
export function adjustmentsStatement(fig: Figure): string {
  const { doc } = fig;
  const levelled: string[] = [];
  const inverted: string[] = [];
  const plain: string[] = [];
  let levelledOutside = false;
  let invertedOutside = false;

  const add = (list: string[], letter: string): void => {
    if (!list.includes(letter)) list.push(letter);
  };

  for (const page of doc.pages) {
    const labels = panelLabels(page, doc.panelLabelStyle.format);
    const all = page.layers.flatMap((l) => [...walk(l.children)]);
    const panels = all.filter((o): o is Panel => o.type === 'panel');
    const inPanel = new Set<Obj>();
    for (const p of panels) for (const o of walk(p.children)) inPanel.add(o);
    const pics = (objs: Iterable<Obj>): Image[] =>
      [...objs].filter((o): o is Image => o.type === 'image');
    const kinds = (o: Image): { l: boolean; i: boolean } => {
      const v = levelsOf(o);
      return { l: v.min > 0 || v.max < 255, i: v.invert };
    };

    for (const p of readingOrder(panels)) {
      const letter = letterOf(labels.get(p.id) ?? p.label);
      const mine = pics(ownObjects(p.children));
      if (letter === '' || mine.length === 0) continue;
      let any = false;
      for (const o of mine) {
        const k = kinds(o);
        if (k.l) add(levelled, letter);
        if (k.i) add(inverted, letter);
        any ||= k.l || k.i;
      }
      if (!any) add(plain, letter);
    }
    for (const o of pics(all.filter((x) => !inPanel.has(x)))) {
      const k = kinds(o);
      levelledOutside ||= k.l;
      invertedOutside ||= k.i;
    }
  }

  if (levelled.length === 0 && inverted.length === 0 && !levelledOutside && !invertedOutside)
    return '';

  const clauses: string[] = [];
  if (levelled.length > 0 || levelledOutside)
    clauses.push(
      `levels (black and white points, a linear stretch) were applied to the whole image in ${where(levelled, levelledOutside)}`,
    );
  if (inverted.length > 0 || invertedOutside)
    clauses.push(
      `${clauses.length > 0 ? 'and ' : ''}intensities were inverted over the whole image in ${where(inverted, invertedOutside)}`,
    );
  const text = `${clauses.join(', ')}.`.replace(/^./, (c) => c.toUpperCase());
  const unadjusted = plain.filter((l) => !levelled.includes(l) && !inverted.includes(l));
  const rest =
    unadjusted.length === 0 ? '' : ` Pictures in ${where(unadjusted, false)} were not adjusted.`;
  return `Image adjustments: ${text}${rest}`;
}
