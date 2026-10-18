# Splitting, deleting and closing gaps

These are the everyday cleanup edits. You can split clips at the playhead or anywhere with the **Razor** tool, remove clips with or without leaving a gap, and close the gaps in your edit one at a time or all at once. Each edit is one undo step. When an edit moves clips, the other tracks move with them, so sound and titles stay in step with the picture. To remove a stretch of time on several tracks at once, mark it with in and out points and use **Lift** or **Extract**; see [Lift or extract a range](markers-and-in-out-points.md#lift-or-extract-a-range).

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
- A clip animated with keyframes keeps its motion: each part gets its share of the keyframes, and played one after the other they move exactly as the clip did, also when you cut in the middle of an eased move. See [Know what happens to keyframes when you edit clips](keyframes.md#know-what-happens-to-keyframes-when-you-edit-clips).
- Fades stay at the clip's outer ends: the left part keeps the fade in, the right part keeps the fade out. A transition at the clip's start or end stays on its cut, but a split inside a transition's frames removes that transition. See [Know what edits do to fades and transitions](fades-and-transitions.md#know-what-edits-do-to-fades-and-transitions).
- A caption cue on the **CC** track splits its text too: each part keeps the words on its side of the cut. See [Edit cues on the timeline](captions.md#edit-cues-on-the-timeline).
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

1. Select the clips, on the timeline or by clicking their pictures in the preview. See [Select clips](timeline.md#select-clips) and [Select layers in the preview](arranging-layers-in-the-preview.md#select-layers-in-the-preview).
2. Press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, click **Delete** (the trash can) in the timeline toolbar or in the quick actions of **Edit Properties**, or right-click one of the clips (or its picture in the preview) and choose **Delete**.

- The clips are removed and their places stay empty: gaps open. To close them at the same time, use [Ripple delete](#ripple-delete-clips) instead.
- Linked clips go too: deleting a video also deletes its sound, also when you selected only one of them with <kbd>Alt</kbd>+click. To delete one of them alone, turn off **Linked selection** (<kbd>Shift</kbd>+<kbd>S</kbd>) first, or unlink them. See [Linking and grouping clips](links-and-groups.md).
- Grouped clips go together: deleting one clip of a group deletes the whole group. See [Group clips](links-and-groups.md#group-clips).
- Clips on locked tracks are never deleted.
- The history step is named **Delete clip** or **Delete clips**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings the clips back, selected as they were.
- The keys work while the Timeline or the Preview panel is active. In the Media panel, <kbd>Delete</kbd> removes the selected media instead; see [Remove media](importing-media.md#remove-media). On its **Captions** tab, <kbd>Delete</kbd> deletes the selected caption cues; see [Find, select and delete cues](captions.md#find-select-and-delete-cues).
- While a gap is selected, <kbd>Delete</kbd> closes the gap. See [Close a gap](#close-a-gap).
- While a marker is selected, <kbd>Delete</kbd>, <kbd>Shift</kbd>+<kbd>Delete</kbd> and the **Delete** and **Ripple delete** buttons delete the marker instead. See [Delete markers](markers-and-in-out-points.md#delete-markers).
- While keyframes are selected on a clip's keyframe lane, <kbd>Delete</kbd>, <kbd>Shift</kbd>+<kbd>Delete</kbd> and the **Delete** and **Ripple delete** buttons delete only those keyframes, and the clip stays. A click on the clip body deselects the keyframes. See [Select, move and delete keyframes on the timeline](keyframes.md#select-move-and-delete-keyframes-on-the-timeline).
- While a transition is selected (click its block on the timeline), <kbd>Delete</kbd> and <kbd>Shift</kbd>+<kbd>Delete</kbd> delete only the transition, and the clips stay. See [Select or delete a transition](fades-and-transitions.md#select-or-delete-a-transition).
- Deleting a clip also removes the transitions at its start and end.

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

- Point at a gap: it lights up, and with the **Select** tool the pointer becomes a pointing hand.
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

**Ripple delete**, **Close gap**, **Close all gaps**, **Extract** and **Remove silence** move the clips on the other tracks too, so a sound effect, a title or music that you placed on a cut stays on that cut. These rules decide how far each clip moves:

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
| **Some gaps stayed open** | **Close all gaps** closed some gaps only partly or not at all, or **Remove silence** cut the silences out but could not close all of their gaps. See [Removing silence](removing-silence.md#know-what-apply-changes). |

To close the rest, move or trim the clip the message names so it has room, then close the gap again.

## Use the clip and gap menus

Right-click a clip or a gap to open its menu. Rows that have a keyboard shortcut show it on the right.

> **Video placeholder: The clip and gap menus**
> - File: `videos/splitting-and-deleting/menus.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: right-click a video clip: it and its sound are selected and the menu opens with **Cut**, **Copy**, **Paste**, **Paste insert** and **Paste attributes...** (the three paste rows dimmed until you copy clips) and **Duplicate**, then **Split at playhead**, **Delete**, **Ripple delete**, **Disable**, **Unlink**, **Group**, **Ungroup** (dimmed), **Move into sync** (dimmed), **Rename**, the **Label** row of eight colors, **Speed...**, **Freeze frame at playhead**, **Reveal in media panel**, **Mute**, **Normalize**, **Auto-duck music**, **Detach audio**, the **Fade in**, **Fade out** and **Transition** rows with their choices, and **Match project size** with **Fit** and **Fill**; point at the teal swatch: its tooltip reads **Teal**; click it: the video and its sound turn teal; right-click the clip again: the teal swatch has a gold ring; press <kbd>Escape</kbd>; right-click a gap: **Close gap** and **Close all gaps on track**; click **Close gap**.

**Right-click a clip.** If the clip is not selected, it is selected first, with its linked clips and its group. If it is already part of the selection, the selection stays, and the menu acts on all the selected clips. Clips on a locked track have no menu.

| Row | What it does |
| --- | --- |
| **Cut** | Copies the selected clips and deletes them, leaving gaps (<kbd>Ctrl</kbd>+<kbd>X</kbd>). See [Copy and cut clips](copy-and-paste.md#copy-and-cut-clips). |
| **Copy** | Copies the selected clips (<kbd>Ctrl</kbd>+<kbd>C</kbd>). |
| **Paste** | Pastes the copied clips at the playhead on the targeted tracks, covering what is there (<kbd>Ctrl</kbd>+<kbd>V</kbd>). Dimmed until you copy clips. See [Paste clips at the playhead](copy-and-paste.md#paste-clips-at-the-playhead). |
| **Paste insert** | Opens a gap at the playhead on every unlocked track and pastes the copied clips there (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>). Dimmed until you copy clips. See [Paste and make room (Paste insert)](copy-and-paste.md#paste-and-make-room-paste-insert). |
| **Paste attributes...** | Opens a checklist, where you right-clicked, to give the selected clips settings of the copied clip (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>). Dimmed until you copy clips. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes). |
| **Duplicate** | Copies the selected clips right after them (<kbd>Ctrl</kbd>+<kbd>D</kbd>). See [Duplicate clips on the timeline](copy-and-paste.md#duplicate-clips-on-the-timeline). |
| **Split at playhead** | Splits the selected clips at the playhead, if it crosses them. See [Split clips at the playhead](#split-clips-at-the-playhead). |
| **Delete** | Deletes the selected clips and leaves gaps. See [Delete clips](#delete-clips). |
| **Ripple delete** | Deletes the selected clips and closes the space. See [Ripple delete clips](#ripple-delete-clips). |
| **Disable** or **Enable** | Turns the selected clips off, so they are neither seen nor heard but stay on the timeline, or turns them back on. Reads **Enable** when all of them are off. See [Turn a clip off](editing-properties.md#turn-a-clip-off). |
| **Link** or **Unlink** | Links the selected clips, or unlinks them when one is linked. See [Link clips](links-and-groups.md#link-clips) and [Unlink clips](links-and-groups.md#unlink-clips). |
| **Group** | Groups the selected clips. Dimmed with fewer than two clips selected. See [Group clips](links-and-groups.md#group-clips). |
| **Ungroup** | Ungroups the selected clips. Dimmed when none is in a group. See [Ungroup clips](links-and-groups.md#ungroup-clips). |
| **Move into sync** | Moves this clip back into sync with its linked clip. Dimmed when it is in sync. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync). |
| **Rename** | Opens a name field over the clip. See [Rename clips](timeline.md#rename-clips). |
| **Label**, with eight color swatches | Gives the selected clips a label color, or removes it. See [Give clips a label color](timeline.md#give-clips-a-label-color). |
| **Speed...** | Opens the **Speed** section of **Edit Properties** with **Speed** ready for typing. Dimmed for image clips. See [Type an exact speed](speed-freeze-frames-and-punch-zoom.md#type-an-exact-speed). |
| **Freeze frame at playhead** | Holds the frame at the playhead for 2 seconds (<kbd>Shift</kbd>+<kbd>F</kbd>). Dimmed unless the clip is a video under the playhead. See [Hold a frame (freeze frame)](speed-freeze-frames-and-punch-zoom.md#hold-a-frame-freeze-frame). |
| **Reveal in media panel** | Opens the **Media** tab of the Media panel with the clip's media selected and scrolled into view, and gives the keyboard to the Media panel. When the search, the filter chips or the bin you show hide the media, they are cleared or switched so it shows (see [Select what the tab shows](organizing-media.md#select-what-the-tab-shows)). Shown for video, audio and image clips. |
| **Mute** or **Unmute** | Mutes the sound of the selected clips (audio clips, and the audio linked to videos), or brings it back. Reads **Unmute** when all of it is muted. See [Mute a clip](audio-editing.md#mute-a-clip). |
| **Normalize** | Sets the volume of each selected audio clip, or of a selected video's sound, so its loudest moment reaches -1 dBFS. See [Normalize a clip](audio-editing.md#normalize-a-clip). |
| **Auto-duck music** | Lowers the selected audio clips (a music clip, usually) by 12 dB wherever audio plays on the tracks above them. See [Lower music under voices with Auto-duck](audio-editing.md#lower-music-under-voices-with-auto-duck). |
| **Detach audio** | Gives the sound of the selected videos a clip of its own: unlinks it, or adds an audio clip when the video has none. Dimmed when no selected video has sound to detach. See [Give a video's sound a clip of its own](audio-editing.md#give-a-videos-sound-a-clip-of-its-own). |
| **Fade in**, **Fade out**, with **0.25 s**, **0.5 s** and **1 s** | Give the selected clips a fade in or out of that length. Not shown for caption cues. See [Use the fade lengths in the clip menu](fades-and-transitions.md#use-the-fade-lengths-in-the-clip-menu). |
| **Transition**, with **Dissolve**, **Black** and **White** | Adds a cross dissolve, a dip to black or a dip to white at the clip's start or end, whichever is nearer the playhead. Dimmed when the clip touches no other clip. See [Add a transition with the quick actions or the clip menu](fades-and-transitions.md#add-a-transition-with-the-quick-actions-or-the-clip-menu). |
| **Match project size**, with **Fit** and **Fill** | Sizes the picture of the selected clips to the frame, as **Fit in frame** and **Fill frame** in the quick actions do: **Fit** shows the whole picture, **Fill** covers the whole frame. Shown for video, image, solid and text clips. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture). |

The **Mute**, **Normalize**, **Auto-duck music** and **Detach audio** rows show for audio clips and for videos with sound. **Mute**, **Normalize** and **Auto-duck music** are dimmed when the selection has no audio clip to change, for example a video whose sound has no audio clip.

**Right-click a gap.** The gap is selected first.

| Row | What it does |
| --- | --- |
| **Close gap** | Closes this gap. See [Close a gap](#close-a-gap). |
| **Close all gaps on track** | Closes every gap on this track. See [Close all gaps (compact)](#close-all-gaps-compact). |

- Click a row to run it. The menu closes, and the keyboard goes back to the timeline.
- Press <kbd>Escape</kbd> or click outside the menu to close it without doing anything.
- A track header has its own menu. See [Use the track menu](tracks.md#use-the-track-menu). So has the ruler, for markers and the in and out points. See [Use the ruler menu](markers-and-in-out-points.md#use-the-ruler-menu).
- The menu takes the keyboard while it is open: press <kbd>↓</kbd> and <kbd>↑</kbd> to move between rows, <kbd>←</kbd> and <kbd>→</kbd> to move between the choices of the **Label**, **Fade in**, **Fade out**, **Transition** and **Match project size** rows, and <kbd>Enter</kbd> to run. See [Use menus with the keyboard](command-palette-and-custom-shortcuts.md#use-menus-with-the-keyboard).
- Every row is also a command in the command palette, for example **Label: Teal** or **Reveal in media panel**. See [Run a command from the palette](command-palette-and-custom-shortcuts.md#run-a-command-from-the-palette).
- Right-clicking empty space after the last clip of a track opens no menu yet.

## Related pages
- [Editing audio](audio-editing.md)
- [Removing silence](removing-silence.md)
- [Timeline](timeline.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Captions](captions.md)
- [Editing properties](editing-properties.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Keyframes](keyframes.md)
- [Fades and transitions](fades-and-transitions.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 46, 2026-10-18</sub>
