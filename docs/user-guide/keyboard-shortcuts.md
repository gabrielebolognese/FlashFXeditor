# Keyboard shortcuts

This page lists every keyboard shortcut that works in the current version of Shorts Editor, grouped by area. Use it to play and navigate your edit without the mouse, and to learn which panel a shortcut needs.

> **Video placeholder: Keyboard shortcuts in action**
> - File: `videos/keyboard-shortcuts/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. Click the timeline. Press <kbd>Space</kbd> to play and again to pause.
>   2. Press <kbd>L</kbd> twice (2x), then <kbd>K</kbd>.
>   3. Hold <kbd>→</kbd>: the playhead steps, then repeats quickly. Release it.
>   4. Press <kbd>↓</kbd> twice to jump to the next clip edges, then <kbd>Home</kbd> and <kbd>End</kbd>.
>   5. Press <kbd>=</kbd> twice and <kbd>\</kbd> to zoom the timeline in and back to fit.
>   6. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>: the **Loop playback** button turns on.
>   7. Click a clip in the timeline and press <kbd>Alt</kbd>+<kbd>Right</kbd> three times: the clip moves 3 frames. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once: it is back.
>   8. Press <kbd>Ctrl</kbd>+<kbd>A</kbd> to select all clips, then <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>.
>   9. Press <kbd>S</kbd>: the **Snap** magnet in the timeline toolbar turns off. Drag a clip and hold <kbd>S</kbd>: it snaps to the next clip edge. Release the mouse button, then press <kbd>S</kbd> to turn snapping back on.
>   10. Press <kbd>Space</kbd> to play. In the middle of a clip, press <kbd>Q</kbd>: the clip loses its beginning up to the playhead and playback goes on. Press <kbd>W</kbd> a little later: the rest of the clip is removed. Press <kbd>Space</kbd> to pause.
>   11. Click a clip, click in the ruler a little past its end, and press <kbd>E</kbd>: the clip's end moves to the playhead.
>   12. Click in the ruler in the middle of a clip and press <kbd>Ctrl</kbd>+<kbd>K</kbd>: the clip splits at the playhead. Click the right part and press <kbd>Shift</kbd>+<kbd>Delete</kbd>: it disappears and the later clips move left. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice.
>   13. Click a clip, press <kbd>Delete</kbd>, click the gap it leaves and press <kbd>G</kbd>: the gap closes. Press <kbd>F2</kbd> on another clip, type a name and press <kbd>Enter</kbd>.
>   14. Press <kbd>Y</kbd>: the **Slip** tool turns gold. Press <kbd>U</kbd> for **Slide**, <kbd>R</kbd> for **Rate stretch** and <kbd>C</kbd> for **Razor**, then <kbd>V</kbd> to go back to **Select**.
>   15. Zoom in, scroll the playhead out of view, and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd>: the view centers on the playhead.
>   16. Click a video with sound and press <kbd>Ctrl</kbd>+<kbd>L</kbd> to unlink its sound, then <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Press <kbd>Shift</kbd>+<kbd>S</kbd>: the **Linked selection** button turns off; press it again.
>   17. Click the V1 track header and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Up</kbd>: the row gets taller. Press <kbd>F2</kbd>, type a name and press <kbd>Enter</kbd>.
>   18. Click a card in the Media panel, press <kbd>F2</kbd>, type a new name and press <kbd>Enter</kbd>.
>   19. Hover over **Play** to show the tooltip with its shortcut.

## In this page
- [How shortcuts work](#how-shortcuts-work)
- [Playback and navigation](#playback-and-navigation)
- [Timeline](#timeline)
- [Trimming](#trimming)
- [Cutting and deleting](#cutting-and-deleting)
- [Tracks, links and groups](#tracks-links-and-groups)
- [Tools](#tools)
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
| Jump to the previous or next edit point (a clip start or end on any track) | <kbd>↑</kbd> or <kbd>↓</kbd> | <kbd>↑</kbd> or <kbd>↓</kbd> |
| Jump to the previous or next marker | <kbd>Shift</kbd>+<kbd>↑</kbd> or <kbd>Shift</kbd>+<kbd>↓</kbd> | <kbd>⇧</kbd>+<kbd>↑</kbd> or <kbd>⇧</kbd>+<kbd>↓</kbd> |
| Zoom in | <kbd>=</kbd> | <kbd>=</kbd> |
| Zoom out | <kbd>-</kbd> | <kbd>-</kbd> |
| Zoom to fit the whole content | <kbd>\</kbd> | <kbd>\</kbd> |
| Center the view on the playhead | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>.</kbd> |
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
| Clear the selection (also selected tracks, an edit point or a gap) | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>A</kbd> | Timeline, Preview |
| Cancel a clip drag, a trim, a roll, slip, slide or rate stretch, or a selection rectangle | <kbd>Escape</kbd> (before you release the mouse button) | <kbd>Esc</kbd> | All panels |

### Snapping

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Turn snapping on or off (same as **Snap** in the timeline toolbar) | <kbd>S</kbd> | <kbd>S</kbd> | All panels |
| Do the opposite of the snapping setting while you hold the key | Hold <kbd>S</kbd> during a clip drag or a drag in the ruler | Hold <kbd>S</kbd> during a clip drag or a drag in the ruler | Timeline |
| Snap the playhead to clip edges | Hold <kbd>Shift</kbd> while you click or drag in the ruler | Hold <kbd>⇧</kbd> while you click or drag in the ruler | Timeline |

- Press <kbd>S</kbd> after the drag has started to switch snapping for that drag only. Holding it does not change the setting or the **Snap** magnet.
- During a drag, <kbd>S</kbd> never starts a shortcut, also together with <kbd>Shift</kbd>, <kbd>Ctrl</kbd> or <kbd>Alt</kbd>: <kbd>Ctrl</kbd>+<kbd>S</kbd> does not save until you release the mouse button. On a Mac, <kbd>⌥</kbd>+<kbd>S</kbd> during a duplicate drag switches snapping too.

See [Snap clips into place](timeline.md#snap-clips-into-place).

## Trimming

See [Trimming clips](trimming.md).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Ripple trim the start of the clip under the playhead to the playhead | <kbd>Q</kbd> | <kbd>Q</kbd> | All panels |
| Ripple trim the end of the clip under the playhead to the playhead | <kbd>W</kbd> | <kbd>W</kbd> | All panels |
| Extend edit: move the nearest edge of the selected clip to the playhead | <kbd>E</kbd> | <kbd>E</kbd> | Timeline |
| Ripple the trim you are dragging | Hold <kbd>Ctrl</kbd> while you drag a clip edge | Hold <kbd>⌘</kbd> while you drag a clip edge | Timeline |
| Trim only the clip you drag, without its linked clips | Hold <kbd>Alt</kbd> while you drag a clip edge | Hold <kbd>⌥</kbd> while you drag a clip edge | Timeline |
| Roll the cut between two clips (**Select** tool) | Hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> over the cut, then drag | Hold <kbd>⌘</kbd>+<kbd>⌥</kbd> over the cut, then drag | Timeline |
| Slip, slide or stretch only the clip you drag, without its linked clips | Hold <kbd>Alt</kbd> while you drag | Hold <kbd>⌥</kbd> while you drag | Timeline |

- <kbd>Q</kbd> and <kbd>W</kbd> work while the video plays: playback goes on. Each press is one undo step.
- When a limit stops <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd> short of the playhead, the clip is trimmed as far as it can go and a message says why.
- **Ripple mode** in the timeline toolbar has no shortcut. While it is on, every edge drag ripples without <kbd>Ctrl</kbd>.
- Rolls, slips, slides and rate stretches never ripple. See [Advanced trimming](advanced-trimming.md).

## Cutting and deleting

See [Splitting, deleting and closing gaps](splitting-and-deleting.md).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Split at the playhead: the selected clips, or every clip under it when nothing is selected | <kbd>Ctrl</kbd>+<kbd>K</kbd> | <kbd>⌘</kbd>+<kbd>K</kbd> | All panels |
| Split every clip under the playhead, on all tracks | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>K</kbd> | All panels |
| Delete the selected clips and leave gaps (with a gap selected: close it) | <kbd>Delete</kbd> or <kbd>Backspace</kbd> | <kbd>Delete</kbd> (⌫) | Timeline, Preview |
| Ripple delete the selected clips (with a gap selected: close it) | <kbd>Shift</kbd>+<kbd>Delete</kbd> or <kbd>Shift</kbd>+<kbd>Backspace</kbd> | <kbd>⇧</kbd>+<kbd>Delete</kbd> (⌫) | Timeline, Preview |
| Close the selected gap, or the gap at the playhead | <kbd>G</kbd> | <kbd>G</kbd> | Timeline |
| Close all gaps (compact) | <kbd>Shift</kbd>+<kbd>G</kbd> | <kbd>⇧</kbd>+<kbd>G</kbd> | Timeline |
| Rename the selected clip or track | <kbd>F2</kbd> | <kbd>F2</kbd> | Timeline |

- Each of these edits is one undo step.
- Deleting a clip also deletes its linked clips, for example a video's sound.
- In the Media panel, <kbd>Delete</kbd>, <kbd>Backspace</kbd> and <kbd>F2</kbd> work on media instead. See [Media panel](#media-panel).
- The clip and gap menus (right-click) show these shortcuts next to their rows. <kbd>Escape</kbd> closes a menu.
- Clips on locked tracks are never split or deleted. <kbd>Ctrl</kbd>+<kbd>K</kbd> with nothing selected and <kbd>G</kbd> with no gap selected act on the targeted tracks; <kbd>Shift</kbd>+<kbd>G</kbd> acts on the selected tracks, or on the targeted tracks when no track is selected. See [Tracks](tracks.md).

## Tracks, links and groups

See [Tracks](tracks.md) and [Linking and grouping clips](links-and-groups.md).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| Turn **Linked selection** on or off | <kbd>Shift</kbd>+<kbd>S</kbd> | <kbd>⇧</kbd>+<kbd>S</kbd> | All panels |
| Unlink the selected clips, or link them | <kbd>Ctrl</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>L</kbd> | Timeline |
| Group the selected clips | <kbd>Ctrl</kbd>+<kbd>G</kbd> | <kbd>⌘</kbd>+<kbd>G</kbd> | Timeline |
| Ungroup the selected clips | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>G</kbd> | Timeline |
| Make tracks one size taller (L wraps to S) | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>↑</kbd> | Timeline |
| Make tracks one size shorter (S wraps to L) | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>↓</kbd> | Timeline |
| Rename the selected track | <kbd>F2</kbd> | <kbd>F2</kbd> | Timeline |

- Each link, unlink, group and ungroup is one undo step. Changing a track's height is not a step in the history.
- <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> change the selected tracks; with no track selected, the tracks of the selected clips; with nothing selected, every track.
- The track header toggles (target, lock, mute, solo, hide, height) and **Move into sync** have no keyboard shortcut: click them.

## Tools

The tool decides what a drag on a clip does. The active tool's button in the timeline toolbar is gold. See [Choose a tool](advanced-trimming.md#choose-a-tool).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| **Select** tool: move and trim clips | <kbd>V</kbd> | <kbd>V</kbd> | All panels |
| **Slip** tool: change the part of the media a clip shows | <kbd>Y</kbd> | <kbd>Y</kbd> | All panels |
| **Slide** tool: move a clip between its neighbors | <kbd>U</kbd> | <kbd>U</kbd> | All panels |
| **Rate stretch** tool: change a clip's speed by dragging its edge | <kbd>R</kbd> | <kbd>R</kbd> | All panels |
| **Razor** tool: cut clips where you click | <kbd>C</kbd> | <kbd>C</kbd> | All panels |

The tool stays active until you choose another one, and each project remembers it.

## Audio

The **Master volume** knob in the transport bar under the preview takes these keys while it has the keyboard focus. Clicking or dragging the knob does not focus it: press <kbd>Tab</kbd> until it is focused. While it has the focus, these keys change the listening volume instead of doing their usual action. See [Audio](audio.md#set-the-listening-volume).

| Action | Windows | macOS | Works in |
| --- | --- | --- | --- |
| 1 dB louder | <kbd>↑</kbd> or <kbd>→</kbd> | <kbd>↑</kbd> or <kbd>→</kbd> | **Master volume** knob, focused |
| 1 dB quieter | <kbd>↓</kbd> or <kbd>←</kbd> | <kbd>↓</kbd> or <kbd>←</kbd> | **Master volume** knob, focused |
| 10 dB louder or quieter | <kbd>Page Up</kbd> or <kbd>Page Down</kbd> | <kbd>Fn</kbd>+<kbd>↑</kbd> or <kbd>Fn</kbd>+<kbd>↓</kbd> | **Master volume** knob, focused |
| Quietest (-60.0 dB) | <kbd>Home</kbd> | <kbd>Fn</kbd>+<kbd>←</kbd> | **Master volume** knob, focused |
| Loudest (0.0 dB) | <kbd>End</kbd> | <kbd>Fn</kbd>+<kbd>→</kbd> | **Master volume** knob, focused |

**Mute** and the toggles in the track headers have no keyboard shortcut: click them. Double-clicking the knob resets it to 0.0 dB.

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
| Confirm a field (project name, media name, clip name, timecode, numbers) | <kbd>Enter</kbd> | <kbd>Return</kbd> |
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
| Trim a clip | Drag its start or end (the outer 8 pixels) | Drag its start or end (the outer 8 pixels) |
| Ripple trim, moving the later clips with the edge | <kbd>Ctrl</kbd>+drag a clip edge | <kbd>⌘</kbd>+drag a clip edge |
| Trim one side of a linked pair | <kbd>Alt</kbd>+drag a clip edge | <kbd>⌥</kbd>+drag a clip edge |
| Roll the cut between two clips | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+drag on the cut | <kbd>⌘</kbd>+<kbd>⌥</kbd>+drag on the cut |
| Select a cut (both sides) | Click right on the cut | Click right on the cut |
| Select one side of a cut | <kbd>Ctrl</kbd>+click that side of the cut | <kbd>⌘</kbd>+click that side of the cut |
| Slip, slide or rate stretch a clip | With the **Slip**, **Slide** or **Rate stretch** tool, drag the clip (rate stretch: its start or end) | Same |
| Cut a clip and its linked clips | With the **Razor** tool, click the clip | Same |
| Cut every track at that frame | With the **Razor** tool, <kbd>Shift</kbd>+click in the tracks | With the **Razor** tool, <kbd>⇧</kbd>+click in the tracks |
| Select a gap | Click the empty space between two clips | Click the empty space between two clips |
| Open the clip, gap or track menu | Right-click the clip, gap or track header | Right-click the clip, gap or track header |
| Select a track | Click its header | Click its header |
| Add a track to the selection, or remove it | <kbd>Shift</kbd>+click or <kbd>Ctrl</kbd>+click its header | <kbd>⇧</kbd>+click or <kbd>⌘</kbd>+click its header |
| Select all clips on a track | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click its header | <kbd>⌘</kbd>+<kbd>⇧</kbd>+click its header |
| Rename a track | Double-click its name | Double-click its name |
| Reorder a track | Drag its header up or down | Drag its header up or down |
| Switch snapping for this drag | Hold <kbd>S</kbd> while you drag | Hold <kbd>S</kbd> while you drag |
| Snap the playhead to clip edges | <kbd>Shift</kbd>+click or <kbd>Shift</kbd>+drag in the ruler | <kbd>⇧</kbd>+click or <kbd>⇧</kbd>+drag in the ruler |

While you drag clips or a clip edge, you can press and release <kbd>Shift</kbd>, <kbd>Ctrl</kbd>, <kbd>Alt</kbd> and <kbd>S</kbd>: the keys held when you release the mouse button decide the drop or the trim. A roll is the exception: hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> when you press on the cut; after that, the keys no longer matter. See [Move clips](timeline.md#move-clips) and [Trimming clips](trimming.md).

Double-click a media item in the Media panel to insert it at the playhead. See [Importing media](importing-media.md).

## Keys the browser keeps

In a normal browser tab, the browser keeps some shortcuts for itself, and a web page cannot use them:

| Keys (macOS) | What the browser does |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> (<kbd>⌘</kbd>+<kbd>N</kbd>) | Opens a new browser window. |
| <kbd>Ctrl</kbd>+<kbd>T</kbd> (<kbd>⌘</kbd>+<kbd>T</kbd>) | Opens a new tab. |
| <kbd>Ctrl</kbd>+<kbd>W</kbd> (<kbd>⌘</kbd>+<kbd>W</kbd>) | Closes the tab. |
| <kbd>Alt</kbd>+<kbd>←</kbd> (Windows), outside the Timeline panel | Goes back to the previous page in the tab, if there is one. In the Timeline panel the editor keeps it for nudging clips. |
| <kbd>Ctrl</kbd>+<kbd>L</kbd> (<kbd>⌘</kbd>+<kbd>L</kbd>), outside the Timeline panel | Moves the keyboard to the browser's address bar. In the Timeline panel the editor keeps it for linking clips. |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> (<kbd>⌘</kbd>+<kbd>G</kbd>, <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>G</kbd>), outside the Timeline panel | Search the page. In the Timeline panel the editor keeps them for grouping clips. |

Because of this, <kbd>Ctrl</kbd>+<kbd>N</kbd> opens a new browser window instead of a new project. To create a project, click **New project** on the start screen.

> **Important:** <kbd>Ctrl</kbd>+<kbd>W</kbd> closes the editor's tab. Your project saves automatically, 1 second after your last change by default (the **Autosave** setting in the **Project** section of **Edit Properties**). Before you close the tab, hover over the save dot next to the project name in the app bar and check that it reads "All changes saved".

While you type in a text field, or while a dialog is open, the editor leaves <kbd>Ctrl</kbd>+<kbd>S</kbd> to the browser, which then opens its own "Save as" dialog. Cancel it, leave the field with <kbd>Enter</kbd> or <kbd>Escape</kbd>, and press <kbd>Ctrl</kbd>+<kbd>S</kbd> again.

## Shortcuts for features not available yet

Some buttons already show a shortcut in their tooltip although the button is disabled, for example **Add marker** in the timeline toolbar and **Export** in the app bar. These shortcuts start working when their feature is available in a later version; until then the keys do nothing. In the current version this also applies to:

- <kbd>H</kbd> (the **Hand** tool).
- <kbd>Ctrl</kbd>+<kbd>X</kbd>, <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> in the Timeline and Preview panels (cutting, copying and pasting clips; the **Cut**, **Copy** and **Paste** rows of the clip menu are dimmed).
- The arrow keys and <kbd>Ctrl</kbd>+<kbd>0</kbd>, <kbd>Ctrl</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>2</kbd> in the Preview panel (moving items and zooming the preview). Use the **Zoom** dropdown and the **Fit** button instead.

## Related pages
- [Preview and playback](preview-and-playback.md)
- [Timeline](timeline.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Advanced trimming](advanced-trimming.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Audio](audio.md)
- [Importing media](importing-media.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 16, 2026-10-15</sub>
