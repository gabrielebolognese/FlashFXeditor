# Audio

Shorts Editor plays the sound of your edit together with the picture. Use the **Mute** button and the **Master volume** knob under the preview to set how loud you listen, the **M** and **S** toggles in the audio track headers to leave a track out or hear it alone, and the meter at the right edge of the preview to check your levels.

> **Video placeholder: Audio overview**
> - File: `videos/audio/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A project with a video with sound on V1 and A1, and a music file on A2.
>   2. Press <kbd>Space</kbd>: the sound plays with the picture, and the two bars of the meter at the right edge of the Preview panel move.
>   3. Drag the **Master volume** knob down: the sound gets quieter, and the meter bars stay at the same height.
>   4. Click **Mute**: silence, while the meter keeps moving. Click **Unmute**.
>   5. Click **S** in the A2 header: only the music plays. Click **S** again.
>   6. Click **M** in the A1 header: the clip's sound stops. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: it comes back.
>   7. Press <kbd>L</kbd> twice to play at 2x: the sound stops. Press <kbd>K</kbd>.

## In this page
- [Hear your edit](#hear-your-edit)
- [Set the listening volume](#set-the-listening-volume)
- [Mute and solo audio tracks](#mute-and-solo-audio-tracks)
- [Read the audio meter](#read-the-audio-meter)
- [Know how sound is loaded](#know-how-sound-is-loaded)

## Hear your edit

Press <kbd>Space</kbd> to play. You hear every clip on the audio tracks (A1, A2 and so on) under the playhead, mixed together in stereo.

When you insert a video with sound, the picture goes on V1 and the sound becomes a separate audio clip on A1, right under it (see [Add clips from the Media panel](timeline.md#add-clips-from-the-media-panel)). The sound you hear comes from that audio clip; the video clip itself carries only the picture.

### When you hear sound

| You | Sound |
| --- | --- |
| Play with <kbd>Space</kbd>, the **Play** button or <kbd>L</kbd> (1x) | Plays. |
| Play around the playhead with <kbd>Shift</kbd>+<kbd>K</kbd> | Plays. |
| Loop with **Loop playback** on | Plays, and continues across the jump back to the start. |
| Shuttle at 2x, 4x or 8x | Silent. |
| Play backward with <kbd>J</kbd>, at any speed | Silent. |
| Step frames, or drag in the ruler | Silent. |

Hearing sound while you scrub (the **Audio scrub** toggle in the timeline toolbar) is available in a later version.

### Sound and picture stay in sync

Sound and picture run on the same clock, so they stay together for the whole length of your edit. On the development machine, a 5-and-a-half-minute test kept sound and picture less than one frame apart from the first second to the last, with no drift.

- Phone videos store timing information with their sound. The editor reads it, so lips stay in sync with the voice.
- When you start playback, the editor waits until the sound under the playhead is ready (within the usual wait of up to half a second), then starts sound and picture together.

> **Tip:** Wireless (Bluetooth) headphones and speakers add a delay of their own that the editor cannot see. To check lip sync, use wired headphones or the computer's speakers.

### Jump, pause and change things while you listen

- <kbd>Home</kbd>, <kbd>End</kbd> and a timecode typed in the timeline toolbar move the playhead while playback continues. The sound picks up at the new place at once.
- Pausing, jumping and stopping fade the sound out over 10 milliseconds, and new sound fades in just as fast, so you hear no clicks or pops.
- Changes you make while playing are heard at once: muting or soloing a track, **Undo**, inserting a clip.

## Set the listening volume

The **Mute** button (a speaker icon) and the **Master volume** knob sit at the right of the transport bar under the preview, before **Loop playback** and **Fit**.

> **Video placeholder: Set the listening volume**
> - File: `videos/audio/listening-volume.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. Play a clip with sound.
>   2. Point at the **Master volume** knob: the tooltip reads **Master volume: 0.0 dB**.
>   3. Drag up from the knob, then down: the dial turns and the sound gets quieter.
>   4. Hold <kbd>Shift</kbd> and drag a little: the dial turns slowly.
>   5. Double-click the knob: it jumps back to 0.0 dB.
>   6. Click **Mute**: the icon shows a crossed-out speaker and playback goes silent. Click **Unmute**.

