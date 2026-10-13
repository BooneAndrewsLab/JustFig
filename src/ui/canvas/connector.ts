/**
 * What a connector end (an arrow or a line, note 06) would attach to while it is placed or
 * dragged, and how the canvas shows it (issue 100): the target, the site it snaps to, the
 * outline ring or site dots, and the live label by the pointer. Pure, so the pointer handlers
 * in Canvas only find the object under the pointer and hand it here.
 */
import type { Id } from '@/core/model/ids';
import { bindable, nearestSite, outline, sitePoint, sitesOf } from '@/core/model/binding';
import { pageObjects } from '@/core/model/tree';
import type { ArrowBinding, BindSite, Obj, Page, Vec2 } from '@/core/model/types';

/** How near an edge connection site, screen pixels, an end snaps to it (note 06). */
export const SITE_SNAP_PX = 8;
/**
 * How near the centre site, screen pixels: smaller than the edges (issue 100), so pressing
 * in the middle of an object starts a sliding end rather than pinning it inside the object.
 */
export const CENTRE_SNAP_PX = 4;

/** What an end would attach to: an object, and the site it snaps to (and that site's point). */
export interface BindHit {
  readonly obj: Obj;
  readonly site?: BindSite;
  readonly at?: Vec2;
}

export interface BindQuery {
  /** Alt held: no site snapping, the end slides on the outline (issue 100). */
  readonly alt?: boolean | undefined;
  /** An object the end may not attach to (the dragged end's other target). */
  readonly exclude?: Id | undefined;
}

/** Whether page point `p` is inside the object's (rotated) frame, drawn or not at that spot. */
function inFrame(o: Obj, p: Vec2): boolean {
  const { x, y, w, h, rotation } = o.frame;
  const a = (-rotation * Math.PI) / 180;
  const dx = p.x - (x + w / 2);
  const dy = p.y - (y + h / 2);
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

/**
 * What an end at page point `p` may attach to: `under` (the bindable object under the
 * pointer), else the object with an edge site within the snap radius (a site sits just
 * outside its outline), with the nearest site within the radius; `zoom` turns the screen
 * radii into points.
 */
export function bindHit(
  page: Page,
  under: Obj | undefined,
  p: Vec2,
  zoom: number,
  q: BindQuery = {},
): BindHit | undefined {
  const radius = SITE_SNAP_PX / zoom;
  const centre = CENTRE_SNAP_PX / zoom;
  const ok = (o: Obj) => bindable(o) && o.id !== q.exclude;
  let obj = under && ok(under) ? under : undefined;
  if (!obj) {
    let best = radius;
    for (const o of pageObjects(page)) {
      if (!ok(o) || o.locked === true) continue;
      const site = nearestSite(o, p, best, Math.min(best, centre));
      if (!site) continue;
      const at = sitePoint(o, site);
      best = Math.hypot(at.x - p.x, at.y - p.y);
      obj = o;
    }
  }
  if (!obj) {
    // Transparent parts of an icon or image, or the hollow of an outline, are not "under" the
    // pointer for the browser, but inside the object's frame still counts: topmost wins.
    for (const o of pageObjects(page)) if (ok(o) && o.locked !== true && inFrame(o, p)) obj = o;
  }
  if (!obj) return undefined;
  if (q.alt === true) return { obj };
  const site = nearestSite(obj, p, radius, centre);
  return site ? { obj, site, at: sitePoint(obj, site) } : { obj };
}

/** The binding a hit makes. */
export const bindingOf = (h: BindHit): ArrowBinding => ({
  id: h.obj.id,
  ...(h.site ? { site: h.site } : {}),
});

/** How the site list (popover, live label) names a site; no site is "Outline". */
export function siteName(site: BindSite | undefined): string {
  switch (site) {
    case undefined:
      return 'Outline';
    case 'top':
      return 'Top';
    case 'right':
      return 'Right';
    case 'bottom':
      return 'Bottom';
    case 'left':
      return 'Left';
    case 'center':
      return 'Centre';
  }
}

/** The choices an end-handle popover lists, in Inspector order: outline first. */
export const SITE_CHOICES: readonly (BindSite | undefined)[] = [
  undefined,
  'top',
  'right',
  'bottom',
  'left',
  'center',
];

/** The overlay showing what an end would attach to (screen-only, never exported). */
export interface BindOverlay {
  /** The target's outline, page coordinates: drawn when the end would slide on it. */
  readonly ring?: readonly Vec2[];
  /** Its connection sites; `hot` is the one the end snaps to (a filled dot). */
  readonly sites?: readonly { readonly at: Vec2; readonly hot: boolean }[];
  /** The live label by the pointer (page coordinates): what releasing here gives. */
  readonly label?: { readonly at: Vec2; readonly text: string };
}

/** The overlay for a hit, its label by the pointer at `pointer`. */
export function bindOverlay(h: BindHit | undefined, pointer: Vec2): BindOverlay {
  if (!h) return {};
  return {
    ...(h.site ? {} : { ring: outline(h.obj) }),
    sites: sitesOf(h.obj).map((x) => ({ at: x.at, hot: x.site === h.site })),
    label: { at: pointer, text: siteName(h.site) },
  };
}
