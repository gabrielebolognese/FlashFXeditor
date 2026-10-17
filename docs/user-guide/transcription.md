# Transcription

Transcription turns the speech in your edit into captions. The editor listens to the timeline's audio on your computer, writes what is said as cues on the **CC** track, and times each word so the spoken word lights up as it plays. Use it to caption a talking-head video in a minute instead of typing every line, then fix the few words it got wrong in the **Captions** tab.

> **Video placeholder: Transcribe a video in one minute**
> - File: `videos/transcription/overview.mp4` (not recorded yet)
> - Length: about 75 seconds
> - Shows:
>   1. A 1080×1920 project with a one-minute talking-head video on V1 and its sound on A1, and no captions. Open the **Captions** tab of the Media panel: **No captions yet**, with **Transcribe** as the first button.
>   2. Click **Transcribe**. The **Transcribe captions** dialog opens: **Tiny**, **Base** and **Small** with their sizes, **Base** selected, **Detect automatically** under **Language**, and the span of the whole timeline under **Range**.
>   3. Click **Download 209 MB and transcribe**. A message at the top counts the download up in MB, then reads **Detecting the language** and **Transcribing** with a percentage, while its bar fills.
>   4. Press <kbd>Space</kbd> while it runs: the video plays smoothly. Press <kbd>Space</kbd> again.
>   5. **Review the transcript** opens: **18 cues · 156 words · English · Whisper Base on WebGPU**, and the cues with their start times. Click **Add 18 captions**.
>   6. The cues fill the **CC** row and the **Captions** tab. Press <kbd>Home</kbd>, then <kbd>Space</kbd>: white captions play in the lower third, each word turning yellow as it is spoken.
>   7. Click into a cue in the list and fix a misheard word. Hover **Undo** in the app bar: **Undo Transcribe captions** is one step back.

