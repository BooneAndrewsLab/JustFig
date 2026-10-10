/**
 * Numbered step badges (note 48): a text with a `step` link to another
 * object. Its number is derived, never stored as a decision: the badges of
 * one scope (the group or panel the badge is in, else the page) are
 * numbered 1, 2, 3 in reading order of their targets, in the panel-label
 * format. `reconcileSteps` writes the number, size and position into the
 * text; it runs inside `reconcileBindings` after every edit (note 06).
 */
import { type Box, center } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import { measure } from '../text/layout';
import type { Id } from './ids';
import { inReadingOrder } from './panels';
import { hasChildren, mapPageObjs, pageObjects } from './tree';
import type {
  Figure,
  Obj,
  Page,
  PanelLabelFormat,
  PanelLabelStyle,
  Run,
  StepAnchor,
  StepLink,
  Text,
  Vec2,
} from './types';

export type StepBadge = Text & { readonly step: StepLink };

export const isStep = (o: Obj): o is StepBadge => o.type === 'text' && o.step !== undefined;

/** A circle badge's diameter, in label sizes, for a one-digit number. */
export const STEP_DIAMETER = 1.5;

/** The colour of the number on a circle badge. */
const ON_CIRCLE = { hex: '#ffffff' } as const;

/** The panel-letter format applied to a step number (1-based): A, a → 1; (A), (a) → (1); a) → 1). */
export function formatStep(n: number, format: PanelLabelFormat): string {
  const s = String(n);
  switch (format) {
    case 'A':
    case 'a':
      return s;
    case '(a)':
    case '(A)':
      return `(${s})`;
    case 'a)':
      return `${s})`;
  }
}

export function anchorPoint(b: Box, a: StepAnchor): Vec2 {
  return {
    x: a.endsWith('left') ? b.x : b.x + b.w,
    y: a.startsWith('top') ? b.y : b.y + b.h,
  };
}

/** Whether a badge may point at this object. */
const stepTarget = (t: Obj, badge: Id): boolean => t.id !== badge && !isStep(t);

/**
 * Every badge's number on the page, by badge id (1-based). Badges whose
 * target is missing or invalid have none.
 */
export function stepNumbers(page: Page): Map<Id, number> {
  const byId = new Map<Id, Obj>();
  for (const o of pageObjects(page)) byId.set(o.id, o);
  const scopes = new Map<string, { badge: Id; box: Box }[]>();
  const visit = (objs: readonly Obj[], scope: string) => {
    for (const o of objs) {
      if (isStep(o)) {
        const t = byId.get(o.step.target);
        if (t && stepTarget(t, o.id)) {
          const list = scopes.get(scope) ?? [];
          list.push({ badge: o.id, box: objBounds(t) });
          scopes.set(scope, list);
        }
      }
      if (hasChildren(o)) visit(o.children, o.id);
    }
  };
  for (const l of page.layers) visit(l.children, '');
  const out = new Map<Id, number>();
  for (const items of scopes.values())
    inReadingOrder(items, (i) => i.box).forEach((i, k) => out.set(i.badge, k + 1));
  return out;
}

const sameRuns = (a: Text['runs'], b: Text['runs']): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** The badge showing `label` in the label style, centred on `c`; the same object when it already does. */
export function layBadge(t: StepBadge, label: string, style: PanelLabelStyle, c: Vec2): StepBadge {
  const size = Math.max(style.size, 1);
  const circle = t.step.variant === 'circle';
  const run: Run = {
    text: label,
    font: style.font,
    size,
    ...(style.bold ? { bold: true } : {}),
    color: circle ? ON_CIRCLE : t.step.paint,
  };
  const width = measure(run, label);
  const d = Math.max(size * STEP_DIAMETER, width + size * 0.6);
  const w = circle ? d : width;
  const h = circle ? d : size;
  const lineHeight = h / size;
  const f = t.frame;
  const frame = { x: c.x - w / 2, y: c.y - h / 2, w, h, rotation: 0 };
  const runs = [[run]];
  if (
    sameRuns(t.runs, runs) &&
    t.align === 'center' &&
    !t.autoWidth &&
    near(t.lineHeight, lineHeight) &&
    near(f.x, frame.x) &&
    near(f.y, frame.y) &&
    near(f.w, w) &&
    near(f.h, h) &&
    f.rotation === 0 &&
    f.flipX !== true &&
    f.flipY !== true
  )
    return t;
  return { ...t, runs, align: 'center', autoWidth: false, lineHeight, frame };
}

function index(page: Page | undefined): Map<Id, Obj> {
  const m = new Map<Id, Obj>();
  if (page) for (const o of pageObjects(page)) m.set(o.id, o);
  return m;
}

const sameFrame = (a: Box, b: Box): boolean =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

/** Moved without being resized (a resize or a text change re-lays the badge where it was). */
const moved = (a: Box, b: Box): boolean =>
  near(a.w, b.w) && near(a.h, b.h) && (!near(a.x, b.x) || !near(a.y, b.y));

function reconcilePage(before: Page | undefined, page: Page, style: PanelLabelStyle): Page {
  let any = false;
  for (const o of pageObjects(page))
    if (isStep(o)) {
      any = true;
      break;
    }
  if (!any) return page;
  const now = index(page);
  const was = index(before);
  const numbers = stepNumbers(page);
  return mapPageObjs(page, (o) => {
    if (o.type === 'group' && o.children.length > 0) {
      const b = objBounds(o);
      return sameFrame(b, o.frame) && o.frame.rotation === 0
        ? o
        : { ...o, frame: { x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0 } };
    }
    if (!isStep(o)) return o;
    const t = now.get(o.step.target);
    if (!t) return null; // the target was deleted: so is its badge
    if (!stepTarget(t, o.id)) {
      const { step: _drop, ...rest } = o;
      return rest;
    }
    const corner = anchorPoint(objBounds(t), o.step.anchor);
    let badge: StepBadge = o;
    const old = was.get(o.id);
    if (old && old !== o && was.get(t.id) === t && moved(old.frame, o.frame)) {
      // The badge alone was moved: where the user put it is its new offset.
      const c = center(objBounds(o));
      badge = { ...o, step: { ...o.step, offset: { x: c.x - corner.x, y: c.y - corner.y } } };
    }
    const at = { x: corner.x + badge.step.offset.x, y: corner.y + badge.step.offset.y };
    return layBadge(badge, formatStep(numbers.get(o.id) ?? 1, style.format), style, at);
  });
}

/** Lays out every step badge after an edit turned `before` into `after` (note 48). */
export function reconcileSteps(before: Figure, after: Figure): Figure {
  const style = after.doc.panelLabelStyle;
  const pages = after.doc.pages.map((p) =>
    reconcilePage(
      before.doc.pages.find((q) => q.id === p.id),
      p,
      style,
    ),
  );
  if (pages.every((p, i) => p === after.doc.pages[i])) return after;
  return { ...after, doc: { ...after.doc, pages } };
}

/** A copied badge follows its target's copy; a badge copied without its target becomes plain text. */
export function remapStep(o: Text, ids: ReadonlyMap<Id, Id>): Text {
  if (!o.step) return o;
  const to = ids.get(o.step.target);
  if (to !== undefined) return { ...o, step: { ...o.step, target: to } };
  const { step: _drop, ...rest } = o;
  return rest;
}
