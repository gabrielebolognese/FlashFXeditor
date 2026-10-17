# Markers and in/out points

Markers are colored flags in the ruler that note a moment in your edit: a beat, a punchline, the place a title should start. In and out points mark a range of the timeline, so you can play it on its own, loop it while you fine-tune it, or take it out of your edit in one step with **Lift** or **Extract**.

> **Video placeholder: Markers and in/out points**
> - File: `videos/markers-and-in-out-points/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows: a project with a video with sound on V1 and A1 and a title image on V2; click the timeline; play and press <kbd>M</kbd> on three beats: green triangles appear at the bottom of the ruler; pause; drag a marker toward the start of the title: it jumps onto the edge and the tooltip names **Start of** and the clip's name in gold; double-click the marker, type "Drop" and press <kbd>Enter</kbd>; point at it: the tooltip shows **Drop** and its time; click it: the **Marker** section opens in **Edit Properties**; click the ruler, press <kbd>I</kbd>, move the playhead two seconds on and press <kbd>O</kbd>: the range is shaded, with a bracket at each end in the ruler; drag the out bracket a little to the right; press <kbd>Shift</kbd>+<kbd>Down</kbd> to jump to the next marker.

## In this page
- [Add markers](#add-markers)
- [Name a marker and change its color](#name-a-marker-and-change-its-color)
- [Move a marker](#move-a-marker)
- [Edit a marker in Edit Properties](#edit-a-marker-in-edit-properties)
- [Jump between markers](#jump-between-markers)
- [Delete markers](#delete-markers)
- [Set in and out points](#set-in-and-out-points)
- [Mark a clip or the selection](#mark-a-clip-or-the-selection)
- [Adjust the range in the ruler](#adjust-the-range-in-the-ruler)
- [Clear in and out points](#clear-in-and-out-points)
- [Play the range](#play-the-range)
- [Lift or extract a range](#lift-or-extract-a-range)
- [Use the ruler menu](#use-the-ruler-menu)
- [What is saved and what you can undo](#what-is-saved-and-what-you-can-undo)

## Add markers

1. Move the playhead to the frame you want to mark.
2. Press <kbd>M</kbd>, or click **Add marker** (the bookmark icon) in the **Edit** group of the timeline toolbar.

A small triangle appears at the bottom of the ruler, pointing down at that frame. New markers are green and have no name.

- <kbd>M</kbd> works in every panel, except while you type in a text field. It also works while the video plays, so you can tap it on the beats of your music.
- To add a marker somewhere else without moving the playhead, right-click that spot in the ruler and choose **Add marker**. See [Use the ruler menu](#use-the-ruler-menu).
- <kbd>M</kbd> adds no second marker on a frame that already has one: it opens that marker's editor instead. See [Name a marker and change its color](#name-a-marker-and-change-its-color).
- Point at a marker to see its name (or **Marker** when it has none) and its time. The marker gets a thin white outline, and the cursor turns into a hand.
- Click a marker to select it: it gets a gold outline, and **Edit Properties** shows its **Marker** section. A marker stays selected until you select a clip, a gap, a cut or a track, or delete the marker.

## Name a marker and change its color

> **Video placeholder: Edit a marker**
> - File: `videos/markers-and-in-out-points/edit-marker.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: double-click a green marker in the ruler: a small editor opens under it with the label field selected; type "Hook" and press <kbd>Enter</kbd>; double-click it again and click the pink swatch: the marker turns pink at once; press <kbd>Esc</kbd>; point at the marker: the tooltip reads **Hook** and its time; double-click it once more and click **Delete marker** (the trash icon): the marker disappears; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: it is back.

1. Double-click the marker in the ruler, or press <kbd>M</kbd> while the playhead is on it. A small editor opens under the marker, with the **Marker label** field selected.
2. Type a name. A name can be up to 255 characters long; spaces at the start and end are removed.
3. Click one of the eight color swatches: **Red**, **Orange**, **Green**, **Teal**, **Blue**, **Violet**, **Pink** or **Grey**. The marker changes color at once, and the editor stays open. The current color has a gold ring.
4. Press <kbd>Enter</kbd> to save the name and close the editor.

- A click outside the editor, or scrolling or zooming the timeline, also saves the name and closes the editor.
- <kbd>Esc</kbd> closes the editor without saving the name. A color you clicked stays.
- **Delete marker** (the trash icon at the right of the swatches) deletes the marker.
- If the marker is outside the view, the timeline scrolls to it first.
- Each change is one undo step: the **Undo** tooltip names it **Rename marker** or **Color marker**.

