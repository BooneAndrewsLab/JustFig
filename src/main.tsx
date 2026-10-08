import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { loadFonts } from './core/text/fonts';
import { App } from './ui/App';
import { onLaunchFiles, registerServiceWorker } from './ui/pwa';
import { openFile, startSession } from './ui/state/session';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

registerServiceWorker();

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
  .catch((e: unknown) => {
    console.error(e);
  })
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    onLaunchFiles((file) => {
      void openFile(file);
    });
  });
