# Fades and transitions

Fades and transitions soften the edges of your clips. A fade brings a clip in from nothing or takes it away: a picture rises from black (or from what is under it) and a sound rises from silence. A transition blends two clips at a cut: a cross dissolve, or a short dip through black or white. Use them to open and close your video, to change scenes gently, and to take the click out of a cut in your music.

> **Video placeholder: Fade and blend your clips**
> - File: `videos/fades-and-transitions/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows:
>   1. A 1080×1920 project at 30 fps with two videos with sound end to end on V1 and A1, both cut from the middle of longer recordings, and tracks at height M.
>   2. Point at the first video clip: two small white squares appear at its top corners. Drag the left one to the right until the tooltip reads `Fade in · 00:00:15`, and release: a dark wedge covers the start of the clip.
>   3. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the picture rises from black. Pause.
>   4. Click the second video. In the quick actions of **Edit Properties**, click **Fade out 0.5 s**: wedges appear at the end of the video and of its sound, the sound's one with a rounded curve, and the button stays lit.
>   5. Click right on the cut between the two videos: red brackets mark it. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>: a block with two overlapping circles appears over the cut on V1 and on A1, both clips show `fx`, and the **Transition** section opens.
>   6. Put the playhead a second before the cut and press <kbd>Space</kbd>: the first shot dissolves into the second, and the sound crossfades with no click.
>   7. Click **Dip to black** in the **Kind** row: the block shows a moon. Play the cut again: the picture goes through black, the sound still crossfades.
>   8. Drag the right end of the block to the right: both ends move apart and the tooltip shows the new length. Release.
>   9. Right-click the first clip: the **Fade in**, **Fade out** and **Transition** rows sit at the bottom of the menu. Press <kbd>Esc</kbd>.

## In this page
- [How fades work](#how-fades-work)
- [Fade a clip with the fade handles](#fade-a-clip-with-the-fade-handles)
- [Fade a clip and its sound with one click](#fade-a-clip-and-its-sound-with-one-click)
- [Use the fade lengths in the clip menu](#use-the-fade-lengths-in-the-clip-menu)
- [How transitions work](#how-transitions-work)
- [Know how much media a transition needs](#know-how-much-media-a-transition-needs)
- [Add a transition](#add-a-transition)
- [Add the default transition with Ctrl+Shift+D](#add-the-default-transition-with-ctrlshiftd)
- [Add a transition with the quick actions or the clip menu](#add-a-transition-with-the-quick-actions-or-the-clip-menu)
- [Drag a transition onto a cut](#drag-a-transition-onto-a-cut)
- [Read a transition on the timeline](#read-a-transition-on-the-timeline)
- [Select or delete a transition](#select-or-delete-a-transition)
- [Change the length of a transition on the timeline](#change-the-length-of-a-transition-on-the-timeline)
- [Change a transition in Edit Properties](#change-a-transition-in-edit-properties)
- [Crossfade the sound](#crossfade-the-sound)
- [Know what edits do to fades and transitions](#know-what-edits-do-to-fades-and-transitions)
- [Undo fades and transitions](#undo-fades-and-transitions)

## How fades work

A clip can have a fade in at its start and a fade out at its end. Each fade has a length in whole frames.

| Clip | What a fade changes |
| --- | --- |
| Video, image, solid and text clips | The picture's opacity. A fade in starts with the picture invisible on the clip's first frame and ends with it fully visible; a fade out ends with it invisible on the clip's last frame. What is under the picture (a lower track or the background color) shows through. |
| Audio clips | The volume, from silence to full volume and back, on a rounded (equal-power) curve that sounds even. |
| Caption cues | Nothing: cues have no fades. |

- A video and its sound fade separately: a fade on the video clip fades only the picture, and a fade on the audio clip fades only the sound. The **Fade in 0.5 s** and **Fade out 0.5 s** buttons fade both at once; see [Fade a clip and its sound with one click](#fade-a-clip-and-its-sound-with-one-click).
- A clip's fade in and fade out never overlap: together they are at most as long as the clip. An edit that makes the clip shorter than the two keeps them in proportion; see [Know what edits do to fades and transitions](#know-what-edits-do-to-fades-and-transitions).
- A fade works on top of the clip's own **Opacity**, including opacity keyframes: a picture at 50% opacity fades in to 50%. On an audio clip, it works on top of the clip's **Volume** and volume keyframes in the same way. See [Editing audio](audio-editing.md).
- On a text clip, the fade applies to the whole text, together with any in or out animation. See [Text animations](text-animations.md).
- On the timeline, a dark wedge covers the faded part of the clip, bounded by a thin line from the clip's bottom corner to the top: straight on a picture clip, rounded on an audio clip. On M and L tracks the wedge covers the body below the label bar; on S tracks it covers the whole clip.

> **Tip:** To fade a picture over a part of its clip that is not at its start or end, use opacity keyframes instead. See [Fade a picture in or out](keyframes.md#fade-a-picture-in-or-out).

## Fade a clip with the fade handles

1. Point at a clip on the timeline. Two small white squares appear on its top edge, one in each corner: the fade handles. The cursor turns into a left-right arrow over them, and the one under the pointer turns gold.
2. Drag the left handle to the right for a fade in, or the right handle to the left for a fade out. The tooltip shows the fade's length, for example `Fade in · 00:00:15`, and the wedge follows the pointer.
3. Release the mouse button.

- Once a clip has a fade, its handle sits at the end of the fade. Drag it to make the fade longer or shorter, or back into the corner to remove it.
- The fade snaps like a clip you drag: within 8 pixels of the playhead, a marker, an in or out point or the edge of another clip, it jumps onto it, a gold line shows and the tooltip names the target. Hold <kbd>S</kbd> to switch snapping for this drag. See [Snap clips into place](timeline.md#snap-clips-into-place).
- The fade stops at the clip's other fade: the two never overlap.
- A handle fades only its own clip, not its linked clip.
- For an audio clip, you can also type the fade lengths in frames in the **Fades** row of the **Audio** section of **Edit Properties**. See [Fade a clip's sound in the Audio section](audio-editing.md#fade-a-clips-sound-in-the-audio-section).
- The handles work with the **Select** tool, on clips at least 24 pixels wide, on unlocked tracks. To reach the handles of a short clip, zoom in.
- At a cut, the handles sit over the top corners of the two clips. To select or roll the cut instead, point a little lower on the cut.
- Press <kbd>Esc</kbd> before you release to cancel the drag.
- The step is named **Fade in** or **Fade out**.

## Fade a clip and its sound with one click

1. Select one or more clips, on the timeline or in the preview.
2. In the quick actions at the top of **Edit Properties**, click **Fade in 0.5 s** (a rising arrow) or **Fade out 0.5 s** (a falling arrow).

- The fade is half a second long (15 frames at 30 fps). It goes on the selected clips and on their linked clips, so a video and its sound fade together.
- The button is lit when every selected clip, and its linked clips, already has that fade. Its tooltip then reads **Fade in 0.5 s: on (click to remove)**: click it to remove those fades.
- A clip shorter than the fade (with its other fade) gets the longest fade it can take.
- The buttons are dimmed when no selected clip can fade: for example only caption cues, or only clips on a locked track.
- The steps are named **Fade in**, **Fade out**, **Remove fade in** and **Remove fade out**.

## Use the fade lengths in the clip menu

Right-click a clip. Near the bottom of the menu, two rows offer fade lengths:

| Row | Choices | What a click does |
| --- | --- | --- |
| **Fade in** | **0.25 s**, **0.5 s**, **1 s** | Gives the selected clips a fade in of that length. |
| **Fade out** | **0.25 s**, **0.5 s**, **1 s** | Gives the selected clips a fade out of that length. |

- The rows act on the selected clips. A right-click on a clip that is not selected selects it with its linked clips (while **Linked selection** is on), so a video and its sound both get the fade.
- Caption cues have no fade rows.
- Each click is one step, named **Fade in** or **Fade out**.

See [Use the clip and gap menus](splitting-and-deleting.md#use-the-clip-and-gap-menus).

## How transitions work

A transition sits on a cut: the frame where one clip ends and the next one starts, touching it on the same track.

| Kind | What you see |
| --- | --- |
| **Cross dissolve** | The first clip blends into the second one, frame by frame. |
| **Dip to black** | The first clip darkens to black until the middle of the transition, then the second clip comes up out of black. |
| **Dip to white** | The same, through white. |

- Transitions join video and image clips on a video track, and audio clips on an audio track. Text clips, solids and caption cues take no transitions.
- On an audio track, a transition is always a crossfade. See [Crossfade the sound](#crossfade-the-sound).
- A new transition is 15 frames long by default and centered on the cut: 7 frames before the cut and 8 after it. To change the length of new transitions, see [Choose the default transition](settings.md#choose-the-default-transition).
- During a transition, both clips play. The first clip goes on past its end, and the second clip starts before its start. Each keeps the look (position, opacity, fades) of its own edge frame while it plays past its edge.
- Every frame of a cross dissolve shows a little of both clips. In a 15-frame dissolve, the first frame shows 1/16 of the second clip and the last frame 15/16 of it.
- A dip covers only the clip's own picture. A small picture on V2 dips alone, and the tracks under it stay visible.
- Transitions show in the preview while you play, step and scrub, in [Export frame](preview-and-playback.md#export-the-current-frame) and in [exported videos](exporting-video.md), with the sound crossfading. While you play, the editor prepares the frames of both clips ahead of time.

## Know how much media a transition needs

To play past their edges, the two clips need more media than they show: frames before the start of the second clip and after the end of the first one. These extra frames are called handles.

- A clip trimmed from a longer recording has handles: the part of its media before its **Source in** (its head) and after its **Source out** (its tail). A clip that shows its media right up to the first or the last frame has no handle on that side.
- The frames before the cut come from the second clip's head; the frames after the cut come from the first clip's tail.
- A new transition takes the frames it asks for when the handles allow. When one side is short, the other side takes the frames it can't: for example, with only 3 frames before the second clip's start, a 15-frame transition is 3 frames before the cut and 12 after it. When both sides are short, the transition is as long as the handles allow.
- When neither clip has any handle at that cut, the transition keeps its full length and repeats the edge frames: the first clip holds its last frame and the second clip holds its first frame. The repeated frames are striped red on the block, and the message **Not enough media for the transition** appears. The transition still plays, with a frozen frame mixing in.
- Image clips and freeze frames never run out of handles: a still picture holds, and an animated GIF or WebP keeps looping.

> **Tip:** For a clean dissolve, trim a few frames off the end of the first clip and the start of the second one before you add the transition, so both have unused media at the cut.

## Add a transition

| Way | Where the transition goes | Kind |
| --- | --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> in the Timeline panel | The selected cut, or else the cut nearest the playhead on the targeted tracks | **Cross dissolve** |
| **Add dissolve**, **Add dip to black** or **Add dip to white** in the quick actions, clicked | The selected cut, or else the selected clip's start or end, whichever is nearer the playhead | The button's kind |
| The same buttons, dragged onto the timeline | The cut you drop them on | The button's kind |
| **Transition** row of the clip menu: **Dissolve**, **Black** or **White** | The right-clicked clip's start or end, whichever is nearer the playhead | The choice's kind |

Whichever way you use:

- The new transition is selected: its block turns gold and **Edit Properties** shows its **Transition** section.
- A cut that already has a transition keeps its length and alignment and takes the new kind.
- While **Linked selection** is on, the linked audio clips get a crossfade at their cut too, when they touch at the same frame. It is fitted to the sound's own media in the same way, so it usually has the same frames as the picture's transition. See [Crossfade the sound](#crossfade-the-sound).
- Clips on a locked track take no transitions.
- Adding a transition is one step, named **Add cross dissolve**, **Add dip to black** or **Add dip to white**.
- When there is no cut that can take one, the message **No cut to add a transition to** appears and nothing changes.

## Add the default transition with Ctrl+Shift+D

> **Video placeholder: Add and adjust a transition**
> - File: `videos/fades-and-transitions/add-transition.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. Two videos end to end on V1 and A1: the first one ends on the last frame of its file, and the second one starts on the first frame of its file. Put the playhead near the cut, click an empty part of a track and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>: the block appears striped red, and the message **Not enough media for the transition** appears.
>   2. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Hold <kbd>Ctrl</kbd> and drag the end of the first video a second to the left, then hold <kbd>Ctrl</kbd> and drag the start of the second video a second to the right: no gap opens. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> again: the block has no stripes.
>   3. Double-click the block: the **Transition** section shows **Cross dissolve** lit, **Duration** `15` and **Center** lit. Type `30` in **Duration** and press <kbd>Enter</kbd>: the block doubles.
>   4. Click **Start**: the block moves to the right of the cut. Click **Center**.
>   5. Hold <kbd>Alt</kbd> and drag the left end of the block: only that end moves, and no alignment chip is lit.
>   6. Drag the quick actions' **Add dip to white** button onto another cut: the cut lights up; release: the block shows a sun.
>   7. Click the first block and press <kbd>Delete</kbd>: it disappears from V1 and A1, and the cut is hard again.

