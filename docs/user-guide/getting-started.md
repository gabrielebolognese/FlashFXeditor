# Getting started

Shorts Editor is a video editor for short vertical videos that runs in your browser. Your projects live in folders on your own disk, and your media never leaves your computer. This page covers what you need to run the editor, the start screen, and how to create, open and reopen a project, also from a template.

> **Video placeholder: Create your first project**
> - File: `videos/getting-started/create-first-project.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows: open Shorts Editor in Chrome; the start screen appears with "No recent projects yet."; click **New project**; in the folder picker, create an empty folder named "My first short" and select it; allow the browser to let the site edit files in the folder; the **New project** dialog opens with **Name** set to "My first short"; leave **Resolution** at **9:16 · 1080×1920** and **Frame rate** at **30 fps**; click **Create project**; the editor opens with tracks V1 and A1 and the name in the app bar; hover the save dot to show **All changes saved**.

## In this page
- [Check your browser](#check-your-browser)
- [Start Shorts Editor](#start-shorts-editor)
- [The start screen](#the-start-screen)
- [Create a project](#create-a-project)
- [Open an existing project](#open-an-existing-project)
- [Reopen a recent project](#reopen-a-recent-project)
- [Allow access to the project folder](#allow-access-to-the-project-folder)
- [If a project does not open](#if-a-project-does-not-open)
- [Related pages](#related-pages)

## Check your browser

| Requirement | Details |
| --- | --- |
| Browser | The current stable version of Chrome or Edge on a desktop computer. Safari, Firefox and mobile browsers are not supported. |
| Operating system | Windows is the primary platform. |
| Graphics | A GPU that supports WebGPU or WebGL2, with hardware acceleration turned on in the browser. |
| Screen | At least 1600×900. The editor is designed for 1920×1080 and larger. |
| Disk | One folder per project, on a drive the browser can write to. There is no server and no account. |
| Internet | Not needed to edit. Transcription downloads its speech model once, 44 MB to 589 MB; see [Transcription](transcription.md). |

The editor draws the preview and the frames of your exports with your graphics card. It uses WebGPU when your computer has it. Where WebGPU is not available, for example with an older graphics card or a driver the browser blocks for WebGPU, it uses WebGL2 instead, by itself, when it starts. You don't need to set anything: the preview and the exported files look the same either way. To see which one the editor uses, open **Settings** > **About**: **Renderer** reads **WebGPU** or **WebGL2**; see [See the version and get help](settings.md#see-the-version-and-get-help). Only 4K video played from the original in **Full** quality is smoother with WebGPU; with the default **Auto** quality, which plays [proxies](proxies.md), both play the same. To use WebGL2 on a computer that has WebGPU, see [The picture or the export goes wrong only on this computer](troubleshooting.md#the-picture-or-the-export-goes-wrong-only-on-this-computer).

When the editor starts, it checks that the browser has every feature it needs. If one is missing, you see a single full-screen message instead of the editor: **This browser cannot run Shorts Editor**, with the text "Open it in the current stable version of Chrome or Edge on desktop. These required features are missing:" and a list of what is missing. There is no reduced mode.

The screen can list these items:

- **WebGPU (navigator.gpu) or WebGL2**: the browser has neither.
- **WebCodecs VideoDecoder**, **WebCodecs VideoEncoder**, **WebCodecs AudioDecoder**, **WebCodecs AudioEncoder**, **WebCodecs VideoFrame**, **WebCodecs ImageDecoder**
- **File System Access (showDirectoryPicker)**, **File System Access (showSaveFilePicker)**
- **A GPU renderer: WebGPU or WebGL2 on a supported GPU with hardware acceleration turned on**: the browser has WebGPU or WebGL2, but can't use either of them with your graphics card.

> **Tip:** If the only item listed is **A GPU renderer**, turn on hardware acceleration (in Chrome: **Settings** > **System** > **Use graphics acceleration when available**), restart the browser, and update your graphics driver if the message stays. See [No GPU renderer is available](troubleshooting.md#no-gpu-renderer-is-available).

> **Note:** Browsers offer these features only on a secure address (`https://` or `localhost`). Opened from any other address, the editor shows the unsupported-browser screen.

## Start Shorts Editor

Open the address of Shorts Editor in Chrome or Edge. Nothing needs to be installed.

> **Note:** If you have the source folder of Shorts Editor instead of an address, install Node.js 22.12 or newer, run `npm install` and then `npm run dev` in that folder, and open the local address it prints.

