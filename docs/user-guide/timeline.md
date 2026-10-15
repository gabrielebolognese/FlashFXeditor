# Timeline

The timeline is where your short takes shape: clips sit on tracks in time order, and the playhead marks the frame the preview shows. In this version you add clips by double-clicking media, add tracks, zoom and scroll, and move the playhead with the mouse, the keyboard or a typed timecode. Moving, trimming and splitting clips are available in a later version.

> **Video placeholder: Timeline tour**
> - File: `videos/timeline/timeline-overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a project with a few clips on V1 and A1; point in turn at the toolbar, the timecode and duration at its right end, the ruler, the track headers (V1, A1), the divider between video and audio tracks, a blue video clip, a green audio clip, and the thin line where the content ends; click the ruler to move the red playhead; press <kbd>\\</kbd> to fit everything; press <kbd>=</kbd> three times to zoom in, then <kbd>-</kbd> to zoom out; click a clip to select it.

## In this page
- [Find your way around the timeline](#find-your-way-around-the-timeline)
- [Add clips from the Media panel](#add-clips-from-the-media-panel)
- [Add tracks](#add-tracks)
- [Zoom in and out](#zoom-in-and-out)
- [Scroll the timeline](#scroll-the-timeline)
- [Move the playhead](#move-the-playhead)
- [Jump to a timecode](#jump-to-a-timecode)
- [Follow the playhead during playback](#follow-the-playhead-during-playback)
- [Select clips](#select-clips)

## Find your way around the timeline

| Part | Where | What it does |
|---|---|---|
| **Toolbar** | Top of the panel | Zoom controls, and at the right end the playhead timecode and the total duration. |
| **Ruler** | Above the tracks | Shows time. Click or drag in it to move the playhead. |
| **Track headers** | Left column | Each track's icon and name (V1, V2 for video; A1, A2 for audio), plus the **+ Video track** and **+ Audio track** rows. |
| **Tracks** | Main area | Video tracks above the divider, audio tracks below it. Each row holds that track's clips. |
| **Playhead** | Red vertical line | Marks the current frame. Its head sits in the ruler. |
| **Content end** | Thin vertical line | Marks the end of the last clip, in the ruler and across the tracks. |

A project created from the start screen begins with one video track (V1) and one audio track (A1).

### Ruler

The ruler labels show time as `mm:ss:ff` (minutes, seconds, frames), with hours added in front when needed. For example, `00:06:15` is 6 seconds and 15 frames.

The spacing of the ticks follows the zoom. Zoomed out, labels can be minutes apart; zoomed in, they reach every second. Zoom in further and frame numbers appear between the second labels; zoom in all the way and every frame gets its full timecode. Labels never overlap.

### Clips

- A clip is a rounded block in the color of its kind: blue for video, green for audio, gray for images.
- A label bar in a stronger shade at the top shows the kind icon and the clip's name. Long names are shortened with "…". When a clip starts to the left of the view, its label stays visible at the left edge.
- A clip narrower than 24 pixels shows no icon or name. A clip narrower than 6 pixels shows only a thin strip of its color.
- Clips that touch are separated by a thin line, so you can always see the cut.
- A clip gets lighter while you point at it. A selected clip has a gold outline and tint (see [Select clips](#select-clips)).

Thumbnails and waveforms inside clips are available in a later version.

### Toolbar

In this version the toolbar's zoom group, the timecode field and the duration work. The other buttons (tools such as **Select** and **Razor**, toggles such as **Snap**, edit actions such as **Split at playhead**, and add actions such as **Title**) are shown but disabled; they are available in a later version.

> **Note:** When the timeline panel is too narrow for the whole toolbar, the zoom group is the first to move into the **More tools** (…) menu. Click **More tools** to reach the zoom slider and buttons.

## Add clips from the Media panel

Double-clicking a media item adds it to the timeline at the playhead. This is the quickest way to assemble a short: put the playhead at the start, then double-click your clips in order.

> **Video placeholder: Build a sequence by double-clicking**
> - File: `videos/timeline/add-clips-double-click.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: an empty timeline with the playhead at `00:00:00`; in the Media panel, double-click the thumbnail of a video with sound: a video clip appears on V1 and its audio on A1, and the playhead jumps to their end; double-click two more thumbnails: the clips line up end to end; double-click a PNG: a 5-second image clip is added on V1; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice and the last two inserts disappear one at a time.

