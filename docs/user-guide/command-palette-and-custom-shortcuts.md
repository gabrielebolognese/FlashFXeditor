# Command palette and custom shortcuts

Every action in Shorts Editor has a name you can search for and a keyboard shortcut you can change. Use the command palette to run any command by typing part of its name, the shortcut sheet to look up keys, and **Settings** to give commands the keys you are used to from another editor. Menus work with the keyboard too.

> **Video placeholder: Commands and shortcuts in one minute**
> - File: `videos/command-palette-and-custom-shortcuts/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows: a 1080×1920 project with three clips on V1 and a gap between the second and third; click the timeline and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>: the palette opens at the top of the window with **Type a command**; type `compact`: **Close all gaps** is the first row, with **Shift+G** at its right; press <kbd>Enter</kbd>: the palette closes and the gap closes; press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> again: **Close all gaps** is first in the list; press <kbd>Esc</kbd>; press <kbd>?</kbd>: the **Keyboard shortcuts** sheet lists every key by category; click **Edit shortcuts**: **Settings** opens on the **Shortcuts** tab; type `split` in the search field, click **Ctrl+K** on the **Split at playhead** row and press <kbd>Ctrl</kbd>+<kbd>J</kbd>; click **Done**; point at **Split at playhead** in the timeline toolbar: the tooltip shows **Ctrl+J**; press <kbd>Ctrl</kbd>+<kbd>J</kbd>: the clip under the playhead splits; right-click a clip, press <kbd>↓</kbd> twice and <kbd>Enter</kbd>: the clip is copied.

## In this page
- [Run a command from the palette](#run-a-command-from-the-palette)
- [See every shortcut](#see-every-shortcut)
- [Open the shortcut settings](#open-the-shortcut-settings)
- [Change a shortcut](#change-a-shortcut)
- [Add or remove keys](#add-or-remove-keys)
- [Fix a shortcut conflict](#fix-a-shortcut-conflict)
- [Go back to the default keys](#go-back-to-the-default-keys)
- [Share your shortcuts with a keymap file](#share-your-shortcuts-with-a-keymap-file)
- [Use menus with the keyboard](#use-menus-with-the-keyboard)
- [Related pages](#related-pages)

## Run a command from the palette

The command palette lists every command of the editor: the buttons, the menu rows, the shortcuts, and commands that have no button at all.

> **Video placeholder: Find and run a command**
> - File: `videos/command-palette-and-custom-shortcuts/palette.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: click the timeline and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>; type `fade`: rows such as **Fade in 0.5 s** and **Fade out 1 s** appear, each with **Fades and transitions** beside it; type `fade in 1`: **Fade in 1 s** is first; clear the field and type `undo` with nothing to undo: the **Undo** row is grey and the bottom line reads **Undo: not available now**; press <kbd>↓</kbd> and <kbd>↑</kbd> to move the highlight; type `safe reels` and press <kbd>Enter</kbd>: the Reels safe zone appears over the preview.

1. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. The palette opens at the top of the window, with the cursor in **Type a command**.
2. Type part of the name of what you want to do, for example `split` or `fit`. The list keeps the commands that match, best match first.
3. Press <kbd>↓</kbd> or <kbd>↑</kbd> to highlight a row, or point at it.
4. Press <kbd>Enter</kbd>, or click the row. The palette closes and the command runs.

Each row shows the command's icon, its name, its category (for example **Edit** or **Preview**) and its first keyboard shortcut, if it has one. The shortcut is the one you use now, also after you changed it.

**How the search works.**
- Each word you type must appear in the command's name, its category or a related word, in that order. The letters of a word may be spread out: `clg` finds **Close gap**.
- Related words find commands under another name. For example, `compact` finds **Close all gaps**, `mirror` finds the flips, `cheat sheet` finds **Keyboard shortcuts**, and `whisper` finds **Transcribe**.
- With nothing typed, the commands you ran from the palette last come first (up to 12, the latest first), then all the others by category.
- When nothing matches, the list reads **No command matches** with what you typed.

**Where the command runs.** The command runs as if you pressed its key in the panel you were working in before you opened the palette, and the keyboard goes back to that panel. For example, open the palette after you click the preview picture, and the preview's commands act on the selected picture.

**Grey rows.** A grey row can't run now: there is nothing for it to act on, for example **Undo** with nothing to undo, **Edit marker** with no marker selected, or **Remove silence: apply** while the **Remove silence** row is closed. When you highlight it, the line at the bottom of the palette reads, for example, **Edit marker: not available now**. Enter and a click do nothing on it.

