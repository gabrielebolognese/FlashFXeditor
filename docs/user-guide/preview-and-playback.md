# Preview and playback

The Preview panel shows your video as it looks at the playhead: every video and image clip under the playhead, stacked track by track inside the project frame. Use it to check a frame while you scrub the timeline, to play your edit back with its sound, and to save a still of the current frame. To select, move, resize and rotate the pictures in the frame, see [Arranging layers in the preview](arranging-layers-in-the-preview.md). To zoom in on detail, show safe zones and grids, or fill the window with the preview, see [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).

> **Video placeholder: Preview and playback overview**
> - File: `videos/preview-and-playback/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a vertical clip and a landscape clip on V1. The Preview panel shows the frame with a thin border; the landscape clip has black bands above and below.
>   2. Drag the playhead across the timeline ruler. The preview follows and switches clips at the cut without going black.
>   3. Press <kbd>Space</kbd> to play, then <kbd>Space</kbd> to pause. The **Play** button turns into **Pause** and back.
>   4. Press <kbd>L</kbd> three times (1x, 2x, 4x), then <kbd>K</kbd> to stop.
>   5. Hold <kbd>K</kbd> and tap <kbd>L</kbd> twice to step two frames.
>   6. Point at the timecode, the duration, the fps badge, and **Auto: full** and **Dropped 0** in the status strip. Click the **ff** chip left of the timecode: the times switch to milliseconds; click **ms** to switch back.
>   7. Click the playhead timecode under the preview, type `+30` and press <kbd>Enter</kbd>: the playhead moves 30 frames on.

## In this page
- [Read the preview](#read-the-preview)
- [See how clips fit the frame](#see-how-clips-fit-the-frame)
- [Zoom in, add overlays and go fullscreen](#zoom-in-add-overlays-and-go-fullscreen)
- [Scrub through the timeline](#scrub-through-the-timeline)
- [Play and pause](#play-and-pause)
- [Shuttle with J, K and L](#shuttle-with-j-k-and-l)
- [Step through frames](#step-through-frames)
- [Play around the playhead](#play-around-the-playhead)
- [Loop playback](#loop-playback)
- [Play from the in point to the out point](#play-from-the-in-point-to-the-out-point)
- [Read the transport bar and status strip](#read-the-transport-bar-and-status-strip)
- [Export the current frame](#export-the-current-frame)
- [Know what to expect from performance](#know-what-to-expect-from-performance)

## Read the preview

The preview always shows the frame at the playhead, the red line in the timeline. It updates when you move the playhead, when you play, and when the project changes (for example when you insert a clip or press **Undo**).

What you see in the Preview panel:

- **The project frame.** It has the size of your project: 1080×1920 (9:16) by default, or the **Resolution** you chose in the **Project** section of the **Edit Properties** panel (shown when no clip is selected). A thin line marks its edge.
- **The area around the frame.** It belongs to the panel, not to your video. It never appears in an exported frame.
- **The background.** Wherever no clip covers the frame, you see the project background color: black by default. Change it in the **Background** field of the same **Project** section: type a hex color such as `#000000`, or click its swatch to pick a color. See [Pick a color](editing-properties.md#pick-a-color).
- **Fine detail at small sizes.** When a video is shown smaller than its own size, for example a 1080×1920 clip at **Fit** in a narrow panel, the preview smooths it as it shrinks it. Thin lines, stripes and small text stay steady instead of shimmering or showing wavy patterns. At 100% and above, every pixel is drawn as it is.
- **HDR videos in standard colors.** HDR videos, such as iPhone videos recorded with **HDR Video** on, show with the contrast and colors of a normal (SDR) screen, paused and while playing. See [HDR videos](importing-media.md#hdr-videos).
- **Empty frames.** In a gap between clips, past the end of the last clip, or in a project with no clips, the frame shows only the background.
- **Outlines and handles.** A selected clip under the playhead has a gold outline with eight handles in the preview, and the picture under the pointer gets a thin, darker gold outline. They are only on your screen, never in an exported frame. See [Arranging layers in the preview](arranging-layers-in-the-preview.md).

### Stacked tracks

When several video tracks have a clip at the playhead, the preview draws the bottom video track (the one next to the divider, **V1** in a new project) first, and each higher video track over the tracks below it. Audio tracks never show in the preview.

- To change which picture is on top, drag a track header up or down. See [Reorder tracks](tracks.md#reorder-tracks). To move one clip above or below the others, right-click its picture in the preview and choose **Bring forward** or **Send backward**. See [Change which layer is on top](arranging-layers-in-the-preview.md#change-which-layer-is-on-top).
- A video track that is muted (**M**) or hidden (the eye) is left out of the preview. See [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks).
- A clip you turned off with **Disable** is left out too. See [Turn a clip off](editing-properties.md#turn-a-clip-off).

> **Note:** Every clip you add by double-clicking goes to the targeted video track nearest the divider (**V1** in a new project). To stack clips, drag one up to **V2** or higher. See [Move clips to another track](timeline.md#move-clips-to-another-track).

### Sound

Playback plays the sound of your audio tracks in sync with the picture. The audio meter is the narrow strip along the right edge of the Preview panel, and the **Mute** button and **Master volume** knob sit in the transport bar. See [Audio](audio.md).

### Media that cannot be shown

A video or image clip whose media file the editor can't read shows a gray slate in the preview: a rectangle where the picture would be, with the media's name and the reason, for example "Media offline" for a missing file or "Media can't be played" for a video your browser can't decode (such as HEVC on a computer without HEVC decoding). Its sound is silent. If the browser stops decoding a video in the middle of playback, the slate appears right away. See [Offline media and relinking](offline-media-and-relinking.md).

## See how clips fit the frame

When you add a video or an image to the timeline, the editor scales it to fit inside the project frame and centers it. The whole picture stays visible; nothing is cut off. To put a picture somewhere else in the frame, for example a logo in a corner, drag its card from the Media panel onto the preview: it is scaled the same way and centered where you release. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview).

| Media | In a 1080×1920 project |
| --- | --- |
| Vertical 9:16 video or image, at any size (1080×1920, 2160×3840...) | Fills the frame exactly. |
| Landscape 16:9 (1920×1080, 3840×2160...) | Fills the width, with bands above and below (letterbox). |
| Square (1080×1080) or 4:5 | Fills the width, with bands above and below. |
| Phone video recorded upright | Shown upright. The editor reads the rotation the phone stores in the file. |

The bands show the project background color.

To change the fit afterwards, click the picture in the preview and drag it, or drag its handles to resize it. See [Arranging layers in the preview](arranging-layers-in-the-preview.md). To fill the frame without bands, select the clip and click **Fill frame** in the quick actions of **Edit Properties**, or right-click the picture and choose **Fill**. To type an exact position and size, use the **Transform** section. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture). To turn a landscape video into a full vertical shot with nothing hanging past the frame, click **Crop to frame** in the **Crop** section, then **Fill frame**. See [Reframe a landscape video for a vertical frame](cropping-and-reframing.md#reframe-a-landscape-video-for-a-vertical-frame).

> **Note:** The fit is set when you add the clip. If you change the project resolution later, choose **Scale layout** to scale the pictures with the frame: a picture that fit inside the old frame fits inside the new one. **Keep** leaves each picture at its size in pixels. See [Change the frame size](project-settings-and-templates.md#change-the-frame-size).

## Zoom in, add overlays and go fullscreen

The Preview panel header holds the controls that change how you look at the frame, from left to right:

| Control | What it does |
| --- | --- |
| **Zoom** | Shows the zoom level and opens the menu of levels: **Fit**, **25%**, **50%**, **100%**, **200%**, **400%**. |
| **Fit the frame in the panel** | Shows the whole frame again, centered (<kbd>Ctrl</kbd>+<kbd>0</kbd> in the Preview panel). |
| **Preview quality** | Shows the quality mode and opens the menu of modes: **Auto**, **Full**, **Proxy**, **1/2**, **1/4**. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality). |
| **Overlays** (grid icon) | Safe zones for Reels, TikTok and Shorts, grids, the center cross, title / action safe, rulers and the pixel grid. |
| **Snap** (magnet) | Turns snapping on or off, for clips on the timeline and layers in the preview (<kbd>S</kbd>). |
| **Smart guides** | Turns smart guides on or off: layers you drag snap to each other and show gold guides with distances. See [Snapping and smart guides in the preview](snapping-and-smart-guides.md). |
| **Fullscreen** | Fills the browser window with the preview (<kbd>F</kbd>); <kbd>Esc</kbd> returns. |
| **Export frame** | Saves the current frame as a PNG, where your exports go. See [Export the current frame](#export-the-current-frame). |

You can also zoom at the pointer with <kbd>Ctrl</kbd>+wheel and pan with the wheel, the middle mouse button or <kbd>Space</kbd>. Above 100%, the preview shows the real detail of your media. See [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).

## Scrub through the timeline

Scrubbing means dragging the playhead to look for a frame.

1. Click anywhere in the ruler at the top of the timeline. The playhead jumps there, and the preview shows that frame.
2. Drag in the ruler, or drag the playhead's head in the ruler. The preview follows the playhead as you drag.
3. Release the mouse button on the frame you want.

What to expect while you scrub:

- The preview first shows the closest frame it already has, then switches to the exact frame as soon as it is decoded. This usually takes a moment. Deep inside long phone clips it can take longer; see [Know what to expect from performance](#know-what-to-expect-from-performance).
- A video with a ready proxy (a green **PX** chip on its card) scrubs on its proxy, so the exact frame follows the pointer almost at once and the status line reads **Auto: proxy**. When you release the mouse button, or hold the pointer still for 0.3 seconds, the original frame replaces it. See [Edit with proxies in the preview](proxies.md#edit-with-proxies-in-the-preview).
- When the playhead crosses a cut, the preview keeps the previous picture until the new clip's frame is ready. It never flashes black.
- The editor prepares the first and last frames of the clips just before and after the playhead (up to 2 seconds away), so a cut usually shows the new clip at once.
- Dragging in the ruler while the video plays pauses playback.
- Scrubbing is silent, unless **Audio scrub** is on in the timeline toolbar: then you hear a short bit of the sound at each frame the playhead shows, so you can find a cut or a word by ear. See [Hear cuts while you scrub](audio-editing.md#hear-cuts-while-you-scrub).
- While you drag the edge of a clip to trim or stretch it, the preview shows the clip's new first or last frame instead of the frame at the playhead, and goes back to the playhead when you release. See [Trimming clips](trimming.md#trim-a-clip).
- While you roll a cut, slip or slide a clip, the preview splits into two halves that show the frames on both sides of the edit, for example the last frame before a cut and the first frame after it. See [Read the split preview](advanced-trimming.md#read-the-split-preview).
- Hold <kbd>Shift</kbd> while you drag to snap the playhead to the nearest clip start or end, so it lands exactly on a cut. See [Snap the playhead in the ruler](timeline.md#snap-the-playhead-in-the-ruler).

You can also move the playhead with the keyboard (see [Step through frames](#step-through-frames)) or type a time in the timecode field of the timeline toolbar (see [Timeline](timeline.md)).

> **Video placeholder: Scrub across cuts**
> - File: `videos/preview-and-playback/scrub-across-cuts.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. A timeline with three clips in a row on V1.
>   2. Click in the ruler over the second clip: the preview shows that frame.
>   3. Drag slowly across the cut into the third clip: the picture changes at the cut with no black frame.
>   4. Drag fast back to the start: the preview keeps up, then settles on the exact frame.

## Play and pause

1. Press <kbd>Space</kbd>, or click **Play** in the middle of the transport bar under the preview. The button turns into **Pause**.
2. Press <kbd>Space</kbd> again, or click **Pause**, to stop.

How playback behaves:

- Playback starts at the playhead. If the playhead is at the end of the content, playback starts again from the beginning. With **Loop playback** on and in and out points set, playback stays inside that range; see [Loop playback](#loop-playback).
- Before the first frame moves, the editor may wait up to half a second while it decodes the frames and the sound ahead. This is normal.
- You hear the sound of your audio tracks while you play at 1x. See [Audio](audio.md).
- At the end of the content, playback stops on the last frame, unless **Loop playback** is on (see [Loop playback](#loop-playback)).
- The timeline follows the playhead by pages: when the playhead reaches the right edge, the view jumps ahead by most of its width. If you scroll or pan the timeline sideways, drag its bottom scrollbar, or zoom it with the mouse wheel during playback, it stops following until you start playback again. Scrolling up and down does not stop it.
- <kbd>Home</kbd>, <kbd>End</kbd> and the timecode field of the timeline toolbar move the playhead without stopping playback: it plays on from the new position. The arrow keys pause first, then step.
- <kbd>Q</kbd> and <kbd>W</kbd> trim the clip under the playhead while you play, and playback goes on. Dragging a clip edge, rolling, slipping, sliding or stretching a clip, and dragging a layer in the preview pause playback. See [Trim to the playhead with Q and W](trimming.md#trim-to-the-playhead-with-q-and-w).
- Shortcuts work in every panel, except while you type in a text field, while a dropdown list has the keyboard focus, or while a dialog is open.
- While playback is stopped and the pointer rests on an empty part of a timeline track, or on the preview picture while it is zoomed in, <kbd>Space</kbd> starts playback when you release it rather than when you press it: holding it there lets you drag to pan the timeline or the picture. See [Pan the view](timeline.md#pan-the-view) and [Pan the preview](preview-zoom-overlays-fullscreen.md#pan-the-preview).
- To watch your edit without the other panels, press <kbd>F</kbd>: the preview fills the browser window. Press <kbd>Esc</kbd> to return. See [Fill the window with the preview](preview-zoom-overlays-fullscreen.md#fill-the-window-with-the-preview).

## Shuttle with J, K and L

<kbd>J</kbd>, <kbd>K</kbd> and <kbd>L</kbd> let you search through your video at different speeds with one hand.

| Key | What it does |
| --- | --- |
| <kbd>L</kbd> | Plays forward at 1x. Each further press doubles the speed: 2x, 4x, 8x. |
| <kbd>J</kbd> | Plays backward at 1x. Each further press doubles the speed: 2x, 4x, 8x. |
| <kbd>K</kbd> | Pauses at once. |
| Hold <kbd>K</kbd>, tap <kbd>L</kbd> | Steps one frame forward per tap. |
| Hold <kbd>K</kbd>, tap <kbd>J</kbd> | Steps one frame backward per tap. |

- 8x is the fastest speed. Further presses keep 8x.
- <kbd>J</kbd> while you play forward, or <kbd>L</kbd> while you play backward, switches direction at 1x.
- Holding <kbd>J</kbd> or <kbd>L</kbd> down does not change the speed: only presses count.
- At 2x and faster, the preview shows at most 60 pictures per second and skips the frames in between. These skipped frames are not counted as dropped.
- Sound plays only at 1x forward. At 2x and faster, and backward at any speed, playback is silent.
- Backward playback stops on the first frame, unless **Loop playback** is on. It needs more decoding work than forward playback, so heavy footage can play less smoothly backward.
- When you pause, the preview shows the exact frame at the playhead.

> **Video placeholder: Shuttle with J, K and L**
> - File: `videos/preview-and-playback/jkl-shuttle.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. Press <kbd>L</kbd> four times: the playhead runs at 1x, 2x, 4x, then 8x.
>   2. Press <kbd>K</kbd>: playback stops and the preview settles on the exact frame.
>   3. Press <kbd>J</kbd> twice: the video plays backward at 2x.
>   4. Press <kbd>K</kbd>, then hold <kbd>K</kbd> and tap <kbd>J</kbd> and <kbd>L</kbd> to step one frame at a time while the timecode changes by one frame.

## Step through frames

| Action | Keys | Button |
| --- | --- | --- |
| One frame back or forward | <kbd>←</kbd> or <kbd>→</kbd> | **Previous frame**, **Next frame** |
| Five frames back or forward | <kbd>Shift</kbd>+<kbd>←</kbd> or <kbd>Shift</kbd>+<kbd>→</kbd> | |
| One second back or forward | <kbd>Ctrl</kbd>+<kbd>←</kbd> or <kbd>Ctrl</kbd>+<kbd>→</kbd> | |
| Go to the start | <kbd>Home</kbd> | **Go to start** |
| Go to the end of the content | <kbd>End</kbd> | **Go to end** |

- Hold an arrow key to keep stepping: after 0.3 seconds, it repeats about 30 times per second until you release the key.
- Stepping pauses playback first. Steps are silent, unless **Audio scrub** is on in the timeline toolbar: then each step plays a short bit of the sound at the new frame. See [Hear cuts while you scrub](audio-editing.md#hear-cuts-while-you-scrub).
- The playhead never goes before the first frame.
- **Go to end** puts the playhead just after the last frame, where the frame is empty. Click **Previous frame** to see the last frame.
- The timeline scrolls by a page when a step or jump moves the playhead out of view.
- In the Timeline panel, <kbd>↑</kbd> and <kbd>↓</kbd> jump to the previous or next edit point (the start or end of a clip, a marker, the in or out point), and <kbd>Shift</kbd>+<kbd>↑</kbd> and <kbd>Shift</kbd>+<kbd>↓</kbd> to the previous or next marker. See [Keyboard shortcuts](keyboard-shortcuts.md).

The stepping keys work in every panel, also after you click the preview, with one exception: while the Preview panel is active and a layer under the playhead is selected there, <kbd>←</kbd> and <kbd>→</kbd> (with or without <kbd>Shift</kbd>) move that layer instead. Click the timeline, or click beside the frame where no layer is, to step frames again. See [Nudge layers with the arrow keys](arranging-layers-in-the-preview.md#nudge-layers-with-the-arrow-keys).

> **Note:** In the Preview panel, <kbd>↑</kbd> and <kbd>↓</kbd> (with or without <kbd>Shift</kbd>) move the selected layer, and do nothing when no layer is selected there. Click the timeline to jump between edit points and markers.

## Play around the playhead

Press <kbd>Shift</kbd>+<kbd>K</kbd> to check the moment around the playhead. The editor plays at 1x from 2 seconds before the playhead to 2 seconds after it, then puts the playhead back where it was.

- Near the start or the end of the content, the range is shorter.
- Press <kbd>K</kbd> or <kbd>Space</kbd> to stop early. The playhead then stays where you stopped.
- Play around ignores **Loop playback**.
- You hear the sound while it plays.

## Loop playback

1. Click **Loop playback** (the repeat icon at the right of the transport bar), or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>. The button looks pressed while loop is on.
2. Play. At the end of the content, playback continues from the start. Played backward, it continues from the end.
3. Pause, or click **Loop playback** again to turn loop off.

What the loop covers:

- **No in or out point set:** the whole timeline.
- **In and out points set:** only the range between them. If the playhead is outside the range when you start playing, playback starts at the in point. After the last frame of the range, it continues at the in point; played backward, from the last frame of the range. With only an in point, the range runs to the end of your content; with only an out point, from the start of the timeline. See [Set in and out points](markers-and-in-out-points.md#set-in-and-out-points).

Every jump back is frame-exact: the frame after the range never shows, and the sound stays in sync. The project remembers whether loop is on.

## Play from the in point to the out point

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>, or click **Play in to out** (the brackets icon right of **Loop playback**).

- Playback starts at the in point, wherever the playhead is, and ends with the last frame of the range.
- With **Loop playback** off, it plays the range once and stops on its last frame. With **Loop playback** on, it repeats the range until you pause.
- Without an in point it starts at the beginning of the timeline; without an out point it plays to the end of your content. With neither, it plays the whole timeline from the start.

See [Play the range](markers-and-in-out-points.md#play-the-range).

## Read the transport bar and status strip

Under the preview sit the transport bar and, below it, a thin status strip. Hover over any control to see its name and shortcut.

### Readouts

| Readout | Meaning |
| --- | --- |
| Format chip **ff** or **ms** (far left) | The timecode format. Click it to switch between frames (**ff**) and milliseconds (**ms**). See [Show times in milliseconds](timeline.md#show-times-in-milliseconds). |
| Playhead timecode (bright) | The playhead position as minutes:seconds:frames, for example `00:12:15` is 12 seconds and 15 frames; in milliseconds, as minutes:seconds.milliseconds, for example `00:12.500`. Hours appear in front when needed. Click it to type a time; see [Jump to a time from the preview](#jump-to-a-time-from-the-preview). |
| Duration (the dimmer timecode next to it) | The length of your content: the end of the last clip, in the same format. Its tooltip reads **Duration**. |
| Frame rate badge, for example **30 fps** | The project frame rate. Its tooltip reads **Project frame rate**. |

The format chip switches the timecodes everywhere: under the preview, in the timeline toolbar and in the ruler. Each project remembers it.

### Jump to a time from the preview

The playhead timecode under the preview is also a field you can type in. It works like the timecode field of the timeline toolbar.

1. Click the playhead timecode. A border appears and its text is selected.
2. Type a time, for example `1:05:10`, `+30` (30 frames later), `-15` (15 frames earlier) or `+2.` (2 seconds later).
3. Press <kbd>Enter</kbd> to move the playhead there, or <kbd>Esc</kbd> to cancel.

If the editor can't read what you typed, the field gets a red border and stays open: correct the text and press <kbd>Enter</kbd>, or press <kbd>Esc</kbd>. Its tooltip reads **Playhead: type a timecode (1:05:10), +30 or -15 frames, +2. seconds; Enter jumps, Esc cancels**. For every format the field accepts, also in milliseconds, see [Jump to a timecode](timeline.md#jump-to-a-timecode).

### Transport buttons

| Button | Shortcut | What it does |
| --- | --- | --- |
| **Go to start** | <kbd>Home</kbd> | Moves the playhead to the first frame. |
| **Previous frame** | <kbd>←</kbd> | Steps one frame back. |
| **Play** / **Pause** | <kbd>Space</kbd> | Starts or stops playback. |
| **Next frame** | <kbd>→</kbd> | Steps one frame forward. |
| **Go to end** | <kbd>End</kbd> | Moves the playhead to the end of the content. |
| **Mute** / **Unmute** | | Silences the sound you hear, or brings it back. See [Audio](audio.md#set-the-listening-volume). |
| **Master volume** (knob) | | Sets how loud you hear the sound, from -60.0 dB to 0.0 dB. See [Audio](audio.md#set-the-listening-volume). |
| **Loop playback** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Turns looping on or off. |
| **Play in to out** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> | Plays from the in point to the out point. See [Play from the in point to the out point](#play-from-the-in-point-to-the-out-point). |

The zoom controls, including **Fit the frame in the panel**, are in the Preview panel header. See [Zoom in, add overlays and go fullscreen](#zoom-in-add-overlays-and-go-fullscreen).

### Status strip

| Item | Meaning |
| --- | --- |
| Quality, for example **Auto: full** | The quality mode, then what the preview draws right now: **proxy** (at least one picture comes from a [proxy](proxies.md)), **full** (all the detail it can show at this zoom), **reduced** (the project's resolution, for example while you play zoomed in), **half** or **quarter**. See [Read the quality in the status line](preview-zoom-overlays-fullscreen.md#read-the-quality-in-the-status-line). |
| **Dropped** *N* | The frames dropped during the last playback. It resets to 0 each time you start playing. |

A frame counts as dropped when the playback clock had to skip it, or when it was due before its exact picture was ready (the preview held the previous picture instead). Only playback at 1x counts, forward or backward, including play around. At 2x and faster, frames are skipped on purpose and not counted.

## Export the current frame

Save the frame at the playhead as a PNG image, for a thumbnail or a cover picture.

1. Move the playhead to the frame you want.
2. Click **Export frame** (the picture icon in the Preview panel header). The same button is in the **Extras** section of the **Export** tab.
3. The editor saves the picture where your exports go, as chosen under **Save to** in the **Export** tab:
   - **exports folder** (the default): the PNG goes into the project's `exports` folder, named *project name*`-frame-`*frame number*`.png`, for example `Promo-frame-120.png`. An existing file is never overwritten; the new one gets a number, such as `Promo-frame-120 (2).png`.
   - **Choose file…**: the save dialog opens with that name. Choose a folder and a name and click **Save**.
4. A message confirms "Saved *file name*" with the place, the image size and the file size, for example `exports/Promo-frame-120.png · 1080×1920 PNG · 1.2 MB`. Its **Open folder** button opens the file dialog in that folder.

To put the frame on the clipboard instead, click **Copy frame** in the **Extras** section of the **Export** tab. See [Export a frame, the sound or the captions](exporting-video.md#export-a-frame-the-sound-or-the-captions).

Titles and other text appear as they are at that frame, partway through their animation when the playhead is on one (see [Text animations](text-animations.md)). Captions on the **CC** track appear too, with the spoken word highlighted (see [Captions](captions.md)). The image has the project resolution and contains only the frame: no border, none of the panel around it, none of the overlays (safe zones, grids, guides, rulers), and no selection outlines or handles. The zoom level, the pan and the quality mode do not matter.

The editor draws the PNG from the exact frame at the playhead of your original media, at full quality, whatever the preview shows at that moment: never from a [proxy](proxies.md), never at the lower resolution of **1/2** or **1/4**, and never a nearby frame the preview still shows after a scrub. Each video is read at full resolution (up to 4096 pixels on its long side), so fine lines and text in 4K footage stay as sharp as the project resolution allows. Saving can take a moment while that frame is decoded.

If the file cannot be written, a message "Can't export the frame" gives the reason. In a read-only project, saving into the `exports` folder is refused with **This project is read-only**; choose **Choose file…** under **Save to** in the **Export** tab to save it elsewhere. **Export frame** also works while a video export runs. To export the whole video, see [Exporting your video](exporting-video.md).

## Know what to expect from performance

The preview draws with your graphics card (GPU), through WebGPU or, on computers without it, WebGL2 (see [Check your browser](getting-started.md#check-your-browser)), and decodes video with the browser's hardware video decoder. What you can expect:

- **Starting playback:** up to half a second of waiting while the first frames and the sound under the playhead are decoded. Sound and picture then start together.
- **During playback:** each clip under the playhead is decoded up to 15 frames ahead, and never more than half a second ahead. Clips that start within the next 2 seconds are prepared before their cut, so cuts play smoothly.
- **Text animations:** while playback is stopped, the editor prepares every text within 5 seconds of the playhead, so its animation plays smoothly from the first frame. Text further ahead is prepared during playback, before it shows.
- **1080p footage:** plays smoothly, even with a cut every second. On the development machine, a one-minute timeline of one-second 1080p cuts from five different videos played with no dropped frames.
- **4K 60 fps HEVC footage** (common on recent phones): at the limit of what a laptop GPU decodes at full quality. With the default **Auto** quality, the editor makes a [proxy](proxies.md) of such footage after import and plays it: on the development laptop, a 4K 60 fps clip played on its proxy with no or almost no dropped frames. Played in **Full** quality, or before its proxy is ready, expect dropped frames (about 1% on a rested development machine, many more when it runs hot).
- **Transitions within one 4K video:** a transition between two clips of the same 4K 60 fps video dropped 1 to 3 frames of 230 in **Auto** on the development laptop. In **Full**, more than half of its frames dropped, because the same original has to be decoded at two places at once.
- **WebGPU and WebGL2:** both draw the same picture, and 1080p footage and proxies play the same. On the development laptop, 10 seconds of 1080×1920 30 fps video dropped 0 to 8 frames of about 300 with either, and a 4K clip in **Auto** quality, on its proxy, 0 to 3 of about 160. A 4K clip played from the original in **Full** quality dropped up to 18 of about 157 frames with WebGL2, against 1 or 2 with WebGPU, because WebGL2 has more work to do with each 4K frame. The first such playback after the page loads drops more frames with both, and more with WebGL2. With WebGL2, keep **Preview quality** at **Auto**.
- **Scrubbing:** with a proxy, the exact frame follows within one or two screen refreshes (17 to 34 milliseconds on the development laptop), also across a 20-minute 4K 60 fps video. If you move again right after the original frame has appeared, the first proxy frames can take up to about 0.2 seconds. Without a proxy, it usually follows within a fraction of a second: video is stored in groups of frames that start with a keyframe, so the editor decodes from the previous keyframe to show a frame. Deep inside a 4K HEVC phone clip this can take about half a second; the preview shows the closest frame meanwhile.
- **After you stop:** with **Auto**, the original frame replaces the proxy frame usually within a third of a second; deep inside a 4K 60 fps phone clip it can take up to about 0.4 seconds.
- **Backward playback and fast shuttle speeds** need more decoding work than 1x forward.
- **If the video decoder stops:** the browser's video decoder can crash or stop responding, for example after a graphics driver problem. The editor notices and restarts it by itself. Playback shows the frames it already has for about half a second, the picture then holds for a moment, and it moves again within about 1.5 seconds of the crash. Playback doesn't stop, and a proxy or thumbnails being made at that moment are made again.
- **Zoomed in above 100%:** with the default **Auto** quality, playback and scrubbing show the project's resolution (or the proxy), and the full detail of your media follows 0.3 seconds after you stop. **Full** keeps full detail while playing, which is heavier. **1/2** and **1/4** draw playback at half or a quarter of the resolution, which is lighter at every zoom. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality).
- **Fullscreen:** on the development laptop, a 60 fps 1080×1920 project played in the fullscreen preview with at most about 0.5% dropped frames. The first playback after the page loads can drop many more frames while the editor warms up, especially with a large preview; the following playbacks are smoother.
- **Dragging layers:** moving a layer in the preview follows the pointer at the full rate of a 60 Hz screen, also while it snaps and shows smart guides. On the development laptop, frames during a snapped drag took about 17 milliseconds on average. See [Snapping and smart guides in the preview](snapping-and-smart-guides.md).
- **Dragging a value in Edit Properties:** when you drag the label of a field such as **X** or **Opacity**, the preview follows at the full rate of a 60 Hz screen. On the development laptop, frames took about 17 milliseconds on average during such a drag, with none over 20 milliseconds. See [Drag a value](editing-properties.md#drag-a-value).
- **Cropping:** while you drag a crop bracket or bar, the preview and the **Crop** fields follow the pointer at the full rate of a 60 Hz screen. On the development laptop, frames took about 17 milliseconds on average during such a drag. See [Crop with handles in the preview](cropping-and-reframing.md#crop-with-handles-in-the-preview).
- **Large timelines:** on the development laptop, zooming, scrolling, dragging a clip and playing kept the full rate of a 60 Hz screen on a timeline of 500 clips on 8 tracks, with thumbnails and waveforms.
- **Thumbnails:** the editor makes the timeline's thumbnails only while you don't play, scrub or drag, and lets the preview's frames go first, so they don't slow the preview down. See [Know when thumbnails and waveforms appear](clip-thumbnails-and-waveforms.md#know-when-thumbnails-and-waveforms-appear).
- **Proxies:** proxies are made one at a time in the background and pause while you play or drag on the timeline, so they don't slow the preview down. On the development laptop, the editor kept drawing at the full rate of a 60 Hz screen while a proxy was being made. While a video's proxy is being made, only the thumbnails you look at are made from the original, so the proxy is ready sooner. See [Follow a proxy while it is made](proxies.md#follow-a-proxy-while-it-is-made).
- **Importing:** the editor stays responsive while it imports. On the development laptop, 10 files at once (vertical and 4K videos, stereo and 5.1 surround sound, large images) imported in under a second, and the editor never stopped responding for more than 0.05 seconds while it made their thumbnails, waveforms and proxies.
- **Switching projects:** a project frees its memory when it closes, so the editor doesn't slow down after you have opened many projects in a row. See [Open an existing project](getting-started.md#open-an-existing-project).
- **Starting the editor:** on the development laptop, the start screen was ready to use about 0.05 seconds after the page loaded (about 0.2 seconds at most without the browser's cache), and a new project opened in about 0.1 seconds.

If playback stutters, see [Troubleshooting](troubleshooting.md).

## Related pages
- [Exporting your video](exporting-video.md)
- [Editing audio](audio-editing.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Editing properties](editing-properties.md)
- [Cropping and reframing](cropping-and-reframing.md)
- [Captions](captions.md)
- [Proxies](proxies.md)
- [Audio](audio.md)
- [Timeline](timeline.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Tracks](tracks.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Importing media](importing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Workspace](workspace.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 48, 2026-10-18</sub>
