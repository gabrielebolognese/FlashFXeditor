# Keyframes

Keyframes make a picture change while it plays: slide a logo into a corner, zoom slowly into a shot, turn a sticker, or fade a picture in and out. You set the look you want at two or more moments, and the editor fills in every frame between them. Keyframes work on the position, scale, rotation and opacity of video, image, solid and text clips, and on the volume of audio clips.

> **Video placeholder: Animate a picture with keyframes**
> - File: `videos/keyframes/overview.mp4` (not recorded yet)
> - Length: about 80 seconds
> - Shows:
>   1. A 1080×1920 project at 30 fps with a talking-head video on V1 and a logo PNG on V2, both 5 seconds long. Click the logo in the preview, then click the timeline and press <kbd>Home</kbd>.
>   2. In **Edit Properties**, click the stopwatch at the right of the **Transform** header: it turns gold, the arrows, a diamond and the number **1** appear next to it, an **Ease** row reading **Linear** appears, **Show clip keyframes** in the timeline toolbar turns gold, and a dark lane with one diamond appears along the bottom of the logo's clip.
>   3. Drag the logo in the preview past the left edge of the frame. A gold diamond sits up and to the right of its box, filled.
>   4. Click the timeline and press <kbd>Ctrl</kbd>+<kbd>→</kbd>: the gold diamond in the preview is now outlined. Drag the logo into the top right corner: a second diamond appears on the lane, the count reads **2**, and the diamond in the preview is filled again.
>   5. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the logo slides into the corner in one second, while the **Position** fields count along. Press <kbd>Space</kbd> again.
>   6. Click the first diamond on the lane: it turns gold and the playhead jumps to it. Click **Ease** and choose **Ease out**. Press <kbd>Space</kbd>: the logo arrives fast and slows down into the corner.
>   7. Drag the second diamond to the right along the lane until the tooltip reads `Δ +00:00:15`. Release and play: the slide takes longer.
>   8. Right-click the second diamond: the keyframe menu lists the eight easings, **Delete keyframe**, **Copy keyframe** and **Paste keyframes**. Press <kbd>Esc</kbd>.

