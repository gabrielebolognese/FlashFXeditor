# Templates

Six ready-made projects that push the Shorts Editor to its limits. Each folder is a complete project (`project.json`, `media/`, `fonts/`, a `CREDITS.md`) written to the interop contract (`docs/INTEROP.md`, schema 4) and checked with the editor's own strict validator (`npm run cli -- validate templates/<name>`: 0 errors).

| Template | Format | Length | Clips | Tracks | Media | Fonts | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [`01-montage-marathon`](01-montage-marathon/) | Vertical 1080x1920, 30 fps | 18:25 | 3106 | 10 video, 6 audio, captions | 124 | 3 | 137 MB |
| [`02-kinetic-typography`](02-kinetic-typography/) | Vertical 1080x1920, 60 fps | 6:50 | 596 | 18 video, 5 audio, captions | 92 | 56 | 45 MB |
| [`03-ww2-documentary`](03-ww2-documentary/) | Landscape 1920x1080, 24 fps | 12:35 | 955 | 13 video, 6 audio, captions | 109 | 6 | 83 MB |
| [`04-overlay-stack`](04-overlay-stack/) | Square 1080x1080, 29.97 fps | 5:58 | 387 | 29 video, 8 audio | 142 | 2 | 135 MB |
| [`05-podcast-audio-lab`](05-podcast-audio-lab/) | 4:5 1080x1350, 25 fps | 9:58 | 672 | 9 video, 8 audio, captions | 61 | 3 | 27 MB |
| [`06-format-torture`](06-format-torture/) | 4K 3840x2160, 23.976 fps | 5:00 | 551 | 20 video, 8 audio, captions | 61 | 3 | 60 MB |

## Opening a template

- **Open project** on the start screen, then pick the template's folder (for example `templates/03-ww2-documentary`). The editor reads the media from the folder itself: nothing has to be copied or saved anywhere else.
- From Batch 56 on, the projects folder can be set to this `templates/` folder (start screen or Settings > General), and a template opens from the list or with `/?open=03-ww2-documentary`.
- Opening a template writes `cache/`, `history/` and `session.json` into its folder (ignored by `.gitignore`) and saves your edits into its `project.json`. To get a template back as it was: `git checkout -- templates/<name>/project.json`.
- Media analysis (thumbnails, waveforms) is marked pending, so the editor builds it on first open; the large templates take a moment the first time.

## What each template tests

### 01-montage-marathon: Clip-heavy montage

Over a thousand cuts on V1 cut to a 120 and 128 BPM beat grid, punch-in zooms, pans, tilts, flips, speed ramps up to 4x, slow motion, freeze hits, dissolves and dips to black and white, picture in picture, split screens and 2x2 grids in the drops, beat flashes, stickers, a numbered cut counter (one text clip per cut), voice-over with captions, looped music, linked natural sound.

Markers: Intro; Chapter 1: EARTH; EARTH drop; EARTH drop; Chapter 2: MOTION; MOTION drop; MOTION drop; Chapter 3: SKY; SKY drop; SKY drop; Chapter 4: CITY; CITY drop; CITY drop; Chapter 5: SPACE; SPACE drop; SPACE drop; ....

### 02-kinetic-typography: Text-heavy kinetic typography

42 narrated scenes and 8 interludes: all 12 text animations in and out, by char, word and line, with stagger and every ease, 54 library fonts, gradient fills, strokes, shadows, line and block boxes, cases, spacing, line height, alignment, anchors, fixed and auto boxes, a 600-word paragraph, keyframed transforms, a countdown synced to the voice, non-Latin scripts, word-timed captions cycling every highlight mode with per-cue style overrides, and six project text presets.

Markers: Start; Line 1: Every story begins with a sing; Interlude: font parade; Line 6: Words that fall from the sky.; Interlude: animation catalogue; Line 11: Bold.; Interlude: ease catalogue; Line 16: Type has a voice. Serif or san; Interlude: unit matrix; Line 21: Pull the lines so close togeth; Interlude: stroke and shadow lab; Interlude: box lab; Line 26: Word by word, the meaning arri; Interlude: paragraph stress; Line 31: Counting down. Ten. Nine. Eigh; Line 36: Upper case shouts. lower case ; ....

### 03-ww2-documentary: WW2 documentary

14 chapters of public domain archival film with text-to-speech narration and word-timed subtitles, title cards with typewriter dates and one key-click sound per letter, animated maps (zoom, pins, labels, drawn arrows), Ken Burns stills, lower thirds, letterbox, music ducked under the narration with gain keyframes, word-cued sound effects, vignette and film grain over the whole film, credits roll.

