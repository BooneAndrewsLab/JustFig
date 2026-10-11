/**
 * Canvas overlay colours (note 51): the selection, handles, guides, rulers
 * and note markers. The values live as custom properties in `theme.css`, so a
 * colour scheme redeclares them there; they are applied through `style`
 * because SVG presentation attributes do not resolve `var()` everywhere.
 * Chrome only: nothing here reaches an exported figure.
 */
export const OVERLAY = {
  select: 'var(--select)',
  selectWash: 'var(--select-wash)',
  handle: 'var(--handle)',
  snapGuide: 'var(--snap-guide)',
  bindTarget: 'var(--bind-target)',
  pageEdge: 'var(--page-edge)',
  rulerTick: 'var(--ink-3)',
  rulerText: 'var(--ink-2)',
  note: 'var(--note)',
  noteEdge: 'var(--note-edge)',
  noteInk: 'var(--note-ink)',
  noteResolved: 'var(--note-resolved)',
  noteDraft: 'var(--note-draft)',
  wellGround: 'var(--ground)',
  wellEdge: 'var(--page-edge)',
} as const;
