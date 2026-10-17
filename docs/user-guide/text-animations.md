# Text animations

Text animations make titles and subtitles move as they appear and leave: a fade, a slide, a pop, words popping in one after another, a typewriter. Give a text clip an in animation, an out animation or both in the **Animation** section of **Edit Properties**. Each click plays the animation in the preview, so you see the result right away. No keyframes needed.

> **Video placeholder: Text animations in one minute**
> - File: `videos/text-animations/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and A1. Press <kbd>T</kbd>, type `THREE THINGS NOBODY TELLS YOU ABOUT EDITING` and press <kbd>Esc</kbd>.
>   2. Scroll **Edit Properties** to the **Animation** section, under **Text**. Click **Word pop** in the **In** row: the preview plays the start of the title once, the words pop in one after another, and the playhead goes back to where it was. A sparkles icon appears in the clip's label bar on the timeline.
>   3. Click **Fade** in the **Out** row: the end of the title plays and it fades away.
>   4. Click **Typewriter**, then **Line reveal**, then **Bounce** in the **In** row: each one plays as you click it.
>   5. Click **Word pop** again, then click in the **Duration** field under **In**, type `1.5` and press <kbd>Enter</kbd>: the words pop in more slowly.
>   6. Move the playhead before the title and press <kbd>Space</kbd>: the title pops in, stays, and fades out at its end.

## In this page
- [When an animation plays](#when-an-animation-plays)
- [Add an in or out animation](#add-an-in-or-out-animation)
- [The 12 animations](#the-12-animations)
- [Preview an animation](#preview-an-animation)
- [Set how long an animation plays](#set-how-long-an-animation-plays)
- [Make words follow one another (Stagger)](#make-words-follow-one-another-stagger)
- [Choose the easing](#choose-the-easing)
- [Remove an animation](#remove-an-animation)
- [Animate several texts at once](#animate-several-texts-at-once)
- [How animations treat outlines, shadows and boxes](#how-animations-treat-outlines-shadows-and-boxes)
- [Save animations in a preset](#save-animations-in-a-preset)
- [Find animated clips on the timeline](#find-animated-clips-on-the-timeline)
- [Undo animation changes](#undo-animation-changes)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## When an animation plays

A text clip has two animations, set apart from each other:

- The **in** animation starts on the clip's first frame, where the text is not there yet, and brings it to rest.
- The **out** animation ends on the clip's last frame, where the text is gone.

Between them, the text stays still, exactly as you styled it.

Each animation plays over at most half the clip, so the in and out animations never overlap. On a 4-second title, a 3-second in animation plays in 2 seconds. Under the **Duration** field, a hint then reads, for example, **Plays in 2.00 s: half the clip**. The duration you typed is kept: lengthen the clip later and the animation plays at its full length again. A clip shorter than 2 frames plays no animation, and the hint reads **The clip is too short to play it**.

Animations show everywhere the preview plays: while you play, scrub, step frames and in the fullscreen preview. **Export frame** saves the text as it is at that frame, in the middle of its animation if the playhead is on one; see [Export the current frame](preview-and-playback.md#export-the-current-frame).

> **Note:** A text you are typing in the preview shows at rest, without its animation, so you always see what you type. The animation plays again as soon as you finish editing.

## Add an in or out animation

1. Select a text clip, on the timeline or in the preview.
2. In **Edit Properties**, find the **Animation** section, right after **Text**. It has two groups of rows: **In** and **Out**.
3. Click a chip in the **In** row to choose how the text appears, or in the **Out** row to choose how it leaves. Point at a chip to see its tooltip, for example **In: Word pop. Click to preview**.

What happens:

- The clip gets the animation in one step in the history, for example **In animation: Word pop**.
- The preview plays it once and puts the playhead back. See [Preview an animation](#preview-an-animation).
- The chip stays highlighted, and the clip shows a sparkles icon on the timeline. See [Find animated clips on the timeline](#find-animated-clips-on-the-timeline).

The first animation you choose on a side starts with its own length (see the table in [The 12 animations](#the-12-animations)). When that side already has an animation, a new chip keeps its **Duration**, **Stagger** and **Easing**, so you can try other animations at the same timing.

> **Tip:** If you are typing in the text when you click a chip, the editor finishes your edit first, then sets the animation.

## The 12 animations

Each row of chips has **None** and these 12 animations. Out animations go the other way: what comes in from below leaves upward, words that pop in one after another pop out with the last word first, and a typewriter erases from the end.

| Chip | In | Out | Moves | Starting length |
| --- | --- | --- | --- | --- |
| **Fade** | Fades in. | Fades out. | The whole text | 0.5 s |
| **Slide up** | Rises into place from below while it fades in. | Moves up while it fades out. | The whole text | 0.5 s |
| **Slide down** | Comes down into place from above while it fades in. | Moves down while it fades out. | The whole text | 0.5 s |
| **Slide left** | Comes in from the right, moving left, while it fades in. | Moves left while it fades out. | The whole text | 0.5 s |
| **Slide right** | Comes in from the left, moving right, while it fades in. | Moves right while it fades out. | The whole text | 0.5 s |
| **Pop** | Grows from 40% of its size, a little past full size, then settles. | Shrinks to 40% and fades away. | The whole text | 0.4 s |
| **Typewriter** | Types itself letter by letter, with no fade. Spaces count as letters. | Erases letter by letter from the end. | Letters | 1 s |
| **Word pop** | Each word pops in like **Pop**, one after another. | Each word pops out, the last word first. | Words | 0.8 s |
| **Word fade** | Each word fades in, one after another. | Each word fades out, the last word first. | Words | 0.8 s |
| **Line reveal** | Each line rises into its place from just below it, as if from a slot, one line after another. | Each line rises out of its place, the last line first. | Lines | 0.6 s |
| **Blur** | Goes from blurred to sharp while it fades in. | Blurs while it fades out. | The whole text | 0.6 s |
| **Bounce** | Grows from nothing and bounces twice around its full size. | Bounces and shrinks away. | The whole text | 0.8 s |

- The slides travel 0.6 times the font size: a 100-pixel title moves 60 pixels.
- The starting lengths are in seconds. The editor turns them into frames at the project's frame rate, for example 15 frames for 0.5 s at 30 fps.

## Preview an animation

Each click on an animation chip plays that animation once in the preview, then puts the playhead back where it was:

| You click | The preview plays |
| --- | --- |
| A chip in the **In** row | From the clip's start to 10 frames after the in animation ends |
| A chip in the **Out** row | From 10 frames before the out animation starts to the clip's end |

- Click the highlighted chip again to watch it once more. Nothing changes, and nothing is added to the history.
- A typed **Duration** or **Stagger**, and a new **Easing**, also play the animation again, so you see the change at once, wherever the playhead is.
- With several texts selected, the preview plays the one you clicked last.
- **None** removes the animation without playing anything.

## Set how long an animation plays

> **Video placeholder: Fine-tune an animation**
> - File: `videos/text-animations/timing.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A title "Hello animated world" on a 4-second clip, selected, with **Word pop** in. The **Animation** section reads **Duration** `0.80` s and **Stagger** `0.18` s.
>   2. Type `2` in the **Duration** field under **In** and press <kbd>Enter</kbd>: the preview plays the slower animation and the playhead comes back.
>   3. Put the playhead in the middle of the animation. Drag the timer icon of **Duration** to the left and to the right: the words in the preview move while you drag. Release.
>   4. Type `3` in **Duration**: the hint **Plays in 2.00 s: half the clip** appears under the field.
>   5. Type `0.3` in **Stagger**: the words come one after another with longer gaps.
>   6. Open **Easing** and choose **Ease in-out**: the animation plays again.

