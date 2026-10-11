/**
 * Change shortcuts (note 09), ported from PlasmidPop's KeyBindings: one
 * row per action, from the same table the handlers and tooltips read, so
 * what is listed is what the app answers. **Change** waits for a key and
 * takes it if it may; fixed keys say so. It is a page of the guide (note 52).
 */
import { useEffect, useState } from 'react';

import { analytics } from './analytics';
import {
  type KeyAction,
  KEY_ACTIONS,
  bindingOf,
  bindingProblem,
  formatBinding,
  resolveBindings,
} from './keyBindings';
import { store } from './state/store';
import { useAppState } from './state/useAppState';

const groupsOf = (actions: readonly KeyAction[]): string[] => [
  ...new Set(actions.map((a) => a.group)),
];

export function KeyBindings() {
  const { keyBindings } = useAppState();
  const bound = resolveBindings(keyBindings);
  const [listening, setListening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (listening === null) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListening(null);
        setProblem(null);
        return;
      }
      // A modifier on its own is the user still reaching for the key.
      if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;
      const binding = bindingOf(e);
      const wrong = bindingProblem(
        binding,
        listening,
        resolveBindings(store.getState().keyBindings),
      );
      if (wrong !== null) {
        setProblem(wrong);
        return;
      }
      store.setKeyBinding(listening, binding);
      analytics.trackOnce('keys', 'change');
      setListening(null);
      setProblem(null);
    };
    // Capture, so the guide's Escape and the app's shortcuts never see the key.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [listening]);

  const changed = Object.keys(keyBindings).length > 0;
  return (
    <section className="keybindings-page" aria-labelledby="keybindings-title">
      <h2 id="keybindings-title">Change shortcuts</h2>
      <p className="note">
        Click <strong>Change</strong> and press the keys you want. Escape leaves it as it was. Your
        keys are remembered in this browser. Ctrl means ⌘ on a Mac.
      </p>
      <div className="keybindings">
        {groupsOf(KEY_ACTIONS).map((group) => (
          <section key={group}>
            <h3>{group === 'Fixed' ? 'Fixed keys' : group}</h3>
            <ul aria-label={`${group} shortcuts`}>
              {KEY_ACTIONS.filter((a) => a.group === group).map((action) => {
                const binding = bound.get(action.id);
                const waiting = listening === action.id;
                return (
                  <li key={action.id} className="keybindings-row" data-action={action.id}>
                    <span className="keybindings-label">
                      {action.label}
                      {action.note === undefined ? '' : ` — ${action.note}`}
                    </span>
                    <kbd aria-live={waiting ? 'polite' : undefined}>
                      {waiting
                        ? 'Press a key…'
                        : binding === undefined
                          ? 'unbound'
                          : formatBinding(binding)}
                    </kbd>
                    {action.fixed === true ? (
                      <span className="keybindings-fixed">fixed</span>
                    ) : (
                      <span className="keybindings-buttons">
                        <button
                          type="button"
                          aria-label={`Change the key for ${action.label}`}
                          onClick={() => {
                            setProblem(null);
                            setListening(waiting ? null : action.id);
                          }}
                        >
                          {waiting ? 'Cancel' : 'Change'}
                        </button>
                        {keyBindings[action.id] !== undefined && (
                          <button
                            type="button"
                            aria-label={`Put ${action.label} back on ${formatBinding(action.defaultBinding)}`}
                            onClick={() => {
                              store.setKeyBinding(action.id, null);
                            }}
                          >
                            Default
                          </button>
                        )}
                      </span>
                    )}
                    {/* In the row, so it shows where the guide page is scrolled to. */}
                    {waiting && problem !== null && (
                      <p className="note warn keybindings-problem" role="alert">
                        {problem}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p>
        <button
          type="button"
          disabled={!changed}
          onClick={() => {
            store.resetKeyBindings();
            analytics.trackOnce('keys', 'reset');
            setListening(null);
            setProblem(null);
          }}
        >
          All back to their defaults
        </button>
      </p>
    </section>
  );
}
