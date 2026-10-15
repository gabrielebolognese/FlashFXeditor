# Preview zoom, overlays and fullscreen

The Preview panel works like a monitor you can inspect up close. Zoom in to check fine detail at the real resolution of your media, pan around the enlarged frame, choose how much detail the preview draws while you play, lay safe zones and grids over the picture to keep text clear of the Reels, TikTok and Shorts buttons, and fill the whole browser window with the preview to watch your edit.

> **Video placeholder: Zoom and pan the preview**
> - File: `videos/preview-zoom-overlays-fullscreen/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a 4K landscape clip on V1. Point at the preview header from left to right: **Zoom** (reading **Fit**), **Fit the frame in the panel**, **Preview quality** (reading **Auto**), **Overlays**, **Snap**, **Smart guides**, **Fullscreen** and **Export frame**.
>   2. Click **Zoom** and choose **400%**: the center of the frame fills the panel. After a moment, fine detail such as hair and small text gets sharp, and the status line under the transport bar reads **Auto: full**.
>   3. Press <kbd>Space</kbd>: while the video plays, the status line reads **Auto: reduced** and the picture is softer. Press <kbd>Space</kbd> again: the picture sharpens a moment later.
>   4. Put the pointer on a face, hold <kbd>Ctrl</kbd> and roll the mouse wheel: the preview zooms in and out while the face stays under the pointer, and **Zoom** shows the free value, for example **137%**.
>   5. Roll the wheel alone: the picture moves up and down. Hold <kbd>Shift</kbd> and roll: it moves sideways.
>   6. Drag with the middle mouse button, then hold <kbd>Space</kbd> and drag with the left button: the picture follows the pointer.
>   7. Press <kbd>Ctrl</kbd>+<kbd>0</kbd>: the whole frame is back, centered.

## In this page
- [Zoom the preview](#zoom-the-preview)
- [Zoom with the mouse wheel](#zoom-with-the-mouse-wheel)
- [Pan the preview](#pan-the-preview)
- [See real detail when you zoom in](#see-real-detail-when-you-zoom-in)
- [Choose the preview quality](#choose-the-preview-quality)
- [Show a platform safe zone](#show-a-platform-safe-zone)
- [Show grids, guides and rulers](#show-grids-guides-and-rulers)
- [Fill the window with the preview](#fill-the-window-with-the-preview)
- [What the project remembers](#what-the-project-remembers)

## Zoom the preview

1. Click **Zoom** in the Preview panel header. The button shows the current zoom, **Fit** in a new project.
2. Click a level. The menu closes and the button shows the new zoom.

| Level | Shortcut (Preview panel) | What you see |
| --- | --- | --- |
| **Fit** (default) | <kbd>Ctrl</kbd>+<kbd>0</kbd> | The whole frame, as large as the panel allows, with a small margin, centered. |
| **25%**, **50%** | | The frame smaller than actual size. |
| **100%** | <kbd>Ctrl</kbd>+<kbd>1</kbd> | Actual size: one pixel of your project on one pixel of your screen. |
| **200%** | <kbd>Ctrl</kbd>+<kbd>2</kbd> | Each project pixel twice as wide and twice as high. |
| **400%** | | Four times actual size. |

- The current level is highlighted in gold in the menu. After a wheel zoom, the menu also lists that free level, for example **137%**, in its place between the others.
- Choosing a level from the menu or with a shortcut keeps the point in the middle of the panel where it is. **Fit** always centers the whole frame again.
- **Fit the frame in the panel** (the button right of **Zoom**) does the same as **Fit** and <kbd>Ctrl</kbd>+<kbd>0</kbd>.
- <kbd>Ctrl</kbd>+<kbd>0</kbd>, <kbd>Ctrl</kbd>+<kbd>1</kbd> and <kbd>Ctrl</kbd>+<kbd>2</kbd> work only after you click the preview. In the other panels the browser gets them: <kbd>Ctrl</kbd>+<kbd>0</kbd> resets the browser's page zoom, and <kbd>Ctrl</kbd>+<kbd>1</kbd> and <kbd>Ctrl</kbd>+<kbd>2</kbd> switch to your first or second browser tab.
- The **Zoom** button never takes the keyboard focus: <kbd>Space</kbd> and the other shortcuts work right after you choose a level.

> **Note:** 100% counts the real pixels of your screen. With Windows display scaling above 100% (common on laptops), screen pixels are smaller than the pixels of the page layout, so the frame at 100% looks smaller than you might expect.

When a panel resizes, a zoomed view keeps the same point of the frame in the middle of the panel; **Fit** refits the frame to the new size.

## Zoom with the mouse wheel

1. Point at the part of the picture you want to look at.
2. Hold <kbd>Ctrl</kbd> (or <kbd>Alt</kbd>) and roll the mouse wheel: forward zooms in, backward zooms out. On a touchpad, pinch with two fingers.

The point under the pointer stays under the pointer while you zoom, so you can dive straight into a detail. One notch of a typical mouse wheel zooms by about 1.3 times.

- The wheel zooms freely from **5%** to **3200%**. **Zoom** shows the level rounded to the percent, for example **137%**; below 10% it shows one decimal, for example **7.5%**.
- The wheel works at **Fit** too: the first notch starts from the frame as you see it.
- Zooming is not a step in the history, and the timeline does not change.

## Pan the preview

When you zoom in, only part of the frame fits in the panel. Pan to see another part:

| How | What to do |
| --- | --- |
| Mouse wheel | Roll the wheel to move the picture up and down; hold <kbd>Shift</kbd> to move it sideways. On a touchpad, swipe with two fingers in any direction. |
| Middle mouse button | Drag with the middle button pressed, with any tool. |
| <kbd>Space</kbd> | With playback stopped and the pointer over the picture, hold <kbd>Space</kbd> and drag with the left button. |
| **Hand** tool | Press <kbd>H</kbd> (or click **Hand** in the timeline toolbar), then drag the picture with the left button. Press <kbd>V</kbd> to go back to **Select**. |

- The picture follows the pointer. Over the picture, the cursor is an open hand while you hold <kbd>Space</kbd> or the **Hand** tool is active, and a closed hand while you drag.
- You can pan until an edge of the frame reaches the middle of the panel; it never goes further.
- At **Fit** the whole frame is visible, so there is nothing to pan: the wheel without <kbd>Ctrl</kbd> or <kbd>Alt</kbd>, a middle drag and a drag with the **Hand** tool do nothing there.
- If you tap <kbd>Space</kbd> over the zoomed picture without dragging, playback starts when you release the key, not when you press it. During playback, at **Fit**, and with the pointer away from the picture, <kbd>Space</kbd> plays and pauses at once as usual.
- Panning is not a step in the history.

> **Note:** With the **Select** tool, a left drag on the preview does nothing yet. Selecting and moving clips on the picture is available in a later version.

## See real detail when you zoom in

Above 100%, the preview shows the real pixels of your media, not an enlarged copy of the project-size frame. A 4K clip in a 1080×1920 project therefore shows sharp hair, text and edges at 200% or 400%.

How much detail you get depends on the source:

| Media in a 1080×1920 project | Gains detail up to about |
| --- | --- |
| A 1080×1920 video or image | 100%: the project already shows every pixel of it. Above that, its pixels are enlarged. |
| A 2160×3840 (4K vertical) video | 200% |
| A 3840×2160 (4K landscape) video, fitted to the frame width | 356% |

- Beyond that zoom, each source pixel is shown larger. The **Pixel grid from 800%** overlay draws a line between project pixels when you zoom to 800% or more; see [Show grids, guides and rulers](#show-grids-guides-and-rulers).
- When several clips are stacked, the preview draws the visible part of the frame at the detail of the sharpest one.
- The preview prepares video frames of at most 4096 pixels on their long side. Larger sources, such as 6K or 8K video, show the detail of a 4096-pixel frame.
- After you zoom in, the picture can stay soft for a moment while the editor decodes the current frame at the larger size. Then it sharpens.
- With the default **Auto** quality, the extra detail appears when the picture is still: while you play, scrub or trim, and for 0.3 seconds after, the preview shows the project's resolution. See [Choose the preview quality](#choose-the-preview-quality).
- An SVG image that covers the whole frame doesn't get sharper above 100%; more detail for SVG images is available in a later version.

> **Tip:** To compare with the source, zoom to the level where one source pixel is one screen pixel. For a 4K landscape clip fitted to a 1080-pixel-wide frame, that is about 356%.

## Choose the preview quality

The quality decides how much detail the preview draws, and when. Click **Preview quality** in the Preview panel header (the button shows the current mode) and choose a mode:

| Mode | While the picture is still | While you play, scrub or trim |
| --- | --- | --- |
| **Auto** (default) | Full detail | The project's resolution, until 0.3 seconds after you stop |
| **Full** | Full detail | Full detail, also while you play (heavier for your computer when zoomed in) |
| **Proxy** | The project's resolution | The project's resolution |
| **1/2** | Full detail | While playing, half the resolution of the view: lighter, but softer. While scrubbing or trimming, as **Auto**. |
| **1/4** | Full detail | While playing, a quarter of the resolution of the view. While scrubbing or trimming, as **Auto**. |

"Full detail" means the real detail of your media described in [See real detail when you zoom in](#see-real-detail-when-you-zoom-in). At **Fit** and at 100% or less, full detail and the project's resolution look the same, so **Auto**, **Full** and **Proxy** only differ when you zoom in above 100%. **1/2** and **1/4** make playback lighter at every zoom level.

> **Note:** **Proxy** is meant for lighter proxy copies of your media, which are available in a later version. Until then it shows your media at the project's resolution.

### Read the quality in the status line

The status line under the transport bar shows the mode, then what the preview draws right now:

| Text | Meaning |
| --- | --- |
| **Auto: full**, **1/2: full**, **1/4: full**, **Proxy: full** | The preview shows all the detail it can at this zoom. |
| **Auto: reduced**, **1/2: reduced**, **1/4: reduced**, **Proxy: reduced** | The preview shows the project's resolution, less than the detail available at this zoom. |
| **1/2: half**, **1/4: quarter** | Playback at half or a quarter of the resolution. |
| **Full** | **Full** mode: always full detail. |

Each project remembers the quality mode. Changing it is not a step in the history.

## Show a platform safe zone

Reels, TikTok and Shorts cover parts of your video with their own buttons and text: a bar at the top, a column of buttons on the right and the caption at the bottom. A safe zone overlay shades those parts so you can keep titles and faces clear of them.

> **Video placeholder: Safe zones and grids**
> - File: `videos/preview-zoom-overlays-fullscreen/safe-zones-and-grids.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 1080×1920 project with a talking-head clip on V1. Click **Overlays** (the grid icon) in the preview header.
>   2. Under **Safe zone**, click **Reels**: the top bar, the action column on the right and the caption area at the bottom are shaded and named **Top bar**, **Actions** and **Caption**; a dashed rectangle marks the safe area. The menu stays open and the **Overlays** icon turns gold.
>   3. Click **TikTok**, then **Shorts**: the shaded areas change size.
>   4. Under **Grid**, click **Thirds**, then **Custom**, and click **+** next to **Cells per side** twice: the grid gets denser.
>   5. Click **Center cross** and **Title / action safe**: a cross and two dashed rectangles appear.
>   6. Click outside the menu to close it. Click **Export frame** and open the saved PNG: none of the overlays are in it.

