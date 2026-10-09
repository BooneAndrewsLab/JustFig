import { useEffect, useRef, useState } from 'react';

import { BRAND } from '@/brand';
import { updateDoc } from '@/core/edits/edits';

import { analytics } from './analytics';
import { Canvas } from './canvas/Canvas';
import { canvasSize, fitPage, zoomAt } from './canvas/view';
import { AttributionDialog } from './dialogs/AttributionDialog';
import { CreditsDialog } from './dialogs/CreditsDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { GalleryDialog } from './dialogs/GalleryDialog';
import { ChannelsDialog } from './dialogs/ChannelsDialog';
import { CropDialog } from './dialogs/CropDialog';
import { GridDialog } from './dialogs/GridDialog';
import { GuideDialog } from './dialogs/GuideDialog';
import { RecentDialog } from './dialogs/RecentDialog';
import { SaveTemplateDialog } from './dialogs/SaveTemplateDialog';
import { SavePresetDialog } from './dialogs/SavePresetDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { KeyBindingsDialog } from './dialogs/KeyBindingsDialog';
import { PdfPageDialog } from './dialogs/PdfPageDialog';
import { IconBrowser } from './panels/IconBrowser';
import { Inspector } from './panels/Inspector';
import { LayersPanel } from './panels/LayersPanel';
import { ToolPalette } from './panels/ToolPalette';
import { resolveBindings, withKey } from './keyBindings';
import { onCopy, onKeyDown, onPaste } from './shortcuts';
import { importToCanvas, newFigure, openFile, saveFile } from './state/session';
import { currentPage, figure, selectedObjects, store } from './state/store';
import { useAppState } from './state/useAppState';
import { usePdfPageRequest } from './state/pdfPagePicker';

type DialogId =
  | 'recent'
  | 'export'
  | 'attribution'
  | 'credits'
  | 'gallery'
  | 'keys'
  | 'guide'
  | 'grid'
  | 'crop'
  | 'channels'
  | 'save-preset'
  | 'save-template'
  | 'versions'
  | null;

/** The one selected object's name, for the status line a screen reader announces. */
function selectionName(s: ReturnType<typeof useAppState>): string {
  const [one] = selectedObjects(s);
  return s.selection.length === 1 && one ? `: ${one.name ?? one.type}` : '';
}

/** A name to start from: the one selected object's name, else a generic one. */
function presetName(s: ReturnType<typeof useAppState>): string {
  const [one] = selectedObjects(s);
  return s.selection.length === 1 && one?.name ? one.name : 'My preset';
}

