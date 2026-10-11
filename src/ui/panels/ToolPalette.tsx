import { resolveBindings, withKey } from '../keyBindings';
import { store } from '../state/store';
import { TOOLS } from './tools';
import { Icon } from '../icons';
import { useAppState } from '../state/useAppState';

export function ToolPalette() {
  const { tool, keyBindings } = useAppState();
  const bound = resolveBindings(keyBindings);
  return (
    <nav className="tools" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={withKey(t.label, `tool-${t.id}`, bound)}
          data-tool={t.id}
          onClick={() => {
            store.setTool(t.id);
          }}
        >
          <Icon name={t.id} />
        </button>
      ))}
    </nav>
  );
}
