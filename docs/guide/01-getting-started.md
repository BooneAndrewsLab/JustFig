# Getting started

JustFig is a free figure editor that runs entirely in your browser. There is no account and nothing is uploaded: your figures stay on your computer. It is made for the figures in a paper or a poster: panels, icons, arrows, labels, plates, gels and plasmid maps.

## The screen

- **Top bar:** the logo and the figure title on the left; on the right the **File** menu and **Save**, Undo and Redo with the **History** list, zoom, **Export…** and the round **?** (Help) button.
- **Tab strip:** under the top bar. **Recent…**, then one tab per open figure, then **+** for a new one (see [Several figures at once](17-several-figures.md)).
- **Left:** the Icons panel. At its top is the Scientific objects shelf (see [Scientific objects](08-objects.md)), below it the icon search and categories (see [Icons](07-icons.md)).
- **Tool palette:** a narrow column of tools next to the canvas (see [Drawing](02-drawing.md)).
- **Canvas:** your page, with rulers along the top and left edges in millimetres or inches. The Pages bar sits under it.
- **Right:** the Inspector, which shows the properties of whatever is selected, the Layers panel under it, and the Notes panel at the bottom (see [The Inspector](06-inspector.md), [Arranging](05-arranging.md) and [Review notes](16-review-notes.md)).
- **Status line:** at the bottom. It says how many objects are selected, whether the figure is "Saved to file" or "Kept in this browser", and shows short messages. A screen reader announces changes to it.

## Light and dark

JustFig follows your system's light or dark setting; there is no switch in the app. Change it in your operating system or browser and JustFig follows at once. In dark mode only the editor around your figure turns dark: the page stays white, icon and template pictures sit on light tiles so their colours look as they will on paper, and exported figures are exactly the same in either mode.

## The top bar and the File menu

**File** opens a menu of everything you do with the figure as a file. Click it, or press Enter, Space or the down arrow on it, then move with the arrow keys, Home and End, and press Enter to choose; Escape closes the menu. Items with a shortcut show it at the right. **Save** and **Export…** are also buttons in the top bar, as they are used most.

- **New** starts an empty figure in a new tab. The figures you had open stay open in their tabs.
- **Templates…** opens the Templates and examples dialog (see [Templates and examples](10-templates.md)).
- **Open…** opens a figure file (`.jfig`). Any other file you choose here, such as an SVG or a PNG, is imported onto the page instead.
- **Recent…**, at the start of the tab strip, opens the Recent figures dialog (shortcut `Shift+O`): every figure JustFig has kept in this browser, newest first, each with a small picture of its first page and the time it was last changed. **Open** brings one back, **Rename** changes its title, **Download .jfig** saves it as a file, and **Delete** removes it, with its saved versions, after asking "Delete this figure?" in a second dialog. **Open** on a figure that is already open brings its tab forward. Below the note it shows how much storage JustFig uses, when the browser can say. Figures open in a tab are marked "Open now" or "Open in a tab"; they can be renamed and downloaded but not deleted.
- **Versions…** opens the Saved versions dialog for the figure you have open (see Saved versions below).
- **Save** (Ctrl+S) writes the figure to its `.jfig` file. In browsers that can write files (Chrome, Edge and other Chromium browsers) the first Save, or **Save as…** (Ctrl+Shift+S, which always asks), asks where to put the file; after that Save writes to the same file with no download. A figure opened with **Open…** saves back to the file it came from. JustFig remembers the file for the figure in this browser, shows its name in the window title and on the Save button's tooltip, and asks for permission again after a reload; if you refuse, or the file has been moved or deleted, it asks where to save instead. In other browsers (Firefox, Safari) there is no Save as… in the menu and Save downloads a new `.jfig` named after the figure title each time. Dropping a file onto the window opens it but does not link it for saving.
- **Import…** places an SVG, PNG or JPEG on the page (see [Importing and other apps](11-import-and-other-apps.md)).
- **Undo** and **Redo** step through your changes. Their tooltips name the change and the key. A drag, a nudge or a run of typing in one field counts as one step.
- **History** (the ▾ beside Redo) lists every change, newest first, numbered, down to **Opened figure**. The current state is in bold and undone changes are greyed. Choose any entry to undo back to it, or to redo up to it; choose **Opened figure** to undo everything.
- **−**, the percentage and **+** change the zoom. The percentage button fits the whole page in the window.
- **Export…** opens the export dialog and **Attribution…** the credit dialog (see [Exporting](12-export.md)). Both are in the File menu; Export… is also the blue button at the right of the top bar.
- **?** (Help), at the far right, opens this guide, as does the ? key. Its title line shows the JustFig version. The **Change shortcuts** page, after [the shortcuts page](13-keyboard-shortcuts.md), is where keys are changed.

