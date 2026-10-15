# The workspace

When a project is open, the editor shows one fixed layout: a slim app bar at the top and four panels below it. This page tours each part, shows how to resize the panels, and explains how keyboard shortcuts follow the panel you last clicked.

> **Video placeholder: Tour of the workspace**
> - File: `videos/workspace/workspace-tour.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: with a project open at 1920×1080, point at the app bar from left to right (project name, save dot, **Undo**, **Redo**, the badge **1080×1920 · 30 fps**, **Export**, **Settings**); click the **Media**, **Presets** and **Captions** tabs, then back to **Media**; point at the **Edit Properties** panel showing the **Project** section; point at the **Preview** panel, the transport bar under the picture and the audio meter along its right edge; point at the timeline toolbar groups from left to right and at the timecode field at the right end; hover **Split at playhead** until its tooltip shows "Ctrl+K"; drag the splitter left of the Preview to the right until the **More tools** button (…) appears; click it to show the hidden groups; press <kbd>Escape</kbd>.

## In this page
- [The layout at a glance](#the-layout-at-a-glance)
- [Use the app bar](#use-the-app-bar)
- [The four panels](#the-four-panels)
- [Resize panels](#resize-panels)
- [Use the timeline toolbar](#use-the-timeline-toolbar)
- [Read tooltips and shortcuts](#read-tooltips-and-shortcuts)
- [Send shortcuts to the right panel](#send-shortcuts-to-the-right-panel)
- [Read timecodes](#read-timecodes)
- [Related pages](#related-pages)

## The layout at a glance

```
+-----------------------------------------------------------+
| App bar                                                   |
+------------------+------------------+---------------------+
| Media            | Edit Properties  |                     |
|                  |                  |      Preview        |
+------------------+------------------+   (full height,     |
| Timeline                            |    portrait)        |
|                                     |                     |
+-------------------------------------+---------------------+
```

- The **Media** and **Edit Properties** panels share the top of the left side.
- The **Timeline** fills the bottom of the left side, under both of them.
- The **Preview** takes the whole right column. It is tall and narrow because shorts are vertical (9:16).

The layout is fixed: panels cannot be moved, closed, undocked or stacked. You can only change their sizes with the splitters (see [Resize panels](#resize-panels)). Each panel has a header strip with its title or tabs on the left and its one-click buttons on the right.

## Use the app bar

The app bar is the strip above the panels. From left to right:

| Element | What it does |
| --- | --- |
| **S** | The Shorts Editor mark. |
| Project name | Click it to rename the project (tooltip **Rename project**). Type the new name and press <kbd>Enter</kbd> or click elsewhere; <kbd>Escape</kbd> cancels. Up to 120 characters. The rename is one undo step and does not rename the folder. |
| Save status dot | Shows whether your changes are saved. Hover it for details; click it to save now. See [Check the save status](projects-and-saving.md#check-the-save-status). |
| **Undo** and **Redo** | Undo or redo the last change. The tooltip names the step, for example **Undo Rename project**. Dimmed when there is nothing to undo or redo. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes). |
| Project badge | The resolution and frame rate of the project, for example **1080×1920 · 30 fps**. It follows changes made in the **Project** section. |
| **Export** | Available in a later version. |
| **Settings** (gear) | Available in a later version. |

When the editor cannot write to the project folder, a read-only banner appears under the app bar. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

## The four panels

### Media panel

Top left. Its header has three tabs: **Media**, **Presets** and **Captions**.

- **Media** shows the files you imported. Its header buttons sort the files (**Sort media by**, plus **Ascending** / **Descending**), switch between **Grid view** and **List view**, and import files (**Import media**, <kbd>Ctrl</kbd>+<kbd>I</kbd>). See [Importing media](importing-media.md).
- **Presets** and **Captions** are available in a later version.

The tab, view and sort order you choose are remembered with the project.

### Edit Properties panel

Top middle. It shows the settings of what is selected.

- With nothing selected, it shows the **Project** section: name, resolution, frame rate, background and autosave. See [Change project settings](projects-and-saving.md#change-project-settings).
- With clips selected, it shows a placeholder: clip properties are available in a later version.

To get back to the **Project** section, click an empty area of the timeline tracks so that nothing is selected.

### Preview panel

The right column. It shows the frame at the playhead.

- The header has the **Zoom** menu and the **Export frame** button.
- Under the picture, a bar shows the playhead timecode, the duration and the frame rate, the transport buttons (**Go to start**, **Previous frame**, **Play** / **Pause**, **Next frame**, **Go to end**), **Mute**, the **Master volume** knob, **Loop playback** and **Fit**. A status line underneath shows the preview quality and the dropped frames of the last playback.
- Along the right edge of the panel, a narrow strip holds the audio meter. See [Audio](audio.md).

See [Preview and playback](preview-and-playback.md).

### Timeline panel

The bottom of the left side. Instead of a title, its header is the timeline toolbar (see [Use the timeline toolbar](#use-the-timeline-toolbar)). Below it are the track headers on the left, the time ruler and the tracks. See [Timeline](timeline.md).

> **Note:** If you run the editor from its source folder with `npm run dev`, a few extra developer controls marked **(dev)** appear in the Preview and Timeline headers. You can ignore them.

## Resize panels

> **Video placeholder: Resize panels**
> - File: `videos/workspace/resize-panels.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: hover the line between the Media and Edit Properties panels until the cursor changes; drag it left until it stops at the Media panel's minimum width; drag the line above the timeline up; drag the line left of the Preview; double-click each line to put it back to its default position; drag one line again, reload the page, open the project from **Recent projects** and show that the size is kept.

