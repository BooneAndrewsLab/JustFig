/**
 * Every keyboard shortcut in one table, and the rules for changing one
 * (note 09). Ported from PlasmidPop's `keyBindings.ts` (#79 there): the
 * handlers ask the table what key an action is on, the tooltips and the
 * guide ask it what to print, and the user may move an action to another
 * key in Keyboard shortcuts….
 *
 * A binding is its modifiers and the physical key code, in a fixed order:
 * `ctrl+KeyG`, `ctrl+shift+KeyG`, `shift+BracketRight`, `KeyR`. The code,
 * not the character, so a shortcut works the same on every layout and
 * macOS Option never composes it into another character. Unlike
 * PlasmidPop, a bare key is allowed: nothing on the canvas types, and a
 * focused field never sees a shortcut (`isTyping`). `ctrl` means Ctrl, or
 * ⌘ on a Mac: `bindingOf` writes either as `ctrl`.
 */

export interface KeyAction {
  readonly id: string;
  /** What the shortcut editor and the guide call it. */
  readonly label: string;
  /** Which part of the app it belongs to, for the listing. */
  readonly group: 'Tools' | 'Edit' | 'Arrange' | 'File' | 'View' | 'Fixed';
  readonly defaultBinding: string;
  /**
   * The key cannot be changed: the ones the browser and every app share
   * (Ctrl+Z, Ctrl+C), ranges (the arrow keys), and keys inside the text
   * editor.
   */
  readonly fixed?: boolean;
  /** A word on what it does where the label is not enough. */
  readonly note?: string;
}