| Key | In the palette |
| --- | --- |
| <kbd>↓</kbd> or <kbd>↑</kbd> | Next or previous row (from the last row back to the first) |
| <kbd>Page Down</kbd> or <kbd>Page Up</kbd> | 8 rows down or up |
| <kbd>Enter</kbd> | Run the highlighted command |
| <kbd>Esc</kbd>, or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> again | Close the palette without running anything |

A click outside the palette closes it too.

- The palette doesn't open while you type in a field or while a dialog is open: press <kbd>Enter</kbd> or <kbd>Esc</kbd> first.
- On the start screen, the palette opens too. There, **New project**, **Open project**, **Keyboard shortcuts** and **Settings** work; the other rows are grey until a project is open.
- A few commands are not in the palette because they need something you point at: the rows of a preset card's menu (see [Text presets](text-presets.md)), the ruler menu's **Add marker** at the point you right-clicked, a bin chip's **Rename** and **Delete bin** and the media menu's **Move to bin** (see [Organizing media](organizing-media.md)), and the keys that only work while you edit a text or drag.

The categories, in the order the list shows them, are **Transport**, **Timeline**, **Edit**, **Clipboard**, **Selection**, **Clip**, **Speed**, **Fades and transitions**, **Keyframes**, **Audio**, **Markers and range**, **Tracks**, **Tools**, **Toggles**, **Add**, **Text**, **Captions**, **Presets**, **Canvas**, **Preview**, **Media**, **Project** and **App**.

## See every shortcut

Press <kbd>?</kbd> (<kbd>Shift</kbd>+<kbd>/</kbd> on most keyboards) to open the **Keyboard shortcuts** sheet.

