import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createRect, frame } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import type { Asset, Icon, Obj } from '@/core/model/types';

import { hashAsset } from './assets';
import { JfigError, type Fragment, SCHEMA_VERSION } from './jfig';
import {
  MAX_PRESETS_FILE_CHARS,
  PRESETS_FORMAT,
  type Preset,
  UNTITLED_PRESET,
  assetsUsed,
  readPresetText,
  readPresetsFile,
  writePresetText,
  writePresetsFile,
} from './presets';
import { MAX_NAME, PRESET_CAPS } from './storage';

const APP = { name: 't', version: '0' };

const iconAsset = (fill = '#ff0000'): Asset => ({
  kind: 'icon',
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="${fill}"/></svg>`,
  slots: [{ id: 'a', label: 'Body', default: fill }],
  recolor: 'slots',
  meta: {
    library: 'test',
    libraryVersion: '1.0.0',
    id: 'cell',
    title: 'Cell',
    source: 'Test icons',
    author: 'A. Author',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    originalUrl: 'https://example.org/cell',
    shareAlike: false,
  },
});

const icon = (asset: string): Icon => ({
  id: 'o_icon' as Id,
  type: 'icon',
  name: 'Cell',
  frame: frame(10, 10, 20, 20),
  opacity: 1,
  asset,
  slots: {},
  lockAspect: true,
});

function sample(): { frag: Fragment; hash: string } {
  const a = iconAsset();
  const hash = hashAsset(a);
  const other = iconAsset('#00ff00');
  const objects: Obj[] = [createRect(frame(0, 0, 40, 30)), icon(hash)];
  return { frag: { objects, assets: { [hash]: a, [hashAsset(other)]: other } }, hash };
}

describe('preset text (storage)', () => {
  it('round-trips a fragment with only the assets it uses', () => {
    const { frag, hash } = sample();
    const back = readPresetText(writePresetText(frag));
    expect(back.objects).toEqual(frag.objects);
    expect(Object.keys(back.assets)).toEqual([hash]);
  });

  it('refuses a stored preset whose asset does not match its hash', () => {
    const { frag, hash } = sample();
    const text = writePresetText({ ...frag, assets: { [hash]: iconAsset('#0000ff') } });
    expect(() => readPresetText(text)).toThrow(/does not match its hash/);
  });

  it('refuses text that is not a fragment', () => {
    expect(() => readPresetText('{"format":"justfig"}')).toThrow(JfigError);
  });
});

describe('presets file (sharing)', () => {
  const presets = (): Preset[] => {
    const { frag } = sample();
    return [
      { name: 'Cell and box', fragment: frag },
      { name: 'Just a box', fragment: { objects: [createRect(frame(0, 0, 5, 5))], assets: {} } },
    ];
  };

  it('round-trips names, objects and the assets each preset uses', () => {
    const all = presets();
    const text = writePresetsFile(all, APP);
    expect(JSON.parse(text)).toMatchObject({ format: PRESETS_FORMAT, schemaVersion: 1 });
    const back = readPresetsFile(text);
    expect(back.map((p) => p.name)).toEqual(['Cell and box', 'Just a box']);
    const [first, second] = all;
    expect(back[0]?.fragment.objects).toEqual(first?.fragment.objects);
    expect(back[0]?.fragment.assets).toEqual(
      assetsUsed(first?.fragment.objects ?? [], first?.fragment.assets ?? {}),
    );
    expect(back[1]?.fragment).toEqual(second?.fragment);
    // Unused assets are not written.
    expect(Object.keys((JSON.parse(text) as { assets: object }).assets)).toHaveLength(1);
  });

  it('writes the same bytes for the same presets', () => {
    const all = presets();
    expect(writePresetsFile(all, APP)).toBe(writePresetsFile([...all], APP));
  });

  it('reads the frozen schema-1 file', () => {
    const text = readFileSync(new URL('./fixtures/v1.jfigpresets', import.meta.url), 'utf8');
    const back = readPresetsFile(text);
    expect(back.map((p) => p.name)).toEqual(['Cell and box', 'Just a box']);
    expect(back[0]?.fragment.objects.map((o) => o.type)).toEqual(['rect', 'icon']);
    expect(Object.values(back[0]?.fragment.assets ?? {})[0]).toMatchObject({
      kind: 'icon',
      meta: { license: 'CC-BY-4.0', author: 'A. Author' },
    });
  });

  const file = (patch: Record<string, unknown>) => {
    const f = JSON.parse(writePresetsFile(presets(), APP)) as Record<string, unknown>;
    return JSON.stringify({ ...f, ...patch });
  };

  it('treats a shared file as untrusted', () => {
    expect(() => readPresetsFile('not json')).toThrow(/not a presets file/);
    expect(() => readPresetsFile('[]')).toThrow(/not a presets file/);
    expect(() => readPresetsFile('{"format":"justfig"}')).toThrow(/not a presets file/);
    expect(() => readPresetsFile(' '.repeat(MAX_PRESETS_FILE_CHARS + 1))).toThrow(/too large/);
    expect(() => readPresetsFile(file({ schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(
      /newer version/,
    );
    expect(() => readPresetsFile(file({ presets: [] }))).toThrow(/at least one preset/);
    expect(() => readPresetsFile(file({ assets: {} }))).toThrow(/missing asset/);
    expect(() =>
      readPresetsFile(file({ presets: [{ name: 'x', objects: [{ type: 'rect' }] }] })),
    ).toThrow(/damaged \(presets file\.presets\[0\]\.objects\[0\]/);
    expect(() => readPresetsFile(file({ presets: [{ name: 'x', objects: [] }] }))).toThrow(
      /at least one object/,
    );
    const { hash } = sample();
    expect(() => readPresetsFile(file({ assets: { [hash]: iconAsset('#0000ff') } }))).toThrow(
      /does not match its hash/,
    );
    const many = Array.from({ length: PRESET_CAPS.maxRows + 1 }, () => ({
      name: 'x',
      objects: [createRect(frame(0, 0, 1, 1))],
    }));
    expect(() => readPresetsFile(file({ presets: many }))).toThrow(/more than/);
  });

  it('cleans names: whitespace collapsed, long ones cut, empty ones named', () => {
    const objects = [createRect(frame(0, 0, 1, 1))];
    const back = readPresetsFile(
      file({
        presets: [
          { name: '  a \n b  ', objects },
          { name: 'x'.repeat(500), objects },
          { name: '   ', objects },
        ],
      }),
    );
    expect(back.map((p) => p.name)).toEqual(['a b', 'x'.repeat(MAX_NAME), UNTITLED_PRESET]);
  });
});
