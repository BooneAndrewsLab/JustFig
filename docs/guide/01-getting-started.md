# Getting started

JustFig is a free figure editor that runs entirely in your browser. There is no account and nothing is uploaded: your figures stay on your computer. It is made for the figures in a paper or a poster: panels, icons, arrows, labels, plates, gels and plasmid maps.

## The screen

- **Top bar:** the figure title, then the file buttons, undo and redo, zoom, and on the right Guide, Shortcuts…, Attribution and Export….
- **Tab strip:** under the top bar. **Recent…**, then one tab per open figure, then **+** for a new one (see [Several figures at once](17-several-figures.md)).
- **Left:** the Icons panel. At its top is the Scientific objects shelf (see [Scientific objects](08-objects.md)), below it the icon search and categories (see [Icons](07-icons.md)).
- **Tool palette:** a narrow column of tools next to the canvas (see [Drawing](02-drawing.md)).
- **Canvas:** your page, with rulers along the top and left edges in millimetres or inches. The Pages bar sits under it.
- **Right:** the Inspector, which shows the properties of whatever is selected, the Layers panel under it, and the Notes panel at the bottom (see [The Inspector](06-inspector.md), [Arranging](05-arranging.md) and [Review notes](16-review-notes.md)).
- **Status line:** at the bottom. It says how many objects are selected, whether the figure is "Saved to file" or "Kept in this browser", and shows short messages. A screen reader announces changes to it.

## The top-bar buttons

- **New** starts an empty figure in a new tab. The figures you had open stay open in their tabs.
- **Templates…** opens the Templates and examples dialog (see [Templates and examples](10-templates.md)).
- **Open…** opens a figure file (`.jfig`). Any other file you choose here, such as an SVG or a PNG, is imported onto the page instead.
- **Recent…**, at the start of the tab strip, opens the Recent figures dialog (shortcut `Shift+O`): every figure JustFig has kept in this browser, newest first, each with a small picture of its first page and the time it was last changed. **Open** brings one back, **Rename** changes its title, **Download .jfig** saves it as a file, and **Delete** removes it, with its saved versions, after asking "Delete this figure?" in a second dialog. **Open** on a figure that is already open brings its tab forward. Below the note it shows how much storage JustFig uses, when the browser can say. Figures open in a tab are marked "Open now" or "Open in a tab"; they can be renamed and downloaded but not deleted.
- **Versions…** opens the Saved versions dialog for the figure you have open (see Saved versions below).
- **Save** downloads the figure as a `.jfig` file named after the figure title.
- **Import…** places an SVG, PNG or JPEG on the page (see [Importing and other apps](11-import-and-other-apps.md)).
- **Undo** and **Redo** (the curved arrows) step through your changes. Their tooltips name the change. A drag, a nudge or a run of typing in one field counts as one step.
- **−**, the percentage and **+** change the zoom. The percentage button fits the whole page in the window.
- **Guide** opens this guide. **Shortcuts…** opens the dialog where keys are changed (see [the shortcuts page](13-keyboard-shortcuts.md)). **Attribution** opens the credit dialog and **Export…** the export dialog (see [Exporting](12-export.md)).

To zoom with the mouse, hold Ctrl (⌘ on a Mac) and turn the wheel. The wheel alone scrolls the page. To pan, use the Pan tool, hold Space, or drag with the middle mouse button.

## Your first figure

1. Choose **Templates…**, pick a layout such as "Four panels, two columns", or start from the empty page.
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

Undo only reaches back to when you opened the figure, and autosave keeps only its latest state. To keep the figure as it is at a moment that matters, such as "sent to PI" or "before revision", choose **Versions…** in the top bar. The Saved versions dialog names the figure as it is now: type a **Version name** (it starts as today's date) and choose **Save version**. The list below shows the figure's saved versions, newest first, each with:

- **Compare**, which opens the Compare versions dialog: the saved version and the figure as it is now side by side, page by page (**Previous page** and **Next page** when there are several), with how many pages and objects each has. **Restore this version** restores it from there.
- **Restore…**, which asks "Restore this version?" first. Restoring makes the figure what it was in that version, as a single change: **Undo** brings back what you had.
- **Rename** changes the name (Enter keeps it, Escape cancels), and **Delete** removes the version after asking "Delete this version?".

Saved versions are kept in this browser with the figure, like autosave, and are not in the `.jfig` file you save. A version keeps the figure's review notes as they were, and restoring it brings those back. A figure with saved versions is never dropped from Recent figures to make room; deleting the figure there deletes its versions too. A figure can have up to 30 saved versions and all figures 200 together; past that, or when they would take too much room, JustFig refuses to save another and asks you to delete some first.

## Working offline

After the first visit JustFig works without a connection. Your browser may offer to install it as an app; an installed JustFig can open `.jfig` files from your file manager. Icons you have not looked at before may need a connection the first time you use them.

## Units

Sizes in the Inspector and on the rulers are in millimetres or inches. Change them with **Units** in the Page section; JustFig remembers your choice in this browser. Line widths, font sizes and corner radii are always in points (1 pt is 1/72 inch).
