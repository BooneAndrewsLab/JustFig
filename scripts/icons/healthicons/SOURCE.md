# Health Icons (vendored subset)

- Source: https://github.com/resolvetosavelives/healthicons
- Commit: 36887b268d2cb61f8d91622ad459bdf07910c2b0 (fetched 2026-10-08)
- Path: `public/icons/svg/filled/<category>/<name>.svg`
- Licence: the icons are CC0 1.0 (public domain), per the project README;
  the website code is MIT. https://creativecommons.org/publicdomain/zero/1.0/

These are copied unchanged. `scripts/icons/make-stub-library.ts` gives each
painted element a recolour slot and builds them into `public/lib/stub/`.
Phase 2's `justfig-icons` pipeline replaces this with a pinned, full ingest.
