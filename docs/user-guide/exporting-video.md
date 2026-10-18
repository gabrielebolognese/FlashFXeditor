# Exporting your video

When your edit is ready, **Export** turns the whole timeline into an MP4 video with picture and sound, made for Instagram Reels. The file goes into the `exports` folder of your project folder. The export runs in the background, so you can keep editing, pause it or cancel it while it works.

> **Video placeholder: Export a video for Instagram Reels**
> - File: `videos/exporting-video/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1080×1920, 30 fps project named `Promo` with a one-minute edit: two videos with sound and a cross dissolve on V1 and A1, a title on V2 and caption cues on **CC**.
>   2. Click **Export** in the app bar: a message appears at the top of the window: **Exporting Promo-reels-2026-10-18.mp4**, with **Preparing…**, then a line such as `12% · 216 / 1800 frames · 0:31 left` and a gold bar that grows.
>   3. Wait until the message changes to **Exported Promo-reels-2026-10-18.mp4** with `exports/Promo-reels-2026-10-18.mp4 · 84.3 MB · 1080×1920 · 1800 frames`.
>   4. Open the project folder in File Explorer, open `exports` and double-click the file: it plays in the computer's video player, with the dissolve, the title, the captions and the sound in sync.

## In this page
- [Export the whole timeline](#export-the-whole-timeline)
- [Know what the file is like](#know-what-the-file-is-like)
- [Know what goes into the file](#know-what-goes-into-the-file)
- [Follow the progress](#follow-the-progress)
- [Pause, resume or cancel an export](#pause-resume-or-cancel-an-export)
- [Find the exported file](#find-the-exported-file)
- [Keep editing while you export](#keep-editing-while-you-export)
- [When an export doesn't start or stops](#when-an-export-doesnt-start-or-stops)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## Export the whole timeline

1. Check your edit: play it once from the start with <kbd>Home</kbd> and <kbd>Space</kbd>.
2. Click **Export** in the app bar (the gold button at the right), or press <kbd>Ctrl</kbd>+<kbd>E</kbd>. You can also type `export` in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and choose **Export**.
3. The message **Exporting** with the file name appears at the top of the window and shows the progress. See [Follow the progress](#follow-the-progress).
4. When it is done, the message **Exported** gives the file's place in the project folder, its size, its frame size and its number of frames. The file is in the `exports` folder. See [Find the exported file](#find-the-exported-file).

The export always covers the whole timeline: from the very start (`00:00:00`) to the end of the last clip on any track, caption cues included. An empty stretch before the first clip, or a gap between clips, shows the project's background color and has no sound. In and out points don't limit the export.

> **Tip:** To start the video with your first clip, move the clips to the start of the timeline first: click the empty stretch before the first clip and press <kbd>G</kbd>, or press <kbd>Shift</kbd>+<kbd>G</kbd> to close all gaps. See [Close a gap](splitting-and-deleting.md#close-a-gap).

On the development laptop, a 60-second 1080×1920 video at 30 fps took about 30 to 36 seconds to export, and a 10-minute video about 5 minutes. The speed depends mostly on your computer's video encoder. Playing your edit while it exports slows the export down a little.

## Know what the file is like

**Export** uses the settings that Instagram Reels expects:

| Property | Value |
| --- | --- |
| File | MP4 (`.mp4`). The file's index sits at its start, so players and upload sites can start reading it right away. |
| Frame size | 1080×1920 for a 9:16 project. Other projects keep their own shape; see [Frame size](#frame-size). |
| Frame rate | 30 fps, or the project's rate when it is lower; see [Frame rate](#frame-rate). |
| Video | H.264 at about 12 Mbit/s, with a keyframe at least every 2 seconds. The editor uses the best H.264 profile your browser can encode (High, else Main, else Baseline). |
| Sound | AAC, stereo, 48 kHz, 192 kbit/s. If your browser can't encode AAC, the sound is encoded as Opus instead. The file always has a sound track, silent if the timeline has no sound. |
| Size on disk | The video aims at 12 Mbit/s: about 90 MB per minute. Simple pictures, such as a still title on a color, can take much less. |

Picture and sound stay in sync over the whole video: in a 10-minute test export, they were still exactly in sync at the end.

### Frame size

The export keeps the shape of your project. A project larger than 1920 pixels on its long side is scaled down to 1920 pixels; a smaller one keeps its size and is never enlarged. Both sides are always even numbers, rounded down when needed.

| Project resolution | Exported frame size |
| --- | --- |
| **9:16 · 1080×1920** | 1080×1920 |
| **4:5 · 1080×1350** | 1080×1350 |
| **1:1 · 1080×1080** | 1080×1080 |
| **16:9 · 1920×1080** | 1920×1080 |
| **Custom** 2160×3840 | 1080×1920 |
| **Custom** 720×1280 | 720×1280 |

To post a full-screen Reel, use a **9:16** project. See [Change the frame size](project-settings-and-templates.md#change-the-frame-size).

### Frame rate

The export has at most 30 frames per second. A faster project exports every second frame, so each exported frame is a frame of your project and none repeats:

| Project frame rate | Exported frame rate |
| --- | --- |
| **23.976 fps**, **24 fps**, **25 fps**, **29.97 fps**, **30 fps** | The same |
| **50 fps** | 25 fps |
| **59.94 fps** | 29.97 fps |
| **60 fps** | 30 fps |

## Know what goes into the file

The video shows what the preview shows, frame by frame, and plays what you hear:

- **Your original media at full quality.** The export always reads your original files and never uses [proxies](proxies.md), whatever the preview quality.
- **Everything you edited:** trims, speed changes, freeze frames and punch zooms, crops, keyframe animations, fades and transitions, shapes, images, animated stickers and SVG logos, titles with their animations, and the captions of the **CC** track with the spoken word highlighted.
- **Captions are part of the picture.** They are drawn into the video and can't be turned off by the viewer. To upload a separate subtitle file as well, use **Export SRT or VTT**; see [Export an SRT or VTT file](captions.md#export-an-srt-or-vtt-file).
- **Fonts.** Text uses the same fonts as in the preview: the fonts that come with the editor and the fonts from your computer that the project keeps in its `fonts` folder. See [Fonts travel with the project](titles-and-text.md#fonts-travel-with-the-project).
- **Tracks and clips.** Hidden and muted video tracks are left out, as in the preview. On audio tracks, **M** and **S** apply: a muted track, or a track left out by a solo, is not in the sound. Clips you turned off are left out too. See [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks) and [Turn a clip off](editing-properties.md#turn-a-clip-off).
- **Sound.** Clip volumes, volume keyframes, fades and crossfades are in the file. The **Master volume** knob and **Mute** under the preview change only what you hear, never the exported sound. See [Audio](audio.md).
- **Offline media.** A clip whose file the editor can't read shows the same gray slate as in the preview, for example **Media offline**, and has no sound. Relink the file before you export; see [Offline media and relinking](offline-media-and-relinking.md).
- **Nothing that is only on your screen:** no safe zones, grids, guides or rulers, no selection outlines or handles, and nothing of the panel around the frame.

## Follow the progress

While the export runs, a message at the top of the window shows its progress. It stays until the export ends: it has no close button, and newer messages don't push it away.

> **Video placeholder: Pause, cancel and keep editing during an export**
> - File: `videos/exporting-video/pause-cancel-edit.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A one-minute project. Press <kbd>Ctrl</kbd>+<kbd>E</kbd>: the message **Exporting** shows **Preparing…**, then the percentage, the frames and the time left.
>   2. Click **Pause**: the line reads `Paused · 15% · 272 / 1800 frames` and the button reads **Resume**. Click **Resume**: the frames count on.
>   3. While it runs, drag the end of the second clip to the left and move the title; press <kbd>Space</kbd>: the edit plays, and the status line under the preview reads **Proxy: proxy** for a 4K clip.
>   4. Wait for **Exported** and play the file: it has the edit as it was before the trim and the move.
>   5. Press <kbd>Ctrl</kbd>+<kbd>E</kbd> again and click **Cancel** halfway: the message **Export cancelled** appears with "Nothing was written to exports/.", and no new file is in `exports`.

