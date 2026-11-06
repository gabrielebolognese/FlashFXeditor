# Effects

Effects change how a layer looks after it is drawn: blur it, make it glow, give it a shadow or an outline, grade its color, key out a green screen or apply a LUT. You stack several effects on one clip, change their order and animate their numbers. You add and tune them in the **Effects** section of **Edit Properties**.

> **Video placeholder: Effects overview**
> - File: `videos/effects/overview.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows: select a title; in **Effects** click **Add glow**; set **Intensity** to `2`; click **Add drop shadow**; drag the shadow's grip above the glow; click the stopwatch of **Intensity** and set two keys; turn the glow off and on; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

> **Video placeholder: Color, green screen and looks**
> - File: `videos/effects/color-and-looks.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: select a green screen clip; on the **Color** row click **Add chroma key**, pick the screen color and raise **Spill**; click **Add color adjust** and drag **Exposure**; click **Add LUT**, click the load button of **File**, pick a `.cube` file and set **Intensity** to `0.5`; type `Green screen` in **Look name** and click **Save these effects as a look**; select another clip and click the **Green screen** chip; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## In this page
- [Add an effect](#add-an-effect)
- [The five basic effects](#the-five-basic-effects)
- [Color, stylize and key effects](#color-stylize-and-key-effects)
- [Use a LUT](#use-a-lut)
- [Save and apply looks](#save-and-apply-looks)
- [Reorder, turn off and remove effects](#reorder-turn-off-and-remove-effects)
- [Animate an effect](#animate-an-effect)
- [How effects combine with other features](#how-effects-combine-with-other-features)
- [Limits](#limits)
- [Related pages](#related-pages)

## Add an effect
1. Select one clip that shows a picture: video, image, text, solid, shape or compound.
2. In **Edit Properties**, open the **Effects** section, after **Masks**.
3. On the **Add** row, click **Add Gaussian blur**, **Add directional blur**, **Add glow**, **Add drop shadow** or **Add outline**. On the **Color** row, click **Add color adjust**, **Add vignette**, **Add sharpen**, **Add grain**, **Add chroma key**, **Add luma key** or **Add LUT**.
4. Set the numbers of the block that appears.

The same commands are in the command palette. Each change is one undo step.

## The five basic effects

| Effect | Fields |
| --- | --- |
| **Gaussian blur** | **Radius** 0 to 500 px (default 10), **Repeat edges** |
| **Directional blur** | **Length** 0 to 500 px (default 20), **Angle**, **Repeat edges** |
| **Glow** | **Mode** (outer or inner), **Radius**, **Intensity** 0 to 5, **Threshold** 0 to 1, **Color** |
| **Drop shadow** | **Color**, **Angle**, **Distance** 0 to 1000 px, **Blur** 0 to 500 px |
| **Outline** | **Width** 0 to 200 px (default 6), **Color** |

**Repeat edges** keeps the edge of the picture sharp instead of fading into transparent when you blur. A drop shadow and an outline follow the shape of the picture's visible pixels, so a transparent PNG gets a shadow in its own shape, not in a box.

## Color, stylize and key effects

| Effect | Fields |
| --- | --- |
| **Color adjust** | **Brightness**, **Contrast**, **Saturation**, **Temperature**, **Tint**, **Vibrance** (each -100 to 100 %), **Exposure** -5 to 5 EV, **Hue** -180 to 180°. Everything starts at 0, which changes nothing. A positive **Tint** is magenta, a negative one green. |
| **Vignette** | **Amount** 0 to 1 (default 0.5), **Radius** 0 to 1.5 (default 0.9), **Softness** 0 to 1 (default 0.6). The radius is 1 at the middle of an edge of the clip and about 1.41 at a corner. |
| **Sharpen** | **Amount** 0 to 5 (default 1), **Radius** 0.5 to 20 px (default 1.5) |
| **Grain** | **Amount** 0 to 1 (default 0.2), **Size** 0.5 to 20 px (default 1.5), **Animated** (on by default: the grain changes every frame) |
| **Chroma key** | **Color** (the screen color, green by default), **Tolerance** (0.18), **Softness** (0.12), **Spill** (0.6), each 0 to 1 |
| **Luma key** | **Threshold** (0.1), **Softness** (0.1), each 0 to 1, **Invert** |
| **LUT** | **File**, **Intensity** 0 to 1 (default 1) |

**Chroma key** makes the pixels near the screen color transparent. Raise **Tolerance** to remove more shades of it. **Spill** pulls the green or blue tint out of the edges that stay, such as hair. **Luma key** removes the dark pixels; with **Invert** it removes the bright ones.

> **Tip:** Still grain costs nothing while the picture does not change. Animated grain redraws on every frame, so turn **Animated** off when you do not need it.

## Use a LUT
A LUT is a `.cube` file that applies a color grade, such as one from a LUT pack or from DaVinci Resolve.

1. Select a clip and click **Add LUT** on the **Color** row.
2. On the **File** row of the LUT block, click the load button. It shows **No LUT** until you pick a file.
3. Pick a 3D `.cube` file.
4. Set **Intensity** to mix between the original (0) and the full grade (1).

The editor copies the file into the project's `luts` folder. Loading a file you already loaded reuses the copy; a different file with the same name is saved as `name-2.cube`. A file that is not a 3D LUT is refused with the message "... is not a 3D LUT (.cube)".

In the command palette, **Load LUT (.cube)…** gives a file to all selected clips in one undo step: each clip's first LUT effect uses it, and a clip without one gets a LUT effect.

> **Note:** If a LUT file goes missing from the project, the clip draws without it and nothing warns you.

## Save and apply looks
A look is a complete effect stack with its numbers and any LUT it uses. Looks are kept for all your projects, newest first, up to 50.

1. Select one clip that has effects.
2. Type a name in **Look name** on the **Save look** row.
3. Click **Save these effects as a look**. A saved look with the same name is replaced.
4. To use it, select one or more clips and click the look's name on the **Looks** row. This replaces each clip's effects, in one undo step.
5. To remove a look, click its **Delete look** button.

A look stores the numbers, not keyframes. The palette also has **Save effects as look** and **Apply last saved look**.

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
- There are no curves, color wheels or scopes.
- LUTs are read at 8 bits per color channel.
- **Mode**, **Repeat edges**, **Animated**, **Invert** and the LUT **File** cannot be animated.

## Related pages
- [Masks](masks.md)
- [Blend modes and track mattes](blend-modes-and-track-mattes.md)
- [Keyframes](keyframes.md)
- [Editing properties](editing-properties.md)

<sub>Last updated: Batch 75, 2026-11-09</sub>
