/**
 * The user guide (`docs/guide/*.md`), bundled into the app and shown in
 * the Guide dialog. Pages are ordered by their file-name number; each
 * starts with a `# Title`. `guide.test.ts` checks the guide against the
 * app: every tool, shortcut, panel, dialog, object kind, palette and
 * template must be described.
 */
const files = import.meta.glob<string>('../../docs/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export interface GuidePage {
  /** The file name without `.md`, e.g. `02-drawing`; links between pages use `02-drawing.md`. */
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export function guidePages(source: Readonly<Record<string, string>> = files): GuidePage[] {
  return Object.entries(source)
    .map(([path, text]) => {
      const id = (path.split('/').pop() ?? path).replace(/\.md$/, '');
      const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? id;
      return { id, title, text };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
