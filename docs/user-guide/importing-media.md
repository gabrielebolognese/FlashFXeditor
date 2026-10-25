# Importing media

Import brings your video, audio and image files into the project so you can use them on the timeline. Shorts Editor copies each file into the project folder, reads its details (duration, size, frame rate, rotation) and shows it in the Media panel. There you can browse, skim, sort, rename and remove your media, and follow the proxies the editor makes of heavy videos.

> **Video placeholder: Import and organize media**
> - File: `videos/importing-media/import-overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: an open project with an empty Media panel ("No media yet"); click **Import media** in the middle of the panel; in the file picker, select a portrait iPhone .mov, an Android .mp4, a .png and an .mp3, then click **Open**; the four cards appear selected, with upright thumbnails, duration badges and detail lines ("1080×1920 · 30 fps", "MP3", "PNG · 640×480"); switch to **List view** and point at the columns; switch back to **Grid view**; open the project folder in File Explorer and show the four files in its `media` folder.

## In this page
- [Import files](#import-files)
- [Drop files and folders](#drop-files-and-folders)
- [Paste images](#paste-images)
- [Supported file types](#supported-file-types)
- [What happens when you import](#what-happens-when-you-import)
- [Browse your media](#browse-your-media)
- [Sort media](#sort-media)
- [Select media](#select-media)
- [Rename media](#rename-media)
- [Remove media](#remove-media)
- [Use the media menu](#use-the-media-menu)
- [Fix import problems](#fix-import-problems)

## Import files

1. Open a project. See [Projects and saving](projects-and-saving.md).
2. Do one of the following:
   - In the Media panel header, click **Import media** (the import icon at the right end).
   - Press <kbd>Ctrl</kbd>+<kbd>I</kbd>. This works in every panel, except while you are typing in a text field.
   - If the Media panel is empty, click the **Import media** button in the middle of the panel.
3. In the file picker, select one or more files. The file-type list offers **Video**, **Audio** and **Images**, and you can switch to showing all files.
4. Click **Open**.

The imported items appear in the Media panel and are selected. A single import is one step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes all the items it added.

> **Tip:** To add an imported item to the timeline, double-click its thumbnail or drag it onto a track. See [Adding media to the timeline](adding-media-to-the-timeline.md).

> **Video placeholder: Drop a folder and paste an image**
> - File: `videos/importing-media/drop-folder-and-paste.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: drag a folder from File Explorer (with clips, a subfolder of clips, and a .txt file) over the Media panel; the panel shows **Drop files to import them**; release; the clips from both folders appear and a message at the top of the window names the .txt file as not imported; take a screenshot with <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, click an empty area of the Media panel, press <kbd>Ctrl</kbd>+<kbd>V</kbd>; the screenshot appears as a new image card.

## Drop files and folders

1. In File Explorer, select files, folders, or both.
2. Drag them over the Media panel. The panel shows **Drop files to import them**.
3. Release the mouse button.

Folders are imported with everything inside them, subfolders included. Files of an unsupported type are skipped, and a message names them. The supported files from the same drop are still imported.

