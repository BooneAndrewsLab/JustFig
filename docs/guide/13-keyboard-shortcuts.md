# Keyboard shortcuts

Every shortcut in JustFig is in this table. **Ctrl** means **⌘** on a Mac. Shortcuts do not fire while you type in a field or while a dialog is open.

| Action                                                                                 | Key                   | Notes                                                                     |
| -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Select tool                                                                            | `V`                   |                                                                           |
| Pan tool                                                                               | `H`                   | Or hold Space with any tool.                                              |
| Rectangle tool                                                                         | `R`                   |                                                                           |
| Ellipse tool                                                                           | `E`                   |                                                                           |
| Line tool                                                                              | `L`                   |                                                                           |
| Pen tool                                                                               | `P`                   |                                                                           |
| Arrow tool                                                                             | `A`                   |                                                                           |
| Text tool                                                                              | `T`                   |                                                                           |
| Panel tool                                                                             | `F`                   |                                                                           |
| Review note tool                                                                       | `N`                   |                                                                           |
| Select everything on the page                                                          | `Ctrl+A`              |                                                                           |
| Duplicate the selection                                                                | `Ctrl+D`              |                                                                           |
| Group the selection                                                                    | `Ctrl+G`              |                                                                           |
| Ungroup                                                                                | `Ctrl+Shift+G`        |                                                                           |
| Point editing: add a point after the current one                                       | `I`                   | See [Editing points](02-drawing.md#editing-points).                       |
| Point editing: make the current point smooth or a corner                               | `S`                   |                                                                           |
| Bring to front                                                                         | `]`                   |                                                                           |
| Bring forward                                                                          | `Shift+]`             | One step.                                                                 |
| Send to back                                                                           | `[`                   |                                                                           |
| Send backward                                                                          | `Shift+[`             | One step.                                                                 |
| Arrange the selection in a grid                                                        | `Shift+G`             | Opens Arrange in grid.                                                    |
| Open a figure file                                                                     | `Ctrl+O`              |                                                                           |
| Recent figures                                                                         | `Shift+O`             |                                                                           |
| Export                                                                                 | `Ctrl+E`              | Opens the Export figure dialog.                                           |
| Fit the page in the window                                                             | `Shift+1`             |                                                                           |
| Zoom in                                                                                | `Shift+=`             | The plus key.                                                             |
| Zoom out                                                                               | `−`                   | The minus key.                                                            |
| The user guide                                                                         | `Shift+/`             | The question mark key.                                                    |
| Show figure tab 1                                                                      | `Alt+1`               | Brings the first tab forward.                                             |
| Show figure tab 2                                                                      | `Alt+2`               |                                                                           |
| Show figure tab 3                                                                      | `Alt+3`               |                                                                           |
| Show figure tab 4                                                                      | `Alt+4`               |                                                                           |
| Show figure tab 5                                                                      | `Alt+5`               |                                                                           |
| Show figure tab 6                                                                      | `Alt+6`               |                                                                           |
| Show figure tab 7                                                                      | `Alt+7`               |                                                                           |
| Show figure tab 8                                                                      | `Alt+8`               |                                                                           |
| Show figure tab 9                                                                      | `Alt+9`               |                                                                           |
| Close the figure tab                                                                   | `Alt+W`               | The tab in front.                                                         |
| Move the figure tab left                                                               | `Alt+Shift+Page Up`   | The tab in front.                                                         |
| Move the figure tab right                                                              | `Alt+Shift+Page Down` | The tab in front.                                                         |
| Download the figure file                                                               | `Ctrl+S`              | Fixed.                                                                    |
| Undo (with Shift, redo; Ctrl+Y also redoes)                                            | `Ctrl+Z`              | Fixed.                                                                    |
| Redo                                                                                   | `Ctrl+Y`              | Fixed.                                                                    |
| Copy, cut (Ctrl+X) and paste (Ctrl+V)                                                  | `Ctrl+C`              | Fixed.                                                                    |
| Delete the selection (or Backspace)                                                    | `Delete`              | Fixed. In point editing, the current point.                               |
| Back to the Select tool, then select nothing; cancels a pen path, leaves point editing | `Escape`              | Fixed.                                                                    |
| Nudge the selection by 1 pt (with Shift, 10 pt)                                        | `→`                   | Fixed. All four arrow keys; in point editing they move the current point. |
| Finish a pen path, or edit the points of the selected path                             | `Enter`               | Fixed.                                                                    |
| Point editing: next point (with Shift, the previous one)                               | `Tab`                 | Fixed. Only while editing points, with the focus on the canvas.           |
| Text editor: bold (Ctrl+I italic)                                                      | `Ctrl+B`              | Fixed.                                                                    |
| Text editor: subscript (with Shift, superscript)                                       | `Ctrl+=`              | Fixed.                                                                    |

## Changing the keys

Choose **Shortcuts…** in the top bar to open the Keyboard shortcuts dialog. The actions are grouped as Tools, Edit, Points, Arrange, File, View, Tabs and Fixed keys.

1. Choose **Change** next to an action.
2. Press the keys you want. Escape leaves it as it was.
3. If the key is already used, belongs to the browser (such as Ctrl+T) or is kept for a fixed shortcut, a message says so and nothing changes.

A changed action shows **Default**, which puts it back. **All back to their defaults** resets everything. JustFig remembers your keys in this browser. Tooltips show the keys you have set.

A single letter such as R is a valid shortcut, because nothing on the canvas types. Shortcuts are tied to the physical key, so they stay in the same place on every keyboard layout.

## Fixed keys

The rows marked Fixed cannot be changed. They are the keys every program shares (save, undo, redo, copy, cut, paste, delete), ranges such as the arrow keys, and the keys inside the text editor. Ctrl+Shift+Z also redoes, and Backspace also deletes.

## Other keys

- **Space** held down pans the canvas.
- **F2** on a page tab renames the page, and the **← and →** keys move between pages.
- On the figure tab strip, **← and →**, **Home** and **End** move between figures and **Delete** closes the focused one (see [Several figures at once](17-several-figures.md)).
- **Enter** or double-click finishes a pen path, and clicking its first point closes it. On a selected path, line or arrow, Enter or double-click shows its points ([Editing points](02-drawing.md#editing-points)).
- **Shift** while dragging constrains a move, keeps proportions when resizing, makes rotation snap to 15° steps and snaps lines and arrows to 45°.
- **Ctrl+wheel** zooms at the pointer.

See [Using JustFig from the keyboard](14-accessibility.md) for working without a mouse.