1. Choose the cut: click right on it to select it as an edit point (red brackets `][` mark it), or put the playhead near it. See [Select a cut (edit point)](advanced-trimming.md#select-a-cut-edit-point).
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> while the Timeline panel is active. A click on the timeline, such as the click on the cut, makes it active.

- With an edit point selected, the transition goes there. Otherwise, it goes on the cut nearest the playhead among the targeted, unlocked tracks; when a video and an audio track have a cut at the same distance, the video track wins. See [Choose the tracks your edits use (target)](tracks.md#choose-the-tracks-your-edits-use-target).
- Selected clips don't change where it goes.
- The default transition is a 15-frame **Cross dissolve**. To add a dip with this key, or another length, set **Transition** and **Length** in **Settings** > **General** > **Transitions**; see [Choose the default transition](settings.md#choose-the-default-transition).
- In the other panels, the browser keeps <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> and offers to bookmark all your tabs. See [Keys the browser keeps](keyboard-shortcuts.md#keys-the-browser-keeps).

## Add a transition with the quick actions or the clip menu

The quick actions of **Edit Properties** have three transition buttons: **Add dissolve** (two overlapping circles), **Add dip to black** (a moon) and **Add dip to white** (a sun).

1. Select a cut (edit point), or a clip that touches another clip.
2. Click one of the three buttons.

- With a cut selected, **Edit Properties** shows the quick actions with only the three transition buttons alive, followed by the **Transition** section when the cut already has a transition.
- With a clip selected, the transition goes on its start or its end, whichever is nearer the playhead. A clip that touches no other clip shows the message **No cut to add a transition to**.
- The tooltip names the kind and the built-in length, for example **Add dissolve (cross dissolve, 15 frames): at the selected cut, or drag it onto one**. The transition gets the **Length** set in **Settings**, also when it differs from the 15 frames of the tooltip.
- The buttons are never dimmed, because you can always drag them onto a cut. See [Drag a transition onto a cut](#drag-a-transition-onto-a-cut).

In the clip menu, the **Transition** row offers the same three kinds as **Dissolve**, **Black** and **White**. Right-click a clip and click one: the transition goes on the clip's start or end, whichever is nearer the playhead. The choices are dimmed when the clip touches no other clip.

## Drag a transition onto a cut

1. Press on **Add dissolve**, **Add dip to black** or **Add dip to white** in the quick actions, and drag. After a few pixels, a chip with the transition's name follows the pointer.
2. Move the pointer over the timeline, near a cut. Within 8 pixels of a cut on the track under the pointer, the cut lights up.
3. Release the mouse button. The transition goes on the lit cut.

- You don't need to select anything first.
- Release away from a cut, or press <kbd>Esc</kbd> during the drag, and nothing changes.

## Read a transition on the timeline

- A transition is a block across its cut, from its first frame to its last. It covers the top of the two clips, the height of their label bar; on S tracks it covers the whole clip.
- A bar marks each end of the block, and an icon in the middle shows its kind: two overlapping circles for **Cross dissolve** (and audio crossfades), a moon for **Dip to black**, a sun for **Dip to white**. The icon shows when the block is wide enough.
- Red diagonal stripes cover the frames that repeat an edge frame. See [Know how much media a transition needs](#know-how-much-media-a-transition-needs).
- A selected transition has a gold outline and tint. Pointing at a block brightens its end bars.
- Both clips of a transition show `fx` in their label bar. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).
- The start and the end of every transition are snap targets, named **Transition** in the tooltip.

## Select or delete a transition

| To | Do this |
| --- | --- |
| Select a transition | Click its block. A click within 3 pixels of the cut itself selects the cut (the edit point) instead. |
| Open its **Transition** section | Double-click the block. The section scrolls into view. |
| Delete it | Select it and press <kbd>Delete</kbd> or <kbd>Backspace</kbd> (also <kbd>Shift</kbd>+<kbd>Delete</kbd>) while the Timeline panel is active. |
| Deselect it | Click a clip, an empty part of a track, a gap or a marker. |

- Selecting a transition clears the selected clips, edit point, gap and marker, and selecting one of those clears the transition.
- Deleting a transition leaves the clips as they are, with a plain cut. While **Linked selection** is on, the linked crossfade goes too. The step is named **Delete transition** or **Delete transitions**.
- Dragging the middle of a block only selects it; drag its ends to change its length.

## Change the length of a transition on the timeline

1. Point at one end of the block. The cursor turns into a left-right arrow.
2. Drag outward to lengthen the transition, or inward to shorten it. Both ends move by the same amount, so the transition grows or shrinks on both sides of the cut. The tooltip shows the change and the new length, for example `Δ +00:00:04 · 00:00:19`.
3. To move only the end you drag, hold <kbd>Alt</kbd>.
4. Release the mouse button.

- The end snaps to the playhead, markers, the in and out points and the edges of other clips, as clips do. It doesn't snap to the edges of its own two clips. Hold <kbd>S</kbd> to switch snapping for this drag.
- An end stops where its handle runs out: a red bar marks the edge, and **Media start** or **Media end** shows in red in the tooltip. A side that already repeats edge frames can grow up to the length of its clip instead.
- Each side stays within its own clip, and a transition is always at least 1 frame long.
- While **Linked selection** is on, the linked crossfade gets the same change.
- Press <kbd>Esc</kbd> before you release to cancel the drag.
- The step is named **Change transition duration**.

## Change a transition in Edit Properties

Select a transition, or double-click its block. **Edit Properties** shows its **Transition** section:

| Row | What it does |
| --- | --- |
| **Kind** | **Cross dissolve**, **Dip to black** or **Dip to white**. The current kind is lit; click another one to change it. On an audio track the row shows only **Crossfade**, lit: an audio transition is always a crossfade. |
| **Duration** | The length in frames (**f**). Type a number, press <kbd>↑</kbd> or <kbd>↓</kbd>, or drag the timer icon at its left (the change applies when you release). The transition keeps its alignment as it gets longer or shorter. |
| **Alignment** | Where the transition sits on the cut: **Center** (tooltip **Center on the cut**), **Start** (**Start at the cut**: all its frames after the cut) or **End** (**End at the cut**: all its frames before the cut). After you drag one end with <kbd>Alt</kbd>, none of them is lit. |

**Compare the alignments before you choose.** Point at **Center**, **Start** or **End** in the **Alignment** row, or reach it with <kbd>Tab</kbd>: the preview splits into two halves side by side. The left half shows the transition's first frame and the right half its last frame, as that alignment would place them. Nothing changes until you click. Move the pointer off the row, or press <kbd>Tab</kbd> past it, and the preview shows the playhead's frame again.

> **Video placeholder: Compare transition alignments**
> - File: `videos/fades-and-transitions/alignment-preview.mp4` (not recorded yet)
> - Length: about 25 seconds
> - Shows: a cross dissolve on a cut between two clips, selected; in the **Transition** section, point at **Start**: the preview splits into the dissolve's first frame (left) and last frame (right); point at **End**: both halves change; point at **Center**; move the pointer away: the preview shows the playhead's frame again; click **End**: the block on the timeline moves before the cut.

- When some frames repeat an edge frame, a hint under **Duration** says how many, for example **Not enough media: 3 frames repeat an edge frame**.
- **Duration** and **Alignment** can make the transition use more media than the handles have: the extra frames repeat edge frames, and the hint and the stripes show it. A drag on the block's ends stops at the handles instead.
- A transition can't be longer than its clips allow: each side stays within its own clip.
- While **Linked selection** is on, the linked crossfade follows **Duration** and **Alignment**. A new **Kind** changes only the picture: the sound keeps crossfading.
- Each change is one step: **Change transition** (the kind), **Change transition duration** or **Align transition**.

## Crossfade the sound

- While **Linked selection** is on, a transition you add to a video cut also adds a crossfade to the linked audio clips' cut, when they touch at the same frame. Changes to the length and alignment, and deleting, act on both.
- With **Linked selection** off, or for music on an audio track of its own, add a transition at the audio cut in the same ways: select the cut and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, or click the quick actions' buttons. On an audio track, every kind becomes a crossfade.
- A crossfade is equal-power: the first sound fades out while the second fades in, so the loudness stays even and the cut has no click.
- Sound can't repeat a frame. Where a handle runs out, the first sound fades out before the end of its media and the second fades in from the start of its media, so a crossfade without handles dips in loudness instead of clicking.
- A dip to black or white doesn't darken the sound: the sound under it still crossfades.

See [Audio](audio.md).

## Know what edits do to fades and transitions

| Edit | Fades | Transitions |
| --- | --- | --- |
| Trim, roll, slip, slide, rate stretch, speed change | Each fade keeps its length. When the clip becomes shorter than its fade in and fade out together, both get shorter in proportion and together fill the clip: a 20-frame fade in and a 10-frame fade out on a clip trimmed to 15 frames become 10 and 5 frames. | A side that used part of a handle gets shorter when the edit uses up that part of the handle, and the transition goes when its handle is used up. Each side also stays within its clip. During a trim drag, the block already shows its new length. |
| Split | The left piece keeps the fade in, the right piece keeps the fade out. | A split inside the transition's frames removes it. A split elsewhere in the clip keeps the transition on its cut. |
| Move one of the clips away, delete one of them, ripple delete | Unchanged. | The transition goes when its two clips no longer touch. |
| Duplicate, copy and paste | The copy keeps the fades. | A transition comes along when both of its clips are copied; otherwise the copy has none at that cut. A copy made in the preview with <kbd>Ctrl</kbd>+<kbd>D</kbd> has no transitions. |
| **Paste attributes** with **Fades** | The clips get the copied clip's fade lengths, shortened to fit a shorter clip. | Unchanged. |

- A side that already repeats edge frames keeps its length when you trim.
- These changes are part of the edit itself: one <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings back the clips and the transition together.
- To trim a clip at a cut that has a transition, grab the clip's edge below the block (on M and L tracks), or within 3 pixels of the cut. Elsewhere in the block's band, pressing selects the transition or drags its ends.

## Undo fades and transitions

Each change is one step in the history. Hover over **Undo** in the app bar to see its name.

| Step name | What made it |
| --- | --- |
| **Fade in**, **Fade out** | A fade handle drag, **Fade in 0.5 s** or **Fade out 0.5 s**, a fade length in the clip menu, or the **Fades** fields of the **Audio** section |
| **Remove fade in**, **Remove fade out** | Clicking a lit **Fade in 0.5 s** or **Fade out 0.5 s** |
| **Add cross dissolve**, **Add dip to black**, **Add dip to white** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, a transition button (clicked or dragged), or the clip menu's **Transition** row |
| **Change transition** | **Kind** in the **Transition** section |
| **Change transition duration** | Dragging an end of the block, or **Duration** |
| **Align transition** | **Center**, **Start** or **End** |
| **Delete transition**, **Delete transitions** | <kbd>Delete</kbd> with a transition selected |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## Related pages
- [Exporting your video](exporting-video.md)
- [Editing audio](audio-editing.md)
- [Timeline](timeline.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Linking and grouping clips](links-and-groups.md)
- [Editing properties](editing-properties.md)
- [Keyframes](keyframes.md)
- [Audio](audio.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#fades-and-transitions)
- [Troubleshooting](troubleshooting.md#fades-and-transitions)

<sub>Last updated: Batch 50, 2026-10-18</sub>
