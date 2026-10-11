/**
 * A modal dialog (note 09): focus moves in on open, Tab and Shift+Tab stay
 * inside, Escape closes, and focus goes back to what had it before.
 */
import { type ReactNode, useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  meta,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** PlasmidPop's `.dialog--wide` (52rem), for the guide. */
  wide?: boolean;
  /** Beside the title, as PlasmidPop's guide shows its version there. */
  meta?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('button.primary, input, select, button')?.focus();
    return () => {
      // Back to where the user was, if it is still there.
      if (before?.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const inside = ref.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={wide ? 'dialog dialog--wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {meta === undefined ? (
          <h1>{title}</h1>
        ) : (
          <div className="dialog-head">
            <h1>{title}</h1>
            {meta}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
