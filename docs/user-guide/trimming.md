# Trimming clips

Trimming changes where a clip starts or ends. Drag a clip's edge, or press one key to cut the clip to the playhead. A regular trim changes one clip and leaves everything else in place. A ripple trim also moves the rest of your edit, so no gap opens. While you drag, the preview shows the frame where the clip will start or end. To roll a cut, slip, slide or change a clip's speed, see [Advanced trimming](advanced-trimming.md). To cut a clip in two, delete it or close a gap, see [Splitting, deleting and closing gaps](splitting-and-deleting.md).

> **Video placeholder: Trim clips**
> - File: `videos/trimming/trimming-overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows: a timeline with three videos with sound end to end on V1 and A1; point at the end of the first video clip: the cursor becomes a `]` bracket; drag the end to the left: the video and its sound get shorter together, a gold bar marks the new end, the tooltip reads the change and the new length, and the preview shows the clip's last frame; release: a gap opens before the second clip; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>; hold <kbd>Ctrl</kbd>, point at the same end (the bracket turns gold) and drag it to the left: the second and third clips follow, so no gap opens; release; press <kbd>Home</kbd> and <kbd>Space</kbd> to play, and press <kbd>Q</kbd> in the middle of the second clip: its beginning up to the playhead is removed, the third clip moves left, and playback goes on.

## In this page
- [Find the edges of a clip](#find-the-edges-of-a-clip)
- [Trim a clip](#trim-a-clip)
- [Trim without leaving a gap (ripple trim)](#trim-without-leaving-a-gap-ripple-trim)
- [Trim a video without its sound](#trim-a-video-without-its-sound)
- [Know where a trim stops](#know-where-a-trim-stops)
- [Trim to the playhead with Q and W](#trim-to-the-playhead-with-q-and-w)
- [Extend a clip to the playhead with E](#extend-a-clip-to-the-playhead-with-e)
- [Cancel or undo a trim](#cancel-or-undo-a-trim)

## Find the edges of a clip

Each end of a clip has a trim zone: the outer 8 pixels inside the clip. Point at one and the cursor changes to a bracket with a double arrow.

Trim zones trim with the **Select** tool, the one active in a new project. If another tool is active, press <kbd>V</kbd> or click **Select** in the timeline toolbar. See [Choose a tool](advanced-trimming.md#choose-a-tool).

| Cursor | Where | Drag it to change |
| --- | --- | --- |
| `[` | The start of a clip | Where the clip starts |
| `]` | The end of a clip | Where the clip ends |

- The bracket turns gold when the trim will ripple: while you hold <kbd>Ctrl</kbd> over the edge, or while **Ripple mode** is on. See [Trim without leaving a gap (ripple trim)](#trim-without-leaving-a-gap-ripple-trim).
- Where two clips touch, the left side of the cut is the end of the left clip, and the right side is the start of the right clip. Point just left of the cut to trim the first clip, just right of it to trim the second.
- Within 3 pixels of such a cut, a click without dragging selects the cut as an edit point instead of the clip, and holding <kbd>Ctrl</kbd>+<kbd>Alt</kbd> rolls the cut. See [Select a cut (edit point)](advanced-trimming.md#select-a-cut-edit-point) and [Roll a cut between two clips](advanced-trimming.md#roll-a-cut-between-two-clips).
- On a clip narrower than 24 pixels, each trim zone is a third of the clip, so you can still press its middle to move it. To grab the edge of a very short clip, zoom in first.
- Clicking a trim zone without dragging selects the clip, like a click on its middle (except right on a cut, see above). A trim itself does not change the selection.

Press anywhere else on a clip to select or move it. See [Move clips](timeline.md#move-clips).

## Trim a clip

1. Point at the start or the end of a clip until the bracket cursor shows.
2. Drag the edge left or right. The trim starts once the pointer has moved 4 pixels.
3. Release the mouse button where the clip should start or end.

A regular trim changes only the clip you drag and its linked clips (a video and its sound trim together):

| You drag | The clip |
| --- | --- |
| Its end to the left | Ends earlier. A gap opens after it. |
| Its end to the right | Ends later and shows more of its media, until it touches the next clip. |
| Its start to the right | Starts later. A gap opens before it. |
| Its start to the left | Starts earlier and shows more of its media, until it touches the previous clip or reaches `00:00:00`. |

What you see while you drag:

| You see | It means |
| --- | --- |
| The clip gets longer or shorter as you drag | The trim as it will be when you release. Your project does not change until then. |
| A gold bar at the moved edge | The new start or end of the clip. |
| The tooltip `Δ -00:00:10 · 00:02:05` next to the pointer | How far the edge moved, then the clip's new length, both as `mm:ss:ff`. A minus sign means the edge moved left. |
| The preview | The new edge frame: the first frame the clip will show when you drag its start, the last frame when you drag its end. |
| A red bar, and **Media start** or **Media end** in red in the tooltip | The clip has reached the first or the last frame of its media. See [Know where a trim stops](#know-where-a-trim-stops). |
| A thin gold line through the timeline and a name in gold in the tooltip, such as **End of Intro** | The edge snapped to that target. See [Snap the edge while you trim](#snap-the-edge-while-you-trim). |

After you release:

- The trim is one step in the history: **Trim clip**, or **Trim clips** when linked clips trimmed with it. The step of a ripple trim is named **Ripple trim**.
- The preview goes back to the frame at the playhead.

More things to know:

- If the editor is playing, dragging an edge pauses playback.
- Hold the pointer near the left or right edge of the tracks, or past it, to scroll the timeline while you trim. The further out you go, the faster it scrolls.
- Image clips have no media start or end: drag their edges to make them as long as you need.

### Snap the edge while you trim

While snapping is on, the edge you drag snaps like a moved clip. When it comes within 8 pixels of the start or end of another clip, the playhead or the start of the timeline, it jumps onto it.

- The clips the trim changes or moves are not snap targets.
- An edge snaps only to a target it can reach. If the clip can't go that far, for example past the end of its media, it does not snap.
- Hold <kbd>S</kbd> during the trim to do the opposite of the snapping setting. See [Switch snapping for one drag](timeline.md#switch-snapping-for-one-drag).

## Trim without leaving a gap (ripple trim)

A ripple trim changes the length of a clip and moves everything after it by the same number of frames, on every track. Shorten a clip and the later clips move left to close the gap; lengthen it and they move right to make room. Your edit stays tight, and sound stays in step with its picture.

> **Video placeholder: Ripple trim**
> - File: `videos/trimming/ripple-trim.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: a timeline with three clips end to end on V1, their sounds on A1, and a short clip on V2 above the third clip; hold <kbd>Ctrl</kbd> and point at the end of the first clip: the bracket cursor turns gold; drag the end to the left: the second and third clips, their sounds and the clip on V2 all move left with it; release and hover **Undo**: it reads **Undo Ripple trim**; click **Ripple mode** in the timeline toolbar: it turns gold; drag the start of the second clip to the right without <kbd>Ctrl</kbd>: the clip stays where it starts, the preview shows its new first frame, and its end and everything after it move left; click **Ripple mode** again to turn it off.

