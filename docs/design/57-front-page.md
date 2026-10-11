# 57 Front page: what JustFig is, when no figure is open

2026-10-11. Both siblings have one: BarelySig's `Home` (its item 09) is a
whole page shown while no project is open, and PlasmidPop's `EmptyState`
fills the window while no document is open. JustFig always opened straight
into an empty figure, so a first-time visitor met a blank page and a lot of
tools, with nothing saying what the app is or that figures stay on the
computer. The templates, the best place to start, were behind File ›
Templates….

## When it shows

The front page shows instead of the editor, never on top of it:

- **First visit**, or any start-up where nothing is restored (no kept
  figures, or IndexedDB too slow for the 1.5 s start-up race).
- **After closing the last tab.** The store still keeps its one untouched
  blank tab underneath (it never has zero tabs), so nothing else changes.
- **The logo** in the top bar, a button now ("Front page: your open figures
  stay open"). The tabs stay open; the front page's bar then offers **Back
  to your figures**, and the Recent list marks them "Open now" / "Open in a
  tab".

A reload comes back to the front page when it was showing over nothing but
the untouched tab: `rememberTabs` writes `{ ids: [], front: null }`, and
`keptTabs` treats an explicit empty list as "nothing open" instead of
falling back to the latest figure (the fallback stays for a missing or
unreadable key and for the pre-tabs `justfig.current`).

It goes away when a figure comes forward: `store.open`, `load`, `activate`
and any `edit` clear it (an import from Open… edits the blank tab). State:
`home: boolean` in `SharedState`, `store.showHome()` and `store.leaveHome()`.

`?editor` in the URL skips it at start-up (restored figures or a blank one,
as before). The e2e suites start there, so only `home.spec.ts` sees the front
page on first visit.

## What is on it

BarelySig's layout and class names (`.app-landing`, `.landing-bar`, `.home`,
`.hero*`, `.promises`, `.landing-foot`), with JustFig's tokens:

- **Bar:** sticky, 56 px; on the right **Back to your figures** (only with a
  touched tab), **Open…** and **?** (the guide).
- **Hero:** the logo large; tag line "Scientific figures in your browser.
  Free, private, offline."; title "Figures for papers, posters and grants.";
  a lead sentence; **New figure** (primary), **Open a figure…** (outline) and
  **Try an example** (the first gallery example); a note that `.jfig`, SVG,
  PNG, TIFF and PDF open or import, and that a file can be dropped on the
  window.
- **Recent figures** (when there are any): the Recent dialog's list,
  extracted into `RecentList` and used by both (open, rename, download,
  delete with its confirmation, thumbnails, storage line). On the front
  page the delete confirmation opens over the list (`keepList`); the dialog
  still swaps its list for it.
- **Start from a template:** a card per gallery template (thumbnail, title,
  description); choosing one is `openGallery`. **More templates and
  examples…** opens the Templates dialog. Thumbnails are built after the
  first paint (`galleryThumbnail`, shared with the dialog) so start-up time
  (note 49) does not pay for them; cards show a blank tile until then. The
  tile is `--card-tile`, grey in both schemes: `--figure-tile` is the
  ground colour in light mode, and a white page vanished on the white card.
- **Promises:** "Ready for the journal" (PDF and SVG at exact size with fonts
  embedded, TIFF and PNG at the dpi a journal asks), "Your figures stay here" (no account, no upload,
  kept in this browser; save a `.jfig` any time), "Free, with credit built in"
  (CC0 and CC BY icons, attribution written for you).
- **Footer:** "JustFig <version> · MIT licence" (the name from `BRAND`).

Keyboard on the front page: Ctrl+O, Shift+O (Recent dialog) and `?` work; editing shortcuts, copy and paste do nothing. A file
dropped anywhere on the window opens as from Open…. Dialogs (Recent, guide,
Templates, PDF page, channels) work from the front page as from the editor.
When it appears, focus goes to its heading unless something already holds
it (first load and the logo cannot be told apart, so both do this).

Analytics: `home: show, new, open, example, template, recent, back`.

## Why

A free tool competes with BioRender on first impression, and its strongest
argument (no account; figures never leave the computer) was nowhere on
screen. Showing it only when nothing is open keeps returning users exactly
where they were: the restored tabs, as before. BarelySig's page is the
model because the user asked for the front page "like the others" and the
family shares the base sheet (note 54).

## Tests

- Unit: store (`showHome`, cleared by open/load/activate/edit, set by
  closing the last tab); `openTabs` (explicit empty list → nothing restored,
  legacy and garbled keys still fall back).
- e2e `home.spec.ts`: first visit shows it; New figure, a template card, Try
  an example and Open… each leave it; closing the last tab returns and a
  reload stays; the logo returns with tabs kept and Back to your figures
  restores the front tab; Recent list opens a kept figure; drop opens a file;
  keyboard-only path to New figure; axe.
- `guide.test.ts`: the front page and its buttons are in the guide.
