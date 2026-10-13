/**
 * The end-handle popover (issue 100): a click without a drag on a bound end's handle lists
 * where that end attaches, the Inspector's list and edit (`attachArrowEnd`). It takes focus
 * when it opens; arrow keys move between the choices, Enter or Space picks one, Esc closes it.
 */
import { useEffect, useRef } from 'react';

import type { ArrowEnd } from '@/core/model/binding';
import type { BindSite, Vec2 } from '@/core/model/types';

import { SITE_CHOICES, siteName } from './connector';

export function EndSitePopover({
  at,
  end,
  noun,
  current,
  onChoose,
  onClose,
}: {
  /** The end's handle, screen coordinates inside the canvas. */
  readonly at: Vec2;
  readonly end: ArrowEnd;
  readonly noun: 'arrow' | 'line';
  readonly current: BindSite | undefined;
  readonly onChoose: (site: BindSite | undefined) => void;
  readonly onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);
  const move = (by: number) => {
    const buttons = [...(box.current?.querySelectorAll('button') ?? [])];
    const i = buttons.findIndex((b) => b === document.activeElement);
    buttons[(i + by + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div
      ref={box}
      className="end-sites"
      role="group"
      aria-label={`Attach the ${end} of the ${noun} to`}
      data-testid="end-sites"
      style={{ left: at.x + 10, top: at.y + 10 }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(1);
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(-1);
        else if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') return;
        // The choices own their keys: none of them reaches the canvas shortcuts.
        e.stopPropagation();
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') e.preventDefault();
      }}
    >
      {SITE_CHOICES.map((site) => (
        <button
          key={site ?? 'outline'}
          type="button"
          aria-pressed={site === current}
          onClick={() => {
            onChoose(site);
          }}
        >
          {siteName(site)}
        </button>
      ))}
    </div>
  );
}