1. Move the playhead to where the clip should start. See [Move the playhead](#move-the-playhead).
2. In the Media panel, double-click the item's thumbnail in grid view, or its row in list view. Double-clicking the name renames the item instead.

What you get:

| Media | Result |
|---|---|
| Video with sound | A video clip on the first video track (V1) and an audio clip with its sound on the first audio track (A1), with the same start and length. |
| Video without sound | A video clip on V1. |
| Audio | An audio clip on A1. |
| Image (including GIF) | A 5-second image clip on V1. |

- Video and audio clips use the whole media, in whole frames at the project frame rate.
- If V1 or A1 does not exist, it is created.
- Nothing is ever overwritten. If a clip already occupies the spot at the playhead, the new clip goes to the first free space after the playhead where it fits (on both tracks, for a video with sound).
- The picture is scaled to fit inside the frame and centered.
- The playhead moves to the end of the new clip, so the next double-click adds the next clip right after it.
- The new clip is not selected; the selection stays as it was.
- Each insert is one step in the history. The **Undo** tooltip reads **Undo Insert clip**, and <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes the whole insert (video and audio together).

If an item has no usable duration, the message **Can't insert** *name*, **It has no duration.** appears and nothing is added.

> **Note:** Dragging media onto the timeline is available in a later version.

## Add tracks

- To add a video track, click **+ Video track** in the track header column, just above the top video track. The new track (V2, V3, and so on) goes above the existing video tracks.
- To add an audio track, click **+ Audio track** in the track header column, just below the bottom audio track. The new track (A2, A3, and so on) goes below the existing audio tracks.

The divider between video and audio tracks stays where it is, so the tracks you are working on do not jump. Adding a track is one step in the history; <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes it.

Track controls (lock, mute, solo, hide), renaming tracks and track heights are available in a later version.

## Zoom in and out

> **Video placeholder: Zoom and scroll the timeline**
> - File: `videos/timeline/zoom-and-scroll.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a timeline with about twenty clips; hold <kbd>Ctrl</kbd> and roll the mouse wheel over a clip edge: the edge stays under the pointer while the view zooms; drag the toolbar zoom slider left and right; click **Zoom in** and **Zoom out**; roll the wheel to scroll the tracks up and down; hold <kbd>Shift</kbd> and roll the wheel to scroll sideways; press <kbd>\\</kbd> to fit the whole project.

| To | Do this |
|---|---|
| Zoom in | Click **Zoom in**, press <kbd>=</kbd>, or drag the zoom slider to the right |
| Zoom out | Click **Zoom out**, press <kbd>-</kbd>, or drag the zoom slider to the left |
| Zoom around the mouse pointer | Hold <kbd>Ctrl</kbd> or <kbd>Alt</kbd> and roll the mouse wheel, or pinch on a trackpad |
| See the whole project | Click **Zoom to fit** or press <kbd>\\</kbd> |

- The buttons and keys zoom by 25% per step. They zoom around the playhead when it is in view, otherwise around the center of the view.
- With the mouse wheel, each notch is one step, and the frame under the pointer stays under the pointer.
- The zoom slider runs from **Zoom to fit** at the far left to the closest zoom, where one frame is 400 pixels wide, at the far right. Moving it by the same distance always changes the zoom by the same factor, so it is as precise zoomed out as zoomed in.
- You can't zoom out further than **Zoom to fit**.
- **Zoom to fit** shows everything from the start to the end of the last clip, plus 2 seconds (at least 1 second in all). It also scrolls back to the start and returns the tracks to their resting position.

The keyboard shortcuts work when the timeline has the keyboard: click in the timeline first.

**Zoom to selection** and **Track height** are in the toolbar but disabled; they are available in a later version.

Your zoom and scroll position are saved with the project and come back when you reopen it.

## Scroll the timeline

| To | Do this |
|---|---|
| Scroll the tracks up or down | Roll the mouse wheel over the timeline |
| Scroll left or right | Hold <kbd>Shift</kbd> and roll the mouse wheel, or swipe sideways on a trackpad |

- The view can't scroll before the start of the timeline. It can scroll past the end of the last clip by up to a quarter of its width.
- Scrolling up and down moves the video and audio tracks together.

Scrollbars and panning by dragging (the **Hand** tool) are available in a later version.

## Move the playhead

> **Video placeholder: Move the playhead and follow playback**
> - File: `videos/timeline/playhead-and-timecode.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: click in the ruler: the playhead jumps there and the preview updates; drag along the ruler to scrub; click the timeline, then press <kbd>Right</kbd> a few times, <kbd>Shift</kbd>+<kbd>Right</kbd>, <kbd>Ctrl</kbd>+<kbd>Right</kbd>, <kbd>Down</kbd> twice to jump between cuts, <kbd>Home</kbd> and <kbd>End</kbd>; click the timecode field, type `+30` and press <kbd>Enter</kbd>, then type `1:05:10` and press <kbd>Enter</kbd>; zoom in, press <kbd>Space</kbd> to play, and watch the view page forward each time the playhead reaches the right edge.

### With the mouse

- Click anywhere in the ruler to move the playhead there.
- Drag along the ruler to scrub: the playhead and the preview follow the pointer. The playhead line gets wider while you drag.
- If the editor is playing, dragging in the ruler pauses it.

You can't drag the playhead line inside the tracks: that keeps you from moving it by accident while you work on clips. Use the ruler.

### With the keyboard

Click the timeline first so it has the keyboard. (While the preview has the keyboard, the arrow keys are reserved for the preview.)

| To | Press |
|---|---|
| Step 1 frame back or forward | <kbd>Left</kbd> or <kbd>Right</kbd> |
| Step 5 frames | <kbd>Shift</kbd>+<kbd>Left</kbd> or <kbd>Shift</kbd>+<kbd>Right</kbd> |
| Step 1 second | <kbd>Ctrl</kbd>+<kbd>Left</kbd> or <kbd>Ctrl</kbd>+<kbd>Right</kbd> |
| Go to the start | <kbd>Home</kbd> |
| Go to the end of the last clip | <kbd>End</kbd> |
| Jump to the previous or next clip start or end | <kbd>Up</kbd> or <kbd>Down</kbd> |

- Hold a step key to keep stepping.
- The step keys pause playback first.
- When a key moves the playhead out of view, the timeline pages to show it.

For playback keys such as <kbd>Space</kbd> and <kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd>, see [Preview and playback](preview-and-playback.md). All shortcuts are listed in [Keyboard shortcuts](keyboard-shortcuts.md).

## Jump to a timecode

The field at the right end of the toolbar shows the playhead position as `mm:ss:ff`. Next to it, **Duration** shows the end of the last clip in the same format.

1. Click the timecode field. Its text is selected.
2. Type a position, then press <kbd>Enter</kbd>. Press <kbd>Esc</kbd> to cancel.

| You type | The playhead goes to |
|---|---|
| `1:05:10` | 1 minute, 5 seconds, 10 frames |
| `5:00` | 5 seconds |
| `120` | Frame 120 |
| `+30` | 30 frames later |
| `-15` | 15 frames earlier |
| `+2.` | 2 seconds later |
| `+1.15` | 1 second and 15 frames later |

- `:` and `.` both separate the fields, counted from the right: frames, then seconds, minutes and hours.
- A position before the start goes to the start. Text the editor can't read is ignored, and the playhead stays where it was.
- The timeline pages to show the new position. During playback, playback continues from there.

The field's tooltip is a reminder: **Playhead (type a timecode, +30 or -15 frames, +2. seconds)**.

## Follow the playhead during playback

While the editor plays, the timeline follows the playhead. When the playhead reaches the right edge of the tracks, the view jumps forward by one view width minus 10%, so the playhead reappears near the left edge. The view moves a page at a time rather than scrolling continuously, so clips stay easy to read. During backward playback it pages the other way.

- Scrolling sideways or zooming with the mouse wheel during playback stops following, so you can look at another part of the timeline. Following starts again the next time you start playback.
- Scrolling the tracks up or down does not stop following.
- Keyboard jumps (the step keys, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Up</kbd>, <kbd>Down</kbd>) and typed timecodes always bring the playhead into view, whether the editor is playing or not.

## Select clips

| To | Do this |
|---|---|
| Select a clip | Click it |
| Add or remove a clip | <kbd>Shift</kbd>+click it |
| Clear the selection | Click an empty part of a track |

A selected clip has a gold outline and a gold tint. The clip you clicked last has a slightly thicker outline.

Moving, trimming, splitting and deleting clips are available in a later version.

## Related pages
- [Getting started](getting-started.md)
- [Workspace](workspace.md)
- [Importing media](importing-media.md)
- [Preview and playback](preview-and-playback.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 09, 2026-10-15</sub>
