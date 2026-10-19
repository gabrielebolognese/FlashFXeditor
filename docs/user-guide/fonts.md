# Fonts

Shorts Editor comes with a library of 330 font families, sorted by look: elegant, bold, futuristic, handwritten, retro and more. Click the **Font** field of a title or of your captions to open the font browser: find a font by name, look or weight, see it on your text as you point at it, and click to use it. You can also add your own font files to **My fonts** and use the fonts installed on your computer. Every font a project uses is copied into the project folder, so it looks the same on any computer.

> **Video placeholder: Fonts in one minute**
> - File: `videos/fonts/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows:
>   1. A title selected. Click the **Font** field in the **Text** section of **Edit Properties**: the font browser opens under it, with **Search fonts, looks, tags**, a row of look chips, a row of weight chips and the list with **My fonts**, **Library** and **On this computer**, each name drawn in its own font.
>   2. Click **Luxury & Elegant**, then **Bold**: the list keeps only elegant fonts that have a bold weight, each drawn bold.
>   3. Point at **Cinzel**: the title in the preview switches to Cinzel at once. Point at **Bodoni Moda**: the title follows.
>   4. Click in the search field and press <kbd>↓</kbd> twice: the highlight moves down the list and the title shows each font. Press <kbd>Esc</kbd>: the browser closes and the title is back in its own font.
>   5. Open the browser again and click **Cinzel**: the title is set in Cinzel Bold and the browser closes. Point at **Undo** in the app bar: it reads **Undo Change font**.
>   6. Open the browser again, point at **Cinzel** under **Recent** and click its star: Cinzel appears under **Favorites**.
>   7. Drag a `.ttf` file from File Explorer onto the browser: a dashed gold outline appears; drop it: the message **Added 1 font to My fonts** appears and the font is listed under **My fonts**.

## In this page
- [Open the font browser](#open-the-font-browser)
- [Find a font](#find-a-font)
- [See a font on your text, then apply it](#see-a-font-on-your-text-then-apply-it)
- [What the list shows](#what-the-list-shows)
- [Keep your favorite fonts](#keep-your-favorite-fonts)
- [Fonts that come with the editor](#fonts-that-come-with-the-editor)
- [Add your own fonts](#add-your-own-fonts)
- [Rename, sort or remove your fonts](#rename-sort-or-remove-your-fonts)
- [Where My fonts are kept](#where-my-fonts-are-kept)
- [Use fonts from your computer](#use-fonts-from-your-computer)
- [Fonts travel with the project](#fonts-travel-with-the-project)
- [Fix a missing font](#fix-a-missing-font)
- [See the font licenses](#see-the-font-licenses)
- [Font commands in the command palette](#font-commands-in-the-command-palette)
- [Undo font changes](#undo-font-changes)
- [Related pages](#related-pages)

## Open the font browser

1. Select one or more text clips, the caption track, or caption cues. With cues selected, the **Edit** row of **Caption style** decides whether the font goes to all the captions (**All cues**) or only to those cues (**Selected**); see [Give single cues their own style](captions.md#give-single-cues-their-own-style).
2. In **Edit Properties**, click the **Font** field: in the **Text** section for text clips, in the **Caption style** section for captions. The field shows the font's name in the font itself.
3. The font browser opens under the field, with the cursor in the search field.

You can also run **Open font browser** in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>). It shows **Edit Properties**, unfolds the **Text** or **Caption style** section and opens the browser there. See [Font commands in the command palette](#font-commands-in-the-command-palette).

The browser closes when you pick a font, press <kbd>Esc</kbd>, click outside it, or click the **Font** field again. Only a pick changes your text.

## Find a font

The top of the browser has three ways to narrow the list. They work together: for example, the **Retro & Vintage** look with the **Black** weight and the search `slab`.

**Search.** Type in **Search fonts, looks, tags**. A font stays in the list when every word you type matches its name, one of its looks or one of its tags. Fonts whose name matches come first. For example, `elegant` finds the fonts of the **Luxury & Elegant** look, and `arcade` finds Press Start 2P by its tag. Clear the field to see every font again.

**Looks.** Click a chip in the first row to show only the fonts of that look. Click it again, or click **All** (tooltip **All looks**), to show every look. The chips scroll sideways with the mouse wheel. A font can have several looks: Bebas Neue is under **Bold & Impact**, **Condensed** and **Captions**.

| Look | Fonts in the library | For example |
| --- | --- | --- |
| **Luxury & Elegant** | 53 | Cinzel, Playfair Display, Bodoni Moda, Allura |
| **Modern & Clean** | 49 | Inter, Montserrat, Poppins, DM Sans |
| **Bold & Impact** | 56 | Anton, Bebas Neue, Archivo Black, Bangers |
| **Condensed** | 28 | Oswald, Bebas Neue, Barlow Condensed, Antonio |
| **Futuristic & Tech** | 46 | Orbitron, Audiowide, Unbounded, Chakra Petch |
| **Handwritten & Script** | 51 | Caveat, Pacifico, Allura, Amatic SC |
| **Retro & Vintage** | 55 | Pacifico, Bungee, Alfa Slab One, Abril Fatface |
| **Playful & Fun** | 38 | Bangers, Chewy, Baloo 2, Boogaloo |
| **Classic Serif** | 33 | Playfair Display, Cormorant Garamond, Bitter, Arvo |
| **Rounded** | 17 | Nunito, Fredoka, Comfortaa, Baloo 2 |
| **Horror & Grunge** | 22 | Creepster, Butcherman, Eater, Frijole |
| **Typewriter & Mono** | 22 | JetBrains Mono, Courier Prime, Fira Code, IBM Plex Mono |
| **Pixel & Gaming** | 15 | Press Start 2P, DotGothic16, Jersey 10, Micro 5 |
| **Captions** | 27 | Montserrat, Anton, Bebas Neue, Poppins: faces that read well as captions on a phone |

**Weights.** Click a chip in the second row to show only the fonts that have a weight in that range. Each row is then drawn at that weight, and picking a font gives your text that weight. Click the chip again, or **All** (tooltip **All weights**), to show every weight.

| Chip | Tooltip | Weights | A row is drawn at |
| --- | --- | --- | --- |
| **Thin** | **Thin (100-200)** | 100 to 200 | 100, else 200 |
| **Light** | **Light (300)** | 300 | 300 |
| **Regular** | **Regular (400-500)** | 400 to 500 | 400, else 500 |
| **Bold** | **Bold (600-700)** | 600 to 700 | 700, else 600 |
| **Black** | **Black (800-900)** | 800 to 900 | 900, else 800 |

For example, **Luxury & Elegant** with **Bold** lists the 23 elegant fonts that have a bold weight, each drawn bold.

- A look chip hides **On this computer**: fonts installed on your computer have no looks. Your own fonts show under a look once you give it to them; see [Rename, sort or remove your fonts](#rename-sort-or-remove-your-fonts).
- When nothing matches, the list reads **No fonts match**.

## See a font on your text, then apply it

> **Video placeholder: Try fonts on a title**
> - File: `videos/fonts/try-and-apply.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. Three titles selected, in Inter ExtraBold. Click the **Font** field: the browser opens.
>   2. Point at **Anton**: all three titles switch to Anton in the preview. Move the pointer down the list: the titles follow each row.
>   3. Move the pointer off the list and press <kbd>↓</kbd> three times in the search field: the highlighted row moves and the titles follow it.
>   4. Press <kbd>Esc</kbd>: the titles are back in Inter ExtraBold, and **Undo** in the app bar has no new step.
>   5. Open the browser, click **Black** in the weight chips and click **Montserrat**: the titles are set in Montserrat Black. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: all three are back in Inter.

