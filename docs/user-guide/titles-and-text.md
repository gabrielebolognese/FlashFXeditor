# Titles and text

Text clips put words on your video: a hook at the start, a title over a shot, a subtitle in the lower third. Press <kbd>T</kbd> and type: the title appears at the playhead and you write it right in the preview. Then style it in the **Text** section of **Edit Properties**, with a font that comes with the editor or one from your computer, an outline, a shadow and a background box. To make it move as it appears and leaves, give it an animation; see [Text animations](text-animations.md). To reuse a style, save it as a preset; see [Text presets](text-presets.md). To caption the speech of a whole video, use the caption track instead; see [Captions](captions.md).

> **Video placeholder: Titles and text in one minute**
> - File: `videos/titles-and-text/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and A1. Put the playhead at the start and press <kbd>T</kbd>: "Title" appears in the middle of the preview, selected in gold, with a gold caret.
>   2. Type `WAIT FOR IT` and press <kbd>Esc</kbd>: the clip on the new track V2 is named "WAIT FOR IT" and lasts as long as the video under it.
>   3. Press <kbd>T</kbd> again, type `the ending` and press <kbd>Esc</kbd>: the second title sits just below the first.
>   4. Press <kbd>Shift</kbd>+<kbd>T</kbd> over the video and type a long sentence: the subtitle in the lower third wraps and grows upwards, with a dark box behind each line. Press <kbd>Esc</kbd>.
>   5. Click the first title in the preview. In the **Text** section of **Edit Properties**, click the **Font** field, type `oswald` in **Search fonts** and press <kbd>Enter</kbd>.
>   6. Turn on **Stroke** and drag the **W** label of **Width** to the right: a black outline grows around the letters.
>   7. Drag a corner handle of the title outward in the preview: the text gets larger and **Size** follows.
>   8. Double-click a word of the title: the caret lands where you clicked. Double-click the word again to select it, type a new word and press <kbd>Esc</kbd>.

## In this page
- [Add a title](#add-a-title)
- [Add a subtitle](#add-a-subtitle)
- [Where a new title goes](#where-a-new-title-goes)
- [Edit text in the preview](#edit-text-in-the-preview)
- [Select and move text in the preview](#select-and-move-text-in-the-preview)
- [Resize text with its handles](#resize-text-with-its-handles)
- [Style text in the Text section](#style-text-in-the-text-section)
- [Choose a font](#choose-a-font)
- [Use fonts from your computer](#use-fonts-from-your-computer)
- [Fix a missing font](#fix-a-missing-font)
- [Text clips on the timeline](#text-clips-on-the-timeline)
- [Undo text changes](#undo-text-changes)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## Add a title

1. Put the playhead where the title should start.
2. Press <kbd>T</kbd>, or click **Title** in the timeline toolbar (tooltip **Add title**).
3. The word "Title" appears in the middle of the preview, selected (a gold highlight behind the letters). Type your text: it replaces the selection.
4. Press <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

That is the whole workflow: one key, your words, one key. The new title has the look of the default title preset: at first the **Title** preset, white Inter ExtraBold at 120 pixels, centered, with a soft shadow. To start your titles in another look, choose another default; see [Choose the presets for T and Shift+T](text-presets.md#choose-the-presets-for-t-and-shiftt). The title lasts until the end of the video clip under the playhead, or 3 seconds by default; see [Where a new title goes](#where-a-new-title-goes).

- <kbd>T</kbd> works in every panel, except while you type in a text field, while a dialog is open, and while you edit a text (there it types a "t").
- If the video is playing, it pauses, so the playhead stays on the new title while you type.
- While you type, <kbd>Enter</kbd> starts a new line; it doesn't finish the title.

> **Tip:** To stack lines of text, leave the first title selected and press <kbd>T</kbd> again. The new title goes 40 pixels below the selected one, centered under it, instead of in the middle of the frame, so the two don't overlap.

## Add a subtitle

1. Put the playhead where the subtitle should start.
2. Press <kbd>Shift</kbd>+<kbd>T</kbd>, or click **Subtitle** in the timeline toolbar (tooltip **Add subtitle**).
3. The word "Subtitle" appears in the lower third of the preview, selected. Type your text.
4. Press <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

A subtitle is made to be read over the picture. It has the look of the default subtitle preset, at first the **Subtitle** preset:

- White Inter SemiBold at 56 pixels, with a dark rounded box behind each line.
- A fixed width of 900 pixels (in a 1080×1920 frame): long sentences wrap onto more lines.
- Its bottom edge sits at 78% of the frame height, and it is anchored at the bottom: more lines grow upwards, and the last line stays in place.

A subtitle always goes to the lower third, also when another text clip is selected, unless its preset places text itself (**Apply position**; see [Place text with a preset (Apply position)](text-presets.md#place-text-with-a-preset-apply-position)).

> **Tip:** On a 9:16 video, the app buttons and the caption of Reels, TikTok and Shorts cover part of the lower third. Open **Overlays** in the preview header and pick your platform to see that area, then drag the subtitle up if it is covered. See [Show a platform safe zone](preview-zoom-overlays-fullscreen.md#show-a-platform-safe-zone).

> **Tip:** A subtitle is a single text clip that you place and time by hand. For captions that run along with the whole video, cue after cue, use the **CC** caption track: you can import an SRT or VTT file and style all the cues at once. See [Captions](captions.md).

## Where a new title goes

Titles and subtitles follow the same rules:

| | Rule |
| --- | --- |
| Start | At the playhead. |
| Length | Until the end of the video clip under the playhead, so the text covers the rest of that shot. When no video clip is under the playhead, 3 seconds by default. The video clip counted is the one on the highest shown video track that has a video (not an image or a text) at the playhead. To always use one length, turn **Match clip** off in **Settings** > **General**; the **Title** row there and in the **Project** section sets the length. See [Set the length of new clips](settings.md#set-the-length-of-new-clips). |
| Track | The top video track, when it is free for the whole length, unlocked and shown. Otherwise a new video track at the top, so the text stays above the picture. |
| Place in the frame | A title: in the middle of the frame, or 40 pixels below the selected text clip. A subtitle: its bottom edge at 78% of the frame height, centered. When the default preset has **Apply position** on: the preset's position. |
| Name | The clip is named after the first line of its text. See [Text clips on the timeline](#text-clips-on-the-timeline). |

- In a project of another size, the font size and the other pixel values of a new title scale with the shorter side of the frame. For example, in a 720×1280 project a title starts at 80 pixels and a subtitle at about 37 pixels, with a 600-pixel box; a 1920×1080 project uses the same sizes as 1080×1920. See [Presets in projects of other sizes](text-presets.md#presets-in-projects-of-other-sizes).
- After that, a text clip is like any other clip: move it, trim it, split it or delete it on the timeline. It has no media behind it, so you can make it as long as you like. See [Trim a clip](trimming.md#trim-a-clip).
- Adding a title is one step in the history (**Add title** or **Add subtitle**), and the text you type is a second one (**Edit text**).

## Edit text in the preview

> **Video placeholder: Edit text in the preview**
> - File: `videos/titles-and-text/edit-text.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A title "Big news today" on V2 over a video. Double-click just before "today" in the preview: a gold outline surrounds the text and a gold caret blinks where you clicked.
>   2. Press <kbd>Enter</kbd>: "today" moves to a second line. Press <kbd>↑</kbd> and <kbd>End</kbd>: the caret goes to the end of the first line.
>   3. Double-click "news": it gets a gold highlight. Type `NEWS`.
>   4. Click in **Edit Properties** > **Text** > **Size**, type `150` and press <kbd>Enter</kbd>: the text grows, and the caret stops blinking and stays after "NEWS".
>   5. Click the text again and keep typing. Press <kbd>Esc</kbd>: the outline disappears and the handles are back.
>   6. Hover **Undo** in the app bar: it reads **Undo Edit text**.

