# Removing silence

Cut the pauses out of a talking clip in one click. **Remove silence** finds the parts of a clip's sound that stay quiet and covers them with red stripes on the timeline. Click **Apply** to cut them out and close the gaps, with a short breath left around every word. A video and its sound are cut together, so the lips and the voice stay in sync.

> **Video placeholder: Remove the pauses in a minute**
> - File: `videos/removing-silence/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1080×1920 project with a 30-second talking-head video on V1 and its sound on A1. The speaker pauses several times between sentences.
>   2. Click the video on the timeline. In the quick actions at the top of **Edit Properties**, click **Remove silence** (the dashed scissors): it looks pressed, and the **Remove silence** row opens under the buttons.
>   3. Red stripes cover the pauses on V1 and on A1, and the row reads `8 silences · 10.7 s`.
>   4. Drag the **Threshold** slider from `-40 dB` to `-30 dB`: the stripes grow while you drag, and the count changes. Drag it back to `-40 dB`.
>   5. Click **Apply**: the pauses disappear, the pieces close up, and the message **Removed 8 silences** appears.
>   6. Press <kbd>Home</kbd> and <kbd>Space</kbd>: the speech plays without the dead air, with a short breath at each cut.
>   7. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the single video and its sound are back.

## In this page
- [How Remove silence works](#how-remove-silence-works)
- [Remove the pauses from a clip](#remove-the-pauses-from-a-clip)
- [Read the stripes and the count](#read-the-stripes-and-the-count)
- [Set the threshold, minimum silence and padding](#set-the-threshold-minimum-silence-and-padding)
- [Choose a threshold for your recording](#choose-a-threshold-for-your-recording)
- [Know what Apply changes](#know-what-apply-changes)
- [Remove silence from a video and its sound](#remove-silence-from-a-video-and-its-sound)
- [Remove silence from clips at another speed](#remove-silence-from-clips-at-another-speed)
- [Close the row without cutting](#close-the-row-without-cutting)
- [Messages](#messages)
- [Undo Remove silence](#undo-remove-silence)
- [What is not available yet](#what-is-not-available-yet)

## How Remove silence works

**Remove silence** reads the waveform of the clip's sound, the analysis the editor makes after import (see [Analysis after import](audio.md#analysis-after-import)). It measures the level of the sound every 20 milliseconds and decides what to cut in three steps:

1. **Find the silences.** A stretch that stays at or below the **Threshold** for at least the minimum silence (**Min**) is a silence. Shorter pauses stay, so speech keeps its natural rhythm.
2. **Keep a breath.** At each side of a silence that touches speech, the editor keeps the padding (**Pad**), so no word is clipped and the cuts sound natural. A pause between two words is therefore cut only when it is longer than twice the padding.
3. **Cut on whole frames.** The rest of the silence is cut. Cuts fall on whole frames and are rounded toward the inside of the silence, so a cut never takes a frame of the padding.

A silence at the very start or end of a clip is cut right up to the clip's edge. What stays before the first word, or after the last one, is the padding.

- Only the part of the recording the clip uses counts.
- The editor reads the sound as it was recorded: the clip's **Volume**, its volume keyframes, **Normalize** and **Mute** don't change what counts as silence.
- It is quick: the stripes of a 10-minute recording appear in well under a second.

## Remove the pauses from a clip

1. Select the clip on the timeline: an audio clip, or a video whose sound is a linked audio clip. You can select several clips.
2. Click **Remove silence** (the dashed scissors, after **Mute**) in the quick actions at the top of **Edit Properties**. Its tooltip reads **Remove silence: find the pauses and cut them out**. The button looks pressed, and the **Remove silence** row opens under the quick actions.
3. Wait for the red stripes on the clips. The row counts the silences, for example `8 silences · 10.7 s`.
4. If the stripes don't cover the pauses you want to cut, change **Threshold**, **Min** or **Pad**. The stripes follow at once. See [Set the threshold, minimum silence and padding](#set-the-threshold-minimum-silence-and-padding).
5. Click **Apply** (tooltip **Cut the hatched silences out and close the gaps (one undo step)**).

The striped parts are cut out and the gaps close. The message **Removed 8 silences** ("10.7 s cut out. Undo brings them back.") confirms it, and the row closes. See [Know what Apply changes](#know-what-apply-changes).

- **Remove silence** is dimmed when no selected clip has sound it can cut, for example a title, an image, a video without sound, or a video whose sound is no longer linked to it (select the audio clip itself). Its tooltip then reads **Remove silence: select a clip with sound**. Clips on a locked track are left out.
- While the row is open, you can select other clips: the stripes follow the new selection. Selecting a clip without sound, or clearing the selection, closes the row.
- The stripes need the clip's waveform. When it is not ready yet, for example right after import, the row reads **Reading the waveform…** while the editor makes it, and the stripes appear as soon as it is done.

## Read the stripes and the count

> **Video placeholder: Tune Remove silence**
> - File: `videos/removing-silence/tune.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A talking-head video on V1 and A1, selected, with the **Remove silence** row open and red stripes over its pauses.
>   2. Point at the stripes on A1: they sit over the flat parts of the waveform, with a little unstriped space before and after each word.
>   3. Drag the **Min** label to the right until it reads `1040`: the stripes over the shorter pauses disappear and the count goes down.
>   4. Click in **Min**, type `500` and press <kbd>Enter</kbd>: the stripes are back.
>   5. Type `0` in **Pad** and press <kbd>Enter</kbd>: the stripes widen up to the words. Type `150` and press <kbd>Enter</kbd>.
>   6. Click the **Threshold** slider and press <kbd>→</kbd> twice: the readout shows `-38 dB`.
>   7. Press <kbd>Esc</kbd>: the row closes, the stripes disappear and the clips are unchanged.

