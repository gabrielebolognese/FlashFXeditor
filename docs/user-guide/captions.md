# Captions

Captions are the subtitles that run along with the speech of your video. They live on their own caption track, **CC**, above every video track, as short pieces of text called cues. You let the editor transcribe them from the speech, write and fix them in the **Captions** tab of the Media panel, bring them in from SRT or VTT subtitle files, and give all of them one look in the **Caption style** section of **Edit Properties**. Any cue can also get a font, colors, a size and a place of its own, from the same section, from a preset, or by dragging its caption in the preview. When a cue has word timings, the spoken word lights up as it plays.

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
>   7. Move the playhead to the fifth cue and click its caption in the preview: it gets a gold box with four corner handles. In **Caption style**, click **Selected (1)** in the **Edit** row, then drag the caption down to the middle of the frame: only that cue moves, and a brush appears on its clip on the **CC** row.
>   8. Back in the **Captions** tab, click **Export SRT or VTT**, type `talk.vtt` as the file name and save.

## In this page
- [How captions work](#how-captions-work)
- [Add the caption track](#add-the-caption-track)
- [Open the Captions tab](#open-the-captions-tab)
- [Add a cue at the playhead](#add-a-cue-at-the-playhead)
- [Import an SRT or VTT file](#import-an-srt-or-vtt-file)
- [Edit a cue's text](#edit-a-cues-text)
- [Split and merge cues](#split-and-merge-cues)
- [Find, select and delete cues](#find-select-and-delete-cues)
- [Use the cue menu](#use-the-cue-menu)
- [Edit cues on the timeline](#edit-cues-on-the-timeline)
- [Style your captions](#style-your-captions)
- [Choose where captions sit](#choose-where-captions-sit)
- [Give single cues their own style](#give-single-cues-their-own-style)
- [Move and size captions in the preview](#move-and-size-captions-in-the-preview)
- [Type a cue's text in the preview](#type-a-cues-text-in-the-preview)
- [Highlight the spoken word](#highlight-the-spoken-word)
- [Give captions the look of a preset](#give-captions-the-look-of-a-preset)
- [Copy a cue's style to other cues](#copy-a-cues-style-to-other-cues)
- [Export an SRT or VTT file](#export-an-srt-or-vtt-file)
- [Hide, lock or remove the captions](#hide-lock-or-remove-the-captions)
- [Undo caption changes](#undo-caption-changes)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## How captions work

- A project has at most one caption track. Its header reads **CC**, and it always sits above every video track, so captions show on top of everything else in the frame.
- The track holds cues. A cue is a piece of text with a start and an end. Cues never overlap: at any frame, at most one cue shows.
- The look of the captions belongs to the track: you set it once in the **Caption style** section, and every cue shows in it. A cue can also have a style of its own. It holds only the settings you changed for that cue, such as its font or its place; for everything else, the cue keeps following the track. See [Style your captions](#style-your-captions) and [Give single cues their own style](#give-single-cues-their-own-style).
- Captions are drawn by the same text engine as titles, so they stay sharp at every preview zoom and show in **Export frame** and in exported videos, drawn into the picture. See [Export the current frame](preview-and-playback.md#export-the-current-frame) and [Know what goes into the file](exporting-video.md#know-what-goes-into-the-file).
- A cue can carry word timings: when each word is spoken. With them, the editor highlights the spoken word. Transcribed cues always have them. See [Highlight the spoken word](#highlight-the-spoken-word).

> **Note:** A click on a caption in the preview selects its cue. Drag it to move it, drag a corner to change its font size, and double-click it to type its text there. See [Move and size captions in the preview](#move-and-size-captions-in-the-preview). For text that isn't tied to the speech, such as a hook or a title, use a title or a subtitle; see [Titles and text](titles-and-text.md).

## Add the caption track

Click **Add caption track** in the timeline toolbar. It is the captions icon in the add group, right after **Subtitle**.

- The **CC** track appears above the top video track, in the default caption style, and the **Captions** tab of the Media panel opens.
- The button turns dim, because a project has only one caption track. Its tooltip then reads **Caption track: the project has one (Media > Captions)**.
- The step in the history is **Add caption track**.

You don't have to add the track first: adding a cue, importing a subtitle file or adding a transcription in the **Captions** tab creates it when the project has none.

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

Before the project has a caption track, the tab reads **No captions yet** ("Transcribe the timeline's audio, add a cue at the playhead, or import an SRT or VTT file."), with three buttons: **Transcribe**, **Cue at playhead** and **Import SRT/VTT**. **Transcribe** is dimmed until the timeline has an audio clip (tooltip **Transcribe: no audio on the timeline**); see [Transcription](transcription.md). **Cue at playhead** adds the track with a first cue (see [Add a cue at the playhead](#add-a-cue-at-the-playhead)), and **Import SRT/VTT** fills it from a file (see [Import an SRT or VTT file](#import-an-srt-or-vtt-file)).

When the track is there but has no cues, for example after **Clear all cues**, the count reads **0 cues** and the list reads **No cues yet**, with the same text and the same three buttons.

Once there is a track, the tab shows a search field, the number of cues (for example **200 cues**) and the cue list. Each row shows:

| Part | What it shows |
| --- | --- |
| Times | The cue's start above its end, in the timecode format of the editor (frames or milliseconds; see [Show times in milliseconds](timeline.md#show-times-in-milliseconds)) |
| Text | The cue's text, up to two lines. Click into it to edit it. |
| Word count | The number of words in the cue (tooltip **Words**). Punctuation doesn't count. Chinese and Japanese text, written without spaces, is counted word by word too. |
| Style dot | A gold dot at the right end of the row (tooltip **This cue has its own style**), when the cue has a style of its own. See [Give single cues their own style](#give-single-cues-their-own-style). |

- The rows of the selected cues are highlighted. The row of the cue under the playhead has a red bar at its left edge, which moves from row to row while you play.
- The list scrolls smoothly even with hundreds of cues.

The header of the tab has these buttons, from left to right:

| Button (tooltip) | What it does |
| --- | --- |
| **Add a 2 s cue at the playhead** (+) | Adds a cue at the playhead. See [Add a cue at the playhead](#add-a-cue-at-the-playhead). |
| **Import SRT or VTT (replaces the cues)** | Imports a subtitle file. See [Import an SRT or VTT file](#import-an-srt-or-vtt-file). |
| **Export SRT or VTT** | Saves the cues as a subtitle file. Dimmed while there are no cues. See [Export an SRT or VTT file](#export-an-srt-or-vtt-file). |
| **Caption style (in Edit Properties)** (brush) | Selects the **CC** track (unless cues are selected), and opens, scrolls to and focuses the **Caption style** section of **Edit Properties**. Dimmed without a caption track. |
| **Transcribe the timeline's audio into cues (on this computer)** (microphone) | Opens the **Transcribe captions** dialog. Dimmed until the timeline has an audio clip (tooltip **Transcribe: no audio on the timeline**). While a transcription runs, it looks pressed and cancels it (tooltip **Cancel the transcription**). See [Transcription](transcription.md). |
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
- A cue with its own style keeps it on both parts.
- A cue shorter than 2 frames can't be split: the message **Can't split this cue** appears.

**Merge a cue into the one before it:** put the caret at the very start of its text and press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd>, or right-click the cue (its row in the list, or the cue on the timeline) and choose **Merge with previous cue**.

- The two texts are joined with a space, and the cue before it now lasts until the end of the merged cue, the gap between them included.
- The caret goes to where the two texts meet. The merge is one step, **Merge cues**.
- The merged cue keeps the style of the cue before it: its own style, or the track's when it has none. The style of the cue you merged into it goes.
- **Merge with previous cue** is dimmed on the first cue.

You can also split cues on the timeline with <kbd>Ctrl</kbd>+<kbd>K</kbd> or the **Razor** tool. See [Edit cues on the timeline](#edit-cues-on-the-timeline).

## Find, select and delete cues

- **Search:** type in **Search cues** at the top of the tab. The list shows only the cues whose text contains what you typed, in capitals or not, and the count reads, for example, **3 of 200**. When no cue matches, the list reads **No cue matches** ("Nothing matches “<search>”.") with a **Clear search** button. Click it, or clear the field, to see all cues again.
- **Select a cue:** click its row, away from the text. The cue is selected on the timeline too, and the playhead jumps to its start. A cue you select on the timeline scrolls into view in the list.
- **Select several cues:** <kbd>Ctrl</kbd>+click a row to add the cue to the selection, or to take it out. <kbd>Shift</kbd>+click a row to select every cue the list shows from the selected cue down or up to the one you click; the next <kbd>Shift</kbd>+click starts from the same cue again. Both work on a row's text too: they select the cue without starting to type in it, and the playhead stays where it is. With a search, a range takes only the cues the list shows.
- **Delete cues:** select cues (in the list or on the timeline) and press <kbd>Delete</kbd> or <kbd>Backspace</kbd>, while the Media panel or the timeline is active. In the list, press <kbd>Esc</kbd> first if you are typing in a cue. The step is **Delete clip** or **Delete clips**.
- **Clear all cues:** click **Clear all cues** (eraser) in the Captions header. Every cue goes at once, with no question asked; the track and its style stay. The step is **Clear captions**: press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring the cues back.

## Use the cue menu

Right-click a cue's row in the **Captions** tab, away from its text. The cue is selected, and its menu opens. When the cue is already selected together with others, they all stay selected, so the rows act on all of them. A right-click in the text itself opens the browser's usual text menu instead.

| Row | What it does |
| --- | --- |
| **Edit text** | Puts the caret at the end of the cue's text, ready for typing. See [Edit a cue's text](#edit-a-cues-text). |
| **Cut** | Copies the selected cues and deletes them (<kbd>Ctrl</kbd>+<kbd>X</kbd> on the timeline). |
| **Copy** | Copies the selected cues (<kbd>Ctrl</kbd>+<kbd>C</kbd> on the timeline). |
| **Paste at playhead** | Pastes the copied clips or cues at the playhead. Pasted cues go to the free spot nearest the playhead on the **CC** track. Dimmed until you copy something. See [Paste caption cues](copy-and-paste.md#paste-caption-cues). |
| **Split at playhead** | Splits the selected cues at the playhead, their text included (<kbd>Ctrl</kbd>+<kbd>K</kbd>). |
| **Merge with previous cue** | Joins the cue to the one before it. Dimmed on the first cue. See [Split and merge cues](#split-and-merge-cues). |
| **Delete** | Deletes the selected cues (<kbd>Delete</kbd>). |
| **Copy style** | Remembers the style of the selected cue (with several selected, the one you selected last). See [Copy a cue's style to other cues](#copy-a-cues-style-to-other-cues). |
| **Paste style** | Gives the selected cues the style you copied. Dimmed until you copy a style. |
| **Reset to track style** | Gives the selected cues the track's look again. Dimmed when none of them has a style of its own. See [Give single cues their own style](#give-single-cues-their-own-style). |
| **Add cue at playhead** | Adds a new cue at the playhead, as **Add a 2 s cue at the playhead** (+) in the header does. See [Add a cue at the playhead](#add-a-cue-at-the-playhead). |
| **Caption style** | Opens the **Caption style** section in **Edit Properties**. See [Style your captions](#style-your-captions). |

The menu works with the keyboard: <kbd>↓</kbd> and <kbd>↑</kbd> move between rows, <kbd>Enter</kbd> runs one, and <kbd>Esc</kbd> closes the menu. See [Use menus with the keyboard](command-palette-and-custom-shortcuts.md#use-menus-with-the-keyboard). **Edit cue text** is also in the command palette: it starts typing in the selected cue. So are **Copy caption style**, **Paste caption style** and **Reset to track style**, which do what the menu rows do.

## Edit cues on the timeline

On the **CC** row, each cue is a grey clip that shows its text on one line. A cue with a style of its own shows a brush at the right end of its clip. The row always has the small height S.

Cues are clips, so you select, move, trim, split and delete them, give them a label color and turn them off as on other tracks. A cue that is turned off doesn't show in the preview. See [Timeline](timeline.md), [Trimming clips](trimming.md) and [Splitting, deleting and closing gaps](splitting-and-deleting.md). A cue that is selected shows the **Clip** and **Caption style** sections in **Edit Properties**. Moves, trims, splits and copies keep each cue's own style.

The menu of a cue on the timeline (right-click it) also has **Merge with previous cue**, **Copy style**, **Paste style** and **Reset to track style**. See [Use the cue menu](#use-the-cue-menu).

Because cues must not overlap, some edits work differently on the **CC** track:

| Edit | On the CC track |
| --- | --- |
| Drag a cue | It stops against the cues before and after it, instead of covering them. |
| <kbd>Alt</kbd>+drag a copy | The copy goes to the free spot nearest the pointer, no farther away than its own length. With no room there, the ghost turns red and the drop does nothing. |
| Copy and paste (<kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>V</kbd>) | Pasted cues always go to the **CC** track. With **Paste**, they move to the nearest spot near the playhead where they don't overlap other cues; with no room there, nothing is pasted and the message **No room for the captions** appears. **Paste insert** makes room for them. Pasting cues into a project without captions adds the caption track with the copied style. See [Paste caption cues](copy-and-paste.md#paste-caption-cues). |
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
>   3. Click **Custom** and drag the **Y** label of the **Offset** row to the left: the captions move up while you drag. Drag the **X** label to the right: they move sideways.
>   4. Type `600` in **Max width**: the long cue wraps onto more lines. Type `1` in **Max lines**: it is drawn smaller to fit on one line.
>   5. Click **Size**, type `80` and press <kbd>Enter</kbd>. Turn on **Background**: a dark box appears behind each line.

1. Select the **CC** track (click its header), or one or more cues, or click **Caption style (in Edit Properties)** in the Captions header.
2. In **Edit Properties**, find the **Caption style** section. It comes after the **Track** section for a selected track, and after the **Clip** section for selected cues.
3. With cues selected, check the **Edit** row at the top of the section: **All cues** changes the track's style, which every cue follows; **Selected (n)** changes only the selected cues. See [Give single cues their own style](#give-single-cues-their-own-style).
4. Change the settings. The captions in the preview follow at once. Each change is one step in the history.

The section has these rows:

| Row | What it does |
| --- | --- |
| **Edit** | Only with cues selected: **All cues** (tooltip **Edit the track's style: every cue without its own style**) or **Selected (n)** (tooltip **Edit the selected cues' own style**), where n is the number of selected cues. With **Selected**, a **Reset to track style** button follows. |
| **Position** | Where the captions sit: **Bottom**, **Center**, **Top** or **Custom**. See [Choose where captions sit](#choose-where-captions-sit). |
| **Offset** | With **Custom**: **X** and **Y**, the middle of the captions in pixels from the center of the frame. Negative **X** values go left, negative **Y** values go up. Dimmed with the other positions. Each from -4000 to 4000. |
| **Max width** | How wide a caption can get before its words wrap onto the next line, in pixels. From 50 to 8000. A shorter cue keeps its own width, and its background box fits its text. |
| **Max lines** | How many lines a cue may take, from 1 to 6. A cue that needs more lines is drawn smaller, in steps of 10%, down to half its size, until it fits. |
| **Highlight** | How the spoken word stands out: **None**, **Color**, **Box**, **Scale** or **Both**. See [Highlight the spoken word](#highlight-the-spoken-word). |
| **Active** | The color of the spoken word, or of the box behind it |
| **Other words** | The color of the other words while one is highlighted |
| **Font**, **Weight**, **Size**, **Fill**, **Stroke**, **Shadow**, **Background**, **Align**, **Spacing**, **Line height**, **Case** | The text style of the captions, as in the **Text** section of a title. See [Style text in the Text section](titles-and-text.md#style-text-in-the-text-section) and [Fonts](fonts.md). |

- The text style has no **Anchor** row and no **Box** or **Width** rows: the position and **Max width** take their place.
- Number fields work as everywhere in **Edit Properties**: type a value, use the arrow keys, or drag the field's label, and the preview follows while you drag. See [Type a value](editing-properties.md#type-a-value) and [Drag a value](editing-properties.md#drag-a-value).
- **Font** opens the font browser, as for titles: point at a font to see it on the captions, and click it to use it. Every font the captions use is copied into the project's `fonts` folder. See [Fonts](fonts.md).

## Choose where captions sit

Click a chip in the **Position** row:

| Chip | Tooltip | Where the captions sit |
| --- | --- | --- |
| **Bottom** | **Bottom: in the lower third** | Their bottom edge at 78% of the frame's height, where a subtitle sits. More lines grow upward. |
| **Center** | **Center of the frame** | Their middle at the center of the frame |
| **Top** | **Top: below the platform bar** | Their top edge at 18% of the frame's height, below the top bar of Reels, TikTok and Shorts. More lines grow downward. |
| **Custom** | **Custom: at the X and Y below** | Their middle at the **X** and **Y** of the **Offset** row. **Custom** starts where the position you had showed a one-line caption, centered across the frame (**X** 0), so nothing jumps. |

- With **Bottom**, **Center** and **Top**, captions are centered across the frame. With **Custom**, **X** moves them sideways.
- Dragging a caption in the preview also sets **Custom**, at the place where you drop it. See [Move and size captions in the preview](#move-and-size-captions-in-the-preview).
- To check that the platforms' buttons don't cover the captions, open **Overlays** in the preview header and choose your platform. See [Show a platform safe zone](preview-zoom-overlays-fullscreen.md#show-a-platform-safe-zone).

## Give single cues their own style

> **Video placeholder: Style single cues**
> - File: `videos/captions/cue-styles.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A project with 12 cues on **CC**, all in the track's white Inter. In the **Captions** tab, click the second cue's row, then <kbd>Ctrl</kbd>+click the third: both rows are highlighted.
>   2. In **Edit Properties**, the **Caption style** section starts with the **Edit** row, on **All cues**. Click **Selected (2)**: a dimmed **Reset to track style** button appears under it.
>   3. Click the **Font** field and click **Anton**. Click the hex code of **Color** and type `FF3366`. Type `120` in **Size** and press <kbd>Enter</kbd>. Drag the playhead over cues 2, 3 and 4: the first two are pink Anton, cue 4 is still white Inter.
>   4. Point at the gold dots next to **Font**, **Weight**, **Size**, **Fill** and **Color**, at the gold dots at the right of the two rows in the **Captions** tab, and at the brushes on their clips on the **CC** row.
>   5. Point at the dot next to **Size**: it turns into a reset arrow. Click it: both cues go back to the track's size, and stay pink Anton.
>   6. Click **All cues** and change **Color** to yellow: every caption turns yellow, except cues 2 and 3, which stay pink.
>   7. Click **Selected (2)**, then **Reset to track style**: the two cues look like all the others again, and their dots and brushes are gone.

1. Select the cues: <kbd>Ctrl</kbd>+click or <kbd>Shift</kbd>+click their rows in the **Captions** tab (see [Find, select and delete cues](#find-select-and-delete-cues)), select them on the timeline, or click a caption in the preview.
2. In the **Caption style** section of **Edit Properties**, click **Selected (n)** in the **Edit** row.
3. Change any row. Only the selected cues change, in one step named as for the track, for example **Change font**, **Change text color** or **Change font size**. The other cues keep the track's look.

How a cue's own style works:

- **Only what you change becomes the cue's own.** Everything else still comes from the track. When you change the track's style later, with **All cues** or with the **CC** track selected, the cue follows in every setting it doesn't set itself. A setting you changed stays the cue's own until you reset it, even when you give it the track's value.
- **Mixed values.** With **Selected**, the rows show the values of the selected cues. When they differ, the field shows `--`. Type a value to give it to all of them; drag the label or press <kbd>↑</kbd> and <kbd>↓</kbd> to change each cue from its own value. See [Edit several clips at once](editing-properties.md#edit-several-clips-at-once).
- **A font comes with its weight.** Choosing a font for cues also sets their weight, so **Weight** gets a dot too.
- **The choice in the Edit row** applies to the section and to drags in the preview. It starts at **All cues**, and the editor remembers it with the project. The row shows only while cues are selected: with the **CC** track header selected, the section always changes the track's style.
- **Locked track.** While the **CC** track is locked, the cues' styles don't change.

### Read and reset the dots

With **Selected**, a gold dot at the right of a row's label shows that at least one selected cue sets that row itself.

- Point at the dot: it turns into a reset arrow, with a tooltip such as **Size: set on the selected cues. Click to use the track style.**
- Click it: the selected cues take that row from the track again. The step is named after the row, for example **Reset size to track style**. The cues keep their other own settings.
- Every row of the section has a dot when it is set: **Position**, **Offset**, **Max width**, **Max lines**, **Highlight**, **Active**, **Other words**, and the text style rows, also **Width**, **Color**, **Offset**, **Blur**, **Mode**, **Padding** and **Radius** under **Stroke**, **Shadow** and **Background**. **Weight** covers italics too.

To give the selected cues the track's whole look again, click **Reset to track style** under the **Edit** row, or choose **Reset to track style** in the cue menu or the command palette. The step is **Reset to track style**. The button is dimmed when none of the selected cues has a style of its own.

### See which cues have their own style

- A gold dot at the right end of the cue's row in the **Captions** tab (tooltip **This cue has its own style**).
- A brush at the right end of the cue's clip on the **CC** row of the timeline.
- When you reset a cue's last own setting, the dot and the brush go away.

Cues you add at the playhead, import or transcribe take the track's look. A split gives both parts the cue's style, a merge keeps the first cue's, and copied cues keep theirs.

## Move and size captions in the preview

> **Video placeholder: Move a caption in the preview**
> - File: `videos/captions/move-in-preview.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 1080×1920 project with cues on **CC** at **Bottom**. In the preview header, open **Overlays** and choose **Reels** under **Safe zone**.
>   2. Click a caption in the preview: a gold box with four corner handles surrounds it, and its cue is selected in the **Captions** tab.
>   3. In **Caption style**, click **Selected (1)**. Drag the caption up towards the top of the frame: gold guides appear, the readout next to the pointer shows **X 0 · Y** and a number, and the caption's top snaps to the top of the safe area. Release: **Position** reads **Custom**, and the other cues stay at the bottom.
>   4. Drag the top right corner handle outward: the readout shows the font size, such as **96 px**, and the caption grows.
>   5. Press <kbd>Shift</kbd>+<kbd>↓</kbd> twice: the caption moves 20 pixels down.
>   6. Move the playhead to another cue and click its caption. Click **All cues** and drag the caption to the middle of the frame: every caption that has no place of its own moves there, the first cue stays at the top.

1. Move the playhead over the cue, so the preview shows its caption.
2. Click the caption: its letters or its background box. The cue is selected, in the **Captions** tab and on the timeline, and the caption gets a gold box with a handle at each corner.
3. In the **Edit** row of **Caption style**, choose what the drag changes: **Selected (1)** changes only this cue; **All cues** changes the track's style, so every caption without a place or size of its own follows.
4. Drag the caption, a corner handle, or press the arrow keys:

| To | Do this | Step in the history |
| --- | --- | --- |
| Move the caption | Drag it. It snaps to the frame, the thirds, the safe areas and other layers, with gold guides, as a layer does. The readout next to the pointer shows the **X** and **Y** it will get, for example **X 0 · Y -540**. When you release, **Position** becomes **Custom** at that place. | **Move caption** (**Selected**), **Move captions** (**All cues**) |
| Change its font size | Drag a corner handle. The caption keeps the edge it sits on: a **Bottom** caption grows upward, a **Top** caption downward. The readout shows the size, for example **96 px**. From 1 to 2000 px. Corner handles don't snap. | **Resize caption**, **Resize captions** |
| Nudge it | Press <kbd>←</kbd>, <kbd>→</kbd>, <kbd>↑</kbd> or <kbd>↓</kbd> for 1 pixel, with <kbd>Shift</kbd> for 10 pixels, while the Preview panel is active. Presses less than 0.3 seconds apart are one step. A nudge also sets **Custom**. | **Nudge caption**, **Nudge captions** |
| Type its text | Double-click it. See [Type a cue's text in the preview](#type-a-cues-text-in-the-preview). | **Edit caption** |
| Cancel a drag | Press <kbd>Esc</kbd> before you release. | None |

Good to know:

- **All cues and a cue's own place.** With **All cues**, the dragged cue gives up its own place (or its own size, for a corner drag) and follows the track from then on. Other cues with a place of their own stay where they are.
- **Whole pixels.** A moved caption lands on whole pixels of the frame. Snapping works as for pictures; see [Snapping and smart guides in the preview](snapping-and-smart-guides.md).
- **Only moves and sizes.** A caption has no side handles and can't be rotated, scaled or cropped. Its corner handles change only the font size.
- **On top.** The caption is always the top layer, so a click on it selects its cue rather than the picture under it. To select the picture underneath, <kbd>Alt</kbd>+click. Other layers snap to the caption, too.
- **With other layers.** When you select a caption together with other layers, for example with <kbd>Shift</kbd>+click, it is outlined but doesn't move with them. Select it alone to drag it.
- **Locked or hidden.** A caption on a locked **CC** track can't be selected in the preview; one on a hidden track isn't drawn.

## Type a cue's text in the preview

1. Double-click the caption in the preview. A caret appears where you clicked, and the cue's text is ready for typing, as in a title. See [Edit text in the preview](titles-and-text.md#edit-text-in-the-preview).
2. Type. The caption keeps its place and style, and a long text wraps and shrinks to fit **Max lines** as it will show.
3. Press <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, or click elsewhere, to finish. What you typed is kept, in one step, **Edit caption**.

- <kbd>Enter</kbd> starts a new line in the cue; it doesn't split the cue. To split it, use <kbd>Enter</kbd> in the cue's text in the **Captions** tab, or <kbd>Ctrl</kbd>+<kbd>K</kbd>. See [Split and merge cues](#split-and-merge-cues).
- While you type, the spoken word isn't highlighted.

## Highlight the spoken word

> **Video placeholder: Highlight the spoken word**
> - File: `videos/captions/word-highlight.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. A project with a talking-head video. Import a VTT file whose cues have karaoke times, such as `Never <00:00:00.700>drink <00:00:01.200>liquid nitrogen`.
>   2. Press <kbd>Space</kbd>: each word turns yellow as it is spoken, while the other words stay white.
>   3. Select the **CC** track. In **Caption style**, click **Box**: a yellow box sits behind the spoken word. Click **Scale**: the spoken word grows. Click **Both**: it is yellow and larger.
>   4. Click the **Active** swatch and pick a green: the highlight turns green.

When a cue has word timings, the caption highlights the word being spoken. Word timings come from a transcription (see [Transcription](transcription.md)) and from VTT files with karaoke times inside the cues (see [Import an SRT or VTT file](#import-an-srt-or-vtt-file)).

Choose the look in the **Highlight** row of **Caption style**:

| Chip | Tooltip | The spoken word |
| --- | --- | --- |
| **None** | **No word highlight** | Not highlighted: the whole cue shows in its text color |
| **Color** | **The spoken word in the highlight color** | Takes the **Active** color |
| **Box** | **A box in the highlight color behind the spoken word** | Keeps its text color, on a box in the **Active** color |
| **Scale** | **The spoken word grows** | Grows to 1.15 times its size |
| **Both** | **The spoken word in the highlight color, grown** | Takes the **Active** color and grows to 1.15 times its size |

- With **Color**, **Box**, **Scale** or **Both**, the other words take the **Other words** color. The defaults are a warm yellow for **Active** and white for **Other words**.
- A cue with its own **Highlight**, **Active** or **Other words** highlights its words its own way, in the preview and in the export; the other cues use the track's. Set them with **Selected** in the **Edit** row, or with a preset. See [Give single cues their own style](#give-single-cues-their-own-style).
- Between two words, nothing is highlighted. While you type in a cue, its highlight pauses until you finish.
- Cues without word timings show in their text color, whatever the **Highlight** row says. The hint under the row reminds you: **Shows on cues with word timings (VTT karaoke, transcription).** With **None**, it reads **Off: cues show in the text color.**
- Word timings move with their cue. A split shares them between the two cues, and a trim keeps them: trim the start back out and the words are there again.

> **Note:** The highlight box is a pill: its ends are rounded by half its height.

## Give captions the look of a preset

You can give your captions the style of any text preset, such as **Neon glow** or **Caption bold**. The **Captions** set of the preset bar has ten looks made for captions, several with a word highlight.

1. Select what the preset should style, and no title or subtitle:
   - the **CC** track (click its header) for all the captions;
   - one or more cues (in the **Captions** tab, on the timeline or in the preview) for those cues only.
2. Point at the buttons of the preset bar above the preview (choose **Captions** in its set menu for the caption looks), or at the cards in the **Presets** tab of the Media panel: the captions in the preview take each look while the pointer is on it.
3. Click the one you want, or press <kbd>Alt</kbd>+<kbd>1</kbd> to <kbd>Alt</kbd>+<kbd>9</kbd> for the first nine buttons of the bar. Or right-click it and choose **Apply to captions**.

On the **CC** track:

- The captions take the preset's font, size, colors, outline, shadow and background box.
- A preset with a word highlight, such as **Yellow word**, **Boxed word**, **Big centered**, **Green karaoke**, **Pop word**, **Comic caption** or **Boxed line**, also sets **Highlight**, **Active** and **Other words**. Other presets keep the highlight the captions have.
- The captions keep their **Position**, **Max width** and **Max lines**. The preset's box width, position and animations are not used.

On selected cues:

- The cues get the preset's look as a style of their own: its font, size, colors, outline, shadow and background box, and its word highlight when it has one. The other cues keep the track's look.
- A preset with **Apply position** on also puts the cues at the preset's place, as **Custom**. See [Place text with a preset (Apply position)](text-presets.md#place-text-with-a-preset-apply-position).
- The **Edit** row doesn't matter here: a preset always styles the selected cues, not the track.
- **Reset to track style** gives them the track's look back. See [Give single cues their own style](#give-single-cues-their-own-style).

Either way, the step is named after the preset, for example **Apply "Neon glow" to captions**.

See [Style your captions from the bar](preset-bar.md#style-your-captions-from-the-bar) and [Text presets](text-presets.md).

## Copy a cue's style to other cues

**With the cue menu:**

1. Right-click the cue whose look you want, in the **Captions** tab or on the timeline, and choose **Copy style**.
2. Select the cues that should look the same.
3. Right-click one of them and choose **Paste style**. They all get the copied style, in one step, **Paste caption style**.

- **Copy style** takes the selected cue's own style, or, with several cues selected, the style of the one you selected last. When that cue has no style of its own, **Paste style** gives the cues the track's look back.
- The copied style stays until you reload the page. It isn't put on the system clipboard, so <kbd>Ctrl</kbd>+<kbd>V</kbd> doesn't paste it.

**With Paste attributes:** copy a cue with <kbd>Ctrl</kbd>+<kbd>C</kbd> on the timeline, select other cues, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> and keep **Caption style** checked. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes).

## Export an SRT or VTT file

1. In the **Captions** tab, click **Export SRT or VTT**. It is dimmed while there are no cues.
2. The save dialog suggests the project's name with `.srt`. To save a VTT file, choose **WebVTT subtitles** as the type, or end the name with `.vtt`.
3. Click **Save**. A message says **Exported** with the file name and the number of cues. If the file can't be written, the message **Couldn't export the captions** appears instead: save to another folder.

What the file holds:

- The cues in order, with their times to the millisecond and their lines.
- An SRT file numbers its cues; a VTT file starts with `WEBVTT`.
- Empty cues are left out, and so are the style and the word timings.

Use the file to upload captions to a platform separately from the video, or to edit them in another app and import them again.

> **Tip:** **Export SRT or VTT** always saves every cue. To save only the cues of the in/out range, timed from its start so they match a video of that range, use **Export captions** in the **Extras** section of the **Export** tab. See [Export a frame, the sound or the captions](exporting-video.md#export-a-frame-the-sound-or-the-captions).

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
| **Transcribe captions** | **Add N captions** or **Replace N cues** in the review of a transcription (it also adds the track when there was none) |
| **Edit caption** | Typing in a cue, from the first key to leaving the field, in the **Captions** tab or in the preview |
| **Split cue**, **Merge cues** | <kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> and **Merge with previous cue** |
| **Clear captions** | **Clear all cues** |
| **Caption position**, **Move captions**, **Change caption width**, **Change caption lines** | **Position**, **X** and **Y** of **Offset**, **Max width** and **Max lines** |
| **Word highlight**, **Change highlight color** | **Highlight**, **Active** and **Other words** |
| **Change font size**, **Add stroke** and the other text style steps | The text style rows, as in [Undo text changes](titles-and-text.md#undo-text-changes) |
| **Reset size to track style** and the other **Reset … to track style** steps | A row's dot with **Selected** in the **Edit** row |
| **Reset to track style** | **Reset to track style** in the section, the cue menu or the command palette |
| **Paste caption style** | **Paste style** |
| **Move caption**, **Move captions** | Dragging a caption in the preview (one cue, or the track with **All cues**) |
| **Resize caption**, **Resize captions** | Dragging a caption's corner handle |
| **Nudge caption**, **Nudge captions** | The arrow keys with a caption selected in the preview |
| **Apply "Neon glow" to captions** (with the preset's name) | A preset card or a preset bar button (or <kbd>Alt</kbd> and a number) with the **CC** track or cues selected |
| **Paste attributes** | **Paste attributes** with **Caption style** checked |
| **Move clip**, **Trim clip**, **Split clip**, **Delete clip**, **Paste**, **Cut** and the other clip steps | Edits of cues on the timeline |

## What is not available yet

These parts are available in a later version:

- Several fonts or colors inside one cue (apart from the spoken word's highlight).

## Related pages
- [Exporting your video](exporting-video.md)
- [Transcription](transcription.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Titles and text](titles-and-text.md)
- [Text presets](text-presets.md)
- [The preset bar](preset-bar.md)
- [Tracks](tracks.md)
- [Timeline](timeline.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Editing properties](editing-properties.md)
- [Preview zoom, overlays and fullscreen](preview-zoom-overlays-fullscreen.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 53, 2026-10-19</sub>
