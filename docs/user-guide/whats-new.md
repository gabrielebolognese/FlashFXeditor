# What's new

Shorts Editor grows in steps called batches. This page lists what each batch added that you can see or use, newest first. Follow the links for the full instructions.

> **Video placeholder: What's new in Batch 10**
> - File: `videos/whats-new/batch-10.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: open a project with a video with sound on V1 and A1 and a music clip on A2; press <kbd>Space</kbd>: sound and picture play together and the meter at the right edge of the preview moves; drag the **Master volume** knob down, then click **Mute** and **Unmute**; click **S** in the A2 header to hear only the music, then click it off; click **M** in the A1 header and press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; press <kbd>Home</kbd> while playing: the sound picks up at the start without a click.

> **Video placeholder: What's new in Batch 09**
> - File: `videos/whats-new/batch-09.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: open a project with three clips on the timeline; press <kbd>Space</kbd> to play and let the timeline page forward; press <kbd>L</kbd> three times to reach 8x, then <kbd>K</kbd>; hold <kbd>K</kbd> and tap <kbd>L</kbd> to step one frame; turn on **Loop playback**; point at the **Dropped** readout in the status strip.

## In this page
- [Batch 10: Sound](#batch-10-sound)
- [Batch 09: Playback](#batch-09-playback)
- [Batch 08: Preview at the playhead](#batch-08-preview-at-the-playhead)
- [Batch 07: Timeline](#batch-07-timeline)
- [Batch 06: Frame-accurate video](#batch-06-frame-accurate-video)
- [Batch 05: Graphics-card preview](#batch-05-graphics-card-preview)
- [Batch 04: Media import](#batch-04-media-import)
- [Batch 03: Projects, autosave and recovery](#batch-03-projects-autosave-and-recovery)
- [Batch 02: Undo, redo and frame-exact time](#batch-02-undo-redo-and-frame-exact-time)
- [Batch 01: The workspace](#batch-01-the-workspace)

## Batch 10: Sound
- Playback now plays the sound of your audio tracks, in sync with the picture (less than one frame apart, with no drift), also for phone videos. Sound plays at 1x forward, in play around and across loops; jumps and pauses are free of clicks.
- **Mute** and a **Master volume** knob (-60.0 dB to 0.0 dB) in the transport bar set how loud you listen. They are remembered in this browser and do not change your project.
- A stereo audio meter along the right edge of the preview shows the peak level of your edit, from -60 to +6 dBFS, with a peak hold and clip lights that stay red until you click them.
- **M** (mute) and **S** (solo) toggles in each audio track header. Each click is one undo step and is heard at once, also while playing.
- After import, the sound of each audio file and video with sound is analyzed in the background and kept in the project's `cache` folder, ready for the waveforms of a later version. Long MP4, MOV and M4A sound loads in pieces as you play.
- Playback now starts a few hundredths of a second later than before after you press play, so that sound and picture start together.

See [Audio](audio.md), [Preview and playback](preview-and-playback.md) and [Timeline](timeline.md).

## Batch 09: Playback
- Play and pause with <kbd>Space</kbd>, shuttle with <kbd>J</kbd>, <kbd>K</kbd> and <kbd>L</kbd> up to 8x, hold <kbd>K</kbd> and tap <kbd>J</kbd> or <kbd>L</kbd> to step one frame, play around the playhead with <kbd>Shift</kbd>+<kbd>K</kbd>, step with the arrow keys (hold to repeat), jump with <kbd>Home</kbd> and <kbd>End</kbd>, and loop with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>.
- A transport bar under the preview (**Go to start**, **Previous frame**, **Play**/**Pause**, **Next frame**, **Go to end**, **Loop playback**) with timecode, duration and frame-rate readouts, and a status strip that shows the frames **Dropped** in the last playback.
- During playback the timeline follows the playhead page by page, and clips that start within the next 2 seconds are prepared in advance so cuts play smoothly. Playback is silent for now.

See [Preview and playback](preview-and-playback.md) and [Keyboard shortcuts](keyboard-shortcuts.md).

## Batch 08: Preview at the playhead
- The preview shows your edit at the playhead: every video and image clip there, stacked from track V1 upward.
- Clips fit the frame when you add them: clips with another aspect ratio get bands in the project's background color, clips with the same ratio fill the frame.
- Scrubbing in the ruler updates the preview live, with no black flashes at cuts.

See [Preview and playback](preview-and-playback.md).

## Batch 07: Timeline
- The timeline shows a ruler, track headers, and video and audio tracks with colored clips. Add tracks with **+ Video track** and **+ Audio track**.
- Zoom with the toolbar slider and buttons, with <kbd>=</kbd>, <kbd>-</kbd> and <kbd>\</kbd>, or with <kbd>Ctrl</kbd>+wheel at the pointer. Scroll with the wheel or <kbd>Shift</kbd>+wheel.
- Move the playhead by clicking or dragging in the ruler, with the arrow keys, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Up</kbd> and <kbd>Down</kbd>, or by typing a timecode such as `1:05:10` or `+30`.
- Double-click a media item to add it at the playhead: a video with sound becomes a video clip on V1 and its sound on A1, an image becomes a 5-second clip, and the playhead moves to the end so you can build a sequence quickly.

See [Timeline](timeline.md).

## Batch 06: Frame-accurate video
- Any frame of an imported video can be shown: the nearest available frame appears at once and the exact frame follows.
- Phone videos recorded upright are shown upright.
- Videos open faster the second time, and videos whose format your browser cannot decode are detected and reported.

See [Preview and playback](preview-and-playback.md) and [Troubleshooting](troubleshooting.md).

## Batch 05: Graphics-card preview
- The preview is drawn by your graphics card: the project frame sits centered at **Fit**, on the project background color.
- The preview header has a **Zoom** menu (Fit, 25% to 400%) and **Export frame**, which saves the current frame as a PNG at the project resolution.
- If your browser has no usable graphics adapter, the editor shows its unsupported-browser screen and says so. After a graphics driver reset, the preview reconnects and redraws on its own.

See [Preview and playback](preview-and-playback.md).

## Batch 04: Media import
- Import video (.mp4, .mov, .m4v), audio (.mp3, .m4a, .aac, .wav, .ogg) and images (.png, .jpg, .jpeg, .webp, .gif, .svg) with **Import media** or <kbd>Ctrl</kbd>+<kbd>I</kbd>, by dropping files or whole folders on the Media panel, or by pasting images. Files are copied into the project folder.
- The Media panel shows a thumbnail, a duration badge and the details of each item, in a grid view or a list view with sortable columns. Select several items, rename with <kbd>F2</kbd> and remove with <kbd>Delete</kbd>.
- Large imports show their progress. Files that cannot be imported are named in a message, and the others are imported anyway.

See [Importing media](importing-media.md).

## Batch 03: Projects, autosave and recovery
- A start screen with **New project** (9:16, 4:5, 1:1, 16:9 or a custom size; 23.976 to 60 fps), **Open project**, recent projects (up to 12), and opening a project by dropping its folder.
- Autosave one second after your last change, with a colored save dot and <kbd>Ctrl</kbd>+<kbd>S</kbd>. The 20 newest backups are kept, an interrupted session offers to restore unsaved changes, and a folder you can only read opens in read-only mode with **Allow editing**.
- Rename the project in the app bar. The **Project** section of the Edit Properties panel sets the name, resolution, frame rate, background color and autosave delay, and each project remembers its view and panel sizes.

See [Getting started](getting-started.md) and [Projects and saving](projects-and-saving.md).

## Batch 02: Undo, redo and frame-exact time
- Undo and redo with the app bar buttons (the tooltip names the step), <kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>+<kbd>Y</kbd>: up to 1,000 steps, and undo also restores the selection.
- Every position is a whole frame, and timecodes read minutes:seconds:frames. Timing stays exact at fractional frame rates such as 29.97 fps.

See [Projects and saving](projects-and-saving.md).

## Batch 01: The workspace
- The editor layout: an app bar above four panels (Media, Edit Properties, Preview and Timeline). Drag the splitters to resize them, double-click a splitter to reset it; sizes are remembered.
- The timeline toolbar shows every tool group, with tooltips that include the keyboard shortcut. Groups that do not fit move into a **More tools** (…) menu.
- A browser that cannot run the editor shows a full-screen message listing what is missing.

See [The workspace](workspace.md) and [Getting started](getting-started.md).

## Related pages
- [User guide home](README.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 10, 2026-10-15</sub>