1. Click **Overlays** (the grid icon) in the Preview panel header.
2. Under **Safe zone**, click **Reels**, **TikTok** or **Shorts**. Click **None** to hide the safe zone.

The menu stays open, so you can try each platform in turn. Click outside it or press <kbd>Esc</kbd> to close it.

What you see:

- **Shaded areas** where the platform's interface covers your video, named **Top bar**, **Actions** and **Caption** when the area is large enough on screen for its name.
- **A dashed rectangle**: the safe area, clear of all three.

The areas on a 1080×1920 frame, in project pixels:

| Platform | Top bar | Actions (right column) | Caption (bottom, left of the column) | Safe area |
| --- | --- | --- | --- | --- |
| **Reels** | Top 270 px | 162 px wide, from 1152 px down | Bottom 670 px | x 65 to 918, y 270 to 1250 |
| **TikTok** | Top 240 px | 180 px wide, from 840 px down | Bottom 660 px | x 120 to 900, y 240 to 1260 |
| **Shorts** | Top 288 px | 192 px wide, from 768 px down | Bottom 672 px | x 48 to 888, y 288 to 1248 |

- In a project of another size, the areas scale with the frame.
- The platforms change their apps from time to time. Treat the zones as a guide and leave some extra room.
- Only one safe zone shows at a time. You can combine it with a grid and the guides below.

