/**
 * Kind presets (note 58): named starting points, built in per kind. A preset
 * is params over the field defaults plus plain-hex slot colours; it is never
 * stored, so the object only records the params it produced.
 */
import { type Edit, EditError, updateObjects } from '@/core/edits/edits';
import type { Id } from '@/core/model/ids';
import type { Procedural, Vec2 } from '@/core/model/types';

import { createProcedural } from './edits';
import { resolveProcedural } from './registry';
import type { KindPreset, Params, ProceduralKind } from './types';

export const presetsOf = (k: ProceduralKind): readonly KindPreset[] => k.presets ?? [];

export const findPreset = (k: ProceduralKind, id: string): KindPreset | undefined =>
  presetsOf(k).find((p) => p.id === id);

/** The preset's slot colours as the object's overrides: plain hex, never swatch links. */
export function presetSlots(p: KindPreset): Procedural['slots'] {
  const out: Record<string, { hex: string }> = {};
  for (const [id, hex] of Object.entries(p.slots ?? {})) out[id] = { hex };
  return out;
}

/** A new object of the kind from the preset, centred on `at`. */
export function createFromPreset(k: ProceduralKind, p: KindPreset, at: Vec2): Procedural {
  const o = createProcedural(k, at, p.params ?? {}, p.size ?? k.defaultSize);
  return { ...o, slots: presetSlots(p) };
}

/** The kind's presets by group, groups in first-seen order (ungrouped ones under `''`). */
export function groupedPresets(
  k: ProceduralKind,
): { readonly group: string; readonly presets: readonly KindPreset[] }[] {
  const out: { group: string; presets: KindPreset[] }[] = [];
  for (const p of presetsOf(k)) {
    const g = p.group ?? '';
    const hit = out.find((x) => x.group === g);
    if (hit) hit.presets.push(p);
    else out.push({ group: g, presets: [p] });
  }
  return out;
}

/**
 * "Start from…" (note 58): one named edit that sets only the keys the preset names, its slot
 * colours, and its frame size when it has one and the object still has the kind's default size
 * (resized about its centre). Path-following kinds keep their frame.
 */
export function applyPreset(pageId: Id, id: Id, k: ProceduralKind, p: KindPreset): Edit {
  return updateObjects(pageId, [id], `Apply preset ${p.label}`, (o) => {
    if (o.type !== 'procedural' || o.kind !== k.kind) return o;
    const r = resolveProcedural(o);
    if (!r)
      throw new EditError('This object was made by a newer version and cannot be edited here.');
    const merged = { ...r.params, ...(p.params ?? {}) } as Params;
    const params = r.kind.fix ? r.kind.fix(merged) : merged;
    const f = o.frame;
    const size = p.size;
    const frame =
      size !== undefined &&
      !r.kind.usesPath &&
      f.w === r.kind.defaultSize.w &&
      f.h === r.kind.defaultSize.h
        ? {
            ...f,
            x: f.x + (f.w - size.w) / 2,
            y: f.y + (f.h - size.h) / 2,
            w: size.w,
            h: size.h,
          }
        : f;
    return {
      ...o,
      kindVersion: r.kind.version,
      params,
      slots: { ...o.slots, ...presetSlots(p) },
      frame,
    };
  });
}
