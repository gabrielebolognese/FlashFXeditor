# Blend modes and track mattes

Blend modes change how a layer mixes with the picture below it, for light leaks, textures and overlays. A track matte uses another clip's shape or brightness to decide which parts of a layer show. You set both in the **Compositing** section of **Edit Properties**.

> **Video placeholder: Blend modes and track mattes overview**
> - File: `videos/blend-modes-and-track-mattes/overview.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows: a video clip on the lowest track and a light-leak clip above it; select the leak; in **Compositing** open **Blend** and pick **Screen**, then **Multiply**; add a text clip above, select the video, open **Matte**, pick the text, choose **Alpha**; select the text and switch on **Matte only**; play the result.

## In this page
- [Change the blend mode](#change-the-blend-mode)
- [Use a track matte](#use-a-track-matte)
- [Hide the matte clip](#hide-the-matte-clip)
- [Limits](#limits)
- [Related pages](#related-pages)

## Change the blend mode
1. Select one or more picture clips (video, image, shape, solid, text or compound) on the timeline.
2. In **Edit Properties**, find the **Compositing** section, after **Opacity**.
3. Open the **Blend** list and pick a mode.

| Group | Modes |
| --- | --- |
| Plain | **Normal** (the default), **Add** |
| Darker | **Darken**, **Multiply**, **Color Burn** |
| Lighter | **Lighten**, **Screen**, **Color Dodge** |
| Contrast | **Overlay**, **Soft Light**, **Hard Light** |
| Difference | **Difference**, **Exclusion** |

The preview, the export and the command line all show the same result. Every mode is also a command in the command palette, named **Blend: Screen**, **Blend: Multiply** and so on.

> **Tip:** **Screen** and **Add** lighten the picture, so they suit light leaks and glows on black. **Multiply** darkens it, so it suits textures on white paper.

## Use a track matte
1. Select the clip that should be cut by the matte.
2. In **Compositing**, open the **Matte** list. It offers **None** and the other picture clips of the same sequence, with their track names.
3. Pick the matte clip. The **Mode** row turns on.
4. Open **Mode** and choose how the matte is read:

| Mode | The clip shows where the matte is |
| --- | --- |
| **Alpha** | Opaque |
| **Alpha inverted** | Transparent |
| **Luma** | Bright |
| **Luma inverted** | Dark |

A half transparent matte pixel shows the clip half. To remove a matte, pick **None**, or run **Remove track matte** from the command palette. **Mode** is disabled, with the tooltip "Pick a matte first", until a matte is picked.

## Hide the matte clip
Switch on **Matte only** to hide a clip so that it is drawn only as another clip's matte. Picking a matte turns this on for the matte clip for you, unless that clip is locked or selected. You can still select a matte-only clip in the preview. Smart guides skip it. The command palette has **Use as matte only (toggle)**.

> **Note:** A matte clip that is off the frame at some moment gives an empty matte then, so the clip shows nothing.

## Limits
- A matte must be in the same sequence as the clip. The list shows only those.
- A clip cannot be its own matte, and sound clips cannot be mattes.
- A clip inside a transition follows the whole transition picture, using the blend and matte of the side that dominates.
- A 2.5D layer keeps its 3D tilt, and its matte follows it.
- Blends do not nest: a clip with a blend or matte inside a compound that has its own draws plainly.
- A compound cannot be made from a clip without its matte: the editor refuses.
- A clip cannot have a mask and a matte yet; masks come in a later version.
- Pasting attributes does not carry blend or matte yet.
- With several clips selected, a blank field means they differ.
- These commands have no keyboard shortcut by default. Set your own in **Settings** > **Shortcuts**.

## Related pages
- [Editing properties](editing-properties.md)
- [Fades and transitions](fades-and-transitions.md)
- [3D layers](3d-layers.md)
- [Masks](masks.md)
- [Compound clips](compound-clips.md)
- [Titles and text](titles-and-text.md)

<sub>Last updated: Batch 72, 2026-11-09</sub>
