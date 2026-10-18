# The workspace

When a project is open, the editor shows one fixed layout: a slim app bar at the top and four panels below it. This page tours each part, shows how to resize the panels, and explains how keyboard shortcuts follow the panel you last clicked.

> **Video placeholder: Tour of the workspace**
> - File: `videos/workspace/workspace-tour.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: with a project open at 1920×1080, point at the app bar from left to right (project name, save dot, **Undo**, **Redo**, the badge **1080×1920 · 30 fps**, **Export**, **Settings**); click the **Media**, **Presets** and **Captions** tabs, then back to **Media**; point at the **Edit Properties** panel showing the **Project** section; point at the **Preview** panel, the controls in its header (**Zoom**, **Fit the frame in the panel**, **Preview quality**, **Overlays**, **Snap**, **Smart guides**, **Fullscreen**, **Export frame**), the transport bar under the picture and the audio meter along its right edge; press <kbd>F</kbd>: the preview fills the window; press <kbd>Esc</kbd>; point at the timeline toolbar groups from left to right, at the timecode field at the right end and at the scrollbars under and beside the tracks; hover **Split at playhead** until its tooltip shows "Ctrl+K"; drag the splitter left of the Preview to the right until the **More tools** button (…) appears; click it to show the hidden groups; press <kbd>Escape</kbd>; click **Settings** (the gear) at the right end of the app bar: the **Settings** dialog opens on its **General** tab; click **Shortcuts**, then **Done**; press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>: the command palette opens; press <kbd>Esc</kbd>.

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
| **Settings** (gear) | Opens the **Settings** dialog on its **General** tab: autosave, the length of new clips, the default transition, editing, audio and transcription defaults, how imports bring in your files, proxies and storage; see [Settings](settings.md). Its **Shortcuts** tab lets you change the keyboard shortcuts; see [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut). |

When the editor cannot write to the project folder, a read-only banner appears under the app bar. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

## The four panels

### Media panel

Top left. Its header has three tabs: **Media**, **Presets** and **Captions**.

- **Media** shows the files you imported. Its header buttons sort the files (**Sort media by**, plus **Ascending** / **Descending**), switch between **Grid view** and **List view**, add a bin (**New bin**) and import files (**Import media**, <kbd>Ctrl</kbd>+<kbd>I</kbd>). See [Importing media](importing-media.md). Under the header, **Search media** and the filter chips narrow what the tab shows, and the bin strip on the left shows all media, one kind or one of your bins. See [Organizing media](organizing-media.md). Point at a card to skim it, double-click it or press <kbd>,</kbd> to insert it at the playhead, and drag it onto the timeline or the preview. See [Adding media to the timeline](adding-media-to-the-timeline.md). A **PX** chip on a video's card shows its proxy, the light copy the preview uses for heavy footage. See [Proxies](proxies.md).
- **Presets** holds your text presets: saved looks for titles. Click a card to apply it to the selected text, or to add a new text at the playhead; point at it to see it on the selected text first; drag it onto the timeline or the preview; right-click it for its menu. The header buttons save the selected text as a preset (**New preset from the selected text**), import and export presets. See [Text presets](text-presets.md).
- **Captions** lists the cues of the caption track: type in a cue to change its text while the preview follows, split and merge cues with the keyboard, and search them. The header buttons add a cue at the playhead, import and export SRT and VTT files, open the **Caption style** section, transcribe the timeline's speech into cues and clear all cues. See [Captions](captions.md) and [Transcription](transcription.md).

The tab, view and sort order you choose, the bin you show, the filter chips and the list column widths, and the **Global** or **Project** list of the **Presets** tab, are remembered with the project.

### Edit Properties panel

Top middle. It shows the settings of what is selected, and lets you type or drag exact values. See [Editing properties](editing-properties.md).

- With nothing selected, it shows the **Project** section: name, resolution, frame rate, background, the default lengths of still images, titles and transitions, autosave, the proxy settings (**Proxies**, **Proxy for**, **Proxy size**), the cache with **Clear cache**, and the **History…** and **Save as template…** buttons. See [Project settings and templates](project-settings-and-templates.md) and [Change the proxy settings](proxies.md#change-the-proxy-settings).
- With clips selected, it shows a row of quick actions (**Fit in frame**, **Fill frame**, **Center in frame**, **Flip horizontal**, **Flip vertical**, **Reset transform**, **Freeze frame**, **Punch zoom**, the speeds **0.5x**, **1x**, **1.5x** and **2x**, **Save as preset**, **Update preset**, the fade and transition buttons, **Mute**, **Remove silence** (see [Removing silence](removing-silence.md)), **Duplicate** and **Delete**) and the **Clip** section: name, color, enabled, start, end, duration, source in and out. For text clips it adds **Text** (content, font, size, fill, stroke, shadow, background, alignment, box; see [Titles and text](titles-and-text.md)) and **Animation** (in and out animations; see [Text animations](text-animations.md)). For solids it adds **Solid** (shape, fill, size, radius; see [Shapes and images](shapes-and-images.md)). For video, image, solid and text clips it adds **Transform** (position, scale, rotation, anchor, flip) and **Opacity**, each with a stopwatch for keyframes (see [Keyframes](keyframes.md)), and for video and image clips **Crop** (see [Cropping and reframing](cropping-and-reframing.md)). For video and audio clips it adds **Speed** (speed, duration, ripple, freeze frame; see [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)), and for audio clips and videos with sound **Audio** (volume with a stopwatch for keyframes, mute, fades, **Normalize**, **Auto-duck**, **Detach audio**; see [Editing audio](audio-editing.md)). For caption cues it adds **Caption style** (see [Style your captions](captions.md#style-your-captions)). See [Editing properties](editing-properties.md).
- With tracks selected (click a track header), it shows the **Track** section: name, kind, height and the **Target**, **Lock**, **Mute**, **Solo** or **Hide** switches. See [Change track settings in Edit Properties](tracks.md#change-track-settings-in-edit-properties). For the **CC** caption track it adds the **Caption style** section.
- With a marker selected (click it in the ruler), it shows the **Marker** section: label, color, time and **Delete marker**. See [Edit a marker in Edit Properties](markers-and-in-out-points.md#edit-a-marker-in-edit-properties).

With several clips or tracks selected, the panel header shows how many, for example **3 clips**, and a field whose values differ shows `--`. Click a section header to fold the section away; the project remembers folded sections.

To get back to the **Project** section, click an empty area of the timeline tracks, or the preview beside the frame where no layer is, so that nothing is selected. A selected marker stays selected when you do that: click a clip or a track header first, then the empty area.

### Preview panel

The right column. It shows the frame at the playhead.

- Click a picture in the frame to select its clip; drag it to move it, drag its handles to resize it, and drag just outside a corner to rotate it. Right-click it for the layer menu. See [Arranging layers in the preview](arranging-layers-in-the-preview.md). Double-click a video or image to crop it with handles; the **Crop** chip at the top of the preview shows while you do. See [Crop with handles in the preview](cropping-and-reframing.md#crop-with-handles-in-the-preview).
- Pictures you drag snap to the frame, the overlays and each other, with gold smart guides; hold <kbd>Alt</kbd> to measure distances. See [Snapping and smart guides in the preview](snapping-and-smart-guides.md).
- The header has, from left to right, the **Zoom** menu, **Fit the frame in the panel**, the **Preview quality** menu, the **Overlays** menu (safe zones, grids and guides), **Snap** and **Smart guides** (see [Turn snapping and smart guides on or off](snapping-and-smart-guides.md#turn-snapping-and-smart-guides-on-or-off)), **Fullscreen** and **Export frame**. See [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).
- Under the picture, a bar shows the timecode format chip (**ff** or **ms**), the playhead timecode (click it to type a time), the duration and the frame rate, the transport buttons (**Go to start**, **Previous frame**, **Play** / **Pause**, **Next frame**, **Go to end**), **Mute**, the **Master volume** knob, **Loop playback** and **Play in to out**. A status line underneath shows the preview quality and the dropped frames of the last playback.
- Press <kbd>F</kbd> to let the preview fill the browser window, over the other panels; <kbd>Esc</kbd> brings the panels back at their sizes.
- Along the right edge of the panel, a narrow strip holds the audio meter. See [Audio](audio.md).

See [Preview and playback](preview-and-playback.md).

### Timeline panel

The bottom of the left side. Instead of a title, its header is the timeline toolbar (see [Use the timeline toolbar](#use-the-timeline-toolbar)). Below it are the track headers on the left, the time ruler with your markers and in and out points, and the tracks, where clips show their thumbnails and waveforms. See [Timeline](timeline.md) and [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).

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
| Tools | **Select tool**, **Razor tool**, **Hand tool**, **Slip tool**, **Slide tool**, **Rate stretch tool** | All work: **Select** (<kbd>V</kbd>), **Razor** (<kbd>C</kbd>), **Hand** (<kbd>H</kbd>), **Slip** (<kbd>Y</kbd>), **Slide** (<kbd>U</kbd>) and **Rate stretch** (<kbd>R</kbd>). The active tool is gold. See [Choose a tool](advanced-trimming.md#choose-a-tool) and [Pan the view](timeline.md#pan-the-view). |
| Toggles | **Snap**, **Linked selection**, **Ripple mode**, **Show clip keyframes**, **Audio scrub** | Each is gold while it is on. **Snap** has the key <kbd>S</kbd>, **Linked selection** <kbd>Shift</kbd>+<kbd>S</kbd> and **Audio scrub** <kbd>Alt</kbd>+<kbd>S</kbd>. See [Snap clips into place](timeline.md#snap-clips-into-place), [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off), [Turn Ripple mode on or off](trimming.md#turn-ripple-mode-on-or-off), [Show keyframes on the timeline](keyframes.md#show-keyframes-on-the-timeline) and [Hear cuts while you scrub](audio-editing.md#hear-cuts-while-you-scrub). |
| Edit | **Split at playhead**, **Delete**, **Ripple delete**, **Close gap**, **Close all gaps (compact)**, **Add marker**, **Freeze frame at playhead**, **Punch zoom at playhead** | All work: **Split at playhead** (<kbd>Ctrl</kbd>+<kbd>K</kbd>), **Delete** (<kbd>Delete</kbd>), **Ripple delete** (<kbd>Shift</kbd>+<kbd>Delete</kbd>), **Close gap** (<kbd>G</kbd>), **Close all gaps (compact)** (<kbd>Shift</kbd>+<kbd>G</kbd>), **Add marker** (<kbd>M</kbd>), **Freeze frame at playhead** (<kbd>Shift</kbd>+<kbd>F</kbd>) and **Punch zoom at playhead** (<kbd>Shift</kbd>+<kbd>Z</kbd>). See [Splitting, deleting and closing gaps](splitting-and-deleting.md), [Add markers](markers-and-in-out-points.md#add-markers) and [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md). |
| Add | **Title**, **Subtitle**, **Add caption track**, **Add solid**, **Add image**, then up to 8 chips of your favorite text presets | **Title** (<kbd>T</kbd>, tooltip **Add title**) and **Subtitle** (<kbd>Shift</kbd>+<kbd>T</kbd>, tooltip **Add subtitle**) work: they add a text clip at the playhead and let you type it in the preview. See [Titles and text](titles-and-text.md). A preset chip adds a text in that preset's look the same way; see [Put favorite presets in the timeline toolbar](text-presets.md#put-favorite-presets-in-the-timeline-toolbar). **Add caption track** adds the **CC** caption track and opens the **Captions** tab; it is dimmed once the project has one. See [Add the caption track](captions.md#add-the-caption-track). **Add solid** (a square) adds a white rounded rectangle at the playhead, and **Add image** (a picture with a plus) opens the file picker and places the images you pick at the playhead. See [Shapes and images](shapes-and-images.md). |
| Zoom | **Zoom out**, the zoom slider, **Zoom in**, **Zoom to fit**, **Zoom to selection**, **Center playhead**, **Track height** | All work. **Zoom to selection** (<kbd>Shift</kbd>+<kbd>\\</kbd>) fills the view with the selection, **Center playhead** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd>) scrolls the playhead to the middle of the view (see [Zoom in and out](timeline.md#zoom-in-and-out) and [Scroll the timeline](timeline.md#scroll-the-timeline)), and **Track height** changes the height of all tracks (see [Change track height](tracks.md#change-track-height)). |

At the right end, the playhead timecode field shows where the playhead is (you can type a time into it) and, next to it, the total duration of the timeline.

Under the tracks and along their right side run the timeline's scrollbars. The bottom one also zooms: drag an end of its thumb. See [Use the scrollbars](timeline.md#use-the-scrollbars).

Right-click a clip or a gap on the timeline for a menu with the most common edits for it. See [Use the clip and gap menus](splitting-and-deleting.md#use-the-clip-and-gap-menus). Right-click a track header for the track menu. See [Use the track menu](tracks.md#use-the-track-menu). Right-click the ruler for the ruler menu, with markers and the in and out points. See [Use the ruler menu](markers-and-in-out-points.md#use-the-ruler-menu). In the Media panel, right-click a card or a row for the media menu, which also makes and removes proxies and makes thumbnails again. See [Use the media menu](importing-media.md#use-the-media-menu). In the Preview panel, right-click a picture for the layer menu. See [Use the layer menu](arranging-layers-in-the-preview.md#use-the-layer-menu). Preset cards in the **Presets** tab and cue rows in the **Captions** tab have menus too. See [Text presets](text-presets.md) and [Use the cue menu](captions.md#use-the-cue-menu).

Every menu works with the keyboard while it is open: <kbd>↑</kbd> and <kbd>↓</kbd> move between rows, <kbd>←</kbd> and <kbd>→</kbd> between the choices of a row, <kbd>Enter</kbd> runs, and <kbd>Esc</kbd> closes. See [Use menus with the keyboard](command-palette-and-custom-shortcuts.md#use-menus-with-the-keyboard).

Buttons that are not available yet are dimmed. They still show their tooltip, but clicking them does nothing.

### When the toolbar does not fit

The toolbar never wraps to a second row. When the Timeline panel is too narrow, whole groups move into a menu, in this order: **Zoom** first, then **Toggles**, **Add** (with the preset chips), **Edit** and **Tools** last. A **More tools** button (…) then appears near the right end.

1. Click **More tools** to open the menu with the hidden groups.
2. Use the buttons in the menu as you would in the toolbar.
3. Click outside the menu, click **More tools** again, or press <kbd>Escape</kbd> to close it.

With the default layout, everything fits in a 1920 px wide window; in a 1600 px wide window the **Zoom** group usually moves into the menu. To bring groups back, widen the Timeline panel by dragging the splitter left of the Preview to the right.

## Read tooltips and shortcuts

Hold the pointer over a button for about half a second to see its tooltip. The tooltip shows the button's name and, if it has one, its keyboard shortcut, for example **Split at playhead** with <kbd>Ctrl</kbd>+<kbd>K</kbd>. Tooltips close when you click, press a key or scroll.

Tooltips always show the key you use now: when you change a shortcut in **Settings** > **Shortcuts**, the tooltip shows the new key.

- Press <kbd>?</kbd> to see every shortcut in the **Keyboard shortcuts** sheet. See [See every shortcut](command-palette-and-custom-shortcuts.md#see-every-shortcut).
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to find any command by name and run it. See [Run a command from the palette](command-palette-and-custom-shortcuts.md#run-a-command-from-the-palette).

For the full list of shortcuts, see [Keyboard shortcuts](keyboard-shortcuts.md).

## Send shortcuts to the right panel

> **Video placeholder: Shortcuts follow the panel you clicked**
> - File: `videos/workspace/shortcuts-follow-panel.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: click an empty area of the timeline and press <kbd>=</kbd> twice: the timeline zooms in; click the Preview picture and press <kbd>=</kbd>: nothing happens; press <kbd>Space</kbd>: playback starts and stops on a second press, whichever panel was clicked; click the timeline and press <kbd>Down</kbd>: the playhead jumps to the next cut; click the area around the frame in the Preview and press <kbd>Down</kbd>: the playhead does not move; press <kbd>Right</kbd>: the playhead steps one frame; click the picture in the frame: it gets a gold box; press <kbd>Right</kbd>: the picture moves 1 pixel and the playhead stays; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; press <kbd>Ctrl</kbd>+<kbd>2</kbd>: the preview zooms to 200%, then <kbd>Ctrl</kbd>+<kbd>0</kbd>; click the project name in the app bar, type a letter, press <kbd>Escape</kbd>: no shortcut ran while typing.