export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'tool-select', label: 'Select tool', group: 'Tools', defaultBinding: 'KeyV' },
  {
    id: 'tool-hand',
    label: 'Pan tool',
    group: 'Tools',
    defaultBinding: 'KeyH',
    note: 'or hold Space with any tool',
  },
  { id: 'tool-rect', label: 'Rectangle tool', group: 'Tools', defaultBinding: 'KeyR' },
  { id: 'tool-ellipse', label: 'Ellipse tool', group: 'Tools', defaultBinding: 'KeyE' },
  { id: 'tool-line', label: 'Line tool', group: 'Tools', defaultBinding: 'KeyL' },
  { id: 'tool-pen', label: 'Pen tool', group: 'Tools', defaultBinding: 'KeyP' },
  { id: 'tool-arrow', label: 'Arrow tool', group: 'Tools', defaultBinding: 'KeyA' },
  { id: 'tool-text', label: 'Text tool', group: 'Tools', defaultBinding: 'KeyT' },
  { id: 'tool-panel', label: 'Panel tool', group: 'Tools', defaultBinding: 'KeyF' },
  {
    id: 'select-all',
    label: 'Select everything on the page',
    group: 'Edit',
    defaultBinding: 'ctrl+KeyA',
  },
  { id: 'duplicate', label: 'Duplicate the selection', group: 'Edit', defaultBinding: 'ctrl+KeyD' },
  { id: 'group', label: 'Group the selection', group: 'Edit', defaultBinding: 'ctrl+KeyG' },
  { id: 'ungroup', label: 'Ungroup', group: 'Edit', defaultBinding: 'ctrl+shift+KeyG' },
  { id: 'front', label: 'Bring to front', group: 'Arrange', defaultBinding: 'BracketRight' },
  { id: 'forward', label: 'Bring forward', group: 'Arrange', defaultBinding: 'shift+BracketRight' },
  { id: 'back', label: 'Send to back', group: 'Arrange', defaultBinding: 'BracketLeft' },
  { id: 'backward', label: 'Send backward', group: 'Arrange', defaultBinding: 'shift+BracketLeft' },
  { id: 'open', label: 'Open a figure file', group: 'File', defaultBinding: 'ctrl+KeyO' },
  { id: 'export', label: 'Export', group: 'File', defaultBinding: 'ctrl+KeyE' },
  { id: 'fit', label: 'Fit the page in the window', group: 'View', defaultBinding: 'shift+Digit1' },
  { id: 'zoom-in', label: 'Zoom in', group: 'View', defaultBinding: 'shift+Equal' },
  { id: 'zoom-out', label: 'Zoom out', group: 'View', defaultBinding: 'Minus' },
  { id: 'guide', label: 'The user guide', group: 'View', defaultBinding: 'shift+Slash', note: '?' },
  {
    id: 'save',
    label: 'Download the figure file',
    group: 'Fixed',
    defaultBinding: 'ctrl+KeyS',
    fixed: true,
  },
  {
    id: 'undo',
    label: 'Undo (with Shift, redo; Ctrl+Y also redoes)',
    group: 'Fixed',
    defaultBinding: 'ctrl+KeyZ',
    fixed: true,
  },
  { id: 'redo', label: 'Redo', group: 'Fixed', defaultBinding: 'ctrl+KeyY', fixed: true },
  {
    id: 'copy',
    label: 'Copy, cut (Ctrl+X) and paste (Ctrl+V)',
    group: 'Fixed',
    defaultBinding: 'ctrl+KeyC',
    fixed: true,
  },
  {
    id: 'delete',
    label: 'Delete the selection (or Backspace)',
    group: 'Fixed',
    defaultBinding: 'Delete',
    fixed: true,
  },
  {
    id: 'escape',
    label: 'Back to the Select tool, then select nothing; cancels a pen path',
    group: 'Fixed',
    defaultBinding: 'Escape',
    fixed: true,
  },
  {
    id: 'nudge',
    label: 'Nudge the selection by 1 pt (with Shift, 10 pt)',
    group: 'Fixed',
    defaultBinding: 'ArrowRight',
    fixed: true,
    note: 'all four arrow keys',
  },
  {
    id: 'finish-pen',
    label: 'Finish a pen path',
    group: 'Fixed',
    defaultBinding: 'Enter',
    fixed: true,
  },
  {
    id: 'text-bold',
    label: 'Text editor: bold (Ctrl+I italic)',
    group: 'Fixed',
    defaultBinding: 'ctrl+KeyB',
    fixed: true,
  },
  {
    id: 'text-sub',
    label: 'Text editor: subscript (with Shift, superscript)',
    group: 'Fixed',
    defaultBinding: 'ctrl+Equal',
    fixed: true,
  },
];

const BY_ID = new Map(KEY_ACTIONS.map((a) => [a.id, a]));

export function keyAction(id: string): KeyAction | undefined {
  return BY_ID.get(id);
}

/** The binding a key event is, written as the table writes one. */
export function bindingOf(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'code'>,
): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.code);
  return parts.join('+');
}

/** `ctrl+shift+KeyG` → `Ctrl+Shift+G`, `BracketRight` → `]`. */
export function formatBinding(binding: string): string {
  const parts = binding.split('+');
  const code = parts.pop() ?? '';
  const modifiers = parts.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  return [...modifiers, formatCode(code)].join('+');
}

function formatCode(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1] !== undefined) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit?.[1] !== undefined) return digit[1];
  const named: Readonly<Record<string, string>> = {
    BracketLeft: '[',
    BracketRight: ']',
    Equal: '=',
    Minus: '−',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Space: 'Space',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  return named[code] ?? code;
}

/** Keys the browser takes before a page can: a shortcut on one would never fire. */
const BROWSER_KEYS: ReadonlySet<string> = new Set([
  'ctrl+KeyT',
  'ctrl+KeyN',
  'ctrl+KeyW',
  'ctrl+KeyQ',
  'ctrl+shift+KeyT',
  'ctrl+shift+KeyN',
  'ctrl+shift+KeyW',
  'ctrl+shift+KeyI',
  'ctrl+shift+KeyJ',
  'ctrl+Tab',
  'ctrl+shift+Tab',
  'alt+ArrowLeft',
  'alt+ArrowRight',
  'alt+Home',
  'alt+F4',
  'F5',
  'F11',
  'F12',
]);

