# Troubleshooting

This page helps you when something does not work as expected: the editor does not start in your browser, the preview stays empty, a shortcut or a key you changed does nothing or runs another command, a folder or a file does not open, media are hidden in the Media tab, go offline or don't relink, a clip drag, a trim, a split, a delete, a timeline tool, a typed timecode, a marker, an in/out range or **Lift** and **Extract** do something you did not expect, media from the Media panel lands somewhere you did not expect, a clip shows no thumbnails, a video gets no proxy or its proxy fails, the preview zoom, overlays or fullscreen behave unexpectedly, a picture in the preview can't be selected, moves unexpectedly, doesn't snap where you expect or gets cropped instead of resized, a value or a crop in **Edit Properties** doesn't do what you expect, a paste or a duplicate lands somewhere you did not expect or is refused, a speed change, a freeze frame or a punch zoom does something you did not expect, a keyframe animation or a keyframe lane doesn't behave as you expect, a fade or a transition doesn't go where you expect, gets shorter or shows red stripes, the rubber band, **Normalize**, **Auto-duck**, **Detach audio** or **Audio scrub** doesn't do what you expect, **Remove silence** cuts too much, too little or nothing, a shape or an image doesn't look or play as you expect, a title lands somewhere you did not expect, the keys type into a text, a font is missing, a text preset doesn't apply, update or sync as you expect, a text animation plays shorter or differently than you expect, a caption cue doesn't import, move, show or highlight as you expect, a transcription doesn't start, is slow or gets words wrong, an export doesn't start, fails or gives a file you did not expect, playback stutters, or you hear no sound. Each problem lists what you see, why it happens and what to do. The last section lists what the current version cannot do yet.

