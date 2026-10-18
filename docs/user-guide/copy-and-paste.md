# Copying, pasting and duplicating clips

Copy clips and paste them at the playhead, cut them out, paste with room made for them, give other clips the look of a copied one, and duplicate clips with one key. Use these tools to reuse a shot, a styled title or a logo animation without building it again, also in another project.

> **Video placeholder: Copy, paste and duplicate clips**
> - File: `videos/copy-and-paste/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a phone video with sound on V1 and A1, and empty V2 and A2 tracks. Click the crosshairs in the V1 and A1 headers so only V2 and A2 are targeted.
>   2. Click the video: it and its sound are selected. Press <kbd>Ctrl</kbd>+<kbd>C</kbd>.
>   3. Click in the ruler at an empty spot after the clip and press <kbd>Ctrl</kbd>+<kbd>V</kbd>: a copy of the video lands at the playhead on V2 and its sound on A2, selected, and the playhead jumps to their end. Click the copy's sound: both copies are selected, still linked.
>   4. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> again: the next copy lands right after the first one.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice. Click the crosshairs in the V1 and A1 headers again. Put the playhead in the middle of the original video and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>: the video and its sound split at the playhead, the copy lands there, and the second half moves right.
>   6. Click the copy and press <kbd>Ctrl</kbd>+<kbd>X</kbd>: it disappears and leaves a gap.
>   7. Click the original video and press <kbd>Ctrl</kbd>+<kbd>D</kbd>: a linked copy of the video and its sound appears right after it.
>   8. Right-click a clip: the menu starts with **Cut**, **Copy**, **Paste**, **Paste insert**, **Paste attributes...** and **Duplicate**, each with its shortcut. Press <kbd>Esc</kbd>.

## In this page
- [Copy and cut clips](#copy-and-cut-clips)
- [Paste clips at the playhead](#paste-clips-at-the-playhead)
- [Choose the tracks pasted clips go to](#choose-the-tracks-pasted-clips-go-to)
- [Paste and make room (Paste insert)](#paste-and-make-room-paste-insert)
- [Know what pasted clips keep](#know-what-pasted-clips-keep)
- [Paste caption cues](#paste-caption-cues)
- [Copy and paste keyframes](#copy-and-paste-keyframes)
- [Paste clips into another project](#paste-clips-into-another-project)
- [Give clips the look of another clip (Paste attributes)](#give-clips-the-look-of-another-clip-paste-attributes)
- [Duplicate clips on the timeline](#duplicate-clips-on-the-timeline)
- [Duplicate a picture in the preview](#duplicate-a-picture-in-the-preview)
- [Messages when you paste](#messages-when-you-paste)
- [Undo a paste or a duplicate](#undo-a-paste-or-a-duplicate)
- [Related pages](#related-pages)

## Copy and cut clips

1. Select the clips on the timeline, or click a picture in the preview.
2. Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy them, or <kbd>Ctrl</kbd>+<kbd>X</kbd> to cut them. You can also right-click a clip and choose **Copy** or **Cut**, or right-click a picture in the preview and choose **Copy**.

- **What is copied.** The selected clips, the clips grouped with them and, while **Linked selection** is on, their linked clips: copying a video also copies its sound. With **Linked selection** off, only the clips you selected are copied. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).
- **Cut** copies the clips and deletes them in one step, named **Cut**. The space they leave stays as a gap, as with <kbd>Delete</kbd>. See [Delete clips](splitting-and-deleting.md#delete-clips).
- **Copy** changes nothing in your project and is not a step in the history.
- The editor keeps one copy at a time: each copy replaces the previous one, also when you copy keyframes. See [Copy and paste keyframes](#copy-and-paste-keyframes).
- Each copy also goes on your computer's clipboard as text, so you can paste the clips in another browser tab. See [Paste clips into another project](#paste-clips-into-another-project).

> **Note:** <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>X</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> work on clips while the Timeline or the Preview panel is active. In the Media panel, <kbd>Ctrl</kbd>+<kbd>V</kbd> imports images instead (see [Paste images](importing-media.md#paste-images)), and while you type in a field or edit a text in the preview, the keys copy and paste text.

## Paste clips at the playhead

1. Move the playhead to where the copied clips should start.
2. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> while the Timeline or the Preview panel is active. You can also right-click a clip and choose **Paste**, or right-click a picture in the preview and choose **Paste**.

- The first copied clip lands at the playhead, and the others keep their distance from it, in time and from track to track.
- Pasted clips cover what lies under them, as an overwrite does: clips there are shortened, split or removed. To keep them, use [Paste insert](#paste-and-make-room-paste-insert).
- The pasted clips are selected, and the playhead jumps to their end. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> again to put another copy right after them.
- Paste as often as you like: the copy stays ready until you copy something else, also when you open another project in the same tab. After a reload, <kbd>Ctrl</kbd>+<kbd>V</kbd> still finds it on your computer's clipboard.
- The **Paste** rows of the menus are dimmed until you copy clips in this tab. In a new tab, press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste what is on your computer's clipboard.

Each paste is one step in the history, named **Paste**.

## Choose the tracks pasted clips go to

Pasted clips go to the targeted tracks: those whose crosshair in the track header is not dimmed. See [Choose the tracks your edits use (target)](tracks.md#choose-the-tracks-your-edits-use-target).

- **Video clips.** The lowest video track you copied from lands on the targeted video track with the lowest number. Clips from higher tracks land on the tracks above it, as far apart as they were. For example, clips copied from V1 and V2 land on V2 and V3 when V1 is not targeted.
- **Audio clips** follow the same rule on the audio tracks: the lowest copied audio track lands on the targeted audio track with the lowest number, such as A1.
- With every track targeted (as in a new project), the copied clips start on V1 and A1, whatever tracks you copied them from. A logo copied from V3 alone lands on V1. To paste it onto V3 again, untarget V1 and V2 first.
- When no track of a kind is targeted, or every targeted one is locked, clips of that kind go back to the tracks they were copied from.
- Tracks that are missing are added, for example a V3 for a block copied from two video tracks.
- When a pasted clip would land on a locked track, nothing is pasted and the message **Can't paste onto a locked track** names the track. Unlock it, or target other tracks.
- Caption cues go to the **CC** track. See [Paste caption cues](#paste-caption-cues).

## Paste and make room (Paste insert)

Paste insert puts the copied clips at the playhead without covering anything.

1. Move the playhead to where the clips should go, for example in the middle of a clip.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>, or right-click a clip and choose **Paste insert**.

- Every unlocked track opens a gap at the playhead, as long as the pasted clips: clips that cross the playhead are split, and everything after it moves right. The pasted clips fill the gap.
- All unlocked tracks move together, also those without pasted clips, so your video and its sound stay in sync. Clips on locked tracks don't move.
- The tracks the clips go to follow the same rules as **Paste**. See [Choose the tracks pasted clips go to](#choose-the-tracks-pasted-clips-go-to).
- The step is named **Paste insert**.

## Know what pasted clips keep

A pasted clip is an exact copy of the one you copied:

| What | What the copy gets |
| --- | --- |
| The clip | The same part of the media, the same length, speed, name and label color |
| The picture | The same position, size, angle, crop, opacity and keyframes |
| Sound | The same volume, **Mute**, volume keyframes and fades |
| Text | The same words, style, preset link and animations |
| Links | Copies of linked clips are linked to each other, not to the originals. A clip copied without its linked partner is not linked. |
| Groups | Copies of grouped clips form a new group of their own. |
| Transitions | A transition comes along when both of its clips were copied. A clip copied without its neighbor loses the transition at that cut. |
| Media | In the same project, the copies use the same media item. In another project, see [Paste clips into another project](#paste-clips-into-another-project). |

## Paste caption cues

Copy cues by selecting them on the **CC** track of the timeline, alone or together with other clips, and press <kbd>Ctrl</kbd>+<kbd>C</kbd>.

- Pasted cues always go to the **CC** track. When the project has no caption track, the paste adds one with the copied captions' style.
- Cues never cover other cues. With **Paste**, when a pasted cue would overlap a cue on the **CC** track, all the pasted clips move together to the nearest frame where the cues fit. When there is no such spot near the playhead, nothing is pasted and the message **No room for the captions** appears. **Paste insert** makes room for the cues instead.

## Copy and paste keyframes

With keyframes selected, <kbd>Ctrl</kbd>+<kbd>C</kbd> copies the keyframes instead of the clip.

1. On a clip's keyframe lane, select the keyframes to copy (<kbd>Shift</kbd>+click for several), or select diamonds on the rubber band of an audio clip.
2. Press <kbd>Ctrl</kbd>+<kbd>C</kbd>.
3. Select the clips to paste onto, and move the playhead to where the first keyframe should go.
4. Press <kbd>Ctrl</kbd>+<kbd>V</kbd>.

- The keyframes land on every selected clip that can take them: **Transform** and **Opacity** keyframes on video, image, solid and text clips; volume keyframes on audio clips and on the sound of selected videos.
- The clips you paste onto don't need keyframes of their own yet.
- They keep their spacing, values and easings. The first one lands at the playhead; one that would land after the end of a clip is left out. A pasted keyframe replaces a keyframe on the same frame.
- <kbd>Ctrl</kbd>+<kbd>X</kbd> with keyframes selected copies them and deletes them; the clip stays.
- <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes keyframes while keyframes are the last thing you copied, also with **Copy keyframes** in the keyframe menu. Copying clips replaces them.
- When no selected clip can take the keyframes, the message **Select a clip to paste keyframes on** appears.
- The step is named **Paste keyframes**. See [Copy keyframes to another clip](keyframes.md#copy-keyframes-to-another-clip) for the keyframe menu.

## Paste clips into another project

Clips you copy also go on your computer's clipboard as text. Paste them into another project, in another browser tab or window, or after you open another project in the same tab.

> **Video placeholder: Paste clips into another project**
> - File: `videos/copy-and-paste/another-project.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. Project A has `shared.mp4` as a video with sound on V1 and A1, and `only-a.mp4` on V2. Click the timeline, press <kbd>Ctrl</kbd>+<kbd>A</kbd>, then <kbd>Ctrl</kbd>+<kbd>C</kbd>.
>   2. Open a second browser tab with the editor and open project B, which has its own `shared.mp4` in the Media panel.
>   3. Click the timeline, put the playhead at 1 second and press <kbd>Ctrl</kbd>+<kbd>V</kbd>: the three clips appear. The message **Pasted with offline media** names `only-a.mp4`.
>   4. Press <kbd>Space</kbd>: the `shared.mp4` clips play from project B's file, and the `only-a.mp4` clip shows a gray slate with "Media offline"; its card in the Media panel shows a red **Offline** badge.
>   5. Click **Relink…** on the `only-a.mp4` card and pick the file: the clip shows its picture.

