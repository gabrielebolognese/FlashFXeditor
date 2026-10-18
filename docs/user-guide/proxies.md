# Proxies

A proxy is a light copy of a heavy video, such as a 4K or 60 fps phone clip, that the editor makes in the background after you import it. The preview plays and scrubs on the proxy, so heavy footage feels as light as small footage, and switches back to your original video as soon as you stop. Use this page to follow a proxy while it is made, make or remove proxies yourself, and choose which videos get one.

> **Video placeholder: Edit 4K footage with proxies**
> - File: `videos/proxies/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1080×1920 project at 60 fps. Import a 10-second 4K 60 fps phone clip: its card appears with a grey **PX** chip in the top-right corner of its picture.
>   2. The chip counts up (**PX 12%**, **PX 40%** ...) while a thin gold bar grows along its bottom edge. Meanwhile, double-click the card to put the clip on the timeline and click in the ruler a few times: editing goes on as usual.
>   3. Press <kbd>Space</kbd>: the percentage stops while the clip plays. Press <kbd>Space</kbd> again: it continues. The chip turns green.
>   4. Drag in the ruler across the clip: the picture follows the pointer without lag and the status line under the transport bar reads **Auto: proxy**. Release: a moment later the picture is crisp and the status line reads **Auto: full**.
>   5. Switch the Media panel to **List view** and point at the **Proxy** column: it reads **960×540**.
>   6. Open the project folder in File Explorer and show the `.mp4` file in `cache/proxies`.

## In this page
- [How proxies work](#how-proxies-work)
- [Know which videos get a proxy](#know-which-videos-get-a-proxy)
- [Follow a proxy while it is made](#follow-a-proxy-while-it-is-made)
- [Make a proxy yourself](#make-a-proxy-yourself)
- [Remove a proxy or stop one being made](#remove-a-proxy-or-stop-one-being-made)
- [Change the proxy settings](#change-the-proxy-settings)
- [Edit with proxies in the preview](#edit-with-proxies-in-the-preview)
- [Make thumbnails again](#make-thumbnails-again)
- [Close and reopen a project with proxies](#close-and-reopen-a-project-with-proxies)

## How proxies work

Decoding 4K or 60 fps video takes a lot of work from your computer. A proxy has the same frames as the original video, at a much smaller size and in a format that is quick to jump around in. While you play or scrub, the preview can then show the exact frame almost at once.

| Property | Proxy |
| --- | --- |
| Size | 540 pixels on the short side by default (for example 960×540 for a 4K landscape clip, 540×960 for a 4K portrait clip); 360 or 720 with the **Proxy size** setting. Never larger than the original. |
| Frames | The same frames at the same times as the original, so cuts and trims stay frame-exact. Portrait videos stay upright. |
| Format | H.264 MP4 with a keyframe every 15 frames, at 3 Mbit/s: about 22 MB per minute of video. |
| Sound | None. Sound always plays from the original file. |
| Where it is kept | In the `cache/proxies` folder of your project folder, one `.mp4` file per video. See [What is in the project folder](projects-and-saving.md#what-is-in-the-project-folder). |

Your original video is never changed. The proxy is used only while you play, scrub or trim (with the default **Auto** preview quality). A paused frame in the preview and every frame you save with **Export frame** come from the original video at full quality.

Only videos get proxies. Audio files and images never need one.

## Know which videos get a proxy

With the default settings, every video you import that is heavy gets a proxy automatically:

| **Proxy for** setting | Videos that get a proxy | Examples |
| --- | --- | --- |
| **Above 1080p or 30 fps** (default) | Videos more than 1080 pixels on their short side, or above 30 fps | 3840×2160 or 2160×3840 at any frame rate, 1080×1920 at 60 fps. Not 1080×1920 at 30 fps. |
| **Above 1080p** | Videos more than 1080 pixels on their short side | 3840×2160 and 1440×2560 at any frame rate. Not 1080×1920 at 60 fps. |
| **Every video** | All videos | Every video, whatever its size and frame rate. |

The rule also applies to the videos already in the open project that have never had a proxy, and to the videos of projects made with an earlier version when you open them. Videos whose proxy you removed are left alone. To change the rule or turn automatic proxies off, see [Change the proxy settings](#change-the-proxy-settings).

> **Tip:** A light video that plays smoothly needs no proxy. If one still can't keep up during playback (more than 2 frames late in a row), the editor queues a proxy for it, unless you removed its proxy before.

## Follow a proxy while it is made

A **PX** chip in the top-right corner of a video card's picture shows the state of its proxy. In **List view**, the **Proxy** column shows the same.

| Card chip | List view **Proxy** column | Meaning |
| --- | --- | --- |
| No chip | **None** | The video has no proxy. |
| Grey **PX** | **Queued** | The proxy waits for its turn. |
| Grey **PX** with a percentage, for example **PX 42%**, and a gold bar along its bottom edge | The percentage, for example **42%** | The proxy is being made. The bar grows with the percentage. |
| Green **PX** | The proxy's size, for example **960×540** | The proxy is ready, and the preview uses it. |
| Red **PX** | **Failed** | The proxy could not be made. The preview uses the original video. See [A proxy chip is red](troubleshooting.md#a-proxy-chip-is-red). |

Point at the chip to read its state: **Proxy being made (Remove proxy cancels it)**, **Proxy ready**, or **No proxy: it could not be made (Generate proxy tries again)**.

> **Note:** The **Proxy** column shows the size as the video file stores it. Phone videos recorded in portrait are often stored sideways, so their proxy can read **960×540** although it shows upright.

How proxies are made:

- **One at a time**, oldest import first. The others wait with a grey chip.
- **In the background.** You can keep editing: put clips on the timeline, trim, move the playhead.
- **Paused while you play** or drag on the timeline (moving clips, trimming, scrubbing in the ruler), so the preview gets all the decoding power. The percentage stops and continues when you stop.
- **Paused while a video export runs**, and continued after it. See [Keep editing while you export](exporting-video.md#keep-editing-while-you-export).
- **Before the rest of the thumbnails.** While a video waits for its proxy or the proxy is being made, the editor makes only the thumbnails you look at from the original video: the card picture, the thumbnails of its clips on screen and the frames you skim on its card. The rest of its thumbnails wait until the proxy is ready and are then made from the proxy. This keeps the video decoder free for the proxy, so long 4K videos get their proxy much sooner. See [Know when thumbnails and waveforms appear](clip-thumbnails-and-waveforms.md#know-when-thumbnails-and-waveforms-appear).
- **How long it takes:** on the development laptop, a proxy of 4K 60 fps footage took about as long as a short clip itself, for example about 10 seconds for a 10-second clip, and about 3½ minutes for a 2-minute 4K 60 fps HEVC video. A longer clip takes correspondingly longer, and its playback and scrubbing become light once its chip is green.

## Make a proxy yourself

Make a proxy for a video the rule did not pick, for a video whose proxy you removed, or to try again after a red chip.

1. In the Media panel, select one or more videos.
2. Right-click one of them to open the media menu.
3. Choose **Generate proxy**.

The selected videos without a proxy (or with a failed one) get a grey chip and are made in turn, at the current **Proxy size**. Videos whose proxy is ready or already queued are left as they are. **Generate proxy** works also while **Proxies** is turned off.

**Generate proxy** is dimmed when none of the selected items is a video that could use a new proxy, for example when only audio files and images are selected, or every selected video already has a green or grey chip.

> **Tip:** To make an existing proxy again at another size, change **Proxy size**, choose **Remove proxy**, then **Generate proxy**.

## Remove a proxy or stop one being made

1. In the Media panel, select one or more videos.
2. Right-click one of them and choose **Remove proxy**.

The chip disappears and the proxy file is deleted. If the proxy was being made, it stops at once and its unfinished file is deleted. The preview then uses the original video. A video whose proxy you removed never gets one automatically again; choose **Generate proxy** to make it.

**Remove proxy** is dimmed when none of the selected videos has a proxy, queued, being made, ready or failed. Removing a red chip this way clears it.

> **Note:** Making and removing proxies are not steps in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> does not undo them. In a read-only project, **Generate proxy** and **Remove proxy** show the message **This project is read-only** with "Allow editing to change proxies." See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

> **Video placeholder: Make, remove and set up proxies**
> - File: `videos/proxies/make-and-remove.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. Click an empty area of the timeline tracks: the **Project** section of **Edit Properties** shows **Proxies** (on), **Proxy for** (**Above 1080p or 30 fps**) and **Proxy size** (**540p**).
>   2. Import a second 4K clip: its chip counts. Right-click its card and choose **Remove proxy**: the chip disappears.
>   3. Right-click a 1080×1920 30 fps card (no chip) and choose **Generate proxy**: a grey chip appears and starts counting.
>   4. Turn **Proxies** off: **Proxy for** is dimmed. Import another 4K clip: it gets no chip. Turn **Proxies** on again: its chip appears.
>   5. Choose **720p** in **Proxy size**.

