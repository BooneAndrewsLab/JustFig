/**
 * Usage statistics via a self-hosted Matomo instance.
 *
 * Nothing is sent unless the instance URL and site id were set at build time
 * (`VITE_MATOMO_URL`, `VITE_MATOMO_SITE_ID`) and the browser does not send a
 * Do-Not-Track signal. Events carry only coarse actions ("placed icon",
 * "exported svg"); never figure content, text, icon names, file names or
 * anything else the user made or typed. The tracker runs cookieless; IP
 * anonymisation is an instance setting.
 *
 * The page URL is reported without its fragment: should a link ever carry
 * data after the `#`, Matomo would otherwise send `window.location.href`
 * whole. Both `setCustomUrl` (this page view) and `discardHashTag` (any
 * later one) are set.
 *
 * What may be sent is `EVENTS`, below, and nothing else: `track` accepts a
 * category and action only from it. The list is also what "unused" is read
 * against — a feature that never shows up in the Events report is on it and
 * was not used. Ported from BarelySig's `src/ui/analytics.ts`.
 */

export interface AnalyticsConfig {
  /** Matomo instance URL, with trailing slash. */
  readonly url: string;
  readonly siteId: string;
}

interface Env {
  readonly VITE_MATOMO_URL?: string;
  readonly VITE_MATOMO_SITE_ID?: string;
}

/** Reads the build-time config; `null` when unset, so the tracker is a no-op. */
export function readConfig(env: Env = import.meta.env): AnalyticsConfig | null {
  const url = env.VITE_MATOMO_URL?.trim() ?? '';
  const siteId = env.VITE_MATOMO_SITE_ID?.trim() ?? '';
  if (url === '' || siteId === '') return null;
  return { url: url.endsWith('/') ? url : `${url}/`, siteId };
}

/** True when the browser asks not to be tracked; nothing is sent then. */
export function doNotTrack(nav: Partial<Navigator> = globalThis.navigator): boolean {
  const flag = nav.doNotTrack ?? (globalThis as { doNotTrack?: string }).doNotTrack;
  return flag === '1' || flag === 'yes';
}

/**
 * Everything the app may report, as category → actions. The event name,
 * where there is one, is a fixed label: a file format, a panel, a view, a
 * key binding, a guide page, the app version. Never anything the user typed
 * or anything read from a document.
 */
