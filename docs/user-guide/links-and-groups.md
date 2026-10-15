# Linking and grouping clips

A video with sound arrives on the timeline as two linked clips: the picture on a video track and its sound on an audio track. Linked clips are selected, trimmed, split and deleted together, so lips stay in sync with the voice. Use this page to edit one side on its own, to unlink or link clips, to put clips back in sync, and to group any clips you want to select and move as one.

> **Video placeholder: Link, sync and group clips**
> - File: `videos/links-and-groups/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows: a video with sound on V1 and A1; point at the chain icon in both label bars; click the video: both clips turn gold; press <kbd>Ctrl</kbd>+<kbd>L</kbd>: the chain icons disappear; hover **Undo**, it reads **Undo Unlink clips**; click the sound: only the sound is selected; press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Right</kbd> twice and <kbd>Alt</kbd>+<kbd>Right</kbd> twice; <kbd>Shift</kbd>+click the video and press <kbd>Ctrl</kbd>+<kbd>L</kbd>: the sound shows a red **+12** and the video **-12**; right-click the sound and choose **Move into sync**: it jumps back under the video and the numbers disappear; press <kbd>Shift</kbd>+<kbd>S</kbd>: the **Linked selection** button in the toolbar turns off; click the video: only the video is selected; press <kbd>Shift</kbd>+<kbd>S</kbd> again; select a title image on V2 and the video, press <kbd>Ctrl</kbd>+<kbd>G</kbd>; click the title: the title, the video and its sound are selected; drag them to the right together.

## In this page
- [How linked clips work](#how-linked-clips-work)
- [Turn Linked selection off](#turn-linked-selection-off)
- [Unlink clips](#unlink-clips)
- [Link clips](#link-clips)
- [Keep linked clips in sync](#keep-linked-clips-in-sync)
- [Group clips](#group-clips)
- [Ungroup clips](#ungroup-clips)

## How linked clips work

When you add a video with sound to the timeline, its picture and its sound become linked clips. While **Linked selection** is on (it is in a new project):

- A click on one selects both. A selection rectangle that touches one selects both.
- Trims, rolls, slips, slides and rate stretches change both. See [Trimming clips](trimming.md) and [Advanced trimming](advanced-trimming.md).
- <kbd>Ctrl</kbd>+<kbd>K</kbd>, the **Razor**, <kbd>Q</kbd>, <kbd>W</kbd> and <kbd>E</kbd> cut or trim both. The two right parts of a split are linked to each other.
- **Delete** and **Ripple delete** remove both.
- Moving one moves both, the same number of tracks away from the divider.

To work on one of them once, <kbd>Alt</kbd>+click it to select it alone, or hold <kbd>Alt</kbd> while you drag its edge. To work on single clips for a while, turn **Linked selection** off.

Linked clips show a chain icon at the right end of their label bar. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).

Linked clips and groups are different. Linking keeps a picture and its sound together through every edit. A group is a set of any clips that you select, move and delete together; each clip in it is still trimmed and cut on its own. See [Group clips](#group-clips).

## Turn Linked selection off

Click **Linked selection** (the chain icon) in the timeline toolbar, or press <kbd>Shift</kbd>+<kbd>S</kbd>. The button is gold while Linked selection is on.

While it is off:

- A click or a selection rectangle selects only the clips you touch, not their linked clips.
- Trims, rolls, slips, slides, rate stretches, <kbd>Q</kbd>, <kbd>W</kbd>, <kbd>E</kbd>, splits and deletes change only the clips you drag or selected. For example, select a video and press <kbd>Delete</kbd>: its sound stays.
- The clips stay linked. Turn Linked selection back on, and they work together again.
- The red sync numbers still show when linked clips get out of step. See [Keep linked clips in sync](#keep-linked-clips-in-sync).
- Groups are not affected: a click on a grouped clip still selects its group.

<kbd>Shift</kbd>+<kbd>S</kbd> works in every panel, except while you type in a text field. Each project remembers whether Linked selection is on. Turning it on or off is not a step in the history.

## Unlink clips

Unlink a video and its sound to edit them separately for good, for example to replace the sound with music.

1. Click one of the linked clips. Both are selected.
2. Press <kbd>Ctrl</kbd>+<kbd>L</kbd> (the Timeline panel must be active), or right-click one of them and choose **Unlink**.

- Every clip linked to the selected clips is unlinked, and the chain icon disappears from their label bars. The clips stay selected.
- After that, a click selects one clip only, and edits change only that clip.
- The history step is named **Unlink clips**.

## Link clips

Link clips to keep them together, for example a video you trimmed and its sound after you unlinked them, or a picture and a separate voice recording.

1. Select the clips: at least one audio clip and at least one video or image clip, each on its own track. For example, click the video, then <kbd>Shift</kbd>+click the audio clip.
2. Press <kbd>Ctrl</kbd>+<kbd>L</kbd>, or right-click one of them and choose **Link**.

- All the selected clips are linked to each other, and each shows the chain icon. The history step is named **Link clips**.
- The menu row reads **Link** when no selected clip is linked, and **Unlink** when one is. <kbd>Ctrl</kbd>+<kbd>L</kbd> does the same: when any selected clip is already linked, it unlinks.
- If the selection has no audio clip, no video or image clip, or two clips on the same track, nothing is linked and the message **Select a video and an audio clip to link** appears.
- Clips on a locked track can't be linked or unlinked.

## Keep linked clips in sync

When linked clips get out of step, both show a red number at the right end of their label bar: **+12** on the clip that plays 12 frames later than its partner, **-12** on the partner.

> **Video placeholder: Move clips into sync**
> - File: `videos/links-and-groups/move-into-sync.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: a video with sound on V1 and A1; <kbd>Alt</kbd>+click the sound and drag it 12 frames to the right: both clips show red numbers, **+12** on the sound and **-12** on the video; <kbd>Alt</kbd>+drag the end of the video to the left: no new number appears; right-click the sound: **Move into sync** is available; choose it: the sound moves back and the numbers disappear; hover **Undo**: it reads **Undo Move into sync**.

