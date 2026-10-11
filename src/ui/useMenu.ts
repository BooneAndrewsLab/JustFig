import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

/** The enabled items of an open menu, in order. */
function items(list: HTMLElement | null): HTMLElement[] {
  if (list === null) return [];
  return [...list.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
}

/**
 * Keys the menu handles stop propagating, so the app's window shortcuts
 * (arrows nudge, Escape deselects) never see them.
 *
 * A dropdown menu anchored to a trigger inside `ref` (PlasmidPop's `useMenu`,
 * plus the WAI-ARIA menu keys, note 55): a click outside, Escape or Tab
 * closes it; opening from the keyboard focuses the first item, the arrows,
 * Home and End move between items, and Escape puts focus back on the trigger.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** Which item to focus once the list renders: none for a mouse click. */
  const focusOnOpen = useRef<'first' | 'last' | null>(null);

  useEffect(() => {
    if (!open) return;
    const at = focusOnOpen.current;
    focusOnOpen.current = null;
    const all = items(list.current);
    (at === 'first' ? all[0] : at === 'last' ? all.at(-1) : undefined)?.focus();
    const outside = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape with focus outside the menu and its trigger (inside, the handlers below take it).
    const esc = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);
  const toggle = useCallback((): void => {
    setOpen((v) => !v);
  }, []);

  /**
   * On the trigger: Enter, Space and ArrowDown open on the first item, ArrowUp
   * on the last; Escape closes a menu opened with the mouse (focus stays here).
   */
  const onTriggerKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
      setOpen(true);
    }
  }, []);

  /** On the list: moves focus between items; Escape and Tab close it. */
  const onListKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const all = items(list.current);
    if (all.length === 0) return;
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? all[(i + 1) % all.length]
        : e.key === 'ArrowUp'
          ? all[(i - 1 + all.length) % all.length]
          : e.key === 'Home'
            ? all[0]
            : e.key === 'End'
              ? all.at(-1)
              : undefined;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  }, []);

  return { open, toggle, close, ref, trigger, list, onTriggerKeyDown, onListKeyDown };
}
