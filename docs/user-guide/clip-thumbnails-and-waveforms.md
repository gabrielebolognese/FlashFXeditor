# Clip thumbnails, waveforms and badges

Clips on the timeline show what is in them: video clips show a strip of thumbnails, audio clips show their waveform, image clips show their picture (or the frames of an animation), solids show a swatch of their shape and color, and text clips show their text. Small badges in each clip's label bar tell you about its speed, its link and its sync, mark freeze frames and animated text, and warn about missing fonts. Use them to find a shot, a cut point or a loud moment without playing the timeline.

> **Video placeholder: Thumbnails, waveforms and badges**
> - File: `videos/clip-thumbnails-and-waveforms/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: a project with a video with sound on V1 and A1, a PNG on V2 and a music clip on A2, all tracks at height M; point at the thumbnails in the video clip, the waveforms in the two audio clips and the repeated picture in the image clip; point at the chain icon in the label bar of the video and of its sound; click the rows icon in the V1 header until the track is S: the thumbnails disappear and only the label bar is left; click it again twice to reach L: taller thumbnails; press <kbd>\\</kbd> to fit, then hold <kbd>Ctrl</kbd> and roll the wheel over the video clip: the thumbnails get closer together; zoom out until the clip is narrow: the thumbnails disappear while the waveform below stays.

## In this page
- [Read a clip](#read-a-clip)
- [Show thumbnails and waveforms](#show-thumbnails-and-waveforms)
- [See more frames by zooming in](#see-more-frames-by-zooming-in)
- [Read a waveform](#read-a-waveform)
- [Read the badges in the label bar](#read-the-badges-in-the-label-bar)
- [Know when thumbnails and waveforms appear](#know-when-thumbnails-and-waveforms-appear)
- [Combine label colors with thumbnails](#combine-label-colors-with-thumbnails)

## Read a clip

A clip has two parts:

- The **label bar** at the top shows the kind icon, the clip's name and its badges. See [Read the badges in the label bar](#read-the-badges-in-the-label-bar).
- The **body** below it shows the clip's content:

| Clip | The body shows |
|---|---|
| Video | A strip of thumbnails: frames of the video, side by side. |
| Freeze frame | The same picture in every thumbnail: it holds one frame. |
| Audio | The waveform of its sound. See [Read a waveform](#read-a-waveform). |
| Image | The picture, repeated across the clip. |
| Animated GIF or WebP | The frames of the animation side by side: each shows the frame that plays at that moment of the clip, as the animation loops. |
| Solid | A small swatch at the start of the body: the shape (a square, a rounded square, a circle or a bar) in its color or gradient. See [Shapes and images on the timeline](shapes-and-images.md#shapes-and-images-on-the-timeline). |
| Text | The first line of its text, as the picture shows it (in capitals when its **Case** is **AA**). See [Text clips on the timeline](titles-and-text.md#text-clips-on-the-timeline). |
| Caption cue | No body: the **CC** caption track is always S. The label bar shows the cue's text on one line instead of a name. See [Edit cues on the timeline](captions.md#edit-cues-on-the-timeline). |

A video with sound gives you both: thumbnails in its video clip and the waveform in its sound clip on the audio track.

Clips of a track you don't see or hear (muted, hidden, or left out by a solo) are drawn faded, thumbnails and waveforms included. Clips on a locked track are covered with diagonal lines. See [Tracks](tracks.md). A clip you turned off with **Disable** is drawn faded and covered with diagonal lines; see [Turn a clip off](editing-properties.md#turn-a-clip-off).

## Show thumbnails and waveforms

The body only exists on taller tracks. Each track is Small (S), Medium (M) or Large (L), and new tracks are M.

| Track height | What the clips show |
|---|---|
| **S** (32 pixels) | Only the label bar: icon, name and badges. No thumbnails or waveforms. |
| **M** (56 pixels) | The label bar and the body. |
| **L** (88 pixels) | The label bar and a taller body, with larger thumbnails and a taller waveform. |

To make a track taller, click the height toggle (three stacked rows) in its header, or click **Track height** in the toolbar to change all tracks. See [Change track height](tracks.md#change-track-height).

The width of a clip on screen matters too:

- Video and image clips narrower than 48 pixels show no thumbnails, only their color. Zoom in to see them.
- Solid clips narrower than 24 pixels show no swatch.
- Audio clips show their waveform at any width, down to 6 pixels. A clip narrower than 6 pixels shows only a thin strip of its color.

## See more frames by zooming in

The thumbnails start at the left end of the clip and sit side by side up to its right end. Each thumbnail shows the frame at its left edge. Zoom in and the thumbnails get closer together in time, so you see more of the video; zoom out and each one stands for a longer stretch.

> **Video placeholder: Zoom into a filmstrip**
> - File: `videos/clip-thumbnails-and-waveforms/zoom-filmstrip.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a 20-second video clip on V1 at height L; press <kbd>\\</kbd> to fit; hold <kbd>Ctrl</kbd> and roll the wheel over the middle of the clip: for a moment the same thumbnail repeats a few times, then each thumbnail shows its own frame; zoom in further until single frames are wide; drag the start of the clip to the right to trim it: the first thumbnail now shows the clip's new first frame; press <kbd>Space</kbd>, zoom into a part of the clip you have not looked at: the thumbnails stay coarse while it plays; press <kbd>Space</kbd> again: they fill in right away.

