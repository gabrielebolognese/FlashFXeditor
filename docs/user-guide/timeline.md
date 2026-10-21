# Timeline

The timeline is where your short takes shape: clips sit on tracks in time order, and the playhead marks the frame the preview shows. In this version you add clips by double-clicking or dragging media (see [Adding media to the timeline](adding-media-to-the-timeline.md)), select clips and arrange them by dragging (also onto other tracks), snap them to the edges of other clips and to the playhead, duplicate them, zoom, scroll and pan with the scrollbars, the **Hand** tool or the mouse, move the playhead with the mouse, the keyboard or a typed timecode, read times in frames or milliseconds, and rename clips or give them a label color. To shorten or lengthen clips, see [Trimming clips](trimming.md); to split and delete clips and close gaps, see [Splitting, deleting and closing gaps](splitting-and-deleting.md); to roll cuts, slip, slide or change a clip's speed, see [Advanced trimming](advanced-trimming.md). To add, lock, target or rearrange tracks, see [Tracks](tracks.md); to link, sync and group clips, see [Linking and grouping clips](links-and-groups.md). To mark moments with markers, mark a range with in and out points, loop it or lift and extract it, see [Markers and in/out points](markers-and-in-out-points.md). To read the thumbnails, waveforms and badges inside clips, see [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).

