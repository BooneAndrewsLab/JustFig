/**
 * Save as template source (note 08): the figure, or the selection, as the TypeScript of a
 * gallery entry, for a contributor to add to the repository. Reached from the Templates dialog;
 * it is not part of making a figure.
 */
import { useMemo, useState } from 'react';

import {
  TEMPLATE_ID,
  type TemplateSpec,
  templateFileName,
  templateObjects,
  templateSource,
} from '@/gallery/source';

import { analytics } from '../analytics';
import { download } from '../state/session';
import { currentPage, figure, selectedObjects } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const fig = figure(s);
  const page = currentPage(s);
  const selection = selectedObjects(s);
  const objects = useMemo(() => templateObjects(page, selection), [page, selection]);
  const [title, setTitle] = useState(fig.doc.title);
  const [id, setId] = useState(slug(fig.doc.title));
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<TemplateSpec['kind']>('example');
  const [copied, setCopied] = useState(false);

  const idOk = TEMPLATE_ID.test(id);
  const source = useMemo(() => {
    if (!idOk || objects.length === 0) return '';
    return templateSource(fig, page, objects, { id, title, description, kind });
  }, [fig, page, objects, id, title, description, kind, idOk]);

  return (
    <Dialog title="Save as template source" onClose={onClose}>
      <p className="note">
        For contributors. Writes {selection.length > 0 ? 'the selected objects' : 'this page'} as
        the source of a built-in gallery entry. Save the file in <code>src/gallery/</code>, add the
        entry to <code>GALLERY</code> in <code>gallery.ts</code>, and run <code>npm run check</code>
        .
      </p>
      <div className="row">
        <label htmlFor="tpl-title">Title</label>
        <input
          id="tpl-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </div>
      <div className="row">
        <label htmlFor="tpl-id">Id</label>
        <input
          id="tpl-id"
          value={id}
          aria-invalid={!idOk}
          onChange={(e) => {
            setId(e.target.value);
          }}
        />
      </div>
      {!idOk && (
        <p className="warn" role="alert">
          The id must be lowercase words joined by hyphens, such as my-pathway.
        </p>
      )}
      <div className="row">
        <label htmlFor="tpl-desc">Description</label>
        <input
          id="tpl-desc"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </div>
      <div className="row">
        <label htmlFor="tpl-kind">Kind</label>
        <select
          id="tpl-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value === 'template' ? 'template' : 'example');
          }}
        >
          <option value="example">Example (a finished figure)</option>
          <option value="template">Template (an empty layout)</option>
        </select>
      </div>
      <label htmlFor="tpl-source">Source</label>
      <textarea id="tpl-source" readOnly rows={10} value={source} spellCheck={false} />
      {objects.length === 0 && <p className="warn">There is nothing on this page to save.</p>}
      <div className="actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          disabled={source === ''}
          onClick={() => {
            void navigator.clipboard.writeText(source).then(
              () => {
                setCopied(true);
              },
              () => undefined,
            );
            analytics.track('gallery', 'source');
          }}
        >
          {copied ? 'Copied' : 'Copy source'}
        </button>
        <button
          type="button"
          className="primary"
          disabled={source === ''}
          onClick={() => {
            download(source, templateFileName(id), 'text/plain');
            analytics.track('gallery', 'source');
          }}
        >
          Download .ts file
        </button>
      </div>
    </Dialog>
  );
}
