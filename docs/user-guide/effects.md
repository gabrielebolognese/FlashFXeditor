# Effects

Effects change how a layer looks after it is drawn: blur it, make it glow, give it a shadow or an outline. You stack several effects on one clip, change their order and animate their numbers. You add and tune them in the **Effects** section of **Edit Properties**.

> **Video placeholder: Effects overview**
> - File: `videos/effects/overview.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: select a title; in **Effects** click **Add glow**; set **Intensity** to `2`; click **Add drop shadow**; drag the shadow's grip above the glow; click the stopwatch of **Intensity** and set two keys; turn the glow off and on; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## In this page
- [Add an effect](#add-an-effect)
- [The five effects](#the-five-effects)
- [Reorder, turn off and remove effects](#reorder-turn-off-and-remove-effects)
- [Animate an effect](#animate-an-effect)
- [How effects combine with other features](#how-effects-combine-with-other-features)
- [Limits](#limits)
- [Related pages](#related-pages)

## Add an effect
1. Select one clip that shows a picture: video, image, text, solid, shape or compound.
2. In **Edit Properties**, open the **Effects** section, after **Masks**.
3. On the **Add** row, click **Add Gaussian blur**, **Add directional blur**, **Add glow**, **Add drop shadow** or **Add outline**.
4. Set the numbers of the block that appears.

The same commands are in the command palette. Each change is one undo step.

## The five effects

| Effect | Fields |
| --- | --- |
| **Gaussian blur** | **Radius** 0 to 500 px (default 10), **Repeat edges** |
| **Directional blur** | **Length** 0 to 500 px (default 20), **Angle**, **Repeat edges** |
| **Glow** | **Mode** (outer or inner), **Radius**, **Intensity** 0 to 5, **Threshold** 0 to 1, **Color** |
| **Drop shadow** | **Color**, **Angle**, **Distance** 0 to 1000 px, **Blur** 0 to 500 px |
| **Outline** | **Width** 0 to 200 px (default 6), **Color** |

**Repeat edges** keeps the edge of the picture sharp instead of fading into transparent when you blur. A drop shadow and an outline follow the shape of the picture's visible pixels, so a transparent PNG gets a shadow in its own shape, not in a box.

## Reorder, turn off and remove effects
- Click the switch at the left of an effect's header to turn it off or on. A turned-off effect keeps its settings.
- Drag the grip of an effect onto another effect's header. A line shows where it will land.
- Click **Move effect up** or **Move effect down** to reorder with the keyboard.
- Click **Remove effect** (the trash button) to delete one effect, or **Remove effects** on the **Add** row to delete all of them.

The order matters: a shadow above an outline casts the shadow of the plain picture, below it the shadow of the outlined picture.

## Animate an effect
Every number and color has a stopwatch and a key diamond, as in [Keyframes](keyframes.md). Click the stopwatch to animate the field, then change the value at different times. **Mode** and **Repeat edges** cannot be animated.

## How effects combine with other features
- A clip's [masks](masks.md) apply first. Effects then work on the masked picture, so a glow can spread past the mask's edge.
- Effects work on the flat picture, before position, scale and 3D tilt. A tilted clip is tilted with its effects already drawn, and a shadow's angle turns with the clip.
- A clip used as a [track matte](blend-modes-and-track-mattes.md) keys through its picture without its own effects.
- In a transition, the effects of the clip that dominates the frame apply to the whole transition.

## Limits
- Effects are available on clips that show a picture; audio clips and nulls have none.
- Wide outlines (past about 96 px at the shown size) can show slight scallops.
- Effects are computed at up to 4096 px on the long side.
- Blurs are costly at full resolution: a Gaussian blur on a 1080x1920 video can add about 60 to 130 ms of graphics time per exported frame, so exports with wide blurs take longer. Playback in the preview runs at the preview's size.
- Color adjustments, keys and looks are not available yet.

## Related pages
- [Masks](masks.md)
- [Blend modes and track mattes](blend-modes-and-track-mattes.md)
- [Keyframes](keyframes.md)
- [Editing properties](editing-properties.md)

<sub>Last updated: Batch 74, 2026-11-09</sub>
