# Editing properties

The **Edit Properties** panel shows the settings of what you selected: a clip, a track, a marker, or the project itself when nothing is selected. Use it to type exact values, such as a position in pixels or the end time of a clip, to drag a value while you watch the preview, to fit or fill the frame with one click, to animate a picture with keyframes, to crop a picture, to change a clip's speed, to set the volume of a clip's sound, normalize it, duck music under a voice or cut out its pauses, to fade clips and set up transitions, to shape and color solids, to style text and save it as a preset, to give your captions their look and place, and to change several clips at once.

> **Video placeholder: Edit Properties in action**
> - File: `videos/editing-properties/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows:
>   1. A 1080×1920 project with a 16:9 video with sound on V1 and A1 and a logo PNG on V2, the playhead over both. Click an empty area of the timeline tracks: **Edit Properties** shows the **Project** section.
>   2. Click the video clip on the timeline: the panel header reads **2 clips**, and the quick actions row appears above the **Clip**, **Transform**, **Crop**, **Opacity**, **Speed** and **Audio** sections.
>   3. Click **Fill frame** in the quick actions: the video covers the frame and its sides are cut off. Click **Fit in frame**: it fills the width again, with bands above and below.
>   4. Click the logo in the preview. In **Transform**, press on the **X** of **Position** and drag to the right: the logo slides across the preview while the **X** turns gold. Release.
>   5. Click in the **Y** field, type `-600` and press <kbd>Enter</kbd>: the logo jumps up.
>   6. Click in the **Opacity** field, type `50` and press <kbd>Enter</kbd>: the logo becomes see-through. Hover **Undo** in the app bar: it reads **Undo Change opacity**.
>   7. Click the **Transform** header: the section folds away. Click it again.
>   8. Click the video on the timeline. In the **Clip** section, click in **End**, type a time one second earlier and press <kbd>Enter</kbd>: the video and its sound get shorter.
>   9. Click **Duplicate** in the quick actions: a copy of the video and its sound appears right after them on V1 and A1, selected.

## In this page
- [Find your way around the panel](#find-your-way-around-the-panel)
- [Type a value](#type-a-value)
- [Drag a value](#drag-a-value)
- [Edit several clips at once](#edit-several-clips-at-once)
- [Use the quick actions](#use-the-quick-actions)
- [Fit, fill or center a picture](#fit-fill-or-center-a-picture)
- [Duplicate a clip](#duplicate-a-clip)
- [Change a clip's name, color and times](#change-a-clips-name-color-and-times)
- [Turn a clip off](#turn-a-clip-off)
- [Place a picture with exact values](#place-a-picture-with-exact-values)
- [Animate values with keyframes](#animate-values-with-keyframes)
- [Crop a picture](#crop-a-picture)
- [Change a clip's speed](#change-a-clips-speed)
- [Change a clip's sound](#change-a-clips-sound)
- [Pick a color](#pick-a-color)
- [Undo and cancel](#undo-and-cancel)
- [Related pages](#related-pages)

## Find your way around the panel

The **Edit Properties** panel sits at the top of the left side, next to the Media panel. What it shows depends on what you selected:

| You selected | The panel shows | See |
| --- | --- | --- |
| Nothing (click an empty area of the timeline tracks) | The **Project** section | [Project settings and templates](project-settings-and-templates.md) |
| One or more clips | The quick actions, then the **Clip** section. When a text clip is among them, **Text** and **Animation** come right after **Clip**. When a solid is among them, **Solid** comes next. When a caption cue is among them, **Caption style** comes next. When a video, image, solid or text clip is among them, also **Transform** and **Opacity**, with **Crop** between them for video and image clips. When a video or audio clip is among them, also **Speed**. When an audio clip or a video with sound is among them, **Audio** comes last. | This page, [Titles and text](titles-and-text.md#style-text-in-the-text-section) for **Text**, [Text animations](text-animations.md) for **Animation**, [Shapes and images](shapes-and-images.md#choose-the-shape) for **Solid**, [Style your captions](captions.md#style-your-captions) for **Caption style**, [Cropping and reframing](cropping-and-reframing.md) for **Crop**, [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md) for **Speed**, and [Editing audio](audio-editing.md#find-the-audio-section) for **Audio** |
| One or more track headers | The **Track** section, and the **Caption style** section when the **CC** caption track is among them | [Change track settings in Edit Properties](tracks.md#change-track-settings-in-edit-properties), [Style your captions](captions.md#style-your-captions) |
| A marker in the ruler | The **Marker** section | [Edit a marker in Edit Properties](markers-and-in-out-points.md#edit-a-marker-in-edit-properties) |
| A transition (click its block on the timeline) | The **Transition** section | [Change a transition in Edit Properties](fades-and-transitions.md#change-a-transition-in-edit-properties) |
| A cut between two clips (an edit point) | The quick actions, with only the three transition buttons alive, and the **Transition** section when the cut has a transition | [Add a transition with the quick actions or the clip menu](fades-and-transitions.md#add-a-transition-with-the-quick-actions-or-the-clip-menu) |

- With several clips or tracks selected, the right end of the panel header shows how many, for example **3 clips** or **2 tracks**.
- Each section starts with a header: an arrow and the section name. The **Transform**, **Opacity** and **Audio** headers also hold a stopwatch at their right end, for keyframes (the **Audio** stopwatch animates **Volume**); see [Animate values with keyframes](#animate-values-with-keyframes). Click the header to fold the section away, and click it again to open it. A folded section stays folded for every selection (fold **Transform** once, and it stays folded for every clip you select), and the project remembers it when you open it again.
- The quick actions stay at the top of the panel while the sections scroll under them.
- Press <kbd>Tab</kbd> to move to the next field and <kbd>Shift</kbd>+<kbd>Tab</kbd> to the previous one.
- The panel follows the selection, on the timeline and in the preview. When you move, resize or rotate a picture in the preview, the fields show the new values as soon as you release the mouse button. They also follow **Undo** and **Redo**.

## Type a value

1. Click in a field. Its value is selected.
2. Type the new value.
3. Press <kbd>Enter</kbd>, or click elsewhere. Press <kbd>Esc</kbd> instead to keep the old value.

In a number field you can also press <kbd>↑</kbd> or <kbd>↓</kbd> to add or subtract 1, and <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> to add or subtract 10. Hold the key to keep going.

- Number fields show their unit after the value: **px** (pixels), **%**, **°** (degrees), **s** (seconds), **dB** (decibels) or **f** (frames). Most show one decimal, for example **100.0**, and round what you type to one decimal; the crop fields in **px** and the **Solid** fields show whole pixels, and the **Fades** fields of the **Audio** section whole frames. The **Duration** and **Stagger** fields of the **Animation** section show seconds with two decimals and step one frame at a time; see [Set how long an animation plays](text-animations.md#set-how-long-an-animation-plays).
- Both a comma and a point work as the decimal sign: `3,5` and `3.5` are the same.
- A value outside the range of a field stops at its limit, for example 100 in **Opacity**.
- Text that is not a number is ignored, and the field shows its value again.
- Each typed value is one step in the history. In the **Text**, **Animation**, **Solid**, **Caption style**, **Transform**, **Crop**, **Opacity**, **Speed** and **Audio** sections, arrow presses less than 0.3 seconds apart are one step together, so one <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes a quick series. In the other number fields, each press is one step.
- Clicking the letter or icon at the left of a number field (the field's label), without dragging, also puts you in the field.
- While you type in a field, shortcuts are off: <kbd>Space</kbd>, for example, types a space instead of playing.

## Drag a value

Drag the label of a number field (the letter or icon at its left, such as **X**, **W** or the droplet of **Opacity**) to change the value while you watch the result in the preview.

1. Point at the label. The cursor becomes a left-right arrow.
2. Press and drag to the right to raise the value, or to the left to lower it. The value changes by 1 for each pixel the mouse moves: 1 pixel of position, 1% of scale, 1° of rotation.
3. Release. The new value is one step in the history.

| Hold while you drag | The value changes by |
| --- | --- |
| Nothing | 1 per pixel |
| <kbd>Shift</kbd> | 10 per pixel |
| <kbd>Alt</kbd> | 0.1 per pixel |

- The drag starts once the mouse has moved 3 pixels. You can press and release <kbd>Shift</kbd> and <kbd>Alt</kbd> during the drag.
- While you drag, the label and the edge of the field turn gold. In the **Transform**, **Crop**, **Opacity** and **Solid** sections, the preview and the gold box around the picture follow at once. **Speed** and **Audio** are different: the field counts along, and the clip, the timeline, the preview and the sound change when you release.
- The project's **W** and **H** fields (with a **Custom** resolution) change by 2 per pixel, and the frame takes the new size when you release.
- The value stops at the limits of the field. Drag back and it moves again at once.
- Press <kbd>Esc</kbd> before you release to cancel: the value goes back, and nothing is added to the history.

## Edit several clips at once

Select several clips, on the timeline or in the preview (see [Select clips](timeline.md#select-clips)). The panel shows the values they share.

- **A field whose values differ shows `--`.** Type a value to give every selected clip that value, in one step. For example, three clips at 100%, 50% and 25% opacity show `--` in **Opacity**; type `40` and press <kbd>Enter</kbd>, and all three are at 40%.
- **Dragging the label or pressing ↑ and ↓** changes every selected clip by the same amount, from its own value, so their differences stay.
- **A switch whose clips differ sits halfway.** Click it to turn it on for all of them.
- **Name** renames every selected clip, and **Color** gives every selected clip the label color.
- **Start**, **End**, **Duration**, **Source in** and **Source out** trim each selected clip to the time you type, all in one step.
- **Transform** and **Opacity** change only the pictures among the selected clips: the video, image, solid and text clips. **Crop** changes the video and image clips, and **Solid** the solids. A video's linked sound is left alone.
- **Speed** changes the video and audio clips among them. With **Linked selection** on, a video's linked sound gets the same speed. See [Change the speed of a video and its sound](speed-freeze-frames-and-punch-zoom.md#change-the-speed-of-a-video-and-its-sound).
- **Audio** changes the audio clips among them and the audio clips linked to the selected videos.
- Clips on locked tracks keep their values.

## Use the quick actions

With clips selected, a row of one-click buttons sits at the top of the panel. Point at a button to see its name; **Freeze frame**, **Punch zoom**, **Duplicate** and **Delete** also show their shortcut, **Update preset** names the preset it writes into, and the transition buttons name their kind and length. When the panel is narrow, the row continues on a second line.

| Button | What it does |
| --- | --- |
| **Fit in frame** | Sizes the selected pictures to fit inside the frame, and centers them. See [Fit, fill or center a picture](#fit-fill-or-center-a-picture). |
| **Fill frame** | Sizes the selected pictures to cover the whole frame, and centers them. |
| **Center in frame** | Centers the selected pictures without changing their size. |
| **Flip horizontal**, **Flip vertical** | Mirror the selected pictures left to right, or upside down. Click again to mirror them back. |
| **Reset transform** | Puts the selected pictures back to how a new clip is placed. |
| **Fade in 0.5 s**, **Fade out 0.5 s** | Fade the selected clips and their linked clips in or out over half a second. Lit when they all have that fade: click again to remove it. See [Fade a clip and its sound with one click](fades-and-transitions.md#fade-a-clip-and-its-sound-with-one-click). |
| **Freeze frame** | Holds the frame at the playhead for 2 seconds (<kbd>Shift</kbd>+<kbd>F</kbd>). See [Hold a frame (freeze frame)](speed-freeze-frames-and-punch-zoom.md#hold-a-frame-freeze-frame). |
| **Punch zoom** | Cuts the clip at the playhead and zooms the part after the cut 20% larger within 6 frames (<kbd>Shift</kbd>+<kbd>Z</kbd>). See [Punch in at a cut (punch zoom)](speed-freeze-frames-and-punch-zoom.md#punch-in-at-a-cut-punch-zoom). |
| **0.5x**, **1x**, **1.5x**, **2x** | Set the speed of the selected video and audio clips. See [Change a clip's speed with one click](speed-freeze-frames-and-punch-zoom.md#change-a-clips-speed-with-one-click). |
| **Save as preset** (a bookmark with a plus) | Opens a name field under the row: press <kbd>Enter</kbd> to save the selected text's style as a new text preset. See [Save a text style as a preset](text-presets.md#save-a-text-style-as-a-preset). |
| **Update preset** (a bookmark with a check mark) | Writes the selected text's style into the preset it uses. Other texts that use the preset keep their style until you apply it to them again. See [Update a preset](text-presets.md#update-a-preset). |
| **Add dissolve**, **Add dip to black**, **Add dip to white** | Add a 15-frame transition at the selected cut, or at the selected clip's start or end nearest the playhead. Drag one onto a cut on the timeline to add it there. See [Add a transition](fades-and-transitions.md#add-a-transition). |
| **Mute** (a crossed-out speaker) | Mutes the selected audio clips and the sound of the selected videos. It looks pressed and reads **Unmute** while all of it is muted: click again to hear it. See [Mute a clip](audio-editing.md#mute-a-clip). |
| **Remove silence** (dashed scissors) | Opens the **Remove silence** row under the quick actions: red stripes mark the pauses in the selected sound, and **Apply** cuts them out and closes the gaps. It looks pressed while the row is open: click again to close it. See [Removing silence](removing-silence.md). |
| **Duplicate** | Copies the selected clips, with their linked sound and their groups, right after them (<kbd>Ctrl</kbd>+<kbd>D</kbd>). See [Duplicate a clip](#duplicate-a-clip). |
| **Delete** | Deletes the selected clips and leaves gaps, like the <kbd>Delete</kbd> key. See [Delete clips](splitting-and-deleting.md#delete-clips). |

- A button is dimmed when none of the selected clips can take it. The picture buttons and **Punch zoom** need a video, image, solid or text clip; an audio clip has no picture. On a text clip, the picture buttons use the box of its text, and on a solid the box of its shape. **Freeze frame** needs a video clip, and the speed buttons a video or audio clip that is not a freeze frame. **Save as preset** needs a text clip. **Update preset** needs a text clip whose style differs from the preset it uses. The fade buttons need a clip that is not a caption cue. **Mute** and **Remove silence** need an audio clip, or a video whose sound is a linked audio clip, and **Remove silence** also needs the video and its sound on unlocked tracks. The transition buttons are never dimmed. Clips on locked tracks are skipped.
- Whether a button is dimmed depends on the selection only, not on the playhead. **Freeze frame** and **Punch zoom** act at the playhead: when it is not over the selected clip, a message says so.
- The buttons don't take the keyboard focus, but a click in the panel makes **Edit Properties** the active panel. See [How shortcuts work](keyboard-shortcuts.md#how-shortcuts-work).

## Fit, fill or center a picture

Select one or more video, image, solid or text clips, then click a button in the quick actions. For a text clip, the buttons use the box of its text, and for a solid the box of its shape. You find the same actions in the layer menu of the preview: right-click a picture and choose **Fit**, **Fill**, **Center**, **Flip horizontal**, **Flip vertical** or **Reset transform**. See [Use the layer menu](arranging-layers-in-the-preview.md#use-the-layer-menu).

> **Video placeholder: Fit, fill and center**
> - File: `videos/editing-properties/fit-fill-center.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A 1080×1920 project with a 1920×1080 landscape video on V1. Click the clip: the picture fills the width with black bands above and below, and **Scale** reads **56.3%** and **56.3%**.
>   2. Click **Fill frame**: the picture covers the frame, its sides are cut off, and **Scale** reads **177.8%**.
>   3. Drag the picture to the left in the preview, then click **Center in frame**: it is back in the middle, still at 177.8%.
>   4. Type `30` in **Rotation** and press <kbd>Enter</kbd>, then click **Fit in frame**: the tilted picture shrinks until its corners are inside the frame.
>   5. Click **Flip horizontal**: the picture is mirrored and the **Flip horizontal** button in the **Transform** section lights up.
>   6. Click **Reset transform**: the picture is upright, unmirrored, fitted and centered again.