> **Important:** Overlays exist only on your screen. They never appear in a frame you save with **Export frame**.

## Show grids, guides and rulers

Click **Overlays** in the Preview panel header and turn on what you need. The menu stays open while you click; the active choices are highlighted in gold. The **Overlays** icon is gold while a safe zone, a grid, the center cross or the title / action safe rectangles are on.

### Grid

Under **Grid**, choose one:

| Choice | Lines |
| --- | --- |
| **None** (default) | No grid. |
| **Thirds** | Two lines across and two lines down, at a third of the frame: the rule of thirds. |
| **Squares** | Square cells a third of the frame's short side (360 pixels in a 1080×1920 frame), with the middle cell centered on the frame. |
| **Custom** | Equal cells: **Cells per side** sets how many across and down, from 2 to 16 (4 by default). |

**Cells per side** works only while **Custom** is chosen. Click **-** or **+** to change it; the grid follows at once.

### Guides

Under **Guides**, each row turns on or off with a click:

| Row | What it shows |
| --- | --- |
| **Center cross** | A small cross at the center of the frame. It keeps the same size on screen at every zoom. |
| **Title / action safe** | Two dashed rectangles, centered: action-safe at 90% of the frame and title-safe, the inner one, at 80%. Keep important action inside the outer one and text inside the inner one. |
| **Rulers above 100%** | Pixel rulers along the top and left edges of the preview while you zoom in above 100%. Their numbers are project pixels, counted from the top-left corner of the frame. |
| **Pixel grid from 800%** (on by default) | A thin line between every project pixel while you zoom to 800% or more. |
| **Smart guides** (on by default) | The same setting as the **Smart guides** button in the header. Smart guides are available in a later version. |

