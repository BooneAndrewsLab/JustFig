import type { ToolId } from '../state/store';

/** The tools and their palette glyphs; their keys are in `keyBindings.ts`. */
export const TOOLS: readonly { id: ToolId; label: string; glyph: string }[] = [
  { id: 'select', label: 'Select', glyph: '↖' },
  { id: 'hand', label: 'Pan', glyph: '⇄' },
  { id: 'rect', label: 'Rectangle', glyph: '▭' },
  { id: 'ellipse', label: 'Ellipse', glyph: '◯' },
  { id: 'line', label: 'Line', glyph: '╱' },
  {
    id: 'pen',
    label: 'Pen (click corners, drag curves, Enter or double-click to finish)',

    glyph: '✒',
  },
  { id: 'arrow', label: 'Arrow', glyph: '→' },
  { id: 'text', label: 'Text', glyph: 'T' },
  { id: 'panel', label: 'Panel (lettered A, B, C…)', glyph: '⊞' },
  { id: 'note', label: 'Review note (click an object or a point)', glyph: '✎' },
];
