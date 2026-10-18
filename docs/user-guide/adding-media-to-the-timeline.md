# Adding media to the timeline

This page shows every way to put your imported media on the timeline: double-click a card, press a key to insert or overwrite at the playhead, drag cards onto a track or onto the preview, or drop files straight from File Explorer. You also learn to skim a clip in the Media panel and mark only the part you want, so you can assemble a cut from your footage in a few keystrokes.

> **Video placeholder: Assemble a cut from your footage**
> - File: `videos/adding-media-to-the-timeline/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: a project with four phone clips and a logo PNG in the Media panel and an empty timeline; move the pointer slowly across the first card's picture: a red line and the time follow, and the picture changes; at `00:02:00` press <kbd>I</kbd>, at `00:05:00` press <kbd>O</kbd>: a gold bar marks the part under the picture; double-click the card: a 3-second clip lands on V1 with its sound on A1, and the playhead jumps to its end; skim the second card, mark it the same way and press <kbd>,</kbd>: it lands right after the first clip; drag the third card onto the V2 row near the end of the second clip: its ghost snaps to the end with a gold line; release; drag the logo card onto the top right of the preview picture: the logo appears there on a new track; drag two files from File Explorer onto the end of V1: they import and land back to back; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: both clips and both imported items are gone.

## In this page
- [Choose a way to add media](#choose-a-way-to-add-media)
- [Know what each media item becomes](#know-what-each-media-item-becomes)
- [Skim media in the Media panel](#skim-media-in-the-media-panel)
- [Use only part of a media item](#use-only-part-of-a-media-item)
- [Insert at the playhead](#insert-at-the-playhead)
- [Overwrite at the playhead](#overwrite-at-the-playhead)
- [Build a sequence quickly](#build-a-sequence-quickly)
- [Drag media onto the timeline](#drag-media-onto-the-timeline)
- [Drop media on the preview](#drop-media-on-the-preview)
- [Drop files from File Explorer onto the timeline](#drop-files-from-file-explorer-onto-the-timeline)
- [Cancel a media drag](#cancel-a-media-drag)
- [Undo what you added](#undo-what-you-added)

## Choose a way to add media

| To | Do this | Where the clips land | What happens to clips already there |
|---|---|---|---|
| Insert at the playhead | Double-click a card, or select cards and press <kbd>,</kbd>, or right-click and choose **Insert at playhead** | At the playhead, on the targeted tracks | Clips from the playhead on move right to make room |
| Overwrite at the playhead | Select cards and press <kbd>.</kbd>, or right-click and choose **Overwrite at playhead** | At the playhead, on the targeted tracks | The new clips cover them |
| Place clips exactly | Drag cards onto a track | Where you release, on the track under the pointer | The new clips cover them; hold <kbd>Ctrl</kbd> to insert instead |
| Place a picture on the frame | Drag cards onto the preview, or right-click and choose **Add to canvas** | At the playhead, on the top video track or a new one | Nothing is covered or moved |
| Import and place in one go | Drag files from File Explorer onto a track | Where you release, on the track under the pointer | The new clips cover them; hold <kbd>Ctrl</kbd> to insert instead |
| Pick images and place them in one go | Click **Add image** in the timeline toolbar and pick the files. See [Add an image](shapes-and-images.md#add-an-image). | At the playhead, centered in the frame, on the top video track or a new one | Nothing is covered or moved |

Every way adds the clips in one step, which one <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, and selects the new clips. A locked track never takes new clips. See [Lock a track](tracks.md#lock-a-track).

## Know what each media item becomes

| Media | Clips you get |
|---|---|
| Video with sound | A video clip on a video track and an audio clip with its sound on an audio track, with the same start and length. The two clips are linked. See [Linking and grouping clips](links-and-groups.md). |
| Video without sound | A video clip on a video track. |
| Audio | An audio clip on an audio track. |
| Image (including GIF and WebP) | A 5-second image clip on a video track (the **Still image** length in **Settings** > **General**; see [Set the length of new clips](settings.md#set-the-length-of-new-clips)). An animated GIF or WebP plays its animation in a loop for as long as the clip lasts; see [Use animated GIF and WebP images](shapes-and-images.md#use-animated-gif-and-webp-images). |

- A video or audio clip uses the whole media, or only the part you marked. See [Use only part of a media item](#use-only-part-of-a-media-item). Lengths are whole frames at the project frame rate.
- The picture is scaled to fit inside the frame and centered. A drop on the preview centers it where you release instead. See [See how clips fit the frame](preview-and-playback.md#see-how-clips-fit-the-frame).
- When you add several items at once, their clips go back to back, in the order you selected the items.
- If an item has no usable duration, the message **Can't insert** *name* (or **Can't insert these media**) with **It has no duration.** appears and nothing is added.

## Skim media in the Media panel

Point at the picture of a card and move the pointer slowly from left to right: the card plays through its thumbnails, so you can find a moment without adding the clip first.

> **Video placeholder: Skim a clip and mark a part of it**
> - File: `videos/adding-media-to-the-timeline/skim-and-mark.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a Media panel in grid view with a 10-second phone clip; point at the left edge of its picture and move right: a thin red line follows the pointer, the badge shows `00:02:00` instead of the duration, and the picture changes; point at the top-left corner chip, which reads **Unused**; press <kbd>I</kbd> at `00:02:00`: a gold bar runs from there to the right edge along the bottom of the picture; press <kbd>O</kbd> at `00:05:00`: the bar now stops there; move the pointer off the card: the first frame and the duration come back, the gold bar stays; point at the card again and press <kbd>Alt</kbd>+<kbd>X</kbd>: the bar disappears; switch to **List view** and move across the small picture of the row: it skims too.

