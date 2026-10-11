# Several figures at once

Each figure you open gets a tab in the strip under the top bar, so you can work on a main figure and its supplement side by side and carry a panel from one to the other.

## The tab strip

- **Recent…** at the start of the strip opens the Recent figures dialog.
- One tab per open figure, named by its title. A dot after the name means the figure has changed since you last saved it to a file. The **×** closes the tab.
- **+** at the end starts a new, empty figure in a tab of its own, like **New** in the File menu.

Click a tab to bring its figure forward. Each tab keeps its own undo history, selection, page and zoom: undo in one figure never touches another, and a tab comes back exactly where you left it. The tool, units and other settings are shared.

## Opening figures in tabs

**New**, **Templates…**, **Open…** and **Open** in Recent figures each put the figure in a new tab, at the end of the strip. Two things are different:

- **A figure that is already open is not opened twice.** Its tab comes forward instead. If you open a `.jfig` file of a figure that is open and the file differs from the tab, the tab takes the file's content as one change, so **Undo** brings back what you had.
- **An empty New tab you have not touched is reused.** Opening a figure from it replaces it rather than leaving an empty tab behind.

## Closing tabs

Closing a tab never asks and never loses work: the figure is written to the browser first and stays in Recent figures, where **Open** brings it back. Closing the last tab leaves an empty new figure. A figure open in a tab cannot be deleted from Recent figures; close its tab first.

## Copy and paste between figures

Select objects in one figure, copy them (Ctrl+C), switch to another tab and paste (Ctrl+V). The copies land in the middle of the view. Icons, pictures and imported graphics bring what they need with them, including an icon's licence, so the receiving figure's credit line names it. Arrows attached to objects you copied with them stay attached to the copies.

## Moving between tabs

- **Alt+1** to **Alt+9** bring the first to the ninth tab forward.
- **Alt+W** closes the tab in front. (Ctrl+W belongs to the browser.)
- **Alt+Shift+Page Up** and **Alt+Shift+Page Down** move the tab in front one place left or right. You can also drag a tab along the strip with the mouse.
- On the strip itself, Tab reaches the tab in front; **←** and **→** move to the previous or next tab, **Home** and **End** to the first and last, and **Delete** closes the focused tab.

On Linux some browsers use Alt with a number for their own tabs. If yours does, give these actions other keys on the guide's **Change shortcuts** page.

## When you come back

JustFig remembers which figures were open and which was in front. When you reload the page or come back later in the same browser, they open again in the same order. An empty tab you never drew in is not kept.
