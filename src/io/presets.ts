/**
 * Presets (note 22): a named selection kept in this browser, placed again
 * from the gallery, and shared as a file. In storage a preset is a fragment
 * (note 02), so it carries the schema version and its migrations; a presets
 * file bundles several under one asset table.
 *
 * Every preset read back, from storage or a file someone sent, is decoded by
 * hand like a `.jfig`, and its assets are checked against their content
 * hashes: a file cannot slip a different asset in under a hash the open
 * figure already uses.
 */
import { objectAssets } from '@/core/model/tree';
import type { Asset, Assets, Obj } from '@/core/model/types';

import { hashAsset } from './assets';
import { DecodeError, type JsonObject, Path, arr, list, obj, str } from './decode';
import {
  type Fragment,
  JfigError,
  SCHEMA_VERSION,
  assetsOf,
  canonical,
  migrate,
  object,
  readFragment,
  writeFragment,
} from './jfig';
import { PRESET_CAPS, cleanName } from './storage';

/** Permanent format id of a presets file: not the display name (note 01). */
export const PRESETS_FORMAT = 'justfig-presets';

/** Extension of a presets file, with the dot (the content is JSON). */
export const PRESETS_EXT = '.jfigpresets';

/** A larger file is refused before it is parsed. */
export const MAX_PRESETS_FILE_CHARS = 60_000_000;

export const UNTITLED_PRESET = 'Untitled preset';

export interface Preset {
  readonly name: string;
  readonly fragment: Fragment;
}

/** The assets `objects` use, in hash order; the rest are dropped. */
export function assetsUsed(objects: readonly Obj[], assets: Assets): Assets {
  const hashes = new Set(objects.flatMap(objectAssets));
  const out: Record<string, Asset> = {};
  for (const h of [...hashes].sort()) {
    const a = assets[h];
    if (a) out[h] = a;
  }
  return out;
}

/** Checks hashes and references; returns the fragment with only the assets it uses. */
function checked(objects: readonly Obj[], assets: Assets, p: Path): Fragment {
  if (objects.length === 0) p.key('objects').fail('expected at least one object');
  for (const o of objects)
    for (const h of objectAssets(o)) if (!(h in assets)) p.key('assets').fail(`missing asset ${h}`);
  return { objects, assets: assetsUsed(objects, assets) };
}

function checkHashes(assets: Assets, p: Path): void {
  for (const [h, a] of Object.entries(assets))
    if (hashAsset(a) !== h) p.key(h).fail('its content does not match its hash');
}

/** A preset's stored text: the fragment, as on the clipboard. */
export function writePresetText(f: Fragment): string {
  return writeFragment({ objects: f.objects, assets: assetsUsed(f.objects, f.assets) });
}

/** A stored preset's fragment. Throws JfigError when the text is not one or is damaged. */
export function readPresetText(text: string): Fragment {
  const frag = readFragment(text);
  if (!frag) throw new JfigError('This preset is damaged.');
  const root = new Path(['preset']);
  try {
    checkHashes(frag.assets, root.key('assets'));
    return checked(frag.objects, frag.assets, root);
  } catch (e: unknown) {
    if (e instanceof DecodeError) throw new JfigError(`This preset is damaged (${e.message}).`);
    throw e;
  }
}

export function writePresetsFile(
  presets: readonly Preset[],
  app: { name: string; version: string },
): string {
  const all: Record<string, Asset> = {};
  for (const p of presets) Object.assign(all, assetsUsed(p.fragment.objects, p.fragment.assets));
  const file = {
    format: PRESETS_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    app,
    presets: presets.map((p) => ({ name: p.name, objects: p.fragment.objects })),
    assets: assetsUsed(
      presets.flatMap((p) => p.fragment.objects),
      all,
    ),
  };
  return `${JSON.stringify(canonical(file), null, 1)}\n`;
}

/**
 * The presets in a file someone shared. The file is untrusted: it is size
 * capped before parsing, every object and asset is decoded by hand, asset
 * hashes are checked, names are cleaned and cut, and the count is capped.
 */
export function readPresetsFile(text: string): Preset[] {
  if (text.length > MAX_PRESETS_FILE_CHARS)
    throw new JfigError('This presets file is too large to import.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new JfigError('This is not a presets file (it is not valid JSON).');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new JfigError('This is not a presets file.');
  if ((raw as JsonObject)['format'] !== PRESETS_FORMAT)
    throw new JfigError('This is not a presets file.');
  // Migrations see `presets[].objects` where a fragment has `objects` (note 22).
  const file = migrate(raw as JsonObject);
  const root = new Path(['presets file']);
  try {
    const assets = assetsOf(file['assets'], root.key('assets'));
    checkHashes(assets, root.key('assets'));
    const entries = arr(file['presets'], root.key('presets'));
    if (entries.length === 0) root.key('presets').fail('expected at least one preset');
    if (entries.length > PRESET_CAPS.maxRows)
      root.key('presets').fail(`more than ${String(PRESET_CAPS.maxRows)} presets`);
    return entries.map((e, i) => {
      const p = root.key('presets').index(i);
      const o = obj(e, p);
      const name = cleanName(str(o['name'], p.key('name')), UNTITLED_PRESET);
      const objects = list(o['objects'], p.key('objects'), object);
      return { name, fragment: checked(objects, assets, p) };
    });
  } catch (e: unknown) {
    if (e instanceof DecodeError)
      throw new JfigError(`This presets file is damaged (${e.message}).`);
    throw e;
  }
}
