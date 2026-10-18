# Editing audio

Shape the sound of your clips. Set each clip's volume. Make the volume rise and fall over time with the rubber band on the timeline. Bring a quiet clip up to a safe peak with **Normalize**, lower the music under your voice-over with **Auto-duck**, and mute a single clip. You can also give a video's sound a clip of its own, and hear your cuts while you scrub with **Audio scrub**. Unlike the listening volume under the preview, these changes are part of your project. To cut the pauses out of a talking clip, see [Removing silence](removing-silence.md).

> **Video placeholder: Edit audio in a minute**
> - File: `videos/audio-editing/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows:
>   1. A 1080×1920 project with a video on V1, three voice-over clips on A1 with pauses between them, and a music clip on A2 under the whole video. Both audio tracks are at height M.
>   2. Point at the music clip: a white line runs across it and turns gold under the pointer. Drag it down until the tooltip reads `-6.0 dB`: the line and the waveform go down.
>   3. Click the music clip. Scroll **Edit Properties** to the **Audio** section: **Volume** reads **-6.0**. Click **Auto-duck**: the line dips under each voice-over clip on A1.
>   4. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the music gets quieter whenever the voice-over speaks, and comes back up in the pauses. Pause.
>   5. Click the first voice-over clip and click **Normalize**: **Volume** jumps up and the waveform grows.
>   6. Hold <kbd>Ctrl</kbd> and click that clip's line twice near its end: two diamonds appear. Drag the second diamond down: the voice goes down at the end.
>   7. Click **Audio scrub** in the timeline toolbar and drag in the ruler across a cut: short bits of sound follow the playhead.

## In this page
- [Know what you can change](#know-what-you-can-change)
- [Find the Audio section](#find-the-audio-section)
- [Change a clip's volume](#change-a-clips-volume)
- [Read the rubber band](#read-the-rubber-band)
- [Make the volume change over time](#make-the-volume-change-over-time)
- [Edit volume keyframes on the rubber band](#edit-volume-keyframes-on-the-rubber-band)
- [Normalize a clip](#normalize-a-clip)
- [Lower music under voices with Auto-duck](#lower-music-under-voices-with-auto-duck)
- [Mute a clip](#mute-a-clip)
- [Fade a clip's sound in the Audio section](#fade-a-clips-sound-in-the-audio-section)
- [Give a video's sound a clip of its own](#give-a-videos-sound-a-clip-of-its-own)
- [Hear cuts while you scrub](#hear-cuts-while-you-scrub)
- [Know what edits do to the volume](#know-what-edits-do-to-the-volume)
- [Undo audio changes](#undo-audio-changes)
- [What is not available yet](#what-is-not-available-yet)

## Know what you can change

Every audio clip has its own volume, in decibels (dB):

- **0 dB** plays the sound as it was recorded. This is where every new clip starts.
- The range is **-60 dB** to **+12 dB**. Every 6 dB doubles or halves the level of the sound: +6 dB is twice the level, -6 dB half of it. At -60 dB the sound is barely audible.
- With volume keyframes, the volume changes over time. See [Make the volume change over time](#make-the-volume-change-over-time).

The clip's volume, its keyframes, its fades and **Mute** change everything that uses your project's sound: playback, the audio meter, **Audio scrub** and transcription. The listening volume (the **Master volume** knob and the **Mute** button under the preview) is separate: it only changes what you hear on this computer. See [Set the listening volume](audio.md#set-the-listening-volume).

**A video's sound is its audio clip.** When you add a video with sound, its sound becomes a linked audio clip on an audio track (see [Hear your edit](audio.md#hear-your-edit)). Select either clip to edit the sound: with a video selected, the **Audio** section, **Mute**, **Normalize** and **Auto-duck** work on the audio clip linked to it. This also works when you selected the video alone, with <kbd>Alt</kbd>+click or with **Linked selection** off.

> **Tip:** A volume above 0 dB can push the sound over 0 dBFS, where it may distort. Watch the clip lights of the audio meter while you play. See [Read the audio meter](audio.md#read-the-audio-meter).

## Find the Audio section

Select one or more audio clips, or a video with sound, on the timeline. **Edit Properties** shows the **Audio** section, the last section of the panel, after **Speed**.

| Row | What it does |
| --- | --- |
| **Ease** | Shown while the volume has keyframes: the easing of the keyframe at the playhead. See [Make the volume change over time](#make-the-volume-change-over-time). |
| **Volume** (a speaker icon, **dB**) | The clip's volume, from -60.0 to +12.0 dB, with one decimal. See [Change a clip's volume](#change-a-clips-volume). |
| **Mute** | A switch that silences the clip. See [Mute a clip](#mute-a-clip). |
| **Fades** | The fade in (a rising arrow) and the fade out (a falling arrow) of the sound, in frames (**f**). See [Fade a clip's sound in the Audio section](#fade-a-clips-sound-in-the-audio-section). |
| **Actions** | **Normalize**, **Auto-duck** and **Detach audio**. See [Normalize a clip](#normalize-a-clip), [Lower music under voices with Auto-duck](#lower-music-under-voices-with-auto-duck) and [Give a video's sound a clip of its own](#give-a-videos-sound-a-clip-of-its-own). |

The section header holds the **Volume** stopwatch at its right end, for keyframes.

- The section edits the selected audio clips and the audio clips linked to the selected videos. With several clips, a field whose clips have different values shows `--`; a value you type applies to all of them.
- **Detach audio** shows only when a selected video has sound it can detach. A video with sound but no audio clip shows the **Audio** section with **Detach audio** only.
- Clips on a locked track are left out.

## Change a clip's volume

Use the **Volume** field, or drag the line across the clip on the timeline.

**In Edit Properties:**

1. Select the clip.
2. In the **Audio** section, click in **Volume**, type a value such as `-6`, and press <kbd>Enter</kbd>.

- Press <kbd>↑</kbd> or <kbd>↓</kbd> for 1 dB more or less, and <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> for 10 dB. Presses less than 0.3 seconds apart are one step in the history.
- Drag the speaker icon left or right to change the value: 1 dB per pixel, 10 dB with <kbd>Shift</kbd>, 0.1 dB with <kbd>Alt</kbd>. The field counts along while you drag; the sound, the waveform and the line on the timeline change when you release. See [Drag a value](editing-properties.md#drag-a-value).
- A value outside the range stops at -60.0 or +12.0.
- With several clips selected, an arrow press or a drag adds the same amount to each clip's own volume. A typed value gives them all the same volume.

**On the timeline:**

1. Point at the white line across an audio clip on an M or L track. It turns gold, and the cursor becomes an up-down arrow.
2. Drag up to make the clip louder, or down to make it quieter. The tooltip shows the volume, for example `-6.4 dB`, and the waveform follows.
3. Release. The clip's volume is set, in steps of 0.1 dB.

Press <kbd>Esc</kbd> before you release to cancel. Each change is one step, named **Change volume**.

## Read the rubber band

The white line across an audio clip is its rubber band: it shows the clip's volume along the clip.

> **Video placeholder: The rubber band**
> - File: `videos/audio-editing/rubber-band.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A voice clip on A1 at height M. Point at its white line: it turns gold.
>   2. Hold <kbd>Ctrl</kbd> and click the line at three places: three white diamonds appear on it, and the playhead jumps to each one.
>   3. Drag the middle diamond down until the tooltip reads `-20.0 dB · 00:04:00`: the line dips through it and the waveform shrinks around it.
>   4. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the sound goes down smoothly and comes back up, with no clicks.
>   5. Drag the line between the second and third diamonds up: both diamonds move together.
>   6. Right-click the middle diamond and choose **Ease in-out**. Click the last diamond and press <kbd>Delete</kbd>.

