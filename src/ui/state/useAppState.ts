import { useSyncExternalStore } from 'react';

import { type AppState, store } from './store';

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