### Turn the volume up or down

1. Point at the **Master volume** knob. The tooltip shows the current level, for example **Master volume: -12.0 dB**.
2. Drag up to turn the volume up, or down to turn it down. Hold <kbd>Shift</kbd> while you drag for finer control.
3. Release the mouse button. The sound changes as you drag.

| Control | What it does |
| --- | --- |
| Drag up or down | 150 pixels of mouse travel cover the whole range. |
| <kbd>Shift</kbd>+drag | Five times finer. |
| Double-click | Back to **0.0 dB**. |
| <kbd>↑</kbd> or <kbd>→</kbd>, <kbd>↓</kbd> or <kbd>←</kbd> | 1 dB up or down, when the knob has the keyboard focus. |
| <kbd>Page Up</kbd>, <kbd>Page Down</kbd> | 10 dB up or down, when the knob has the keyboard focus. |
| <kbd>Home</kbd>, <kbd>End</kbd> | -60.0 dB or 0.0 dB, when the knob has the keyboard focus. |

- The range is -60.0 dB to 0.0 dB. **0.0 dB** is the default and the loudest setting: the knob only turns the sound down.
- At -60.0 dB the sound is very quiet, but not silent. For silence, click **Mute**.
- Clicking or dragging the knob does not take the keyboard focus, so <kbd>Space</kbd> and your other shortcuts keep working. To use the keys, press <kbd>Tab</kbd> until the knob is focused. While it has the focus, the arrow keys, <kbd>Home</kbd> and <kbd>End</kbd> change the volume instead of moving the playhead.

### Mute the sound

1. Click **Mute**. The icon shows a crossed-out speaker, the button looks pressed, and its name changes to **Unmute**.
2. Click **Unmute** to hear the sound again, at the level the knob shows.

You can turn the knob while muted; you hear the new level when you unmute.

### What the volume controls change

The **Mute** button and the **Master volume** knob change only what you hear.

