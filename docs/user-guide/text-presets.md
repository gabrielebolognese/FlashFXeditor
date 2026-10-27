# Text presets

A text preset is a saved look for text: the font, size, colors, outline, shadow, background box, alignment and box width of a title, and its in and out animations. Save a title's style once, then give it to other titles with one click from the **Presets** tab of the Media panel, or add a new title in that look from a chip in the timeline toolbar. The editor comes with 12 starter presets, and you choose which presets <kbd>T</kbd> and <kbd>Shift</kbd>+<kbd>T</kbd> use.

> **Video placeholder: Text presets in one minute**
> - File: `videos/text-presets/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and A1. Click the **Presets** tab of the Media panel: 12 cards, each drawing its name in its own look.
>   2. Press <kbd>T</kbd>, type `PROMO` and press <kbd>Esc</kbd>. Point at the **Breaking**, **Neon glow** and **Big number** cards in turn: the title in the preview changes look while the pointer is on each card, and goes back when it leaves.
>   3. Click **Breaking**: the title takes the red box. Hover **Undo** in the app bar: it reads **Undo Apply "Breaking"**.
>   4. In the **Text** section of **Edit Properties**, pick **Montserrat** and a yellow color. Click **Save as preset** in the quick actions: a name field shows **Montserrat 92**, selected. Type `Yellow promo` and press <kbd>Enter</kbd>: a new card appears at the end of the list.
>   5. Right-click the new card and choose **Favorite: chip in the timeline toolbar**: a star appears on the card and a **Yellow promo** chip appears in the timeline toolbar after **Add image**.
>   6. Move the playhead and click the chip: a new title in that look appears at the playhead, with "Title" selected. Type `SALE` and press <kbd>Esc</kbd>.
>   7. Right-click the **Highlight** card and choose **Use as default subtitle**: a badge appears on the card. Press <kbd>Shift</kbd>+<kbd>T</kbd>: the new subtitle in the lower third has the yellow marker look.

## In this page
- [What a preset keeps](#what-a-preset-keeps)
- [Open the Presets tab](#open-the-presets-tab)
- [Start with the starter presets](#start-with-the-starter-presets)
- [Save a text style as a preset](#save-a-text-style-as-a-preset)
- [Apply a preset to text](#apply-a-preset-to-text)
- [Add a new text with a preset](#add-a-new-text-with-a-preset)
- [Drag a preset onto the timeline or the preview](#drag-a-preset-onto-the-timeline-or-the-preview)
- [Update a preset](#update-a-preset)
- [Animations in presets](#animations-in-presets)
- [Choose the presets for T and Shift+T](#choose-the-presets-for-t-and-shiftt)
- [Put favorite presets in the timeline toolbar](#put-favorite-presets-in-the-timeline-toolbar)
- [Place text with a preset (Apply position)](#place-text-with-a-preset-apply-position)
- [Find and organize presets](#find-and-organize-presets)
- [Keep presets for all projects or for one](#keep-presets-for-all-projects-or-for-one)
- [Export and import presets](#export-and-import-presets)
- [Sync your presets with a folder](#sync-your-presets-with-a-folder)
- [Presets in projects of other sizes](#presets-in-projects-of-other-sizes)
- [Undo and presets](#undo-and-presets)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## What a preset keeps

A preset holds the look of a text clip, not its words or its place on the timeline:

| The preset gives the text | The text keeps its own |
| --- | --- |
| Everything in the **Text** section except the words: **Font**, **Weight**, **Italic**, **Size**, **Fill** and its colors, **Stroke**, **Shadow**, **Background**, **Align**, **Anchor**, **Spacing**, **Line height** and **Case** | The words (the **Text** field) |
| **Box**: **Auto**, or **Fixed** with its **Width** | Its start, length and track |
| The in and out animations of the **Animation** section, with their **Duration**, **Stagger** and **Easing**. See [Animations in presets](#animations-in-presets). | |
| Its position in the frame, only when the preset's **Apply position** is on. See [Place text with a preset (Apply position)](#place-text-with-a-preset-apply-position). | Its position (when **Apply position** is off) and the rest of the **Transform** and **Opacity** sections: scale, rotation, anchor point, flips and opacity |

A text clip remembers the preset it uses: the preset it was made with, the last one you applied to it, or the one you saved it as. **Update preset** writes into that preset. See [Update a preset](#update-a-preset).

## Open the Presets tab

Click the **Presets** tab at the top of the Media panel. From top to bottom:

- **Header buttons** at the right of the panel header: **New preset from the selected text** (a bookmark with a plus), **Import presets from a JSON file** and **Export the presets shown to a JSON file**.
- **Tool row**: the **Global** and **Project** switch, which picks the list you see (see [Keep presets for all projects or for one](#keep-presets-for-all-projects-or-for-one)), and the **Search presets** field.
- **Cards**: each card draws the preset's name in the preset's own look, or **Aa** when the name is longer than 12 characters, with the name under it. The oldest presets come first.
- **Badges** in the top-left corner of a card, in gold: a star for a favorite, a **T** for the default title and a subtitle icon for the default subtitle.
- **Library folder strip** at the bottom, in the **Global** list only. See [Sync your presets with a folder](#sync-your-presets-with-a-folder).

Point at a card to see its tooltip: the name, then **Click: apply to the selected text, or add at the playhead. Drag onto the timeline. Right-click for more.**

Instead of cards, the list can show:

| Message | Meaning |
| --- | --- |
| **Loading presets…** | The editor is reading your presets. |
| **No presets yet. Select a text clip and click Save as preset.** | The list is empty. |
| **No preset matches the search.** | Clear or change the search. |
| **Open a project to keep presets in it.** | The **Project** list needs an open project. |
| **This project is read-only: its presets cannot change.** (under the cards) | The project opened read-only. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode). |

## Start with the starter presets

The first time you open the editor in a browser, your **Global** list gets 12 starter presets in the fonts that come with the editor. The sizes are those of a 1080×1920 project.

| Preset | Look |
| --- | --- |
| **Title** | White Inter ExtraBold, 120 px, centered, with a soft shadow. The default title: <kbd>T</kbd> uses it. |
| **Subtitle** | White Inter SemiBold, 56 px, on a dark rounded box behind each line, in a 900 px fixed box, anchored at the bottom. The default subtitle: <kbd>Shift</kbd>+<kbd>T</kbd> uses it. |
| **Bold outline** | Unbounded ExtraBold, 104 px, uppercase, with a thick black outline. |
| **Lower third** | Inter Bold, 56 px, left-aligned, on a dark blue box around the whole text. Its **Apply position** is on: it moves the text to the lower part of the frame, left of the center. Comes in with **Slide right** (0.5 s) and leaves with **Fade** (0.4 s). |
| **Caption bold** | Montserrat ExtraBold, 76 px, uppercase, with a black outline and a shadow, in a 900 px fixed box. Comes in with **Word pop** (0.8 s). |
| **Highlight** | Near-black Inter ExtraBold, 80 px, on a yellow box behind each line, like a marker pen. |
| **Minimal mono** | JetBrains Mono Medium, 52 px, uppercase, widely spaced, off-white, with no shadow. |
| **Big number** | Unbounded Black, 320 px, with a yellow-to-orange gradient and a shadow: for counts and numbers. |
| **Elegant serif** | Playfair Display SemiBold Italic, 112 px, warm white, with a soft shadow. |
| **Handwritten** | Caveat Bold, 132 px, with a soft shadow. |
| **Neon glow** | Montserrat Bold, 100 px, pale pink with a bright pink glow. Comes in with **Blur** (0.6 s). |
| **Breaking** | Oswald SemiBold, 92 px, uppercase, white on a red box, like a news banner. Comes in with **Slide up** (0.4 s). |

The starters are yours to apply, change, rename or delete like your own presets. **Title** and **Subtitle** have no animations, so <kbd>T</kbd> and <kbd>Shift</kbd>+<kbd>T</kbd> add still text unless you choose an animated default; see [Choose the presets for T and Shift+T](#choose-the-presets-for-t-and-shiftt).

> **Note:** If your starters were added by an earlier version of the editor, **Lower third**, **Caption bold**, **Neon glow** and **Breaking** get their animations the next time you open the editor, as long as you never changed them. A starter you changed keeps its look as it is. To animate it, select a text, click the starter's card, choose the animations in the **Animation** section, then click **Update preset**.

> **Note:** A starter preset you delete doesn't come back. Restoring the starters is available in a later version. To keep a copy before you change one, use **Duplicate**, or export your presets to a file; see [Export and import presets](#export-and-import-presets).

## Save a text style as a preset

> **Video placeholder: Save and update a preset**
> - File: `videos/text-presets/save-and-update.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A title selected. In the **Text** section, pick **Oswald**, **SemiBold**, size `140`, a red color, and turn on **Stroke** with a width of `8`.
>   2. Click **Save as preset** in the quick actions: a name field opens under the row with **Oswald 140** selected. Type `Red promo` and press <kbd>Enter</kbd>: a **Red promo** card appears in the **Presets** tab, its name drawn in red with a black outline.
>   3. Move the playhead, click an empty area of the timeline tracks so nothing is selected, then click the **Red promo** card: a second title in the same look appears at the playhead. Type `NOW` and press <kbd>Esc</kbd>.
>   4. Select the first title and change its color to green. Hover **Update preset** in the quick actions: the tooltip reads **Update "Red promo": saves this clip's style into the preset. Other clips that use "Red promo" keep their own style until you apply the preset to them again.**
>   5. Click it: the card turns green, and the message **Updated "Red promo"** appears. The second title is still red.
>   6. Select the second title and click the **Red promo** card: it turns green too.