## In this page
- [How keyframes work](#how-keyframes-work)
- [Animate a picture](#animate-a-picture)
- [Fade a picture in or out](#fade-a-picture-in-or-out)
- [Change an animated picture](#change-an-animated-picture)
- [Move between keyframes](#move-between-keyframes)
- [Choose the easing](#choose-the-easing)
- [Stop animating](#stop-animating)
- [Show keyframes on the timeline](#show-keyframes-on-the-timeline)
- [Select, move and delete keyframes on the timeline](#select-move-and-delete-keyframes-on-the-timeline)
- [Use the keyframe menu](#use-the-keyframe-menu)
- [Copy keyframes to another clip](#copy-keyframes-to-another-clip)
- [See keyframes in the preview](#see-keyframes-in-the-preview)
- [Animate several clips at once](#animate-several-clips-at-once)
- [Know what happens to keyframes when you edit clips](#know-what-happens-to-keyframes-when-you-edit-clips)
- [Zoom in smoothly with punch zoom](#zoom-in-smoothly-with-punch-zoom)
- [Undo keyframe changes](#undo-keyframe-changes)
- [What is not available yet](#what-is-not-available-yet)

## How keyframes work

A keyframe stores the look of a picture at one frame of its clip. Between two keyframes, the editor moves each value from the first keyframe's value to the second one's, frame by frame. Before the first keyframe, the picture keeps the look of the first one; after the last keyframe, the look of the last one.

Three sections of **Edit Properties** can be animated. Each has its own stopwatch in its header:

| Section | What it animates | Clips |
| --- | --- | --- |
| **Transform** | **Position** (**X** and **Y**), **Scale** (**W** and **H**) and **Rotation** | Video, image, solid and text clips |
| **Opacity** | **Opacity** | Video, image, solid and text clips |
| **Audio** | **Volume** | Audio clips (select a video to animate the audio clip linked to it). The keyframes show on the clip's rubber band. See [Make the volume change over time](audio-editing.md#make-the-volume-change-over-time). |

- A **Transform** keyframe always holds the position, the scale and the rotation together. When you only move a picture at a new keyframe, its scale and rotation are stored there too, with the values they have at that frame.
- Keyframes sit on whole frames of the project's frame rate. They belong to their clip: they move with it on the timeline, and a copy of the clip gets them too.
- These settings are not animated: a change to them applies to every frame of the clip. The **Anchor** and the **Flip** buttons, the crop, the **Solid** section (shape, fill, **W**, **H**, **Radius**), the **Text** section, and the clip's speed.
- A clip with keyframes shows a diamond badge in its label bar on the timeline. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).
- Animated pictures play smoothly: the editor works out each frame's look as it plays. A text that grows with keyframes is drawn at the largest size it reaches, so it stays sharp all the way.

> **Note:** Text animations (**Fade**, **Word pop** and the others) are separate from keyframes, and you can use both on one title. See [Text animations](text-animations.md).

## Animate a picture

1. Select a video, image, solid or text clip, on the timeline or in the preview.
2. Move the playhead to where the motion should start.
3. In **Edit Properties**, click the stopwatch at the right of the **Transform** header (tooltip **Animate transform**). It turns gold, and a first keyframe stores the picture's look at the playhead.
4. Move the playhead to where the motion should end.
5. Change the picture: drag it in the preview, resize or rotate it with its handles, or type new values in **Position**, **Scale** or **Rotation**. A second keyframe stores the new look at the playhead.
6. Play: the picture moves from the first look to the second.

Add more keyframes in the same way: move the playhead and change the picture.

When you turn the stopwatch on:

- The header shows the keyframe buttons next to the stopwatch: **Previous keyframe**, **Add keyframe**, **Next keyframe** and the number of keyframes in the clip. See [Move between keyframes](#move-between-keyframes).
- An **Ease** row appears as the first row of the section. See [Choose the easing](#choose-the-easing).
- **Show clip keyframes** in the timeline toolbar turns on, so the clip shows its keyframes along its bottom. See [Show keyframes on the timeline](#show-keyframes-on-the-timeline).
- When the playhead is not over the clip, the first keyframe goes on the clip's nearest frame: its first frame when the playhead is before the clip, its last frame when it is after.
- The step is named **Animate transform**.

> **Tip:** To keep a picture still for a while and then move it, add a keyframe where the move should start: click **Add keyframe** there before you change the picture.

## Fade a picture in or out

The **Opacity** section has its own stopwatch, so a fade doesn't change the picture's motion.

1. Select the clip and move the playhead to where the fade should start.
2. Click the stopwatch at the right of the **Opacity** header (tooltip **Animate opacity**).
3. Move the playhead to where the fade should end.
4. Type the new value in **Opacity**, for example `0` for a fade-out, and press <kbd>Enter</kbd>.

Halfway between a keyframe at 100% and one at 0%, a **Linear** fade shows the picture at 50%. To show the **Opacity** keyframes on the timeline, right-click the clip and choose **Opacity** under **Show keyframes for**; see [Show keyframes on the timeline](#show-keyframes-on-the-timeline).

> **Tip:** For a fade at the very start or end of a clip, the fade handles in the clip's top corners on the timeline, or **Fade in 0.5 s** and **Fade out 0.5 s** in the quick actions, are quicker and leave **Opacity** free for keyframes. A fade works on top of the keyframed opacity. See [Fades and transitions](fades-and-transitions.md).

## Change an animated picture

While a section's stopwatch is on, its fields show the values at the playhead, and they follow the playhead while you play, step or scrub. Every change you make writes a keyframe at the playhead:

- **On a keyframe** (the **Remove keyframe** button is lit), the change updates that keyframe.
- **Between keyframes**, the change adds a keyframe at the playhead.
- **With the playhead outside the clip**, the change goes to the clip's first or last frame, whichever is nearer.

These changes write keyframes:

| Change | Section |
| --- | --- |
| Moving, resizing and rotating a picture in the preview, and nudging it with the arrow keys | **Transform** |
| Typing, label drags and arrow keys in **Position**, **Scale** and **Rotation** | **Transform** |
| **Fit in frame**, **Fill frame**, **Center in frame** and **Reset transform**, in the quick actions and in the layer menu | **Transform**: they act on the look at the playhead |
| Typing, label drags and arrow keys in **Opacity** | **Opacity** |

- These changes keep their usual step names, for example **Move layer**, **Nudge layer** or **Change position**.
- **Flip horizontal** and **Flip vertical** mirror the picture on every frame.
- A new anchor point keeps the picture where it is at the playhead, and the whole motion moves along with it.
- The size of a shape (**W** and **H**), and the font size and box width of a text, are not animated: resizing them with their handles changes every frame.

## Move between keyframes

While a section is animated, its header holds these controls, left of the stopwatch:

| Control | Tooltip | What it does |
| --- | --- | --- |
| Left arrow | **Previous keyframe** | Moves the playhead to the keyframe before it. |
| Diamond | **Add keyframe** or **Remove keyframe** | Off the keyframes, adds a keyframe at the playhead with the look shown there; the picture doesn't change. On a keyframe, the button is lit and named **Remove keyframe**: a click removes that keyframe. |
| Right arrow | **Next keyframe** | Moves the playhead to the next keyframe. |
| Number | | How many keyframes of the section the clip has. |

- The arrows do nothing when there is no keyframe in that direction. Keyframes outside the clip after a trim don't count; see [Know what happens to keyframes when you edit clips](#know-what-happens-to-keyframes-when-you-edit-clips).
- Removing the last keyframe turns the stopwatch off. The picture keeps the look of that keyframe on every frame.
- The steps are named **Add keyframe** and **Remove keyframe**.

## Choose the easing

The easing of a keyframe sets how the values travel from that keyframe to the next one. New keyframes are **Linear**. A keyframe you add between two others takes the easing of the keyframe before it.

1. Move the playhead onto the keyframe: use **Previous keyframe** and **Next keyframe**, or click its diamond on the timeline.
2. Click **Ease**, the first row of the section, and choose an easing.

| Easing | How the move looks |
| --- | --- |
| **Linear** | An even speed from start to end. |
| **Ease in** | Starts slowly and speeds up. |
| **Ease out** | Starts fast and slows down into place. |
| **Ease in-out** | Slow at both ends, fast in the middle. |
| **Hold** | No move: the value stays as it is until the next keyframe, then jumps to it on that frame. |
| **Smooth** | Gets going quickly and slows down gently. |
| **Snap** | Covers most of the way at once, then settles slowly into place. |
| **Overshoot** | Goes a little past the next keyframe's value and settles back onto it. |

- **Ease** shows the easing of the keyframe at the playhead. It reads `--` when the playhead is not on a keyframe (the choices are then dimmed), or when the selected clips' keyframes there have different easings. The current easing is gold in the list.
- The easing of the last keyframe has no effect until you add a keyframe after it.
- **Hold** makes a cut inside a clip: use it to make a logo jump from one corner to another.
- To set the easing of several keyframes at once, select them on the timeline and use the keyframe menu. See [Use the keyframe menu](#use-the-keyframe-menu).
- The step is named **Change keyframe easing**.

> **Tip:** **Ease out** suits a picture that slides in and lands; **Ease in** suits one that leaves. **Overshoot** gives a playful bounce to stickers and titles.

## Stop animating

Click the gold stopwatch of the section (tooltip **Stop animating transform (removes its keyframes)** or **Stop animating opacity (removes its keyframes)**).

- Every keyframe of that section goes, and the picture keeps the look it has at the playhead, on every frame of the clip.
- The keyframe buttons and the **Ease** row disappear.
- The step is named **Remove transform keyframes** or **Remove opacity keyframes**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings the keyframes back.

## Show keyframes on the timeline

Click **Show clip keyframes** (the diamond) in the timeline toolbar. It is gold while it is on. Turning a stopwatch on turns it on too.

> **Video placeholder: Keyframes on the timeline**
> - File: `videos/keyframes/timeline-lane.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A logo on V2 with three **Transform** keyframes, V2 at height M, and **Show clip keyframes** on. Click the logo's clip: a dark lane with three white diamonds runs along its bottom.
>   2. Click the middle diamond: it turns gold, the playhead jumps to it, and **Position** in **Edit Properties** shows its values.
>   3. <kbd>Shift</kbd>+click the last diamond: both are gold. Drag them to the left: the tooltip shows the move, and a gold line appears when the first one reaches the playhead. Release: the motion happens earlier.
>   4. Hold <kbd>Alt</kbd> and click the lane between two diamonds: a new gold diamond appears there, with the playhead on it.
>   5. Press <kbd>Delete</kbd>: the new keyframe is gone and the clip stays.
>   6. Right-click the clip and choose **Opacity** under **Show keyframes for**: the lane is empty. Choose **Transform** again.
>   7. Click the height toggle in the V2 header until the track is S: the lane disappears. Click it again until the track is L: the lane shows also when the clip is not selected.

While **Show clip keyframes** is on, a keyframe lane, a dark strip along the bottom of the clip, shows a diamond for each keyframe:

- **On the selected clips** of video tracks at height M or L.
- **On every clip of an L track**, selected or not.
- **Not on S tracks**, where a clip is only its label bar, and not on audio tracks or the **CC** caption track. Audio clips show their volume keyframes as diamonds on their rubber band instead, whether **Show clip keyframes** is on or not. See [Edit volume keyframes on the rubber band](audio-editing.md#edit-volume-keyframes-on-the-rubber-band).
- A diamond sits where the playhead stands on its frame. A keyframe on the clip's first or last frame sits just inside the clip's edge, so you can still grab it.
- Diamonds are white; selected diamonds are gold.

The lane shows the **Transform** keyframes. To see a clip's **Opacity** keyframes instead, right-click the clip and choose **Opacity** under **Show keyframes for** in the clip menu; choose **Transform** to go back. The current choice is gold. The choice applies to the selected clips, and choosing a row also turns **Show clip keyframes** on.

**Show clip keyframes**, the lane choice of each clip and the selected keyframes are not steps in the history. The project remembers the switch and the lane choices when you open it again.

## Select, move and delete keyframes on the timeline

These work with the **Select** tool, on a keyframe lane:

| Do this | What happens |
| --- | --- |
| Click a diamond | Selects that keyframe (gold) and its clip, and moves the playhead to it, so **Edit Properties** shows its values. |
| <kbd>Shift</kbd>+click a diamond | Adds the keyframe to the selection, or removes it. Selected keyframes are always on one lane of one clip. |
| Drag a diamond | Moves the selected keyframes along the lane: that part of the motion happens earlier or later. Pressing a diamond that is not selected selects it alone first. |
| <kbd>Alt</kbd>+click the lane | Adds a keyframe at that frame, with the look shown there. The new keyframe is selected and the playhead moves to it. |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Deletes the selected keyframes. The clip stays. |
| Right-click a diamond | Opens the keyframe menu. See [Use the keyframe menu](#use-the-keyframe-menu). |
| Click anywhere else on the timeline or in the preview | Deselects the keyframes. <kbd>Delete</kbd> then deletes clips again. |

While you drag keyframes:

- The tooltip next to the pointer shows how far they moved, for example `Δ +00:00:15`. The playhead stays where it is.
- With **Snap** on, they snap to the lane's other keyframes (**Keyframe** in the tooltip), the playhead (**Playhead**) and the clip's first and last frames (**Start of** or **End of** and the clip's name), with a gold line. Hold <kbd>S</kbd> during the drag to switch snapping for this drag. See [Snap clips into place](timeline.md#snap-clips-into-place).
- Hold <kbd>Shift</kbd> to place the keyframe you hold on a whole second of the timeline, such as `00:02:00`.
- Keyframes stay inside the clip: the drag stops when one of them reaches the clip's first or last frame.
- A keyframe dropped on another keyframe replaces it.
- Press <kbd>Esc</kbd> before you release to cancel the drag.

Near the ends of a clip, a press on a diamond grabs the keyframe, not the clip's edge. To trim there, press on the edge above the lane.

When you drag a clip whose lane is showing, its keyframes snap too, like its start and end: you can line up a keyframe with the playhead, a marker or another clip's cut. See [Snap clips into place](timeline.md#snap-clips-into-place).

The steps are named **Move keyframe** or **Move keyframes**, **Add keyframe**, and **Delete keyframe** or **Delete keyframes**.

## Use the keyframe menu

Right-click a diamond on a keyframe lane, or on the rubber band of an audio clip. When the diamond is selected, the menu acts on all the selected keyframes; otherwise the diamond is selected alone first.

| Row | What it does |
| --- | --- |
| **Easing**: **Linear**, **Ease in**, **Ease out**, **Ease in-out**, **Hold**, **Smooth**, **Snap**, **Overshoot** | Sets the easing of the selected keyframes. The easing of the keyframe you right-clicked is gold. See [Choose the easing](#choose-the-easing). |
| **Delete keyframe** or **Delete keyframes** | Deletes the selected keyframes, like <kbd>Delete</kbd>. |
| **Copy keyframe** or **Copy keyframes** | Copies the selected keyframes. |
| **Paste keyframes** | Pastes the copied keyframes on the selected clips, from the playhead on. Dimmed until you copy keyframes of the same section as this lane (**Transform** or **Opacity**), or volume keyframes for a rubber band. |

<kbd>Esc</kbd> closes the menu.

## Copy keyframes to another clip

Give several clips the same motion, for example the same slide-in for three stickers.

1. On a clip's keyframe lane, select the keyframes to copy (<kbd>Shift</kbd>+click for several). Right-click one of them and choose **Copy keyframes**.
2. Select the clip to paste onto, and move the playhead to where the first copied keyframe should go.
3. Right-click a diamond on that clip's lane and choose **Paste keyframes**.

- The pasted keyframes keep their spacing, values and easings. The first one lands at the playhead; one that would land after the end of the clip is left out.
- A pasted keyframe replaces a keyframe on the same frame.
- The clip you paste onto needs a diamond to right-click: when it has no keyframes yet, click its stopwatch first.
- The copied keyframes stay ready to paste until you copy others or reload the page.
- The step is named **Paste keyframes**.

## See keyframes in the preview

When the **Transform** of a selected picture is animated, a small gold diamond sits up and to the right of the top-right handle of its box:

- **Filled:** the playhead is on a **Transform** keyframe. Moving, resizing or rotating the picture updates that keyframe.
- **Outlined:** the playhead is between keyframes. A change adds a keyframe at the playhead.

With several pictures selected, the diamond is filled only when every animated one has a keyframe at the playhead. The diamond doesn't show in crop mode.

## Animate several clips at once

Select several clips to work on their keyframes together:

- The stopwatch is gold when every selected clip is animated. When only some are, the keyframe buttons show but the stopwatch isn't gold: a click animates the others too, each with a keyframe at the playhead.
- A click on the gold stopwatch removes the section's keyframes from every selected clip.
- **Previous keyframe** and **Next keyframe** go to the nearest keyframe of any selected clip. **Add keyframe** adds one at the playhead to every selected clip that has none there; when every one has one there, the button removes them.
- The number of keyframes shows when every selected clip has the same number.
- Changes at the playhead write keyframes on each animated clip, and fields whose values differ show `--`. See [Edit several clips at once](editing-properties.md#edit-several-clips-at-once).
- Clips on locked tracks keep their keyframes.

## Know what happens to keyframes when you edit clips

| Edit | What happens to the keyframes |
| --- | --- |
| Move a clip | They move with it. |
| Split a clip (<kbd>Ctrl</kbd>+<kbd>K</kbd>, the **Razor** tool) | Each part keeps its share of the motion. Played one after the other, the parts look exactly as the clip did, also when the cut falls in the middle of an eased move. <kbd>Ctrl</kbd>+<kbd>Z</kbd> gives back one clip with its keyframes. |
| Trim the end | Keyframes after the new end stay with the clip, hidden from the lane, and still shape the motion up to the end. Lengthen the clip again and they come back. |
| Trim the start of a video or audio clip | Keyframes stay on the same frame of the video or the same moment of the sound, so the motion stays in step with the picture and a volume change with the sound. Keyframes before the new start stay hidden, like at the end. |
| Trim the start of an image, solid or text | Keyframes stay at the same distance from the clip's start: the motion starts with the new start. |
| Slip a video or audio clip | Keyframes stay on the same frames of the video or the same moments of the sound, so the motion or the volume change moves with them. |
| Change the speed, or **Rate stretch** | Keyframes stretch or squeeze with the clip's new length: at 2x, the motion takes half as long. Keyframes that land on the same frame become one. |
| Freeze frame | The frozen clip holds the look the picture has at the playhead, without keyframes. The parts before and after it keep their motion. |
| Duplicate (<kbd>Ctrl</kbd>+<kbd>D</kbd>, <kbd>Alt</kbd>+drag) | The copy gets the same keyframes. |
| A new project resolution | Position and scale keyframes scale with the layout, like the pictures. See [What a new resolution does to your clips](projects-and-saving.md#what-a-new-resolution-does-to-your-clips). |

## Zoom in smoothly with punch zoom

**Punch zoom** (<kbd>Shift</kbd>+<kbd>Z</kbd>) uses keyframes: the part after the cut gets a **Transform** keyframe on its first frame, with its own scale and **Ease out**, and one 6 frames later, 20% larger. The shot zooms in over those 6 frames and lands softly: at 30 fps that is 0.2 seconds. Change the keyframes like any others, for example drag the second one further to zoom in more slowly. See [Punch in at a cut (punch zoom)](speed-freeze-frames-and-punch-zoom.md#punch-in-at-a-cut-punch-zoom).

## Undo keyframe changes

Each change is one step in the history. Hover over **Undo** in the app bar to see its name.

| Step name | What made it |
| --- | --- |
| **Animate transform**, **Animate opacity**, **Animate volume** | Turning a stopwatch on |
| **Remove transform keyframes**, **Remove opacity keyframes**, **Remove volume keyframes** | Turning a stopwatch off |
| **Add keyframe** | **Add keyframe**, <kbd>Alt</kbd>+click on a keyframe lane, or <kbd>Ctrl</kbd>+click on a rubber band |
| **Remove keyframe** | **Remove keyframe** |
| **Delete keyframe**, **Delete keyframes** | <kbd>Delete</kbd> or <kbd>Backspace</kbd> with keyframes selected, or the keyframe menu |
| **Move keyframe**, **Move keyframes** | Dragging diamonds on a keyframe lane |
| **Move volume keyframe**, **Move volume keyframes** | Dragging diamonds, or the line between them, on a rubber band |
| **Change keyframe easing** | **Ease**, or an easing in the keyframe menu |
| **Paste keyframes** | **Paste keyframes** in the keyframe menu |
| **Move layer**, **Change position**, **Change opacity** and the other change names | A change at the playhead while the stopwatch is on |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- Copying and pasting keyframes with <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd>: use the keyframe menu.
- Choosing keyframe menu rows with the arrow keys.
- Settings for the punch zoom (to cut in at once, without the 6-frame zoom) and for whether keyframes follow the video when you trim its start.

## Related pages
- [Editing properties](editing-properties.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Timeline](timeline.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Trimming clips](trimming.md)
- [Text animations](text-animations.md)
- [Fades and transitions](fades-and-transitions.md)
- [Editing audio](audio-editing.md)
- [Shapes and images](shapes-and-images.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#keyframes)
- [Troubleshooting](troubleshooting.md#keyframes)

<sub>Last updated: Batch 37, 2026-10-17</sub>
