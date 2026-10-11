/**
 * The front page (note 57): what the app is, and where to start. It shows
 * instead of the editor while no figure is on screen. Laid out as BarelySig's
 * `Home`, on this app's tokens.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { BRAND } from '@/brand';
import { GALLERY, type GalleryEntry } from '@/gallery/gallery';

import { analytics } from './analytics';
import { galleryThumbnail } from './dialogs/galleryThumbnail';
import { RecentList } from './dialogs/RecentDialog';
import { Logo } from './Logo';
import { newFigure, openGallery } from './state/session';

const TEMPLATES = GALLERY.filter((e) => e.kind === 'template');
const EXAMPLE = GALLERY.find((e) => e.kind === 'example');

const PROMISES = [
  {
    title: 'Ready for the journal',
    text: 'PDF and SVG at exact size with the fonts embedded; TIFF and PNG at the dpi a journal asks for.',
  },
  {
    title: 'Your figures stay here',
    text: 'No account, no upload. Figures are kept in this browser; save a .jfig file any time.',
  },
  {
    title: 'Free, with credit built in',
    text: 'CC0 and CC BY icons, with the attribution written for you.',
  },
];

interface Props {
  /** Some tab holds work: the way back to it. */
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onOpenFile: () => void;
  readonly onGuide: () => void;
  readonly onTemplates: () => void;
  /** Header actions' keyboard hint for Open…. */
  readonly openTitle: string;
}

/** Thumbnails of the templates, built after the first paint (note 49). */
function useThumbs(entries: readonly GalleryEntry[]): ReadonlyMap<string, string> {
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    const run = () => {
      if (live) setThumbs(new Map(entries.map((e) => [e.id, galleryThumbnail(e)])));
    };
    const w = window as {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run);
      return () => {
        live = false;
        w.cancelIdleCallback?.(id);
      };
    }
    const id = setTimeout(run, 50);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [entries]);
  return thumbs;
}

export function Home({
  canGoBack,
  onBack,
  onOpenFile,
  onGuide,
  onTemplates,
  openTitle,
}: Props): ReactNode {
  const thumbs = useThumbs(TEMPLATES);
  const [kept, setKept] = useState(0);
  const top = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    analytics.track('home', 'show');
    // Focus lands on the page, not on a button, so nothing is pressed by accident;
    // it stays where it is when something else already has it.
    const a = document.activeElement;
    if (!a || a === document.body) top.current?.focus();
  }, []);

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="spacer" />
        <div className="bar-actions">
          {canGoBack && (
            <button
              type="button"
              onClick={() => {
                analytics.track('home', 'back');
                onBack();
              }}
            >
              Back to your figures
            </button>
          )}
          <button
            type="button"
            title={openTitle}
            onClick={() => {
              analytics.track('home', 'open');
              onOpenFile();
            }}
          >
            Open…
          </button>
          <button
            type="button"
            className="help-button"
            aria-label="Help"
            aria-haspopup="dialog"
            title="Open the guide (?)"
            onClick={onGuide}
          >
            ?
          </button>
        </div>
      </header>
      <main className="home">
        <section className="hero">
          <h1 className="hero-logo" ref={top} tabIndex={-1}>
            <Logo height={96} />
          </h1>
          <p className="hero-tag">Scientific figures in your browser. Free, private, offline.</p>
          <h2 className="hero-title">Figures for papers, posters and grants.</h2>
          <p className="hero-lead">
            Draw panels, drop in icons, label gels and plasmid maps, then export at the exact size a
            journal asks for. Nothing leaves your computer.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                analytics.track('home', 'new');
                newFigure();
              }}
            >
              New figure
            </button>
            <button
              type="button"
              className="outline"
              title={openTitle}
              onClick={() => {
                analytics.track('home', 'open');
                onOpenFile();
              }}
            >
              Open a figure…
            </button>
            {EXAMPLE && (
              <button
                type="button"
                className="outline"
                onClick={() => {
                  analytics.track('home', 'example');
                  openGallery(EXAMPLE);
                }}
              >
                Try an example
              </button>
            )}
          </div>
          <p className="hero-note">
            {BRAND.fileExt} figures open; SVG, PNG, TIFF and PDF files are imported. You can also
            drop a file anywhere on the window.
          </p>
        </section>

        <section className="recent-home" aria-labelledby="recent-title" hidden={kept === 0}>
          <h2 id="recent-title">Recent figures</h2>
          <RecentList
            emptyText={false}
            keepList
            onRows={(rows) => {
              setKept(rows.length);
            }}
            onOpened={() => {
              analytics.track('home', 'recent');
            }}
          />
        </section>

        <section className="start" aria-labelledby="start-title">
          <h2 id="start-title">Start from a template</h2>
          <ul className="home-types">
            {TEMPLATES.map((e) => (
              <li key={e.id} className="home-type">
                <span className="home-thumb" aria-hidden="true">
                  {thumbs.get(e.id) && <img src={thumbs.get(e.id)} alt="" />}
                </span>
                <button
                  type="button"
                  className="type-open"
                  onClick={() => {
                    analytics.track('home', 'template');
                    openGallery(e);
                  }}
                >
                  {e.title}
                </button>
                <span className="type-blurb">{e.description}</span>
              </li>
            ))}
          </ul>
          <p className="home-more">
            <button type="button" className="outline" onClick={onTemplates}>
              More templates and examples…
            </button>
          </p>
        </section>

        <ul className="promises">
          {PROMISES.map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>

        <footer className="landing-foot">
          {BRAND.name} {__APP_VERSION__} · MIT licence
        </footer>
      </main>
    </div>
  );
}
