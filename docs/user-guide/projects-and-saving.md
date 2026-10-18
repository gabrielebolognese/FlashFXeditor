# Projects and saving

Every Shorts Editor project is a folder on your disk. The editor saves your work automatically, keeps backups of earlier versions, lets you undo changes, and remembers where you left off. This page explains what the project folder holds, how saving and undo work, how to recover after a crash, and how to change the project settings.

> **Video placeholder: Autosave and undo**
> - File: `videos/projects-and-saving/autosave-and-undo.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows: with a project open, click the project name in the app bar, type "Beach day" and press <kbd>Enter</kbd>; the save dot turns gold, then green about a second later; hover the dot to show **All changes saved at** and the time; hover **Undo** to show **Undo Rename project**; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> (the old name comes back) and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (the new name returns); press <kbd>Ctrl</kbd>+<kbd>S</kbd>; open the project folder in File Explorer and show `project.json`, `session.json` and the backups in `history`; back in the browser, move the playhead, reload the page, open the project from **Recent projects** and show the same name, playhead and panel sizes.

## In this page
- [What is in the project folder](#what-is-in-the-project-folder)
- [How autosave works](#how-autosave-works)
- [Check the save status](#check-the-save-status)
- [Save now](#save-now)
- [Undo and redo changes](#undo-and-redo-changes)
- [Pick up where you left off](#pick-up-where-you-left-off)
- [Restore unsaved changes after a crash](#restore-unsaved-changes-after-a-crash)
- [Restore an older version](#restore-an-older-version)
- [Work in read-only mode](#work-in-read-only-mode)
- [Change project settings](#change-project-settings)
- [Related pages](#related-pages)

## What is in the project folder

When you create a project, the editor fills the folder you picked with these items:

| Item | What it holds |
| --- | --- |
| `project.json` | The project itself: settings, tracks, clips, markers and the list of media. |
| `session.json` | Where you left off: playhead, in and out points, the marked parts of media items, the timeline and preview zoom, the preview quality and overlays, panel sizes, the folded sections of **Edit Properties** and similar view settings. If it is missing or damaged, the project still opens, with default view settings. |
| `media` | Copies of the files you import. See [Importing media](importing-media.md). |
| `cache` | Thumbnails, sound analysis and indexes the editor builds from your media, and the proxies of heavy videos in `cache/proxies` (see [Proxies](proxies.md)). If you delete this folder while the project is closed, the editor builds what it needs again the next time. This takes a little longer, and for proxies about as long as the videos themselves. |
| `history` | Automatic backups of `project.json`: the newest 20. See [Restore an older version](#restore-an-older-version). |
| `fonts` | Copies of the fonts from your computer that your text clips use, and `fonts.json`, the list of those copies. Created the first time a text uses a font from your computer. The editor uses these copies when it opens the project, so the text looks the same on a computer without those fonts. See [Fonts travel with the project](titles-and-text.md#fonts-travel-with-the-project). |
| `exports` | The default place for exported videos. Export is available in a later version. |
| `presets/text` | The project's own text presets, one `.json` file per preset: the **Project** list of the **Presets** tab. See [Keep presets for all projects or for one](text-presets.md#keep-presets-for-all-projects-or-for-one). |
| `project.json.tmp` | Exists only for a moment during each save. If one is left over after a crash, the editor offers to restore it. See [Restore unsaved changes after a crash](#restore-unsaved-changes-after-a-crash). |

> **Note:** Transcription models are not in the project folder: your browser keeps them for all your projects. See [Manage downloaded models](transcription.md#manage-downloaded-models).

> **Important:** Keep the project folder together. Do not rename, move or delete files inside `media` or `fonts`: the project refers to them by name. To move a project, move the whole folder, then open it with **Open project**.

> **Note:** Do not edit `project.json` while the project is open in the editor. The next save replaces it.

## How autosave works

You never need to save by hand. After each change, the editor waits for a short pause and then saves:

- By default it saves 1 second after your last change.
- While you keep making changes, it still saves at least every 5 seconds.
- Each save first writes a temporary copy, keeps the previous version of `project.json` as a backup in `history`, then writes the new `project.json`.
- Where you left off (playhead, zoom, panel sizes) is saved separately, every 10 seconds when something changed.
- When you switch to another browser tab, minimize the window, close the tab or open another project, the editor saves pending changes right away.

You can change the pause in the **Project** section: **1 s after the last change** (default), **2 s**, **5 s** or **10 s**. With **10 s**, the editor also waits up to 10 seconds during continuous editing. This setting applies to every project in this browser. See [Change project settings](#change-project-settings).

> **Tip:** Before you close the tab, check that the save dot is green.

## Check the save status

The dot to the right of the project name in the app bar shows the save status. Hover it to see the details; the tooltip also shows <kbd>Ctrl</kbd>+<kbd>S</kbd>.

| Dot | Status | Tooltip | Click the dot to |
| --- | --- | --- | --- |
| Green | Saved | **All changes saved at** and the time of the last save (**All changes saved** before the first save) | Save now |
| Blue | Saving | **Saving…** | Save again after the current save |
| Gold | Changes waiting for autosave | **Unsaved changes. Click to save now** | Save now |
| Red | The last save failed | **Save failed:** and the reason, then **Click to retry** | Try again |
| Grey | Read-only | **Read-only: changes are not saved. Click to allow editing** | Ask the browser for permission to edit the folder |

When a save fails, your changes stay in the editor. The editor tries again after your next change, or you can click the red dot. The tooltip shows the reason the browser reported.

## Save now

Press <kbd>Ctrl</kbd>+<kbd>S</kbd> or click the save dot. This always writes the project, even when nothing changed, and makes a backup in `history` each time.

<kbd>Ctrl</kbd>+<kbd>S</kbd> works in every panel, also while you type in a text field and while a dialog or a menu is open; the browser's own "Save page" dialog doesn't open. What you are still typing in a field goes into the project when you press <kbd>Enter</kbd> or leave the field, and the next autosave writes it.

## Undo and redo changes

| To | Do this |
| --- | --- |
| Undo the last change | Click **Undo** in the app bar or press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. |
| Redo it | Click **Redo** or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd>. |
| See what will be undone | Hover **Undo** or **Redo**. The tooltip names the step, for example **Undo Rename project** or **Redo Change resolution**. |

How undo behaves:

- The editor keeps up to 1,000 steps.
- Undo also brings back the selection you had before the change; redo brings back the selection after it.
- When you make a new change after undoing, the steps you undid can no longer be redone.
- Undo and redo are changes like any other: they are saved automatically.
- The history lasts while the project is open. Opening a project (also after a reload) starts with an empty history, and so does restoring unsaved changes after a crash.
- In a text field, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes your typing in that field, not a change to the project.

What you can undo:

| Undoable (one step each) | Not undoable |
| --- | --- |
| Renaming the project | Moving the playhead and playing |
| Changing the resolution, frame rate or background color | Selecting clips, tracks, a cut (edit point), a gap or a marker |
| Importing media, renaming media, removing media | Zooming, scrolling and panning the timeline (also with the scrollbars), zooming and panning the preview, the preview quality, overlays and fullscreen |
| Adding media to the timeline: each insert, overwrite, drag, drop on the preview or **Add to canvas**; dropped files with their import are one step | Panel sizes, panel tabs, the media view and sort order, skimming media cards |
| Moving, inserting, duplicating and nudging clips (a quick series of nudges is one step) | **Loop playback**, **Snap**, **Linked selection**, **Ripple mode**, **Audio scrub**, the timecode format, the **Autosave** setting and the proxy settings |
| Moving, resizing, rotating and cropping layers in the preview and moving their anchor point (one step per drag), nudging them with the arrow keys (a quick series is one step), **Fit**, **Fill**, **Center**, the flips, **Reset transform**, **Bring forward** and **Send backward** | Folding and opening the sections of **Edit Properties**, the scale lock in the **Transform** section, and the recent colors of the color picker |
| Values typed or dragged in **Edit Properties**: position, scale, rotation, anchor, crop, opacity, the clip times, and the shape, fill, size and corner radius of a solid (one step per value, per drag, or per quick series of arrow presses) | Turning crop mode on or off, the crop units (**px** or **%**) and the crop **Aspect** lock |
| **Crop to frame** and resetting a crop | |
| Fades (each fade handle drag, **Fade in 0.5 s**, **Fade out 0.5 s** and each fade length in the clip menu), and adding, changing and deleting transitions | Selecting a transition |
| Audio changes: a clip's volume (each typed value, rubber band drag or quick series of arrow presses), volume keyframes, muting and unmuting clips, **Normalize**, **Auto-duck music** and **Detach audio** | The listening volume and the **Mute** button under the preview |
| Adding a solid with **Add solid**, and adding images with **Add image** (the import and the clips are one step) | |
| Duplicating clips with <kbd>Ctrl</kbd>+<kbd>D</kbd> or **Duplicate**, turning clips off and on (**Disable**, **Enable**) | |
| **Cut**, **Paste**, **Paste insert**, pasting keyframes and **Paste attributes** (one step each) | Copying clips or keyframes |
| Applying a text preset, adding a text from a preset, and linking a text to the preset you save it as | Text presets themselves: saving, updating, renaming, duplicating, deleting, importing and syncing presets, favorites, **Apply position** and the default title and subtitle |
| Adding, moving, renaming, recoloring and deleting markers | Setting, moving and clearing the in and out points, and marking a part of a media item with <kbd>I</kbd> and <kbd>O</kbd> on its card |
| **Lift** and **Extract** (one step each) | Proxies: **Generate proxy**, **Remove proxy**, a proxy being made or failing, and **Regenerate thumbnails** |
| Trimming clips: each trim drag and each press of <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd> | Choosing a tool (**Select**, **Razor**, **Hand**, **Slip**, **Slide**, **Rate stretch**) |
| Rolling a cut, slipping, sliding and rate stretching clips (one step per drag) | |
| Splitting clips (each <kbd>Ctrl</kbd>+<kbd>K</kbd> and each **Razor** click), deleting and ripple deleting clips | |
| Closing a gap, closing all gaps (one step for all of them) | |
| Renaming clips and setting or removing their label color (also in the **Clip** section) | Track heights (undo and redo leave them as they are) |
| Linking, unlinking, grouping and ungrouping clips, **Move into sync** | |
| Adding, deleting, renaming and reordering tracks | |
| Targeting, locking, muting, soloing and hiding tracks (also **Lock all tracks** and **Mute all others**) | |
| Caption changes: adding, importing, editing, splitting, merging and clearing cues, the caption style, and adding a transcription (**Transcribe captions**) | Starting, cancelling and discarding a transcription, downloading and removing transcription models, and the model and language you choose |

## Pick up where you left off

When you open a project again, the editor restores your view from the last session:

- the playhead position
- the in and out points
- the parts of media items you marked with <kbd>I</kbd> and <kbd>O</kbd> on their cards (see [Use only part of a media item](adding-media-to-the-timeline.md#use-only-part-of-a-media-item))
- the timeline zoom and scroll position, also after you pan or use the scrollbars
- the timecode format: frames (**ff**) or milliseconds (**ms**)
- the preview zoom and pan, the preview quality, and the safe zone, grid and guides of the **Overlays** menu (see [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md))
- the media panel tab, view (grid or list) and sort order, and the **Global** or **Project** list of the **Presets** tab
- whether **Loop playback** is on
- whether **Snap** is on
- whether **Linked selection** is on
- whether **Ripple mode** is on
- whether **Audio scrub** is on
- the active tool (**Select**, **Razor**, **Hand**, **Slip**, **Slide** or **Rate stretch**)
- the selected clips or tracks
- the sections you folded in **Edit Properties**
- the panel sizes

The undo history, a selected cut (edit point), a selected gap, a selected marker, crop mode and the fullscreen preview are not restored. Markers are part of the project itself, so they are always there. Because the view is saved every 10 seconds, the last few seconds of view changes can be missing after a browser crash; your project changes are saved separately by autosave.

## Restore unsaved changes after a crash

> **Video placeholder: Restore unsaved changes**
> - File: `videos/projects-and-saving/restore-unsaved-changes.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: with no project open (start screen), open the project folder in File Explorer; copy `project.json` to `project.json.tmp`; open the copy in a text editor, change the value of "name" to "Recovered", save it; back in the browser, click the project in **Recent projects** and allow access; the **Restore unsaved changes?** dialog shows the times of **Unsaved copy** and **Saved project**; click **Restore changes**; the app bar shows "Recovered" and the save dot turns green.