While you point at a video's picture:

- A thin red line marks the position, from the start of the media at the left edge to its end at the right edge.
- The duration badge shows the time at the line, for example `00:02:00`. It follows the timecode format you chose (frames or milliseconds); see [Show times in milliseconds](timeline.md#show-times-in-milliseconds).
- The picture shows the thumbnail nearest that time. Thumbnails are made after the import, one every half second of video. While they load, the nearest of the thumbnails made every 2 seconds shows instead.
- When the pointer leaves the picture, the card shows its first frame and its duration again.

An audio card shows the line and the time, but its picture stays the audio icon. Images have nothing to skim. In list view, the small picture at the start of each row skims the same way, without the time.

Skimming pauses while you press a mouse button, so a drag never skims.

### Read the card while you point at it

| You see | It means |
|---|---|
| **Unused** in the top-left corner | No clip on the timeline uses this item. |
| **Used 2×** in the top-left corner | Two clips use it. A video with its sound counts as two clips, like the **Used** column in list view. |
| A dimmed picture | The item is unused. The picture is at full brightness while you skim it. |
| A gold bar along the bottom of the picture | The part you marked. See [Use only part of a media item](#use-only-part-of-a-media-item). |

## Use only part of a media item

Mark the part of a video or audio item you want before you add it, so you don't have to trim the clip afterwards. The marked part is the item's source range.

1. Point at the card's picture and move to where the part should start.
2. Press <kbd>I</kbd>. A gold bar runs from there to the end of the media, along the bottom of the picture.
3. Move to where the part should end and press <kbd>O</kbd>. The bar now ends there.
4. Add the item in any way on this page except dropping files from File Explorer. The clip takes only the marked part.

Example: <kbd>I</kbd> at `00:02:00` and <kbd>O</kbd> at `00:05:00` give a 3-second clip that starts with the frame at 2 seconds.

| To | Do this, while you point at the card |
|---|---|
| Set the start of the part | <kbd>I</kbd> |
| Set the end of the part | <kbd>O</kbd> |
| Clear the part (use the whole media again) | <kbd>Alt</kbd>+<kbd>X</kbd> |
| Insert the item at the playhead | <kbd>,</kbd> |
| Overwrite at the playhead | <kbd>.</kbd> |

- **The end is where you press O.** The part stops at the time under the pointer, so the frame shown there is not in the clip.
- **Only one end needed.** With only an in point, the part runs to the end of the media; with only an out point, it starts at the beginning.
- **The wrong side clears the other point.** An in point after the out point clears the out point, and an out point before the in point clears the in point.
- **Ignored presses.** An in point less than one frame before the end of the media, and an out point at the very start, change nothing.
- **These keys go to the card.** While you point at the picture of a card with a duration, <kbd>I</kbd>, <kbd>O</kbd> and <kbd>Alt</kbd>+<kbd>X</kbd> mark the card, whichever panel is active, and do not change the timeline's in and out points. Move the pointer off the card's picture to mark the timeline. Over an image card, the three keys work on the timeline as usual. See [Set in and out points](markers-and-in-out-points.md#set-in-and-out-points).
- The keys don't work while you type in a text field.
- Each item keeps its own range until you clear it. Ranges are not steps in the history, and they come back when you reopen the project. See [Pick up where you left off](projects-and-saving.md#pick-up-where-you-left-off).

## Insert at the playhead

An insert puts the clip at the playhead and pushes everything after it to the right, so nothing on the timeline is lost.

> **Video placeholder: Insert and overwrite at the playhead**
> - File: `videos/adding-media-to-the-timeline/insert-and-overwrite.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with two clips end to end on V1 and A1; put the playhead in the middle of the first clip; double-click a card in the Media panel: the first clip splits at the playhead, its second half and the second clip move right, the new clip fills the space and is selected, and the playhead jumps to its end; point at the **Undo** tooltip, which reads **Undo Insert clip**; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; click the card and press <kbd>.</kbd>: the new clip covers part of the first clip and the start of the second, nothing moves; right-click the card to show **Insert at playhead**, **Overwrite at playhead** and **Add to canvas**.

1. Move the playhead to where the clip should start. See [Move the playhead](timeline.md#move-the-playhead).
2. Do one of the following:
   - Double-click the card's picture in grid view, or the row in list view. Double-clicking the name renames the item instead.
   - Click the card (or select several), then press <kbd>,</kbd>. The Media panel must be active.
   - Point at a card's picture and press <kbd>,</kbd>. This works whichever panel is active and adds the card you point at.
   - Right-click the card and choose **Insert at playhead**.

What the insert does:

- **Tracks.** The clips go to the targeted video track and the targeted audio track nearest the divider (V1 and A1 in a new project). When no unlocked track of that kind is targeted, the unlocked track nearest the divider is used; when there is none, a track is created. See [Choose the tracks your edits use](tracks.md#choose-the-tracks-your-edits-use-target).
- **Room.** On every unlocked track, everything from the playhead on moves right by the length of the new clips. A clip that runs across the playhead is split there, and its second part moves too. Every track stays in step, so sound stays in sync with its picture. Locked tracks don't move.
- **Playhead.** The playhead moves to the end of the new clips, ready for the next one.
- **Several items.** With several cards selected, <kbd>,</kbd> and **Insert at playhead** add all of them back to back. A double-click adds only the item you double-click.
- **History.** The step is named **Insert clip** or **Insert clips**.

## Overwrite at the playhead

An overwrite puts the clip at the playhead and covers whatever is there. Nothing moves.

1. Move the playhead to where the clip should start.
2. Click the card (or select several) and press <kbd>.</kbd> while the Media panel is active, or point at a card's picture and press <kbd>.</kbd>, or right-click the card and choose **Overwrite at playhead**.

- The clips go to the same tracks as an insert.
- A clip underneath is shortened, split or removed, exactly where the new clips cover it. See [What happens to the clips underneath](timeline.md#what-happens-to-the-clips-underneath). Other tracks don't change.
- The playhead moves to the end of the new clips.
- The step is named **Overwrite clip** or **Overwrite clips**.

## Build a sequence quickly

Because every insert moves the playhead to the end of what it added, you can build a whole sequence without touching the timeline.

1. Press <kbd>Home</kbd> to put the playhead at the start, or <kbd>End</kbd> to put it after the last clip.
2. Point at the first card and skim to the moment you want. Press <kbd>I</kbd>, skim on and press <kbd>O</kbd>.
3. Press <kbd>,</kbd>. The clip lands at the playhead, and the playhead jumps to its end.
4. Repeat steps 2 and 3 with the next cards. Each clip lands right after the previous one.

> **Tip:** Press <kbd>.</kbd> instead of <kbd>,</kbd> when you want the new clip to replace what is already on the timeline at the playhead.

## Drag media onto the timeline

Drag cards onto a track to decide exactly where the clips go. The drag works like moving clips on the timeline: ghosts show where the clips land, and nothing changes until you release.

> **Video placeholder: Drag media onto the timeline**
> - File: `videos/adding-media-to-the-timeline/drag-to-timeline.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: a timeline with a clip on V1 and A1 only; press on a card of a video with sound and drag it out of the Media panel: a small label with its name follows the pointer; move over the V2 row near the end of the clip on V1: a ghost of the video appears on V2, a new row named A2 appears with the ghost of its sound, the start snaps to the end of the clip with a gold line, and the tooltip reads `00:03:00 · 00:08:00`; release: the clips land on V2 and A2, linked and selected; drag another card over the middle of the clip on V1 and hold <kbd>Ctrl</kbd>: a gold line with an arrow appears; release: the clip on V1 splits and its second half moves right; drag a third card over the timeline and press <kbd>Esc</kbd>: the ghosts disappear and nothing is added.

1. Press on a card (or a row in list view) and drag. The drag starts once the pointer has moved 4 pixels. If the card is selected, all selected cards come along; otherwise only that card.
2. Move over the timeline. Ghosts show the new clips at their real length, starting at the pointer.
3. Release where you want the clips.

Where the clips land:

- **The track under the pointer.** The picture goes on the video track with the number under the pointer, and the sound on the audio track with the same number. Over V2, a video with sound lands on V2 with its sound on A2; over A2, its picture goes on V2. Audio items always go on an audio track, and images and videos without sound always on a video track.
- **New tracks.** When a track the clips need doesn't exist yet, an extra row with its name, such as **A2** or **V3**, shows while you drag, and the drop creates it. Drag above the top video track or below the bottom audio track to put the clips on a new track.
- **Snapping.** The start or the end of the new clips snaps to clip edges, the playhead, markers, the in and out points and the start of the timeline, like moved clips. A gold line shows the edge, and the tooltip names it. Hold <kbd>S</kbd> to switch snapping for the drag. See [Snap clips into place](timeline.md#snap-clips-into-place).
- **Several items** land back to back, in the order you selected them.

What you see while you drag:

| You see | It means |
|---|---|
| A small label with the item's name, or **3 items**, next to the pointer | You are outside the timeline and the preview. Releasing here adds nothing. |
| Ghosts on the tracks | Where the clips land. |
| The tooltip `00:03:00 · 00:08:00` | Where the clips start and how long they are together (`mm:ss:ff`), followed by the name of the edge they snap to. |
| Diagonal hatching over part of a ghost | The part of a clip already there that the new clip will cover. |
| A gold vertical line with an arrow | An insert (<kbd>Ctrl</kbd>): the clips at and after the line move right. |
| A red ghost and a "not allowed" cursor | The drop would land on a locked track and is refused. |

Hold keys while you drag:

| Hold | What the drop does |
|---|---|
| Nothing | Adds the clips. They cover whatever they land on. See [What happens to the clips underneath](timeline.md#what-happens-to-the-clips-underneath). |
| <kbd>Ctrl</kbd> | Inserts the clips: on every unlocked track, everything after the drop point moves right, and clips across it are split. See [Insert clips and push the rest to the right](timeline.md#insert-clips-and-push-the-rest-to-the-right). |
| <kbd>S</kbd> | Switches snapping for this drag. |

- The keys you hold when you release decide. You can press and release them during the drag.
- Hold the pointer near the edge of the tracks, or past it, to scroll the timeline while you drag.
- The playhead does not move. The new clips are selected.
- A drop on a locked track adds nothing and shows **Can't drop clips onto a locked track**, with the track's name. Unlock the track or drop on another one.
- The step is named **Add clip** or **Add clips** (**Insert clip** or **Insert clips** with <kbd>Ctrl</kbd>).

> **Tip:** Cards of the **Presets** tab drag the same way: a text preset dropped on a track becomes a 3-second text clip in that look, and one dropped on the preview becomes a text at that point. See [Drag a preset onto the timeline or the preview](text-presets.md#drag-a-preset-onto-the-timeline-or-the-preview).

## Drop media on the preview

Drag a card onto the preview to put its picture exactly where you want it in the frame, for example a logo in a corner. The clip lands at the playhead and never covers or moves other clips.

> **Video placeholder: Drop a logo on the preview**
> - File: `videos/adding-media-to-the-timeline/drop-on-preview.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: a timeline with a video on V1 and A1 and the playhead in the middle of it; drag a PNG logo card out of the Media panel over the preview: the cursor shows a plus sign; release near the top right of the frame: the logo appears centered there, on a new track V2 at the playhead; drag the logo card onto the preview again at the bottom left: V2 is taken there, so a new track V3 is created; right-click the card and choose **Add to canvas**: another copy appears in the middle of the frame.

1. Move the playhead to where the clip should start.
2. Drag a card from the Media panel over the preview picture. The cursor shows a plus sign.
3. Release where the center of the picture should be.

- **Track.** The picture goes on the top video track when that track is unlocked and empty for the whole length of the new clip. Otherwise a new video track is created above it. A video's sound goes on the first audio track (counting from A1) that is unlocked and empty there, or on a new audio track.
- **Position.** The picture is scaled to fit inside the frame, as any new clip, and its center sits where you released, at any zoom level and pan of the preview. You can release beside the frame too; the picture then sits partly outside it. Zoom the preview in to place it precisely; see [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).
- **Several items** go back to back from the playhead, each centered on the same point.
- The playhead does not move. The new clips are selected. The step is named **Add to canvas** or **Add clips to canvas**.
- To change the place or size afterwards, drag the picture or its handles in the preview. See [Arranging layers in the preview](arranging-layers-in-the-preview.md).

To put the selected items at the playhead in the middle of the frame, right-click a card and choose **Add to canvas**. It follows the same track rules.

## Drop files from File Explorer onto the timeline

Drop files or folders from File Explorer straight onto a track: the editor imports them and places them in one go.

> **Video placeholder: Drop files onto the timeline**
> - File: `videos/adding-media-to-the-timeline/drop-files.mp4` (not recorded yet)
> - Length: about 35 seconds
> - Shows: a timeline with a clip on V1 and A1; in File Explorer, select two phone videos and a PNG and drag them over the V1 row after the clip: a gold line with an arrow marks where they will start; release: the three items appear in the Media panel, and their clips lie back to back on V1, with the sound of the videos on A1; point at the **Undo** tooltip, which reads **Undo Drop files**; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the clips and the three items are gone.

1. In File Explorer, select files, folders, or both.
2. Drag them over a track of the timeline. A gold line with an arrow marks where the clips will start. The editor doesn't know their length before the import, so no ghosts show.
3. Release. The files are imported as with **Import media**, then their clips are placed back to back from that point, on the track under the pointer (as in [Drag media onto the timeline](#drag-media-onto-the-timeline)).

- The clips cover what they land on. Hold <kbd>Ctrl</kbd> as you release to insert them instead.
- The import and the clips are one step in the history, named **Drop files**. One <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes the clips and the imported items together. As with any import, the copied files stay in the project's `media` folder.
- Folders are imported with everything inside them. Files of an unsupported type are skipped with a message, and the others are still placed. See [Supported file types](importing-media.md#supported-file-types).
- On a locked track, the files are imported but no clips are added, and the message **Can't drop clips onto a locked track** appears.
- Large drops show their progress at the top of the window, as any import. See [Progress of large imports](importing-media.md#progress-of-large-imports).

To import files without placing them, drop them on the Media panel instead. See [Drop files and folders](importing-media.md#drop-files-and-folders).

## Cancel a media drag

Press <kbd>Esc</kbd> before you release the mouse button. The ghosts and the label disappear, and nothing is added. Releasing the drag anywhere other than the timeline or the preview, for example back over the Media panel, also adds nothing.

## Undo what you added

Every way of adding media is one step in the history. Point at **Undo** in the app bar to see its name:

| You | History step |
|---|---|
| Double-click, press <kbd>,</kbd> or choose **Insert at playhead** | **Insert clip** / **Insert clips** |
| Press <kbd>.</kbd> or choose **Overwrite at playhead** | **Overwrite clip** / **Overwrite clips** |
| Drag onto the timeline | **Add clip** / **Add clips** (**Insert clip** / **Insert clips** with <kbd>Ctrl</kbd>) |
| Drop on the preview or choose **Add to canvas** | **Add to canvas** / **Add clips to canvas** |
| Drop files from File Explorer onto the timeline | **Drop files** |

<kbd>Ctrl</kbd>+<kbd>Z</kbd> removes the clips together with any track the step created, brings back clips that were covered, split or moved, and restores the selection you had. The playhead stays where it is. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## Related pages
- [Importing media](importing-media.md)
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Preview and playback](preview-and-playback.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Trimming clips](trimming.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 42, 2026-10-18</sub>