> **Video placeholder: Fix common problems**
> - File: `videos/troubleshooting/overview.mp4` (not recorded yet)
> - Length: about 220 seconds
> - Shows:
>   1. Open the editor in a browser without the required features: the screen "This browser cannot run Shorts Editor" lists what is missing.
>   2. In Chrome, open `chrome://settings/system` and show **Use graphics acceleration when available** turned on.
>   3. Open a project and allow only viewing when the browser asks: the read-only banner appears. Click **Allow editing**, allow editing, and the banner disappears.
>   4. Import a `.webm` file: the message "Can't import ..." with "Unsupported file type" appears.
>   5. Press <kbd>F</kbd>: the preview fills the window and the other panels disappear. Press <kbd>Esc</kbd>: they are back at their sizes.
>   6. Play a 4K clip and point at **Dropped** in the status strip under the preview.
>   7. Play a clip with sound while **Mute** is on: nothing is heard, but the meter moves. Click **Unmute**: the sound is back.
>   8. Drag a clip near the end of another clip: it jumps onto the edge with a gold line. Hold <kbd>S</kbd> and place it a few frames away instead.
>   9. Click **Ripple mode** in the timeline toolbar so it is gold, and drag the end of a clip to the left: the later clips move too. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and click **Ripple mode** again to turn it off.
>   10. Press <kbd>Y</kbd> and drag a clip: it stays in place while its picture changes. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then <kbd>V</kbd>, and drag the clip again: it moves.
>   11. Press <kbd>C</kbd> and click a clip: it splits in two. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then <kbd>V</kbd>.
>   12. With three videos end to end on V1, put a music clip on A2 that runs under the second video and ends after it, and a short sound effect on A2 one second after the music. Select the second video and press <kbd>Shift</kbd>+<kbd>Delete</kbd>: the message **Ripple delete stopped short** names the sound effect, and the third video moves only one second to the left.
>   13. Click the padlock in the V1 header: diagonal lines cover the row, and clicking its clips selects nothing. Click the padlock again: the clips can be selected.
>   14. Click the height toggle in the V1 header until the track is S: its clips show only their label bar. Click it again: the thumbnails are back.
>   15. Press <kbd>H</kbd> and drag a clip: the view pans and the clip stays where it is. Press <kbd>V</kbd> and drag the clip again: it moves.
>   16. With playback stopped, point at an empty part of a track and press <kbd>Space</kbd>: the cursor turns into a hand, and playback starts only when you release the key.
>   17. Click the timeline's timecode field, type `1:x5` and press <kbd>Enter</kbd>: the field gets a red border. Press <kbd>Esc</kbd>.
>   18. Set an in point and an out point, turn on **Loop playback**, click in the ruler after the range and press <kbd>Space</kbd>: playback starts at the in point and repeats the range. Press <kbd>Space</kbd>, then <kbd>Alt</kbd>+<kbd>X</kbd>: the shading disappears.
>   19. Click a marker in the ruler, click an empty part of a track and press <kbd>Delete</kbd>: the marker disappears, the clips stay. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.
>   20. Point at the picture of a video card in the Media panel and press <kbd>I</kbd>: a gold bar appears on the card, and the timeline's in point does not change. Press <kbd>Alt</kbd>+<kbd>X</kbd>: the bar disappears.
>   21. Put the playhead in the middle of a clip and double-click a card: the clip splits and the later clips move right. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the card and press <kbd>.</kbd>: the new clip covers what was there instead.
>   22. Choose **400%** in the preview **Zoom** menu with a 4K clip under the playhead and press <kbd>Space</kbd>: the status line reads **Auto: proxy** (**Auto: reduced** before the clip's proxy is ready) and the picture is soft. Press <kbd>Space</kbd> again: a moment later the picture sharpens and the status line reads **Auto: full**.
>   23. Click a picture in the preview and press <kbd>→</kbd>: the picture moves 1 pixel and the playhead stays. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the area around the frame and press <kbd>→</kbd>: the playhead steps one frame.
>   24. With a logo on V2 over a video on V1, click the eye in the V2 header and click where the logo was: the video on V1 is selected. Click the eye again, click the logo, then <kbd>Alt</kbd>+click it: the video under it is selected.
>   25. Drag the logo slowly toward the middle of the frame: it jumps to the center and gold lines cross the frame. Keep the mouse button down and hold <kbd>S</kbd>: it moves freely and the lines disappear. Release the mouse button, then click **Smart guides** in the preview header so it is no longer gold, and drag the logo next to another picture: it no longer snaps to it. Click **Smart guides** again.
>   26. Import a 4K 60 fps clip: its card shows a grey **PX** chip that counts up. Press <kbd>Space</kbd>: the percentage stops while the timeline plays. Press <kbd>Space</kbd> again: it continues. Right-click a 1080p 30 fps card with no chip and choose **Generate proxy**: a grey chip appears.
>   27. Click a clip on the timeline, click an empty part of the **Edit Properties** panel and press <kbd>Ctrl</kbd>+<kbd>D</kbd>: the browser offers to bookmark the page. Press <kbd>Esc</kbd>, click the clip on the timeline and press <kbd>Ctrl</kbd>+<kbd>D</kbd>: a copy appears right after it.
>   28. Select three clips with different opacities: **Opacity** shows `--`. Right-click one of them and choose **Disable**: they turn faded with diagonal lines and leave the preview. Right-click again and choose **Enable**.
>   29. Double-click a picture in the preview: white brackets and bars replace its handles, and the **Crop** chip appears at the top of the preview. Drag a corner bracket inward: the picture is cut, not resized. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then <kbd>Esc</kbd>: the usual handles are back.
>   30. In the **Crop** section, click the chain button in the **Aspect** row so it is lit, and type `200` in **T**: **L** and **R** change too. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and click the chain button again to unlock it.
>   31. Select a video with a clip right after it. In the **Speed** section, turn **Ripple** off and type `50` in **Speed**: the clip stops at the next one, and the message **Shortened at the next clip** appears. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and turn **Ripple** on again.
>   32. Select a video, move the playhead outside it and press <kbd>Shift</kbd>+<kbd>F</kbd>: the message **The playhead is not over the selected clip** appears.
>   33. Press <kbd>T</kbd> and press <kbd>Space</kbd>: a space is typed instead of playing. Press <kbd>Esc</kbd>, then <kbd>Space</kbd>: playback starts. Pause.
>   34. Click beside a short line of a two-line title, where no letter is: the video behind it is selected. Click a letter: the title is selected.
>   35. Open a project made on another computer with a font this one doesn't have: the **Font** field shows **Missing** and the clip shows a red triangle. Pick **Inter** in the font picker: both disappear.
>   36. Click an empty area of the timeline tracks so nothing is selected, then click the **Breaking** card in the **Presets** tab: a new title appears instead of a changed one. Press <kbd>Esc</kbd>, then <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Select the first title and click the card: it takes the red box.
>   37. Select a title made with a preset and hover **Update preset** in the quick actions: it is dimmed while the title still has the preset's style. Change its color: the button comes alive.
>   38. Give a 4-second title **Word pop** in the **Animation** section and type `3` in its **Duration**: the hint **Plays in 2.00 s: half the clip** appears under the field. Click the **Title** preset card: the animation is gone. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: it is back.
>   39. Open the **Captions** tab of a project with cues, click into a cue's text and press <kbd>Delete</kbd>: a letter disappears. Press <kbd>Esc</kbd>, then <kbd>Delete</kbd>: the cue is deleted. On the **CC** row, drag a cue into the next one: it stops against it.
>   40. Click **M** in the header of the audio track with the voice, click the microphone in the **Captions** header, then **Transcribe**: the message **No audio to transcribe** appears. Click **M** again, set an in and an out point that cut through two cues, and transcribe **In to out**: the review offers **Replace 2 cues**. Press <kbd>Esc</kbd>: the transcript is gone and nothing changed.
>   41. Click **Add solid**, then click **Ellipse** in the **Solid** section: the **Radius** field is dimmed. Click **Rounded rectangle**, type `500` in **Radius**: the ends are half circles and grow no rounder. Drag a corner handle of the shape: **Scale** in **Transform** stays at 100% while **W** and **H** change.
>   42. Select a logo whose **Transform** stopwatch is on, with **Show clip keyframes** on. Click a diamond on its lane and press <kbd>Delete</kbd>: only that keyframe disappears and the **Undo** tooltip reads **Undo Delete keyframe**. Click the clip's body and press <kbd>Delete</kbd>: now the clip goes. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> twice.
>   43. Put two videos that each use their whole file end to end on V1, click right on the cut between them and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>: the block is striped red and the message **Not enough media for the transition** appears. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Select the first video and click **Fade in 0.5 s** twice: the second click removes the fade, and the **Undo** tooltip reads **Undo Remove fade in**.
>   44. Put a music clip on A1 and a voice clip on A2 under it, select the music and click **Auto-duck** in the **Audio** section: the message **No voice to duck under** appears. Drag the A2 header above A1 and click **Auto-duck** again: the music's line dips under the voice. Click **Auto-duck** once more: the dip gets twice as deep; press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.
>   45. Select a title and point at **Remove silence** in the quick actions: it is dimmed. Select a talking-head video recorded in a noisy room and click **Remove silence**: the row reads **No silence found**. Drag the **Threshold** slider to `-30 dB`: red stripes cover the pauses. Click **Cancel**.
>   46. Click the padlock in the V2 header. Select a clip on V1 and a clip on V2 above it, press <kbd>Ctrl</kbd>+<kbd>C</kbd>, click in the ruler at an empty spot and press <kbd>Ctrl</kbd>+<kbd>V</kbd>: the message **Can't paste onto a locked track** names V2. Click the padlock again and press <kbd>Ctrl</kbd>+<kbd>V</kbd>: the clips land at the playhead on V1 and V2. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, put the playhead over another clip and press <kbd>Ctrl</kbd>+<kbd>V</kbd>: the clip under the copies is cut away. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>: the clips make room instead.
>   47. Click **Settings** in the app bar, click the **Shortcuts** tab, click **+** on **Split at playhead** and press <kbd>Ctrl</kbd>+<kbd>L</kbd>: the key turns red on **Split at playhead** and **Link / Unlink**. Click **Done**, click a video with sound on the timeline and press <kbd>Ctrl</kbd>+<kbd>L</kbd>: the video and its sound are unlinked, and nothing is split. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, open **Settings** again, click **Shortcuts** and click **Reset all**. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and type `edit marker`: the row is grey. Press <kbd>Esc</kbd>.
>   48. In the **Media** tab, click **Unused**: only the media no clip uses show. Click it again. Open a project whose linked video was moved to another folder: its card shows a red **Offline** badge and its clip is gray. Click **Relink…** on the card and pick the moved file: the badge disappears.
>   49. Click an empty area of the timeline tracks of a 30 fps project and choose **24 fps** in **Frame rate**: **Convert to 24 fps?** counts the rounded timings. Click **Cancel**. Open a project read-only, rename it and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>: **Discard unsaved changes?** appears; click **Cancel**. Click **History…**: **Restore…** is dimmed.
>   50. Delete every clip, press <kbd>Ctrl</kbd>+<kbd>E</kbd> and <kbd>Enter</kbd>: the message **Nothing to export** appears. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click **Export** in the **Export** tab and press <kbd>Esc</kbd>: the progress message appears at the top of the window. Open **Settings** and click **Clear cache**: the message **An export is running** appears. Click **Done**, then **Cancel** in the progress message: **Export cancelled**.

## In this page
- [Browser and graphics](#browser-and-graphics)
  - [The browser cannot run Shorts Editor](#the-browser-cannot-run-shorts-editor)
  - [A WebGPU adapter is missing](#a-webgpu-adapter-is-missing)
  - [The preview goes blank after a graphics reset](#the-preview-goes-blank-after-a-graphics-reset)
- [Keyboard](#keyboard)
  - [Shortcuts do nothing](#shortcuts-do-nothing)
  - [The new project shortcut opens a browser window](#the-new-project-shortcut-opens-a-browser-window)
  - [A shortcut runs another command or does nothing](#a-shortcut-runs-another-command-or-does-nothing)
  - [A shortcut is red in Settings](#a-shortcut-is-red-in-settings)
  - [A new key works only in one panel](#a-new-key-works-only-in-one-panel)
  - [A row in the command palette is grey](#a-row-in-the-command-palette-is-grey)
  - [Importing a keymap says Not a keymap file](#importing-a-keymap-says-not-a-keymap-file)
  - [Alt+Left leaves the editor](#altleft-leaves-the-editor)
  - [Space starts playback only when you release it](#space-starts-playback-only-when-you-release-it)
  - [Ctrl+1 or Ctrl+2 switched to another browser tab](#ctrl1-or-ctrl2-switched-to-another-browser-tab)
  - [Ctrl+D opens the browser's bookmark dialog](#ctrld-opens-the-browsers-bookmark-dialog)
  - [Ctrl+Shift+D bookmarks all your tabs](#ctrlshiftd-bookmarks-all-your-tabs)
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
  - [Clicking a clip cuts it](#clicking-a-clip-cuts-it)
  - [Ctrl+K or the Razor does not split a clip](#ctrlk-or-the-razor-does-not-split-a-clip)
  - [Deleting a video also deleted its sound](#deleting-a-video-also-deleted-its-sound)
  - [Closing a gap moved clips on other tracks](#closing-a-gap-moved-clips-on-other-tracks)
  - [A ripple delete or Close gap stopped short](#a-ripple-delete-or-close-gap-stopped-short)
  - [G does nothing or closes another gap](#g-does-nothing-or-closes-another-gap)
  - [Clicking a clip selects nothing](#clicking-a-clip-selects-nothing)
  - [A drop or a move is refused on a locked track](#a-drop-or-a-move-is-refused-on-a-locked-track)
  - [A track can't be deleted](#a-track-cant-be-deleted)
  - [Clicking a clip selects other clips too](#clicking-a-clip-selects-other-clips-too)
  - [Clicking a video no longer selects its sound](#clicking-a-video-no-longer-selects-its-sound)
  - [Ctrl+L does not link the clips](#ctrll-does-not-link-the-clips)
  - [A clip shows no thumbnails or waveform](#a-clip-shows-no-thumbnails-or-waveform)
  - [Thumbnails repeat or show the wrong frames](#thumbnails-repeat-or-show-the-wrong-frames)
  - [A clip shows a chain icon](#a-clip-shows-a-chain-icon)
  - [Dragging a clip moves the view instead](#dragging-a-clip-moves-the-view-instead)
  - [The timecode field turns red or jumps somewhere unexpected](#the-timecode-field-turns-red-or-jumps-somewhere-unexpected)
  - [Timecodes show milliseconds instead of frames](#timecodes-show-milliseconds-instead-of-frames)
  - [Clicking the ruler doesn't move the playhead](#clicking-the-ruler-doesnt-move-the-playhead)
  - [M opens an editor instead of adding a marker](#m-opens-an-editor-instead-of-adding-a-marker)
  - [Delete removed a marker, or Edit Properties keeps showing a marker](#delete-removed-a-marker-or-edit-properties-keeps-showing-a-marker)
  - [The in or out point disappeared](#the-in-or-out-point-disappeared)
  - [Lift or Extract does nothing or changes the wrong tracks](#lift-or-extract-does-nothing-or-changes-the-wrong-tracks)
- [Folders and saving](#folders-and-saving)
  - [The browser asks for access to a folder](#the-browser-asks-for-access-to-a-folder)
  - [The project opens read-only](#the-project-opens-read-only)
  - [A project folder does not open](#a-project-folder-does-not-open)
  - [Changes are not saved](#changes-are-not-saved)
  - [Opening another project asks Discard unsaved changes?](#opening-another-project-asks-discard-unsaved-changes)
  - [The browser asks whether to leave the site](#the-browser-asks-whether-to-leave-the-site)
  - [History shows no versions or can't restore one](#history-shows-no-versions-or-cant-restore-one)
  - [Clear cache is refused or the thumbnails are missing afterwards](#clear-cache-is-refused-or-the-thumbnails-are-missing-afterwards)
- [Project settings and templates](#project-settings-and-templates)
  - [Changing the frame rate asks before converting](#changing-the-frame-rate-asks-before-converting)
  - [A clip or a keyframe moved after a frame rate change](#a-clip-or-a-keyframe-moved-after-a-frame-rate-change)
  - [A template is missing from the start screen](#a-template-is-missing-from-the-start-screen)
  - [The New project dialog has no Template field](#the-new-project-dialog-has-no-template-field)
  - [New images, solids, titles or transitions have an unexpected length](#new-images-solids-titles-or-transitions-have-an-unexpected-length)
- [Importing](#importing)
  - [A file cannot be imported](#a-file-cannot-be-imported)
  - [A video imports but shows nothing](#a-video-imports-but-shows-nothing)
- [Organizing media](#organizing-media)
  - [Media are missing from the Media tab](#media-are-missing-from-the-media-tab)
  - [Delete or Move to bin left some selected media out](#delete-or-move-to-bin-left-some-selected-media-out)
  - [Media can't be dropped on a bin](#media-cant-be-dropped-on-a-bin)
  - [Reveal in folder doesn't open a folder](#reveal-in-folder-doesnt-open-a-folder)
- [Offline media](#offline-media)
  - [Cards show Offline and their clips are gray](#cards-show-offline-and-their-clips-are-gray)
  - [A card shows No access](#a-card-shows-no-access)
  - [A card shows Can't play](#a-card-shows-cant-play)
  - [Relink says Can't relink](#relink-says-cant-relink)
  - [Relink folder doesn't find a file](#relink-folder-doesnt-find-a-file)
  - [A clip shows Media removed](#a-clip-shows-media-removed)
  - [Media came back offline after Undo](#media-came-back-offline-after-undo)
- [Proxies](#proxies)
  - [A video gets no proxy](#a-video-gets-no-proxy)
  - [A proxy chip is red](#a-proxy-chip-is-red)
  - [A proxy stops counting or starts over](#a-proxy-stops-counting-or-starts-over)
  - [The picture is softer while you play or scrub](#the-picture-is-softer-while-you-play-or-scrub)
- [Adding media to the timeline](#adding-media-to-the-timeline)
  - [Double-clicking a card pushed other clips to the right](#double-clicking-a-card-pushed-other-clips-to-the-right)
  - [I or O marks a media card instead of the timeline](#i-or-o-marks-a-media-card-instead-of-the-timeline)
  - [A clip from the Media panel is shorter than its media](#a-clip-from-the-media-panel-is-shorter-than-its-media)
  - [Dragged media landed on V2 and A2](#dragged-media-landed-on-v2-and-a2)
  - [Media dropped on the preview went to a new track](#media-dropped-on-the-preview-went-to-a-new-track)
  - [Dropped files were imported but not placed](#dropped-files-were-imported-but-not-placed)
  - [Nothing is added when you drag or press , or .](#nothing-is-added-when-you-drag-or-press--or-)
- [Playback and preview](#playback-and-preview)
  - [Playback stutters or drops frames](#playback-stutters-or-drops-frames)
  - [Playback repeats only part of the timeline](#playback-repeats-only-part-of-the-timeline)
  - [The preview shows a nearby frame for a moment](#the-preview-shows-a-nearby-frame-for-a-moment)
  - [Playback has no sound](#playback-has-no-sound)
  - [Sound and picture are out of sync](#sound-and-picture-are-out-of-sync)
  - [The preview shows two pictures side by side](#the-preview-shows-two-pictures-side-by-side)
  - [A clip does not show in the preview](#a-clip-does-not-show-in-the-preview)
  - [The other panels disappeared](#the-other-panels-disappeared)
  - [The zoomed preview is not sharp](#the-zoomed-preview-is-not-sharp)
  - [The mouse wheel moves the picture or does nothing](#the-mouse-wheel-moves-the-picture-or-does-nothing)
  - [An overlay does not show](#an-overlay-does-not-show)
- [Layers in the preview](#layers-in-the-preview)
  - [The arrow keys move a picture instead of the playhead](#the-arrow-keys-move-a-picture-instead-of-the-playhead)
  - [A picture in the preview can't be selected](#a-picture-in-the-preview-cant-be-selected)
  - [A click in the preview selects the wrong picture](#a-click-in-the-preview-selects-the-wrong-picture)
  - [A drag moves a picture other than the one under the pointer](#a-drag-moves-a-picture-other-than-the-one-under-the-pointer)
  - [A picture jumps while you drag it in the preview](#a-picture-jumps-while-you-drag-it-in-the-preview)
  - [Pictures in the preview don't snap](#pictures-in-the-preview-dont-snap)
  - [Gold lines and numbers appear when you hold Alt](#gold-lines-and-numbers-appear-when-you-hold-alt)
  - [A resize stops at 100%](#a-resize-stops-at-100)
  - [The side handles are missing](#the-side-handles-are-missing)
  - [Bring forward or Send backward created a new track](#bring-forward-or-send-backward-created-a-new-track)
  - [White brackets replace the handles of a picture](#white-brackets-replace-the-handles-of-a-picture)
- [Edit Properties](#edit-properties)
  - [A field shows --](#a-field-shows---)
  - [A typed clip time stops short or changes nothing](#a-typed-clip-time-stops-short-or-changes-nothing)
  - [Quick actions are dimmed](#quick-actions-are-dimmed)
  - [There is no Transform section](#there-is-no-transform-section)
  - [Pictures got smaller after a resolution change](#pictures-got-smaller-after-a-resolution-change)
  - [The background went back to its old color](#the-background-went-back-to-its-old-color)
  - [Crop to frame does nothing or keeps less than expected](#crop-to-frame-does-nothing-or-keeps-less-than-expected)
  - [Changing one crop side changes the others](#changing-one-crop-side-changes-the-others)
  - [The crop button in the Crop section is dimmed](#the-crop-button-in-the-crop-section-is-dimmed)
  - [A picture is still cropped after Reset transform](#a-picture-is-still-cropped-after-reset-transform)
- [Copy, paste and duplicate](#copy-paste-and-duplicate)
  - [Ctrl+C or Ctrl+V does nothing](#ctrlc-or-ctrlv-does-nothing)
  - [Pasted clips landed on the wrong tracks](#pasted-clips-landed-on-the-wrong-tracks)
  - [A paste covered clips you wanted to keep](#a-paste-covered-clips-you-wanted-to-keep)
  - [Ctrl+V pasted other clips than the ones you copied](#ctrlv-pasted-other-clips-than-the-ones-you-copied)
  - [Pasted clips show no picture or sound](#pasted-clips-show-no-picture-or-sound)
  - [A paste is refused](#a-paste-is-refused)
  - [Paste attributes doesn't offer a group](#paste-attributes-doesnt-offer-a-group)
  - [Clips moved or lost their keyframes after Paste attributes](#clips-moved-or-lost-their-keyframes-after-paste-attributes)
  - [Ctrl+D copied a video without its sound](#ctrld-copied-a-video-without-its-sound)
  - [Duplicate in the preview added a track](#duplicate-in-the-preview-added-a-track)
- [Speed, freeze frames and punch zoom](#speed-freeze-frames-and-punch-zoom)
  - [A speed change moved other clips or left a gap](#a-speed-change-moved-other-clips-or-left-a-gap)
  - [A ripple after a speed change stopped short](#a-ripple-after-a-speed-change-stopped-short)
  - [A clip kept its length when its speed changed](#a-clip-kept-its-length-when-its-speed-changed)
  - [A clip keeps its speed with Limited by the media end](#a-clip-keeps-its-speed-with-limited-by-the-media-end)
  - [A video and its sound got different speeds or show a red number](#a-video-and-its-sound-got-different-speeds-or-show-a-red-number)
  - [Freeze frame or punch zoom does nothing](#freeze-frame-or-punch-zoom-does-nothing)
  - [A freeze frame moved clips on every track](#a-freeze-frame-moved-clips-on-every-track)
  - [The Speed field is dimmed at 0.0](#the-speed-field-is-dimmed-at-00)
- [Keyframes](#keyframes)
  - [A picture slides between two places after you moved it](#a-picture-slides-between-two-places-after-you-moved-it)
  - [The keyframe lane doesn't show on a clip](#the-keyframe-lane-doesnt-show-on-a-clip)
  - [The stopwatch is on but the count shows 0](#the-stopwatch-is-on-but-the-count-shows-0)
  - [Delete removed keyframes instead of the clip](#delete-removed-keyframes-instead-of-the-clip)
  - [A keyframe stops before where you drag it](#a-keyframe-stops-before-where-you-drag-it)
  - [The Ease row shows -- or its choices are dimmed](#the-ease-row-shows----or-its-choices-are-dimmed)
  - [Paste keyframes is dimmed or Ctrl+V doesn't paste keyframes](#paste-keyframes-is-dimmed-or-ctrlv-doesnt-paste-keyframes)
  - [Punch zoom no longer jumps at the cut](#punch-zoom-no-longer-jumps-at-the-cut)
  - [A change to the anchor, crop or size applies to every frame](#a-change-to-the-anchor-crop-or-size-applies-to-every-frame)
- [Fades and transitions](#fades-and-transitions)
  - [The fade handles don't appear](#the-fade-handles-dont-appear)
  - [Fade in 0.5 s removed a fade](#fade-in-05-s-removed-a-fade)
  - [No cut to add a transition to](#no-cut-to-add-a-transition-to)
  - [The transition went on another cut](#the-transition-went-on-another-cut)
  - [The transition block is striped red](#the-transition-block-is-striped-red)
  - [A transition end stops before where you drag it](#a-transition-end-stops-before-where-you-drag-it)
  - [A transition got shorter or disappeared](#a-transition-got-shorter-or-disappeared)
  - [The sound doesn't crossfade under a transition](#the-sound-doesnt-crossfade-under-a-transition)
  - [The sound dips at a crossfade](#the-sound-dips-at-a-crossfade)
- [Audio editing](#audio-editing)
  - [There is no white line on an audio clip](#there-is-no-white-line-on-an-audio-clip)
  - [Dragging the line trims the clip or moves a fade](#dragging-the-line-trims-the-clip-or-moves-a-fade)
  - [Ctrl+click on an audio clip selects it instead of adding a keyframe](#ctrlclick-on-an-audio-clip-selects-it-instead-of-adding-a-keyframe)
  - [Dragging the line moved two keyframes](#dragging-the-line-moved-two-keyframes)
  - [A volume keyframe stops before where you drag it](#a-volume-keyframe-stops-before-where-you-drag-it)
  - [Typing a Volume changed only part of the clip](#typing-a-volume-changed-only-part-of-the-clip)
  - [The Volume field shows -- or changes when the playhead moves](#the-volume-field-shows----or-changes-when-the-playhead-moves)
  - [Normalize says The waveform is still loading or Nothing to normalize](#normalize-says-the-waveform-is-still-loading-or-nothing-to-normalize)
  - [Normalize didn't bring the peak to -1 dBFS](#normalize-didnt-bring-the-peak-to--1-dbfs)
  - [Auto-duck says No voice to duck under](#auto-duck-says-no-voice-to-duck-under)
  - [Auto-duck lowered the music too much](#auto-duck-lowered-the-music-too-much)
  - [The music doesn't come back up between two sentences](#the-music-doesnt-come-back-up-between-two-sentences)
  - [Detach audio is missing or dimmed](#detach-audio-is-missing-or-dimmed)
  - [Audio scrub plays no sound](#audio-scrub-plays-no-sound)
  - [An audio clip is faded, has diagonal lines and plays no sound](#an-audio-clip-is-faded-has-diagonal-lines-and-plays-no-sound)
- [Removing silence](#removing-silence)
  - [Remove silence is dimmed](#remove-silence-is-dimmed)
  - [Remove silence shows no stripes](#remove-silence-shows-no-stripes)
  - [The stripes cover soft words or breaths](#the-stripes-cover-soft-words-or-breaths)
  - [Apply says Still analysing](#apply-says-still-analysing)
  - [Remove silence says Some gaps stayed open](#remove-silence-says-some-gaps-stayed-open)
  - [Titles, captions or music are out of step after Remove silence](#titles-captions-or-music-are-out-of-step-after-remove-silence)
  - [Remove silence left a silence before or after the video](#remove-silence-left-a-silence-before-or-after-the-video)
  - [Remove silence cut a second sound clip](#remove-silence-cut-a-second-sound-clip)
  - [The arrow keys change the threshold instead of the playhead](#the-arrow-keys-change-the-threshold-instead-of-the-playhead)
- [Shapes and images](#shapes-and-images)
  - [Add solid put the shape on a new track](#add-solid-put-the-shape-on-a-new-track)
  - [The Radius field is dimmed](#the-radius-field-is-dimmed)
  - [The corners don't get any rounder](#the-corners-dont-get-any-rounder)
  - [A shape's handles change its size, not its scale](#a-shapes-handles-change-its-size-not-its-scale)
  - [Clicking beside an ellipse selects it](#clicking-beside-an-ellipse-selects-it)
  - [Add image added no clip](#add-image-added-no-clip)
  - [An animated image plays choppily](#an-animated-image-plays-choppily)
  - [An animated image doesn't stop at its end](#an-animated-image-doesnt-stop-at-its-end)
  - [An animated image plays slower than expected](#an-animated-image-plays-slower-than-expected)
  - [An SVG image looks soft](#an-svg-image-looks-soft)
- [Titles and text](#titles-and-text)
  - [T or Shift+T does nothing](#t-or-shiftt-does-nothing)
  - [A new title went onto a new track](#a-new-title-went-onto-a-new-track)
  - [A new title has another length](#a-new-title-has-another-length)
  - [Keys type into the text instead of working](#keys-type-into-the-text-instead-of-working)
  - [Typed text disappeared](#typed-text-disappeared)
  - [A click on a text selects the picture behind it](#a-click-on-a-text-selects-the-picture-behind-it)
  - [Dragging a corner of a text changes its font size](#dragging-a-corner-of-a-text-changes-its-font-size)
  - [A text shows Missing or a red triangle](#a-text-shows-missing-or-a-red-triangle)
  - [Show system fonts lists nothing](#show-system-fonts-lists-nothing)
  - [A font from your computer was not copied into the project](#a-font-from-your-computer-was-not-copied-into-the-project)
  - [Letters of some languages look different](#letters-of-some-languages-look-different)
- [Text presets](#text-presets)
  - [Clicking a preset adds a new title instead of changing the selected one](#clicking-a-preset-adds-a-new-title-instead-of-changing-the-selected-one)
  - [Update preset is dimmed](#update-preset-is-dimmed)
  - [Other titles did not change after Update preset](#other-titles-did-not-change-after-update-preset)
  - [T or Shift+T makes a different look than expected](#t-or-shiftt-makes-a-different-look-than-expected)
  - [A favorite chip is missing from the toolbar](#a-favorite-chip-is-missing-from-the-toolbar)
  - [Presets in the Project list can't be changed](#presets-in-the-project-list-cant-be-changed)
  - [A preset looks larger or smaller in another project](#a-preset-looks-larger-or-smaller-in-another-project)
  - [Import says No presets imported or Couldn't import the presets](#import-says-no-presets-imported-or-couldnt-import-the-presets)
  - [The library folder strip asks you to click Sync](#the-library-folder-strip-asks-you-to-click-sync)
  - [A deleted preset came back](#a-deleted-preset-came-back)
- [Text animations](#text-animations)
  - [An animation plays shorter than its Duration](#an-animation-plays-shorter-than-its-duration)
  - [The Stagger field is dimmed](#the-stagger-field-is-dimmed)
  - [Easing changes nothing on a typewriter](#easing-changes-nothing-on-a-typewriter)
  - [The preview plays and the playhead jumps back when you click a chip](#the-preview-plays-and-the-playhead-jumps-back-when-you-click-a-chip)
  - [A text doesn't animate while you edit it](#a-text-doesnt-animate-while-you-edit-it)
  - [A chip changes nothing on some of the selected texts](#a-chip-changes-nothing-on-some-of-the-selected-texts)
  - [Applying a preset removed a text's animations](#applying-a-preset-removed-a-texts-animations)
  - [Pointing at a preset card doesn't show its animation](#pointing-at-a-preset-card-doesnt-show-its-animation)
  - [A starter preset has no animation](#a-starter-preset-has-no-animation)
- [Captions](#captions)
  - [Add caption track is dimmed](#add-caption-track-is-dimmed)
  - [Import says No captions imported](#import-says-no-captions-imported)
  - [An import replaced your cues](#an-import-replaced-your-cues)
  - [The caption track is locked](#the-caption-track-is-locked)
  - [Enter splits the cue instead of starting a new line](#enter-splits-the-cue-instead-of-starting-a-new-line)
  - [Ctrl+Backspace deletes a word instead of merging cues](#ctrlbackspace-deletes-a-word-instead-of-merging-cues)
  - [Delete removes letters instead of the cue](#delete-removes-letters-instead-of-the-cue)
  - [A cue stops before where you drag it](#a-cue-stops-before-where-you-drag-it)
  - [Captions moved after an edit on another track](#captions-moved-after-an-edit-on-another-track)
  - [A caption doesn't show in the preview](#a-caption-doesnt-show-in-the-preview)
  - [Clicking a caption in the preview selects the video](#clicking-a-caption-in-the-preview-selects-the-video)
  - [The spoken word isn't highlighted](#the-spoken-word-isnt-highlighted)
  - [A long cue looks smaller than the others](#a-long-cue-looks-smaller-than-the-others)
  - [A preset card added a title instead of styling the captions](#a-preset-card-added-a-title-instead-of-styling-the-captions)
  - [Export SRT or VTT is dimmed](#export-srt-or-vtt-is-dimmed)
- [Transcription](#transcription)
  - [Transcribe is dimmed](#transcribe-is-dimmed)
  - [A transcription says No audio to transcribe or No speech found](#a-transcription-says-no-audio-to-transcribe-or-no-speech-found)
  - [The model download fails](#the-model-download-fails)
  - [A downloaded model shows its size again](#a-downloaded-model-shows-its-size-again)
  - [The transcription is slow](#the-transcription-is-slow)
  - [The captions are in the wrong language](#the-captions-are-in-the-wrong-language)
  - [Some words are wrong](#some-words-are-wrong)
  - [The highlight comes late](#the-highlight-comes-late)
  - [A word you fixed is no longer highlighted](#a-word-you-fixed-is-no-longer-highlighted)
  - [A transcription replaced cues outside the in/out range](#a-transcription-replaced-cues-outside-the-inout-range)
  - [The transcript disappeared before you added it](#the-transcript-disappeared-before-you-added-it)
  - [Chinese or Japanese captions have no spaces or a low word count](#chinese-or-japanese-captions-have-no-spaces-or-a-low-word-count)
- [Export](#export)
  - [Export says Nothing to export or This project is read-only](#export-says-nothing-to-export-or-this-project-is-read-only)
  - [An export doesn't start](#an-export-doesnt-start)
  - [An export fails](#an-export-fails)
  - [An export was cancelled by itself](#an-export-was-cancelled-by-itself)
  - [The exported video doesn't have your latest changes](#the-exported-video-doesnt-have-your-latest-changes)
  - [The exported video isn't 1080×1920 or 60 fps](#the-exported-video-isnt-10801920-or-60-fps)
  - [A codec reads not supported here](#a-codec-reads-not-supported-here)
  - [The file is smaller than the estimate](#the-file-is-smaller-than-the-estimate)
  - [In to out is dimmed](#in-to-out-is-dimmed)
  - [The exported video has no sound, misses a track or shows a gray slate](#the-exported-video-has-no-sound-misses-a-track-or-shows-a-gray-slate)
  - [Playback looks softer or a proxy stops during an export](#playback-looks-softer-or-a-proxy-stops-during-an-export)
  - [You can't find the exported file](#you-cant-find-the-exported-file)
  - [Open folder shows a file dialog](#open-folder-shows-a-file-dialog)
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
| File System Access (showSaveFilePicker) | Saving files to a place you choose, such as exports with **Choose file…** and caption files. |
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
- You are editing a text in the preview (a gold outline and a caret): the keys type into it. Press <kbd>Esc</kbd> to finish.
- A dropdown list has the keyboard focus, for example **Sort media by** after you chose a value with the keyboard.
- A dialog or a menu is open. An open menu has the keyboard: <kbd>Space</kbd>, <kbd>Enter</kbd> and the arrow keys work on its rows.
- You changed or removed the key in **Settings** > **Shortcuts**. See [A shortcut runs another command or does nothing](#a-shortcut-runs-another-command-or-does-nothing).
- The **Edit Properties** panel was the last one you clicked. It has no shortcuts of its own: only the shortcuts for all panels work there, so <kbd>Delete</kbd>, for example, does nothing.
- The shortcut belongs to another panel. For example, <kbd>↑</kbd> and <kbd>↓</kbd> jump between clips, and <kbd>X</kbd>, <kbd>;</kbd> and <kbd>'</kbd> mark a clip, lift and extract, only in the Timeline panel, and <kbd>Ctrl</kbd>+<kbd>0</kbd>, <kbd>Ctrl</kbd>+<kbd>1</kbd> and <kbd>Ctrl</kbd>+<kbd>2</kbd> zoom the preview only in the Preview panel.
- The shortcut belongs to a feature that is available in a later version.

**Fix:** Press <kbd>Enter</kbd> or <kbd>Escape</kbd> to leave a text field, close the dialog or the menu, or click the timeline or the preview picture. Then try again. Press <kbd>?</kbd> to see the keys you use now and where they work. See [Keyboard shortcuts](keyboard-shortcuts.md) for the panel each shortcut needs.

### The new project shortcut opens a browser window

**Symptom:** <kbd>Ctrl</kbd>+<kbd>N</kbd> opens a new, empty browser window instead of a new project.

**Cause:** In a normal browser tab, the browser keeps <kbd>Ctrl</kbd>+<kbd>N</kbd>, <kbd>Ctrl</kbd>+<kbd>T</kbd> and <kbd>Ctrl</kbd>+<kbd>W</kbd> for itself (<kbd>⌘</kbd> on a Mac). A web page never receives them.

**Fix:** Close the extra window. To create a project, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>, or click **New project** on the start screen. See [Create a project](getting-started.md#create-a-project).

### A shortcut runs another command or does nothing

**Symptom:** A key that used to work does nothing, or does something else, for example <kbd>Ctrl</kbd>+<kbd>K</kbd> no longer splits.

**Cause:** One of these:
- The key was changed or removed in **Settings** > **Shortcuts**, or a keymap file you imported gave it to another command. Your keys are kept in this browser for all your projects.
- Two commands share the key. Then it runs only one of them: a panel's command wins in its panel, and when both work in the same place, the command whose keys were changed wins.

**Fix:** Press <kbd>?</kbd> and look up the command: the sheet shows its keys now. To change them, click **Edit shortcuts**, find the command and click **Reset to the default keys** on its row, or **Reset all** for every command. A red key marks a key two commands share; see [A shortcut is red in Settings](#a-shortcut-is-red-in-settings). See [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

### A shortcut is red in Settings

**Symptom:** In **Settings** > **Shortcuts**, a key chip is red on two rows, with a red line such as **Ctrl+L is also Link / Unlink (Timeline)**.

**Cause:** Both commands have that key, and both can see it: they work in the same panel, or one works in every panel and the other in one panel. The editor marks the clash instead of refusing the key.

**Fix:** Point at the red chip on one of the two rows and click its **x**, or click the chip and press another key. The red marks go away on both rows. See [Fix a shortcut conflict](command-palette-and-custom-shortcuts.md#fix-a-shortcut-conflict).

### A new key works only in one panel

**Symptom:** You gave a command a new key, and it works in one panel only, for example only after you click the timeline.

**Cause:** A command keeps the place where its keys work. **Zoom in**, for example, works in the Timeline panel only, so any key you give it does too. The place shows next to the command's name in **Settings** > **Shortcuts** and in the shortcut sheet.

**Fix:** Click the panel shown next to the command, then press the key. Commands without a place work in every panel. See [Change a shortcut](command-palette-and-custom-shortcuts.md#change-a-shortcut).

### A row in the command palette is grey

**Symptom:** A row in the command palette is grey, and <kbd>Enter</kbd> or a click does nothing. The bottom of the palette reads, for example, **Edit marker: not available now**.

**Cause:** The command has nothing to act on right now: **Undo** with nothing to undo, **Edit marker** with no marker selected, **Remove silence: apply** while the **Remove silence** row is closed, **Paste** before you copy anything. On the start screen, every command that needs a project is grey.

**Fix:** Close the palette with <kbd>Esc</kbd>, select what the command works on (or open a project), and run it again. See [Run a command from the palette](command-palette-and-custom-shortcuts.md#run-a-command-from-the-palette).

### Importing a keymap says Not a keymap file

**Symptom:** After **Import…** in **Settings** > **Shortcuts**, the message **Not a keymap file** appears and no key changes. Or the message **Keymap imported** adds that some unknown commands or keys were skipped.

**Cause:** **Not a keymap file**: the file is not a keymap exported from Shorts Editor, or it was changed so that the editor can't read it. **Skipped**: the file names commands this version doesn't have, or keys it can't use; the rest was imported.

**Fix:** Export a keymap from **Settings** > **Shortcuts** with **Export…** and import that file. Check the skipped commands in the list and give them keys by hand. See [Share your shortcuts with a keymap file](command-palette-and-custom-shortcuts.md#share-your-shortcuts-with-a-keymap-file).

### Alt+Left leaves the editor

**Symptom:** You pressed <kbd>Alt</kbd>+<kbd>←</kbd> to nudge a clip, and the browser went back to the page you visited before the editor.

**Cause:** <kbd>Alt</kbd>+<kbd>←</kbd> is the browser's Back key on Windows. The editor uses it to nudge clips only while the Timeline panel is active. When another panel was the last one you clicked, the browser gets the key.

**Fix:** Open the editor again and open your project from **Recent projects**. Your project saves automatically, 1 second after each change by default. Before you nudge clips, click the timeline. See [Nudge clips with the keyboard](timeline.md#nudge-clips-with-the-keyboard).

### Space starts playback only when you release it

**Symptom:** You press <kbd>Space</kbd> to play, the cursor turns into a hand, and playback starts only when you let go of the key.

**Cause:** Playback was stopped and the pointer rested on an empty part of a timeline track, or on the preview picture while it was zoomed in. There, holding <kbd>Space</kbd> lets you drag to pan the view, so the editor waits for the release to know whether you wanted to pan or to play.

**Fix:** Nothing is wrong: a short press still plays. To start playback on the press, move the pointer away from the empty track space or the zoomed picture (over a clip, or out of the timeline and the preview), or click **Play** under the preview. Pausing with <kbd>Space</kbd> during playback is never delayed. See [Pan the view](timeline.md#pan-the-view) and [Pan the preview](preview-zoom-overlays-fullscreen.md#pan-the-preview).

### Ctrl+1 or Ctrl+2 switched to another browser tab

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>2</kbd> to zoom the preview, and the browser switched to another tab. Or <kbd>Ctrl</kbd>+<kbd>0</kbd> changed the size of the whole page.

**Cause:** These keys zoom the preview only while the Preview panel is active. In the other panels the browser gets them: <kbd>Ctrl</kbd>+<kbd>1</kbd> and <kbd>Ctrl</kbd>+<kbd>2</kbd> switch to the first and second tab, and <kbd>Ctrl</kbd>+<kbd>0</kbd> resets the browser's page zoom.

**Fix:** Go back to the editor's tab. Click the preview picture, then press the key again. Or use the **Zoom** menu and **Fit the frame in the panel** in the preview header. See [Zoom the preview](preview-zoom-overlays-fullscreen.md#zoom-the-preview).

### Ctrl+D opens the browser's bookmark dialog

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>D</kbd> to duplicate a clip, and the browser offered to bookmark the page.

**Cause:** The editor duplicates clips with <kbd>Ctrl</kbd>+<kbd>D</kbd> only while the Timeline or the Preview panel is active. In the other panels, Edit Properties included, the browser gets the key. Clicking **Duplicate** or a field in **Edit Properties** makes that panel the active one.

**Fix:** Close the bookmark dialog with <kbd>Esc</kbd> (or remove the bookmark if the browser already added it). Click the clip on the timeline and press <kbd>Ctrl</kbd>+<kbd>D</kbd> again, or click **Duplicate** in the quick actions of **Edit Properties**. See [Duplicate a clip](editing-properties.md#duplicate-a-clip).

### Ctrl+Shift+D bookmarks all your tabs

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to add a transition, and the browser offered to bookmark all your open tabs.

**Cause:** The editor adds the default transition with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> only while the Timeline panel is active. In the other panels the browser gets the key. Clicking a button or a field in **Edit Properties**, such as **Add dissolve**, makes that panel the active one.

**Fix:** Close the dialog with <kbd>Esc</kbd>. Click the cut on the timeline (or an empty part of a track) and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> again. See [Add the default transition with Ctrl+Shift+D](fades-and-transitions.md#add-the-default-transition-with-ctrlshiftd).

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

**Cause:** The two clips are out of step by that many frames. This happens when you move or slip one of them on its own, for example after you selected it with <kbd>Alt</kbd>+click or with **Linked selection** off, or when one of them sits on a locked track and only the other one moved. Trimming one side alone (a J or L cut) does not cause it.

**Fix:** Right-click the clip that should move and choose **Move into sync**, or press <kbd>Ctrl</kbd>+<kbd>Z</kbd> until the numbers disappear. See [Keep linked clips in sync](links-and-groups.md#keep-linked-clips-in-sync).

### Q, W or E does nothing

**Symptom:** You press <kbd>Q</kbd>, <kbd>W</kbd> or <kbd>E</kbd>, and no clip changes.

**Cause:** One of these:
- <kbd>Q</kbd> and <kbd>W</kbd>: no clip is under the playhead, or the clip under it starts exactly at the playhead, so there is nothing to trim.
- <kbd>Q</kbd> and <kbd>W</kbd>: the clip's track is not targeted (its crosshair is dimmed) or is locked. See [Choose the tracks your edits use](tracks.md#choose-the-tracks-your-edits-use-target).
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

**Cause:** The clip's speed was changed, with a speed button, the **Speed** section or **Rate stretch**. A `1x` badge means the clip was stretched and then dragged back to its old length in a separate drag: its speed is a tiny bit off normal speed. The difference is too small to see or hear.

**Fix:** Select the clip and click **1x** in the quick actions of **Edit Properties**, or type `100` in **Speed**: the badge disappears. You can also press <kbd>Ctrl</kbd>+<kbd>Z</kbd> until it disappears. See [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md) and [Change a clip's speed with Rate stretch](advanced-trimming.md#change-a-clips-speed-with-rate-stretch).

### Clicking a clip cuts it

**Symptom:** You click a clip to select it, and it splits in two instead, together with its sound. Dragging on the tracks draws no selection rectangle.

**Cause:** The **Razor** tool is active: its button in the timeline toolbar is gold. <kbd>C</kbd> chooses it in every panel, so a stray key press switches the tool. Each project remembers its tool.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the cut, then press <kbd>V</kbd> or click **Select**. See [Cut clips with the Razor tool](splitting-and-deleting.md#cut-clips-with-the-razor-tool).

### Ctrl+K or the Razor does not split a clip

**Symptom:** You press <kbd>Ctrl</kbd>+<kbd>K</kbd>, or click a clip with the **Razor**, and the clip stays whole.

**Cause:** One of these:
- Other clips are selected. With a selection, <kbd>Ctrl</kbd>+<kbd>K</kbd> splits only the selected clips.
- The clip's track is locked, or, for <kbd>Ctrl</kbd>+<kbd>K</kbd> with nothing selected, not targeted (its crosshair is dimmed).
- The playhead is not over the clip, or it is exactly on the clip's start or end.
- With the **Razor**, the cut line snapped onto the clip's start or end.
- A text field has the keyboard focus.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> to clear the selection, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> to split every unlocked track. Unlock or target the track in its header. Move the playhead into the clip. With the **Razor**, zoom in, or turn snapping off with <kbd>S</kbd>, so the line stays inside the clip. See [Split clips at the playhead](splitting-and-deleting.md#split-clips-at-the-playhead).

### Deleting a video also deleted its sound

**Symptom:** You deleted a video clip, and its sound on the audio track disappeared too, or the other way round.

**Cause:** A video and its sound are linked, and while **Linked selection** is on, a delete removes linked clips, also when you selected only one of them with <kbd>Alt</kbd>+click. A delete also removes every clip of a group.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring both back. Then turn off **Linked selection** (<kbd>Shift</kbd>+<kbd>S</kbd>), or unlink the clips with <kbd>Ctrl</kbd>+<kbd>L</kbd>, and delete again. See [Delete clips](splitting-and-deleting.md#delete-clips) and [Linking and grouping clips](links-and-groups.md).

### Closing a gap moved clips on other tracks

**Symptom:** You closed a gap, ripple deleted a clip or closed all gaps, and clips on other tracks moved left too.

**Cause:** That is how a ripple works: the clips on the other tracks after the gap move along, so titles, sound effects and music that sit on a cut stay on it. See [How other tracks follow a ripple](splitting-and-deleting.md#how-other-tracks-follow-a-ripple).

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. To close a gap on one track only, select the clips after the gap on that track and drag them to the left: they snap onto the end of the clip before the gap. Or lock the tracks that should stay where they are, then close the gap: locked tracks never move. See [Lock a track](tracks.md#lock-a-track).

### A ripple delete or Close gap stopped short

**Symptom:** After **Ripple delete**, **Close gap** or **Close all gaps**, a gap is still there or only got smaller. A message such as **Ripple delete stopped short**, **Gap closed partly**, **Can't close the gap**, **Some gaps stayed open** or **Deleted without closing the gap** names a clip and a track, for example "Music on A2 can't move further left without overlapping."

**Cause:** The clips on the other tracks move with the ripple to stay in step. The clip in the message can't move that far without overlapping the clip before it on its track, for example a long music clip that runs under the gap. The gap then closes only as far as that clip can follow.

**Fix:** Move, trim or delete the clip in the message, or the clip before it, so it has room. Then select the gap and press <kbd>G</kbd> to close the rest. See [How other tracks follow a ripple](splitting-and-deleting.md#how-other-tracks-follow-a-ripple).

### G does nothing or closes another gap

**Symptom:** You press <kbd>G</kbd> and nothing happens, or a gap other than the one you meant closes.

**Cause:** With no gap selected, <kbd>G</kbd> closes the gap at the playhead: the gap the playhead is in, or the gap right after the clip it is on. When several tracks have such a gap, the one that ends first closes. Only targeted tracks that are not locked count. When there is none, nothing happens. <kbd>G</kbd> also needs the Timeline panel to be active.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> if the wrong gap closed. Click the gap you mean to select it (it gets a dashed gold outline), then press <kbd>G</kbd>. See [Close a gap](splitting-and-deleting.md#close-a-gap).

### Clicking a clip selects nothing

**Symptom:** You click a clip, and it does not turn gold. <kbd>Ctrl</kbd>+<kbd>A</kbd> and selection rectangles skip it, and its edges can't be dragged.

**Cause:** The clip's track is locked: its padlock is closed and gold, and diagonal lines cover the row. Clips on a locked track can't be selected or changed.

**Fix:** Click the padlock in the track header to unlock the track. See [Lock a track](tracks.md#lock-a-track).

### A drop or a move is refused on a locked track

**Symptom:** You drop or nudge clips, and nothing changes. The message **Can't drop clips onto a locked track** or **Can't move clips on a locked track** names a track.

**Cause:** That track is locked. No clip can be moved onto it or off it.

**Fix:** Unlock the track with the padlock in its header, or drop the clips on another track. See [Lock a track](tracks.md#lock-a-track). The same message appears when you drag media from the Media panel or files from File Explorer onto a locked track; see [Dropped files were imported but not placed](#dropped-files-were-imported-but-not-placed).

### A track can't be deleted

**Symptom:** **Delete track** is dimmed in the track menu, or the message **Can't delete a locked track** appears.

**Cause:** The track, or one of the selected tracks, is locked.

**Fix:** Click the padlock in its header to unlock it, then delete the track again. See [Delete tracks](tracks.md#delete-tracks).

### Clicking a clip selects other clips too

**Symptom:** You click one clip, and other clips, also on other tracks, turn gold with it.

**Cause:** The clip is in a group, or it is linked to them (a video and its sound). A click selects the whole group and, while **Linked selection** is on, the linked clips.

**Fix:** <kbd>Alt</kbd>+click the clip to select it alone. To end the group, select it and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>. See [Linking and grouping clips](links-and-groups.md).

### Clicking a video no longer selects its sound

**Symptom:** A click on a video clip selects only the video, and trims, splits and deletes no longer change its sound.

**Cause:** **Linked selection** is off (its chain button in the timeline toolbar is not gold). <kbd>Shift</kbd>+<kbd>S</kbd> switches it in every panel, so a stray key press can turn it off. Or the two clips were unlinked with <kbd>Ctrl</kbd>+<kbd>L</kbd>.

**Fix:** Press <kbd>Shift</kbd>+<kbd>S</kbd>, or click **Linked selection**, so it is gold. If the clips were unlinked, select both and press <kbd>Ctrl</kbd>+<kbd>L</kbd>. See [Turn Linked selection off](links-and-groups.md#turn-linked-selection-off).

### Ctrl+L does not link the clips

**Symptom:** You press <kbd>Ctrl</kbd>+<kbd>L</kbd>, and the message **Select a video and an audio clip to link** appears. Or the clips you meant to link get unlinked.

**Cause:** Linking needs at least one audio clip and at least one video or image clip, each on its own track. When any selected clip is already linked, <kbd>Ctrl</kbd>+<kbd>L</kbd> unlinks instead. Outside the Timeline panel, the browser gets <kbd>Ctrl</kbd>+<kbd>L</kbd> and moves to its address bar.

**Fix:** Click the timeline, select one audio clip and one video or image clip on different tracks, and press <kbd>Ctrl</kbd>+<kbd>L</kbd> again. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> if the wrong clips were unlinked. See [Link clips](links-and-groups.md#link-clips).

### A clip shows no thumbnails or waveform

**Symptom:** A video, image or audio clip shows only its color below the label bar, or only a label bar.

**Cause and fix:** Check these in order.

| You see | Cause | Fix |
| --- | --- | --- |
| The clip is only a label bar, with no body below it. | Its track is set to height S. | Click the height toggle (three stacked rows) in the track header until the track is M or L. See [Show thumbnails and waveforms](clip-thumbnails-and-waveforms.md#show-thumbnails-and-waveforms). |
| A video or image clip shows only its color, while wider clips show thumbnails. | The clip is narrower than 48 pixels on screen. | Zoom in. |
| Thumbnails or waveforms are missing right after an import, or while you play. | The editor is still making them. It pauses while you play, scrub or drag. | Stop playback and wait a moment. See [Know when thumbnails and waveforms appear](clip-thumbnails-and-waveforms.md#know-when-thumbnails-and-waveforms-appear). |
| A video clip never gets thumbnails, and the media card keeps the film icon. | Chrome can't decode the video on this computer. | See [A video imports but shows nothing](#a-video-imports-but-shows-nothing). |
| The clip is gray, with a red **Offline** badge in its label bar. | The editor can't read the clip's media file. | See [Cards show Offline and their clips are gray](#cards-show-offline-and-their-clips-are-gray). |
| An audio clip never gets a waveform, and it plays no sound. | The sound can't be decoded, or its file is missing. | See [Playback has no sound](#playback-has-no-sound). |

### Thumbnails repeat or show the wrong frames

**Symptom:** After you zoom in, the same thumbnail appears several times in a row, or the thumbnails don't match the frames under them.

**Cause:** The editor is making closer thumbnails for that part of the video. Meanwhile, the nearest thumbnails it already has stand in. While you play, scrub or drag, it waits.

**Fix:** Wait. On an idle computer the right thumbnails usually appear within a second; during playback they fill in right after you stop. Zoomed in very far, neighboring thumbnails keep showing the same frame: the closest level has one thumbnail every 5 frames of the video. See [See more frames by zooming in](clip-thumbnails-and-waveforms.md#see-more-frames-by-zooming-in).

### A clip shows a chain icon

**Symptom:** A chain icon appears at the right end of a clip's label bar.

**Cause:** The clip is linked, for example a video and its sound. If you deleted one of two linked clips on its own (with **Linked selection** off), the other one keeps the icon, although nothing is linked to it any more.

**Fix:** Nothing to fix. To remove the link, click the clip and press <kbd>Ctrl</kbd>+<kbd>L</kbd>, or right-click it and choose **Unlink**. See [Unlink clips](links-and-groups.md#unlink-clips).

### Dragging a clip moves the view instead

**Symptom:** You drag a clip, but the whole timeline moves with the pointer and the clip stays where it is. Clicking a clip selects nothing, and the cursor over the tracks is a hand.

**Cause:** The **Hand** tool is active: its button in the timeline toolbar is gold. <kbd>H</kbd> chooses it in every panel, and each project remembers its tool. A drag with the middle mouse button also pans, whatever the tool.

**Fix:** Press <kbd>V</kbd> or click **Select**, then drag the clip with the left mouse button. Panning changes nothing in your edit, so there is nothing to undo. See [Pan the view](timeline.md#pan-the-view).

### The timecode field turns red or jumps somewhere unexpected

**Symptom:** You type a time into the timecode field of the timeline toolbar and press <kbd>Enter</kbd>. The field gets a red border and the playhead does not move, or the playhead lands far from where you meant.

**Cause:** One of these:
- The text is not a time the editor can read, for example it contains a letter (`1:x5`) or more than four fields. The red border stays until the text reads as a time.
- Times are shown in milliseconds (the chip under the preview reads **ms**). Then `:` separates minutes and seconds, so `5:00` means 5 minutes, not 5 seconds.
- You typed a number on its own: it is always a frame number, so `120` is frame 120, not 120 seconds.

**Fix:** Correct the text and press <kbd>Enter</kbd>, or press <kbd>Esc</kbd> to put the playhead's time back. For seconds, type a `.` after the number, for example `+2.` for 2 seconds later. See [Jump to a timecode](timeline.md#jump-to-a-timecode).

### Timecodes show milliseconds instead of frames

**Symptom:** The timecodes under the preview, in the timeline toolbar and in the ruler read like `00:12.500` instead of `00:12:15`.

**Cause:** The timecode format is set to milliseconds: the chip left of the timecode under the preview reads **ms**. Each project remembers the format.

**Fix:** Click **ms** under the preview. It turns back into **ff** and every timecode shows frames again. See [Show times in milliseconds](timeline.md#show-times-in-milliseconds).

### Clicking the ruler doesn't move the playhead

**Symptom:** You click in the ruler, but the playhead stays where it is. A marker gets a gold outline instead, or a bracket of the in/out range lights up.

**Cause:** Markers sit along the bottom of the ruler, and the in and out brackets take the upper part of the ruler within a few pixels of them. A click there selects the marker or grabs the bracket.

**Fix:** Click a little to the side of the marker or the bracket. To put the playhead exactly on one, press <kbd>Shift</kbd>+<kbd>Down</kbd> or <kbd>Shift</kbd>+<kbd>Up</kbd> for markers, or <kbd>Shift</kbd>+<kbd>I</kbd> or <kbd>Shift</kbd>+<kbd>O</kbd> for the in and out points. See [Markers and in/out points](markers-and-in-out-points.md).

### M opens an editor instead of adding a marker

**Symptom:** You press <kbd>M</kbd> and a small editor with a name field opens under the ruler, but no new marker appears.

**Cause:** A marker already sits at the playhead. <kbd>M</kbd> adds no second marker on that frame: it opens the marker's editor instead.

**Fix:** Type a name and press <kbd>Enter</kbd>, or press <kbd>Esc</kbd> to close the editor. To add another marker, move the playhead to another frame first. See [Add markers](markers-and-in-out-points.md#add-markers).

### Delete removed a marker, or Edit Properties keeps showing a marker

**Symptom:** You press <kbd>Delete</kbd> and a marker disappears from the ruler while the clips stay. Or **Edit Properties** keeps showing the **Marker** section after you click an empty part of the tracks.

**Cause:** A marker is selected (it has a gold outline). Clicking an empty part of the tracks doesn't deselect it, and while it is selected, <kbd>Delete</kbd> deletes the marker.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring the marker back. Click a clip, a gap or a track header to deselect the marker, then delete what you meant to delete. See [Delete markers](markers-and-in-out-points.md#delete-markers).

### The in or out point disappeared

**Symptom:** You set an in point and an out point, and later one of them, or the whole shaded range, is gone.

**Cause:** One of these:
- You set an in point after the out point, or an out point before the in point: the other point is cleared.
- You used **Lift** or **Extract**: both points are cleared when the edit is done.
- You pressed <kbd>Alt</kbd>+<kbd>I</kbd>, <kbd>Alt</kbd>+<kbd>O</kbd> or <kbd>Alt</kbd>+<kbd>X</kbd>.

Undo doesn't bring in and out points back: they are not part of the history.

**Fix:** Set them again with <kbd>I</kbd> and <kbd>O</kbd>, or with <kbd>X</kbd> on a clip. See [Set in and out points](markers-and-in-out-points.md#set-in-and-out-points).

### Lift or Extract does nothing or changes the wrong tracks

**Symptom:** You press <kbd>;</kbd> or <kbd>'</kbd> and nothing happens, a message appears, or a track you wanted to change stays as it is.

**Cause:** One of these:
- **Set an in or out point first:** no range is marked.
- **No targeted track:** every track is untargeted or locked.
- **Lift** and **Extract** change only targeted tracks that are not locked. They ignore the selected clips and **Linked selection**, so a video's sound on an untargeted track stays.
- The Timeline panel is not active: <kbd>;</kbd> and <kbd>'</kbd> work only there.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> if the wrong tracks changed. Set the range with <kbd>I</kbd> and <kbd>O</kbd>, turn on the crosshair of every track to change and turn it off on the others, click the timeline, then try again. See [Lift or extract a range](markers-and-in-out-points.md#lift-or-extract-a-range).

## Folders and saving

### The browser asks for access to a folder

**Symptom:** When you create, open or reopen a project, the browser asks whether Shorts Editor may view or edit the files in the folder.

**Cause:** Your project lives in a folder on your disk, and the browser protects your files: it asks before a web page can read or change a folder. It can ask again in a later session, for example when you reopen a project from **Recent projects**.

**Fix:** Allow the editor to edit the files.
- If you allow only viewing, the project opens read-only. See [The project opens read-only](#the-project-opens-read-only).
- If you deny access or close the prompt, the **Permission needed** dialog appears, for example with "Shorts Editor has no permission to read the folder "My video"." Click **Try again** to see the browser's prompt again, or **Cancel**.

### The project opens read-only

**Symptom:** A banner under the app bar reads "Read-only: Shorts Editor has no permission to write to this folder, so changes are not saved." The save dot next to the project name is gray. Importing shows "This project is read-only" with "Allow editing to import media.", and **Clear cache** with "Allow editing to clear the cache." In **History**, **Restore…** is dimmed.

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

**Restore a backup of project.json:** Each save keeps the previous version in the project's `history` folder, up to the 20 most recent. While a project opens, **History…** in the **Project** section restores one for you (see [Restore an older version](projects-and-saving.md#restore-an-older-version)); when it doesn't open, restore one by hand. The files are named by date and time in UTC, for example `project-20261015-143000.json`.
1. Copy the damaged `project.json` somewhere safe.
2. Copy the newest file from `history` into the project folder and rename it `project.json`.
3. Open the folder again.

See [Projects and saving](projects-and-saving.md).

### Changes are not saved

**Symptom:** The save dot next to the project name turns red, and its tooltip reads "Save failed: ..." with a reason and "Click to retry".

**Cause:** The editor could not write to the project folder, for example because the folder was moved, renamed or deleted while open, the drive was disconnected, or the disk is full.

**Fix:** Solve the cause (reconnect the drive, free disk space, put the folder back), then click the save dot or press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save again.

### Opening another project asks Discard unsaved changes?

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> or <kbd>Ctrl</kbd>+<kbd>O</kbd>, and instead of the folder picker, **Discard unsaved changes?** appears.

**Cause:** The open project is read-only, and you changed it. Those changes were never saved and would be lost when another project opens.

**Fix:** Click **Allow editing** and allow editing when the browser asks: your changes are saved into the project folder. Or click **Discard and continue** to drop them and go on, or **Cancel** to stay. See [Before read-only changes are lost](projects-and-saving.md#before-read-only-changes-are-lost).

### The browser asks whether to leave the site

**Symptom:** When you close or reload the tab, Chrome asks whether you want to leave (or reload) the site.

**Cause:** Changes would be lost: the project is read-only and has changes, or the last save failed (the save dot is red).

**Fix:** Click **Cancel** to stay. Then click **Allow editing** in the read-only banner, or fix the save problem and click the red save dot. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode) and [Changes are not saved](#changes-are-not-saved).

### History shows no versions or can't restore one

**Symptom:** The **History** dialog reads "No earlier versions yet: they appear after the first saves." or "Couldn't read the history folder:" with a reason, **Restore…** is dimmed, or a restore ends with the message **Can't restore this backup**.

**Cause and fix:**

| What you see | Cause | Fix |
| --- | --- | --- |
| "No earlier versions yet" | The project has not been saved since it was created, or the `history` folder was emptied. | Make a change and wait for the green save dot: each save keeps the version before it. |
| "Couldn't read the history folder:" | The browser could not read the `history` folder, for example because it was moved or deleted. | Check that the project folder is complete, then open **History…** again. |
| **Restore…** is dimmed (tooltip **Read-only project: allow editing to restore**) | The project is read-only. | Click **Allow editing** in the banner. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode). |
| **Can't restore this backup**: "The current version could not be saved first, so nothing was restored. Check the save status and try again." | The editor saves your current state before a restore, and that save failed. | Fix the save problem (see [Changes are not saved](#changes-are-not-saved)), then try again. |
| **Can't restore this backup**: the file "is no longer in the history folder." | The backup was deleted, for example by the rotation that keeps the newest 20. | Open **History…** again and pick a version from the new list. |
| **Can't restore this backup** with another reason | The backup file is damaged or was edited by hand. | Pick another version. |

See [Restore an older version](projects-and-saving.md#restore-an-older-version).

### Clear cache is refused or the thumbnails are missing afterwards

**Symptom:** **Clear cache** shows the message **This project is read-only** or **Can't clear the cache**, or right after clearing, clips have no thumbnails or waveforms and video cards show a grey **PX** chip.

**Cause:** A read-only project can't delete files. **Can't clear the cache** means the browser could not delete the files; its reason says why. Right after a clear, the thumbnails, waveforms and proxies are being made again.

**Fix:** For a read-only project, click **Allow editing** first. For **Can't clear the cache**, check that the project folder is still where it was, then try again. After a clear, wait: thumbnails and waveforms come back within moments, and proxies take about as long as their videos. See [Clear the cache](projects-and-saving.md#clear-the-cache).

## Project settings and templates

### Changing the frame rate asks before converting

**Symptom:** You chose another **Frame rate**, and the **Convert to … fps?** dialog appears with a warning such as "14 timings fall between frames and are rounded to the nearest one".

**Cause:** Some timings of the project don't land on a frame of the new rate, for example when you go from 30 to 24 fps. The editor tells you before it rounds them.

**Fix:** Click **Convert** to go on, or **Cancel** to keep the current rate. After a conversion, <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts back every timing exactly. To avoid rounding, convert to a whole multiple of the current rate, such as 30 to 60 fps. See [Change the frame rate](project-settings-and-templates.md#change-the-frame-rate).

### A clip or a keyframe moved after a frame rate change

**Symptom:** After a frame rate change, a cut is a frame off, a clip starts one frame later, or a clip has one keyframe fewer.

**Cause:** The conversion rounded timings that fell between frames. A clip that would have rounded to nothing keeps one frame and pushes the next clip a frame later, and two keyframes that landed on the same frame became one. The dialog before the conversion counted these.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to go back to the old rate, or fix the clip by hand with a trim or a nudge. See [When timings are rounded](project-settings-and-templates.md#when-timings-are-rounded).

### A template is missing from the start screen

**Symptom:** A template you saved is not under **New from template**.

**Cause:** Templates are stored in the browser where you saved them. Another browser or browser profile has its own, clearing the site data of Shorts Editor deletes them, and a template saved with the same name as an older one replaced it.

**Fix:** Open a project with the setup you want in this browser and click **Save as template…** again. See [Save a project as a template](project-settings-and-templates.md#save-a-project-as-a-template).

### The New project dialog has no Template field

**Symptom:** The **New project** dialog shows **Name**, **Resolution** and **Frame rate**, but no **Template**.

**Cause:** The field appears only when this browser has at least one template.

**Fix:** Save a template first. See [Save a project as a template](project-settings-and-templates.md#save-a-project-as-a-template).

### New images, solids, titles or transitions have an unexpected length

**Symptom:** A new image, solid, title, freeze frame or transition is longer or shorter than this guide's defaults (5 s, 5 s, 3 s, 2 s and 15 frames).

**Cause:** Their lengths are settings, for all your projects in this browser, and they were changed.

**Fix:** Check **Still image**, **Title**, **Solid** and **Freeze frame** under **New clips**, and **Length** under **Transitions**, in **Settings** > **General**. See [Set the length of new clips](settings.md#set-the-length-of-new-clips) and [Choose the default transition](settings.md#choose-the-default-transition).

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

**Symptom:** The video appears in the Media panel, but its card keeps showing the plain film icon instead of a thumbnail. Its clip is on the timeline, but it shows no thumbnails. Once the clip is under the playhead, the card gets a red **Can't play** badge, the clip turns gray, and the preview shows a gray slate with "Media can't be played".

**Cause:** Your browser cannot decode the video's codec on this computer. Importing reads only the file's structure, so the problem shows when the picture is needed. Common cases are HEVC (H.265) on a computer whose graphics hardware cannot decode it, and professional codecs such as ProRes.

**Fix:**
1. Check the codec: click **List view** in the Media panel and read the **Codec** column.
2. Convert the video to MP4 with H.264 (on an iPhone, the **Most Compatible** camera format records H.264).
3. Click **Relink…** on the card and pick the converted file. The clips keep their place and show the picture. See [Relink a media item to a file](offline-media-and-relinking.md#relink-a-media-item-to-a-file).

If the card shows **Offline** instead, the video's file is missing: see [Cards show Offline and their clips are gray](#cards-show-offline-and-their-clips-are-gray).

## Organizing media

### Media are missing from the Media tab

**Symptom:** Media you imported don't show in the **Media** tab, or the tab reads **No media here** with "Nothing matches this bin, the filters and the search."

**Cause:** The tab shows only what the bin strip, the filter chips and the search let through: a bin or one kind (**Video**, **Audio**, **Images**) is shown, a chip such as **Unused** is on, or there is text in **Search media**. New imports never go into a bin by themselves, so they don't show while a bin of your own is shown.

**Fix:** Click **Clear filters** (it turns the chips off and empties the search), then click **All** in the bin strip. See [Show everything again](organizing-media.md#show-everything-again).

### Delete or Move to bin left some selected media out

**Symptom:** You selected several media items, then typed in the search, turned a chip on or showed another bin. <kbd>Delete</kbd>, **Move to bin** or a drag then acted on fewer items than you selected.

**Cause:** Media that the bin, the chips or the search hide leave the selection, so no action touches media you can't see.

**Fix:** Show the media first (click **All** and **Clear filters**), select them again, then act. See [Select what the tab shows](organizing-media.md#select-what-the-tab-shows).

### Media can't be dropped on a bin

**Symptom:** Cards dragged onto **All**, **Video**, **Audio** or **Images** in the bin strip don't go anywhere.

**Cause:** These four chips sort your media by kind on their own. Only the bins you create take media.

**Fix:** Click **New bin** in the panel header, then drag the cards onto the new chip. To take media out of a bin, right-click them and click **None** in the **Move to bin** row. See [Put media into a bin](organizing-media.md#put-media-into-a-bin).

### Reveal in folder doesn't open a folder

**Symptom:** **Reveal in folder** shows a message with a path, such as **In the project folder: media/clip.mp4**, instead of opening File Explorer.

**Cause:** A web page can't open folders on your computer.

**Fix:** Find the file yourself: the path starts in the project folder for a copy, and at the folder you dropped for a linked file. The path is on your clipboard when the message adds "Path copied." See [Find a media file on your disk](organizing-media.md#find-a-media-file-on-your-disk).

## Offline media

### Cards show Offline and their clips are gray

**Symptom:** When you open the project, a message reads, for example, **2 media files offline**. Cards in the **Media** tab show a red **Offline** badge, the notice strip reads "2 files offline", the clips are gray with an **Offline** badge, and the preview shows a gray slate with "Media offline".

**Cause:** The editor can't find the files. A linked file was moved, renamed or deleted; a copy was removed from the project's `media` folder; or you opened the project in another browser or on another computer, which doesn't have the links to your files.

**Fix:**
- Click **Relink…** on a card and pick the file. See [Relink a media item to a file](offline-media-and-relinking.md#relink-a-media-item-to-a-file).
- If several files moved together, click **Relink folder…** in the notice strip and pick the folder they are in now. See [Relink many files from a folder](offline-media-and-relinking.md#relink-many-files-from-a-folder).
- If you put a file back where it was while the project was open, reopen the project: the editor finds it again.

### A card shows No access

**Symptom:** A card shows a red **No access** badge, the notice strip reads, for example, "2 linked files need your permission", and the preview shows a slate with "Media offline: no access".

**Cause:** The files are linked and still there, but after a restart the browser asks again before the editor can read them.

**Fix:** Click **Allow access** in the notice strip (or on the card), and allow it when Chrome asks. If the message **2 linked files still offline** appears, click **Allow access** again. See [Give the browser access to linked files](offline-media-and-relinking.md#give-the-browser-access-to-linked-files).

### A card shows Can't play

**Symptom:** A card shows a red **Can't play** badge, and the preview shows a slate with "Media can't be played".

**Cause:** The file is there, but Chrome can't decode it on this computer.

**Fix:** See [A video imports but shows nothing](#a-video-imports-but-shows-nothing): convert the file and relink the item to the converted file.

### Relink says Can't relink

**Symptom:** After you pick a file for **Relink…**, the message **Can't relink** appears with the item's name, and the item stays offline.

**Cause and fix:** The second line of the message gives the reason.

| Reason | Fix |
| --- | --- |
| *file* **is shorter than its clips need** | The file is shorter than the part of the media the clips use, for example a trimmed export. Pick the full-length file. |
| *file* **has no sound for its audio clips** | Audio clips use the item, but the file has no sound. Pick a file with sound. |
| *file* **is audio, not video**, or another pair of kinds | The file is not of the item's kind. Pick a video for a video, an audio file for audio, an image for an image. |
| *file*: **unsupported file type** | The editor doesn't import this type. See [Supported file types](importing-media.md#supported-file-types). |
| *file* followed by an import error, such as **Not a readable MP4/MOV file** | The file can't be read. See [A file cannot be imported](#a-file-cannot-be-imported). |

### Relink folder doesn't find a file

**Symptom:** **Relink folder…** reports, for example, **Relinked 1 of 2 offline files** with "1 file not found in Footage (same name and size)".

**Cause:** The editor finds files by their file name, and for media imported with this version also by their size. A file that was renamed, edited or exported again (so its size changed) is not found. For older media without a size, a name that several files in the folder share is not taken either. The search also stops after 20,000 files ("only its first 20,000 files were searched").

**Fix:** Click **Relink…** on the card and pick the file yourself: a single relink doesn't compare names or sizes, only the kind, the length and the sound. Or pick a smaller folder. See [Relink many files from a folder](offline-media-and-relinking.md#relink-many-files-from-a-folder).

### A clip shows Media removed

**Symptom:** A clip is gray with an **Offline** badge, and the preview shows a slate with "Media removed". Its media is no longer in the Media panel.

**Cause:** You removed its media item with **Remove from project**, which keeps the clips.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring the media item back, or select the clips and press <kbd>Delete</kbd>. These clips can't be relinked. See [Clips of removed media](offline-media-and-relinking.md#clips-of-removed-media).

### Media came back offline after Undo

**Symptom:** You removed media with **Also delete its copied file from the media folder** ticked, then pressed <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the items and their clips are back, but offline.

**Cause:** Deleting files from your disk can't be undone. Undo brings back the media items, not their files.

**Fix:** Relink the items to the original files, if you still have them. See [Relink a media item to a file](offline-media-and-relinking.md#relink-a-media-item-to-a-file).

## Proxies

### A video gets no proxy

**Symptom:** A video's card in the Media panel shows no **PX** chip, and the **Proxy** column of **List view** reads **None**.

**Cause and fix:** Check these in order.

| Cause | Fix |
| --- | --- |
| The video is light enough for the **Proxy for** rule. By default, only videos above 1080p or above 30 fps get a proxy, so a 1080×1920 clip at 30 fps gets none. | Usually it plays smoothly without one. To make one anyway, right-click the card and choose **Generate proxy**, or choose **Every video** in **Proxy for**. |
| **Proxies** is off in the **Project** section of **Edit Properties**. | Turn it on, or right-click the card and choose **Generate proxy**. See [Change the proxy settings](proxies.md#change-the-proxy-settings). |
| You chose **Remove proxy** for this video before. Such a video never gets a proxy automatically again. | Right-click the card and choose **Generate proxy**. |
| The project is read-only: the editor makes no proxies, and **Generate proxy** shows **This project is read-only**. | Click **Allow editing** in the banner. See [The project opens read-only](#the-project-opens-read-only). |
| The item is an audio file or an image. | Nothing to fix: only videos get proxies. |

### A proxy chip is red

**Symptom:** A video's card shows a red **PX** chip, its tooltip reads **No proxy: it could not be made (Generate proxy tries again)**, and the **Proxy** column of **List view** reads **Failed**.

**Cause:** The editor could not make the proxy. The original video can't be decoded on this computer (for example HEVC without a hardware decoder), its file is missing from the project's `media` folder, the browser has no H.264 encoder for its size, or the proxy could not be written to the project folder, for example because the disk is full. The editor does not try again by itself. Meanwhile the preview uses the original video.

**Fix:**
1. Check that the video shows in the preview. If it doesn't, see [A video imports but shows nothing](#a-video-imports-but-shows-nothing).
2. Free some disk space if the disk is full.
3. Right-click the card and choose **Generate proxy** to try again.

To clear the red chip without making a proxy, right-click the card and choose **Remove proxy**. See [Proxies](proxies.md).

### A proxy stops counting or starts over

**Symptom:** The percentage of a **PX** chip stays the same for a while, a grey **PX** chip shows no percentage, or a chip starts again at 0%.

**Cause:** One of these:
- Proxies pause while you play, or drag on the timeline (moving clips, trimming, scrubbing in the ruler), so the preview gets all the decoding power. They continue when you stop.
- Proxies are made one at a time, oldest import first. The others wait with a grey **PX** chip without a percentage (**Queued** in **List view**).
- You closed the project or the browser tab, or reloaded the page, while the proxy was made. A proxy can't continue where it stopped: it starts over from 0% the next time you open the project.

**Fix:** Nothing to fix. Stop playback to let the proxy continue. See [Follow a proxy while it is made](proxies.md#follow-a-proxy-while-it-is-made).

### The picture is softer while you play or scrub

**Symptom:** While you play or scrub, the picture looks a little softer, and the status line under the transport bar reads **Auto: proxy**. When you stop, it gets crisp again and reads **Auto: full**.

**Cause:** The preview plays and scrubs on the video's proxy, a light copy that is 540 pixels on its short side by default. The difference shows most in a large preview or in the fullscreen preview.

**Fix:** Usually nothing: the paused frame and **Export frame** always use the original video. For a sharper picture while you play:
- Choose **720p** in **Proxy size**, then make the proxy again: right-click the card, choose **Remove proxy**, then **Generate proxy**.
- Or choose **Full** in **Preview quality**, if your computer plays the original smoothly.

If the picture stays soft after you stop and the status line reads **Proxy: proxy**, the **Preview quality** is **Proxy**: choose **Auto**. See [Edit with proxies in the preview](proxies.md#edit-with-proxies-in-the-preview).

## Adding media to the timeline

### Double-clicking a card pushed other clips to the right

**Symptom:** You double-click a card, or press <kbd>,</kbd>, and the clips after the playhead move right. A clip under the playhead is split in two.

**Cause:** A double-click and <kbd>,</kbd> insert: on every unlocked track, everything from the playhead on moves right to make room for the new clip, so nothing is covered. Earlier versions put the clip in the first free space after the playhead instead.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. To cover what is at the playhead instead, click the card and press <kbd>.</kbd> (overwrite). To add the clip after everything else, press <kbd>End</kbd> first. To put it in a free spot, drag the card there. See [Choose a way to add media](adding-media-to-the-timeline.md#choose-a-way-to-add-media).

### I or O marks a media card instead of the timeline

**Symptom:** You press <kbd>I</kbd> or <kbd>O</kbd>, the timeline's in and out points don't change, and a gold bar appears along the bottom of a card's picture in the Media panel.

**Cause:** The pointer was over the picture of a video or audio card. There, <kbd>I</kbd>, <kbd>O</kbd> and <kbd>Alt</kbd>+<kbd>X</kbd> mark the part of that media item to use, whichever panel you clicked last.

**Fix:** Move the pointer off the card and press the key again. To remove the gold bar, point at the card and press <kbd>Alt</kbd>+<kbd>X</kbd>. See [Use only part of a media item](adding-media-to-the-timeline.md#use-only-part-of-a-media-item).

### A clip from the Media panel is shorter than its media

**Symptom:** You add a video or audio item, and the clip covers only part of it.

**Cause:** A part of the item is marked: its card shows a gold bar along the bottom of the picture. Every way of adding the item uses only that part.

**Fix:** Point at the card and press <kbd>Alt</kbd>+<kbd>X</kbd> to clear the part, then add the item again. Or drag the clip's edges outward to get the rest back. See [Trimming clips](trimming.md).

### Dragged media landed on V2 and A2

**Symptom:** You drag a video with sound onto V2, and its sound lands on A2 (a new track when A2 didn't exist), not on A1.

**Cause:** The picture and the sound go on the tracks with the same number as the track under the pointer: over V2 that is V2 and A2, over A3 it is V3 and A3.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and drop over V1 or A1. Or move only the sound: <kbd>Alt</kbd>+click the sound clip to select it alone, then drag it to A1. See [Drag media onto the timeline](adding-media-to-the-timeline.md#drag-media-onto-the-timeline).

### Media dropped on the preview went to a new track

**Symptom:** You drag a card onto the preview, and a new video track appears above the others with the clip in it.

**Cause:** A drop on the preview never covers other clips. It uses the top video track only when that track is unlocked and empty at the playhead for the clip's whole length; otherwise it creates a new track. The same goes for **Add to canvas**.

**Fix:** This is expected. To use an existing track instead, drag the clip there afterwards. See [Drop media on the preview](adding-media-to-the-timeline.md#drop-media-on-the-preview).

### Dropped files were imported but not placed

**Symptom:** You drag files from File Explorer onto the timeline. They appear in the Media panel, but no clips are added, and the message **Can't drop clips onto a locked track** names a track.

**Cause:** The track under the pointer (or the track for the files' sound or picture) is locked. The import happens first, then the placement is refused.

**Fix:** Unlock the track with the padlock in its header, then drag the new cards from the Media panel onto the timeline. If the message **This project is read-only** appears instead, nothing was imported: allow editing first. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

### Nothing is added when you drag or press , or .

**Symptom:** You release a media drag, or press <kbd>,</kbd> or <kbd>.</kbd>, and no clip appears.

**Cause:** One of these:
- You released the drag outside the timeline and the preview, where the small label with the item's name follows the pointer. Releasing there adds nothing.
- You pressed <kbd>Esc</kbd> during the drag, which cancels it.
- The Media panel was not active and the pointer was not over a card's picture: <kbd>,</kbd> and <kbd>.</kbd> act on the selected media only while the Media panel is active.
- No media item was selected.

**Fix:** Drag again and release over a track or over the preview. Or click a card and press the key, or point at the card's picture and press it. See [Adding media to the timeline](adding-media-to-the-timeline.md).

## Playback and preview

### Playback stutters or drops frames

**Symptom:** Motion looks jerky, and **Dropped** in the status strip under the preview shows a number above 0 after you play. The number resets each time you start playing.

**Cause:** The computer cannot decode and draw every frame in time. Heavy footage (4K, 60 fps, HEVC, high bitrate) is the most common reason: 4K 60 fps HEVC at full quality is at the limit of what a laptop graphics card can decode. The editor makes [proxies](proxies.md) of such footage, but a video plays from the original while its proxy is not ready, and always in **Full** quality. Heat makes it worse: a laptop that has played 4K for a long time slows down.

**Fix:**
- Plug in your laptop and use a high-performance power mode.
- On a laptop with two graphics cards, make Windows run the browser on the faster one: open **Settings** > **System** > **Display** > **Graphics**, select your browser and choose **High performance**. Then relaunch the browser.
- Close other tabs and apps that play video or use the graphics card (video calls, games).
- Let a hot laptop cool down.
- Check the cards of your heavy videos in the Media panel: wait until their **PX** chip is green, and keep **Preview quality** at **Auto** (or choose **Proxy**) so playback uses the proxies. If a card has no chip, right-click it and choose **Generate proxy**. See [Proxies](proxies.md).
- Where you can, use 1080p footage instead of 4K.
- In the **Preview quality** menu of the preview header, choose **1/2** or **1/4**: playback draws at half or a quarter of the resolution, which is lighter. Make sure the mode is not **Full**: it never uses proxies and keeps full detail when you play zoomed in above 100%. See [Choose the preview quality](preview-zoom-overlays-fullscreen.md#choose-the-preview-quality).

**Not a problem:**
- Playback may wait up to half a second before it starts: the editor decodes the first frames.
- At 2x to 8x, the preview skips frames on purpose. They are not counted as dropped.
- Backward playback (<kbd>J</kbd>) needs more decoding than forward playback and can be less smooth with heavy footage.
- The first playback after the page loads, or right after a proxy is finished, can drop more frames than the following ones, especially in the fullscreen preview.

See [Preview and playback](preview-and-playback.md#know-what-to-expect-from-performance).

### Playback repeats only part of the timeline

**Symptom:** Playback jumps back to an earlier point again and again, or starts somewhere other than at the playhead.

**Cause:** **Loop playback** is on and in and out points are set. Every playback then repeats the range between them, and starts at the in point when the playhead is outside the range.

**Fix:** Click **Loop playback** to turn it off, or press <kbd>Alt</kbd>+<kbd>X</kbd> to clear the in and out points: the loop then covers the whole timeline again. See [Loop playback](preview-and-playback.md#loop-playback).

### The preview shows a nearby frame for a moment

**Symptom:** While you scrub or after a jump, the preview first shows a nearby frame, then switches to the exact one. In 4K phone clips without a proxy this can take about half a second.

**Cause:** Video is stored in groups of frames that each start with a keyframe. To show a frame from the middle of a group, the editor decodes from the keyframe before it. Meanwhile it shows the closest frame it has, so the picture never goes black. A [proxy](proxies.md) has a keyframe every 15 frames, so a video with a ready proxy shows its exact frame almost at once while you scrub; when you stop, its original frame follows within about half a second at most.

**Fix:** Nothing; the exact frame follows. For heavy footage, let its **PX** chip turn green to scrub on the proxy. **Export frame** always saves the exact frame at the playhead from the original media, even if you click it before the picture settles.

### Playback has no sound

**Symptom:** The picture plays, but you hear nothing, or one clip stays silent.

**Cause and fix:** Check these in order.

| Check | Fix |
| --- | --- |
| The button left of the **Master volume** knob shows a crossed-out speaker and reads **Unmute**. | Click **Unmute**. |
| The **Master volume** knob is turned far down: its tooltip reads, for example, **Master volume: -60.0 dB**. | Double-click the knob to go back to 0.0 dB. |
| You play backward, at 2x or faster, step frames or drag in the ruler. | Playback has sound only at 1x forward. Press <kbd>K</kbd> to pause, then <kbd>Space</kbd> to play forward at 1x. To hear the sound while you step or scrub, turn on **Audio scrub** in the timeline toolbar. |
| **M** is highlighted in the header of the clip's audio track, or **S** is highlighted on another audio track. | Click the toggle to turn it off. See [Mute and solo audio tracks](audio.md#mute-and-solo-audio-tracks). |
| The audio clip is drawn faded with diagonal lines: it is muted or turned off. | Select it and click **Unmute** in the quick actions, or right-click it and choose **Enable**. See [Mute a clip](audio-editing.md#mute-a-clip). |
| The clip's white line runs along the bottom of the clip, and **Volume** in the **Audio** section reads a very low value such as -60.0. | Type `0` in **Volume**. See [Change a clip's volume](audio-editing.md#change-a-clips-volume). |
| The meter at the right edge of the preview moves, but you still hear nothing. | The sound leaves the editor. Check the browser tab: if it shows a crossed-out speaker, right-click the tab and choose **Unmute site**. Then check your system volume and output device. |
| The clip's file is an .mp3, .aac, .wav or .ogg file over 1 GB. | Such files play no sound. Convert the file to .m4a (AAC) and import it again. |
| The clip is gray with a red **Offline** badge: its file is missing, or the browser needs your permission to read it. | Relink the media, or click **Allow access** in the **Media** tab. See [Offline media and relinking](offline-media-and-relinking.md). |
| The sound cannot be decoded. | Convert the file to .m4a, .mp3 or .wav and import it again. |

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

### A clip does not show in the preview

**Symptom:** A video or image clip is under the playhead, but the preview shows the background or the tracks below it. On the timeline, the clip is drawn faded.

**Cause:** Its track is muted (**M** is gold) or hidden (the eye is crossed out) in the track header. Or the clip itself is turned off: then it is also covered with diagonal lines.

**Fix:** Click **M** or the eye to turn it off. For a clip with diagonal lines, right-click it and choose **Enable**, or turn on **Enabled** in the **Clip** section of **Edit Properties**; see [Turn a clip off](editing-properties.md#turn-a-clip-off). If the clip is not faded, a clip on a higher video track covers it: drag its track header above the other video tracks, or <kbd>Alt</kbd>+click in the preview until the clip is selected, right-click inside its gold box and choose **Bring forward**. The clip may also sit outside the frame or be very small: select it on the timeline to see its box in the preview, then right-click inside the box and choose **Reset transform**. See [Mute, solo and hide tracks](tracks.md#mute-solo-and-hide-tracks) and [Reorder tracks](tracks.md#reorder-tracks).

### The other panels disappeared

**Symptom:** The preview fills the whole browser window. The Media, Edit Properties and Timeline panels are gone, and the header and transport bar of the preview come and go when you move the mouse.

**Cause:** The fullscreen preview is on. You pressed <kbd>F</kbd> or clicked **Fullscreen**.

**Fix:** Press <kbd>Esc</kbd> or <kbd>F</kbd>, or move the mouse and click **Exit fullscreen** in the header. Every panel comes back at its size and place. If <kbd>Esc</kbd> does nothing the first time, it closed a menu, cancelled a drag or left crop mode: press it again. See [Fill the window with the preview](preview-zoom-overlays-fullscreen.md#fill-the-window-with-the-preview).

### The zoomed preview is not sharp

**Symptom:** You zoomed the preview in above 100%, and the picture looks soft or blocky.

**Cause:** One of these:
- The video is playing, or you scrub or trim. With the **Auto** quality, the preview then shows the project's resolution or the video's proxy, and the status line reads **Auto: reduced** or **Auto: proxy**. The full detail follows 0.3 seconds after you stop.
- You just zoomed in, and the editor is still decoding the frame at the larger size.
- The quality is **Proxy** (the preview shows the proxies of your videos), or **1/2** or **1/4** while playing.
- The source has no more detail: a 1080×1920 clip in a 1080×1920 project has none beyond 100%, and a 4K landscape clip fitted to the frame width has detail up to about 356%. Frames larger than 4096 pixels on their long side are shown at 4096.
- The clip is an SVG image drawn larger than 4096 pixels on its longer side, the most it is drawn at: for an SVG that covers the whole 1080×1920 frame, above about 213%. See [Keep SVG images sharp](shapes-and-images.md#keep-svg-images-sharp).

**Fix:** Pause and wait a moment. If the status line doesn't read **full** at rest, choose **Auto** or **Full** in the **Preview quality** menu. See [See real detail when you zoom in](preview-zoom-overlays-fullscreen.md#see-real-detail-when-you-zoom-in).

### The mouse wheel moves the picture or does nothing

**Symptom:** Over the preview, the mouse wheel moves the picture up and down instead of zooming it, or it does nothing at all.

**Cause:** The wheel alone pans the preview while it is zoomed in, and does nothing at **Fit**, where the whole frame is visible. Zooming needs <kbd>Ctrl</kbd> or <kbd>Alt</kbd>.

**Fix:** Hold <kbd>Ctrl</kbd> (or <kbd>Alt</kbd>) while you roll the wheel, or pinch on a touchpad. See [Zoom with the mouse wheel](preview-zoom-overlays-fullscreen.md#zoom-with-the-mouse-wheel).

### An overlay does not show

**Symptom:** You turned on an overlay in the **Overlays** menu, but you don't see it on the preview.

**Cause:** One of these:
- **Rulers above 100%** shows only while you zoom in above 100%, and **Pixel grid from 800%** only at 800% or more.
- **Cells per side** changes the grid only while **Custom** is chosen under **Grid**.
- **Smart guides** draws nothing by itself. Its gold guides show only while you drag a picture with snapping on, or while you hold <kbd>Alt</kbd> with a picture selected. See [Pictures in the preview don't snap](#pictures-in-the-preview-dont-snap).
- The preview shows two frames side by side while you roll a cut, slip or slide a clip. The overlays come back when you release the mouse button.
- A safe zone area is too small on screen for its name: the shading shows without the name. Zoom in to read it.

**Fix:** Zoom in for the rulers and the pixel grid, and choose **Custom** for the cell count. See [Show grids, guides and rulers](preview-zoom-overlays-fullscreen.md#show-grids-guides-and-rulers).

> **Note:** Overlays never appear in a frame you save with **Export frame**. That is intended.

## Layers in the preview

### The arrow keys move a picture instead of the playhead

**Symptom:** You press <kbd>←</kbd> or <kbd>→</kbd> to step a frame, but the playhead stays and a picture in the preview moves. Or <kbd>↑</kbd> and <kbd>↓</kbd> move a picture instead of jumping between cuts.

**Cause:** The Preview panel is active (you clicked in it last), and a selected clip is under the playhead. There the arrow keys move the selected layers by 1 pixel, or 10 pixels with <kbd>Shift</kbd>.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the nudges (a quick series is one step). Then click the timeline before you use the arrow keys, or click the area around the frame to clear the selection. See [Nudge layers with the arrow keys](arranging-layers-in-the-preview.md#nudge-layers-with-the-arrow-keys).

### A picture in the preview can't be selected

**Symptom:** You click a picture in the preview, and it gets no gold box, or the click selects the picture below it.

**Cause:** One of these:
- Its track is hidden (the eye is crossed out) or locked (gold padlock). Layers of those tracks can't be picked in the preview.
- The clip is turned off (**Disable**): on the timeline it is faded and covered with diagonal lines, and the preview doesn't draw it.
- The **Hand** tool is active, or you hold <kbd>Space</kbd> over a zoomed-in picture: a drag pans instead.
- The playhead isn't over the clip, so what you see is another clip.
- You clicked a part of the picture that is cropped away. A cropped picture is only the part left after the crop.
- You clicked an empty part of a text's box. A text is only its letters and its background box; see [A click on a text selects the picture behind it](#a-click-on-a-text-selects-the-picture-behind-it).

**Fix:** Unlock or show the track, or press <kbd>V</kbd> for the **Select** tool. To reach a picture under another one, <kbd>Alt</kbd>+click it. You can also click the clip on the timeline: while it is under the playhead, its box appears in the preview. See [Select layers in the preview](arranging-layers-in-the-preview.md#select-layers-in-the-preview).

### A click in the preview selects the wrong picture

**Symptom:** A click selects a picture you didn't mean, or a gold box appears where nothing is visible.

**Cause:** One of these:
- A click always takes the topmost picture under the pointer, also where that picture is transparent, for example around a PNG logo: the picture counts as its whole rectangle.
- The picture is on a muted video track (**M** is gold). It is not drawn, but you can still select and move it.

**Fix:** <kbd>Alt</kbd>+click to go down to the next picture under the pointer; each further <kbd>Alt</kbd>+click goes one deeper. To keep a muted track's pictures from being picked, hide the track with the eye or lock it. See [Select a layer under another one](arranging-layers-in-the-preview.md#select-a-layer-under-another-one).

### A drag moves a picture other than the one under the pointer

**Symptom:** You press on a picture and drag, and another picture moves, or several move together.

**Cause:** You pressed inside the gold box of the current selection. A drag there moves the selected pictures, also where another picture lies on top. With several selected, they all move.

**Fix:** Press <kbd>Esc</kbd> before you release, or <kbd>Ctrl</kbd>+<kbd>Z</kbd> after. Click the picture you want first (a click without dragging selects the top picture at that spot), then drag it. See [Move a layer](arranging-layers-in-the-preview.md#move-a-layer).

### A picture jumps while you drag it in the preview

**Symptom:** While you move a picture in the preview, it jumps a few pixels onto the center or an edge of the frame, or into line with another picture, and a thin gold line appears. You can't place it just next to that spot. Or, while you drag a handle, the edge stops at the frame edge or at another picture's edge. Or, in crop mode, a side you crop stops at the edge, the middle or a third of the frame.

**Cause:** Snapping. When an edge or the center of the picture comes within 6 pixels on screen of the frame, an overlay that is shown (thirds, a safe area, title / action safe) or another picture, it jumps onto it, and holds there until the pointer moves more than 6 pixels past it. A side you crop snaps the same way to the frame's edges, center lines and thirds.

**Fix:** Hold <kbd>S</kbd> during the drag to place the picture freely. Zoom the preview in, so that 6 pixels cover less of the frame, or nudge the picture with the arrow keys: nudges never snap. To stop snapping to other pictures but keep the frame, turn **Smart guides** off; to stop all snapping, click **Snap** or press <kbd>S</kbd>. See [Place a layer without snapping](snapping-and-smart-guides.md#place-a-layer-without-snapping).

### Pictures in the preview don't snap

**Symptom:** A picture you drag in the preview doesn't snap, or doesn't snap to a particular target, and no gold guides appear.

**Cause:** One of these:
- **Snap** is off: the magnet in the Preview panel header and in the timeline toolbar is not gold. <kbd>S</kbd> turns it on or off in every panel, and an <kbd>S</kbd> pressed just before a drag counts too.
- **Smart guides** is off: pictures then snap only to the frame and the overlays shown, not to each other, and equal spacing doesn't apply.
- The target picture is on a hidden or muted video track. Only pictures that are drawn are targets.
- The thirds snap only while **Grid** is **Thirds**, and a safe area only while its safe zone or **Title / action safe** shows. The **Squares** and **Custom** grids are not targets.
- You rotate the picture or drag its anchor point. Rotation snaps only to 45° steps with <kbd>Shift</kbd>, and the anchor point never snaps.
- You resize a rotated picture. Edges snap only while the box is upright (not rotated, or rotated by a multiple of 90°).
- You crop in crop mode. Crop sides snap only to the frame (its edges, center lines and thirds), and only while the picture is upright. See [Snap crop edges to the frame](cropping-and-reframing.md#snap-crop-edges-to-the-frame).
- For equal spacing: the picture is not between two others in line with it, another picture sits between them, or it doesn't fit in the space.

**Fix:** Turn on **Snap** and **Smart guides** so both are gold, show the overlay you want to snap to, and check the track of the target picture. See [Choose what layers snap to](snapping-and-smart-guides.md#choose-what-layers-snap-to) and [Space layers evenly](snapping-and-smart-guides.md#space-layers-evenly).

### Gold lines and numbers appear when you hold Alt

**Symptom:** With a picture selected, you hold <kbd>Alt</kbd> over the preview, and gold lines with numbers appear around the picture, or a ring marker appears on it.

**Cause:** With **Smart guides** on, holding <kbd>Alt</kbd> over the preview measures the distance from the selected pictures to the nearest picture on each side, or to the frame edge. With one picture selected, <kbd>Alt</kbd> also shows its anchor marker.

**Fix:** Nothing to fix: the lines disappear when you release <kbd>Alt</kbd>, and they are never part of your video. To stop the measurements, turn **Smart guides** off. See [Measure distances with Alt](snapping-and-smart-guides.md#measure-distances-with-alt).

### A resize stops at 100%

**Symptom:** While you drag a handle, the picture holds its size for a moment, the readout shows **100%**, and the sides of the box at the handle turn into a thicker gold line.

**Cause:** While snapping is on, the scale snaps to exactly 100% (the media's own size) when it passes within 2% of it.

**Fix:** Keep dragging: the picture follows again below 98% and above 102%. To pass 100% without stopping, hold <kbd>S</kbd> during the drag. See [Resize a layer](arranging-layers-in-the-preview.md#resize-a-layer).

### The side handles are missing

**Symptom:** A selected picture shows handles only at its corners, not in the middle of its sides.

**Cause:** The picture is small on screen. Side handles show only on sides at least 28 pixels long on screen.

**Fix:** Zoom the preview in, for example with <kbd>Ctrl</kbd>+wheel over the picture. The side handles come back. See [Zoom with the mouse wheel](preview-zoom-overlays-fullscreen.md#zoom-with-the-mouse-wheel).

### Bring forward or Send backward created a new track

**Symptom:** After **Bring forward** or **Send backward** in the preview's layer menu, a new video track such as **V4** appears, and the clip is on it.

**Cause:** The neighboring video track couldn't take the clip: it is locked, hidden or muted, it has another clip during part of the clip's time, or there is no track in that direction. The editor then creates a track past it, so the picture still gets above or below that track.

**Fix:** Nothing to fix. To use an existing track instead, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and drag the clip to that track on the timeline. See [Change which layer is on top](arranging-layers-in-the-preview.md#change-which-layer-is-on-top).

### White brackets replace the handles of a picture

**Symptom:** A picture in the preview shows white brackets at its corners and white bars on its sides instead of square handles, with a dashed outline around it and a **Crop** chip at the top of the preview. Dragging a handle cuts the picture instead of resizing it, and the picture can't be rotated.

**Cause:** Crop mode is on. A double-click on a video or image in the preview, or the crop button in the header of the **Crop** section, turns it on.

**Fix:** Click **Done** in the chip, press <kbd>Esc</kbd> (twice during a drag), or double-click the picture again. If you cropped by mistake, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, or click **Reset crop** in the chip. See [Crop with handles in the preview](cropping-and-reframing.md#crop-with-handles-in-the-preview).

## Edit Properties

### A field shows --

**Symptom:** A field of **Edit Properties** shows `--` instead of a value, or a switch sits halfway.

**Cause:** Several clips or tracks are selected, and their values differ. The panel header shows how many are selected, for example **3 clips**.

**Fix:** Nothing is wrong. Type a value to give it to all of them, or drag the label to change each one by the same amount. Click a halfway switch to turn it on for all. To see one clip's values, click only that clip. See [Edit several clips at once](editing-properties.md#edit-several-clips-at-once).

### A typed clip time stops short or changes nothing

**Symptom:** You type a time into **Start**, **End**, **Duration**, **Source in** or **Source out**, and the clip ends up elsewhere than you typed, or doesn't change.

**Cause:** One of these:
- A limit stopped the trim: the first or last frame of the media, the next or previous clip on the track, the start of the timeline, or the 1-frame minimum. A message such as **Trim stopped at the media end** or **Trim stopped at the next clip** says which.
- With **Linked selection** on, the linked clip reached a limit first, and both stopped.
- The editor couldn't read the text as a time, so the field went back to the clip's time.
- The clip is on a locked track.

**Fix:** To make the clip longer than its neighbor allows, move or trim the neighbor first, or use a ripple trim on the timeline. Type times as `mm:ss:ff` (for example `0:03:10`), as a frame number, or as `+30`, `-15` or `+2.`. See [Type a clip time](editing-properties.md#type-a-clip-time) and [Know where a trim stops](trimming.md#know-where-a-trim-stops).

### Quick actions are dimmed

**Symptom:** Buttons at the top of **Edit Properties** are dimmed, and clicking them does nothing.

**Cause:** One of these:
- No selected clip can take it: **Fit in frame**, **Fill frame**, **Center in frame**, the flips, **Reset transform** and **Punch zoom** need a video, image or text clip, and an audio clip has no picture. **Freeze frame** needs a video clip. The speed buttons need a video or audio clip that is not a freeze frame. **Fade in 0.5 s** and **Fade out 0.5 s** need a clip that is not a caption cue. **Mute** needs an audio clip, or a video whose sound is a linked audio clip. **Remove silence** needs the same, with the video and its sound on unlocked tracks. The transition buttons are never dimmed.
- The clips are on a locked track.

**Fix:** Select a video, image or text clip, or unlock its track. See [Use the quick actions](editing-properties.md#use-the-quick-actions).

### There is no Transform section

**Symptom:** **Edit Properties** shows the **Clip** section, but no **Transform**, **Crop** or **Opacity** section.

**Cause:** Only audio clips are selected: they have no picture to place. <kbd>Alt</kbd>+click on the sound of a video, or a click on it with **Linked selection** off, selects the sound alone.

**Fix:** Click the video clip, or its picture in the preview. If a section shows only its header, it is folded: click the header to open it. See [Find your way around the panel](editing-properties.md#find-your-way-around-the-panel).

### Pictures got smaller after a resolution change

**Symptom:** After you chose another **Resolution** in the **Project** section, the pictures are smaller (or larger), and bands of the background show around them.

**Cause:** You chose **Scale layout** in the **Change the frame size** dialog: each picture grows or shrinks by the smaller of the two size changes, so a picture that fit inside the old frame still fits inside the new one. With **Keep**, pictures keep their size in pixels instead, so they can be cut off by the new frame or leave bands.

**Fix:** Select the clips and click **Fill frame** to cover the new frame, or **Fit in frame** to fit it. To go back to the old resolution, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then choose the resolution again and pick the other button. See [Change the frame size](project-settings-and-templates.md#change-the-frame-size).

### The background went back to its old color

**Symptom:** While you dragged in the color picker, the preview showed the new background, but then the old color came back and the picker closed.

**Cause:** <kbd>Esc</kbd> was pressed before you released the mouse button. That cancels the drag.

**Fix:** Open the picker again with the **Background** swatch and release the mouse button where you want the color. Each released drag is one step in the history. See [Pick a color](editing-properties.md#pick-a-color).

### Crop to frame does nothing or keeps less than expected

**Symptom:** You click **Crop to frame**, and the picture doesn't change, or only a slice of it stays.

**Cause:** One of these:
- The picture lies entirely outside the frame: there is nothing to keep, so the crop stays as it is.
- The crop already matches the frame.
- The clip is on a locked track.
- The picture doesn't cover the whole frame, for example a landscape video fitted with bands. **Crop to frame** then keeps the largest area with the frame's shape from the middle of what the picture covers: a vertical slice of a landscape video. That is intended.
- The picture is turned: the area it keeps has the frame's shape, turns with the picture and stays inside both the frame and the picture.

**Fix:** For a fitted landscape video, click **Fill frame** after **Crop to frame**: the slice then fills the frame exactly. To keep another part, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click **Fill frame**, drag the picture sideways until the part you want is in the frame, then click **Crop to frame**. See [Reframe a landscape video for a vertical frame](cropping-and-reframing.md#reframe-a-landscape-video-for-a-vertical-frame).

### Changing one crop side changes the others

**Symptom:** You type a value in **T** (or drag a crop bar), and **L** and **R** change too, or a side stops before the value you typed.

**Cause:** The **Aspect** lock of the **Crop** section is on (its chain button is lit), so the visible part keeps its shape: the other sides follow, and a side stops where the others reach the edge of the picture. In crop mode, <kbd>Shift</kbd> also does the opposite of the lock while you drag.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the chain button in the **Aspect** row to unlock it, and set the side again. See [Keep the shape of the crop](cropping-and-reframing.md#keep-the-shape-of-the-crop).

### The crop button in the Crop section is dimmed

**Symptom:** The crop button in the header of the **Crop** section is dimmed, and its tooltip reads **Crop on the canvas: select one layer**.

**Cause:** Crop mode works on one picture at a time, and several video or image clips are selected.

**Fix:** Click only the picture you want to crop, or double-click it in the preview: that selects it alone and turns on crop mode. The fields of the **Crop** section still work for several pictures at once. See [Crop with handles in the preview](cropping-and-reframing.md#crop-with-handles-in-the-preview).

### A picture is still cropped after Reset transform

**Symptom:** After **Reset transform**, part of the picture is still cut away, or the visible part sits off center.

**Cause:** **Reset transform** resets the position, size, angle, flips and anchor point, not the crop. It places the picture as if it were not cropped, so an uneven crop leaves the visible part off center.

**Fix:** Click **Reset** in the **Crop** section to remove the crop, or click **Fit in frame** or **Center in frame** to fit or center the part that is left. See [Remove a crop](cropping-and-reframing.md#remove-a-crop).

## Copy, paste and duplicate

### Ctrl+C or Ctrl+V does nothing

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd>, and no clips were pasted.

**Cause:** One of these:
- The Timeline or the Preview panel is not active: the keys copy and paste clips only there. In the Media panel, <kbd>Ctrl</kbd>+<kbd>V</kbd> imports images from the clipboard; in **Edit Properties**, the keys do nothing.
- A text field has the keyboard, or you are editing a text in the preview: the keys copy and paste text.
- No clip was selected when you pressed <kbd>Ctrl</kbd>+<kbd>C</kbd>, so nothing was copied.
- Keyframes were the last thing you copied: <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes them onto the selected clips, or shows **Select a clip to paste keyframes on**.

**Fix:** Click the clip on the timeline and press <kbd>Ctrl</kbd>+<kbd>C</kbd>. Click in the ruler where the copy should go and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. See [Paste clips at the playhead](copy-and-paste.md#paste-clips-at-the-playhead).

### Pasted clips landed on the wrong tracks

**Symptom:** A pasted clip is on V1 although you copied it from V3, or clips copied from V1 and V2 landed on V2 and V3.

**Cause:** Pasted clips go to the targeted tracks: the lowest track you copied from lands on the targeted track with the lowest number, and the others follow above it. With every track targeted, the clips start on V1 and A1.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Click the crosshairs in the headers of the tracks below the one the clips should start on, so they dim, and paste again. See [Choose the tracks pasted clips go to](copy-and-paste.md#choose-the-tracks-pasted-clips-go-to).

### A paste covered clips you wanted to keep

**Symptom:** After <kbd>Ctrl</kbd>+<kbd>V</kbd>, clips that were at the playhead are shorter, split or gone.

**Cause:** **Paste** overwrites: the pasted clips cover what lies under them.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, then <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>: **Paste insert** makes room at the playhead. Or move the playhead to an empty spot first. See [Paste and make room (Paste insert)](copy-and-paste.md#paste-and-make-room-paste-insert).

### Ctrl+V pasted other clips than the ones you copied

**Symptom:** <kbd>Ctrl</kbd>+<kbd>V</kbd> pasted clips you copied earlier, or clips you copied in another tab.

**Cause:** <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes the clips on your computer's clipboard: the latest copy from any Shorts Editor tab. When the clipboard holds something else, such as text you copied in another app since, it pastes the clips you copied last in this tab. The **Paste** rows of the menus always paste this tab's last copy.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, copy the clips again and paste them right away. See [Paste clips into another project](copy-and-paste.md#paste-clips-into-another-project).

### Pasted clips show no picture or sound

**Symptom:** After you pasted clips from another project, the message **Pasted with offline media** appeared. Some of the pasted clips are gray with an **Offline** badge, show a gray slate in the preview and play no sound, and their media card shows **Offline**.

**Cause:** The project you pasted into has no media item of the same type with the same name (or file name) that is long enough for those clips. The editor added the copied media item without a file.

**Fix:** Click **Relink…** on the offline card and pick the file, or use **Relink folder…** to find it by its file name. See [Offline media and relinking](offline-media-and-relinking.md). Or press <kbd>Ctrl</kbd>+<kbd>Z</kbd> (the clips and the offline item go), import the media file into this project and paste again: the clips find it by name. If the file has another name in this project, rename its media item to the name in the message first. See [Paste clips into another project](copy-and-paste.md#paste-clips-into-another-project).

### A paste is refused

**Symptom:** Nothing is pasted, and a message appears.

**Cause and fix:**

| Message | Cause | Fix |
| --- | --- | --- |
| **Can't paste onto a locked track** | A pasted clip would land on the locked track the message names. | Click the padlock in that track's header, or target other tracks. |
| **No room for the captions** | Pasted cues would overlap the cues near the playhead. | Move the playhead to where the **CC** track has room, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>. |
| **Can't paste these clips**, **Can't paste these keyframes**, **Can't paste these attributes** | The clipboard holds text that looks like copied clips or keyframes but is damaged, for example edited by hand. | Copy the clips again in the editor. |

See [Messages when you paste](copy-and-paste.md#messages-when-you-paste).

### Paste attributes doesn't offer a group

**Symptom:** The **Paste attributes** checklist doesn't list the group you want, the message **Nothing to paste onto** or **Copy a clip first** appears, or **Paste attributes...** is dimmed in the clip menu.

**Cause:** The checklist lists a group only when one of the copied clips has it and one of the selected clips can take it, on an unlocked track. For example, **Text style** needs a copied text and selected texts, and **Crop** video or image clips on both sides. **Audio gain** needs a copied audio clip: a video copied with **Linked selection** off has no sound clip with it. **Copy a clip first** means the last copy was keyframes, or nothing. The menu row is dimmed until you copy clips in this tab.

**Fix:** Copy the clip again (a video with its sound, for **Audio gain**), select the clips to change, and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes).

### Clips moved or lost their keyframes after Paste attributes

**Symptom:** After **Paste attributes**, the clips jumped to the copied clip's place in the frame, or their motion, fade or volume keyframes are gone.

**Cause:** **Transform** pastes the copied clip's position, size and angle. **Transform**, **Opacity** and **Audio gain** also replace the clips' keyframes in their section: with **Keyframes** checked, by the copied clip's keyframes, or by none when it has none; with **Keyframes** unchecked, by none.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> again, and uncheck the groups whose values the clips should keep, such as **Transform** to keep each clip's place. See [Give clips the look of another clip (Paste attributes)](copy-and-paste.md#give-clips-the-look-of-another-clip-paste-attributes).

### Ctrl+D copied a video without its sound

**Symptom:** After <kbd>Ctrl</kbd>+<kbd>D</kbd> or **Duplicate**, the copy of a video has no sound clip under it.

**Cause:** In the Preview panel, <kbd>Ctrl</kbd>+<kbd>D</kbd> and **Duplicate** in the layer menu copy only the picture, on the track above, so the sound is not doubled. On the timeline, the sound is copied with the video only while **Linked selection** is on.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Turn **Linked selection** on (<kbd>Shift</kbd>+<kbd>S</kbd>) if it is off, click the video on the timeline and press <kbd>Ctrl</kbd>+<kbd>D</kbd>. See [Duplicate clips on the timeline](copy-and-paste.md#duplicate-clips-on-the-timeline).

### Duplicate in the preview added a track

**Symptom:** After <kbd>Ctrl</kbd>+<kbd>D</kbd> in the Preview panel, or **Duplicate** in the layer menu, a new video track appears.

**Cause:** The copy goes on the video track right above its original, so it is drawn on top. When that track is locked, muted or hidden, or has a clip at that time, a new track is added right above the original's track.

**Fix:** Nothing to fix: <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes the copy and the track. To put the copy on the same track instead, right after the original, press <kbd>Ctrl</kbd>+<kbd>D</kbd> in the Timeline panel. See [Duplicate a picture in the preview](copy-and-paste.md#duplicate-a-picture-in-the-preview).

## Speed, freeze frames and punch zoom

### A speed change moved other clips or left a gap

**Symptom:** After you changed a clip's speed or its **Duration** in the **Speed** section, the clips after it moved, on several tracks. Or a gap opened after a faster clip, or a slower clip ended early with the message **Shortened at the next clip**.

**Cause:** The **Ripple** switch of the **Speed** section decides. On (the default), every clip after the clip's end, on every unlocked track, moves by the change of length. Off, nothing else moves: a faster clip leaves a gap, and a slower clip stops at the next clip, so it plays less of its media. The speed buttons in the quick actions follow the same switch.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, set **Ripple** the way you want and change the speed again. See [Move later clips with the change (Ripple)](speed-freeze-frames-and-punch-zoom.md#move-later-clips-with-the-change-ripple).

### A ripple after a speed change stopped short

**Symptom:** You made a clip faster with **Ripple** on, a gap stays after it, and the message **Ripple stopped by** followed by a track name appears.

**Cause:** Moving the later clips further to the left would make clips on that track overlap, for example a sound that starts before the clip ends. The clips moved as far as they could.

**Fix:** Close the gap with <kbd>G</kbd> or the gap menu, or first move the clip that blocks. See [Close a gap](splitting-and-deleting.md#close-a-gap).

### A clip kept its length when its speed changed

**Symptom:** You set a new speed, the clip kept its length, and it now shows a different part of its media. Or the message **Limited by the media end** appears and the clip got shorter.

**Cause:** The chain button next to **Speed** is off (not gold). The clip then keeps its length and plays more or less of its media, and a faster clip that runs out of media ends at the media's last frame.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the chain button so it is gold, and set the speed again. See [Keep the length or the media part](speed-freeze-frames-and-punch-zoom.md#keep-the-length-or-the-media-part).

### A clip keeps its speed with Limited by the media end

**Symptom:** You set a new speed, the clip doesn't change, and the message **Limited by the media end** appears. Its linked sound may have changed.

**Cause:** The clip starts on the last frames of its media, so not even one frame fits at the new speed. The clip keeps its speed; its linked clips still change.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> if the sound changed. Trim the clip to start earlier in its media, or choose a slower speed. See [Know where a speed change stops](speed-freeze-frames-and-punch-zoom.md#know-where-a-speed-change-stops).

### A video and its sound got different speeds or show a red number

**Symptom:** After a speed change, the video and its sound have different speeds or lengths, or they show red sync numbers.

**Cause:** One of these:
- **Linked selection** was off, or you selected only one of them with <kbd>Alt</kbd>+click, so only that clip changed.
- The video and its sound started at different times. Each keeps its start, so after the change they are out of step.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the video with **Linked selection** on and set the speed again. For red numbers, right-click the clip and choose **Move into sync**. See [Change the speed of a video and its sound](speed-freeze-frames-and-punch-zoom.md#change-the-speed-of-a-video-and-its-sound).

### Freeze frame or punch zoom does nothing

**Symptom:** You press <kbd>Shift</kbd>+<kbd>F</kbd> or <kbd>Shift</kbd>+<kbd>Z</kbd>, or click **Freeze frame** or **Punch zoom**, and nothing changes. A message may appear.

**Cause:** One of these:
- **No video under the playhead** or **No picture under the playhead**: no video (for a freeze frame), or no video or image (for a punch zoom), is under the playhead on a targeted, unlocked and visible track.
- **The playhead is not over the selected clip**: the selected clips are elsewhere. The editor acts on the selected clips first and doesn't pick another clip instead.
- A text field has the keyboard focus.

**Fix:** Move the playhead into the clip, select the clip, or clear the selection with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> so the top picture is used. Check that its track is targeted and unlocked. See [Know which clip a freeze or punch zoom uses](speed-freeze-frames-and-punch-zoom.md#know-which-clip-a-freeze-or-punch-zoom-uses).

### A freeze frame moved clips on every track

**Symptom:** After a freeze frame, clips on other tracks moved 2 seconds later, while a music clip or a title across the playhead stayed where it was and plays on under the hold.

**Cause:** That is how a freeze frame works: every clip from the playhead on, on every unlocked track, moves 2 seconds later, so the edit stays in step. Clips that run across the playhead on other tracks are not cut, so they stay. The **Ripple** switch doesn't change this.

**Fix:** To keep a track in place, lock it before you freeze. To make a title cover the hold, drag it afterwards. See [Hold a frame (freeze frame)](speed-freeze-frames-and-punch-zoom.md#hold-a-frame-freeze-frame).

### The Speed field is dimmed at 0.0

**Symptom:** The **Speed** field is dimmed and reads **0.0**, with the hint **Freeze frame: one picture held**, and the speed buttons are dimmed.

**Cause:** The selected clip is a freeze frame. It holds one frame, so it has no speed.

**Fix:** Nothing is wrong. Change its length with **Duration** or by dragging its edges. See [Change a freeze frame](speed-freeze-frames-and-punch-zoom.md#change-a-freeze-frame).

## Keyframes

### A picture slides between two places after you moved it

**Symptom:** You drag a picture or type a new position, and when you play, it glides from its old place to the new one instead of moving everywhere. Or the change shows only around the playhead.

**Cause:** The picture's **Transform** stopwatch is on (gold). While it is on, every change writes a keyframe at the playhead, and the picture moves between its keyframes. A **Punch zoom** turns it on for the part after the cut.

**Fix:** To move the whole motion, make the same change at each keyframe: use **Previous keyframe** and **Next keyframe** in the **Transform** header to get there. To give up the animation, click the gold stopwatch: the keyframes go, and the picture keeps its look at the playhead. See [Change an animated picture](keyframes.md#change-an-animated-picture).

### The keyframe lane doesn't show on a clip

**Symptom:** A clip has keyframes, but no lane with diamonds appears along its bottom on the timeline.

**Cause:** One of these:
- **Show clip keyframes** in the timeline toolbar is off.
- The clip is not selected, and its track is not L. Lanes show on selected clips, and on every clip of an L track.
- The track is S: its clips are only a label bar. Audio tracks and the **CC** caption track have no lanes.
- The lane shows the other section: the clip menu's **Show keyframes for** is set to **Opacity** while the keyframes are in **Transform**, or the other way around.
- The keyframes lie outside the clip after a trim.

**Fix:** Turn on **Show clip keyframes**, select the clip, make its track M or L, and check **Show keyframes for** in the clip menu. Lengthen the clip to see keyframes beyond its ends. See [Show keyframes on the timeline](keyframes.md#show-keyframes-on-the-timeline).

### The stopwatch is on but the count shows 0

**Symptom:** The **Transform** or **Opacity** stopwatch is gold, but the count next to it reads **0**, the lane shows no diamonds, and **Previous keyframe** and **Next keyframe** do nothing.

**Cause:** The clip still has keyframes, but they lie outside its ends: a trim or a split left them there. They are kept so a longer clip shows them again, and they still shape the motion inside the clip.

**Fix:** Lengthen the clip to bring them back, or click the gold stopwatch to remove them; the picture keeps its look at the playhead. See [Know what happens to keyframes when you edit clips](keyframes.md#know-what-happens-to-keyframes-when-you-edit-clips).

### Delete removed keyframes instead of the clip

**Symptom:** You press <kbd>Delete</kbd> to delete a clip, and only some diamonds disappear from its lane. The **Undo** tooltip reads **Undo Delete keyframes**.

**Cause:** Keyframes were selected (gold diamonds). While keyframes are selected, <kbd>Delete</kbd>, <kbd>Shift</kbd>+<kbd>Delete</kbd> and the **Delete** buttons delete only them.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, click the clip's body (not a diamond) to deselect the keyframes, and press <kbd>Delete</kbd> again.

### A keyframe stops before where you drag it

**Symptom:** While you drag a diamond along the lane, it stops at a place and goes no further.

**Cause:** Keyframes stay inside their clip: the drag stops when a dragged keyframe reaches the clip's first or last frame. With several keyframes selected, the first or the last of them stops the drag.

**Fix:** Lengthen the clip first, or select fewer keyframes. See [Select, move and delete keyframes on the timeline](keyframes.md#select-move-and-delete-keyframes-on-the-timeline).

### The Ease row shows -- or its choices are dimmed

**Symptom:** The **Ease** row of **Transform** or **Opacity** reads `--`, and the easings in its list are dimmed, or a new easing changes nothing you can see.

**Cause:** One of these:
- The playhead is not on a keyframe. **Ease** sets the easing of the keyframe at the playhead.
- Several clips are selected and their keyframes at the playhead have different easings. The choices still work and set them all.
- The keyframe is the last one: its easing only matters once a keyframe follows it.

**Fix:** Move the playhead onto the keyframe with **Previous keyframe** or **Next keyframe**, or click its diamond on the timeline. See [Choose the easing](keyframes.md#choose-the-easing).

### Paste keyframes is dimmed or Ctrl+V doesn't paste keyframes

**Symptom:** In the keyframe menu, **Paste keyframes** is dimmed, or <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes clips, or nothing, instead of the keyframes.

**Cause:** One of these:
- **Paste keyframes** in the menu works after you copy keyframes, and only on a lane of the same section: keyframes copied from a **Transform** lane paste on **Transform** lanes, those from an **Opacity** lane on **Opacity** lanes, and volume keyframes on rubber bands.
- <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes keyframes only while keyframes are the last thing you copied. After you copy clips, it pastes the clips.
- No selected clip can take the keyframes, for example opacity keyframes with only an audio clip selected: the message **Select a clip to paste keyframes on** appears.

**Fix:** Select the keyframes again and press <kbd>Ctrl</kbd>+<kbd>C</kbd>. Select the clips to paste onto, move the playhead to where the first keyframe should go, and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. In the menu, switch the target clip's lane with **Show keyframes for** in the clip menu if needed, and right-click one of its diamonds; a clip without keyframes has no diamond, so turn its stopwatch on first. See [Copy and paste keyframes](copy-and-paste.md#copy-and-paste-keyframes).

### Punch zoom no longer jumps at the cut

**Symptom:** After <kbd>Shift</kbd>+<kbd>Z</kbd>, the shot zooms in over a few frames instead of jumping closer right at the cut, and the **Transform** stopwatch of the part after the cut is gold.

**Cause:** Punch zoom now zooms in over 6 frames with **Ease out**, using two keyframes. A setting to switch back to the jump is not available yet.

**Fix:** To jump at once, select the part after the cut, show its keyframes and delete the first keyframe (on its first frame): the part then shows 120% from the cut on. See [Punch in at a cut (punch zoom)](speed-freeze-frames-and-punch-zoom.md#punch-in-at-a-cut-punch-zoom).

### A change to the anchor, crop or size applies to every frame

**Symptom:** With the stopwatch on, you change **Anchor**, a flip, the crop, a shape's **W** or **H**, or a text's size or style, and the whole clip changes, not only the frame at the playhead.

**Cause:** Keyframes animate only **Position**, **Scale**, **Rotation** and **Opacity**. The other settings are not animated.

**Fix:** Animate **Scale** or **Position** instead, for example to make a picture grow or slide in. See [How keyframes work](keyframes.md#how-keyframes-work).

## Fades and transitions

### The fade handles don't appear

**Symptom:** You point at a clip on the timeline, but no small squares appear in its top corners, or dragging there moves or trims the clip instead.

**Cause:** One of these:
- The clip is narrower than 24 pixels on screen.
- The clip is on a locked track.
- The clip is a caption cue: cues have no fades.
- A tool other than **Select** is active: the other tools use the press for themselves.

**Fix:** Zoom in on the clip, unlock its track, and press <kbd>V</kbd> for the **Select** tool. To fade without the handles, select the clip and click **Fade in 0.5 s** or **Fade out 0.5 s** in the quick actions, or right-click it and pick a length in the **Fade in** or **Fade out** row. See [Fade a clip with the fade handles](fades-and-transitions.md#fade-a-clip-with-the-fade-handles).

### Fade in 0.5 s removed a fade

**Symptom:** You clicked **Fade in 0.5 s** or **Fade out 0.5 s**, and the fade disappeared instead of being added.

**Cause:** The button is a switch. When every selected clip, and its linked clips, already has a half-second fade, the button is lit, and a click removes those fades (the step is named **Remove fade in** or **Remove fade out**).

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring the fade back. To change a fade's length, drag its handle on the timeline, or pick **0.25 s** or **1 s** in the clip menu. See [Fade a clip and its sound with one click](fades-and-transitions.md#fade-a-clip-and-its-sound-with-one-click).

### No cut to add a transition to

**Symptom:** You pressed <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> or clicked a transition button, and the message **No cut to add a transition to** appeared. Nothing changed.

**Cause:** One of these:
- The two clips don't touch: even a one-frame gap between them means there is no cut.
- The clips can't take a transition: text clips, solids and caption cues have none.
- The cut is on a locked track, or, for <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> with no cut selected, no targeted track has a cut.
- You selected a clip that touches no other clip, and clicked a transition button.
- The cut already has a transition of that kind, so there is nothing to add.

**Fix:** Close the gap (click it and press <kbd>G</kbd>), unlock or target the track, or select the cut itself by clicking right on it. To change an existing transition, double-click its block and use the **Transition** section. See [Add a transition](fades-and-transitions.md#add-a-transition).

### The transition went on another cut

**Symptom:** The new transition landed on a cut you didn't mean.

**Cause:** Without a selected cut, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> uses the cut nearest the playhead on any targeted track, and the transition buttons use the start or end of the selected clip that is nearer the playhead.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Click right on the cut you want (red brackets mark it), then add the transition; or drag a transition button from the quick actions onto the cut. See [Drag a transition onto a cut](fades-and-transitions.md#drag-a-transition-onto-a-cut).

### The transition block is striped red

**Symptom:** Part of a transition block has red diagonal stripes. When you added it, the message **Not enough media for the transition** appeared, or the **Transition** section reads **Not enough media** with a number of frames.

**Cause:** The clips have no unused media at the cut for those frames, so the editor repeats their edge frames there: the first clip holds its last frame, the second its first frame. This happens when the clips show their media right up to the cut, or when you typed a **Duration** or chose an **Alignment** that needs more media than there is.

**Fix:** Shorten the transition (drag its ends inward, or type a smaller **Duration**), or give the clips unused media at the cut: <kbd>Ctrl</kbd>+drag the second clip's start a little to the right, or the first clip's end a little to the left, below the block. The stripes shrink as soon as there is media for those frames. See [Know how much media a transition needs](fades-and-transitions.md#know-how-much-media-a-transition-needs).

### A transition end stops before where you drag it

**Symptom:** You drag an end of a transition block, and it stops. A red bar shows, and **Media start** or **Media end** appears in red in the tooltip.

**Cause:** A transition drag stops where the clip's unused media runs out, so that no edge frame repeats. Each side also stops at the far end of its clip.

**Fix:** Type a longer **Duration** in the **Transition** section (the extra frames repeat edge frames, striped red), or trim the clips to give them more unused media at the cut. See [Change the length of a transition on the timeline](fades-and-transitions.md#change-the-length-of-a-transition-on-the-timeline).

### A transition got shorter or disappeared

**Symptom:** After an edit, a transition is shorter than before, or gone, and its clips no longer show `fx`.

**Cause:** Edits keep transitions within the media there is. A trim, roll, slip, slide, rate stretch or speed change that uses up the media a transition plays shortens it, and removes it when none is left. A split inside the transition's frames removes it, and so does moving or deleting one of its clips so that the two no longer touch.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the edit and the transition come back together. Then make the edit in a way that leaves media at the cut, or add the transition again afterwards. See [Know what edits do to fades and transitions](fades-and-transitions.md#know-what-edits-do-to-fades-and-transitions).

### The sound doesn't crossfade under a transition

**Symptom:** The pictures dissolve, but the sound still cuts hard, and the audio track shows no block.

**Cause:** One of these:
- **Linked selection** was off when you added the transition.
- The sound is not linked to the video, or its cut is not at the same frame as the video's cut.

**Fix:** Click right on the audio cut to select it, and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to add a crossfade there. Or turn **Linked selection** on, select the video cut and click the same transition button again: the picture's transition stays as it is, and the sound gets a new crossfade of up to 15 frames. See [Crossfade the sound](fades-and-transitions.md#crossfade-the-sound).

### The sound dips at a crossfade

**Not a problem:** Sound can't repeat a frame. Where the clips have no unused audio at the cut, the first sound fades out before the end of its file and the second fades in from the start of its file, so the loudness dips briefly instead of clicking. Give the clips unused media at the cut to make the crossfade even. See [Crossfade the sound](fades-and-transitions.md#crossfade-the-sound).

## Audio editing

### There is no white line on an audio clip

**Symptom:** An audio clip shows no rubber band, so you can't drag its volume.

**Cause:** One of these:
- The audio track is at height S, where a clip is only its label bar.
- You are looking at a video clip: the line is on its sound, the linked audio clip on an audio track.
- The clip is turned all the way down: at -60 dB the line runs along the bottom of the body.

**Fix:** Click the height toggle in the audio track's header until the track is M or L. To find a very low line, type a value such as `0` in **Volume** in the **Audio** section. See [Read the rubber band](audio-editing.md#read-the-rubber-band).

### Dragging the line trims the clip or moves a fade

**Symptom:** You press on the white line and the clip's edge moves, a fade wedge grows, or the clip moves instead.

**Cause:** Near the ends of a clip, the trim zones, the fade handles in the top corners and transition blocks come before the line. Elsewhere, the line reacts only within 4 pixels of it: further away, a press grabs the clip's body. The line doesn't react with a tool other than **Select**, or on a locked track.

**Fix:** Zoom in and press on the line away from the clip's ends, where the cursor becomes an up-down arrow. Press <kbd>V</kbd> for the **Select** tool, or unlock the track. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo a trim you didn't want.

### Ctrl+click on an audio clip selects it instead of adding a keyframe

**Symptom:** <kbd>Ctrl</kbd>+click on an audio clip adds it to the selection, or removes it, and no diamond appears.

**Cause:** The pointer was not on the line. <kbd>Ctrl</kbd>+click adds a volume keyframe only within 4 pixels of the line; elsewhere on the clip it changes the selection.

**Fix:** Hold <kbd>Ctrl</kbd> and move the pointer onto the line until the cursor shows a plus sign, then click. See [Make the volume change over time](audio-editing.md#make-the-volume-change-over-time).

### Dragging the line moved two keyframes

**Not a problem:** On a clip with volume keyframes, a drag of the line between two diamonds moves both up or down, so that part of the clip gets louder or quieter as a whole. Before the first diamond or after the last one, the drag moves that diamond.

**Fix:** To change one keyframe, drag its diamond. To change only part of the line, <kbd>Ctrl</kbd>+click the line at the start and end of that part first. See [Edit volume keyframes on the rubber band](audio-editing.md#edit-volume-keyframes-on-the-rubber-band).

### A volume keyframe stops before where you drag it

**Symptom:** A diamond stops moving sideways, or doesn't move sideways at all.

**Cause:** A keyframe moves only between its neighbors and inside the clip: it stops one frame before the next keyframe and at the clip's first and last frames. While you hold <kbd>Shift</kbd>, or when you drag one of several selected diamonds, keyframes keep their frames and only their volume changes.

**Fix:** Release <kbd>Shift</kbd>, select only the diamond you want to move, or delete the neighbor in the way first.

### Typing a Volume changed only part of the clip

**Symptom:** You typed a new **Volume**, but only part of the clip got louder or quieter.

**Cause:** The clip has volume keyframes (the **Audio** stopwatch is gold). **Volume** then shows and sets the volume at the playhead: the value you type writes a keyframe there.

**Fix:** To change the whole clip, drag the line between the diamonds, or click **Normalize**, which moves all keyframes together. To go back to one volume for the whole clip, click the gold stopwatch: the keyframes go, and the clip keeps the volume it has at the playhead. See [Make the volume change over time](audio-editing.md#make-the-volume-change-over-time).

### The Volume field shows -- or changes when the playhead moves

**Not a problem:** `--` means the selected clips have different volumes; a value you type gives them all the same volume. A clip with volume keyframes shows its volume at the playhead, so the field follows the playhead.

### Normalize says The waveform is still loading or Nothing to normalize

**Symptom:** You click **Normalize** and a message appears instead of a new volume.

**Cause:**
- **The waveform is still loading**: **Normalize** reads the clip's waveform, and the editor hasn't made it yet, for example right after import. The editor now makes that waveform first.
- **Nothing to normalize**: the part of the sound the clip uses is silent.

**Fix:** Wait until the waveform appears in the clip, then click **Normalize** again. For a silent clip, check that the clip uses the part of the file you expect. See [Normalize a clip](audio-editing.md#normalize-a-clip).

### Normalize didn't bring the peak to -1 dBFS

**Symptom:** After **Normalize**, the meter peaks higher or lower than -1 dBFS.

**Cause:** One of these:
- Other clips play at the same time: their levels add up in the meter.
- The clip is very quiet: the volume stops at +12 dB, so its peak can stay below -1 dBFS.
- You changed the volume afterwards, for example with the rubber band, or the clip's trim now includes a louder part.

**Fix:** Solo the clip's track with **S** to check the clip alone. Click **Normalize** again after you trim the clip.

### Auto-duck says No voice to duck under

**Symptom:** You click **Auto-duck** or **Auto-duck music**, the message **No voice to duck under** appears, and nothing changes.

**Cause:** No audio clip plays during the selected clip on the audio tracks above its track. For example:
- The voice is on a track below the music, such as the music on A1 and the voice on A2.
- You selected the voice clip instead of the music.
- The voice clips are muted, turned off with **Disable**, or on a muted track.
- The voice doesn't overlap the music in time.

**Fix:** Select the music clip. Drag the music's track header below the voice track, or move the clips so the voice is on the upper track. Unmute the voice clips and their track. See [Lower music under voices with Auto-duck](audio-editing.md#lower-music-under-voices-with-auto-duck).

### Auto-duck lowered the music too much

**Symptom:** The music almost disappears under the voice.

**Cause:** Each **Auto-duck** lowers the music by 12 dB more than its own volume under the voices: running it twice lowers it by 24 dB. A music clip that was already turned down goes down further from there.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the second **Auto-duck**. To make a dip shallower, drag the line inside the dip up: its two keyframes move together. The 12 dB can't be changed in this version.

### The music doesn't come back up between two sentences

**Not a problem:** Voice clips 20 frames apart or closer share one dip, so the music doesn't jump up in a short pause. To make it come up there, <kbd>Ctrl</kbd>+click the line inside the pause to add a keyframe and drag it up. See [Lower music under voices with Auto-duck](audio-editing.md#lower-music-under-voices-with-auto-duck).

### Detach audio is missing or dimmed

**Symptom:** The **Audio** section has no **Detach audio** button, or the clip menu shows it dimmed.

**Cause:** No selected clip is a video with sound to detach: you selected only audio clips, or the video's file has no sound. A video on a locked track is left out.

**Fix:** Select the video, or unlock its track. A video and its sound that are no longer linked are already detached. See [Give a video's sound a clip of its own](audio-editing.md#give-a-videos-sound-a-clip-of-its-own).

### Audio scrub plays no sound

**Symptom:** You drag in the ruler or step frames, and hear nothing.

**Cause and fix:** Check these in order.

| Check | Fix |
| --- | --- |
| **Audio scrub** in the timeline toolbar is not gold. | Click it. |
| The timeline is playing. | **Audio scrub** stays quiet during playback, which plays its own sound. Pause first. |
| You moved the playhead with <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>↑</kbd>, <kbd>↓</kbd> or a typed timecode. | Only ruler scrubs and frame steps play sound. |
| In the Preview panel, the arrow keys move a selected picture. | Click the timeline, then step. |
| The clip's sound is not loaded yet, for example right after you open the project. | Scrub over it again a moment later: the sound loads while you scrub. |
| The track is muted or another track is soloed, the clip is muted, or **Mute** under the preview is on. | Turn them off. See [Playback has no sound](#playback-has-no-sound). |

### An audio clip is faded, has diagonal lines and plays no sound

**Symptom:** One audio clip is drawn faded with diagonal lines, and you don't hear it.

**Cause:** The clip is muted, or turned off with **Disable**.

**Fix:** Select the clip and click **Unmute** in the quick actions, or turn off the **Mute** switch in the **Audio** section. For a turned-off clip, right-click it and choose **Enable**. See [Mute a clip](audio-editing.md#mute-a-clip).

## Removing silence

### Remove silence is dimmed

**Symptom:** **Remove silence** in the quick actions is dimmed, and its tooltip reads **Remove silence: select a clip with sound**.

**Cause:** No selected clip has sound that **Remove silence** can cut. For example:
- You selected a title, an image, a solid or a caption cue.
- The video has no sound, or its sound is no longer linked to it, after **Unlink** or **Detach audio**.
- The clip, or the video or sound linked to it, is on a locked track. Cutting only one of them would break sync.

**Fix:** Select the audio clip, or a video with its linked sound, and unlock their tracks. See [Remove the pauses from a clip](removing-silence.md#remove-the-pauses-from-a-clip).

### Remove silence shows no stripes

**Symptom:** The **Remove silence** row is open, but no red stripes appear, and the count reads **No silence found** or **Reading the waveform…**. **Apply** shows the message **No silence to remove**.

**Cause:** One of these:
- **Reading the waveform…**: the clip's waveform is not ready yet, for example right after import. The stripes appear as soon as it is.
- The pauses are noisier than the **Threshold**: wind, traffic, music or room noise in the background.
- The threshold is below -42 dB: then only complete digital silence counts, and room noise, however quiet, counts as sound.
- The pauses are shorter than **Min**, or not longer than twice **Pad**.

**Fix:** Raise the **Threshold**, for example to -30 dB, lower **Min**, or lower **Pad**. See [Choose a threshold for your recording](removing-silence.md#choose-a-threshold-for-your-recording).

### The stripes cover soft words or breaths

**Symptom:** Red stripes cover the start or end of words, a whisper or a breath you want to keep, or **Apply** cut into the speech.

**Cause:** The soft sound is quieter than the **Threshold**, so it counts as silence.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> if you already applied it. Lower the **Threshold** a few dB, or raise **Pad** to keep more around the speech, until the stripes leave the words alone. Then click **Apply**.

### Apply says Still analysing

**Symptom:** You click **Apply**, the message **Still analysing** appears, and nothing is cut.

**Cause:** The editor is still reading the waveform of some of the selected clips. The count reads **Reading the waveform…**, or ends with **reading…**.

**Fix:** Wait a moment until the count shows only the silences, then click **Apply** again.

### Remove silence says Some gaps stayed open

**Symptom:** After **Apply**, the message **Some gaps stayed open** names a clip and a track, for example "The silences are cut out, but Music on A2 can't move further left without overlapping." Some gaps are still there.

**Cause:** The clips on the other tracks move along with the cuts. The clip in the message can't move that far without running into the clip before it on its track.

**Fix:** Move, trim or delete the clip in the message, or the clip before it, so it has room. Then close the gaps that are left with **Close gap** or **Close all gaps**. Or press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, lock that track, and click **Apply** again: locked tracks never move. See [How other tracks follow a ripple](splitting-and-deleting.md#how-other-tracks-follow-a-ripple).

### Titles, captions or music are out of step after Remove silence

**Symptom:** After **Apply**, a title or a caption shows over the wrong words, or the music ends long after the video.

**Cause:** A clip that runs across a silence keeps its place and its length: only the clips after a cut move left. A caption cue or a title over a pause, or a music clip under the whole video, stays where it was while the speech moves up.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, remove the silence first, then add titles, captions and music. To caption the result, transcribe after you remove the silence. See [Know what Apply changes](removing-silence.md#know-what-apply-changes).

### Remove silence left a silence before or after the video

**Not a problem:** Where a video's sound starts before the picture or runs on after it (a J or L cut), that part is never cut, so the video and its sound stay in sync. Only the frames that the video and its sound share are cut. Trim that part by hand if you don't need it. See [Remove silence from a video and its sound](removing-silence.md#remove-silence-from-a-video-and-its-sound).

### Remove silence cut a second sound clip

**Symptom:** A video has two linked sound clips, for example its own sound and a second microphone. You selected only one of them, and the other one was cut too.

**Cause:** The video and every sound clip linked to it are cut together, so they stay in sync. Only the sound you selected was read, so the cuts follow its silences.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Select the video instead: both sound clips are read, and the cuts fall only where both are silent. Or unlink the second sound clip first. See [Unlink clips](links-and-groups.md#unlink-clips).

### The arrow keys change the threshold instead of the playhead

**Symptom:** You press <kbd>←</kbd> or <kbd>→</kbd>, and the **Threshold** of the **Remove silence** row changes instead of the playhead.

**Cause:** You clicked or dragged the **Threshold** slider, so it has the keyboard.

**Fix:** Click the timeline, then press the arrow keys. See [Remove silence row](keyboard-shortcuts.md#remove-silence-row).

## Shapes and images

### Add solid put the shape on a new track

**Symptom:** You click **Add solid**, and the shape lands on a new video track instead of the top one.

**Cause:** The top video track is locked or hidden, or a clip on it overlaps the 5 seconds from the playhead. The new solid never covers or moves other clips, so it gets a track of its own. **Add image** does the same when the top video track is locked or taken.

**Fix:** Nothing is wrong. Drag the clip onto another track afterwards if you like, or move the playhead to a free part of the top track first. See [Add a shape](shapes-and-images.md#add-a-shape).

### The Radius field is dimmed

**Symptom:** The **Radius** field of the **Solid** section is dimmed, and you can't change it.

**Cause:** The shape is a **Rectangle** or an **Ellipse**: neither has rounded corners.

**Fix:** Click **Rounded rectangle**, or **Line** for a line with round ends, in the **Shape** row. See [Choose the shape](shapes-and-images.md#choose-the-shape).

### The corners don't get any rounder

**Symptom:** You raise **Radius**, but past some value the corners stay as they are.

**Cause:** The corners never round more than half of the shorter side of the shape. At that point, the short ends are half circles (a pill). A small **Scale** also makes the corners look smaller, because it shrinks the whole shape.

**Fix:** Nothing is wrong: that is the roundest a rounded rectangle gets. For a circle or an oval, click **Ellipse**. To make a shape larger without shrinking its corners, change **W** and **H** instead of **Scale**. See [Set the size and the corner radius](shapes-and-images.md#set-the-size-and-the-corner-radius).

### A shape's handles change its size, not its scale

**Symptom:** You drag a handle of a solid in the preview: the shape grows, but **Scale** in the **Transform** section stays the same, and the readout shows pixels, such as **812 × 406 px**, instead of a percentage.

**Cause:** On one selected solid, the handles change the size of the shape (its **W** and **H**), so its corners and its line thickness stay as you set them. There is no 100% snap for the same reason.

**Fix:** Nothing is wrong. To change the scale instead, type it in **Scale** in the **Transform** section. See [Resize a shape in the preview](shapes-and-images.md#resize-a-shape-in-the-preview).

### Clicking beside an ellipse selects it

**Symptom:** You click just outside an ellipse or a rounded corner, on the picture behind it, and the solid is selected instead.

**Cause:** A solid is picked by its whole box, also where its shape doesn't reach.

**Fix:** Click outside the box, or <kbd>Alt</kbd>+click to select the layer below it. See [Select a layer under another one](arranging-layers-in-the-preview.md#select-a-layer-under-another-one).

### Add image added no clip

**Symptom:** You click **Add image** and pick files, but no clip appears at the playhead.

**Cause:** One of these:
- You switched the file picker to all files and picked videos or sounds: they are imported into the Media panel, but only images are placed.
- The message **This project is read-only** appeared: the project can't be changed.
- The message **Can't import** appeared: the file type is not supported, or an SVG has no size. See [Importing](#importing).

**Fix:** Pick image files (.png, .jpg, .jpeg, .webp, .gif or .svg). Drag a video from the Media panel onto the timeline instead. In a read-only project, click **Allow editing** in the banner first. See [Add an image](shapes-and-images.md#add-an-image).

### An animated image plays choppily

**Symptom:** An animated GIF or WebP moves less smoothly in the preview than in a web browser.

**Cause:** One of these:
- The animation is large or long. The editor keeps up to 128 MB of its frames, at most 2048 pixels on their longer side. Beyond that, it keeps every second frame (or every third, and so on), so the animation keeps its length but has fewer frames.
- The animation has more frames per second than the project: the preview shows one picture per project frame, so some frames are skipped.
- The animation shows for the first time, and its frames are still loading.

**Fix:** Use a smaller GIF or WebP: one about the size you show it at keeps all of its frames. Wait a moment after adding a new animation. See [Use animated GIF and WebP images](shapes-and-images.md#use-animated-gif-and-webp-images).

### An animated image doesn't stop at its end

**Symptom:** An animated GIF or WebP starts over again and again, also one that plays only once in other apps.

**Cause:** Animated images always loop for as long as their clip lasts.

**Fix:** Trim the clip to the length of one round: the Media panel shows that length as the item's duration. See [Trim a clip](trimming.md#trim-a-clip).

### An animated image plays slower than expected

**Symptom:** A GIF made with very short frame times plays slower than you expect.

**Cause:** A frame shorter than 20 milliseconds shows for 100 milliseconds, as in web browsers.

**Fix:** Save the GIF again with frame times of at least 20 milliseconds (2 hundredths of a second) in your GIF tool.

### An SVG image looks soft

**Symptom:** An SVG logo looks soft or has blurred edges in the preview.

**Cause:** One of these:
- You just zoomed in or resized the logo, and the editor is still drawing it again at the new size.
- The video is playing or you scrub, with the **Auto** quality: the preview then shows the project's resolution.
- The logo is drawn larger than 4096 pixels on its longer side, the most the editor draws an SVG at. For a square logo as wide as a 1080×1920 frame, that is above about 379% zoom.

**Fix:** Stop playback and wait a moment. See [Keep SVG images sharp](shapes-and-images.md#keep-svg-images-sharp).

## Titles and text

### T or Shift+T does nothing

**Symptom:** You press <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> and no title appears.

**Cause:** One of these:
- A text field has the keyboard focus, or a dialog or a menu is open.
- You are editing a text in the preview: there <kbd>T</kbd> types a "t".

**Fix:** Press <kbd>Esc</kbd> to finish the text or leave the field, or click the timeline. Then press <kbd>T</kbd> again, or click **Title** in the timeline toolbar. See [Add a title](titles-and-text.md#add-a-title).

### A new title went onto a new track

**Symptom:** <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd> created a new video track at the top, although a lower track has room.

**Cause:** A new title goes onto the top video track only when that track is free for the whole length of the title, unlocked and shown. Otherwise it gets a new track at the top, so the text stays above the picture.

**Fix:** Nothing is wrong. Drag the clip to another track if you like, or delete the empty track. See [Where a new title goes](titles-and-text.md#where-a-new-title-goes).

### A new title has another length

**Symptom:** A new title or subtitle is longer or shorter than 3 seconds.

**Cause:** When the playhead is over a video clip, a new title lasts until the end of that clip (**Match clip** in **Settings** > **General**, on by default). Otherwise it lasts the **Title** length of the settings, 3 seconds unless you changed it. A title added from a preset with its own length keeps that length.

**Fix:** Trim the title's edges on the timeline, or type a **Duration** in the **Clip** section. See [Change a clip's name, color and times](editing-properties.md#change-a-clips-name-color-and-times). To always get one length, turn **Match clip** off; see [Set the length of new clips](settings.md#set-the-length-of-new-clips).

### Keys type into the text instead of working

**Symptom:** <kbd>Space</kbd> types a space instead of playing, <kbd>Delete</kbd> deletes a letter instead of the clip, or other shortcuts do nothing.

**Cause:** You are editing a text in the preview: it has a gold outline and a caret. While you edit, the keys type.

**Fix:** Press <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish editing. See [Finish editing](titles-and-text.md#finish-editing).

### Typed text disappeared

**Symptom:** After you finish editing, the text is back to what it was before, or the clip is empty.

**Cause:** One of these:
- The text clip was deleted or its track was locked while you edited it. What you typed then is not kept.
- You pressed <kbd>Ctrl</kbd>+<kbd>Z</kbd> after you finished: it takes back the whole edit (**Edit text**).
- You deleted all the text. An empty text clip stays on the timeline, named "Text".

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> to redo an edit you undid. Delete an empty text clip with <kbd>Delete</kbd>. See [Edit text in the preview](titles-and-text.md#edit-text-in-the-preview).

### A click on a text selects the picture behind it

**Symptom:** You click a text in the preview, and the video or image under it is selected instead.

**Cause:** A text counts only on its letters (with a 4-pixel margin) and on its background box. The empty parts of its box, for example beside a short line or between two lines, belong to the layer below.

**Fix:** Click right on a letter, or click the text clip on the timeline. See [Select and move text in the preview](titles-and-text.md#select-and-move-text-in-the-preview).

### Dragging a corner of a text changes its font size

**Symptom:** You drag a corner of a text, and **Size** changes instead of **Scale**. Or you drag a side, and **Box** switches to **Fixed** and the words wrap. A text has no top and bottom handles.

**Cause:** A text's handles change the text itself: the corners its font size, the sides the width of its box.

**Fix:** Nothing is wrong. To scale a text like a picture, type a value in **Scale** in the **Transform** section. To go back to a box that fits the lines, click **Auto** in **Box**. See [Resize text with its handles](titles-and-text.md#resize-text-with-its-handles).

### A text shows Missing or a red triangle

**Symptom:** The **Font** field of the **Text** section shows a red **Missing** chip, the text clip shows a red warning triangle on the timeline, and the text looks different.

**Cause:** The text uses a font that is not on this computer and not in the project's `fonts` folder, for example a project made on another computer that couldn't copy the font. The text is drawn with a fallback font.

**Fix:** Pick another font, or install the font and reload the page. See [Fix a missing font](titles-and-text.md#fix-a-missing-font).

### Show system fonts lists nothing

**Symptom:** After you click **Show system fonts**, the **System** section reads **Font access was not allowed** or **This browser cannot list system fonts**.

**Cause:** You refused the permission to use the fonts on your computer, Chrome blocked it for the site, or the browser has no access to installed fonts.

**Fix:** Allow the **Fonts** permission for the site in Chrome's site settings (click the icon left of the address), reload the page and click **Show system fonts** again. Or use one of the eight fonts that come with the editor. See [Use fonts from your computer](titles-and-text.md#use-fonts-from-your-computer).

### A font from your computer was not copied into the project

**Symptom:** The project's `fonts` folder doesn't have a font your text uses, and the text shows **Missing** on another computer.

**Cause:** One of these:
- The project was open in read-only mode.
- The list of system fonts wasn't loaded in that session: you changed the weight or **Italic** of a computer font without clicking **Show system fonts** first.

**Fix:** On the computer that has the font, open the project with editing allowed, open the font picker of any text and click **Show system fonts**: the editor copies the fonts the project uses. See [Fonts travel with the project](titles-and-text.md#fonts-travel-with-the-project).

### Letters of some languages look different

**Symptom:** Greek, Cyrillic, Arabic, Hebrew, Chinese, Japanese, Korean or other letters don't match the font you picked.

**Cause:** The fonts that come with the editor cover the Latin alphabet only. Other letters are drawn with a fallback font of your system.

**Fix:** Pick a font from your computer that has those letters. See [Use fonts from your computer](titles-and-text.md#use-fonts-from-your-computer).

## Text presets

### Clicking a preset adds a new title instead of changing the selected one

**Symptom:** You click a card in the **Presets** tab, and a new title appears at the playhead, while the title you meant stays as it was.

**Cause:** A click applies the preset to the selected text clips. When no text clip is selected (for example only a video is selected), or the selected texts are on a locked track, the click adds a new text instead.

**Fix:** Press <kbd>Esc</kbd>, then <kbd>Ctrl</kbd>+<kbd>Z</kbd> to remove the new title. Select the title on the timeline or in the preview (unlock its track if needed) and click the card again. See [Apply a preset to text](text-presets.md#apply-a-preset-to-text).

### Update preset is dimmed

**Symptom:** **Update preset** in the quick actions is dimmed, and its tooltip reads **Update preset: the selected text has no preset, or already has its style**.

**Cause:** One of these:
- The selected text clip uses no preset, for example because it was made with the built-in look.
- Its preset was deleted.
- Its style is still the preset's: there is nothing to write.
- The preset belongs to a read-only project, or the clip is on a locked track.

**Fix:** Change the text's style first, or save it as a new preset with **Save as preset**. To link a text to an existing preset, click that preset's card with the text selected, then change the style. See [Update a preset](text-presets.md#update-a-preset).

### Other titles did not change after Update preset

**Symptom:** You updated a preset, but other titles made with it keep their old look.

**Cause:** **Update preset** changes the preset, not the titles that use it. Each title keeps its own style until you apply the preset to it again.

**Fix:** Select the other titles (<kbd>Shift</kbd>+click them on the timeline) and click the preset's card: they all take the new look in one step. See [Update a preset](text-presets.md#update-a-preset).

### T or Shift+T makes a different look than expected

**Symptom:** A new title or subtitle doesn't look like before.

**Cause:** <kbd>T</kbd> and <kbd>Shift</kbd>+<kbd>T</kbd> use the default title and subtitle presets. Another preset was chosen as default, or the default preset was updated. When the default preset was deleted, or it is a project preset and another project is open, they use the built-in look.

**Fix:** In the **Presets** tab, look for the card with the title or subtitle badge in its top-left corner. Right-click the card you want and choose **Use as default title** or **Use as default subtitle**. Choose the highlighted row again to go back to the built-in look. See [Choose the presets for T and Shift+T](text-presets.md#choose-the-presets-for-t-and-shiftt).

### A favorite chip is missing from the toolbar

**Symptom:** A preset has a star, but no chip in the timeline toolbar.

**Cause:** One of these:
- More than 8 presets are favorites. The toolbar shows the first 8: the **Global** favorites first, then the project's.
- The Timeline panel is narrow, and the **Add** group with the chips moved into the **More tools** (…) menu.

**Fix:** Turn off the favorites you need less, click **More tools**, or widen the Timeline panel. See [Put favorite presets in the timeline toolbar](text-presets.md#put-favorite-presets-in-the-timeline-toolbar).

### Presets in the Project list can't be changed

**Symptom:** In the **Project** list, **Favorite**, **Apply position**, **Rename**, **Duplicate** and **Delete** are dimmed, the tab reads **This project is read-only: its presets cannot change.**, and new presets go into **Global**.

**Cause:** The project opened read-only: the editor can't write to its `presets/text` folder.

**Fix:** Click **Allow editing** in the read-only banner and allow editing. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode).

### A preset looks larger or smaller in another project

**Symptom:** A preset's font size or box width in **Edit Properties** is not the number you saved.

**Cause:** Presets scale with the shorter side of the frame, so they look the same in projects of every size. A 120-pixel preset gives an 80-pixel text in a 720×1280 project and a 240-pixel text in a 4K project.

**Fix:** Nothing is wrong: the text has the same size relative to the frame. See [Presets in projects of other sizes](text-presets.md#presets-in-projects-of-other-sizes).

### Import says No presets imported or Couldn't import the presets

**Symptom:** After **Import presets from a JSON file**, a message says **No presets imported** or **Couldn't import the presets**.

**Cause:** The file is not a presets file (not JSON, or JSON of something else, such as `project.json`), none of its entries is a text preset, or it comes from a newer version of the editor. The second line of the message says which.

**Fix:** Pick a file made with **Export the presets shown to a JSON file** or **Export…**, or a preset file from a library folder or a project's `presets/text` folder. For a file from a newer version, update the editor first. See [Export and import presets](text-presets.md#export-and-import-presets).

### The library folder strip asks you to click Sync

**Symptom:** At the bottom of the **Global** list, the strip reads, for a folder named "My presets", **Library folder: My presets. Click Sync to allow access.**

**Cause:** Chrome no longer lets the editor use the folder without asking, for example after you restarted the browser.

**Fix:** Click **Sync the global presets with the library folder** (the button next to the text) and allow access when Chrome asks. See [Sync your presets with a folder](text-presets.md#sync-your-presets-with-a-folder).

### A deleted preset came back

**Symptom:** A preset you deleted is in the list again.

**Cause:** One of these:
- A sync with the library folder brought it back: another computer that syncs with the same folder still had it and wrote it there. A sync merges and never deletes.
- You imported a file that holds it.

**Fix:** Delete it again on every computer that syncs with the folder. See [Sync your presets with a folder](text-presets.md#sync-your-presets-with-a-folder).

## Text animations

### An animation plays shorter than its Duration

**Symptom:** A text's animation is quicker than the **Duration** you typed, and a hint under the field reads, for example, **Plays in 2.00 s: half the clip**.

**Cause:** Each animation plays over at most half the clip, so the in and out animations never overlap. The duration you typed is kept for when the clip gets longer. On a clip shorter than 2 frames, no animation plays and the hint reads **The clip is too short to play it**.

**Fix:** Make the text clip longer on the timeline, or type a shorter **Duration**. See [When an animation plays](text-animations.md#when-an-animation-plays).

### The Stagger field is dimmed

**Symptom:** You can't type in **Stagger**.

**Cause:** **Stagger** sets the delay between words or lines, so it works only with **Word pop**, **Word fade** and **Line reveal**. The other animations move the whole text at once, and **Typewriter** types at an even pace over its **Duration**.

**Fix:** Choose **Word pop**, **Word fade** or **Line reveal**, or change the **Duration** instead. See [Make words follow one another (Stagger)](text-animations.md#make-words-follow-one-another-stagger).

### Easing changes nothing on a typewriter

**Symptom:** You choose another **Easing**, but the typewriter types the same way.

**Cause:** **Typewriter** always types at an even pace.

**Fix:** Change its **Duration** to type faster or slower. See [Choose the easing](text-animations.md#choose-the-easing).

### The preview plays and the playhead jumps back when you click a chip

**Symptom:** A click on an animation chip, or a new **Duration**, **Stagger** or **Easing**, plays part of the clip and then puts the playhead back.

**Cause:** This is the preview of the animation: it plays the start of the clip for an in animation, or its end for an out animation, then returns the playhead to where it was.

**Fix:** Nothing is wrong. To watch it again, click the highlighted chip. See [Preview an animation](text-animations.md#preview-an-animation).

### A text doesn't animate while you edit it

**Symptom:** You double-click an animated text to type in it, and it shows at rest, even on a frame where it should be coming in.

**Cause:** A text you are editing always shows at rest, so you can see what you type.

**Fix:** Press <kbd>Esc</kbd> to finish editing: the animation plays again. See [When an animation plays](text-animations.md#when-an-animation-plays).

### A chip changes nothing on some of the selected texts

**Symptom:** You click a chip with several clips selected, and some of the texts don't get the animation.

**Cause:** Animations apply to text clips only, and text clips on locked tracks are left alone.

**Fix:** Unlock the track (click the padlock in its header) and click the chip again. See [Animate several texts at once](text-animations.md#animate-several-texts-at-once).

### Applying a preset removed a text's animations

**Symptom:** After you click a preset card, the text has no animation any more, and its sparkles icon is gone from the timeline.

**Cause:** A preset gives the text its animations along with its style. A preset without animations removes the text's animations.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo the apply. To keep both, apply the preset, set the animations again, then click **Update preset** to store them in the preset. See [Animations in presets](text-presets.md#animations-in-presets).

### Pointing at a preset card doesn't show its animation

**Symptom:** While the pointer is on a preset card, the selected title takes the preset's look but doesn't move.

**Cause:** The live look while you point shows the style, box and position only.

**Fix:** Click the card to apply the preset. Then click the highlighted chip in the **Animation** section to watch the animation. See [Apply a preset to text](text-presets.md#apply-a-preset-to-text).

### A starter preset has no animation

**Symptom:** **Lower third**, **Caption bold**, **Neon glow** or **Breaking** adds or applies text without an animation.

**Cause:** Your starter presets were added by an earlier version, and you changed this one since. A changed starter keeps its look as it is.

**Fix:** Select a text, click the starter's card, choose the animations in the **Animation** section and click **Update preset**. See [Start with the starter presets](text-presets.md#start-with-the-starter-presets).

## Captions

### Add caption track is dimmed

**Symptom:** The **Add caption track** button in the timeline toolbar is dimmed, and its tooltip reads **Caption track: the project has one (Media > Captions)**.

**Cause:** A project has only one caption track, and this project has it. Adding a cue or importing a subtitle file in the **Captions** tab adds it too when it is missing.

**Fix:** Use the **CC** track that is already there, at the top of the tracks. Open the **Captions** tab to see its cues. See [Add the caption track](captions.md#add-the-caption-track).

### Import says No captions imported

**Symptom:** After you pick a subtitle file, the message **No captions imported** appears and nothing changes.

**Cause:** The file holds no cue the editor can read: no time line such as `00:00:01,000 --> 00:00:03,500`.

**Fix:** Open the file in a text editor and check that it is an SRT or VTT file with time lines. See [Import an SRT or VTT file](captions.md#import-an-srt-or-vtt-file).

### An import replaced your cues

**Symptom:** After an import, the cues you had are gone, and the message says, for example, **Replaced 12 cues.**

**Cause:** An import replaces all the cues on the caption track.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the old cues come back, in one step. To combine two files, join them in a text editor first and import the result. See [Import an SRT or VTT file](captions.md#import-an-srt-or-vtt-file).

### The caption track is locked

**Symptom:** Adding a cue, importing a subtitle file or transcribing shows the message **The caption track is locked**. Or text you type in a cue goes back to the old text when you leave the field, <kbd>Enter</kbd> shows **Can't split this cue**, and **Clear all cues** does nothing.

**Cause:** The **CC** track is locked: its padlock is closed and gold.

**Fix:** Click the padlock in the **CC** header to unlock the track, then try again. See [Hide, lock or remove the captions](captions.md#hide-lock-or-remove-the-captions).

### Enter splits the cue instead of starting a new line

**Symptom:** You press <kbd>Enter</kbd> in a cue's text to start a new line, and the cue becomes two cues.

**Cause:** In a cue's text, <kbd>Enter</kbd> splits the cue at the caret.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> right away: the caret is at the start of the second cue, so the two cues become one again. Then press <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line. See [Split and merge cues](captions.md#split-and-merge-cues).

### Ctrl+Backspace deletes a word instead of merging cues

**Symptom:** <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> in a cue's text deletes the word before the caret, or does nothing.

**Cause:** It merges the cue into the cue before it only when the caret is at the very start of the text and no letters are selected. Anywhere else, it deletes the word before the caret, as in any text field. On the first cue it does nothing: there is no cue before it.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Home</kbd> to put the caret at the start, then press <kbd>Ctrl</kbd>+<kbd>Backspace</kbd>. Or right-click the cue on the timeline and choose **Merge with previous cue**. See [Split and merge cues](captions.md#split-and-merge-cues).

### Delete removes letters instead of the cue

**Symptom:** In the **Captions** tab, <kbd>Delete</kbd> removes letters from a cue instead of deleting it.

**Cause:** You are typing in the cue's text, so the keys type there.

**Fix:** Press <kbd>Esc</kbd>: the text goes back to how it was and the row stays focused. Then press <kbd>Delete</kbd>. Or select the cue on the timeline and press <kbd>Delete</kbd>. See [Find, select and delete cues](captions.md#find-select-and-delete-cues).

### A cue stops before where you drag it

**Symptom:** A cue you drag, nudge or trim on the **CC** row stops against the cue before or after it, even with **Ripple mode** on. Or an <kbd>Alt</kbd>+drag copy of a cue shows a red ghost and the drop adds nothing.

**Cause:** Cues never overlap, and a cue never pushes another cue. A copy needs a free spot near the pointer that is at least as long as the cue.

**Fix:** Make room first: trim, move or delete the neighboring cue, then drag again. For a copy, drop it on a gap that is long enough. See [Edit cues on the timeline](captions.md#edit-cues-on-the-timeline).

### Captions moved after an edit on another track

**Symptom:** After an insert or a ripple edit on a video or audio track, the cues moved too, or a cue was split in two.

**Cause:** Inserts and ripple edits move the cues along with the picture, so the captions stay in sync with the speech. A cue that crosses the point where time is inserted is split there.

**Fix:** This keeps your captions in sync, so it is usually what you want. To keep the captions where they are, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>, lock the **CC** track and make the edit again. See [Edit cues on the timeline](captions.md#edit-cues-on-the-timeline).

### A caption doesn't show in the preview

**Symptom:** The playhead is over a cue on the **CC** row, but the preview shows no caption.

**Cause:** The **CC** track is hidden (its eye is crossed out), the cue is turned off (it looks faded, with diagonal lines), or the cue has no text.

**Fix:** Click the eye in the **CC** header, right-click the cue and choose **Enable**, or type the cue's text in the **Captions** tab. See [Hide, lock or remove the captions](captions.md#hide-lock-or-remove-the-captions).

### Clicking a caption in the preview selects the video

**Symptom:** You click a caption in the preview, and the picture under it is selected instead, with its handles.

**Cause:** Captions can't be selected, moved or edited in the preview in this version.

**Fix:** Edit the text in the **Captions** tab, and place the captions with **Position** in the **Caption style** section. See [Choose where captions sit](captions.md#choose-where-captions-sit).

### The spoken word isn't highlighted

**Symptom:** The captions play in one color, although **Highlight** in **Caption style** is set to **Color**, **Box**, **Scale** or **Both**.

**Cause:** The cues have no word timings. SRT files never have them, VTT files only when the cues hold karaoke times, and cues you add at the playhead have none. Between two words nothing is highlighted, and a cue you are typing in pauses its highlight.

**Fix:** Transcribe the speech: transcribed cues always have word timings. See [Transcription](transcription.md). Or import a VTT file whose cues have karaoke times, such as `Never <00:00:00.700>drink <00:00:01.200>liquid nitrogen`. See [Highlight the spoken word](captions.md#highlight-the-spoken-word).

### A long cue looks smaller than the others

**Symptom:** Some captions are drawn in a smaller size than the rest.

**Cause:** The cue needs more lines than **Max lines** at the **Max width**, so it is drawn smaller to fit, in steps of 10%, down to half its size.

**Fix:** Raise **Max lines** or **Max width** in **Caption style**, or split the cue in two with <kbd>Enter</kbd> in its text. See [Style your captions](captions.md#style-your-captions).

### A preset card added a title instead of styling the captions

**Symptom:** With your captions in mind, you click a card in the **Presets** tab, and a new text clip appears at the playhead.

**Cause:** Neither the **CC** track nor a cue was selected, or the **CC** track is locked. Only then does a card add a new text.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to remove the new text. Unlock the **CC** track if needed, click its header or a cue, and click the card again. When the card's right-click menu shows **Apply to captions**, a click styles the captions. See [Give captions the look of a preset](captions.md#give-captions-the-look-of-a-preset).

### Export SRT or VTT is dimmed

**Symptom:** In the **Captions** tab header, **Export SRT or VTT** and **Clear all cues** are dimmed.

**Cause:** The caption track has no cues.

**Fix:** Add a cue with **Add a 2 s cue at the playhead** (+), import a subtitle file, or transcribe the speech. See [Add a cue at the playhead](captions.md#add-a-cue-at-the-playhead) and [Transcription](transcription.md).

## Transcription

### Transcribe is dimmed

**Symptom:** The microphone in the **Captions** header, or **Transcribe** in an empty **Captions** tab, is dimmed. Its tooltip reads **Transcribe: no audio on the timeline** or **No audio on the timeline**.

**Cause:** The timeline has no audio clip. The editor transcribes the sound of the timeline, not the media in the Media panel. A video placed without its sound has nothing to transcribe.

**Fix:** Put the video with its sound on the timeline, or add the audio file that holds the speech. See [Before you start](transcription.md#before-you-start).

### A transcription says No audio to transcribe or No speech found

**Symptom:** After you click **Transcribe**, the message **No audio to transcribe** or **No speech found** appears, and no review opens.

**Cause:** **No audio to transcribe**: no sound plays in the range, because its audio tracks are muted, another track is soloed, its clips are turned off, or the range has no audio clip. **No speech found**: the range holds sound, but Whisper heard no words in it: music, silence, or speech that is very quiet.

**Fix:** Play the range and listen: what you hear is what the editor transcribes. Unmute the voice track or check the **S** toggles, turn clips back on with **Enable**, or choose **Whole timeline** in the dialog. For quiet or noisy speech, try **Small**. See [If a transcription doesn't start](transcription.md#if-a-transcription-doesnt-start).

### The model download fails

**Symptom:** The message **Couldn't transcribe** appears with **The model could not be downloaded. Check the connection and try again.**

**Cause:** The first transcription with a model downloads it from Hugging Face, and the connection failed or was blocked.

**Fix:** Check your internet connection, and that your network allows downloads from Hugging Face, then transcribe again. To download less, choose **Tiny**. Once a model shows **Downloaded**, it works offline. See [Choose a model](transcription.md#choose-a-model).

### A downloaded model shows its size again

**Symptom:** A model that showed **Downloaded** before shows its download size in the **Transcribe captions** dialog, and the next transcription downloads it again.

**Cause:** Models are kept by the browser, not in the project folder. They are gone after **Remove model** or after the browser's data for the editor is cleared. Another browser or browser profile has its own copy. A model downloaded while transcription ran on the graphics card doesn't count when it runs on the processor, and the other way around.

**Fix:** Download it once more. See [Manage downloaded models](transcription.md#manage-downloaded-models).

### The transcription is slow

**Symptom:** The **Transcribing** percentage climbs slowly, or the review says **on WebAssembly**.

**Cause:** Larger models take longer: **Base** needs about half the length of the audio on a laptop graphics card, **Small** more. On the processor (WebAssembly), larger models are slower still. While the timeline plays, the percentage holds still.

**Fix:** Choose **Tiny** for a quick draft, or transcribe only the part you need with an in/out range. Stop playback to see the percentage move again. See [Speed and accuracy](transcription.md#speed-and-accuracy).

### The captions are in the wrong language

**Symptom:** The review names another language than the one spoken, or its cues are garbled.

**Cause:** **Detect automatically** listens only to the first 30 seconds of the range. Music, silence or another language at the start can mislead it.

**Fix:** Click **Discard**, open the dialog again and choose the language under **Language**. See [Choose the language](transcription.md#choose-the-language).

### Some words are wrong

**Symptom:** The captions have misheard words, misspelled names, numbers written as digits, or song lyrics.

**Cause:** Whisper guesses from the sound. Music, noise, overlapping voices, accents and names make mistakes more likely, and the smaller models make more of them.

**Fix:** Fix the words in the **Captions** tab. Before transcribing again, solo the voice track (**S**) so music is left out, and choose **Small**. To redo only a bad passage, mark it with <kbd>I</kbd> and <kbd>O</kbd> and transcribe **In to out**. See [Fix the captions](transcription.md#fix-the-captions).

### The highlight comes late

**Symptom:** On transcribed captions, each word lights up a moment after it is spoken.

**Cause:** With **Tiny**, the word timings can trail the voice by about 0.2 seconds.

**Fix:** Transcribe with **Base** or **Small**. See [Choose a model](transcription.md#choose-a-model).

### A word you fixed is no longer highlighted

**Symptom:** After you change a word in a transcribed cue, that word stays in the text color while the others light up.

**Cause:** The highlight looks for each timed word in the cue's text. A word you replace with a different word, or a word you add, has no timing.

**Fix:** This is expected for the words you changed. To get timings for a whole passage again, transcribe its range again. See [Fix the captions](transcription.md#fix-the-captions).

### A transcription replaced cues outside the in/out range

**Symptom:** After **Replace N cues**, a cue that started before the in point or ended after the out point is gone, or the review counts more cues than you expected.

**Cause:** Every cue that touches the range is replaced, also a cue that crosses its edge.

**Fix:** Press <kbd>Ctrl</kbd>+<kbd>Z</kbd>: the old cues come back. Set the in and out points between cues, then transcribe again. See [Transcribe part of the timeline](transcription.md#transcribe-part-of-the-timeline).

### The transcript disappeared before you added it

**Symptom:** The **Review the transcript** dialog closed, and no cues were added.

**Cause:** <kbd>Esc</kbd>, the close button, a click outside the dialog and **Discard** all drop the result. Opening another project does too.

**Fix:** Transcribe again. The model is already downloaded, so it is quicker. See [Review the transcript](transcription.md#review-the-transcript).

### Chinese or Japanese captions have no spaces or a low word count

**Symptom:** Transcribed Chinese, Japanese, Thai, Lao or Burmese captions have no spaces between words, Chinese and Japanese lines are short, and the **Captions** tab counts each line of a Chinese or Japanese cue as 1 word.

**Cause:** These languages are written without spaces, and their wide characters fill a line twice as fast, so a line holds about 16 of them. The word count counts the pieces of text between spaces.

**Fix:** Nothing to fix: the captions are written as the language is. The word highlight still finds each word. See [How the speech becomes cues](transcription.md#how-the-speech-becomes-cues).

## Export

### Export says Nothing to export or This project is read-only

**Symptom:** You click **Export** in the **Export** tab, and the message **Nothing to export** ("Add clips to the timeline first.") or **This project is read-only** ("Allow editing to export into the project's folder.") appears, and no card shows in the **Queue**.

**Cause:** **Nothing to export**: the timeline has no clips. **This project is read-only**: the editor may not write to the project folder, so it can't save the file in its `exports` folder. The same goes for **Export audio** and **Export frame**.

**Fix:** Add clips to the timeline. In a read-only project, click **Allow editing** in the read-only banner and allow editing when the browser asks, or choose **Choose file…** under **Save to** and save the file somewhere else. See [Work in read-only mode](projects-and-saving.md#work-in-read-only-mode) and [Choose where the file goes](exporting-video.md#choose-where-the-file-goes).

### An export doesn't start

**Symptom:** You clicked **Export**, but the card stays at **Queued**, or nothing happens at all.

**Cause:** Exports run one at a time, in order: a card reads **Queued** until the exports before it are done. A paused export keeps its place, so the ones after it wait. With **Choose file…** under **Save to**, the export starts only after you pick a file in the save dialog; if you cancel the dialog, nothing is queued.

**Fix:** Look at the first card in the **Queue**: click **Resume** if it reads **Paused**, or **Cancel** to let the next one start. With **Choose file…**, pick a file in the dialog. See [Follow the progress](exporting-video.md#follow-the-progress).

### An export fails

**Symptom:** The message **Export failed** appears with a reason, the **Log** lists the export with a red cross, and no new file is in `exports`.

**Cause:** The export could not finish. The reason tells you why, for example:
- the disk is full, or the project folder can't be written any more (it was moved, or it is on a drive that was unplugged);
- **The export's GPU device was lost** or **No WebGPU device for the export**: the graphics chip was reset or is not available;
- **This browser cannot encode 1080x1920 video**: the browser has no video encoder for this frame size.

**Fix:**
1. Free disk space on the drive of the project folder, and check that the folder is still there.
2. Check that Chrome uses hardware acceleration; see [A WebGPU adapter is missing](#a-webgpu-adapter-is-missing). Update Chrome or Edge to the current version.
3. Export again with **Export again with these settings** in the log row. If the frame size can't be encoded, choose a lower **Resolution** in the **Settings** section of the **Export** tab, set **Encoder** to **Auto**, or try a project with a standard size, such as **9:16 · 1080×1920**; see [Change the export settings](exporting-video.md#change-the-export-settings) and [Change the frame size](project-settings-and-templates.md#change-the-frame-size).

### An export was cancelled by itself

**Symptom:** The message **Export cancelled** ("Nothing was written to exports/.") appears although you didn't click **Cancel**, or the **Queue** is empty and no file came.

**Cause:** Opening or creating another project stops the running export and empties the queue, and **Cancel the export** in the command palette stops the running export. Closing the tab or reloading the page stops all exports without a message.

**Fix:** Open the project again and export once more: **Export again with these settings** in the **Log** repeats an export that was cancelled while it ran. Wait until the **Queue** is empty before you switch projects or close the tab. See [Keep editing while you export](exporting-video.md#keep-editing-while-you-export).

### The exported video doesn't have your latest changes

**Symptom:** A trim, a move or a new title you made while the export ran is not in the exported file.

**Cause:** The export uses the timeline as it was when you clicked **Export**, also while it waited in the queue. Changes you make after that stay in your project but don't go into that file.

**Fix:** Export again once you are done, for example with **Export again with these settings** in the **Log**: the new file gets its own name next to the first one.

### The exported video isn't 1080×1920 or 60 fps

**Symptom:** The file is, for example, 1080×1350 or 1920×1080, or plays at 30 fps although your project has 60.

**Cause:** Every preset keeps the shape of your project. **Reels** and **TikTok** export at most 1920 pixels on the long side and at most 30 frames per second, so a 50, 59.94 or 60 fps project exports every second frame. A **Custom** setting or your own preset may use a lower **Resolution** or **Frame rate**.

**Fix:** For a full-screen video, use a **9:16 · 1080×1920** project. For 60 fps, choose **Shorts**, or **Custom** with **60 fps** in **Frame rate**. Check the line under the preset chips before you export: it shows the frame size and the frame rate you get. See [Know what the file is like](exporting-video.md#know-what-the-file-is-like).

### A codec reads not supported here

**Symptom:** In the **Settings** section of the **Export** tab, **HEVC** or **AV1** reads "(not supported here)", and the line under the preset chips adds, for example, "HEVC not supported here: H.264 is used".

**Cause:** Your browser can't encode that codec with these settings on this computer. Some codecs work only with your computer's video chip, or only up to a certain frame size.

**Fix:** Export with H.264, which the editor uses anyway in that case. Or set **Encoder** to **Auto** or **Prefer hardware**, or choose a lower **Resolution**: the list updates as you change the settings. See [Change the export settings](exporting-video.md#change-the-export-settings).

### The file is smaller than the estimate

**Symptom:** The exported file is much smaller than the figure next to the **Export** button.

**Cause:** The estimate is the most the bitrate allows. Simple pictures, such as titles on a plain color or still images, need far less, even with **Constant (CBR)**.

**Fix:** Nothing: the file is complete. See [Check the estimated size](exporting-video.md#check-the-estimated-size).

### In to out is dimmed

**Symptom:** In the **Range** row of the **Export** tab, **In to out** is dimmed, and its tooltip reads **Mark in and out points first (I, O)**.

**Cause:** The timeline has no in or out point, or the out point is not after the in point.

**Fix:** Press <kbd>I</kbd> at the first frame you want and <kbd>O</kbd> at the last one, then click **In to out**. See [Export only the in/out range](exporting-video.md#export-only-the-inout-range).

### The exported video has no sound, misses a track or shows a gray slate

**Symptom:** The file is silent, a track you see or hear in the editor is missing, or a clip shows a gray rectangle with **Media offline** or another slate text.

**Cause:** The export leaves out what the editor leaves out: muted audio tracks, tracks left out by a solo, hidden or muted video tracks, and clips you turned off. Offline media show their slate and have no sound. The **Master volume** knob and **Mute** under the preview don't affect the file.

**Fix:** Play the timeline with **Mute** off: what you hear and see is what the export writes. Turn tracks and clips back on, and relink offline media before you export. See [Know what goes into the file](exporting-video.md#know-what-goes-into-the-file) and [Offline media and relinking](offline-media-and-relinking.md).

### Playback looks softer or a proxy stops during an export

**Symptom:** While an export runs, playback looks softer and the status line under the preview reads **Proxy: proxy**, a proxy's percentage on a media card stops, or **Clear cache** shows **An export is running**.

**Cause:** The export uses the video encoder. Meanwhile, playback uses proxies, new proxies wait, and the cache stays as it is, because the export writes its file there.

**Fix:** Nothing: all of it goes back to normal when the export ends. When you stop playback, the preview shows the original frame as usual. To give the preview your computer's full power for a moment, click **Pause** on the export's card in the **Queue** or in the progress message. See [Keep editing while you export](exporting-video.md#keep-editing-while-you-export).

### You can't find the exported file

**Symptom:** The message **Exported** appeared, but you don't see the file where you expected it.

**Cause:** With **exports folder** under **Save to**, the editor writes the file into the `exports` folder inside your project folder, not into your Downloads folder. When a file of the same name is there already, the new one gets a number, such as `Promo-reels-2026-10-18 (2).mp4`. With **Choose file…**, the file is where you saved it in the save dialog.

**Fix:** Click **Open folder** in the **Exported** message or in the file's row of the **Log**. Or open your project folder in File Explorer, then `exports`, and look for the name the **Exported** message showed. See [Find the exported file](exporting-video.md#find-the-exported-file).

### Open folder shows a file dialog

**Symptom:** **Open folder** opens a file dialog instead of File Explorer, or the message **Exports folder** appears and names the folder.

**Cause:** A browser can't open File Explorer. The editor opens the file dialog in the folder instead. When that isn't possible either, for example in a read-only project, it names the folder.

**Fix:** Choose a file in the dialog and click **Open**: it opens in a new browser tab. If the message **Pop-up blocked** appears, allow pop-ups for the editor's site in the browser's address bar. To see the folder in File Explorer, open your project folder there, then `exports`.

## Known limitations

The current version cannot do these things yet. Each one is available in a later version.

- **Sound:** no sound while you play backward or shuttle faster than 1x; while you scrub or step frames, only with **Audio scrub** on. **Remove silence** has no default keyboard shortcut. Audio effects are not available.
- **Copy and paste:** caption cues can't take **Paste attributes**.
- **Media panel:** bins can't hold other bins. **Reveal in folder** can't open File Explorer: it shows and copies the path. Clips whose media item you removed can't be relinked. A file you put back while the project is open stays offline until you reopen the project.
- **Markers:** markers belong to the timeline; markers inside clips are not available. Markers and the in/out range don't show on the scrollbars.
- **Menus:** right-clicking empty space after the last clip of a track opens no menu.
- **Speed and edit points:** a speed applies to the whole clip, and sound at another speed always changes pitch. Playing a clip backward is not available.
- **Tracks:** track headers have room for names of about 9 characters; longer names are shortened. Groups are not marked on the timeline.
- **Keyframes:** keyframes animate position, scale, rotation, opacity and the volume of audio clips.
- **Text:** a text's handles don't snap. **Restore starter presets** brings back deleted starters, not the original look of a starter you changed. Text animations play in the preview, in **Export frame** and in exported videos.
- **Captions:** all cues share one style; a style for a single cue is not available. Captions can't be selected, moved or styled in the preview.
- **Transcription:** the cues can't be edited in the review; fix them in the **Captions** tab after adding them.
- **Heavy footage:** 4K 60 fps HEVC played from the original (in **Full** quality, or before its proxy is ready) can drop frames, and the original frame deep inside long phone clips takes a moment to appear after you stop.

## Related pages
- [Exporting your video](exporting-video.md)
- [Copying, pasting and duplicating clips](copy-and-paste.md)
- [Markers and in/out points](markers-and-in-out-points.md)
- [Clip thumbnails, waveforms and badges](clip-thumbnails-and-waveforms.md)
- [Tracks](tracks.md)
- [Linking and grouping clips](links-and-groups.md)
- [Audio](audio.md)
- [Editing audio](audio-editing.md)
- [Removing silence](removing-silence.md)
- [Trimming clips](trimming.md)
- [Splitting, deleting and closing gaps](splitting-and-deleting.md)
- [Advanced trimming](advanced-trimming.md)
- [Speed, freeze frames and punch zoom](speed-freeze-frames-and-punch-zoom.md)
- [Keyframes](keyframes.md)
- [Fades and transitions](fades-and-transitions.md)
- [Shapes and images](shapes-and-images.md)
- [Getting started](getting-started.md)
- [Projects and saving](projects-and-saving.md)
- [Project settings and templates](project-settings-and-templates.md)
- [Settings](settings.md)
- [Importing media](importing-media.md)
- [Organizing media](organizing-media.md)
- [Offline media and relinking](offline-media-and-relinking.md)
- [Proxies](proxies.md)
- [Adding media to the timeline](adding-media-to-the-timeline.md)
- [Preview and playback](preview-and-playback.md)
- [Arranging layers in the preview](arranging-layers-in-the-preview.md)
- [Snapping and smart guides in the preview](snapping-and-smart-guides.md)
- [Editing properties](editing-properties.md)
- [Cropping and reframing](cropping-and-reframing.md)
- [Titles and text](titles-and-text.md)
- [Text presets](text-presets.md)
- [Text animations](text-animations.md)
- [Captions](captions.md)
- [Transcription](transcription.md)
- [Command palette and custom shortcuts](command-palette-and-custom-shortcuts.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)

<sub>Last updated: Batch 44, 2026-10-18</sub>
