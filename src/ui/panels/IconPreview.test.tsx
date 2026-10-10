// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IconEntry } from '@/icons/manifest';

import { IconPreview } from './IconPreview';
import {
  CLOSE_DELAY_MS,
  OPEN_DELAY_MS,
  PREVIEW_ID,
  PreviewTimer,
  previewCredit,
  previewPosition,
} from './previewTimer';

afterEach(cleanup);

const entry = (over: Partial<IconEntry['meta']> = {}): IconEntry => ({
  id: 'neuron',
  title: 'Neuron',
  tags: [],
  category: 'cells',
  hash: 'h',
  svg: 'svg/neuron.svg',
  slots: [],
  recolor: 'whole',
  meta: {
    library: 'justfig-icons',
    libraryVersion: '1.2.0',
    id: 'neuron',
    title: 'Neuron',
    source: 'Bioicons',
    author: 'Servier',
    license: 'CC-BY-3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    originalUrl: 'https://bioicons.com',
    shareAlike: false,
    ...over,
  },
});

describe('PreviewTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it('opens only after the hover delay, so sweeping across the grid shows nothing', () => {
    const seen: (string | null)[] = [];
    const t = new PreviewTimer<string>((v) => seen.push(v));
    t.hover('a');
    vi.advanceTimersByTime(OPEN_DELAY_MS / 2);
    t.leave();
    t.hover('b');
    vi.advanceTimersByTime(OPEN_DELAY_MS - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['b']);
  });

  it('switches at once between tiles while open, and closes after a grace', () => {
    const seen: (string | null)[] = [];
    const t = new PreviewTimer<string>((v) => seen.push(v));
    t.hover('a');
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    t.leave();
    t.hover('b');
    expect(seen).toEqual(['a', 'b']);
    t.leave();
    t.keep(); // onto the preview itself
    vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    expect(t.current).toBe('b');
    t.leave();
    vi.advanceTimersByTime(CLOSE_DELAY_MS);
    expect(seen).toEqual(['a', 'b', null]);
  });

  it('opens at once on focus and closes at once on dismiss, cancelling a pending open', () => {
    const seen: (string | null)[] = [];
    const t = new PreviewTimer<string>((v) => seen.push(v));
    t.focus('a');
    expect(seen).toEqual(['a']);
    t.dismiss();
    t.dismiss();
    expect(seen).toEqual(['a', null]);
    t.hover('b');
    t.dismiss();
    vi.advanceTimersByTime(OPEN_DELAY_MS * 2);
    expect(seen).toEqual(['a', null]);
  });
});

describe('previewPosition', () => {
  const size = { width: 200, height: 240 };
  const viewport = { width: 1200, height: 800 };

  it('sits right of the tile, centred on it', () => {
    const p = previewPosition({ left: 20, top: 300, width: 58, height: 58 }, size, viewport);
    expect(p).toEqual({ left: 86, top: 209 });
  });

  it('flips left when there is no room on the right, and stays on screen vertically', () => {
    const p = previewPosition({ left: 1100, top: 760, width: 58, height: 58 }, size, viewport);
    expect(p.left).toBe(1100 - 8 - 200);
    expect(p.top).toBe(800 - 8 - 240);
    expect(previewPosition({ left: 20, top: -30, width: 58, height: 58 }, size, viewport).top).toBe(
      8,
    );
  });
});

describe('IconPreview', () => {
  it('is a tooltip with the icon’s own SVG, name and licence', () => {
    render(
      <IconPreview
        entry={entry()}
        anchor={{ left: 0, top: 0, width: 58, height: 58 }}
        svgUrl="/lib/1.2.0/svg/neuron.svg"
        onPointerEnter={vi.fn()}
        onPointerLeave={vi.fn()}
      />,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip.id).toBe(PREVIEW_ID);
    expect(tip.textContent).toContain('Neuron');
    expect(tip.textContent).toContain('Bioicons, Servier · CC-BY-3.0');
    expect(tip.textContent).not.toContain('Share-alike');
    expect(tip.querySelector('img')?.getAttribute('src')).toBe('/lib/1.2.0/svg/neuron.svg');
  });

  it('says when an icon is share-alike', () => {
    render(
      <IconPreview
        entry={entry({ shareAlike: true, license: 'CC-BY-SA-4.0', author: '' })}
        anchor={{ left: 0, top: 0, width: 58, height: 58 }}
        svgUrl="x.svg"
        onPointerEnter={vi.fn()}
        onPointerLeave={vi.fn()}
      />,
    );
    expect(screen.getByRole('tooltip').textContent).toContain('Share-alike (CC BY-SA)');
    expect(previewCredit(entry({ author: '' }))).toBe('Bioicons · CC-BY-3.0');
  });
});