- Overlays are drawn on top of the picture and move with it when you zoom and pan.
- While the preview shows two frames side by side (when you roll a cut, slip or slide a clip), the overlays are hidden. See [Read the split preview](advanced-trimming.md#read-the-split-preview).

### Snap and Smart guides in the header

- **Snap** (the magnet) is the same snapping switch as in the timeline toolbar, with the same shortcut <kbd>S</kbd>. It is gold while snapping is on. See [Turn snapping on or off](timeline.md#turn-snapping-on-or-off).
- **Smart guides** turns smart guides on or off; it is gold while they are on. The guides themselves are available in a later version.

## Fill the window with the preview

Press <kbd>F</kbd>, or click **Fullscreen** in the Preview panel header. The preview fills the whole browser window, over the other panels.

> **Video placeholder: Fullscreen preview**
> - File: `videos/preview-zoom-overlays-fullscreen/fullscreen.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows:
>   1. Press <kbd>F</kbd>: the preview fills the browser window, with the header at the top and the transport bar at the bottom floating over the picture.
>   2. Press <kbd>Space</kbd> and keep the mouse still: after 2 seconds the header, the transport bar and the pointer disappear while the video plays.
>   3. Move the mouse: they come back. Point at **Dropped 0** in the status line.
>   4. Press <kbd>Esc</kbd>: the Media, Edit Properties, Timeline and Preview panels are back at their sizes.

- The header (with **Zoom**, **Fit the frame in the panel**, **Preview quality**, **Overlays**, **Snap**, **Smart guides**, **Exit fullscreen** and **Export frame**) floats at the top, and the transport bar with the status line at the bottom. The audio meter stays along the right edge.
- After 2 seconds without moving the mouse, the header and the transport bar fade out, and the pointer disappears over the picture. Move the mouse to bring them back. While the pointer rests on the header or the transport bar, they stay.
- The playback shortcuts keep working: play, shuttle and step through your edit as usual.
- The zoom, the overlays and the quality stay as you set them; at **Fit** the frame fills the larger space.

To go back, press <kbd>Esc</kbd> or <kbd>F</kbd>, or click **Exit fullscreen**. Every panel comes back at exactly the size and place it had.

- <kbd>Esc</kbd> first cancels a drag in progress, and closes an open menu, before it leaves fullscreen.
- <kbd>F</kbd> does not work while you type in a text field.
- The editor does not remember fullscreen: after a reload, the project opens in the normal panel layout.

> **Tip:** Fullscreen fills the browser window, not the whole screen. To hide the browser's tabs and address bar as well, also press <kbd>F11</kbd> (the browser's own full screen); press <kbd>F11</kbd> again to leave it.

## What the project remembers

Each project remembers, for the next time you open it:

- the preview zoom and the part of the frame you panned to
- the quality mode
- the safe zone, the grid with its cells per side, and each guide row of the **Overlays** menu

None of these are steps in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> does not undo a zoom, a pan or an overlay. See [Pick up where you left off](projects-and-saving.md#pick-up-where-you-left-off).

## Related pages
- [Preview and playback](preview-and-playback.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Timeline](timeline.md)
- [Advanced trimming](advanced-trimming.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Workspace](workspace.md)
- [Projects and saving](projects-and-saving.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 21, 2026-10-15</sub>
