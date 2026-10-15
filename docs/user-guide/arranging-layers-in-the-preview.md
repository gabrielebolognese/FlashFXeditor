# Arranging layers in the preview

Every video or image clip under the playhead is a layer of the picture. In the Preview panel you can work on those layers directly: click one to select it, drag it to a new place, resize and rotate it with its handles, and change which layer is on top. Use this to place a logo in a corner, enlarge a shot to cut away its edges, tilt a sticker, or build a picture-in-picture layout. Layers snap into line with the frame and with each other as you drag; see [Snapping and smart guides in the preview](snapping-and-smart-guides.md).

> **Video placeholder: Arrange layers in the preview**
> - File: `videos/arranging-layers-in-the-preview/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and a logo PNG on V2, the playhead over both. Point at the logo in the preview: a thin, darker gold outline appears.
>   2. Click the logo: it gets a gold outline with eight white handles, and its clip on V2 turns gold on the timeline.
>   3. Drag the logo to the top right corner. A readout next to the pointer shows **X** and **Y**. Release.
>   4. Drag the bottom-right handle outward: the logo grows and keeps its shape, and the readout shows the scale, for example **134.6%**.
>   5. Move the pointer just outside the top-right corner: the cursor becomes a curved arrow. Drag: the logo turns. Hold <kbd>Shift</kbd>: it stops at 45° and the readout reads **45.0°**. Release.
>   6. Quickly press <kbd>←</kbd> three times: the logo moves 3 pixels left.
>   7. Hover **Undo** in the app bar: it reads **Undo Nudge layer**. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: the three nudges are undone together.
>   8. Right-click the logo and choose **Reset transform**: it is back in the middle of the frame at its first size.

## In this page
- [Understand layers](#understand-layers)
- [Select layers in the preview](#select-layers-in-the-preview)
- [Select a layer under another one](#select-a-layer-under-another-one)
- [Move a layer](#move-a-layer)
- [Resize a layer](#resize-a-layer)
- [Rotate a layer](#rotate-a-layer)
- [Move the anchor point](#move-the-anchor-point)
- [Nudge layers with the arrow keys](#nudge-layers-with-the-arrow-keys)
- [Transform several layers at once](#transform-several-layers-at-once)
- [Read the numbers while you drag](#read-the-numbers-while-you-drag)
- [Use the layer menu](#use-the-layer-menu)
- [Change which layer is on top](#change-which-layer-is-on-top)
- [Cancel and undo](#cancel-and-undo)
- [What is not available yet](#what-is-not-available-yet)

## Understand layers

The preview draws the clip of each video track at the playhead, from the bottom video track up: a higher track covers the tracks below it. Each of those clips is a layer you can select, move, resize and rotate in the preview.

- A change to a layer applies to the whole clip, on every frame of it, not only to the frame at the playhead.
- You only see a layer's box and handles while the playhead is over its clip. Move the playhead into a clip to work on it in the preview.
- Selecting in the preview is the same selection as on the timeline. A layer you click in the preview gets the gold outline on the timeline, and a clip you click on the timeline gets its box in the preview when it is under the playhead.
- Audio clips have no picture and are never layers.

Which layers you can pick in the preview:

| Track | Can you pick its layer in the preview? |
| --- | --- |
| Normal video track | Yes. |
| Hidden (the eye is crossed out) | No: a click goes to the layer below it. |
| Locked (gold padlock) | No: a click goes to the layer below it. |
| Muted (**M** is gold) | Yes. The picture is not drawn, but its outline and handles show where it is, so you can still place it. |

See [Lock a track](tracks.md#lock-a-track) and [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks).

## Select layers in the preview

> **Video placeholder: Select layers in the preview**
> - File: `videos/arranging-layers-in-the-preview/select-layers.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. Three images on V1, V2 and V3, partly over each other, the playhead over all three. Click the top image: it gets a gold box with handles.
>   2. <kbd>Shift</kbd>+click a part of the bottom image that no other image covers: one gold box surrounds both, and each has its own gold outline.
>   3. Click an empty part of the frame: nothing is selected.
>   4. Press on an empty part of the frame and drag across a corner of two images: a light gold rectangle follows the pointer and both images get a gold outline. Release: both are selected.
>   5. Click a clip on the timeline: its picture gets the box in the preview.

