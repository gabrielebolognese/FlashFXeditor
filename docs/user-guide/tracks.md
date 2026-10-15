# Tracks

Tracks are the rows of the timeline: video tracks above the divider, audio tracks below it. Each track header holds the track's name and its toggles, so you can choose which tracks your edits act on, protect finished tracks from changes, take tracks out of the preview or the mix, and make rows taller or shorter. You can also add, rename, reorder and delete tracks.

> **Video placeholder: Manage tracks**
> - File: `videos/tracks/overview.mp4` (not recorded yet)
> - Length: about 90 seconds
> - Shows: a timeline with clips on V1, V2 and A1; point at the toggles in the V1 header in turn: the crosshair, the padlock, **M**, the eye and the rows icon; click the V2 header: it gets a lighter background, its icon turns gold and the **Edit Properties** panel shows the **Track** section; double-click the name V2, type "B-roll" and press <kbd>Enter</kbd>; click the padlock in the B-roll header: diagonal lines cover the row and its clips can no longer be clicked; click the padlock again; drag the V1 header up past B-roll: a gold line shows where it lands; release: the picture of V1 is now on top in the preview; click the rows icon in the A1 header twice: the row gets taller with a taller waveform, then short with only the label bar; right-click the A1 header and choose **Add audio track below**; right-click the new track and choose **Delete track**.