**Try fonts.** Point at a row: the selected texts (or the captions) show that font in the preview. Move to another row and they follow. Nothing changes in your project, and nothing is added to the history.

**Use the keyboard.** In the search field, press <kbd>↓</kbd> or <kbd>↑</kbd> to highlight the next or previous font row. The preview shows the highlighted font, even while the pointer rests on another row. The first <kbd>↓</kbd> highlights the first font of the list, the first <kbd>↑</kbd> the last one.

**Apply a font.** Click a row, or press <kbd>Enter</kbd> to apply the highlighted row. With no row highlighted, <kbd>Enter</kbd> applies the first font of the list, so typing part of a name and pressing <kbd>Enter</kbd> is often enough. The browser closes and the change is one step in the history, **Change font**, for all the selected texts.

**Cancel.** Press <kbd>Esc</kbd> or click outside the browser: your texts are back in their own font. After a pick or <kbd>Esc</kbd>, the keyboard focus returns to the **Font** field.

The weight your text gets:

| When you apply a font | The text's weight |
| --- | --- |
| With a weight chip on | The weight the row is drawn at, for example 700 with **Bold**. |
| With **All** weights | The font's weight nearest to the text's weight. A text at 800 set in Anton, which has only 400, gets 400; a text at 700 set in Cinzel stays at 700. |

