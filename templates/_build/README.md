# Building the templates

Work files go to `templates/_build/work/` (ignored by git); `TPL_WORK` and `TPL_REPO` override the work folder and the editor folder.

1. `python -I acquire.py . work/dl audio images ww2 stock`: downloads the outside media (Wikimedia Commons, NASA) into `work/dl/` and records their credits in `work/dl/credits.json`. Long films are cut straight from their URL with ffmpeg range reads.
2. `python -I synth_audio.py work/gen/audio`: the music beds (with `beats.json`) and the sound effects.
3. `python -I synth_video.py work/gen`: motion graphics, frame counters, stickers, overlays and the format test files.
4. `python -I make_tts.py . work/tts` (Windows): every narration line with the SAPI voices, plus word timings (`.json`) for the captions.
5. `python -I t1_montage.py work/out` ... `t6_torture.py work/out`: each writes `work/out/<template>/`, runs `normalize --write` and `validate` with `dist-cli/project-cli.mjs` and prints the result (a report lands in `work/out/<template>.report.json`).
6. `python -I package.py work <stage>`: copies the folders with their `CREDITS.md`, this folder, the README and `.gitignore` into `<stage>/templates/`.

`tplkit.py` is the project builder: media (probed with ffprobe), tracks, clips with the document rules checked as they are added (no overlaps, in/out within the media, transitions on abutting clips), keyframes, captions from TTS word timings, markers, text presets and the save step.