- **Where it shows.** On every audio clip of an audio track at height M or L, over the waveform. S tracks show only the label bar, so there is no rubber band there; make the track taller to use it. See [Change track height](tracks.md#change-track-height).
- **The scale.** The top of the clip's body is +12 dB and the bottom is -60 dB. 0 dB sits at about 60% of the height, a little above the middle. Like a fader on a mixing desk, the scale is finer near 0 dB and coarser toward the bottom.
- **Keyframes.** Each volume keyframe is a white diamond on the line, and the line follows the volume from one diamond to the next, with their easing. Selected diamonds are gold. Diamonds are hidden on clips narrower than 24 pixels: zoom in to see them.
- **The waveform follows the volume.** A louder clip has a taller waveform (up to the full height of the body), a quieter clip a shorter one. With keyframes, the waveform follows the curve. See [Read a waveform](clip-thumbnails-and-waveforms.md#read-a-waveform).
- **Where you can grab it.** The line reacts within 4 pixels above and below it, with the **Select** tool, on unlocked tracks. The edges of the clip (for trimming), the fade handles in its top corners, transition blocks and cuts come first: near the ends of a clip, a drag trims or fades. Zoom in to reach the line there. A diamond comes before the clip's edge, so a keyframe at the very start or end can still be grabbed.
- **The cursor.** An up-down arrow over the line, a hand over a diamond, and a plus sign over the line while you hold <kbd>Ctrl</kbd>.

## Make the volume change over time

Volume keyframes let a clip get louder or quieter while it plays: fade the music down for a sentence, or bring up a quiet word. A volume keyframe stores the volume at one frame of the clip, and the editor moves the volume smoothly from one keyframe to the next. Before the first keyframe the clip plays at the first keyframe's volume, and after the last one at the last keyframe's volume.

**Add keyframes on the rubber band:**

1. Hold <kbd>Ctrl</kbd> and click the line where the change should start. A diamond appears there, with the volume the line has at that frame. It is selected, and the playhead moves to it.
2. <kbd>Ctrl</kbd>+click where the change should end.
3. Drag one of the diamonds, or the line between them, up or down.

**Or use the Volume stopwatch:**

1. Select the clip and put the playhead where the change should start.
2. Click the stopwatch at the right of the **Audio** header (tooltip **Animate volume**). It turns gold, and the clip gets a keyframe at the playhead with its current volume.
3. Move the playhead and change **Volume**: each change writes a keyframe at the playhead, or updates the keyframe that is there.

Both ways make the same keyframes: the diamonds on the rubber band are the keyframes of the stopwatch.

While the clip has volume keyframes:

- The **Audio** header shows **Previous keyframe**, **Add keyframe** (**Remove keyframe** when the playhead is on a keyframe), **Next keyframe** and the number of keyframes, left of the stopwatch.
- **Volume** shows the volume at the playhead and follows the playhead while you play or scrub.
- The **Ease** row, the first row of the section, sets how the volume travels from the keyframe at the playhead to the next one: **Linear**, **Ease in**, **Ease out**, **Ease in-out**, **Hold**, **Smooth**, **Snap** or **Overshoot**. New keyframes are **Linear**. See [Choose the easing](keyframes.md#choose-the-easing).
- To stop, click the gold stopwatch (tooltip **Stop animating volume (removes its keyframes)**). Every volume keyframe goes, and the clip keeps the volume it has at the playhead, on every frame.

> **Note:** Volume keyframes go on audio clips. To change the volume of a video's sound over time, select the video or its sound: the keyframes go on the audio clip. Audio tracks have no keyframe lane: the rubber band is where volume keyframes show.

The playback follows the keyframes smoothly, with no steps or clicks, and you hear changes at once, also while you play.

## Edit volume keyframes on the rubber band

These work with the **Select** tool, on audio clips of M and L tracks:

| Do this | What happens |
| --- | --- |
| <kbd>Ctrl</kbd>+click the line | Adds a keyframe at that frame, with the volume the line has there. The new keyframe is selected, and the playhead moves to it. |
| Click a diamond | Selects that keyframe (gold) and its clip, and moves the playhead to it, so **Volume** shows its value. |
| <kbd>Shift</kbd>+click a diamond | Adds the keyframe to the selection, or removes it. |
| Drag a diamond | Moves the keyframe up or down (its volume, in steps of 0.1 dB) and left or right (its frame). The tooltip shows both, for example `-20.0 dB · 00:04:00`. |
| <kbd>Shift</kbd> while you drag a diamond | Keeps the keyframe on its frame: only its volume changes. |
| Drag one of several selected diamonds | Moves the volume of all the selected keyframes by the same amount. They stay on their frames. |
| Drag the line between two diamonds | Moves both diamonds up or down together. Before the first diamond or after the last one, the drag moves that diamond. |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Deletes the selected keyframes. The clip stays. |
| Right-click a diamond | Opens the keyframe menu. |
| <kbd>Esc</kbd> before you release | Cancels the drag. |

- A keyframe moves only between its neighbors and inside the clip: the drag stops one frame before the next keyframe.
- Rubber band drags don't snap.
- A click on the line without dragging selects the clip, like a click on its body.
- Click anywhere else on the timeline or in the preview to deselect the keyframes. <kbd>Delete</kbd> then deletes clips again.

**The keyframe menu** of a diamond has the same rows as on a keyframe lane: **Easing** with the eight easings (the right-clicked keyframe's easing is gold), **Delete keyframe** or **Delete keyframes**, **Copy keyframe** or **Copy keyframes**, and **Paste keyframes**. When the diamond is selected, the menu acts on all the selected keyframes. See [Use the keyframe menu](keyframes.md#use-the-keyframe-menu).

**Copy a volume shape to another clip:** select the diamonds and press <kbd>Ctrl</kbd>+<kbd>C</kbd>, or right-click one and choose **Copy keyframes**. Select the other audio clip, put the playhead where the first keyframe should go, and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. Or right-click a diamond on its rubber band and choose **Paste keyframes**; the menu needs a diamond to right-click, so <kbd>Ctrl</kbd>+click the line first. **Paste keyframes** is dimmed until you copy volume keyframes. See [Copy keyframes to another clip](keyframes.md#copy-keyframes-to-another-clip).

The steps are named **Add keyframe**, **Move volume keyframe** or **Move volume keyframes**, and **Delete keyframe** or **Delete keyframes**.

## Normalize a clip

**Normalize** sets a clip's volume so that its loudest moment reaches -1 dBFS, just under 0 dBFS, the loudest level digital sound can hold. Use it to bring a quiet recording up to a strong, safe level, or to give several clips the same peak.

> **Video placeholder: Normalize and Auto-duck**
> - File: `videos/audio-editing/normalize-auto-duck.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. Two quiet voice clips on A1 with a pause between them, and a music clip on A2 under both, all at height M.
>   2. Click the first voice clip. In the **Audio** section, click **Normalize**: **Volume** jumps to a positive value and the waveform grows.
>   3. Press <kbd>Space</kbd>: the meter's peak line stays just under the 0 dBFS mark. Pause.
>   4. Click the music clip and click **Auto-duck**: the music's line dips under each voice clip, with sloped sides.
>   5. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the music gets quieter whenever the voice speaks.
>   6. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, right-click the A2 header and choose **Auto-duck music**: the same dips appear.

1. Select one or more audio clips, or videos with sound.
2. Click **Normalize** in the **Actions** row of the **Audio** section, or right-click a clip and choose **Normalize**.

- **Volume** changes to the value that brings the clip's peak to -1 dBFS, for example +11.0 dB for a clip whose loudest moment is at -12 dBFS. Playing the clip alone, the meter peaks at -1 dBFS.
- Only the part of the sound the clip uses counts: a trimmed clip is normalized for what it plays.
- Each selected clip gets its own volume.
- A clip with volume keyframes keeps its shape: every keyframe moves up or down by the same amount, so the loudest moment of the curve reaches -1 dBFS.
- Fades are not counted: they only make the sound quieter.
- The volume stops at +12 dB, so a very quiet clip can stay below -1 dBFS.
- Clicking **Normalize** again changes nothing: the clip is already there.
- The step is named **Normalize clip** or **Normalize clips**.

**Normalize** works from the clip's waveform, which the editor makes in the background after import. If it is not ready yet, the message **The waveform is still loading** appears ("Normalize again in a moment: it needs the clip's peaks."), and the editor makes that waveform first. When the waveform appears in the clip, click **Normalize** again. A silent clip gives the message **Nothing to normalize** ("The clip is silent.").

> **Note:** Normalize sets each clip's own peak. When several clips play at the same time, their levels add up, so the mix can still go over 0 dBFS. Check the meter's clip lights while you play.

## Lower music under voices with Auto-duck

**Auto-duck** lowers a music clip wherever someone speaks: it adds volume keyframes that bring the music down, by 12 dB unless you changed it, under every audio clip on the audio tracks above it, and back up in between.

1. Put the voice on an upper audio track, for example A1, and the music on a lower one, for example A2. A1 is the audio track right under the video tracks; A2 is below it.
2. Select the music clip, then click **Auto-duck** in the **Actions** row of the **Audio** section. You can also right-click the music clip and choose **Auto-duck music**, or right-click the header of the music track and choose **Auto-duck music** to duck every clip on that track.

The music's rubber band now dips under each voice clip:

- The music starts going down 10 frames before a voice clip starts, is 12 dB lower while the voice plays, and comes back up over the 10 frames after the voice clip ends. The slopes are straight.
- Voice clips 20 frames apart or closer (two slopes) share one dip, so the music doesn't jump up in short pauses.
- The dip is measured from the music's own volume: a music clip at -6 dB goes down to -18 dB. Keyframes the music already has are kept, and lowered where they fall under a voice.
- Slopes stop at the ends of the music clip.
- The keyframes are ordinary volume keyframes: drag them on the rubber band to adjust a dip, or delete the ones you don't want.
- With several music clips selected, each one is ducked.
- The step is named **Auto-duck music**. To try again, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> first: a second **Auto-duck** lowers the music by another 12 dB under the voices.
- To duck deeper or more gently, set **Duck depth** (1 to 60 dB) and **Duck ramps** (0 to 120 frames) in **Settings** > **General** > **Audio**. Voices closer than two ramps then share one dip. See [Set the audio defaults](settings.md#set-the-audio-defaults).

**What counts as a voice:** any audio clip on an audio track above the music's track, such as a voice-over, an interview or a sound effect, as long as it is turned on and not muted, on a track that is not muted. Clips on tracks below the music's track don't count. When no such clip plays during the music, the message **No voice to duck under** appears ("Auto-duck lowers a music clip where audio clips play on the tracks above it."), and nothing changes.

> **Tip:** At 30 fps, 10 frames is a third of a second. Use **Ease in-out** in the keyframe menu on the dip's keyframes for softer slopes.

## Mute a clip

Mute silences one clip and leaves the others playing. Use it to drop a clip's sound for a moment without deleting it.

1. Select one or more audio clips, or videos with sound.
2. Do one of these:
   - Click **Mute** (a crossed-out speaker) in the quick actions at the top of **Edit Properties**.
   - Turn on the **Mute** switch in the **Audio** section.
   - Right-click a clip and choose **Mute**.

- The clip is silent in playback, in **Audio scrub** and in transcription. On the timeline, it is drawn faded and covered with diagonal lines, like a clip you turned off.
- A muted video keeps its picture: only its sound is muted.
- While all the selected sound is muted, the **Mute** quick action looks pressed and is named **Unmute**, the clip menu row reads **Unmute**, and the switch is on. Click again to hear the clip. When only some of the selected clips are muted, the switch shows a mixed state, and a click mutes them all.
- **Auto-duck** ignores muted clips as voices.
- Each click is one step, named **Mute clip**, **Mute clips**, **Unmute clip** or **Unmute clips**. Mute is saved with the project.
- The **Mute** quick action is dimmed when no selected clip has sound to mute.

| To silence | Use |
| --- | --- |
| One clip's sound | **Mute** for the clip (this section). |
| A whole audio track | **M** in the track header. See [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks). |
| A clip's picture and sound | **Disable**. See [Turn a clip off](editing-properties.md#turn-a-clip-off). |
| What you hear, without changing the project | The **Mute** button under the preview. See [Set the listening volume](audio.md#set-the-listening-volume). |

## Fade a clip's sound in the Audio section

The **Fades** row of the **Audio** section holds two fields, in frames (**f**): the fade in (a rising arrow) and the fade out (a falling arrow).

1. Select the audio clip, or the video whose sound you want to fade.
2. Type the length of the fade in frames, for example `15` for half a second at 30 fps, and press <kbd>Enter</kbd>. Type `0` to remove a fade.

- These are the same fades as the fade handles in the top corners of the audio clip on the timeline. See [Fade a clip with the fade handles](fades-and-transitions.md#fade-a-clip-with-the-fade-handles).
- With a video selected, the fields fade only its sound. To fade the picture too, use **Fade in 0.5 s** and **Fade out 0.5 s**. See [Fade a clip and its sound with one click](fades-and-transitions.md#fade-a-clip-and-its-sound-with-one-click).
- A fade in and a fade out never overlap: a longer value stops at what the clip can take.
- Arrow presses less than 0.3 seconds apart are one step. A drag of the arrow icon counts along in the field and applies when you release.
- The steps are named **Fade in** and **Fade out**.

## Give a video's sound a clip of its own

**Detach audio** turns a video's sound into an audio clip you edit on its own.

1. Select one or more videos with sound.
2. Click **Detach audio** in the **Actions** row of the **Audio** section, or right-click the video and choose **Detach audio**.

What happens depends on the video:

| The video | Detach audio |
| --- | --- |
| Has its sound as a linked audio clip (the usual case) | Unlinks the two: the chain icons disappear from both label bars, and the sound stays where it is on its audio track. |
| Has sound, but no audio clip (for example, you deleted its sound clip after unlinking it) | Adds an audio clip with the video's sound right under it, with the same start, length, speed and part of the media, on the first audio track that is free for the whole length, or on a new audio track at the bottom. The new clip is not linked to the video. |

- The detached sound is selected afterwards, so your next edit works on it.
- After detaching, moving, trimming or deleting the video no longer changes the sound. See [Unlink clips](links-and-groups.md#unlink-clips).
- **Detach audio** is not shown in the **Audio** section, and is dimmed in the clip menu, when no selected video has sound to detach: for example a video without sound, or an audio clip alone. Videos on locked tracks are left out, and so is a video whose linked sound is on a locked track.
- The step is named **Detach audio**.

## Hear cuts while you scrub

With **Audio scrub** on, you hear short bits of sound while you drag the playhead or step frames, so you can find a cut, a word or a beat by ear.

> **Video placeholder: Audio scrub**
> - File: `videos/audio-editing/audio-scrub.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. A voice clip and a music clip end to end on A1.
>   2. Click **Audio scrub** (the waveform icon) in the timeline toolbar: it turns gold.
>   3. Drag slowly in the ruler across the cut: short bits of voice follow the playhead, then the music takes over at the cut.
>   4. Press <kbd>→</kbd> a few times: each step plays a short bit.
>   5. Press <kbd>Alt</kbd>+<kbd>S</kbd>: **Audio scrub** is no longer gold. Drag in the ruler: silence.

1. Click **Audio scrub** (a waveform icon) in the toggles of the timeline toolbar, after **Show clip keyframes**, or press <kbd>Alt</kbd>+<kbd>S</kbd> in any panel. It is gold while it is on.
2. Click or drag in the ruler, or step frames with <kbd>←</kbd> and <kbd>→</kbd> (also with <kbd>Shift</kbd> for 5 frames or <kbd>Ctrl</kbd> for a second), or with <kbd>K</kbd>+<kbd>J</kbd> and <kbd>K</kbd>+<kbd>L</kbd>.

- Each frame the playhead shows plays a 40-millisecond bit of the sound at that point. Holding an arrow key plays a bit at every step.
- You hear what playback would play there: every audio track you hear (mute and solo apply), each clip at its volume, keyframes and fades, and at the clip's speed. The meter moves with it.
- Each bit rises and falls in 4 milliseconds and takes over smoothly from the one before, so there are no clicks, also when you scrub fast.
- Other jumps of the playhead, such as <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>↑</kbd>, <kbd>↓</kbd> or a typed timecode, stay silent. While the timeline plays, playback has its own sound and **Audio scrub** stays quiet.
- Only sound the editor has already decoded plays. The first time you scrub over a clip whose sound is not loaded yet, the first bits can be silent while it loads.
- **Audio scrub** is not a step in the history. Its key is <kbd>Alt</kbd>+<kbd>S</kbd> (<kbd>⌥</kbd>+<kbd>S</kbd> on a Mac); <kbd>Shift</kbd>+<kbd>S</kbd> is **Linked selection**. The project remembers it when you open it again.

## Know what edits do to the volume

The volume, **Mute** and the volume keyframes belong to the clip:

| Edit | What happens |
| --- | --- |
| Move a clip | Its volume and keyframes move with it. |
| Split a clip | Both parts keep the volume. Each part keeps its share of the keyframes, so the volume plays as it did. |
| Trim the start, or slip the clip | Keyframes stay on the same moment of the sound, so a dip stays under the word it was made for. |
| Trim the end | Keyframes after the new end stay with the clip, hidden, and come back when you lengthen it. |
| Change the speed, or **Rate stretch** | Keyframes stretch or squeeze with the clip's new length. |
| Duplicate, or copy and paste the clip | The copy gets the same volume, **Mute** and keyframes. |
| **Paste attributes** with **Audio gain** | The clip gets the copied clip's volume and **Mute**, with its volume keyframes while **Keyframes** is checked. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes). |
| **Detach audio** | The audio clip keeps its volume and keyframes. |

See [Know what happens to keyframes when you edit clips](keyframes.md#know-what-happens-to-keyframes-when-you-edit-clips).

## Undo audio changes

Each change is one step in the history. Hover over **Undo** in the app bar to see its name:

| Step name | What made it |
| --- | --- |
| **Change volume** | **Volume**, or a drag of the line of a clip without keyframes |
| **Mute clip**, **Mute clips**, **Unmute clip**, **Unmute clips** | **Mute** in the quick actions, the **Audio** section or the clip menu |
| **Fade in**, **Fade out** | The **Fades** fields |
| **Normalize clip**, **Normalize clips** | **Normalize** |
| **Auto-duck music** | **Auto-duck**, or **Auto-duck music** in the clip or track menu |
| **Detach audio** | **Detach audio** |
| **Animate volume**, **Remove volume keyframes** | The **Volume** stopwatch |
| **Add keyframe**, **Remove keyframe** | <kbd>Ctrl</kbd>+click on the line, or **Add keyframe** and **Remove keyframe** in the **Audio** header |
| **Move volume keyframe**, **Move volume keyframes** | Dragging diamonds, or the line between them |
| **Delete keyframe**, **Delete keyframes** | <kbd>Delete</kbd> with keyframes selected, or the keyframe menu |
| **Change keyframe easing**, **Paste keyframes** | **Ease**, the keyframe menu, or <kbd>Ctrl</kbd>+<kbd>V</kbd> with volume keyframes copied |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- Exporting your video with its sound: only **Export frame** works.
- Audio effects.

## Related pages
- [Audio](audio.md)
- [Removing silence](removing-silence.md)
- [Fades and transitions](fades-and-transitions.md)
- [Keyframes](keyframes.md)
- [Editing properties](editing-properties.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Linking and grouping clips](links-and-groups.md)
- [Tracks](tracks.md)
- [Transcription](transcription.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#audio)
- [Troubleshooting](troubleshooting.md#audio-editing)

<sub>Last updated: Batch 42, 2026-10-18</sub>
