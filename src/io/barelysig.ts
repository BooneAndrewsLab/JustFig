/**
 * BarelySig figures (note 05): an SVG that BarelySig exported "with data"
 * carries its recipe — a `.bsig` document cut down to the graph — gzipped
 * and base64'd in `<metadata><barelysig:recipe encoding="gzip+base64">`
 * (BarelySig `src/io/recipe.ts`, `svgMeta`). Imported here, it becomes an
 * `embedded` object: drawn from the SVG (sanitised, as any import) at its
 * exact physical size, with the recipe kept as the payload, so the graph
 * can go back to BarelySig as a `.bsig` and be edited there.
 *
 * Nothing here writes BarelySig's format; the recipe is kept as parsed
 * JSON, untouched. The contract is frozen in
 * `fixtures/barelysig-figure2.svg`, the real output of BarelySig 1.0.0.
 */
import type { Asset, Embedded } from '@/core/model/types';
import { frame } from '@/core/model/factory';
import { newId } from '@/core/model/ids';

import { hashAsset } from './assets';
import { importSvgText } from './import';
import { JfigError } from './jfig';

export const BARELYSIG_APP = 'BarelySig';
/** `source.format` of an embedded BarelySig graph: the payload is a `.bsig` recipe. */
export const BSIG_FORMAT = 'bsig';

const RECIPE = /<barelysig:recipe[^>]*encoding="gzip\+base64"[^>]*>([^<]+)<\/barelysig:recipe>/;

/** Whether an SVG's text says BarelySig made it (with or without its data). */
export const isBarelySigSvg = (text: string): boolean =>
  /<barelysig:recipe[\s>]/.test(text) || text.includes('CreatorTool="BarelySig ');

async function gunzip(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** A physical length attribute (`70mm`, `2in`, `198pt`) in points, or null. */
function lengthPt(v: string | undefined): number | null {
  const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|px)?\s*$/.exec(v ?? '');
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  const per: Readonly<Record<string, number>> = {
    mm: 72 / 25.4,
    cm: 720 / 25.4,
    in: 72,
    pt: 1,
    px: 0.75,
  };
  return Number.isFinite(n) && n > 0 ? n * (per[m[2] ?? 'px'] ?? 0.75) : null;
}

export interface BarelySigImport {
  readonly obj: Embedded;
  readonly assets: Readonly<Record<string, Asset>>;
  readonly warnings: readonly string[];
}

/**
 * The embedded object for a BarelySig SVG, centred on `at`. Throws a
 * `JfigError` explaining itself when the SVG was exported without its data
 * (then it can only be imported as a plain picture).
 */
export async function readBarelySigSvg(
  text: string,
  fileName: string,
  at: { x: number; y: number },
): Promise<BarelySigImport> {
  const m = RECIPE.exec(text);
  if (!m?.[1])
    throw new JfigError(
      'This BarelySig figure was exported without its data, so it can only be placed as a picture.',
    );
  let recipe: unknown;
  try {
    recipe = JSON.parse(await gunzip(m[1]));
  } catch {
    throw new JfigError('The BarelySig recipe in this SVG is damaged.');
  }
  const r = recipe as { format?: unknown; schemaVersion?: unknown; project?: { graphs?: unknown } };
  if (r.format !== 'barelysig' || typeof r.schemaVersion !== 'number')
    throw new JfigError('The BarelySig recipe in this SVG is not one this app understands.');
  const graphs = Array.isArray(r.project?.graphs) ? (r.project.graphs as unknown[]) : [];
  const first = graphs[0] as { title?: unknown } | undefined;
  const title = typeof first?.title === 'string' && first.title !== '' ? first.title : fileName;

  const imp = importSvgText(text, fileName);
  const root = /<svg\b[^>]*>/.exec(text)?.[0] ?? '';
  const w = lengthPt(/\swidth="([^"]+)"/.exec(root)?.[1]) ?? imp.w;
  const h = lengthPt(/\sheight="([^"]+)"/.exec(root)?.[1]) ?? imp.h;
  const asset: Asset =
    imp.asset.kind === 'svgImport'
      ? { ...imp.asset, meta: { ...imp.asset.meta, width: w, height: h } }
      : imp.asset;
  const hash = hashAsset(asset);
  const obj: Embedded = {
    id: newId('o'),
    type: 'embedded',
    name: title,
    frame: frame(at.x - w / 2, at.y - h / 2, w, h),
    opacity: 1,
    source: { app: BARELYSIG_APP, format: BSIG_FORMAT, payload: recipe },
    snapshot: hash,
  };
  return { obj, assets: { [hash]: asset }, warnings: imp.warnings };
}

/** The `.bsig` text to reopen an embedded BarelySig graph in BarelySig, or null for another app's object. */
export function recipeFile(o: Embedded): string | null {
  if (o.source.app !== BARELYSIG_APP || o.source.format !== BSIG_FORMAT) return null;
  return o.source.payload === null ? null : JSON.stringify(o.source.payload);
}
