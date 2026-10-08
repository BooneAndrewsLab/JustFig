import { addPage, deletePage, updatePage } from '@/core/edits/edits';
import { createPage } from '@/core/model/factory';

import { store } from '../state/store';
import { useAppState } from '../state/useAppState';

export function PagesBar() {
  const s = useAppState();
  const pages = s.history.present.doc.pages;
  const rename = (id: string, name: string) => {
    const next = prompt('Page name', name);
    if (next !== null && next.trim() !== '')
      store.edit(
        updatePage(id as typeof s.pageId, 'Rename page', (x) => ({ ...x, name: next.trim() })),
      );
  };
  const cur = pages.find((p) => p.id === s.pageId);
  return (
    <div className="pages-bar">
      <div role="tablist" aria-label="Pages" className="page-tabs">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={p.id === s.pageId}
            tabIndex={p.id === s.pageId ? 0 : -1}
            onClick={() => {
              store.setPage(p.id);
            }}
            onKeyDown={(e) => {
              // Arrow keys move between pages (the tabs pattern); F2 renames.
              const i = pages.indexOf(p);
              const to =
                e.key === 'ArrowRight'
                  ? pages[i + 1]
                  : e.key === 'ArrowLeft'
                    ? pages[i - 1]
                    : undefined;
              if (to) {
                e.preventDefault();
                e.stopPropagation();
                store.setPage(to.id);
                requestAnimationFrame(() => {
                  document.querySelector<HTMLElement>(`[data-page="${to.id}"]`)?.focus();
                });
              }
              if (e.key === 'F2') rename(p.id, p.name);
            }}
            onDoubleClick={() => {
              rename(p.id, p.name);
            }}
            data-page={p.id}
            title="Double-click or F2 to rename"
          >
            {p.name}
          </button>
        ))}
      </div>
      {cur && (
        <button
          type="button"
          aria-label={`Rename ${cur.name}`}
          title="Rename this page"
          onClick={() => {
            rename(cur.id, cur.name);
          }}
        >
          Rename
        </button>
      )}
      <button
        type="button"
        title="Add page"
        aria-label="Add page"
        onClick={() => {
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
