import type { ToolId } from './state/store';

/**
 * Line icons for the chrome: one 16-unit path each, drawn for this app
 * (design/logo/justfig-tool-icons.md, note 50) rather than taken from an
 * icon set, as PlasmidPop's `SidebarIcon.tsx` does. They are for recognising
 * a tool at a glance; the word stays in the tooltip and the aria-label.
 */
const TOOL_PATHS: Readonly<Record<ToolId, string>> = {
  select: 'M3.5 2v10.5l2.9-2.7 2 4.4 1.9-.9-2-4.3 4-.3z',
  hand: 'M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V3.8a1 1 0 0 1 2 0V7.5M11 7.5V5.5a1 1 0 0 1 2 0V10c0 2.5-1.8 4.5-4.5 4.5-1.8 0-3-.8-4-2.3L2.6 9.4a1 1 0 0 1 1.6-1.2L5 9.2',
  rect: 'M2.5 3.5h11v9h-11z',
  ellipse: 'M2 8a6 4.5 0 1 0 12 0A6 4.5 0 1 0 2 8',
  line: 'M3 13 13 3',
  pen: 'M2.5 13.5C3.5 8 5 4.5 7.5 4.5M10.5 4.5h3M7.5 3h3v3h-3zM14 4.5h.01',
  arrow: 'M3 13 13 3M7 3h6v6',
  text: 'M3 4.5V3h10v1.5M8 3v10M6 13h4',
  panel: 'M2.5 2.5h11v11h-11zM2.5 7H7V2.5',
  note: 'M2.5 2.5h11v8.5H8l-3 2.5V11H2.5zM5 5.5h6M5 8h4',
};

const CHROME_PATHS = {
  undo: 'M5.5 2.5 2.5 5.5l3 3M2.5 5.5h7a3.5 3.5 0 0 1 0 7H7',
  redo: 'M10.5 2.5l3 3-3 3M13.5 5.5h-7a3.5 3.5 0 0 0 0 7H9',
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4M7 5v4',
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  add: 'M8 3v10M3 8h10',
} as const;

export type IconName = ToolId | keyof typeof CHROME_PATHS;

const PATHS: Readonly<Record<IconName, string>> = { ...TOOL_PATHS, ...CHROME_PATHS };

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      className="icon-glyph"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
