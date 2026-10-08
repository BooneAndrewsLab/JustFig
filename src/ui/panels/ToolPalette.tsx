import { store } from '../state/store';
import { TOOLS } from './tools';
import { useAppState } from '../state/useAppState';

export function ToolPalette() {
  const { tool } = useAppState();
  return (
    <nav className="tools" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={`${t.label} (${t.key})`}
          data-tool={t.id}
          onClick={() => {
            store.setTool(t.id);
          }}
        >
          {t.glyph}
        </button>
      ))}
    </nav>
  );
}
