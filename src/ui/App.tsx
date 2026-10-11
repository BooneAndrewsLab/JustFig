import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { BRAND } from '@/brand';
import { updateDoc } from '@/core/edits/edits';

import { analytics } from './analytics';
import { Canvas } from './canvas/Canvas';
import { CrashProbe } from './CrashBoundary';
import { canvasSize, fitPage, zoomAt } from './canvas/view';
import { AttributionDialog } from './dialogs/AttributionDialog';
import { CreditsDialog } from './dialogs/CreditsDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { Icon } from './icons';
import { FileMenu } from './FileMenu';
import { Logo } from './Logo';
import { GalleryDialog } from './dialogs/GalleryDialog';
import { ChannelsDialog } from './dialogs/ChannelsDialog';
import { CropDialog } from './dialogs/CropDialog';
import { InsetDialog } from './dialogs/InsetDialog';
import { GridDialog } from './dialogs/GridDialog';
import { GuideDialog } from './dialogs/GuideDialog';
import { RecentDialog } from './dialogs/RecentDialog';
import { SaveTemplateDialog } from './dialogs/SaveTemplateDialog';
import { SavePresetDialog } from './dialogs/SavePresetDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { PdfPageDialog } from './dialogs/PdfPageDialog';
import { IconBrowser } from './panels/IconBrowser';
import { Inspector } from './panels/Inspector';
import { LayersPanel } from './panels/LayersPanel';
import { NotesPanel } from './panels/NotesPanel';
import { SaveFailureBanner } from './panels/SaveFailureBanner';
import { TabStrip } from './panels/TabStrip';
import { ToolPalette } from './panels/ToolPalette';
import { startInsetBaker } from './insetBaker';
import { resolveBindings, withKey } from './keyBindings';
import { onCopy, onKeyDown, onPaste } from './shortcuts';
import { canSaveInPlace } from '@/io/fileHandles';

import {
  chooseFile,
  fileNames,
  importToCanvas,
  newFigure,
  openFile,
  saveFile,
  saveFileAs,
} from './state/session';
import { currentPage, figure, isUnsaved, selectedObjects, store } from './state/store';
import { useAppState } from './state/useAppState';
import { onChannelsRequest } from './state/channelsRequest';
import { usePdfPageRequest } from './state/pdfPagePicker';

type DialogId =
  | 'recent'
  | 'export'
  | 'attribution'
  | 'credits'
  | 'gallery'
  | 'guide'
  | 'grid'
  | 'crop'
  | 'inset'
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
  const inPlace = canSaveInPlace(window as never);
  useSyncExternalStore(fileNames.subscribe, () => fileNames.version);
  const savedAs = fileNames.get(fig.doc.id);
  useEffect(() => {
    document.title = savedAs ? `${savedAs} · ${BRAND.name}` : BRAND.name;
  }, [savedAs]);
  const [dialog, setDialog] = useState<DialogId>(null);
  const pdfPage = usePdfPageRequest();
  const openInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    analytics.start(__APP_VERSION__);
  }, []);

  // A TIFF stack was imported (note 43): its channels are selected, merge them.
  useEffect(
    () =>
      onChannelsRequest(() => {
        setDialog('channels');
      }),
    [],
  );

  // Insets re-cropped by dragging their box get their pixels re-baked (note 44).
  useEffect(() => startInsetBaker(), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      onKeyDown(e, {
        exportDialog: () => {
          setDialog('export');
        },
        openFile: () => {
          chooseFile(() => openInput.current?.click());
        },
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

  // Autosave keeps a copy; the prompt only guards a figure, in any tab, never saved as a file.
  const neverSaved = s.tabs.some((t) => isUnsaved(t) && t.downloaded === null);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (neverSaved) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [neverSaved]);

  const bound = resolveBindings(s.keyBindings);
  const undo = store.undoLabel();
  const redo = store.redoLabel();
  const saveTitle = inPlace
    ? savedAs
      ? `Save to ${savedAs}`
      : 'Save the figure file (asks where the first time)'
    : 'Download the figure file';
  const openAttribution = () => {
    setDialog('attribution');
    analytics.trackOnce('attribution', 'open');
  };
  const zoomBy = (k: number) => {
    const { w, h } = canvasSize();
    zoomAt(s.view, w / 2, h / 2, s.view.zoom * k);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <Logo />
        </span>
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
          <FileMenu
            bound={bound}
            inPlace={inPlace}
            saveTitle={saveTitle}
            onNew={newFigure}
            onTemplates={() => {
              setDialog('gallery');
            }}
            onOpen={() => {
              chooseFile(() => openInput.current?.click());
            }}
            onImport={() => importInput.current?.click()}
            onSave={() => void saveFile()}
            onSaveAs={() => void saveFileAs()}
            onVersions={() => {
              setDialog('versions');
            }}
            onExport={() => {
              setDialog('export');
            }}
            onAttribution={openAttribution}
          />
          <button
            type="button"
            title={withKey(saveTitle, 'save', bound)}
            onClick={() => void saveFile()}
          >
            Save
          </button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            disabled={!undo}
            title={withKey(undo ?? 'Nothing to undo', 'undo', bound)}
            onClick={() => {
              store.undo();
            }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!redo}
            title={withKey(redo ?? 'Nothing to redo', 'redo', bound)}
            onClick={() => {
              store.redo();
            }}
          >
            Redo
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
            <Icon name="zoom-out" />
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
            <Icon name="zoom-in" />
          </button>
        </div>
        <span className="spacer" />
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
        <button
          type="button"
          className="help-button"
          aria-label="Help"
          aria-haspopup="dialog"
          aria-expanded={dialog === 'guide'}
          title="Open the guide (?)"
          onClick={() => {
            setDialog('guide');
          }}
        >
          ?
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
          accept=".svg,.pdf,.png,.jpg,.jpeg,.tif,.tiff,image/svg+xml,application/pdf,image/png,image/jpeg,image/tiff"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importToCanvas(f);
            e.target.value = '';
          }}
        />
      </header>
      <SaveFailureBanner />
      <TabStrip
        onRecent={() => {
          setDialog('recent');
        }}
      />
      <IconBrowser
        onCredits={() => {
          setDialog('credits');
        }}
      />
      <ToolPalette />
      <CrashProbe />
      <Canvas key={s.front} />
      <aside className="side" aria-label="Inspector">
        <Inspector
          onArrangeGrid={() => {
            setDialog('grid');
          }}
          onCrop={() => {
            setDialog('crop');
          }}
          onInset={() => {
            setDialog('inset');
          }}
          onChannels={() => {
            setDialog('channels');
          }}
          onSavePreset={() => {
            setDialog('save-preset');
          }}
        />
        <LayersPanel />
        <NotesPanel />
      </aside>
      <footer className="status" aria-live="polite">
        <span>
          {s.selection.length > 0
            ? `${String(s.selection.length)} selected${selectionName(s)}`
            : 'Nothing selected'}
        </span>
        <span>{s.downloaded === fig ? 'Saved to file' : 'Kept in this browser'}</span>
        {s.notice && <span className={`notice-${s.notice.tone}`}>{s.notice.text}</span>}
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
      {dialog === 'inset' && (
        <InsetDialog
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
