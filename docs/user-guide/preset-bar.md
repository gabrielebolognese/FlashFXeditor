# The preset bar

The preset bar is a row of picture buttons under the preview header. Each button shows a text preset exactly as it looks: its font, colors, outline, shadow and box. One click styles the selected texts or your captions, or adds a new text at the playhead that you type right away. Use it whenever you want a look for your words without leaving the preview; the **Presets** tab of the Media panel stays the place to manage the presets themselves (see [Text presets](text-presets.md)).

> **Video placeholder: The preset bar in one minute**
> - File: `videos/preset-bar/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A new 1080×1920 project with a talking-head video on V1 and A1. Under the preview header, the preset bar shows **Favorites**: nine buttons, each drawing its preset, from **Title** to **Yellow word**.
>   2. Click in the ruler at 2 seconds so nothing is selected. Click the **Bold outline** button: "BOLD" appears in the middle of the preview in Unbounded with a thick black outline, selected. Type `WAIT FOR IT` and press <kbd>Esc</kbd>.
>   3. Add two more titles with <kbd>T</kbd>, then select all three text clips on the timeline with <kbd>Shift</kbd>+click.
>   4. Point at **Neon glow**, then **Luxury gold**: the three titles change look while the pointer is on each button. Move the pointer off the bar: they are back in **Bold outline**.
>   5. Point at the third button: its tooltip reads **Bold outline** with **Alt+3**. Press <kbd>Alt</kbd>+<kbd>7</kbd>: the three titles take **Impact**. Hover **Undo** in the app bar: it reads **Undo Apply "Impact"**.
>   6. Open the set menu at the left of the bar and choose **Captions**: ten caption looks appear. Turn the mouse wheel over the row: it scrolls sideways.
>   7. Click the **Presets** button in the preview header (tooltip **Presets: hide the preset bar**): the bar disappears and the picture grows. Click it again: the bar is back, still on **Captions**.

## In this page
- [The parts of the bar](#the-parts-of-the-bar)
- [Show or hide the bar](#show-or-hide-the-bar)
- [Choose which presets the bar shows](#choose-which-presets-the-bar-shows)
- [Style text with one click](#style-text-with-one-click)
- [Try a look before you click](#try-a-look-before-you-click)
- [Add a new text from the bar](#add-a-new-text-from-the-bar)
- [Style your captions from the bar](#style-your-captions-from-the-bar)
- [Apply a preset with Alt and a number](#apply-a-preset-with-alt-and-a-number)
- [Scroll the row](#scroll-the-row)
- [Reorder the buttons](#reorder-the-buttons)
- [Save the selected text into the bar](#save-the-selected-text-into-the-bar)
- [Put presets into sets](#put-presets-into-sets)
  - [Make your own sets with tags](#make-your-own-sets-with-tags)
- [Use the bar with the keyboard](#use-the-bar-with-the-keyboard)
- [What the bar remembers](#what-the-bar-remembers)
- [Undo and the preset bar](#undo-and-the-preset-bar)
- [Related pages](#related-pages)

## The parts of the bar

The bar runs the whole width of the Preview panel, right under its header. From left to right:

| Part | What it does |
| --- | --- |
| Set menu (tooltip **The presets the bar shows**) | Picks the set of presets the row shows: **Favorites** at first. See [Choose which presets the bar shows](#choose-which-presets-the-bar-shows). |
| **Scroll the presets left** (arrow) | Scrolls the row back. Dimmed at the start of the row. |
| The buttons | One button per preset of the set. Each draws a short sample of text in the preset's look, on a gray swatch. Point at one for its name, and for the first nine, their key (**Alt+1** to **Alt+9**). |
| **Scroll the presets right** (arrow) | Scrolls the row on. Dimmed at the end of the row. |
| **+** | Saves the selected text's style as a new preset in the set the bar shows. See [Save the selected text into the bar](#save-the-selected-text-into-the-bar). |
| **Manage presets (the Presets tab)** | Opens the **Presets** tab of the Media panel, with every preset as a card. See [Text presets](text-presets.md). |

What a button draws:

- The preset's sample text, such as "Bold" for **Bold outline** or "Say it loud" for **Caption bold**. A preset without a sample text, such as your own presets, shows its name (up to 14 characters), or **Aa**.
- Its font and weight, fill or gradient, outline, shadow and background box, as the preview would draw them.
- For a caption preset with a word highlight, the last word in its highlight: colored, grown or on its box. See [Style your captions from the bar](#style-your-captions-from-the-bar).

The buttons get their pictures a moment after the bar appears, one after another. While the video plays, new pictures wait until you pause, so the bar never slows playback down. When you change a preset with **Update preset**, or a font it uses arrives (for example a font you add to **My fonts**), its button draws again by itself.

## Show or hide the bar

Click the **Presets** button (an icon) in the Preview panel header, between **Smart guides** and **Fullscreen**. Its tooltip reads **Presets: hide the preset bar** while the bar shows (the button is highlighted), and **Presets: show the preset bar** while it is hidden. You can also run **Preset bar** from the command palette.

- Hiding the bar gives its 48 pixels of height back to the preview: the picture grows at once, without a jump.
- The bar is shown in every new project. The project remembers whether you hid it. See [What the bar remembers](#what-the-bar-remembers).
- The fullscreen preview (<kbd>F</kbd>) has no bar; it comes back when you leave fullscreen. See [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md).
- <kbd>Alt</kbd>+<kbd>1</kbd> to <kbd>Alt</kbd>+<kbd>9</kbd> work while the bar is hidden too. See [Apply a preset with Alt and a number](#apply-a-preset-with-alt-and-a-number).

## Choose which presets the bar shows

Open the set menu at the left of the bar and choose a set:

| Set | Shows | Order |
| --- | --- | --- |
| **Favorites** (the default) | The presets with a star. Nine starter presets are favorites from the start: **Title**, **Subtitle**, **Bold outline**, **Caption bold**, **Neon glow**, **Luxury gold**, **Impact**, **Futuristic** and **Yellow word**. | Yours: drag to reorder |
| **Titles** | 23 starter looks for titles, and the presets you put there | Yours: drag to reorder |
| **Subtitles** | 10 starter looks for subtitles and lower thirds, and the presets you put there | Yours: drag to reorder |
| **Captions** | 10 starter looks for captions, several with a word highlight, and the presets you put there | Yours: drag to reorder |
| **Recent** | The last 12 presets you used: applied to texts or captions, or used to add a text with a click, <kbd>Alt</kbd> and a number, or a drop on the preview | The latest first |
| **All** | Every preset: the **Global** ones, then those of the open project | The order of the **Presets** tab (oldest first) |
| Your tags, for example **promo** | The presets with that tag, after **All** in alphabetical order | Yours: drag to reorder |

- The bar shows the **Global** presets and those of the open project together, whichever list the **Presets** tab shows.
- To put a preset into **Favorites**, **Titles**, **Subtitles** or **Captions**, or to give it a tag, see [Put presets into sets](#put-presets-into-sets).
- The starter presets are listed in [Start with the starter presets](text-presets.md#start-with-the-starter-presets).
- You can also show a set from the command palette: **Preset bar: Favorites**, **Preset bar: Titles**, **Preset bar: Subtitles**, **Preset bar: Captions**, **Preset bar: Recent** and **Preset bar: All**.

When a set is empty, the row says so instead:

| Message | Meaning |
| --- | --- |
| **Loading presets…** | The editor is reading your presets. |
| **No favorites yet: right-click a preset (Manage opens them all) and check Favorites.** | No preset has a star. |
| **The presets you apply show here.** | **Recent** is empty: you haven't used a preset yet. |
| **No presets in Titles yet.** (with the set's name) | The set has no presets, for example after you deleted them. |

## Style text with one click

1. Select one or more text clips, on the timeline or in the preview.
2. Click a button.

- Every selected text clip takes the preset's style, box and animations in one step, named after the preset, for example **Apply "Bold outline"**. Their words, timing and position stay, unless the preset's **Apply position** is on.
- The selection stays, so you can click another button to try the next look, or press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to go back.
- Other selected clips (videos, images) are left alone, and so are text clips on locked tracks.
- The text clips now use the preset, so **Update preset** writes their later changes into it.

A click on a button does the same as a click on the preset's card in the **Presets** tab. For what a preset changes and keeps, see [What a preset keeps](text-presets.md#what-a-preset-keeps) and [Apply a preset to text](text-presets.md#apply-a-preset-to-text).

## Try a look before you click

With text clips, the caption track or a cue selected, point at a button: the preview shows that look on them while the pointer stays there. Nothing changes yet, and nothing goes into the history.

- Move to the next button to see the next look.
- The old look comes back when the pointer leaves the bar, when you scroll the row, start a drag, open a button's menu or change the selection.
- The live look shows the preset's style, box and position (with **Apply position**), not its animations: they play once you click.
- With nothing selected, pointing shows nothing: a click would add a new text.

## Add a new text from the bar

1. Put the playhead where the text should start.
2. Make sure no text clip, caption track or cue is selected: click an empty area of the timeline tracks, or the ruler.
3. Click a button. The new text appears in the preview with its sample text selected, for example "Bold" for **Bold outline**.
4. Type your words: they replace the sample. Press <kbd>Esc</kbd> to finish.

Where the new text goes:

| Preset | Place in the frame |
| --- | --- |
| A preset of **Titles**, or of no set | In the middle of the frame, like a title from <kbd>T</kbd> |
| A preset of **Subtitles** or **Captions** (and not of **Titles**) | In the lower third, its bottom edge at 78% of the frame height, like a subtitle from <kbd>Shift</kbd>+<kbd>T</kbd> |
| A preset with **Apply position** on, such as **Lower third** or **Big centered** | At the preset's position |

- A preset without a sample text starts with "Title", or "Subtitle" when it is placed like a subtitle.
- The text lasts until the end of the video clip under the playhead, or 3 seconds when there is none, and goes on the top video track when that is free. See [Where a new title goes](titles-and-text.md#where-a-new-title-goes).
- It starts with the preset's animations and uses the preset.
- Adding it is one step in the history, named after the preset, for example **Add "Bold outline"**. Typing is a second one.

> **Tip:** With a video clip selected, a click also adds a new text: only selected text clips (and the caption track or cues) take the look.

## Style your captions from the bar

1. Select the **CC** caption track (click its header) to style all the captions, or one or more cues to style only those, and no text clip.
2. Point at the buttons: the captions in the preview take each look while the pointer is on its button.
3. Click the one you want.

With the **CC** track selected:

- All the captions of the track take the preset's font, size, colors, outline, shadow and background box, in one step named, for example, **Apply "Yellow word" to captions**.
- A preset with a word highlight, such as **Yellow word**, **Boxed word**, **Green karaoke** or **Pop word**, also sets the track's **Highlight**, **Active** and **Other words**. Other presets keep the highlight the captions have. See [Highlight the spoken word](captions.md#highlight-the-spoken-word).
- The captions keep their **Position**, **Max width** and **Max lines**. The preset's box width, **Apply position** and animations are not used.

With cues selected:

- Only those cues change: they take the preset's look, and its word highlight when it has one, as a style of their own. The other captions keep the track's. The step has the same name.
- A preset with **Apply position** on, such as **Big centered**, also puts the cues at its place.
- **Reset to track style** in the **Caption style** section or in the cue menu gives them the track's look back. See [Give single cues their own style](captions.md#give-single-cues-their-own-style).

See [Give captions the look of a preset](captions.md#give-captions-the-look-of-a-preset).

## Apply a preset with Alt and a number

Press <kbd>Alt</kbd>+<kbd>1</kbd> to <kbd>Alt</kbd>+<kbd>9</kbd> to use the first nine buttons of the set the bar shows, counted from the left. A key does exactly what a click on its button does: it styles the selected texts or the captions, or adds a new text at the playhead.

- The tooltip of each of the first nine buttons shows its key, for example **Bold outline** with **Alt+3**. After you reorder a set, the keys follow the new order: <kbd>Alt</kbd>+<kbd>1</kbd> is always the first button.
- The keys work in every panel, also while the bar is hidden or scrolled. They work on the set the bar shows: with **Captions** shown, <kbd>Alt</kbd>+<kbd>1</kbd> is the first caption look.
- A number past the end of the set does nothing, for example <kbd>Alt</kbd>+<kbd>5</kbd> when the set has three presets.
- They don't work while you type in a field or edit a text in the preview, or while a dialog or a menu is open.
- To give them other keys, find **Apply preset bar button 1** to **Apply preset bar button 9** in **Settings** > **Shortcuts**. See [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

## Scroll the row

When a set has more buttons than the bar can show:

- Turn the mouse wheel over the row: it scrolls sideways. A sideways swipe on a touchpad scrolls it too.
- Click **Scroll the presets right** or **Scroll the presets left**: the row glides by about its width, keeping one button of the old view in sight. Each arrow is dimmed at its end of the row.
- With the keyboard, move through the buttons with the arrow keys: the row follows. See [Use the bar with the keyboard](#use-the-bar-with-the-keyboard).

## Reorder the buttons

> **Video placeholder: Organize the preset bar**
> - File: `videos/preset-bar/organize.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. The bar on **Favorites**. Press on the **Impact** button and drag it to the left: it dims and a gold line moves between the buttons. Release before **Subtitle**: **Impact** is now second, and its tooltip shows **Alt+2**.
>   2. Select a title styled in Oswald, red, with an outline. Click **+**: a name field takes the place of the row with **Oswald 140** selected. Type `Red promo` and press <kbd>Enter</kbd>: a **Red promo** button appears at the end of **Favorites**.
>   3. Right-click the **Red promo** button: the menu shows **Favorites** highlighted under **Preset bar sets**. Click **Titles**: it is highlighted too, and the menu stays open. Click **Tags…**.
>   4. The **Presets** tab opens with a field on the **Red promo** card. Type `promo, sale` and press <kbd>Enter</kbd>.
>   5. Open the set menu of the bar: **promo** and **sale** are listed after **All**. Choose **promo**: the bar shows **Red promo**.