Three splitters sit on the boundaries between panels:

| Splitter | Between | Default | Minimum sizes |
| --- | --- | --- | --- |
| Vertical line left of the Preview | The left side and the **Preview** | 68% / 32% of the window width | **Preview** 300 px wide; the left side 600 px wide |
| Horizontal line above the Timeline | The top row and the **Timeline** | 50% / 50% of the height | Top row 220 px tall; **Timeline** 220 px tall |
| Vertical line in the top row | **Media** and **Edit Properties** | 49% / 51% of the top row | **Media** 280 px wide; **Edit Properties** 320 px wide |

To resize:

1. Point at the boundary between two panels. The cursor changes to a resize arrow and the line lights up.
2. Drag it. It stops when a panel reaches its minimum size.
3. To put a splitter back to its default position, double-click it.

The editor remembers your sizes:

- After a reload, the panels keep the sizes you last used.
- Each project also stores its own sizes. Opening a project restores its layout; a new project starts with the sizes you used last.
- Sizes are kept as proportions of the window, so the panels grow and shrink with the browser window, never below their minimum sizes.

## Use the timeline toolbar

The toolbar is one row of button groups, from left to right:

| Group | Buttons | What works now |
| --- | --- | --- |
| Tools | **Select**, **Razor**, **Hand**, **Slip**, **Slide**, **Rate stretch** | Available in a later version. |
| Toggles | **Snap**, **Linked selection**, **Ripple mode**, **Show clip keyframes**, **Audio scrub** | Available in a later version. |
| Edit | **Split at playhead**, **Delete**, **Ripple delete**, **Close gap**, **Close all gaps (compact)**, **Add marker**, **Freeze frame**, **Punch zoom** | Available in a later version. |
| Add | **Title**, **Subtitle**, **Add caption track**, **Add solid**, **Add image** | Available in a later version. |
| Zoom | **Zoom out**, the zoom slider, **Zoom in**, **Zoom to fit**, **Zoom to selection**, **Track height** | **Zoom out**, the slider, **Zoom in** and **Zoom to fit** work. See [Timeline](timeline.md). |

At the right end, the playhead timecode field shows where the playhead is (you can type a time into it) and, next to it, the total duration of the timeline.

Buttons that are not available yet are dimmed. They still show their tooltip, but clicking them does nothing.

### When the toolbar does not fit

The toolbar never wraps to a second row. When the Timeline panel is too narrow, whole groups move into a menu, in this order: **Zoom** first, then **Toggles**, **Add**, **Edit** and **Tools** last. A **More tools** button (…) then appears near the right end.

1. Click **More tools** to open the menu with the hidden groups.
2. Use the buttons in the menu as you would in the toolbar.
3. Click outside the menu, click **More tools** again, or press <kbd>Escape</kbd> to close it.

With the default layout, everything fits in a 1920 px wide window; in a 1600 px wide window the **Zoom** group usually moves into the menu. To bring groups back, widen the Timeline panel by dragging the splitter left of the Preview to the right.

