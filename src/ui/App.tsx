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
import { HistoryMenu } from './HistoryMenu';
import { Home } from './Home';
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
import { type ShortcutTargets, onCopy, onHomeKeyDown, onKeyDown, onPaste } from './shortcuts';
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
import { currentPage, figure, isUnsaved, isUntouched, selectedObjects, store } from './state/store';
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
    const targets: ShortcutTargets = {
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
    };
    // The front page has no figure on screen: only opening and the guide act (note 57).
    const key = (e: KeyboardEvent) => {
      if (store.getState().home) onHomeKeyDown(e, targets);
      else onKeyDown(e, targets);
    };
    const copy = (e: ClipboardEvent) => {
      if (!store.getState().home) onCopy(e, false);
    };
    const cut = (e: ClipboardEvent) => {
      if (!store.getState().home) onCopy(e, true);
    };
    const paste = (e: ClipboardEvent) => {
      if (!store.getState().home) onPaste(e, (f) => void importToCanvas(f));
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

  // A file dropped anywhere on the front page opens like Open… (note 57).
  const home = s.home;
  useEffect(() => {
    if (!home) return;
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      for (const f of Array.from(e.dataTransfer.files)) void openFile(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [home]);

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

  const dialogs = (
    <>
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
    </>
  );
  const fileInputs = (
    <>
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
    </>
  );

  if (s.home) {
    return (
      <div className="app app-landing">
        <Home
          canGoBack={s.tabs.some((t) => !isUntouched(t))}
          onBack={() => {
            store.leaveHome();
          }}
          onOpenFile={() => {
            chooseFile(() => openInput.current?.click());
          }}
          onGuide={() => {
            setDialog('guide');
          }}
          onTemplates={() => {
            setDialog('gallery');
          }}
          openTitle={withKey('Open a figure file', 'open', bound)}
        />
        <footer className="status" aria-live="polite">
          {s.notice && <span className={`notice-${s.notice.tone}`}>{s.notice.text}</span>}
        </footer>
        {fileInputs}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          title="Front page: your open figures stay open"
          aria-label={`${BRAND.name} front page`}
          onClick={() => {
            store.showHome();
          }}
        >
          <Logo />
        </button>
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
        <span className="spacer" />
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
        <HistoryMenu history={s.history} bound={bound} />
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
      {fileInputs}
      {dialogs}
    </div>
  );
}
