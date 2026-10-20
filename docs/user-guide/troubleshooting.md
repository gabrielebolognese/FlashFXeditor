# Troubleshooting

This page helps you when something does not work as expected: the editor does not start in your browser, the preview stays empty, a folder or a file does not open, a clip drag, a trim or a timeline tool does something you did not expect, playback stutters, or you hear no sound. Each problem lists what you see, why it happens and what to do. The last section lists what the current version cannot do yet.

> **Video placeholder: Fix common problems**
> - File: `videos/troubleshooting/overview.mp4` (not recorded yet)
> - Length: about 105 seconds
> - Shows:
>   1. Open the editor in a browser without the required features: the screen "This browser cannot run Shorts Editor" lists what is missing.
>   2. In Chrome, open `chrome://settings/system` and show **Use graphics acceleration when available** turned on.
>   3. Open a project and allow only viewing when the browser asks: the read-only banner appears. Click **Allow editing**, allow editing, and the banner disappears.
>   4. Import a `.webm` file: the message "Can't import ..." with "Unsupported file type" appears.
>   5. Pick a value in the preview **Zoom** dropdown and press <kbd>Space</kbd>: playback does not start. Click the preview picture and press <kbd>Space</kbd> again: playback starts.
>   6. Play a 4K clip and point at **Dropped** in the status strip under the preview.
>   7. Play a clip with sound while **Mute** is on: nothing is heard, but the meter moves. Click **Unmute**: the sound is back.
>   8. Drag a clip near the end of another clip: it jumps onto the edge with a gold line. Hold <kbd>S</kbd> and place it a few frames away instead.
>   9. Click **Ripple mode** in the timeline toolbar so it is gold, and drag the end of a clip to the left: the later clips move too. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and click **Ripple mode** again to turn it off.
>   10. Press <kbd>Y</kbd> and drag a clip: it stays in place while its picture changes. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then <kbd>V</kbd>, and drag the clip again: it moves.