- It lists every command that has a key, by category, in columns. Each row shows the command's name, every key it has, and after a dot where the keys work, for example **Timeline** or **Timeline, Preview**. A row without a place works in every panel.
- It always shows the keys you use now: when you change a key, the sheet shows the new one.
- Click **Edit shortcuts** to change keys in **Settings**. See [Change a shortcut](#change-a-shortcut).
- Click **Done** or press <kbd>Esc</kbd> to close it.

Like the other shortcuts, <kbd>?</kbd> doesn't open the sheet while you type in a field. For the full list with explanations and the macOS keys, see [Keyboard shortcuts](keyboard-shortcuts.md).

## Open the shortcut settings

Do one of these:

- Click **Settings** (the gear) at the right end of the app bar.
- Click **Edit shortcuts** in the **Keyboard shortcuts** sheet.
- Open the command palette and run **Settings**.

The **Settings** dialog opens on its **Shortcuts** tab. Its **Media** tab chooses whether imports copy your files or link to them; see [Copy or link your files](importing-media.md#copy-or-link-your-files). Other settings are available in a later version. Click **Done** or press <kbd>Esc</kbd> to close the dialog; your changes are already in effect.

The tab lists every command you can give a key, by category, with the commands that have no key yet, such as **Remove silence**, **Normalize** or **Add solid**. Each row shows:

| Part | What it shows |
| --- | --- |
| Name | The command, as in the palette and in tooltips. |
| Place | Where its keys work, for example **Timeline**, **Preview** or **Media**. No place: in every panel. |
| Key chips | Each key the command has, for example **Ctrl+K**. |
| **+** (**Add a key**) | Records one more key for the command. |
| **Reset to the default keys** (a circular arrow) | Puts back the command's original keys. Dimmed while it has them. |

At the top of the tab:

- **Search commands or keys**: type part of a name, a category or a key, for example `split` or `ctrl+k`. The list keeps the rows that match. When none does, it reads **No command matches** with what you typed.
- **Default keymap**, or for example **3 changed**: how many commands have keys other than their original ones.
- **Import…**, **Export…** and **Reset all**. See [Share your shortcuts with a keymap file](#share-your-shortcuts-with-a-keymap-file) and [Go back to the default keys](#go-back-to-the-default-keys).

## Change a shortcut

> **Video placeholder: Change a shortcut and fix a conflict**
> - File: `videos/command-palette-and-custom-shortcuts/change-a-shortcut.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: click **Settings** (the gear) at the right of the app bar; in **Search commands or keys** type `split`; on the **Split at playhead** row, click **Ctrl+K**: the chip reads **Press a key…**; press <kbd>Ctrl</kbd>+<kbd>J</kbd>: the chip reads **Ctrl+J** and the top of the tab reads **1 changed**; click **+** on the same row and press <kbd>Ctrl</kbd>+<kbd>L</kbd>: the **Ctrl+L** chip turns red, a red line under the row reads **Ctrl+L is also Link / Unlink (Timeline)**, and the **Link / Unlink** row turns red too; point at the **Ctrl+L** chip and click its **x**: both rows are back to normal; click **Reset all**: **Split at playhead** shows **Ctrl+K** again and the top reads **Default keymap**; click **Done**.

1. Open **Settings** and stay on the **Shortcuts** tab. See [Open the shortcut settings](#open-the-shortcut-settings).
2. Find the command: type part of its name in **Search commands or keys**, or scroll to its category.
3. Click the key you want to replace, for example **Ctrl+K** on **Split at playhead**. The chip reads **Press a key…**.
4. Press the new key, with the modifiers you want, for example <kbd>Ctrl</kbd>+<kbd>J</kbd>. The chip shows the new key.

The new key works at once: in the panels, in the tooltips of the buttons, in the menus, in the palette and in the shortcut sheet. For example, after you give **Split at playhead** <kbd>Ctrl</kbd>+<kbd>J</kbd>, the toolbar's **Split at playhead** tooltip shows **Ctrl+J**, <kbd>Ctrl</kbd>+<kbd>J</kbd> splits, and <kbd>Ctrl</kbd>+<kbd>K</kbd> no longer does.

**While a chip reads Press a key…**
- Pressing only <kbd>Ctrl</kbd>, <kbd>Shift</kbd> or <kbd>Alt</kbd> does nothing yet: hold it and press the rest of the key.
- <kbd>Esc</kbd> cancels and keeps the old key. So does switching to another window. <kbd>Esc</kbd> itself can't be recorded: it always cancels and closes.
- No shortcut runs and the dialog stays open: the key press goes to the chip.

**Which keys you can use.** Letters, digits and symbol keys, <kbd>F1</kbd> to <kbd>F24</kbd>, <kbd>Space</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>, <kbd>Backspace</kbd>, <kbd>Delete</kbd>, <kbd>Insert</kbd>, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Page Up</kbd>, <kbd>Page Down</kbd> and the arrow keys, alone or with <kbd>Ctrl</kbd>, <kbd>Alt</kbd> and <kbd>Shift</kbd>. A symbol you type with <kbd>Shift</kbd> is recorded as the symbol: <kbd>Shift</kbd>+<kbd>/</kbd> on a US keyboard becomes **?**.

> **Important:** Don't press <kbd>Ctrl</kbd>+<kbd>W</kbd>, <kbd>Ctrl</kbd>+<kbd>T</kbd> or <kbd>Ctrl</kbd>+<kbd>N</kbd> while a chip waits for a key. The browser acts on these keys before the editor sees them: <kbd>Ctrl</kbd>+<kbd>W</kbd> closes the editor's tab. See [Keys the browser keeps](keyboard-shortcuts.md#keys-the-browser-keeps).

**Where a new key works.** A command keeps its place: a key you give **Zoom in** works in the Timeline panel, as <kbd>=</kbd> does, and a key you give **Split at playhead** works in every panel. The place shows next to the command's name.

**Where your keys are kept.** The editor keeps your keys in this browser, for all your projects, also after a reload. Changing keys is not a step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> doesn't undo it. To use your keys in another browser or on another computer, export them. See [Share your shortcuts with a keymap file](#share-your-shortcuts-with-a-keymap-file).

On a Mac, the keys show and record with <kbd>⌘</kbd> where Windows uses <kbd>Ctrl</kbd>, and a keymap made on one works on the other.

## Add or remove keys

A command can have more than one key; any of them runs it. For example, **Redo** has <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>+<kbd>Y</kbd>.

- **Add a key:** click **+** (**Add a key**) on the command's row, then press the key. While it waits, **+** reads **Cancel (Esc)**: click it again or press <kbd>Esc</kbd> to stop.
- **Give a command its first key:** commands without a key, such as **Remove silence** or **Add solid**, have only the **+** button. Click it and press a key.
- **Remove a key:** point at the key chip and click its **x** (**Remove this key**). A command with no key left still works from its button, its menu row and the palette.

A command keeps up to 8 keys.

## Fix a shortcut conflict

Two commands conflict when they have the same key and both can see the key press: they work in the same panel, or one works in every panel and the other in one panel.

When you give a command a key that another command already uses, the editor doesn't refuse it. It marks both rows instead:

- The key chip that clashes turns red on both rows.
- A red line under each row names the other command and where it works, for example **Ctrl+L is also Link / Unlink (Timeline)** under **Split at playhead**, and **Ctrl+L is also Split at playhead** under **Link / Unlink**.

To fix it, remove the key from one of the two commands with its **x**, or give that command another key.

Until you fix it, the key runs one of the two commands only. When one of them belongs to a panel, that panel's command wins there and the other command runs in the other panels. When both work in the same place, the command whose keys you changed wins.

Some keys are shared on purpose and are never marked: in the Preview panel, for example, the arrow keys move the selected picture, and step frames when no picture is selected.

## Go back to the default keys

- **One command:** click **Reset to the default keys** (the circular arrow) on its row. The command gets its original keys back, and other commands keep theirs.
- **Every command:** click **Reset all** at the top of the tab. All commands get their original keys back, and the top reads **Default keymap**. **Reset all** is dimmed while nothing is changed.

Neither asks first, and neither can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>. To keep a copy of your keys, export them first.

## Share your shortcuts with a keymap file

A keymap file is a small JSON file with the keys of every command. Use it to back up your keys, to move them to another browser or computer, or to share them with others.

**Export your keys.**
1. In **Settings** > **Shortcuts**, click **Export…**.
2. Choose where to save the file. The name is `shorts-editor-keymap.json` unless you type another one.
3. The message **Keymap exported** names the file.

The file lists every command you can give a key, with its keys, including the ones you didn't change and the commands you left without a key.

**Import keys.**
1. In **Settings** > **Shortcuts**, click **Import…**.
2. Pick a keymap file.
3. The message **Keymap imported** says how many commands it had, for example **Keymap imported: 265 commands**.

Every command in the file takes the file's keys, and every other command goes back to its original keys. Importing a file you exported gives you exactly the keys you had.

| Message | What it means |
| --- | --- |
| **Keymap imported: N commands**, with **N unknown commands or keys skipped.** | The file names commands this version of the editor doesn't have, or keys it can't use. The rest was imported. |
| **Not a keymap file** | The file is not a keymap exported from Shorts Editor. Export one from **Settings** > **Shortcuts** to get one. |
| **Couldn't import the keymap** or **Couldn't export the keymap** | The browser couldn't read or write the file. The message gives the reason. |

## Use menus with the keyboard

> **Video placeholder: Menus with the keyboard**
> - File: `videos/command-palette-and-custom-shortcuts/menus.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: right-click a video clip on the timeline: the menu opens; press <kbd>↓</kbd>: **Cut** looks pointed at; press <kbd>↓</kbd> again and <kbd>Enter</kbd>: the menu closes and the clip is copied; right-click the clip again, press <kbd>↓</kbd> until **0.25 s** in the **Fade in** row looks pointed at, press <kbd>→</kbd> twice to reach **1 s** and press <kbd>Enter</kbd>: the clip fades in over 1 second; click **Zoom** in the Preview header, press <kbd>↓</kbd> to **100%** and <kbd>Enter</kbd>; press <kbd>Space</kbd>: playback starts at once.

While a menu is open, it has the keyboard. This works in every right-click menu (clips, gaps, track headers, the ruler, pictures in the preview, keyframes, media cards, preset cards and caption cue rows) and in the **Zoom**, **Preview quality** and **Overlays** menus of the preview.

| Key | In a menu |
| --- | --- |
| <kbd>↓</kbd> or <kbd>↑</kbd> | Next or previous row. Dimmed rows are skipped, and the last row leads back to the first. |
| <kbd>→</kbd> or <kbd>←</kbd> | Next or previous choice in a row with choices, such as **Fade in** (**0.25 s**, **0.5 s**, **1 s**), **Transition**, **Match project size** (**Fit**, **Fill**) or the **Label** colors |
| <kbd>Home</kbd> or <kbd>End</kbd> | First or last row |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Run the row or choice you moved to |
| <kbd>Esc</kbd> | Close the menu without doing anything |

- The row you move to looks as if you pointed at it.
- Each row shows the key of its command on the right, the one you use now.
- While a menu is open, the other shortcuts don't run: <kbd>Space</kbd> and <kbd>Enter</kbd> work on the menu. When the menu closes, the keyboard goes back to the panel you were in, so <kbd>Space</kbd> plays again right away.

Two more lists work with the arrow keys:

- **The font picker:** in **Search fonts**, press <kbd>↓</kbd> or <kbd>↑</kbd> to highlight a font in the list, and <kbd>Enter</kbd> to pick it. With no font highlighted, <kbd>Enter</kbd> picks the first one that matches. See [Titles and text](titles-and-text.md).
- **The Paste attributes checklist:** press <kbd>↓</kbd> or <kbd>↑</kbd> to move between its rows and buttons, <kbd>Space</kbd> to check or uncheck a row, and <kbd>Enter</kbd> to paste. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes).

## Related pages
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [The workspace](workspace.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Captions](captions.md)
- [Text presets](text-presets.md)
- [Organizing media](organizing-media.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 41, 2026-10-18</sub>
