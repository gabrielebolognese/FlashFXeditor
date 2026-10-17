# Speed, freeze frames and punch zoom

These tools set the pace of your short. Speed a clip up or slow it down with one click or an exact percentage, hold a frame for two seconds to let a moment land, and punch in on a shot with a cut that zooms 20% closer in a fraction of a second. Each one is a single step that you undo with <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

> **Video placeholder: Pacing tools in one minute**
> - File: `videos/speed-freeze-frames-and-punch-zoom/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A 1080×1920 project at 30 fps with a 10-second talking-head video with sound on V1 and A1 (clip A), and a second clip with sound (clip B) right after it.
>   2. Click clip A. In the quick actions at the top of **Edit Properties**, click **2x**: A and its sound get half as long and both show a `2x` badge, and B moves up against A. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the voice plays fast and an octave higher. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.
>   3. Scroll down to the **Speed** section, click in **Speed**, type `75` and press <kbd>Enter</kbd>: A gets longer and B moves later.
>   4. Put the playhead on a strong expression in A and press <kbd>Shift</kbd>+<kbd>F</kbd>: a 2-second clip with a snowflake badge appears at the playhead, and everything after it moves 2 seconds later. Play over it: the picture holds and the sound stops for 2 seconds, then both go on.
>   5. Move the playhead to the middle of a sentence in A and press <kbd>Shift</kbd>+<kbd>Z</kbd>: A is cut there. Play over the cut: right after it, the face zooms 20% closer in a fraction of a second.

## In this page
- [Find the pacing tools](#find-the-pacing-tools)
- [Change a clip's speed with one click](#change-a-clips-speed-with-one-click)
- [Type an exact speed](#type-an-exact-speed)
- [Keep the length or the media part](#keep-the-length-or-the-media-part)
- [Set the duration in the Speed section](#set-the-duration-in-the-speed-section)
- [Move later clips with the change (Ripple)](#move-later-clips-with-the-change-ripple)
- [Change the speed of a video and its sound](#change-the-speed-of-a-video-and-its-sound)
- [Know where a speed change stops](#know-where-a-speed-change-stops)
- [Hold a frame (freeze frame)](#hold-a-frame-freeze-frame)
- [Change a freeze frame](#change-a-freeze-frame)
- [Punch in at a cut (punch zoom)](#punch-in-at-a-cut-punch-zoom)
- [Know which clip a freeze or punch zoom uses](#know-which-clip-a-freeze-or-punch-zoom-uses)
- [Undo a pacing change](#undo-a-pacing-change)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## Find the pacing tools

| Tool | Where you find it | Shortcut |
| --- | --- | --- |
| Speed buttons **0.5x**, **1x**, **1.5x**, **2x** | The quick actions at the top of **Edit Properties** | |
| The **Speed** section: **Speed**, **Duration**, **Ripple** and **Freeze frame** | **Edit Properties**, with a video or audio clip selected | |
| **Speed...** | The clip menu (right-click a video or audio clip): opens the **Speed** section | |
| **Freeze frame** | The **Edit** group of the timeline toolbar, the quick actions, the **Speed** section, and **Freeze frame at playhead** in the clip menu | <kbd>Shift</kbd>+<kbd>F</kbd> |
| **Punch zoom** | The **Edit** group of the timeline toolbar and the quick actions | <kbd>Shift</kbd>+<kbd>Z</kbd> |

<kbd>Shift</kbd>+<kbd>F</kbd> and <kbd>Shift</kbd>+<kbd>Z</kbd> work in every panel, except while you type in a field. Point at a button to see its name and shortcut.

To change a speed by dragging a clip's edge instead, use the **Rate stretch** tool. See [Change a clip's speed with Rate stretch](advanced-trimming.md#change-a-clips-speed-with-rate-stretch).

## Change a clip's speed with one click

1. Select one or more video or audio clips, on the timeline or in the preview.
2. In the quick actions at the top of **Edit Properties**, click **0.5x**, **1x**, **1.5x** or **2x** (tooltips **Speed 0.5x**, **Speed 1x**, **Speed 1.5x** and **Speed 2x**).

With the default settings of the **Speed** section, this is what happens with **2x** on a 10-second clip:

- The clip plays the same part of its media twice as fast, so it lasts 5 seconds.
- Its linked sound gets the same speed and length, and plays an octave higher. The editor does not keep the original pitch.
- The clips after it move 5 seconds earlier, on every unlocked track, so no gap opens.
- Both clips show a `2x` badge in their label bar. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).

More things to know:

- The buttons set a speed; they don't multiply it. A second click on **2x** leaves the clip at 2x.
- **1x** puts a clip back to normal speed, and its speed badge disappears. This also removes the `1x` badge that separate rate stretches can leave.
- The buttons follow the link and **Ripple** settings of the **Speed** section, also while that section is folded. See [Keep the length or the media part](#keep-the-length-or-the-media-part) and [Move later clips with the change (Ripple)](#move-later-clips-with-the-change-ripple).
- The buttons are dimmed when no selected clip has a speed: image clips and freeze frames have none. Clips on locked tracks don't change.
- Each click is one step in the history, named **Change speed**.

## Type an exact speed

Select one or more video or audio clips. The **Speed** section of **Edit Properties** comes after **Opacity**; for audio clips alone, it comes right after **Clip**. Image clips have no **Speed** section.

> **Video placeholder: The Speed section**
> - File: `videos/speed-freeze-frames-and-punch-zoom/speed-section.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 10-second video with sound on V1 and A1 (clip A), and a second clip (clip B) right after it on V1. Right-click A and choose **Speed...**: the **Speed** section opens with **Speed** selected, reading **100.0**.
>   2. Type `200` and press <kbd>Enter</kbd>: **Duration** reads **00:05:00**, and B moves up against A.
>   3. Press <kbd>↑</kbd> five times quickly: **Speed** reads **205.0**, and A gets a little shorter with B following. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: **Speed** reads **200.0** again.
>   4. Click the **Ripple** switch to turn it off, then type `50` in **Speed**: A stops where B starts, and the message **Shortened at the next clip** appears.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and turn **Ripple** on again. Click the chain button next to **Speed** so it is no longer gold, and type `100`: A keeps its 5 seconds and now plays the first 5 seconds of its media at normal speed.
>   6. Click the chain button so it is gold again, and type `00:04:00` in **Duration**: **Speed** reads **125.0**, and B moves up against A.

