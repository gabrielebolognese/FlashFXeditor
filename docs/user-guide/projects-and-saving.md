# Projects and saving

Every Shorts Editor project is a folder on your disk. The editor saves your work automatically, keeps backups of earlier versions, lets you undo changes, and remembers where you left off. This page explains what the project folder holds, how saving and undo work, how to recover after a crash, how to go back to an earlier version, how to clear the cache, and what happens when a project is read-only. To change the frame size, frame rate or background, see [Project settings and templates](project-settings-and-templates.md).

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
- [Clear the cache](#clear-the-cache)
- [Work in read-only mode](#work-in-read-only-mode)
- [Related pages](#related-pages)

## What is in the project folder

When you create a project, the editor fills the folder you picked with these items:

| Item | What it holds |
| --- | --- |
| `project.json` | The project itself: settings, tracks, clips, markers and the list of media. Each save also writes the version of the editor that saved it, the one **Settings** > **About** shows; see [See the version and get help](settings.md#see-the-version-and-get-help). |
| `session.json` | Where you left off: playhead, in and out points, the marked parts of media items, the timeline and preview zoom, the preview quality and overlays, panel sizes, the folded sections of **Edit Properties** and similar view settings. If it is missing or damaged, the project still opens, with default view settings. |
| `media` | Copies of the files you import. Files you link to stay where they are and are not copied here. See [Copy or link your files](importing-media.md#copy-or-link-your-files). |
| `cache` | Thumbnails, sound analysis and indexes the editor builds from your media, and the proxies of heavy videos in `cache/proxies` (see [Proxies](proxies.md)). While a video or audio export runs, the unfinished file is written in `cache/export-temp`. Nothing in it is lost for good: to free disk space, use **Clear cache**, and the editor builds what it needs again. See [Clear the cache](#clear-the-cache). |
| `history` | Automatic backups of `project.json`: the newest 20. **History…** in the **Project** section lists them and restores one. See [Restore an older version](#restore-an-older-version). |
| `fonts` | Copies of every font your text clips and captions use, whether it comes with the editor, from **My fonts** or from your computer, and `fonts.json`, the list of those copies. Created with the first text clip or caption track. The editor uses these copies when it opens the project, so the text looks the same on a computer without those fonts. See [Fonts travel with the project](fonts.md#fonts-travel-with-the-project). |
| `exports` | Your exported videos, and the frames, audio files and caption files you save from the **Export** tab, unless you choose another place with **Choose file…**. Created by the first export. See [Find the exported file](exporting-video.md#find-the-exported-file). |
| `presets/text` | The project's own text presets, one `.json` file per preset: the **Project** list of the **Presets** tab. See [Keep presets for all projects or for one](text-presets.md#keep-presets-for-all-projects-or-for-one). |
| `project.json.tmp` | Exists only for a moment during each save. If one is left over after a crash, the editor offers to restore it. See [Restore unsaved changes after a crash](#restore-unsaved-changes-after-a-crash). |

> **Note:** Transcription models are not in the project folder: your browser keeps them for all your projects. See [Manage downloaded models](transcription.md#manage-downloaded-models).

> **Important:** Keep the project folder together. Do not rename, move or delete files inside `media` or `fonts`: the project refers to them by name. A media file that is gone makes its media item offline, with gray slates for its clips, until you relink it; see [Offline media and relinking](offline-media-and-relinking.md). To move a project, move the whole folder, then open it with **Open project**. Media you linked instead of copying are not in the folder, so they don't move with it.

> **Note:** Do not edit `project.json` while the project is open in the editor. The next save replaces it. If you edit it in a text editor while the project is closed, you can save it as UTF-8 with or without a byte order mark (BOM): the project opens either way.

## How autosave works

You never need to save by hand. After each change, the editor waits for a short pause and then saves:

- By default it saves 1 second after your last change.
- While you keep making changes, it still saves at least every 5 seconds.
- Each save first writes a temporary copy, keeps the previous version of `project.json` as a backup in `history`, then writes the new `project.json`.
- Where you left off (playhead, zoom, panel sizes) is saved separately, every 10 seconds when something changed.
- When you switch to another browser tab, minimize the window, close the tab or open another project, the editor saves pending changes right away.

You can change the pause with **Autosave** in **Settings** > **General** or in the **Project** section: **1 s after the last change** (default), **2 s**, **5 s** or **10 s**. With **10 s**, the editor also waits up to 10 seconds during continuous editing. This setting applies to every project in this browser. See [Change how often the project saves](settings.md#change-how-often-the-project-saves).

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
- The history lasts while the project is open. Opening a project (also after a reload) starts with an empty history, and so do restoring unsaved changes after a crash and restoring a version from **History**.
- In a text field, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes your typing in that field, not a change to the project.

What you can undo:

| Undoable (one step each) | Not undoable |
| --- | --- |
| Renaming the project | Moving the playhead and playing |
| Changing the resolution (with **Scale layout** or **Keep**), the background color, and the frame rate with every timing it converts | Selecting clips, tracks, a cut (edit point), a gap or a marker |
| Importing media, renaming media, removing media | Zooming, scrolling and panning the timeline (also with the scrollbars), zooming and panning the preview, the preview quality, overlays and fullscreen |
| Adding media to the timeline: each insert, overwrite, drag, drop on the preview or **Add to canvas**; dropped files with their import are one step | Panel sizes, panel tabs, the media view and sort order, skimming media cards |
| Moving, inserting, duplicating and nudging clips (a quick series of nudges is one step) | **Loop playback**, **Snap**, **Linked selection**, **Ripple mode**, **Audio scrub**, the timecode format, and every setting of **Settings** (also the **Autosave**, duration, transition, proxy and cache rows of the **Project** section) |
| | Restoring a version from **History**, **Clear cache**, and saving or deleting templates |
| Moving, resizing, rotating and cropping layers in the preview and moving their anchor point (one step per drag), nudging them with the arrow keys (a quick series is one step), **Fit**, **Fill**, **Center**, the flips, **Reset transform**, **Bring forward** and **Send backward** | Folding and opening the sections of **Edit Properties**, the scale lock in the **Transform** section, and the recent colors of the color picker |
| Values typed or dragged in **Edit Properties**: position, scale, rotation, anchor, crop, opacity, the clip times, and the shape, fill, size and corner radius of a solid (one step per value, per drag, or per quick series of arrow presses) | Turning crop mode on or off, the crop units (**px** or **%**) and the crop **Aspect** lock |
| **Crop to frame** and resetting a crop | |
| Fades (each fade handle drag, **Fade in 0.5 s**, **Fade out 0.5 s** and each fade length in the clip menu), and adding, changing and deleting transitions | Selecting a transition |
| Audio changes: a clip's volume (each typed value, rubber band drag or quick series of arrow presses), volume keyframes, muting and unmuting clips, **Normalize**, **Auto-duck music** and **Detach audio** | The listening volume and the **Mute** button under the preview |
| Adding a solid with **Add solid**, and adding images with **Add image** (the import and the clips are one step) | |
| Duplicating clips with <kbd>Ctrl</kbd>+<kbd>D</kbd> or **Duplicate**, turning clips off and on (**Disable**, **Enable**) | |
| **Cut**, **Paste**, **Paste insert**, pasting keyframes and **Paste attributes** (one step each) | Copying clips or keyframes |
| Applying a text preset, adding a text from a preset, and linking a text to the preset you save it as | Text presets themselves: saving, updating, renaming, duplicating, deleting, importing and syncing presets, favorites, sets and tags, **Apply position** and the default title and subtitle; showing, hiding and reordering the preset bar |
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
- whether the preset bar is shown, and the set it shows (see [The preset bar](preset-bar.md))
- the choice in the **Edit** row of **Caption style**: **All cues** or **Selected** (see [Give single cues their own style](captions.md#give-single-cues-their-own-style))
- the media panel tab, view (grid or list) and sort order, the bin you show, the filter chips that are on and the list column widths (see [Organizing media](organizing-media.md)), and the **Global** or **Project** list of the **Presets** tab
- whether **Loop playback** is on
- whether **Snap** is on
- whether **Linked selection** is on
- whether **Ripple mode** is on
- whether **Audio scrub** is on
- the active tool (**Select**, **Razor**, **Hand**, **Slip**, **Slide** or **Rate stretch**)
- the selected clips or tracks
- the sections you folded in **Edit Properties**
- the panel sizes

The undo history, a selected cut (edit point), a selected gap, a selected marker, crop mode, the fullscreen preview and the text in **Search media** are not restored. Markers are part of the project itself, so they are always there. Because the view is saved every 10 seconds, the last few seconds of view changes can be missing after a browser crash; your project changes are saved separately by autosave.

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

> **Video placeholder: Restore an older version from History**
> - File: `videos/projects-and-saving/history.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. Rename the project "One" and wait for the green dot; rename it "Two" and wait again.
>   2. Click an empty area of the timeline tracks, then **History…** in the **Project** section: the **History** dialog lists the versions, newest first, each with its time, project name and size; the first one reads **latest backup**.
>   3. Click **Restore…** on the version named "One": **Restore this version?** names the time. Click **Restore**.
>   4. The app bar shows "One" and a message names the version's time. Click **History…** again: the newest version is named "Two", the state before the restore.
>   5. Click **Done**.

Every save keeps the previous version of `project.json` in the `history` folder, so you can go back to an earlier state of the project.

1. Click an empty area of the timeline tracks so the **Project** section shows, then click **History…**. You can also run **History…** in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
2. The **History** dialog lists the versions, newest first. Each row shows when that version was saved, in your local time, then the project's name in that version and the size of the file. The newest row also reads **latest backup**.
3. Click **Restore…** on the version you want (tooltip **Make this version the current one**).
4. **Restore this version?** names the project and the time of the version: "The current version is saved first and stays in History, so you can come back to it. Undo history starts over."
5. Click **Restore** to go back to that version, or **Back** to return to the list.

What happens when you restore:

- Your current state is saved first, so it becomes the newest version in **History**. To undo a restore, open **History…** again and restore that newest version.
- The project switches to the version you chose and is saved right away. The message **Restored the version from** and the time appears: "The version before it is the newest entry in History."
- The undo history starts empty.
- Autosave goes on as usual.

If the current state can't be saved first, nothing is restored and the message **Can't restore this backup** explains why. Click **Done** or press <kbd>Escape</kbd> to close the list without restoring. Before the first saves, the list reads "No earlier versions yet: they appear after the first saves."

> **Important:** `history` keeps only the newest 20 backups. Because every save makes one, 20 backups can cover just the last few minutes of work, and each <kbd>Ctrl</kbd>+<kbd>S</kbd> adds one even without changes. A restore adds one too. Copy a backup somewhere else if you want to keep it.

### Restore a version when the project doesn't open

When `project.json` is damaged and the project no longer opens, restore a backup in File Explorer instead:

1. Reload the page so the start screen appears.
2. In File Explorer, open the project folder and then its `history` folder. Backups are named `project-YYYYMMDD-HHMMSS.json`. Saves within the same second get `-2`, `-3` and so on.
3. Rename the current `project.json` in the project folder, for example to `project-before-restore.json`, so you can go back to it.
4. Copy the backup you want into the project folder and rename the copy to `project.json`.
5. Open the project from **Recent projects**.

> **Note:** Backup file names use UTC time, not your local time, so the hour can differ from your clock. The **History** dialog shows your local time.

## Clear the cache

> **Video placeholder: Clear the cache**
> - File: `videos/projects-and-saving/clear-cache.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A project with a 1080p 60 fps video (its card shows a green **PX** chip) and a video with sound on the timeline, with thumbnails and waveforms.
>   2. Click **Settings** (the gear), scroll to **Storage**: **Cache** reads, for example, "777 KB · 11 files".
>   3. Click **Clear cache**: **Clear the cache?** names the project and the size. Click **Clear cache**.
>   4. The message **Cleared 777 KB of cache** appears. Click **Done**: the **PX** chip shows its progress, then turns green again, and the thumbnails and waveforms come back by themselves.

The `cache` folder holds what the editor builds from your media: thumbnails, posters, waveforms, sound indexes and proxies. Proxies can make it large. Clearing it frees that space, and the editor builds everything again in the background from your media.

1. Find the **Cache** row: in **Settings** > **General**, under **Storage**, or in the **Project** section. It shows the size, for example "777 KB · 11 files", or **Empty**.
2. Click **Clear cache** (tooltip **Delete this project's proxies, thumbnails and waveforms: they are made again**). You can also run **Clear cache** in the command palette.
3. **Clear the cache?** names the project and the size: "Nothing of the project is lost: they are made again in the background, proxies of long videos take a while. Media files stay where they are."
4. Click **Clear cache**. The row reads **Clearing…**, then the message **Cleared** with the size appears: "Thumbnails, waveforms and proxies are made again in the background."

What to know about clearing the cache:

- Only the `cache` folder is emptied. The project, its media files, `history`, `fonts` and presets stay, and so does the undo history.
- Thumbnails and waveforms come back within moments. Proxies are made again, which takes about as long as the videos themselves; until a proxy is ready, the original video plays. See [Proxies](proxies.md).
- Clearing the cache is not an undo step.
- It is not available in a read-only project: the message **This project is read-only** reads "Allow editing to clear the cache."
- It waits while a video export runs: the message **An export is running** reads "Clear the cache once it has finished." See [Keep editing while you export](exporting-video.md#keep-editing-while-you-export).
- If something goes wrong, the message **Can't clear the cache** gives the reason.

You can also delete the `cache` folder in File Explorer while the project is closed. The editor builds what it needs again the next time you open the project.

## Work in read-only mode

> **Video placeholder: Read-only mode and Allow editing**
> - File: `videos/projects-and-saving/read-only-mode.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: reload the page and click a project in **Recent projects**; when the browser asks for permission to edit files, refuse it (allow viewing if asked); the editor opens with the read-only notice in the middle of the app bar and a grey save dot; hover the notice, then the dot, to show their tooltips; rename the project in the app bar; open **History…** in the **Project** section and point at the dimmed **Restore…**; click **Done**; press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>: **Discard unsaved changes?** appears; click **Allow editing** and allow editing in the browser prompt; close the dialog with **Cancel**; the notice is gone and the save dot turns gold, then green.

A project opens read-only when the editor may read the project folder but not write to it. This happens when:

- you refuse edit permission in the browser prompt, or
- you dropped the folder on the start screen and the browser did not ask for edit permission.

You then see a notice with a lock in the middle of the app bar, **Read-only: changes are not saved**, followed by an **Allow editing** button, and the save dot is grey. Point at the notice for the whole sentence: "Shorts Editor has no permission to write to this folder, so changes are not saved." The notice takes no room from the panels, so nothing moves when it appears or goes away.

In read-only mode you can look at the project and even make changes, but nothing is written to the folder: no saves, no backups, no new proxies, no copies of the fonts your text uses, no changes to the project's text presets (new presets go into the **Global** list), and your view (playhead, zoom, panel sizes) is not saved with the project. Proxies already in the folder are still used.

Actions that need to write to the folder are refused with the message **This project is read-only** and what to do, for example "Allow editing to clear the cache.": importing and removing media, bins, **Generate proxy** and **Remove proxy**, relinking, **Clear cache**, restoring a version and exporting into the `exports` folder ("Allow editing to export into the project's folder."). To export from a read-only project, choose **Choose file…** under **Save to** in the **Export** tab; see [Choose where the file goes](exporting-video.md#choose-where-the-file-goes). **History…** still lists the versions, but **Restore…** is dimmed (tooltip **Read-only project: allow editing to restore**). **Save as template…** works, because templates are kept in your browser.

To start saving:

1. Click **Allow editing** in the app bar, or click the grey save dot.
2. Allow editing when the browser asks.
3. The notice disappears, and the changes you made in the meantime are saved.

If you refuse again, the project stays read-only.

### Before read-only changes are lost

Changes made in read-only mode exist only in the tab. The editor asks before they are lost:

- When you start a new project (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>) or open another one (<kbd>Ctrl</kbd>+<kbd>O</kbd>, or the command palette), **Discard unsaved changes?** appears first: "<name> is read-only: your changes to it were never saved and are lost when another project opens."

  | Button | What happens |
  | --- | --- |
  | **Cancel** (or <kbd>Escape</kbd>) | You stay in the project with your changes. |
  | **Allow editing** | The browser asks for permission to write to the folder; once you allow it, your changes are saved into the project folder. |
  | **Discard and continue** | Your changes are dropped and the folder picker opens. |

- When you close or reload the tab, Chrome asks whether you want to leave (or reload) the site. Click **Cancel** to stay, then click **Allow editing**. Chrome also asks when the last save failed (red save dot).

## Related pages
- [Exporting your video](exporting-video.md)
- [Getting started](getting-started.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Settings](settings.md)
- [The workspace](workspace.md)
- [Importing media](importing-media.md)
- [Organizing media](organizing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
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
- [The preset bar](preset-bar.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 53, 2026-10-19</sub>