## In this page
- [Read a track header](#read-a-track-header)
- [Select tracks](#select-tracks)
- [Add tracks](#add-tracks)
- [Rename a track](#rename-a-track)
- [Reorder tracks](#reorder-tracks)
- [Choose the tracks your edits use (target)](#choose-the-tracks-your-edits-use-target)
- [Lock a track](#lock-a-track)
- [Mute, solo and hide tracks](#mute-solo-and-hide-tracks)
- [Change track height](#change-track-height)
- [Delete tracks](#delete-tracks)
- [Use the track menu](#use-the-track-menu)
- [Change track settings in Edit Properties](#change-track-settings-in-edit-properties)

## Read a track header

The track header column is at the left of the timeline. Each header shows the track's kind icon and name, and a row of toggles at its right.

| Toggle | Looks like | On video tracks | On audio tracks | What it does |
| --- | --- | --- | --- | --- |
| **Target** | A crosshair | Yes | Yes | Decides whether edits without a selection, such as <kbd>Ctrl</kbd>+<kbd>K</kbd>, act on the track. On in a new track. See [Choose the tracks your edits use](#choose-the-tracks-your-edits-use-target). |
| **Lock** | A padlock | Yes | Yes | Protects the track's clips from every change. See [Lock a track](#lock-a-track). |
| **M** (mute) | The letter M | Yes | Yes | Takes the track out of the preview (video) or out of the mix (audio). |
| **S** (solo) | The letter S | No | Yes | Plays only the soloed audio tracks. |
| **Hide** | An eye | Yes | No | Takes the track out of the preview. |
| **Height** | Three stacked rows | Yes | Yes | Makes the row taller, step by step. See [Change track height](#change-track-height). |

- A toggle that is on is gold: a closed padlock, a gold **M** or **S**, a crossed-out eye. The crosshair is the other way round: it looks normal while the track is targeted and dimmed when it is not.
- A toggle gets lighter while you point at it. Click it to switch it. Clicking a toggle does not select the track.
- Each click on **Target**, **Lock**, **M**, **S** or **Hide** is one step in the history, for example **Lock track** or **Untarget track**. The height toggle is not.
- Long track names are shortened with "…" to fit the header.
- Rows of a locked track are covered with diagonal lines. Clips of a track that you don't see or hear (muted or hidden video, muted audio, or audio left out by a solo) are drawn faded.

## Select tracks

Select a track to see its settings in the **Edit Properties** panel, and to rename, resize, compact or delete it.

| To | Do this |
| --- | --- |
| Select a track | Click its header, away from the toggles |
| Add a track to the selection, or remove it | <kbd>Shift</kbd>+click or <kbd>Ctrl</kbd>+click its header |
| Select all clips on a track | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click its header, or right-click it and choose **Select all clips on track** |
| Clear the selection | Click an empty part of a track, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> |

- A selected header has a lighter background, a gold kind icon and a brighter name.
- Only one kind of thing is selected at a time: tracks, clips, a gap or a cut. Selecting a track clears the clip selection, and the other way round.
- With tracks selected, <kbd>F2</kbd> renames the track (the first one you selected), <kbd>Shift</kbd>+<kbd>G</kbd> closes all gaps on the selected tracks, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Up</kbd> and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Down</kbd> change their height, and the track menu's **Delete track** and **Height** rows act on all of them.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click selects nothing on a locked track.
- Selecting tracks is not a step in the history. The selected tracks come back when you reopen the project.

## Add tracks

- To add a video track, click **+ Video track** in the track header column, just above the top video track. The new track (V2, V3, and so on) goes above the existing video tracks.
- To add an audio track, click **+ Audio track** in the track header column, just below the bottom audio track. The new track (A2, A3, and so on) goes below the existing audio tracks.
- To add a track next to another one, right-click that track's header and choose **Add video track above**, **Add video track below** (on a video track), **Add audio track above** or **Add audio track below** (on an audio track). **Add audio track** on a video header, and **Add video track** on an audio header, add the track in the usual place.

The divider between video and audio tracks stays where it is, so the tracks you are working on do not jump. A new track is targeted, unlocked, unmuted and of height M. Adding a track is one step in the history; <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes it.

You can also create a track by dragging clips past the top video track or the bottom audio track. See [Create a track by dragging](timeline.md#create-a-track-by-dragging).

## Rename a track

> **Video placeholder: Rename and reorder tracks**
> - File: `videos/tracks/rename-and-reorder.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a red full-frame image on V1 and a blue one on V3 at the same time: the preview is blue; double-click the name V1: a text field opens over it with the name selected; type "Hero" and press <kbd>Enter</kbd>; hover **Undo**: it reads **Undo Rename track**; press on the Hero header and drag it up past V3: the header follows the pointer and a gold line appears above V3; release: the tracks read V2, V3, Hero from the bottom up and the preview turns red; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the order and the blue preview are back.

1. Double-click the track's name. You can also select the track and press <kbd>F2</kbd> (the Timeline panel must be active), or right-click its header and choose **Rename**.
2. A text field opens over the name, with the name selected. If the track is out of view, the timeline scrolls to it first.
3. Type the new name and press <kbd>Enter</kbd>, or click elsewhere. Press <kbd>Escape</kbd> to keep the old name.

- Names can be up to 255 characters. Spaces at the start and end are removed, several spaces in a row become one, and a blank name is ignored.
- Scrolling the tracks up or down while the field is open keeps the name you typed and closes the field.
- A locked track can be renamed.
- The history step is named **Rename track**. The name is saved with the project.

## Reorder tracks

Video tracks are stacked in the preview: a higher video track is drawn over the tracks below it. Move a video track up or down to change which picture is on top.

1. Press on the track's header, on its name (not on a toggle).
2. Drag up or down. Once the pointer has moved 4 pixels, the header follows the pointer, and a gold line across the timeline shows where the track will land.
3. Release.

- Video tracks move only among the video tracks, and audio tracks only among the audio tracks. The divider stays where it is.
- The track takes its name, its clips and its settings with it. Names don't change: after you move V1 to the top, the tracks read, for example, V2, V3, V1 from the bottom up.
- Moving an audio track changes only its place on screen, not the sound.
- Hold the pointer near the top or bottom edge of the tracks to scroll while you drag.
- Press <kbd>Esc</kbd> before you release to cancel.
- A locked track can be moved; its clips don't change.
- The history step is named **Reorder track**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts the track back, and the preview with it.

## Choose the tracks your edits use (target)

The **Target** toggle (the crosshair) decides which tracks take part in edits that work at the playhead when nothing is selected. Every track is targeted at first. Click the crosshair to leave a track out: it dims.

| Edit | Acts on |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> with nothing selected | The clips under the playhead on targeted tracks. See [Split clips at the playhead](splitting-and-deleting.md#split-clips-at-the-playhead). |
| <kbd>Q</kbd> and <kbd>W</kbd> | The clips under the playhead on targeted tracks. See [Trim to the playhead with Q and W](trimming.md#trim-to-the-playhead-with-q-and-w). |
| <kbd>G</kbd> with no gap selected | The gap at the playhead on targeted tracks. See [Close a gap](splitting-and-deleting.md#close-a-gap). |
| <kbd>Shift</kbd>+<kbd>G</kbd> or **Close all gaps (compact)** with no track selected | The gaps on targeted tracks. See [Close all gaps (compact)](splitting-and-deleting.md#close-all-gaps-compact). |
| Double-clicking media in the Media panel | The targeted video track and audio track nearest the divider. See [Add clips from the Media panel](timeline.md#add-clips-from-the-media-panel). |

- While **Linked selection** is on, the linked clips of the clips these edits change follow them, also on a track that is not targeted. For example, <kbd>Ctrl</kbd>+<kbd>K</kbd> on an untargeted A1 still splits the sound of a video it splits on V1. See [Linking and grouping clips](links-and-groups.md).
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> and the **Razor** tool with <kbd>Shift</kbd> cut every unlocked track, targeted or not.
- Selected clips are always edited, whatever their track's target.
- Each click is one step in the history, named **Target track** or **Untarget track**. Targets are saved with the project.

## Lock a track

Lock a track to protect it while you work on the others, for example a finished music track. Click the padlock in its header. The padlock closes and turns gold, and diagonal lines cover the row.

While a track is locked:

- Its clips can't be selected: a click on them works like a click on empty space, and <kbd>Ctrl</kbd>+<kbd>A</kbd> and selection rectangles skip them. Locking a track removes its clips from the selection.
- Its clips can't be moved, nudged, trimmed, rolled, slipped, slid, stretched, split (with <kbd>Ctrl</kbd>+<kbd>K</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> or the **Razor**), deleted, renamed, linked or grouped.
- No clip can be dropped, nudged or inserted onto it. The move is refused, and the message **Can't drop clips onto a locked track** names the track.
- Ripples skip it: ripple trims, <kbd>Q</kbd> and <kbd>W</kbd>, ripple deletes, **Close gap** and **Close all gaps** leave its clips where they are, and its clips never stop a ripple on the other tracks.
- The track can't be deleted. See [Delete tracks](#delete-tracks).
- It still plays: locking changes neither the picture nor the sound.

Click the padlock again to unlock the track. Each click is one step in the history, named **Lock track** or **Unlock track**. To lock or unlock every track at once, right-click any track header and choose **Lock all tracks** (or **Unlock all tracks** when all are locked).

> **Note:** Linked clips on a locked track don't follow their partners. When you move or trim a video whose sound sits on a locked track, only the video changes. If the two get out of step, both show a red sync number. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).

## Mute, solo and hide tracks

> **Video placeholder: Mute, solo and hide tracks**
> - File: `videos/tracks/mute-solo-hide.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a title image on V2 over a video on V1, with a voice clip on A1 and music on A2; click the eye in the V2 header: the eye is crossed out, the title leaves the preview and its clip on the timeline fades; click the eye again; click **M** in the V1 header: the video leaves the preview; click it again; press <kbd>Space</kbd>, click **S** in the A2 header: only the music plays and the voice clip on A1 fades; click **S** again; right-click the A1 header and choose **Mute all others**: only the voice plays.

| Toggle | Video track | Audio track |
| --- | --- | --- |
| **M** | The track's clips leave the preview. | The track is silent. |
| **S** | Not available. | Only the soloed audio tracks play. |
| **Hide** (eye) | The track's clips leave the preview. | Not available. |

- In this version, **M** and **Hide** do the same thing on a video track.
- Clips of a track you don't see or hear are drawn faded on the timeline. You can still select and edit them.
- To keep only one track of a kind, right-click its header and choose **Mute all others**: every other track of the same kind is muted, and this one is unmuted. It is one step in the history.
- You see and hear each change at once, also during playback.
- Each click is one step in the history, named for example **Mute track**, **Unsolo track**, **Hide track** or **Show track**. These settings are saved with the project.

For how muting and soloing affect the sound and the audio meter, see [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks).

## Change track height

Each track is Small (S, 32 pixels), Medium (M, 56 pixels) or Large (L, 88 pixels). New tracks are M.

| To | Do this |
| --- | --- |
| Make one track taller, step by step | Click the height toggle (three stacked rows) in its header: S, then M, then L, then S again |
| Make the selected tracks taller or shorter | Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Down</kbd> (Timeline panel) |
| Give tracks a set height | Right-click a header and choose **Height S**, **Height M** or **Height L**, or use **Height** in **Edit Properties** |
| Change all tracks together | Click **Track height** in the timeline toolbar |

- <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Up</kbd> and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Down</kbd> change the selected tracks. With no track selected, they change the tracks of the selected clips, and with nothing selected, every track. Each track goes one step and wraps around: <kbd>Up</kbd> goes from L to S, <kbd>Down</kbd> from S to L.
- In the track menu, the current height is gold. The rows act on the selected tracks when the track you right-clicked is one of them.
- **Track height** in the toolbar sets every track to the size after the tallest one: when the tallest track is S, all become M; when it is M, all become L; when it is L, all become S.
- Changing a height is not a step in the history, and undo and redo leave heights as they are. Heights are saved with the project.

On M and L tracks, clips show their thumbnails, waveforms or pictures below the label bar; on S tracks they show only the label bar. See [Show thumbnails and waveforms](clip-thumbnails-and-waveforms.md#show-thumbnails-and-waveforms).

When taller tracks no longer fit in the panel, scroll them up and down with the mouse wheel, by dragging the thumb of the scrollbar at the right of the tracks, or by panning. See [Use the scrollbars](timeline.md#use-the-scrollbars) and [Pan the view](timeline.md#pan-the-view).

## Delete tracks

1. Right-click the track's header. To delete several tracks, select them first and right-click one of them.
2. Choose **Delete track**.

- The track is deleted with all its clips. A clip on another track that was linked or grouped only with deleted clips stays, on its own.
- The history step is named **Delete track** or **Delete tracks**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings back the tracks and their clips.
- A locked track can't be deleted: **Delete track** is dimmed on its menu. When the selected tracks include a locked one, nothing is deleted and the message **Can't delete a locked track** names it. Unlock it first.

To clean up, right-click any header and choose **Delete empty tracks**. Every unlocked track without clips is deleted in one step. When every video track is empty, the one nearest the divider stays, and the same for audio, so you always have a row to drop clips onto. If there is nothing to delete, the message **No empty tracks to delete** appears.

## Use the track menu

Right-click a track header, or one of its toggles, to open the track menu. If the track is not selected, it is selected first; if it is part of a selection of tracks, the selection stays.

| Row | What it does |
| --- | --- |
| **Add video track above**, **Add video track below** (video tracks) | Adds a video track right above or below this one. |
| **Add audio track above**, **Add audio track below** (audio tracks) | Adds an audio track right above or below this one. |
| **Add audio track** (video tracks), **Add video track** (audio tracks) | Adds a track of the other kind, below the bottom audio track or above the top video track. |
| **Rename** | Opens the name field over this track's name. Its shortcut, <kbd>F2</kbd>, is shown on the right. |
| **Delete track** | Deletes the selected tracks with their clips. Dimmed on a locked track. |
| **Delete empty tracks** | Deletes every unlocked track without clips. |
| **Height S**, **Height M**, **Height L** | Sets the height of the selected tracks. The current height is gold. |
| **Select all clips on track** | Selects the clips on this track. Dimmed when the track is locked or empty. |
| **Lock all tracks** / **Unlock all tracks** | Locks every track, or unlocks every track when all are locked. Locking all clears the selection. |
| **Mute all others** | Mutes every other track of this kind and unmutes this one. |

Press <kbd>Escape</kbd> or click outside the menu to close it.

## Change track settings in Edit Properties

Click a track header. The **Edit Properties** panel shows the **Track** section:

| Setting | What it does |
| --- | --- |
| **Name** | The track name. Type a new one and press <kbd>Enter</kbd>. |
| **Kind** | **Video** or **Audio**. You can't change it. |
| **Height** | **Small (S)**, **Medium (M)** or **Large (L)**. |
| **Target**, **Lock**, **Mute** | The same as the toggles in the header. |
| **Solo** (audio tracks) | The same as **S** in the header. |
| **Hide** (video tracks) | The same as the eye in the header. |

With several tracks selected, the section is titled, for example, **2 tracks**, and has no **Name** row. It shows the settings of the first track you selected, and a change applies to every selected track as one step in the history (named, for example, **Mute tracks**).

## Related pages
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Timeline](timeline.md)
- [Linking and grouping clips](links-and-groups.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Trimming clips](trimming.md)
- [Audio](audio.md)
- [Preview and playback](preview-and-playback.md)
- [The workspace](workspace.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 18, 2026-10-15</sub>
