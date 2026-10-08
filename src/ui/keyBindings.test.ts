import { describe, expect, it } from 'vitest';

import {
  KEY_ACTIONS,
  actionFor,
  bindingOf,
  bindingProblem,
  formatBinding,
  resolveBindings,
  withKey,
} from './keyBindings';

function press(code: string, mods: Partial<KeyboardEvent> = {}) {
  return { code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods };
}

describe('the table of key bindings (note 09)', () => {
  it('gives every action an id, a label and a default of its own', () => {
    const ids = new Set<string>();
    const keys = new Map<string, string>();
    for (const a of KEY_ACTIONS) {
      expect(ids.has(a.id), a.id).toBe(false);
      ids.add(a.id);
      expect(a.label.length).toBeGreaterThan(0);
      const taken = keys.get(a.defaultBinding);
      expect(taken, `${a.id} and ${taken ?? ''}`).toBeUndefined();
      keys.set(a.defaultBinding, a.id);
    }
  });

  it('accepts every changeable default where it is, and none on the browser’s keys', () => {
    const bound = resolveBindings();
    for (const a of KEY_ACTIONS.filter((x) => x.fixed !== true))
      expect(bindingProblem(a.defaultBinding, a.id, bound), a.id).toBeNull();
  });

  it('writes a binding as the key was pressed; ⌘ counts as Ctrl', () => {
    expect(bindingOf(press('KeyG', { ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+KeyG');
    expect(bindingOf(press('KeyG', { metaKey: true }))).toBe('ctrl+KeyG');
    expect(bindingOf(press('BracketRight', { shiftKey: true }))).toBe('shift+BracketRight');
    expect(formatBinding('ctrl+shift+KeyG')).toBe('Ctrl+Shift+G');
    expect(formatBinding('BracketLeft')).toBe('[');
    expect(formatBinding('shift+Slash')).toBe('Shift+/');
  });

  it('refuses modifiers alone, browser keys, fixed keys and keys already taken', () => {
    const bound = resolveBindings();
    expect(bindingProblem('ctrl+ShiftLeft', 'group', bound)).toMatch(/modifier/);
    expect(bindingProblem('ctrl+KeyW', 'group', bound)).toMatch(/browser/);
    expect(bindingProblem('ctrl+KeyZ', 'group', bound)).toMatch(/fixed/);
    expect(bindingProblem('ctrl+KeyV', 'group', bound)).toMatch(/fixed/);
    expect(bindingProblem('KeyR', 'tool-ellipse', bound)).toMatch(/already rectangle tool/);
    expect(bindingProblem('ctrl+KeyK', 'group', bound)).toBeNull();
  });

  it('applies changes, drops bad ones, and unbinds the action whose key was taken', () => {
    const bound = resolveBindings({
      'tool-rect': 'KeyQ',
      'tool-ellipse': 'KeyA',
      undo: 'KeyU',
      gone: 'KeyX',
      group: 'not a binding',
    });
    expect(bound.get('tool-rect')).toBe('KeyQ');
    expect(bound.get('tool-ellipse')).toBe('KeyA');
    expect(bound.has('tool-arrow')).toBe(false);
    expect(bound.get('undo')).toBe('ctrl+KeyZ');
    expect(bound.get('group')).toBe('ctrl+KeyG');
    expect(bound.has('gone')).toBe(false);
  });

  it('finds the action for a key, never a fixed one', () => {
    const bound = resolveBindings({ 'tool-rect': 'KeyQ' });
    expect(actionFor(press('KeyQ'), bound)).toBe('tool-rect');
    expect(actionFor(press('KeyR'), bound)).toBeUndefined();
    expect(actionFor(press('KeyG', { ctrlKey: true }), bound)).toBe('group');
    expect(actionFor(press('KeyZ', { ctrlKey: true }), bound)).toBeUndefined();
    expect(withKey('Rectangle', 'tool-rect', bound)).toBe('Rectangle (Q)');
  });
});