1. Hold <kbd>Ctrl</kbd>, or turn on **Ripple mode** in the timeline toolbar. The bracket cursor turns gold.
2. Drag the start or the end of a clip.
3. Release the mouse button.

What a ripple trim does:

- **The end of a clip:** the clip ends earlier or later, and every clip that starts at or after its old end moves by the same number of frames, on every track.
- **The start of a clip:** the clip stays where it starts. Instead, frames are removed from its beginning (drag right) or added to it from its media (drag left), and its end moves. Every clip that starts at or after the clip's start, on every track, moves by the same number of frames. Watch the preview for the clip's new first frame.
- **Clips that run across the edit point** on other tracks, such as a music clip under several shots, do not move.
- **Locked tracks** do not move. See [Lock a track](tracks.md#lock-a-track).
- **Caption cues** on the **CC** track move along like other clips, so your captions stay in sync. Lock the **CC** track to keep them in place.
- **Where a ripple stops:** when you shorten a clip, the later clips move left until one of them would run into a clip that does not move, for example a music clip that runs across the edit point, or would move before `00:00:00`. The trim stops there. When you lengthen a clip, the later clips make room, so they never stop it.

The history step is named **Ripple trim**.

### Turn Ripple mode on or off

**Ripple mode** (the waves icon in the Toggles group of the timeline toolbar) makes every edge drag a ripple trim, with no key held. It is gold while it is on.

- With Ripple mode off, hold <kbd>Ctrl</kbd> to ripple a single trim. You can press or release <kbd>Ctrl</kbd> during the drag: the trim switches at once, and the keys you hold when you release decide.
- With Ripple mode on, every edge drag ripples, with or without <kbd>Ctrl</kbd>.
- Each project remembers whether Ripple mode is on. Turning it on or off is not a step in the history.
- Ripple mode has no keyboard shortcut, and it applies only to edge drags: <kbd>Q</kbd> and <kbd>W</kbd> always ripple, and <kbd>E</kbd> never does.

## Trim a video without its sound

The video and the sound of a video with sound are linked: when you trim one, the other trims by the same amount, so they stay in sync.

To trim only the clip you drag, hold <kbd>Alt</kbd> while you drag. You can press or release <kbd>Alt</kbd> during the drag. While **Linked selection** is off in the toolbar, every trim changes only the clip you drag, without <kbd>Alt</kbd>. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).