- The thumbnails follow the clip's content: a clip that starts later in its video starts with that later frame, and a clip at another speed (see [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)) shows the frames it plays at that speed.
- Each thumbnail has the shape of the video, upright: narrow for a portrait phone video, wide for a landscape one. A taller track gives larger thumbnails.
- The editor keeps thumbnails at three levels of detail: one every 2 seconds of the video, one every half second, and one every 5 frames. It uses the level that gives each thumbnail on screen its own frame. Zoomed in so far that a thumbnail covers less than 5 frames, neighboring thumbnails show the same frame.
- The first two levels are made right after import. Thumbnails every 5 frames are made only for the parts of a video you zoom into.
- While a closer level is being made, the clip shows the nearest thumbnails it already has, so you may see the same thumbnail a few times in a row. On an idle computer, the right thumbnails usually replace them within a second.

## Read a waveform

A waveform shows how loud a clip is from moment to moment. Loud parts are tall, quiet parts are short, and silence is a thin line in the middle of the body.

- The waveform is mirrored around the middle line of the body: it grows up and down by the same amount.
- Each column of pixels shows the loudest moment in the stretch of time it covers, from the loudest channel (the louder side of a stereo sound).
- The scale is linear: a sound at the highest level a file can hold reaches almost the top and bottom of the body, and a sound at half that level reaches halfway.
- The waveform stays sharp at every zoom. Zoomed far in, it becomes a smooth outline of the sound.
- It follows the clip like the thumbnails do: a trimmed clip shows only its part of the sound, and a clip at another speed is squeezed or stretched to match.
- It shows the sound of the file. The listening volume and the track toggles don't change it; a muted track's clips are drawn faded.

Changing a clip's volume is available in a later version.

> **Tip:** Look for the thin lines in a voice recording to find the pauses between sentences, then split or trim there. See [Splitting, deleting and closing gaps](splitting-and-deleting.md) and [Trimming clips](trimming.md).

## Read the badges in the label bar

Badges sit at the right end of a clip's label bar, from right to left in this order:

| Badge | Looks like | What it means |
|---|---|---|
| Sync number | A red number such as **+12** or **-12** | The clip is that many frames out of step with its linked clip. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync). |
| Speed | `0.5x`, `2x` or `1.33x` | The video or audio clip plays faster or slower than its media. See [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md) and [Change a clip's speed with Rate stretch](advanced-trimming.md#change-a-clips-speed-with-rate-stretch). |
| Freeze frame | A snowflake, in the place of the speed | The clip holds one frame of its video. See [Hold a frame (freeze frame)](speed-freeze-frames-and-punch-zoom.md#hold-a-frame-freeze-frame). |
| Link | A chain icon | The clip is linked to another clip, for example a video and its sound. See [Linking and grouping clips](links-and-groups.md). |
| Text animation | A sparkles icon | The text clip has an in or out animation. See [Text animations](text-animations.md). |
| Missing font | A red warning triangle | The text clip uses a font this computer doesn't have, so it is drawn with a fallback font. See [Fix a missing font](titles-and-text.md#fix-a-missing-font). |

- A clip at normal speed shows no speed badge, and a clip in sync shows no number.
- The clip's name ends before the badges, shortened with "…" when needed. In a short clip, badges that don't fit are left out.
- When a clip runs past the right edge of the view, its badges stay visible at the right edge of the tracks, just as its icon and name stay at the left edge when it starts before the view.
- Groups have no badge: click a clip to see which clips light up with it. See [Group clips](links-and-groups.md#group-clips).

## Know when thumbnails and waveforms appear

The editor makes thumbnails and analyzes the sound in the background after you import media. You can keep working meanwhile.

- **After import.** Each video's card picture in the Media panel (its first frame) comes first, then the thumbnails every 2 seconds and every half second. Each audio file and video with sound is analyzed for its waveform. See [What happens when you import](importing-media.md#what-happens-when-you-import).
- **Clips on screen first.** Thumbnails and waveforms of the clips you are looking at are made before the others.
- **Not while you play, scrub or drag.** The editor pauses this work while you play, scrub or drag anything on the timeline, so the preview stays smooth. Clips keep what they already show (or their color) and fill in right after you stop.
- **From the proxy once it is ready.** When a video's [proxy](proxies.md) is ready, its card picture and thumbnails are made again from the proxy, which is quicker. The thumbnails you see stay until the new ones replace them. After **Remove proxy**, they are made again from the original video.
- **Saved with the project.** Thumbnails and the sound analysis are saved in the project's `cache` folder. The next time you open the project, they appear at once, without being made again. If you delete the `cache` folder while the project is closed, they are made again. A [read-only project](projects-and-saving.md#work-in-read-only-mode) uses what is already in its `cache` folder but saves nothing new, so anything missing is made again each time you open it.

A video that Chrome can't decode on your computer, such as HEVC without a hardware decoder, or whose file is missing from the project's `media` folder, gets no thumbnails: its card keeps the film icon and its clips show only their color. See [A video imports but shows nothing](troubleshooting.md#a-video-imports-but-shows-nothing).

If a video's thumbnails look wrong or out of date, right-click its card in the Media panel and choose **Regenerate thumbnails**: the card picture and the thumbnails of its clips are made again from scratch. See [Make thumbnails again](proxies.md#make-thumbnails-again).

## Combine label colors with thumbnails

A clip with a label color shows that color in its label bar above the thumbnails, and as its body color while the thumbnails load. In an audio clip, the waveform is drawn on the label color. To set a label color, see [Give clips a label color](timeline.md#give-clips-a-label-color).

> **Tip:** On a busy timeline of video clips, the label bars are where label colors stand out. Keep tracks at M or L to see the thumbnails, or set them to S to see only the colored label bars.

## Related pages
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Advanced trimming](advanced-trimming.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Titles and text](titles-and-text.md)
- [Text animations](text-animations.md)
- [Captions](captions.md)
- [Audio](audio.md)
- [Importing media](importing-media.md)
- [Proxies](proxies.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 34, 2026-10-17</sub>
