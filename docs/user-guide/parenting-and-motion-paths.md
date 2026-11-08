# Parenting, nulls and motion paths

Parenting makes one layer follow another: when the parent moves, turns or scales, its children go with it. A null is an invisible layer made only to be a parent. A motion path moves a layer along a curve instead of in a straight line between keyframes. You use these to build rigs: a card that carries its label, or one control that turns a whole group.

> **Video placeholder: Build a rig with a null and a motion path**
> - File: `videos/parenting-and-motion-paths/overview.mp4` (not recorded yet)
> - Length: about 80 seconds
> - Shows:
>   1. A 1080×1920 project with five shape clips on separate tracks. Click **Add null** in the timeline toolbar: a null clip appears on a new top track.
>   2. Select the first shape. In **Edit Properties**, open the **Parent** menu in the **Transform** section and choose the null. Do the same for the other four.
>   3. Select the null, turn on the stopwatch of **Transform**, press <kbd>Home</kbd>, key **Rotation** at 0, move to 2 seconds and set **Rotation** to 90. Press <kbd>Space</kbd>: the five shapes turn around the null.
>   4. Select a shape with position keyframes. Click **Move along a path**: a curve with squares and round handles appears in the preview. Drag a round handle to bend the curve.
>   5. Click **Auto-orient**: the shape turns along the curve while it plays. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the last drag is undone in one step.

## In this page
- [Make a layer follow another](#make-a-layer-follow-another)
- [Add a null](#add-a-null)
- [Move a layer along a path](#move-a-layer-along-a-path)
- [Edit the path in the preview](#edit-the-path-in-the-preview)
- [Turn a layer along its path](#turn-a-layer-along-its-path)
- [Limits](#limits)

## Make a layer follow another
1. Select the clip that should follow (the child).
2. In **Edit Properties**, find the **Transform** section and open the **Parent** menu.
3. Choose the clip to follow. The menu lists only the clips this clip may follow. **None** means no parent.

The child now moves, turns and scales with its parent, around the parent's position. The child keeps its own keyframes: they are measured from the parent. Flips and opacity are not passed on.

To stop following, choose **None** in **Parent**, or run **Clear parent** from the command palette. The child stays where it is on screen at the playhead.

> **Note:** When you pick a parent, the child stays where it is at the playhead and at each of its keyframes. Between keyframes it can shift slightly if the parent has keyframes at other times.

> **Important:** A clip cannot follow itself or one of its own children. Audio clips and caption tracks cannot have a parent or be one. A parent must be in the same sequence.

When you copy a parent and its children together, the copies follow the copied parent. **Make compound** does not separate a parent from its children.

## Add a null
A null has no picture. It never shows in the preview, a render or an export, but it moves, turns and scales the clips that follow it.

1. Move the playhead where the null should start.
2. Click **Add null** in the **Add** group of the timeline toolbar, or run **Add null** from the command palette.
3. Give each clip that should follow it the null as **Parent**.
4. Select the null and key its **Position**, **Scale** or **Rotation** like any layer. See [Keyframes](keyframes.md).

A null sits on a free top video track, or on a new track, because only one clip fits on a track at a time. When you select a null, the preview shows its size as an outline with a cross through the corners. **Edit Properties** shows **Transform** for it, without **Opacity**.

## Move a layer along a path
Normally position keyframes move a layer in a straight line. A motion path bends that line.

1. Select a clip with position keyframes, or one clip at the playhead.
2. In the **Transform** section, click **Move along a path** in the **Motion path** row (also **Motion path (toggle)** in the command palette).
3. The curve appears in the preview. The layer now follows it at constant speed between keys when the easing is linear.

Click the button again (it now reads **Back to X and Y keys**) to return to separate X and Y keys. The curve between keys becomes plain eases.

Click **Smooth path** to give every key automatic, smooth tangents. It is dimmed unless the clip is on a path.

## Edit the path in the preview
Select the clip. Its path shows as a line, a square for each key and a round handle for each tangent.

- Drag a square to move a key.
- Drag a round handle to bend the curve.
- Hold <kbd>Alt</kbd> while you drag a key to pull out matching tangents. Hold <kbd>Alt</kbd> while you drag a handle to mirror the opposite one.

Each drag is one undo step. While you drag, the line follows your pointer; the clip itself jumps to the new path when you release.

## Turn a layer along its path
Click **Auto-orient** in the **Motion path** row. The layer turns to face the direction of the curve as it moves. Click it again to turn it off. It also has **Auto-orient (toggle)** in the command palette.

## Limits
- Parenting does not carry skew: a parent scaled differently in width and height with a rotated child is approximated.
- If a parent is deleted, its children simply stop following it.
- There are no keyboard shortcuts for these commands by default. Give them keys in **Settings** > **Shortcuts**.

## Related pages
- [Keyframes](keyframes.md)
- [Editing properties](editing-properties.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Shapes and images](shapes-and-images.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)

<sub>Last updated: Batch 69, 2026-11-08</sub>
