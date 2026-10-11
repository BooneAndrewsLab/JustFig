# Family base sheet: adopting it in PlasmidPop and BarelySig

`src/ui/theme-base.css` in this repo is the family layer (DESIGN.md step 6,
note 54): the shared tokens with a light and a dark block, the Archivo UI
`@font-face`, base element rules (`*`, `html, body, #root`, `body` font,
form-control font inherit, `a`), buttons (`button`, `button.primary`,
`button.icon`, `button[aria-pressed='true']`, `button.link`), text inputs and
`select`, the `:focus-visible` ring, `.section` / `.section > h2`, `.status`,
dialogs (`.dialog-backdrop`, `.dialog`, `.dialog--wide`, `.dialog h1`,
`.dialog-head`, `.dialog-meta`, `.dialog .actions`, `.dialog fieldset`),
`.tabs`, `.sr-only`, and the dropdown menu under PlasmidPop's names
(`.menu`, `.menu__list`, `.menu__item`, `.menu__separator`,
`.menu__shortcut`; note 55). The base sets no left or right on
`.menu__list`: each app anchors its own lists.

It is not a package. Each sibling gets a verbatim copy plus one first line
naming where it came from. Never edit a copy. Change the source here,
commit, then re-copy.

This was written from PlasmidPop at `22814fc` (`src/styles.css`) and BarelySig
at `eb28f40` (`src/ui/theme.css`), read only. Line numbers below refer to
those commits.

## Copying (both siblings)

1. Get the source commit in this repo:
   `git log -1 --format=%h -- src/ui/theme-base.css`.
2. Copy the file and put this line above its header comment (fill in the
   hash):

   ```css
   /* Copied verbatim from JustFig src/ui/theme-base.css @ <hash>. Do not edit here: change it there and re-copy. */
   ```

3. Import it before the app's own sheet (steps per sibling below), then
   delete the sibling's own rules it supersedes.
4. Check the result by eye in light and dark, then run that repo's checks
   and e2e. Base rules use plain element and attribute selectors, so a
   sibling's class rule only wins on properties it sets itself. Anything it
   leaves unset comes from the base sheet (the "leaks" listed below).

On a later re-copy, replace the file, update the hash in line 1, and read
`git diff <old>..<new> -- src/ui/theme-base.css` here for anything that
needs a matching change in the sibling.

## PlasmidPop

**Place and import:** `src/theme-base.css`. In `src/main.tsx`, put
`import './theme-base.css';` on the line before `import './styles.css';`
(line 9). `src/app/styles.test.ts` reads `styles.css`, so check whether it
should also read the base sheet.

**Font:** the base sheet sets `--font-ui` to Archivo UI and declares
`@font-face` at `/fonts/archivo-ui.woff2`. PlasmidPop has no `public/fonts/`.
There are two options:

- Adopt Archivo: copy `public/fonts/archivo-ui.woff2` and its OFL licence
  from BarelySig or here (`public/fonts/README.md` has the section to copy).
  Precache it in the service worker if PlasmidPop has one.
- Keep the system font: leave `--font-ui` in PlasmidPop's own `:root`, which
  loads later and wins. The `@font-face` then never loads anything.

**Tokens it supersedes** (`styles.css` `:root` lines 1–59, dark block lines
61–101):

- **Same name, value changes:** `--ink` `#1c2430` becomes `#201e1d`, and
  `--ink-2` / `--ink-3` move to the warm greys. Teal `--accent` and
  `--accent-ink` are the same in both schemes, and so are the dark `--error`
  and `--warning` values (`#ff8a80`, `#e0a458`). Delete these from both
  PlasmidPop blocks. `color-scheme: light dark` moves to the base too.
- **Different names for the same roles:** `--surface` is `--panel`,
  `--surface-2` is `--ground`, `--line` is `--rule`, `--danger` is
  `--error` and `--warn` is `--warning`. `--surface-3` (the hover grey) has
  no base equivalent. To adopt the family greys with no big rename, alias
  them in PlasmidPop's `:root` (`--surface: var(--panel); --surface-2:
