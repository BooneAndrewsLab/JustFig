import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { loadFonts } from './core/text/fonts';
import { App } from './ui/App';
import { CrashBoundary } from './ui/CrashBoundary';
import { installCrashHandlers } from './ui/crashHandlers';
import { showStartFailure } from './ui/startFailure';
import { onLaunchFiles, registerServiceWorker } from './ui/pwa';
import { openFile, startSession } from './ui/state/session';
import './ui/theme-base.css';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

registerServiceWorker();
installCrashHandlers();

/** Text layout reads the font files themselves (note 03), so they load before the first render. */
async function start(): Promise<void> {
  await loadFonts(async (file) => {
    const r = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
    if (!r.ok) throw new Error(`font ${file}: ${String(r.status)}`);
    return r.arrayBuffer();
  });
  await startSession();
}

void start()
  .then(
    () => true,
    (e: unknown) => {
      showStartFailure(root, e);
      return false;
    },
  )
  .then((ok) => {
    if (!ok) return;
    createRoot(root).render(
      <StrictMode>
        <CrashBoundary>
          <App />
        </CrashBoundary>
      </StrictMode>,
    );
    onLaunchFiles((file) => {
      void openFile(file);
    });
  });
