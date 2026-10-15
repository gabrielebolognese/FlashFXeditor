# Splitting, deleting and closing gaps

These are the everyday cleanup edits. You can split clips at the playhead or anywhere with the **Razor** tool, remove clips with or without leaving a gap, and close the gaps in your edit one at a time or all at once. Each edit is one undo step. When an edit moves clips, the other tracks move with them, so sound and titles stay in step with the picture.

> **Video placeholder: Split, delete and close gaps**
> - File: `videos/splitting-and-deleting/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: a timeline with three videos with sound end to end on V1 and A1; click in the ruler in the middle of the first clip and press <kbd>Ctrl</kbd>+<kbd>K</kbd>: the video and its sound split at the playhead; press <kbd>C</kbd> and point at the second clip: a thin white line follows the pointer; click: the clip and its sound split there; press <kbd>V</kbd>; click the right part of the first clip and press <kbd>Delete</kbd>: a gap opens; point at the gap (it lights up), click it (gold tint, dashed gold outline) and press <kbd>G</kbd>: the gap closes and the later clips move left; click another clip and press <kbd>Shift</kbd>+<kbd>Delete</kbd>: it disappears and the rest moves up; delete two more clips with <kbd>Delete</kbd>, then press <kbd>Shift</kbd>+<kbd>G</kbd>: every gap closes at once; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: all the gaps come back.

## In this page
- [Split clips at the playhead](#split-clips-at-the-playhead)
- [Cut clips with the Razor tool](#cut-clips-with-the-razor-tool)
- [Delete clips](#delete-clips)
- [Ripple delete clips](#ripple-delete-clips)
- [Select a gap](#select-a-gap)
- [Close a gap](#close-a-gap)
- [Close all gaps (compact)](#close-all-gaps-compact)
- [How other tracks follow a ripple](#how-other-tracks-follow-a-ripple)
- [Use the clip and gap menus](#use-the-clip-and-gap-menus)

## Split clips at the playhead

1. Move the playhead to the frame where the cut should be. See [Move the playhead](timeline.md#move-the-playhead).
2. Optional: select the clips you want to split. With nothing selected, every clip under the playhead on the targeted tracks splits.
3. Press <kbd>Ctrl</kbd>+<kbd>K</kbd>, or click **Split at playhead** in the timeline toolbar.

| You press | What splits |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> with nothing selected | Every clip under the playhead on the targeted tracks, together with their linked clips. |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> with clips selected | Only the selected clips under the playhead, together with their linked clips (for example a video's sound). Selected clips that the playhead does not cross stay whole. |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | Every clip under the playhead, on every track, whatever is selected and whichever tracks are targeted. |

Clips on locked tracks never split. While **Linked selection** is off, linked clips split only if they are selected or on a targeted track themselves. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).

What you get:

- The frame shown in the preview becomes the first frame of the right part. The left part ends on the frame before it.
- Both parts keep everything the clip had: its media, name, label color, speed and place in the frame. Played one after the other, they show and sound exactly like the clip did.
- A video and its sound split together, and their right parts are linked to each other, like the left parts.
- Selected clips stay selected: both parts of each one. The right part of the clip you clicked last gets the thicker outline. With nothing selected, nothing is selected afterwards.
- The history step is named **Split clip** or **Split clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts each clip back together in one step.
- Nothing splits when no clip is under the playhead, or when the playhead is exactly on a clip's start or end.
- <kbd>Ctrl</kbd>+<kbd>K</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> work in every panel, except while you type in a text field.

> **Tip:** Every track is targeted at first, so with nothing selected, <kbd>Ctrl</kbd>+<kbd>K</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> do the same. To keep a track out of <kbd>Ctrl</kbd>+<kbd>K</kbd>, for example a music track under several shots, click the crosshair in its header. See [Choose the tracks your edits use](tracks.md#choose-the-tracks-your-edits-use-target).

## Cut clips with the Razor tool

The **Razor** cuts a clip wherever you click, without moving the playhead first.

> **Video placeholder: Cut with the Razor**
> - File: `videos/splitting-and-deleting/razor.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with a video with sound on V1 and A1, a title-length clip named "Logo" on V2 and the playhead in the middle of the video; press <kbd>C</kbd>: the **Razor** button turns gold and the cursor over the tracks becomes a razor; point at the video: a thin white line runs over the video and its sound; move toward the playhead: the line jumps onto it, a gold line runs through the ruler and the tooltip reads **Playhead**; click: the video and its sound split; point near the end of "Logo" and hold <kbd>Shift</kbd>: the line now runs over every clip under it on all tracks, and snaps to **End of Logo**; <kbd>Shift</kbd>+click: every track is cut there; press <kbd>V</kbd> to go back to **Select**.

