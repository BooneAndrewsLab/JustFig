/**
 * The user guide in the app (`docs/guide/*.md`, bundled): a page list and the page. The
 * version sits beside the title, and Change shortcuts (the rebinding table, note 52) is a
 * page of its own after Keyboard shortcuts.
 */
import { Fragment, useState } from 'react';

import { analytics } from '../analytics';
import { guidePages } from '../guide';
import { KeyBindings } from '../KeyBindings';
import { Dialog } from './Dialog';
import { renderGuide } from './guideMarkdown';

/** The id of the Change shortcuts page, which is the editor rather than Markdown. */
const KEYS_PAGE = 'change-shortcuts';
const SHORTCUTS_PAGE = '13-keyboard-shortcuts';

export function GuideDialog({ onClose }: { onClose: () => void }) {
  const pages = guidePages();
  const known = (id: string) => id === KEYS_PAGE || pages.some((p) => p.id === id);
  const [id, setId] = useState(pages[0]?.id ?? '');
  const page = pages.find((p) => p.id === id) ?? pages[0];
  const current = id === KEYS_PAGE ? KEYS_PAGE : page?.id;
  const go = (next: string) => {
    if (!known(next)) return;
    setId(next);
    analytics.track('guide', 'open', next);
    document.querySelector('.guide-page')?.scrollTo({ top: 0 });
  };
  const navItem = (itemId: string, title: string) => (
    <li>
      <button
        type="button"
        className="link"
        aria-current={itemId === current ? 'page' : undefined}
        onClick={() => {
          go(itemId);
        }}
      >
        {title}
      </button>
    </li>
  );
  return (
    <Dialog
      title="User guide"
      onClose={onClose}
      wide
      meta={<span className="dialog-meta">Version {__APP_VERSION__}</span>}
    >
      <div className="guide">
        <nav aria-label="Guide pages">
          <ol>
            {pages.map((p) => (
              <Fragment key={p.id}>
                {navItem(p.id, p.title)}
                {p.id === SHORTCUTS_PAGE && navItem(KEYS_PAGE, 'Change shortcuts')}
              </Fragment>
            ))}
          </ol>
        </nav>
        <article className="guide-page" data-testid="guide-page">
          {id === KEYS_PAGE ? (
            <KeyBindings />
          ) : page ? (
            renderGuide(page.text, go)
          ) : (
            <p>The guide is missing from this build.</p>
          )}
        </article>
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
