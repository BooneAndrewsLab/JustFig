/**
 * The figure legend's skeleton (note 34, issue 70), derived from the document
 * and never stored: one entry per panel letter with its title, the scale bar
 * lengths, the channel names of merges and the credits typed for pictures. A
 * pure function of the figure, like `creditLine`.
 */
import { docCreditItems } from '@/core/attribution/attribution';
import { ownObjects, panelLabels, readingOrder } from '@/core/model/panels';
import { walk } from '@/core/model/tree';
import type { Figure, Obj, Panel, Text } from '@/core/model/types';
import { lengthLabel } from '@/procedural/kinds/scaleBar';
import { resolveProcedural } from '@/procedural/registry';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A text object's words, its paragraphs joined by spaces. */
const textOf = (t: Text): string =>
  squash(t.runs.map((p) => p.map((r) => r.text).join('')).join(' '));

/** The panel's title: its topmost (then leftmost) text object with any words in it. */
function titleOf(p: Panel): string {
  const texts = [...ownObjects(p.children)]
    .filter((o): o is Text => o.type === 'text')
    .filter((t) => textOf(t) !== '')
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  const first = texts[0];
  return first ? textOf(first) : '';
}

const join = (parts: readonly string[]): string =>
  parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;

/** "A. Title", "(b) Title"; the letter alone when the panel has no title. */
const entry = (label: string, title: string): string =>
  `${label}${/[.)]$/.test(label) ? '' : '.'}${title === '' ? '' : ` ${title}`}`;

/** The figure's legend skeleton as plain text; empty when there is nothing to say. */
export function legendText(fig: Figure): string {
  const { doc, assets } = fig;
  const entries: string[] = [];
  // Scale bar length (µm) -> the panel letters it appears in.
  const bars = new Map<number, string[]>();
  let barCount = 0;
  const channels: string[] = [];

  const note = (o: Obj, panel: string | undefined): void => {
    if (o.type === 'procedural' && o.kind === 'scaleBar') {
      const len = resolveProcedural(o)?.params['length'];
      if (typeof len === 'number' && Number.isFinite(len)) {
        barCount += 1;
        const at = bars.get(len) ?? [];
        if (panel !== undefined && !at.includes(panel)) at.push(panel);
        bars.set(len, at);
      }
    } else if (o.type === 'image' && o.channels) {
      for (const c of o.channels) {
        if (!c.on) continue;
        const a = assets[c.asset];
        if (a?.kind !== 'image') continue;
        const name = a.meta.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
        if (name !== '' && !channels.includes(name)) channels.push(name);
      }
    }
  };

  for (const page of doc.pages) {
    const labels = panelLabels(page, doc.panelLabelStyle.format);
    const all = page.layers.flatMap((l) => [...walk(l.children)]);
    const panels = all.filter((o): o is Panel => o.type === 'panel');
    for (const p of readingOrder(panels)) {
      const label = labels.get(p.id) ?? p.label;
      entries.push(entry(label, titleOf(p)));
      for (const o of ownObjects(p.children)) note(o, label);
    }
    // Everything inside a panel was noted under the innermost one; the rest belongs to none.
    const nested = new Set<Obj>();
    for (const p of panels) for (const o of walk(p.children)) nested.add(o);
    for (const o of all) if (o.type !== 'panel' && !nested.has(o)) note(o, undefined);
  }

  const out = [...entries];
  if (bars.size > 0) {
    const lens = [...bars.keys()].sort((a, b) => a - b);
    const noun = barCount === 1 ? 'Scale bar' : 'Scale bars';
    const parts = lens.map((l) => {
      const at = bars.get(l) ?? [];
      return `${lengthLabel(l)}${lens.length > 1 && at.length > 0 ? ` (${at.join(', ')})` : ''}`;
    });
    out.push(`${noun}, ${join(parts)}.`);
  }
  if (channels.length > 0) out.push(`Channels: ${channels.join(', ')}.`);
  const credits = [
    ...new Set(
      docCreditItems(doc, assets)
        .filter((i) => i.kind !== 'icon')
        .map((i) => i.source),
    ),
  ];
  if (credits.length > 0) out.push(`Images: ${credits.join('; ')}.`);
  return out.join('\n');
}
