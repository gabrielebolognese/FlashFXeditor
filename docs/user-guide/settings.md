# Settings

The **Settings** dialog holds the choices that apply to every project you open in this browser: how soon the editor saves, how long new clips and transitions last, how punch zoom and keyframes behave, the defaults for ducking, silence removal and transcription, how imports bring in your files, and the storage the editor uses. Its **Shortcuts** tab changes your keyboard shortcuts, and its **About** tab shows the version of the editor and the way to help and licenses.

> **Video placeholder: Set your defaults in Settings**
> - File: `videos/settings/overview.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. Click **Settings** (the gear) at the right end of the app bar: the dialog opens on **General**.
>   2. Under **New clips**, click in **Still image**, type `2` and press <kbd>Enter</kbd>.
>   3. Under **Transitions**, choose **Dip to black** in **Transition** and type `10` in **Length**.
>   4. Under **Editing**, type `1.5` in **Punch zoom**.
>   5. Scroll to **Storage**: **Cache** shows the size of the open project's cache.
>   6. Click **Done**. Click a cut on the timeline and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>: a 10-frame dip to black appears. Click **Add image** and pick a logo: its clip lasts 2 seconds.

## In this page
- [Open Settings](#open-settings)
- [Change how often the project saves](#change-how-often-the-project-saves)
- [Set the length of new clips](#set-the-length-of-new-clips)
- [Choose the default transition](#choose-the-default-transition)
- [Change how editing behaves](#change-how-editing-behaves)
- [Set the audio defaults](#set-the-audio-defaults)
- [Set the transcription defaults](#set-the-transcription-defaults)
- [Choose how media are imported](#choose-how-media-are-imported)
- [Manage storage](#manage-storage)
- [See the version and get help](#see-the-version-and-get-help)
- [Related pages](#related-pages)

## Open Settings

1. Click **Settings** (the gear) at the right end of the app bar, or run **Settings** in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
2. The dialog opens on the **General** tab. It has three tabs: **General**, **Shortcuts** and **About**. Click **Shortcuts** to change your keys; see [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut). **Edit shortcuts** in the **Keyboard shortcuts** sheet opens the dialog on **Shortcuts**, and **About Shorts Editor** in the command palette opens it on **About**; see [See the version and get help](#see-the-version-and-get-help).
3. Change what you need. Each change takes effect at once.
4. Click **Done**, or press <kbd>Escape</kbd>.

What to know about the settings:

- They are stored in your browser, for all your projects, not in a project folder. Another browser or browser profile has its own settings.
- Changing a setting is not an undo step.
- Number fields apply when you press <kbd>Enter</kbd> or click elsewhere. <kbd>↑</kbd> and <kbd>↓</kbd> change the value by one step, <kbd>Shift</kbd>+<kbd>↑</kbd> and <kbd>Shift</kbd>+<kbd>↓</kbd> by ten steps. A value outside the range goes to the nearest limit.
- Some rows are also in the **Project** section of **Edit Properties**: **Autosave**, **Still image**, **Title**, the transition length (named **Transition** there), the proxy rows and **Cache**. Both places change the same setting. See [What the Project section sets](project-settings-and-templates.md#what-the-project-section-sets).

The **General** tab has eight groups: **Saving**, **New clips**, **Transitions**, **Editing**, **Audio**, **Transcription**, **Media** and **Storage**.

## Change how often the project saves

The **Saving** group has one row:

| Row | What it sets | Choices | Default |
| --- | --- | --- | --- |
| **Autosave** | How long the editor waits after your last change before saving. While you keep making changes, it still saves at least every 5 seconds, or every 10 seconds with the longest choice. | **1 s after the last change**, **2 s after the last change**, **5 s after the last change**, **10 s after the last change** | **1 s after the last change** |

The note under it reminds you that every save keeps the previous version in the project's `history` folder, the last 20, and that **History…** in the **Project** section restores one. See [How autosave works](projects-and-saving.md#how-autosave-works) and [Restore an older version](projects-and-saving.md#restore-an-older-version).

## Set the length of new clips

The **New clips** group sets how long the clips the editor makes for you last. Clips already on the timeline keep their length.

| Row | What it sets | Range | Default |
| --- | --- | --- | --- |
| **Still image** | An image you add to the timeline with **Add image**, a drop, a drag or an insert, also an animated GIF or WebP. | 0.1 to 60 s | 5 s |
| **Title** | A new title or subtitle (<kbd>T</kbd>, <kbd>Shift</kbd>+<kbd>T</kbd>, **Title**, **Subtitle**) when **Match clip** is off, or when no video clip is under the playhead. | 0.1 to 60 s | 3 s |
| **Match clip** | On: a new title lasts until the end of the video clip under the playhead, so it covers the rest of that shot. Off: every new title lasts the **Title** length. | On or off | On |
| **Solid** | A solid you add with **Add solid**. | 0.1 to 60 s | 5 s |
| **Freeze frame** | A freeze frame (<kbd>Shift</kbd>+<kbd>F</kbd>). | 0.1 to 60 s | 2 s |

- The durations are in seconds, with one decimal; <kbd>↑</kbd> and <kbd>↓</kbd> change them by 0.5 seconds.
- A duration becomes whole frames at the project's frame rate, at least 1 frame: 2 seconds is 60 frames at 30 fps and 48 frames at 24 fps.
- A text added from a preset that has its own length keeps that length.

See [Where a new title goes](titles-and-text.md#where-a-new-title-goes), [Add a shape](shapes-and-images.md#add-a-shape) and [Hold a frame (freeze frame)](speed-freeze-frames-and-punch-zoom.md#hold-a-frame-freeze-frame).

## Choose the default transition

The **Transitions** group sets the transition the editor adds:

| Row | What it sets | Choices | Default |
| --- | --- | --- | --- |
| **Transition** | The kind <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> adds at the selected cut or the nearest cut. | **Cross dissolve**, **Dip to black**, **Dip to white** | **Cross dissolve** |
| **Length** | How long every new transition is: from <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, the quick actions **Add dissolve**, **Add dip to black** and **Add dip to white**, and the **Transition** row of the clip menu. | 1 to 120 frames | 15 frames |

The quick action buttons and the clip menu still add their own kind; only their length follows **Length**. A transition gets shorter when the clips don't have enough media; see [Know how much media a transition needs](fades-and-transitions.md#know-how-much-media-a-transition-needs). The length counts frames, so it lasts longer at a low frame rate: 15 frames is half a second at 30 fps and a quarter second at 60 fps.

## Change how editing behaves

The **Editing** group:

| Row | What it sets | Range | Default |
| --- | --- | --- | --- |
| **Follow source** | On: when you trim the start of a video or audio clip, or slip it, its keyframes stay on the same frames of the video or moments of the sound. Off: they stay at the same distance from the clip's start, like the keyframes of images, solids and text. | On or off | On |
| **Punch zoom** | How much closer <kbd>Shift</kbd>+<kbd>Z</kbd> zooms: the scale of the picture after the cut is multiplied by this value. | 1.05× to 3×, in steps of 0.05 | 1.2× (20% closer) |
| **Animate zoom** | On: punch zoom zooms in over 6 frames and lands softly. Off: the picture after the cut is larger at once, a plain cut-in. | On or off | On |

See [Know what happens to keyframes when you edit clips](keyframes.md#know-what-happens-to-keyframes-when-you-edit-clips) and [Punch in at a cut (punch zoom)](speed-freeze-frames-and-punch-zoom.md#punch-in-at-a-cut-punch-zoom).

## Set the audio defaults

The **Audio** group holds the values of **Auto-duck** and **Remove silence**:

| Row | What it sets | Range | Default |
| --- | --- | --- | --- |
| **Duck depth** | How far **Auto-duck** lowers the music under a voice. | 1 to 60 dB | 12 dB |
| **Duck ramps** | How many frames the music takes to go down before a voice and to come back up after it. Voices closer than two ramps share one dip. | 0 to 120 frames | 10 frames |
| **Silence below** | The **Threshold** of **Remove silence**: sound quieter than this counts as silence. | -60 to -10 dB | -40 dB |
| **Shortest silence** | The **Min** of **Remove silence**: the shortest pause that is cut. | 100 to 5000 ms, in steps of 50 ms | 500 ms |
| **Keep around** | The **Pad** of **Remove silence**: how much of each pause stays before and after the sound. | 0 to 1000 ms, in steps of 10 ms | 150 ms |

The **Remove silence** row of **Edit Properties** opens with the last three values, and what you set in the row is stored here. See [Lower music under voices with Auto-duck](audio-editing.md#lower-music-under-voices-with-auto-duck) and [Set the threshold, minimum silence and padding](removing-silence.md#set-the-threshold-minimum-silence-and-padding).

## Set the transcription defaults

The **Transcription** group:

| Row | What it does |
| --- | --- |
| **Model** | The model the **Transcribe captions** dialog starts with: **Whisper Tiny**, **Whisper Base** (the default) or **Whisper Small**. |
| **Language** | The language it starts with: **Detect automatically** (the default) or one language. |
| **Downloaded** | The models your browser keeps, each with **Remove** (tooltip **Delete this model's files from the browser (it downloads again next time)**). With none, the row reads "None: a model downloads the first time it is used." |

Click **Remove** next to a model to free its space: the button reads **Removing…**, then the message **Removed Whisper** with the model's name appears. The next transcription with that model downloads it again. See [Choose a model](transcription.md#choose-a-model), [Choose the language](transcription.md#choose-the-language) and [Manage downloaded models](transcription.md#manage-downloaded-models).

## Choose how media are imported

The **Media** group:

| Row | What it sets | Default |
| --- | --- | --- |
| **Import** | Whether imports copy your files into the project folder or link to them where they are: **Copy files into the project folder** or **Link to the original files**. See [Copy or link your files](importing-media.md#copy-or-link-your-files). | **Copy files into the project folder** |
| **Proxies** | Whether heavy videos get a proxy automatically when you import them. | On |
| **Proxy for** | Which videos get one: **Above 1080p or 30 fps**, **Above 1080p** or **Every video**. Dimmed while **Proxies** is off. | **Above 1080p or 30 fps** |
| **Proxy size** | The short side of new proxies: **360p**, **540p** or **720p**. | **540p** |

See [Change the proxy settings](proxies.md#change-the-proxy-settings).

## Manage storage

The **Storage** group:

| Row | What it shows and does |
| --- | --- |
| **Cache** | The size of the open project's cache, for example "777 KB · 11 files", or **Empty**. **Clear cache** deletes the cache; the editor asks first. With no project open, the row reads **No project is open** and **Clear cache** is dimmed (tooltip **Open a project to clear its cache**). It waits while a video export runs. See [Clear the cache](projects-and-saving.md#clear-the-cache). |
| **Preset folder** | The library folder your **Global** text presets are synced with, and its state: **Syncing…**, **Synced**, **Needs permission: Sync to allow**, or a reason when it can't sync. With no folder: "None: presets stay in this browser". Click **Choose…** (or **Change…**) to pick a folder. With a folder, the buttons next to it sync again (**Sync the presets library folder**) and stop syncing (**Stop syncing the presets library folder**). See [Sync your presets with a folder](text-presets.md#sync-your-presets-with-a-folder). The folder also keeps your **My fonts**; see [Where My fonts are kept](fonts.md#where-my-fonts-are-kept). |
| **Starter presets** | **Restore** brings back the starter presets you deleted. See [Restore the starter presets](text-presets.md#restore-the-starter-presets). |

## See the version and get help

The **About** tab tells you which version of Shorts Editor you are running and how it draws the picture, takes you to the shortcut sheet and the command palette, and lists the open-source packages and fonts that come with the editor, with the designer and license of every font of the font library.

> **Video placeholder: The About tab**
> - File: `videos/settings/about.mp4` (not recorded yet)
> - Length: about 40 seconds
> - Shows:
>   1. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, type `about` and press <kbd>Enter</kbd>: **Settings** opens on the **About** tab.
>   2. Point at **Version** (1.0.0) and **Renderer** (**WebGPU**).
>   3. Click **View licenses**: the license list opens in a new browser tab. Go back to the editor's tab.
>   4. Scroll down to **Font licenses** and click **Cinzel** ("Natanael Gama · SIL Open Font License 1.1"): its license text opens in a new browser tab. Go back to the editor's tab.
>   5. Click **Keyboard shortcuts**: **Settings** closes and the **Keyboard shortcuts** sheet opens. Press <kbd>Esc</kbd>.

1. Open the **About** tab in one of these ways:
   - Run **About Shorts Editor** in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>). Typing `version`, `licenses` or `help` finds it too. It has no key by default.
   - Open **Settings** and click the **About** tab.
2. Click **Done**, or press <kbd>Escape</kbd>, to close it.

The tab works on the start screen too, before you open a project. It has four groups:

| Group | Row | What it shows and does |
| --- | --- | --- |
| **Shorts Editor** | **Version** | The version of the editor, for example 1.0.0. Every save writes this version into the project's `project.json`. |
| | **Renderer** | How the editor draws the preview and the frames of your exports: **WebGPU**, or **WebGL2** on computers without WebGPU or when you started the editor with `?renderer=webgl2`. See [Check your browser](getting-started.md#check-your-browser). It reads **Not started** if the editor hasn't set up your graphics card yet. |
| **Help** | **Shortcuts** | **Keyboard shortcuts** closes **Settings** and opens the sheet of every key. See [See every shortcut](command-palette-and-custom-shortcuts.md#see-every-shortcut). |
| | **Commands** | **Command palette** closes **Settings** and opens the palette, where you can find every command by name, with its shortcut. See [Run a command from the palette](command-palette-and-custom-shortcuts.md#run-a-command-from-the-palette). |
| **Licenses** | **Third party** | **View licenses** (tooltip **Open the license list in a new tab**) opens the list of the open-source packages and the fonts that come with the editor, with their license texts, in a new browser tab. |
| **Font licenses** | | Every font of the font library, 330 in all, with its designer and license, for example "Natanael Gama · SIL Open Font License 1.1" for Cinzel. Click a font (tooltip **Open the license of Cinzel**) to open its license text in a new browser tab. The list reads **Reading the font library…** for a moment the first time. See [See the font licenses](fonts.md#see-the-font-licenses). |

The note under **Shorts Editor** sums up how the editor works: "A video editor for short vertical videos. Projects are folders on your disk, and your media never leaves your computer." The note under **Font licenses** reads "The fonts of the font library are free to use in your videos and come under these open licenses. Each name opens its license text."

## Related pages
- [Fonts](fonts.md)
- [Exporting your video](exporting-video.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Projects and saving](projects-and-saving.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Getting started](getting-started.md)
- [Importing media](importing-media.md)
- [Proxies](proxies.md)
- [Titles and text](titles-and-text.md)
- [Text presets](text-presets.md)
- [Fades and transitions](fades-and-transitions.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Keyframes](keyframes.md)
- [Editing audio](audio-editing.md)
- [Removing silence](removing-silence.md)
- [Transcription](transcription.md)

<sub>Last updated: Batch 51, 2026-10-19</sub>