> **Video placeholder: Timeline tour**
> - File: `videos/timeline/timeline-overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a project with a few clips on V1 and A1; point in turn at the toolbar, the timecode and duration at its right end, the ruler, the track headers (V1, A1) and their toggles, the divider between video and audio tracks, a blue video clip with its thumbnails, a green audio clip with its waveform, the thin line where the content ends, and the scrollbars under and to the right of the tracks; click the ruler to move the red playhead; press <kbd>\\</kbd> to fit everything; press <kbd>=</kbd> three times to zoom in, then <kbd>-</kbd> to zoom out; click a video clip: it and its sound on A1 turn gold; drag it to the right until its start comes near the end of another clip: it jumps onto the edge and a thin gold line runs through the timeline; release.

## In this page
- [Find your way around the timeline](#find-your-way-around-the-timeline)
- [Add clips from the Media panel](#add-clips-from-the-media-panel)
- [Add and manage tracks](#add-and-manage-tracks)
- [Zoom in and out](#zoom-in-and-out)
- [Use the scrollbars](#use-the-scrollbars)
- [Scroll the timeline](#scroll-the-timeline)
- [Pan the view](#pan-the-view)
- [Move the playhead](#move-the-playhead)
- [Jump to a timecode](#jump-to-a-timecode)
- [Show times in milliseconds](#show-times-in-milliseconds)
- [Follow the playhead during playback](#follow-the-playhead-during-playback)
- [Select clips](#select-clips)
- [Move clips](#move-clips)
- [Snap clips into place](#snap-clips-into-place)
- [Insert clips and push the rest to the right](#insert-clips-and-push-the-rest-to-the-right)
- [Move clips to another track](#move-clips-to-another-track)
- [Duplicate clips](#duplicate-clips)
- [Cancel a drag](#cancel-a-drag)
- [Nudge clips with the keyboard](#nudge-clips-with-the-keyboard)
- [Rename clips](#rename-clips)
- [Give clips a label color](#give-clips-a-label-color)

## Find your way around the timeline

| Part | Where | What it does |
|---|---|---|
| **Toolbar** | Top of the panel | The tools, the **Snap** and **Ripple mode** toggles, the edit buttons, zoom controls, and at the right end the playhead timecode and the total duration. |
| **Ruler** | Above the tracks | Shows time. Click or drag in it to move the playhead. |
| **Markers** | Colored triangles at the bottom of the ruler | Mark moments in your edit. See [Markers and in/out points](markers-and-in-out-points.md). |
| **In/out range** | Shading over the ruler and tracks, with a bracket at each end in the ruler | The range between the in and out points, when you set them. See [Set in and out points](markers-and-in-out-points.md#set-in-and-out-points). |
| **Track headers** | Left column | Each track's icon and name (V1, V2 for video; A1, A2 for audio) and its toggles (target, lock, mute, solo or hide, height), plus the **+ Video track** and **+ Audio track** rows. See [Tracks](tracks.md). |
| **Tracks** | Main area | Video tracks above the divider, audio tracks below it. Each row holds that track's clips. |
| **Playhead** | Red vertical line | Marks the current frame. Its head sits in the ruler. |
| **Content end** | Thin vertical line | Marks the end of the last clip, in the ruler and across the tracks. |
| **Scrollbars** | Under the tracks and at their right | The bar under the tracks scrolls the view left and right, and zooms it with the handles at the ends of its thumb. The bar at the right scrolls the tracks up and down. See [Use the scrollbars](#use-the-scrollbars). |

A project created from the start screen begins with one video track (V1) and one audio track (A1).

### Ruler

The ruler labels show time as `mm:ss:ff` (minutes, seconds, frames), with hours added in front when needed. For example, `00:06:15` is 6 seconds and 15 frames. When you show times in milliseconds, the labels read `mm:ss.mmm` instead, such as `00:06.500`, and the labels between two seconds show only the milliseconds, such as `.500`. See [Show times in milliseconds](#show-times-in-milliseconds).

The spacing of the ticks follows the zoom. Zoomed out, labels can be minutes apart; zoomed in, they reach every second. Zoom in further and frame numbers appear between the second labels; zoom in all the way and every frame gets its full timecode. Labels never overlap.

The ruler also holds your markers (small colored triangles along its bottom edge) and, when you set in and out points, a bracket at each end of the range. Pressing on a marker selects or moves it, and pressing on a bracket in the upper part of the ruler moves that point, instead of moving the playhead. Right-click the ruler for the ruler menu. See [Markers and in/out points](markers-and-in-out-points.md).

### Clips

- A clip is a rounded block in the color of its kind: blue for video, green for audio, gray for images. A clip with a label color is drawn in that color instead; see [Give clips a label color](#give-clips-a-label-color).
- A label bar in a stronger shade at the top shows the kind icon and the clip's name. Long names are shortened with "…". When a clip starts to the left of the view, its label stays visible at the left edge.
- On M and L tracks, the body below the label bar shows the clip's content: thumbnails of a video, the waveform of a sound, or the picture of an image. Zoom in to see more frames. See [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).
- A clip narrower than 24 pixels shows no icon or name. A clip narrower than 6 pixels shows only a thin strip of its color.
- Clips that touch are separated by a thin line, so you can always see the cut.
- A clip gets lighter while you point at it. A selected clip has a gold outline and tint (see [Select clips](#select-clips)).
- The outer 8 pixels at each end of a clip are its trim zones: the cursor turns into a bracket there, and dragging trims the clip. See [Trimming clips](trimming.md).
- Where two clips touch, a click within 3 pixels of the cut selects the cut (red brackets `][` mark it), and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+drag there rolls the cut. See [Advanced trimming](advanced-trimming.md#select-a-cut-edit-point).
- Badges at the right end of the label bar: a red number such as **+12** when the clip is out of step with its linked clip, a speed such as `2x` when it doesn't play at normal speed, and a chain icon when it is linked. They stay visible at the right edge of the tracks when the clip ends after the view. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).
- Clips on a locked track are covered with diagonal lines, and clips of a track you don't see or hear (muted, hidden, or left out by a solo) are drawn faded. See [Tracks](tracks.md).

### Toolbar

In this version these parts of the toolbar work:

- the **Select**, **Razor**, **Hand**, **Slip**, **Slide** and **Rate stretch** tools (see [Choose a tool](advanced-trimming.md#choose-a-tool), [Cut clips with the Razor tool](splitting-and-deleting.md#cut-clips-with-the-razor-tool) and [Pan the view](#pan-the-view));
- the **Snap** toggle (see [Turn snapping on or off](#turn-snapping-on-or-off)), the **Linked selection** toggle (see [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off)) and the **Ripple mode** toggle (see [Turn Ripple mode on or off](trimming.md#turn-ripple-mode-on-or-off));
- the edit buttons **Split at playhead**, **Delete**, **Ripple delete**, **Close gap** and **Close all gaps (compact)** (see [Splitting, deleting and closing gaps](splitting-and-deleting.md)) and **Add marker** (see [Add markers](markers-and-in-out-points.md#add-markers));
- the whole zoom group: **Zoom out**, the zoom slider, **Zoom in**, **Zoom to fit**, **Zoom to selection** (see [Zoom in and out](#zoom-in-and-out)), **Center playhead** (see [Scroll the timeline](#scroll-the-timeline)) and **Track height** (see [Change track height](tracks.md#change-track-height)), then the timecode field and the duration.

The other buttons (the **Show clip keyframes** and **Audio scrub** toggles, the **Freeze frame** and **Punch zoom** edit buttons, and add actions such as **Title**) are shown but disabled; they are available in a later version.

> **Note:** When the timeline panel is too narrow for the whole toolbar, the zoom group (with **Zoom to selection** and **Center playhead**) is the first to move into the **More tools** (…) menu, followed by the toggles with **Snap**, **Linked selection** and **Ripple mode**. Click **More tools** to reach them.

## Add clips from the Media panel

Bring media from the Media panel onto the timeline in any of these ways:

| To | Do this |
|---|---|
| Insert at the playhead, pushing later clips right | Double-click a card, or select cards and press <kbd>,</kbd> |
| Overwrite at the playhead | Select cards and press <kbd>.</kbd> |
| Place clips exactly | Drag cards onto a track. Hold <kbd>Ctrl</kbd> to insert. |
| Place a picture where you want it in the frame | Drag a card onto the preview |
| Import files and place them in one go | Drag files from File Explorer onto a track |

A video with sound becomes a video clip and a linked audio clip, and an image becomes a 5-second clip. The new clips are selected. Point at a card's picture to skim it, and press <kbd>I</kbd> and <kbd>O</kbd> there to use only part of it. Inserts and overwrites move the playhead to the end of the new clips, so you can build a sequence one clip after another.

For every option and rule, see [Adding media to the timeline](adding-media-to-the-timeline.md).

## Add and manage tracks

Click **+ Video track** above the top video track, or **+ Audio track** below the bottom audio track, to add a track. Each track header also has toggles to target, lock, mute, solo or hide the track and to change its height; you can rename, reorder and delete tracks, and right-click a header for the track menu. See [Tracks](tracks.md).

## Zoom in and out

> **Video placeholder: Zoom and scroll the timeline**
> - File: `videos/timeline/zoom-and-scroll.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a timeline with about twenty clips; hold <kbd>Ctrl</kbd> and roll the mouse wheel over a clip edge: the edge stays under the pointer while the view zooms; drag the toolbar zoom slider left and right; click **Zoom in** and **Zoom out**, then press <kbd>=</kbd> three times quickly: the view glides in; roll the wheel to scroll the tracks up and down; hold <kbd>Shift</kbd> and roll the wheel to scroll sideways; click two clips (the second with <kbd>Shift</kbd>) and press <kbd>Shift</kbd>+<kbd>\\</kbd>: they fill the view with a little room on each side; press <kbd>\\</kbd> to fit the whole project.

| To | Do this |
|---|---|
| Zoom in | Click **Zoom in**, press <kbd>=</kbd>, or drag the zoom slider to the right |
| Zoom out | Click **Zoom out**, press <kbd>-</kbd>, or drag the zoom slider to the left |
| Zoom around the mouse pointer | Hold <kbd>Ctrl</kbd> or <kbd>Alt</kbd> and roll the mouse wheel, or pinch on a trackpad |
| Zoom with one edge of the view held in place | Drag an end of the thumb in the scrollbar under the tracks. See [Use the scrollbars](#use-the-scrollbars). |
| Fill the view with the selection | Click **Zoom to selection** or press <kbd>Shift</kbd>+<kbd>\\</kbd>. See [Zoom to the selection](#zoom-to-the-selection). |
| See the whole project | Click **Zoom to fit** or press <kbd>\\</kbd> |

- The buttons and keys zoom by 25% per step. They zoom around the playhead when it is in view, otherwise around the center of the view.
- A step from the buttons or keys glides to the new zoom in 120 milliseconds. Press again before it arrives and the steps add up, so three quick presses zoom three steps.
- With the mouse wheel, each notch is one step, and the frame under the pointer stays under the pointer. Wheel zoom changes at once, without the glide.
- The zoom slider runs from **Zoom to fit** at the far left to the closest zoom, where one frame is 400 pixels wide, at the far right. Moving it by the same distance always changes the zoom by the same factor, so it is as precise zoomed out as zoomed in.
- You can't zoom out further than **Zoom to fit**.
- **Zoom to fit** shows everything from the start to the end of the last clip, plus 2 seconds (at least 1 second in all). It also scrolls back to the start and returns the tracks to their resting position.

The keyboard shortcuts work when the timeline has the keyboard: click in the timeline first.

**Track height**, at the end of the zoom group, changes the height of the tracks; see [Change track height](tracks.md#change-track-height).

Your zoom and scroll position are saved with the project and come back when you reopen it.

### Zoom to the selection

1. Select what you want to look at: clips, a gap, a cut, or tracks.
2. Click **Zoom to selection** in the toolbar, or press <kbd>Shift</kbd>+<kbd>\\</kbd> while the Timeline panel is active.

The selection fills the view, centered, with 10% of the view's width left free on each side.

| Selected | The view shows |
|---|---|
| Clips | From the start of the earliest to the end of the latest selected clip |
| Tracks | All clips on the selected tracks |
| A gap | The gap |
| A cut (edit point) | The clips on both sides of the cut |
| Nothing | Nothing happens |

- The zoom stops at its limit: a very short selection is shown at the closest zoom, one frame per 400 pixels.
- The tracks don't scroll up or down.
- Press <kbd>\\</kbd> to see the whole project again.

## Use the scrollbars

A scrollbar runs under the tracks and another one along their right side. The thumb in the bottom bar shows which part of the timeline you see, and its two ends are zoom handles, each marked by a dot.

> **Video placeholder: Zoom and scroll with the scrollbars**
> - File: `videos/timeline/scrollbars.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with about twenty clips at a medium zoom; point at the scrollbar under the tracks and the dots at both ends of its thumb; drag the middle of the thumb to the right: the view scrolls; point at the dot at the right end: the cursor becomes a double arrow and the dot lights up; drag it to the left: the view zooms in while its left edge stays where it was; drag it back to the right: the view zooms out; drag the dot at the left end to the left: the view zooms out while its right edge stays where it was; click the empty part of the bar near its right end: the thumb jumps there; press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Up</kbd> until the tracks no longer fit, then drag the thumb of the bar at the right: the tracks scroll up and down.

| To | Do this |
|---|---|
| Scroll left or right | Drag the middle of the thumb in the bottom scrollbar |
| Zoom in or out, keeping the left edge of the view where it is | Drag the right end of the thumb: to the left to zoom in, to the right to zoom out |
| Zoom in or out, keeping the right edge of the view where it is | Drag the left end of the thumb: to the right to zoom in, to the left to zoom out |
| Jump to another part of the timeline | Click the empty part of the bottom scrollbar: the middle of the thumb jumps under the pointer. Keep the button down to go on dragging from there. |
| Scroll the tracks up or down | Drag the thumb of the scrollbar at the right of the tracks, or click the empty part of that bar |

- The bottom bar stands for the timeline from its start to the end of the last clip, plus a quarter of the view's width. The more you zoom in, the shorter the thumb.
- Over a zoom handle, the cursor becomes a double arrow and the handle's dot lights up.
- The thumb is never shorter than 36 pixels, so both handles stay easy to grab.
- Zooming with a handle stays within the zoom limits: no further out than **Zoom to fit**, no further in than one frame per 400 pixels.
- The scrollbar at the right has a thumb only when the tracks don't all fit in the panel. Otherwise there is nothing to scroll, and clicking it does nothing.
- During playback, dragging the bottom scrollbar stops the view from following the playhead. See [Follow the playhead during playback](#follow-the-playhead-during-playback).

## Scroll the timeline

| To | Do this |
|---|---|
| Scroll the tracks up or down | Roll the mouse wheel over the timeline, or drag the thumb of the scrollbar at the right of the tracks |
| Scroll left or right | Hold <kbd>Shift</kbd> and roll the mouse wheel, swipe sideways on a trackpad, or drag the thumb of the scrollbar under the tracks |
| Move the view in any direction | Drag with the **Hand** tool, with the middle mouse button, or while you hold <kbd>Space</kbd>. See [Pan the view](#pan-the-view). |
| Center the view on the playhead | Click **Center playhead** in the toolbar, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> while the Timeline panel is active |

- The view can't scroll before the start of the timeline. It can scroll past the end of the last clip by up to a quarter of its width.
- Scrolling up and down moves the video and audio tracks together.
- **Center playhead** and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> keep the zoom and scroll the playhead to the middle of the view. Near the start of the timeline the view can't scroll that far, so the playhead stays left of the middle.
- **Center playhead** sits in the zoom group of the toolbar. When the panel is too narrow, find it in the **More tools** (…) menu.

## Pan the view

Panning moves the view with the pointer, as if you were dragging the timeline itself: left and right in time and up and down through the tracks, in one drag. Nothing in your edit changes.

> **Video placeholder: Pan the timeline**
> - File: `videos/timeline/pan.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a zoomed-in timeline with clips on several video and audio tracks; press <kbd>H</kbd>: the **Hand** button turns gold and the cursor over the tracks becomes an open hand; press on a clip and drag to the left and up: the hand closes, the view follows the pointer, and the clip stays where it was; press <kbd>V</kbd>; drag with the middle mouse button: the view pans the same way and nothing is selected; with playback stopped, point at an empty part of a track and hold <kbd>Space</kbd>: the cursor becomes a hand; drag, then release the mouse button and <kbd>Space</kbd>; point at the same empty part and tap <kbd>Space</kbd>: playback starts; press <kbd>Space</kbd> to pause.

| Pan with | Do this | Where it works |
|---|---|---|
| The **Hand** tool | Press <kbd>H</kbd> or click **Hand** in the toolbar, then drag | Anywhere on the tracks, also on clips |
| The middle mouse button | Press the mouse wheel and drag | Anywhere in the timeline, with any tool |
| <kbd>Space</kbd> | While playback is stopped, point at an empty part of a track, hold <kbd>Space</kbd> and drag | Empty track space |

- The content under the pointer stays under the pointer: drag to the left to see later parts of the timeline, drag up to see the tracks further down.
- The view stops at the same limits as scrolling: the start of the timeline, a quarter of a view past the last clip, and the top and bottom tracks.
- While you pan, the cursor is a closed hand. Panning is not a step in the history.
- During playback, a pan to the left or right stops the view from following the playhead. See [Follow the playhead during playback](#follow-the-playhead-during-playback).

**The Hand tool.** A drag on a clip pans instead of moving the clip, and a click selects nothing. The ruler, the track headers and the scrollbars work as usual, and a right-click on a clip still opens its menu. The tool stays active until you choose another one, and each project remembers it: press <kbd>V</kbd> to go back to **Select**.

**The middle mouse button** never selects or moves anything, whatever the tool.

**<kbd>Space</kbd>** pans only while playback is stopped, while the pointer rests on empty track space (no clip under it) and while no other key is held. The cursor turns into an open hand as soon as you press <kbd>Space</kbd> there. If you release <kbd>Space</kbd> without dragging, playback starts, on the release instead of the press. Anywhere else, and during playback, <kbd>Space</kbd> plays and pauses at once, as usual.

## Move the playhead

> **Video placeholder: Move the playhead and follow playback**
> - File: `videos/timeline/playhead-and-timecode.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: click in the ruler: the playhead jumps there and the preview updates; drag along the ruler to scrub; click the timeline, then press <kbd>Right</kbd> a few times, <kbd>Shift</kbd>+<kbd>Right</kbd>, <kbd>Ctrl</kbd>+<kbd>Right</kbd>, <kbd>Down</kbd> twice to jump between cuts, <kbd>Home</kbd> and <kbd>End</kbd>; click the timecode field, type `+30` and press <kbd>Enter</kbd>, then type `1:05:10` and press <kbd>Enter</kbd>; type `1:x5` and press <kbd>Enter</kbd>: the field gets a red border and stays open; press <kbd>Esc</kbd>: the playhead's time comes back; zoom in, press <kbd>Space</kbd> to play, and watch the view page forward each time the playhead reaches the right edge.

### With the mouse

- Click anywhere in the ruler to move the playhead there. A click on a marker selects the marker, and a press on an in or out bracket in the upper part of the ruler grabs that point; click beside them to move the playhead.
- Drag along the ruler to scrub: the playhead and the preview follow the pointer. The playhead line gets wider while you drag.
- To scrub past the part of the timeline you can see, hold the pointer near the left or right edge of the tracks, or past it: the timeline scrolls. The further out you go, the faster it scrolls.
- If the editor is playing, dragging in the ruler pauses it.
- Hold <kbd>Shift</kbd> while you click or drag in the ruler to snap the playhead to the nearest clip start or end, marker, or in or out point. See [Snap the playhead in the ruler](#snap-the-playhead-in-the-ruler).
- If you scroll or zoom with the mouse wheel while you drag in the ruler, the playhead stays under the pointer.

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
| Jump to the previous or next edit point: a clip start or end on any track, a marker, the in point or the out point | <kbd>Up</kbd> or <kbd>Down</kbd> |
| Jump to the previous or next marker | <kbd>Shift</kbd>+<kbd>Up</kbd> or <kbd>Shift</kbd>+<kbd>Down</kbd> (also <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> and <kbd>Shift</kbd>+<kbd>M</kbd>) |
| Go to the in point, or to the last frame of the range | <kbd>Shift</kbd>+<kbd>I</kbd> or <kbd>Shift</kbd>+<kbd>O</kbd> |

- Hold a step key to keep stepping.
- The step keys pause playback first.
- <kbd>Up</kbd> and <kbd>Down</kbd> visit every clip start and end on all tracks in time order, also where only one track has a cut, and stop at markers and at the in and out points too. At the out point they stop on the frame just after the range. Clips on locked tracks are skipped. When there is no stop further in that direction, the playhead stays where it is.
- When a key moves the playhead out of view, the timeline pages to show it.

For playback keys such as <kbd>Space</kbd> and <kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd>, see [Preview and playback](preview-and-playback.md). All shortcuts are listed in [Keyboard shortcuts](keyboard-shortcuts.md).

## Jump to a timecode

The field at the right end of the toolbar shows the playhead position as `mm:ss:ff`, or as `mm:ss.mmm` when you show times in milliseconds. Next to it, **Duration** shows the end of the last clip in the same format.

1. Click the timecode field. Its text is selected.
2. Type a position, then press <kbd>Enter</kbd>. Press <kbd>Esc</kbd> to cancel: the field shows the playhead's time again.

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
- A number on its own is always a frame number.
- A position before the start goes to the start.
- The timeline pages to show the new position. During playback, playback continues from there.

The field's tooltip is a reminder: **Playhead: type a timecode (1:05:10), +30 or -15 frames, +2. seconds; Enter jumps, Esc cancels**.

### When the editor can't read what you typed

If you press <kbd>Enter</kbd> on text that is not a time, for example `1:x5`, the playhead does not move. The field gets a red border and stays open with your text selected.

- Correct the text: the red border goes away as soon as it reads as a time. Then press <kbd>Enter</kbd>.
- Or press <kbd>Esc</kbd>, or click elsewhere: the field shows the playhead's time again.

### Type times in milliseconds

While you show times in milliseconds (see [Show times in milliseconds](#show-times-in-milliseconds)), the field reads what you type as minutes, seconds and fractions of a second:

| You type | The playhead goes to |
|---|---|
| `1:05.5` | 1 minute, 5.5 seconds |
| `12.25` | 12.25 seconds |
| `+2.` | 2 seconds later |
| `+1.5` | 1.5 seconds later |
| `+30` | 30 frames later |
| `120` | Frame 120 |

- `:` separates hours, minutes and seconds, and `.` starts the fraction of a second. So `5:00` means 5 minutes here, not 5 seconds.
- The playhead goes to the frame nearest the time you typed.

## Show times in milliseconds

Timecodes count frames by default. To read times in milliseconds instead, for example to match a time from a script or a music cue, switch the format with the small chip under the preview.

> **Video placeholder: Switch timecodes to milliseconds**
> - File: `videos/timeline/timecode-format.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: under the preview, point at the chip **ff** left of the playhead timecode until its tooltip appears; click it: the chip reads **ms**, the preview timecode, the duration, the timeline's timecode field and **Duration** switch to `mm:ss.mmm`, and the ruler labels read `00:01.000`, `00:02.000`; click the timeline's timecode field, type `1:05.5` and press <kbd>Enter</kbd>: the playhead jumps to 1 minute 5.5 seconds; click **ms**: everything shows frames again.

1. Under the preview, click **ff**, just left of the playhead timecode. Its tooltip reads **Timecode in frames (mm:ss:ff): click for milliseconds**.
2. The chip now reads **ms**, and times show as `mm:ss.mmm`: for example, `00:12.500` is 12 and a half seconds.
3. To go back to frames, click **ms**. Its tooltip reads **Timecode in milliseconds (mm:ss.mmm): click for frames**.

The format applies to:

- the playhead timecode and the duration under the preview;
- the timecode field and **Duration** in the timeline toolbar, including what you type into the field (see [Type times in milliseconds](#type-times-in-milliseconds));
- the ruler labels.

The tooltips you see while you drag clips, edges or cuts always show frames. Hours appear in front when needed, as in `01:02:03.500`. Times are rounded down to the millisecond: at 30 fps, for example, the second frame (`00:00:01`) shows as `00:00.033`.

Each project remembers the format. Switching it is not a step in the history, and it has no keyboard shortcut. Clicking the chip does not take the keyboard focus, so your shortcuts keep working right after.

## Follow the playhead during playback

While the editor plays, the timeline follows the playhead. When the playhead reaches the right edge of the tracks, the view jumps forward by one view width minus 10%, so the playhead reappears near the left edge. The view moves a page at a time rather than scrolling continuously, so clips stay easy to read. During backward playback it pages the other way.

- Scrolling or panning sideways, dragging the thumb or a zoom handle of the bottom scrollbar, or zooming with the mouse wheel during playback stops following, so you can look at another part of the timeline. Following starts again the next time you start playback.
- Scrolling the tracks up or down does not stop following.
- Keyboard jumps (the step keys, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Up</kbd>, <kbd>Down</kbd>) and typed timecodes always bring the playhead into view, whether the editor is playing or not.

## Select clips

> **Video placeholder: Select clips**
> - File: `videos/timeline/select-clips.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with three videos with sound on V1 and A1 and a music clip on A2; click the first video clip: it and its sound turn gold; <kbd>Shift</kbd>+click the second video clip: both pairs are selected; <kbd>Ctrl</kbd>+click the sound of the second clip: only that sound is removed; <kbd>Alt</kbd>+click the third video clip: only that clip is selected; click an empty part of a track: nothing is selected; drag on empty track space from left of the first clip across parts of the first two clips and the music: the clips turn gold as the rectangle touches them; release; press <kbd>Ctrl</kbd>+<kbd>A</kbd>, then <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>.

| To | Do this |
|---|---|
| Select a clip (with its linked clips and its group) | Click it |
| Add a clip (with its linked clips and its group) to the selection, or remove it | <kbd>Shift</kbd>+click it |
| Add or remove only that clip, without its linked clips | <kbd>Ctrl</kbd>+click it |
| Select only that clip, without its linked clips | <kbd>Alt</kbd>+click it |
| Select every clip a rectangle touches | Drag on an empty part of the tracks |
| Add the clips a rectangle touches to the selection | <kbd>Shift</kbd>+drag on an empty part of the tracks |
| Select all clips | <kbd>Ctrl</kbd>+<kbd>A</kbd> |
| Select all clips on one track | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click its track header |
| Clear the selection | Click an empty part of a track, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> |
| Select a cut between two clips instead | Click right on the cut. See [Select a cut (edit point)](advanced-trimming.md#select-a-cut-edit-point). |
| Select a gap instead | Click the empty space between two clips. See [Select a gap](splitting-and-deleting.md#select-a-gap). |
| Select a track instead | Click its header. See [Select tracks](tracks.md#select-tracks). |

A selected clip has a gold outline and a gold tint. The clip you clicked last has a slightly thicker outline.

- **Linked clips.** When you add a video with sound, its video clip and its sound clip are linked: a click selects both, and they move and trim together. To work on one of them alone, <kbd>Alt</kbd>+click it, or turn off **Linked selection** (<kbd>Shift</kbd>+<kbd>S</kbd>) in the toolbar. When you move one of them alone, both show a red number with the offset in frames. See [Linking and grouping clips](links-and-groups.md).
- **Groups.** A click on a clip of a group selects the whole group. See [Group clips](links-and-groups.md#group-clips).
- **Locked tracks.** Clips on a locked track can't be selected: a click on them works like a click on empty space, and <kbd>Ctrl</kbd>+<kbd>A</kbd> and rectangles skip them. See [Lock a track](tracks.md#lock-a-track).
- **Clicking a selected clip.** When you press on a clip that is already selected, the editor waits to see what you do: if you drag, the whole selection moves; if you release without dragging, the click applies (a plain click then keeps only that clip and its linked clips).
- <kbd>Ctrl</kbd>+<kbd>A</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> work while the Timeline or the Preview panel is active. The other selection shortcuts are mouse actions in the timeline.
- Selecting is not a step in the history, but undo brings back the selection you had before the change you undo. See [Undo and redo](projects-and-saving.md#undo-and-redo-changes).
- While clips are selected, the **Edit Properties** panel shows a placeholder: clip properties are available in a later version. While tracks are selected, it shows their **Track** section; see [Change track settings in Edit Properties](tracks.md#change-track-settings-in-edit-properties).

### Select with a rectangle

1. Press on an empty part of a track, away from any clip.
2. Drag. A gold rectangle follows the pointer, and every clip it touches lights up gold, also when the rectangle covers only part of the clip. The linked clips of those clips are selected too.
3. Release. The lit clips become the selection.

- Hold <kbd>Shift</kbd> when you start the drag to add to the clips that are already selected.
- Hold the pointer near the edge of the tracks, or past it, to scroll the timeline while you drag. Clips that scroll out of view stay in the rectangle.
- Press <kbd>Esc</kbd> before you release to cancel: the selection stays as it was.

## Move clips

Drag clips to move them in time, and up or down to other tracks. While you drag, nothing changes yet: a see-through copy of each clip (a ghost) shows where it will land. Releasing the mouse button makes the whole move one step in the history.

> **Video placeholder: Move clips**
> - File: `videos/timeline/move-clips.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a timeline with a 10-second clip on V1 and a 2-second clip on V2; drag the short clip to the right: its ghost follows and the tooltip reads `Δ +00:01:00` after one second; drag it down onto the middle of the long clip: the part it will cover is hatched; release: the long clip is now two clips around the short one; point at the **Undo** tooltip, which reads **Undo Move clip**; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the long clip is whole again and the short clip is back on V2; select both clips and drag them right together.

1. Select the clips you want to move. You can also skip this step and press directly on an unselected clip: it is selected at once and moves on its own (with its linked clips).
2. Press on one of the selected clips, away from its ends, and drag. The move starts once the pointer has moved 4 pixels, so a click never moves a clip by accident. A press in the outer 8 pixels at either end of a clip trims it instead; see [Trimming clips](trimming.md).
3. Watch the ghosts, the hatching and the tooltip, then release where you want the clips.

All selected clips move together and keep their distances to each other.

What you see while you drag:

| You see | It means |
|---|---|
| Ghosts: see-through copies of the clips with a gold outline | Where each clip lands when you release. |
| The tooltip `Δ +00:00:12` next to the pointer | How far the clips moved, as `mm:ss:ff`. A minus sign means to the left. |
| Diagonal hatching over part of a ghost | The part of another clip that the moved clip will cover and remove. |
| A gold vertical line with an arrow | An insert: the clips at and after the line shift to the right. See [Insert clips and push the rest to the right](#insert-clips-and-push-the-rest-to-the-right). |
| An extra track row with a name such as V3 | A new track the drop creates. See [Move clips to another track](#move-clips-to-another-track). |
| A thin gold line through the ruler and all tracks, and a name in gold in the tooltip, such as **End of Intro** | The clips snapped to that edge. See [Snap clips into place](#snap-clips-into-place). |

Keys you can hold while you drag:

| Hold | What the drop does |
|---|---|
| Nothing | Moves the clips. They cover whatever they land on. |
| <kbd>Shift</kbd> | Moves the clips in time only: every clip stays on its track. |
| <kbd>Ctrl</kbd> | Inserts the clips: everything after them shifts right. |
| <kbd>Alt</kbd> | Leaves the clips in place and drops copies. See [Duplicate clips](#duplicate-clips). |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd> | Inserts copies. |

You can press and release these keys during the drag: the ghosts change at once. The keys you hold when you release the mouse button decide what happens. Hold <kbd>S</kbd> as well to switch snapping for the drag; see [Switch snapping for one drag](#switch-snapping-for-one-drag).

### What happens to the clips underneath

A plain drop covers what the moved clips land on. The clip underneath gives up exactly the part that is covered:

| The moved clip covers | The clip underneath |
|---|---|
| Its start or its end | Is shortened. |
| All of it | Is removed. |
| A part in the middle | Is split into two clips, one on each side. |

- The moved clips never cover each other: they all leave their old places first.
- The places the clips came from stay empty.
- Clips can't move before `00:00:00`. When you drag further left, the earliest clip stops at the start.
- Clips can't be dropped onto a locked track: the drop is refused, nothing changes, and the message **Can't drop clips onto a locked track** names the track. See [Lock a track](tracks.md#lock-a-track).

### After the drop

- The moved clips stay selected, and the clip you dragged is the one with the thicker outline.
- The **Undo** tooltip names the move, for example **Undo Move clip** or **Undo Move clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole move at once: clips that were shortened, split or removed come back, any track the move created disappears, and the selection is restored.
- Dropping moved clips back where they started changes nothing and adds no step to the history.

> **Tip:** Hold the pointer near the edge of the tracks, or past it, to scroll the timeline while you drag, left and right or up and down. The further out you go, the faster it scrolls, so you can carry clips to a part of the timeline you can't see.

Clips snap to the edges of other clips and to the playhead while you drag. See [Snap clips into place](#snap-clips-into-place).

## Snap clips into place

While you drag clips, they snap: when the start or the end of the moved clips comes within 8 pixels of the edge of another clip, the playhead, a marker, an in or out point or the start of the timeline, the clips jump onto it. This lines clips up end to end, with no gap and no overlap, at any zoom. Snapping is on in a new project.

> **Video placeholder: Snap clips and the playhead**
> - File: `videos/timeline/snapping.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a timeline with a clip named "Intro" at the start of V1 and a clip named "Beach" further right on V1; drag "Beach" to the left until its start comes near the end of "Intro": it jumps onto the edge, a thin gold line runs through the ruler and all tracks, and the tooltip reads the move followed by **End of Intro** in gold; move the pointer a little: the clip stays on the edge; drag further: it lets go and the line disappears; drag back and release on the edge: the clips touch with no gap; press <kbd>=</kbd> twice and drag again: it snaps at the same distance on screen; click **Snap** (the magnet) in the toolbar to turn snapping off and drag again: no snapping; hold <kbd>S</kbd> during the drag: it snaps; release <kbd>S</kbd>: free again; release the mouse button and press <kbd>S</kbd> to turn snapping back on; drag in the ruler near the start of "Beach", then hold <kbd>Shift</kbd>: the playhead jumps onto the edge and **Start of Beach** appears next to the pointer.

1. Press on a clip and drag it toward the edge where it should go.
2. When the start or the end of the moved clips comes within 8 pixels of a target, the clips jump onto it. A thin gold line runs through the ruler and all tracks at that frame, and the tooltip names the target in gold after the move, for example `Δ -00:04:20` **End of Intro**.
3. Release the mouse button while the line shows. The clips land exactly on that frame.

What clips snap to:

| Target | Name in the tooltip |
|---|---|
| The start or end of any other clip, on any track | **Start of** *clip name* or **End of** *clip name* |
| The playhead | **Playhead** |
| A marker | **Marker:** and the marker's name, or **Marker** when it has none |
| The in point, or the out point (the end of the range's last frame) | **In point** or **Out point** |
| The start of the timeline (`00:00:00`) | **Timeline start** |

Markers and the in and out points snap the same way when you drag them: see [Move a marker](markers-and-in-out-points.md#move-a-marker) and [Adjust the range in the ruler](markers-and-in-out-points.md#adjust-the-range-in-the-ruler).

How snapping decides:

- **Distance on screen.** The reach is 8 pixels at every zoom. Zoomed out, 8 pixels span more frames, so clips snap from further away in time; zoomed in, they snap only close to the edge.
- **Both ends.** The start of the moved clips (of the earliest one) and their end (of the latest one) can both snap. Whichever is closer to a target lands on it.
- **Closest target first.** When several targets are within reach, the closest one wins. When two are equally close, the playhead wins over a clip edge, a clip edge over a marker, a marker over an in or out point, and those over the start of the timeline.
- **The moved clips are not targets,** and neither are the linked clips that move with them. When you duplicate with <kbd>Alt</kbd>, the originals stay in place and are targets, so a copy snaps to the end of its original.
- **It holds.** Small pointer movements keep the clips on the edge. They let go once the edge is more than 8 pixels away.
- Snapping changes the time only. Moving clips to another track works as without snapping, and clips still can't move before `00:00:00`.
- Nudging with the keyboard never snaps: the clips move by exactly 1 or 5 frames.
- A clip edge you drag to trim the clip snaps the same way. See [Snap the edge while you trim](trimming.md#snap-the-edge-while-you-trim).
- Media you drag in from the Media panel snaps the same way, with the start or the end of the new clips. See [Drag media onto the timeline](adding-media-to-the-timeline.md#drag-media-onto-the-timeline).

### Turn snapping on or off

- Click **Snap** (the magnet icon) in the timeline toolbar, or press <kbd>S</kbd>. The magnet is gold while snapping is on.
- <kbd>S</kbd> works in every panel, except while you type in a text field.
- Each project remembers whether snapping is on. Turning it on or off is not a step in the history.

### Switch snapping for one drag

Hold <kbd>S</kbd> while you drag to do the opposite of the setting: with snapping on, the clips move freely; with snapping off, they snap. Release <kbd>S</kbd> and the setting applies again at once. The **Snap** magnet and the setting do not change.

1. Start dragging the clips.
2. Press and hold <kbd>S</kbd>.
3. Release the mouse button while you still hold <kbd>S</kbd>.

- Press <kbd>S</kbd> after the drag has started. An <kbd>S</kbd> pressed before you start dragging turns snapping on or off, as it does outside a drag.
- You can hold <kbd>S</kbd> together with <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>Alt</kbd>. During a drag, <kbd>S</kbd> never starts a shortcut: <kbd>Ctrl</kbd>+<kbd>S</kbd> does not save until you release the mouse button.

### Snap the playhead in the ruler

The playhead moves freely when you click or drag in the ruler. Hold <kbd>Shift</kbd> to snap it to the start or end of a clip, a marker, an in or out point, or the start of the timeline.

1. Click or drag in the ruler, or drag the playhead's head, near a clip edge.
2. Hold <kbd>Shift</kbd>. Within 8 pixels of an edge or a marker, the playhead jumps onto it. A gold line shows in the ruler, and the name of the edge, such as **Start of Beach**, appears next to the pointer.
3. Release <kbd>Shift</kbd> to move freely again, or release the mouse button to leave the playhead on the edge.

- <kbd>Shift</kbd> snaps only while snapping is on. With snapping off, hold <kbd>Shift</kbd> and <kbd>S</kbd> together.
- You can press and release <kbd>Shift</kbd> during the drag: the playhead reacts at once.

> **Note:** <kbd>Shift</kbd> snaps only in the ruler. When you drag clips, they snap without it, and <kbd>Shift</kbd> keeps every clip on its track.

## Insert clips and push the rest to the right

Hold <kbd>Ctrl</kbd> when you release a drag to insert the clips instead of covering what is there. The clips land at the drop position, and the rest of the timeline makes room for them.

> **Video placeholder: Insert clips**
> - File: `videos/timeline/insert-clips.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a timeline with three clips end to end on V1, a music clip on A1 under all of them, and a short clip on V2 further right; drag the short clip down to the cut between the first and second clip on V1; hold <kbd>Ctrl</kbd>: a gold line with an arrow appears at the cut; release: the second and third clips shift right, the music is cut in two at the line and its second part shifts right as well; point at the **Undo** tooltip, which reads **Undo Insert clip**.

What an insert does:

- A gold vertical line with an arrow shows the insert point: the start of the earliest moved clip.
- On every track, everything from the insert point onward shifts right by the length of the moved clips (from the start of the earliest to the end of the latest).
- A clip that runs across the insert point, on any track, is split there, and its second part shifts right with the rest. This keeps every track in step, so sound stays in sync with its picture.
- Locked tracks don't take part: their clips neither shift nor split. See [Lock a track](tracks.md#lock-a-track).
- The places the clips came from stay empty.
- The history step is named **Insert clip** or **Insert clips**.

## Move clips to another track

Drag clips up or down to put them on other tracks. Video tracks count up from the divider (V1, V2, V3…) and audio tracks count down from it (A1, A2, A3…).

> **Video placeholder: Move clips to another track**
> - File: `videos/timeline/move-to-track.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with a clip on V1 and a clip on V2 at different times; select both with a click and a <kbd>Shift</kbd>+click; drag them up by one row: both ghosts move up one track and keep their distance; release: the clips are on V2 and V3; drag the top clip above the top video track: a new row named V4 appears with the ghost in it; release: track V4 is created; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: V4 is gone; select a clip and press <kbd>Alt</kbd>+<kbd>Down</kbd> to move it one track down.

- The clip you press on follows the track under the pointer. The other selected clips move by the same number of tracks and keep their distances.
- Video clips stay on video tracks and audio clips on audio tracks. A video clip dragged over the audio tracks goes to V1; an audio clip dragged over the video tracks goes to A1.
- When the selection holds both video and audio clips, for example a video with its linked sound, both move the same number of tracks away from the divider (or toward it). Dragging the video from V1 to V2 takes its sound from A1 to A2.
- To change the time only and keep every clip on its track, hold <kbd>Shift</kbd> while you drag.

### Create a track by dragging

Drag above the top video track to put a clip on a new video track, or below the bottom audio track to put it on a new audio track. While you drag, the new track shows as an extra row with the name it will get, such as **V3**, and the ghost sits in it. If the row is out of view, hold the pointer at the edge of the tracks to scroll to it. The drop creates the track. A move that needs a track that does not exist yet, for example a sound going from A1 to A2 when there is no A2, creates it the same way.

Undo removes the tracks the move created, together with the move.

## Duplicate clips

Hold <kbd>Alt</kbd> while you drag to copy clips instead of moving them.

> **Video placeholder: Duplicate clips and cancel a drag**
> - File: `videos/timeline/duplicate-and-cancel.mp4` (not recorded yet)
> - Length: about 35 seconds
> - Shows: select two clips on V1; hold <kbd>Alt</kbd> and drag them to the right: the ghosts follow while the originals stay; release: the copies appear, selected, and the **Undo** tooltip reads **Undo Duplicate clips**; start dragging one of the copies, press <kbd>Esc</kbd> before releasing: the ghosts disappear and nothing changes; the **Undo** tooltip still reads **Undo Duplicate clips**.

1. Select the clips to copy.
2. Hold <kbd>Alt</kbd>, press on one of the selected clips and drag.
3. Release where the copies should go.

- The originals stay where they are. The copies are selected after the drop.
- Copies of linked clips are linked to each other, not to the originals.
- Copies cover what they land on, like moved clips, including their own originals. Hold <kbd>Ctrl</kbd> as well to insert the copies instead.
- The originals are snap targets: drag a copy to the right and it snaps to the end of its original, with no gap. See [Snap clips into place](#snap-clips-into-place).
- <kbd>Alt</kbd>+pressing a clip that is not selected selects only that clip, without its linked clips, so only that clip is copied. To copy a video together with its sound, select it with a plain click first.
- The history step is named **Duplicate clip** or **Duplicate clips** (**Duplicate and insert clips** with <kbd>Ctrl</kbd>).

## Cancel a drag

Press <kbd>Esc</kbd> before you release the mouse button. The ghosts disappear, and releasing then changes nothing: no clip moves and no step is added to the history. <kbd>Esc</kbd> also cancels a selection rectangle and a trim.

An undo or redo during a drag (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) also cancels the drag.

## Nudge clips with the keyboard

Click the timeline first, so it has the keyboard, and select the clips to move.

| To | Press |
|---|---|
| Move the selected clips 1 frame left or right | <kbd>Alt</kbd>+<kbd>Left</kbd> or <kbd>Alt</kbd>+<kbd>Right</kbd> |
| Move the selected clips 5 frames left or right | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Left</kbd> or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Right</kbd> |
| Move the selected clips to the track above or below | <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Alt</kbd>+<kbd>Down</kbd> |

**Nudging left and right**

- Nudged clips cover what they land on, like a drop. See [What happens to the clips underneath](#what-happens-to-the-clips-underneath).
- Hold the keys to keep nudging. Nudges less than 0.3 seconds apart count as one step in the history, named **Nudge clip** or **Nudge clips**, so one <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes a quick series.
- Clips can't move before `00:00:00`.

**Moving to the track above or below**

- The clips move one track up or down on screen when that track exists and has room for them. The step is named **Move clip to track** or **Move clips to track**.
- The clip you clicked last decides the direction. Linked clips of the other kind move by the same number of tracks, as in a drag: a video going from V1 to V2 takes its sound from A1 to A2. If its sound has no track to go to, it stays where it is.
- These keys never create a track. On the top video track, <kbd>Alt</kbd>+<kbd>Up</kbd> does nothing (and the same for the bottom audio track and <kbd>Alt</kbd>+<kbd>Down</kbd>).
- If a clip is in the way, nothing moves, and the message **No room on that track** names the track that already has a clip there. If that track is locked, nothing moves either, and the message **Can't drop clips onto a locked track** names it.

> **Note:** <kbd>Alt</kbd>+<kbd>Left</kbd> is also the browser's Back key. The editor keeps it while the Timeline panel is active, also when no clip is selected. In the other panels, the browser gets it. See [Keys the browser keeps](keyboard-shortcuts.md#keys-the-browser-keeps).

To trim clips, see [Trimming clips](trimming.md) and [Advanced trimming](advanced-trimming.md). To split and delete clips, see [Splitting, deleting and closing gaps](splitting-and-deleting.md).

## Rename clips

A new clip takes the name of its media. Rename it to find it again quickly: the name shows in the clip's label bar, in the snapping tooltip (for example **End of Intro shot**) and in messages.

> **Video placeholder: Rename and label clips**
> - File: `videos/timeline/rename-and-label.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: click a video clip and press <kbd>F2</kbd>: a text field opens over its label bar with the name selected; type "Intro shot" and press <kbd>Enter</kbd>: the label bar shows the new name; hover **Undo**: it reads **Undo Rename clip**; right-click another clip and choose **Rename**, type a letter and press <kbd>Escape</kbd>: the name stays; right-click the first clip and click the orange swatch in the **Label** row: the video and its sound turn orange; right-click it again and click the orange swatch, which has a gold ring: the clips go back to blue and green.

1. Select the clip and press <kbd>F2</kbd> (the Timeline panel must be active), or right-click the clip and choose **Rename**.
2. A text field opens over the clip's label bar, with the name selected. If the clip is out of view, the timeline scrolls to it first.
3. Type the new name and press <kbd>Enter</kbd>, or click elsewhere. Press <kbd>Escape</kbd> to keep the old name.

- With several clips selected, <kbd>F2</kbd> renames the one with the thicker outline: the clip you clicked last.
- Names can be up to 255 characters. Spaces at the start and end are removed, and a blank name is ignored.
- Scrolling or zooming the timeline while the field is open keeps the name you typed and closes the field.
- Renaming a clip changes neither its media nor its linked clip.
- The history step is named **Rename clip**.

In the Media panel, <kbd>F2</kbd> renames the selected media instead; see [Rename media](importing-media.md#rename-media).

## Give clips a label color

Label colors help you see at a glance which clips belong together, for example all the B-roll, or every clip of one scene.

1. Select the clips, or skip this step to label one clip (and its linked clips).
2. Right-click one of the clips.
3. In the **Label** row of the menu, click a color: **Red**, **Orange**, **Green**, **Teal**, **Blue**, **Violet**, **Pink** or **Grey**. Point at a swatch to see its name.

- Every selected clip takes the color. A right-click on a clip that is not selected selects it with its linked clips, so a video and its sound take the color together.
- A labeled clip is drawn in its label color instead of the color of its kind. In a video clip, the color shows in the label bar above the thumbnails; in an audio clip, the waveform is drawn on it. A selected clip keeps its gold outline.
- In the menu, the current color of the clip you right-clicked has a gold ring, and its tooltip reads, for example, **Teal (click to remove)**. Click it to remove the label from the selected clips: they go back to the color of their kind.
- Each change is one step in the history, named **Label clip** or **Label clips**. Labels are saved with the project, and both parts of a split clip keep the label.

## Related pages
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Advanced trimming](advanced-trimming.md)
- [Audio](audio.md)
- [Getting started](getting-started.md)
- [Workspace](workspace.md)
- [Importing media](importing-media.md)
- [Preview and playback](preview-and-playback.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 20, 2026-10-15</sub>
