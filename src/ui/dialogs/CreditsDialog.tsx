/** The icon library's CREDITS.md, shown in the app (plan §3; creditsMarkdown.tsx renders it). */
import { useEffect, useState } from 'react';

import { getLibrary } from '../state/session';
import { renderCredits } from './creditsMarkdown';
import { Dialog } from './Dialog';

export function CreditsDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getLibrary()
      .credits()
      .then(
        (t) => {
          setText(t ?? 'This icon library has no credits file.');
        },
        (e: unknown) => {
          setError(e instanceof Error ? e.message : 'The credits could not be loaded.');
        },
      );
  }, []);
  return (
    <Dialog title="Icon credits and licences" onClose={onClose}>
      <div className="credits-body" data-testid="credits">
        {error && <p className="warn">{error}</p>}
        {text === null && !error && <p className="note">Loading…</p>}
        {text !== null && renderCredits(text)}
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
