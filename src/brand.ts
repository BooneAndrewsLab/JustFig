/**
 * The ONLY place the app's display name and identity live (note 01,
 * "Branding rule"). `src/brand.test.ts` fails the build if the name
 * appears anywhere else in `src/`, `index.html` or `public/manifest*`.
 *
 * The file-format id written into saved files (`FORMAT` in
 * `src/io/jfig.ts`) and the IndexedDB name are deliberately NOT here: they
 * are permanent, so a rename never breaks a file or a stored figure.
 */
export const BRAND = Object.freeze({
  name: 'JustFig',
  shortName: 'JustFig',
  tagline: 'Scientific figures in your browser. Free, private, offline.',
  description:
    'Draw publication figures in the browser: icons, arrows, labels and multi-panel layouts, exported to SVG, PDF, PNG and TIFF. Works offline; your figures stay on your computer.',
  repoUrl: 'https://github.com/BooneAndrewsLab/JustFig',
  /** File extension of saved figures, with the dot. */
  fileExt: '.jfig',
  /** MIME type of saved figures (the PWA file handler). */
  mime: 'application/json',
  themeColor: '#1f2933',
  backgroundColor: '#f4f5f7',
  /**
   * Base URL of the icon library inside the deployed site (`public/lib/<version>/`);
   * the version is the one pinned in icons.lock.json (src/icons/lock.test.ts checks).
   */
  iconLibraryPath: 'lib/1.0.0/',
} as const);

export type Brand = typeof BRAND;
