# Masks

A mask shows only part of a layer. Use a rectangle, an ellipse or a shape you draw to reveal a title, make a spotlight or cut a picture out. You add and tune masks in the **Masks** section of **Edit Properties** and reshape them with handles in the preview.

> **Video placeholder: Masks overview**
> - File: `videos/masks/overview.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: select a video clip; in **Masks** click **Add ellipse mask**; set **Feather** to `40`; click **Edit masks on the canvas** and drag the handles; add a rectangle, set its mode to **Subtract**, tick **Invert**; select a title and click **Wipe in**; play.

## In this page
- [Add a mask](#add-a-mask)
- [Edit a mask in the preview](#edit-a-mask-in-the-preview)
- [Combine, invert and order masks](#combine-invert-and-order-masks)
- [Animate a mask](#animate-a-mask)
- [Use the reveal presets](#use-the-reveal-presets)
- [Limits](#limits)
- [Related pages](#related-pages)

## Add a mask
1. Select one clip that shows a picture: video, image, text, solid, shape or compound.
2. In **Edit Properties**, open the **Masks** section, after **Compositing**.
3. On the **Add** row, click **Add rectangle mask**, **Add ellipse mask** or **Add path mask**.
4. Set the numbers of the mask block that appears (**Mask 1**).

| Field | What it does |
| --- | --- |
| **X**, **Y**, **Width**, **Height** | Position and size of a rectangle or ellipse, in pixels of the clip's picture. |
| **Roundness** | Rounds the corners of a rectangle. |
| **Feather** | Softens the edge, 0 to 2048 px. |
| **Expansion** | Grows (positive) or shrinks (negative) the shape, -2048 to 2048 px. |
| **Opacity** | How strongly the mask applies, 0 to 100%. |

**Remove masks** on the **Add** row deletes every mask of the clip. The trash button of a block (**Remove mask**) deletes just that one. Each change is one undo step.

> **Note:** A mask limits the clip's own picture. Nothing shows outside the picture's box, even if the mask reaches past it.

## Edit a mask in the preview
1. Select the clip.
2. Click **Edit masks on the canvas**, or press <kbd>Alt</kbd>+<kbd>M</kbd>.
3. Drag the handles. The outline is dashed for a subtracting or inverted mask.
4. Press <kbd>Esc</kbd> to leave mask mode. Changing the selection also leaves it.

- Drag a box handle to resize. Hold <kbd>Shift</kbd> to keep the proportions.
- Drag inside the box to move it.
- Drag the diamond handle to the right of the box to set **Feather**.
- On a path mask, drag a point to move it, double-click a segment to add a point, and <kbd>Alt</kbd>+click a point to delete it.

A drag is one undo step.

> **Note:** On a 3D layer the handles are drawn flat, and they catch up with a number field scrub when you let go.

## Combine, invert and order masks
Each mask has a mode list: **Add**, **Subtract** or **Intersect**. Masks combine from the first to the last. **Add** joins shapes, **Subtract** cuts a hole, **Intersect** keeps only the overlap. Switch on **Invert** to keep the outside of the mask instead of the inside. The arrow buttons (**Move mask up**, **Move mask down**) change the order.

A masked clip can also be a track matte: it keys through its own masks. See [Blend modes and track mattes](blend-modes-and-track-mattes.md).

## Animate a mask
Every number of a mask has a stopwatch (**Animate** ...) and a keyframe diamond (**Add ... keyframe**), like other properties. A rectangle whose **Width** goes from 0 to full reveals a title from left to right. A path mask has a stopwatch on its **Path** row: key two shapes with the same number of points and the shape morphs between them. See [Keyframes](keyframes.md).

## Use the reveal presets
On the **Presets** row:
- **Wipe in** adds a rectangle that grows from 0 to the full width.
- **Circle reveal** adds an ellipse that grows until it covers the picture.

Both start at the clip's start and last 1 second. Change the keys afterwards if you want.

## Limits
- Masks ignore the clip's flips: a flipped clip is mirrored after it is masked.
- In a transition, the masks of the clip that dominates the frame apply.
- A compound's inner masked clips draw plainly inside an outer blend or matte.
- Mask tracking is not available yet.
- The mask edge is computed at up to 2048 px on the long side.

## Related pages
- [Blend modes and track mattes](blend-modes-and-track-mattes.md)
- [Keyframes](keyframes.md)
- [Editing properties](editing-properties.md)
- [3D layers](3d-layers.md)

<sub>Last updated: Batch 73, 2026-11-09</sub>
