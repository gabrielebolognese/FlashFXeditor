# Shapes and images

Solids are shapes you add with one click: a rectangle, a rounded rectangle, an ellipse or a line, filled with a color or a two-color gradient. Use them as color backgrounds, bars behind a title, frames and dividers. Images bring in logos, stickers and pictures: **Add image** picks and places them in one go, animated GIF and WebP stickers play at their own speed, and SVG logos stay sharp at any zoom.

> **Video placeholder: Shapes and images in one minute**
> - File: `videos/shapes-and-images/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and A1, the playhead at the start. Click **Add solid** (the square) in the timeline toolbar: a white rounded rectangle appears in the middle of the preview, selected, on a new track V2, and **Edit Properties** shows the **Solid** section under **Clip**.
>   2. Click **Gradient** in the **Fill** row: the shape fades from white at the top to black at the bottom. Click the **Bottom** swatch and drag in the picker toward red: the gradient follows while you drag.
>   3. Drag the **Radius** label to the right: the corners get rounder while you drag, until the ends are half circles.
>   4. Drag the bottom-right handle of the shape in the preview outward: the shape grows, the readout shows **812 × 406 px**, and **Scale** in **Transform** stays at **100.0%**.
>   5. Click **Ellipse** in the **Shape** row: the shape becomes an oval. Click **Line**: it becomes a thin bar.
>   6. Click **Add image** (the picture with a plus). In the file picker, pick an animated sticker GIF and click **Open**: the sticker appears in the middle of the frame on V3, and its clip shows its frames side by side on the timeline.
>   7. Press <kbd>Space</kbd>: the sticker moves at its own speed over the video and starts over when it reaches its end. Press <kbd>Space</kbd> again.
>   8. Click **Add image** again and pick an SVG logo. Choose **400%** in the preview **Zoom** menu: after a moment, the edges of the logo are crisp.

## In this page
- [Add a shape](#add-a-shape)
- [Choose the shape](#choose-the-shape)
- [Fill a shape with a color or a gradient](#fill-a-shape-with-a-color-or-a-gradient)
- [Set the size and the corner radius](#set-the-size-and-the-corner-radius)
- [Resize a shape in the preview](#resize-a-shape-in-the-preview)
- [Move, turn and fade shapes](#move-turn-and-fade-shapes)
- [Add an image](#add-an-image)
- [Use animated GIF and WebP images](#use-animated-gif-and-webp-images)
- [Keep SVG images sharp](#keep-svg-images-sharp)
- [Shapes and images on the timeline](#shapes-and-images-on-the-timeline)
- [Undo shape and image changes](#undo-shape-and-image-changes)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## Add a shape

1. Put the playhead where the shape should start.
2. Click **Add solid** (a square) in the **Add** group of the timeline toolbar.

A new solid appears in the middle of the frame, selected, and **Edit Properties** shows its **Solid** section right after **Clip**.

| What you get | In a 1080×1920 project |
| --- | --- |
| A white rounded rectangle, 60% of the frame's shorter side wide and 30% of it high, with corners rounded by 5% of it | 648×324 pixels, corners of 54 pixels |
| Centered in the frame, at 100% scale | **Position** 0, 0 |
| 5 seconds long, from the playhead (the **Solid** length in **Settings** > **General**) | 150 frames at 30 fps |
| A clip named **Solid** | |

- **Track.** The solid goes on the top video track when that track is unlocked, not hidden, and free for the whole length. Otherwise a new video track is created above the others.
- The sizes follow the shorter side of the frame, so a 1920×1080 project gets the same 648×324 shape, and a 720×1280 project a 432×216 one.
- A solid has no media behind it: trim it to any length, split it and move it like any other clip. See [Trim a clip](trimming.md#trim-a-clip).
- Adding a solid is one step in the history, named **Add solid**.
- **Add solid** has no keyboard shortcut by default. Run it from the command palette (type `solid`), or give it a key in **Settings** > **Shortcuts**. See [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md).

## Choose the shape

> **Video placeholder: Style a shape**
> - File: `videos/shapes-and-images/style-a-shape.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A selected white rounded rectangle from **Add solid**. In the **Solid** section, click **Rectangle**: the corners turn square and the **Radius** field is dimmed. Click **Rounded rectangle**: the corners are round again.
>   2. Click in **W**, type `1080` and press <kbd>Enter</kbd>: the shape runs across the whole width. Type `200` in **H**.
>   3. Click the **Color** swatch and pick a dark blue: the bar is blue. Click **Gradient**: **Color** becomes **Top** and a **Bottom** row appears; the bar fades from blue to black.
>   4. Click the **Opacity** field, type `70` and press <kbd>Enter</kbd>: the video shows through the bar.
>   5. Click **Ellipse**, then type `400` in both **W** and **H**: a circle. Click **Line**: a thin bar 400 pixels long with round ends.

