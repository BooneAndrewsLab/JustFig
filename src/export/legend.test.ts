/** The legend skeleton (note 34): panels, scale bars, channel names, credits. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc, createPanel, createText, defaultRun, frame } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Assets, Figure, Image, Obj, Panel, Procedural } from '@/core/model/types';
import { createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';

import { legendText } from './legend';

const meta = { width: 100, height: 100 };
const assets: Assets = {
  h1: { kind: 'image', mime: 'image/png', dataBase64: 'AA', meta: { ...meta, name: 'dapi.tif' } },
  h2: { kind: 'image', mime: 'image/png', dataBase64: 'BB', meta: { ...meta, name: 'gfp.png' } },
  h4: { kind: 'image', mime: 'image/png', dataBase64: 'DD', meta: { ...meta, name: 'off.png' } },
  h3: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: 'CC',
    meta: { ...meta, name: 'x.png', credit: 'Image: J. Smith (CC BY 4.0)' },
  },
};

const figWith = (objs: Obj[], a: Assets = assets): Figure => {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return addObjects(page.id, objs).apply({ doc, assets: a });
};

const panel = (x: number, y: number, title?: string, kids: Obj[] = []): Panel => {
  const p = createPanel(frame(x, y, 100, 100));
  const t = title === undefined ? [] : [createText(x + 5, y + 5, [[defaultRun(title)]])];
  return { ...p, children: [...t, ...kids] };
};

const bar = (length: number): Procedural => {
  const k = getKind('scaleBar');
  if (!k) throw new Error('no kind');
  const o = createProcedural(k, { x: 0, y: 0 });
  return { ...o, params: { ...(o.params as object), length } };
};

const merge = (channels: [string, boolean][]): Image => ({
  id: newId('o'),
  type: 'image',
  asset: 'h1',
  frame: frame(0, 0, 50, 50),
  opacity: 1,
  channels: channels.map(([asset, on]) => ({ asset, color: '#ff0000', on, min: 0, max: 255 })),
});

describe('legendText', () => {
  it('is empty for an empty document', () => {
    expect(legendText({ doc: createDoc(), assets: {} })).toBe('');
  });

  it('lists panels in reading order with their titles', () => {
    const fig = figWith([panel(200, 0, 'Right'), panel(0, 300), panel(0, 0, 'Left  top')]);
    expect(legendText(fig)).toBe('A. Left top\nB. Right\nC.');
  });

  it('follows the label format', () => {
    const fig = figWith([panel(0, 0, 'One')]);
    const style = { ...fig.doc.panelLabelStyle, format: '(a)' as const };
    expect(legendText({ ...fig, doc: { ...fig.doc, panelLabelStyle: style } })).toBe('(a) One');
  });

  it('groups scale bars of equal length', () => {
    const fig = figWith([panel(0, 0, 'A', [bar(10)]), panel(200, 0, 'B', [bar(10)])]);
    expect(legendText(fig)).toBe('A. A\nB. B\nScale bars, 10 µm.');
  });

  it('says one bar in the singular, and names panels when lengths differ', () => {
    expect(legendText(figWith([bar(500)]))).toBe('Scale bar, 500 µm.');
    const fig = figWith([
      panel(0, 0, undefined, [bar(10)]),
      panel(200, 0, undefined, [bar(50), bar(50)]),
    ]);
    expect(legendText(fig)).toBe('A.\nB.\nScale bars, 10 µm (A) and 50 µm (B).');
  });

  it('names the channels of a merge, skipping those turned off', () => {
    const fig = figWith([
      merge([
        ['h1', true],
        ['h2', true],
        ['h4', false],
      ]),
      merge([['h2', true]]),
    ]);
    expect(legendText(fig)).toBe('Channels: dapi, gfp.');
  });

  it('adds the credits typed for pictures, once each', () => {
    const img = (): Image => {
      const { channels: _c, ...rest } = merge([]);
      return { ...rest, asset: 'h3' };
    };
    expect(legendText(figWith([img(), img()]))).toBe('Images: Image: J. Smith (CC BY 4.0).');
  });
});