Markers: Opening titles; Chapter 1: Prologue; Chapter 2: Lightning War; Chapter 3: The Fall of France; Chapter 4: The Battle of Britain; Chapter 5: Operation Barbarossa; Chapter 6: Pearl Harbor; Chapter 7: Midway; Chapter 8: Stalingrad; Chapter 9: The Tide Turns; Chapter 10: D-Day; Chapter 11: Island by Island; Chapter 12: Victory in Europe; Chapter 13: The Last Act; Chapter 14: Epilogue; End credits.

### 04-overlay-stack: Overlay animation on many tracks

29 video tracks and 9 audio tracks: a 16-layer cake, a 4x4 wall of 16 playing videos with a keyframed zoom into one tile, orbiting shapes and equalizer bars with every ease, 30 animated GIF and WebP stickers, split screens and picture in picture, hidden, locked and muted tracks, a disabled clip, selection groups, and stand-ins (fallbackOf) for blend modes, masks, effects, an adjustment clip and a Lottie clip.

Expected: The stand-ins stay baked until the editor gains blend modes, masks, effects, adjustment clips and Lottie (Batches 72 to 79); then `Make editable` turns them into native clips.

Markers: 1. Layer cake; 2. Video wall 4x4 (16 decodes); 3. Shape ballet (every ease); 4. Sticker storm (animated GIF and WebP); 5. Split screens and PIP; 6. Hidden, locked, muted, disabled; 7. Stand-ins for later features; 8. Finale: everything at once.

### 05-podcast-audio-lab: Podcast and audio editing

Two voices recorded on separate tracks in WAV, M4A, MP3 and Opus; a raw take with the gaps left in, the tightened edit with a lo-fi bed ducked by gain keyframes around every line, jingles and stingers, room tone, speeds 0.5x to 2x, gains -60 to +12 dB, a sentence razor-cut into one clip per word, gain automation with every ease, a stack of overlapping sounds, a muted archive track, and an audiogram with avatars, level bars keyed to the word timings and karaoke captions.

Markers: Intro; Part 1: raw take (gaps left in); Part 2: tightened edit; Ad break; Part 3: speed and level lab; Word-level razor cuts; Gain automation, every ease; Sound stack; Outro.

### 06-format-torture: Formats and edge cases

H.264 4K60 and 8K, HEVC, AV1, VP9 with Opus, VP8, VP9 with alpha, rotated, MOV, ProRes, M4V, High 10, odd and tiny sizes, ultra wide, VFR, all-intra and long-GOP files; ten frame counters at 12 to 120 fps side by side; speeds 0.25x to 4x and freeze frames; 16-bit, alpha, 1x1, 8192x8192, CMYK, EXIF-rotated, WebP, GIF and SVG images; eight audio formats from 8-bit 8 kHz to 24-bit 96 kHz and 5.1; one-frame clips, every ease, extreme transforms, keys outside the clip, every label and marker color, link groups, every transition kind, stand-ins (one of an unknown kind), 300 short captions and Unicode text.

Expected: Some media are meant to fail: ProRes cannot be decoded in a browser, HEVC and the 8K H.264 file depend on the GPU decoder, VP9 alpha draws opaque, and the CLI cannot read the headers of the raw `.aac` file and the VP9 alpha file (the app repairs them on open).

Markers: A. Video containers and codecs; B. Frame rates side by side; C. Speed 0.25x to 4x, freeze frames; D. Image formats; E. Audio formats and levels; F. Edge clips; G. Stand-ins (fallbackOf); End of the cue storm; Last marker.

## Media and licenses

- Archival WW2 film, maps and photos: public domain works (US National Archives, US Army and Navy films, the Why We Fight series and others) and a few CC BY-SA maps, from Wikimedia Commons.
- Stock video and photos: NASA (public domain) and Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA).
- Sounds and music: Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA), Beethoven and Strauss recordings in the public domain, CC0 tracks by Loyalty Freak Music.
- Original: all synthesized music beds and sound effects, the motion graphics, frame counters, stickers, overlays and test patterns, and the voices (Windows text-to-speech, Microsoft David and Zira).
- Each template's `CREDITS.md` lists every outside file with its source page, license and author.

## Rebuilding

`_build/` holds the scripts that made the templates (Python 3 with numpy and Pillow, ffmpeg, and Windows for the voices); see `_build/README.md`. They download the outside media again, synthesize the rest, write each `project.json` with `tplkit.py`, then run the editor's CLI: `normalize --write` (media headers, fonts) and `validate`.

Note: `normalize` (Batch 55) merges a gradient `fill` (`{from, to}`) field by field into the default color fill and so produces an invalid file; `tplkit.py` parks gradient fills during `normalize` and puts them back before `validate`.