var(--ground); --line: var(--rule); --danger: var(--error); --warn:
var(--warning);`) and drop their light and dark literals. Keep
  `--surface-3`, `--danger-surface`, all `--seq-*`, `--diff-*`, `--gel-*`
  and `--font-mono`, which are PlasmidPop's own. This changes the cool greys
  to the warm family greys, which is a visible change.
- `--font-ui`: see the font section above.

**Rules it supersedes:** `*` box-sizing (line 99), `html, body, #root`
(line 103), the `body` font, size and colour (line 110, identical 14px/1.45),
`button {font: inherit; color: inherit}` (line 118) and `:focus-visible`
(line 323, identical). Delete them.

**Leaks to check.** PlasmidPop styles controls by class, and the base sheet
styles them by element:

- **Buttons:** every `<button>` now gets the base border, `--panel`
  background, 3px 8px padding and radius. `.button` sets all of these, so
  it is fine. Check `.menu__item`, `.doctabs__tab`, `.doctabs__close`,
  `.sidebar__tab`, `.segmented__button` and any other bare button for a
  stray border or background. Disabled buttons get `opacity: 0.45`, the same
  as `.button:disabled`.
- **`button.link` beats `.link`** on specificity, and it sets
  `color: inherit`, so PlasmidPop's accent-coloured `.link` buttons would
  lose their colour. Raise PlasmidPop's rule to `button.link, .link` or
  `.link.link`, or keep `color` out of the base rule (a change here, then a
  re-copy).
- **`input[type='text' | 'number' | 'search']` and `select`** (specificity
  0,1,1) beat `.panel__search`, `.panel__number` and `.panel__select` (line
  875 and line 2084, 0,1,0). The base padding of 2px 5px and the
  `--rule-strong` border would replace PlasmidPop's 4px 8px and `--line`.
  Raise those selectors (for example `input.panel__search`), or accept the
  family values.
- **Dialogs:** the class names are the same. `.dialog-backdrop` and
  `.dialog` come later in PlasmidPop and win where they set a property, so
  its 26rem max-width, `width: 100%`, border and backdrop colour stay. From
  the base it gains `max-height: calc(100vh - 48px)` and `overflow: auto`.
  `.dialog--wide` is in both: PlasmidPop's `max-width: min(52rem, 100%)`
  still applies. The base `width` is overridden by its `width: 100%`.
  PlasmidPop's `.dialog__title` and `.dialog__actions` and the base
  `.dialog h1` and `.dialog .actions` do not collide.
- **Menus:** the class names are PlasmidPop's own. `button.menu__item`
  (0,1,1) beats its `.menu__item` (0,1,0): items take the base 5px 10px
  padding, a radius of 4px and the `--accent-soft` hover and focus wash
  instead of `--surface-3`. `.menu__list` is equal in specificity and
  PlasmidPop's comes later, so its `right: 0`, `--line` border, 8px radius
  and `z-index: 10` stay. Keep PlasmidPop's `.menu__item:hover` if the grey
  wash should stay.
- **No collision:** `.status` (PlasmidPop has `.statusbar`), `.tabs`
  (`.doctabs`, `.sidebar__tabs`), `.section` (`.panel__section`,
  `.panel__heading`, which already match the base header, 13px/600
  `--ink-2`) and `.sr-only` (`.visually-hidden`). These could be renamed to
  the base names later. Nothing requires it.
- **Dark mode:** it follows the system setting in both. Do not set
  `data-scheme`.

## BarelySig

**Place and import:** `src/ui/theme-base.css`. In `src/main.tsx`, put
`import './ui/theme-base.css';` on the line before
`import './ui/theme.css';` (line 8).

**No dark mode:** add `data-scheme="light"` to `<html lang="en">` in
`index.html`. The base sheet then keeps `color-scheme: light` and the light
tokens on a dark system.

**Tokens and rules it supersedes** (`theme.css` `:root` lines 17–36):

- Delete the Archivo UI `@font-face` (line 10). It is the same file and the
  same descriptors. Keep the Arimo faces (line 1490), which are graph fonts.
- Delete `--font-ui` (identical), and delete `--ink-2`, `--rule`,
  `--rule-strong`, `--warning` and `--error`, which have the same values.
- `--ink-3` changes from `#8a8481` to `#6f6966`, which is darker and passes
  AA on white. Delete BarelySig's value to adopt it.
- Different names: `--bs-ink` is `--ink`, `--bs-ground` is `--ground` and
  `--sheet` is `--panel`. Alias them (`--bs-ink: var(--ink)` and so on) or
  rename them. `--bs-accent` (red) is not `--accent` (teal). Keep it.