| Row | What it does |
| --- | --- |
| **Speed** | The speed in percent: **100.0** is normal speed, **200.0** twice as fast, **50.0** half as fast. From 25% to 400% (0.25x to 4x), with one decimal. The gauge icon at its left is the field's label: drag it to change the value. |
| Chain button, right of **Speed** | Links the duration to the speed. Gold while it is on (the default; tooltip **Unlink the duration from the speed**); click it to turn it off (tooltip **Link the duration to the speed**). See [Keep the length or the media part](#keep-the-length-or-the-media-part). |
| **Duration** | How long the clip lasts, as a timecode. See [Set the duration in the Speed section](#set-the-duration-in-the-speed-section). |
| **Ripple** | On (the default): the clips after it move with the change of length. Tooltip **Move later clips with the duration**. See [Move later clips with the change (Ripple)](#move-later-clips-with-the-change-ripple). |
| **Freeze frame** | Holds the frame at the playhead for 2 seconds, like <kbd>Shift</kbd>+<kbd>F</kbd>. Tooltip **Freeze the frame at the playhead for 2 s**. See [Hold a frame (freeze frame)](#hold-a-frame-freeze-frame). |

To set a speed:

1. Click in **Speed**, or right-click the clip on the timeline and choose **Speed...**: the **Speed** section opens, also when it was folded, with **Speed** selected.
2. Type the speed in percent, for example `150`.
3. Press <kbd>Enter</kbd>, or click elsewhere. Press <kbd>Esc</kbd> instead to keep the old speed.

- <kbd>↑</kbd> and <kbd>↓</kbd> add or subtract 1%, <kbd>Shift</kbd>+<kbd>↑</kbd> and <kbd>Shift</kbd>+<kbd>↓</kbd> 10%. Presses less than 0.3 seconds apart are one step in the history.
- Dragging the gauge label changes the number in the field only. The clip, the timeline and the preview change once, when you release. Press <kbd>Esc</kbd> before you release to cancel. See [Drag a value](editing-properties.md#drag-a-value).
- With several clips selected, **Speed** shows `--` when their speeds differ. A typed speed gives every selected clip that speed; the arrow keys and a drag change each clip from its own speed.
- A typed value outside 25% to 400% stops at the limit.

## Keep the length or the media part

A new speed changes either the clip's length or the part of the media it plays. The chain button next to **Speed** decides which.

| Chain button | The clip keeps | What changes | 2x on a 10-second clip |
| --- | --- | --- | --- |
| Gold (on, the default) | The part of the media it plays, from the same first frame to the same last frame | Its length, rounded to whole frames | It lasts 5 seconds and plays the same 10 seconds of media. |
| Not gold (off) | Its length | How much of the media it plays, from the same first frame | It still lasts 10 seconds and plays 20 seconds of media, if the media is that long. |

- A clip animated with keyframes keeps its motion in step: the keyframes stretch or squeeze with the new length, so at 2x the motion takes half as long. See [Keyframes](keyframes.md#know-what-happens-to-keyframes-when-you-edit-clips).
- With the chain button off, a faster clip can run out of media. It then ends at the last frame of its media, and the message **Limited by the media end** appears.
- The chain button and **Ripple** stay as you set them while the editor is open, for every project and every clip, and are on again when you reload the page. They are not part of the undo history.

## Set the duration in the Speed section

Type a time into **Duration** in the **Speed** section and press <kbd>Enter</kbd>. Times use the same format as the other timecodes: see [Type a clip time](editing-properties.md#type-a-clip-time).

- **Chain button on:** the speed changes so that the same part of the media fills the new length, like a rate stretch of the clip's end. A clip that plays 10 seconds of media and gets the duration `00:04:00` plays at 2.5x.
- **Chain button off, or a freeze frame:** the clip's end is trimmed to the new length, and the speed stays.
- With **Ripple** on, the clips after it move by the change of length. With **Ripple** off, a longer clip stops at the next clip on its track.
- Each typed duration is one step in the history, named **Change duration**.

> **Note:** The **Duration** of the **Clip** section is different: it always trims the clip's end at its speed and never moves other clips. See [Change a clip's name, color and times](editing-properties.md#change-a-clips-name-color-and-times).

## Move later clips with the change (Ripple)

A new speed or duration makes a clip longer or shorter. The **Ripple** switch decides what happens to the clips after it.

**Ripple on (the default).** Every clip after the clip's end moves by the change of length, on every unlocked track: later by as much as a slower clip grows, earlier by as much as a faster clip shrinks. No gap opens, nothing overlaps, and linked clips after it stay in sync.

- A move to the left stops where a clip on another track would overlap the clip before it. The clips then move as far as they can, a gap stays, and the message **Ripple stopped by** followed by the track name (for example **Ripple stopped by V2**) appears.
- Clips on locked tracks never move.

**Ripple off.** No other clip moves.

- A faster clip leaves a gap after it.
- A slower clip stops at the next clip on its track. It gets the speed you asked for but ends earlier, so it plays less of its media, and the message **Shortened at the next clip** appears.

> **Note:** This switch is not the **Ripple mode** toggle of the timeline toolbar. It applies only to speed changes and the **Duration** of the **Speed** section; **Ripple mode** applies to trims you drag. See [Turn Ripple mode on or off](trimming.md#turn-ripple-mode-on-or-off).

## Change the speed of a video and its sound

- **With Linked selection on** (the default), a video and its linked sound get the same speed together, so they keep playing in step. Each keeps its own start and the part of the media it plays, and gets its own length. A video and sound you trimmed apart (a J or L cut) therefore keep their own lengths.
- **When a video and its sound start at different times**, each keeps its start, so after the change they show a red sync number. Right-click the clip and choose **Move into sync** to line them up again. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).
- **With Linked selection off**, or after you <kbd>Alt</kbd>+click one of them, only the selected clip changes, and the video and its sound no longer play at the same speed. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).
- **Sound at another speed** changes pitch: an octave higher at 2x, an octave lower at 0.5x. See [Clips at another speed](audio.md#clips-at-another-speed).

## Know where a speed change stops

When a limit stops a speed or duration change short, a message says why.

| Message | Why | What to do |
| --- | --- | --- |
| **Limited by the media end** | With the chain button off, the clip ran out of media at the new speed and now ends at the media's last frame. Or the clip starts so close to the end of its media that not one frame fits at the new speed: it keeps its speed, while its linked clips still change. | Turn the chain button on, or trim the clip to start earlier in its media. |
| **Shortened at the next clip** | **Ripple** is off, and the slower clip reached the next clip on its track. | Turn **Ripple** on, or move the next clip first. |
| **Ripple stopped by** and a track name | **Ripple** is on, and moving the later clips to the left would make clips on that track overlap. A gap stays. | Close the gap afterwards. See [Close a gap](splitting-and-deleting.md#close-a-gap). |
| **Stopped at the fastest speed**, **Stopped at the slowest speed** | A typed **Duration** with the chain button on would need a speed above 4x or below 0.25x. | None: speeds go from 0.25x to 4x. |
| **Trim stopped at the next clip** | A longer typed **Duration** reached the next clip on the track, with **Ripple** off. | Turn **Ripple** on, or move the next clip first. |
| **Trim stopped at the media end** | A longer typed **Duration** with the chain button off ran out of media. | Turn the chain button on to slow the clip down instead. |

## Hold a frame (freeze frame)

A freeze frame holds one picture of a video for 2 seconds, for example to let a reaction land or to give a title time to be read. Its sound pauses for the hold, and the video then goes on from the same frame.

> **Video placeholder: Freeze a frame**
> - File: `videos/speed-freeze-frames-and-punch-zoom/freeze-frame.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 1080×1920 project at 30 fps with a video with sound on V1 and A1, a second clip after it, and a music clip on A2 that runs under both.
>   2. Step to a frame inside the first video with <kbd>←</kbd> and <kbd>→</kbd>, then press <kbd>Shift</kbd>+<kbd>F</kbd>: the video is cut at the playhead, a 2-second clip with a snowflake badge appears between the two parts, and the rest of V1 and A1 moves 2 seconds later. The music stays where it is.
>   3. **Edit Properties** shows the **Speed** section with **Speed** dimmed at **0.0**, the hint **Freeze frame: one picture held** and **Duration** **00:02:00**.
>   4. Press <kbd>Space</kbd> a little before the freeze: the picture holds for 2 seconds while only the music plays, then the video and its sound go on.
>   5. Type `00:03:00` in **Duration**: the freeze gets 1 second longer, and the clips after it move along.
>   6. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice: the video is one clip again.

1. Move the playhead to the frame you want to hold.
2. Press <kbd>Shift</kbd>+<kbd>F</kbd>, or click **Freeze frame** in the timeline toolbar, the quick actions or the **Speed** section. You can also right-click the video and choose **Freeze frame at playhead**; that row is dimmed unless the clip you right-click is a video under the playhead.

What happens:

- The video is cut at the playhead, and a new 2-second clip holding the frame at the playhead goes between the two parts. Its label bar shows a snowflake badge, and all its thumbnails show the same picture.
- Every clip from the playhead on, on every unlocked track, moves 2 seconds later. This doesn't depend on the **Ripple** switch.
- The video's linked sound is cut too, also with **Linked selection** off, and its second part moves with the video. So the clip's own sound is silent during the hold, and picture and sound go on in sync after it.
- Clips on other tracks that run across the playhead, such as a music bed or a title, are not cut and stay where they are: the music keeps playing under the hold.
- The freeze frame gets the video's name, label color, position, size, angle, crop and opacity. For a video animated with keyframes, it holds the look the video has at the playhead, without keyframes. It is not linked to any sound and not in a group.
- The freeze frame is selected afterwards, so you can change its length right away.
- When the playhead is exactly at the start of a video, nothing is cut: the freeze frame goes right before the video and holds its first frame.
- The hold is 2 seconds at every frame rate: 60 frames at 30 fps.
- The step is named **Freeze frame**, or **Freeze frames** when several videos were frozen.

To find out which video is frozen when several are under the playhead, see [Know which clip a freeze or punch zoom uses](#know-which-clip-a-freeze-or-punch-zoom-uses).

## Change a freeze frame

A freeze frame is a video clip that shows one frame for as long as it lasts. You edit it like other clips, with a few differences:

- **Its length.** Type a new **Duration** in the **Speed** section (with **Ripple** on, the clips after it move along), type **End** or **Duration** in the **Clip** section, or drag either edge on the timeline. A freeze frame has no media limits, like an image clip: it can be as long as you like.
- **Its speed.** **Speed** is dimmed at **0.0**, with the hint **Freeze frame: one picture held**. The speed buttons are dimmed when only freeze frames are selected.
- **The Clip section** shows no **Source in** and **Source out**.
- **Timeline tools.** The **Slip** tool doesn't change a freeze frame, and the **Rate stretch** tool trims it like the **Select** tool. Splitting a freeze frame gives two clips that hold the same frame.
- **Its picture.** Move, resize, rotate and crop it like any video. These changes don't affect the video it came from.

## Punch in at a cut (punch zoom)

A punch zoom cuts a clip at the playhead and enlarges the part after the cut in a quick zoom, so the shot comes closer. It is a quick way to add energy to a talking-head short or to stress a word.

> **Video placeholder: Punch zoom**
> - File: `videos/speed-freeze-frames-and-punch-zoom/punch-zoom.mp4` (not recorded yet)
> - Length: about 35 seconds
> - Shows:
>   1. A 1080×1920 project with a vertical talking-head video with sound on V1 and A1, filling the frame.
>   2. Put the playhead on the first word of a punchline and press <kbd>Shift</kbd>+<kbd>Z</kbd>: the video and its sound are cut at the playhead, and the second part is selected. The **Transform** stopwatch is gold with the count **2**, and **Scale** reads **100.0**.
>   3. In the timeline, press <kbd>→</kbd> six times: **Scale** grows to **120.0**, in big steps first and small ones at the end.
>   4. Press <kbd>Ctrl</kbd>+<kbd>←</kbd> and <kbd>Space</kbd>: at the punchline the face zooms closer in a fraction of a second and lands softly, and the sound plays on without a break.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice: the video is one clip again, at its first size.

1. Move the playhead to the moment the shot should come closer.
2. Press <kbd>Shift</kbd>+<kbd>Z</kbd>, or click **Punch zoom** in the timeline toolbar or the quick actions.

What happens:

- The clip is cut at the playhead, and the part after the cut zooms in until it is 20% larger: its scale is multiplied by 1.2, so 100% becomes 120%, and a landscape video fitted at 56.3% becomes 67.5%.
- The zoom takes 6 frames, at any frame rate (0.2 seconds at 30 fps), with **Ease out**: fast at first, then landing softly. Over those frames a 100% picture shows 100%, 108.4%, 114.1%, 117.5%, 119.3%, 119.9% and 120%. A part shorter than 7 frames reaches 120% on its last frame.
- The zoom is made of two **Transform** keyframes on the part after the cut: one on its first frame, at its own size, and one on its seventh frame, 20% larger. Change them like other keyframes, for example drag the second one further along the clip for a slower zoom, or delete the first one to jump closer at once, right at the cut. See [Keyframes](keyframes.md).
- A part that is already animated with **Transform** keyframes gets 20% larger at once, at every keyframe; its own motion stays.
- The picture grows around its anchor point, the middle of the picture unless you moved it. See [Move the anchor point](arranging-layers-in-the-preview.md#move-the-anchor-point).
- With **Linked selection** on, the linked sound is cut at the same place, like **Split at playhead**. The sound itself doesn't change, and no clip moves.
- The enlarged part is selected afterwards, so you can frame the shot. Because the zoom is animated, a drag in the preview changes the keyframe at the playhead, or adds one: to move the whole shot, drag it on both keyframes, at the cut and 6 frames later (**Next keyframe** in the **Transform** header takes you there). See [Change an animated picture](keyframes.md#change-an-animated-picture).
- A clip that starts exactly at the playhead is not cut: all of it zooms in, from its first frame.
- Punch again further on for another step closer: a second punch zoom gives 144%. The part after the first punch already has keyframes, so the second punch makes it larger at once, without the 6-frame zoom.
- The step is named **Punch zoom**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> gives you back one clip at its first size.

Punch zoom works on video and image clips, and on a text clip you selected.

## Know which clip a freeze or punch zoom uses

Freeze frame and punch zoom act at the playhead:

- **Selected clips first.** They act on the selected clips under the playhead: the selected videos for a freeze frame, the selected video and image clips for a punch zoom. With several such clips under the playhead, on different tracks, each one gets a freeze frame or a punch zoom.
- **Otherwise the top picture.** When no video (for a freeze frame), or no video or image (for a punch zoom), is selected, they act on the top one under the playhead, the one you see in the preview. Only tracks that are targeted, unlocked and not hidden count. See [Choose the tracks your edits use (target)](tracks.md#choose-the-tracks-your-edits-use-target).
- Clips on locked tracks never change.

When there is nothing to act on, a message says why:

| Message | Why | What to do |
| --- | --- | --- |
| **No video under the playhead** | Freeze frame found no video at the playhead: no clip is there, only an image or sound is, or the video's track is not targeted, locked or hidden. | Move the playhead over a video clip, or select one. |
| **No picture under the playhead** | Punch zoom found no video or image clip at the playhead. | Move the playhead over a video or image clip, or select one. |
| **The playhead is not over the selected clip** | The selected clips are not under the playhead. The editor doesn't freeze or zoom another clip instead. | Move the playhead into the selected clip, or clear the selection with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>. |

## Undo a pacing change

Each change is one step in the history. Hover over **Undo** in the app bar to see its name.

| Step name | What made it |
| --- | --- |
| **Change speed** | A speed button, a typed **Speed**, a drag of its label, or a quick series of <kbd>↑</kbd> and <kbd>↓</kbd> presses |
| **Change duration** | A typed **Duration** in the **Speed** section |
| **Freeze frame**, **Freeze frames** | <kbd>Shift</kbd>+<kbd>F</kbd>, a **Freeze frame** button or **Freeze frame at playhead** |
| **Punch zoom** | <kbd>Shift</kbd>+<kbd>Z</kbd> or a **Punch zoom** button |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

- Settings for the length of a new freeze frame (2 seconds), the size of a punch zoom (20%), and a punch zoom that jumps at once instead of zooming over 6 frames are available in a later version.
- Playing a clip backward (reverse) is not available, and the clip menu has no row for it.
- Sound at another speed always changes pitch; keeping the original pitch is not available.

## Related pages
- [Editing properties](editing-properties.md)
- [Keyframes](keyframes.md)
- [Advanced trimming](advanced-trimming.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Linking and grouping clips](links-and-groups.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Audio](audio.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 35, 2026-10-17</sub>