1. Press on a button and drag it sideways. After a few pixels, the button dims and a gold line shows where it will go.
2. Release where it should be. The row takes the new order.

- The order is kept for that set, in this browser, for every project. Presets you add to the set later come at the end.
- **Recent** (the latest first) and **All** (the order of the **Presets** tab) can't be reordered: a drag there does nothing.
- A drag doesn't scroll the row by itself. To move a button further than the row shows, move it in a few steps, scrolling in between.
- To change your mind before a drag starts, keep the button pressed, move the pointer straight up or down off the bar and release: nothing is applied and nothing moves.
- Reordering isn't a step in the history.

## Save the selected text into the bar

1. Style a text clip as you like and select it.
2. In the set menu, choose the set the new preset should join.
3. Click **+** (tooltip **Save the selected text as a preset in Favorites**, with the set's name).
4. A name field takes the place of the row. It starts with the font and size of the text, for example **Oswald 140**, all selected. Type a name and press <kbd>Enter</kbd>.

The new preset appears in the set you showed:

| Set shown | The new preset |
| --- | --- |
| **Favorites** | Gets a star |
| **Titles**, **Subtitles** or **Captions** | Joins that set |
| One of your tags | Gets that tag |
| **Recent** | Comes first in **Recent** |
| **All** | Is added, in no set |

- <kbd>Esc</kbd>, or a click anywhere else, closes the field without saving.
- **+** is dimmed while no text clip is selected (tooltip **Save as preset: select a text clip first**).
- The preset goes into the list the **Presets** tab shows, **Global** or **Project** (into **Global** when the project is read-only), and the text clip now uses it. The names follow the same rules as **Save as preset**. See [Save a text style as a preset](text-presets.md#save-a-text-style-as-a-preset).
- From the command palette, **Save as preset into the preset bar's set** does the same, and shows the bar first if it is hidden.

## Put presets into sets

Right-click a button. The menu is the same as a card's in the **Presets** tab:

| Row | What it does |
| --- | --- |
| **Apply to selected text** (**Apply to captions** with the caption track or a cue selected, **Add at playhead** when neither is) | The same as a click on the button. |
| **Use as default title** (<kbd>T</kbd>), **Use as default subtitle** (<kbd>Shift</kbd>+<kbd>T</kbd>) | Makes the preset the look of <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd>. See [Choose the presets for T and Shift+T](text-presets.md#choose-the-presets-for-t-and-shiftt). |
| **Apply position** | Makes the preset place text too. See [Place text with a preset (Apply position)](text-presets.md#place-text-with-a-preset-apply-position). |
| **Favorites**, **Titles**, **Subtitles**, **Captions** (under **Preset bar sets**) | Puts the preset into that set, or takes it out. A row is highlighted in gold while the preset is in the set. The menu stays open, so you can change several. |
| **Tags…** | Gives the preset tags, which become sets of your own. See [Make your own sets with tags](#make-your-own-sets-with-tags). |
| **Rename** | Opens the **Presets** tab with the preset's name field open on its card. |
| **Duplicate**, **Export…**, **Delete** | As in the **Presets** tab. See [Find and organize presets](text-presets.md#find-and-organize-presets). |

- A preset can be in several sets at once, for example in **Favorites** and **Captions**.
- Taking the preset out of the set the bar shows removes its button from the row.
- For a preset of a read-only project, **Apply position**, the set rows, **Tags…**, **Rename**, **Duplicate** and **Delete** are dimmed.

### Make your own sets with tags

Each tag you give a preset is a set of the bar, for example **promo** for the looks of one client.

1. Right-click a button (or a card in the **Presets** tab) and choose **Tags…**.
2. The **Presets** tab opens with a field on the preset's card (placeholder **Tags, separated by commas**). It lists the preset's tags, all selected.
3. Type the tags, separated by commas, for example `promo, sale`, and press <kbd>Enter</kbd> or click elsewhere. <kbd>Esc</kbd> keeps the old tags.

- Each tag is listed in the set menu after **All**, in alphabetical order. Choose it to show its presets.
- A preset has up to 20 tags of up to 40 characters each. A tag typed twice (also in other capitals) is kept once.
- Tags are search words too: **Search presets** in the **Presets** tab finds presets by tag.
- The starter presets come with search words, such as `title`, `outline`, `neon` or `karaoke`. Those words are not sets: a tag you type that is one of them doesn't appear in the set menu. Pick another word, such as `my neon`.
- When no preset has a tag any more, its set leaves the menu (the bar keeps showing it until you choose another set).

## Use the bar with the keyboard

Press <kbd>Tab</kbd> until the set menu, an arrow, the buttons, **+** or **Manage presets (the Presets tab)** has the gold ring. The row of buttons is a single <kbd>Tab</kbd> stop:

| Key | In the row of buttons |
| --- | --- |
| <kbd>←</kbd> or <kbd>→</kbd> | Moves the ring to the previous or next button; the row scrolls along |
| <kbd>Home</kbd> or <kbd>End</kbd> | Moves to the first or last button |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Does what a click does |

The ring comes back to the button you were on last. A click on a button with the mouse doesn't take the keyboard: <kbd>Space</kbd> still plays afterwards. See [Keyboard navigation](keyboard-navigation.md).

## What the bar remembers

| Kept with the project | Kept in this browser, for every project |
| --- | --- |
| Whether the bar is shown or hidden, and the set it shows | The order you gave each set, and the **Recent** list |

The presets themselves, their stars, sets and tags are kept where the presets are: the **Global** ones in this browser (and your library folder, if you chose one), a project's in its folder. See [Keep presets for all projects or for one](text-presets.md#keep-presets-for-all-projects-or-for-one).

## Undo and the preset bar

| Step name | What made it |
| --- | --- |
| **Apply "Bold outline"** | A click, or <kbd>Alt</kbd> and a number, with text clips selected |
| **Apply "Yellow word" to captions** | A click, or <kbd>Alt</kbd> and a number, with the caption track or a cue selected |
| **Add "Bold outline"** | A click, or <kbd>Alt</kbd> and a number, with nothing selected |
| **Save preset "Red promo"** | **+**: the text clip starts to use the new preset. Undoing it leaves the preset in the list. |

Showing or hiding the bar, choosing a set, reordering, sets and tags are not steps in the history.

## Related pages
- [Text presets](text-presets.md)
- [Titles and text](titles-and-text.md)
- [Captions](captions.md)
- [Fonts](fonts.md)
- [Preview and playback](preview-and-playback.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Keyboard navigation](keyboard-navigation.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 53, 2026-10-19</sub>