If the browser or the computer stops in the middle of a save, a newer temporary copy of the project can be left in the folder. The next time you open the project, the editor shows **Restore unsaved changes?**:

- The text says that the last save was interrupted and that a newer copy was found in `project.json.tmp`.
- **Unsaved copy** and **Saved project** show when each version was written.
- "Restoring keeps the current project.json in history/." reminds you that nothing is lost either way.

| Choice | What happens |
| --- | --- |
| **Restore changes** | The editor opens the newer copy and saves it as `project.json` with the next autosave. The previous `project.json` goes to `history`. The undo history starts empty. |
| **Keep saved version** | The editor keeps `project.json` as it was and deletes the temporary copy. |
| Close the dialog (**Close**, <kbd>Escape</kbd> or a click outside it) | The editor keeps `project.json` and leaves the temporary copy alone until the next save replaces it. |

The editor offers this only when the temporary copy is newer than `project.json`, differs from it and is a valid project. Otherwise it removes the leftover copy without asking (unless the project is read-only).

## Restore an older version

Every save keeps the previous version of `project.json` in the `history` folder, so you can go back to an earlier state of the project. A backup browser inside the editor is available in a later version; for now you restore a backup in File Explorer.

1. Wait until the save dot is green, then reload the page. The start screen appears.
2. In File Explorer, open the project folder and then its `history` folder. Backups are named `project-YYYYMMDD-HHMMSS.json`. Saves within the same second get `-2`, `-3` and so on.
3. Rename the current `project.json` in the project folder, for example to `project-before-restore.json`, so you can go back to it.
4. Copy the backup you want into the project folder and rename the copy to `project.json`.
5. Open the project from **Recent projects**.