- They do not change your project, and they are not steps in the history.
- The meter ignores them: it shows the level of your edit, not of your speakers. See [Read the audio meter](#read-the-audio-meter).
- They are app settings: they apply to every project in this browser and are remembered when you reload the page.

There is no keyboard shortcut for **Mute**.

## Mute and solo audio tracks

Each audio track header has two toggles at the right of the track name: **M** (mute) and **S** (solo). Use them to leave a track out of the mix, or to hear one track on its own.

> **Video placeholder: Mute and solo audio tracks**
> - File: `videos/audio/mute-and-solo.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A project with a voice clip on A1 and a music clip on A2. Press <kbd>Space</kbd> to play.
>   2. Click **M** in the A1 header: the toggle lights up and the voice stops. Click it again: the voice is back.
>   3. Click **S** in the A2 header: only the music plays. Click **S** in the A1 header too: both play.
>   4. Click both **S** toggles off.
>   5. Hover over **Undo** in the app bar: the tooltip reads **Undo Unsolo track**. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice.

| Toggle | Click it to |
| --- | --- |
| **M** | Silence this track. Click again to hear it. |
| **S** | Hear only the soloed tracks. Click again to hear all tracks. |

- A toggle that is on is highlighted. A toggle gets lighter while you point at it.
- Solo several tracks to hear only those.
- A muted track stays silent, even when it is also soloed.
- The toggles work during playback, and you hear the change at once.
- Each click is one step in the history. The **Undo** tooltip names it: **Undo Mute track**, **Undo Unmute track**, **Undo Solo track** or **Undo Unsolo track**.
- Mute and solo are saved with the project.
- The meter follows them: a track you do not hear is not counted in the meter.

Video tracks have no **M** and **S** toggles yet. Muting video tracks, locking and hiding tracks, and changing the volume of a single clip are available in a later version.

## Read the audio meter

The meter is the narrow strip along the right edge of the Preview panel, between the panel header and the transport bar. It has two bars: the left channel and the right channel.

> **Video placeholder: Read the audio meter**
> - File: `videos/audio/audio-meter.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. Play a clip at a moderate level: the two green bars move, and a short line stays at the highest point for a moment, then falls.
>   2. Play two loud tracks together: the bars reach red above the 0 dBFS line, and the two clip lights at the top turn red.
>   3. Pause: the bars fall back and the clip lights stay red.
>   4. Point at the top of the meter: the tooltip reads **Clip indicator: click to reset**. Click: the clip lights turn off.

| Part | What it shows |
| --- | --- |
| Bars | The peak level of each channel: the loudest moment of the sound, from -60 dBFS at the bottom to +6 dBFS at the top. Sound quieter than -60 dBFS shows no bar. |
| Green part of a bar | Level up to 0 dBFS. 0 dBFS (full scale) is the loudest level digital sound can hold. |
| Red part of a bar | Level above 0 dBFS. Sound this loud can distort. |
| Thin line across both bars | The 0 dBFS mark. |
| Short line on each bar (peak hold) | The highest recent peak. It stays for 1.5 seconds, then falls. It is red when it is above 0 dBFS. |
| Clip lights (the two small blocks at the top) | Turn red when a channel goes above 0 dBFS, and stay red until you reset them, also after you pause. |

- The bars rise at once and fall back at 24 dB per second when the sound gets quieter or stops.
- A mono file plays on both channels, so both bars move together.
- The meter measures your edit: all the audio tracks you hear, mixed, with mute and solo applied. It is measured before the master volume and **Mute**, so turning the listening volume down does not move the bars.
- When nothing plays and the bars have fallen back, the meter stays still.

### Reset the clip lights

Click the top row of the meter, where the clip lights are. Its tooltip reads **Clip indicator: click to reset**. Both lights turn off.

> **Tip:** Keep the peaks below 0 dBFS. If the clip lights turn red, check where several loud clips play at the same time: their levels add up. Mute or solo tracks to find the loud one. Changing a clip's volume is available in a later version.

## Know how sound is loaded

The editor decodes sound before it plays it, and analyzes it once after import. Most of the time you do not notice either.

### Analysis after import

After you import an audio file or a video with sound, the editor analyzes its sound in the background, while you are not playing. It saves the result in the project's `cache` folder, so the next time you open the project the analysis is reused. If you delete the `cache` folder, or a media file changes, the editor analyzes the sound again. The waveforms drawn inside audio clips from this analysis are available in a later version.

### Decoding for playback

- The editor decodes the sound of the clips under the playhead, and of the clips that start in the next 2 seconds of playback, before they play.
- When you start playback, it waits up to half a second for the sound under the playhead. If the sound is still not ready, for example a long MP3 or WAV file right after you open the project, the picture starts and the sound joins as soon as it is decoded, with a short fade-in.
- The editor keeps up to 512 MB of decoded sound in memory, over 20 minutes of stereo sound. When your project uses more, the sound that has not played for the longest time is freed and decoded again when it is needed.

| Source | How the sound loads |
| --- | --- |
| Sound in .mp4, .mov, .m4v and .m4a files | Only the sound is read from the file. Files over 10 minutes load in pieces of about 60 seconds as playback reaches them. |
| .mp3, .aac, .wav and .ogg files | The whole file is decoded at once. Files over 1 GB play no sound. |

- Sound with more than two channels, such as 5.1 surround, is mixed down to stereo.
- If the sound of a file cannot be decoded, or its file is missing from the project's `media` folder, its clips play silently. See [Troubleshooting](troubleshooting.md#playback-has-no-sound).

## Related pages
- [Preview and playback](preview-and-playback.md)
- [Timeline](timeline.md)
- [Importing media](importing-media.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 10, 2026-10-15</sub>