The editor sends your key presses to the panel you clicked last (or moved into with <kbd>Tab</kbd>). Some shortcuts work everywhere; others belong to one panel. The same key can do different things in different panels.

- **Shortcuts for the whole editor**, such as <kbd>Space</kbd> (play or pause), <kbd>Ctrl</kbd>+<kbd>Z</kbd> (undo), <kbd>Ctrl</kbd>+<kbd>S</kbd> (save) and <kbd>Ctrl</kbd>+<kbd>I</kbd> (import media), work whichever panel you clicked last.
- **Panel shortcuts** work only after you click in their panel. When a panel shortcut and an editor-wide shortcut share a key, the panel shortcut wins in that panel.
- **While you type in a text field**, shortcuts are off and the keys go to the field. <kbd>Ctrl</kbd>+<kbd>Z</kbd> inside a field undoes your typing in that field, not a change to the project. Only <kbd>Ctrl</kbd>+<kbd>S</kbd> still saves.
- **While a dialog or a menu is open**, shortcuts are off, except <kbd>Ctrl</kbd>+<kbd>S</kbd>. <kbd>Escape</kbd> closes the dialog or the menu.
- Clicking the app bar does not select a panel: only the editor-wide shortcuts work then.

Examples:

| Key | Timeline clicked last | Preview clicked last | Media panel clicked last |
| --- | --- | --- | --- |
| <kbd>=</kbd> / <kbd>-</kbd> | Zoom the timeline in / out | Nothing | Nothing |
| <kbd>Left</kbd> / <kbd>Right</kbd> | One frame back / forward | Moves the selected layer 1 pixel; with no layer selected, one frame back / forward | One frame back / forward |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Previous / next edit point | Moves the selected layer 1 pixel; with no layer selected, nothing | Nothing |
| <kbd>Ctrl</kbd>+<kbd>0</kbd> / <kbd>Ctrl</kbd>+<kbd>1</kbd> / <kbd>Ctrl</kbd>+<kbd>2</kbd> | The browser gets them: page zoom reset, first or second tab | Zooms the preview to **Fit** / 100% / 200% | The browser gets them |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Selects all clips | Selects all clips | Does not select clips |
| <kbd>Alt</kbd>+<kbd>Left</kbd> / <kbd>Alt</kbd>+<kbd>Right</kbd> | Nudges the selected clips one frame | Nothing (the browser gets <kbd>Alt</kbd>+<kbd>Left</kbd>) | Nothing (the browser gets <kbd>Alt</kbd>+<kbd>Left</kbd>) |
| <kbd>E</kbd> | Moves the nearest edge of the selected clip to the playhead | Nothing | Nothing |
| <kbd>Q</kbd> / <kbd>W</kbd> | Trims the clip under the playhead to the playhead | Same | Same |
| <kbd>Delete</kbd> | Deletes the selected clips or marker, or closes the selected gap | Deletes the selected clips or marker | Removes the selected media (asks first) |
| <kbd>F2</kbd> | Renames the selected clip or track | Nothing | Renames the selected media |
| <kbd>G</kbd> | Closes the selected gap, or the gap at the playhead | Nothing | Nothing |
| <kbd>M</kbd>, <kbd>I</kbd>, <kbd>O</kbd> | Adds a marker, sets the in point, sets the out point at the playhead | Same | Same |
| <kbd>,</kbd> / <kbd>.</kbd> | Nothing | Nothing | Inserts / overwrites the selected media at the playhead |
| <kbd>X</kbd>, <kbd>;</kbd>, <kbd>'</kbd> | Marks the clip under the playhead, **Lift**, **Extract** | Nothing | Nothing |
| <kbd>Ctrl</kbd>+<kbd>L</kbd> / <kbd>Ctrl</kbd>+<kbd>G</kbd> | Links or unlinks / groups the selected clips | Nothing (the browser gets them) | Nothing (the browser gets them) |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copies / cuts / pastes clips | Same | <kbd>Ctrl</kbd>+<kbd>V</kbd> imports images; the others do nothing |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicates the selected clips right after them | Duplicates the selected pictures 20 pixels down and to the right, on the track above | The browser gets it (bookmark) |