export function App() {
  const s = useAppState();
  const fig = figure(s);
  const [dialog, setDialog] = useState<DialogId>(null);
  const pdfPage = usePdfPageRequest();
  const openInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    analytics.start(__APP_VERSION__);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      onKeyDown(e, {
        exportDialog: () => {
          setDialog('export');
        },
        openFile: () => openInput.current?.click(),
        recent: () => {
          setDialog('recent');
        },
        guide: () => {
          setDialog('guide');
        },
        grid: () => {
          setDialog('grid');
        },
      });
    };
    const copy = (e: ClipboardEvent) => {
      onCopy(e, false);
    };
    const cut = (e: ClipboardEvent) => {
      onCopy(e, true);
    };
    const paste = (e: ClipboardEvent) => {
      onPaste(e, (f) => void importToCanvas(f));
    };
    window.addEventListener('keydown', key);
    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', paste);
    };
  }, []);

  const unsaved = s.downloaded !== fig && s.history.canUndo;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      // Autosave keeps a copy; the prompt only guards a figure never saved as a file.
      if (unsaved && s.downloaded === null) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved, s.downloaded]);

  const bound = resolveBindings(s.keyBindings);
  const undo = store.undoLabel();
  const redo = store.redoLabel();
  const zoomBy = (k: number) => {
    const { w, h } = canvasSize();
    zoomAt(s.view, w / 2, h / 2, s.view.zoom * k);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{BRAND.name}</span>
        <input
          className="title"
          aria-label="Figure title"
          value={fig.doc.title}
          onChange={(e) => {
            const title = e.target.value;
            store.edit(
              updateDoc('Rename figure', (d) => ({ ...d, title })),
              { coalesce: 'title' },
            );
          }}
        />
        <div className="toolbar-group">
          <button
            type="button"
            title="Start a new figure (the current one stays in Recent figures)"
            onClick={newFigure}
          >
            New
          </button>
          <button
            type="button"
            title="Start from a template or an example"
            onClick={() => {
              setDialog('gallery');
            }}
          >
            Templates…
          </button>
          <button
            type="button"
            title={withKey('Open a figure file', 'open', bound)}
            onClick={() => openInput.current?.click()}
          >
            Open…
          </button>
          <button
            type="button"
            title={withKey('Reopen a figure kept in this browser', 'recent', bound)}
            onClick={() => {
              setDialog('recent');
            }}
          >
            Recent…
          </button>
          <button
            type="button"
            title="Save a named version of this figure, or compare and restore one"
            onClick={() => {
              setDialog('versions');
            }}
          >
            Versions…
          </button>
          <button
            type="button"
            title={withKey('Download the figure file', 'save', bound)}
            onClick={saveFile}
          >
            Save
          </button>
          <button
            type="button"
            title="Import an SVG, PNG or JPEG (a BarelySig SVG keeps its graph data)"
            onClick={() => importInput.current?.click()}
          >
            Import…
          </button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="icon"
            disabled={!undo}
            title={undo ?? 'Nothing to undo'}
            aria-label={undo ?? 'Undo'}
            onClick={() => {
              store.undo();
            }}
          >
            ↶
          </button>
          <button
            type="button"
            className="icon"
            disabled={!redo}
            title={redo ?? 'Nothing to redo'}
            aria-label={redo ?? 'Redo'}
            onClick={() => {
              store.redo();
            }}
          >
            ↷
          </button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="icon"
            aria-label="Zoom out"
            onClick={() => {
              zoomBy(1 / 1.25);
            }}
          >
            −
          </button>
          <button
            type="button"
            style={{ minWidth: 56 }}
            title="Fit page"
            onClick={() => {
              fitPage(currentPage(s), canvasSize());
            }}
          >
            {String(Math.round((s.view.zoom * 100 * 96) / 72))}%
          </button>
          <button
            type="button"
            className="icon"
            aria-label="Zoom in"
            onClick={() => {
              zoomBy(1.25);
            }}
          >
            +
          </button>
        </div>
        <span className="spacer" />
        <button
          type="button"
          title={withKey('The user guide', 'guide', bound)}
          onClick={() => {
            setDialog('guide');
          }}
        >
          Guide
        </button>
        <button
          type="button"
          onClick={() => {
            setDialog('keys');
          }}
        >
          Shortcuts…
        </button>
        <button
          type="button"
          onClick={() => {
            setDialog('attribution');
            analytics.trackOnce('attribution', 'open');
          }}
        >
          Attribution
        </button>
        <button
          type="button"
          className="primary"
          title={withKey('Export', 'export', bound)}
          onClick={() => {
            setDialog('export');
          }}
        >
          Export…
        </button>
        <input
          ref={openInput}
          type="file"
          hidden
          data-testid="open-input"
          accept={`${BRAND.fileExt},${BRAND.mime}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={importInput}
          type="file"
          hidden
          data-testid="import-input"
          accept=".svg,.pdf,.png,.jpg,.jpeg,image/svg+xml,application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importToCanvas(f);
            e.target.value = '';
          }}
        />
      </header>
      <IconBrowser
        onCredits={() => {
          setDialog('credits');
        }}
      />
      <ToolPalette />
      <Canvas />
      <aside className="side" aria-label="Inspector">
        <Inspector
          onArrangeGrid={() => {
            setDialog('grid');
          }}
          onCrop={() => {
            setDialog('crop');
          }}
          onChannels={() => {
            setDialog('channels');
          }}
          onSavePreset={() => {
            setDialog('save-preset');
          }}
        />
        <LayersPanel />
      </aside>
      <footer className="status" aria-live="polite">
        <span>
          {s.selection.length > 0
            ? `${String(s.selection.length)} selected${selectionName(s)}`
            : 'Nothing selected'}
        </span>
        <span>{s.downloaded === fig ? 'Saved to file' : 'Kept in this browser'}</span>
        {s.notice && <span className={`notice-${s.notice.tone}`}>{s.notice.text}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        <span>v{__APP_VERSION__}</span>
      </footer>
      {dialog === 'export' && (
        <ExportDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'attribution' && (
        <AttributionDialog
          onClose={() => {
            setDialog(null);
          }}
          onCredits={() => {
            setDialog('credits');
          }}
        />
      )}
      {dialog === 'recent' && (
        <RecentDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'versions' && (
        <VersionsDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'gallery' && (
        <GalleryDialog
          onSaveTemplate={() => {
            setDialog('save-template');
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'save-template' && (
        <SaveTemplateDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'save-preset' && (
        <SavePresetDialog
          suggested={presetName(s)}
          count={s.selection.length}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'guide' && (
        <GuideDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'grid' && (
        <GridDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'channels' && (
        <ChannelsDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'crop' && (
        <CropDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'keys' && (
        <KeyBindingsDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {pdfPage && <PdfPageDialog key={pdfPage.fileName} request={pdfPage} />}
      {dialog === 'credits' && (
        <CreditsDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
