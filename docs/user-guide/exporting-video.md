# Exporting your video

When your edit is ready, the **Export** tab turns it into an MP4 video with picture and sound. Use it for Instagram Reels, TikTok, YouTube Shorts or settings of your own. You can export the whole timeline or only the part between your in and out points. The file goes into the `exports` folder of your project, or to a file you choose. Exports wait in a queue and run in the background while you keep editing. The same tab also saves the current frame as a picture, the sound as an audio file and the captions as a subtitle file.

> **Video placeholder: Export a video in two clicks**
> - File: `videos/exporting-video/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920, 30 fps project named `Promo` with a one-minute edit: two videos with sound and a cross dissolve on V1 and A1, a title on V2 and caption cues on **CC**.
>   2. Click **Export** in the app bar: the right panel shows two tabs, **Edit Properties** and **Export**, with **Export** open. Point at the rows from top to bottom: **Preset** with **Reels** highlighted and the line `1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps` under it, **Range** with **Whole timeline**, **File name** with `exports/Promo-reels-2026-10-18.mp4` under it, **Save to** with **exports folder**, and the gold **Export** button with `≈ 92.4 MB` beside it.
>   3. Click **Export**: a card appears under **Queue** with **Preparing…**, then a line such as `12% · 216 / 1800 frames · 0:31 left` and a gold bar that grows.
>   4. When the card is gone, the message **Exported Promo-reels-2026-10-18.mp4** appears with `exports/Promo-reels-2026-10-18.mp4 · 84.3 MB · 1080×1920 · 1800 frames`, and the **Log** section lists the file with a green check.
>   5. Click **Open folder** in the log row: the file dialog opens in the `exports` folder. Choose the file: it plays in a new browser tab, with the dissolve, the title, the captions and the sound in sync.
>   6. Press <kbd>Esc</kbd>: the panel shows **Edit Properties** again.

## In this page
- [Open the Export tab](#open-the-export-tab)
- [Export a video](#export-a-video)
- [Choose a preset](#choose-a-preset)
- [Know what the file is like](#know-what-the-file-is-like)
- [Export only the in/out range](#export-only-the-inout-range)
- [Name the file](#name-the-file)
- [Choose where the file goes](#choose-where-the-file-goes)
- [Check the estimated size](#check-the-estimated-size)
- [Change the export settings](#change-the-export-settings)
- [Save your own preset](#save-your-own-preset)
- [Know what goes into the file](#know-what-goes-into-the-file)
- [Follow the progress](#follow-the-progress)
- [Pause, resume or cancel an export](#pause-resume-or-cancel-an-export)
- [Find the exported file](#find-the-exported-file)
- [See your last exports and export again](#see-your-last-exports-and-export-again)
- [Export a frame, the sound or the captions](#export-a-frame-the-sound-or-the-captions)
- [Keep editing while you export](#keep-editing-while-you-export)
- [When an export doesn't start or stops](#when-an-export-doesnt-start-or-stops)
- [Related pages](#related-pages)

## Open the Export tab

Click **Export** in the app bar (the gold button at the right), or press <kbd>Ctrl</kbd>+<kbd>E</kbd> in any panel. You can also type `export` in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and choose **Export…**.

The **Export** tab opens in the right panel, next to **Edit Properties**:

- **Two tabs.** While the **Export** tab is open, the panel header shows **Edit Properties** and **Export**. Click **Edit Properties** to see the settings of what is selected; the **Export** tab stays in the header, and a click on it brings it back.
- **Close it.** Press <kbd>Esc</kbd>, or click the **X** at the right of the header (**Close the Export tab**). The panel shows **Edit Properties** again. <kbd>Esc</kbd> first does its other jobs: it cancels a drag, finishes a text you are editing, leaves crop mode, closes the **Remove silence** row and leaves fullscreen. The press after those closes the **Export** tab.
- **The parts of the tab.** At the top you find the rows **Preset**, **Range**, **File name** and **Save to**, each with a line under it that shows the result. Below them sit the **Export** button and the estimated size. Then come four sections: **Queue**, **Settings**, **Extras** and **Log**. Click a section header to fold it away; the project remembers folded sections.

Your choices in the tab (the preset, your own presets, the file name, **Save to** and the file types of **Extras**) are kept in this browser for all your projects. The **Range** choice and the **Log** are kept with each project. None of them are steps in the history, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> doesn't change them.

## Export a video

1. Check your edit: play it once from the start with <kbd>Home</kbd> and <kbd>Space</kbd>.
2. Press <kbd>Ctrl</kbd>+<kbd>E</kbd> or click **Export** in the app bar.
3. Check the choices at the top of the tab: the preset, the range, the file name and where it goes. They are the ones you used last time.
4. Click **Export**, or press <kbd>Enter</kbd>. Each time the tab opens, its **Export** button has the keyboard, so <kbd>Ctrl</kbd>+<kbd>E</kbd> followed by <kbd>Enter</kbd> exports with your last choices.
5. A card in the **Queue** section shows the progress. See [Follow the progress](#follow-the-progress).
6. When it is done, the message **Exported** gives the file's place, its size, its frame size and its number of frames. See [Find the exported file](#find-the-exported-file).

With **Whole timeline**, the export covers everything from the very start (`00:00:00`) to the end of the last clip on any track, caption cues included. An empty stretch before the first clip, or a gap between clips, shows the project's background color and has no sound.

> **Tip:** To start the video with your first clip, move the clips to the start of the timeline first: click the empty stretch before the first clip and press <kbd>G</kbd>, or press <kbd>Shift</kbd>+<kbd>G</kbd> to close all gaps. See [Close a gap](splitting-and-deleting.md#close-a-gap). To export only a part, see [Export only the in/out range](#export-only-the-inout-range).

You can click **Export** again at once, for example with another preset: each click adds an export to the queue, and they run one after another. On the development laptop, a 60-second 1080×1920 video at 30 fps took about 26 to 36 seconds to export, and a 10-minute video about 5 minutes. The speed depends mostly on your computer's video encoder. Playing your edit while it exports slows the export down a little.

## Choose a preset

Click a chip in the **Preset** row. The line under the chips shows what the export gives your project, for example `1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps`. Point at a chip to read its description.

| Chip | What it exports |
| --- | --- |
| **Reels** | For Instagram Reels: 1080×1920, at most 30 fps, H.264 at 12 Mbps, AAC sound at 192 kbps. The preset the editor starts with. |
| **TikTok** | For TikTok: as **Reels**, with H.264 at 10 Mbps. |
| **Shorts** | For YouTube Shorts: 1080×1920 (2160×3840 for a 4K project), up to 60 fps, H.264 at the bitrate YouTube recommends for that size and frame rate, AAC at 192 kbps. |
| Your own presets | The settings you saved under that name. They sit between **Shorts** and **Custom**. See [Save your own preset](#save-your-own-preset). |
| **Custom** | The settings you choose in the **Settings** section: codec, size, frame rate and bitrates. Until you change anything, **Custom** is **Reels** at your project's own size. |

**Reels**, **TikTok** and **Shorts** never change. When you change a setting while one of them is chosen, the tab switches to **Custom**, with that preset's values and your change. See [Change the export settings](#change-the-export-settings).

## Know what the file is like

Every export is an MP4 file (`.mp4`). The file's index sits at its start, so players and upload sites can start reading it right away. Picture and sound stay in sync over the whole video: in a 10-minute test export, they were still exactly in sync at the end.

| Property | **Reels** | **TikTok** | **Shorts** |
| --- | --- | --- | --- |
| Frame size | 1080×1920 for a 9:16 project. See [Frame size](#frame-size). | As **Reels** | As **Reels**; 2160×3840 for a 9:16 project of 3840 pixels or more on its long side |
| Frame rate | At most 30 fps. See [Frame rate](#frame-rate). | As **Reels** | Your project's rate, up to 60 fps |
| Video | H.264 at 12 Mbps | H.264 at 10 Mbps | H.264; 8 Mbps at 1080×1920 up to 30 fps, 12 Mbps above 30 fps. See [Bitrate of Shorts](#bitrate-of-shorts). |
| Keyframes | At least one every 2 seconds | As **Reels** | As **Reels** |
| Sound | AAC, stereo, 48 kHz, 192 kbit/s | As **Reels** | As **Reels** |
| Size on disk | About 90 MB per minute | About 75 MB per minute | About 60 MB per minute at 30 fps, 90 MB at 60 fps |

- **H.264** uses the best profile your browser can encode (High, else Main, else Baseline).
- **Sound** is encoded as Opus instead when your browser can't encode AAC. The file always has a sound track, silent if the timeline has no sound.
- **Size on disk** is the most the bitrate allows. Simple pictures, such as a still title on a color, can take much less. See [Check the estimated size](#check-the-estimated-size).

### Frame size

The presets keep the shape of your project. A project larger than 1920 pixels on its long side is scaled down to 1920 pixels. With **Shorts**, a project of 3840 pixels or more on its long side is scaled to 3840 instead. A smaller project keeps its size and is never enlarged. Both sides are always even numbers, rounded down when needed.

| Project resolution | **Reels** and **TikTok** | **Shorts** |
| --- | --- | --- |
| **9:16 · 1080×1920** | 1080×1920 | 1080×1920 |
| **4:5 · 1080×1350** | 1080×1350 | 1080×1350 |
| **1:1 · 1080×1080** | 1080×1080 | 1080×1080 |
| **16:9 · 1920×1080** | 1920×1080 | 1920×1080 |
| **Custom** 2160×3840 | 1080×1920 | 2160×3840 |
| **Custom** 720×1280 | 720×1280 | 720×1280 |

To post a full-screen Reel, TikTok or Short, use a **9:16** project. See [Change the frame size](project-settings-and-templates.md#change-the-frame-size). **Custom** can export your project's full size, or 75% or 50% of it; see [Change the export settings](#change-the-export-settings).

### Frame rate

**Reels** and **TikTok** export at most 30 frames per second. A faster project exports every second frame, so each exported frame is a frame of your project and none repeats. **Shorts** keeps every rate up to 60 fps.

| Project frame rate | **Reels** and **TikTok** | **Shorts** |
| --- | --- | --- |
| **23.976 fps**, **24 fps**, **25 fps**, **29.97 fps**, **30 fps** | The same | The same |
| **50 fps** | 25 fps | 50 fps |
| **59.94 fps** | 29.97 fps | 59.94 fps |
| **60 fps** | 30 fps | 60 fps |

### Bitrate of Shorts

**Shorts** follows the upload bitrates YouTube recommends, by the exported frame size and frame rate:

| Exported frame size | Up to 30 fps | Above 30 fps |
| --- | --- | --- |
| Up to 1280×720 pixels, for example 720×1280 | 5 Mbps | 7.5 Mbps |
| Up to 1920×1080 pixels, for example 1080×1920 | 8 Mbps | 12 Mbps |
| Up to 2560×1440 pixels | 16 Mbps | 24 Mbps |
| Larger, for example 2160×3840 | 45 Mbps | 68 Mbps |

## Export only the in/out range

1. Mark the part you want: press <kbd>I</kbd> at its first frame and <kbd>O</kbd> at its last frame. See [Markers and in/out points](markers-and-in-out-points.md).
2. In the **Range** row, click **In to out**.
3. Check the line under it: the start and end timecodes, the number of frames and the length, for example `00:01:07 – 00:05:07 · 120 frames · 0:04`.
4. Click **Export**.

| Chip | What it exports |
| --- | --- |
| **Whole timeline** | From `00:00:00` to the end of the last clip. |
| **In to out** | From the in point to the out point, the frame of the out point included. With only an in point, from there to the end of the last clip; with only an out point, from the start. Dimmed until you mark an in or out point (tooltip **Mark in and out points first (I, O)**). |

The video has exactly the frames of the range. When it has fewer frames per second than your project, it takes every second frame, the last one rounded up: 121 frames of a 60 fps project give 61 frames with **Reels**. The sound ends with the picture.

The range also applies to **Export audio** and **Export captions**. **Export frame** always uses the playhead. If you clear the in and out points, the tab goes back to **Whole timeline**.

## Name the file

The **File name** field holds a template. The line under it shows the name it gives right now, for example `exports/Promo-reels-2026-10-18.mp4`.

The template starts as `{project}-{preset}-{date}.mp4`. Type any text around these placeholders:

| Placeholder | Becomes |
| --- | --- |
| `{project}` | The project's name, for example `Promo`. |
| `{preset}` | `reels`, `tiktok`, `shorts` or `custom`. For your own presets, the name in lowercase with dashes: **Half HEVC** gives `half-hevc`. |
| `{date}` | Today's date as year-month-day, for example `2026-10-18`. |

- **The ending is added for you.** Videos get `.mp4`, and the sound, captions and frames get their own ending. You can leave the ending out or keep `.mp4` in the template.
- **Characters that file names can't hold**, such as `/`, `:` or `?`, become `_`.
- **Up to 120 characters.** Clear the field to go back to the starting template.
- Press <kbd>Enter</kbd> or click elsewhere to keep what you typed; <kbd>Esc</kbd> puts the text back.

## Choose where the file goes

Click a chip in the **Save to** row:

| Chip | Where the file goes |
| --- | --- |
| **exports folder** | The `exports` folder of your project folder. Nothing is overwritten there; see [Find the exported file](#find-the-exported-file). |
| **Choose file…** | A file you choose. Each time you click **Export** (and **Export audio**, **Export frame**, **Export captions** or **Export again**), the browser's save dialog opens with the file name from the template. Choose a folder and a name and click **Save**. If you cancel the dialog, nothing is exported. |

With **Choose file…**, the line under **File name** reads **Suggested:** followed by the name. The export writes straight into the file you chose:

- A new file you named holds the video only once the export ends. If the export is cancelled or fails, that file is removed.
- An existing file you chose to replace keeps its old content until the export ends. If the export is cancelled or fails, the old file stays as it was.

> **Tip:** **Choose file…** also works in a read-only project, where the editor can't write to the `exports` folder. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

## Check the estimated size

The figure next to the **Export** button, for example `≈ 92.4 MB`, is the size the export can reach: the video and sound bitrates over the length of the range, plus a little for the file's index. It follows the preset, the settings and the range as you change them.

The real file is often smaller: simple pictures, such as a title on a plain color, need much less than the bitrate allows, even with **Constant (CBR)**. In one test, a 3 Mbps export of plain stripes was estimated at 3.2 MB and came out far smaller.

## Change the export settings

Open the **Settings** section of the **Export** tab. Its fields show the values of the chosen preset for your project.

> **Video placeholder: Custom settings and your own preset**
> - File: `videos/exporting-video/custom-settings.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1080×1920, 30 fps project with a 16-second edit. Press <kbd>Ctrl</kbd>+<kbd>E</kbd>: **Reels** is chosen.
>   2. Open **Settings** and point at the hint "Changing a setting switches Reels to Custom."
>   3. Choose **HEVC** in **Codec**: the **Custom** chip lights up and the line under the chips reads `1080×1920 · 30 fps · HEVC · 12 Mbps · AAC 192 kbps`.
>   4. Choose **50% · 540×960** in **Resolution**, **10 fps** in **Frame rate** and **Constant (CBR)** in **Bitrate**: **Max** dims. Type `3` in the target field: the line reads `540×960 · 10 fps · HEVC · 3 Mbps CBR · AAC 192 kbps` and the estimate drops from `≈ 24.6 MB` to about `≈ 6.4 MB`.
>   5. Click **Save as preset…**, type `Half HEVC` and press <kbd>Enter</kbd>: a **Half HEVC** chip appears before **Custom**, chosen.
>   6. Click **Reels**: its values are back. Click **Half HEVC**, then **Delete preset**: the chip is gone and **Custom** holds its settings.

