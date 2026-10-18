# Offline media and relinking

A media item is offline when the editor can't read its file: a linked file was moved or renamed, a copy was deleted from the project's `media` folder, the browser needs your permission again, or Chrome can't decode the file. Its clips stay where they are on the timeline and show a gray slate until you relink the item to a file or give the browser access. Use this page when a card shows a red badge, or a message says that media files are offline.

> **Video placeholder: Find and relink offline media**
> - File: `videos/offline-media-and-relinking/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows: a project whose two linked videos were moved to another folder on the disk; open it from **Recent projects**: the message **2 media files offline** appears; the two cards show a red **Offline** badge and a **Relink…** button over their picture, and the strip under the search field reads "2 files offline" with **Relink folder…**; on the timeline the two clips are gray with a red **Offline** badge; with the playhead over the first clip, the preview shows a gray slate with the file name and "Media offline"; click **Relink…** on the first card and pick the moved file: the message **Relinked linked.mp4** appears and the video is back in the preview and on the timeline; click **Relink folder…** and pick the folder the files were moved to: **Relinked 1 of 1 offline file**; the notice strip disappears.

## In this page
- [Why media go offline](#why-media-go-offline)
- [See which media are offline](#see-which-media-are-offline)
- [What offline clips look like](#what-offline-clips-look-like)
- [Give the browser access to linked files](#give-the-browser-access-to-linked-files)
- [Relink a media item to a file](#relink-a-media-item-to-a-file)
- [Relink many files from a folder](#relink-many-files-from-a-folder)
- [What relinking keeps](#what-relinking-keeps)
- [Clips of removed media](#clips-of-removed-media)
- [Messages about offline media](#messages-about-offline-media)

## Why media go offline

| Badge on the card | What happened | What to do |
| --- | --- | --- |
| **Offline** | The file is missing. A [linked file](importing-media.md#copy-or-link-your-files) was moved, renamed or deleted, or you opened the project in another browser or on another computer, where the links don't exist. Or a copy was removed from the project's `media` folder. Media pasted from another project that this one doesn't have are offline too. | [Relink it](#relink-a-media-item-to-a-file), or [relink a folder](#relink-many-files-from-a-folder). |
| **No access** | The file is linked and still there, but the browser needs your permission again to read it, for example after you restart the browser. | [Give the browser access](#give-the-browser-access-to-linked-files). |
| **Can't play** | The file is there, but the preview can't decode it, for example an HEVC video on a computer without an HEVC decoder. | Convert the file, for example to H.264 MP4, and [relink the item](#relink-a-media-item-to-a-file) to the converted file. |

The editor checks every media file when you open a project, and checks new media as they come in. A file that disappears while the project is open is found the next time the editor reads it. **Can't play** appears once the preview tries to show the media, so after you put one of its clips under the playhead.

> **Note:** If you put a missing file back where it was while the project is open, the item stays offline. Reopen the project, or relink the item to the file.

## See which media are offline

- **A message when you open the project**, for example **2 media files offline**, with "Their clips show a gray slate. Relink them from the Media panel." When all of them only need your permission, it reads "Click Allow access in the Media panel to read the linked files." instead.
- **A notice strip** in the **Media** tab, under the search field, for example "2 linked files need your permission · 1 file offline". It offers **Allow access** for linked files that wait for permission, and **Relink folder…** for the others. The strip disappears when no media is offline.
- **A red badge on the card**: **Offline**, **No access** or **Can't play**, with a **Relink…** (or **Allow access**) button over the picture. Point at the badge for the reason. In list view, the badge sits after the name; click it to relink, or to allow access.
- **On the timeline**, the media's clips are gray. See [What offline clips look like](#what-offline-clips-look-like).

The media menu of an offline item starts with **Allow access** (for files that need permission), **Relink…** and **Relink from folder…**.

## What offline clips look like

> **Video placeholder: Offline clips on the timeline and in the preview**
> - File: `videos/offline-media-and-relinking/offline-clips.mp4` (not recorded yet)
> - Length: about 25 seconds
> - Shows: a project with an offline video on V1 under a title on V2, and its sound on A1; point at the gray clips on V1 and A1 and their red **Offline** badges; put the playhead over the video: the preview shows a gray rectangle where the video would be, with its file name and "Media offline", and the title on top; press <kbd>Space</kbd>: the title plays over the slate and the video's sound is silent.

**On the timeline**, video, audio and image clips of offline media are drawn gray, with no thumbnails and no waveform, and a red **Offline** badge at the right end of their label bar. You can still select, move, trim, split and delete them as usual. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).

**In the preview**, a video or image clip of offline media shows a gray slate: a rectangle where the picture would be, at its size, position, angle and crop, with the media's name and the reason on it:

| Slate text | Why |
| --- | --- |
| **Media offline** | The file is missing. |
| **Media offline: no access** | The browser needs your permission to read the linked file. |
| **Media can't be played** | Chrome can't decode the file. |
| **Media removed** | You removed the media item from the project and kept its clips. See [Clips of removed media](#clips-of-removed-media). |

Other clips draw over and under the slate as usual. During a transition, the offline side shows no picture, not even the slate. A clip whose file is missing or not readable plays no sound.

## Give the browser access to linked files

The browser protects your files: after a restart, it asks again before the editor can read a linked file.

- **When you open the project** from the start screen with a click, Chrome usually asks right away whether Shorts Editor may view the files. Allow it.
- **Otherwise**, or if you closed the prompt, click **Allow access** in the notice strip of the **Media** tab, on the card, or in the media menu. When Chrome asks, allow it.

Chrome may allow every linked file at the first prompt. The items come back online at once, and their clips show their picture and play their sound again. If some files are still waiting, the message **2 linked files still offline** appears, with "The browser did not allow reading them. Try again, or relink them.": click **Allow access** again.

## Relink a media item to a file

Relinking points an offline media item at a file, so that its clips show it again. The clips keep their place, trims, speed, keyframes and effects.

1. In the **Media** tab, click **Relink…** on the offline card. Or select the card and choose **Relink…** in its media menu.
2. In the file picker, choose the file. The picker lists the files of the item's kind (video, audio or images); you can switch it to all files.
3. Click **Open**.

When the file fits, the message **Relinked** followed by the item's name appears and the item is back online. Its name in the Media panel doesn't change.

The file must:

- be of the same kind as the item: a video for a video, an audio file for an audio item, an image for an image;
- be at least as long as the clips need: as long as the latest part of the media that any of its clips uses;
- have sound, when audio clips on the timeline use the item.

Otherwise the message **Can't relink** with the item's name gives the reason, and nothing changes. See [Messages about offline media](#messages-about-offline-media).

**Where the new file goes.** A copied item gets a copy of the new file in the project's `media` folder. A linked item links to the new file where it is. An item pasted from another project follows the choice in **Settings** > **Media**. See [Copy or link your files](importing-media.md#copy-or-link-your-files).

A relink is one step in the history (**Relink media**). <kbd>Ctrl</kbd>+<kbd>Z</kbd> points the item back at its old file, so it is offline again; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> relinks it again.

> **Tip:** You can relink only offline items: online media have no **Relink…** button or menu row. For items that only wait for your permission, **Relink…** in the media menu is dimmed: use **Allow access** instead.

## Relink many files from a folder

> **Video placeholder: Relink a folder of moved files**
> - File: `videos/offline-media-and-relinking/relink-folder.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: a project with five offline videos after their folder "Footage" was moved to another drive; click **Relink folder…** in the notice strip of the **Media** tab; pick the moved "Footage" folder and allow Chrome to view it; the message **Looking for 5 files in Footage…** appears, then **Relinked 5 of 5 offline files**; the badges and the notice strip disappear and the timeline clips get their thumbnails back.

