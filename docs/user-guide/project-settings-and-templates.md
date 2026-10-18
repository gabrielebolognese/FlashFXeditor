# Project settings and templates

The **Project** section of **Edit Properties** holds the settings of the open project: its name, frame size, frame rate and background, plus a few defaults that apply to every project. You can change the frame size and the frame rate at any time, also when the timeline is full: your clips, keyframes, captions and markers convert with them. Save a project's setup as a template to start new projects with the same size, tracks and text presets.

> **Video placeholder: Convert a project to 60 fps and save it as a template**
> - File: `videos/project-settings-and-templates/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 30 fps project with two videos and a dissolve on V1, their sound on A1, a title with the **Word pop** animation on V2 and two markers. Put the playhead at 2 seconds and click an empty area of the timeline tracks: the **Project** section shows.
>   2. Choose **60 fps** in **Frame rate**: the message **Converted to 60 fps** appears; the clips, the dissolve and the markers stay at the same places on the ruler, and the preview shows the same picture.
>   3. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the badge in the app bar reads 30 fps again. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>.
>   4. Choose **1:1 · 1080×1080** in **Resolution**: the **Change the frame size** dialog opens; click **Scale layout**: the pictures fit inside the square frame.
>   5. Click **Save as template…**, type `Square talk`, click **Save template**: the message **Saved the template Square talk** appears.
>   6. Reload the page: the start screen lists **Square talk** under **New from template**.

## In this page
- [Open the Project section](#open-the-project-section)
- [What the Project section sets](#what-the-project-section-sets)
- [Change the frame size](#change-the-frame-size)
- [Change the frame rate](#change-the-frame-rate)
- [Save a project as a template](#save-a-project-as-a-template)
- [Start a project from a template](#start-a-project-from-a-template)
- [Delete a template](#delete-a-template)
- [Related pages](#related-pages)

## Open the Project section

1. Click an empty area of the timeline tracks so that nothing is selected.
2. The **Edit Properties** panel shows the **Project** section.
3. Change a field. Text and number fields apply when you press <kbd>Enter</kbd> or click elsewhere; <kbd>Escape</kbd> puts back the previous value. See [Type a value](editing-properties.md#type-a-value).

The project badge in the app bar always shows the current resolution and frame rate.

## What the Project section sets

The first rows belong to the project. Each change to them is one undo step.

| Field | What it sets | Notes |
| --- | --- | --- |
| **Name** | The project name, the same as in the app bar. | Up to 120 characters. Renaming does not rename the folder. |
| **Resolution** | **9:16 · 1080×1920**, **4:5 · 1080×1350**, **1:1 · 1080×1080**, **16:9 · 1920×1080**, or **Custom**. | With pictures on the timeline, the editor asks how they should follow the new frame. See [Change the frame size](#change-the-frame-size). |
| **Size** (with **Custom** only) | **W** and **H** in pixels. | From 16 to 7680; odd values are rounded to an even number. Type a value, press <kbd>↑</kbd> or <kbd>↓</kbd> to change it by 2 (<kbd>Shift</kbd>: by 20), or drag the **W** or **H** letter: the frame takes the new size when you release. |
| **Frame rate** | **23.976 fps**, **24 fps**, **25 fps**, **29.97 fps**, **30 fps**, **50 fps**, **59.94 fps** or **60 fps**. | "Clips, keyframes, captions and markers convert to the new rate." See [Change the frame rate](#change-the-frame-rate). |
| **Background** | The color of the frame where no clip covers it: a swatch and its hex code. | Type a hex code (`#RGB`, `#RRGGBB` or `#RRGGBBAA`, with or without `#`), or click the swatch to open the color picker; see [Pick a color](editing-properties.md#pick-a-color). The default is `#000000` (black). Text that is not a valid color is ignored. |

The next rows are app settings: they apply to every project in this browser, they are not part of the project, and changing them is not an undo step. The same rows are in **Settings** > **General**, which has more of them; see [Settings](settings.md).

