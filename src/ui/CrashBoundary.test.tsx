// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CrashBoundary } from './CrashBoundary';
import { errorKind } from './analytics';

afterEach(cleanup);

function Boom(): never {
  throw new RangeError('secret figure text');
}

function ops() {
  const download = vi.fn<(id: string) => void>();
  return {
    figures: () => [
      { id: 'a', title: 'Figure A' },
      { id: 'b', title: '' },
    ],
    download,
    saveAndReload: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
}

describe('CrashBoundary', () => {
  it('shows the recovery screen with focus, a download per tab and the error kind only', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const o = ops();
    render(
      <CrashBoundary ops={o}>
        <Boom />
      </CrashBoundary>,
    );
    const screenEl = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(screenEl);
    expect(screenEl.textContent).toContain('RangeError');
    expect(screenEl.textContent).not.toContain('secret figure text');
    fireEvent.click(screen.getByRole('button', { name: 'Download a copy of Figure A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download a copy of Untitled' }));
    expect(o.download.mock.calls).toEqual([['a'], ['b']]);
    fireEvent.click(screen.getByRole('button', { name: 'Save and reload' }));
    expect(o.saveAndReload).toHaveBeenCalledOnce();
  });

  it('renders its children when nothing throws', () => {
    render(
      <CrashBoundary ops={ops()}>
        <p>fine</p>
      </CrashBoundary>,
    );
    expect(screen.getByText('fine')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('reports only built-in error class names', () => {
    class Custom extends Error {}
    expect(errorKind(new TypeError('x'))).toBe('TypeError');
    expect(errorKind(new Custom('x'))).toBe('Error');
    expect(errorKind('a string')).toBe('Error');
  });
});
