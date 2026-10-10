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
import { pageObjects } from '@/core/model/tree';
import type { AssetHash, Figure, Page } from '@/core/model/types';
import { ALL_FONT_FILES, FAMILY_NAME, getFontData } from '@/core/text/fonts';
import { base64 as base64Of, encodePngSync, fromBase64 } from '@/io/png';
import type { ImageHref } from '@/render/objectToNode';
import { type SvgNode, el, nodeToSvgString } from '@/render/svgNode';

import { decodeParms, type PdfImage, pdfImage } from './pdfImages';
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

/** svg2pdf matches each image's data URI with a backtracking regex that overflows the stack at about 12 MB (20 Mpx pictures). */
export const BIG_DATA_URI = 4_000_000;

/** jsPDF image format of a picture prepared by `pdfImage`: its processor only looks it up. */
const PREPARED = 'PREPARED';
const prepared = new WeakMap<Uint8Array, PdfImage>();

/**
 * Bytes as the binary string jsPDF writes streams from, in pieces passed with
 * `apply` (spreading 32 k arguments took 1 s for 16 MB; this, 0.2 s).
 */
function binaryString(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x2000)
    parts.push(
      String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000) as unknown as number[]),
    );
  return parts.join('');
}

// jsPDF picks an image processor by format name (`process<FORMAT>`); this one
// returns the record its `putImage` writes as an XObject, data unchanged.
(jsPDF.API as unknown as Record<string, unknown>)[`process${PREPARED}`] = (
  marker: Uint8Array,
  index: number,
  alias: string,
): object | undefined => {
  const img = prepared.get(marker);
  if (!img) return undefined;
  const flate = img.filter === 'FlateDecode';
  return {
    alias,
    index,
    width: img.width,
    height: img.height,
    colorSpace: img.colorSpace,
    bitsPerComponent: 8,
    filter: img.filter,
    data: binaryString(img.data),
    ...(flate ? { decodeParameters: decodeParms(img.colors ?? 3, img.width), predictor: 15 } : {}),
    ...(img.sMask ? { sMask: binaryString(img.sMask) } : {}),
  };
};

/** A 1 x 1 PNG data URI, a different colour for each `n` (svg2pdf rebuilds the URI from its bytes). */
function stub(n: number): string {
  const data = new Uint8Array([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  return `data:image/png;base64,${base64Of(encodePngSync({ width: 1, height: 1, channels: 3, data }))}`;
}

export interface PdfPictures {
  /** The href each picture is drawn with; undefined when every picture keeps its data URI. */
  readonly href: ImageHref | undefined;
  /** Stand-in data URI -> the marker jsPDF looks the prepared image up by. */
  readonly stubs: ReadonlyMap<string, Uint8Array>;
  /** Blob URLs to revoke once the PDF is written. */
  readonly urls: readonly string[];
}

/**
 * How each picture on `pages` reaches the PDF (notes 29 - 31). One that
 * `pdfImage` can embed as it is (most PNGs and JPEGs) is drawn as a 1 x 1
 * stand-in that `drawPrepared` swaps for its own XObject: svg2pdf still
 * places it (transform, opacity, z-order), but neither svg2pdf nor jsPDF
 * touch its bytes. Any other picture over `BIG_DATA_URI` gets a blob URL of
 * its bytes (svg2pdf fetches it, no regex; `#.ext` tells it the format), so
 * the long data URI never goes through the SVG text, which Firefox parses
 * slowly (note 30). Small ones keep their data URI. Every pixel, each way.
 */
export async function pdfPictures(figure: Figure, pages: readonly Page[]): Promise<PdfPictures> {
  const byHash = new Map<AssetHash, string>();
  const stubs = new Map<string, Uint8Array>();
  const urls: string[] = [];
  const seen = new Set<AssetHash>();
  for (const page of pages)
    for (const o of pageObjects(page)) {
      if (o.type !== 'image') continue;
      for (const hash of [o.asset, o.cropped]) {
        const a = hash === undefined ? undefined : figure.assets[hash];
        if (hash === undefined || seen.has(hash) || a?.kind !== 'image') continue;
        seen.add(hash);
        const bytes = fromBase64(a.dataBase64);
        const img = await pdfImage(bytes);
        if (img) {
          const uri = stub(stubs.size + 1);
          const marker = new Uint8Array([0, 1]);
          prepared.set(marker, img);
          stubs.set(uri, marker);
          byHash.set(hash, uri);
        } else if (a.dataBase64.length >= BIG_DATA_URI) {
          const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: a.mime });
          const url = URL.createObjectURL(blob);
          urls.push(url);
          byHash.set(hash, `${url}#.${a.mime.replace(/^image\//, '')}`);
        }
      }
    }
  return { href: byHash.size > 0 ? (hash) => byHash.get(hash) : undefined, stubs, urls };
}

/**
 * Makes `pdf.addImage` draw a prepared picture where svg2pdf adds its
 * stand-in: same place and size (svg2pdf has set the transform for the
 * stand-in's 1 x 1 pixels, and pictures are drawn with
 * `preserveAspectRatio="none"`), with the picture's own XObject, added once
 * and reused by its alias.
 */
function drawPrepared(pdf: jsPDF, stubs: ReadonlyMap<string, Uint8Array>): void {
  if (stubs.size === 0) return;
  const addImage = pdf.addImage.bind(pdf) as (...args: unknown[]) => jsPDF;
  const aliases = new Map<Uint8Array, string>();
  (pdf as unknown as { addImage: (...args: unknown[]) => jsPDF }).addImage = (...args) => {
    const marker = typeof args[0] === 'string' ? stubs.get(args[0]) : undefined;
    if (!marker) return addImage(...args);
    const at = typeof args[1] === 'number' ? 1 : 2;
    let alias = aliases.get(marker);
    if (alias === undefined) {
      alias = `picture-${String(aliases.size + 1)}`;
      aliases.set(marker, alias);
    }
    return addImage(marker, PREPARED, ...args.slice(at, at + 4), alias);
  };
}

export async function exportPdf(
  figure: Figure,
  pages: readonly Page[],
  opts: ExportOptions,
  version: string,
): Promise<Uint8Array> {
  let pdf: jsPDF | null = null;
  const pictures = await pdfPictures(figure, pages);
  try {
    for (const page of pages) {
      const root = exportRoot(figure, page, { ...opts, imageHref: pictures.href });
      const { width: w, height: h } = root;
      const orientation = w > h ? 'landscape' : 'portrait';
      if (pdf === null) {
        pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true });
        drawPrepared(pdf, pictures.stubs);
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
  } finally {
    for (const u of pictures.urls) URL.revokeObjectURL(u);
  }
  if (pdf === null) throw new Error('no pages to export');
  return new Uint8Array(pdf.output('arraybuffer'));
}
