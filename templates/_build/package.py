"""Stages templates/ for the repo: the six project folders, a CREDITS.md each, README.md, .gitignore and _build/.

Usage: python -I package.py <work dir> <stage dir>
"""
import json
import os
import re
import shutil
import sys

WORK, STAGE = sys.argv[1], sys.argv[2]
OUT = os.path.join(WORK, "out")
LIB = os.path.join(WORK, "lib")
credits = json.load(open(os.path.join(WORK, "dl", "credits.json"), encoding="utf-8"))
by_stem = {}
for key, rec in credits.items():
    by_stem.setdefault(os.path.splitext(os.path.basename(key))[0].lower(), rec)

ABOUT = {
    "01-montage-marathon": ("Clip-heavy montage", "Vertical 1080x1920, 30 fps",
                            "Over a thousand cuts on V1 cut to a 120 and 128 BPM beat grid, punch-in zooms, pans, tilts, flips, speed ramps up to 4x, "
                            "slow motion, freeze hits, dissolves and dips to black and white, picture in picture, split screens and 2x2 grids in the drops, "
                            "beat flashes, stickers, a numbered cut counter (one text clip per cut), voice-over with captions, looped music, linked natural sound."),
    "02-kinetic-typography": ("Text-heavy kinetic typography", "Vertical 1080x1920, 60 fps",
                              "42 narrated scenes and 8 interludes: all 12 text animations in and out, by char, word and line, with stagger and every ease, "
                              "54 library fonts, gradient fills, strokes, shadows, line and block boxes, cases, spacing, line height, alignment, anchors, "
                              "fixed and auto boxes, a 600-word paragraph, keyframed transforms, a countdown synced to the voice, non-Latin scripts, "
                              "word-timed captions cycling every highlight mode with per-cue style overrides, and six project text presets."),
    "03-ww2-documentary": ("WW2 documentary", "Landscape 1920x1080, 24 fps",
                           "14 chapters of public domain archival film with text-to-speech narration and word-timed subtitles, title cards with typewriter dates "
                           "and one key-click sound per letter, animated maps (zoom, pins, labels, drawn arrows), Ken Burns stills, lower thirds, letterbox, "
                           "music ducked under the narration with gain keyframes, word-cued sound effects, vignette and film grain over the whole film, credits roll."),
    "04-overlay-stack": ("Overlay animation on many tracks", "Square 1080x1080, 29.97 fps",
                         "29 video tracks and 9 audio tracks: a 16-layer cake, a 4x4 wall of 16 playing videos with a keyframed zoom into one tile, "
                         "orbiting shapes and equalizer bars with every ease, 30 animated GIF and WebP stickers, split screens and picture in picture, "
                         "hidden, locked and muted tracks, a disabled clip, selection groups, and stand-ins (fallbackOf) for blend modes, masks, effects, "
                         "an adjustment clip and a Lottie clip."),
    "05-podcast-audio-lab": ("Podcast and audio editing", "4:5 1080x1350, 25 fps",
                             "Two voices recorded on separate tracks in WAV, M4A, MP3 and Opus; a raw take with the gaps left in, the tightened edit with a "
                             "lo-fi bed ducked by gain keyframes around every line, jingles and stingers, room tone, speeds 0.5x to 2x, gains -60 to +12 dB, "
                             "a sentence razor-cut into one clip per word, gain automation with every ease, a stack of overlapping sounds, a muted archive track, "
                             "and an audiogram with avatars, level bars keyed to the word timings and karaoke captions."),
    "06-format-torture": ("Formats and edge cases", "4K 3840x2160, 23.976 fps",
                          "H.264 4K60 and 8K, HEVC, AV1, VP9 with Opus, VP8, VP9 with alpha, rotated, MOV, ProRes, M4V, High 10, odd and tiny sizes, "
                          "ultra wide, VFR, all-intra and long-GOP files; ten frame counters at 12 to 120 fps side by side; speeds 0.25x to 4x and freeze frames; "
                          "16-bit, alpha, 1x1, 8192x8192, CMYK, EXIF-rotated, WebP, GIF and SVG images; eight audio formats from 8-bit 8 kHz to 24-bit 96 kHz "
                          "and 5.1; one-frame clips, every ease, extreme transforms, keys outside the clip, every label and marker color, link groups, "
                          "every transition kind, stand-ins (one of an unknown kind), 300 short captions and Unicode text."),
}
EXPECT = {
    "06-format-torture": "Some media are meant to fail: ProRes cannot be decoded in a browser, HEVC and the 8K H.264 file depend on the GPU decoder, "
                         "VP9 alpha draws opaque, and the CLI cannot read the headers of the raw `.aac` file and the VP9 alpha file (the app repairs them on open).",
    "04-overlay-stack": "The stand-ins stay baked until the editor gains blend modes, masks, effects, adjustment clips and Lottie (Batches 72 to 79); "
                        "then `Make editable` turns them into native clips.",
}


