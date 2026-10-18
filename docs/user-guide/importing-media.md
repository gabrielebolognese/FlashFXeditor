# Importing media

Import brings your video, audio and image files into the project so you can use them on the timeline. Shorts Editor copies each file into the project folder (or, if you choose, links to it where it is), reads its details (duration, size, frame rate, rotation) and shows it in the Media panel. There you can browse, skim, sort, rename and remove your media, and follow the proxies the editor makes of heavy videos. To sort media into bins, search and filter them, see [Organizing media](organizing-media.md).

> **Video placeholder: Import and organize media**
> - File: `videos/importing-media/import-overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: an open project with an empty Media panel ("No media yet"); click **Import media** in the middle of the panel; in the file picker, select a portrait iPhone .mov, an Android .mp4, a .png and an .mp3, then click **Open**; the four cards appear selected, with upright thumbnails, duration badges and detail lines ("1080×1920 · 30 fps", "MP3", "PNG · 640×480"); switch to **List view** and point at the columns; switch back to **Grid view**; open the project folder in File Explorer and show the four files in its `media` folder.

## In this page
- [Import files](#import-files)
- [Drop files and folders](#drop-files-and-folders)
- [Paste images](#paste-images)
- [Supported file types](#supported-file-types)
  - [HDR videos](#hdr-videos)
- [What happens when you import](#what-happens-when-you-import)
- [Copy or link your files](#copy-or-link-your-files)
- [Browse your media](#browse-your-media)
- [Sort media](#sort-media)
- [Select media](#select-media)
- [Rename media](#rename-media)
- [Remove media](#remove-media)
- [Use the media menu](#use-the-media-menu)
- [Check failed imports](#check-failed-imports)
- [Fix import problems](#fix-import-problems)

## Import files

1. Open a project. See [Projects and saving](projects-and-saving.md).
2. Do one of the following:
   - In the Media panel header, click **Import media** (the import icon at the right end).
   - Press <kbd>Ctrl</kbd>+<kbd>I</kbd>. This works in every panel, except while you are typing in a text field.
   - If the Media panel is empty, it reads **No media yet** ("Import video, audio and images, or drop files here."): click the **Import media** button in the middle of the panel.
   - If the timeline has no clips yet, click **Import media** in the middle of the tracks.
3. In the file picker, select one or more files. The file-type list offers **Video**, **Audio** and **Images**, and you can switch to showing all files.
4. Click **Open**.

The imported items appear in the Media panel and are selected. A single import is one step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes all the items it added.

> **Tip:** To add an imported item to the timeline, double-click its thumbnail or drag it onto a track. See [Adding media to the timeline](adding-media-to-the-timeline.md).

> **Tip:** To import images and put them on the timeline in one go, click **Add image** in the timeline toolbar: the images you pick land at the playhead, centered in the frame. See [Add an image](shapes-and-images.md#add-an-image).

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

Only images are pasted this way. Paste imports only when the Media panel has the keyboard (the panel you clicked last has it), and not while you are typing in a text field. In the Timeline and Preview panels, <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes copied clips instead; see [Paste clips at the playhead](copy-and-paste.md#paste-clips-at-the-playhead).

## Supported file types

| Kind | File extensions | Notes |
|---|---|---|
| Video | .mp4, .mov, .m4v | The video must use a codec Chrome can decode on your computer, such as H.264, HEVC (H.265) or AV1. Phone recordings from iPhone (HEVC .mov) and Android (H.264 .mp4) work, including portrait and variable frame rate clips. |
| Audio | .mp3, .m4a, .aac, .wav, .ogg | .mp3, .aac, .wav and .ogg files can be up to 45 minutes long. .m4a files, and the sound of videos, have no length limit. |
| Images | .png, .jpg, .jpeg, .webp, .gif, .svg | Animated GIF and WebP files keep their animation length as their duration, and play in a loop on the timeline. An SVG needs a width and height, or a viewBox, and stays sharp at any size. See [Shapes and images](shapes-and-images.md). |

Extensions are not case-sensitive (.MOV works). Any other type, for example .webm, .mkv, .avi or .heic, is refused with a message that names the file. Subtitle files (.srt, .vtt) are refused here too: import them in the **Captions** tab; see [Import an SRT or VTT file](captions.md#import-an-srt-or-vtt-file).

> **Note:** Thumbnails and playback of HEVC video need Chrome's hardware HEVC decoder. Without it, the item is still imported but its card shows the film icon instead of a thumbnail, and its clips on the timeline show no thumbnails.

### HDR videos

HDR videos import like any other video. This includes iPhone videos recorded with **HDR Video** turned on (HLG and Dolby Vision) and other HDR10 or BT.2020 videos. The editor works in standard dynamic range (SDR). It converts the HDR picture to SDR the way Chrome shows the video on a normal screen, so the contrast and colors look right, not pale or washed out. The preview (paused and while playing), the thumbnails, the proxies and exported videos all show the same SDR picture.

> **Note:** On an HDR screen, your phone or the Photos app can show the same video brighter than the editor does. On a normal screen, the two look alike. Exported videos are SDR.

## What happens when you import

For each file, Shorts Editor:

1. **Checks the type** from the file extension (or, for a pasted image, from the image type). Unsupported files are skipped.
2. **Reads the file's details**: duration, picture size, rotation, frame rate, and the video and audio formats. A portrait phone video is shown upright with its displayed size, for example 1080×1920. For a video with a variable frame rate, the most common frame rate is used, for example 30 fps. A file that cannot be read is skipped. A message gives the reason, and the file stays listed in the **Media** tab as a failed import. See [Check failed imports](#check-failed-imports).
3. **Copies the file** into the `media` folder of your project folder. The original file is not changed or moved, and the project keeps working even if you delete or move the original later.
   - If a file with the same name is already in `media`, the copy gets a number, for example `clip (2).mp4`.
   - Characters that are not allowed in file names are replaced with `_`.
   - With **Link to the original files** chosen in **Settings** > **General** > **Media**, the file is not copied: the project reads it where it is. See [Copy or link your files](#copy-or-link-your-files).
4. **Adds all the items to the project in one step**, so one Undo removes the whole import. Undo does not delete the copied files from the `media` folder.
5. **Makes thumbnails** in the background. For each image, a thumbnail of the picture. For each video, first its card thumbnail (the first frame), then the thumbnails that its clips show on the timeline: one every 2 seconds and one every half second of the video. Video thumbnails wait while you play, scrub or drag. Audio items show an audio icon. Thumbnails are saved in the project's `cache` folder, so they appear at once the next time you open the project. If that folder is deleted, the thumbnails are made again. See [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).
6. **Analyzes the sound** of each audio file and each video with sound, in the background while you are not playing, and saves the result in the `cache` folder. Audio clips on the timeline draw their waveform from it. See [Know how sound is loaded](audio.md#know-how-sound-is-loaded).
7. **Makes a proxy** of each heavy video (by default, above 1080p or above 30 fps, such as 4K or 60 fps phone clips): a light copy that the preview plays and scrubs on. Its card shows a **PX** chip that counts up while you keep working. See [Proxies](proxies.md).

### Progress of large imports

When the files you import add up to 32 MB or more, a message at the top of the window shows the progress:

- One file: **Importing** followed by the file name, and the percentage copied.
- Several files: **Importing 2 of 5**, with the current file name and percentage.
- At the end: **Imported 5 of 5 files**. This message closes by itself.

You can keep working while files copy. If you start another import before the first one ends, it begins when the first one finishes. If you close the project during an import, the import stops, the partly copied files are removed, and nothing is added. Linked files are not copied, so they don't count toward the 32 MB.

## Copy or link your files

> **Video placeholder: Link to your files instead of copying them**
> - File: `videos/importing-media/copy-or-link.mp4` (not recorded yet)
> - Length: about 35 seconds
> - Shows: click **Settings** (the gear) in the app bar: the **General** tab opens; scroll to the **Media** group; point at **Copy files into the project folder** (chosen) and its note; click **Link to the original files**; click **Done**; drag a folder named "Footage" from File Explorer onto the Media panel; open the project folder in File Explorer: its `media` folder has no new files; right-click a new card and choose **Reveal in folder**: the message reads **Linked file: Footage/clip.mp4**.

By default, the editor copies every file you import into the project's `media` folder. You can choose to link to your files where they are instead.

1. Click **Settings** (the gear) at the right end of the app bar. The dialog opens on its **General** tab.
2. Scroll to the **Media** group.
3. In the **Import** row, click one of the two choices:

| Choice | What it does | Good for |
| --- | --- | --- |
| **Copy files into the project folder** (the default) | Copies each file into the `media` folder. "The project stays self-contained in one folder you can move or back up." | Projects you move, back up or open on another computer |
| **Link to the original files** | Copies nothing: the project reads your files where they are. "Moved or renamed files go offline until you relink them, and after a restart the browser asks again before reading them." | Large footage you don't want twice on your disk |

4. Click **Done**, or press <kbd>Esc</kbd>. The choice is already in effect.

You can also switch with the command palette: run **Import mode: copy files into the project** or **Import mode: link to the original files**.

What to know about the choice:

- It applies to your next imports, in every project you open in this browser. Media already in the project keep how they were imported.
- Linking works for the files you pick with **Import media** or **Add image**, and for the files and folders you drop on the Media panel or the timeline. Files you paste are always copied.
- The browser keeps the links. In another browser or on another computer, linked media are offline until you relink them. Use copies for projects you move.
- After you restart the browser, it asks again before the editor can read linked files. See [Give the browser access to linked files](offline-media-and-relinking.md#give-the-browser-access-to-linked-files).
- If you move, rename or delete a linked file, its media item goes offline and its clips show a gray slate. See [Offline media and relinking](offline-media-and-relinking.md).
- **Reveal in folder** in the media menu tells you where a linked file is. See [Find a media file on your disk](organizing-media.md#find-a-media-file-on-your-disk).

## Browse your media

The Media panel has three tabs: **Media**, **Presets** and **Captions**. This page is about the **Media** tab. The **Presets** tab holds your text presets (see [Text presets](text-presets.md)), and the **Captions** tab the cues of your captions (see [Captions](captions.md)). Subtitle files (SRT and VTT) are imported from the **Captions** tab, not as media; see [Import an SRT or VTT file](captions.md#import-an-srt-or-vtt-file).

The **Media** tab has two views. Switch between them with the **Grid view** and **List view** buttons in the panel header.

Above the cards, the **Search media** field and the filter chips **Video**, **Audio**, **Images** and **Unused** narrow what the tab shows. On the left, the bin strip shows **All** your media, one kind, or one of the bins you create with **New bin**. See [Organizing media](organizing-media.md). When media are offline, a notice strip under the search field says so; see [Offline media and relinking](offline-media-and-relinking.md).

> **Video placeholder: Sort, rename and remove media**
> - File: `videos/importing-media/organize-media.mp4` (not recorded yet)
> - Length: about 55 seconds
> - Shows: a Media panel with six items in grid view, one of them a 4K clip with a green **PX** chip; choose **Duration** in the **Sort media by** list, then click the **Ascending** button so it becomes **Descending**; switch to **List view**, click the **Resolution** column twice and point at the **Proxy** column (**960×540** for the 4K clip, **None** for the others); Shift+click to select three rows; drag the right edge of the **Name** heading to widen the column; double-click a name, type a new name and press <kbd>Enter</kbd>; select an unused item, press <kbd>Delete</kbd>, and click **Remove from project** in the **Remove media** dialog; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and the item comes back; switch back to **Grid view**, point at a card to show its **Unused** chip, right-click it to show the media menu with **Insert at playhead**, **Overwrite at playhead**, **Add to canvas**, **Generate proxy**, **Remove proxy**, **Regenerate thumbnails**, **Reveal in folder**, **Rename** and **Remove**, and press <kbd>Esc</kbd>.

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

A red badge on the thumbnail (**Offline**, **No access** or **Can't play**) with a **Relink…** or **Allow access** button marks media whose file the editor can't read. See [Offline media and relinking](offline-media-and-relinking.md).

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

The small thumbnail of a row skims too when you move the pointer across it. An offline item shows a red badge after its name; see [See which media are offline](offline-media-and-relinking.md#see-which-media-are-offline).

To make a column wider or narrower, drag the right edge of its heading. Double-click the edge to give the column its default width back. See [Resize the list columns](organizing-media.md#resize-the-list-columns).

The tab, the view, the sort order, the bin you show, the filter chips and the column widths you choose are saved with the project.

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
| Select every item the tab shows | <kbd>Ctrl</kbd>+<kbd>A</kbd> (the Media panel must be active) |
| Clear the selection | Click an empty area of the panel |
| Select with the keyboard | Press <kbd>Tab</kbd> until a card or row has a gold ring, then use the arrow keys, <kbd>Home</kbd> and <kbd>End</kbd>: the item you move to is selected. Hold <kbd>Shift</kbd> to select a range. See [Move through cards and lists](keyboard-navigation.md#move-through-cards-and-lists). |

After an import, the new items are selected. Items that the bin, the filter chips or the search hide are never selected: when you hide selected items, they leave the selection. See [Select what the tab shows](organizing-media.md#select-what-the-tab-shows).

## Rename media

1. Double-click the item's name, or select the item and press <kbd>F2</kbd>.
2. Type the new name.
3. Press <kbd>Enter</kbd> or click elsewhere to keep it. Press <kbd>Esc</kbd> to cancel.

Names can be up to 255 characters. A blank name is ignored and the old name stays. A rename is one step in the history, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes it.

Renaming changes only the name shown in the editor. The file in the `media` folder keeps its name, and clips already on the timeline keep the name they had.

> **Tip:** Double-clicking the name renames the item. Double-clicking anywhere else on the card or row inserts the item at the playhead. See [Insert at the playhead](adding-media-to-the-timeline.md#insert-at-the-playhead).

## Remove media

> **Video placeholder: Remove media and their clips**
> - File: `videos/importing-media/remove-media.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a project with `interview.mp4` on V1 and A1; click its card and press <kbd>Delete</kbd>: the **Remove media** dialog reads "Remove interview.mp4 from the project?" and "Used by 2 clips."; click **Remove from project**: the card disappears, the clips turn gray with a red **Offline** badge, and the preview shows a gray slate with "Media removed"; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the card and the picture are back; press <kbd>Delete</kbd> again, tick **Also delete its copied file from the media folder** and click **Remove and delete clips**: the card and both clips are gone, leaving a gap, and the message **Deleted 1 file from media/** appears.

1. Select one or more items. To remove all the media no clip uses, see [Clean up unused media](organizing-media.md#clean-up-unused-media).
2. Press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, or right-click and choose **Remove**. For the keys, the Media panel must have the keyboard: click in it first.
3. The **Remove media** dialog asks, for example, "Remove interview.mp4 from the project?" or "Remove 3 media files from the project?". When clips on the timeline use the items, it says how many, for example "Used by 2 clips." A video with its sound counts as two clips.
4. Click one of the buttons:

| Button | What it does |
| --- | --- |
| **Remove from project** | Removes the items. Clips that use them stay on the timeline as offline clips: gray, with a slate that reads **Media removed** in the preview. See [Clips of removed media](offline-media-and-relinking.md#clips-of-removed-media). |
| **Remove and delete clips** | Removes the items and every clip that uses them, on every track, locked tracks included. The clips leave gaps; the other clips don't move. Dimmed when no clip uses the items. |

To cancel, press <kbd>Esc</kbd>, click the × button (**Close**), or click outside the dialog.

**Delete the copied files too.** When some of the items have a copy in the project's `media` folder, the dialog also offers **Also delete its copied file from the media folder** (or **Also delete the 3 copied files from the media folder**). Tick it to delete those files from your disk as well, then click one of the buttons. The message **Deleted 3 files from media/** confirms it. Linked files are never deleted, and neither is a copy that another media item still uses. Without the checkbox, the files stay in `media`.

A removal is one step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings back the items, their thumbnails and the deleted clips.

> **Important:** Deleting the copied files can't be undone, as the dialog says: "Can't be undone: the media would come back offline." After <kbd>Ctrl</kbd>+<kbd>Z</kbd>, the items and clips are back, but offline. Relink them to the original files; see [Relink a media item to a file](offline-media-and-relinking.md#relink-a-media-item-to-a-file).

## Use the media menu

Right-click a card or a row to open the media menu. The item you right-click is selected first, unless it is already part of the selection, and the rows act on every selected item.

| Row | What it does |
|---|---|
| **Allow access** | Asks the browser for permission to read the selected linked files again. Shown when one of them waits for permission. See [Give the browser access to linked files](offline-media-and-relinking.md#give-the-browser-access-to-linked-files). |
| **Relink…** | Points an offline item at another file. Shown, with the next row, when an offline item is selected. See [Relink a media item to a file](offline-media-and-relinking.md#relink-a-media-item-to-a-file). |
| **Relink from folder…** | Finds the selected offline items in a folder you pick. See [Relink many files from a folder](offline-media-and-relinking.md#relink-many-files-from-a-folder). |
| **Insert at playhead** (<kbd>,</kbd>) | Inserts the items at the playhead and pushes the later clips right. See [Insert at the playhead](adding-media-to-the-timeline.md#insert-at-the-playhead). |
| **Overwrite at playhead** (<kbd>.</kbd>) | Puts the items at the playhead over what is there. See [Overwrite at the playhead](adding-media-to-the-timeline.md#overwrite-at-the-playhead). |
| **Add to canvas** | Puts the items at the playhead on the top video track (or a new one), in the middle of the frame. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview). |
| **Generate proxy** | Makes a proxy of the selected videos that have none, or whose proxy failed. Dimmed when there is none. See [Make a proxy yourself](proxies.md#make-a-proxy-yourself). |
| **Remove proxy** | Deletes the proxies of the selected videos, and stops one that is being made. Dimmed when none of them has a proxy. See [Remove a proxy or stop one being made](proxies.md#remove-a-proxy-or-stop-one-being-made). |
| **Regenerate thumbnails** | Makes the card picture and timeline thumbnails of the selected videos again. Dimmed when no video is selected. See [Make thumbnails again](proxies.md#make-thumbnails-again). |
| **Reveal in folder** | Shows where the item's file is and copies its path. See [Find a media file on your disk](organizing-media.md#find-a-media-file-on-your-disk). |
| **Move to bin** | A chip per bin, and **None**: moves the items into that bin, or out of every bin. Shown once the project has a bin. See [Put media into a bin](organizing-media.md#put-media-into-a-bin). |
| **Rename** (<kbd>F2</kbd>) | Renames the item. See [Rename media](#rename-media). |
| **Remove** (<kbd>Delete</kbd>) | Opens the **Remove media** dialog. See [Remove media](#remove-media). |

Click a row to run it. Press <kbd>Esc</kbd> or click outside the menu to close it.

## Check failed imports

> **Video placeholder: A damaged file in the Media tab**
> - File: `videos/importing-media/failed-imports.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: rename a text file to `broken.mp4` in File Explorer; drag it and a working clip onto the Media panel; the message **Can't import broken.mp4** appears at the top of the window and the clip's card appears; under the search field, a row shows a red **Failed** badge, `broken.mp4` and "Not a readable MP4/MOV file: it is damaged or is not a video"; the message closes by itself and the row stays; point at the **Failed** badge to show its tooltip; click the **X** at the end of the row: the row disappears.

Sometimes a file of a [supported type](#supported-file-types) can't be brought into the project, for example a damaged video, or a copy that failed because the disk is full. The **Media** tab then keeps a row for that file near the top, under the search field and above the bins and the cards. Each row shows:

- a red **Failed** badge. Its tooltip reads "This file could not be imported: it is not in the project".
- the icon of the file's kind: video, audio or image.
- the file name.
- the reason, for example "Not a readable MP4/MOV file: it is damaged or is not a video". Point at a shortened name or reason to read it whole.
- **Dismiss** (the **X**) at the right end.

What to know:

- The file is not in the project. It has no card, and you can't select its row, drag it or put it on the timeline.
- The message at the top of the window still appears and closes by itself. The row stays until you dismiss it.
- Fix the file, for example export it again, and import it again. When it imports, its row disappears. If it fails again, the row shows the new reason.
- To remove one row, click its **X**. To remove them all, run **Dismiss failed imports** from the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
- The rows are not saved with the project: they disappear when you close the project.
- A file of an unsupported type, such as .webm, gets no row. Only the message names it.

## Fix import problems

When a file is not imported, a message at the top of the window says why. It closes by itself after about 7 seconds (the orange **This project is read-only** after about 5.5 seconds); click its × button (**Dismiss**) to close it sooner. See [Read messages](workspace.md#read-messages). A file of a supported type that could not be read also stays listed in the **Media** tab with its reason; see [Check failed imports](#check-failed-imports). The other files of the same import are still imported.

| Message | What it means | What to do |
|---|---|---|
| **Can't import** *file name*: **Unsupported file type** | The extension is not in the [supported list](#supported-file-types). | Convert the file to a supported type, for example .mp4 or .png. |
| **Can't import** *n* **files** | Several files were refused. The message lists each file with its reason. | Check each reason in this table. |
| **Not a readable MP4/MOV file: it is damaged or is not a video** (or **Not a readable MP4/MOV file: no movie header found**) | The video file is damaged, incomplete, or not really an MP4 or MOV file, for example another file renamed to .mp4. | Export, download or convert it again. |
| **Audio files over 45 minutes cannot be imported yet (this one is** *N* **minutes)** | An .mp3, .aac, .wav or .ogg file is longer than 45 minutes. The editor refuses it before it reads the sound. | Cut it into parts of 45 minutes or less, or convert it to .m4a, which has no length limit. |
| **The file has no video or audio track** | The file holds no picture or sound the editor can use. | Check the file in a media player. |
| **The video track has no samples** | The video track is empty. | Export or convert it again. |
| **The audio cannot be decoded** or **The audio is empty** | Chrome cannot play the audio file, or it has no sound data. | Convert it to .mp3, .m4a or .wav. |
| **The image cannot be decoded** | The image file is damaged or in a variant Chrome cannot read. | Save it again as .png or .jpg. |
| **The SVG has no size (width/height or viewBox)** | The SVG does not say how large it is. | Add width and height, or a viewBox, to the SVG. |
| **Could not copy it into media/** | The copy into the project folder failed, for example because the disk is full. | Free some space and import again. |
| **Could not keep a link to it** | With **Link to the original files** chosen, the browser could not store the link to the file. | Try again, or choose **Copy files into the project folder** in **Settings** > **General** > **Media**. |
| **This project is read-only** | The project is open without write access. | Allow editing first. See [Projects and saving](projects-and-saving.md). |
| **Import failed** | Something unexpected stopped the import. Nothing was added. | Try again. See [Troubleshooting](troubleshooting.md). |
| **Could not open the file picker** | Chrome could not show the file picker. | Try again, or drop the files on the Media panel. |

If a card keeps its kind icon instead of a thumbnail, Chrome could not decode that video, for example HEVC on a computer without a hardware HEVC decoder, and its clips on the timeline show no thumbnails either. The editor tries once per session. The item is still in the project. Once the preview tries to show one of its clips, the card gets the red **Can't play** badge: convert the file and relink the item to the converted file. See [Offline media and relinking](offline-media-and-relinking.md).

## Related pages
- [Organizing media](organizing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Getting started](getting-started.md)
- [Workspace](workspace.md)
- [Projects and saving](projects-and-saving.md)
- [Timeline](timeline.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Preview and playback](preview-and-playback.md)
- [Audio](audio.md)
- [Proxies](proxies.md)
- [Captions](captions.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 47, 2026-10-18</sub>
