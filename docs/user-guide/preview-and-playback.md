# Preview and playback

The Preview panel shows your video as it looks at the playhead: every video and image clip under the playhead, stacked track by track inside the project frame. Use it to check a frame while you scrub the timeline, to play your edit back with its sound, and to save a still of the current frame. To zoom in on detail, show safe zones and grids, or fill the window with the preview, see [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).

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
- **The background.** Wherever no clip covers the frame, you see the project background color: black by default. Change it in the **Background** field of the same **Project** section (a hex color such as `#000000`).
- **Empty frames.** In a gap between clips, past the end of the last clip, or in a project with no clips, the frame shows only the background.

### Stacked tracks

When several video tracks have a clip at the playhead, the preview draws the bottom video track (the one next to the divider, **V1** in a new project) first, and each higher video track over the tracks below it. Audio tracks never show in the preview.

- To change which picture is on top, drag a track header up or down. See [Reorder tracks](tracks.md#reorder-tracks).
- A video track that is muted (**M**) or hidden (the eye) is left out of the preview. See [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks).

> **Note:** Every clip you add by double-clicking goes to the targeted video track nearest the divider (**V1** in a new project). To stack clips, drag one up to **V2** or higher. See [Move clips to another track](timeline.md#move-clips-to-another-track).

### Sound

Playback plays the sound of your audio tracks in sync with the picture. The audio meter is the narrow strip along the right edge of the Preview panel, and the **Mute** button and **Master volume** knob sit in the transport bar. See [Audio](audio.md).

### Media that cannot be shown

A video that your browser cannot decode (for example HEVC on a computer without HEVC decoding) shows nothing in the preview: you see the background, or the tracks below it. See [Troubleshooting](troubleshooting.md).

## See how clips fit the frame

When you add a video or an image to the timeline, the editor scales it to fit inside the project frame and centers it. The whole picture stays visible; nothing is cropped. To put a picture somewhere else in the frame, for example a logo in a corner, drag its card from the Media panel onto the preview: it is scaled the same way and centered where you release. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview).

| Media | In a 1080×1920 project |
| --- | --- |
| Vertical 9:16 video or image, at any size (1080×1920, 2160×3840...) | Fills the frame exactly. |
| Landscape 16:9 (1920×1080, 3840×2160...) | Fills the width, with bands above and below (letterbox). |
| Square (1080×1080) or 4:5 | Fills the width, with bands above and below. |
| Phone video recorded upright | Shown upright. The editor reads the rotation the phone stores in the file. |

The bands show the project background color.

> **Note:** The fit is set when you add the clip. If you change the project resolution later, existing clips keep their size and position. One-click Fill (no bands) is available in a later version.

## Zoom in, add overlays and go fullscreen

The Preview panel header holds the controls that change how you look at the frame, from left to right:

| Control | What it does |
| --- | --- |
| **Zoom** | Shows the zoom level and opens the menu of levels: **Fit**, **25%**, **50%**, **100%**, **200%**, **400%**. |
| **Fit the frame in the panel** | Shows the whole frame again, centered (<kbd>Ctrl</kbd>+<kbd>0</kbd> in the Preview panel). |
| **Preview quality** | Shows the quality mode and opens the menu of modes: **Auto**, **Full**, **Proxy**, **1/2**, **1/4**. |
| **Overlays** (grid icon) | Safe zones for Reels, TikTok and Shorts, grids, the center cross, title / action safe, rulers and the pixel grid. |
| **Snap** (magnet) | Turns snapping on or off, as in the timeline toolbar (<kbd>S</kbd>). |
| **Smart guides** | Turns smart guides on or off. The guides are available in a later version. |
| **Fullscreen** | Fills the browser window with the preview (<kbd>F</kbd>); <kbd>Esc</kbd> returns. |
| **Export frame** | Saves the current frame as a PNG. See [Export the current frame](#export-the-current-frame). |

You can also zoom at the pointer with <kbd>Ctrl</kbd>+wheel and pan with the wheel, the middle mouse button or <kbd>Space</kbd>. Above 100%, the preview shows the real detail of your media. See [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).

## Scrub through the timeline

Scrubbing means dragging the playhead to look for a frame.

1. Click anywhere in the ruler at the top of the timeline. The playhead jumps there, and the preview shows that frame.
2. Drag in the ruler, or drag the playhead's head in the ruler. The preview follows the playhead as you drag.
3. Release the mouse button on the frame you want.

What to expect while you scrub:

- The preview first shows the closest frame it already has, then switches to the exact frame as soon as it is decoded. This usually takes a moment. Deep inside long phone clips it can take longer; see [Know what to expect from performance](#know-what-to-expect-from-performance).
- When the playhead crosses a cut, the preview keeps the previous picture until the new clip's frame is ready. It never flashes black.
- The editor prepares the first and last frames of the clips just before and after the playhead (up to 2 seconds away), so a cut usually shows the new clip at once.
- Dragging in the ruler while the video plays pauses playback.
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
- <kbd>Q</kbd> and <kbd>W</kbd> trim the clip under the playhead while you play, and playback goes on. Dragging a clip edge, and rolling, slipping, sliding or stretching a clip, pauses playback. See [Trim to the playhead with Q and W](trimming.md#trim-to-the-playhead-with-q-and-w).
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
- Stepping pauses playback first. Steps are silent.
- The playhead never goes before the first frame.
- **Go to end** puts the playhead just after the last frame, where the frame is empty. Click **Previous frame** to see the last frame.
- The timeline scrolls by a page when a step or jump moves the playhead out of view.
- In the Timeline panel, <kbd>↑</kbd> and <kbd>↓</kbd> jump to the previous or next edit point (the start or end of a clip, a marker, the in or out point), and <kbd>Shift</kbd>+<kbd>↑</kbd> and <kbd>Shift</kbd>+<kbd>↓</kbd> to the previous or next marker. See [Keyboard shortcuts](keyboard-shortcuts.md).

The stepping keys work in every panel, also after you click the preview.

> **Note:** In the Preview panel, <kbd>↑</kbd> and <kbd>↓</kbd> (with or without <kbd>Shift</kbd>) do nothing: there they are reserved for moving items on the canvas, available in a later version. Click the timeline to jump between edit points and markers.

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
| Quality, for example **Auto: full** | The quality mode, then what the preview draws right now: **full** (all the detail it can show at this zoom), **reduced** (the project's resolution, for example while you play zoomed in), **half** or **quarter**. See [Read the quality in the status line](preview-zoom-overlays-fullscreen.md#read-the-quality-in-the-status-line). |
| **Dropped** *N* | The frames dropped during the last playback. It resets to 0 each time you start playing. |

A frame counts as dropped when the playback clock had to skip it, or when it was due before its exact picture was ready (the preview held the previous picture instead). Only playback at 1x counts, forward or backward, including play around. At 2x and faster, frames are skipped on purpose and not counted.

## Export the current frame

Save the frame at the playhead as a PNG image, for a thumbnail or a cover picture.

1. Move the playhead to the frame you want.
2. Wait until the preview has settled on the exact frame.
3. Click **Export frame** (the picture icon in the Preview panel header).
4. In the save dialog, choose a folder and a name. The editor suggests "*project name* frame.png".
5. Click **Save**. A message confirms "Saved *file name*" with the image size, for example "1080×1920 PNG".

The image has the project resolution and contains only the frame: no border, none of the panel around it, and none of the overlays (safe zones, grids, guides, rulers). The zoom level, the pan and the quality mode do not matter.

> **Note:** If you export while the preview still shows a nearby frame (during or right after scrubbing), the PNG contains that frame. Wait for the picture to settle first.

If the file cannot be written, a message "Can't export the frame" gives the reason. Exporting the whole video is available in a later version.

## Know what to expect from performance

The preview draws with your graphics card (GPU) and decodes video with the browser's hardware video decoder. What you can expect:

- **Starting playback:** up to half a second of waiting while the first frames and the sound under the playhead are decoded. Sound and picture then start together.
- **During playback:** each clip under the playhead is decoded up to 15 frames ahead, and never more than half a second ahead. Clips that start within the next 2 seconds are prepared before their cut, so cuts play smoothly.
- **1080p footage:** plays smoothly, even with a cut every second. On the development machine, a one-minute timeline of one-second 1080p cuts from five different videos played with no dropped frames.
- **4K 60 fps HEVC footage** (common on recent phones): at the limit of what a laptop GPU decodes at full quality. Expect a few dropped frames (about 1% on the development machine), and more when the computer runs hot. Lighter proxy copies are available in a later version.
- **Scrubbing:** the exact frame usually follows within a fraction of a second. Video is stored in groups of frames that start with a keyframe, so the editor decodes from the previous keyframe to show a frame. Deep inside a 4K HEVC phone clip this can take about half a second; the preview shows the closest frame meanwhile.
- **Backward playback and fast shuttle speeds** need more decoding work than 1x forward.
- **Zoomed in above 100%:** with the default **Auto** quality, playback and scrubbing show the project's resolution, and the full detail of your media follows 0.3 seconds after you stop. **Full** keeps full detail while playing, which is heavier. **1/2** and **1/4** draw playback at half or a quarter of the resolution, which is lighter at every zoom. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality).
- **Fullscreen:** on the development laptop, a 60 fps 1080×1920 project played in the fullscreen preview with at most about 0.5% dropped frames. The first playback after the page loads can drop many more frames while the editor warms up, especially with a large preview; the following playbacks are smoother.
- **Thumbnails:** the editor makes the timeline's thumbnails only while you don't play, scrub or drag, and lets the preview's frames go first, so they don't slow the preview down. See [Know when thumbnails and waveforms appear](clip-thumbnails-and-waveforms.md#know-when-thumbnails-and-waveforms-appear).

If playback stutters, see [Troubleshooting](troubleshooting.md).

## Related pages
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Audio](audio.md)
- [Timeline](timeline.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Tracks](tracks.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Importing media](importing-media.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Workspace](workspace.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 21, 2026-10-15</sub>
