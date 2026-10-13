/**
 * Attribution is derived, never stored (note 02): the credit line and the
 * licence list come from the `meta` of every asset a figure (or a page)
 * uses.
 */
import { docObjects, objectAssets, pageObjects, usedAssets } from '../model/tree';
import type { Assets, Doc, IconMeta, Obj, Page } from '../model/types';

export interface CreditItem {
  readonly hash: string;
  readonly kind: 'icon' | 'image' | 'svg';
  readonly title: string;
  readonly source: string;
  readonly author?: string;
  readonly license: string;
  readonly licenseUrl?: string;
  readonly originalUrl?: string;
  readonly shareAlike: boolean;
  /**
   * Recoloured in this figure, or adapted by the icon library ('all'). CC BY
   * and CC BY-SA require saying so, so the credit line adds "modified" for
   * those licences.
   */
  readonly modified?: 'all' | 'some';
}

/** Licences whose credit must state modifications (CC BY, CC BY-SA). */
export const needsModifiedNote = (spdx: string): boolean => /^CC-BY-(SA-)?\d/.test(spdx);

/**
 * Icon assets recoloured somewhere in these objects: 'all' when every use
 * is recoloured, 'some' when only some are.
 */
export function recolouredAssets(objs: Iterable<Obj>): Map<string, 'all' | 'some'> {
  const uses = new Map<string, { n: number; recoloured: number }>();
  for (const o of objs) {
    if (o.type !== 'icon') continue;
    const u = uses.get(o.asset) ?? { n: 0, recoloured: 0 };
    u.n += 1;
    if (Object.keys(o.slots).length > 0) u.recoloured += 1;
    uses.set(o.asset, u);
  }
  const out = new Map<string, 'all' | 'some'>();
  for (const [h, u] of uses)
    if (u.recoloured > 0) out.set(h, u.recoloured === u.n ? 'all' : 'some');
  return out;
}

const modifiedOf = (m: 'all' | 'some' | undefined): { modified?: 'all' | 'some' } =>
  m === undefined ? {} : { modified: m };

/** SPDX id → how a credit line writes it. */
export function licenseLabel(spdx: string): string {
  const m = /^CC-(BY[A-Z-]*)-(\d\.\d)$/.exec(spdx);
  if (m?.[1] && m[2]) return `CC ${m[1]} ${m[2]}`;
  if (spdx === 'CC0-1.0') return 'CC0';
  return spdx;
}

export function pageAssets(page: Page): Set<string> {
  const out = new Set<string>();
  for (const l of page.layers)
    for (const o of l.children) objectAssets(o).forEach((h) => out.add(h));
  return out;
}

export function creditItems(
  hashes: Iterable<string>,
  assets: Assets,
  recoloured: ReadonlyMap<string, 'all' | 'some'> = new Map(),
): CreditItem[] {
  const out: CreditItem[] = [];
  for (const h of [...hashes].sort()) {
    const a = assets[h];
    if (!a) continue;
    if (a.kind === 'icon') {
      const m: IconMeta = a.meta;
      out.push({
        hash: h,
        kind: 'icon',
        title: m.title,
        source: m.source,
        ...(m.author === undefined ? {} : { author: m.author }),
        license: m.license,
        licenseUrl: m.licenseUrl,
        originalUrl: m.originalUrl,
        shareAlike: m.shareAlike,
        ...modifiedOf(m.adapted ? 'all' : recoloured.get(h)),
      });
    } else if (a.meta.credit !== undefined && a.meta.credit.trim() !== '') {
      out.push({
        hash: h,
        kind: a.kind === 'image' ? 'image' : 'svg',
        title: a.meta.name,
        source: a.meta.credit.trim(),
        license: 'user',
        shareAlike: false,
      });
    }
  }
  return out;
}

/**
 * The licences of some items, each once, sorted; a CC BY / BY-SA licence
 * carries "modified" when its icons were recoloured ("some modified" when
 * only some of them were).
 */
function licenceLabels(items: readonly CreditItem[]): string[] {
  const by = new Map<string, CreditItem[]>();
  for (const i of items) by.set(i.license, [...(by.get(i.license) ?? []), i]);
  const out: string[] = [];
  for (const [spdx, list] of by) {
    let label = licenseLabel(spdx);
    if (needsModifiedNote(spdx)) {
      const all = list.every((i) => i.modified === 'all');
      const any = list.some((i) => i.modified !== undefined);
      if (all) label += ', modified';
      else if (any) label += ', some modified';
    }
    out.push(label);
  }
  return out.sort();
}

/**
 * "Created with App. Icons: Source (CC0); Other: A. Author (CC BY 4.0),
 * B. Author (MIT). Images: credit." Empty when nothing needs crediting.
 */
export function creditLine(items: readonly CreditItem[], appName: string): string {
  const icons = items.filter((i) => i.kind === 'icon');
  const user = items.filter((i) => i.kind !== 'icon');
  if (icons.length === 0 && user.length === 0) return '';
  const parts: string[] = [];
  if (icons.length > 0) {
    const bySource = new Map<string, CreditItem[]>();
    for (const i of icons) bySource.set(i.source, [...(bySource.get(i.source) ?? []), i]);
    const sources = [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b));
    const text = sources.map(([source, list]) => {
      const authored = list.filter((i) => i.author !== undefined);
      const anon = list.filter((i) => i.author === undefined);
      const bits: string[] = [];
      const byAuthor = new Map<string, CreditItem[]>();
      for (const i of authored) {
        const k = i.author ?? '';
        byAuthor.set(k, [...(byAuthor.get(k) ?? []), i]);
      }
      for (const [a, list] of [...byAuthor.entries()].sort(([x], [y]) => x.localeCompare(y)))
        bits.push(`${a} (${licenceLabels(list).join(', ')})`);
      const anonLicenses = licenceLabels(anon);
      if (bits.length === 0) return `${source} (${anonLicenses.join(', ')})`;
      if (anonLicenses.length > 0) bits.push(`others (${anonLicenses.join(', ')})`);
      return `${source}: ${bits.join(', ')}`;
    });
    parts.push(`Icons: ${text.join('; ')}.`);
  }
  if (user.length > 0) parts.push(`Images: ${[...new Set(user.map((u) => u.source))].join('; ')}.`);
  return `Created with ${appName}. ${parts.join(' ')}`;
}

/**
 * "Licences: CC BY 4.0 https://…; CC0 https://…." for the icons' licences,
 * each once: the link CC BY asks for next to the credit, kept out of the
 * visible footer (it goes in file metadata and credits.txt). Empty when no
 * icon has a licence URL.
 */
export function licenceLinks(items: readonly CreditItem[]): string {
  const urls = new Map<string, string>();
  for (const i of items)
    if (i.kind === 'icon' && i.licenseUrl) urls.set(licenseLabel(i.license), i.licenseUrl);
  if (urls.size === 0) return '';
  const list = [...urls.entries()].sort(([a], [b]) => a.localeCompare(b));
  return `Licences: ${list.map(([l, u]) => `${l} ${u}`).join('; ')}.`;
}

export const docCreditItems = (doc: Doc, assets: Assets): CreditItem[] =>
  creditItems(usedAssets(doc), assets, recolouredAssets(docObjects(doc)));

export const pageCreditItems = (page: Page, assets: Assets): CreditItem[] =>
  creditItems(pageAssets(page), assets, recolouredAssets(pageObjects(page)));
