# Cropping and reframing

Cropping cuts away the sides of a video or image, so only the part you want stays in your video. Use it to turn landscape footage into a full vertical shot in two clicks, to remove black borders or a logo at the edge of a shot, or to show only a detail of a picture. You crop with the **Crop** section of **Edit Properties**, or with handles right on the picture in the preview.

> **Video placeholder: Reframe a landscape video in two clicks**
> - File: `videos/cropping-and-reframing/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A 1080×1920 project with a 1920×1080 landscape video on V1, the playhead over it. The video fills the width of the frame, with bands above and below.
>   2. Click the video in the preview. In **Edit Properties**, the **Crop** section sits between **Transform** and **Opacity**; **L**, **R**, **T** and **B** read **0 px**.
>   3. Click **Crop to frame**: the sides of the picture disappear and a vertical slice from its middle remains. **L** and **R** read **656 px**.
>   4. Click **Fill frame** in the quick actions at the top of the panel: the slice covers the whole frame with no bands, and **Scale** reads **177.8%**.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice: the bands are back.
>   6. Click **%** in the **Units** row, type `10` in **T** and press <kbd>Enter</kbd>: the top tenth of the picture is cut away and **T** reads **10.0%**.
>   7. Drag the **B** label to the right: the bottom of the picture is cut away live while **B** turns gold. Release.
>   8. Click **Reset**: the whole picture is back.

## In this page
- [How cropping works](#how-cropping-works)
- [Reframe a landscape video for a vertical frame](#reframe-a-landscape-video-for-a-vertical-frame)
- [Crop to the frame](#crop-to-the-frame)
- [Crop with the Crop section](#crop-with-the-crop-section)
- [Crop with handles in the preview](#crop-with-handles-in-the-preview)
- [Keep the shape of the crop](#keep-the-shape-of-the-crop)
- [Snap crop edges to the frame](#snap-crop-edges-to-the-frame)
- [Remove a crop](#remove-a-crop)
- [Crop turned, mirrored and phone videos](#crop-turned-mirrored-and-phone-videos)
- [Undo and cancel](#undo-and-cancel)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## How cropping works

A crop cuts away part of the left, right, top and bottom sides of a picture. The part that is left, the visible part, stays exactly where it was in the frame: cropping doesn't move or resize the picture.

- **Video and image clips** can be cropped. Audio clips have no picture.
- **The whole clip.** A crop applies to every frame of the clip. Both halves of a split clip keep it, and so does a copy.
- **Media pixels.** A crop is measured in pixels of the media itself, not of the project frame. Cropping 100 px from the left of a 1920×1080 video removes 100 of its 1920 columns, however large the picture is shown. You can also crop in percent of the media's width (left and right) or height (top and bottom).
- **Something always stays.** A crop always leaves at least 1 pixel of the media visible across and down.
- **The visible part is the layer.** In the preview, the gold outline, the box and its handles go around the visible part. A click on a cropped-away area selects the picture below it, or nothing. **Fit in frame**, **Fill frame** and **Center in frame** size and center the visible part.
- **Everywhere.** The cut-away parts don't show in the preview, in fullscreen or in frames you save with **Export frame**.
- **Saved with the project.** Each change to a crop is one step in the history. See [Undo and cancel](#undo-and-cancel).

## Reframe a landscape video for a vertical frame

A 16:9 landscape video in a 9:16 project fills the width of the frame, with bands above and below. Two clicks turn it into a full-frame vertical shot taken from its middle:

1. Select the video clip, on the timeline or in the preview.
2. In **Edit Properties**, click **Crop to frame** in the **Crop** section. The sides of the picture are cut away, and a slice with the frame's shape remains in its middle.
3. Click **Fill frame** in the quick actions at the top of the panel. The slice now covers the whole frame exactly, with no bands.

| Step | A 1920×1080 video in a 1080×1920 project |
| --- | --- |
| Added to the timeline | Fits the width: 1080×607.5 pixels in the frame, **Scale** 56.3%, bands above and below |
| **Crop to frame** | **L** and **R** read **656 px** (**34.2%**): a 9:16 slice of the video, 607.5 pixels wide and 1080 high, remains at the same size and place |
| **Fill frame** | The slice fills the frame: **Scale** 177.8%, no bands |

To keep another part than the middle, for example a speaker on the left of the shot:

1. Select the video and click **Fill frame**. The picture covers the frame, and its sides reach past the left and right edges of the frame.
2. Drag the picture sideways in the preview until the part you want is in the frame. Hold <kbd>Shift</kbd> to keep it from moving up or down.
3. Click **Crop to frame**. Everything outside the frame is cut away.

> **Tip:** **Fill frame** alone also covers the frame, but the parts outside the frame still belong to the picture: they come back into view when you move, shrink or turn it, and the gold box reaches past the frame. After **Crop to frame**, the box lies exactly on the frame.

## Crop to the frame

**Crop to frame** (tooltip **Crop to the frame at the current transform**) sets the crop so that the visible part of the picture is the project frame. It doesn't move, resize or turn the picture.

| The picture | What **Crop to frame** keeps |
| --- | --- |
| Covers the whole frame, for example after **Fill frame** | Exactly the part inside the frame. |
| Covers only part of the frame, for example fitted with bands | The largest area with the frame's shape inside the part of the frame the picture covers, from its middle. **Fill frame** then fills the frame with it exactly. |
| Is turned by an angle | An area with the frame's shape, turned with the picture, that lies inside both the frame and the picture. It is not always the largest possible area. |
| Lies entirely outside the frame | Nothing: the crop stays as it is. |

- It acts on every selected video and image clip, also on those that are not under the playhead. Clips on locked tracks are skipped.
- It replaces the crop the picture had.
- Each click is one step in the history, named **Crop to frame**. When the crop is already right, nothing changes and no step is added.

## Crop with the Crop section

Select one or more video or image clips. The **Crop** section of **Edit Properties** shows between **Transform** and **Opacity**.

| Row | What it does |
| --- | --- |
| **Left / Right** | **L** and **R**: how much is cut from the left and the right side. |
| **Top / Bottom** | **T** and **B**: how much is cut from the top and the bottom. |
| **Units** | **px** (tooltip **Crop in media pixels**) or **%** (tooltip **Crop in percent of the media**): the unit of the four fields. |
| **Aspect** | The chain button. While it is lit, a change to one side keeps the shape of the visible part. See [Keep the shape of the crop](#keep-the-shape-of-the-crop). |
| **Crop to frame** | See [Crop to the frame](#crop-to-the-frame). |
| **Reset** | Removes the crop. See [Remove a crop](#remove-a-crop). |
| The crop button in the section header | Turns crop mode on or off in the preview. See [Crop with handles in the preview](#crop-with-handles-in-the-preview). |

The four fields work like the other number fields: type a value and press <kbd>Enter</kbd>, press <kbd>↑</kbd> or <kbd>↓</kbd> (<kbd>Shift</kbd>: 10 at a time), or drag the letter at their left (<kbd>Shift</kbd>: 10 times faster, <kbd>Alt</kbd>: 10 times slower). See [Type a value](editing-properties.md#type-a-value) and [Drag a value](editing-properties.md#drag-a-value).

- **0** means nothing is cut from that side.
- In **px**, the fields show whole pixels of the media, for example **656 px**. In **%**, they show one decimal, for example **34.2%**, and go up to 100.
- A side stops where only 1 pixel of the media would be left: it can't cut past the opposite side.
- While you drag a letter, the preview crops live. The release is one step in the history, named **Change crop**. Arrow presses less than 0.3 seconds apart are one step together.
- While you drag a crop handle in the preview, the four fields count along.
- **Several clips.** A field whose values differ shows `--`. A typed value gives every selected picture that crop: in **px** the same number of media pixels, in **%** the same share of each picture. A letter drag or an arrow press changes each picture's crop by the same amount. A video's linked sound is left alone, and clips on locked tracks keep their crop.
- The unit you choose applies to every clip and stays until you reload the page. It is not saved with the project.

## Crop with handles in the preview

> **Video placeholder: Crop with handles in the preview**
> - File: `videos/cropping-and-reframing/crop-handles.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1080×1920 project with a 1920×1080 landscape video on V1, fitted with bands above and below, the playhead over it. Double-click the picture in the preview.
>   2. White brackets appear at its corners and white bars in the middle of its sides, a dashed gold outline runs around the picture, and the **Crop** chip appears at the top of the preview with **Reset crop** and **Done**. The crop button in the **Crop** section header is lit.
>   3. Drag the left bar to the right: the left side is cut away live, the readout next to the pointer shows for example **L 480 · 1440 × 1080**, and **L** in the **Crop** section counts along. Release.
>   4. Drag the right bar slowly to the left until it is two thirds across the frame: it holds there, and a gold line runs from the top to the bottom of the frame. Release.
>   5. Hold <kbd>Alt</kbd> and drag the top bar down: the top and the bottom move in together.
>   6. Hold <kbd>Shift</kbd> and drag the bottom-right bracket inward: the visible part shrinks and keeps its shape.
>   7. Drag inside the box: the cropped picture moves.
>   8. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the picture moves back. Click **Reset crop** in the chip: the whole picture is back, with the dashed outline on its edge.
>   9. Press <kbd>Esc</kbd>: the chip disappears and the usual square handles are back.

