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
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4M7 5v4',
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  add: 'M8 3v10M3 8h10',
  // The Inspector's action strips (note 59): open lines and chevrons, since a closed shape
  // under 4 units wide fills itself in at this stroke.
  'flip-h': 'M8 2.5v11M5 5 2 8l3 3M11 5l3 3-3 3',
  'flip-v': 'M2.5 8h11M5 5l3-3 3 3M5 11l3 3 3-3',
  front: 'M3 2.5h10M8 13.5V6M5 9l3-3 3 3',
  back: 'M3 13.5h10M8 2.5V10M5 7l3 3 3-3',
  'align-left': 'M2.5 2v12M5.5 5h8M5.5 11h4.5',
  'align-hcenter': 'M8 2v12M4 5h8M5.5 11h5',
  'align-right': 'M13.5 2v12M2.5 5h8M6 11h4.5',
  'align-top': 'M2 2.5h12M5 5.5v8M11 5.5v4.5',
  'align-vcenter': 'M2 8h12M5 4v8M11 5.5v5',
  'align-bottom': 'M2 13.5h12M5 2.5v8M11 6v4.5',
  'distribute-h': 'M2.5 2.5v11M13.5 2.5v11M6 5v6M10 5v6',
  'distribute-v': 'M2.5 2.5h11M2.5 13.5h11M5 6h6M5 10h6',
  step: 'M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM6.5 6.5 8 5.5V11',
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
