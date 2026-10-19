# Backlog after v1.1.0

Work that v1.1.0 leaves out, with what is needed to pick it up. Batch 50 resolved every
`TODO(batch NN)` comment in `src/` for v1.0.0; Batches 51-53 (spec §20: the font library, the preset bar,
caption styles per cue) are built for v1.1.0, the hooks Batch 50 listed for them are resolved, and `src/`
has no `TODO(batch NN)` comment. The known issues users can meet are in `docs/PROGRESS.md` (Known issues).

## Left out of caption styles per cue (Batch 53)

- **Rich text inside a cue** (spec §10.1, §20.3): one cue has one style; several fonts or colors within a
  cue (apart from the word highlight) would need runs in `CaptionClip.text` and in the text layout
  (`src/render/text/`).
- **Glyph bounds and baselines as snap targets** (Batches 23, 28, 46): text boxes and captions snap by
  their box (a caption's drag snaps its box's edges and center to the frame, the safe zones and the
  other layers).

## Engineering items (moved out of Batch 50)

1. **Long non-MP4 audio in segments.** MP3, AAC, WAV and Ogg files, and WebM files whose sound is not
   Opus (Vorbis, laced blocks), decode whole through `decodeAudioData`, about 0.4 MB per second of stereo.
   Files over 45 minutes are refused at import with the reason (`MAX_WHOLE_AUDIO_SECONDS` in
   `src/media/probe/audioProbe.ts`; for WebM in `webmProbeResult`, `src/media/demux/webm.ts`, since
   Batch 50). To lift it: decode WAV by byte ranges, MP3 and AAC by frames, Ogg by pages, into the
   segments `src/audio/decode/DecodedAudio.ts` already uses for MP4 audio, with segmented peaks.
2. **A second decode session per media for same-media transitions at Full quality** (Batch 45). One
   session serves both sides of a dissolve between two parts of one media, each frame a seek: a 4K60 HEVC
   dissolve drops 58-90% of its frames when the preview is forced to Full (Auto plays the proxy: 1-3 of
   230). Needs a session key with a slot through `src/media/workers/protocol.ts`, `DecodeSessions`, the
   `FrameService` lanes and the playback windows.
3. **Scrub refinement wait** (Batch 45). A scrub that moves again within about 150 ms of a full-quality
   frame landing waits 105-180 ms for its exact proxy frame in about 30% of moves (else 3-35 ms; the
   nearest cached frame shows at once). Thumbnail jobs and the other sessions' frame windows are ruled
   out. Next step: a GPU-process trace of the two hardware decode sessions (4K HEVC full, H.264 proxy).
4. **Proxy speed** (Batch 45). 4K60 HEVC proxies are made at 0.56-0.6x real time on the development
   machine with nothing else decoding (Batch 24 measured about 1x on a 10 s source). Profile the halving
   scaler and the hardware encoder in `src/media/proxy/`.
5. **Remove silence on several targets** (Batch 47). Each track closes its own gaps
   (`closeSilences` in `src/timeline/edit/silence.ts`), so the silence of a lone target before another
   link group on one of its tracks moves that group out of sync. Options: sync-locked closing, or
   limiting the closing on the other tracks of a group.
6. **Offline freeze frames on frame rate round trips** (Batch 47). A freeze's `out` is one frame after
   its held time, clamped to the media's end; with the media offline the end is unknown, so 30 -> 60 -> 30
   fps can give it another `out`. It shows `in` alone, so the picture does not change
   (`fitSource` in `src/core/document/fpsConvert.ts`).
7. **Main chunk size.** The main JS chunk is about 1.3 MB (413 kB gzip). P12 is met about ten times over
   (Batch 45), and `build.chunkSizeWarningLimit` (1600 kB, `vite.config.ts`) is the budget. Settings, the
   command palette and the project dialogs could load on first use if startup ever needs it.
8. **mp4-muxer is deprecated upstream.** `npm ci` warns that mp4-muxer 5.2.2 is superseded by Mediabunny.
   It works and is pinned by the lockfile; moving the export muxer (`src/export/`, the proxy writer in
   `src/media/proxy/`) to Mediabunny would be a new dependency with a line in `docs/PROGRESS.md`.
9. **WASM threads for transcription.** Cross-origin isolation (COOP/COEP headers) would let ONNX Runtime
   use WebAssembly threads where WebGPU is not used. It is a hosting choice: the headers would also
   require CORP on the model downloads (README, Production build and hosting).

## Checks that need other hardware

From the pending manual checks of Batches 10, 45 and 46 (steps in their `docs/PROGRESS.md` entries):
- audio/video alignment on a real display (a slow-motion phone video of a clap test; headless runs
  measured video 0-17.5 ms after the audio, display latency not included);
- P12 startup on a mid-range machine with `npm run build` + `npm run preview`;
- the SVG cursors (trim, roll, slip, slide, stretch, razor, rotate) on macOS and at device pixel ratio 2;
- the text caret and the IME candidate window during inline text editing.
