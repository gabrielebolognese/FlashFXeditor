# Timeline

The timeline is where your short takes shape: clips sit on tracks in time order, and the playhead marks the frame the preview shows. In this version you add clips by double-clicking media, select clips and arrange them by dragging (also onto other tracks), snap them to the edges of other clips and to the playhead, duplicate them, add tracks, zoom and scroll, and move the playhead with the mouse, the keyboard or a typed timecode. Trimming and splitting clips are available in a later version.

> **Video placeholder: Timeline tour**
> - File: `videos/timeline/timeline-overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a project with a few clips on V1 and A1; point in turn at the toolbar, the timecode and duration at its right end, the ruler, the track headers (V1, A1) and the **M** and **S** toggles on A1, the divider between video and audio tracks, a blue video clip, a green audio clip, and the thin line where the content ends; click the ruler to move the red playhead; press <kbd>\\</kbd> to fit everything; press <kbd>=</kbd> three times to zoom in, then <kbd>-</kbd> to zoom out; click a video clip: it and its sound on A1 turn gold; drag it to the right until its start comes near the end of another clip: it jumps onto the edge and a thin gold line runs through the timeline; release.

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
- [Move clips](#move-clips)
- [Snap clips into place](#snap-clips-into-place)
- [Insert clips and push the rest to the right](#insert-clips-and-push-the-rest-to-the-right)
- [Move clips to another track](#move-clips-to-another-track)
- [Duplicate clips](#duplicate-clips)
- [Cancel a drag](#cancel-a-drag)
- [Nudge clips with the keyboard](#nudge-clips-with-the-keyboard)

## Find your way around the timeline

| Part | Where | What it does |
|---|---|---|
| **Toolbar** | Top of the panel | The **Snap** toggle, zoom controls, and at the right end the playhead timecode and the total duration. |
| **Ruler** | Above the tracks | Shows time. Click or drag in it to move the playhead. |
| **Track headers** | Left column | Each track's icon and name (V1, V2 for video; A1, A2 for audio), the **M** (mute) and **S** (solo) toggles of audio tracks, plus the **+ Video track** and **+ Audio track** rows. |
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

In this version the toolbar's **Snap** toggle (see [Turn snapping on or off](#turn-snapping-on-or-off)), the zoom group, the timecode field and the duration work. The other buttons (tools such as **Select** and **Razor**, toggles such as **Linked selection**, edit actions such as **Split at playhead**, and add actions such as **Title**) are shown but disabled; they are available in a later version.

> **Note:** When the timeline panel is too narrow for the whole toolbar, the zoom group is the first to move into the **More tools** (…) menu, followed by the toggles with **Snap**. Click **More tools** to reach them.

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

### Mute and solo audio tracks

Each audio track header has an **M** toggle that silences the track and an **S** toggle that plays only the soloed tracks. Each click is one step in the history, and you hear the change at once, also during playback. See [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks).

Other track controls (lock, hide, mute for video tracks), renaming tracks and track heights are available in a later version.

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
- To scrub past the part of the timeline you can see, hold the pointer near the left or right edge of the tracks, or past it: the timeline scrolls. The further out you go, the faster it scrolls.
- If the editor is playing, dragging in the ruler pauses it.
- Hold <kbd>Shift</kbd> while you click or drag in the ruler to snap the playhead to the nearest clip start or end. See [Snap the playhead in the ruler](#snap-the-playhead-in-the-ruler).
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

> **Video placeholder: Select clips**
> - File: `videos/timeline/select-clips.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with three videos with sound on V1 and A1 and a music clip on A2; click the first video clip: it and its sound turn gold; <kbd>Shift</kbd>+click the second video clip: both pairs are selected; <kbd>Ctrl</kbd>+click the sound of the second clip: only that sound is removed; <kbd>Alt</kbd>+click the third video clip: only that clip is selected; click an empty part of a track: nothing is selected; drag on empty track space from left of the first clip across parts of the first two clips and the music: the clips turn gold as the rectangle touches them; release; press <kbd>Ctrl</kbd>+<kbd>A</kbd>, then <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>.

| To | Do this |
|---|---|
| Select a clip (with its linked clips) | Click it |
| Add a clip (with its linked clips) to the selection, or remove it | <kbd>Shift</kbd>+click it |
| Add or remove only that clip, without its linked clips | <kbd>Ctrl</kbd>+click it |
| Select only that clip, without its linked clips | <kbd>Alt</kbd>+click it |
| Select every clip a rectangle touches | Drag on an empty part of the tracks |
| Add the clips a rectangle touches to the selection | <kbd>Shift</kbd>+drag on an empty part of the tracks |
| Select all clips | <kbd>Ctrl</kbd>+<kbd>A</kbd> |
| Clear the selection | Click an empty part of a track, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> |

