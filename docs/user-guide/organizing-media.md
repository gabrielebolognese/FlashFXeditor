# Organizing media

Keep a large project tidy in the **Media** tab of the Media panel. Sort your clips into bins, show one kind of media at a time, find any item by typing part of its name, and show only the media no clip uses so you can clean them up. In list view, make the columns as wide as you need. Use this page once a project has more than a handful of media items.

> **Video placeholder: Organize media with bins, search and filters**
> - File: `videos/organizing-media/overview.mp4` (not recorded yet)
> - Length: about 70 seconds
> - Shows: a project with 40 media items in grid view; point at the bin strip on the left (**All 40**, **Video**, **Audio**, **Images** with their counts); click **Video**: only the videos show; click **All**; click **New bin** (the folder with a plus) in the panel header: a chip named **Bin** appears in the strip with its name selected; type `Drone shots` and press <kbd>Enter</kbd>; type `drone` in **Search media**: the cards narrow with each letter; press <kbd>Ctrl</kbd>+<kbd>A</kbd> and drag one of the cards onto **Drone shots**: its count reads the number of drone clips; clear the search; click **Drone shots**: only those clips show; right-click another card, point at **Move to bin** and click **Drone shots**; click the **Unused** chip: only the media no clip uses show; click **Unused** again.