**Italic** stays as it was. A font without a real italic gets slanted letters. To change the weight afterwards, use the **Weight** field under **Font**: it lists the weights the font has. See [Style text in the Text section](titles-and-text.md#style-text-in-the-text-section).

## What the list shows

The list has up to five sections, in this order:

| Section | What it lists |
| --- | --- |
| **Recent** | The last 8 fonts you applied from the browser, the newest first. Kept in this browser for all your projects. |
| **Favorites** | The fonts you starred, in the order you starred them. See [Keep your favorite fonts](#keep-your-favorite-fonts). |
| **My fonts** | The font files you added yourself. When you have none, the section shows **Add fonts…** and "Or drop .ttf, .otf, .woff or .woff2 files here". See [Add your own fonts](#add-your-own-fonts). |
| **Library** | The 330 fonts that come with the editor, by name. See [Fonts that come with the editor](#fonts-that-come-with-the-editor). |
| **On this computer** | The fonts installed on your computer, after you click **Show system fonts**. See [Use fonts from your computer](#use-fonts-from-your-computer). |

Each row shows:

- the font's name, drawn in the font itself, at the weight of the weight chip (with **All**, at the font's weight nearest to Regular 400);
- how many weights the font has, for example **9 weights** or **1 weight**;
- a star, and for your own fonts an edit button (a pencil). They appear when you point at the row. A starred font keeps its gold star.

The font of the selected text has a gold name on a gold tint. A section with no matching font is left out while you search or filter. **Recent** and **Favorites** keep their order until you search; the other sections are sorted by name, with the best matches first while you search.

**Fonts load as you scroll.** Only the rows you see load their font files, a few at a time, so the list scrolls smoothly through all 330 families. A row whose font is still loading shows its name dimmed, in the editor's own font at its usual weight, for a moment. The first time you open the browser in a session, the library takes a moment to load: until then, **Library** shows the eight fonts of earlier versions and **Loading the font library…**.

## Keep your favorite fonts

1. In the font browser, point at a font.
2. Click the star at the right of its row (tooltip **Add Cinzel to favorites**, for Cinzel). The font appears under **Favorites** at the top of the list.

Click the gold star again (tooltip **Remove Cinzel from favorites**) to take it out. Your favorites are kept in this browser for all your projects. You can star up to 50 fonts: starring one more takes the star off the oldest. **Toggle favorite font** in the command palette does the same for the font of the selected text; see [Font commands in the command palette](#font-commands-in-the-command-palette).

## Fonts that come with the editor

The library has 330 font families, about 32 MB, and comes with the editor:

- **No installation, no internet.** Every library font works on every computer, also with the network off. Nothing is downloaded from the internet: the fonts load from the editor itself the first time a row or a text needs them.
- **Free to use.** All of them are open-source fonts from Google Fonts, under the SIL Open Font License 1.1, the Apache License 2.0 or the Ubuntu Font Licence 1.0. You can use them in your videos and share them with your projects. See [See the font licenses](#see-the-font-licenses).
- **Weights and italics.** 116 of them have every weight between their lightest and boldest (variable fonts), the others the weights their designers made. 107 have a real italic.
- **The eight fonts of earlier versions** (Inter, Montserrat, Nunito, Oswald, Unbounded, Playfair Display, Caveat and JetBrains Mono) are part of the library, unchanged. Inter is the font of new titles and subtitles.

A text with a library font it hasn't used before may appear a moment after the rest of the picture, while the font loads.

> **Note:** The library fonts cover the Latin alphabet of Western, Central and Eastern European languages. Letters of other scripts, such as Greek, Cyrillic, Arabic, Hebrew, Chinese, Japanese or Korean, are drawn with a fallback font of your system instead. For those languages, use a font from your computer or add one to **My fonts** that has them.

## Add your own fonts

> **Video placeholder: Add your own fonts**
> - File: `videos/fonts/my-fonts.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A title selected. Open the font browser: **My fonts** shows **Add fonts…** and "Or drop .ttf, .otf, .woff or .woff2 files here".
>   2. Select `RubikDoodleShadow-Regular.ttf` and `Kalnia-Bold.woff2` in File Explorer and drag them onto the browser: it gets a dashed gold outline. Drop them: the message **Added 2 fonts to My fonts** appears, and **My fonts** lists Kalnia (1 weight) and Rubik Doodle Shadow, each in its own font.
>   3. Click **Kalnia**: the title is set in Kalnia Bold.
>   4. Open the **Presets** tab of the Media panel and drag `Sedan-Regular.otf` onto it: the tab shows **Drop font files to add them to My fonts**. Drop it: Sedan joins **My fonts**.
>   5. Open another project and the font browser: **My fonts** lists the same three fonts.

1. Do one of these:
   - In the font browser, click **Add fonts…** (the button right of the search field, or the row of that name under an empty **My fonts**), choose one or more font files and click **Open**.
   - Drag font files from File Explorer onto the open font browser, or onto the **Presets** tab of the Media panel. The browser shows a dashed gold outline while you drag; the tab shows **Drop font files to add them to My fonts**.
   - Run **Add fonts…** in the command palette.
2. The message **Added 2 fonts to My fonts** (for two files) appears with the names of the fonts, and the fonts are listed under **My fonts**, each in its own font.

Your fonts are now in every project you open in this browser. Use them like any other font: try them on your text, apply them, star them.

| File | Supported |
| --- | --- |
| TrueType (`.ttf`), OpenType (`.otf`), WOFF (`.woff`), WOFF2 (`.woff2`) | Yes, up to 32 MB per file, several files at once |
| Font collections (`.ttc`) | No |

**Names.** The editor reads the font's name and weight from inside a `.ttf`, `.otf` or `.woff` file. For a `.woff2` file it uses the file name: `Kalnia-Bold.woff2` becomes Kalnia, Bold 700. The message then adds, for example, "Named from the file name: Kalnia (rename in My fonts)". If the name isn't right, rename the font; see [Rename, sort or remove your fonts](#rename-sort-or-remove-your-fonts).

**Several weights.** Files with the same font name become one font with several weights: add `Kalnia-Regular.woff2` and `Kalnia-Bold.woff2`, and **My fonts** lists Kalnia with **2 weights**, both in its **Weight** field.

When a file can't be added, the message lists it with the reason. If no file could be added, the message reads **Couldn't add the font** (or **Couldn't add the fonts**):

| Reason | What to do |
| --- | --- |
| not a .ttf, .otf, .woff or .woff2 file | Only font files can be added. Other files dropped with them are left out. |
| larger than 32 MB | Use a smaller file of the font, for example one without the letters of languages you don't need. |
| font collections (.ttc) are not supported | Use the separate `.ttf` or `.otf` files of the fonts in the collection. |
| not a font file, or the browser cannot read it as a font | The file is damaged or isn't really a font. Download it again. |
| already in My fonts | The same file is already there. Nothing to do. |

If you add a font with the same name as a library font, texts with that name use the library's font.

## Rename, sort or remove your fonts

1. In the font browser, point at one of your fonts under **My fonts** and click its pencil (tooltip **Edit Kalnia**, for Kalnia).
2. The list makes way for the font's settings: its name in its own font, its styles and file names, and these fields:

| Field | What it does |
| --- | --- |
| **Name** | The font's name in the browser and in your texts. Type a new one and press <kbd>Enter</kbd> or click elsewhere. Up to 64 characters. A name another of your fonts has shows **Another font of My fonts has this name**; an empty name goes back to the old one. |
| **Looks** | Click the looks the font should be listed under, such as **Handwritten & Script**. Click a look again to take it off. |
| **Tags (comma-separated)** | Words the search finds the font by, such as `wedding, gold`. Saved when you press <kbd>Enter</kbd> or click elsewhere: up to 12 tags of up to 24 characters, in lower case. |

3. Click **Done** to go back to the list.

To remove the font, click **Remove** (tooltip **Remove from My fonts (projects that use it keep their copy)**). It leaves **My fonts**, **Favorites** and **Recent** in this browser. Projects that use it keep their copy in their `fonts` folder and still draw with it; see [Fonts travel with the project](#fonts-travel-with-the-project).

- Renaming changes all the weights of the font together, and **Favorites** and **Recent** follow the new name.
- Texts that already use the font keep its old name, and go on drawing with the copy in their project. To give them the new name, pick it in the font browser.
- These changes are not steps in the history: they change your font list, not the project.

## Where My fonts are kept

- **In this browser**, for every project you open in it. Another browser, or another Chrome profile, has its own list.
- **In your preset library folder**, if you set one in the **Presets** tab. The editor keeps a copy of your fonts in its `fonts` folder: one file per font and `my-fonts.json`, the list. Another computer or browser that syncs with the same folder gets your fonts at its next sync, and adds its own to the folder. When a font was changed on both sides, the change made last wins. See [Sync your presets with a folder](text-presets.md#sync-your-presets-with-a-folder).

> **Important:** If you clear the editor's site data in Chrome, My fonts are deleted with it, unless they are in a library folder. Projects that use them keep their copies.

## Use fonts from your computer

> **Video placeholder: Use a font from your computer**
> - File: `videos/fonts/system-fonts.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. A title selected. Open the font browser and scroll to **On this computer**. Click **Show system fonts**.
>   2. Chrome asks to use the fonts on your device: click **Allow**. The fonts installed on the computer appear under **On this computer**, each in its own font.
>   3. Click **Bold** in the weight chips: only installed fonts with a bold weight are left. Click **Georgia**: the title is set in Georgia Bold.

1. In the font browser, click **Show system fonts** under **On this computer**, at the end of the list.
2. The first time, Chrome asks whether the site may use the fonts on your computer. Allow it.
3. The installed fonts appear under **On this computer**. Search them, filter them by weight, and click one to use it.

The list stays until you reload the page; after a reload, click **Show system fonts** again. Chrome remembers your answer, so it asks only once. The **Weight** field of a computer font lists the weights installed, once the list is loaded.

Instead of the fonts, the section can show:

| Message | Meaning |
| --- | --- |
| **Listing the system fonts…** | The editor is reading the list. |
| **Font access was not allowed** | You (or Chrome) refused the permission. **Show system fonts** stays below it. See [Show system fonts lists nothing](troubleshooting.md#show-system-fonts-lists-nothing). |
| **This browser cannot list system fonts** | The browser has no access to installed fonts. Use the library or **My fonts**. |
| **No system fonts** | The computer reported no fonts. |

- Installed fonts have no looks: the section is hidden while a look chip is on.
- A font that is also in the library, such as Montserrat, is drawn with the library's files, even when you pick it under **On this computer**.

## Fonts travel with the project

Every font your texts and captions use is copied into the `fonts` folder of the project, wherever it comes from, with a `fonts.json` file that lists each copy, its weight, its style and where it came from. The editor uses these copies when it opens the project, before any font of the same name installed on the computer. So the project looks the same on a computer that doesn't have the font, with another version of the editor, and after you remove the font from **My fonts**.

| Font from | What is copied |
| --- | --- |
| The library | The files of the weight the text uses. For a font with every weight (a variable font), the same files cover them all. |
| **My fonts** | The file of the weight the text uses. |
| Your computer | The installed file of the weight and style the text uses. The editor can copy it only while the list of system fonts is loaded: if you change the weight of a computer font in a later session, click **Show system fonts** once so the new weight can be copied. |

- Copying happens in the background, a moment after you pick the font. The folder appears with the first text clip or caption track of the project.
- A project open in read-only mode copies nothing. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).
- If the `fonts` folder is deleted, the editor copies the library fonts and your own fonts again the next time it opens the project. Fonts from your computer come back after **Show system fonts**.

> **Important:** A font file in the project folder goes wherever the folder goes. The library fonts allow it. Before you share a project folder that uses fonts from your computer or **My fonts**, check that their licenses allow it.

## Fix a missing font

When a text uses a font that is not in the library, not in **My fonts**, not in the project's `fonts` folder and not installed on this computer:

- the text is drawn with the editor's interface font instead;
- the **Font** field shows a red **Missing** chip (tooltip **This font is not available here: the text uses the fallback font**);
- the clip on the timeline shows a red warning triangle in its label bar.

This happens, for example, when you open a project made on another computer that couldn't copy the font, or after you delete the project's `fonts` folder while the font was from another computer.

To fix it, do one of these:

- Pick another font for the text in the font browser.
- Add the font file to **My fonts**: drop it on the font browser. If its name in **My fonts** differs from the one the text uses, rename it to that name.
- Install the font on this computer and reload the page.
- On the computer where the project was made, open the project with editing allowed: the editor copies its fonts into the project. For a font from that computer, click **Show system fonts** once.

The chip and the triangle disappear as soon as the font is available.

## See the font licenses

1. Open **Settings** and click the **About** tab, or run **About Shorts Editor** in the command palette.
2. Scroll to **Font licenses**. It lists every font of the library with its designer and license, for example "Natanael Gama · SIL Open Font License 1.1" for Cinzel.
3. Click a font (tooltip **Open the license of Cinzel**) to open its license text in a new browser tab.

The list reads **Reading the font library…** for a moment the first time. See [See the version and get help](settings.md#see-the-version-and-get-help).

## Font commands in the command palette

Find these in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>), in the **Text** group. They have no keys by default; give them keys in **Settings** > **Shortcuts**. See [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

| Command | What it does |
| --- | --- |
| **Open font browser** | Opens the font browser of the selected text clips, or of the **Caption style** when captions are selected. Grey when neither is selected. Typing `typeface` or `luxury` finds it too. |
| **Add fonts…** | Opens the file picker to add font files to **My fonts**. |
| **Toggle favorite font** | Stars the font of the selected text, or removes its star. While the font browser is open, it stars the row you point at or highlighted. |

## Undo font changes

| Step name | What made it |
| --- | --- |
| **Change font** | Clicking a font row, or <kbd>Enter</kbd> in the font browser. The font and, with a weight chip, the weight change in this one step. |
| **Change font weight** | The **Weight** field |

Pointing at rows and moving with <kbd>↓</kbd> and <kbd>↑</kbd> add no step. Favorites, recent fonts and **My fonts** are not part of the project and have no undo.

## Related pages
- [Titles and text](titles-and-text.md)
- [Captions](captions.md)
- [Text presets](text-presets.md)
- [Projects and saving](projects-and-saving.md)
- [Exporting your video](exporting-video.md)
- [Settings](settings.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 53, 2026-10-19</sub>
