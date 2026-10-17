# Captions

Captions are the subtitles that run along with the speech of your video. They live on their own caption track, **CC**, above every video track, as short pieces of text called cues. You write and fix them in the **Captions** tab of the Media panel, bring them in from SRT or VTT subtitle files, and give all of them one look in the **Caption style** section of **Edit Properties**. When a cue has word timings, the spoken word lights up as it plays.

> **Video placeholder: Captions in one minute**
> - File: `videos/captions/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head video on V1 and A1. In the timeline toolbar, click **Add caption track** (the captions icon after **Subtitle**): a row named **CC** appears above V1, the **Captions** tab of the Media panel opens and the button turns dim.
>   2. In the Captions header, click **Import SRT or VTT (replaces the cues)** and pick `talk.srt`: grey cues fill the CC row, the list reads **48 cues**, and a message says **Imported 48 cues**.
>   3. Click the timeline and press <kbd>Space</kbd>: white captions with a black outline appear in the lower third, and a red bar moves down the list with the cue that is playing. Press <kbd>Space</kbd> again.
>   4. Click into the text of the third cue and fix a typo: the preview shows the new text as you type. Put the caret after the comma and press <kbd>Enter</kbd>: the cue becomes two cues, and the caret is in the second one.
>   5. Click **Caption style (in Edit Properties)** in the Captions header: **Edit Properties** shows the **Caption style** section. Click **Top**: the captions move to the top of the frame.
>   6. Open the **Presets** tab and click **Neon glow**: the captions take its font and glow and stay at the top.
>   7. Back in the **Captions** tab, click **Export SRT or VTT**, type `talk.vtt` as the file name and save.

## In this page
- [How captions work](#how-captions-work)
- [Add the caption track](#add-the-caption-track)
- [Open the Captions tab](#open-the-captions-tab)
- [Add a cue at the playhead](#add-a-cue-at-the-playhead)
- [Import an SRT or VTT file](#import-an-srt-or-vtt-file)
- [Edit a cue's text](#edit-a-cues-text)
- [Split and merge cues](#split-and-merge-cues)
- [Find, select and delete cues](#find-select-and-delete-cues)
- [Edit cues on the timeline](#edit-cues-on-the-timeline)
- [Style your captions](#style-your-captions)
- [Choose where captions sit](#choose-where-captions-sit)
- [Highlight the spoken word](#highlight-the-spoken-word)
- [Give captions the look of a preset](#give-captions-the-look-of-a-preset)
- [Export an SRT or VTT file](#export-an-srt-or-vtt-file)
- [Hide, lock or remove the captions](#hide-lock-or-remove-the-captions)
- [Undo caption changes](#undo-caption-changes)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## How captions work

- A project has at most one caption track. Its header reads **CC**, and it always sits above every video track, so captions show on top of everything else in the frame.
- The track holds cues. A cue is a piece of text with a start and an end. Cues never overlap: at any frame, at most one cue shows.
- The look of the captions belongs to the track: every cue shows in the same font, colors and position. You set it once in the **Caption style** section. See [Style your captions](#style-your-captions).
- Captions are drawn by the same text engine as titles, so they stay sharp at every preview zoom and show in **Export frame**. See [Export the current frame](preview-and-playback.md#export-the-current-frame).
- A cue can carry word timings: when each word is spoken. With them, the editor highlights the spoken word. See [Highlight the spoken word](#highlight-the-spoken-word).

> **Note:** Captions are not titles. You can't click them in the preview, drag them there, or type in them there; a click on a caption selects the picture under it. Edit their text in the **Captions** tab and their place in **Caption style**. For text you place by hand, use a title or a subtitle; see [Titles and text](titles-and-text.md).

## Add the caption track

Click **Add caption track** in the timeline toolbar. It is the captions icon in the add group, right after **Subtitle**.

- The **CC** track appears above the top video track, in the default caption style, and the **Captions** tab of the Media panel opens.
- The button turns dim, because a project has only one caption track. Its tooltip then reads **Caption track: the project has one (Media > Captions)**.
- The step in the history is **Add caption track**.

You don't have to add the track first: adding a cue or importing a subtitle file in the **Captions** tab creates it when the project has none.

The default caption style on a 1080×1920 project:

| Setting | Default |
| --- | --- |
| Text | White Inter ExtraBold, 64 px, centered, line height 1.15 |
| Outline and shadow | A 6 px black outline and a soft shadow; no background box |
| **Position** | **Bottom**: in the lower third, where a subtitle sits |
| **Max width** | 900 px |
| **Max lines** | 2 |
| **Highlight** | **Color**: the spoken word yellow, the other words white |

On a project of another size, the sizes follow the shorter side of the frame, as for text presets, and the max width follows the frame's width.

## Open the Captions tab

Click **Captions** in the header of the Media panel. The editor remembers the open tab with the project.

Before the project has a caption track, the tab reads **No captions yet**, with two buttons: **Cue at playhead** and **Import SRT/VTT**.

Once there is a track, the tab shows a search field, the number of cues (for example **200 cues**) and the cue list. Each row shows:

| Part | What it shows |
| --- | --- |
| Times | The cue's start above its end, in the timecode format of the editor (frames or milliseconds; see [Show times in milliseconds](timeline.md#show-times-in-milliseconds)) |
| Text | The cue's text, up to two lines. Click into it to edit it. |
| Word count | The number of words in the cue (tooltip **Words**) |

- The row of the selected cue is highlighted. The row of the cue under the playhead has a red bar at its left edge, which moves from row to row while you play.
- The list scrolls smoothly even with hundreds of cues.

The header of the tab has these buttons, from left to right:

| Button (tooltip) | What it does |
| --- | --- |
| **Add a 2 s cue at the playhead** (+) | Adds a cue at the playhead. See [Add a cue at the playhead](#add-a-cue-at-the-playhead). |
| **Import SRT or VTT (replaces the cues)** | Imports a subtitle file. See [Import an SRT or VTT file](#import-an-srt-or-vtt-file). |
| **Export SRT or VTT** | Saves the cues as a subtitle file. Dimmed while there are no cues. See [Export an SRT or VTT file](#export-an-srt-or-vtt-file). |
| **Caption style (in Edit Properties)** (brush) | Selects the **CC** track (unless cues are selected), and opens, scrolls to and focuses the **Caption style** section of **Edit Properties**. Dimmed without a caption track. |
| **Transcribe: coming in Batch 33** (microphone) | Dimmed: transcribing speech into cues is available in a later version. |
| **Clear all cues** (eraser) | Removes every cue at once. Dimmed while there are no cues. See [Find, select and delete cues](#find-select-and-delete-cues). |

## Add a cue at the playhead

1. Move the playhead to where the cue should start.
2. Click **Add a 2 s cue at the playhead** (+) in the Captions header, or **Cue at playhead** in an empty tab.
3. The new cue reads "Caption", selected in the list: type its text right away. Click elsewhere, or press <kbd>Tab</kbd>, to finish.

Where the cue goes:

- It starts at the playhead and lasts 2 seconds, or less when the next cue starts sooner: it ends where the next cue begins.
- When the playhead is inside a cue, the new cue starts where that cue ends (and after the cues right behind it).
- The project gets its caption track if it had none, and the **Captions** tab opens. Adding the cue is one step, **Add cue**.

## Import an SRT or VTT file

> **Video placeholder: Import and export subtitles**
> - File: `videos/captions/import-export.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A project with a 2-minute talk on V1 and A1 and no captions. Open the **Captions** tab: **No captions yet**. Click **Import SRT/VTT** and pick `talk.srt`.
>   2. The **CC** track appears with 48 grey cues, each showing its text; the list reads **48 cues** and the message **Imported 48 cues** appears.
>   3. Scroll the list to the end, then press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the cues and the track disappear. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>: they are back.
>   4. Click **Export SRT or VTT**: the save dialog suggests the project's name with `.srt`. Save it.
>   5. Click **Export SRT or VTT** again, choose **WebVTT subtitles** as the type, and save: a `.vtt` file with the same cues.
>   6. Open both files in Notepad side by side: the same cues and times.