export const EVENTS = {
  /** Once per visit: `start` (the version). */
  app: ['start'],
  history: ['undo', 'redo', 'jump'],
  file: [
    'open',
    'open-recent',
    'download',
    'save-in-place',
    'save-as',
    'import-svg',
    'import-pdf',
    'import-image',
  ],
  tool: ['rect', 'ellipse', 'line', 'pen', 'arrow', 'text', 'panel', 'note'],
  icon: ['place'],
  /** Kind names are app vocabulary, not figure content. */
  procedural: ['place', 'convert', 'from-path', 'fragment-paste', 'gel-labels', 'scale-bar'],
  /** Copy as image (note 36): with the SVG as text beside the PNG, or the PNG alone. */
  export: [
    'svg',
    'pdf',
    'png',
    'tiff',
    'panels',
    'copy-image',
    'copy-image-png',
    'copy-adjustments',
  ],
  /** A check warning chosen in the Export dialog; the rule id (app vocabulary) as the name. */
  check: ['select'],
  attribution: ['open', 'copy', 'add-text', 'copy-legend'],
  /**
   * `kind-place`, `kind-apply`: a built-in kind preset (note 58), `kind/preset-id` as the name.
   * `wizard`: a kind's wizard finished, `kind/place` or `kind/apply` as the name (never answers).
   */
  preset: ['save', 'place', 'export', 'import', 'kind-place', 'kind-apply', 'wizard'],
  /** Saved versions of a figure (note 23); never a name. */
  version: ['save', 'restore', 'compare'],
  /** Review notes (note 24); never their text or author. */
  note: ['add', 'reply', 'resolve', 'delete', 'hide'],
  /** `open`: the entry id (app vocabulary) as the name. `source`: Save as template source. */
  gallery: ['open', 'source'],
  /** The built-in palette id as the name. */
  palette: ['apply', 'link'],
  keys: ['change', 'reset'],
  /** Several figures open (note 25): a second tab opened, a tab closed or dragged. */
  tabs: ['second', 'close', 'move'],
  /** The guide page id as the name. */
  guide: ['open'],
  /** The front page (note 57): shown, and what was chosen on it. */
  home: ['show', 'new', 'open', 'example', 'template', 'recent', 'back'],
  embedded: ['import'],
  arrange: ['grid'],
  image: ['crop', 'crop-level', 'merge', 'channels', 'split', 'inset'],
  /** An error caught (note 26): the error class name only, never its message or any figure content. */
  crash: ['render', 'error', 'rejection'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type EventCategory = keyof typeof EVENTS;
export type EventAction<C extends EventCategory> = (typeof EVENTS)[C][number];

type PaqEntry = readonly (string | number | boolean)[];

/** This page, with any fragment cut off. Nothing of a share link is reportable. */
export function trackableUrl(href: string = globalThis.location.href): string {
  const hash = href.indexOf('#');
  return hash === -1 ? href : href.slice(0, hash);
}

/** Loads the Matomo script. Separated so tests can stub it. */
function injectScript(url: string): void {
  const doc = globalThis.document;
  const script = doc.createElement('script');
  script.async = true;
  script.src = `${url}matomo.js`;
  doc.head.appendChild(script);
}

export class Analytics {
  readonly enabled: boolean;
  /** What `trackOnce` has sent in this page load. */
  private readonly sent = new Set<string>();

  constructor(
    config: AnalyticsConfig | null,
    dnt: boolean,
    load: (url: string) => void = injectScript,
  ) {
    this.enabled = config !== null && !dnt;
    if (config === null || !this.enabled) return;
    this.push(['disableCookies']);
    this.push(['setDoNotTrack', true]);
    this.push(['setTrackerUrl', `${config.url}matomo.php`]);
    this.push(['setSiteId', config.siteId]);
    this.push(['discardHashTag', true]);
    this.push(['setCustomUrl', trackableUrl()]);
    this.push(['trackPageView']);
    this.push(['enableLinkTracking']);
    load(config.url);
  }

  /**
   * Records a coarse usage event. `name` must be a fixed label (a format,
   * a mode), never user data.
   */
  track<C extends EventCategory>(category: C, action: EventAction<C>, name?: string): void {
    if (!this.enabled) return;
    this.push(
      name === undefined
        ? ['trackEvent', category, action]
        : ['trackEvent', category, action, name],
    );
  }

  /**
   * Records the event the first time it happens in this page load and
   * ignores it after that. For things done often — edits, toggles, tab
   * switches — where what is worth knowing is whether a visit used them at
   * all: Matomo's "unique events" then reads as visits, one person toggling
   * a switch a hundred times counts once, and a visit sends a handful of
   * requests rather than one per click.
   */
  trackOnce<C extends EventCategory>(category: C, action: EventAction<C>, name?: string): void {
    if (!this.enabled) return;
    const key = `${category}\u0000${action}\u0000${name ?? ''}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.track(category, action, name);
  }

  /** The version this visit runs. Called once, from the app's first render. */
  start(version: string): void {
    this.trackOnce('app', 'start', version);
  }

  private push(entry: PaqEntry): void {
    const g = globalThis as { _paq?: PaqEntry[] };
    g._paq ??= [];
    g._paq.push(entry);
  }
}

export const analytics = new Analytics(readConfig(), doNotTrack());

const ERROR_KINDS = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'DOMException',
];

/** The error's class name when it is a built-in one, else `Error`: never its message or a custom name. */
export function errorKind(e: unknown): string {
  const name = e instanceof Error || e instanceof DOMException ? e.constructor.name : '';
  return ERROR_KINDS.includes(name) ? name : 'Error';
}
