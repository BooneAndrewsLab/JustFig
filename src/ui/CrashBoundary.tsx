/**
 * Crash recovery (note 26): one render error must not blank the app and lose
 * the open figures. The boundary replaces the editor with a recovery screen
 * that downloads every open tab as `.jfig` (the store lives outside React and
 * still holds them), or flushes the autosaver and reloads.
 */
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';

import { BRAND } from '@/brand';

import { analytics, errorKind } from './analytics';
import { downloadCopy, flushCurrent } from './state/session';
import { figure, store } from './state/store';

export interface OpenFigure {
  readonly id: string;
  readonly title: string;
}

export interface RecoveryOps {
  figures(): OpenFigure[];
  download(id: string): void;
  /** Flushes the autosaver, then reloads. */
  saveAndReload(): Promise<void>;
}

const liveOps: RecoveryOps = {
  figures: () =>
    store.getState().tabs.map((t) => ({ id: figure(t).doc.id, title: figure(t).doc.title })),
  download: downloadCopy,
  saveAndReload: async () => {
    try {
      await flushCurrent();
    } finally {
      window.location.reload();
    }
  },
};

export function RecoveryScreen({
  error,
  ops = liveOps,
}: {
  error: unknown;
  ops?: RecoveryOps | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  let figures: OpenFigure[] = [];
  try {
    figures = ops.figures();
  } catch {
    // The store itself may be what broke; the buttons that remain still work.
  }
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const kind = errorKind(error);
  return (
    <div
      className="crash"
      role="alertdialog"
      aria-labelledby="crash-title"
      aria-describedby="crash-body"
      ref={ref}
      tabIndex={-1}
    >
      <h1 id="crash-title">{BRAND.name} hit a problem</h1>
      <p id="crash-body">
        Something went wrong while drawing the editor ({kind}). Your figures are not lost: copies
        are kept in this browser, and you can download each one now.
      </p>
      {figures.length > 0 && (
        <ul>
          {figures.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => {
                  try {
                    ops.download(f.id);
                    setProblem(null);
                  } catch {
                    setProblem(`Could not download ${f.title || 'Untitled'}.`);
                  }
                }}
              >
                Download a copy of {f.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="status">{problem}</p>}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void ops.saveAndReload();
        }}
      >
        Save and reload
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
  ops?: RecoveryOps | undefined;
}

export class CrashBoundary extends Component<Props, { error: unknown; failed: boolean }> {
  override state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
    analytics.track('crash', 'render', errorKind(error));
  }

  override render(): ReactNode {
    if (this.state.failed) return <RecoveryScreen error={this.state.error} ops={this.props.ops} />;
    return this.props.children;
  }
}

/** Test hook (note 26): throws while `window.__justfigCrash` is set; inert otherwise. */
export function CrashProbe() {
  const flag = (window as unknown as { __justfigCrash?: string }).__justfigCrash;
  if (flag) throw new TypeError('injected crash');
  return null;
}