- **Keep `--radius: 4px`** in BarelySig's `:root`. It loads later and wins.
- `*` (line 38) and `body {margin: 0}` are superseded, and so is
  `button, input, select {font: inherit; color: inherit}` (line 48). The
  base also covers `textarea`.
- **Line height:** the base sets `body {font: 14px/1.45 ...}`, which
  overrides the 1.4 that `body` inherits from BarelySig's `:root`. To keep
  1.4, move BarelySig's `font` from `:root` to a `body` rule in its own
  sheet.

**Keep the red focus ring:** BarelySig's own `:focus-visible` (line 85,
`--bs-accent`, offset 1px) loads later and wins. Keep that rule. Do not
point `--accent` at red: the base `button.primary` and pressed rules use
`--accent` for their borders.

**Leaks to check:**

- **`button`:** BarelySig's `button` (line 53) sets the same properties
  later, so it wins. `button:disabled` gains the base `opacity: 0.45` on
  top of BarelySig's `--ink-3` colour. Add `opacity: 1` to BarelySig's rule,
  or drop its colour and take the family look.
- **`button.primary`:** the base border colour is `--accent` (teal), and
  BarelySig's rule (line 70) sets only background and colour. Add
  `border-color: var(--bs-ink)` there.
- **`button[aria-pressed='true']`:** gets the teal tint and border wherever
  BarelySig has no specific rule. Its pressed rules (`.preset-row`,
  `.nb-actions`, `.start-rows`) are more specific and win. Check any other
  toggle.
- **Inputs:** BarelySig's `input:not([type='radio'], [type='checkbox']),
select` (line 91) has the same specificity and loads later, so it wins.
  Only `min-width: 0` leaks from the base.
- **`.status`** has the same class name. BarelySig's rule (line 170) wins on
  padding, size, colour and border. From the base it gains `gap: 12px`,
  `min-height: 22px` and **`background: var(--panel)`** (white). Set
  `background: none` (or what it had) in BarelySig's rule if the bar
  should stay on the ground.
- **`.dialog`:** BarelySig's rule (line 568) wins on width, padding (20px
  24px), radius (6px) and shadow. `max-height` differs: the base has 48px,
  BarelySig 32px, and BarelySig's wins. `.dialog fieldset` is in both, and
  BarelySig's comes later. Its `.dialog h2` is untouched; the base styles
  `.dialog h1`, which BarelySig does not use.
- **`.dialog .actions` (0,2,0) beats BarelySig's `.actions` (0,1,0)** inside
  dialogs. The base margin-top of 14px replaces BarelySig's 20px. Scope
  BarelySig's rule as `.dialog .actions, .actions` to keep 20px.
- **No collision:** `.dialog-backdrop` (BarelySig has `.backdrop`),
  `.dialog--wide` (`.dialog.wide`), `.tabs` (`.mode-tabs`), `.section`
  (`.side` and `.side h2`, which stay 11px uppercase) and `.sr-only` (none).
- **`.menu`** is BarelySig's list itself, not a wrapper. Its rule comes later
  at equal specificity, so its `position: absolute` and anchor win over the
  base `position: relative`. Its items carry no `.menu__item` class, so the
  base item rules do not reach them.
- **Left side panel 250px:** layout is not in the base sheet, so nothing
  changes.

## Known differences the base sheet does not settle

|              | Figure editor (source)                                         | PlasmidPop                                                                          | BarelySig                                           |
| ------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Dark mode    | system, no toggle                                              | system, no toggle                                                                   | none (`data-scheme="light"`)                        |
| UI font      | Archivo UI                                                     | system stack (own choice: see Font)                                                 | Archivo UI                                          |
| Focus colour | teal accent                                                    | teal accent                                                                         | red, offset 1px (own rule)                          |
| Radius       | 6px, dialogs 10px                                              | 6px, dialogs 10px                                                                   | 4px (own `--radius`), dialogs 6px                   |
| Line height  | 1.45                                                           | 1.45                                                                                | 1.4                                                 |
| Side panel   | right, 260px, sections                                         | right, 330px, 30px vertical rail of tabs                                            | left, 250px, sections                               |
| Class names  | `.dialog-backdrop`, `.status`, `.section`, `.tabs`, `.sr-only` | `.dialog-backdrop`, `.statusbar`, `.panel__section`, `.doctabs`, `.visually-hidden` | `.backdrop`, `.status`, `.side`, `.mode-tabs`, none |