/** Keys the app keeps for itself whatever the table says (the fixed rows and their partners). */
const RESERVED: ReadonlySet<string> = new Set([
  'ctrl+KeyX',
  'ctrl+KeyV',
  'ctrl+KeyI',
  'ctrl+shift+KeyZ',
  'ctrl+shift+Equal',
  'Backspace',
  'Space',
  'Tab',
  'shift+Tab',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'shift+ArrowLeft',
  'shift+ArrowRight',
  'shift+ArrowUp',
  'shift+ArrowDown',
  ...KEY_ACTIONS.filter((a) => a.fixed === true).map((a) => a.defaultBinding),
]);

/** What is wrong with putting `binding` on `actionId`, or null when nothing is. */
export function bindingProblem(
  binding: string,
  actionId: string,
  bindings: ReadonlyMap<string, string>,
): string | null {
  const parts = binding.split('+');
  const code = parts.pop() ?? '';
  if (code === '' || ['Alt', 'Control', 'Shift', 'Meta'].some((m) => code.startsWith(m)))
    return 'That is a modifier on its own; hold it and press another key.';
  if (BROWSER_KEYS.has(binding))
    return `${formatBinding(binding)} belongs to the browser, which would take it first.`;
  if (RESERVED.has(binding)) return `${formatBinding(binding)} is kept for a fixed shortcut.`;
  for (const [other, taken] of bindings) {
    if (other === actionId || taken !== binding) continue;
    const label = keyAction(other)?.label ?? other;
    return `${formatBinding(binding)} is already ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
  }
  return null;
}

/**
 * What each action is bound to: the defaults with the user's changes over
 * them. A change naming an action that no longer exists, a fixed one, or
 * something that is not a binding is dropped. When a change takes a key
 * another action still holds by default, the changed one keeps it and the
 * other is left unbound rather than both firing.
 */
export function resolveBindings(
  custom: Readonly<Record<string, string>> = {},
): Map<string, string> {
  const out = new Map(KEY_ACTIONS.map((a) => [a.id, a.defaultBinding]));
  for (const [id, binding] of Object.entries(custom)) {
    const action = keyAction(id);
    if (action === undefined || action.fixed === true) continue;
    if (typeof binding !== 'string' || !/^((ctrl|alt|shift)\+)*[A-Z][A-Za-z0-9]*$/.test(binding))
      continue;
    out.set(id, binding);
  }
  const seen = new Map<string, string>();
  for (const [id, binding] of out) {
    const holder = seen.get(binding);
    if (holder === undefined) {
      seen.set(binding, id);
      continue;
    }
    const changed = id in custom ? id : holder;
    const loser = changed === id ? holder : id;
    seen.set(binding, changed);
    out.delete(loser);
  }
  return out;
}

/** The action a key event triggers under these bindings, if any. */
export function actionFor(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'code'>,
  bindings: ReadonlyMap<string, string>,
): string | undefined {
  const b = bindingOf(e);
  for (const [id, binding] of bindings)
    if (binding === b && keyAction(id)?.fixed !== true) return id;
  return undefined;
}

// --- remembered per browser ------------------------------------------------------

const STORAGE_KEY = 'keyBindings';

export function loadCustomBindings(): Record<string, string> {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, b] of Object.entries(v)) if (typeof b === 'string') out[k] = b;
    return out;
  } catch {
    return {};
  }
}

export function saveCustomBindings(custom: Readonly<Record<string, string>>): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // A remembered preference only.
  }
}

/** The key an action is on, for a tooltip: "Rectangle tool (R)". */
export function withKey(label: string, id: string, bindings: ReadonlyMap<string, string>): string {
  const b = bindings.get(id);
  return b === undefined ? label : `${label} (${formatBinding(b)})`;
}