1. Press <kbd>C</kbd>, or click **Razor** in the timeline toolbar. The button turns gold, and over the tracks the cursor becomes a razor: a vertical line with a small blade beside it.
2. Point at a clip. A thin white line shows where the cut will be, over the clip and its linked clips.
3. Click. The clip and its linked clips split at the line.

To cut all tracks at once, hold <kbd>Shift</kbd>: the line runs over every clip under it, on every track. <kbd>Shift</kbd>+click anywhere in the tracks, also on empty space, to cut every clip at that frame. Clips on locked tracks are never cut, and while **Linked selection** is off, a plain click cuts only the clip you click.

- The Razor cuts at the frame boundary nearest the pointer. Zoom in for frame-exact cuts.
- While snapping is on, the line snaps to clip starts and ends, the playhead and the start of the timeline when it comes within 8 pixels, as a dragged clip does. A gold line marks the target and the tooltip names it, for example **Playhead** or **End of Logo**. Snap to the playhead to cut exactly at the frame in the preview. See [Snap clips into place](timeline.md#snap-clips-into-place).
- A cut on the very start or end of a clip changes nothing.
- Each click is one step in the history, named **Split clip** or **Split clips**.
- The Razor stays active until you choose another tool. Press <kbd>V</kbd> to go back to **Select**. Each project remembers its tool.
- While the Razor is active, a click on a clip cuts it instead of selecting it, and dragging on the tracks draws no selection rectangle. Clicking and dragging in the ruler moves the playhead as usual, and right-clicking a clip still opens its menu.

## Delete clips

1. Select the clips. See [Select clips](timeline.md#select-clips).
2. Press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, click **Delete** (the trash can) in the timeline toolbar, or right-click one of the clips and choose **Delete**.

- The clips are removed and their places stay empty: gaps open. To close them at the same time, use [Ripple delete](#ripple-delete-clips) instead.
- Linked clips go too: deleting a video also deletes its sound, also when you selected only one of them with <kbd>Alt</kbd>+click. To delete one of them alone, turn off **Linked selection** (<kbd>Shift</kbd>+<kbd>S</kbd>) first, or unlink them. See [Linking and grouping clips](links-and-groups.md).
- Grouped clips go together: deleting one clip of a group deletes the whole group. See [Group clips](links-and-groups.md#group-clips).
- Clips on locked tracks are never deleted.
- The history step is named **Delete clip** or **Delete clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings the clips back, selected as they were.
- The keys work while the Timeline or the Preview panel is active. In the Media panel, <kbd>Delete</kbd> removes the selected media instead; see [Remove media](importing-media.md#remove-media).
- While a gap is selected, <kbd>Delete</kbd> closes the gap. See [Close a gap](#close-a-gap).

## Ripple delete clips

A ripple delete removes the clips and closes the space they leave, so the rest of your edit moves up.

1. Select the clips.
2. Press <kbd>Shift</kbd>+<kbd>Delete</kbd> (or <kbd>Shift</kbd>+<kbd>Backspace</kbd>), click **Ripple delete** in the timeline toolbar, or right-click one of the clips and choose **Ripple delete**.

- On each track, the clips after the deleted ones move left by the length deleted on that track. When you delete clips of different lengths on two tracks, each track closes its own space by its own amount.
- Deleted clips that touch count as one space. Gaps that were there before stay open.
- The other tracks move along to stay in step, and the ripple stops short where a clip would overlap another one. See [How other tracks follow a ripple](#how-other-tracks-follow-a-ripple).
- Linked clips and grouped clips go too, as with **Delete**.
- The history step is named **Ripple delete clip** or **Ripple delete clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings back the clips and moves everything back in one step.
- The keys work while the Timeline or the Preview panel is active.

## Select a gap

A gap is the empty space on a track before a clip: between two clips, or between the start of the timeline and the first clip. The empty space after the last clip of a track is not a gap.

> **Video placeholder: Select and close gaps**
> - File: `videos/splitting-and-deleting/gaps.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: a timeline with clips on V1 and V2 and a few gaps between them; point at a gap on V1: it lights up; click it: a gold tint with a dashed gold outline; press <kbd>Delete</kbd>: the gap closes, the later clips on V1 move left and the clip on V2 after the gap moves with them; hover **Undo**: it reads **Undo Close gap**; move the playhead into another gap and press <kbd>G</kbd>: that gap closes; right-click a gap on V2 and choose **Close all gaps on track**; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; click **Close all gaps (compact)** in the toolbar: every clip packs to the left; press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: all the gaps are back.

- Point at a gap: it lights up.
- Click it: it is selected, with a gold tint and a dashed gold outline.
- A drag that starts in a gap draws a selection rectangle, as on any empty track space.

Only one thing is selected at a time: a gap, clips, or a cut (edit point). Selecting a gap clears the clip selection, and selecting a clip clears the gap. To clear a selected gap, click an empty part of a track after the last clip, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>. When an edit moves or closes the gap, it is no longer selected.

Selecting a gap is not a step in the history, and a selected gap is not restored when you reopen the project.

## Close a gap

Closing a gap moves the clips after it to the left by the gap's length, so the clip after the gap starts where the clip before it ends.

**Close the gap you selected:** press <kbd>Delete</kbd>, <kbd>Backspace</kbd> or <kbd>G</kbd>, click **Close gap** in the timeline toolbar, or right-click the gap and choose **Close gap**.

**Close the gap at the playhead:** with no gap selected, press <kbd>G</kbd> or click **Close gap**. The editor closes the gap the playhead is in, or the gap right after the clip the playhead is on, on the targeted tracks that are not locked. When several tracks have such a gap, the one that ends first closes.

- Closing the gap before the first clip of a track moves that clip to `00:00:00`.
- Clips on the other tracks that come after the gap move along. See [How other tracks follow a ripple](#how-other-tracks-follow-a-ripple).
- The history step is named **Close gap**.
- <kbd>G</kbd> works only while the Timeline panel is active.

## Close all gaps (compact)

Press <kbd>Shift</kbd>+<kbd>G</kbd>, or click **Close all gaps (compact)** in the timeline toolbar. Every gap on the compacted tracks closes, from the start of the timeline to the last clip of each track, including the space before the first clip. The clips end up packed end to end.

Which tracks are compacted:

| Selection | Compacted tracks |
| --- | --- |
| Tracks are selected (you clicked their headers) | The selected tracks that are not locked. See [Select tracks](tracks.md#select-tracks). |
| No track is selected | The targeted tracks that are not locked: every track, unless you untargeted some. See [Choose the tracks your edits use](tracks.md#choose-the-tracks-your-edits-use-target). |

- It is one step in the history, named **Close all gaps**: one <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings every gap back.
- It is instant, also in a long edit: 500 clips with 300 gaps compact in a few milliseconds.
- To compact one track only, right-click a gap on that track and choose **Close all gaps on track**, or select the track and press <kbd>Shift</kbd>+<kbd>G</kbd>. The history step is named **Close all gaps on track** or **Close all gaps**.
- Each compacted track closes its own gaps. A compacted track without gaps stays as it is: it neither moves nor stops the others.
- The other unlocked tracks follow the ripple, and they can stop it where one of their clips can't move. See [How other tracks follow a ripple](#how-other-tracks-follow-a-ripple).
- <kbd>Shift</kbd>+<kbd>G</kbd> works only while the Timeline panel is active.

## How other tracks follow a ripple

**Ripple delete**, **Close gap** and **Close all gaps** move the clips on the other tracks too, so a sound effect, a title or music that you placed on a cut stays on that cut. These rules decide how far each clip moves:

- **The track with the space.** On a track that closes a gap or the space of deleted clips, the clips after the space move left by its length.
- **The other tracks.** A clip on another track moves left as far as the content next to it moved: by the most that any one track closed before the clip's start. Spaces at different times don't add up.
- **Clips across the space stay.** A clip that starts before the space ends, for example a music clip running under the cut, does not move for that space. A ripple never trims, splits or reorders clips.
- **Clips never overlap.** When a clip on another track can't move that far without running into the clip before it, the spaces before it close only as far as it can follow. The ripple stops short, and a message names the clip and its track, for example **Ripple delete stopped short**: "Music on A2 can't move further left without overlapping."
- **Locked tracks stay.** Clips on a locked track never move, and they never stop a ripple. See [Lock a track](tracks.md#lock-a-track).

For example, you select a 4-second clip on V1 and a 2-second clip on V2 at the same time and press <kbd>Shift</kbd>+<kbd>Delete</kbd>. The clips after the space on V1 move 4 seconds to the left, and those on V2 move 2 seconds. A sound effect on A2 that starts after both spaces moves 4 seconds, as far as V1 moved.

| Message | What happened |
| --- | --- |
| **Ripple delete stopped short** | The clips were deleted, but their space closed only partly. |
| **Deleted without closing the gap** | The clips were deleted, but nothing could move. |
| **Gap closed partly** | **Close gap** closed only part of the gap. |
| **Can't close the gap** | **Close gap** could not move anything. Nothing changed. |
| **Some gaps stayed open** | **Close all gaps** closed some gaps only partly or not at all. |

To close the rest, move or trim the clip the message names so it has room, then close the gap again.

## Use the clip and gap menus

Right-click a clip or a gap to open its menu. Rows that have a keyboard shortcut show it on the right.

> **Video placeholder: The clip and gap menus**
> - File: `videos/splitting-and-deleting/menus.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: right-click a video clip: it and its sound are selected and the menu opens with **Cut**, **Copy** and **Paste** dimmed, then **Split at playhead**, **Delete**, **Ripple delete**, **Unlink**, **Group**, **Ungroup** (dimmed), **Move into sync** (dimmed), **Rename** and the **Label** row of eight colors; point at the teal swatch: its tooltip reads **Teal**; click it: the video and its sound turn teal; right-click the clip again: the teal swatch has a gold ring; press <kbd>Escape</kbd>; right-click a gap: **Close gap** and **Close all gaps on track**; click **Close gap**.

**Right-click a clip.** If the clip is not selected, it is selected first, with its linked clips and its group. If it is already part of the selection, the selection stays, and the menu acts on all the selected clips. Clips on a locked track have no menu.

| Row | What it does |
| --- | --- |
| **Cut**, **Copy**, **Paste** | Dimmed: available in a later version. |
| **Split at playhead** | Splits the selected clips at the playhead, if it crosses them. See [Split clips at the playhead](#split-clips-at-the-playhead). |
| **Delete** | Deletes the selected clips and leaves gaps. See [Delete clips](#delete-clips). |
| **Ripple delete** | Deletes the selected clips and closes the space. See [Ripple delete clips](#ripple-delete-clips). |
| **Link** or **Unlink** | Links the selected clips, or unlinks them when one is linked. See [Link clips](links-and-groups.md#link-clips) and [Unlink clips](links-and-groups.md#unlink-clips). |
| **Group** | Groups the selected clips. Dimmed with fewer than two clips selected. See [Group clips](links-and-groups.md#group-clips). |
| **Ungroup** | Ungroups the selected clips. Dimmed when none is in a group. See [Ungroup clips](links-and-groups.md#ungroup-clips). |
| **Move into sync** | Moves this clip back into sync with its linked clip. Dimmed when it is in sync. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync). |
| **Rename** | Opens a name field over the clip. See [Rename clips](timeline.md#rename-clips). |
| **Label**, with eight color swatches | Gives the selected clips a label color, or removes it. See [Give clips a label color](timeline.md#give-clips-a-label-color). |

**Right-click a gap.** The gap is selected first.

| Row | What it does |
| --- | --- |
| **Close gap** | Closes this gap. See [Close a gap](#close-a-gap). |
| **Close all gaps on track** | Closes every gap on this track. See [Close all gaps (compact)](#close-all-gaps-compact). |

- Click a row to run it. The menu closes, and the keyboard goes back to the timeline.
- Press <kbd>Escape</kbd> or click outside the menu to close it without doing anything.
- A track header has its own menu. See [Use the track menu](tracks.md#use-the-track-menu).
- Right-clicking empty space after the last clip of a track or the ruler opens no menu yet. Choosing menu rows with the arrow keys is available in a later version.

## Related pages
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 16, 2026-10-15</sub>