## In this page
- [How transcription works](#how-transcription-works)
- [Before you start](#before-you-start)
- [Transcribe your video](#transcribe-your-video)
- [Choose a model](#choose-a-model)
- [Choose the language](#choose-the-language)
- [Transcribe part of the timeline](#transcribe-part-of-the-timeline)
- [Follow the progress or cancel](#follow-the-progress-or-cancel)
- [Review the transcript](#review-the-transcript)
- [How the speech becomes cues](#how-the-speech-becomes-cues)
- [Fix the captions](#fix-the-captions)
- [Speed and accuracy](#speed-and-accuracy)
- [Manage downloaded models](#manage-downloaded-models)
- [If a transcription doesn't start](#if-a-transcription-doesnt-start)
- [Undo a transcription](#undo-a-transcription)
- [What is not available yet](#what-is-not-available-yet)
- [Related pages](#related-pages)

## How transcription works

- The editor transcribes with **Whisper**, a speech recognition model. You choose one of three sizes: **Tiny**, **Base** or **Small**.
- Everything runs on your computer, on the graphics card when the browser can use it, or else on the processor. Your audio never leaves your computer.
- The model is downloaded once, the first time you use it, and stays in your browser. After that, transcription works without an internet connection.
- The editor transcribes what you hear when you play the timeline: the mix of every audio track, with muted tracks and muted clips left out, and each clip at its volume. It does not read the media files one by one.
- You always see the result before it goes in. Nothing changes in your project until you click **Add** (or **Replace**) in the review.
- The new cues have word timings, so the spoken word is highlighted out of the box. See [Highlight the spoken word](captions.md#highlight-the-spoken-word).

## Before you start

- **Put the speech on the timeline.** **Transcribe** is dimmed until the timeline has an audio clip, such as the sound of a video. Its tooltip then reads **Transcribe: no audio on the timeline**.
- **Be online the first time.** The first transcription with a model downloads it: 44 MB to 589 MB, depending on the model and your computer. See [Choose a model](#choose-a-model).
- **Leave music out.** Whisper can mishear words under loud music, or try to write down song lyrics. Solo the track with the voice (**S** in its header) or mute the music track (**M**) before you transcribe, and turn it back on afterwards. See [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks). To leave out a single clip, mute it; see [Mute a clip](audio-editing.md#mute-a-clip).
- **Set the number of lines first.** Cues get as many lines as **Max lines** in **Caption style** allows (2 by default). To get one-line captions, add the caption track, set **Max lines** to `1`, then transcribe. Changing **Max lines** afterwards doesn't cut the cues again. See [Style your captions](captions.md#style-your-captions).

> **Tip:** The **Master volume** knob and the **Mute** button under the preview make no difference: they only change what you hear.

## Transcribe your video

1. Open the **Captions** tab of the Media panel.
2. Click **Transcribe the timeline's audio into cues (on this computer)** (the microphone) in the Captions header. In a project without a caption track, you can also click **Transcribe** in the middle of the tab.
3. In the **Transcribe captions** dialog, check the model, the language and the range. The editor remembers your last model and language.
4. Click **Transcribe**. When the model isn't downloaded yet, the button reads **Download N MB and transcribe**, for example **Download 209 MB and transcribe**.
5. Follow the progress in the message at the top of the window. You can keep working meanwhile. See [Follow the progress or cancel](#follow-the-progress-or-cancel).
6. In **Review the transcript**, read the cues and click **Add N captions**, for example **Add 18 captions**. See [Review the transcript](#review-the-transcript).

The cues appear on the **CC** track and in the **Captions** tab, and a message says, for example, **Added 18 captions** ("English, Whisper Base. Undo removes them."). When the project had no caption track, the editor adds one, in the default caption style.

> **Tip:** When the dialog opens, **Transcribe** has the keyboard focus: press <kbd>Enter</kbd> to start with the choices shown, or <kbd>Esc</kbd> to close the dialog.

The **Transcribe captions** dialog has these parts:

| Part | What it shows |
| --- | --- |
| **Model** | **Tiny**, **Base** and **Small**, each with a short description and **Downloaded** (with a check mark) or its download size. Click a row to choose it. |
| **Language** | **Detect automatically**, or one of 99 languages. See [Choose the language](#choose-the-language). |
| **Range** | The part of the timeline to transcribe, as start and end timecodes. With an in/out range, the chips **In to out** and **Whole timeline** let you choose. See [Transcribe part of the timeline](#transcribe-part-of-the-timeline). |
| Note | Where it runs: **Runs on the graphics card (WebGPU) of this computer; the audio never leaves it.**, or **the processor (WebAssembly)**. For a model that isn't downloaded, it adds **The model downloads once from Hugging Face and stays in this browser.** While the dialog checks your models, it reads **Checking the downloaded models…** |
| Warning | When the range already has cues, for example: **The 3 cues in this range will be replaced: you review the new ones first.** |
| **Remove model** | Shown when the chosen model is downloaded. See [Manage downloaded models](#manage-downloaded-models). |
| **Cancel** | Closes the dialog. Nothing starts. |
| **Transcribe** | Starts. Dimmed when the timeline is empty, and the range reads **The timeline is empty**. |

## Choose a model

Pick the model in the **Model** list of the dialog. **Base** is the default.

| Model | Description in the dialog | Download on the graphics card (WebGPU) | Download on the processor (WebAssembly) |
| --- | --- | --- | --- |
| **Tiny** | **Fastest, rough on noisy audio** | 123 MB | 44 MB |
| **Base** | **Good balance (default)** | 209 MB | 80 MB |
| **Small** | **Most accurate, slowest** | 589 MB | 252 MB |

- The dialog shows the size for the way it runs on your computer. A model shows **Downloaded** once its files are in your browser.
- Start with **Base**. Choose **Small** for noisy recordings, accents, or a language other than English, when you can wait longer. Choose **Tiny** for a quick draft.
- With **Tiny**, the word highlight can trail the voice by about 0.2 seconds. With **Base**, it lands on each word as it begins.

See [Speed and accuracy](#speed-and-accuracy).

## Choose the language

The **Language** list starts with **Detect automatically**, followed by the 99 languages Whisper knows, in alphabetical order by their English names.

- **Detect automatically** listens to the first 30 seconds of the range and picks the language it hears most likely. The progress message shows **Detecting the language**, and the review names the language it found.
- Choose the language yourself when the range starts with music or silence, when the speakers mix languages, or when the detected language was wrong. Whisper then writes in that language, and skips the detection.
- Chinese, Japanese, Thai, Lao and Burmese captions are written without spaces between words, as these languages are. Chinese, Japanese and Korean characters are wider, so their lines hold about 16 characters instead of 32.

## Transcribe part of the timeline

> **Video placeholder: Transcribe a range and replace its cues**
> - File: `videos/transcription/range.mp4` (not recorded yet)
> - Length: about 45 seconds
> - Shows:
>   1. A project with a transcribed talk on **CC**. A sentence in the middle was misheard. Press <kbd>I</kbd> before the sentence and <kbd>O</kbd> after it: the range is shaded.
>   2. Click the microphone in the Captions header. Under **Range**, **In to out** is selected, and the span shows the range. The warning reads **The 2 cues in this range will be replaced: you review the new ones first.**
>   3. Click **Small**, then **Download 589 MB and transcribe**. Wait for the review.
>   4. The review reads **They replace the 2 cues in …** with the range. Click **Replace 2 cues**: only the cues of the range change.
>   5. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the old cues are back.

The range decides which audio the editor listens to, and where the new cues go.

- **Whole timeline:** from the first frame to the end of the last clip. This is the range when no in/out range is set.
- **In to out:** the in/out range. When you set in and out points, the dialog shows the chips **In to out** (tooltip **Transcribe the in/out range**) and **Whole timeline** (tooltip **Transcribe the whole timeline**), and starts on **In to out**. With only an in point, the range runs to the end of your content; with only an out point, from the start. See [Set in and out points](markers-and-in-out-points.md#set-in-and-out-points).

The editor hears only the audio inside the range, and the new cues stay inside it: a cue that would run past the end of the range ends there.

When the range already has cues, the transcription replaces them:

- Every cue that touches the range is replaced, also a cue that starts before the range or ends after it. The cues outside the range stay as they are.
- The dialog warns you before you start, and the review counts the cues it will replace. Its button then reads **Replace N cues**.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings the old cues back.

> **Tip:** To fix one misheard sentence, mark it with <kbd>I</kbd> and <kbd>O</kbd> and transcribe just that range with **Small**. Leave a little room around the sentence, so its first and last words are inside the range.

## Follow the progress or cancel

While the editor transcribes, a message at the top of the window shows each phase with a progress bar and a **Cancel** button:

| Message | Detail | When |
| --- | --- | --- |
| **Preparing the audio** | Mixing the timeline's audio of the range. | First, for a moment |
| **Downloading Whisper Base** | For example **198 of 589 MB. Only this once: the model stays in this browser.** | Only when the model isn't downloaded yet |
| **Loading Whisper Base** | From this browser's cache. | Instead of the download, when the model is already downloaded: a few seconds |
| **Detecting the language** | Whisper Base, on this computer. | Only with **Detect automatically** |
| **Transcribing · 26%** | The language and the model, for example **English · Whisper Base, on this computer** | Until the review opens |

- The microphone in the Captions header looks pressed while the transcription runs. Its tooltip reads **Cancel the transcription**.
- You can keep working: play, scrub and edit. The transcription uses the audio as it was when you clicked **Transcribe**.
- Playback stays smooth. While the timeline plays, the percentage holds still; it catches up when you stop.
- If you close the message with its **Dismiss** button (the ×), the transcription goes on, and the review still opens when it is done.

To stop a transcription, click **Cancel** in the message, or click the pressed microphone.

- The message **Transcription cancelled** ("The captions were not changed.") appears. Your project is exactly as it was, with the same **Undo** and **Redo** steps.
- A download you cancel isn't kept: the model still shows its download size, and the next transcription downloads it again.
- Opening another project also stops a transcription, or closes its review.

## Review the transcript

When the transcription is done, the **Review the transcript** dialog opens.

- At the top, a summary: the number of cues and words, the language, and the model with where it ran, for example **18 cues · 156 words · English · Whisper Base on WebGPU**.
- The cues, each with its start time and its text, as they will look on the **CC** track.
- At the bottom, what happens when you add them: **They go on the caption track with word timings, so the spoken word is highlighted. Undo removes them.** When they replace cues, it reads, for example, **They replace the 2 cues in** followed by the range, and **Undo brings them back.**

Then:

| Button | What it does |
| --- | --- |
| **Add N captions** | Puts the cues on the **CC** track in one step, **Transcribe captions**, and opens the **Captions** tab. It has the keyboard focus, so <kbd>Enter</kbd> adds the cues. |
| **Replace N cues** | Shown instead when the range has cues: replaces them with the new ones, in the same single step |
| **Discard** | Drops the result. Your project doesn't change. |

> **Important:** <kbd>Esc</kbd>, the close button and a click outside the dialog discard the result too. To get it back, transcribe again: the model is already downloaded, so it is quicker the second time.

You can't edit the cues in the review. Add them, then fix them in the **Captions** tab. See [Fix the captions](#fix-the-captions).

## How the speech becomes cues

The editor cuts the words it hears into cues the way a subtitler would:

- **Phrases:** a cue ends at the end of a sentence (`.`, `?`, `!`) and at a pause of 0.7 seconds or more.
- **Length:** a phrase that fits in **Max lines** of the caption style is one cue. A longer phrase is cut into as few cues as possible, of even length, preferably after a comma.
- **Lines:** each line holds about 32 characters (about 16 Chinese, Japanese or Korean characters). The lines of a cue are kept even, with the longer line at the bottom.
- **Timing:** a cue starts with its first word and stays on screen until the next cue when that one follows within 0.7 seconds. Otherwise, it stays 0.3 seconds after its last word. A cue lasts at least 0.6 seconds where there is room, and never runs past the range.
- **Very short cues:** a cue that would show for less than 0.2 seconds joins the next cue when both fit together, so you can read it.
- **Words:** every word of a cue has its own timing, a little before Whisper's own estimate, so the highlight lands as the word begins. The cue's times sit on the frames of the project.
- **Sounds that aren't speech:** notes such as `[Music]`, `(laughs)` or `♪` are left out.

The cues look like any other cues: they take the caption style of the track, and you edit them like cues you typed.

## Fix the captions

Whisper rarely gets everything right. After you add the cues:

1. Play the captions and look for mistakes, such as a misheard word, a name, or a number written as digits ("9" for "nine").
2. Click into the cue in the **Captions** tab and fix it. Use **Search cues** to find every place a name was misheard. See [Edit a cue's text](captions.md#edit-a-cues-text).
3. To split a long cue, press <kbd>Enter</kbd> where the second cue should start: the second cue starts when its first word is spoken. To join two cues, press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> at the start of the second. See [Split and merge cues](captions.md#split-and-merge-cues).

- Word timings stay when you edit the text, split a cue or trim it. The highlight looks for each timed word in the text, in capitals or not: a word you replace with a different word is no longer highlighted, and a word you add has no timing. The words around it keep theirs.
- To change the look of the captions, or how the spoken word is highlighted, use the **Caption style** section. See [Style your captions](captions.md#style-your-captions) and [Highlight the spoken word](captions.md#highlight-the-spoken-word).
- For a passage that came out badly, transcribe just that range again with **Small**. See [Transcribe part of the timeline](#transcribe-part-of-the-timeline).

## Speed and accuracy

How long a transcription takes depends on the model, the length of the range and your computer.

- On a laptop graphics card, **Base** transcribes a minute of speech in about 30 seconds and **Tiny** in about 20 seconds, plus a few seconds to load the model and to detect the language. **Small** is the slowest.
- On the processor (WebAssembly), **Tiny** takes about the same time as on the graphics card; larger models take longer.
- The first transcription with a model also waits for its download.
- The review shows where it ran: **on WebGPU** (the graphics card) or **on WebAssembly** (the processor).

What to expect from the result:

- On clear speech, **Base** gets nearly every word right. It can write numbers as digits and mishear words that sound alike.
- Noise, music, overlapping voices and strong accents make mistakes more likely. **Small** handles them best.
- With **Base**, the highlighted word follows the voice closely. With **Tiny**, it can come about 0.2 seconds late.

## Manage downloaded models

> **Video placeholder: Remove a downloaded model**
> - File: `videos/transcription/models.mp4` (not recorded yet)
> - Length: about 25 seconds
> - Shows:
>   1. Open the **Transcribe captions** dialog: **Tiny** and **Base** show **Downloaded**, **Small** its size.
>   2. Click **Tiny**, then **Remove model**: the button reads **Removing…**, then a message says **Removed Whisper Tiny** ("Its files were deleted from this browser.").
>   3. **Tiny** shows its download size again. Click **Cancel**.

Downloaded models are kept by your browser, not in your project folder:

- Every project in this browser uses them, and they work offline.
- Each browser, and each browser profile, keeps its own copy.
- The graphics card and the processor use different files: a model downloaded while transcription ran on one shows its download size when it runs on the other.

To free the space a model takes:

1. Open the **Transcribe captions** dialog.
2. Click the model. **Remove model** appears at the left of the buttons when the model is downloaded (tooltip **Delete this model's files from the browser (it downloads again next time)**).
3. Click **Remove model**. The message **Removed Whisper Tiny** (with the model's name) appears, and the model shows its download size again. If the files can't be deleted, the message **Couldn't remove the model** appears instead.

Removing a model doesn't change your captions. The next transcription with that model downloads it again.

## If a transcription doesn't start

| Message | Why | What to do |
| --- | --- | --- |
| **Nothing to transcribe** ("The timeline is empty.") | The timeline has no clips. | Add your video to the timeline first. |
| **No audio to transcribe** ("No audio clip is heard in the range (muted tracks are left out).") | No sound plays in the range: its audio tracks are muted, another track is soloed, its clips are turned off, or there is no audio clip in it. | Unmute the voice track, check the **S** toggles, turn the clip on with **Enable**, or choose another range. |
| **No speech found** ("Whisper Base heard no words in the range.") | The range holds music or silence, or the speech is too quiet. | Check the range, choose the language yourself, or try **Small**. |
| **Couldn't transcribe** ("The model could not be downloaded. Check the connection and try again.") | The model's first download failed. | Check your internet connection and transcribe again. |
| **Couldn't transcribe** (with another detail) | Something else went wrong while transcribing. | Try again. If it happens again, choose another model or reload the page. |
| **The caption track is locked** ("Unlock CC to add transcribed captions.") | The **CC** track is locked. | Click the padlock in the **CC** header, then transcribe again. |
| **Couldn't read the model cache:** (in the dialog) | The browser can't tell which models are downloaded. | Close the dialog and open it again. You can still transcribe: a model that isn't found downloads again. |

See also [Transcription in Troubleshooting](troubleshooting.md#transcription).

## Undo a transcription

Adding the cues of a transcription is one step in the history, **Transcribe captions**.

- <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes all the new cues at once and brings back the cues they replaced. When the transcription added the caption track, the track goes too.
- Starting, cancelling and discarding a transcription are not steps: they don't change your project.
- Downloading and removing models, and the model and language you chose, are not steps either.

See [Undo and redo changes](projects-and-saving.md#undo-and-redo-changes).

## What is not available yet

These parts are available in a later version:

- Settings for the default model and language and the list of downloaded models outside the **Transcribe captions** dialog.
- Starting a transcription from the command palette.
- Editing cues in the review, and a style for a single cue.

## Related pages
- [Editing audio](audio-editing.md)
- [Captions](captions.md)
- [Audio](audio.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Projects and saving](projects-and-saving.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Troubleshooting](troubleshooting.md)

<sub>Last updated: Batch 37, 2026-10-17</sub>
