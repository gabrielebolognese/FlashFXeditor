# Compound clips

A compound clip turns several clips into one. You can move, scale, rotate, fade and copy it like a single clip, and every copy shows the same content. Use it for a title card made of a background, a text and a logo, or for a scene you want to reuse.

> **Video placeholder: Make a compound clip**
> - File: `videos/compound-clips/overview.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: select a solid and a text clip on the timeline; press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>; set **Opacity** to 50% and **Scale** to 50% on the new clip; press <kbd>Ctrl</kbd>+<kbd>D</kbd> twice and move the copies; right-click a copy and choose **Make unique**; right-click the original and choose **Break apart**.

> **Video placeholder: Edit inside a compound clip**
> - File: `videos/compound-clips/edit-inside.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: duplicate a compound clip; double-click the first copy; the breadcrumb reads **Project** > **Compound 1**; double-click the text and change it; press <kbd>Esc</kbd> twice; both copies show the new text; open the **Compounds** bin in the **Media** tab and drag its card onto the timeline.

## In this page
- [Make a compound clip](#make-a-compound-clip)
- [Move and reuse a compound clip](#move-and-reuse-a-compound-clip)
- [Edit inside a compound clip](#edit-inside-a-compound-clip)
- [Use the Compounds bin](#use-the-compounds-bin)
- [Make a copy unique](#make-a-copy-unique)
- [Break apart a compound clip](#break-apart-a-compound-clip)
- [Sound in a compound clip](#sound-in-a-compound-clip)
- [Limits](#limits)

## Make a compound clip
1. Select the clips on the timeline. Include at least one picture, text, shape or compound clip. Audio clips can come along.
2. Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>, click **Make compound clip** in the **Edit** group of the timeline toolbar, or right-click a selected clip and choose **Make compound clip**.

The new clip sits on the lowest video track you used and covers the same time. The picture does not change. Undo puts the original clips back.

If the button or menu row is disabled, hover it to read the reason. For example, other clips on the same track sit between the selected ones, or no picture clip is selected.

## Move and reuse a compound clip
Move, trim, split, scale, rotate, fade and set the opacity of a compound clip like any other clip. Everything inside moves as one picture.

To reuse it, select it and press <kbd>Ctrl</kbd>+<kbd>D</kbd> (**Duplicate**). Every copy shows the same content. You can trim a copy to show only part of it. Slip and trim stay inside the compound's length.

## Edit inside a compound clip
1. Double-click the compound clip on the timeline, or select it and press <kbd>Enter</kbd>. You can also press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>O</kbd> or right-click it and choose **Open compound**.
2. The timeline shows the tracks inside. The preview shows only the compound's content, at its own size. A bar above the timeline shows where you are, for example **Project** > **Compound 1**.
3. Edit as you do on the main timeline: trim, split, move, add text, change properties. Every copy of the compound shows your changes.
4. To go back, press <kbd>Esc</kbd>, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>U</kbd>, or click **Project** in the bar.

When you close a compound, the playhead returns to where it was and the compound is selected. If you opened a compound inside another one, <kbd>Esc</kbd> goes up one level. Click a name in the bar to jump to that level.

Playback inside a compound plays only that compound. Undo and redo work inside, outside and across opening and closing. Opening and closing are not undo steps. If you undo the step that made the compound while you are inside it, it closes by itself.

> **Note:** While a compound is open, the frame size, frame rate and background belong to the project. Changing them shows a message instead. Captions and transcription are not available inside a compound. Markers, in and out points and the export range stay the project's. **Export** always exports the whole project.

> **Note:** If an edit inside makes a clip end after the compound's end, the compound grows to hold it. It never shrinks by itself. A reload opens the project, not the compound you had open.

## Use the Compounds bin
Every compound of the project is listed in the **Compounds** bin of the **Media** tab. Each card shows a preview picture, its length, its size and how often it is used (**Used 2×**).

- Drag a card onto the timeline to add another copy at the drop point, or onto the preview.
- Double-click a card to add a copy at the playhead.
- A compound cannot hold itself: dropping a card into the compound it belongs to adds nothing.

Compound clips on the timeline also show a small picture of their content.

> **Note:** You cannot rename a compound yet.

## Make a copy unique
Right-click a copy and choose **Make unique** (also **Make compound clip unique** in the command palette). The copy gets content of its own, so changes to one no longer affect the other.

## Break apart a compound clip
1. Select the compound clip.
2. Click **Break apart compound clip** in the toolbar, or right-click it and choose **Break apart**.

The inner clips return to the timeline at their original times. Break apart is disabled, with the reason as a tooltip, when it would change the picture:

- the compound has a transform, an opacity change, fades, keyframes or a volume change;
- its content has a different frame size than the project;
- it is trimmed through one of its clips;
- its track is locked.

Remove the transform, opacity, fades or keyframes first, then try again.

## Sound in a compound clip
Audio clips inside a compound play at the compound's place and with the compound's volume, in playback and in the export. A trimmed copy plays the matching part of the sound.

> **Note:** Fades on a compound clip, and transitions inside it, do not change its sound yet.

## Limits
- Compound clips nest at most 8 levels deep. A compound cannot contain itself.

## Related pages
- [Timeline](timeline.md)
- [Organizing media](organizing-media.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 63, 2026-11-07</sub>