> **Note:** Backup names use UTC time, not your local time, so the hour can differ from your clock.

> **Important:** `history` keeps only the newest 20 backups. Because every save makes one, 20 backups can cover just the last few minutes of work, and each <kbd>Ctrl</kbd>+<kbd>S</kbd> adds one even without changes. Copy a backup somewhere else if you want to keep it.

## Work in read-only mode

> **Video placeholder: Read-only mode and Allow editing**
> - File: `videos/projects-and-saving/read-only-mode.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: reload the page and click a project in **Recent projects**; when the browser asks for permission to edit files, refuse it (allow viewing if asked); the editor opens with the read-only banner and a grey save dot; hover the dot to show its tooltip; rename the project in the app bar; click **Allow editing** in the banner; allow editing in the browser prompt; the banner disappears and the save dot turns gold, then green.

A project opens read-only when the editor may read the project folder but not write to it. This happens when:

- you refuse edit permission in the browser prompt, or
- you dropped the folder on the start screen and the browser did not ask for edit permission.

You then see a banner under the app bar: "Read-only: Shorts Editor has no permission to write to this folder, so changes are not saved." with an **Allow editing** button, and the save dot is grey.

In read-only mode you can look at the project and even make changes, but nothing is written to the folder: no saves, no backups, no new proxies, no copies of the fonts your text uses, no changes to the project's text presets (new presets go into the **Global** list), and your view (playhead, zoom, panel sizes) is not saved with the project. Changes made in read-only mode are lost when you close the tab. Proxies already in the folder are still used; **Generate proxy** and **Remove proxy** show the message **This project is read-only**.

To start saving:

1. Click **Allow editing** in the banner, or click the grey save dot.
2. Allow editing when the browser asks.
3. The banner disappears, and the changes you made in the meantime are saved.

If you refuse again, the project stays read-only.

## Change project settings

1. Click an empty area of the timeline tracks so that nothing is selected.
2. The **Edit Properties** panel shows the **Project** section.
3. Change a field. Text and number fields apply when you press <kbd>Enter</kbd> or click elsewhere; <kbd>Escape</kbd> puts back the previous value. See [Type a value](editing-properties.md#type-a-value).

| Field | What it sets | Notes |
| --- | --- | --- |
| **Name** | The project name, the same as in the app bar. | Up to 120 characters. Renaming does not rename the folder. |
| **Resolution** | **9:16 · 1080×1920**, **4:5 · 1080×1350**, **1:1 · 1080×1080**, **16:9 · 1920×1080**, or **Custom**. | The layout scales with the frame, as the hint under the field says: see [What a new resolution does to your clips](#what-a-new-resolution-does-to-your-clips). |
| **Size** (with **Custom** only) | **W** and **H** in pixels. | From 16 to 7680; odd values are rounded to an even number. Type a value, press <kbd>↑</kbd> or <kbd>↓</kbd> to change it by 2 (<kbd>Shift</kbd>: by 20), or drag the **W** or **H** letter: the frame takes the new size when you release. Each change is one undo step. |
| **Frame rate** | **23.976 fps** to **60 fps**, the same choices as for a new project. | Can only be changed while the timeline has no clips and no markers. Otherwise it is locked and the panel shows "Locked while the timeline has clips or markers." |
| **Background** | The color of the frame where no clip covers it: a swatch and its hex code. | Type a hex code (`#RGB`, `#RRGGBB` or `#RRGGBBAA`, with or without `#`), or click the swatch to open the color picker; see [Pick a color](editing-properties.md#pick-a-color). The default is `#000000` (black). Text that is not a valid color is ignored. |
| **Autosave** | How long the editor waits after your last change before saving: **1 s after the last change**, **2 s after the last change**, **5 s after the last change** or **10 s after the last change**. | An app setting for every project in this browser, not part of the project. Not undoable. |
| **Proxies** | Whether heavy videos get a proxy automatically. On by default. | An app setting, like **Autosave**. See [Change the proxy settings](proxies.md#change-the-proxy-settings). |
| **Proxy for** | Which videos get one: **Above 1080p or 30 fps** (default), **Above 1080p** or **Every video**. | An app setting. Dimmed while **Proxies** is off. |
| **Proxy size** | The short side of new proxies: **360p**, **540p** (default) or **720p**. | An app setting. Proxies already made keep their size. |

Each change to **Name**, **Resolution**, **Size**, **Frame rate** or **Background** is one undo step. The project badge in the app bar always shows the current resolution and frame rate.

The rows **Still duration**, **Transition** and **Cache** (with **Clear cache**) are dimmed: they are available in a later version, and so is converting an existing timeline to another frame rate.

### What a new resolution does to your clips

When you choose another resolution, or type another size, the layout of your pictures scales with the frame, in one undo step named **Change resolution**:

- Each picture keeps its place relative to the frame: its position moves in proportion to the new width and height.
- Each picture grows or shrinks by the smaller of the two size changes, so a picture that fit inside the old frame fits inside the new one. Angles and flips stay.
- Keyframes follow: the positions and scales stored in them change the same way, so animated pictures keep their motion in the new frame. See [Keyframes](keyframes.md).
- Pictures on locked tracks are scaled too.

For example, going from **9:16 · 1080×1920** to **4:5 · 1080×1350** makes every picture about 70% of its size: a full-frame vertical video now fits the height of the new frame, with bands at the sides. To cover the new frame, select the clips and click **Fill frame** in **Edit Properties**; to refit a picture to the frame, click **Fit in frame** or **Reset transform**. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture).

Choosing to keep the layout as it is when you change the resolution is available in a later version.

## Related pages
- [Getting started](getting-started.md)
- [The workspace](workspace.md)
- [Importing media](importing-media.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Timeline](timeline.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Advanced trimming](advanced-trimming.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Proxies](proxies.md)
- [Editing properties](editing-properties.md)
- [Titles and text](titles-and-text.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 40, 2026-10-18</sub>
