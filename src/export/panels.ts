/**
 * One file per panel (note 03): each panel's bounds become a crop of the page,
 * rendered by the same code as a page export (`crop` in the export options), and
 * the files are stored in one zip. Pure apart from the formats' own needs.
 */
import { zipSync } from 'fflate';

import { frameBounds, type Box } from '@/core/geometry/matrix';
import { panelLabels, readingOrder } from '@/core/model/panels';
import { pageObjects } from '@/core/model/tree';
import type { Figure, Page, Panel } from '@/core/model/types';

import { exportPdf } from './pdf';
import { type RasterOptions, exportPng, exportTiff } from './raster';
import { type ExportOptions, pageCredit, exportSvg } from './svg';

export type PanelFormat = 'svg' | 'pdf' | 'png' | 'tiff';

export interface PanelCrop {
  /** The panel's label as shown, e.g. "A" or "(b)". */
  readonly label: string;
  /** The label made safe for a file name, unique among the page's panels. */
  readonly name: string;
  readonly box: Box;
}

/** The panels of a page, in reading order, that an export can crop to. */
export function pagePanels(page: Page): Panel[] {
  return readingOrder(
    [...pageObjects(page)].filter((o): o is Panel => o.type === 'panel' && o.hidden !== true),
  );
}

const fileLabel = (label: string): string => label.replace(/[^\p{L}\p{N}]+/gu, '');

/** Crops of every panel on the page (none: the page has no panels). */
export function panelCrops(
  page: Page,
  format: Figure['doc']['panelLabelStyle']['format'],
): PanelCrop[] {
  const labels = panelLabels(page, format);
  const used = new Set<string>();
  return pagePanels(page).map((p, i) => {
    const label = labels.get(p.id) ?? p.label;
    const base = fileLabel(label) || `panel${String(i + 1)}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}-${String(n)}`;
    used.add(name.toLowerCase());
    return { label, name, box: frameBounds(p.frame) };
  });
}

const EXT: Record<PanelFormat, string> = { svg: 'svg', pdf: 'pdf', png: 'png', tiff: 'tif' };

/** `figure1_A.svg` */
export const panelFileName = (base: string, crop: PanelCrop, format: PanelFormat): string =>
  `${base}_${crop.name}.${EXT[format]}`;

export interface PanelExportOptions extends ExportOptions {
  readonly format: PanelFormat;
  readonly dpi: number;
  readonly transparent: boolean;
}

/**
 * The zip of one file per panel. Panel files carry no credit-line footer (it
 * would not fit the crop), so a `credits.txt` with the page's credit line is
 * added when the page needs one and the footer is asked for.
 */
export async function exportPanelsZip(
  figure: Figure,
  page: Page,
  base: string,
  opts: PanelExportOptions,
  version: string,
): Promise<Uint8Array> {
  const crops = panelCrops(page, figure.doc.panelLabelStyle.format);
  if (crops.length === 0) throw new Error('This page has no panels to export.');
  const files: Record<string, Uint8Array> = {};
  const enc = new TextEncoder();
  for (const crop of crops) {
    const name = panelFileName(base, crop, opts.format);
    const o = {
      textMode: opts.textMode,
      footer: false,
      background: opts.background,
      crop: crop.box,
    };
    const r: RasterOptions = {
      dpi: opts.dpi,
      transparent: opts.transparent,
      footer: false,
      crop: crop.box,
    };
    switch (opts.format) {
      case 'svg':
        files[name] = enc.encode(exportSvg(figure, page, o, version));
        break;
      case 'pdf':
        files[name] = await exportPdf(figure, [page], o, version);
        break;
      case 'png':
        files[name] = await exportPng(figure, page, r, version);
        break;
      case 'tiff':
        files[name] = await exportTiff(figure, page, r, version);
        break;
    }
  }
  const credit = pageCredit(figure, page);
  if (opts.footer && credit !== '') files['credits.txt'] = enc.encode(`${credit}\n`);
  // The files are already compressed or small text: store, do not deflate again.
  return zipSync(files, { level: 0 });
}