When the number appears:

| Linked clips | They are in sync when | A number appears when you |
| --- | --- | --- |
| A video and its own sound | The same moment of the recording plays at the same time in both. | Move or slip one of them on its own. |
| Clips from different files that you linked | They start on the same frame. | Move or trim the start of one of them on its own. |

Trimming one side of a video and its own sound alone, for example to let the sound start before the picture (a J cut) or carry on after it (an L cut), keeps them in sync, so no number appears.

To put a clip back in sync:

1. Right-click the clip that should move.
2. Choose **Move into sync**.

- The clip moves along its track by the number it showed, so it plays in sync with its partner again. The numbers disappear.
- It covers what it lands on, like a dropped clip. See [What happens to the clips underneath](timeline.md#what-happens-to-the-clips-underneath).
- It can't move before `00:00:00`: it stops there, and the numbers stay.
- **Move into sync** is dimmed when the clip is in sync.
- The history step is named **Move into sync**.

## Group clips

Group clips that belong together, for example a title, the shot under it and its sound, so that one click selects them all.

1. Select at least two clips, on any tracks.
2. Press <kbd>Ctrl</kbd>+<kbd>G</kbd> (the Timeline panel must be active), or right-click one of them and choose **Group**.

What a group does:

- A click on any clip of the group selects the whole group, together with the linked clips of its members while **Linked selection** is on. A selection rectangle or a right-click does the same.
- <kbd>Alt</kbd>+click selects one clip of the group alone, and <kbd>Ctrl</kbd>+click adds or removes one clip.
- Because the whole group is selected, a drag or a nudge moves the whole group.
- Deleting a clip of the group deletes the whole group, also when you selected only that clip.
- Trims, rolls, slips, slides and rate stretches change only the clip you drag (and its linked clips), not the whole group.
- When you split a grouped clip, both parts stay in the group.
- Grouping a clip that is already in a group puts its whole old group in the new one.
- Groups are not marked on the timeline: click a clip to see which clips light up with it.
- **Group** is dimmed in the menu when fewer than two clips are selected.
- Clips on a locked track can't join or leave a group.
- The history step is named **Group clips**. Groups are saved with the project.

## Ungroup clips

1. Click a clip of the group. The group is selected.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>, or right-click it and choose **Ungroup**.

- Every clip of the groups that the selected clips belong to leaves its group.
- **Ungroup** is dimmed in the menu when no selected clip is in a group.
- The history step is named **Ungroup clips**.

## Related pages
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 17, 2026-10-15</sub>
