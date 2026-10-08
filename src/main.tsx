import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { registerServiceWorker } from './ui/pwa';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

registerServiceWorker();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
