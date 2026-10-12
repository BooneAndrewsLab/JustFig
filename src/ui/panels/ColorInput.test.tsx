// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { pageObjects } from '@/core/model/tree';
import type { Figure, Paint, Swatch } from '@/core/model/types';
import { paletteById } from '@/palette/palettes';
import { applyPalette, linkColours } from '@/palette/recolor';
import { createProcedural, setParams } from '@/procedural/edits';
import { getKind, resolveProcedural } from '@/procedural/registry';

import { ColorInput } from './ColorInput';
import { resetRecentColors } from './recentColors';

afterEach(() => {
  cleanup();
  resetRecentColors();
});

const palette: Swatch[] = [{ id: 's1', name: 'Teal', hex: '#009988' }];

describe('ColorInput on procedural params (note 07)', () => {
  it('a copy picker stores the swatch hex by value and says so', () => {
    const onChange = vi.fn();
    render(<ColorInput label="Colour" value={null} palette={palette} copy onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Colour' }));
    const btn = screen.getByRole('button', { name: 'Colour swatch Teal' });
    expect(btn.getAttribute('title')).toContain('copies the colour');
    expect(screen.getByText('Palette (copies)')).toBeTruthy();
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith({ hex: '#009988' });
  });

  it('a linking picker still stores a swatch reference', () => {
    const onChange = vi.fn();
    render(<ColorInput label="Fill" value={null} palette={palette} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill swatch Teal' }));
    expect(onChange).toHaveBeenCalledWith({ swatch: 's1' });
  });

  it('applying another palette leaves a copied param colour unchanged', () => {
    const kind = getKind('plasmidMap');
    if (!kind) throw new Error('no plasmid map kind');
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const obj = createProcedural(kind, { x: 0, y: 0 });
    let fig: Figure = addObjects(page.id, [obj]).apply({ doc, assets: {} });

    // Choose a swatch in a feature's colour picker, as the Inspector does.
    let chosen: Paint | null = null;
    render(
      <ColorInput
        label="Colour"
        value={null}
        palette={palette}
        copy
        onChange={(p) => {
          chosen = p;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Colour swatch Teal' }));
    const picked = chosen as Paint | null;
    if (!picked || !('hex' in picked)) throw new Error('expected a hex paint');
    expect(picked.hex).toBe('#009988');

    const featuresOf = (f: Figure) => {
      const pg = f.doc.pages[0];
      const o = pg ? [...pageObjects(pg)].find((x) => x.id === obj.id) : undefined;
      if (o?.type !== 'procedural') throw new Error('lost object');
      const r = resolveProcedural(o);
      return (r?.params['features'] ?? []) as { color: string }[];
    };
    fig = setParams(page.id, obj.id, 'Colour', (p) => ({
      ...p,
      features: featuresOf(fig).map((x, i) => (i === 0 ? { ...x, color: picked.hex } : x)),
    })).apply(fig);
    expect(featuresOf(fig)[0]?.color).toBe('#009988');

    const tol = paletteById('tol-bright');
    if (!tol) throw new Error('no palette');
    fig = linkColours().apply(fig);
    fig = applyPalette(tol).apply(fig);
    expect(featuresOf(fig)[0]?.color).toBe('#009988');
  });
});

describe('ColorInput picker', () => {
  it('types a hex colour into the field', () => {
    const onChange = vi.fn();
    render(<ColorInput label="Fill" value={null} palette={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    const field = screen.getByLabelText('Fill hex');
    fireEvent.change(field, { target: { value: '#0AF' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ hex: '#00aaff' }, undefined);
  });

  it('ignores a half-typed hex colour', () => {
    const onChange = vi.fn();
    render(<ColorInput label="Fill" value={{ hex: '#009988' }} palette={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    const field = screen.getByLabelText('Fill hex');
    fireEvent.change(field, { target: { value: '#00' } });
    fireEvent.blur(field);
    expect(onChange).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('#009988');
  });

  it('opens a picker whose arrow keys change the colour, and Escape closes it', () => {
    const onChange = vi.fn();
    render(<ColorInput label="Fill" value={{ hex: '#ff0000' }} palette={[]} onChange={onChange} />);
    const btn = screen.getByRole('button', { name: 'Fill' });
    fireEvent.click(btn);
    const sq = screen.getByRole('slider', { name: 'Fill saturation and brightness' });
    fireEvent.keyDown(sq, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ hex: '#ff1919' }, true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the linked swatch by name, and None for no colour', () => {
    const { rerender } = render(
      <ColorInput label="Fill" value={{ swatch: 's1' }} palette={palette} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Fill' }).textContent).toContain('Teal');
    rerender(
      <ColorInput label="Fill" value={null} palette={palette} allowNone onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Fill' }).textContent).toContain('None');
  });

  it('lists a picked colour under Recent', () => {
    render(<ColorInput label="Fill" value={null} palette={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill #e69f00' }));
    expect(screen.getByRole('button', { name: 'Fill recent #e69f00' })).toBeTruthy();
  });
});
