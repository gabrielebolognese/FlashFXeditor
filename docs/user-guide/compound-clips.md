# Compound clips

A compound clip turns several clips into one. You can move, scale, rotate, fade and copy it like a single clip, and every copy shows the same content. Use it for a title card made of a background, a text and a logo, or for a scene you want to reuse.

> **Video placeholder: Make a compound clip**
> - File: `videos/compound-clips/overview.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: select a solid and a text clip on the timeline; press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>; set **Opacity** to 50% and **Scale** to 50% on the new clip; press <kbd>Ctrl</kbd>+<kbd>D</kbd> twice and move the copies; right-click a copy and choose **Make unique**; right-click the original and choose **Break apart**.

## In this page
- [Make a compound clip](#make-a-compound-clip)
- [Move and reuse a compound clip](#move-and-reuse-a-compound-clip)
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

> **Note:** Fades on a compound clip do not change its sound yet.

## Limits
- Compound clips nest at most 8 levels deep. A compound cannot contain itself.
- Opening a compound to edit inside it is available in a later version. For now, break it apart to change its clips.

## Related pages
- [Timeline](timeline.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 62, 2026-11-07</sub>
