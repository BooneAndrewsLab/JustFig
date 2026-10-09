/**
 * The "not saved" banner (note 02): while autosave cannot write a figure to the
 * browser (storage full, or the browser refuses), this says which figures are
 * at risk and offers a download of each. It is a persistent alert, not a
 * passing notice, and goes away when a later save succeeds.
 */
import { downloadCopy } from '../state/session';
import { figure } from '../state/store';
import { useAppState } from '../state/useAppState';

/** Buttons shown before the rest are summed up as a count. */
const MAX_BUTTONS = 3;

export function SaveFailureBanner() {
  const s = useAppState();
  const failed = s.unsaved.flatMap((id) => {
    const tab = s.tabs.find((t) => figure(t).doc.id === id);
    return tab ? [{ id, key: tab.key, title: figure(tab).doc.title || 'Untitled' }] : [];
  });
  // The front figure first: it is the one being worked on.
  failed.sort((a, b) => Number(b.key === s.front) - Number(a.key === s.front));
  const shown = failed.slice(0, MAX_BUTTONS);
  const more = failed.length - shown.length;
  return (
    <div className="save-banner" role="alert" hidden={failed.length === 0}>
      {failed.length > 0 && (
        <>
          <span>
            Not saved in this browser: {shown.map((f) => f.title).join(', ')}
            {more > 0 ? ` and ${String(more)} more` : ''}. Your changes are only in this tab, so
            download a copy now.
          </span>
          {shown.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-label={`Download a copy of ${f.title}`}
              onClick={() => {
                downloadCopy(f.id);
              }}
            >
              {shown.length > 1 ? `Download a copy of ${f.title}` : 'Download a copy'}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
