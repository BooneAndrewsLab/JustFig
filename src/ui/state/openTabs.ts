/**
 * Remembering the open tabs across a reload (note 25): the `doc.id`s of the
 * open figures in strip order and the front one's, in localStorage; the
 * figures themselves are autosave's rows in IndexedDB.
 */
import type { FigureStorage, KeptFigure } from '@/io/storage';

import { type AppState, type AppStore, figure, isUntouched } from './store';

export const TABS_KEY = 'justfig.tabs';
/** Before tabs, the one figure open; read when there is no TABS_KEY yet. */
export const CURRENT_KEY = 'justfig.current';

export interface OpenTabs {
  readonly ids: readonly string[];
  readonly front: string | null;
  /** TABS_KEY held a list (maybe empty): trust it, no fallback to the latest figure. */
  readonly explicit: boolean;
}

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

const local = (): KeyValue => globalThis.localStorage;

/** What was open when the page was last left; nothing when storage is blocked or garbled. */
export function rememberedTabs(kv: KeyValue = local()): OpenTabs {
  try {
    const raw = kv.getItem(TABS_KEY);
    if (raw === null) {
      const one = kv.getItem(CURRENT_KEY);
      return { ids: one ? [one] : [], front: one, explicit: false };
    }
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { ids: [], front: null, explicit: false };
    const { ids, front } = v as { ids?: unknown; front?: unknown };
    return {
      explicit: Array.isArray(ids),
      ids: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
      front: typeof front === 'string' ? front : null,
    };
  } catch {
    return { ids: [], front: null, explicit: false };
  }
}

/** What to remember of the store's tabs, as stored. */
export const tabsText = (s: AppState): string =>
  s.home && s.tabs.every(isUntouched)
    ? JSON.stringify({ ids: [], front: null })
    : JSON.stringify({ ids: s.tabs.map((t) => figure(t).doc.id), front: figure(s).doc.id });

/** Keeps the remembered tabs up to date with the store. Returns the unsubscribe. */
export function rememberTabs(store: AppStore, kv: KeyValue = local()): () => void {
  let last = '';
  const write = () => {
    const text = tabsText(store.getState());
    if (text === last) return;
    last = text;
    try {
      kv.setItem(TABS_KEY, text);
    } catch {
      // Blocked storage: a reload restores the most recently changed figure instead.
    }
  };
  write();
  return store.subscribe(write);
}

/**
 * The figures that were open, in order, with the front one's id. Ids whose
 * row is gone are skipped; when none is left, the most recently changed
 * figure stands in, as before tabs; but not for an explicit empty list (the front page was showing, note 57).
 */
export async function keptTabs(
  storage: FigureStorage,
  open: OpenTabs,
): Promise<{ figs: KeptFigure[]; front: string | null }> {
  const figs: KeptFigure[] = [];
  for (const id of open.ids) {
    const f = await storage.load(id);
    if (f && !figs.some((g) => g.doc.id === f.doc.id)) figs.push(f);
  }
  if (figs.length === 0 && !(open.explicit && open.ids.length === 0)) {
    const latest = await storage.latest();
    if (latest) figs.push(latest);
  }
  return { figs, front: open.front };
}

/** Opens the kept figures in the store, the remembered one in front. */
export function reopenTabs(
  store: AppStore,
  kept: { readonly figs: readonly KeptFigure[]; readonly front: string | null },
): void {
  for (const f of kept.figs) store.open(f, { hasFile: f.downloaded });
  const front = kept.front === null ? undefined : store.tabOf(kept.front);
  if (front !== undefined) store.activate(front);
}