When a whole folder of files moved, relink them in one go:

1. Do one of these:
   - Click **Relink folder…** in the notice strip of the **Media** tab.
   - Right-click an offline card and choose **Relink from folder…**.
2. Pick the folder the files are in now. Chrome may ask you to let the site view its files: allow it.
3. The message **Looking for 2 files in Footage…** appears while the editor looks through the folder, then the result, for example **Relinked 2 of 2 offline files**.

**Which items.** The selected offline items. When none of the selected items is offline, every offline item of the project.

**How the files are found.** The editor looks through the folder and all its subfolders, up to 20,000 files, for a file with the item's file name: the name of its file first, then its name in the Media panel. Upper and lower case don't matter.

- For media imported with this version, the file must also have the same size as the original, so a file with the same name but other content is not taken.
- For media imported with an earlier version, which don't know their size, the name must belong to only one file in the folder.
- The file found must then fit, as for a single relink: the same kind, long enough, and with sound when audio clips use it.

All the items found are relinked in one step in the history. The message lists what was left: for example "1 file not found in Footage (same name and size)", "only its first 20,000 files were searched" when the folder holds more files, or the reason a file found was refused.

> **Tip:** Pick the folder that holds the files, not a whole drive: looking through a large folder takes longer, and the search stops after 20,000 files.