| Field | What it sets | Default |
| --- | --- | --- |
| **Still image** | How long an image you add to the timeline lasts, in seconds. | 5 s |
| **Title** | How long a new title or subtitle lasts when no video clip is under the playhead, in seconds. | 3 s |
| **Transition** | How long a new transition is, in frames. | 15 frames |
| **Autosave** | How long the editor waits after your last change before saving: **1 s after the last change**, **2 s after the last change**, **5 s after the last change** or **10 s after the last change**. See [How autosave works](projects-and-saving.md#how-autosave-works). | **1 s after the last change** |
| **Proxies** | Whether heavy videos get a proxy automatically. | On |
| **Proxy for** | Which videos get one: **Above 1080p or 30 fps**, **Above 1080p** or **Every video**. Dimmed while **Proxies** is off. | **Above 1080p or 30 fps** |
| **Proxy size** | The short side of new proxies: **360p**, **540p** or **720p**. Proxies already made keep their size. | **540p** |
| **Cache** | The size of the open project's cache, with **Clear cache**. See [Clear the cache](projects-and-saving.md#clear-the-cache). | |

The durations take 0.1 to 60 seconds, and <kbd>↑</kbd> or <kbd>↓</kbd> change them by 0.5 seconds. A transition takes 1 to 120 frames. For more about each row, see [Set the length of new clips](settings.md#set-the-length-of-new-clips), [Choose the default transition](settings.md#choose-the-default-transition) and [Change the proxy settings](proxies.md#change-the-proxy-settings).

The last row, **Project**, has two buttons:

| Button | What it does |
| --- | --- |
| **History…** | Lists the earlier versions of the project and restores one. See [Restore an older version](projects-and-saving.md#restore-an-older-version). |
| **Save as template…** | Saves the project's setup as a template. See [Save a project as a template](#save-a-project-as-a-template). |

## Change the frame size

> **Video placeholder: Change the frame size with Scale layout or Keep**
> - File: `videos/project-settings-and-templates/frame-size.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A 9:16 project with a full-frame vertical video on V1 and a logo in the top right corner on V2. Click an empty area of the timeline tracks.
>   2. Choose **4:5 · 1080×1350** in **Resolution**: the **Change the frame size** dialog reads "From 1080×1920 to 1080×1350."
>   3. Click **Scale layout**: the video now fits the height of the frame, with bands at the sides, and the logo stays in the corner, a little smaller.
>   4. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, choose **4:5 · 1080×1350** again and click **Keep**: the video keeps its size and is cut off at the top and bottom; the logo keeps its size and its distance from the center.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

Choose another **Resolution**, or type another size with **Custom**. When the timeline has pictures (videos, images, solids or text), the **Change the frame size** dialog asks how they should follow the new frame. It names the old and the new size, for example "From 1080×1920 to 1080×1350."

| Button | What happens |
| --- | --- |
| **Scale layout** (highlighted; <kbd>Enter</kbd>) | "Positions and sizes follow the new frame": every picture sits in the new frame as it sat in the old one. See [What Scale layout does](#what-scale-layout-does). |
| **Keep** | "Every layer keeps its size in pixels and its place from the center." A picture that filled the old frame can now be cut off or leave bands. |
| **Cancel**, <kbd>Escape</kbd> | The frame size stays as it was. |

Either choice is one undo step named **Change resolution**; <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts back the old size and layout. When the timeline has no pictures, for example in a new project, the size changes at once without the dialog.

### What Scale layout does

- Each picture keeps its place relative to the frame: its position moves in proportion to the new width and height.
- Each picture grows or shrinks by the smaller of the two size changes, so a picture that fit inside the old frame fits inside the new one. Angles and flips stay.
- Keyframes follow: the positions and scales stored in them change the same way, so animated pictures keep their motion in the new frame. See [Keyframes](keyframes.md).
- Pictures on locked tracks are scaled too.

For example, going from **9:16 · 1080×1920** to **4:5 · 1080×1350** makes every picture about 70% of its size: a full-frame vertical video now fits the height of the new frame, with bands at the sides. To cover the new frame, select the clips and click **Fill frame** in **Edit Properties**; to refit a picture to the frame, click **Fit in frame** or **Reset transform**. See [Fit, fill or center a picture](editing-properties.md#fit-fill-or-center-a-picture).

## Change the frame rate

> **Video placeholder: Convert a project to another frame rate**
> - File: `videos/project-settings-and-templates/frame-rate.mp4` (not recorded yet)
> - Length: about 50 seconds
> - Shows:
>   1. A 30 fps project with clips, a dissolve, keyframes on a logo, caption cues and markers. Put the playhead on a marker and click an empty area of the timeline tracks.
>   2. Choose **60 fps** in **Frame rate**: no dialog; the message **Converted to 60 fps** appears, the app bar badge reads 60 fps, and the playhead is still on the marker.
>   3. Choose **24 fps**: the **Convert to 24 fps?** dialog opens with a warning line that counts the rounded timings. Click **Cancel**: nothing changed.
>   4. Choose **24 fps** again and click **Convert**. Play the cut with the dissolve: it plays as before.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice: the project is at 30 fps again, exactly as at the start.

1. Open the **Project** section.
2. Choose a rate in **Frame rate**.
3. The editor converts every timing in the project to the new rate, so that each thing stays at the same moment:
   - When every timing lands on a whole frame of the new rate, for example from 30 to 60 fps, the project converts at once. The message **Converted to 60 fps** appears: "Every clip, keyframe, caption and marker moved from 30 fps. Undo reverts it."
   - When some timings fall between two frames of the new rate, for example from 30 to 24 fps, the **Convert to 24 fps?** dialog asks first. Click **Convert**, or **Cancel** (or press <kbd>Escape</kbd>) to keep the current rate.

The conversion is one undo step named **Change frame rate**. <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts back every timing exactly as it was, even after a conversion that rounded, and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> converts again.

### What converts

| Part of the project | How it converts |
| --- | --- |
| Clips | Their start and end move to the same moment at the new rate. |
| Video and audio clips | They play the same part of their media: the first and last frame shown stay the same, to within one frame of the media. |
| Fades and transitions | Their lengths, and the frames on each side of a cut. If a clip's fade in and fade out together would be longer than the clip after rounding, both get shorter in proportion to fit it. |
| Keyframes | Each stays at the same moment of its clip. |
| Caption cues | Their times, and the timing of each spoken word for the highlight. |
| Text animations | Their lengths and the delay between words or letters. |
| Markers | Each stays at the same moment. |
| Your view | The playhead, the in and out points and the timeline scroll stay on the same moments, and the zoom shows the same seconds across the screen. A selected gap and selected keyframes are deselected. |

A project with no clips and no markers takes the new rate without a message.

### When timings are rounded

A frame at one rate does not always fall on a frame at another: 30 fps has a frame every 1/30 second, 24 fps every 1/24 second. A timing between two frames of the new rate goes to the nearest one, so it can move by up to half a frame. The **Convert to … fps?** dialog says how much of the project that affects, for example "14 timings fall between frames and are rounded to the nearest one". It can also say:

- "… keyframes land on the frame of another and merge": two keyframes of a clip less than a frame apart at the new rate become one.
- "… clips move a frame later to keep the clip before it": a clip so short that it would round to nothing keeps one frame, and the clip right after it starts a frame later.

A video or audio clip you pasted from a project at another frame rate can play a part of its media that doesn't fit whole frames of the new rate. The conversion fits that part to the clip's new length and counts it among the rounded timings, so the **Convert to … fps?** dialog can ask first even for a rate that otherwise converts without rounding, such as 30 to 60 fps.

A rate that is a whole multiple of the current one converts without rounding: 30 to 60 fps, 25 to 50 fps and 29.97 to 59.94 fps. Going back down, for example from 60 to 30 fps, rounds only the timings that sit on odd frames.

> **Tip:** Choose the frame rate before you edit when you can, and convert to a lower rate only once, at the end. Each lossy conversion can round timings again.

### Paste clips from a project at another frame rate

Clips you copy in a project at another frame rate convert the same way when you paste them: they keep their length in time, with their fades, transitions, keyframes, animations and word timings, rounded to the nearest frame of this project. This also works for **Paste attributes**. See [Paste clips into another project](copy-and-paste.md#paste-clips-into-another-project).

## Save a project as a template

> **Video placeholder: Save and use a template**
> - File: `videos/project-settings-and-templates/templates.mp4` (not recorded yet)
> - Length: about 60 seconds
> - Shows:
>   1. A 1:1 project with tracks named "Main", "B-roll", "Titles", a **CC** track with a yellow caption style, and two presets in the **Project** list of the **Presets** tab.
>   2. Click an empty area of the timeline tracks, then **Save as template…** in the **Project** section. Type `Square talk` and press <kbd>Enter</kbd>: the message **Saved the template Square talk** appears.
>   3. Reload the page: under **New from template**, the row reads **Square talk** with "1080×1080 · 30 fps · 4 tracks · 2 presets".
>   4. Click the row and pick an empty folder: the **New project** dialog opens with **Template** set to **Square talk** and **Resolution** set to **1:1 · 1080×1080**.
>   5. Click **Create project**: the new project has the four tracks, the yellow caption style and the two project presets, and no clips.

A template keeps the setup of a project so you can start new projects with it: "the frame size, frame rate, background, the tracks (with the caption style) and this project's text presets. No media and no clips."

1. Open the project whose setup you want to keep.
2. Click **Save as template…** in the **Project** section, or run **Save as template…** in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
3. In the **Save as template** dialog, type a **Name**. It starts as the project name and takes up to 80 characters.
4. Click **Save template**, or press <kbd>Enter</kbd> in the **Name** field. The message **Saved the template** with its name appears.

What a template keeps:

| Kept | Not kept |
| --- | --- |
| The frame size, frame rate and background color | Media, clips and markers |
| Every track, in order: its name, kind, height, and whether it is locked, muted, soloed, hidden or targeted | The view: playhead, zoom, panel sizes |
| The style of the captions track | The project name and folder |
| The project's own text presets (the **Project** list of the **Presets** tab; see [Keep presets for all projects or for one](text-presets.md#keep-presets-for-all-projects-or-for-one)) | Your **Global** presets, which every project has anyway |

- A template with the same name, in any mix of capitals, is replaced, and the message reads **Updated the template** instead.
- Templates are stored in your browser, like **Recent projects**: up to 50, the newest first. Another browser or browser profile has its own templates, and clearing the site data of Shorts Editor deletes them.
- Saving a template is not an undo step and does not change the project. It also works in a read-only project.

## Start a project from a template

1. On the start screen, find the template under **New from template**. Each row shows the name, then the frame size, the frame rate, the number of tracks and, when it has any, the number of presets, for example "1080×1920 · 30 fps · 3 tracks · 2 presets".
2. Click the row (tooltip **New project from this template**).
3. Pick an empty folder for the project and allow editing when the browser asks.
4. The **New project** dialog opens with the template chosen in **Template**. **Resolution** and **Frame rate** show the template's values; you can still change them. The note under the fields reads "From" with the template's name and what it holds, then "Its tracks, caption style, background and presets come with it."
5. Click **Create project**.

The new project starts with the template's tracks, caption style, background and text presets, and no clips.

You can also pick a template in the **New project** dialog itself, whichever way you opened it: the **Template** field lists **None: V1 and A1** and every template. It appears only when you have at least one template. See [Create a project](getting-started.md#create-a-project).

> **Note:** Until you save a template, the start screen reads "No templates yet. In a project, Save as template (Project section or the palette) keeps its size, frame rate, tracks and presets."

## Delete a template

1. On the start screen, hover the template's row under **New from template**.
2. Click the **X** (**Delete template**).

The template is deleted at once, without a question, and can't be brought back. Projects you made from it keep everything they got.

## Related pages
- [Projects and saving](projects-and-saving.md)
- [Settings](settings.md)
- [Getting started](getting-started.md)
- [Editing properties](editing-properties.md)
- [Tracks](tracks.md)
- [Text presets](text-presets.md)
- [Captions](captions.md)
- [Keyframes](keyframes.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Proxies](proxies.md)
- [Troubleshooting](troubleshooting.md#project-settings-and-templates)

<sub>Last updated: Batch 50, 2026-10-18</sub>