1. Copy the clips in the first project.
2. Open the other project.
3. Click its timeline, move the playhead, and press <kbd>Ctrl</kbd>+<kbd>V</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>.

**How the clips find their media.** For each copied media item, the editor looks in the project you paste into for an item of the same type (video, audio or image) with the same name, or else with the same file name, that is long enough for the pasted clips. The pasted clips use that item.

**Media the project doesn't have.** When no item matches, the copied item is added to the project as offline media, and the message **Pasted with offline media** names it. Its card shows a red **Offline** badge, and its clips are on the timeline, gray, with a slate in the preview and no sound. To bring them to life, click **Relink…** on the card and pick the file, or use **Relink folder…** to find it by its file name in a folder. The file is copied into the project or linked, as chosen in **Settings** > **Media**. See [Offline media and relinking](offline-media-and-relinking.md). Or press <kbd>Ctrl</kbd>+<kbd>Z</kbd> (it removes the offline item too), import the file into this project, and paste again.

- **Frame rates.** Both projects need the same frame rate. Otherwise nothing is pasted and the message **Can't paste across frame rates** gives both rates. Pasting between frame rates is available in a later version.
- **Which copy Ctrl+V pastes.** <kbd>Ctrl</kbd>+<kbd>V</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> paste the clips on your computer's clipboard, so the latest copy from any Shorts Editor tab. When the clipboard holds something else, for example text you copied in another app, they paste the clips you copied last in this tab.
- **Menu rows** paste the clips you copied last in this tab. Use <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a copy from another tab.
- In a tab where you haven't copied clips yet, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> reads your computer's clipboard. The first time, Chrome may ask whether the site may see the clipboard: allow it.
- After a paste from the clipboard, the pasted clips are this tab's copy too, so the menu rows paste them.

