# Advanced trimming

These edits fine-tune a cut without opening gaps or moving the rest of your edit. A roll moves the cut between two clips. A slip changes which part of its media a clip shows. A slide moves a clip between its neighbors. A rate stretch changes a clip's speed by changing its length. While you roll, slip or slide, the preview shows two frames side by side, so you can judge both sides of the cut.

> **Video placeholder: Roll, slip, slide and stretch**
> - File: `videos/advanced-trimming/advanced-trimming-overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: a timeline with three videos with sound end to end on V1 and A1; point at the cut between the first and second clips and hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd>: the cursor becomes `][`; drag right: the first clip gets longer, the second gets shorter, and the preview shows the first clip's last frame on the left and the second clip's first frame on the right; release; press <kbd>Y</kbd>: the **Slip** button turns gold; drag the second clip to the left: it stays in place, the preview shows its new first and last frames, and the tooltip shows the new **In** time; release; press <kbd>U</kbd> and drag the second clip to the right: the first clip gets longer and the third gets shorter; release; press <kbd>R</kbd>, point at the end of the third clip and drag it to twice its length: the tooltip reads **0.5x** and the clip shows a `0.5x` badge; press <kbd>Home</kbd>, then <kbd>Space</kbd>: the third clip plays in slow motion with a lower voice; press <kbd>V</kbd> to go back to the **Select** tool.

## In this page
- [Choose a tool](#choose-a-tool)
- [Roll a cut between two clips](#roll-a-cut-between-two-clips)
- [Select a cut (edit point)](#select-a-cut-edit-point)
- [Slip a clip](#slip-a-clip)
- [Slide a clip between its neighbors](#slide-a-clip-between-its-neighbors)
- [Change a clip's speed with Rate stretch](#change-a-clips-speed-with-rate-stretch)
- [Read the split preview](#read-the-split-preview)
- [Know where an edit stops](#know-where-an-edit-stops)
- [Cancel or undo an edit](#cancel-or-undo-an-edit)

## Choose a tool

The **Tools** group at the left end of the timeline toolbar decides what a drag on a clip does. Click a tool, or press its key. The button of the active tool is gold.

| Tool | Key | Drag the middle of a clip | Drag the start or end of a clip |
| --- | --- | --- | --- |
| **Select** | <kbd>V</kbd> | Moves the clips. See [Move clips](timeline.md#move-clips). | Trims the clip. See [Trimming clips](trimming.md). On a cut, hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> to roll it. |
| **Slip** | <kbd>Y</kbd> | Slips the clip. | Slips the clip. |
| **Slide** | <kbd>U</kbd> | Slides the clip. | Slides the clip. |
| **Rate stretch** | <kbd>R</kbd> | Nothing: a click selects the clip. | Stretches the clip and changes its speed. |
| **Razor** | <kbd>C</kbd> | A click cuts the clip at the pointer. See [Cut clips with the Razor tool](splitting-and-deleting.md#cut-clips-with-the-razor-tool). | A click cuts the clip at the pointer. |
| **Hand** | <kbd>H</kbd> | Pans the view; the clip stays where it is. See [Pan the view](timeline.md#pan-the-view). | Pans the view. |

- The tool keys work in every panel, except while you type in a text field.
- The tool stays active until you choose another one. Each project remembers its tool. Changing the tool is not a step in the history.
- Over a clip, the cursor shows the tool: two bars with a double arrow between them for **Slip**, two bars with arrows pointing out for **Slide**, at the start or end of a clip a bracket with a double arrowhead for **Rate stretch**, over the tracks a vertical line with a small blade for **Razor**, and over the tracks an open hand for **Hand**.
- With every tool except **Razor** and **Hand**, a click on a clip selects it and a drag on empty track space draws a selection rectangle. With **Hand**, any drag on the tracks pans and a click selects nothing. With every tool, a click or drag in the ruler moves the playhead, and a right-click on a clip opens its menu.
- **Slip**, **Slide** and **Rate stretch** change only the clip you drag and its linked clips, even when other clips are selected. While **Linked selection** is off, they change only the clip you drag. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).
- Clips on a locked track can't be rolled, slipped, slid or stretched. See [Lock a track](tracks.md#lock-a-track).
- While you drag, hold the pointer near the left or right edge of the tracks to scroll the timeline.

## Roll a cut between two clips

A rolling edit moves the cut between two clips that touch. The first clip ends later and the second starts later by the same number of frames, or both earlier. Together the two clips keep their length, and nothing else moves.

> **Video placeholder: Roll a cut**
> - File: `videos/advanced-trimming/roll-a-cut.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: two videos with sound end to end on V1 and A1, the second one trimmed so it has only a little media before its start; point at the cut: the cursor is a bracket; hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd>: it becomes `][`; release the keys: it is a bracket again; hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> and drag the cut to the right: both clips and their sounds change length together, the tooltip shows `Δ +00:00:10`, and the preview splits into the first clip's last frame and the second clip's first frame; drag to the left until the cut stops: the right half of the bar turns red and the tooltip shows **Media start**; release: the preview goes back to one frame; hover **Undo**: it reads **Undo Rolling edit**.

1. Make sure the **Select** tool is active (press <kbd>V</kbd>).
2. Point at the cut between two clips that touch, within 3 pixels of it.
3. Hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd>. The cursor becomes `][`.
4. Drag left or right. Once the roll has started, you can let go of the keys.
5. Release the mouse button where the cut should be.

What you see while you drag:

| You see | It means |
| --- | --- |
| Both clips change length as you drag | The roll as it will be when you release. Your project does not change until then. |
| A gold bar on the cut | The new position of the cut. |
| The tooltip `Δ +00:00:15` | How far the cut moved, as `mm:ss:ff`. A minus sign means it moved left. |
| The preview split in two | The last frame of the first clip on the left, the first frame of the second clip on the right. See [Read the split preview](#read-the-split-preview). |
| One half of the bar red, and **Media start** or **Media end** in red in the tooltip | The clip on that side has no more frames: the second clip reached the start of its media (**Media start**), or the first clip reached the end of its media (**Media end**). The roll stops there. |

More things to know:

- Linked clips roll too. When the sounds of the two videos also meet at the cut, their cut moves with it. A linked clip with no clip right against it at that cut is trimmed by the same amount instead.
- The cut snaps to clip edges, the playhead and the start of the timeline, like a trimmed edge. Hold <kbd>S</kbd> during the drag to do the opposite of the snapping setting.
- <kbd>Ctrl</kbd> on its own and **Ripple mode** do not change a roll, and <kbd>Alt</kbd> does not separate linked clips during a roll. To roll the cut on one track only, turn off **Linked selection** first. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).
- A drag near a cut without <kbd>Ctrl</kbd>+<kbd>Alt</kbd> trims the clip on the side you pressed. See [Find the edges of a clip](trimming.md#find-the-edges-of-a-clip).
- The history step is named **Rolling edit**.

> **Tip:** Put the playhead on the frame where the cut belongs, then roll the cut toward it: the cut snaps onto the playhead.

## Select a cut (edit point)

A click right on a cut, without dragging, selects the cut itself instead of a clip. Brackets on the cut show the selected edit point.

| To | Do this | You see |
| --- | --- | --- |
| Select the cut | Click within 3 pixels of the cut between two touching clips | Red brackets `][` on both sides of the cut |
| Select one side of the cut | Hold <kbd>Ctrl</kbd> and click that side of the cut, or click it while **Ripple mode** is on | One gold bracket on that side: `]` at the end of the left clip, or `[` at the start of the right clip |
| Clear the edit point | Click a clip or an empty part of a track, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | The brackets disappear |

- Selecting an edit point clears the clip selection, and selecting clips clears the edit point.
- Brackets also appear on the cut between the linked clips at the same time, for example between the sounds on A1 under a cut on V1.
- The brackets hide while you drag clips or an edge, and show only while the two clips touch.
- Selecting a cut is not a step in the history, and it is not saved with the project.
- In this version, the selected edit point only marks the cut. Adding a transition at the selected edit point is available in a later version.

## Slip a clip

Slipping changes which part of its media a clip shows, without moving the clip or changing its length. Use it when a shot sits in the right place but starts a moment too early or too late.

> **Video placeholder: Slip and slide**
> - File: `videos/advanced-trimming/slip-and-slide.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: three videos with sound end to end on V1 and A1, each trimmed so it has unused media at both ends; press <kbd>Y</kbd>: **Slip** turns gold; drag the second clip to the left: it stays where it is, the preview shows its new first frame on the left and its new last frame on the right, and the tooltip reads `Δ +00:00:10 · In` and a time; release; press <kbd>U</kbd>: **Slide** turns gold; drag the second clip to the right: it moves, the first clip gets longer and the third gets shorter, and the preview shows the first clip's new last frame and the third clip's new first frame; release; hover **Undo**: it reads **Undo Slide clips**; press <kbd>V</kbd>.

1. Press <kbd>Y</kbd>, or click **Slip** in the timeline toolbar.
2. Press anywhere on a video or audio clip and drag left or right.
3. Release the mouse button.

- The clip stays where it is. Its media moves under it: drag left to show a later part of the media, drag right to show an earlier part.
- The preview splits in two: the clip's new first frame on the left, its new last frame on the right.
- The tooltip reads, for example, `Δ +00:00:10 · In 00:03:20`: how far the media moved (plus means a later part), then the time in the media file where the clip now starts.
- Gold bars mark both ends of the clip. When the clip reaches the first or the last frame of its media, the bar on that end turns red, the tooltip shows **Media start** or **Media end** in red, and the slip stops. A clip that already shows its whole media can't slip.
- The clip's sound slips with the picture. Hold <kbd>Alt</kbd> to slip only the clip you drag.
- Slips do not snap.
- Slip works on video and audio clips. An image has no other frames to show, so slipping it changes nothing.
- The history step is named **Slip clip**, or **Slip clips** when linked clips slip with it.

> **Important:** After you slip a video without its sound (<kbd>Alt</kbd>), the picture and the sound no longer match, although both clips stay in place. Both show a red offset number, such as **+10** and **-10**. Undo the slip, or slip the other clip by the same amount. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).

## Slide a clip between its neighbors

Sliding moves a clip along the track while its neighbors make room. The clip keeps its length and its content. The clip before it gets longer or shorter by the same number of frames as the clip after it gets shorter or longer, so nothing else on the track moves.

1. Press <kbd>U</kbd>, or click **Slide** in the timeline toolbar.
2. Press anywhere on a clip that sits between two others and drag left or right.
3. Release the mouse button.

- The preview splits in two: the new last frame of the clip before on the left, the new first frame of the clip after on the right.
- The tooltip shows how far the clip moved, for example `Δ +00:00:10`.
- Gold bars mark the edges of the neighbors that change.
- Where one side has a gap instead of a touching clip, the gap gets shorter or longer instead. The slide then stops at the clip on the other side of the gap, or at `00:00:00`.
- The slide stops when a neighbor reaches the first or the last frame of its media (its bar turns red, and the tooltip shows **Media start** or **Media end** in red) or would get shorter than 1 frame.
- Both ends of the clip snap to clip edges, the playhead and the start of the timeline. Hold <kbd>S</kbd> during the drag to do the opposite of the snapping setting.
- The clip's linked clips slide with it, and their neighbors change the same way. Hold <kbd>Alt</kbd> to slide only the clip you drag; the linked clips then show a red offset number. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).
- The history step is named **Slide clip**, or **Slide clips** when linked clips slide with it.

## Change a clip's speed with Rate stretch

Rate stretch changes how long a clip lasts by changing its speed, not the part of the media it plays. Stretch a clip to twice its length and it plays in slow motion at 0.5x; squeeze it to half its length and it plays at 2x.

> **Video placeholder: Rate stretch**
> - File: `videos/advanced-trimming/rate-stretch.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a 10-second video with sound on V1 and A1, with empty space after it; press <kbd>R</kbd>: **Rate stretch** turns gold; point at the end of the video clip: the cursor is a bracket with a double arrowhead; drag the end to the right until the tooltip reads `Δ +00:10:00 · 00:20:00 · 0.5x`; release: the video and its sound both show a `0.5x` badge; keep dragging the end to the right until the tooltip shows **Min speed 0.25x** in red; press <kbd>Esc</kbd>; press <kbd>Home</kbd> and <kbd>Space</kbd>: picture and sound play at half speed, the voice an octave lower; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the badges disappear.

1. Press <kbd>R</kbd>, or click **Rate stretch** in the timeline toolbar.
2. Point at the start or the end of a video or audio clip. The cursor becomes a bracket with a double arrowhead.
3. Drag the edge, and release the mouse button where the clip should start or end.

What you see while you drag:

| You see | It means |
| --- | --- |
| The clip gets longer or shorter as you drag | The stretch as it will be when you release. |
| The tooltip `Δ +00:10:00 · 00:20:00 · 0.5x` | How far the edge moved, the clip's new length, and its new speed. |
| **Max speed 4x** or **Min speed 0.25x** in red in the tooltip | The clip reached its speed limit. |
| The preview | The clip's first frame when you drag its start, its last frame when you drag its end. |

After you release:

- The clip plays the same part of its media, from the same first frame to the same last frame, only faster or slower.
- Its label bar shows the speed in a badge, such as `0.5x`, `2x` or `1.33x` (up to two decimals), to the left of a red offset number if there is one. Clips at normal speed show no badge. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).
- Its sound plays at the new speed, and the pitch changes with it: at 0.5x the sound is an octave lower, at 2x an octave higher. The editor does not keep the original pitch.
- The history step is named **Rate stretch clip**, or **Rate stretch clips** when linked clips stretch with it.

More things to know:

- The speed goes from 0.25x to 4x: a clip lasts at most four times, and at least a quarter of, the length of the media part it plays.
- A rate stretch never ripples. Like a regular trim, the edge stops at the next or the previous clip and at `00:00:00`. <kbd>Ctrl</kbd> and **Ripple mode** do not change it. To stretch a clip into the space of the next one, move the next one first.
- Linked clips stretch with it, so a video and its sound keep the same speed. Hold <kbd>Alt</kbd> to stretch only the clip you drag.
- The edge snaps like a trimmed edge. Hold <kbd>S</kbd> during the drag to do the opposite of the snapping setting.
- Image clips have no speed: **Rate stretch** trims them like the **Select** tool.
- Typing an exact speed is available in a later version.

> **Tip:** To get back to normal speed, undo the stretch with <kbd>Ctrl</kbd>+<kbd>Z</kbd> instead of dragging the edge back. Separate drags can leave the speed a tiny bit off 1x; the clip then shows a `1x` badge.

## Read the split preview

While you roll, slip or slide, the preview shows two frames side by side instead of the frame at the playhead.

| Edit | Left half | Right half |
| --- | --- | --- |
| Roll | The last frame of the clip before the cut | The first frame of the clip after the cut |
| Slip | The clip's new first frame | The clip's new last frame |
| Slide | The new last frame of the clip before the slid clip | The new first frame of the clip after it |

- At **Fit**, each half shows the whole frame, fitted into its half. When the preview is zoomed in, each half shows the same zoom and the same part of the frame. See [Zoom the preview](preview-zoom-overlays-fullscreen.md#zoom-the-preview).
- Safe zones, grids and the other overlays are hidden while the split preview shows. See [Show a platform safe zone](preview-zoom-overlays-fullscreen.md#show-a-platform-safe-zone).
- The frames follow your drag. When you release or cancel, the preview goes back to the frame at the playhead.
- Trims and rate stretches show a single frame: the new first or last frame of the clip. See [Trim a clip](trimming.md#trim-a-clip).

## Know where an edit stops

The edit stops following the pointer at these limits:

| Limit | Edits | What you see |
| --- | --- | --- |
| Media start and media end | Roll, slip, and the neighbors of a slide | The bar on that side turns red, and the tooltip shows **Media start** or **Media end** in red. |
| 1 frame | Roll, slide, rate stretch | A clip is always at least 1 frame long. |
| Speed from 0.25x to 4x | Rate stretch | The tooltip shows **Min speed 0.25x** or **Max speed 4x** in red. |
| The next or previous clip | Rate stretch, and a slide next to a gap | The edge stops at the neighboring clip. |
| The start of the timeline | Slide, rate stretch | Clips can't start before `00:00:00`. |
| A linked clip | All | When a linked clip reaches one of these limits first, both stop. Except during a roll, hold <kbd>Alt</kbd> to edit one clip only. |

## Cancel or undo an edit

- Press <kbd>Esc</kbd> before you release the mouse button. Everything goes back to how it was, and nothing is added to the history.
- An undo or redo during the drag (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) also cancels it.
- If the editor is playing, starting the drag pauses playback.
- After you release, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole edit in one step: the clip, its linked clips and the neighbors that changed. Hover **Undo** to see the step, for example **Undo Rolling edit** or **Undo Slip clip**.

## Related pages
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Linking and grouping clips](links-and-groups.md)
- [Timeline](timeline.md)
- [Preview and playback](preview-and-playback.md)
- [Audio](audio.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 21, 2026-10-15</sub>
