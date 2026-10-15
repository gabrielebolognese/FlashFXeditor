# Keyboard shortcuts

This page lists every keyboard shortcut that works in the current version of Shorts Editor, grouped by area. Use it to play and navigate your edit without the mouse, and to learn which panel a shortcut needs.

> **Video placeholder: Keyboard shortcuts in action**
> - File: `videos/keyboard-shortcuts/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. Click the timeline. Press <kbd>Space</kbd> to play and again to pause.
>   2. Press <kbd>L</kbd> twice (2x), then <kbd>K</kbd>.
>   3. Hold <kbd>→</kbd>: the playhead steps, then repeats quickly. Release it.
>   4. Press <kbd>↓</kbd> twice to jump to the next clip edges, then <kbd>Home</kbd> and <kbd>End</kbd>.
>   5. Press <kbd>=</kbd> twice and <kbd>\</kbd> to zoom the timeline in and back to fit.
>   6. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>: the **Loop playback** button turns on.
>   7. Click a clip in the timeline and press <kbd>Alt</kbd>+<kbd>Right</kbd> three times: the clip moves 3 frames. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: it is back.
>   8. Press <kbd>Ctrl</kbd>+<kbd>A</kbd> to select all clips, then <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>.
>   9. Click a card in the Media panel, press <kbd>F2</kbd>, type a new name and press <kbd>Enter</kbd>.
>   10. Hover over **Play** to show the tooltip with its shortcut.

## In this page
- [How shortcuts work](#how-shortcuts-work)
- [Playback and navigation](#playback-and-navigation)
- [Timeline](#timeline)
- [Audio](#audio)
- [Media panel](#media-panel)
- [Project and history](#project-and-history)
- [Text fields and dialogs](#text-fields-and-dialogs)
- [Mouse and wheel](#mouse-and-wheel)
- [Keys the browser keeps](#keys-the-browser-keeps)
- [Shortcuts for features not available yet](#shortcuts-for-features-not-available-yet)

## How shortcuts work

**The active panel decides.** The panel you clicked last (or that has the keyboard focus) is the active one: Media, Preview, Timeline or Edit Properties. Clicking the app bar at the top makes no panel active.

- **All panels** shortcuts work wherever you are, also when no panel is active.
- **Panel** shortcuts work only while that panel is active.
- When a panel uses the same key as an all-panels shortcut, the panel wins. For example, the arrow keys step frames everywhere except in the Preview panel, where they are reserved for a later feature.

**Typing comes first.** Shortcuts are off while you type in a text field (a name, the timecode field, a number), while a dropdown such as **Zoom** has focus, and while a dialog is open. Press <kbd>Enter</kbd> or <kbd>Escape</kbd> to leave a text field, or click the preview picture or the timeline to leave a dropdown.

**Icon buttons keep your shortcuts.** Clicking an icon button, such as the transport buttons, **Mute**, **Loop playback** or **Fit**, or dragging the **Master volume** knob, does not take the keyboard focus, so <kbd>Space</kbd> still plays right after.

**Tooltips show shortcuts.** Hover over a button to see its name and shortcut. Tooltips write the arrow keys as Left, Right, Up and Down.

**macOS.** Where this page says <kbd>Ctrl</kbd>, press <kbd>⌘</kbd> (Command) on a Mac; <kbd>Shift</kbd> is <kbd>⇧</kbd>. On a Mac, tooltips show the symbols, for example ⌘⇧L. On a Mac keyboard without <kbd>Home</kbd> and <kbd>End</kbd> keys, press <kbd>Fn</kbd>+<kbd>←</kbd> and <kbd>Fn</kbd>+<kbd>→</kbd>.

**Other keyboard layouts.** Symbol keys such as <kbd>=</kbd>, <kbd>-</kbd> and <kbd>\</kbd> also work through the key in the same position as on a US keyboard, so they work on layouts where the symbol sits elsewhere.

## Playback and navigation

These shortcuts work in all panels, except where noted. See [Preview and playback](preview-and-playback.md) for details.

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Play or pause | <kbd>Space</kbd> | <kbd>Space</kbd> | All panels |
| Play forward; press again for 2x, 4x, 8x | <kbd>L</kbd> | <kbd>L</kbd> | All panels |
| Play backward; press again for 2x, 4x, 8x | <kbd>J</kbd> | <kbd>J</kbd> | All panels |
| Pause | <kbd>K</kbd> | <kbd>K</kbd> | All panels |
| Step one frame forward or back | Hold <kbd>K</kbd>, tap <kbd>L</kbd> or <kbd>J</kbd> | Hold <kbd>K</kbd>, tap <kbd>L</kbd> or <kbd>J</kbd> | All panels |
| Play around the playhead (2 s before to 2 s after, then back) | <kbd>Shift</kbd>+<kbd>K</kbd> | <kbd>⇧</kbd>+<kbd>K</kbd> | All panels |
| Previous or next frame (hold to repeat) | <kbd>←</kbd> or <kbd>→</kbd> | <kbd>←</kbd> or <kbd>→</kbd> | All panels except Preview |
| 5 frames back or forward (hold to repeat) | <kbd>Shift</kbd>+<kbd>←</kbd> or <kbd>Shift</kbd>+<kbd>→</kbd> | <kbd>⇧</kbd>+<kbd>←</kbd> or <kbd>⇧</kbd>+<kbd>→</kbd> | All panels except Preview |
| 1 second back or forward (hold to repeat) | <kbd>Ctrl</kbd>+<kbd>←</kbd> or <kbd>Ctrl</kbd>+<kbd>→</kbd> | <kbd>⌘</kbd>+<kbd>←</kbd> or <kbd>⌘</kbd>+<kbd>→</kbd> | All panels |
| Go to the start | <kbd>Home</kbd> | <kbd>Home</kbd> | All panels |
| Go to the end of the content | <kbd>End</kbd> | <kbd>End</kbd> | All panels |
| Loop playback on or off | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> | All panels |

### Holding keys

- **Arrow keys** (alone, with <kbd>Shift</kbd> or with <kbd>Ctrl</kbd>): one step when you press, then, after 0.3 seconds, about 30 steps per second until you release the key. Each step pauses playback first.
- **<kbd>J</kbd> and <kbd>L</kbd>**: holding them down does not repeat or speed up. Only presses count: press again to double the speed.
- **<kbd>K</kbd>**: holding it keeps playback paused and turns <kbd>J</kbd> and <kbd>L</kbd> into one-frame steps.
- If the browser window loses focus while you hold a key, the editor treats the key as released.

## Timeline

These shortcuts work only while the Timeline panel is active. See [Timeline](timeline.md).

| Action | Windows | macOS |
| --- | --- | --- |
| Jump to the previous or next edit point (a clip start or end) | <kbd>↑</kbd> or <kbd>↓</kbd> | <kbd>↑</kbd> or <kbd>↓</kbd> |
| Jump to the previous or next marker | <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> | <kbd>⇧</kbd>+<kbd>↑</kbd> or <kbd>⇧</kbd>+<kbd>↓</kbd> |
| Zoom in | <kbd>=</kbd> | <kbd>=</kbd> |
| Zoom out | <kbd>-</kbd> | <kbd>-</kbd> |
| Zoom to fit the whole content | <kbd>\</kbd> | <kbd>\</kbd> |
| Nudge the selected clips 1 frame left or right | <kbd>Alt</kbd>+<kbd>←</kbd> or <kbd>Alt</kbd>+<kbd>→</kbd> | <kbd>⌥</kbd>+<kbd>←</kbd> or <kbd>⌥</kbd>+<kbd>→</kbd> |
| Nudge the selected clips 5 frames left or right | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>←</kbd> or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd> | <kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>←</kbd> or <kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>→</kbd> |
| Move the selected clips to the track above or below | <kbd>Alt</kbd>+<kbd>↑</kbd> or <kbd>Alt</kbd>+<kbd>↓</kbd> | <kbd>⌥</kbd>+<kbd>↑</kbd> or <kbd>⌥</kbd>+<kbd>↓</kbd> |

- Zooming with the keys keeps the playhead in place when it is in view; otherwise it zooms around the middle of the view.
- Jumps scroll the timeline by a page when the playhead lands out of view.
- Nudged clips cover what they land on. Hold the keys to keep nudging; nudges less than 0.3 seconds apart are one undo step. See [Nudge clips with the keyboard](timeline.md#nudge-clips-with-the-keyboard).
- <kbd>Alt</kbd>+<kbd>↑</kbd> and <kbd>Alt</kbd>+<kbd>↓</kbd> move clips only to an existing track with room for them; they never create a track.

> **Note:** Adding markers is available in a later version, so the marker jumps have nothing to jump to yet.

### Selecting clips

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Select all clips | <kbd>Ctrl</kbd>+<kbd>A</kbd> | <kbd>⌘</kbd>+<kbd>A</kbd> | Timeline, Preview |
| Clear the selection | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>A</kbd> | Timeline, Preview |
| Cancel a clip drag or a selection rectangle | <kbd>Escape</kbd> (before you release the mouse button) | <kbd>Esc</kbd> | All panels |

## Audio

The **Master volume** knob in the transport bar under the preview takes these keys while it has the keyboard focus. Clicking or dragging the knob does not focus it: press <kbd>Tab</kbd> until it is focused. While it has the focus, these keys change the listening volume instead of doing their usual action. See [Audio](audio.md#set-the-listening-volume).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| 1 dB louder | <kbd>↑</kbd> or <kbd>→</kbd> | <kbd>↑</kbd> or <kbd>→</kbd> | **Master volume** knob, focused |
| 1 dB quieter | <kbd>↓</kbd> or <kbd>←</kbd> | <kbd>↓</kbd> or <kbd>←</kbd> | **Master volume** knob, focused |
| 10 dB louder or quieter | <kbd>Page Up</kbd> or <kbd>Page Down</kbd> | <kbd>Fn</kbd>+<kbd>↑</kbd> or <kbd>Fn</kbd>+<kbd>↓</kbd> | **Master volume** knob, focused |
| Quietest (-60.0 dB) | <kbd>Home</kbd> | <kbd>Fn</kbd>+<kbd>←</kbd> | **Master volume** knob, focused |
| Loudest (0.0 dB) | <kbd>End</kbd> | <kbd>Fn</kbd>+<kbd>→</kbd> | **Master volume** knob, focused |

**Mute** and the **M** and **S** toggles of audio tracks have no keyboard shortcut: click them. Double-clicking the knob resets it to 0.0 dB.

## Media panel

These shortcuts work only while the Media panel is active. See [Importing media](importing-media.md).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Remove the selected media (asks first in the **Remove media** dialog) | <kbd>Delete</kbd> or <kbd>Backspace</kbd> | <kbd>Delete</kbd> (⌫) | Media panel |
| Rename the selected media | <kbd>F2</kbd> | <kbd>F2</kbd> | Media panel |
| Import images from the clipboard | <kbd>Ctrl</kbd>+<kbd>V</kbd> | <kbd>⌘</kbd>+<kbd>V</kbd> | Media panel, or no panel active |

## Project and history

These shortcuts work in all panels.

| Action | Windows | macOS | Notes |
| --- | --- | --- | --- |
| Undo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> | <kbd>⌘</kbd>+<kbd>Z</kbd> | Same as **Undo** in the app bar. |
| Redo | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd> or <kbd>⌘</kbd>+<kbd>Y</kbd> | Same as **Redo** in the app bar. |
| Save now | <kbd>Ctrl</kbd>+<kbd>S</kbd> | <kbd>⌘</kbd>+<kbd>S</kbd> | The project also saves automatically. |
| Open a project folder | <kbd>Ctrl</kbd>+<kbd>O</kbd> | <kbd>⌘</kbd>+<kbd>O</kbd> | Also on the start screen. |
| Import media | <kbd>Ctrl</kbd>+<kbd>I</kbd> | <kbd>⌘</kbd>+<kbd>I</kbd> | While a project is open. |
| New project | <kbd>Ctrl</kbd>+<kbd>N</kbd> | <kbd>⌘</kbd>+<kbd>N</kbd> | Taken by the browser in a normal tab; see [Keys the browser keeps](#keys-the-browser-keeps). |

See [Projects and saving](projects-and-saving.md).

## Text fields and dialogs

| Action | Windows | macOS |
| --- | --- | --- |
| Confirm a field (project name, media name, timecode, numbers) | <kbd>Enter</kbd> | <kbd>Return</kbd> |
| Cancel the change and leave the field | <kbd>Escape</kbd> | <kbd>Esc</kbd> |
| Close a dialog or a menu | <kbd>Escape</kbd> | <kbd>Esc</kbd> |

In the timecode field of the timeline toolbar, <kbd>Enter</kbd> moves the playhead to the time you typed. Besides a full timecode, the field accepts `+30` or `-15` to move by frames and `+2.` to move by seconds. See [Timeline](timeline.md).

## Mouse and wheel

These work over the timeline. See [Timeline](timeline.md).

| Action | Windows | macOS |
| --- | --- | --- |
| Zoom at the pointer | <kbd>Ctrl</kbd>+wheel or <kbd>Alt</kbd>+wheel, or pinch on a touchpad | <kbd>⌘</kbd>+wheel or <kbd>⌥</kbd>+wheel, or pinch on a trackpad |
| Scroll sideways | <kbd>Shift</kbd>+wheel, or swipe sideways on a touchpad | <kbd>⇧</kbd>+wheel, or swipe sideways on a trackpad |
| Scroll the tracks up and down | Wheel | Wheel |
| Select a clip with its linked clips | Click | Click |
| Add a clip (with its linked clips) to the selection, or remove it | <kbd>Shift</kbd>+click | <kbd>⇧</kbd>+click |
| Add or remove only that clip | <kbd>Ctrl</kbd>+click | <kbd>⌘</kbd>+click |
| Select only that clip | <kbd>Alt</kbd>+click | <kbd>⌥</kbd>+click |
| Select the clips a rectangle touches (<kbd>Shift</kbd>: add them) | Drag on empty track space | Drag on empty track space |
| Move the selected clips | Drag a selected clip | Drag a selected clip |
| Move in time only, keeping every clip on its track | <kbd>Shift</kbd>+drag | <kbd>⇧</kbd>+drag |
| Insert the clips, shifting later clips right | <kbd>Ctrl</kbd>+drag | <kbd>⌘</kbd>+drag |
| Duplicate the clips | <kbd>Alt</kbd>+drag | <kbd>⌥</kbd>+drag |
| Duplicate and insert | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+drag | <kbd>⌘</kbd>+<kbd>⌥</kbd>+drag |

While you drag clips, you can press and release <kbd>Shift</kbd>, <kbd>Ctrl</kbd> and <kbd>Alt</kbd>: the keys held when you release the mouse button decide the drop. See [Move clips](timeline.md#move-clips).

Double-click a media item in the Media panel to insert it at the playhead. See [Importing media](importing-media.md).

## Keys the browser keeps

In a normal browser tab, the browser keeps some shortcuts for itself, and a web page cannot use them:

| Keys (macOS) | What the browser does |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> (<kbd>⌘</kbd>+<kbd>N</kbd>) | Opens a new browser window. |
| <kbd>Ctrl</kbd>+<kbd>T</kbd> (<kbd>⌘</kbd>+<kbd>T</kbd>) | Opens a new tab. |
| <kbd>Ctrl</kbd>+<kbd>W</kbd> (<kbd>⌘</kbd>+<kbd>W</kbd>) | Closes the tab. |
| <kbd>Alt</kbd>+<kbd>←</kbd> (Windows), outside the Timeline panel | Goes back to the previous page in the tab, if there is one. In the Timeline panel the editor keeps it for nudging clips. |

Because of this, <kbd>Ctrl</kbd>+<kbd>N</kbd> opens a new browser window instead of a new project. To create a project, click **New project** on the start screen.

> **Important:** <kbd>Ctrl</kbd>+<kbd>W</kbd> closes the editor's tab. Your project saves automatically, 1 second after your last change by default (the **Autosave** setting in the **Project** section of **Edit Properties**). Before you close the tab, hover over the save dot next to the project name in the app bar and check that it reads "All changes saved".

While you type in a text field, or while a dialog is open, the editor leaves <kbd>Ctrl</kbd>+<kbd>S</kbd> to the browser, which then opens its own "Save as" dialog. Cancel it, leave the field with <kbd>Enter</kbd> or <kbd>Escape</kbd>, and press <kbd>Ctrl</kbd>+<kbd>S</kbd> again.

## Shortcuts for features not available yet

Some buttons already show a shortcut in their tooltip although the button is disabled, for example **Split at playhead** in the timeline toolbar and **Export** in the app bar. These shortcuts start working when their feature is available in a later version; until then the keys do nothing. In the current version this also applies to:

- <kbd>Delete</kbd>, <kbd>Backspace</kbd> and <kbd>F2</kbd> in the Timeline and Preview panels (deleting and renaming clips).
- The arrow keys and <kbd>Ctrl</kbd>+<kbd>0</kbd>, <kbd>Ctrl</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>2</kbd> in the Preview panel (moving items and zooming the preview). Use the **Zoom** dropdown and the **Fit** button instead.

## Related pages
- [Preview and playback](preview-and-playback.md)
- [Timeline](timeline.md)
- [Audio](audio.md)
- [Importing media](importing-media.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 11, 2026-10-15</sub>