## Change the proxy settings

The proxy settings are in two places, which change the same settings:

- In **Settings** (the gear in the app bar), on the **General** tab, in the **Media** group. See [Choose how media are imported](settings.md#choose-how-media-are-imported).
- In the **Project** section of **Edit Properties**: click an empty area of the timeline tracks so that nothing is selected.

| Setting | Choices | What it does |
| --- | --- | --- |
| **Proxies** | On (default) or off | On: videos the **Proxy for** rule picks get a proxy automatically. Off: no automatic proxies; you can still make one with **Generate proxy**, and proxies already queued are still made. |
| **Proxy for** | **Above 1080p or 30 fps** (default), **Above 1080p**, **Every video** | Which videos get an automatic proxy. See [Know which videos get a proxy](#know-which-videos-get-a-proxy). Dimmed while **Proxies** is off. |
| **Proxy size** | **360p**, **540p** (default), **720p** | The short side of new proxies, in pixels. Smaller proxies are lighter and quicker to make; larger ones look sharper while you play. Proxies already made keep their size. |

The line under them reads "New proxies use these; Generate or Remove proxy in the media menu."

These are app settings: they apply to every project you open in this browser and are not saved in the project. Changing them is not a step in the history. Turning **Proxies** on, or choosing a rule that picks more videos, starts proxies for the videos of the open project that the rule now picks and that never had one.

## Edit with proxies in the preview

With the default **Auto** preview quality, a video with a green chip uses its proxy while you play, scrub in the ruler or trim. As soon as you stop, release the mouse button or hold the pointer still in the ruler for 0.3 seconds, the preview asks for the original frame. The proxy frame stays on screen until the original one is decoded, usually within a third of a second (deep inside a 4K 60 fps phone clip, up to about 0.4 seconds).

The status line under the transport bar tells you which one you see:

| Status line | What the preview shows |
| --- | --- |
| **Auto: proxy** | At least one picture in the frame comes from a proxy. |
| **Auto: full** | Every picture comes from the original media. |

The other preview quality modes use proxies like this:

| Mode | Proxies |
| --- | --- |
| **Auto** (default) | While you play, scrub or trim; the original when you stop. |
| **Full** | Never: always the original, also while playing. Heavier. |
| **Proxy** | Always, also when you stop. The status line reads **Proxy: proxy**. |
| **1/2**, **1/4** | Only for a video that can't keep up while playing: it switches to its proxy for the rest of that playback. |

Videos without a ready proxy always show the original. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality).

While a video export runs, playback uses proxies whatever the mode, so it stays smooth while the export uses the video encoder. The status line then starts with **Proxy:**, for example **Proxy: proxy**. When you stop, the preview follows its mode again. See [Keep editing while you export](exporting-video.md#keep-editing-while-you-export).

On the development laptop, a 4K 60 fps HEVC clip played on its proxy with no or almost no dropped frames, and while scrubbing the exact proxy frame appeared within one or two screen refreshes (17 to 34 milliseconds). That also held for a 20-minute 4K 60 fps HEVC video swept from end to end in the ruler, at 60 frames per second.

> **Note:** If you move again in the ruler right after the original frame has appeared, the first proxy frames can take a little longer, up to about 0.2 seconds. The preview shows the closest frame meanwhile.

A transition between two clips of the same 4K video plays smoothly in **Auto**, because both sides play on the proxy. In **Full**, the editor has to decode the same 4K original at two places at once, and many frames drop at the transition. See [Playback stutters or drops frames](troubleshooting.md#playback-stutters-or-drops-frames).

> **Note:** **Export frame** and video exports never use proxies. They always use your original media at full quality, whatever the preview quality. See [Export the current frame](preview-and-playback.md#export-the-current-frame) and [Exporting your video](exporting-video.md).

## Make thumbnails again

While a video's proxy is being made, only the thumbnails you look at come from the original video; the rest wait for the proxy. Once the proxy is ready, the editor makes the video's card picture and timeline thumbnails again from the proxy, in the background. The thumbnails you see stay until the new ones replace them. After **Remove proxy**, they are made again from the original video.

To make the thumbnails of a video again from scratch, for example when they look wrong:

1. Select one or more videos in the Media panel.
2. Right-click one of them and choose **Regenerate thumbnails**.

The card picture and the thumbnails of its clips on the timeline are made again, from the proxy when it is ready, else from the original. **Regenerate thumbnails** is dimmed when no video is selected. See [Know when thumbnails and waveforms appear](clip-thumbnails-and-waveforms.md#know-when-thumbnails-and-waveforms-appear).

## Close and reopen a project with proxies

- **Ready proxies are kept** in the project folder and used again the next time you open the project.
- **A proxy that was being made starts over.** If you close the project or the browser tab, or reload the page, while a chip counts, the unfinished file is deleted (when you close the project, or else the next time you open it) and the proxy is made again from 0%. No broken files are left behind.
- **A missing proxy file is made again.** If a proxy file was deleted from `cache/proxies`, for example with the whole `cache` folder, the preview uses the original video, and the proxy is made again the next time you open the project. **Clear cache** deletes every proxy of the project and makes them again right away, without reopening it; see [Clear the cache](projects-and-saving.md#clear-the-cache).
- **Read-only projects make no proxies.** They use the proxies already in the folder. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).
- **Removing a video** from the project stops its proxy if it is being made.

## Related pages
- [Exporting your video](exporting-video.md)
- [Importing media](importing-media.md)
- [Preview and playback](preview-and-playback.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 45, 2026-10-18</sub>
