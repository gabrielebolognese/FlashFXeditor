# 3D layers

A layer can turn on its X and Y axes and sit nearer or farther away, so a card flips, tilts or flies into a grid with real perspective. The layer stays flat; the editor only projects it, the same way a web page does with a CSS 3D turn. You use this for card flips, tilted screens and decks of cards.

> **Video placeholder: Flip and tilt a card in 3D**
> - File: `videos/3d-layers/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. Click **Add shape** in the timeline toolbar and choose a **Rectangle**. Select it.
>   2. In **Edit Properties**, **Transform** section, type `60` in the **Y** field of **3D rotation**: the card leans away with perspective.
>   3. Drag the round handle to the right of the box left and right: the card turns on Y. Drag the round handle below the box up and down: it turns on X. Hold <kbd>Shift</kbd> to snap to 45°.
>   4. Type `300` in **Depth**: the card moves farther away and gets smaller.
>   5. Open the **Project** section and change **Perspective** from `1600` to `600`: the tilt gets stronger.
>   6. Key **3D rotation** **Y** from 0 to 180 and click **Hide back side**: the card disappears when its back faces you. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## In this page
- [Turn a layer in 3D](#turn-a-layer-in-3d)
- [Tilt with the preview handles](#tilt-with-the-preview-handles)
- [Push a layer back with Depth](#push-a-layer-back-with-depth)
- [Hide the back side](#hide-the-back-side)
- [Sort a compound's layers by depth](#sort-a-compounds-layers-by-depth)
- [Change the perspective](#change-the-perspective)
- [Limits](#limits)

## Turn a layer in 3D
1. Select a picture, video, text or shape clip.
2. In **Edit Properties**, open the **Transform** section.
3. Type an angle, in degrees, in the **X** or **Y** field of **3D rotation**. **X** tips the layer forward or back; **Y** turns it like a door.

All three values (**X**, **Y** and **Depth**) can be keyed with the stopwatch like the other transform values, see [Keyframes](keyframes.md). To make a layer flat again, click **Reset 3D rotation** in the **Back side** row.

## Tilt with the preview handles
A selected layer with the move tool shows two round handles outside its box: one to the right of the box (**Y**) and one below it (**X**).

1. Drag the right handle left or right to turn the layer on Y.
2. Drag the bottom handle up or down to turn it on X.
3. Hold <kbd>Shift</kbd> to snap to 45° steps.

Half a degree per pixel of drag. One drag is one undo step. The box and the click area follow the projected shape, so a click on empty space inside the flat box selects nothing.

> **Note:** Snapping is off while you move, scale or anchor a layer that is turned in 3D.

## Push a layer back with Depth
**Depth** (in pixels) moves a layer toward or away from you. A positive value is farther away and smaller; a negative value is closer and larger. When you drag a 3D layer in the preview, it stays under the pointer.

## Hide the back side
When a layer turns past 90°, you see its back, a mirrored picture. Click **Hide back side** in the **Back side** row to make the layer disappear while its back faces you. Click it again to show the back.

A layer that reaches the viewer's own position is not drawn.

## Sort a compound's layers by depth
Select a compound clip (see [Compound clips](compound-clips.md)). The **Back side** group shows a **Depth sort** row. Click **Sort inner layers by depth** to draw the layers inside by their **Depth**, farthest first, instead of by track order. Use it for a deck of cards that fly past each other.

## Change the perspective
**Perspective** in the **Project** section is the viewing distance in pixels. A small value gives a strong tilt; a large value looks almost flat.

1. Select no clip, or open the **Project** section of **Edit Properties**.
2. Type a value in **Perspective**, from 100 to 100000. The default is 1600.
3. Click the button next to the field (**Turn perspective off**) for a flat parallel view with no shrinking by distance. Click it again (**Turn perspective on**) to bring it back.

While you are inside a compound, the field changes that compound's own perspective. A compound never uses the project's value.

## Limits
- A parent passes on its flat move, turn and scale, never its 3D turn or depth ([Parenting](parenting-and-motion-paths.md)).
- In the middle of a dissolve between two layers with different projections, the picture is approximate.
- These actions are in the command palette (**Reset 3D rotation**, **Hide back side (toggle)**, **Sort compound layers by depth (toggle)**). They have no keyboard shortcut by default; set your own in **Settings** > **Shortcuts**.

## Related pages
- [Editing properties](editing-properties.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Keyframes](keyframes.md)
- [Compound clips](compound-clips.md)
- [Parenting, nulls and motion paths](parenting-and-motion-paths.md)

<sub>Last updated: Batch 70, 2026-11-08</sub>
