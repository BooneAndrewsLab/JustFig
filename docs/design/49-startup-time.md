# 49 Startup time

Measured 2026-10-10 in headless Chromium against `vite preview` on localhost, time from navigation
to the first painted frame (`performance.mark`s in `main.tsx`, since removed): the built app took
**0.70 s cold and 0.55 s warm**; the dev server 1.85 s and 0.85 s (484 unbundled module requests).
Nothing was network-bound locally. The warm 550 ms was, in order:

| phase                                       | ms  |
| ------------------------------------------- | --- |
| evaluating the 1.8 MB main script           | 250 |
| fetching 12 fonts (parallel) + parsing them | 80  |
| `startSession` (IndexedDB)                  | 15  |
| first React render                          | 200 |

A sourcemap breakdown put jsPDF + svg2pdf + pako at 432 KB (a quarter) of the main chunk; a CPU
profile put ~130 ms of the first render in the Objects shelf, which drew all 17 kinds' thumbnails
(text layout and glyph outlines included) synchronously on mount.

## Rules

- **The PDF export stack is loaded on the first PDF export** (`await import('@/export/pdf')` at
  both call sites), the way `loadPdf` already is for import. Nothing in the startup path may
  import `jspdf` or `svg2pdf.js` statically; the build output should keep a separate `pdf-*.js`
  chunk.
- **Fonts are fetched at start but parsed on first use** (`getFont`), and `index.html` preloads
  them (`fontPreloads` in `vite.config.ts`, from `public/fonts/*.ttf`) so the download overlaps
  script evaluation instead of waiting for it. Text layout stays synchronous: `getFont` parses from
  the stored bytes when a style is first needed (~3 ms each).
- **The Objects shelf draws its tiles on the tick after mount**, so the page paints before the
  kinds are rendered. Anything else expensive that is not needed for the first frame should follow
  the same pattern rather than run inside the first render.

## Result

Warm first paint 550 → ~320 ms, cold 700 → ~570 ms (cold is now mostly the first-visit download
and the service worker's precache); main chunk 1.82 → 1.34 MB (gzip 582 → 429 KB). The remaining
warm time is script evaluation (react-dom, opentype.js, dexie and the app) and the first render.

Left for later, measured but not done: lazy-loading the icon browser (~35 ms of the first render)
and precomputing the shelf thumbnails at build time (they depend only on each kind's defaults).