## In this page
- [Browser and graphics](#browser-and-graphics)
  - [The browser cannot run Shorts Editor](#the-browser-cannot-run-shorts-editor)
  - [A WebGPU adapter is missing](#a-webgpu-adapter-is-missing)
  - [The preview goes blank after a graphics reset](#the-preview-goes-blank-after-a-graphics-reset)
- [Keyboard](#keyboard)
  - [Shortcuts do nothing](#shortcuts-do-nothing)
  - [The new project shortcut opens a browser window](#the-new-project-shortcut-opens-a-browser-window)
  - [The save shortcut opens the browser's Save dialog](#the-save-shortcut-opens-the-browsers-save-dialog)
  - [Alt+Left leaves the editor](#altleft-leaves-the-editor)
- [Folders and saving](#folders-and-saving)
  - [The browser asks for access to a folder](#the-browser-asks-for-access-to-a-folder)
  - [The project opens read-only](#the-project-opens-read-only)
  - [A project folder does not open](#a-project-folder-does-not-open)
  - [Changes are not saved](#changes-are-not-saved)
- [Importing](#importing)
  - [A file cannot be imported](#a-file-cannot-be-imported)
  - [A video imports but shows nothing](#a-video-imports-but-shows-nothing)
- [Timeline](#timeline)
  - [A drag copied clips or pushed other clips to the right](#a-drag-copied-clips-or-pushed-other-clips-to-the-right)
  - [A drag cut another clip short or split it](#a-drag-cut-another-clip-short-or-split-it)
  - [A sound clip moved to another audio track](#a-sound-clip-moved-to-another-audio-track)
  - [A clip jumps to an edge while you drag it](#a-clip-jumps-to-an-edge-while-you-drag-it)
  - [Clips no longer snap](#clips-no-longer-snap)
  - [A clip gets shorter when you try to move it](#a-clip-gets-shorter-when-you-try-to-move-it)
  - [A trim moved other clips](#a-trim-moved-other-clips)
  - [A clip edge stops before where you drag it](#a-clip-edge-stops-before-where-you-drag-it)
  - [Linked clips show a red number](#linked-clips-show-a-red-number)
  - [Q, W or E does nothing](#q-w-or-e-does-nothing)
  - [Dragging a clip slips, slides or stretches it](#dragging-a-clip-slips-slides-or-stretches-it)
  - [Ctrl+Alt does not roll the cut](#ctrlalt-does-not-roll-the-cut)
  - [Brackets appear on a cut](#brackets-appear-on-a-cut)
  - [A clip shows a speed badge](#a-clip-shows-a-speed-badge)
- [Playback and preview](#playback-and-preview)
  - [Playback stutters or drops frames](#playback-stutters-or-drops-frames)
  - [The preview shows a nearby frame for a moment](#the-preview-shows-a-nearby-frame-for-a-moment)
  - [Playback has no sound](#playback-has-no-sound)
  - [Sound and picture are out of sync](#sound-and-picture-are-out-of-sync)
  - [The preview shows two pictures side by side](#the-preview-shows-two-pictures-side-by-side)
- [Known limitations](#known-limitations)

## Browser and graphics

### The browser cannot run Shorts Editor

**Symptom:** Instead of the start screen, you see "This browser cannot run Shorts Editor" and a list of missing features.

**Cause:** Shorts Editor runs entirely in your browser and needs features that only desktop Chrome and Edge offer together. If one is missing, the editor does not start; there is no reduced mode. The list can contain:

| Listed feature | What the editor uses it for |
| --- | --- |
| WebGPU (navigator.gpu) | Drawing the preview with your graphics card. |
| WebCodecs VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, VideoFrame, ImageDecoder | Reading and writing video, audio and images. |
| File System Access (showDirectoryPicker) | Opening and saving project folders on your disk. |
| File System Access (showSaveFilePicker) | Saving files such as an exported frame. |
| A WebGPU adapter (a supported GPU with hardware acceleration turned on) | See [A WebGPU adapter is missing](#a-webgpu-adapter-is-missing). |

**Fix:** Open the editor in the current stable version of Google Chrome or Microsoft Edge on a desktop or laptop computer. Update the browser if it is older. Phones and tablets are not supported.

### A WebGPU adapter is missing

**Symptom:** The unsupported screen lists only "A WebGPU adapter (a supported GPU with hardware acceleration turned on)".

**Cause:** Your browser supports WebGPU but cannot use your graphics hardware. Usually hardware acceleration is turned off, or the browser blocks your graphics card or its driver.

**Fix:**
1. In Chrome, open `chrome://settings/system` and turn on **Use graphics acceleration when available**. In Edge, open `edge://settings/system` and turn on the same setting.
2. Relaunch the browser.
3. If the screen still appears, update your graphics driver from your computer or graphics card maker, then relaunch the browser.
4. To check, open `chrome://gpu` (or `edge://gpu`) and look for the WebGPU line under "Graphics Feature Status". It should say that WebGPU is hardware accelerated.

### The preview goes blank after a graphics reset

**Symptom:** The preview goes empty for a moment, for example after a graphics driver update, after the computer wakes from sleep, or when a laptop switches graphics cards.

**Cause:** The browser lost its connection to the graphics card.

**Fix:** Usually nothing: the editor reconnects on its own, typically within a second, and draws the frame again. It keeps trying for about 4 seconds. If the preview stays empty:
1. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save. Saving does not need the graphics card.
2. Reload the page.
3. Open the project again from **Recent projects** on the start screen.

## Keyboard

### Shortcuts do nothing

**Symptom:** <kbd>Space</kbd>, <kbd>J</kbd>, <kbd>K</kbd>, <kbd>L</kbd> or another shortcut does nothing, or <kbd>Space</kbd> opens a dropdown.

**Cause:** One of these:
- A text field has the keyboard focus (the project name, a media name, the timecode field, a number field). Typing always comes before shortcuts.
- A dropdown has the focus, for example the preview **Zoom** dropdown after you chose a level.
- A dialog is open.
- The shortcut belongs to another panel. For example, <kbd>↑</kbd> and <kbd>↓</kbd> jump between clips only in the Timeline panel, and the arrow keys do not step frames when the Preview panel was the last panel you clicked.
- The shortcut belongs to a feature that is available in a later version.

**Fix:** Press <kbd>Enter</kbd> or <kbd>Escape</kbd> to leave a text field, close the dialog, or click the timeline or the preview picture. Then try again. See [Keyboard shortcuts](keyboard-shortcuts.md) for the panel each shortcut needs.

### The new project shortcut opens a browser window

**Symptom:** <kbd>Ctrl</kbd>+<kbd>N</kbd> opens a new, empty browser window instead of a new project.

**Cause:** In a normal browser tab, the browser keeps <kbd>Ctrl</kbd>+<kbd>N</kbd>, <kbd>Ctrl</kbd>+<kbd>T</kbd> and <kbd>Ctrl</kbd>+<kbd>W</kbd> for itself (<kbd>⌘</kbd> on a Mac). A web page never receives them.

**Fix:** Close the extra window. To create a project, click **New project** on the start screen. See [Projects and saving](projects-and-saving.md).

### The save shortcut opens the browser's Save dialog

**Symptom:** <kbd>Ctrl</kbd>+<kbd>S</kbd> opens the browser's own "Save as" dialog for the web page.

**Cause:** A text field had the keyboard focus, or a dialog was open. There the editor leaves the key to the browser.

**Fix:** Cancel the browser's dialog. Press <kbd>Enter</kbd> or <kbd>Escape</kbd> to leave the field, or close the editor's dialog, then press <kbd>Ctrl</kbd>+<kbd>S</kbd> again. Your project also saves automatically after each change.

### Alt+Left leaves the editor

**Symptom:** You pressed <kbd>Alt</kbd>+<kbd>←</kbd> to nudge a clip, and the browser went back to the page you visited before the editor.

**Cause:** <kbd>Alt</kbd>+<kbd>←</kbd> is the browser's Back key on Windows. The editor uses it to nudge clips only while the Timeline panel is active. When another panel was the last one you clicked, the browser gets the key.

**Fix:** Open the editor again and open your project from **Recent projects**. Your project saves automatically, 1 second after each change by default. Before you nudge clips, click the timeline. See [Nudge clips with the keyboard](timeline.md#nudge-clips-with-the-keyboard).

## Timeline

### A drag copied clips or pushed other clips to the right

**Symptom:** After a drag, the original clips are still in place next to copies, or clips on every track moved to the right.

**Cause:** A key was held when you released the mouse button. <kbd>Alt</kbd> copies the clips, and <kbd>Ctrl</kbd> inserts them, which shifts everything after the drop point to the right on every track. The keys count even if you pressed them in the middle of the drag.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the whole drop, then drag again without the key. While you drag, a gold vertical line means an insert. To give up a drag before you release, press <kbd>Esc</kbd>. See [Move clips](timeline.md#move-clips).

### A drag cut another clip short or split it

**Symptom:** After a drop, a clip under the moved clip is shorter, has disappeared, or is now two clips.

**Cause:** A plain drop covers what it lands on. The covered part of the clip underneath is removed: its start or end is cut, a fully covered clip is removed, and a clip covered in the middle is split. The hatching on the ghost showed that part before you released.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to get the clip back. To make room instead of covering, hold <kbd>Ctrl</kbd> when you release. See [What happens to the clips underneath](timeline.md#what-happens-to-the-clips-underneath).

### A sound clip moved to another audio track

**Symptom:** You dragged a video clip up one track, and its sound moved down from A1 to A2 (a new A2 track may have appeared).

**Cause:** A video with sound is a linked pair: the video and its sound move together, by the same number of tracks away from the divider between video and audio tracks.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. To move only the video, <kbd>Alt</kbd>+click it, release, and then drag it. See [Move clips to another track](timeline.md#move-clips-to-another-track).

### A clip jumps to an edge while you drag it

**Symptom:** While you drag a clip, it jumps a few frames onto the edge of another clip, onto the playhead or onto the start of the timeline, and you can't place it just next to that edge.

**Cause:** Snapping. When the start or the end of the dragged clips comes within 8 pixels of one of these targets, the clips jump onto it. A thin gold line through the timeline shows the snap.

**Fix:** Hold <kbd>S</kbd> while you drag to place the clips freely. To turn snapping off, click **Snap** in the timeline toolbar or press <kbd>S</kbd>. Zooming in also helps, because 8 pixels then cover fewer frames. To move a clip by exact frames, select it and nudge it with <kbd>Alt</kbd>+<kbd>Left</kbd> or <kbd>Alt</kbd>+<kbd>Right</kbd>: nudges never snap. See [Snap clips into place](timeline.md#snap-clips-into-place).

### Clips no longer snap

**Symptom:** Dragged clips don't snap to edges or the playhead anymore, and the **Snap** magnet in the timeline toolbar is not gold.

**Cause:** Snapping is off. <kbd>S</kbd> turns it on or off in every panel, not only in the timeline, so a stray <kbd>S</kbd> turns it off. An <kbd>S</kbd> pressed just before you start a drag counts too. Each project keeps its own setting.

**Fix:** Click **Snap** or press <kbd>S</kbd> so that the magnet is gold. To switch snapping for a single drag, press and hold <kbd>S</kbd> after the drag has started. See [Turn snapping on or off](timeline.md#turn-snapping-on-or-off).

> **Note:** If you switch to another window while you hold <kbd>S</kbd> during a drag, the drag keeps the switched snapping until you release the mouse button.

### A clip gets shorter when you try to move it

**Symptom:** You press on a clip and drag, and instead of moving, the clip gets shorter or longer.

**Cause:** You pressed in a trim zone: the outer 8 pixels at either end of a clip. There the cursor is a `[` or `]` bracket, and dragging trims the clip.

**Fix:** Press <kbd>Esc</kbd> before you release, or <kbd>Ctrl</kbd>+<kbd>Z</kbd> after. Then press closer to the middle of the clip, where the cursor is an arrow. To move a short clip, zoom in first. See [Find the edges of a clip](trimming.md#find-the-edges-of-a-clip).

### A trim moved other clips

**Symptom:** You trimmed a clip, and the clips after it moved left or right, on several tracks. Or you dragged the start of a clip and it did not move, while everything after it did.

**Cause:** The trim was a ripple trim. Either **Ripple mode** is on in the timeline toolbar (it is gold), or you held <kbd>Ctrl</kbd> when you released. A ripple trim moves every clip after the edit point, so no gap opens. <kbd>Q</kbd> and <kbd>W</kbd> always ripple.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Click **Ripple mode** to turn it off, and trim again without <kbd>Ctrl</kbd>. See [Trim without leaving a gap (ripple trim)](trimming.md#trim-without-leaving-a-gap-ripple-trim).

### A clip edge stops before where you drag it

**Symptom:** While you trim, roll, slip, slide or stretch, the edge or the clip stops following the pointer.

**Cause:** The trim reached a limit. Check what you see:

| You see | Limit | Fix |
| --- | --- | --- |
| The edge is red, and the tooltip shows **Media start** or **Media end** in red. | The clip starts at the first frame of its media, or ends at the last. | None: the file has no more frames. |
| The clip touches the next or the previous clip. | In a regular trim, clips on a track can't overlap. | Hold <kbd>Ctrl</kbd> for a ripple trim, which moves the next clip along. |
| The edge stopped although nothing is next to the clip. | Its linked clip (for example its sound) reached a limit, or a ripple trim would make clips on another track overlap. | Hold <kbd>Alt</kbd> to trim the clip without its linked clip, or move the clip that blocks the ripple. |
| The clip is 1 frame long. | A clip is at least 1 frame long. | None. |
| The clip starts at `00:00:00`. | Clips can't start before the start of the timeline. | None. |
| During a roll, slip or slide, one end of a clip or one half of the cut is red, and the tooltip shows **Media start** or **Media end** in red. | That clip, or a neighbor of the clip you slide, has no more frames in its media. | None: drag the other way, or use a clip with more media. |
| The tooltip shows **Max speed 4x** or **Min speed 0.25x** in red. | A rate stretch reached its speed limit. | None: speeds go from 0.25x to 4x. |
| A rate stretch stops at the next or the previous clip. | Rate stretches never ripple. | Move the neighboring clip first. |

When <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd> stops short, a message names the limit. See [Know where a trim stops](trimming.md#know-where-a-trim-stops) and [Know where an edit stops](advanced-trimming.md#know-where-an-edit-stops).

### Linked clips show a red number

**Symptom:** A video clip and its sound clip each show a red number, such as **-20** and **+20**, at the right end of their label bar.

**Cause:** The two clips are out of step by that many frames. This happens when you trim one of them with <kbd>Alt</kbd> held, or move one of them on its own after you selected it with <kbd>Alt</kbd>+click.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> until the numbers disappear, or trim or move the other clip by the same number of frames. A command that moves clips back into sync is available in a later version. See [Trim a video without its sound](trimming.md#trim-a-video-without-its-sound).

### Q, W or E does nothing

**Symptom:** You press <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd>, and no clip changes.

**Cause:** One of these:
- <kbd>Q</kbd> and <kbd>W</kbd>: no clip is under the playhead, or the clip under it starts exactly at the playhead, so there is nothing to trim.
- <kbd>E</kbd>: no clip is selected, the playhead is already on the selected clip's start or end, or another panel than the Timeline is active.
- The clip is already at a limit, for example its media start; a message then says so.
- A text field has the keyboard focus.

**Fix:** Move the playhead into the clip, select the clip for <kbd>E</kbd>, and click the timeline before you press the key. See [Trim to the playhead with Q and W](trimming.md#trim-to-the-playhead-with-q-and-w) and [Extend a clip to the playhead with E](trimming.md#extend-a-clip-to-the-playhead-with-e).

### Dragging a clip slips, slides or stretches it

**Symptom:** You drag a clip to move it, but it stays in place while its picture changes, or its neighbors get longer and shorter, or nothing happens. Or dragging its edge changes its speed, and a badge such as `0.5x` appears.

**Cause:** A tool other than **Select** is active: **Slip**, **Slide** or **Rate stretch**. Its button in the timeline toolbar is gold. <kbd>Y</kbd>, <kbd>U</kbd> and <kbd>R</kbd> choose these tools in every panel, so a stray key press switches the tool. Each project remembers its tool.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the edit, then press <kbd>V</kbd> or click **Select**. See [Choose a tool](advanced-trimming.md#choose-a-tool).

### Ctrl+Alt does not roll the cut

**Symptom:** You hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> over a cut, but the cursor does not become `][`, or the drag trims only one clip.

**Cause:** One of these:
- The pointer is more than 3 pixels away from the cut.
- The two clips do not touch: there is a gap between them, even of 1 frame.
- A tool other than **Select** is active.
- You pressed the keys after you started the drag. A roll starts only when <kbd>Ctrl</kbd>+<kbd>Alt</kbd> are held as you press the mouse button.

**Fix:** Press <kbd>Esc</kbd> before you release, or <kbd>Ctrl</kbd>+<kbd>Z</kbd> after. Press <kbd>V</kbd>, zoom in so the cut is easier to hit, hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd>, then press on the cut and drag. To remove a gap, drag the second clip onto the end of the first: it snaps there. See [Roll a cut between two clips](advanced-trimming.md#roll-a-cut-between-two-clips).

### Brackets appear on a cut

**Symptom:** Red brackets `][`, or one gold bracket, appear on a cut, and no clip is selected anymore.

**Cause:** You clicked right on the cut, within 3 pixels of it, without dragging. That selects the cut as an edit point. With <kbd>Ctrl</kbd> held or **Ripple mode** on, the click selects one side of the cut, shown in gold.

**Fix:** Nothing is wrong: the brackets only mark the cut. To clear them, click a clip or an empty part of a track, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>. To select a clip next to a cut, click further inside the clip. See [Select a cut (edit point)](advanced-trimming.md#select-a-cut-edit-point).

### A clip shows a speed badge

**Symptom:** A clip shows a badge such as `0.5x`, `2x` or `1x` in its label bar, and plays faster or slower than its media.

**Cause:** The clip was stretched with **Rate stretch**, which changes its speed. A `1x` badge means the clip was stretched and then dragged back to its old length in a separate drag: its speed is a tiny bit off normal speed. The difference is too small to see or hear.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> until the badge disappears; each stretch is one step. Typing an exact speed is available in a later version. See [Change a clip's speed with Rate stretch](advanced-trimming.md#change-a-clips-speed-with-rate-stretch).

## Folders and saving

### The browser asks for access to a folder

**Symptom:** When you create, open or reopen a project, the browser asks whether Shorts Editor may view or edit the files in the folder.

**Cause:** Your project lives in a folder on your disk, and the browser protects your files: it asks before a web page can read or change a folder. It can ask again in a later session, for example when you reopen a project from **Recent projects**.

**Fix:** Allow the editor to edit the files.
- If you allow only viewing, the project opens read-only. See [The project opens read-only](#the-project-opens-read-only).
- If you deny access or close the prompt, the **Permission needed** dialog appears, for example with "Shorts Editor has no permission to read the folder "My video"." Click **Try again** to see the browser's prompt again, or **Cancel**.

### The project opens read-only

**Symptom:** A banner under the app bar reads "Read-only: Shorts Editor has no permission to write to this folder, so changes are not saved." The save dot next to the project name is gray. Importing shows "This project is read-only" with "Allow editing to import media."

**Cause:** The browser gave the editor permission to read the project folder, but not to write to it.

**Fix:**
1. Click **Allow editing** in the banner (or click the save dot).
2. When the browser asks, allow the editor to edit the files.

The banner disappears and the editor saves the changes you made in the meantime. If the browser does not ask, check the site's permissions in the browser (the icon at the left of the address bar) and try again.

### A project folder does not open

**Symptom:** A dialog titled "Could not open the project" (or "Could not create the project") appears. Find its message in this table:

| Message | Cause | Fix |
| --- | --- | --- |
| The folder "*name*" has no project.json. Pick a project folder, or create a new project. | You picked a folder that is not a Shorts Editor project, or a folder inside one (such as its `media` folder). | Pick the folder that contains `project.json`, or click **New project**. |
| The project in "*name*" could not be read. ... | The `project.json` file is damaged, or was edited by hand. The dialog lists the problems it found. | Restore a backup (see below). |
| The stored folder of "*name*" is not usable any more. Remove it and open the folder again. | A **Recent projects** entry points to a folder the browser can no longer use. | Click **Remove from recent projects** (the X on the row), then click **Open project** and pick the folder. |
| The folder "*name*" already contains a project. Open it instead, or pick an empty folder. | You chose **New project** with a folder that already has a project. | Open it with **Open project**, or pick an empty folder. |
| Shorts Editor has no permission to write to the folder "*name*". | The browser did not allow edits to the folder you picked for a new project. | Try again and allow editing, or pick another folder. |
| Drop the folder that contains project.json, not single files. (title "Drop a project folder") | You dropped files on the start screen instead of a project folder. | Drop the project folder itself. |

**Restore a backup of project.json:** Each save keeps the previous version in the project's `history` folder, up to the 20 most recent. The files are named by date and time in UTC, for example `project-20261015-143000.json`.
1. Copy the damaged `project.json` somewhere safe.
2. Copy the newest file from `history` into the project folder and rename it `project.json`.
3. Open the folder again.

See [Projects and saving](projects-and-saving.md).

### Changes are not saved

**Symptom:** The save dot next to the project name turns red, and its tooltip reads "Save failed: ..." with a reason and "Click to retry".

**Cause:** The editor could not write to the project folder, for example because the folder was moved, renamed or deleted while open, the drive was disconnected, or the disk is full.

**Fix:** Solve the cause (reconnect the drive, free disk space, put the folder back), then click the save dot or press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save again.

## Importing

### A file cannot be imported

**Symptom:** A message "Can't import *file name*" appears with a reason, or "Can't import *N* files" with one reason per file. Other files of the same import are added normally.

**Cause and fix:** It depends on the reason.

| Reason | Cause | Fix |
| --- | --- | --- |
| Unsupported file type | The file type is not supported. The editor imports video `.mp4`, `.mov`, `.m4v`; audio `.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`; images `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`. WebM, MKV, AVI and HEIC are not supported. | Convert the file to MP4 (H.264) for video, or to PNG or JPEG for photos. |
| Not a readable MP4/MOV file ... | The file is damaged, incomplete, or not really an MP4 or MOV file. | Export or download the file again. |
| The video track has no samples | The video is empty, or it is a fragmented MP4 (written by some screen recorders and streaming downloads). | Save it again as a regular MP4 in a video converter. |
| The file has no video or audio track | The MP4 or MOV file contains neither video nor audio. | Use a different file. |
| The audio cannot be decoded ... / The audio is empty | The browser cannot read the audio, or it contains no sound. | Convert the file to WAV or MP3. |
| The image cannot be decoded ... | The image is damaged or uses a variant the browser cannot read. | Save it again as PNG or JPEG. |
| The SVG has no size (width/height or viewBox) | The SVG file does not say how large it is. | Add `width` and `height` (or a `viewBox`) to the SVG in your drawing app. |
| Could not copy it into media/ ... | The editor could not copy the file into the project's `media` folder, for example because the disk is full. | Free disk space and import again. |

If a message "Import failed" appears instead, the whole import stopped; its detail line gives the reason. See [Importing media](importing-media.md).

### A video imports but shows nothing

**Symptom:** The video appears in the Media panel, but its card keeps showing the plain film icon instead of a thumbnail. Its clip is on the timeline, but the preview shows only the background (or the tracks below) where the clip should be.

**Cause:** Usually your browser cannot decode the video's codec on this computer. Importing reads only the file's structure, so the problem shows when the picture is needed. Common cases are HEVC (H.265) on a computer whose graphics hardware cannot decode it, and professional codecs such as ProRes. The same happens when the video's file was removed from the project's `media` folder.

**Fix:**
1. Check the codec: click **List view** in the Media panel and read the **Codec** column.
2. Convert the video to MP4 with H.264 (on an iPhone, the **Most Compatible** camera format records H.264), then import the converted file.
3. If the file was removed from the project's `media` folder, put it back with the same name.

## Playback and preview

### Playback stutters or drops frames

**Symptom:** Motion looks jerky, and **Dropped** in the status strip under the preview shows a number above 0 after you play. The number resets each time you start playing.

**Cause:** The computer cannot decode and draw every frame in time. Heavy footage (4K, 60 fps, HEVC, high bitrate) is the most common reason: 4K 60 fps HEVC at full quality is at the limit of what a laptop graphics card can decode. Heat makes it worse: a laptop that has played 4K for a long time slows down.

**Fix:**
- Plug in your laptop and use a high-performance power mode.
- On a laptop with two graphics cards, make Windows run the browser on the faster one: open **Settings** > **System** > **Display** > **Graphics**, select your browser and choose **High performance**. Then relaunch the browser.
- Close other tabs and apps that play video or use the graphics card (video calls, games).
- Let a hot laptop cool down.
- Where you can, use 1080p footage instead of 4K. Lighter proxy copies for 4K footage are available in a later version.

**Not a problem:**
- Playback may wait up to half a second before it starts: the editor decodes the first frames.
- At 2x to 8x, the preview skips frames on purpose. They are not counted as dropped.
- Backward playback (<kbd>J</kbd>) needs more decoding than forward playback and can be less smooth with heavy footage.

See [Preview and playback](preview-and-playback.md#know-what-to-expect-from-performance).

### The preview shows a nearby frame for a moment

**Symptom:** While you scrub or after a jump, the preview first shows a nearby frame, then switches to the exact one. In 4K phone clips this can take about half a second.

**Cause:** Video is stored in groups of frames that each start with a keyframe. To show a frame from the middle of a group, the editor decodes from the keyframe before it. Meanwhile it shows the closest frame it has, so the picture never goes black.

**Fix:** Nothing; the exact frame follows. Wait for the picture to settle before you click **Export frame**, or the PNG contains the nearby frame. Lighter proxy copies, which make this faster, are available in a later version.

### Playback has no sound

**Symptom:** The picture plays, but you hear nothing, or one clip stays silent.

**Cause and fix:** Check these in order.

| Check | Fix |
| --- | --- |
| The button left of the **Master volume** knob shows a crossed-out speaker and reads **Unmute**. | Click **Unmute**. |
| The **Master volume** knob is turned far down: its tooltip reads, for example, **Master volume: -60.0 dB**. | Double-click the knob to go back to 0.0 dB. |
| You play backward, at 2x or faster, step frames or drag in the ruler. | Sound plays only at 1x forward. Press <kbd>K</kbd> to pause, then <kbd>Space</kbd> to play forward at 1x. |
| **M** is highlighted in the header of the clip's audio track, or **S** is highlighted on another audio track. | Click the toggle to turn it off. See [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks). |
| The meter at the right edge of the preview moves, but you still hear nothing. | The sound leaves the editor. Check the browser tab: if it shows a crossed-out speaker, right-click the tab and choose **Unmute site**. Then check your system volume and output device. |
| The clip's file is an .mp3, .aac, .wav or .ogg file over 1 GB. | Such files play no sound. Convert the file to .m4a (AAC) and import it again. |
| The sound cannot be decoded, or the clip's file is missing from the project's `media` folder. | Convert the file to .m4a, .mp3 or .wav and import it again, or put the missing file back in `media` with the same name. |

**Not a problem:** Right after you open a project, the sound of a long .mp3 or .wav file can join a moment after the picture: the editor decodes the whole file first. It then fades in and stays in sync.

See [Audio](audio.md).

### Sound and picture are out of sync

**Symptom:** Lips move before or after the voice.

**Cause:** The editor keeps sound and picture less than one frame apart, also in phone videos. Delays outside the editor come on top: wireless (Bluetooth) headphones and speakers add a delay of their own that the editor cannot see.

**Fix:** Check the sync with wired headphones or the computer's speakers. If the voice is still off, check the same clip in another video player: the file itself may be out of sync.

### The preview shows two pictures side by side

**Symptom:** While you drag on the timeline, the preview splits into two halves, each with a different frame.

**Cause:** You are rolling a cut, or slipping or sliding a clip. The two halves show the frames on both sides of the edit.

**Fix:** Nothing to fix. When you release the mouse button or press <kbd>Esc</kbd>, the preview goes back to the frame at the playhead. See [Read the split preview](advanced-trimming.md#read-the-split-preview).

## Known limitations

The current version cannot do these things yet. Each one is available in a later version.

- **Sound:** no sound while you scrub, step frames, play backward or shuttle faster than 1x. Audio clips show no waveforms. Changing the volume of a clip, fades and audio effects are not available, and video tracks have no mute toggle.
- **Editing clips:** you can select, move, insert, duplicate, nudge, trim, roll, slip, slide and rate stretch clips, but not split or delete them. The **Razor** and **Hand** tools are not available. Clips snap only to clip edges, the playhead and the start of the timeline, because markers and in and out points are not available yet. To remove a clip you just added, use **Undo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>).
- **Trimming:** <kbd>Q</kbd> and <kbd>W</kbd> always look at every track; choosing the tracks they act on is not available yet. Linked clips that are out of step can't be moved back into sync with one command.
- **Speed and edit points:** a clip's speed changes only with **Rate stretch**; typing an exact speed is not available. A selected cut (edit point) only marks the cut; transitions are not available.
- **Tracks:** double-clicked media always goes to the first video track (V1); drag clips to move them to other tracks. Tracks can't be locked, hidden, renamed or removed (**Undo** removes a track you just added). Clicking a track header does nothing yet (only the **+ Video track** and **+ Audio track** rows and the **M** and **S** toggles of audio tracks work), and the timeline has no scrollbars (scroll with the mouse wheel).
- **Preview:** no panning, no mouse-wheel zoom, and no <kbd>Ctrl</kbd>+<kbd>0</kbd>/<kbd>1</kbd>/<kbd>2</kbd>. The preview timecode is read-only; type times in the timeline toolbar. The quality is always **Auto: full**.
- **Fit only:** inserted clips fit the frame with bands; one-click Fill is not available. Changing the project resolution does not refit existing clips.
- **Animated GIF and WebP files** show as still images (their first frame).
- **Media that cannot be decoded, or whose file is missing,** shows nothing in the preview, with no placeholder.
- **Removing media** that a clip uses is not possible.
- **Frame rate:** you cannot change it once the timeline has clips.
- **Export:** only **Export frame** (a PNG of the current frame) works. The **Export** button and the **Settings** button in the app bar are disabled.
- **Shortcuts:** <kbd>Ctrl</kbd>+<kbd>N</kbd> cannot create a project in a browser tab, and many shortcuts in the keymap belong to features that are not available yet. See [Keyboard shortcuts](keyboard-shortcuts.md).
- **Heavy footage:** 4K 60 fps HEVC at full quality can drop frames, and exact frames deep inside long phone clips take a moment to appear.

## Related pages
- [Audio](audio.md)
- [Trimming clips](trimming.md)
- [Advanced trimming](advanced-trimming.md)
- [Getting started](getting-started.md)
- [Projects and saving](projects-and-saving.md)
- [Importing media](importing-media.md)
- [Preview and playback](preview-and-playback.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 14, 2026-10-15</sub>