The editor always starts at the start screen. It does not reopen your last project by itself: pick it from **Recent projects**.

## The start screen

The start screen is shown whenever no project is open. It has:

| Element | What it does |
| --- | --- |
| **New project** | Creates a project in a folder you pick. Shortcut <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> (see the note below). |
| **Open project** | Opens a project folder. Shortcut <kbd>Ctrl</kbd>+<kbd>O</kbd>. |
| **Recent projects** | Cards of the projects you opened recently, each with a picture of the project. Shows "No recent projects yet." until you create or open one. See [Reopen a recent project](#reopen-a-recent-project). |
| **New from template** | The templates you saved. Click one to start a project with it. See [Start a project from a template](project-settings-and-templates.md#start-a-project-from-a-template). |
| Drop area | The whole window: drop a project folder on it to open the project. |

> **Note:** <kbd>Ctrl</kbd>+<kbd>N</kbd> is also a key for **New project**, but in a normal browser tab Chrome and Edge keep it for themselves and open a new browser window. Use <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>.

While a project is being created or opened, a line beside the buttons reads **Opening project…**, or **Opening <name>…** after you click a recent project, and the buttons and cards are dimmed until the step finishes (tooltip **Wait: a project is opening**).

## Create a project

A project is a folder. The editor writes the project file and its subfolders into the folder you pick, so start with an empty one. See [Projects and saving](projects-and-saving.md#what-is-in-the-project-folder) for what goes inside.

1. Click **New project**.
2. In the folder picker, select an empty folder (or create one) and confirm.
3. When the browser asks whether Shorts Editor may edit files in that folder, allow it.
4. The **New project** dialog opens and shows "The project is created in the folder" followed by the folder name. Choose the settings below.
5. Click **Create project**, or press <kbd>Enter</kbd> in the **Name** field.

| Setting | Choices | Default |
| --- | --- | --- |
| **Name** | Any text up to 120 characters. | The folder name. |
| **Template** (only when you have saved a template) | **None: V1 and A1**, or one of your templates. A template sets **Resolution** and **Frame rate** to its values, which you can still change, and brings its tracks, caption style, background and text presets. See [Project settings and templates](project-settings-and-templates.md). | **None: V1 and A1** |
| **Resolution** | **9:16 · 1080×1920**, **4:5 · 1080×1350**, **1:1 · 1080×1080**, **16:9 · 1920×1080**, or **Custom**. | **9:16 · 1080×1920** |
| **Size** (with **Custom** only) | **W** and **H** in pixels, from 16 to 7680. Odd values are rounded to an even number. Type a value, press <kbd>↑</kbd> or <kbd>↓</kbd> to change it by 2, or drag the **W** or **H** letter left or right. | 1080 × 1920 |
| **Frame rate** | **23.976 fps**, **24 fps**, **25 fps**, **29.97 fps**, **30 fps**, **50 fps**, **59.94 fps**, **60 fps** | **30 fps** |

The editor opens with the new project. Without a template, it starts with one video track (**V1**), one audio track (**A1**) and a black background. It appears at the top of **Recent projects**.

To stop without creating anything, click **Cancel**, press <kbd>Escape</kbd>, or click outside the dialog. Nothing is written to the folder until you click **Create project**.

> **Note:** A folder that already contains a project is refused with "The folder "<name>" already contains a project. Open it instead, or pick an empty folder." Other files already in the folder are left alone.

> **Tip:** You can change the name, resolution, frame rate and background later, also with clips on the timeline. See [Project settings and templates](project-settings-and-templates.md).

## Open an existing project

1. Click **Open project**, or press <kbd>Ctrl</kbd>+<kbd>O</kbd>.
2. Select the project folder itself (the folder that contains `project.json`), not a file or a subfolder inside it.
3. Allow access when the browser asks. See [Allow access to the project folder](#allow-access-to-the-project-folder).

You can also drag the project folder from File Explorer onto the start screen. While you drag, the window shows "Drop the project folder to open it".

> **Note:** A dropped folder can open read-only, because the browser may not ask for edit permission after a drop. Click **Allow editing** in the app bar to fix it. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

To switch to another project while one is open, press <kbd>Ctrl</kbd>+<kbd>O</kbd> in the editor. The current project is saved first, and it closes only after the new one has opened. If the new one cannot be opened, you stay in the current project.

To create a new project while one is open, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>, or run **New project** in the command palette. Here too, the current project is saved and closes once the new one has opened.

> **Note:** When the open project is read-only and has changes that were never saved, **Discard unsaved changes?** asks first. See [Before read-only changes are lost](projects-and-saving.md#before-read-only-changes-are-lost).

When a project closes, it frees the memory it used: its pictures in the graphics card's memory, its decoded sound and video, and its background work on thumbnails, waveforms and proxies. You can switch between projects as often as you like without reloading the page. A proxy that was being made starts over the next time you open its project; see [Close and reopen a project with proxies](proxies.md#close-and-reopen-a-project-with-proxies).

## Reopen a recent project

> **Video placeholder: Reopen a project from Recent projects**
> - File: `videos/getting-started/reopen-recent-project.mp4` (not recorded yet)
> - Length: about 30 seconds
> - Shows: with a project open, put the playhead on a striking frame and press <kbd>Ctrl</kbd>+<kbd>O</kbd> to open a second project; reload the page; the start screen shows both projects as cards, the first one with the striking frame as its picture, its name, its last save time, and its folder name with "1080×1920 · 30 fps"; click the first card; the browser asks for edit permission; allow it; the editor opens with the same name, panel sizes and playhead position; reload again, hover a card and point at the **X** (**Remove from recent projects**) without clicking it.

**Recent projects** shows up to 12 projects as cards, the most recently opened first. Each card shows:

- a picture of the project: the frame at the playhead when you last worked on it, or a film icon until the editor has taken one
- the project name
- the date and time of the last save
- the folder name, the frame size and the frame rate, for example "My short · 1080×1920 · 30 fps"

The editor takes the picture when you open another project from the editor, and when you switch to another browser tab or minimize the window (the next time, only if the project or the playhead changed).

1. Click a card.
2. If the browser asks for permission to edit the folder, allow it.

To take a project off the list, hover its card and click the **X** (**Remove from recent projects**). This only changes the list: the folder and its files stay on your disk.

> **Note:** The list is stored in your browser. Another browser or browser profile has its own list, and clearing the site data of Shorts Editor empties it. Your project folders are not affected; open them again with **Open project**.

## Allow access to the project folder

The browser lets Shorts Editor read and write only the folders you pick, and it asks you to confirm. When you open a project, the editor asks for permission to edit files in the folder.

| Your answer | What happens |
| --- | --- |
| You allow editing | The project opens normally and saves automatically. |
| You refuse editing, but the folder can still be read | The project opens read-only. A notice in the app bar says so and nothing is saved. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode). |
| The folder cannot be read at all | The **Permission needed** dialog shows "Shorts Editor has no permission to read the folder "<name>"." Click **Try again** to be asked again (even if you refused before), or **Cancel**. |

If the project links to media files outside its folder, the browser can also ask whether Shorts Editor may view those files. Allow it, or click **Allow access** later in the **Media** tab. See [Give the browser access to linked files](offline-media-and-relinking.md#give-the-browser-access-to-linked-files).

## If a project does not open

Problems are shown in a dialog. Close it with **OK** or <kbd>Escape</kbd>.

| Dialog title and message | What to do |
| --- | --- |
| **Could not open the project**: "The folder "<name>" has no project.json. Pick a project folder, or create a new project." | You picked a folder that is not a project, or a subfolder such as `media`. Pick the folder that contains `project.json`. |
| **Could not open the project**: "The project in "<name>" could not be read." followed by a list of problems | `project.json` is damaged or was edited by hand. Put back a backup: see [Restore an older version](projects-and-saving.md#restore-an-older-version). |
| **Could not open the project**: "... project.json was saved by a newer version of the app ..." | The project was saved by a newer Shorts Editor. Open it with that version. |
| **Could not open the project**: "The stored folder of "<name>" is not usable any more. Remove it and open the folder again." | Remove the entry from **Recent projects** and open the folder with **Open project**. |
| **Could not create the project**: "The folder "<name>" already contains a project. Open it instead, or pick an empty folder." | Open that folder with **Open project**, or create the project in an empty folder. |
| **Drop a project folder**: "Drop the folder that contains project.json, not single files." | You dropped files. Drop the project folder itself. |

For other problems, see [Troubleshooting](troubleshooting.md).

## Related pages
- [The workspace](workspace.md)
- [Projects and saving](projects-and-saving.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Settings](settings.md)
- [Importing media](importing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 50, 2026-10-18</sub>