In the **Shape** row of the **Solid** section, click one of four buttons. Point at a button to see its name.

| Button | The shape |
| --- | --- |
| **Rectangle** | A box with square corners. **Radius** is dimmed. |
| **Rounded rectangle** | A box whose corners are rounded by **Radius**. |
| **Ellipse** | An ellipse that fills the box: give **W** and **H** the same value for a circle. **Radius** is dimmed. |
| **Line** | A horizontal bar: **W** is its length and **H** its thickness. **Radius** rounds its ends. |

- **Choosing Line** makes the shape thin: its height becomes 1/135 of the frame's shorter side (8 pixels in a 1080×1920 project), unless it is already thinner. Its length stays. The ends of a new line are fully rounded; type `0` in **Radius** for square ends.
- **Going back from Line** to another shape gives the box at least half its length as height, so a 648-pixel line becomes a 648×324 box.
- For a vertical line, type `90` in **Rotation** in the **Transform** section. See [Place a picture with exact values](editing-properties.md#place-a-picture-with-exact-values).
- With several solids selected, a click changes all of them. When their shapes differ, no button is lit.
- Each click is one step in the history, named **Change shape**.

## Fill a shape with a color or a gradient

The **Fill** row has two buttons: **Solid** (tooltip **Solid color**) and **Gradient** (tooltip **Vertical gradient**).

| Fill | Rows below it | What you see |
| --- | --- | --- |
| **Solid** | **Color** | The whole shape in one color. |
| **Gradient** | **Top** and **Bottom** | A smooth blend from the **Top** color at the top edge of the shape to the **Bottom** color at its bottom edge. |

1. Select the solid.
2. Click **Solid** or **Gradient** in the **Fill** row.
3. Click a swatch (**Color**, **Top** or **Bottom**) to open the color picker, or click in its hex code and type a color.

- Clicking **Gradient** the first time keeps the shape's color at the top and puts black at the bottom. Clicking **Solid** goes back to one color: the **Top** color.
- While you drag in the color picker, the shape in the preview follows live. Release to apply the color. See [Pick a color](editing-properties.md#pick-a-color).
- A color with a lower **A** (opacity) makes the shape see-through in that color only; a gradient can fade from a solid color to a fully transparent one. To fade the whole shape, use **Opacity**.
- The gradient always runs from the top to the bottom of the shape itself: when you turn the shape, the gradient turns with it, and **Flip vertical** swaps its two colors.
- Each color you apply, and each click on **Solid** or **Gradient**, is one step in the history, named **Change fill**.

> **Note:** Gradients are vertical and have two colors. To get a sideways gradient, turn the shape by 90° and swap its **W** and **H**.

## Set the size and the corner radius

| Row | Fields | Range | What it sets |
| --- | --- | --- | --- |
| **Size** | **W** and **H**, in **px** | 1 to 16384 | The width and the height of the shape in pixels of the project frame, at 100% scale. For a line, its length and its thickness. |
| **Radius** | The rounded-corner icon, in **px** | 0 to 8192 | How round the corners of a rounded rectangle are, or the ends of a line. Dimmed for **Rectangle** and **Ellipse**. |

- The fields hold whole pixels. Type a value, press <kbd>↑</kbd> or <kbd>↓</kbd> (with <kbd>Shift</kbd>: 10 at a time), or drag the field's label. See [Type a value](editing-properties.md#type-a-value) and [Drag a value](editing-properties.md#drag-a-value).
- While you drag a label, the preview and the gold box around the shape follow at once. Release to keep the value, or press <kbd>Esc</kbd> to cancel.
- **Radius** never rounds more than half of the shorter side. A 648×324 shape with a radius of 162 or more has half-circle ends: a pill. A smaller shape draws a large radius smaller, and gets it back when it grows again.
- The **Scale** of the **Transform** section multiplies the size: a 648×324 shape at 50% scale covers 324×162 pixels of the frame. Change **W** and **H** instead to keep the corners and the line thickness exactly as you set them.
- With several solids selected, a typed value applies to all of them; arrow presses and label drags change each one by the same amount. A field whose values differ shows `--`.
- Each typed value, label drag or quick series of arrow presses is one step in the history, named **Change size** or **Change corner radius**.

## Resize a shape in the preview

With one solid selected, its handles in the preview change its size (**W** and **H**), not its scale. The corners keep their radius, and a line keeps its thickness when you make it longer.

1. Select the solid in the preview or on the timeline.
2. Drag one of its eight handles:

| Handle | What changes |
| --- | --- |
| A corner | Width and height together, in proportion. The opposite corner stays in place. |
| A corner, with <kbd>Shift</kbd> | Width and height separately. |
| The middle of a side | Only the width or only the height. The opposite side stays in place. |
| Any handle, with <kbd>Alt</kbd> | As above, around the center of the shape. |

- The readout next to the pointer shows the new size, for example **812 × 406 px**. The **W** and **H** fields show it when you release.
- The dragged edge snaps to the frame, the overlays and other layers as for any picture. There is no 100% snap: the scale doesn't change. See [Snap an edge while you resize](snapping-and-smart-guides.md#snap-an-edge-while-you-resize).
- A turned shape keeps its angle, and the corner or side opposite the handle stays where it is on the frame.
- Each drag is one step in the history, named **Resize shape**. Press <kbd>Esc</kbd> before you release to cancel it.
- When several layers are selected, the handles scale them all together, shapes included: their **Scale** changes, not their size. See [Transform several layers at once](arranging-layers-in-the-preview.md#transform-several-layers-at-once).

## Move, turn and fade shapes

A solid is a layer of the picture like a video or an image. Everything on [Arranging layers in the preview](arranging-layers-in-the-preview.md) works for it: select it, drag it into place with snapping, rotate it, nudge it with the arrow keys, and bring it forward or send it backward. In **Edit Properties**, the **Transform** and **Opacity** sections and the quick actions apply to it.

- A click anywhere inside the box of the shape selects it, also just outside the curve of an ellipse or a rounded corner.
- **Fit in frame** and **Fill frame** change the shape's **Scale** so that its box fits inside, or covers, the frame. **Reset transform** puts it back in the middle of the frame at 100%, upright and not mirrored; its size and radius stay.
- Shapes have no crop: the **Crop** section is not shown, and a double-click on a shape does nothing.
- Animate a shape's position, scale, rotation and opacity with keyframes, for example to slide a bar in behind a title or fade a color wash out. Its **Solid** settings (shape, fill, **W**, **H** and **Radius**) are not animated: a change applies to every frame, also when you resize it with its handles. See [Keyframes](keyframes.md).
- Fade a shape or an image in or out with the fade handles in its clip's top corners on the timeline, or with **Fade in 0.5 s** and **Fade out 0.5 s** in the quick actions. Image clips can also take a transition at a cut with a video or another image, and they never run short of frames for it; solids take no transitions. See [Fades and transitions](fades-and-transitions.md).
- A solid shows only during its clip. For one color behind your whole video, the project's **Background** is simpler; see [What the Project section sets](project-settings-and-templates.md#what-the-project-section-sets). For a gradient background, or a color behind part of the video, add a solid, move its track below your video's track (see [Reorder tracks](tracks.md#reorder-tracks)), choose **Rectangle**, set **W** and **H** to the frame size (1080 and 1920), and trim it to the length you need.

## Add an image

1. Put the playhead where the image should start.
2. Click **Add image** (a picture with a plus) in the **Add** group of the timeline toolbar.
3. The file picker opens and shows images: .png, .jpg, .jpeg, .webp, .gif and .svg. Select one image, or several with <kbd>Ctrl</kbd>+click.
4. Click **Open**.

The editor imports each image into the Media panel and places it at the playhead:

- **Track.** On the top video track when it is unlocked and free for the whole length of the new clips; otherwise on a new video track above the others.
- **Position.** Fitted inside the frame and centered, as any new picture. See [See how clips fit the frame](preview-and-playback.md#see-how-clips-fit-the-frame).
- **Length.** 5 seconds, or the **Still image** length you set in **Settings** > **General** or the **Project** section; see [Set the length of new clips](settings.md#set-the-length-of-new-clips). Several images go back to back from the playhead.
- The new clips are selected, and the playhead stays where it is.
- The import and the new clips are one step in the history, named **Add image**: one <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes both the clips and the imported items.

- Press <kbd>Esc</kbd> or click **Cancel** in the file picker to add nothing.
- If you switch the picker to all files and pick a video or a sound, it is imported into the Media panel but not placed.
- **Add image** imports a new copy each time, even of an image that is already in the Media panel. To use an image you already imported, drag its card onto the preview instead. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview).
- In a read-only project, the message **This project is read-only** appears with **Allow editing to import media.** See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

## Use animated GIF and WebP images

> **Video placeholder: Animated stickers**
> - File: `videos/shapes-and-images/animated-stickers.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A talking-head video on V1. Click **Add image** and pick a sticker GIF with a transparent background: it lands on V2 over the video, and the video shows around it.
>   2. Set V2 to height L: the clip shows the sticker's frames side by side.
>   3. Press <kbd>Space</kbd>: the sticker plays at its own speed and starts over at its end, for the whole 5 seconds. Press <kbd>Space</kbd> again.
>   4. Press <kbd>→</kbd> a few times: the sticker changes frame with the playhead.
>   5. Drag the start of the clip to the right by one second: the frames after the new start still play at the same moments.
>   6. Drag the corner handle of the sticker in the preview to make it smaller and move it to a corner of the frame.

Animated GIF and WebP files play their animation in the preview, in step with the timeline: while you play, scrub and step frame by frame, the preview always shows the frame of the animation that belongs at the playhead.

- **Their own speed.** Each frame shows for as long as the file says. A frame shorter than 20 milliseconds shows for 100 milliseconds, as in web browsers.
- **Always looping.** The animation starts over at its end, for as long as the clip lasts, also when the file is set to play only once. The duration in the Media panel is one round of the animation.
- **The project frame rate.** The preview shows one picture per frame of the project. An animation with more frames per second than the project skips some of them.
- **Transparency.** Transparent parts show the layers below, so a sticker sits on your video without a box around it.
- **Trimming and splitting.** Drag the start of the clip and the frames that remain keep playing at the same moments: the animation doesn't restart at the new start. After a split, the second part continues where the first one stops.
- **Loading.** The first time an animation shows, its frames take a moment to load. Until a frame is ready, the preview holds the frame before it. **Export frame** waits for every frame.

**Large animations.** Each animation keeps at most 128 MB of frames in memory, and frames larger than 2048 pixels on their longer side are scaled down to 2048. When an animation needs more, the editor keeps every second frame (or every third, and so on) and shows each kept frame until the next one. The animation keeps its length and timing but moves less smoothly. For example, a 1024×1024 GIF with 30 frames plays 15 of them.

> **Tip:** For a smooth sticker, use a GIF or WebP no larger than you show it. A 512-pixel sticker keeps far more frames than a 2048-pixel one.

## Keep SVG images sharp

An SVG image is a drawing, not a grid of pixels. The editor draws it again at the size it has on your screen, so its edges stay crisp when you make it larger and when you zoom the preview in.

- After you zoom or resize, the edges can look soft for a moment while the editor draws the image again. Then they sharpen. The editor does this once the preview is at rest, not while you play or scrub; with the default **Auto** quality, playback shows the project's resolution anyway. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality).
- An SVG is drawn at most 4096 pixels on its longer side. Above that size, its pixels are enlarged like those of any image:

| SVG in a 1080×1920 project | Sharp up to about |
| --- | --- |
| A logo 324 pixels wide | 1260% |
| A square logo fitted to the frame width (1080 pixels) | 379% |
| An SVG that covers the whole frame | 213% |

- **Export frame** draws each SVG at the size it has in the exported frame.
- An SVG needs a width and a height, or a viewBox, to be imported. See [Supported file types](importing-media.md#supported-file-types).

## Shapes and images on the timeline

| Clip | Label bar | Body (tracks of height M or L) |
| --- | --- | --- |
| Solid | A square icon and the clip name, **Solid** for a new one | A small swatch at the start: the shape in its color or gradient. A rounded rectangle shows a rounded square, a rectangle a square, an ellipse a circle and a line a bar. |
| Image | A picture icon and the file name | The picture, repeated across the clip. |
| Animated GIF or WebP | A picture icon and the file name | The frames of the animation side by side, each showing the frame that plays at that moment of the clip. |

- The swatch follows the **Shape** and **Fill** of the solid as soon as you change them.
- A solid clip narrower than 24 pixels on screen shows no swatch, and an image clip narrower than 48 pixels shows no pictures. Zoom in to see them. See [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md).

## Undo shape and image changes

| Step name | What made it |
| --- | --- |
| **Add solid** | **Add solid** in the timeline toolbar |
| **Change shape** | A button of the **Shape** row |
| **Change fill** | **Solid** or **Gradient**, or a color applied to **Color**, **Top** or **Bottom** |
| **Change size** | **W** or **H** in the **Solid** section |
| **Change corner radius** | **Radius** |
| **Resize shape** | Dragging a handle of one selected solid in the preview |
| **Add image** | **Add image**: the imported images and their clips together |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- Exporting the video. **Export frame** already includes shapes and the current frame of each animation.

## Related pages
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Keyframes](keyframes.md)
- [Fades and transitions](fades-and-transitions.md)
- [Editing properties](editing-properties.md)
- [Importing media](importing-media.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Titles and text](titles-and-text.md)
- [Troubleshooting](troubleshooting.md#shapes-and-images)

<sub>Last updated: Batch 42, 2026-10-18</sub>