> **Tip:** Pasting copied clips into a text app gives a block of text. That text is the copy: as long as it is on the clipboard, <kbd>Ctrl</kbd>+<kbd>V</kbd> in the editor pastes the clips.

## Give clips the look of another clip (Paste attributes)

Paste attributes gives the selected clips chosen settings of a copied clip, such as the style and animation of a title, while they keep everything else.

> **Video placeholder: Give five titles the look of one**
> - File: `videos/copy-and-paste/paste-attributes.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. Six titles on V2: the first one in yellow Oswald with an outline, turned a little, with the **Pop** in animation; the other five plain and at different places.
>   2. Click the styled title and press <kbd>Ctrl</kbd>+<kbd>C</kbd>.
>   3. Click the second title, then <kbd>Shift</kbd>+click the other four.
>   4. Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>: the **Paste attributes** checklist opens over the timeline with **Onto 5 clips**, and **Transform**, **Opacity**, **Text style**, **Text animations**, **Fades** and **Keyframes**, all checked.
>   5. Uncheck **Transform**, **Opacity** and **Fades**: **Keyframes** dims. Click **Paste**: the five titles turn yellow with the outline and pop in, each at its own place with its own words.
>   6. Hover **Undo** in the app bar: it reads **Undo Paste attributes**. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: all five are plain again.
>   7. Right-click one of them and choose **Paste attributes...**: the checklist opens there, with **Transform**, **Opacity** and **Fades** still unchecked. Press <kbd>Esc</kbd>.

1. Select the clip with the look you want and press <kbd>Ctrl</kbd>+<kbd>C</kbd>.
2. Select the clips to change, for example with a click and <kbd>Shift</kbd>+clicks.
3. Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> while the Timeline or the Preview panel is active, or right-click one of the clips and choose **Paste attributes...**.
4. In the **Paste attributes** checklist, uncheck what should stay as it is. With the keyboard, press <kbd>↓</kbd> or <kbd>↑</kbd> to move between the rows and buttons, and <kbd>Space</kbd> to check or uncheck a row.
5. Click **Paste**, or press <kbd>Enter</kbd>.

The checklist opens where you right-clicked, or over the middle of the active panel. It reads **Onto 1 clip** or **Onto N clips** and lists only the groups the copied clips can give and at least one selected clip can take:

| Group | What it pastes | Clips it changes |
| --- | --- | --- |
| **Transform** | Position, scale, rotation, anchor point and flips | Video, image, solid and text clips |
| **Opacity** | Opacity | Video, image, solid and text clips |
| **Crop** | The crop, fitted to each clip's own picture | Video and image clips |
| **Speed** | The speed. The clips get longer or shorter as with the speed buttons, following the duration link and **Ripple** of the **Speed** section. | Video and audio clips (not freeze frames) and, with **Linked selection** on, their linked clips |
| **Text style** | **Font**, **Weight** and **Italic**, **Size**, **Fill**, **Stroke**, **Shadow**, **Background**, **Align**, **Anchor**, **Spacing**, **Line height** and **Case** of the **Text** section, and the link to the text's preset. The words and the **Box** stay. | Text clips |
| **Text animations** | The **In** and **Out** animations with their settings | Text clips |
| **Audio gain** | The volume and **Mute** | Selected audio clips, and the sound of selected videos |
| **Fades** | The fade in and fade out lengths, shortened to fit a shorter clip | Every selected clip except caption cues, and the sound of selected videos |
| **Keyframes** | How **Transform**, **Opacity** and **Audio gain** arrive (see below) | |

**Keyframes** sits under a line at the bottom of the list, and is dimmed while **Transform**, **Opacity** and **Audio gain** are all unchecked:

- **Checked** (the default): each of those groups brings the copied clip's keyframes in that section. They replace the keyframes the clip had there, start at its first frame, and stop at its end with the motion exact up to there. When the copied clip has no keyframes in that section, the clip's keyframes there are removed.
- **Unchecked**: each of those groups brings the look the copied clip has on its first frame, without keyframes, and removes the clip's keyframes in that section.

Good to know:

- **Which copied clip gives the values.** Each group comes from the clip you clicked last when you copied. When that clip doesn't have the group, it comes from the first copied clip that does. Copy a video with its sound: the picture groups come from the video, **Audio gain** from its sound, and the sound of the clips you change takes the fades of the copied sound.
- **Text style** keeps each text where it is anchored, at its own place in the frame, unless **Transform** is checked too. The texts keep their own words and **Box**.
- Clips on locked tracks don't change.
- Every group starts checked. Groups you leave unchecked when you click **Paste** stay unchecked the next time you open the checklist, until you reload the page; check them again to bring them back.
- **Paste** is dimmed while nothing but **Keyframes** is checked.
- <kbd>Esc</kbd>, **Cancel**, a click outside the checklist or another selection close it without changing anything. The keyboard goes back to the panel you were in.
- **Paste attributes...** in the clip menu is dimmed until you copy clips in this tab. When no clip was copied, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> shows **Copy a clip first**; when the selected clips can take nothing from the copy, **Nothing to paste onto**.
- All the selected clips change in one step, named **Paste attributes**.

## Duplicate clips on the timeline

Duplicate puts a copy of the selected clips right after them, without the clipboard.

1. Select the clips on the timeline.
2. Press <kbd>Ctrl</kbd>+<kbd>D</kbd> while the Timeline panel is active, click **Duplicate** in the quick actions of **Edit Properties**, or right-click a clip and choose **Duplicate**.

- **Where the copies go.** Each copy goes on the track of its original, and the copies keep their distance from each other. They start right where the selection ends. When a clip is in the way on one of the tracks, all the copies go further right together, to the first place where each of them fits. No other clip moves.
- **What is copied.** The selected clips, the clips grouped with them and, while **Linked selection** is on, their linked clips: a video is copied with its sound. Clips on locked tracks are not copied.
- **What the copies keep.** Everything a pasted clip keeps, links, groups and transitions included. See [Know what pasted clips keep](#know-what-pasted-clips-keep).
- The copies are selected. The step is named **Duplicate clip** or **Duplicate clips**.
- To put the copies somewhere else, hold <kbd>Alt</kbd> and drag the clips. See [Duplicate clips](timeline.md#duplicate-clips).

> **Note:** While the Edit Properties or Media panel is active, the browser gets <kbd>Ctrl</kbd>+<kbd>D</kbd> and offers to bookmark the page. Click the timeline first, or use **Duplicate** in the quick actions. See [Keys the browser keeps](keyboard-shortcuts.md#keys-the-browser-keeps).

## Duplicate a picture in the preview

In the preview, Duplicate puts a copy of the selected pictures on top of them, a little lower and to the right, at the same time.

> **Video placeholder: Duplicate a sticker in the preview**
> - File: `videos/copy-and-paste/duplicate-in-preview.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. A video on V1 and a sticker on V2. Click the sticker in the preview and press <kbd>Ctrl</kbd>+<kbd>D</kbd>: a copy appears 20 pixels down and to the right, selected, on a new V3 track.
>   2. Drag the copy to the other side of the frame.
>   3. Right-click the video in the preview and choose **Duplicate**: a V2 track is inserted above V1 with a copy of the video, 20 pixels down and to the right, and no new sound clip appears.
>   4. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the copy and its new track are gone.

