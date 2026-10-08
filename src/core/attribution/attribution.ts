/**
 * Attribution is derived, never stored (note 02): the credit line and the
 * licence list come from the `meta` of every asset a figure (or a page)
 * uses.
 */
import { objectAssets, usedAssets } from '../model/tree';
import type { Assets, Doc, IconMeta, Page } from '../model/types';

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
}

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

export function creditItems(hashes: Iterable<string>, assets: Assets): CreditItem[] {
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
      const byAuthor = new Map<string, Set<string>>();
      for (const i of authored) {
        const k = i.author ?? '';
        byAuthor.set(k, (byAuthor.get(k) ?? new Set()).add(licenseLabel(i.license)));
      }
      for (const [a, ls] of [...byAuthor.entries()].sort(([x], [y]) => x.localeCompare(y)))
        bits.push(`${a} (${[...ls].sort().join(', ')})`);
      const anonLicenses = [...new Set(anon.map((i) => licenseLabel(i.license)))].sort();
      if (bits.length === 0) return `${source} (${anonLicenses.join(', ')})`;
      if (anonLicenses.length > 0) bits.push(`others (${anonLicenses.join(', ')})`);
      return `${source}: ${bits.join(', ')}`;
    });
    parts.push(`Icons: ${text.join('; ')}.`);
  }
  if (user.length > 0) parts.push(`Images: ${[...new Set(user.map((u) => u.source))].join('; ')}.`);
  return `Created with ${appName}. ${parts.join(' ')}`;
}

export const docCreditItems = (doc: Doc, assets: Assets): CreditItem[] =>
  creditItems(usedAssets(doc), assets);
