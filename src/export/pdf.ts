/**
 * PDF export (note 03): jsPDF + svg2pdf.js on the same export SVG, one PDF
 * page per figure page, page size in points. In `text` mode the fonts are
 * registered from the same TTFs the layout uses, so the PDF holds real,
 * searchable text with embedded fonts; `outline` mode needs no fonts.
 * Needs a DOM (svg2pdf walks a parsed SVG element).
 */
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

import { BRAND } from '@/brand';
import type { Figure, Page } from '@/core/model/types';
import { ALL_FONT_FILES, FAMILY_NAME, getFontData } from '@/core/text/fonts';
import { type SvgNode, el, nodeToSvgString } from '@/render/svgNode';

import { type ExportOptions, exportRoot } from './svg';

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

const PDF_STYLE = (bold: boolean, italic: boolean): string =>
  bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';

function registerFonts(pdf: jsPDF): void {
  for (const { id, style, file } of ALL_FONT_FILES) {
    const data = getFontData(file);
    if (!data) throw new Error(`Font ${file} is not loaded`);
    pdf.addFileToVFS(file, base64(data));
    pdf.addFont(file, FAMILY_NAME[id], PDF_STYLE(style.bold, style.italic));
  }
}

/**
 * svg2pdf sets a leaf's opacity in place of its group's instead of
 * multiplying them (spike finding, note 03), so a child at 0.8 inside a
 * group at 0.5 came out at 0.8. Each element gets its effective opacity
 * instead; overlaps inside a translucent group then show through each
 * other, which a PDF without transparency groups cannot avoid.
 */
export function flattenOpacity(node: SvgNode, inherited = 1): SvgNode {
  const own = node.attrs['opacity'];
  const eff = inherited * (typeof own === 'number' ? own : own === undefined ? 1 : Number(own));
  const leaf = node.tag !== 'g' && node.tag !== 'svg' && node.tag !== 'text';
  const attrs = { ...node.attrs, opacity: leaf && eff < 1 ? eff : undefined };
  if (node.tag === 'text' && eff < 1) attrs.opacity = eff;
  const pass = node.tag === 'text' ? 1 : eff;
  const children = node.children.map((c) => (typeof c === 'string' ? c : flattenOpacity(c, pass)));
  return el(node.tag, attrs, children);
}

function svgElement(text: string): Element {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') throw new Error('export produced invalid SVG');
  return root;
}

export async function exportPdf(
  figure: Figure,
  pages: readonly Page[],
  opts: ExportOptions,
  version: string,
): Promise<Uint8Array> {
  let pdf: jsPDF | null = null;
  for (const page of pages) {
    const root = exportRoot(figure, page, opts);
    const { width: w, height: h } = root;
    const orientation = w > h ? 'landscape' : 'portrait';
    if (pdf === null) {
      pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true });
      if (opts.textMode === 'text') registerFonts(pdf);
      pdf.setProperties({
        title: figure.doc.title,
        creator: `${BRAND.name} ${version}`,
        ...(root.credit ? { subject: root.credit } : {}),
      });
    } else {
      pdf.addPage([w, h], orientation);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${String(w)}" height="${String(h)}" viewBox="${String(root.x)} ${String(root.y)} ${String(w)} ${String(h)}">${nodeToSvgString(flattenOpacity(root.node), { stripData: true })}</svg>`;
    await svg2pdf(svgElement(svg), pdf, { x: 0, y: 0, width: w, height: h });
  }
  if (pdf === null) throw new Error('no pages to export');
  return new Uint8Array(pdf.output('arraybuffer'));
}