1. Click the picture in the preview (<kbd>Shift</kbd>+click to add more). This makes the Preview panel active.
2. Press <kbd>Ctrl</kbd>+<kbd>D</kbd>, or right-click the picture and choose **Duplicate**.

- Each copy moves 20 pixels right and 20 pixels down from its original. A picture animated with keyframes keeps its motion, 20 pixels away.
- Each copy goes on the video track right above its original's track, so it is drawn on top. When that track is locked, muted or hidden, or has a clip at that time, a new video track is added right above the original's track.
- A video's sound is not copied, so the sound is not doubled, and the copy is not linked. Copies of grouped pictures form a group of their own. Copies have no transitions.
- The copies are selected. The step is named **Duplicate layer** or **Duplicate layers**; undo also removes the tracks it added.
- When no picture is selected, for example only an audio clip, <kbd>Ctrl</kbd>+<kbd>D</kbd> in the Preview panel duplicates the selection as on the timeline.

## Messages when you paste

| Message | Why | What to do |
| --- | --- | --- |
| **Can't paste onto a locked track** | A pasted clip would land on the locked track the message names. | Unlock the track, or target other tracks. See [Choose the tracks pasted clips go to](#choose-the-tracks-pasted-clips-go-to). |
| **Can't paste across frame rates** | The clips come from a project with another frame rate. | Paste into a project with the same frame rate. |
| **No room for the captions** | The pasted cues would overlap cues near the playhead. | Move the playhead to where the **CC** track has room, or use **Paste insert**. |
| **Pasted with offline media** (or **Pasted with N offline media**) | The project has no media item that matches the copied one. The clips are pasted as offline clips, with a gray slate and no sound. | Relink the item to its file. See [Paste clips into another project](#paste-clips-into-another-project). |
| **Select a clip to paste keyframes on** | Keyframes were copied last, and no selected clip can take them. | Select a clip of the right kind, or copy clips again. |
| **Copy a clip first** | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> found no copied clips, for example after you copied keyframes. | Copy the clip whose look you want. |
| **Nothing to paste onto** | No clips are selected, or the selected clips can take none of the copied clip's settings. | Select the clips to change. |
| **Can't paste these clips**, **Can't paste these keyframes**, **Can't paste these attributes** | The clipboard holds clips or keyframes the project can't take, for example damaged text. Nothing changes. | Copy the clips again in the editor. |

## Undo a paste or a duplicate

Each of these is one step in the history. Hover over **Undo** in the app bar to see its name.

| Step name | What made it |
| --- | --- |
| **Cut** | <kbd>Ctrl</kbd>+<kbd>X</kbd>, or **Cut** in the clip menu |
| **Paste** | <kbd>Ctrl</kbd>+<kbd>V</kbd>, or **Paste** in the clip menu or the layer menu |
| **Paste insert** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>, or **Paste insert** in the clip menu |
| **Paste keyframes** | <kbd>Ctrl</kbd>+<kbd>V</kbd> with keyframes copied |
| **Delete keyframe**, **Delete keyframes** | <kbd>Ctrl</kbd>+<kbd>X</kbd> with keyframes selected |
| **Paste attributes** | **Paste** in the **Paste attributes** checklist |
| **Duplicate clip**, **Duplicate clips** | <kbd>Ctrl</kbd>+<kbd>D</kbd> in the Timeline panel, or **Duplicate** in the quick actions or the clip menu |
| **Duplicate layer**, **Duplicate layers** | <kbd>Ctrl</kbd>+<kbd>D</kbd> in the Preview panel, or **Duplicate** in the layer menu |

- Undoing a paste also removes the tracks it added, the caption track it added and its offline media.
- Copying is not a step in the history.

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## Related pages
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Editing properties](editing-properties.md)
- [Keyframes](keyframes.md)
- [Titles and text](titles-and-text.md)
- [Captions](captions.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Keyboard shortcuts](keyboard-shortcuts.md#clipboard-and-duplicate)
- [Troubleshooting](troubleshooting.md#copy-paste-and-duplicate)

<sub>Last updated: Batch 41, 2026-10-18</sub>