You type text right on the picture, at its real size, font and color. What you see while you type is what the video shows. A text with an animation shows at rest while you edit it, even on a frame where it is still coming in; see [Text animations](text-animations.md).

### Start editing

| To | Do this |
| --- | --- |
| Add a title or subtitle and type it | Press <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd>. The default text is selected, so typing replaces it. |
| Edit a text, with the caret where you click | Double-click the text in the preview. |
| Edit the selected text clip, with all its text selected | Press <kbd>Enter</kbd> in the Timeline or Preview panel. |

- A double-click selects the text clip alone, without the rest of the selection.
- When you press <kbd>Enter</kbd> and the playhead is not over the selected text clip, the playhead jumps to the clip's start, so the preview shows it. With several text clips selected, <kbd>Enter</kbd> edits the one you clicked last. With no text clip selected, <kbd>Enter</kbd> does nothing.
- You can't edit a text clip on a locked track.

While you edit:

- A gold outline surrounds the text, without handles.
- A gold caret blinks between the letters. It stops blinking while you work in **Edit Properties**, and blinks again when you click the text.
- Selected letters have a gold highlight behind them.
- The text grows from its anchor point as you type, as set by **Align** and **Anchor** in the **Text** section. See [Choose which way text grows](#choose-which-way-text-grows).
- The **Text** field of the **Text** section shows what you type.

### Keys while you edit

While you edit a text, the keys type into it, and the other shortcuts are off: <kbd>Space</kbd> types a space instead of playing, and <kbd>Delete</kbd> deletes a letter instead of the clip.

| Action | Windows | macOS |
| --- | --- | --- |
| New line | <kbd>Enter</kbd> or <kbd>Shift</kbd>+<kbd>Enter</kbd> | <kbd>Return</kbd> or <kbd>⇧</kbd>+<kbd>Return</kbd> |
| Move the caret one letter | <kbd>←</kbd> or <kbd>→</kbd> | <kbd>←</kbd> or <kbd>→</kbd> |
| Move the caret one word | <kbd>Ctrl</kbd>+<kbd>←</kbd> or <kbd>Ctrl</kbd>+<kbd>→</kbd> | <kbd>⌥</kbd>+<kbd>←</kbd> or <kbd>⌥</kbd>+<kbd>→</kbd> |
| Move the caret to the line above or below | <kbd>↑</kbd> or <kbd>↓</kbd> | <kbd>↑</kbd> or <kbd>↓</kbd> |
| Move the caret to the start or end of the line | <kbd>Home</kbd> or <kbd>End</kbd> | <kbd>Fn</kbd>+<kbd>←</kbd> or <kbd>Fn</kbd>+<kbd>→</kbd> |
| Select while you move | Hold <kbd>Shift</kbd> with any of the moves above | Hold <kbd>⇧</kbd> |
| Select all the text | <kbd>Ctrl</kbd>+<kbd>A</kbd> | <kbd>⌘</kbd>+<kbd>A</kbd> |
| Cut, copy, paste | <kbd>Ctrl</kbd>+<kbd>X</kbd>, <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>V</kbd> | <kbd>⌘</kbd>+<kbd>X</kbd>, <kbd>⌘</kbd>+<kbd>C</kbd>, <kbd>⌘</kbd>+<kbd>V</kbd> |
| Undo your typing | <kbd>Ctrl</kbd>+<kbd>Z</kbd> | <kbd>⌘</kbd>+<kbd>Z</kbd> |
| Finish editing | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or <kbd>Esc</kbd> | <kbd>⌘</kbd>+<kbd>Return</kbd> or <kbd>Esc</kbd> |

- <kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>Home</kbd> and <kbd>End</kbd> follow the lines as you see them, also where a long line wraps in a fixed box.
- <kbd>Esc</kbd> keeps what you typed, like <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. To take it back, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> after you finish.
- Input methods for Japanese, Chinese, Korean and other languages work: the candidate window opens next to the caret, and the characters you are composing are underlined in gold until you choose them.

### Click and drag in the text

| To | Do this on the text you edit |
| --- | --- |
| Put the caret between two letters | Click there |
| Select from the caret to where you click | <kbd>Shift</kbd>+click |
| Select a word | Double-click it |
| Select all the text | Triple-click |
| Select part of the text | Drag across it |

The pointer is a text cursor over the text you edit.

### Finish editing

Editing ends, and what you typed is kept, when you:

- press <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>;
- click anywhere else: another part of the preview, the timeline, the Media panel or the app bar. The click then does what it normally does, for example selects another layer;
- click in the **Text** field of the **Text** section: you go on typing there;
- click a chip of the **Animation** section: the animation is set and plays;
- select another clip, move the playhead off the text clip, or hide its track.

The whole edit is one step in the history, named **Edit text**, whatever you typed.

> **Note:** If the text clip is deleted, or its track gets locked, while you edit it, editing ends and what you typed since you started is not kept.

> **Tip:** If you delete all the text and finish, the clip stays on the timeline, empty and named "Text". Select it and press <kbd>Delete</kbd> to remove it.

### Change the style while you type

The **Edit Properties** panel stays live while you edit. Change the font, the size, a color or any other value in the **Text** section, and the text updates at once while you keep editing: your typing and the caret stay where they are. Click the text to type again.

Clicks in the font picker, the color picker, menus and dialogs also keep editing on.

## Select and move text in the preview

A text clip under the playhead is a layer of the picture, like a video or an image. Select it, move it, rotate it and change its stacking order as described in [Arranging layers in the preview](arranging-layers-in-the-preview.md). The differences:

- **A click counts only on the letters.** A click selects a text only on its letters (with a margin of 4 pixels) and on its background box. A click on the empty parts of its box, for example beside a short line, goes to the layer below. A selection rectangle uses the letters too.
- **Moving snaps the text's box** to the frame, the guides and other layers, like a picture. See [Snap a layer into place](snapping-and-smart-guides.md#snap-a-layer-into-place).
- **A double-click edits the text** instead of entering crop mode. Text can't be cropped.
- **Rotating** works as for pictures: drag just outside a corner. See [Rotate a layer](arranging-layers-in-the-preview.md#rotate-a-layer).
- **Fit in frame**, **Fill frame** and **Center in frame** in the quick actions, and the **Transform** and **Opacity** sections, work on a text as on a picture, using the text's box. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture).

## Resize text with its handles

> **Video placeholder: Resize text with its handles**
> - File: `videos/titles-and-text/resize-text.mp4` (not recorded yet)
> - Length: about 35 seconds
> - Shows:
>   1. A title with a stroke and a shadow, selected in the preview: handles at the four corners and on the left and right sides, none on top or bottom.
>   2. Drag the bottom-right corner outward: the text, its outline and its shadow grow together, the top-left corner stays, the readout shows **160 px**, and **Size** in the **Text** section reads 160.
>   3. Drag the right side handle to the left: the readout shows the width, for example **W 500 px**, the words wrap onto two lines, and **Box** switches to **Fixed**.
>   4. Drag the left side handle with <kbd>Alt</kbd> held: both sides move around the center.

One selected text has six handles: the four corners and the middle of the left and right sides. They change the text itself, not its scale:

| Handle | What changes |
| --- | --- |
| A corner | The font size. The stroke, shadow, letter spacing and background box grow or shrink with it, so the text keeps its look. In a fixed box, the box width scales too. The opposite corner stays in place. The readout shows the size, for example **160 px**. |
| The left or right side | The width of the text box. The words wrap at the new width. An **Auto** box becomes a **Fixed** box. The opposite side stays in place, at the height the anchor names. The readout shows the width, for example **W 500 px**. |
| Any handle, with <kbd>Alt</kbd> | As above, but around the center of the box. |

- A text has no top and bottom handles: its height comes from its lines.
- <kbd>Shift</kbd> does nothing on text handles, and the handles don't snap.
- When the text is small on screen, the side handles hide (a side must be at least 28 pixels long on screen). Zoom the preview in to get them back.
- The **Size** and **Width** fields of the **Text** section follow when you release the mouse button.
- Each drag is one step in the history: **Resize text** or **Change text box width**.
- With several layers selected, the handles scale the whole group, text included, as for pictures; see [Transform several layers at once](arranging-layers-in-the-preview.md#transform-several-layers-at-once). To make a single text larger without changing its font size, type a value in **Scale** in the **Transform** section.

## Style text in the Text section

> **Video placeholder: Style a title**
> - File: `videos/titles-and-text/style-text.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A title selected. **Edit Properties** shows the **Clip** section, then **Text**.
>   2. Click **Gradient** in **Fill**, then pick a yellow **Top** and an orange **Bottom**: the letters fade from yellow to orange.
>   3. Turn on **Stroke**: a black outline appears outside the letters. Drag the **W** label of **Width** to make it thicker.
>   4. Turn on **Background**, click **Block**, and type `40` in the **X** of **Padding**: a rounded box surrounds the whole text.
>   5. Click **AA** in **Case**: the text turns uppercase.
>   6. Click **Fixed** in **Box** and type `600` in **Width**: the text wraps onto two lines.
>   7. Select two titles: fields that differ show `--`. Click **Align left**: both align left.

Select one or more text clips. **Edit Properties** shows the **Text** section right after the **Clip** section, followed by **Transform** and **Opacity**. Every change applies to all the selected text clips and is one step in the history. A field whose values differ shows `--`. Text clips on locked tracks don't change.

The number fields work like the others in the panel: type a value, or drag the field's label (a letter or an icon) to change it while you watch the preview. See [Type a value](editing-properties.md#type-a-value) and [Drag a value](editing-properties.md#drag-a-value). The color fields open the color picker; see [Pick a color](editing-properties.md#pick-a-color). All pixel values are pixels of the project frame.

| Row | What it does | Values |
| --- | --- | --- |
| **Text** | The content. Type here as in the preview; <kbd>Enter</kbd> starts a new line. With several text clips selected, what you type replaces the text of all of them. | Any text |
| **Font** | The font family, shown in its own font. Click it to open the font picker. See [Choose a font](#choose-a-font). | |
| **Weight** | How bold the letters are, with the **Italic** button next to it. | **Thin 100** to **Black 900**; for a font that comes with the editor, only the weights it has |
| **Size** | The font size. | 1 to 2000 px |
| **Fill** | **Solid** (one color) or **Gradient** (a vertical gradient). | |
| **Color**, or **Top** and **Bottom** | The color of the letters. With **Gradient**, the top and bottom colors; the gradient runs over the whole text, from the top of the first line to the bottom of the last. | Any color |
| **Stroke** | Switch: an outline outside the letters. When on: **Width** and **Color**. | **Width** 0 to 200 px |
| **Shadow** | Switch: a soft drop shadow of the letters and their outline. When on: **Offset** (**X**, **Y**), **Blur** and **Color**. | **Offset** -500 to 500 px, **Blur** 0 to 200 px |
| **Background** | Switch: a box behind the text. When on: **Mode**, **Padding** (**X**, **Y**), **Radius** and **Color**. | **Padding** and **Radius** 0 to 500 px |
| **Mode** (of **Background**) | **Per line**: a box behind each line, each as wide as its line. **Block**: one box behind the whole text. | |
| **Align** | **Align left**, **Align center** or **Align right**. | |
| **Anchor** | Which edge stays in place when the text gets taller. See [Choose which way text grows](#choose-which-way-text-grows). | Top, middle, bottom |
| **Spacing** | Extra space between letters. Negative values bring them closer. | -200 to 1000 px |
| **Line height** | The distance between lines, as a multiple of the font size. | 0.50 to 4.00 × |
| **Case** | **Aa** (as typed), **AA** (uppercase), **aa** (lowercase), **Ab** (title case: the first letter of each word in capitals, the rest in lowercase). The text you typed doesn't change: switch back to **Aa** to see it as typed. | |
| **Box** | **Auto** or **Fixed**. See [Wrap text in a fixed box](#wrap-text-in-a-fixed-box). | |
| **Width** | The width of a fixed box. Dimmed while **Box** is **Auto**. | 10 to 8000 px |

- Turning a switch off keeps its values: turn it on again to get the same outline, shadow or box back.
- To give other texts the same style in one click, save it as a preset with **Save as preset** in the quick actions. See [Save a text style as a preset](text-presets.md#save-a-text-style-as-a-preset).
- The background box casts no shadow.
- A font without a real italic, such as Oswald, gets slanted letters when you click **Italic**.
- Changing the font, the size or another value that changes the size of the text keeps the text's anchor point where it is on the frame.

### Choose which way text grows

When a text gets wider or taller, because you type more, pick a larger size or turn on a background box, one point of its box stays where it is on the frame:

| Setting | The point that stays |
| --- | --- |
| **Align left**, **Align center**, **Align right** | The left edge, the middle or the right edge. |
| Anchor top (tooltip **Anchor top: the text grows down**) | The top edge: new lines appear below. |
| Anchor middle (tooltip **Anchor middle: the text grows both ways**) | The middle: the text grows up and down evenly. |
| Anchor bottom (tooltip **Anchor bottom: the text grows up**) | The bottom edge: new lines push the text up. Subtitles use it. |

New titles are centered and anchored in the middle, so they grow evenly in every direction.

### Wrap text in a fixed box

- **Auto**: the box fits the lines. A line breaks only where you press <kbd>Enter</kbd>.
- **Fixed**: the box has the width you set in **Width**, and the words wrap onto the next line when they reach it. A word longer than the box breaks between two letters. New subtitles use a fixed box.

To set the width with the mouse, drag a side handle of the text in the preview; see [Resize text with its handles](#resize-text-with-its-handles).

## Choose a font

> **Video placeholder: Choose a font**
> - File: `videos/titles-and-text/choose-a-font.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A title selected. Click the **Font** field in the **Text** section: the font picker opens with **Search fonts**, then **Used in project**, **Bundled** and **System**, each name in its own font.
>   2. Click the star next to **Playfair Display**: it appears under **Favorites** at the top.
>   3. Type `mon` in **Search fonts**: only Montserrat and JetBrains Mono are left. Press <kbd>Enter</kbd>: the title switches to Montserrat and the picker closes.
>   4. Open the picker again and click **Show system fonts**. Chrome asks to use the fonts on your device: click **Allow**. The fonts installed on the computer appear under **System**.
>   5. Click **Georgia**: the title switches to Georgia.

1. Select one or more text clips.
2. In the **Text** section, click the **Font** field. The font picker opens under it.
3. Click a font. Or type part of its name in **Search fonts** and press <kbd>Enter</kbd> to take the first match. To take another one, press <kbd>↓</kbd> or <kbd>↑</kbd> in **Search fonts** until it is highlighted in the list, then press <kbd>Enter</kbd>.

The picker closes when you pick a font, click outside it, or press <kbd>Esc</kbd>.

The picker lists the fonts in sections, each name drawn in its own font:

| Section | What it lists |
| --- | --- |
| **Favorites** | The fonts you starred. Click the star at the right of a font to add it, and click it again to remove it. Your favorites are kept in this browser for all your projects. |
| **Used in project** | The fonts the text clips of this project use. |
| **Bundled** | The eight fonts that come with the editor. See [Fonts that come with the editor](#fonts-that-come-with-the-editor). |
| **System** | The fonts installed on your computer, after you click **Show system fonts**. See [Use fonts from your computer](#use-fonts-from-your-computer). |

**Favorites**, **Used in project** and **Bundled** are left out when they have no font that matches the search. **System** always shows.

### Fonts that come with the editor

These fonts work on every computer, with no installation:

| Font | Style | Weights | Real italic |
| --- | --- | --- | --- |
| Inter | Sans-serif; the default for new text | 100 to 900 | Yes |
| Montserrat | Geometric sans-serif | 100 to 900 | Yes |
| Nunito | Rounded sans-serif | 200 to 900 | Yes |
| Oswald | Tall, narrow display font | 200 to 700 | No |
| Unbounded | Wide display font | 200 to 900 | No |
| Playfair Display | Serif | 400 to 900 | Yes |
| Caveat | Handwriting | 400 to 700 | No |
| JetBrains Mono | Monospaced | 100 to 800 | Yes |

> **Note:** These fonts cover the Latin alphabet of Western, Central and Eastern European languages (latin and latin-ext). Letters of other scripts, such as Greek, Cyrillic, Arabic, Hebrew, Chinese, Japanese or Korean, are drawn with a fallback font of your system instead. For those languages, pick a font from your computer that has them.

A font loads the first time a text uses it, so a text may appear a moment after the rest of the picture the first time.

## Use fonts from your computer

1. In the font picker, click **Show system fonts** under **System**.
2. The first time, Chrome asks whether the site may use the fonts on your computer. Allow it.
3. The installed fonts appear under **System**. Click one to use it.

The list stays until you reload the page; after a reload, click **Show system fonts** again. Chrome remembers your answer, so it asks only once.

Instead of the font list, the **System** section can show:

| Message | Meaning |
| --- | --- |
| **Listing the system fonts…** | The editor is reading the list. |
| **Font access was not allowed** | You (or Chrome) refused the permission. **Show system fonts** stays below it. See [Show system fonts lists nothing](troubleshooting.md#show-system-fonts-lists-nothing). |
| **This browser cannot list system fonts** | The browser has no access to installed fonts. Use the fonts that come with the editor. |
| **No system fonts** | The computer reported no fonts other than the ones that come with the editor. |
| **No match** | No installed font matches the search. |

Fonts that come with the editor are listed only under **Bundled**, not again under **System**.

### Fonts travel with the project

When a text uses a font from your computer, the editor copies the font file into the `fonts` folder of the project, with a `fonts.json` file that lists the copies. The project then looks the same on a computer that doesn't have the font, and the editor uses the copy even where a different font of the same name is installed.

- Only the variant the text uses is copied, for example Georgia Bold. Pick another weight or **Italic**, and that variant is copied too.
- Copying happens in the background, a moment after you pick the font.
- A project open in read-only mode copies nothing. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).
- The editor copies fonts only while the list of system fonts is loaded. If you change the weight of a computer font in a later session, click **Show system fonts** once so the new variant can be copied.

> **Important:** A font file in the project folder goes wherever the folder goes. Before you share a project folder, check that the licenses of the fonts you used allow it.

## Fix a missing font

When a text uses a font that is neither one of the editor's fonts, nor in the project's `fonts` folder, nor installed on this computer:

- the text is drawn with the editor's interface font instead;
- the **Font** field shows a red **Missing** chip (tooltip **This font is not installed here: the text uses the fallback font**);
- the clip on the timeline shows a red warning triangle in its label bar.

This happens, for example, when you open a project made on another computer that didn't copy the font, or after you delete the project's `fonts` folder.

To fix it, do one of these:

- Pick another font for the text in the font picker.
- Install the font on this computer and reload the page. The chip and the triangle disappear.
- On the computer where the project was made, open the project with editing allowed and click **Show system fonts** once: the editor copies the font into the project.

## Text clips on the timeline

- A text clip's label bar shows a **T** icon and the clip's name. Its body (on tracks of height M or L) shows the first line of its text, as shown in the picture (with its **Case**).
- A new text clip is named after the first line of its text, up to 40 characters ("…" after that), or "Text" when it is empty. When you change the text, the name follows. Once you rename the clip yourself, your name stays. See [Rename clips](timeline.md#rename-clips).
- A sparkles icon in the label bar means the text has an in or out animation. See [Text animations](text-animations.md).
- A red warning triangle in the label bar means its font is missing. See [Fix a missing font](#fix-a-missing-font).
- Text clips are trimmed, moved, split and deleted like other clips. Because text has no media behind it, its edges can go as far as you like.

## Undo text changes

Every text change is one step in the history. Hover **Undo** in the app bar to see its name. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

| Step name | What made it |
| --- | --- |
| **Add title**, **Add subtitle** | <kbd>T</kbd>, <kbd>Shift</kbd>+<kbd>T</kbd>, or **Title** and **Subtitle** in the timeline toolbar |
| **Edit text** | Typing in the preview (one step from start to finish), or a burst of typing in the **Text** field |
| **Resize text**, **Change text box width** | Dragging a corner or a side handle of a text in the preview |
| **Change font**, **Change font weight**, **Change italic**, **Change font size** | The **Font**, **Weight**, **Italic** and **Size** rows |
| **Change fill**, **Change text color** | **Fill** and its colors |
| **Add stroke**, **Remove stroke**, **Change stroke** | **Stroke** and its values |
| **Add shadow**, **Remove shadow**, **Change shadow** | **Shadow** and its values |
| **Add background**, **Remove background**, **Change background** | **Background** and its values |
| **Change alignment**, **Change anchor**, **Change letter spacing**, **Change line height**, **Change case** | **Align**, **Anchor**, **Spacing**, **Line height** and **Case** |
| **Fixed text box**, **Auto size text box**, **Change box width** | **Box** and **Width** |
| **In animation: Word pop**, **Remove out animation**, **Change in animation duration** and the other animation steps | The **Animation** section. See [Undo animation changes](text-animations.md#undo-animation-changes). |
| **Save preset "Name"**, **Apply "Name"**, **Add "Name"** | Saving, applying and adding text presets. See [Undo and presets](text-presets.md#undo-and-presets). |

Pressing <kbd>↑</kbd> or <kbd>↓</kbd> in a number field of the **Text** section several times in a row, less than 0.3 seconds apart, is one step.

## What is not available yet

These parts are available in a later version:

- Snapping while you drag a text's handles.
- Exporting the video with its text. **Export frame** already includes text and its animations; see [Export the current frame](preview-and-playback.md#export-the-current-frame).

## Related pages
- [Text animations](text-animations.md)
- [Text presets](text-presets.md)
- [Captions](captions.md)
- [Editing properties](editing-properties.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Timeline](timeline.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 42, 2026-10-18</sub>