| To | Do this in the preview |
| --- | --- |
| Select a layer (with its linked sound and its group) | Click it |
| Add a layer (with its linked sound and its group) to the selection, or remove it | <kbd>Shift</kbd>+click it |
| Add or remove only that layer | <kbd>Ctrl</kbd>+click it |
| Select the next layer under the pointer, alone | <kbd>Alt</kbd>+click. See [Select a layer under another one](#select-a-layer-under-another-one). |
| Select every layer a rectangle touches | Press where no layer is (also beside the frame) and drag |
| Add the layers a rectangle touches to the selection | <kbd>Shift</kbd>+drag or <kbd>Ctrl</kbd>+drag from where no layer is |
| Select all clips | <kbd>Ctrl</kbd>+<kbd>A</kbd> (Preview or Timeline panel) |
| Clear the selection | Click where no layer is, for example the area around the frame, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> |

What you see:

- **Pointing at a layer** that is not selected draws a thin, darker gold outline around it.
- **A selected layer** has a gold outline and a box with eight handles: white squares with a gold edge at the corners and in the middle of each side. The box turns with the layer when it is rotated.
- **Several selected layers** each have a gold outline, and one gold box with handles surrounds all of them. See [Transform several layers at once](#transform-several-layers-at-once).
- **While you drag a rectangle**, it is light gold, and the layers it would select are outlined.

Good to know:

- The topmost layer under the pointer gets the click. Where the picture is transparent (for example around a PNG logo), the click still counts: the layer is its whole rectangle.
- The box and the handles also show where a layer reaches past the edge of the frame. You can grab the layer and its handles there, although the part outside the frame is not drawn.
- With **Linked selection** on, a click on a video selects its sound too, so **Delete** removes both. A rectangle selects only the layers it touches, without their sound or the rest of their group. See [How linked clips work](links-and-groups.md#how-linked-clips-work) and [Group clips](links-and-groups.md#group-clips).
- A press that moves less than 4 pixels counts as a click.
- Clicking a layer makes the Preview panel active, so the arrow keys then move the layer. See [Nudge layers with the arrow keys](#nudge-layers-with-the-arrow-keys).
- With the **Hand** tool, or while you hold <kbd>Space</kbd> to pan, a click or a drag on the picture pans instead and selects nothing. Press <kbd>V</kbd> to go back to **Select**. See [Pan the preview](preview-zoom-overlays-fullscreen.md#pan-the-preview).
- The selection is not a step in the history. The project remembers it for the next time you open it.

## Select a layer under another one

When layers sit on top of each other, a click always takes the top one. To reach the ones below:

1. Click where the layers overlap. The top layer is selected.
2. Hold <kbd>Alt</kbd> and click at the same spot. The next layer down is selected, alone.
3. <kbd>Alt</kbd>+click again to go one layer further down. After the bottom layer, the next <kbd>Alt</kbd>+click selects the top one again.

When none of the layers at that spot is selected, the first <kbd>Alt</kbd>+click selects the top one.

<kbd>Alt</kbd>+click selects only that layer, without its linked sound or its group. Keep the mouse button down after an <kbd>Alt</kbd>+click and drag to move the layer you reached.

> **Note:** On the timeline, <kbd>Alt</kbd>+click selects a clip without its linked clips. In the preview, <kbd>Alt</kbd>+click is for reaching lower layers; to toggle a single layer without its partners there, use <kbd>Ctrl</kbd>+click.

## Move a layer

1. Press on a layer and drag. It is selected and follows the pointer.
2. Release where you want it.

- The cursor shows four arrows over the selected layer.
- Hold <kbd>Shift</kbd> to move only horizontally or only vertically: the direction you dragged further in. You can press and release <kbd>Shift</kbd> during the drag.
- Layers move in whole pixels of the project frame. With **Snap** on, a layer near the center or an edge of the frame, or near another layer, snaps onto it, and gold guides show what it lines up with. Hold <kbd>S</kbd> during the drag to move it freely. See [Snap a layer into place](snapping-and-smart-guides.md#snap-a-layer-into-place).
- A press anywhere inside the gold box moves the whole selection, also where another layer lies on top of the selected one. If you release without dragging, the click selects the top layer at that spot.
- A drag pauses playback.
- Each drag is one step in the history, named **Move layer** (or **Move layers** for several).

> **Tip:** Zoom the preview in to place a layer precisely, and turn on a safe zone to keep it clear of the platform's buttons: layers then also snap to the edges of its safe area. See [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).

## Resize a layer

> **Video placeholder: Resize and rotate a layer**
> - File: `videos/arranging-layers-in-the-preview/resize-and-rotate.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A logo PNG selected in the preview. Drag the bottom-right corner handle outward: the logo grows, its top-left corner stays in place, and its shape is kept.
>   2. Drag the same handle with <kbd>Shift</kbd> held: the width and height change separately.
>   3. Drag the right edge handle: only the width changes.
>   4. Drag a corner handle with <kbd>Alt</kbd> held: the logo grows around its center.
>   5. Drag slowly through 100%: the logo holds at **100%** and the two sides of the box at the handle turn into a thicker gold line.
>   6. Point just outside a corner: the cursor becomes a curved arrow. Drag around the logo: it turns, and the readout shows the angle. Hold <kbd>Shift</kbd>: the angle stops at 0°, 45° and 90°.

Drag one of the eight handles of the selected layer:

| Handle | What changes |
| --- | --- |
| A corner | Width and height together: the layer keeps its shape. The opposite corner stays in place. |
| A corner, with <kbd>Shift</kbd> | Width and height separately. |
| The middle of a side | Only the width (left and right sides) or only the height (top and bottom sides). The opposite side stays in place. |
| Any handle, with <kbd>Alt</kbd> | As above, but around the center of the layer: both sides move. |

- The cursor shows a two-headed arrow in the direction the handle moves.
- **100% snap.** While snapping is on, the scale holds at exactly 100% when it passes within 2% of it, and the sides of the box at the dragged handle turn into a thicker gold line. 100% is the media's own size: one pixel of the video or image on one pixel of the project frame. Keep dragging to go past it, or hold <kbd>S</kbd> to pass it without stopping.
- **Edge snap.** While snapping is on and the layer is upright, the edge you drag also snaps to the frame, the overlays shown and the other layers, with a gold guide. See [Snap an edge while you resize](snapping-and-smart-guides.md#snap-an-edge-while-you-resize).
- A layer can't get smaller than 1%. Dragging a handle past the opposite side does not flip the layer.
- When the layer is small on screen, the side handles hide (a side must be at least 28 pixels long on screen); the corner handles always show. Zoom the preview in to get the side handles back.
- You can press and release <kbd>Shift</kbd> and <kbd>Alt</kbd> during the drag; the layer follows at once.
- Each drag is one step in the history, named **Scale layer** (or **Scale layers**).

> **Note:** A video or image starts at the scale that fits it in the frame. A 2160×3840 clip in a 1080×1920 project therefore starts at **50%**, and 100% shows it at twice the frame's size.

## Rotate a layer

1. Point just outside a corner of the selected layer, within 16 pixels of it. The cursor becomes a curved arrow.
2. Drag around the layer. It turns around its anchor point, which is the center of the layer unless you moved it (see [Move the anchor point](#move-the-anchor-point)).
3. Release.

- Without <kbd>Shift</kbd>, the angle changes freely in steps of 0.1°. The **Snap** switch does not affect rotation.
- Hold <kbd>Shift</kbd> to stop at 0°, 45°, 90° and every other multiple of 45° when the angle is within 3° of it.
- Positive angles turn clockwise. Keep dragging around to turn more than one full turn.
- Each drag is one step in the history, named **Rotate layer** (or **Rotate layers**).

## Move the anchor point

The anchor point is the point a layer turns around. It starts at the center of the layer.

1. Select one layer.
2. Hold <kbd>Alt</kbd> with the pointer over the preview. The anchor marker, a small ring with a cross, appears at the anchor point.
3. Point at the marker (the cursor becomes a crosshair) and drag it to a new place, still holding <kbd>Alt</kbd>.
4. Release. The layer stays where it is; only the point it turns around has moved.

- The marker shows only when exactly one layer is selected.
- With **Smart guides** on, holding <kbd>Alt</kbd> also shows the distances from the layer to its neighbors and to the frame edges. See [Measure distances with Alt](snapping-and-smart-guides.md#measure-distances-with-alt).
- The anchor point does not snap.
- <kbd>Alt</kbd>+click on the marker without dragging works like <kbd>Alt</kbd>+click elsewhere: it selects the next layer under the pointer.
- **X** and **Y** in the move readout give the position of the anchor point. See [Read the numbers while you drag](#read-the-numbers-while-you-drag).
- <kbd>Alt</kbd> on a resize handle still resizes around the center of the layer, not around the anchor point.
- Each anchor drag is one step in the history, named **Move anchor point**.

## Nudge layers with the arrow keys

With one or more layers selected in the preview, and the Preview panel active (click the layer first):

| Key | Moves the selected layers |
| --- | --- |
| <kbd>←</kbd>, <kbd>→</kbd>, <kbd>↑</kbd>, <kbd>↓</kbd> | 1 pixel |
| <kbd>Shift</kbd>+<kbd>←</kbd>, <kbd>Shift</kbd>+<kbd>→</kbd>, <kbd>Shift</kbd>+<kbd>↑</kbd>, <kbd>Shift</kbd>+<kbd>↓</kbd> | 10 pixels |

- The pixels are pixels of the project frame, whatever the zoom of the preview. Nudges never snap.
- Hold a key to keep moving the layers.
- Presses less than 0.3 seconds apart are one step in the history, named **Nudge layer** (or **Nudge layers**). One <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole burst.
- When no selected layer is under the playhead, <kbd>←</kbd> and <kbd>→</kbd> step frames as in the other panels (<kbd>Shift</kbd>: 5 frames), and <kbd>↑</kbd> and <kbd>↓</kbd> do nothing.
- <kbd>Ctrl</kbd>+<kbd>←</kbd> and <kbd>Ctrl</kbd>+<kbd>→</kbd> always move the playhead by one second.
- In the Timeline panel, the arrow keys move the playhead as usual. See [Move the playhead](timeline.md#move-the-playhead).

## Transform several layers at once

Select several layers with <kbd>Shift</kbd>+click, <kbd>Ctrl</kbd>+click or a rectangle. One gold box with eight handles surrounds them all.

> **Video placeholder: Transform several layers**
> - File: `videos/arranging-layers-in-the-preview/several-layers.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. Two stickers in the preview. Click the first and <kbd>Shift</kbd>+click the second: one gold box surrounds both.
>   2. Drag inside the box: both move together, and the readout shows **ΔX** and **ΔY**.
>   3. Drag the bottom-right corner of the box outward: both stickers grow, and the space between them grows in proportion.
>   4. Point outside a corner and drag: both turn around the center of the box.

| Drag | What happens |
| --- | --- |
| Inside the box | Every selected layer moves by the same amount. |
| A handle | Every layer is resized by the same factor, and the distances between them grow or shrink with it, from the opposite handle of the box (with <kbd>Alt</kbd>: from its center). <kbd>Shift</kbd> and the side handles work as for one layer. |
| Outside a corner | Every layer turns by the same angle around the center of the box, and their positions turn with it. With <kbd>Shift</kbd>, the angle goes in 45° steps. |

- The box is upright around all the layers. While you rotate, it turns with them; after you release, it is upright again around their new places.
- When you move or resize several layers, the box snaps as one, and the selected layers are not targets for each other. See [Snapping and smart guides in the preview](snapping-and-smart-guides.md).
- Only the selected layers under the playhead change. Selected clips elsewhere on the timeline, and their sound, stay as they are.
- The anchor marker is not available with several layers.
- Each drag is one step in the history, for example **Move layers** or **Scale layers**.

## Read the numbers while you drag

While you drag, a readout next to the pointer shows the value you change:

| Drag | One layer | Several layers |
| --- | --- | --- |
| Move | **X 120 · Y -176**: the position of the layer's anchor point, in pixels from the center of the frame (X to the right, Y down) | **ΔX +78 · ΔY +78**: how far the layers moved |
| Resize | **134.6%**, or **151.9% × 117.3%** when width and height differ: the layer's scale | **120%**, or **120% × 110%**: the change from where you started |
| Rotate | **45.0°**: the layer's angle | **Δ 30.0°**: the change from where you started |
| Anchor point | **Anchor 50% · 50%**: where the anchor sits across the width and down the height of the layer | |

A layer you just added, centered and fitted to the frame, reads **X 0 · Y 0**. A snapped layer can land between two pixels; the readout then shows the nearest whole pixel. Typing exact values is available in a later version.

## Use the layer menu

Right-click a layer in the preview. A layer that is not selected is selected first, with its linked sound and its group; a right-click inside the box of the current selection keeps the selection. A right-click where no layer is clears the selection and opens no menu.

| Row | What it does |
| --- | --- |
| **Copy**, **Paste**, **Duplicate** | Dimmed: available in a later version. |
| **Reset transform** | Puts the selected layers back to how a new clip is placed: centered, fitted to the frame, not rotated, with the anchor point in the middle. One step, **Reset transform** (or **Reset transforms**). |
| **Bring forward** | Moves each selected layer one video track up, so it is drawn over the layer it passes. See [Change which layer is on top](#change-which-layer-is-on-top). |
| **Send backward** | Moves each selected layer one video track down. |
| **Lock track** | Locks the tracks of the selected layers, as the padlock in the track header does. Their clips leave the selection and can no longer be picked in the preview. One step, **Lock track** (or **Lock tracks**). See [Lock a track](tracks.md#lock-a-track). |
| **Delete** | Deletes the selected clips and leaves a gap, as <kbd>Delete</kbd> does. With **Linked selection** on, their sound goes too. See [Delete clips](splitting-and-deleting.md#delete-clips). |

- Click outside the menu or press <kbd>Esc</kbd> to close it.
- **Reset transform** fits the picture to the current project frame. If you changed the project resolution after adding the clip, it refits the picture to the new size.

## Change which layer is on top

The layer order in the preview is the order of the video tracks: a clip on V2 is drawn over a clip on V1. **Bring forward** and **Send backward** in the layer menu move the selected clip to the neighboring video track:

- The clip moves to the next video track up (**Bring forward**) or down (**Send backward**) when that track is unlocked, shown (not hidden or muted) and free for the clip's whole length.
- Otherwise a new video track is created on the other side of that track, and the clip moves there. That way the layer always gets past the track in its way.
- On the top video track, **Bring forward** creates a new track above it; on the bottom one, **Send backward** creates a new track below it.
- A new track gets the next free name, for example **V4**, wherever it sits. The track the clip left stays, empty where the clip was.
- The clip keeps its time, its links and its group. Its sound stays on its audio track.
- Each choice is one step in the history, named **Bring layer forward** or **Send layer backward** (**Bring layers forward**, **Send layers backward** for several).

To change the order of whole tracks instead, drag a track header up or down. See [Reorder tracks](tracks.md#reorder-tracks).

## Cancel and undo

- Press <kbd>Esc</kbd> before you release the mouse button to cancel a move, resize, rotation, anchor drag or selection rectangle. The layers go back to where they were, and nothing is added to the history.
- A drag is also cancelled when the browser window loses focus, or when you undo during the drag.
- Every drag is one step in the history, whatever you did while dragging. Hover **Undo** in the app bar to see its name.

| Step name | What made it |
| --- | --- |
| **Move layer**, **Move layers** | Dragging layers |
| **Scale layer**, **Scale layers** | Dragging a handle |
| **Rotate layer**, **Rotate layers** | Dragging outside a corner |
| **Move anchor point** | Dragging the anchor marker with <kbd>Alt</kbd> |
| **Nudge layer**, **Nudge layers** | A burst of arrow key presses |
| **Reset transform**, **Reset transforms** | **Reset transform** in the layer menu |
| **Bring layer forward**, **Send layer backward** (and the plural names) | **Bring forward** and **Send backward** in the layer menu |

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- **Fit**, **Fill**, **Center** and flipping a layer with one click, and typing exact position, scale and rotation values in **Edit Properties**.
- Cropping a layer with handles in the preview.
- Text layers.
- Changes that differ over time (keyframes): a change always applies to the whole clip.

## Related pages
- [Preview and playback](preview-and-playback.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Timeline](timeline.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 23, 2026-10-16</sub>
