/** New from a template or example (note 08): cards with live thumbnails; choosing one starts a new figure. */
import { useMemo, useState } from 'react';

import { exportSvg } from '@/export/svg';
import { type GalleryEntry, GALLERY } from '@/gallery/gallery';

import { analytics } from '../analytics';
import { openGallery } from '../state/session';
import { Dialog } from './Dialog';

function thumbnail(e: GalleryEntry): string {
  const fig = e.build();
  const page = fig.doc.pages[0];
  if (!page) return '';
  const svg = exportSvg(fig, page, { textMode: 'outline', footer: false, background: true }, '');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function GalleryDialog({ onClose, unsaved }: { onClose: () => void; unsaved: boolean }) {
  const [tab, setTab] = useState<GalleryEntry['kind']>('template');
  const thumbs = useMemo(() => new Map(GALLERY.map((e) => [e.id, thumbnail(e)])), []);
  return (
    <Dialog title="Templates and examples" onClose={onClose}>
      <div className="tabs" role="tablist" aria-label="Gallery">
        {(['template', 'example'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
            }}
          >
            {k === 'template' ? 'Templates' : 'Examples'}
          </button>
        ))}
      </div>
      <p className="note">
        {tab === 'template'
          ? 'Empty layouts to fill in: panels sized for a journal column.'
          : 'Finished figures to take apart. Their colours are linked to the palette, so applying another palette recolours them.'}
      </p>
      <div role="tabpanel">
        <ul className="gallery-grid">
          {GALLERY.filter((e) => e.kind === tab).map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="gallery-card"
                data-entry={e.id}
                onClick={() => {
                  if (
                    unsaved &&
                    !confirm(
                      'Start a new figure from this? The current one has not been saved to a file (Save downloads it).',
                    )
                  )
                    return;
                  openGallery(e);
                  analytics.track('gallery', 'open', e.id);
                  onClose();
                }}
              >
                <img src={thumbs.get(e.id)} alt="" />
                <strong>{e.title}</strong>
                <span>{e.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