A selected clip has a gold outline and a gold tint. The clip you clicked last has a slightly thicker outline.

- **Linked clips.** When you add a video with sound, its video clip and its sound clip are linked: a click selects both, and they move together. To work on one of them alone, <kbd>Alt</kbd>+click it. Linked selection is always on in this version; the **Linked selection** toggle in the toolbar is available in a later version.
- **Clicking a selected clip.** When you press on a clip that is already selected, the editor waits to see what you do: if you drag, the whole selection moves; if you release without dragging, the click applies (a plain click then keeps only that clip and its linked clips).
- <kbd>Ctrl</kbd>+<kbd>A</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> work while the Timeline or the Preview panel is active. The other selection shortcuts are mouse actions in the timeline.
- Selecting is not a step in the history, but undo brings back the selection you had before the change you undo. See [Undo and redo](projects-and-saving.md#undo-and-redo-changes).
- While clips are selected, the **Edit Properties** panel shows a placeholder: clip properties are available in a later version.

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
2. Press on one of the selected clips and drag. The move starts once the pointer has moved 4 pixels, so a click never moves a clip by accident.
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

### After the drop

- The moved clips stay selected, and the clip you dragged is the one with the thicker outline.
- The **Undo** tooltip names the move, for example **Undo Move clip** or **Undo Move clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole move at once: clips that were shortened, split or removed come back, any track the move created disappears, and the selection is restored.
- Dropping moved clips back where they started changes nothing and adds no step to the history.

> **Tip:** Hold the pointer near the edge of the tracks, or past it, to scroll the timeline while you drag, left and right or up and down. The further out you go, the faster it scrolls, so you can carry clips to a part of the timeline you can't see.

Clips snap to the edges of other clips and to the playhead while you drag. See [Snap clips into place](#snap-clips-into-place).

## Snap clips into place

While you drag clips, they snap: when the start or the end of the moved clips comes within 8 pixels of the edge of another clip, the playhead or the start of the timeline, the clips jump onto it. This lines clips up end to end, with no gap and no overlap, at any zoom. Snapping is on in a new project.

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
| The start of the timeline (`00:00:00`) | **Timeline start** |

Markers and in and out points become snap targets as well when they are available in a later version.

How snapping decides:

- **Distance on screen.** The reach is 8 pixels at every zoom. Zoomed out, 8 pixels span more frames, so clips snap from further away in time; zoomed in, they snap only close to the edge.
- **Both ends.** The start of the moved clips (of the earliest one) and their end (of the latest one) can both snap. Whichever is closer to a target lands on it.
- **Closest target first.** When several targets are within reach, the closest one wins. When two are equally close, the playhead wins over a clip edge, and a clip edge over the start of the timeline.
- **The moved clips are not targets,** and neither are the linked clips that move with them. When you duplicate with <kbd>Alt</kbd>, the originals stay in place and are targets, so a copy snaps to the end of its original.
- **It holds.** Small pointer movements keep the clips on the edge. They let go once the edge is more than 8 pixels away.
- Snapping changes the time only. Moving clips to another track works as without snapping, and clips still can't move before `00:00:00`.
- Nudging with the keyboard never snaps: the clips move by exactly 1 or 5 frames.

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

The playhead moves freely when you click or drag in the ruler. Hold <kbd>Shift</kbd> to snap it to the start or end of a clip, or to the start of the timeline.

1. Click or drag in the ruler, or drag the playhead's head, near a clip edge.
2. Hold <kbd>Shift</kbd>. Within 8 pixels of an edge, the playhead jumps onto it. A gold line shows in the ruler, and the name of the edge, such as **Start of Beach**, appears next to the pointer.
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

Press <kbd>Esc</kbd> before you release the mouse button. The ghosts disappear, and releasing then changes nothing: no clip moves and no step is added to the history. <kbd>Esc</kbd> also cancels a selection rectangle.

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
- If a clip is in the way, nothing moves, and the message **No room on that track** names the track that already has a clip there.

> **Note:** <kbd>Alt</kbd>+<kbd>Left</kbd> is also the browser's Back key. The editor keeps it while the Timeline panel is active, also when no clip is selected. In the other panels, the browser gets it. See [Keys the browser keeps](keyboard-shortcuts.md#keys-the-browser-keeps).

Trimming, splitting and deleting clips are available in a later version.

## Related pages
- [Audio](audio.md)
- [Getting started](getting-started.md)
- [Workspace](workspace.md)
- [Importing media](importing-media.md)
- [Preview and playback](preview-and-playback.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 12, 2026-10-15</sub>