To zoom with the mouse, hold Ctrl (⌘ on a Mac) and turn the wheel. The wheel alone scrolls the page. To pan, use the Pan tool, hold Space, or drag with the middle mouse button.

## Your first figure

1. Choose **File › Templates…**, pick a layout such as "Four panels, two columns", or start from the empty page.
2. Drag icons from the left panel onto the panels, or draw shapes with the tools.
3. Select text, arrows and shapes and adjust them in the Inspector.
4. Choose **Export…** and pick PDF for a journal, or PNG for slides.

A new figure is a single page of 183 mm width (the Nature two-column size). Change the size in the Inspector's Page section.

## Saving and autosave

JustFig keeps a copy of your figure in the browser as you work. This autosave happens about a second after your last change, and again when you switch to another tab. When you come back to JustFig on the same computer and browser, the figures you had open are there again, each in its tab.

**New**, **Templates…** and opening a file never lose the figure you were working on: it stays open in its tab, and autosave keeps every open figure, not only the one in front. Closing a tab writes its figure to the browser first, and it stays in Recent figures. JustFig keeps the 30 most recently changed figures, and drops the oldest when there are more or when they take more than about 150 MB. Autosave is still a safety net, not a filing system. It does not help if you clear the browser's site data, use a private window, or open JustFig on another computer. Use **Save** to get a `.jfig` file you can keep, email or open later. The status line shows "Saved to file" once you have done so, and "Kept in this browser" after you change the figure again.

**If a figure cannot be kept in the browser** (the browser's storage is full, or it refuses the write), a red "Not saved in this browser" banner appears above the tab strip and stays until a later save works. It names the figures that are not kept, with a **Download a copy** button for each (for more than three, the first three and a count). Choose it to save a `.jfig` file at once; JustFig keeps trying every few seconds, and the banner goes when a save succeeds. To make room, delete figures in **Recent…**, which also shows how much of the browser's allowance JustFig uses. After your first save JustFig asks the browser to keep its data even when the computer runs low on space; Recent figures says whether the browser agreed.

If a figure open in any tab has changes and has never been saved as a file, the browser asks for confirmation before you close the browser tab.

## Saved versions

Undo only reaches back to when you opened the figure, and autosave keeps only its latest state. To keep the figure as it is at a moment that matters, such as "sent to PI" or "before revision", choose **File › Versions…**. The Saved versions dialog names the figure as it is now: type a **Version name** (it starts as today's date) and choose **Save version**. The list below shows the figure's saved versions, newest first, each with:

- **Compare**, which opens the Compare versions dialog. Pick the **Older** and **Newer** figure from two menus, each a saved version or **Now (the open figure)**, and choose a **View**: **Side by side**, or **Onion skin**, which draws the older one faded over the newer. Pages are paired by their identity (**Previous page** and **Next page** when there are several). Objects that differ are outlined: changed in orange, added (only in the newer) in green, removed (only in the older) in dashed red. Below the pictures, the **Changed objects** list names each one, and pressing one makes its outline heavier. For an object the older or newer saved version has, **Restore this object from** that version puts it back in the open figure as one change (Undo brings back what you had): a changed object is replaced, a deleted one is added again, with any pictures or icons it needs. **Restore this version** restores the whole older version.
- **Restore…**, which asks "Restore this version?" first. Restoring makes the figure what it was in that version, as a single change: **Undo** brings back what you had.
- **Rename** changes the name (Enter keeps it, Escape cancels), and **Delete** removes the version after asking "Delete this version?".

Saved versions are kept in this browser with the figure, like autosave, and are not in the `.jfig` file you save. A version keeps the figure's review notes as they were, and restoring it brings those back. A figure with saved versions is never dropped from Recent figures to make room; deleting the figure there deletes its versions too. A figure can have up to 30 saved versions and all figures 200 together; past that, or when they would take too much room, JustFig refuses to save another and asks you to delete some first.

## Working offline

After the first visit JustFig works without a connection. Your browser may offer to install it as an app; an installed JustFig can open `.jfig` files from your file manager. Icons you have not looked at before may need a connection the first time you use them.

## Units

Sizes in the Inspector and on the rulers are in millimetres or inches. Change them with **Units** in the Page section; JustFig remembers your choice in this browser. Line widths, font sizes and corner radii are always in points (1 pt is 1/72 inch).

## If JustFig crashes

While JustFig starts, the page shows its logo and "Loading…"; the editor takes its place as soon as it is ready. If something goes wrong while drawing the editor, JustFig shows a "hit a problem" screen instead of a blank page, with the kind of error (never your figure's content). Keyboard focus moves to it. **Download a copy of** each open figure saves a `.jfig` file straight away; **Save and reload** writes your figures to the browser and restarts JustFig, which reopens your tabs. A smaller error shows a red message in the status line and you can carry on. If JustFig cannot start at all, a page with a **Reload** button appears; figures kept in the browser are not deleted.
