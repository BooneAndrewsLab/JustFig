/** Global error handlers (note 26): an uncaught error or rejected promise shows a status message. */
import { analytics, errorKind } from './analytics';
import { store } from './state/store';

export function installCrashHandlers(): void {
  window.addEventListener('error', (e) => {
    store.notify(
      'Something went wrong. Your figure is kept in this browser; download a copy if you are unsure.',
      'error',
    );
    analytics.track('crash', 'error', errorKind(e.error));
  });
  window.addEventListener('unhandledrejection', (e) => {
    store.notify('An action failed. Your figure is kept in this browser.', 'error');
    analytics.track('crash', 'rejection', errorKind(e.reason));
  });
}