The **Duration** field under **In** or **Out** sets how long the whole animation takes, in seconds, from the first word starting to the last word arriving. It is dimmed while that side has no animation.

1. Click in the **Duration** field.
2. Type a length in seconds, for example `1.5`.
3. Press <kbd>Enter</kbd>. The animation plays again with its new length.

You can also drag the field's label, the timer icon, to the left or right. While you drag, the preview at the playhead follows: put the playhead inside the animation first to watch it change. The new length is set when you release, and the animation plays again. See [Drag a value](editing-properties.md#drag-a-value).

| | **Duration** | **Stagger** |
| --- | --- | --- |
| Shown as | Seconds with two decimals, for example **0.80 s** | Seconds with two decimals |
| Shortest | 1 frame | 0 |
| Longest | 10 seconds | 2 seconds |
| <kbd>↑</kbd> or <kbd>↓</kbd> | 1 frame longer or shorter | 1 frame longer or shorter |
| <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> | 10 frames | 10 frames |
| Dragging the label | 1 frame per pixel (10 with <kbd>Shift</kbd>, 0.1 with <kbd>Alt</kbd>) | The same |

- The editor keeps whole frames: a typed length is rounded to the nearest frame of the project. At 30 fps, one frame is about 0.03 s.
- Arrow presses less than 0.3 seconds apart are one step in the history.
- When the length is more than half the clip, the animation plays over half the clip and the hint under the field says so. See [When an animation plays](#when-an-animation-plays).

## Make words follow one another (Stagger)

**Word pop**, **Word fade** and **Line reveal** animate each word or line in turn. The **Stagger** field sets the delay between one word (or line) starting and the next one starting. It is dimmed for the animations that move the whole text, and for **Typewriter**, which types at an even pace over its **Duration**.

- **Automatic stagger:** until you change it, the editor spreads the words over the **Duration** so that each word overlaps the next ones, and the field shows the delay it uses. For example, a 3-word title with a 0.8 s **Word pop** shows **0.18 s**.
- **Your own stagger:** type a delay, or drag the field's label. `0` makes all the words move at the same time. Longer delays make the words come one by one.
- The **Duration** stays the length of the whole animation. Each word takes what is left after the delays, so a longer stagger makes each word move faster. A stagger longer than the **Duration** divided by the number of words (or lines) is shortened to fit, so the last word still arrives in time.

> **Tip:** To go back to the automatic stagger, click **None**, then the animation again. This also puts its **Duration** and **Easing** back to their starting values.

## Choose the easing

The **Easing** menu sets how the speed changes during the animation. It is dimmed while that side has no animation.

| Option | The movement |
| --- | --- |
| **Auto (…)** | The animation's own easing, named in brackets, for example **Auto (Ease out)**. Out animations use the mirror of the in easing: an animation that eases out when it comes in eases in when it leaves. |
| **Linear** | Steady speed from start to end |
| **Ease in** | Starts slowly and speeds up |
| **Ease out** | Starts fast and slows down into place |
| **Ease in-out** | Slow at both ends, fast in the middle |

**Fade**, the four slides, **Word fade**, **Line reveal** and **Blur** use **Ease out** when they come in. **Pop**, **Word pop** and **Bounce** use **Linear**, because their overshoot and bounces are part of their shape.

> **Note:** **Typewriter** always types at an even pace: the **Easing** menu doesn't change it.

## Remove an animation

Click **None** in the **In** or **Out** row. The animation is removed in one step, **Remove in animation** or **Remove out animation**, without a preview. **None** is highlighted while that side has no animation.

## Animate several texts at once

Select several text clips (<kbd>Shift</kbd>+click them on the timeline) to animate them together:

- A chip sets the animation on every selected text clip, in one step. Each clip keeps its own **Duration**, **Stagger** and **Easing** when it already had an animation on that side.
- When the selected clips have different animations, no chip is highlighted. Fields with different values show `--`. See [Edit several clips at once](editing-properties.md#edit-several-clips-at-once).
- A typed **Duration** or **Stagger** sets the same value on every selected clip that has an animation on that side. Arrow presses add to or subtract from each clip's own value.
- Videos, images and other clips in the selection are left alone, and so are text clips on locked tracks.

## How animations treat outlines, shadows and boxes

Animations play on the text exactly as you styled it, with its font, fill, outline and shadow. Your text style doesn't change.

- **Fade**, the four slides, **Pop**, **Blur** and **Bounce** move the whole text, its background box included.
- **Word pop**, **Word fade**, **Typewriter** and **Line reveal** animate the words, letters or lines, while the background box stays in place. The box shows as soon as the first word appears, and until the last one has left. With **Line reveal**, the box is there for the whole animation and the lines rise into it.

> **Note:** While words animate one after another, the shadows of neighboring words can overlap and look a little darker for a moment. At rest, the text looks exactly as styled.

## Save animations in a preset

A text preset keeps the in and out animations of the text you save it from, with their **Duration**, **Stagger** and **Easing**. Applying the preset gives them to the selected texts, and new texts from the preset start with them. Four starter presets come with animations: **Lower third**, **Caption bold**, **Neon glow** and **Breaking**. See [Animations in presets](text-presets.md#animations-in-presets).

Captions on the caption track don't animate: a preset applied to them gives them its style only. Captions can highlight each word as it is spoken instead; see [Highlight the spoken word](captions.md#highlight-the-spoken-word).

## Find animated clips on the timeline

A text clip with an in or out animation shows a sparkles icon in its label bar on the timeline. See [Read the badges in the label bar](clip-thumbnails-and-waveforms.md#read-the-badges-in-the-label-bar).

The clip's body on the timeline and the preset cards always show the text at rest.

## Undo animation changes

Every animation change is one step in the history. Hover **Undo** in the app bar to see its name. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

| Step name | What made it |
| --- | --- |
| **In animation: Word pop**, **Out animation: Fade** (with the chip's name) | A chip in the **In** or **Out** row |
| **Remove in animation**, **Remove out animation** | **None** |
| **Change in animation duration**, **Change out animation duration** | The **Duration** field |
| **Change in animation stagger**, **Change out animation stagger** | The **Stagger** field |
| **Change in animation easing**, **Change out animation easing** | The **Easing** menu |

## What is not available yet

These parts are available in a later version:

- Exporting the video with its animations. **Export frame** already includes them.
- Moving, scaling or turning a text over time with keyframes.

## Related pages
- [Titles and text](titles-and-text.md)
- [Text presets](text-presets.md)
- [Captions](captions.md)
- [Editing properties](editing-properties.md)
- [Preview and playback](preview-and-playback.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 32, 2026-10-17</sub>