1. Double-click the picture in the preview. Or select it and click the crop button in the header of the **Crop** section (tooltip **Crop on the canvas (or double-click the layer)**).
2. Crop mode is on:
   - The picture is the only picture selected.
   - White brackets sit at the corners of its visible part and white bars in the middle of its sides, in place of the square handles.
   - A dashed gold outline shows the whole picture, including the parts that are cut away.
   - The **Crop** chip floats at the top of the preview, with **Reset crop** (the circular arrow) and **Done**.
   - The crop button in the **Crop** section header is lit.
3. Drag a bar to move that side, or a bracket to move both sides at that corner. The cut follows the pointer.
4. Release. Each drag is one step in the history, named **Crop layer**.
5. To leave crop mode, click **Done**, press <kbd>Esc</kbd>, double-click the picture again, or click the crop button in the section header again.

| Drag | What changes |
| --- | --- |
| A bar | That side. |
| A bracket | The two sides at that corner. |
| With <kbd>Shift</kbd> | The visible part keeps its shape: a bracket scales it from the opposite corner, and a bar makes the other two sides follow around the middle. While the **Aspect** lock is on, <kbd>Shift</kbd> frees the shape instead. See [Keep the shape of the crop](#keep-the-shape-of-the-crop). |
| With <kbd>Alt</kbd> | The opposite side moves by the same amount the other way, so the visible part stays centered. A bracket with the shape kept scales the visible part around its center. |

- A side can't go past the edge of the picture (the dashed outline), and at least 1 pixel stays visible. Drag a side back out to the dashed outline to show that part again.
- While you drag, a readout next to the pointer shows the crop of the sides you move, in media pixels, then the size of the visible part. For example, **L 480 · 1440 × 1080** means 480 pixels cut from the left, leaving 1440×1080 pixels.
- You can press and release <kbd>Shift</kbd>, <kbd>Alt</kbd> and <kbd>S</kbd> during the drag; the crop follows at once.
- A drag inside the box moves the picture together with its crop, as outside crop mode.
- In crop mode, the picture has no rotate zones outside its corners, and <kbd>Alt</kbd> shows neither the anchor marker nor the distances. To turn the picture, leave crop mode, or type an angle in **Rotation**.
- The brackets and bars turn with the picture. The bars hide when a side is shorter than 28 pixels on screen; zoom the preview in to get them back.
- A drag pauses playback.
- Like any box in the preview, the brackets and bars show only while the playhead is over the clip.

When crop mode ends by itself:

- When you select something else: another picture, an empty part of the frame, or another clip on the timeline. The picture's linked sound may stay selected with it.
- When the clip is deleted, or its track is locked.

Good to know:

- Crop mode works on one picture at a time. With several pictures selected, the crop button in the section header is dimmed (tooltip **Crop on the canvas: select one layer**). A double-click selects the picture alone, without its linked sound or its group.
- A double-click on another picture moves crop mode to that picture.
- Pictures on locked tracks can't be cropped.
- <kbd>Esc</kbd> works in every panel. During a drag, the first press cancels the drag and the next leaves crop mode. In the fullscreen preview, the press after that leaves fullscreen.
- Crop mode is not a step in the history and is not saved: a project always opens without it.

## Keep the shape of the crop

The chain button in the **Aspect** row keeps the shape of the visible part, its width compared to its height in media pixels. Its tooltip reads **Lock the crop aspect** while it is off and **Unlock the crop aspect** while it is lit.

- While it is lit, changing one side makes the other direction follow. For example, type a larger **T**: **L** and **R** grow together so the visible part keeps its shape around its middle.
- When the following sides reach the edge of the picture, the visible part shifts to stay inside it. Where it can't grow any further, the side you change stops.
- In crop mode, the lock applies to the brackets and bars too, and <kbd>Shift</kbd> during a drag does the opposite of the lock.
- The lock starts off. It stays as you set it, for every clip, until you reload the page. It is not saved with the project and is not a step in the history.

> **Note:** The chain button between **W** and **H** in the **Transform** section is a different lock: it keeps the shape of the picture's scale. See [Place a picture with exact values](editing-properties.md#place-a-picture-with-exact-values).

## Snap crop edges to the frame

While **Snap** is on, a side you drag in crop mode snaps when it comes within 6 pixels on screen of:

- the left, right, top or bottom edge of the frame;
- the vertical or horizontal center line of the frame;
- the lines that divide the frame in thirds, also when the **Thirds** grid is not shown.

A gold line across the frame shows the target.

- Hold <kbd>S</kbd> during the drag to do the opposite of the **Snap** setting. See [Place a layer without snapping](snapping-and-smart-guides.md#place-a-layer-without-snapping).
- Crop sides snap only while the picture is upright: not rotated, or rotated by an exact multiple of 90°.
- Crop sides don't snap to other pictures or to the safe areas, and **Smart guides** doesn't change crop snapping.
- Typed values and letter drags in the **Crop** section don't snap.

## Remove a crop

- Click **Reset** in the **Crop** section (tooltip **Reset crop**). It removes the crop from every selected video and image clip, in one step named **Reset crop** (**Reset crops** for several).
- In crop mode, **Reset crop** in the chip does the same.
- To uncrop one side, type `0` in its field, or drag its bar back to the dashed outline.

> **Note:** **Reset transform** leaves the crop as it is. It places the picture as a new clip, as if it were not cropped, so a cropped part can end up off center: click **Fit in frame** or **Center in frame** afterward. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture).

## Crop turned, mirrored and phone videos

The four sides are the sides of the picture itself, as it looks before you turn it:

- **Phone videos recorded upright** are cropped upright, as you see them. **L** cuts the left side of the upright picture.
- **Mirrored pictures.** **L** always cuts the side you see on the left of the picture, also after **Flip horizontal**. Flipping a cropped picture keeps the crop on the same sides: the whole picture is mirrored, then cropped as before.
- **Turned pictures.** The sides turn with the picture: with **Rotation** at 90°, **L** cuts the side that is now at the top. In crop mode, the brackets and bars sit on the turned sides, so you drag the side you see.

## Undo and cancel

- Press <kbd>Esc</kbd> before you release the mouse button to cancel a handle drag or a letter drag. The crop goes back, and nothing is added to the history.
- A handle drag is also cancelled when the browser window loses focus, or when you undo during the drag.
- Turning crop mode on or off, the unit and the **Aspect** lock are not steps in the history.

| Step name | What made it |
| --- | --- |
| **Crop layer** | Dragging a bracket or a bar in crop mode |
| **Change crop** | A typed value, a letter drag or a quick series of arrow presses in the **Crop** section |
| **Crop to frame** | **Crop to frame** |
| **Reset crop**, **Reset crops** | **Reset** in the **Crop** section, or **Reset crop** in the chip |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- Crops that change over time (keyframes): a crop applies to the whole clip.
- Copying the crop of one clip to other clips.

## Related pages
- [Editing properties](editing-properties.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Preview and playback](preview-and-playback.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 26, 2026-10-16</sub>
