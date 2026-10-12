/**
 * The colours picked most recently, newest first, for the picker's "Recent" row. Kept in memory
 * and mirrored to localStorage as a per-person convenience; blocked storage just forgets them.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'justfig.recentColors';
const MAX = 8;

function load(): readonly string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(v)) {
      return v.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c));
    }
  } catch {
    // Missing, blocked or corrupt: start empty.
  }
  return [];
}

let recent: readonly string[] = load();
const listeners = new Set<() => void>();

export function rememberColor(hex: string): void {
  const h = hex.toLowerCase();
  if (recent[0] === h) return;
  recent = [h, ...recent.filter((c) => c !== h)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    // Storage blocked: the list lives for this session only.
  }
  listeners.forEach((l) => {
    l();
  });
}

export function useRecentColors(): readonly string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => recent,
  );
}

/** For tests. */
export function resetRecentColors(): void {
  recent = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
