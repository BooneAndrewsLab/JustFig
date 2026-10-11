import type { ToolId } from '../state/store';

/** The tools in palette order; their icons are in `../icons.tsx`, their keys in `keyBindings.ts`. */
export const TOOLS: readonly { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'hand', label: 'Pan' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
  {
    id: 'pen',
    label: 'Pen (click corners, drag curves, Enter or double-click to finish)',
  },
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
  { id: 'panel', label: 'Panel (lettered A, B, C…)' },
  { id: 'note', label: 'Review note (click an object or a point)' },
];