## What relinking keeps

- **The same file, moved or copied:** when its size, length and picture size match, the item keeps its thumbnails, waveform and proxy. Nothing is made again.
- **A different file**, for example a converted copy: the item takes the new file's details (length, resolution, frame rate, formats), and its thumbnails, waveform and card picture are made again from the new file, as is its [proxy](proxies.md) when the new file needs one. The clips keep their position and scale, so a picture with another resolution can look larger or smaller.

## Clips of removed media

When you remove media that clips use and click **Remove from project**, the clips stay on the timeline as offline clips, with the slate **Media removed**. See [Remove media](importing-media.md#remove-media).

These clips have no media item left, so you can't relink them. To get the picture back, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the media item comes back with its clips online. If you also deleted its copied file, the item comes back offline: relink it to the original file. To get rid of the clips, select them on the timeline and press <kbd>Delete</kbd>.

## Messages about offline media

| Message | What it means | What to do |
| --- | --- | --- |
| **2 media files offline** | The editor could not read these files when you opened the project. | See [See which media are offline](#see-which-media-are-offline). |
| **2 linked files still offline** | The browser did not allow reading some linked files. | Click **Allow access** again, or relink them. |
| **Relinked** *name* | The item is back online with the file you chose. | Nothing. |
| **Can't relink** *name*: *file* **is shorter than its clips need** | The file is shorter than the part of the media the clips use. | Pick the full-length file. |
| **Can't relink** *name*: *file* **has no sound for its audio clips** | Audio clips use the item, but the file has no sound. | Pick a file with sound. |
| **Can't relink** *name*: *file* **is audio, not video** (or another kind) | The file is not of the item's kind. | Pick a file of the same kind. |
| **Can't relink** *name*: *file*: **unsupported file type** | The editor doesn't import this type of file. | See [Supported file types](importing-media.md#supported-file-types). |
| **Relinked 1 of 2 offline files** | Some items were not found in the folder, or their file was refused. The details say why. | Relink the others one by one, or pick another folder. |
| **No offline media to relink** | No media item is offline. | Nothing. |
| **Could not open the file picker** or **Could not open the folder picker** | Chrome could not show the picker. | Try again. |
| **Relink failed** | Something unexpected stopped the folder relink. Nothing was changed. | Try again. |
| **This project is read-only** with "Allow editing to relink media." | The project is open without write access. | Click **Allow editing**. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode). |

## Related pages
- [Importing media](importing-media.md)
- [Organizing media](organizing-media.md)
- [Projects and saving](projects-and-saving.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Preview and playback](preview-and-playback.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Proxies](proxies.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 41, 2026-10-18</sub>
