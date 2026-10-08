import { addPage, deletePage, updatePage } from '@/core/edits/edits';
import { createPage } from '@/core/model/factory';

import { store } from '../state/store';
import { useAppState } from '../state/useAppState';

export function PagesBar() {
  const s = useAppState();
  const pages = s.history.present.doc.pages;
  return (
    <div className="pages-bar" role="tablist" aria-label="Pages">
      {pages.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={p.id === s.pageId}
          aria-pressed={p.id === s.pageId}
          onClick={() => {
            store.setPage(p.id);
          }}
          onDoubleClick={() => {
            const name = prompt('Page name', p.name);
            if (name !== null && name.trim() !== '')
              store.edit(updatePage(p.id, 'Rename page', (x) => ({ ...x, name: name.trim() })));
          }}
          title="Double-click to rename"
        >
          {p.name}
        </button>
      ))}
      <button
        type="button"
        title="Add page"
        aria-label="Add page"
        onClick={() => {
          const cur = pages.find((p) => p.id === s.pageId);
          const page = {
            ...createPage(`Page ${String(pages.length + 1)}`),
            ...(cur ? { size: cur.size } : {}),
          };
          if (store.edit(addPage(page))) store.setPage(page.id);
        }}
      >
        +
      </button>
      {pages.length > 1 && (
        <button
          type="button"
          title="Delete this page"
          onClick={() => {
            if (confirm('Delete this page and everything on it? (Undo brings it back.)'))
              store.edit(deletePage(s.pageId));
          }}
        >
          Delete page
        </button>
      )}
    </div>
  );
}
