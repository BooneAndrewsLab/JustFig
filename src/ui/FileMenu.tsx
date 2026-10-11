import type { ReactNode } from 'react';
import { formatBinding } from './keyBindings';
import { useMenu } from './useMenu';

interface ItemProps {
  readonly children: ReactNode;
  /** The item's current key binding, shown at its right. */
  readonly shortcut?: string | undefined;
  readonly title?: string;
  readonly onClick: () => void;
}

function Item({ children, shortcut, title, onClick }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className="menu__item"
      title={title}
      onClick={onClick}
    >
      <span>{children}</span>
      {/* Out of the accessible name, so the item is named by its words alone. */}
      {shortcut !== undefined && (
        <span className="menu__shortcut" aria-hidden="true">
          {shortcut}
        </span>
      )}
    </button>
  );
}

interface Props {
  /** The resolved key bindings, for the shortcuts shown beside the items. */
  readonly bound: ReadonlyMap<string, string>;
  /** The browser can write files in place, so Save as… is offered. */
  readonly inPlace: boolean;
  /** Save's tooltip, which names the file it writes to. */
  readonly saveTitle: string;
  readonly onNew: () => void;
  readonly onTemplates: () => void;
  readonly onOpen: () => void;
  readonly onImport: () => void;
  readonly onSave: () => void;
  readonly onSaveAs: () => void;
  readonly onVersions: () => void;
  readonly onExport: () => void;
  readonly onAttribution: () => void;
}

/**
 * The figure's file-level actions behind one "File" button in the top bar
 * (note 55, after PlasmidPop's File menu). Save and Export… also stay in the
 * bar as buttons; everything else lives only here.
 */
export function FileMenu(p: Props) {
  const { open, toggle, close, ref, trigger, list, onTriggerKeyDown, onListKeyDown } = useMenu();

  const keyOf = (id: string): string | undefined => {
    const b = p.bound.get(id);
    return b === undefined ? undefined : formatBinding(b);
  };
  /** Closes the menu, then runs the item's action. */
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div className="menu" ref={ref}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'file-menu' : undefined}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        File <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          ref={list}
          id="file-menu"
          className="menu__list"
          role="menu"
          aria-label="File"
          onKeyDown={onListKeyDown}
        >
          <Item title="Start a new figure in a tab of its own" onClick={run(p.onNew)}>
            New
          </Item>
          <Item title="Start from a template or an example" onClick={run(p.onTemplates)}>
            Templates…
          </Item>
          <Item shortcut={keyOf('open')} title="Open a figure file" onClick={run(p.onOpen)}>
            Open…
          </Item>
          <Item
            title="Import an SVG, PNG or JPEG (a BarelySig SVG keeps its graph data)"
            onClick={run(p.onImport)}
          >
            Import…
          </Item>
          <div className="menu__separator" role="separator" />
          <Item shortcut={keyOf('save')} title={p.saveTitle} onClick={run(p.onSave)}>
            Save
          </Item>
          {p.inPlace && (
            <Item
              shortcut={keyOf('save-as')}
              title="Save the figure to a new file"
              onClick={run(p.onSaveAs)}
            >
              Save as…
            </Item>
          )}
          <Item
            title="Save a named version of this figure, or compare and restore one"
            onClick={run(p.onVersions)}
          >
            Versions…
          </Item>
          <div className="menu__separator" role="separator" />
          <Item shortcut={keyOf('export')} onClick={run(p.onExport)}>
            Export…
          </Item>
          <Item
            title="Credits and licences of the icons in this figure"
            onClick={run(p.onAttribution)}
          >
            Attribution…
          </Item>
        </div>
      )}
    </div>
  );
}