You can also change the name and the color in the **Marker** section of **Edit Properties**. See [Edit a marker in Edit Properties](#edit-a-marker-in-edit-properties).

## Move a marker

1. Press on the marker in the ruler and drag it left or right. The cursor becomes a double arrow (↔), and the tooltip shows the marker's name and its new time.
2. Release the mouse button where it should go.

- While snapping is on, the marker jumps onto clip edges, the playhead, other markers, the in and out points and the start of the timeline when it comes within 8 pixels of them. A thin gold line marks the target, and the tooltip names it in gold, for example **Start of Beach**. Hold <kbd>S</kbd> during the drag to do the opposite of the snapping setting. See [Snap clips into place](timeline.md#snap-clips-into-place).
- Drag past the left or right edge of the tracks to scroll the timeline.
- Press <kbd>Esc</kbd> before you release the mouse button to leave the marker where it was.
- A marker can't move before `00:00:00`.
- The move is one undo step, named **Move marker**.

To place a marker on an exact frame, type its time in the **Marker** section of **Edit Properties**. See [Edit a marker in Edit Properties](#edit-a-marker-in-edit-properties).

## Edit a marker in Edit Properties

Click a marker in the ruler to select it. The **Edit Properties** panel shows its **Marker** section:

| Field | What it does |
| --- | --- |
| **Label** | The marker's name. Type a name and press <kbd>Enter</kbd>. Shows "No label" when the marker has none. |
| **Color** | The eight label colors. Click a swatch to change the color. |
| **Time** | The marker's position, in the same format as the other timecodes (frames or milliseconds). Type a timecode such as `0:03:10`, or `+30` or `-15` to move it by frames, and press <kbd>Enter</kbd>. |
| **Delete marker** | Deletes the marker. |

Each change is one undo step.

## Jump between markers

Click the timeline first: these keys work only while the Timeline panel is active.

| To | Press |
| --- | --- |
| Go to the next marker | <kbd>Shift</kbd>+<kbd>Down</kbd> or <kbd>Shift</kbd>+<kbd>M</kbd> |
| Go to the previous marker | <kbd>Shift</kbd>+<kbd>Up</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> |

- When there is no marker further in that direction, the playhead stays where it is.
- <kbd>Up</kbd> and <kbd>Down</kbd> also stop at markers, together with clip starts and ends and the in and out points. See [Move the playhead](timeline.md#move-the-playhead).
- The timeline scrolls when the playhead lands outside the view.

## Delete markers

Do one of these:

- Click the marker, then press <kbd>Delete</kbd> or <kbd>Backspace</kbd> (in the Timeline or the Preview panel).
- Right-click the marker in the ruler and choose **Delete marker**.
- Click **Delete marker** (the trash icon) in the marker's editor, or **Delete marker** in its **Marker** section of **Edit Properties**.

Each delete is one undo step, named **Delete marker**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings the marker back.

> **Note:** While a marker is selected, <kbd>Delete</kbd> deletes the marker, not clips. Clicking an empty part of the tracks does not deselect the marker: click a clip first if you want to delete clips.

## Set in and out points

In and out points mark a range: the in point is its first frame, the out point its last frame.

1. Move the playhead to the first frame of the range and press <kbd>I</kbd>.
2. Move the playhead to the last frame of the range and press <kbd>O</kbd>.

The range is shaded across the ruler and the tracks, with a bracket in the ruler at each end. The frame under the playhead when you press <kbd>O</kbd> is inside the range, so the out bracket stands just after it.

- <kbd>I</kbd> and <kbd>O</kbd> work in every panel, also while the video plays. While the pointer is over the picture of a video or audio card in the Media panel, they mark a part of that media item instead; see [Use only part of a media item](adding-media-to-the-timeline.md#use-only-part-of-a-media-item).
- Press <kbd>I</kbd> or <kbd>O</kbd> again to move that point.
- You can set just one of them. With only an in point, the range runs from it to the end of your content; with only an out point, from the start of the timeline to it.
- If you set an in point after the out point, the out point is cleared, and the other way around.
- Press <kbd>Shift</kbd>+<kbd>I</kbd> to move the playhead to the in point, and <kbd>Shift</kbd>+<kbd>O</kbd> to move it to the last frame of the range.
- **Transcribe** in the **Captions** tab offers to transcribe just the range (**In to out**). See [Transcribe part of the timeline](transcription.md#transcribe-part-of-the-timeline).

## Mark a clip or the selection

**Mark the clip under the playhead.** Click the timeline, put the playhead over a clip and press <kbd>X</kbd>. The in and out points move to the clip's start and end.

When several clips are under the playhead, <kbd>X</kbd> picks, in this order: a selected clip, then the topmost clip on a targeted track, then the topmost clip on any track. If no clip is under the playhead, the message **No clip under the playhead** appears and nothing changes.

**Mark the selection.** Right-click the ruler and choose **Set in/out to selection**. The range then covers:

- the selected clips, from the earliest start to the latest end;
- with tracks selected, all the clips on those tracks;
- a selected gap;
- or the two clips on each side of a selected cut.

With nothing selected (or a marker selected), **Set in/out to selection** is dimmed.

## Adjust the range in the ruler

> **Video placeholder: Adjust the range**
> - File: `videos/markers-and-in-out-points/adjust-range.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: a range set with <kbd>I</kbd> and <kbd>O</kbd>; point at the in bracket in the upper part of the ruler: it brightens and the cursor becomes a double arrow; drag it to the right: the tooltip reads **In** with the time and the range length; drag it near a marker: it jumps onto it and the marker's name shows in gold; release; drag the out bracket to the left past the in point: it stops one frame after it; press <kbd>Esc</kbd> before releasing: the range is back as it was.

1. Point at the in or out bracket in the upper part of the ruler. The bracket brightens and the cursor becomes a double arrow (↔).
2. Drag it left or right. The tooltip shows the point and the length of the range, for example `In 00:01:10 · 00:00:20`.
3. Release the mouse button.

- While snapping is on, the bracket jumps onto clip edges, the playhead, markers, the other point and the start of the timeline within 8 pixels. Hold <kbd>S</kbd> to do the opposite of the snapping setting.
- The range is always at least one frame long: the in bracket stops one frame before the out point, and the out bracket one frame after the in point.
- Press <kbd>Esc</kbd> before you release the mouse button to keep the range as it was.
- A click on a bracket without dragging changes nothing, and doesn't move the playhead.

## Clear in and out points

| To clear | Press | Or |
| --- | --- | --- |
| The in point | <kbd>Alt</kbd>+<kbd>I</kbd> | |
| The out point | <kbd>Alt</kbd>+<kbd>O</kbd> | |
| Both | <kbd>Alt</kbd>+<kbd>X</kbd> | Right-click the ruler and choose **Clear in/out** |

These keys work in every panel. **Lift** and **Extract** also clear both points when they are done.

## Play the range

> **Video placeholder: Play and loop a range**
> - File: `videos/markers-and-in-out-points/play-range.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: set an in point and an out point two seconds apart; click **Play in to out** (the brackets icon under the preview): the range plays once and stops on its last frame; click **Loop playback**: it turns on; press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>: the range repeats, jumping from its last frame back to the in point with the sound going on; press <kbd>Space</kbd> to pause; click in the ruler far after the range and press <kbd>Space</kbd>: playback starts at the in point and loops the range.

**Play from in to out.** Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>, or click **Play in to out** (the brackets icon right of **Loop playback** under the preview).

- Playback starts at the in point and ends with the last frame of the range, wherever the playhead was.
- With **Loop playback** off, it plays once and stops on the last frame of the range.
- With **Loop playback** on, it repeats the range until you pause.
- Without an in point it starts at the beginning of the timeline; without an out point it plays to the end of your content. With no points at all, it plays the whole timeline from the start.
- This shortcut works in every panel.

**Loop the range.** While **Loop playback** is on and a range is set, every playback loops the range:

- <kbd>Space</kbd> and <kbd>L</kbd> play from the playhead when it is inside the range. When it is outside the range, playback starts at the in point.
- After the last frame of the range, playback continues at the in point. Played backward with <kbd>J</kbd>, it continues from the last frame of the range.
- The jump is frame-exact: the frame after the range never shows, and the sound stays in sync with the picture.

With **Loop playback** off, <kbd>Space</kbd> plays as usual, through the range to the end of your content. See [Loop playback](preview-and-playback.md#loop-playback).

## Lift or extract a range

> **Video placeholder: Lift and extract**
> - File: `videos/markers-and-in-out-points/lift-extract.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a video with sound on V1 and A1 and a title on V2; set an in point and an out point across the middle of the video; click the timeline and press <kbd>'</kbd>: the range disappears on all three tracks, the rest moves left, the shading goes and the playhead stands where the range began; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: everything is back in one step; set the range again and press <kbd>;</kbd>: the range becomes a gap and nothing moves; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; click the crosshair in the V2 header to untarget it, set the range again and press <kbd>'</kbd>: the title stays as it is.

Both edits take the range out of the **targeted** tracks (the crosshair in the track header is on) that are not locked:

| Edit | Key | What it does |
| --- | --- | --- |
| **Lift** | <kbd>;</kbd> | Removes the range and leaves a gap. Nothing else moves. |
| **Extract** | <kbd>'</kbd> | Removes the range and closes it: everything after it moves left by the length of the range. |

1. Set an in point and an out point around the part you want to remove.
2. Turn off the target of any track you want to leave as it is. See [Choose the tracks your edits use (target)](tracks.md#choose-the-tracks-your-edits-use-target).
3. Click the timeline, then press <kbd>;</kbd> for **Lift** or <kbd>'</kbd> for **Extract**.

What happens to the clips:

- Clips completely inside the range are removed.
- A clip that crosses the in point or the out point is trimmed at that point.
- A clip that runs across the whole range is cut in two, and the part inside the range is removed. When a video and its sound are both cut this way, their parts after the range stay linked.
- Afterwards, the in and out points are cleared and the playhead goes to the frame where the range began.
- Each edit is one undo step, named **Lift** or **Extract**.

How **Extract** moves the other tracks:

- Tracks that are not targeted follow the ripple as after a ripple delete: their clips after the range move left with the rest, and a clip that runs across the range, such as a music bed, stays where it is. See [How other tracks follow a ripple](splitting-and-deleting.md#how-other-tracks-follow-a-ripple).
- When a clip on such a track can't move that far without overlapping the clip before it, the range closes only as far as it can follow. The message **Extract closed the gap partly** (or **Extracted without closing the gap** when nothing could move) names the clip and its track.
- Locked tracks never change and never stop the ripple.

Good to know:

- Without an in point, the range starts at the beginning of the timeline; without an out point, it runs to the end of your content.
- Only the targets count, not **Linked selection**: to remove a video together with its sound, target both tracks.
- <kbd>;</kbd> and <kbd>'</kbd> work only while the Timeline panel is active.

| Message | What it means |
| --- | --- |
| **Set an in or out point first** | No in or out point is set. Press <kbd>I</kbd> and <kbd>O</kbd> first. |
| **No targeted track** | Every track is untargeted or locked. Click the crosshair in a track header to target it. |
| **Extract closed the gap partly** | The range was removed, but it closed only partly. |
| **Extracted without closing the gap** | The range was removed, but nothing could move left. |

## Use the ruler menu

Right-click the ruler to open its menu. When you right-click a marker, the marker is selected first.

| Row | What it does |
| --- | --- |
| **Add marker** | Adds a marker at the frame you right-clicked, unless one is already there. |
| **Edit marker** | Opens the editor of the marker you right-clicked. Dimmed when you didn't right-click a marker. |
| **Delete marker** | Deletes the marker you right-clicked. Dimmed when you didn't right-click a marker. |
| **Clear in/out** | Clears the in and out points (<kbd>Alt</kbd>+<kbd>X</kbd>). Dimmed when none is set. |
| **Set in/out to selection** | Sets the range to the selected clips, tracks, gap or cut. Dimmed when nothing is selected. |

Press <kbd>Escape</kbd> or click outside the menu to close it.

## What is saved and what you can undo

| | Saved | Undo |
| --- | --- | --- |
| Markers: adding, moving, naming, coloring and deleting them | With the project, in `project.json` | Yes, one step each |
| In and out points | With where you left off, in `session.json`: they come back when you reopen the project | No |
| **Lift** and **Extract** | With the project | Yes, one step each |
| The selected marker | No | No |

While the timeline has markers, the project's frame rate is locked. See [Change project settings](projects-and-saving.md#change-project-settings).

## Related pages
- [Timeline](timeline.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Preview and playback](preview-and-playback.md)
- [Tracks](tracks.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Projects and saving](projects-and-saving.md)
- [Transcription](transcription.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 33, 2026-10-17</sub>