The message reads **Exporting** followed by the file name, for example **Exporting Promo-reels-2026-10-18.mp4**. Below it, a line and a gold bar follow the export:

| Line | What it means |
| --- | --- |
| **Preparing…** | The editor gathers the media files and mixes the sound of the timeline. On a long timeline this takes a few seconds. |
| `12% · 216 / 1800 frames · 0:31 left` | The share done, the frames written out of all frames, and the time left. |
| `12% · 216 / 1800 frames` | The same, before the editor knows the speed: the time left appears after the first frames. |
| `Paused · 15% · 272 / 1800 frames` or `Paused · Preparing…` | The export is paused. See [Pause, resume or cancel an export](#pause-resume-or-cancel-an-export). |

The time left is worked out from the speed of the last 5 seconds, so it adjusts when the export speeds up or slows down. Time spent paused doesn't count.

At the end, the message **Exported** names the file and shows, for example, `exports/Promo-reels-2026-10-18.mp4 · 84.3 MB · 1080×1920 · 1800 frames`. It closes by itself after 8 seconds.

## Pause, resume or cancel an export

The progress message has two buttons:

| Button | What it does |
| --- | --- |
| **Pause** | Holds the export after the current frame. The line starts with **Paused** and the button reads **Resume**. Pausing also works while the line still reads **Preparing…**: the export then waits before its first frame. |
| **Resume** | Goes on from where the export was paused. |
| **Cancel** | Stops the export and deletes the unfinished file. The message **Export cancelled** reads "Nothing was written to exports/." |

The command palette has the same commands: **Pause or resume the export** and **Cancel the export**. They are grey while no export runs. They have no keys by default; to give them one, see [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

> **Tip:** Pause an export when you need your computer's full power for a moment, for example to play a heavy 4K clip smoothly. The export goes on with **Resume**.

## Find the exported file

The editor writes the video into the `exports` folder of your project folder (see [What is in the project folder](projects-and-saving.md#what-is-in-the-project-folder)). To open it, open the project folder in File Explorer, then `exports`.

The file is named *project name*`-reels-`*date*`.mp4`, with today's date as year-month-day, for example `Promo-reels-2026-10-18.mp4`.

- **Nothing is overwritten.** When a file of that name is already there, for example from an earlier export the same day, the new one gets a number: `Promo-reels-2026-10-18 (2).mp4`, then `(3)`, and so on. The message **Exported** shows the name the file got.
- **Characters that file names can't hold**, such as `/`, `:` or `?` in the project name, become `_`.
- **The file appears only when it is complete.** While the export runs, the editor writes it in the project's `cache` folder and moves it into `exports` at the end. A cancelled or failed export leaves nothing in `exports`.

## Keep editing while you export

The export uses your timeline as it was when you clicked **Export**. You can keep working while it runs: trim, move, add and delete clips, change text, undo and redo, play and use **Export frame**. Those changes go into your project as usual, but not into the running export. Export again to include them.

While an export runs:

- **Playback uses proxies.** Videos with a ready proxy play on it, so playback stays smooth while the export uses the video encoder. The status line under the preview reads **Proxy:** followed by what you see, for example **Proxy: proxy**. When you stop, the preview shows the original frame as usual. See [Edit with proxies in the preview](proxies.md#edit-with-proxies-in-the-preview).
- **New proxies wait.** A proxy being made stops at its percentage and goes on after the export. See [Follow a proxy while it is made](proxies.md#follow-a-proxy-while-it-is-made).
- **Clear cache waits.** It is refused with the message **An export is running**: "Clear the cache once it has finished." See [Clear the cache](projects-and-saving.md#clear-the-cache).
- **One export at a time.** **Export** shows **An export is already running**: "Wait for it to finish, or cancel it."
- **Switching projects cancels it.** Opening or creating another project stops the export and deletes the unfinished file, with the message **Export cancelled**.

> **Important:** Closing the browser tab or reloading the page stops a running export without asking. The unfinished file is deleted the next time you open the project. Wait for **Exported** before you close the tab.

## When an export doesn't start or stops

| Message | What it means | What to do |
| --- | --- | --- |
| **Nothing to export**: "Add clips to the timeline first." | The timeline has no clips. | Add clips. See [Adding media to the timeline](adding-media-to-the-timeline.md). |
| **This project is read-only**: "Allow editing to export." | The editor may not write to the project folder, so it can't save the video there. | Click **Allow editing** in the banner. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode). |
| **An export is already running**: "Wait for it to finish, or cancel it." | Only one export runs at a time. | Wait for **Exported**, or click **Cancel** in the progress message. |
| **Export cancelled**: "Nothing was written to exports/." | You clicked **Cancel**, ran **Cancel the export**, or opened another project. | Export again when you are ready. |
| **Export failed**, with the reason | The export could not finish, for example because the disk is full, the project folder can't be written, the graphics chip was reset, or the browser can't encode video of this size. Nothing is left in `exports`. | See [An export fails](troubleshooting.md#an-export-fails). |

## What is not available yet

These parts are available in a later version:

- An **Export** tab with presets for TikTok and YouTube Shorts, custom settings (codec, frame size, frame rate, bitrate, sound), the estimated file size, and your own presets.
- Exporting only the in/out range, choosing the file name and another folder for the file.
- A queue of several exports, a list of earlier exports and **Export again**.
- Exporting the sound alone as an audio file, the captions from the export settings, and copying the current frame to the clipboard. **Export frame** already saves a PNG of the current frame, and **Export SRT or VTT** saves the captions.

## Related pages
- [Preview and playback](preview-and-playback.md#export-the-current-frame)
- [Projects and saving](projects-and-saving.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Proxies](proxies.md)
- [Captions](captions.md)
- [Audio](audio.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#project-and-history)
- [Troubleshooting](troubleshooting.md#export)

<sub>Last updated: Batch 43, 2026-10-18</sub>