1. In the **Captions** tab, click **Import SRT or VTT (replaces the cues)**, or **Import SRT/VTT** in an empty tab.
2. Pick a `.srt` (SubRip) or `.vtt` (WebVTT) file.
3. The cues appear on the **CC** track and in the list. A message says how many, for example **Imported 200 cues**.

> **Important:** An import replaces all the cues on the caption track; the message says how many it replaced. The track keeps its style. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to get the old cues back: the whole import is one step, **Import captions**.

What the editor does with the file:

- **Times** go to the nearest frame of the project, and every cue lasts at least one frame. A time that falls between two frames moves by at most half a frame, so a file you export again has the same cues with each time on the frame grid.
- **Overlaps:** when a cue starts before the previous one ends, the previous one ends there. Two cues that start on the same frame become one cue, with their texts on two lines. The message counts them, for example **3 overlapping cues adjusted.**
- **Lines** inside a cue stay as they are in the file.
- **Formatting** is left out: bold, italics, colors, fonts and positions written in the file (such as `<i>`, `<font>` and `{\an8}`) are removed, so every cue takes the caption style. In VTT files, the header, `NOTE`, `STYLE` and `REGION` blocks, cue names and cue settings are ignored, and `&amp;` and the like turn back into their characters.
- **Karaoke timings:** a VTT cue with times inside its text, such as `Never <00:00:00.700>drink <00:00:01.200>liquid nitrogen`, gives the cue word timings, so the spoken word can be highlighted. See [Highlight the spoken word](#highlight-the-spoken-word).
- **Damaged files:** the editor reads files with or without cue numbers, with Windows, Mac or Unix line ends, with a byte order mark, with a dot or a comma before the milliseconds, and without hours. Blocks that have no readable time line are skipped, and the message counts them, for example **2 blocks skipped.**

The editor tells a VTT file by its first line, `WEBVTT`, or by its `.vtt` name; any other file is read as SRT.

| Message | Why | What to do |
| --- | --- | --- |
| **No captions imported** | The file holds no cue the editor can read. | Check that it is an SRT or VTT file, with time lines such as `00:00:01,000 --> 00:00:03,500`. |
| **The caption track is locked** | The **CC** track is locked. | Unlock it with the padlock in its header, then import again. |
| **Couldn't import the captions** | The file can't be read. | Pick the file again, or copy it to another folder first. |

## Edit a cue's text

> **Video placeholder: Edit cues in the list**
> - File: `videos/captions/edit-cues.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A project with 20 cues on **CC** and the **Captions** tab open. Click into the second cue's text: the row is highlighted and the playhead jumps to the cue's start.
>   2. Select all with <kbd>Ctrl</kbd>+<kbd>A</kbd> and type `Hello brave new world`: the preview shows each letter as you type.
>   3. Put the caret after "brave" and press <kbd>Enter</kbd>: two cues, "Hello brave" and "new world", the first one a little longer; the caret is at the start of the second.
>   4. Press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd>: they are one cue again.
>   5. Press <kbd>Tab</kbd>: the next cue's text is selected. Type over it and press <kbd>Esc</kbd>: the old text is back.
>   6. Press <kbd>Delete</kbd>: the cue is gone from the list and the timeline.
>   7. Type `brave` in **Search cues**: the list shows **1 of 19**.

1. Click into a cue's text in the list. The cue is selected and the playhead jumps to its first frame, so the preview shows it.
2. Type. The preview shows the new text at once, while you type.
3. Finish with <kbd>Tab</kbd>, or click anywhere else. The text is saved as one step, **Edit caption**, and the cue's label on the timeline shows it.

Keys in a cue's text:

| Key | What it does |
| --- | --- |
| <kbd>Enter</kbd> | Splits the cue at the caret. See [Split and merge cues](#split-and-merge-cues). |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Starts a new line in the cue |
| <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> at the very start of the text | Merges the cue into the cue before it |
| <kbd>Tab</kbd> or <kbd>Shift</kbd>+<kbd>Tab</kbd> | Saves the text and selects the text of the next or the previous cue |
| <kbd>Esc</kbd> | Puts the text back as it was and leaves the field. The row stays focused, so <kbd>Delete</kbd> now deletes the cue. |

- While you type in a cue, the editor's other shortcuts are off: <kbd>Space</kbd> types a space.
- You can scroll the list far away from the cue you are typing in: the cue keeps the caret, and you can go on typing. Switching to another tab of the Media panel saves the text.
- The word count follows your typing.
- A long cue can take more lines in the frame than **Max lines** allows: it is drawn smaller to fit. See [Style your captions](#style-your-captions).

## Split and merge cues

**Split a cue in the list:** put the caret where the second cue should start and press <kbd>Enter</kbd>.

- The text before the caret stays in the first cue, the rest goes into a new cue right after it.
- The time is shared by the number of letters on each side. For example, a 36-frame cue "Hello brave new world" split after "brave" gives "Hello brave" for 20 frames and "new world" for 16.
- When the cue has word timings, the second cue starts when its first word is spoken.
- The caret goes to the start of the second cue. The split is one step, **Split cue**.
- A cue shorter than 2 frames can't be split: the message **Can't split this cue** appears.

**Merge a cue into the one before it:** put the caret at the very start of its text and press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd>, or right-click the cue on the timeline and choose **Merge with previous cue**.

- The two texts are joined with a space, and the cue before it now lasts until the end of the merged cue, the gap between them included.
- The caret goes to where the two texts meet. The merge is one step, **Merge cues**.
- **Merge with previous cue** is dimmed on the first cue.

You can also split cues on the timeline with <kbd>Ctrl</kbd>+<kbd>K</kbd> or the **Razor** tool. See [Edit cues on the timeline](#edit-cues-on-the-timeline).

## Find, select and delete cues

- **Search:** type in **Search cues** at the top of the tab. The list shows only the cues whose text contains what you typed, in capitals or not, and the count reads, for example, **3 of 200**. When no cue matches, the list reads **No cue matches the search.** Clear the field to see all cues again.
- **Select a cue:** click its row, away from the text. The cue is selected on the timeline too, and the playhead jumps to its start. A cue you select on the timeline scrolls into view in the list.
- **Delete cues:** select cues (in the list or on the timeline) and press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, while the Media panel or the timeline is active. In the list, press <kbd>Esc</kbd> first if you are typing in a cue. The step is **Delete clip** or **Delete clips**.
- **Clear all cues:** click **Clear all cues** (eraser) in the Captions header. Every cue goes at once, with no question asked; the track and its style stay. The step is **Clear captions**: press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring the cues back.

## Edit cues on the timeline

On the **CC** row, each cue is a grey clip that shows its text on one line. The row always has the small height S.

Cues are clips, so you select, move, trim, split and delete them, give them a label color and turn them off as on other tracks. A cue that is turned off doesn't show in the preview. See [Timeline](timeline.md), [Trimming clips](trimming.md) and [Splitting, deleting and closing gaps](splitting-and-deleting.md). A cue that is selected shows the **Clip** and **Caption style** sections in **Edit Properties**.

Because cues must not overlap, some edits work differently on the **CC** track:

| Edit | On the CC track |
| --- | --- |
| Drag a cue | It stops against the cues before and after it, instead of covering them. |
| <kbd>Alt</kbd>+drag a copy | The copy goes to the free spot nearest the pointer, no farther away than its own length. With no room there, the ghost turns red and the drop does nothing. |
| Nudge with <kbd>Alt</kbd>+<kbd>←</kbd> or <kbd>Alt</kbd>+<kbd>→</kbd> | The cue stops at its neighbors. |
| Trim an edge | The edge stops at the next cue and never pushes it, even with **Ripple mode** on or <kbd>Ctrl</kbd> held. |
| Split with <kbd>Ctrl</kbd>+<kbd>K</kbd> or the **Razor** | The text is cut too: where the first word after the cut is spoken (with word timings), or else at the space nearest the cut's share of the cue. A one-word cue keeps its word on both sides. |

The caption track still moves along with the picture:

- An insert (<kbd>Ctrl</kbd> while you drop) and the ripple edits on other tracks (ripple trims, **Ripple delete**, <kbd>Q</kbd> and <kbd>W</kbd>, closing gaps) move the cues like the clips of any other unlocked track, so your captions stay in sync with the speech. A cue that crosses the point where time is inserted is split there.
- To keep the captions where they are during such an edit, lock the **CC** track.

## Style your captions

> **Video placeholder: Style captions**
> - File: `videos/captions/style.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A project with cues on **CC** and the playhead over a long cue. Click the **CC** track header: **Edit Properties** shows the **Track** and **Caption style** sections.
>   2. Click **Center**, then **Top**: the captions move in the preview.
>   3. Click **Custom** and drag the **Y** label to the left: the captions move up while you drag.
>   4. Type `600` in **Max width**: the long cue wraps onto more lines. Type `1` in **Max lines**: it is drawn smaller to fit on one line.
>   5. Click **Size**, type `80` and press <kbd>Enter</kbd>. Turn on **Background**: a dark box appears behind each line.

1. Select the **CC** track (click its header), or one or more cues, or click **Caption style (in Edit Properties)** in the Captions header.
2. In **Edit Properties**, find the **Caption style** section. It comes after the **Track** section for a selected track, and after the **Clip** section for selected cues.
3. Change the settings. The captions in the preview follow at once. Each change is one step in the history.

The section has these rows:

| Row | What it does |
| --- | --- |
| **Position** | Where the captions sit: **Bottom**, **Center**, **Top** or **Custom**. See [Choose where captions sit](#choose-where-captions-sit). |
| **Y** | With **Custom**: the height of the middle of the captions, in pixels from the center of the frame (negative values go up). Dimmed with the other positions. From -4000 to 4000. |
| **Max width** | How wide a caption can get before its words wrap onto the next line, in pixels. From 50 to 8000. A shorter cue keeps its own width, and its background box fits its text. |
| **Max lines** | How many lines a cue may take, from 1 to 6. A cue that needs more lines is drawn smaller, in steps of 10%, down to half its size, until it fits. |
| **Highlight** | How the spoken word stands out: **None**, **Color**, **Box**, **Scale** or **Both**. See [Highlight the spoken word](#highlight-the-spoken-word). |
| **Active** | The color of the spoken word, or of the box behind it |
| **Other words** | The color of the other words while one is highlighted |
| **Font**, **Weight**, **Size**, **Fill**, **Stroke**, **Shadow**, **Background**, **Align**, **Spacing**, **Line height**, **Case** | The text style of the captions, as in the **Text** section of a title. See [Style text in the Text section](titles-and-text.md#style-text-in-the-text-section) and [Choose a font](titles-and-text.md#choose-a-font). |

- The text style has no **Anchor** row and no **Box** or **Width** rows: the position and **Max width** take their place.
- Number fields work as everywhere in **Edit Properties**: type a value, use the arrow keys, or drag the field's label, and the preview follows while you drag. See [Type a value](editing-properties.md#type-a-value) and [Drag a value](editing-properties.md#drag-a-value).
- A font from your computer used in captions is copied into the project's `fonts` folder, as for titles. See [Fonts travel with the project](titles-and-text.md#fonts-travel-with-the-project).

## Choose where captions sit

Click a chip in the **Position** row:

| Chip | Tooltip | Where the captions sit |
| --- | --- | --- |
| **Bottom** | **Bottom: in the lower third** | Their bottom edge at 78% of the frame's height, where a subtitle sits. More lines grow upward. |
| **Center** | **Center of the frame** | Their middle at the center of the frame |
| **Top** | **Top: below the platform bar** | Their top edge at 18% of the frame's height, below the top bar of Reels, TikTok and Shorts. More lines grow downward. |
| **Custom** | **Custom: at the Y below** | Their middle at the **Y** you type. **Custom** starts where the position you had showed a one-line caption, so nothing jumps. |

Captions are always centered across the frame. To check that the platforms' buttons don't cover them, open **Overlays** in the preview header and choose your platform. See [Show a platform safe zone](preview-zoom-overlays-fullscreen.md#show-a-platform-safe-zone).

## Highlight the spoken word

> **Video placeholder: Highlight the spoken word**
> - File: `videos/captions/word-highlight.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A project with a talking-head video. Import a VTT file whose cues have karaoke times, such as `Never <00:00:00.700>drink <00:00:01.200>liquid nitrogen`.
>   2. Press <kbd>Space</kbd>: each word turns yellow as it is spoken, while the other words stay white.
>   3. Select the **CC** track. In **Caption style**, click **Box**: a yellow box sits behind the spoken word. Click **Scale**: the spoken word grows. Click **Both**: it is yellow and larger.
>   4. Click the **Active** swatch and pick a green: the highlight turns green.

When a cue has word timings, the caption highlights the word being spoken. Word timings come from VTT files with karaoke times inside the cues; see [Import an SRT or VTT file](#import-an-srt-or-vtt-file).

Choose the look in the **Highlight** row of **Caption style**:

| Chip | Tooltip | The spoken word |
| --- | --- | --- |
| **None** | **No word highlight** | Not highlighted: the whole cue shows in its text color |
| **Color** | **The spoken word in the highlight color** | Takes the **Active** color |
| **Box** | **A box in the highlight color behind the spoken word** | Keeps its text color, on a box in the **Active** color |
| **Scale** | **The spoken word grows** | Grows to 1.15 times its size |
| **Both** | **The spoken word in the highlight color, grown** | Takes the **Active** color and grows to 1.15 times its size |

- With **Color**, **Box**, **Scale** or **Both**, the other words take the **Other words** color. The defaults are a warm yellow for **Active** and white for **Other words**.
- Between two words, nothing is highlighted. While you type in a cue, its highlight pauses until you finish.
- Cues without word timings show in their text color, whatever the **Highlight** row says. The hint under the row reminds you: **Shows on cues with word timings (VTT karaoke, transcription).** With **None**, it reads **Off: cues show in the text color.**
- Word timings move with their cue. A split shares them between the two cues, and a trim keeps them: trim the start back out and the words are there again.

> **Note:** The highlight box has square corners in this version.

## Give captions the look of a preset

You can give your captions the style of any text preset, such as **Neon glow** or **Caption bold**.

1. Select the **CC** track, or a cue, and no title or subtitle.
2. Open the **Presets** tab of the Media panel and point at the cards: the captions in the preview take each look while the pointer is on its card.
3. Click the card you want. Or right-click it and choose **Apply to captions**.

- The captions take the preset's font, size, colors, outline, shadow and background box.
- They keep their **Position**, **Max width**, **Max lines** and **Highlight**. The preset's box width, position and animations are not used.
- The step is named after the preset, for example **Apply "Neon glow" to captions**.

See [Text presets](text-presets.md).

## Export an SRT or VTT file

1. In the **Captions** tab, click **Export SRT or VTT**. It is dimmed while there are no cues.
2. The save dialog suggests the project's name with `.srt`. To save a VTT file, choose **WebVTT subtitles** as the type, or end the name with `.vtt`.
3. Click **Save**. A message says **Exported** with the file name and the number of cues. If the file can't be written, the message **Couldn't export the captions** appears instead: save to another folder.

What the file holds:

- The cues in order, with their times to the millisecond and their lines.
- An SRT file numbers its cues; a VTT file starts with `WEBVTT`.
- Empty cues are left out, and so are the style and the word timings.

Use the file to upload captions to a platform separately from the video, or to edit them in another app and import them again.

## Hide, lock or remove the captions

The **CC** track header has three toggles: **Target**, **Lock** and **Hide**. See [Read a track header](tracks.md#read-a-track-header).

- **Hide** (the eye) takes the captions out of the preview without deleting them.
- **Lock** (the padlock) protects the cues and the caption style from changes. Adding a cue or importing a file then shows the message **The caption track is locked** ("Unlock CC to edit its cues."). Text you type in a cue goes back to the old text when you leave the field, <kbd>Enter</kbd> shows **Can't split this cue**, and **Clear all cues** does nothing.
- To remove the captions for good, right-click the **CC** header and choose **Delete track**: the track goes with its cues and its style, and **Add caption track** works again. <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings them back.

The caption track can't be dragged to another place, and its height can't be changed.

## Undo caption changes

Every caption change is one step in the history. Hover **Undo** in the app bar to see its name. See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

| Step name | What made it |
| --- | --- |
| **Add caption track** | **Add caption track** in the timeline toolbar |
| **Add cue** | **Add a 2 s cue at the playhead** or **Cue at playhead** |
| **Import captions** | An import (it also adds the track when there was none) |
| **Edit caption** | Typing in a cue, from the first key to leaving the field |
| **Split cue**, **Merge cues** | <kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> and **Merge with previous cue** |
| **Clear captions** | **Clear all cues** |
| **Caption position**, **Move captions**, **Change caption width**, **Change caption lines** | **Position**, **Y**, **Max width** and **Max lines** |
| **Word highlight**, **Change highlight color** | **Highlight**, **Active** and **Other words** |
| **Change font size**, **Add stroke** and the other text style steps | The text style rows, as in [Undo text changes](titles-and-text.md#undo-text-changes) |
| **Apply "Neon glow" to captions** (with the preset's name) | A preset card with the captions selected |
| **Move clip**, **Trim clip**, **Split clip**, **Delete clip** and the other clip steps | Edits of cues on the timeline |

## What is not available yet

These parts are available in a later version:

- **Transcribe**: turning the speech of your video into cues with word timings.
- A style for a single cue, and moving or styling captions in the preview.
- Exporting the video with its captions, and exporting caption files from the export settings. **Export frame** already includes the captions, and **Export SRT or VTT** saves the cues.
- Rounded corners for the highlight box.
- Pasting cues.

## Related pages
- [Titles and text](titles-and-text.md)
- [Text presets](text-presets.md)
- [Tracks](tracks.md)
- [Timeline](timeline.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Editing properties](editing-properties.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 32, 2026-10-17</sub>