1. Style a text clip as you like, and select it on the timeline or in the preview.
2. Click **Save as preset** (a bookmark with a plus) in the quick actions of **Edit Properties**. Or, in the **Presets** tab, click **New preset from the selected text** in the header.
3. A name field opens, under the quick actions or under the tool row of the **Presets** tab. It starts with the font and size of the text, for example **Oswald 140**, all selected. Type a name.
4. Press <kbd>Enter</kbd>. A card with your preset appears at the end of the list.

- <kbd>Esc</kbd>, or a click anywhere else, closes the field without saving.
- A name has up to 60 characters. If you leave the field empty, the preset is named after the font and size. If the list already has a preset of that name, the editor adds a number, for example **Red promo 2**.
- The preset goes into the list the **Presets** tab shows, **Global** or **Project**. When the project is read-only, it goes into **Global**.
- The text clip now uses the new preset, so **Update preset** can write its later changes into it.
- With several text clips selected, the one you clicked last is saved.
- **Save as preset** is dimmed when no text clip is selected, or when the selected text is on a locked track. **New preset from the selected text** is dimmed when no text clip is selected (tooltip **New preset from the selected text: select a text clip first**).

## Apply a preset to text

1. Select one or more text clips, on the timeline or in the preview.
2. In the **Presets** tab, point at the cards. While the pointer is on a card, the selected texts show that preset in the preview. Nothing changes yet.
3. Click the card you want. Or right-click it and choose **Apply to selected text**.