def fmt_dur(frames, fps):
    s = frames * fps["den"] / fps["num"]
    return f"{int(s // 60)}:{int(s % 60):02d}"


def credit_for(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    stem = re.sub(r" \(\d+\)$", "", stem)
    for prefix in ("doc-", "pod-", "ov-", "mon-", "kin-"):
        if stem.startswith(prefix):
            stem = stem[len(prefix):]
    return by_stem.get(stem)


rows = []
if os.path.exists(os.path.join(STAGE, "templates")):
    shutil.rmtree(os.path.join(STAGE, "templates"))
os.makedirs(os.path.join(STAGE, "templates"))
for slug in sorted(ABOUT):
    src = os.path.join(OUT, slug)
    dst = os.path.join(STAGE, "templates", slug)
    shutil.copytree(src, dst)
    doc = json.load(open(os.path.join(src, "project.json"), encoding="utf-8"))
    length = max(c["start"] + c["duration"] for c in doc["clips"].values())
    kinds = {}
    for t in doc["tracks"]:
        kinds[t["kind"]] = kinds.get(t["kind"], 0) + 1
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(src) for f in fs)
    fonts = len({f["family"] for f in json.load(open(os.path.join(src, "fonts", "fonts.json"), encoding="utf-8"))["faces"]}) if os.path.exists(os.path.join(src, "fonts", "fonts.json")) else 0
    rows.append((slug, doc, length, kinds, size, fonts))
    # CREDITS.md
    lines = [f"# Credits: {doc['name']}", "", "Media from outside sources, with their licenses. Everything else in `media/` was made for these templates "
             "(synthesized music and sounds, generated motion graphics, stickers and overlays, text-to-speech voices) and is free to use.", "",
             "| File | Source | Title | License | Author |", "| --- | --- | --- | --- | --- |"]
    n = 0
    for m in sorted(doc["media"].values(), key=lambda m: m["file"]["relPath"]):
        rec = credit_for(m["file"]["relPath"])
        if not rec:
            continue
        n += 1
        title = (rec.get("title") or "").replace("|", "/")
        page = rec.get("page") or ""
        author = re.sub(r"\s+", " ", (rec.get("author") or "").replace("|", "/"))[:80]
        lines.append(f"| `{os.path.basename(m['file']['relPath'])}` | {rec.get('source', '')} | [{title}]({page}) | {rec.get('license', '')} | {author} |")
    if n == 0:
        lines.append("| (none: every file is original) | | | | |")
    lines += ["", "Fonts in `fonts/` are copies of the editor's font library (`public/fonts/library/`, open font licenses listed in its `LICENSES` file).", ""]
    open(os.path.join(dst, "CREDITS.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines))

# .gitignore: what the editor writes into a project folder when it opens one
open(os.path.join(STAGE, "templates", ".gitignore"), "w", encoding="utf-8", newline="\n").write(
    "# Written by the editor when a template is opened: never commit them.\n*/cache/\n*/history/\n*/exports/\n*/session.json\n*/project.json.tmp\n"
    "# Build inputs (downloads, generated media, voices) of _build/.\n_build/work/\n_build/__pycache__/\n")

# README.md
table = ["| Template | Format | Length | Clips | Tracks | Media | Fonts | Size |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
for slug, doc, length, kinds, size, fonts in rows:
    tr = f"{kinds.get('video', 0)} video, {kinds.get('audio', 0)} audio" + (", captions" if kinds.get("caption") else "")
    table.append(f"| [`{slug}`]({slug}/) | {ABOUT[slug][1]} | {fmt_dur(length, doc['settings']['fps'])} | {len(doc['clips'])} | {tr} | {len(doc['media'])} | {fonts} | {size / 1e6:.0f} MB |")
sections = []
for slug, doc, length, kinds, size, fonts in rows:
    title, fmt, text = ABOUT[slug]
    sections += [f"### {slug}: {title}", "", text, ""]
    if slug in EXPECT:
        sections += [f"Expected: {EXPECT[slug]}", ""]
    markers = [m["label"] for m in doc["markers"]][:16]
    if markers:
        sections += ["Markers: " + "; ".join(markers) + ("; ..." if len(doc["markers"]) > 16 else "") + ".", ""]
readme = f"""# Templates

Six ready-made projects that push the Shorts Editor to its limits. Each folder is a complete project (`project.json`, `media/`, `fonts/`, a `CREDITS.md`) written to the interop contract (`docs/INTEROP.md`, schema 4) and checked with the editor's own strict validator (`npm run cli -- validate templates/<name>`: 0 errors).

{chr(10).join(table)}

## Opening a template

- **Open project** on the start screen, then pick the template's folder (for example `templates/03-ww2-documentary`). The editor reads the media from the folder itself: nothing has to be copied or saved anywhere else.
- From Batch 56 on, the projects folder can be set to this `templates/` folder (start screen or Settings > General), and a template opens from the list or with `/?open=03-ww2-documentary`.
- Opening a template writes `cache/`, `history/` and `session.json` into its folder (ignored by `.gitignore`) and saves your edits into its `project.json`. To get a template back as it was: `git checkout -- templates/<name>/project.json`.
- Media analysis (thumbnails, waveforms) is marked pending, so the editor builds it on first open; the large templates take a moment the first time.

## What each template tests

{chr(10).join(sections)}
## Media and licenses

- Archival WW2 film, maps and photos: public domain works (US National Archives, US Army and Navy films, the Why We Fight series and others) and a few CC BY-SA maps, from Wikimedia Commons.
- Stock video and photos: NASA (public domain) and Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA).
- Sounds and music: Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA), Beethoven and Strauss recordings in the public domain, CC0 tracks by Loyalty Freak Music.
- Original: all synthesized music beds and sound effects, the motion graphics, frame counters, stickers, overlays and test patterns, and the voices (Windows text-to-speech, Microsoft David and Zira).
- Each template's `CREDITS.md` lists every outside file with its source page, license and author.

## Rebuilding

`_build/` holds the scripts that made the templates (Python 3 with numpy and Pillow, ffmpeg, and Windows for the voices); see `_build/README.md`. They download the outside media again, synthesize the rest, write each `project.json` with `tplkit.py`, then run the editor's CLI: `normalize --write` (media headers, fonts) and `validate`.

Note: `normalize` (Batch 55) merges a gradient `fill` (`{{from, to}}`) field by field into the default color fill and so produces an invalid file; `tplkit.py` parks gradient fills during `normalize` and puts them back before `validate`.
"""
open(os.path.join(STAGE, "templates", "README.md"), "w", encoding="utf-8", newline="\n").write(readme)

# _build/
bd = os.path.join(STAGE, "templates", "_build")
os.makedirs(bd)
for name in ("tplkit.py", "scripts.py", "fetch.py", "acquire.py", "synth_audio.py", "synth_video.py", "make_tts.py", "tts.ps1",
             "t1_montage.py", "t2_kinetic.py", "t3_documentary.py", "t4_overlay.py", "t5_podcast.py", "t6_torture.py", "package.py"):
    shutil.copyfile(os.path.join(LIB, name), os.path.join(bd, name))
open(os.path.join(bd, "README.md"), "w", encoding="utf-8", newline="\n").write("""# Building the templates

Work files go to `templates/_build/work/` (ignored by git); `TPL_WORK` and `TPL_REPO` override the work folder and the editor folder.

1. `python -I acquire.py . work/dl audio images ww2 stock`: downloads the outside media (Wikimedia Commons, NASA) into `work/dl/` and records their credits in `work/dl/credits.json`. Long films are cut straight from their URL with ffmpeg range reads.
2. `python -I synth_audio.py work/gen/audio`: the music beds (with `beats.json`) and the sound effects.
3. `python -I synth_video.py work/gen`: motion graphics, frame counters, stickers, overlays and the format test files.
4. `python -I make_tts.py . work/tts` (Windows): every narration line with the SAPI voices, plus word timings (`.json`) for the captions.
5. `python -I t1_montage.py work/out` ... `t6_torture.py work/out`: each writes `work/out/<template>/`, runs `normalize --write` and `validate` with `dist-cli/project-cli.mjs` and prints the result (a report lands in `work/out/<template>.report.json`).
6. `python -I package.py work <stage>`: copies the folders with their `CREDITS.md`, this folder, the README and `.gitignore` into `<stage>/templates/`.

`tplkit.py` is the project builder: media (probed with ffprobe), tracks, clips with the document rules checked as they are added (no overlaps, in/out within the media, transitions on abutting clips), keyframes, captions from TTS word timings, markers, text presets and the save step.
""")
print("staged", len(rows), "templates")
for slug, doc, length, kinds, size, fonts in rows:
    print(f"  {slug}: {fmt_dur(length, doc['settings']['fps'])}, {len(doc['clips'])} clips, {len(doc['media'])} media, {size / 1e6:.0f} MB")
