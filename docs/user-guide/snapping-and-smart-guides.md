# Snapping and smart guides in the preview

When you drag a layer in the preview, it snaps into line with the frame, the safe zones and the other layers. Gold smart guides show what it lines up with and how far apart the layers are. Use this to center a title, line up a logo with the edge of a video, space three stickers evenly, or check how far a layer is from the edges of the frame.

> **Video placeholder: Snap layers and read the smart guides**
> - File: `videos/snapping-and-smart-guides/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A 1080×1920 project with a video on V1 and two stickers on V2 and V3, the playhead over all three. Point at **Snap** (the magnet) and **Smart guides** in the Preview panel header: both are gold.
>   2. Drag the V3 sticker slowly toward the middle of the frame. It jumps to the exact center, a gold line runs from top to bottom and another from left to right through the whole frame, and the readout shows **X 0 · Y 0**.
>   3. Keep dragging a little: the sticker holds on the center, then follows the pointer again.
>   4. Drag it under the V2 sticker until their left edges almost line up. It jumps into line, a gold line joins the two stickers, and a gold label on the line shows the gap between them, for example **240**. Release.
>   5. Drag the sticker again and, with the mouse button still down, press and hold <kbd>S</kbd>: it moves freely and the guides disappear. Release <kbd>S</kbd>: it snaps again. Release the mouse button.
>   6. Leave the sticker selected, rest the pointer on the preview and hold <kbd>Alt</kbd>: gold lines with distances run from the sticker to the frame edges and to the other sticker. Release <kbd>Alt</kbd>: they disappear.

## In this page
- [Turn snapping and smart guides on or off](#turn-snapping-and-smart-guides-on-or-off)
- [Snap a layer into place](#snap-a-layer-into-place)
- [Choose what layers snap to](#choose-what-layers-snap-to)
- [Read the smart guides](#read-the-smart-guides)
- [Space layers evenly](#space-layers-evenly)
- [Snap an edge while you resize](#snap-an-edge-while-you-resize)
- [Place a layer without snapping](#place-a-layer-without-snapping)
- [Measure distances with Alt](#measure-distances-with-alt)
- [What does not snap](#what-does-not-snap)

## Turn snapping and smart guides on or off

Two buttons in the Preview panel header control snapping in the preview. Both are on in a new project and gold while they are on.

| Button | What it does |
| --- | --- |
| **Snap** (the magnet) | Turns snapping on or off. It is the same switch as **Snap** in the timeline toolbar, with the same shortcut <kbd>S</kbd>: when you turn it off, neither clips on the timeline nor layers in the preview snap. |
| **Smart guides** (right of **Snap**) | Makes the other layers and the equal spacing between them snap targets, and turns on the measurements you see while you hold <kbd>Alt</kbd>. **Smart guides** in the **Overlays** menu is the same setting. |

| **Snap** | **Smart guides** | A layer you drag snaps to |
| --- | --- | --- |
| On | On | The frame, the overlays shown, the other layers and equal spacing |
| On | Off | The frame and the overlays shown only |
| Off | On or off | Nothing (hold <kbd>S</kbd> during the drag to snap anyway) |

- <kbd>S</kbd> works in every panel, except while you type in a text field. See [Turn snapping on or off](timeline.md#turn-snapping-on-or-off).
- Each project remembers both settings. Turning them on or off is not a step in the history.

## Snap a layer into place

1. Check that **Snap** is gold.
2. Drag a layer in the preview. See [Move a layer](arranging-layers-in-the-preview.md#move-a-layer).
3. When an edge or the center of the layer comes within 6 pixels on screen of a target, the layer jumps onto it, and a gold guide shows what it lines up with.
4. Release the mouse button to leave it there, or keep dragging: once the pointer moves more than 6 pixels past the target, the layer follows the pointer again.

How snapping decides:

- **Edges and center.** The left edge, the center and the right edge of the layer snap to vertical targets. The top edge, the middle and the bottom edge snap to horizontal targets. Each direction snaps on its own, so a layer can snap in both at once, for example to the exact center of the frame.
- **Distance on screen.** The reach is 6 pixels on your screen at every zoom. Zoomed out, 6 pixels cover more of the frame; zoomed in, the layer snaps only close to a target.
- **Nearest wins.** When several targets are within reach, the nearest one wins. At the same distance, the frame wins over a safe area, a safe area over another layer, and another layer over equal spacing.
- **Exact landing.** A snapped layer lands exactly on its target, even between two pixels of the frame. The readout next to the pointer shows the nearest whole pixel. Without snapping, layers move in whole pixels.
- **<kbd>Shift</kbd>.** With <kbd>Shift</kbd> held, the layer moves only horizontally or only vertically, and snaps only in that direction.
- **Several layers.** When you drag several selected layers, the gold box around them snaps as one. Selected layers are never targets for each other.
- **Rotated layers** snap by the upright rectangle around them, and count as targets by that rectangle too.

Snapping changes only where the layer lands. Each drag is still one step in the history, **Move layer** (or **Move layers**).

## Choose what layers snap to

Layers snap to these targets, as long as **Snap** is on:

| Target | Lines | When |
| --- | --- | --- |
| The frame | The left edge, the center and the right edge; the top edge, the middle and the bottom edge | Always |
| Thirds of the frame | One third and two thirds across and down | While **Grid** in the **Overlays** menu is **Thirds** |
| A platform safe area | The four edges of the dashed safe rectangle | While a **Safe zone** (**Reels**, **TikTok** or **Shorts**) shows |
| Title / action safe | The four edges of each dashed rectangle (90% and 80% of the frame) | While **Title / action safe** is on |
| Other layers | Their left, center and right; their top, middle and bottom | While **Smart guides** is on |
| Equal spacing | The place where the gaps to the layers on both sides are the same | While **Smart guides** is on. See [Space layers evenly](#space-layers-evenly). |

- To snap to a safe area or the thirds, turn on the overlay in the **Overlays** menu first. With **Reels** on a 1080×1920 frame, for example, the safe area edges are at x 65 and 918 and at y 270 and 1250. See [Show a platform safe zone](preview-zoom-overlays-fullscreen.md#show-a-platform-safe-zone) and [Show grids, guides and rulers](preview-zoom-overlays-fullscreen.md#show-grids-guides-and-rulers).
- The **Squares** and **Custom** grids are not targets. The frame center is a target whether or not the **Center cross** shows.
- The other layers are the pictures at the playhead. Layers on locked tracks count: you can't select them, but they are part of the picture, so you can line up with a locked background or logo. Layers on hidden or muted video tracks don't count, because they are not drawn.

## Read the smart guides

While a layer is snapped, or lines up exactly with a target, gold guides show it:

| You see | It means |
| --- | --- |
| A gold line through the whole frame | An edge or the center of the layer is on a frame line, a third or a safe area edge. Two lines crossing in the middle of the frame: the layer is centered both ways. |
| A gold line that runs from the layer to other layers | An edge or the center of the layer lines up with an edge or the center of those layers. Where there is a gap to the nearest of them on each side, short end marks frame the gap and a gold label shows its size. |
| Two gold spans with end marks and the same number | Equal spacing: the gaps on both sides of the layer are the same. See [Space layers evenly](#space-layers-evenly). |

- The numbers are pixels of the project frame: whole pixels, or one decimal when a gap ends between two pixels.
- Guides show every target the layer meets exactly, also in the direction <kbd>Shift</kbd> holds still.
- The lines are 1 pixel wide on screen at every zoom. The guides disappear when you release the mouse button.
- Guides show only while snapping is on. With **Snap** off, a drag shows no guides, unless you hold <kbd>S</kbd>.
- Guides exist only on your screen. They never appear in a frame you save with **Export frame** or in an exported video.

## Space layers evenly

> **Video placeholder: Space three layers evenly**
> - File: `videos/snapping-and-smart-guides/equal-spacing.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. Three stickers in a column in the middle of a 1080×1920 frame, one above the other, with a small gap above the middle one and a large gap below it.
>   2. Drag the middle sticker down slowly. At the point where both gaps are the same, it holds still, and two gold spans show the same number, for example **350**.
>   3. Release. Hover **Undo** in the app bar: it reads **Undo Move layer**.

