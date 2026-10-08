import type { ToolId } from '../state/store';

/** The tools, their shortcut keys and palette glyphs. */
export const TOOLS: readonly { id: ToolId; label: string; key: string; glyph: string }[] = [
  { id: 'select', label: 'Select', key: 'V', glyph: '↖' },
  { id: 'hand', label: 'Pan', key: 'H', glyph: '✋' },
  { id: 'rect', label: 'Rectangle', key: 'R', glyph: '▭' },
  { id: 'ellipse', label: 'Ellipse', key: 'E', glyph: '◯' },
  { id: 'line', label: 'Line', key: 'L', glyph: '╱' },
  {
    id: 'pen',
    label: 'Pen (click corners, drag curves, Enter or double-click to finish)',
    key: 'P',
    glyph: '✒',
  },
  { id: 'arrow', label: 'Arrow', key: 'A', glyph: '→' },
  { id: 'text', label: 'Text', key: 'T', glyph: 'T' },
  { id: 'panel', label: 'Panel (lettered A, B, C…)', key: 'F', glyph: '⊞' },
];