What happens:

- The preset's style, box and animations replace those of every selected text clip. The words, the start, the length, the track and the position stay. Only a preset with **Apply position** on also moves the text; see [Place text with a preset (Apply position)](#place-text-with-a-preset-apply-position).
- A preset without animations removes the animations of the texts you apply it to. See [Animations in presets](#animations-in-presets).
- The text clips now use this preset.
- All the selected text clips change in one step in the history, named after the preset, for example **Apply "Breaking"**. Other selected clips (videos, images) are left alone, and so are text clips on locked tracks.
- A clip named after its text keeps following it: a preset with another **Case** renames it to match, for example in uppercase.

The live look while you point shows the preset's style, box and position, not its animations: they play once you click. It ends when the pointer leaves the cards, when you scroll the list, start a drag, change the selection or click.

> **Note:** When no text clip is selected, or only text clips on locked tracks, a click on a card adds a new text instead. See [Add a new text with a preset](#add-a-new-text-with-a-preset). Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to remove it.

## Add a new text with a preset

There are four ways to add a new text clip in a preset's look:

| Do this | Where the text goes |
| --- | --- |
| Click a card with no text clip selected, or right-click it and choose **Add at playhead** | At the playhead, in the middle of the frame |
| Click the preset's chip in the timeline toolbar | At the playhead, in the middle of the frame, or 40 pixels below the selected text clip. See [Put favorite presets in the timeline toolbar](#put-favorite-presets-in-the-timeline-toolbar). |
| Drag the card onto the preview | At the playhead, centered where you release. See [Drag a preset onto the timeline or the preview](#drag-a-preset-onto-the-timeline-or-the-preview). |
| Press <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> | With the default title or subtitle preset. See [Choose the presets for T and Shift+T](#choose-the-presets-for-t-and-shiftt). |

The new text works like one made with <kbd>T</kbd>:

- It says "Title", selected, and you type over it right away in the preview. Press <kbd>Esc</kbd> to finish. See [Edit text in the preview](titles-and-text.md#edit-text-in-the-preview).
- It lasts until the end of the video clip under the playhead, or 3 seconds when there is none. It goes on the top video track when that is free, otherwise on a new track at the top. See [Where a new title goes](titles-and-text.md#where-a-new-title-goes).
- A preset with **Apply position** on puts it at its own position instead (except a drop on the preview, which puts it where you release).
- It uses the preset, so **Update preset** works from it.
- Adding it is one step in the history, named after the preset, for example **Add "Red promo"**.

## Drag a preset onto the timeline or the preview

Drag a card out of the **Presets** tab like a media card. A small label with the preset's name follows the pointer.

**Onto the timeline:**

1. Press on a card and drag it over the tracks. A ghost shows the new text clip, 3 seconds long, starting at the pointer.
2. Release where it should start.

- The clip goes on the video track under the pointer. Over an audio track, it goes on the video track with the same number, like an image. Drag above the top video track to put it on a new track.
- Snapping, <kbd>Ctrl</kbd> to insert, <kbd>S</kbd> to switch snapping and <kbd>Esc</kbd> to cancel work as for media. See [Drag media onto the timeline](adding-media-to-the-timeline.md#drag-media-onto-the-timeline).
- The text sits in the middle of the frame, or at the preset's position when its **Apply position** is on.
- The new clip is selected, but not opened for typing: double-click it in the preview to type.
- The step is named **Add clip** (**Insert clip** with <kbd>Ctrl</kbd>).

**Onto the preview:** release the card over the picture. The new text starts at the playhead, centered on the point where you released, and opens for typing. It follows the track and length rules of [Add a new text with a preset](#add-a-new-text-with-a-preset).

## Update a preset

1. Select a text clip that uses the preset, and change its style in the **Text** section.
2. Point at **Update preset** (a bookmark with a check mark) in the quick actions. Its tooltip names the preset: **Update "Red promo": saves this clip's style into the preset. Other clips that use "Red promo" keep their own style until you apply the preset to them again.**
3. Click it. The card's thumbnail changes, and the message **Updated "Red promo"** confirms it.

Other text clips that use the preset keep the style they have. To give them the new look, select them and click the card. See [Apply a preset to text](#apply-a-preset-to-text).

- The preset takes the clip's style, its box, its animations and its position (used only when **Apply position** is on). Its name, its favorite star, **Apply position** and the defaults stay as they were.
- **Update preset** is dimmed, with the tooltip **Update preset: the selected text has no preset, or already has its style**, when:
  - the selected text clip uses no preset;
  - its preset was deleted;
  - its style and its animations are the same as the preset's;
  - the preset belongs to a read-only project, or the clip is on a locked track.
- With several text clips selected, the one you clicked last counts.

> **Important:** Updating a preset is not a step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> doesn't take it back. To keep the old look too, **Duplicate** the preset first.

## Animations in presets

A preset keeps the in and out animations of the text it was saved or updated from, with their **Duration**, **Stagger** and **Easing**. To make an animated preset:

1. Select a text and choose its animations in the **Animation** section of **Edit Properties**. See [Text animations](text-animations.md).
2. Click **Save as preset** for a new preset, or **Update preset** for the preset the text uses.

From then on:

- Applying the preset gives its animations to the selected texts, in the same step as its style. A preset without animations removes theirs: press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to get them back.
- New texts from the preset start with its animations: a click on a card or a chip, a drag onto the timeline or the preview, and <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> when it is the default title or subtitle.
- Changing only an animation is enough for **Update preset** to come alive.
- The preset keeps animation lengths in seconds, so they last as long in projects of every frame rate: a 0.5 s animation is 15 frames at 30 fps and 30 frames at 60 fps.
- Exported preset files keep the animations.

The cards in the **Presets** tab show each preset at rest; the animations play in the preview once you apply the preset.

## Choose the presets for T and Shift+T

<kbd>T</kbd> and the **Title** button use the default title preset; <kbd>Shift</kbd>+<kbd>T</kbd> and the **Subtitle** button use the default subtitle preset. From the start, these are the **Title** and **Subtitle** starter presets.

1. Right-click a card in the **Presets** tab.
2. Choose **Use as default title** (the menu shows <kbd>T</kbd> next to it) or **Use as default subtitle** (<kbd>Shift</kbd>+<kbd>T</kbd>).

- The card shows the matching badge, and the menu row of the current default is highlighted in gold.
- A new title is still placed like a title (in the middle of the frame, or 40 pixels below the selected text clip), and a new subtitle like a subtitle (its bottom edge at 78% of the frame height), unless the preset's **Apply position** is on. Its text is "Title" or "Subtitle", ready for typing.
- To go back to the built-in look, choose the highlighted row again. The built-in title and subtitle look like the **Title** and **Subtitle** starter presets as they came with the editor.
- Your choice applies to every project in this browser. When the default preset is deleted, or it is a project preset and another project is open, <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> uses the built-in look.

> **Tip:** Changing a default preset with **Update preset** changes every title you add with <kbd>T</kbd> from then on. Titles you already made keep their look.

## Put favorite presets in the timeline toolbar

1. Right-click a card and choose **Favorite: chip in the timeline toolbar**.
2. The card shows a star, and a chip with the preset's name appears in the timeline toolbar, after **Add image**.
3. Click the chip (tooltip **Add "Red promo" at the playhead**): a new text in that look appears at the playhead, ready for typing.

- The toolbar shows up to 8 chips: the favorites of the **Global** list first, then those of the open project, each in card order.
- A long name ends in "…" on the chip.
- The chips follow the presets at once: rename, update or delete a preset, and its chip changes too.
- A chip always adds a new text, even when a text clip is selected; it then goes 40 pixels below the selected one.
- To remove a chip, choose **Favorite: chip in the timeline toolbar** again on its card.
- When the Timeline panel is narrow, the chips move into the **More tools** (…) menu with the **Add** group. See [When the toolbar does not fit](workspace.md#when-the-toolbar-does-not-fit).

## Place text with a preset (Apply position)

Normally a preset changes how a text looks, not where it is. Turn on **Apply position** to make a preset place text too, for example a name in the lower left of every interview shot.

1. Save or update the preset from a text that sits where you want it.
2. Right-click its card and choose **Apply position**. The row is highlighted in gold while it is on.

With **Apply position** on:

- Applying the preset moves the selected texts to its position (their X and Y in the **Transform** section). Their scale and rotation stay. While you point at the card, the preview shows the move too.
- New texts from the preset, from a card, a chip, <kbd>T</kbd>, <kbd>Shift</kbd>+<kbd>T</kbd> or a drop on the timeline, appear at its position.
- A drop on the preview still puts the text where you release.

The **Lower third** starter has **Apply position** on. The **Subtitle** starter's position is one line in the lower third, and the other starters' is the middle of the frame.

## Find and organize presets

**Search:** type in **Search presets**. The list keeps the presets whose name, font or keywords contain every word you typed. The starters have keywords such as `box`, `outline`, `title`, `gradient` and `neon`. Clear the field to see all presets again.

**The card menu:** right-click a card.

| Row | What it does |
| --- | --- |
| **Apply to selected text** (or **Add at playhead** when no text clip is selected) | The same as a click on the card. |
| **Use as default title**, **Use as default subtitle** | See [Choose the presets for T and Shift+T](#choose-the-presets-for-t-and-shiftt). |
| **Favorite: chip in the timeline toolbar** | Turns the chip and the star on or off. See [Put favorite presets in the timeline toolbar](#put-favorite-presets-in-the-timeline-toolbar). |
| **Apply position** | Turns placing on or off. See [Place text with a preset (Apply position)](#place-text-with-a-preset-apply-position). |
| **Rename** | The name on the card becomes a field. Type a new name and press <kbd>Enter</kbd> or click elsewhere; <kbd>Esc</kbd> keeps the old name. |
| **Duplicate** | Adds a copy named "… copy", for example **Breaking copy**, at the end of the list. The copy is not a favorite. |
| **Export…** | Saves this preset alone as a JSON file. See [Export and import presets](#export-and-import-presets). |
| **Delete** | Removes the preset at once, without asking. |

- Deleting a preset can't be undone. Text clips made with it keep their look; **Update preset** is then dimmed for them. Its chip disappears, and if it was a default, <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> goes back to the built-in look.
- In the **Project** list of a read-only project, **Favorite**, **Apply position**, **Rename**, **Duplicate** and **Delete** are dimmed.
- A double-click on a card applies the preset twice; it doesn't rename it. Use **Rename** in the menu.

## Keep presets for all projects or for one

The **Global** and **Project** switch in the tool row picks the list the tab shows:

| List | Where the presets live | Use it for |
| --- | --- | --- |
| **Global** (tooltip **Global presets: in every project**) | In this browser, and in your library folder if you chose one | Styles you use in every video |
| **Project** (tooltip **This project's presets (presets/text in its folder)**) | In the project folder, in `presets/text`, one `.json` file per preset | Styles that belong to one series or client, and travel with the project folder |

- **Save as preset** and **Import** put new presets into the list you see. When the project is read-only, they go into **Global**.
- The project's presets are there only while the project is open.
- The toolbar chips come from both lists.
- The project remembers which list you looked at last.
- Changes to project presets are written to the folder at once; they don't wait for autosave.

## Export and import presets

> **Video placeholder: Share presets as a file**
> - File: `videos/text-presets/export-import.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. The **Presets** tab with **Global** chosen and a favorite chip in the timeline toolbar. Click **Export the presets shown to a JSON file** in the header and save `text-presets.json`: the message **Exported 13 presets** appears.
>   2. Right-click each card and choose **Delete** until the list reads **No presets yet. Select a text clip and click Save as preset.** The chip is gone.
>   3. Click **Import presets from a JSON file** and pick `text-presets.json`: the message **Imported 13 presets** appears, and the same cards come back in the same order, with their stars and badges. The chip is back.

**Export:**

1. Choose **Global** or **Project** in the tool row.
2. Click **Export the presets shown to a JSON file** in the header.
3. Choose where to save the file. Its name starts as `text-presets.json`.

- The file holds every preset of the list, also those the search hides. The button is dimmed when the list is empty.
- To export one preset, right-click its card and choose **Export…**. The file is named after the preset.
- The message **Exported 13 presets** (with the number) confirms it.

**Import:**

1. Choose the list the presets should go into: **Global** or **Project**.
2. Click **Import presets from a JSON file** in the header and pick a `.json` file.

- The editor reads an export file, a single preset's file, and the preset files of a library folder or a project's `presets/text` folder.
- A preset that is already in the list (because it came from there) is replaced by the copy in the file. Importing the same file twice changes nothing.
- Presets you deleted come back exactly as they were: their stars, their default title or subtitle badge, their chips, and the text clips that used them use them again.
- The message **Imported 13 presets** (with the number) confirms it, with **2 entries skipped.** when some entries couldn't be read.

When nothing is imported, a message says why:

| Message | Meaning |
| --- | --- |
| **No presets imported**: "The file holds no preset this editor can read." | The file is JSON, but none of its entries is a text preset. |
| **Couldn't import the presets**: "The file is not JSON." | The file is not a presets file. |
| **Couldn't import the presets**: "The file holds no text presets." | The JSON file holds something else, for example a project file. |
| **Couldn't import the presets**: "The file comes from a newer version of the editor." | Update the editor, then import again. |

## Sync your presets with a folder

You can keep your **Global** presets in a folder too, as one JSON file per preset. Put the folder on a synced drive to have the same presets on all your computers, or keep it as a backup.

1. In the **Presets** tab, choose **Global**.
2. In the strip at the bottom, which reads **Global presets live in this browser.**, click **Library folder** (tooltip **Keep the global presets in a folder too (JSON files), e.g. a synced drive**).
3. Pick a folder, and allow editing when Chrome asks.
4. The editor merges the folder with your global presets: presets in the folder join your list, and every global preset is written into the folder. The strip reads **Library folder:** and the folder's name.

From then on:

- Every change to your global presets is written to the folder, and the file of a deleted preset is removed.
- Each time you open the editor, it syncs again if Chrome still allows access. Otherwise the strip reads, for a folder named "My presets", **Library folder: My presets. Click Sync to allow access.** Click **Sync the global presets with the library folder** (the button next to the text) and allow access.
- A sync merges both sides: when a preset is in both, the one changed last wins. A sync never deletes presets, so a preset you deleted on one computer comes back if another computer still has it and writes it to the folder.
- Files in the folder that are not presets are left alone. The strip then adds, for example, **(2 files skipped: not presets)**.
- **Stop syncing (the folder keeps its files)**, the other button in the strip, makes the editor forget the folder. Your presets stay in the browser, and the files stay in the folder.

The strip can also read **Syncing with My presets…** while the editor reads and writes the folder, or the folder's name with a reason when it can't, for example when the folder was moved or deleted. Click **Sync the global presets with the library folder** to try again, or click **Stop syncing (the folder keeps its files)** and choose another folder.

## Presets in projects of other sizes

Presets store their sizes for a frame whose shorter side is 1080 pixels, such as 1080×1920 or 1920×1080. In a project of another size, the font size, outline, shadow, letter spacing, padding, box width and position scale with the shorter side of the frame, so a preset looks the same in every project:

| Project | **Title** preset size |
| --- | --- |
| 1080×1920 or 1920×1080 | 120 px |
| 720×1280 | 80 px |
| 2160×3840 (4K) | 240 px |

It works both ways: a preset you save from a 240-pixel title in a 4K project gives 120-pixel titles in a 1080×1920 project.

## Undo and presets

Changes to your text clips are steps in the history. Hover **Undo** in the app bar to see their names. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

| Step name | What made it |
| --- | --- |
| **Save preset "Red promo"** | **Save as preset**: the clip starts to use the new preset. Undoing it leaves the preset in the list. |
| **Apply "Red promo"** | A click on a card, or **Apply to selected text**, with text clips selected |
| **Add "Red promo"** | A click on a card with no text clip selected, **Add at playhead**, a toolbar chip, or a drop on the preview |
| **Add clip**, **Insert clip** | A drop on the timeline |
| **Add title**, **Add subtitle** | <kbd>T</kbd> and <kbd>Shift</kbd>+<kbd>T</kbd>, also with a default preset |

Changes to the presets themselves are not steps in the history and can't be undone: saving, updating, renaming, duplicating and deleting presets, favorites, **Apply position**, the default title and subtitle, imports and the library folder.

## What is not available yet

These parts are available in a later version:

- Applying a preset to captions.
- Restoring the starter presets after you delete or change them.
- Choosing the library folder in the editor's **Settings**: for now, the strip at the bottom of the **Global** list does it.

## Related pages
- [Titles and text](titles-and-text.md)
- [Text animations](text-animations.md)
- [Editing properties](editing-properties.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [The workspace](workspace.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 31, 2026-10-16</sub>
