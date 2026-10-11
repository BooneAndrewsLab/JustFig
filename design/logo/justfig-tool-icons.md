# JustFig tool icons

16×16 viewBox, one `<path>` each. Render with `fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"`. The word stays in the tooltip.

## Tools (tool-column order)

```ts
const TOOL_PATHS = {
  // Select
  select: 'M3.5 2v10.5l2.9-2.7 2 4.4 1.9-.9-2-4.3 4-.3z',
  // Pan
  hand: 'M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V3.8a1 1 0 0 1 2 0V7.5M11 7.5V5.5a1 1 0 0 1 2 0V10c0 2.5-1.8 4.5-4.5 4.5-1.8 0-3-.8-4-2.3L2.6 9.4a1 1 0 0 1 1.6-1.2L5 9.2',
  // Rectangle
  rect: 'M2.5 3.5h11v9h-11z',
  // Ellipse
  ellipse: 'M2 8a6 4.5 0 1 0 12 0A6 4.5 0 1 0 2 8',
  // Line
  line: 'M3 13 13 3',
  // Pen
  pen: 'M2.5 13.5C3.5 8 5 4.5 7.5 4.5M10.5 4.5h3M7.5 3h3v3h-3zM14 4.5h.01',
  // Arrow
  arrow: 'M3 13 13 3M7 3h6v6',
  // Text
  text: 'M3 4.5V3h10v1.5M8 3v10M6 13h4',
  // Panel
  panel: 'M2.5 2.5h11v11h-11zM2.5 7H7V2.5',
  // Review note
  note: 'M2.5 2.5h11v8.5H8l-3 2.5V11H2.5zM5 5.5h6M5 8h4',
} as const;
```

## Chrome

```ts
const CHROME_PATHS = {
  // Undo
  undo: 'M5.5 2.5 2.5 5.5l3 3M2.5 5.5h7a3.5 3.5 0 0 1 0 7H7',
  // Redo
  redo: 'M10.5 2.5l3 3-3 3M13.5 5.5h-7a3.5 3.5 0 0 0 0 7H9',
  // Zoom in
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4M7 5v4',
  // Zoom out
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.2 10.2 14 14M5 7h4',
  // Close
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  // Add
  add: 'M8 3v10M3 8h10',
} as const;
```