With **Edit Properties** clicked last, only the shortcuts for the whole editor work, and the browser gets <kbd>Ctrl</kbd>+<kbd>D</kbd> as in the Media panel. While a field there has the keyboard, the keys go to the field: <kbd>↑</kbd> and <kbd>↓</kbd> change a number. See [Type a value](editing-properties.md#type-a-value).

The pointer can take a few keys away from the panel you clicked: while it is over the picture of a media card, <kbd>,</kbd> and <kbd>.</kbd> place that card, and over a video or audio card <kbd>I</kbd>, <kbd>O</kbd> and <kbd>Alt</kbd>+<kbd>X</kbd> mark a part of it instead of the timeline. See [Use only part of a media item](adding-media-to-the-timeline.md#use-only-part-of-a-media-item).

> **Tip:** If a shortcut seems to do nothing, click the panel it belongs to and try again. After clicking the Preview, click the timeline before you jump between edit points with <kbd>Up</kbd> and <kbd>Down</kbd>, or before you step frames while a layer is selected in the preview.

## Read timecodes

Positions in a project are whole frames at the project frame rate. Timecodes show minutes, seconds and frames as `mm:ss:ff`; from one hour on, the hours come first (`hh:mm:ss:ff`). For example, `00:05:12` means 5 seconds and 12 frames.

The seconds are real clock seconds and the last field counts the frames since that second began. At 29.97 fps the timecode therefore stays in step with the clock, even in long projects.

To read times in milliseconds instead (`mm:ss.mmm`, for example `00:05.400`), click the **ff** chip next to the timecode under the preview; click **ms** to go back. The preview, the timeline toolbar and the ruler all follow. See [Show times in milliseconds](timeline.md#show-times-in-milliseconds).

To jump to a time, type it into the timecode field of the timeline toolbar, or click the playhead timecode under the preview and type it there. See [Jump to a timecode](timeline.md#jump-to-a-timecode).

## Related pages
- [Getting started](getting-started.md)
- [Projects and saving](projects-and-saving.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Settings](settings.md)
- [Importing media](importing-media.md)
- [Organizing media](organizing-media.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Timeline](timeline.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Advanced trimming](advanced-trimming.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Preview and playback](preview-and-playback.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Editing properties](editing-properties.md)
- [Titles and text](titles-and-text.md)
- [Captions](captions.md)
- [Proxies](proxies.md)
- [Audio](audio.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 42, 2026-10-18</sub>