| Setting | Choices |
| --- | --- |
| **Codec** | **H.264**, **HEVC** or **AV1**. A codec your browser can't encode with these settings reads "(not supported here)". If you choose it anyway, the line under the presets adds, for example, "HEVC not supported here: H.264 is used", and the export uses H.264. |
| **Resolution** | 100%, 75% or 50% of your project's size, with the result, for example **100% · 1080×1920**, **75% · 810×1440** and **50% · 540×960**. With **Custom**, a project larger than 1920 pixels keeps its full size at 100%. |
| **Frame rate** | Your project's rate and the rates you get by keeping every second, third, fourth frame and so on, down to about 10 fps: **60**, **30**, **20**, **15**, **12** and **10 fps** for a 60 fps project; **30**, **15** and **10 fps** for a 30 fps project. Each exported frame is a frame of your project. |
| **Bitrate** | **Variable (VBR)**: the encoder spends more on busy pictures and less on calm ones, around the target. **Constant (CBR)**: the encoder aims at the target all the time. |
| **Target** and **Max** | The video bitrate in Mbps, from 1 to 200, in steps of 0.5. **Max** is the highest rate a variable bitrate may reach; a **Max** below the target counts as the target. **Max** is dimmed with **Constant (CBR)**. |
| **Keyframes** | **Every** 0.5 to 2 seconds, in steps of 0.5. A keyframe is a complete picture that players can jump to. Upload sites ask for at least one every 2 seconds. |
| **Audio** | **AAC 128 kbps**, **AAC 192 kbps**, **AAC 256 kbps** or **AAC 320 kbps**. |
| **Encoder** | **Auto**, **Prefer hardware** (your computer's video chip) or **Prefer software** (the processor). Some codecs are only available with one of them; the **Codec** list shows which ones work. |

Under the fields, a hint says what a change does:

- With **Reels**, **TikTok** or **Shorts** chosen, it reads, for example, "Changing a setting switches Reels to Custom." Your change goes into **Custom**, together with the preset's other values, and **Reels** stays as it was.
- With **Custom** or one of your presets chosen, it reads "Changes are kept in this preset." Each change is kept at once.

> **Tip:** H.264 plays almost everywhere. HEVC and AV1 can give a better picture at the same bitrate, but not every player or computer can play them. Before you upload such a file, check that it plays where you need it.

## Save your own preset

1. Choose a preset, or change the settings until you like them.
2. In the **Presets** row of **Settings**, click **Save as preset…**. The **Preset name** field opens with the keyboard in it.
3. Type a name of up to 40 characters and press <kbd>Enter</kbd> or click **Save**. To stop, press <kbd>Esc</kbd> or click **Cancel**; <kbd>Esc</kbd> then closes only the field, not the tab.
4. A chip with the name appears before **Custom**, chosen. The **{preset}** part of the file name becomes the name in lowercase with dashes.

You can also run **Save export settings as a preset…** from the command palette: it opens the **Export** tab with the name field ready.

- **Change your preset:** choose its chip and change the settings. Each change is kept in the preset.
- **Delete your preset:** choose its chip and click **Delete preset**. The chip goes at once, and **Custom** takes its settings, so you can still export with them. **Delete preset** is dimmed while **Reels**, **TikTok**, **Shorts** or **Custom** is chosen. The command palette has **Delete the export preset**.
- You can keep up to 30 presets. With 30, **Save as preset…** shows **Too many export presets**: "Delete one of your 30 presets first."
- Your presets are kept in this browser and work in all your projects. Deleting one can't be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## Know what goes into the file

The video shows what the preview shows, frame by frame, and plays what you hear:

- **Your original media at full quality.** The export always reads your original files and never uses [proxies](proxies.md), whatever the preview quality.
- **Everything you edited:** trims, speed changes, freeze frames and punch zooms, crops, keyframe animations, fades and transitions, shapes, images, animated stickers and SVG logos, titles with their animations, and the captions of the **CC** track with the spoken word highlighted.
- **Captions are part of the picture.** They are drawn into the video and can't be turned off by the viewer. To upload a separate subtitle file as well, use **Export captions**; see [Export a frame, the sound or the captions](#export-a-frame-the-sound-or-the-captions).
- **Fonts.** Text uses the same fonts as in the preview: the fonts that come with the editor and the fonts from your computer that the project keeps in its `fonts` folder. See [Fonts travel with the project](titles-and-text.md#fonts-travel-with-the-project).
- **Tracks and clips.** Hidden and muted video tracks are left out, as in the preview. On audio tracks, **M** and **S** apply: a muted track, or a track left out by a solo, is not in the sound. Clips you turned off are left out too. See [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks) and [Turn a clip off](editing-properties.md#turn-a-clip-off).
- **Sound.** Clip volumes, volume keyframes, fades and crossfades are in the file. The **Master volume** knob and **Mute** under the preview change only what you hear, never the exported sound. See [Audio](audio.md).
- **Offline media.** A clip whose file the editor can't read shows the same gray slate as in the preview, for example **Media offline**, and has no sound. Relink the file before you export; see [Offline media and relinking](offline-media-and-relinking.md). If Chrome stops decoding a video partway through the export, the export doesn't stop: that video shows the **Media can't be played** slate from that frame on.
- **HDR videos in standard colors.** HDR footage, such as iPhone videos recorded with **HDR Video** on, goes into the file with the same SDR contrast and colors as in the preview. See [HDR videos](importing-media.md#hdr-videos).
- **Nothing that is only on your screen:** no safe zones, grids, guides or rulers, no selection outlines or handles, and nothing of the panel around the frame.

## Follow the progress

Each export you start gets a card in the **Queue** section, in the order you started them. With no export waiting or running, the section reads "Nothing to export. Exports you start wait here in order."

> **Video placeholder: Queue, pause and cancel exports**
> - File: `videos/exporting-video/queue.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 60 fps project with an 8-second edit. Press <kbd>Ctrl</kbd>+<kbd>E</kbd>.
>   2. Click **Reels** and **Export**, **TikTok** and **Export**, **Shorts** and **Export**: three cards appear under **Queue**. The first counts up; the other two read **Queued**.
>   3. Point at the **X** of the second card: its tooltip reads **Remove from the queue**. Click it: the card goes, without a message.
>   4. Click **Pause** on the first card: the line reads `Paused · 40% · 96 / 240 frames`. Click **Resume**.
>   5. Click **Edit Properties** in the panel header: a message at the top of the window reads **Exporting Promo-reels-2026-10-18.mp4 (+1 queued)** with **Pause** and **Cancel**. Click **Export** in the panel header: the message goes, and the cards are back.
>   6. When the first card is done, the **Shorts** card starts on its own. Wait for **Exported**, then open **Log**: **Shorts** and **Reels** with a green check, **TikTok** with a gray circle with a line through it, for cancelled.

A card shows a film icon for a video or a sound icon for an audio file, the file name, the format in one line, a bar, and a line under the bar:

| Line | What it means |
| --- | --- |
| **Queued** | The export waits for the ones before it. |
| **Preparing…** | The editor gathers the media files and mixes the sound of the range. On a long timeline this takes a few seconds. |
| `12% · 216 / 1800 frames · 0:31 left` | The share done, the frames written out of all frames, and the time left. For an audio file: the share and the time left, for example `40% · 0:03 left`. |
| `12% · 216 / 1800 frames` | The same, before the editor knows the speed: the time left appears after the first frames. |
| `Paused · …` | The export is paused, for example `Paused · 15% · 272 / 1800 frames` or `Paused · Queued`. See [Pause, resume or cancel an export](#pause-resume-or-cancel-an-export). |

The time left is worked out from the speed of the last 5 seconds, so it adjusts when the export speeds up or slows down. Time spent paused doesn't count. When an export ends, its card leaves the queue, the next export starts, and the result goes into the **Log**.

**While the Export tab is hidden**, because you closed it or clicked **Edit Properties**, a message at the top of the window follows the running export instead. It reads **Exporting** with the file name, and the number of exports waiting after it, for example **Exporting Promo-reels-2026-10-18.mp4 (+1 queued)**. It has the same bar and line, and **Pause** / **Resume** and **Cancel** buttons. It has no close button, and newer messages don't push it away. When the **Export** tab is shown again, the message goes and the cards take over.

When an export is done, the message **Exported** names the file and shows, for example, `exports/Promo-reels-2026-10-18.mp4 · 84.3 MB · 1080×1920 · 1800 frames`. For an audio file, it shows the length instead of the frames. It has two buttons, **Open folder** and **Export again** (see [See your last exports and export again](#see-your-last-exports-and-export-again)), and closes by itself after 8 seconds.

## Pause, resume or cancel an export

Each card has two buttons:

| Button | What it does |
| --- | --- |
| **Pause** | Holds the export after the current frame. The line starts with **Paused** and the button reads **Resume**. Pausing also works while the line reads **Preparing…**. On a waiting card, the export starts paused when its turn comes. |
| **Resume** | Goes on from where the export was paused. |
| **Cancel** | Stops the running export and deletes the unfinished file. The message **Export cancelled** reads "Nothing was written to exports/.", or "The picked file was left as it was." with **Choose file…**. The next export in the queue starts at once. |
| **Remove from the queue** | The same button on a waiting card: the export leaves the queue without a message, and nothing is written. |

> **Note:** A paused export keeps its place: the exports after it wait until you resume or cancel it.

The progress message has the same **Pause** / **Resume** and **Cancel** for the running export. The command palette has **Pause or resume the export** and **Cancel the export**; they act on the running export and are grey while none runs. They have no keys by default; to give them one, see [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

> **Tip:** Pause an export when you need your computer's full power for a moment, for example to play a heavy 4K clip smoothly. The export goes on with **Resume**.

## Find the exported file

With **exports folder**, the editor writes the file into the `exports` folder of your project folder (see [What is in the project folder](projects-and-saving.md#what-is-in-the-project-folder)). With **Choose file…**, it goes where you saved it. The message **Exported** and the **Log** show the name the file got.

- **Open folder.** Click **Open folder** in the **Exported** message or in a log row, or run **Open the exports folder** from the command palette. A browser can't open File Explorer, so the editor opens the file dialog in the `exports` folder (or, for a file you chose, in its folder, until you reload the page). Choose a file and click **Open**: it opens in a new browser tab, where videos play. If the browser blocks the new tab, the message **Pop-up blocked** asks you to allow pop-ups for the site. When the dialog can't start there, for example in a read-only project, the message **Exports folder** names the folder instead.
- **File Explorer.** You can always open the project folder in File Explorer, then `exports`.
- **Nothing is overwritten in `exports`.** When a file of that name is already there, for example from an earlier export the same day, the new one gets a number: `Promo-reels-2026-10-18 (2).mp4`, then `(3)`, and so on.
- **The file appears only when it is complete.** While a video or audio export runs, the editor writes it in the project's `cache` folder and moves it into `exports` at the end. A cancelled or failed export leaves nothing in `exports`.

## See your last exports and export again

The **Log** section lists your last 20 exports of this project, newest first, also after a reload. With none yet, it reads "Your last 20 exports appear here."

Each row shows an icon, the file name and a line of details:

| Icon | Details |
| --- | --- |
| Green check | Exported: the date and time, the size and the format, for example `Oct 18, 10:42 AM · 24.6 MB · 1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps`. |
| Gray circle with a line through it | **Cancelled**, with the date and time. |
| Red cross | **Failed**, with the date and time and the reason. |

Each row has two buttons:

- **Export again with these settings** queues the same export once more: the same kind of file, preset settings, range, file name template and **Save to** choice, on your timeline as it is now. It works for cancelled and failed exports too. With **Choose file…**, the save dialog opens again.
- **Open folder** opens the file dialog where the file is. It is dimmed for cancelled and failed exports. See [Find the exported file](#find-the-exported-file).

The **Exported** message also has **Export again**, and the command palette has **Export again**, which repeats the newest export in the log. It is grey while the log is empty.

## Export a frame, the sound or the captions

The **Extras** section saves other files from your project. They go where **Save to** says: into the `exports` folder, or to a file you choose in the save dialog. The hint under the section says it in short: "Saved where exports go; audio and captions follow the range."

> **Video placeholder: Export a frame, the sound and the captions**
> - File: `videos/exporting-video/extras.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video, a title and caption cues. Move the playhead to 00:00:04:00 and press <kbd>Ctrl</kbd>+<kbd>E</kbd>; open **Extras**.
>   2. Click **Export frame**: the message **Saved Promo-frame-120.png** reads `exports/Promo-frame-120.png · 1080×1920 PNG` with the size.
>   3. Click **Copy frame**: **Copied the frame**. Paste into an image editor: the frame without safe zones or handles.
>   4. Mark in and out points around one sentence, click **In to out** under **Range**, click **M4A** and **Export audio**: a card with a sound icon runs under **Queue**, then **Exported** with the length.
>   5. Click **VTT** and **Export captions**: **Saved** with the number of cues. Open the file: only the cues of the sentence are in it, timed from the in point.

| Row | What it saves |
| --- | --- |
| **Frame** | **Export frame** saves the frame at the playhead as a PNG at the project's size, named *project*`-frame-`*frame number*`.png`, for example `Promo-frame-120.png`. **Copy frame** puts the same picture on the clipboard: paste it into an image editor or a chat. |
| **Audio** | Choose **WAV** (16-bit, 48 kHz, stereo) or **M4A** (AAC at the audio bitrate of the chosen preset), then click **Export audio**. It saves the mixed sound of the range, named by the file name template, for example `Promo-reels-2026-10-18.m4a`. |
| **Captions** | Choose **SRT** or **VTT**, then click **Export captions**. It saves the cues of the caption track as a subtitle file named by the template, for example `Promo-reels-2026-10-18.srt`. Dimmed while there are no cues. |

- **Export frame** works as the button in the Preview panel header: the same picture, from your original media at full quality, without overlays. See [Export the current frame](preview-and-playback.md#export-the-current-frame). The message **Saved** gives the file name, the frame size and the file size, with **Open folder**.
- **Export audio** is an export like a video: it waits in the queue, has a card with **Pause** and **Cancel**, and goes into the log. With **M4A**, the sound is encoded as Opus when your browser can't encode AAC. The sound follows the same rules as in a video: see [Know what goes into the file](#know-what-goes-into-the-file).
- **Export captions** follows the range too. With **In to out**, it keeps only the cues in the range, cuts the cues at its edges, and times them from the range's start. The subtitle file then matches a video of the same range. The message **Saved** gives the number of cues. The **Captions** tab's **Export SRT or VTT** always saves all cues; see [Export an SRT or VTT file](captions.md#export-an-srt-or-vtt-file).

## Keep editing while you export

An export uses your timeline as it was when you clicked **Export**, also when it waits in the queue first. You can keep working while it runs: trim, move, add and delete clips, change text, undo and redo, play and use **Export frame**. Those changes go into your project as usual, but not into the exports you already started. Export again to include them.

While any export runs, video or audio:

- **Playback uses proxies.** Videos with a ready proxy play on it, so playback stays smooth while the export uses the video encoder. The status line under the preview reads **Proxy:** followed by what you see, for example **Proxy: proxy**. When you stop, the preview shows the original frame as usual. See [Edit with proxies in the preview](proxies.md#edit-with-proxies-in-the-preview).
- **New proxies wait.** A proxy being made stops at its percentage and goes on after the exports. See [Follow a proxy while it is made](proxies.md#follow-a-proxy-while-it-is-made).
- **Clear cache waits.** It is refused with the message **An export is running**: "Clear the cache once it has finished." See [Clear the cache](projects-and-saving.md#clear-the-cache).
- **Switching projects cancels every export.** Opening or creating another project stops the running export, deletes its unfinished file and empties the queue.

> **Important:** Closing the browser tab or reloading the page stops all exports without asking. The unfinished file is deleted the next time you open the project. Wait for the queue to empty before you close the tab.

## When an export doesn't start or stops

| Message | What it means | What to do |
| --- | --- | --- |
| **Nothing to export**: "Add clips to the timeline first." | The timeline has no clips. | Add clips. See [Adding media to the timeline](adding-media-to-the-timeline.md). |
| **This project is read-only**: "Allow editing to export into the project's folder." | The editor may not write to the project folder, so it can't save the file in `exports`. | Click **Allow editing** in the app bar (see [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode)), or choose **Choose file…** under **Save to**. |
| **Export cancelled**: "Nothing was written to exports/." or "The picked file was left as it was." | You clicked **Cancel**, ran **Cancel the export**, or opened another project. | Export again when you are ready. |
| **Export failed**, with the reason | The export could not finish, for example because the disk is full, the folder can't be written, the graphics chip was reset (**The GPU was reset during the export (device lost). Export again.**), or the browser can't encode video of this size. Nothing is left in `exports`, and the log lists it as failed. | See [An export fails](troubleshooting.md#an-export-fails). |
| **This browser can't pick a file**: "Choose the exports folder as the destination." | The browser has no save dialog for **Choose file…**. | Choose **exports folder** under **Save to**. |
| **Can't save there**, with the reason | The save dialog refused the place you chose. | Choose another folder. |
| **No captions to export**: "Add cues in the Captions tab first." or "No cue is in the in/out range." | The caption track has no cues, or none in the range. | Add cues, or choose **Whole timeline**. See [Captions](captions.md). |
| **Can't export the frame**, **Can't copy the frame** or **Couldn't export the captions**, with the reason | The picture or the file could not be saved or copied. | Try again, or choose another place with **Choose file…**. |
| **Too many export presets**: "Delete one of your 30 presets first." | You already have 30 presets of your own. | Delete one you don't need. |

## Related pages
- [Preview and playback](preview-and-playback.md#export-the-current-frame)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Projects and saving](projects-and-saving.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Proxies](proxies.md)
- [Captions](captions.md)
- [Audio](audio.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#export)
- [Troubleshooting](troubleshooting.md#export)

<sub>Last updated: Batch 47, 2026-10-18</sub>
