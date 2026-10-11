/** The user guide in the app (`docs/guide/*.md`, bundled): a page list and the page. */
import { useState } from 'react';

import { analytics } from '../analytics';
import { guidePages } from '../guide';
import { Dialog } from './Dialog';
import { renderGuide } from './guideMarkdown';

export function GuideDialog({ onClose }: { onClose: () => void }) {
  const pages = guidePages();
  const [id, setId] = useState(pages[0]?.id ?? '');
  const page = pages.find((p) => p.id === id) ?? pages[0];
  const go = (next: string) => {
    if (!pages.some((p) => p.id === next)) return;
    setId(next);
    analytics.track('guide', 'open', next);
    document.querySelector('.guide-page')?.scrollTo({ top: 0 });
  };
  return (
    <Dialog title="User guide" onClose={onClose} wide>
      <div className="guide">
        <nav aria-label="Guide pages">
          <ol>
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="link"
                  aria-current={p.id === page?.id ? 'page' : undefined}
                  onClick={() => {
                    go(p.id);
                  }}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <article className="guide-page" data-testid="guide-page">
          {page ? renderGuide(page.text, go) : <p>The guide is missing from this build.</p>}
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