## In this page
- [Find your way around the Media tab](#find-your-way-around-the-media-tab)
- [Show one kind of media](#show-one-kind-of-media)
- [Create a bin](#create-a-bin)
- [Put media into a bin](#put-media-into-a-bin)
- [Take media out of a bin](#take-media-out-of-a-bin)
- [Rename or delete a bin](#rename-or-delete-a-bin)
- [Search your media](#search-your-media)
- [Show only some media with the filter chips](#show-only-some-media-with-the-filter-chips)
- [Show everything again](#show-everything-again)
- [Select what the tab shows](#select-what-the-tab-shows)
- [Clean up unused media](#clean-up-unused-media)
- [Resize the list columns](#resize-the-list-columns)
- [Find a media file on your disk](#find-a-media-file-on-your-disk)
- [What the editor remembers](#what-the-editor-remembers)
- [Use the palette](#use-the-palette)

## Find your way around the Media tab

The **Media** tab has these parts, from top to bottom and left to right:

| Part | What it does |
| --- | --- |
| Panel header | **Sort media by** and its direction, **Grid view**, **List view**, **New bin** (the folder with a plus) and **Import media**. See [Sort media](importing-media.md#sort-media). |
| Tool row | The **Search media** field and the filter chips **Video**, **Audio**, **Images** and **Unused**. See [Search your media](#search-your-media) and [Show only some media with the filter chips](#show-only-some-media-with-the-filter-chips). |
| Notice strip | Appears only when media are offline, for example "2 files offline", with **Allow access** or **Relink folder…**. See [Offline media and relinking](offline-media-and-relinking.md). |
| Bin strip | A column of chips on the left: **All**, **Video**, **Audio** and **Images**, then the bins you create. Each chip shows how many media items it holds. Click a chip to show its media. |
| Cards or rows | The media the bin, the chips and the search let through, in grid or list view. See [Browse your media](importing-media.md#browse-your-media). |

The chip of the bin you are looking at is highlighted. The counts on the chips never change with the search or the filter chips: they always count every item in the bin.

## Show one kind of media

Click **Video**, **Audio** or **Images** in the bin strip to show only the media of that kind. Click **All** to show every media item again.

These four chips are always there and you can't rename or delete them. They sort your media by kind for you: a video is under **Video** even when it is also in a bin of your own.

## Create a bin

A bin is a named group of media items, like a folder: for example "Drone shots", "Interviews" or "Music". Each media item can be in one bin at a time. Bins don't hold other bins.

1. In the Media panel header, click **New bin** (the folder with a plus).
2. A chip named **Bin** appears at the end of the bin strip, with its name selected. Type a name, for example `Drone shots`.
3. Press <kbd>Enter</kbd> or click elsewhere to keep it. Press <kbd>Esc</kbd> to keep the name **Bin**.

The next new bins are named **Bin 2**, **Bin 3** and so on, until you rename them. Names can be up to 64 characters.

A new bin is empty. New imports never go into a bin by themselves, even while a bin is shown: they appear under **All** and their kind's chip, and you move them into a bin yourself.

## Put media into a bin

Do one of these:

- **Drag the cards onto the bin's chip.** Select the cards (see [Select media](importing-media.md#select-media)), then drag one of them onto the chip in the bin strip. The chip is highlighted while the pointer is over it. Release the mouse button: every selected card goes into that bin. Press <kbd>Esc</kbd> before you release to cancel.
- **Use the media menu.** Select the cards, right-click one of them and click the bin's chip in the **Move to bin** row. The chip of the bin the items are already in is dimmed. The **Move to bin** row appears once the project has a bin.

An item that was in another bin leaves it. A move is one step in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts the items back where they were. The **Undo** tooltip reads, for example, **Undo Move 40 media files to bin**.

> **Tip:** To fill a bin quickly, type a word in **Search media**, press <kbd>Ctrl</kbd>+<kbd>A</kbd> to select every item it finds, and drag one of them onto the bin. See [Select what the tab shows](#select-what-the-tab-shows).

You can only drop media on the bins you created. The **All**, **Video**, **Audio** and **Images** chips don't take drops.

## Take media out of a bin

1. Show the bin, and select the items you want to take out.
2. Right-click one of them and click **None** in the **Move to bin** row.

The items stay in the project, in no bin. Find them under **All**.

## Rename or delete a bin

- **Rename a bin:** double-click its chip, or right-click the chip and choose **Rename**. Type the new name and press <kbd>Enter</kbd> or click elsewhere. <kbd>Esc</kbd> cancels, and a blank name is ignored.
- **Delete a bin:** right-click its chip and choose **Delete bin**. The media in it stay in the project, in no bin. If you were looking at that bin, the strip shows **All**.

Point at a bin's chip to see its tooltip, for example "Drone shots: drop media here, double-click to rename". New bins, renames and deleted bins are steps in the history: <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes them, and an undone delete puts the media back into the bin.

## Search your media

> **Video placeholder: Find media with search and filters**
> - File: `videos/organizing-media/search-and-filters.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows: a project with 200 images in grid view; click **Search media** and type `drone 1`: the cards narrow as you type, down to 22; click **Images**: nothing changes, all of them are images; click **Video**: the panel reads **No media match**; click **Clear filters**: all 200 are back and the search field is empty; click **Unused**: only the images no clip uses show.

1. Click **Search media** at the top of the **Media** tab.
2. Type a word or part of a word. The cards narrow as you type.

How the search works:

- Each word you type must appear in the item's name or in its file name. `drone 1` finds "Drone 12.png" and "drone_1.mp4", but not "Drone 2.png".
- Upper and lower case don't matter, and neither do accents: `cafe` finds "Café.mp4".
- The file name counts even after you rename an item: an item you renamed "Opening shot" is still found by `IMG_0042`.
- For a [linked file](importing-media.md#copy-or-link-your-files), the folders of its path count too: when you dropped a folder named "Footage", `footage` finds the files that came from it.
- The search works inside the bin you are looking at and together with the filter chips.

To clear the search, select its text and delete it, or click **Clear filters** (see [Show everything again](#show-everything-again)). The search is not kept when you close the project.

## Show only some media with the filter chips

The chips at the right of **Search media** limit what the tab shows:

| Chip | Shows |
| --- | --- |
| **Video** | Video media only |
| **Audio** | Audio media only |
| **Images** | Images only, including animated GIF and WebP images and SVG logos |
| **Unused** | Media that no clip on the timeline uses (tooltip: "Media no clip uses") |

- Click a chip to turn it on (it is highlighted) and click it again to turn it off.
- With several kind chips on, the tab shows media of any of those kinds: **Video** and **Audio** show videos and audio, but no images.
- **Unused** combines with the others: **Video** and **Unused** show the videos that no clip uses.
- An item counts as used as soon as one clip uses it; the **Used** column of list view and the chip on a card's picture give the number of clips. See [Grid view](importing-media.md#grid-view).

## Show everything again

When the bin, the chips and the search leave nothing to show, the tab says why and offers the button that fixes it:

| The tab reads | When | Buttons |
| --- | --- | --- |
| **No media match**: "Nothing matches the filters and the search." | A chip is on or the search has text, and **All** is shown | **Clear filters** |
| **No media match**: "Nothing in this bin matches the filters and the search." | A chip is on or the search has text, and a bin or a kind is shown | **Clear filters**, **Show all media** |
| **No videos yet**, **No audio yet** or **No images yet**: "Import some, or show every media." | The **Video**, **Audio** or **Images** chip of the bin strip is shown and the project has none of that kind | **Import media**, **Show all media** |
| **This bin is empty**: "Drag media onto the bin, or use Move to bin in a media's menu." | One of your bins is shown and it holds nothing | **Show all media** |

- **Clear filters** turns every filter chip off and empties the search field. The tab stays on the bin it shows.
- **Show all media** shows **All**, turns the chips off and empties the search, in one click. The selected media stay selected.
- In list view, the message appears under the column headers; in grid view, at the top of the tab.

Before you import anything, the tab reads **No media yet** ("Import video, audio and images, or drop files here.") with **Import media**. See [Import files](importing-media.md#import-files).

## Select what the tab shows

Selecting works on the cards and rows the tab shows. See [Select media](importing-media.md#select-media).

- Press <kbd>Ctrl</kbd>+<kbd>A</kbd> while the Media panel is active to select every media item the tab shows, and none that the bin, the chips or the search hide.
- When you show another bin, turn a chip on or type in the search, the selected items that are hidden are no longer selected. So <kbd>Delete</kbd>, **Move to bin**, the media menu and a drag never act on media you can't see.
- After an import, the new items are selected, unless the bin, the chips or the search hide them.

**Reveal in media panel** in a clip's menu on the timeline always shows the clip's media: when the search or the chips hide it, they are cleared, and when the bin you are looking at hides it, the strip shows its bin (or **All**). See [Use the clip and gap menus](splitting-and-deleting.md#use-the-clip-and-gap-menus).

## Clean up unused media

> **Video placeholder: Remove unused media in one step**
> - File: `videos/organizing-media/clean-up-unused.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: a project with three videos in the Media panel, one of them on the timeline; click **Unused**: the two unused videos remain; click one of them and press <kbd>Ctrl</kbd>+<kbd>A</kbd>: both are selected; press <kbd>Delete</kbd>: the **Remove media** dialog reads "Remove 2 media files from the project?" with **Remove and delete clips** dimmed; tick **Also delete the 2 copied files from the media folder**; click **Remove from project**: both cards disappear and a message reads **Deleted 2 files from media/**.

1. Click **Unused** in the tool row. Only the media no clip uses are shown.
2. Click one of the cards, then press <kbd>Ctrl</kbd>+<kbd>A</kbd> to select all of them.
3. Press <kbd>Delete</kbd>. One **Remove media** dialog asks about all of them.
4. To free disk space, tick **Also delete the copied files from the media folder** (the exact wording names how many files).
5. Click **Remove from project**.

The items leave the project in one step. Without the checkbox, <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings them back as they were. See [Remove media](importing-media.md#remove-media).

## Resize the list columns

In **List view**, every column after the small picture can be made wider or narrower:

1. Point at the right edge of a column heading, for example **Name**. The pointer turns into a double arrow.
2. Drag to the right to widen the column, or to the left to narrow it. The columns without a width of their own share the rest of the row.
3. Release the mouse button.

Double-click the edge of a heading to give that column its default share back. The widths are kept with the project.

With the keyboard, press <kbd>Tab</kbd> until a column edge shows a gold line, then press <kbd>→</kbd> to widen the column or <kbd>←</kbd> to narrow it, by 8 pixels per press (32 with <kbd>Shift</kbd>). A column can't get narrower than 28 pixels. Point at an edge for its tooltip: **Drag to resize the column (Left / Right when focused), double-click for its default width**.

## Find a media file on your disk

The browser can't open folders on your computer, so **Reveal in folder** tells you where a file is instead:

1. Right-click the card or row and choose **Reveal in folder**.
2. A message at the top of the window shows the path, and the path is copied to your clipboard ("Path copied. The browser can't open folders.").

| Message | Where the file is |
| --- | --- |
| **In the project folder: media/clip.mp4** | A copy inside the project folder. Open the project folder in File Explorer, then the `media` folder. |
| **Linked file: Footage/clip.mp4** | A linked file, which stays where it was on your disk. The path starts at the folder you dropped, or is just the file name for files you picked with **Import media**. See [Copy or link your files](importing-media.md#copy-or-link-your-files). |
| **Offline, last at clip.mp4** | An offline item pasted from another project, with the file name it had there. See [Offline media and relinking](offline-media-and-relinking.md). |

With several items selected, the message gives the path of one of them only. Select a single item to be sure which one.

## What the editor remembers

| Kept in the project | Kept with your view of the project | Not kept |
| --- | --- | --- |
| The bins, their names and order, and which media are in each one. These changes are steps in the history. | The bin you are looking at, the filter chips that are on, the column widths in list view, and the view, tab and sort order. They come back when you open the project again. See [Pick up where you left off](projects-and-saving.md#pick-up-where-you-left-off). | The search text. |

## Use the palette

Most of these actions are commands you can run from the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and give a shortcut in **Settings** > **Shortcuts**. None has a key by default.

| Command | What it does |
| --- | --- |
| **New bin** | Adds a bin and lets you name it |
| **Search media** | Opens the **Media** tab and puts the cursor in **Search media** |
| **Media filter: video**, **Media filter: audio**, **Media filter: images**, **Media filter: unused** | Turn a filter chip on or off |
| **Media: clear filters and search** | The same as **Clear filters** |
| **Media: show all** | The same as **Show all media**: shows **All**, with no chip and no search |
| **Reveal media in folder** | The same as **Reveal in folder** in the media menu |

Showing, renaming and deleting a bin, and **Move to bin**, need the chip or the card you point at, so they are not in the palette. See [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md).

## Related pages
- [Importing media](importing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Proxies](proxies.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 46, 2026-10-18</sub>