| Action | What happens | A 1920×1080 video in a 1080×1920 project |
| --- | --- | --- |
| **Fit** | The picture gets the largest size at which it fits completely inside the frame, and is centered. Nothing is cut off; the background shows where the picture doesn't reach. | 1080×607.5 pixels, **Scale** 56.3%, bands above and below |
| **Fill** | The picture gets the smallest size at which it covers the whole frame, and is centered. What reaches past the frame is cut off. | 3413.3×1920 pixels, **Scale** 177.8%, the left and right sides cut off |
| **Center** | The middle of the picture moves to the middle of the frame. Its size and angle stay. | **Position** 0, 0 (with the anchor point in the middle) |
| **Flip horizontal**, **Flip vertical** | The picture is mirrored in its place. A second click mirrors it back. | |
| **Reset transform** | The picture goes back to how a new clip is placed: fitted to the frame and centered, upright, not mirrored, with the anchor point in the middle. Its crop stays. | Same as **Fit** |

- These act on every selected picture, also those that are not under the playhead.
- On a picture animated with keyframes, **Fit**, **Fill**, **Center** and **Reset transform** act on its look at the playhead and write a keyframe there; the flips mirror every frame. See [Change an animated picture](keyframes.md#change-an-animated-picture).
- On a solid, **Fit** and **Fill** change its **Scale**, not its size, and **Reset transform** centers it at 100%. See [Move, turn and fade shapes](shapes-and-images.md#move-turn-and-fade-shapes).
- On a cropped picture, **Fit**, **Fill** and **Center** size and center the part left after the crop. **Reset transform** leaves the crop as it is. See [Cropping and reframing](cropping-and-reframing.md).
- A tilted picture keeps its angle. **Fit** and **Fill** size the upright box around the tilted picture: with **Fit** the whole tilted picture stays inside the frame; with **Fill** that box covers the frame, so small empty corners can remain where the tilted edges cross the frame.
- **Fit** and **Fill** keep the shape of the picture: a picture stretched to a different width and height gets the same scale for both again.
- **Reset transform** fits the picture to the current frame size, also after you changed the project resolution.
- Each click is one step in the history, named **Fit layer**, **Fill frame**, **Center layer**, **Flip horizontal**, **Flip vertical** or **Reset transform** (**Fit layers**, **Center layers** and **Reset transforms** for several pictures).

## Duplicate a clip

Select the clips and click **Duplicate** in the quick actions: a copy of the selected clips, with their linked sound and their groups, appears right after them on the same tracks, selected. No other clip moves, and the step is named **Duplicate clip** or **Duplicate clips**. **Duplicate** is dimmed when every selected clip is on a locked track.

<kbd>Ctrl</kbd>+<kbd>D</kbd> does the same while the Timeline panel is active; while **Edit Properties** is active, the browser gets the key, so click the timeline first. In the Preview panel, <kbd>Ctrl</kbd>+<kbd>D</kbd> copies the selected pictures 20 pixels down and to the right instead. See [Duplicate clips on the timeline](copy-and-paste.md#duplicate-clips-on-the-timeline) and [Duplicate a picture in the preview](copy-and-paste.md#duplicate-a-picture-in-the-preview).

> **Tip:** To give other clips this clip's transform, opacity, crop, speed, text style, animations, volume or fades, copy it and use **Paste attributes** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>). See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes).

## Change a clip's name, color and times

Select a clip. The **Clip** section shows:

> **Video placeholder: The Clip section**
> - File: `videos/editing-properties/clip-section.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 4-second video with sound on V1 and A1, and a second clip on V1 starting at 6 seconds. Click the first clip; in the **Clip** section, type "Intro" in **Name** and press <kbd>Enter</kbd>: both label bars read **Intro**.
>   2. Click the orange swatch in **Color**: both clips turn orange.
>   3. Click in **End**, type `00:02:00` and press <kbd>Enter</kbd>: the clip and its sound end at 2 seconds; **Duration** reads **00:02:00**.
>   4. Type `00:05:00` in **End**: the clip stops at 4 seconds, the end of its media, and the message **Trim stopped at the media end** appears.
>   5. Type `00:02:00` in **End** again. Drag the second clip so it starts at 3 seconds, and click the first clip. Type `00:04:00` in **End**: it stops at 3 seconds with **Trim stopped at the next clip**.
>   6. Type `00:00:10` in **Start**: the clip starts 10 frames later, its end stays, and **Source in** reads **00:00:10**.

| Row | What it does |
| --- | --- |
| **Name** | The name in the clip's label bar. Type a new one and press <kbd>Enter</kbd>. Up to 255 characters; spaces at the start and end are removed, and a blank name is ignored. Same as [Rename clips](timeline.md#rename-clips). |
| **Color** | The eight label colors. Click one to give the selected clips that color. The current color has a gold ring; click it to remove the label. Same as the **Label** row of the clip menu; see [Give clips a label color](timeline.md#give-clips-a-label-color). |
| **Enabled** | On: the clip is seen and heard. Off: it is left out. See [Turn a clip off](#turn-a-clip-off). |
| **Start** | Where the clip starts on the timeline. |
| **End** | Where the clip ends: the first frame after its last frame, so **End** is always **Start** plus **Duration**. |
| **Duration** | How long the clip is. |
| **Source in** (video and audio clips) | The moment in the media file where the clip starts. |
| **Source out** (video and audio clips) | The moment in the media file where the clip ends. |

### Type a clip time

The time fields use the same format as the other timecodes: `mm:ss:ff`, or `mm:ss.mmm` when you show times in milliseconds. You can type a full time such as `0:03:10`, a frame number such as `90`, or move from the current value with `+30` or `-15` (frames) and `+2.` (seconds). See [Jump to a timecode](timeline.md#jump-to-a-timecode). Text the editor can't read is ignored, and the field shows the clip's time again.

A typed time trims the clip. It is a regular trim: no gap closes and no other clip moves.

| Field | What moves | What stays |
| --- | --- | --- |
| **Start** | The start of the clip. An earlier start shows more of the media before it; a later start shortens the clip. | The end |
| **End** | The end of the clip | The start |
| **Duration** | The end of the clip | The start |
| **Source in** | The start of the clip: it now begins at that moment of the media, and its start on the timeline moves with it. | The end |
| **Source out** | The end of the clip: it now ends at that moment of the media. | The start |

- With **Linked selection** on, the linked clip is trimmed the same way, so a video and its sound stay in step.
- A trim stops at the first or last frame of the media, at the next or previous clip on the track, at the start of the timeline, and at a length of 1 frame. When a limit stops the clip short of the time you typed, a message says why, for example **Trim stopped at the media end** or **Trim stopped at the next clip**. See [Know where a trim stops](trimming.md#know-where-a-trim-stops).
- Image clips have no **Source in** and **Source out**.
- Each typed time is one step in the history, named **Trim clip** (**Trim clips** for several).

To trim by dragging instead, see [Trimming clips](trimming.md).

## Turn a clip off

A clip that is turned off (disabled) stays on the timeline but is left out of your video. Use it to compare your edit with and without a shot, without deleting it.

1. Select the clips.
2. Right-click one of them and choose **Disable**, or turn off **Enabled** in the **Clip** section.

What a disabled clip does:

- On the timeline, it is drawn faded and covered with diagonal lines.
- Its picture leaves the preview and exported frames, and you can't pick it in the preview. Its sound is not heard.
- You can still select, move, trim, split and delete it on the timeline.

To turn it back on, right-click it and choose **Enable**, or turn **Enabled** on.

- The menu row reads **Disable** while any selected clip is on, and turns them all off; when all of them are off, it reads **Enable**.
- A right-click on a video that isn't selected selects it together with its sound, so both are turned off. To turn off only the picture, <kbd>Alt</kbd>+click the video first, then right-click it.
- Clips on locked tracks don't change.
- Each change is one step in the history, named **Disable clip** or **Enable clip** (**Disable clips**, **Enable clips** for several).

## Place a picture with exact values

Select a video, image, solid or text clip. The **Transform** and **Opacity** sections set where its picture sits in the frame, how big it is, its angle and how see-through it is. They hold the same values you change by dragging in the preview (see [Arranging layers in the preview](arranging-layers-in-the-preview.md)).

> **Video placeholder: Exact position, scale and opacity**
> - File: `videos/editing-properties/transform-section.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 1080×1920 project with a video on V1 and a 500×500 logo PNG on V2, fitted to the frame width. Click the logo in the preview: **Position** reads **0.0** and **0.0**.
>   2. Drag the **W** of **Scale** to the left: **W** and **H** shrink together. Release at 40%.
>   3. Type `300` in **X** and `-700` in **Y**: the logo sits in the top right part of the frame.
>   4. Click the chain button between **W** and **H** to unlock it, type `60` in **H**: the logo gets taller.
>   5. Type `15` in **Rotation**: the logo turns clockwise around its middle.
>   6. Type `0` in both **Anchor** fields: the logo doesn't move, and **Position** shows new numbers. Type `30` in **Rotation**: now it turns around its top left corner.
>   7. Drag the droplet of **Opacity** to the left until it reads 50%: the video shows through the logo.

| Row | Fields | What it sets |
| --- | --- | --- |
| **Position** | **X** and **Y**, in px | Where the anchor point of the picture sits, in pixels of the project frame from the center of the frame: **X** to the right, **Y** down. A fitted, centered picture reads 0, 0. These are the numbers of the move readout in the preview. |
| **Scale** | **W** and **H**, in %, with a chain button between them | The size of the picture: 100% is the media's own size in pixels (for a solid, its **W** and **H** in the **Solid** section). From 1% to 10000%. |
| **Rotation** | Curved arrow, in ° | The angle. Positive angles turn clockwise. |
| **Anchor** | **X** and **Y**, in % | Where the anchor point is in the picture: 0% is the left or top edge, 50% the middle, 100% the right or bottom edge. The picture turns around this point. |
| **Flip** | **Flip horizontal** and **Flip vertical** | Mirror the picture. A button is lit while its flip is on. |
| **Opacity** (its own section) | Droplet, in % | How solid the picture is: 100% is solid, 0% is invisible. |

**The chain button** locks the shape of the picture. While it is lit (tooltip **Unlock the aspect**), changing **W** changes **H** by the same factor, and the other way around. Click it to unlock (tooltip **Lock the aspect**) and change the width and the height separately. It starts locked, unless a selected picture already has a different width and height scale. It is not remembered: each new selection starts again.

- A new scale or angle keeps the anchor point where it is: the picture grows, shrinks or turns around it.
- A new anchor point does not move the picture: **Position** changes instead, so the picture stays in place. This is the same as dragging the anchor marker with <kbd>Alt</kbd> in the preview; see [Move the anchor point](arranging-layers-in-the-preview.md#move-the-anchor-point).
- Every value applies to the whole clip, on every frame of it, until you turn on the section's stopwatch. Then the fields show the values at the playhead, and a change writes a keyframe there. See [Animate values with keyframes](#animate-values-with-keyframes).
- Typed and dragged values don't snap. Snapping works only while you drag a picture in the preview.
- The steps are named **Change position**, **Change scale**, **Change rotation**, **Change anchor** and **Change opacity**; the flip buttons make **Flip horizontal** and **Flip vertical**.

## Animate values with keyframes

The **Transform** and **Opacity** sections can change over time. Click the stopwatch at the right of the section header (tooltip **Animate transform** or **Animate opacity**): it turns gold and stores the picture's look at the playhead as a first keyframe. Then move the playhead and change the values: each change writes a keyframe at the playhead, and the picture moves, grows, turns or fades between them.

While the stopwatch is on:

- The header shows **Previous keyframe**, **Add keyframe** (or **Remove keyframe** on a keyframe), **Next keyframe** and the number of keyframes, left of the stopwatch.
- An **Ease** row, the first row of the section, sets how the values travel from the keyframe at the playhead to the next one: **Linear**, **Ease in**, **Ease out**, **Ease in-out**, **Hold**, **Smooth**, **Snap** or **Overshoot**. It reads `--` off the keyframes.
- **Position**, **Scale**, **Rotation** and **Opacity** show the values at the playhead and follow it while you play or scrub. **Anchor** and **Flip** are not animated.
- Clicking the gold stopwatch removes the section's keyframes, and the picture keeps its look at the playhead.

The stopwatch of the **Audio** section works the same way for **Volume** (tooltip **Animate volume**); see [Make the volume change over time](audio-editing.md#make-the-volume-change-over-time).

See [Keyframes](keyframes.md).

## Crop a picture

Select a video or image clip. The **Crop** section, between **Transform** and **Opacity**, cuts away the sides of its picture:

- **L**, **R**, **T** and **B** set how much is cut from the left, right, top and bottom, in pixels of the media (**px**) or in percent of it (**%**, chosen in the **Units** row).
- The chain button in the **Aspect** row keeps the shape of the visible part while you change a side.
- **Crop to frame** cuts the picture to the project frame; followed by **Fill frame**, it turns a landscape video into a full vertical shot.
- **Reset** removes the crop.
- The crop button in the section header turns on crop mode, with crop handles on the picture in the preview.

See [Cropping and reframing](cropping-and-reframing.md).

## Change a clip's speed

Select a video or audio clip. The **Speed** section, the last one of the panel, sets how fast the clip plays:

- **Speed** sets the speed in percent, from 25% to 400%. The chain button next to it decides whether the clip's length follows the speed (gold, the default) or stays.
- **Duration** sets the clip's length. With the chain button gold, the speed changes to fill it.
- **Ripple** (on by default) moves the clips after it with the change of length.
- **Freeze frame** holds the frame at the playhead for 2 seconds.

Right-click a video or audio clip on the timeline and choose **Speed...** to open the section with **Speed** ready for typing. See [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md).

## Change a clip's sound

Select an audio clip, or a video with sound. The **Audio** section, the last one of the panel, edits the sound. With a video selected, it edits the audio clip linked to it.

- **Volume** sets the clip's volume, from -60.0 to +12.0 dB. The stopwatch in the **Audio** header animates it with keyframes, the same keyframes the rubber band on the timeline shows; while it is on, an **Ease** row comes first.
- **Mute** silences the clip.
- **Fades** sets the fade in and the fade out of the sound, in frames.
- **Normalize** sets the volume so the clip's loudest moment reaches -1 dBFS.
- **Auto-duck** lowers a music clip by 12 dB wherever audio plays on the tracks above it.
- **Detach audio** gives a video's sound a clip of its own.

See [Editing audio](audio-editing.md). To cut the pauses out of the sound, click **Remove silence** in the quick actions: see [Removing silence](removing-silence.md).

## Pick a color

A color field is a swatch with the color's hex code next to it. The **Background** of the project uses one (in the **Project** section, shown when nothing is selected), and so do the colors of the **Text**, **Caption style** and **Solid** sections.

- **Type a hex code.** Click in the code, type `#RGB`, `#RRGGBB` or `#RRGGBBAA` (the `#` is optional) and press <kbd>Enter</kbd>. Text that is not a color is ignored.
- **Use the color picker.** Click the swatch (tooltip **Pick a color**). The picker opens under it.

> **Video placeholder: The color picker**
> - File: `videos/editing-properties/color-picker.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A project with a small logo in the middle of the frame. Click an empty area of the timeline tracks, then click the **Background** swatch: the picker opens.
>   2. Drag the hue strip to blue, then drag in the square: the background around the logo follows in the preview.
>   3. Release: the color appears first in the row of recent colors, and **Undo** reads **Undo Change background color**.
>   4. Drag the **R** label to the right: the background turns violet. Press <kbd>Esc</kbd> before you release: the blue comes back and the picker closes.
>   5. Open the picker again and click **Pick a color from the screen**; click a red spot in the Media panel: the background turns red.
>   6. Click the blue in the recent colors: the background is blue again. Click outside the picker to close it.

| Part of the picker | What it does |
| --- | --- |
| The large square | Drag in it to choose how vivid the color is (from left to right) and how bright (from bottom to top). |
| The hue strip (rainbow) | Drag along it to choose the hue. |
| The opacity strip | Drag along it to choose how see-through the color is. |
| The small swatch and the hex field | Show the color. Type a hex code in the field and press <kbd>Enter</kbd>. |
| **Pick a color from the screen** (eyedropper) | Click it, then click anywhere on your screen to take that color. Press <kbd>Esc</kbd> to stop without picking. The opacity stays as it was. Shown only in browsers that offer an eyedropper, such as Chrome. |
| **R**, **G**, **B** and **A** | Number fields: red, green and blue from 0 to 255, and **A** (opacity) from 0 to 100%. Type a value, use <kbd>↑</kbd> and <kbd>↓</kbd>, or drag the letter. |
| Recent colors | The last 8 colors you applied, newest first. Point at one to see its hex code; click it to use it again. The row appears once you have applied a color. |

- While you drag in the square or along a strip, or drag one of the letters **R**, **G**, **B** or **A**, the preview shows the color live. Release to apply it.
- Each color you finish choosing (a drag you release, a typed value, a recent color, the eyedropper) applies at once and is one step in the history, named after what it colors, for example **Change background color**, or **Change fill** for a solid. The picker stays open, so you can keep adjusting.
- Press <kbd>Esc</kbd> or click outside the picker to close it. <kbd>Esc</kbd> during a drag also cancels the drag: the preview goes back to the color you had.
- See-through colors show a checkerboard behind them in the swatches.
- The recent colors belong to this browser, not to a project: every project shows the same row. They are not part of the undo history.

## Undo and cancel

- Press <kbd>Esc</kbd> while you type to keep the old value, and during a label drag to cancel it.
- In a text field, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes your typing in that field, not a change to the project. Leave the field first to undo a change.
- Folding or opening a section is not a step in the history.

| Step name | What made it |
| --- | --- |
| **Change position**, **Change scale**, **Change rotation**, **Change anchor**, **Change opacity** | A typed value, a label drag, or a quick series of <kbd>↑</kbd> and <kbd>↓</kbd> presses in that field |
| **Fit layer**, **Fill frame**, **Center layer**, **Flip horizontal**, **Flip vertical**, **Reset transform** (and the plural names) | The quick actions, the **Flip** buttons and the layer menu |
| **Change crop**, **Crop to frame**, **Reset crop**, **Reset crops** | The **Crop** section. See [Undo and cancel](cropping-and-reframing.md#undo-and-cancel) on the cropping page. |
| **Rename clip**, **Rename clips** | **Name** |
| **Label clip**, **Label clips** | **Color** |
| **Disable clip**, **Enable clip** (and the plural names) | **Enabled**, and **Disable** or **Enable** in the clip menu |
| **Trim clip**, **Trim clips** | **Start**, **End**, **Duration**, **Source in**, **Source out** |
| **Duplicate clip**, **Duplicate clips** | **Duplicate** or <kbd>Ctrl</kbd>+<kbd>D</kbd>. See [Undo a paste or a duplicate](copy-and-paste.md#undo-a-paste-or-a-duplicate). |
| **Change speed** | A speed button, **Speed**, or a quick series of <kbd>↑</kbd> and <kbd>↓</kbd> presses in it |
| **Save preset "Name"** | **Save as preset**: the text starts to use the new preset. **Update preset** is not a step in the history. See [Undo and presets](text-presets.md#undo-and-presets). |
| **Change duration** | **Duration** in the **Speed** section |
| **Freeze frame**, **Freeze frames**, **Punch zoom** | **Freeze frame** and **Punch zoom**. See [Undo a pacing change](speed-freeze-frames-and-punch-zoom.md#undo-a-pacing-change). |
| **In animation: Word pop**, **Remove out animation**, **Change in animation duration** and the other animation steps | The **Animation** section. See [Undo animation changes](text-animations.md#undo-animation-changes). |
| **Caption position**, **Move captions**, **Change caption width**, **Word highlight** and the other caption steps | The **Caption style** section. See [Undo caption changes](captions.md#undo-caption-changes). |
| **Change shape**, **Change fill**, **Change size**, **Change corner radius** | The **Solid** section. See [Undo shape and image changes](shapes-and-images.md#undo-shape-and-image-changes). |
| **Change background color**, **Change resolution**, **Change frame rate** | **Background**, **Resolution** (or **Size**) and **Frame rate** in the **Project** section. See [Project settings and templates](project-settings-and-templates.md). |
| **Animate transform**, **Remove opacity keyframes**, **Add keyframe**, **Change keyframe easing** and the other keyframe steps | The stopwatches, the keyframe buttons and **Ease**. See [Undo keyframe changes](keyframes.md#undo-keyframe-changes). |
| **Fade in**, **Remove fade out**, **Add cross dissolve**, **Change transition duration**, **Align transition** and the other fade and transition steps | The fade and transition buttons and the **Transition** section. See [Undo fades and transitions](fades-and-transitions.md#undo-fades-and-transitions). |
| **Change volume**, **Mute clip**, **Normalize clip**, **Auto-duck music**, **Detach audio**, **Animate volume** and the other audio steps | The **Audio** section and the **Mute** quick action. See [Undo audio changes](audio-editing.md#undo-audio-changes). |
| **Remove silence** | **Apply** in the **Remove silence** row. See [Undo Remove silence](removing-silence.md#undo-remove-silence). |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## Related pages
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Keyframes](keyframes.md)
- [Fades and transitions](fades-and-transitions.md)
- [Editing audio](audio-editing.md)
- [Removing silence](removing-silence.md)
- [Shapes and images](shapes-and-images.md)
- [Cropping and reframing](cropping-and-reframing.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Titles and text](titles-and-text.md)
- [Text animations](text-animations.md)
- [Text presets](text-presets.md)
- [Captions](captions.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Timeline](timeline.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Tracks](tracks.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Projects and saving](projects-and-saving.md)
- [The workspace](workspace.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 42, 2026-10-18</sub>