- When you trim both and the linked clip reaches a limit first, for example the end of its media, both stop there. Hold <kbd>Alt</kbd> to trim the other clip further on its own.
- Trimming one side alone keeps a video and its own sound in sync: the same moment of the recording still plays at the same time, and the sound simply starts earlier or ends later than the picture (a J or L cut). No red number appears.
- A clip you move or slip on its own does get out of step. Both clips then show a red number, such as **-20** on one and **+20** on the other, at the right end of their label bar. Right-click the clip and choose **Move into sync** to put it back. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).
- A linked clip on a locked track is never trimmed. See [Lock a track](tracks.md#lock-a-track).

## Know where a trim stops

The edge stops following the pointer at these limits, and the clip never goes past them:

| Limit | What happens |
| --- | --- |
| 1 frame | A clip is always at least 1 frame long. Drag one edge past the other and the clip stays 1 frame long. |
| Media start and media end | A video or audio clip can't show frames before the first frame or after the last frame of its file. The edge and **Media start** or **Media end** in the tooltip turn red. |
| The next or previous clip | In a regular trim, a clip can't grow over its neighbor on the same track. Use a ripple trim to push the neighbor along. |
| The next or previous caption cue | On the **CC** caption track, a cue's edge always stops at the neighboring cue, even with <kbd>Ctrl</kbd> held or **Ripple mode** on: the trim is a regular one and pushes nothing. See [Edit cues on the timeline](captions.md#edit-cues-on-the-timeline). |
| The start of the timeline | A clip can't start before `00:00:00`. |
| Clips on other tracks | A ripple trim stops when a clip that moves would run into a clip that does not move. Clips on locked tracks never move and never stop a ripple. |
| The linked clip | When the linked clip reaches one of these limits first, both stop. Hold <kbd>Alt</kbd> to trim one side only. |

> **Tip:** Trimmed frames are never lost. Drag the edge back to bring them back: a clip trimmed to 1 frame can be stretched back to its full length. Zoom in first so you can grab its edge.

## Trim to the playhead with Q and W

This is the fastest way to cut. Play or scrub to the frame where a clip should start or end, then press one key. The clip is trimmed to the playhead and the gap closes at once, on every track. Both keys work while the video plays, and playback goes on without a pause.

> **Video placeholder: Trim to the playhead**
> - File: `videos/trimming/trim-to-playhead.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a timeline with three videos with sound end to end on V1 and A1, and a music clip on A2 that starts at `00:00:00` and runs past the end of all three; press <kbd>Space</kbd> to play; in the middle of the second clip, press <kbd>Q</kbd>: the second clip and its sound lose their beginning up to the playhead, the third clip moves left, the music stays, and playback goes on with the same picture; a little later in the second clip, press <kbd>W</kbd>: the rest of the second clip and its sound are removed, and the third clip moves left and plays next; press <kbd>Space</kbd> to pause; hover **Undo**: it reads **Undo Ripple trim end to playhead**.

| Key | History step | What it does |
| --- | --- | --- |
| <kbd>Q</kbd> | **Ripple trim start to playhead** | Removes the part of the clip under the playhead from its start up to the playhead. The later clips move left to close the gap, and the playhead moves back to the cut, where the same picture now is. |
| <kbd>W</kbd> | **Ripple trim end to playhead** | Removes the part of the clip under the playhead from the playhead to its end. The later clips move left to close the gap. The playhead stays where it is, so the next clip now starts there. |

How <kbd>Q</kbd> and <kbd>W</kbd> choose what to trim:

- They look at the clips under the playhead on the targeted tracks that are not locked: every track, unless you clicked a track's crosshair to untarget it. See [Choose the tracks your edits use](tracks.md#choose-the-tracks-your-edits-use-target). <kbd>Q</kbd> uses the last cut before the playhead: the latest start among those clips. <kbd>W</kbd> uses the first cut after the playhead: the earliest end among them.
- Every clip that starts (<kbd>Q</kbd>) or ends (<kbd>W</kbd>) at that cut is trimmed, together with its linked clips while **Linked selection** is on, also on an untargeted track. Everything after the cut moves left, on every unlocked track.
- Clips that run across that cut, such as a music clip under several shots, are left alone.
- A clip that starts exactly at the playhead has nothing to trim. If no clip is under the playhead, the key does nothing.
- Each press is one step in the history.
- <kbd>Q</kbd> and <kbd>W</kbd> work in every panel, except while you type in a text field.

### When a key trim stops short

When a limit stops <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd> before the playhead, the clip is trimmed as far as it can go, and a message says why:

| Message | Why |
| --- | --- |
| **Trim stopped at the media start** | The clip has no earlier frames in its media. |
| **Trim stopped at the media end** | The clip has no later frames in its media. |
| **Trim stopped at 1 frame** | A clip is at least one frame long. |
| **Trim stopped at the next clip** | Clips on the same track can't overlap. |
| **Ripple stopped by** *track name* | Clips on that track can't move further without overlapping. |
| **Trim stopped at the timeline start** | Clips can't start before 0. |

## Extend a clip to the playhead with E

<kbd>E</kbd> moves the edge of the selected clip that is closest to the playhead onto the playhead. Use it to lengthen a clip up to a frame you found while playing, or to shorten it without dragging.

1. Select a clip.
2. Click in the ruler where the clip should start or end. The playhead can be inside the clip or outside it, and the Timeline panel is now active.
3. Press <kbd>E</kbd>.

- The edge closer to the playhead moves: the start or the end. When both are equally far, the start moves.
- It is a regular trim: nothing else moves, so a gap can open. The clip's linked clips trim with it.
- Lengthening stops at the neighboring clip, the start or end of the media, and the start of the timeline. A message then says why; see [When a key trim stops short](#when-a-key-trim-stops-short).
- With several clips selected, <kbd>E</kbd> trims the one you clicked last.
- If the playhead is already on the clip's start or end, nothing happens.
- The history step is named **Extend edit**.
- <kbd>E</kbd> works only while the Timeline panel is active.

## Cancel or undo a trim

- Press <kbd>Esc</kbd> before you release the mouse button. The clip goes back to how it was, and nothing is added to the history.
- An undo or redo during a trim (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) also cancels it.
- After you release, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole trim in one step: the trimmed clip, its linked clips and every clip a ripple moved.

To move a cut between two clips without changing their total length, to change the part of the media a clip shows, or to change a clip's speed, see [Advanced trimming](advanced-trimming.md).

## Related pages
- [Advanced trimming](advanced-trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Linking and grouping clips](links-and-groups.md)
- [Tracks](tracks.md)
- [Captions](captions.md)
- [Timeline](timeline.md)
- [Preview and playback](preview-and-playback.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 32, 2026-10-17</sub>