- **The stripes.** Each silence that **Apply** would cut is covered with red diagonal stripes on a light red wash, with a thin red line at each end where the cuts fall. A video and its sound show the same stripes.
- **What stays.** The parts without stripes stay, including the padding next to the speech.
- **The count.** The bottom of the row reads `8 silences · 10.7 s`: how many silences **Apply** cuts, and how much time they remove in total, in seconds. A video and its sound cut at the same place count as one silence.
- **No silence found** means that nothing stays under the threshold for the minimum silence. See [Choose a threshold for your recording](#choose-a-threshold-for-your-recording).
- **· reading…** at the end of the count means the editor is still reading the waveform of some of the selected clips. Their stripes appear when it is done.

The stripes are only a preview: nothing in your project changes until you click **Apply**.

## Set the threshold, minimum silence and padding

The **Remove silence** row has three settings:

| Setting | What it does | Range | Default |
| --- | --- | --- | --- |
| **Threshold** (a slider with its value, such as `-40 dB`) | Sound quieter than this counts as silence. Raise it, toward -10 dB, to find more silence in a noisy recording. Lower it to cut only the quietest parts. | -60 to -10 dB, in steps of 1 dB | -40 dB |
| **Min** (in the **Silence** row, **ms**) | The shortest pause that is cut. Shorter pauses stay. | 100 to 5000 ms | 500 ms |
| **Pad** (in the **Silence** row, **ms**) | How much of each pause is kept before and after the speech. | 0 to 1000 ms | 150 ms |

**Change the threshold:** drag the slider. The readout, the stripes and the count follow while you drag. After you click the slider, it has the keyboard:

- <kbd>←</kbd> or <kbd>↓</kbd> lowers it by 1 dB, and <kbd>→</kbd> or <kbd>↑</kbd> raises it by 1 dB.
- <kbd>Home</kbd> goes to -60 dB, and <kbd>End</kbd> to -10 dB.
- These keys don't move the playhead while the slider has the keyboard. Click the timeline to step frames again.

**Change Min or Pad:**

- Click in the field, type a value in milliseconds and press <kbd>Enter</kbd>.
- Press <kbd>↑</kbd> or <kbd>↓</kbd> for 10 ms more or less, or <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> for 100 ms.
- Drag the label (**Min** or **Pad**) left or right: 10 ms per pixel, 100 ms with <kbd>Shift</kbd>, 1 ms with <kbd>Alt</kbd>. The stripes follow while you drag. See [Drag a value](editing-properties.md#drag-a-value).

- Values are whole decibels and milliseconds. A value outside the range stops at its end.
- The editor remembers the values you set, for every project in this browser, and the row opens with them next time. Changing them is not a step in the history.

> **Tip:** To tighten a fast-paced short, lower **Min** so that shorter pauses go too. If the cuts sound abrupt, raise **Pad**. **Pad** `0` removes each pause up to the first and last sound of the words.

## Choose a threshold for your recording

The threshold compares the level of the sound with the loudest level digital sound can hold (0 dBFS).

- **-40 dB**, the default, suits speech recorded in a quiet room: the voice is much louder, and the room noise between sentences is quieter.
- **A noisy recording**, with wind, traffic or an air conditioner, can show no stripes, or too few, at -40 dB. Raise the threshold, for example to -30 dB, until the stripes cover the pauses but not the words.
- **Soft words or breaths under the stripes:** lower the threshold, or raise **Pad**.

> **Note:** The editor reads levels from the clip's waveform, which tells them apart only down to about -42 dB. With a threshold of -42 dB or higher, any sound quieter than about -42 dB counts as silence. With a threshold below -42 dB, only complete digital silence counts, such as a muted microphone or silence added in another app; room noise, however quiet, then counts as sound. The threshold also works in small steps, so two neighboring values, such as -40 and -38 dB, can find the same silences.

## Know what Apply changes

**Apply** cuts the striped parts out of the clips and closes the gaps, in one step.

- **The clips are cut into pieces.** Each clip becomes the pieces between its silences, back to back. Each piece plays the same part of the recording as before, so the speech itself is unchanged. The pieces keep the clip's name, label color, volume, **Mute**, speed and picture settings, and they share out its keyframes, volume keyframes included, so each piece moves and sounds as it did.
- **The gaps close.** The pieces move left to close up, and the later clips on the track move with them, as with **Ripple delete** (see [Ripple delete clips](splitting-and-deleting.md#ripple-delete-clips)).
- **Other tracks follow.** Clips after a cut on the other tracks, such as a title or a sound effect, move left too, so they stay with the speech. A clip that runs across a silence, such as music under the whole video, stays where it is. Clips on locked tracks never move. See [How other tracks follow a ripple](splitting-and-deleting.md#how-other-tracks-follow-a-ripple).
- **When a clip can't follow.** If a clip on another track would run into the clip before it, the gaps close only as far as it can follow, and the message **Some gaps stayed open** names it, for example: "The silences are cut out, but Music on A2 can't move further left without overlapping."
- **Fades and transitions.** A fade or transition at the clip's start or end stays on the first or last piece. The new cuts are straight cuts, with no fade. When the silence at the clip's start or end is cut, the fade or transition there goes with it.
- **Links and selection.** Each piece of a video stays linked to the piece of its sound between the same cuts. The pieces of the clips you selected are selected afterwards.
- Playback, **Audio scrub** and the preview follow the new cuts at once.

> **Tip:** Remove the silence before you add titles, captions and music. A title, a caption or a music clip that runs across a silence keeps its place and length, so it can end up out of step with the words after the cut. Transcribe after you remove the silence, so the captions follow the new timing. See [Transcription](transcription.md).

## Remove silence from a video and its sound

- **Select either one.** With a video selected, **Remove silence** reads the sound of the audio clip linked to it. The video and its sound are cut at the same frames and close the same gaps, so they stay in sync, also with **Linked selection** off.
- **Two sound clips on one video**, such as the camera's sound and a second microphone linked to the same video: with the video selected, the cuts fall only where both are silent. If you select only one of the sound clips (with **Linked selection** off), the video and the other sound clip are cut where the selected one is silent.
- **J and L cuts.** Where the sound starts before the picture or runs on after it, that part is never cut: the cuts stay inside the frames the video and its sound share.
- **Locked tracks.** A clip whose video or sound is on a locked track is left out, because cutting only one of them would break sync. Unlock the track first. See [Lock a track](tracks.md#lock-a-track).
- **Several clips.** Each selected clip, or each video with its sound, gets its own cuts, and the count adds them up.

See [Linking and grouping clips](links-and-groups.md).

## Remove silence from clips at another speed

**Min** and **Pad** count as the clip plays, not as it was recorded. At 2x, a 1-second pause in the recording plays in half a second, so it is cut when **Min** is 500 ms or less, and **Pad** keeps 150 ms of playback on each side (300 ms of the recording). See [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md).

## Close the row without cutting

- Click **Cancel**, press <kbd>Esc</kbd>, or click **Remove silence** again (its tooltip reads **Remove silence: close the parameter row** while the row is open).
- The row also closes when you select something without sound, clear the selection, or open another project.

The stripes disappear and nothing in the project changes. The values you set stay remembered.

- When **Min** or **Pad** has the keyboard, the first <kbd>Esc</kbd> leaves the field. Press <kbd>Esc</kbd> again to close the row.
- <kbd>Esc</kbd> first cancels a drag in progress, finishes a text you are editing and leaves crop mode. See [Keyboard shortcuts](keyboard-shortcuts.md#remove-silence-row).

## Messages

| Message | What it means | What to do |
| --- | --- | --- |
| **Removed 8 silences** ("10.7 s cut out. Undo brings them back.") | **Apply** cut the silences out and closed the gaps. | Nothing. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo it. |
| **Still analysing** ("Remove silence is reading the waveform. Apply again in a moment.") | You clicked **Apply** before the editor finished reading the waveform. Nothing was cut. | Wait until the count no longer reads **Reading the waveform…** or **reading…**, then click **Apply** again. |
| **No silence to remove** ("Nothing stays under the threshold for the minimum silence. Raise the threshold or shorten the minimum silence.") | You clicked **Apply** with no stripes. The row stays open. | Raise **Threshold** or lower **Min**. See [Choose a threshold for your recording](#choose-a-threshold-for-your-recording). |
| **Some gaps stayed open** ("The silences are cut out, but Music on A2 can't move further left without overlapping.") | The silences are cut out, but the clip it names stopped some gaps from closing all the way. | Move or trim that clip, then close the gaps that are left. See [Close a gap](splitting-and-deleting.md#close-a-gap). |

## Undo Remove silence

**Apply** is one step in the history, named **Remove silence**. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: the original clips are back, uncut and in their places, and the clips on the other tracks move back. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> cuts them again.

Opening and closing the row, the stripes and the values you set are not steps in the history. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- A default keyboard shortcut for **Remove silence**. You can give it a key yourself in **Settings** > **Shortcuts**; see [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).
- The **Remove silence** values in the app settings: set them in the row.
- Exporting your video: only **Export frame** works.

## Related pages
- [Editing audio](audio-editing.md)
- [Audio](audio.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Linking and grouping clips](links-and-groups.md)
- [Editing properties](editing-properties.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Transcription](transcription.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#remove-silence-row)
- [Troubleshooting](troubleshooting.md#removing-silence)

<sub>Last updated: Batch 40, 2026-10-18</sub>