> **Tip:** Drop files on a track of the timeline instead to import them and place their clips in one step. See [Drop files from File Explorer onto the timeline](adding-media-to-the-timeline.md#drop-files-from-file-explorer-onto-the-timeline).

## Paste images

1. Copy an image, for example a screenshot or an image from a web page.
2. Click an empty area of the Media panel.
3. Press <kbd>Ctrl</kbd>+<kbd>V</kbd>.

Only images are pasted this way. Paste imports only when the Media panel has the keyboard (the panel you clicked last has it), and not while you are typing in a text field.

## Supported file types

| Kind | File extensions | Notes |
|---|---|---|
| Video | .mp4, .mov, .m4v | The video must use a codec Chrome can decode on your computer, such as H.264, HEVC (H.265) or AV1. Phone recordings from iPhone (HEVC .mov) and Android (H.264 .mp4) work, including portrait and variable frame rate clips. |
| Audio | .mp3, .m4a, .aac, .wav, .ogg | |
| Images | .png, .jpg, .jpeg, .webp, .gif, .svg | Animated GIF and WebP files keep their animation length as their duration. An SVG needs a width and height, or a viewBox. |

Extensions are not case-sensitive (.MOV works). Any other type, for example .webm, .mkv, .avi or .heic, is refused with a message that names the file.

> **Note:** Thumbnails and playback of HEVC video need Chrome's hardware HEVC decoder. Without it, the item is still imported but its card shows the film icon instead of a thumbnail, and its clips on the timeline show no thumbnails.

## What happens when you import

For each file, Shorts Editor:

1. **Checks the type** from the file extension (or, for a pasted image, from the image type). Unsupported files are skipped.
2. **Reads the file's details**: duration, picture size, rotation, frame rate, and the video and audio formats. A portrait phone video is shown upright with its displayed size, for example 1080×1920. For a video with a variable frame rate, the most common frame rate is used, for example 30 fps. A file that cannot be read is skipped, with the reason in a message.
3. **Copies the file** into the `media` folder of your project folder. The original file is not changed or moved, and the project keeps working even if you delete or move the original later.
   - If a file with the same name is already in `media`, the copy gets a number, for example `clip (2).mp4`.
   - Characters that are not allowed in file names are replaced with `_`.
4. **Adds all the items to the project in one step**, so one Undo removes the whole import. Undo does not delete the copied files from the `media` folder.
5. **Makes thumbnails** in the background. For each image, a thumbnail of the picture. For each video, first its card thumbnail (the first frame), then the thumbnails that its clips show on the timeline: one every 2 seconds and one every half second of the video. Video thumbnails wait while you play, scrub or drag. Audio items show an audio icon. Thumbnails are saved in the project's `cache` folder, so they appear at once the next time you open the project. If that folder is deleted, the thumbnails are made again. See [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).
6. **Analyzes the sound** of each audio file and each video with sound, in the background while you are not playing, and saves the result in the `cache` folder. Audio clips on the timeline draw their waveform from it. See [Know how sound is loaded](audio.md#know-how-sound-is-loaded).
7. **Makes a proxy** of each heavy video (by default, above 1080p or above 30 fps, such as 4K or 60 fps phone clips): a light copy that the preview plays and scrubs on. Its card shows a **PX** chip that counts up while you keep working. See [Proxies](proxies.md).

### Progress of large imports

When the files you import add up to 32 MB or more, a message at the top of the window shows the progress:

- One file: **Importing** followed by the file name, and the percentage copied.
- Several files: **Importing 2 of 5**, with the current file name and percentage.
- At the end: **Imported 5 of 5 files**. This message closes by itself.

You can keep working while files copy. If you start another import before the first one ends, it begins when the first one finishes. If you close the project during an import, the import stops, the partly copied files are removed, and nothing is added.

## Browse your media

The Media panel has three tabs: **Media**, **Presets** and **Captions**. The **Presets** and **Captions** tabs are available in a later version.

The **Media** tab has two views. Switch between them with the **Grid view** and **List view** buttons in the panel header.

> **Video placeholder: Sort, rename and remove media**
> - File: `videos/importing-media/organize-media.mp4` (not recorded yet)
> - Length: about 55 seconds
> - Shows: a Media panel with six items in grid view, one of them a 4K clip with a green **PX** chip; choose **Duration** in the **Sort media by** list, then click the **Ascending** button so it becomes **Descending**; switch to **List view**, click the **Resolution** column twice and point at the **Proxy** column (**960×540** for the 4K clip, **None** for the others); Shift+click to select three rows; double-click a name, type a new name and press <kbd>Enter</kbd>; select an item, press <kbd>Delete</kbd>, and click **Remove from project** in the **Remove media** dialog; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and the item comes back; switch back to **Grid view**, point at a card to show its **Unused** chip, right-click it to show the media menu with **Insert at playhead**, **Overwrite at playhead**, **Add to canvas**, **Generate proxy**, **Remove proxy**, **Regenerate thumbnails**, **Rename** and **Remove**, and press <kbd>Esc</kbd>.

### Grid view

Grid view is the default. Each card shows:

- **Thumbnail**: the first frame of a video, or the image. Audio items show an audio icon.
- **Duration badge** on the thumbnail, in minutes and seconds (`mm:ss`, with hours added for an hour or more), rounded to the nearest second. Still images have no badge.
- **Kind icon** (video, audio or image) and the **name**. Point at a long name to see all of it.
- **Detail line**:

| Kind | Detail line | Example |
|---|---|---|
| Video | Displayed size and frame rate | 1080×1920 · 30 fps |
| Audio | Audio format | AAC, MP3 |
| Image | Image format and size | PNG · 640×480 |

When you point at a card:

- A chip in the top-left corner of the thumbnail reads **Unused**, or **Used 2×** with the number of clips on the timeline that use the item. A video with its sound counts as two clips.
- Moving the pointer across the thumbnail of a video or audio item skims through it: a thin red line marks the position and the badge shows its time. See [Skim media in the Media panel](adding-media-to-the-timeline.md#skim-media-in-the-media-panel).

The thumbnail of an item that no clip uses is dimmed. A gold bar along the bottom of a thumbnail marks the part of the item you marked with <kbd>I</kbd> and <kbd>O</kbd>. See [Use only part of a media item](adding-media-to-the-timeline.md#use-only-part-of-a-media-item).

A **PX** chip in the top-right corner of a video's thumbnail shows its proxy: grey while it waits or is being made (with the percentage done and a thin gold bar), green when it is ready, red when it failed. A video with no proxy has no chip. See [Follow a proxy while it is made](proxies.md#follow-a-proxy-while-it-is-made).

### List view

List view shows one row per item, with these columns:

| Column | Shows |
|---|---|
| (thumbnail) | A small thumbnail or icon |
| **Name** | Kind icon and name |
| **Duration** | Length in minutes, seconds and milliseconds, for example `00:03.000`. Empty for still images. |
| **Resolution** | Displayed size, for example 1080×1920 |
| **FPS** | Frame rate, for example 29.97 fps |
| **Codec** | Video or image format, for example HEVC, H.264, PNG |
| **Audio** | Audio format, or empty when there is no sound |
| **Proxy** | The video's proxy: **None**, **Queued**, the percentage done while it is made (for example **42%**), the proxy's size when it is ready (for example **960×540**), or **Failed**. See [Proxies](proxies.md). |
| **Used** | How many clips on the timeline use the item |

The small thumbnail of a row skims too when you move the pointer across it.

The tab, the view and the sort order you choose are saved with the project.

## Sort media

- In the panel header, choose an order in **Sort media by**: **Name**, **Date added** (the default), **Duration** or **Kind**. Kind puts video first, then audio, then images.
- Click the direction button next to it to switch between **Ascending** and **Descending**.
- In list view, click a column heading to sort by that column. Click it again to reverse the order. An arrow marks the sorted column.

Items that tie are ordered by name. Names sort the way people count: "clip 2" comes before "clip 10".

## Select media

| To | Do this |
|---|---|
| Select one item | Click it |
| Add or remove an item | <kbd>Ctrl</kbd>+click it |
| Select a range | Click the first item, then <kbd>Shift</kbd>+click the last |
| Add a range | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click |
| Clear the selection | Click an empty area of the panel |

After an import, the new items are selected.

## Rename media

1. Double-click the item's name, or select the item and press <kbd>F2</kbd>.
2. Type the new name.
3. Press <kbd>Enter</kbd> or click elsewhere to keep it. Press <kbd>Esc</kbd> to cancel.

Names can be up to 255 characters. A blank name is ignored and the old name stays. A rename is one step in the history, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes it.

Renaming changes only the name shown in the editor. The file in the `media` folder keeps its name, and clips already on the timeline keep the name they had.

> **Tip:** Double-clicking the name renames the item. Double-clicking anywhere else on the card or row inserts the item at the playhead. See [Insert at the playhead](adding-media-to-the-timeline.md#insert-at-the-playhead).

## Remove media

1. Select one or more items.
2. Press <kbd>Delete</kbd> or <kbd>Backspace</kbd>. The Media panel must have the keyboard: click in it first.
3. In the **Remove media** dialog, click **Remove from project**.

To cancel, press <kbd>Esc</kbd>, click the × button (**Close**), or click outside the dialog.

The items leave the project, but their files stay in the project's `media` folder. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings them back with their thumbnails.

> **Important:** You can't remove media that clips on the timeline use yet. The dialog then shows how many clips use it, and **Remove from project** is disabled. Removing used media, and the **Remove and delete clips** option, are available in a later version.

## Use the media menu

Right-click a card or a row to open the media menu. The item you right-click is selected first, unless it is already part of the selection, and the rows act on every selected item.

| Row | What it does |
|---|---|
| **Insert at playhead** (<kbd>,</kbd>) | Inserts the items at the playhead and pushes the later clips right. See [Insert at the playhead](adding-media-to-the-timeline.md#insert-at-the-playhead). |
| **Overwrite at playhead** (<kbd>.</kbd>) | Puts the items at the playhead over what is there. See [Overwrite at the playhead](adding-media-to-the-timeline.md#overwrite-at-the-playhead). |
| **Add to canvas** | Puts the items at the playhead on the top video track (or a new one), in the middle of the frame. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview). |
| **Generate proxy** | Makes a proxy of the selected videos that have none, or whose proxy failed. Dimmed when there is none. See [Make a proxy yourself](proxies.md#make-a-proxy-yourself). |
| **Remove proxy** | Deletes the proxies of the selected videos, and stops one that is being made. Dimmed when none of them has a proxy. See [Remove a proxy or stop one being made](proxies.md#remove-a-proxy-or-stop-one-being-made). |
| **Regenerate thumbnails** | Makes the card picture and timeline thumbnails of the selected videos again. Dimmed when no video is selected. See [Make thumbnails again](proxies.md#make-thumbnails-again). |
| **Rename** (<kbd>F2</kbd>) | Renames the item. See [Rename media](#rename-media). |
| **Remove** (<kbd>Delete</kbd>) | Opens the **Remove media** dialog. See [Remove media](#remove-media). |

Click a row to run it. Press <kbd>Esc</kbd> or click outside the menu to close it.

## Fix import problems

When a file is not imported, a message at the top of the window says why. It closes by itself after about 7 seconds; click its × button (**Dismiss**) to close it sooner. The other files of the same import are still imported.

| Message | What it means | What to do |
|---|---|---|
| **Can't import** *file name*: **Unsupported file type** | The extension is not in the [supported list](#supported-file-types). | Convert the file to a supported type, for example .mp4 or .png. |
| **Can't import** *n* **files** | Several files were refused. The message lists each file with its reason. | Check each reason in this table. |
| **Not a readable MP4/MOV file** | The video file is damaged or is not really an MP4 or MOV file. | Export or convert it again. |
| **The file has no video or audio track** | The file holds no picture or sound the editor can use. | Check the file in a media player. |
| **The video track has no samples** | The video track is empty. | Export or convert it again. |
| **The audio cannot be decoded** or **The audio is empty** | Chrome cannot play the audio file, or it has no sound data. | Convert it to .mp3, .m4a or .wav. |
| **The image cannot be decoded** | The image file is damaged or in a variant Chrome cannot read. | Save it again as .png or .jpg. |
| **The SVG has no size (width/height or viewBox)** | The SVG does not say how large it is. | Add width and height, or a viewBox, to the SVG. |
| **Could not copy it into media/** | The copy into the project folder failed, for example because the disk is full. | Free some space and import again. |
| **This project is read-only** | The project is open without write access. | Allow editing first. See [Projects and saving](projects-and-saving.md). |
| **Import failed** | Something unexpected stopped the import. Nothing was added. | Try again. See [Troubleshooting](troubleshooting.md). |
| **Could not open the file picker** | Chrome could not show the file picker. | Try again, or drop the files on the Media panel. |

If a card keeps its kind icon instead of a thumbnail, Chrome could not decode that video, for example HEVC on a computer without a hardware HEVC decoder, and its clips on the timeline show no thumbnails either. The editor tries once per session. The item is still in the project.

## Related pages
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Getting started](getting-started.md)
- [Workspace](workspace.md)
- [Projects and saving](projects-and-saving.md)
- [Timeline](timeline.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Preview and playback](preview-and-playback.md)
- [Audio](audio.md)
- [Proxies](proxies.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 24, 2026-10-16</sub>