1. Place three layers in a row or a column, with the two outer ones where you want them.
2. Drag the middle layer between the other two.
3. When the gaps on both sides are equal, the layer snaps there, and two gold spans with the same number show the gaps.

Equal spacing works when:

- The two outer layers are in line with the layer you drag: in a column, each of them is at least partly straight above or below it, not off to one side; in a row, each is at least partly straight beside it.
- No other layer in line sits between the two outer ones.
- The layer you drag fits in the space between them.
- **Smart guides** is on.

It snaps only the layer between two others. Dragging a layer past the end of a row to repeat the same gap does not snap; line it up with the edges instead.

## Snap an edge while you resize

When you drag a handle of a selected layer, the edge you drag snaps to the same lines as a move: the frame, the thirds, the safe areas and the edges and centers of other layers. Equal spacing does not apply to a resize.

| Handle | What snaps |
| --- | --- |
| A side handle | That edge. |
| A corner | The edge nearer to a target. The other edge follows, so the layer keeps its shape. |
| A corner, with <kbd>Shift</kbd> | Each of the two edges, on its own. |
| Any handle, with <kbd>Alt</kbd> | As above, while the layer grows or shrinks around its center. |

- A gold line shows the target the edge meets.
- Edges snap only while the box is upright: the layer is not rotated, or rotated by an exact multiple of 90°. The box around several layers is always upright.
- The 100% snap follows the **Snap** switch too: with snapping off, or while you hold <kbd>S</kbd>, the scale passes 100% without stopping. See [Resize a layer](arranging-layers-in-the-preview.md#resize-a-layer).
- Each drag is one step in the history, **Scale layer** (or **Scale layers**).

> **Note:** In crop mode, the sides you crop snap only to the frame: its edges, its center lines and its thirds, also when the **Thirds** grid is hidden. See [Snap crop edges to the frame](cropping-and-reframing.md#snap-crop-edges-to-the-frame).

## Place a layer without snapping

To put a layer just next to a target instead of on it:

- **Hold <kbd>S</kbd> during the drag.** Snapping does the opposite of the setting while you hold it: with **Snap** on, the layer moves freely; with **Snap** off, it snaps. Release <kbd>S</kbd> and the setting applies again at once. The **Snap** magnet and the setting don't change.
- **Zoom the preview in.** The 6 pixels then cover less of the frame. See [Zoom with the mouse wheel](preview-zoom-overlays-fullscreen.md#zoom-with-the-mouse-wheel).
- **Nudge with the arrow keys.** Nudges move the layer by exactly 1 or 10 pixels and never snap. See [Nudge layers with the arrow keys](arranging-layers-in-the-preview.md#nudge-layers-with-the-arrow-keys).
- **Turn snapping off** with **Snap** or <kbd>S</kbd>, or turn **Smart guides** off to snap only to the frame and the overlays.

About holding <kbd>S</kbd>:

- Press <kbd>S</kbd> after the drag has started. An <kbd>S</kbd> pressed before you start dragging turns snapping on or off, as it does outside a drag.
- While you drag a layer, <kbd>S</kbd> never starts a shortcut, also together with <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>Alt</kbd>: <kbd>Ctrl</kbd>+<kbd>S</kbd> does not save until you release the mouse button.

## Measure distances with Alt

1. Select one or more layers under the playhead.
2. Rest the pointer on the preview without pressing a mouse button.
3. Hold <kbd>Alt</kbd>. Gold spans with distances run from the selection in all four directions.
4. Release <kbd>Alt</kbd> to hide them.

What the numbers measure:

- On each side, the distance to the nearest layer in line with the selection on that side: at least partly straight above, below, left or right of it. With no layer there, the distance to the edge of the frame.
- When the selection reaches past an edge of the frame, the distance to that edge is negative, for example **-20**. A side that touches its target shows no span.
- With several layers selected, the distances start at the gold box around them.
- Layers on locked tracks count as neighbors; layers on hidden and muted video tracks don't.

Good to know:

- Measuring needs **Smart guides** on. It works with **Snap** off too.
- With one layer selected, <kbd>Alt</kbd> also shows its anchor marker. See [Move the anchor point](arranging-layers-in-the-preview.md#move-the-anchor-point).
- <kbd>Alt</kbd>+click still selects the layer underneath, and <kbd>Alt</kbd>+wheel still zooms. See [Select a layer under another one](arranging-layers-in-the-preview.md#select-a-layer-under-another-one).

## What does not snap

- **Rotating** snaps only with <kbd>Shift</kbd>, to every multiple of 45° within 3° of it. See [Rotate a layer](arranging-layers-in-the-preview.md#rotate-a-layer).
- **Dragging the anchor point** moves it freely.
- **Arrow-key nudges** move by exactly 1 or 10 pixels.
- **Values in Edit Properties**, typed or dragged on a field's label, land exactly where you set them, also in the **Crop** section. See [Place a picture with exact values](editing-properties.md#place-a-picture-with-exact-values).
- **Fit**, **Fill** and **Center** place pictures relative to the frame; they don't line up with other pictures.
- **The handles of a text** (font size and box width) don't snap. Moving a text snaps its box like a picture. See [Resize text with its handles](titles-and-text.md#resize-text-with-its-handles).

## Related pages
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Editing properties](editing-properties.md)
- [Cropping and reframing](cropping-and-reframing.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Preview and playback](preview-and-playback.md)
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 43, 2026-10-18</sub>