## Read tooltips and shortcuts

Hold the pointer over a button for about half a second to see its tooltip. The tooltip shows the button's name and, if it has one, its keyboard shortcut, for example **Split at playhead** with <kbd>Ctrl</kbd>+<kbd>K</kbd>. Tooltips close when you click, press a key or scroll.

For the full list of shortcuts, see [Keyboard shortcuts](keyboard-shortcuts.md).

## Send shortcuts to the right panel

> **Video placeholder: Shortcuts follow the panel you clicked**
> - File: `videos/workspace/shortcuts-follow-panel.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: click an empty area of the timeline and press <kbd>=</kbd> twice: the timeline zooms in; click the Preview picture and press <kbd>=</kbd>: nothing happens; press <kbd>Space</kbd>: playback starts and stops on a second press, whichever panel was clicked; click the timeline and press <kbd>Right</kbd>: the playhead steps one frame; click the Preview and press <kbd>Right</kbd>: the playhead does not move; click the project name in the app bar, type a letter, press <kbd>Escape</kbd>: no shortcut ran while typing.

The editor sends your key presses to the panel you clicked last (or moved into with <kbd>Tab</kbd>). Some shortcuts work everywhere; others belong to one panel. The same key can do different things in different panels.

- **Shortcuts for the whole editor**, such as <kbd>Space</kbd> (play or pause), <kbd>Ctrl</kbd>+<kbd>Z</kbd> (undo), <kbd>Ctrl</kbd>+<kbd>S</kbd> (save) and <kbd>Ctrl</kbd>+<kbd>I</kbd> (import media), work whichever panel you clicked last.
- **Panel shortcuts** work only after you click in their panel. When a panel shortcut and an editor-wide shortcut share a key, the panel shortcut wins in that panel.
- **While you type in a text field**, shortcuts are off and the keys go to the field. <kbd>Ctrl</kbd>+<kbd>Z</kbd> inside a field undoes your typing in that field, not a change to the project.
- **While a dialog is open**, shortcuts are off. <kbd>Escape</kbd> closes the dialog.
- Clicking the app bar does not select a panel: only the editor-wide shortcuts work then.

Examples:

| Key | Timeline clicked last | Preview clicked last | Media panel clicked last |
| --- | --- | --- | --- |
| <kbd>=</kbd> / <kbd>-</kbd> | Zoom the timeline in / out | Nothing | Nothing |
| <kbd>Left</kbd> / <kbd>Right</kbd> | One frame back / forward | Nothing: reserved for moving layers on the canvas, available in a later version | One frame back / forward |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Previous / next edit point | Nothing: reserved for moving layers on the canvas | Nothing |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Selects all clips | Selects all clips | Does not select clips |
| <kbd>Alt</kbd>+<kbd>Left</kbd> / <kbd>Alt</kbd>+<kbd>Right</kbd> | Nudges the selected clips one frame | Nothing (the browser gets <kbd>Alt</kbd>+<kbd>Left</kbd>) | Nothing (the browser gets <kbd>Alt</kbd>+<kbd>Left</kbd>) |
| <kbd>Delete</kbd> | Nothing: deleting clips is available in a later version | Nothing | Removes the selected media (asks first) |
| <kbd>F2</kbd> | Nothing | Nothing | Renames the selected media |

> **Tip:** If a shortcut seems to do nothing, click the panel it belongs to and try again. After clicking the Preview, click the timeline before you step through frames with the arrow keys.

## Read timecodes

Positions in a project are whole frames at the project frame rate. Timecodes show minutes, seconds and frames as `mm:ss:ff`; from one hour on, the hours come first (`hh:mm:ss:ff`). For example, `00:05:12` means 5 seconds and 12 frames.

The seconds are real clock seconds and the last field counts the frames since that second began. At 29.97 fps the timecode therefore stays in step with the clock, even in long projects.

To jump to a time, type it into the timecode field of the timeline toolbar. See [Timeline](timeline.md).

## Related pages
- [Getting started](getting-started.md)
- [Projects and saving](projects-and-saving.md)
- [Importing media](importing-media.md)
- [Timeline](timeline.md)
- [Preview and playback](preview-and-playback.md)
- [Audio](audio.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 11, 2026-10-15</sub>
