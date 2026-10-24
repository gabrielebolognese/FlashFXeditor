# Shorts Editor: Implementation Batches

This file is the ordered build plan. One batch at a time, driven by the `/next-batch` command (see `docs/NEXT_BATCH_SETUP.md`). Every batch references sections of `docs/EDITOR_SPEC.md` (written as `§n.n`) and every UI decision defers to `DESIGN_SYSTEMS.md`.

## Batch rules (apply to every batch)

1. **Read first**: this batch's section, the `Spec refs` it lists (only those sections, fully), `DESIGN_SYSTEMS.md`, and `docs/PROGRESS.md` (deviations and follow-ups from earlier batches may change what you do).
2. **Scope**: build the `Build` list completely. Do not build anything from `Do not build yet`. If a later feature needs a hook now, add the interface or a `// TODO(batch NN)` comment, never a half-implementation.
3. **Architecture is binding**: Spec §3 (stack, state model, scheduler, workers, keyboard scopes, theme bridge) and §4 (performance rules P1..P14) apply from Batch 01 onward. Any deviation is written in `docs/PROGRESS.md` under the batch with the reason.
4. **Design system**: every color, font, size, radius, spacing, shadow and control dimension comes from `DESIGN_SYSTEMS.md` through CSS custom properties and the `Theme` bridge. No literals. If the design system is silent, use the functional defaults in the spec and log the gap in `PROGRESS.md` under `Design system gaps`.
5. **Definition of done**: all `Acceptance` items verified (by running the app and, for engine code, by Vitest tests), `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass, `docs/PROGRESS.md` updated (status, date, notes, deviations, follow-ups, design gaps), one commit `batch-NN: <title>`.
6. **Tests**: everything under `src/core`, `src/timeline/model`, `src/timeline/edit`, `src/timeline/snap`, `src/text` (model/parsers), `src/project` (serialization) gets unit tests in the batch that creates it. UI and GPU code gets manual acceptance checks only.
7. **No regressions**: re-run the acceptance checklist of the two previous batches at the end of each batch (quick manual pass). Playback at 60 fps with zero React commits (P1) is re-verified every 5 batches (05, 10, 15, ...).
8. **Keep it small**: no new dependency without a line in `PROGRESS.md` saying why. No abstractions for hypothetical future needs. Prefer a 30-line function over a configurable system.
9. **Ask, then build**: when the batch is loaded, present the plan and wait for `Go`. If an acceptance item is impossible as written, say so in the plan and propose the closest achievable version; do not silently drop it.

Phases: A Foundations (01-06), B Timeline and playback (07-20), C Canvas editing (21-24), D Properties and clip operations (25-27), E Text (28-33), F Graphics, keyframes, transitions, audio (34-38), G Workflow (39-44), H Quality and release (45-50), I Extensions after v1 (51-53: font library, preset bar, caption styles per cue). Batches 33, 48 and 49 are optional and can be skipped with a note.

---

## Batch 01: Scaffold, layout shell with placeholders, foundations

**Goal:** A running app with the exact four-panel layout from the reference mockup as placeholders, the design system wired, and the core infrastructure skeletons (scheduler, keyboard dispatcher, theme bridge, store shape) in place so later batches only fill them.

**Spec refs:** §0, §1, §2 (all), §3.1, §3.2, §3.4, §3.6, §3.7, §4.

**Build:**
- Vite + React 18 + TypeScript strict project; scripts `dev`, `build`, `typecheck`, `lint`, `test` (Vitest), `check` (all of them). ESLint with the color-literal rule from §3.7. Folder structure exactly as §3.2 (empty index files with a one-line comment are fine).
- `DESIGN_SYSTEMS.md` wiring: a `src/styles/tokens.css` generated or transcribed from it (all tokens as CSS custom properties on `:root`, theme attribute as the doc prescribes), base styles (reset, UI font, body background), and `core/theme/theme.ts` reading the tokens into a typed `Theme` object with a change observer.
- Layout shell: app bar (project name placeholder, save dot, undo/redo buttons disabled, settings, Export button disabled), the four panels in the mockup arrangement with headers, the three splitters (drag, min sizes, persisted to localStorage for now), `ResizeObserver` plumbing that reports panel sizes to a `LayoutStore`.
- Placeholders: each panel body shows its name and the tabs it will have (Media | Presets | Captions; Properties; Preview; Timeline toolbar strip with disabled buttons for every group in §6.1 so the final density is visible from day one).
- `FrameScheduler` with invalidation flags and `IdleQueue`; `KeyDispatcher` with focus scopes and a `keymap.ts` containing the full table from §18 as data (actions wired to `console.debug` stubs); `ui/` primitives: `IconButton` (with tooltip showing the shortcut from the keymap), `Toggle`, `Select`, `Tooltip`, `ContextMenu` shell, `NumberField` (static version, scrubbing comes in Batch 25).
- Unsupported-browser screen (§1.4) checking WebGPU, WebCodecs, FSA.

**Do not build yet:** any document model, media handling, canvases with real content, project files.

**Implementation notes:** Panel bodies are plain divs now, but the timeline and preview panels must already mount a `<div class="canvas-host">` sized by the layout store so the canvas views in later batches drop in without layout changes. The toolbar strip must be built as the real component with real groups and dividers, buttons disabled.

**Acceptance:**
- [ ] `npm run check` passes; `npm run dev` opens the shell at 1920x1080 and at 1600x900 without overflow.
- [ ] Layout matches §2: left group 68% / preview 32%, top row 50% / timeline 50%, media 49% / properties 51%; splitters respect min sizes; positions survive reload.
- [ ] Tokens from `DESIGN_SYSTEMS.md` are the only colors in the codebase (`npm run lint` fails on a hex literal added to a `.ts` file as a test, then remove it).
- [ ] `Theme` object logs correct values and updates when the theme attribute changes.
- [ ] Pressing any shortcut from §18 logs its action id with the correct scope resolution (typing in an input never triggers one).
- [ ] Timeline toolbar shows every group from §6.1 (disabled), buttons at the DS small size with tooltips.

**State after:** an empty, correctly laid out editor with no behavior.

---

## Batch 02: Document model, time math, commands and undo

**Goal:** The persistent data model with validation, exact time math, the command system with Immer patches, undo/redo, transactions, coalescing, and the stores with narrow subscriptions.

**Spec refs:** §3.3, §3.4, §5 (all), §6.19 (as test inspiration).

**Build:**
- `core/document/types.ts` exactly as §5.2 plus `schemaVersion = 1`; `core/document/time.ts` (Rational, `frameToUs`, `usToFrame`, timecode formatting/parsing including `+30`, `-15`, `+2.` relative forms); `core/document/validate.ts` implementing every invariant of §5.2 (dev-only after each command, with a clear error naming the clip/track).
- `core/commands`: `Command` type (`id`, `label`, `coalesceKey?`, `affects`, `run(draft, ctx)`), `produceWithPatches` execution, `UndoStack` (patches + inverse patches + selection snapshot restore), `transaction(label, fn)`, coalescing window 300 ms by key, `canUndo/canRedo`, history labels.
- `core/store`: `DocumentStore` (`getState`, `dispatch`, `subscribe(listener, { affects? })`), `SessionStore` (§5.3 shape, selection channel), `useStoreSelector` hook over `useSyncExternalStore` with `Object.is` bail-out.
- Timeline model queries (`timeline/model`): clips at frame per track (binary search), neighbors, gaps, edit points, content end, per-track max duration maintenance.
- Basic commands needed by later batches: add/remove track, add/remove/update clip (raw), set playhead (session), set selection (session). Wire Undo/Redo buttons and `Mod+Z` / `Mod+Shift+Z` / `Mod+Y`.
- Tests: time math (29.97 round trips, 10 minute drift = 0), undo/redo of 1,000 random raw operations keeps invariants, coalescing, transaction atomicity, model queries.

**Do not build yet:** editing semantics (move/trim/ripple), serialization to disk (Batch 03), any rendering of the document.

**Implementation notes:** Keep `Project` plain JSON-serializable (no classes, no Maps, no Sets). Session selection uses `Set` in memory but serializes to arrays. Commands must never read from the session store inside `run`; pass what they need through `ctx`.

**Acceptance:**
- [ ] Tests green, including a 1,000-operation undo/redo fuzz that ends with the original document (deep equal).
- [ ] `frameToUs/usToFrame` at 30000/1001 round-trip exactly for 1 hour of frames.
- [ ] Dispatching 10,000 trivial commands takes under 300 ms (measure in a test).
- [ ] A subscriber with `affects: ['markers']` is not called for a clip update.

**State after:** the engine's brain exists without a face.

---

## Batch 03: Project folder, persistence, start screen

**Goal:** Projects live in a folder the user picks; autosave, history, session persistence, recent projects, permissions and crash recovery work end to end with the real document.

**Spec refs:** §9.7, §15 (all), §5.3, §2.1 (app bar save dot).

**Build:**
- `project/` module: `openProjectFolder()`, `createProject(dirHandle, name, settings)`, folder layout creation (§9.7), `ProjectFile` save/load with schema version and a migration hook, `SessionFile`, `Autosaver` (debounce 1 s, max 5 s, tmp write then real write, history rotation 20), `RecentProjects` (IndexedDB via `idb-keyval`: handle, name, path hint, modified, thumbnail placeholder), permission query/request flow, read-only banner, `.tmp` recovery offer.
- Start screen (React, replaces the shell when no project is open): New project (folder picker, name, resolution presets 9:16 / 4:5 / 1:1 / 16:9, fps), Open project, Recent list with remove, drag a folder to open.
- App bar: real project name (inline rename updates `project.json` name and the recent entry), save status dot states with hover details and click-to-retry, `Mod+S` forces a save, `Mod+N` / `Mod+O`.
- Properties panel: the `Project` section (§11) as the first real content of the panel (name, resolution, fps, background color field placeholder as a text hex field for now, autosave interval).
- Tests: serialization round trip, migration hook, history rotation logic (mock FSA with an in-memory handle implementation used by all project tests).

**Do not build yet:** media copying (Batch 04), templates, resolution/fps conversion dialogs (Batch 42).

**Implementation notes:** Wrap FSA behind `project/fs.ts` with a tiny interface so tests use the in-memory implementation. Never hold a writable stream open between saves. Save failures must never throw into React; they set the status and log.

**Acceptance:**
- [ ] Create a project in a folder; `project.json`, `session.json`, `cache/`, `history/`, `media/`, `exports/`, `presets/text/` exist.
- [ ] Rename the project, wait 1 s: file updated; close the tab, reopen the app: project appears in Recent, opens after a permission prompt, name intact.
- [ ] Kill the tab mid-edit (simulate by throttling and reloading): on open the app offers the newer `.tmp` if it exists.
- [ ] Twenty consecutive saves leave exactly 20 files in `history/`.
- [ ] Deny permission on open: read-only banner, no writes attempted.

**State after:** projects are real folders; the editor can be opened and reopened safely.

---

## Batch 04: Media import, probe, media panel basics, worker infrastructure

**Goal:** Import video/audio/image files into the project (copy mode), probe them in a worker, show them in the Media panel, with the worker protocol and byte access that all media work will use.

**Spec refs:** §3.5, §9.1, §9.2 (ByteSource and probe only), §9.7, §12 (grid, import, basic list, delete, rename), §5.2 `MediaItem`.

**Build:**
- `media/workers/protocol.ts` (typed requests/responses, ids, priorities, cancellation) and `WorkerPool` (one `decode.worker` for now, lazily created).
- `ByteSource` over `File` with range reads and the 64 MB LRU; `mp4box` probe in the worker: codec strings, description bytes, dimensions, rotation from `tkhd`, duration, fps as Rational from sample deltas, audio codec/channels/rate. Images via `createImageBitmap`/`ImageDecoder` (dimensions, animated frame list). Audio-only files via `decodeAudioData` on the main thread for duration only.
- Import flow: Import button (`showOpenFilePicker`, multiple), drop onto the Media panel, paste images; copy into `media/` with unique names; create `MediaItem`s in one transaction; refusal toast for unsupported types; progress toast for large copies.
- Media tab: grid with cards (static first-frame thumbnail captured by decoding one frame in the worker and sending an `ImageBitmap`), duration badge, kind icon, name with F2/double-click rename; multi-select; `Delete` with the "Remove from project" dialog (no clips exist yet, keep the second option disabled); list view with columns; sort.
- `IdleQueue` consumer that marks `analysis` pending (no analysis yet).

**Do not build yet:** sample index persistence, frame decoding beyond one poster frame, thumbnails sheets, peaks, proxies, bins, hover scrub, drag to timeline.

**Implementation notes:** Probe must handle `.mov` from iPhone (HEVC, rotation 90) and Android `.mp4` (H.264, variable fps); store fps as the dominant delta's rational. Reference mode (handles in IndexedDB) can be stubbed behind the setting but not implemented.

**Acceptance:**
- [ ] Import an iPhone HEVC .mov, an Android H.264 .mp4, a .png, a .mp3: all appear with correct duration, dimensions, rotation and fps; files copied to `media/`.
- [ ] Importing 10 files of 500 MB total does not freeze the UI (main thread never blocks more than 50 ms, measured with the Performance panel).
- [ ] Unsupported file shows a toast naming the file and nothing is created.
- [ ] Reload: media items persist with their poster thumbnails (regenerated if missing from cache).

**State after:** a project can hold media; nothing can be played yet.

---

## Batch 05: WebGPU renderer foundation

**Goal:** The GPU renderer that every later visual depends on: device, pipelines, texture pool, draw-list rendering to a canvas and to an offscreen target, with a visible test (an imported image drawn in the preview with a transform).

**Spec refs:** §3.1 (Renderer interface), §4 P3 P5 P6 P13, §9.3, §9.4 (`DrawList` and `Renderer.draw` only), §7.1 (viewport basics: fit letterbox, background).

**Build:**
- `render/gpu`: device acquisition with error handling and device-lost recovery (re-create and re-upload), `Renderer` interface (`draw(drawList, target)`, `createTexture`, `uploadVideoFrame`, `uploadImageBitmap`, `resize`), WGSL pipeline for textured quads with per-layer uniforms (matrix, opacity, crop UV rect, flip), premultiplied alpha blending, a second pipeline for two-texture dissolve (used from Batch 36), a solid-color pipeline.
- `TexturePool`: budgeted LRU keyed by `(mediaId, lod, timeUs)` plus static image textures with mipmaps; explicit destroy; pinning API.
- Preview canvas host: a WebGPU `<canvas>` in the preview panel at DPR, resized by the layout store, drawn through the scheduler only; viewport `Fit` math (project frame letterboxed) and the frame border/background from the DS.
- Test harness: selecting an image in the Media panel draws it fitted into a 1080x1920 frame (temporary behavior, removed in Batch 08).
- Offscreen render target support (render to a texture of arbitrary size and read it back as an `ImageBitmap`) with a dev button that exports the current preview as PNG (keeps working later as `Export frame`).

**Do not build yet:** compositor evaluation of the document, video frames, text, gizmo.

**Implementation notes:** All matrices are 3x3 affine in project pixel space, converted to clip space in the shader through a viewport uniform; keep one uniform buffer with dynamic offsets per layer (no per-layer bind group creation per frame). Use `copyExternalImageToTexture` for both `ImageBitmap` and `VideoFrame` sources.

**Acceptance:**
- [ ] An imported 4000x3000 image renders fitted in the preview without aliasing (mipmaps) at Fit and crisp at 100% (temporary zoom via a dev dropdown).
- [ ] Resizing the panel re-renders only on resize (scheduler counter shows one render per resize event).
- [ ] Device loss (simulate with `device.destroy()` in the console) recovers automatically within 1 s.
- [ ] Texture pool evicts correctly under a 64 MB test budget (dev stats overlay shows count and bytes).

**State after:** the GPU can draw images where the frame goes.

---

## Batch 06: Video decode engine and frame delivery

**Goal:** Frame-accurate video decoding in the worker with seek, sequential decode, prioritized requests, cancellation, and delivery into the texture pool; the preview shows any frame of any imported video on demand.

**Spec refs:** §3.5, §4 P5 P7 P8 P13, §9.2, §9.3, §9.1 (sample index cache).

**Build:**
- Sample index builder (streaming through mp4box with extraction) and its binary cache in `cache/index/`, validated by file size and `lastModified`.
- `VideoDecodeSession` in `decode.worker`: configure from description, `seek(targetUs)` with sync-sample lookup, drop-until-target, sequential continuation, `decodeQueueSize` backpressure, 8-frame ring for backward steps, `close()` on idle timeout, rotation passed through as metadata.
- Request API on the main thread (`media/decode/FrameService`): `getFrame(mediaId, timeUs, { lod, priority })` returning a texture handle when ready, `prefetch(mediaId, fromUs, toUs)`, priority classes `scrub > playback > idle`, cancellation of superseded requests, per-media in-flight limits, statistics (decode latency, drops).
- Progressive scrub delivery: when a request is far from a keyframe, deliver the keyframe texture first (tagged approximate), then the exact frame.
- Temporary dev UI in the preview panel: a time slider for the selected video media that calls `getFrame` with scrub priority and draws the result (removed in Batch 08). HEVC/AV1 support through `VideoDecoder.isConfigSupported` with a clear error badge on unsupported media.

**Do not build yet:** compositor, playback clock, audio, proxies.

**Implementation notes:** Feed samples in decode order (dts), match outputs by `timestamp` (cts). The worker owns the `File`; the main thread never reads media bytes. All `VideoFrame`s are closed on the main thread right after upload; count open frames in dev stats and assert zero after idle.

**Acceptance:**
- [ ] Dragging the dev slider over a 4K60 HEVC file shows an approximate frame within 1 animation frame and the exact frame within 80 ms at 1080p sources (120 ms for 4K) measured in dev stats.
- [ ] Requesting frames 0..300 sequentially decodes without re-seeking (one seek in stats).
- [ ] Switching between three different videos repeatedly leaves no open `VideoFrame` and at most three decoders alive; idle decoders close after 10 s.
- [ ] Sample index loads from cache on the second open (no re-parse, stats show it).

**State after:** any frame of any video can be shown quickly; the editor still has no timeline.

---

## Batch 07: Timeline canvas foundation

**Goal:** The two-canvas timeline with geometry, ruler, track rows, zoom/scroll, playhead, plain clip rectangles, hit testing, and the first way to put clips on it (double-click a media item inserts at the playhead).

**Spec refs:** §6.1 (toolbar zoom group and timecode only), §6.2, §6.3 (ticks, click/drag playhead), §6.4 (rect, label bar, LOD rules; no thumbnails), §6.5, §6.6 (wheel/pan only), §6.17, §6.18, §6.14 (double-click insert only), §4 P1 P3 P9 P10.

**Build:**
- `TimelineView` with content and overlay canvases at DPR, `TimelineGeometry`, visible-range virtualization, `HitTester` with the result types of §6.18 (only `clip`, `ruler`, `playheadHead`, `trackHeader`, `empty` need real logic now; others return `empty`).
- Ruler with adaptive ticks and labels; track header column drawing (name, icons as static glyphs; toggles come in Batch 16); divider between video and audio areas; `+ track` affordances as drawn buttons that dispatch the add-track commands from Batch 02.
- Zoom (keys `=`/`-`/`\`, Mod+wheel / Alt+wheel anchored at cursor, toolbar slider and buttons), scroll (wheel vertical, Shift+wheel horizontal, deltaX), clamping rules, `Fit`.
- Playhead: drag on the ruler (scrub, no snapping yet), keyboard stepping from §6.5, timecode field in the toolbar (editable, relative forms), content end marker.
- Clip drawing: rounded body with per-kind DS color, label bar with icon and name, selection outline (selection via click and Shift+click only; marquee comes in Batch 11), hover highlight on the overlay, LOD rules.
- Insert at playhead: double-clicking a media card creates a video clip (and an audio clip on an auto-created audio track when the media has audio, linked by `linkGroup`) at the playhead on the first video track (auto-created), overwriting nothing (if the spot is occupied, place it at the next free gap end on that track); the playhead moves to the clip end. Images get 5 s.

**Do not build yet:** moving/trimming clips, snapping, thumbnails/waveforms, markers, in/out, track toggles, drag from media.

**Implementation notes:** Scroll and zoom live in `SessionStore` but the view reads them through a direct subscription and redraws through the scheduler; the toolbar slider updates through a direct DOM write while dragging and dispatches once on release. Round all clip rects to device pixels; 1 px separators between abutting clips.

**Acceptance:**
- [ ] A project with 500 generated clips across 8 tracks (dev command) zooms and scrolls at 60 fps with the content canvas drawing only visible clips (dev counter).
- [ ] Zoom anchored at the cursor keeps the frame under the cursor fixed at every zoom level; `Fit` shows the whole content.
- [ ] Ruler labels never overlap at any zoom; frame numbers appear at frame-level zoom.
- [ ] Dragging the playhead redraws only the overlay canvas (content redraw counter unchanged).
- [ ] Double-clicking three media items sequences three linked video/audio clip pairs end to end; Undo removes them one pair at a time.
- [ ] React Profiler: zero commits during playhead drags and zoom.

**State after:** clips can be laid out and seen on a real timeline; the preview still ignores the timeline.

---

## Batch 08: Compositor and preview at the playhead

**Goal:** The preview shows the composite of the timeline at the playhead: multi-track video and images with transforms, opacity, crop and rotation metadata, with progressive scrubbing from the ruler.

**Spec refs:** §9.4, §7.1 (fit viewport only), §4 P3 P8, §5.1 (source time formula), §6.19 (16:9 into 9:16 default Fit).

**Build:**
- `Compositor.evaluate(doc, frame)` producing a `DrawList` (track order, clip at frame per track, source time with speed, transform matrix including rotation metadata and flips, opacity with fades, crop UV); comparison with the previous draw list to skip identical redraws.
- `PreviewView`: subscribes to playhead and document; on change evaluates, requests frames (`scrub` priority while the ruler is being dragged, `idle` otherwise), draws with ready textures, keeps the last texture per layer when the new one is not ready (never black), redraws when late frames arrive.
- Default transform on insert: Fit for media whose aspect differs from the project (letterbox), 1:1 scale otherwise; `transform.anchor` at the media center.
- Replace the dev slider/image harness from Batches 05 and 06 with the real preview.
- Preview chrome v1: timecode readout (direct DOM), Fit button, a static quality label.

**Do not build yet:** playback clock, audio, text, transitions, gizmo, zoom/pan beyond Fit.

**Implementation notes:** The draw list must be a plain array of structs reused between frames (no per-frame allocations of closures). Rotation metadata (90/270) swaps the media's effective width/height before Fit math.

**Acceptance:**
- [ ] Stack three clips on V1..V3 with different opacities and positions (set via dev commands): the composite is correct and matches a reference screenshot.
- [ ] Scrubbing the ruler across cuts shows the new clip's frame within one animation frame (approximate) and the exact frame within 100 ms; no black flashes at cuts.
- [ ] A 16:9 clip in a 9:16 project is letterboxed; a rotated iPhone clip displays upright.
- [ ] Changing a clip's opacity through the raw command re-renders only the preview (timeline content untouched).

**State after:** the editor shows what is at the playhead.

---

## Batch 09: Playback engine (video)

**Goal:** Smooth, frame-accurate video playback driven by the audio clock, with JKL, stepping, play around, follow-playhead paging, lookahead decoder warming and dropped-frame accounting.

**Spec refs:** §8 (all except audio scheduling and audio scrub), §4 P1 P7, §6.2 (follow playhead), §6.5, §7.8 (transport buttons), §13 (status strip).

**Build:**
- `PlaybackEngine`: `AudioContext` created on first interaction and used as the master clock even for silent playback; play/pause/speed/direction; per-frame evaluation through the compositor; prefetch window and per-media sequential decode; lookahead scan every 250 ms warming decoders for clips starting within 2 s; release of decoders idle 10 s; dropped-frame counter and auto-switch flag (proxy switching becomes real in Batch 24).
- Transport: Space, J/K/L with speed ladder and K+J/K+L stepping, Shift+K play around, Home/End, arrows; preview transport buttons wired; loop over the whole timeline when enabled (in/out range loop comes in Batch 19).
- Follow playhead paging in the timeline; manual scroll disables following until next play.
- Timecode and duration readouts updated by direct DOM writes; the timeline overlay invalidated per frame; content canvas untouched.
- Status strip with dropped frames of the last playback and texture pool usage.
- Backward playback: reverse GOP decoding using the ring buffer and `seek` to previous keyframes; it may be slower but must not stall the UI.

**Do not build yet:** audio output, audio scrub, proxy switching, in/out loop.

**Implementation notes:** Keep the engine framework-free; it exposes `subscribe` for the React transport buttons (play/pause state only). Use the `FrameScheduler` tick, not its own rAF. During playback the `IdleQueue` is paused.

**Acceptance:**
- [ ] A 60 s timeline made of 60 one-second clips from 5 different 1080p30 sources plays at 30 fps with 0 dropped frames after a warm cache (dev stats).
- [ ] 4K60 HEVC source plays at 1x with fewer than 2% dropped frames at Full quality on the development machine (record the number in PROGRESS.md).
- [ ] L pressed four times reaches 8x and the playhead advances proportionally; K stops instantly; K+L steps one frame per press.
- [ ] React Profiler shows zero commits during 30 s of playback (P1 check, batch 10 milestone brought forward).
- [ ] Follow playhead pages the timeline view exactly when the playhead leaves the right edge.

**State after:** the editor plays video.

---

## Batch 10: Audio decoding, mixing and sync

**Goal:** Audio clips play in sync with video through a Web Audio graph with per-clip gain, track mute/solo and master meters; audio decoding and peaks analysis are cached.

**Spec refs:** §14 (graph, decoded audio cache, meters, master volume), §8 (audio scheduling and clock), §9.6 (peaks only, drawing comes in Batch 17), §3.5 (`analysis.worker`).

**Build:**
- `audio/decode`: `decodeAudioData` per media on import (segmented for files over 10 min), `AudioBuffer` LRU cache (512 MB), transfer of channel data to `analysis.worker` for the peaks pyramid stored in `cache/peaks/`.
- `audio/scheduler`: lookahead scheduling (200 ms ahead, 50 ms steps) of `AudioBufferSourceNode`s for every audio clip intersecting the play range, per-clip `GainNode` (gain in dB, mute; fades and keyframes come in Batch 37), track gain (mute/solo), master gain, `AnalyserNode` meters; seek and stop with 10 ms ramps; speed via `playbackRate` for 0.25x..4x; silence at other shuttle speeds.
- Master volume knob and mute in the preview chrome; stereo peak meter with hold and clip indicator.
- Track header mute/solo toggles for audio tracks (minimal drawing; full header UI is Batch 16).
- Sync test tooling: dev command that generates a clap test (video flash + audio tick) and reports offset.

**Do not build yet:** waveform drawing, rubber bands, fades, normalize, ducking, audio scrub.

**Implementation notes:** Schedule from the engine tick; never schedule more than 400 ms ahead so seeks feel instant. Video frame selection uses the same `AudioContext.currentTime`. Keep the `AudioBuffer`s on the main thread; only PCM copies go to the worker.

**Acceptance:**
- [ ] Clap test: audio/video offset under 1 frame at the start and after 5 minutes of playback.
- [ ] Seeking during playback restarts audio within 50 ms with no clicks (inspect in a recording).
- [ ] Mute/solo on tracks applies immediately during playback.
- [ ] Peaks files exist for every audio-bearing media after import and are reused on reopen.
- [ ] Meters move during playback and the clip indicator latches on a +6 dB test clip.

**State after:** the editor plays audio and video together.

---

## Batch 11: Selection and moving clips

**Goal:** Premiere-grade clip selection and dragging: marquee, multi-track moves, ghosts, overwrite and insert collisions, track auto-creation, Alt-duplicate, Shift constraint, nudging, auto-scroll, cancel.

**Spec refs:** §6.7, §6.8, §6.6 (auto-scroll), §6.17 (overlay ghosts), §6.19 (overlap/split cases, locked tracks), §4 P2.

**Build:**
- Selection: click, Shift, Mod, Alt variants from §6.7, marquee with intersect semantics, `Mod+A`, `Mod+Shift+A`, selection restore on undo (from Batch 02), primary selection.
- Drag gesture (`timeline/view/gestures/moveClips.ts`): dead zone, ghosts for all selected clips, vertical track mapping with kind constraints and relative offsets, new-track creation zones, Shift horizontal constraint, Alt duplicate, Esc cancel, auto-scroll near edges, delta tooltip.
- Pure edit operations (`timeline/edit/move.ts`): `moveClips(doc, ids, deltaFrames, trackMap, mode: 'overwrite' | 'insert')` implementing overwrite (trim/remove/split underlying clips) and insert (ripple on unlocked tracks), refusal on locked tracks, no-op detection. Fully unit tested including the split-with-keyframes placeholder (keyframes are partitioned by frame even though no UI creates them yet).
- Overlay indicators: hatched overwrite regions and the insert line while dragging; red ghost on refused drops.
- Nudge keys and move-to-adjacent-track keys.

**Do not build yet:** snapping (Batch 12), trimming, linked-selection toggle UI (linked clips already move together through `linkGroup` from Batch 07's insert).

**Implementation notes:** The gesture object holds the proposed layout; the ghost draw reads it; `moveClips` is called exactly once on pointer up (P2). Use the per-track sorted arrays for collision checks in O(log n) per clip.

**Acceptance:**
- [ ] Drag a clip onto the middle of a longer clip: the longer one splits into two around it; Undo restores a single clip.
- [ ] Mod+drop inserts and shifts later clips on all unlocked tracks; a locked track stays put and limits nothing (overwrite) or refuses (insert collisions are reported by a toast).
- [ ] Multi-track selection dragged up by one track keeps relative offsets; dragging above V-top creates a new track live in the ghost.
- [ ] Alt+drag leaves originals and creates copies; Esc mid-drag cancels with no document change and no undo entry.
- [ ] Marquee selects partially covered clips; selection survives Undo of a move.
- [ ] 500-clip project: dragging 200 selected clips stays at 60 fps.

**State after:** clips can be arranged freely.

---

## Batch 12: Timeline snapping

**Goal:** The snapping system used by every timeline gesture: candidates, threshold, resolution, visuals, toggle and hold-to-invert.

**Spec refs:** §6.9 (all), §6.3 (Shift-snapping of the ruler playhead), §6.17 (overlay snap lines).

**Build:**
- `timeline/snap`: `SnapIndex` rebuilt on document/marker/in-out changes (sorted candidate frames with kinds and labels), `resolveSnap(frames: number[], excludeClipIds, thresholdPx, pxPerFrame)` using binary search, priority tie-break, both-edge testing.
- Integration into the move gesture (leading and trailing edges) and the ruler playhead drag with Shift; the `S` toggle with toolbar magnet state, and hold-`S`-to-invert during a drag.
- Overlay: full-height snap line in the DS accent color, target label near the cursor, sticky ghost behavior.
- Unit tests: priority order, threshold in screen space at different zooms, exclusion of dragged clips, ties.

**Do not build yet:** trim snapping integration (Batch 13 reuses `resolveSnap`), keyframe candidates (Batch 35), transition edges (Batch 36).

**Implementation notes:** `SnapIndex` must be cheap to rebuild (one pass over clips) and must be rebuilt lazily on the first query after invalidation, not on every document change.

**Acceptance:**
- [ ] Moving a clip near another clip's end snaps at 8 px regardless of zoom; the snap line and label appear; moving away releases.
- [ ] With snapping off, holding `S` during a drag snaps; releasing stops snapping instantly.
- [ ] A playhead drag on the ruler snaps only while Shift is held.
- [ ] The snap index rebuild for 500 clips takes under 1 ms (test).

**State after:** everything you drag lands where it should.

---

## Batch 13: Trimming I: regular and ripple trims, trim to playhead

**Goal:** Edge trimming with live edge-frame preview, ripple trims, Q/W/E, media bounds, linked trims and all limits, fully tested.

**Spec refs:** §6.10 (Regular trim, Ripple trim, Trim to playhead, Extend edit, common rules), §6.4 (trim zones, cursors), §6.19 (1-frame, media bounds, ripple with locked tracks).

**Build:**
- Hit testing for `clipEdgeIn/Out` zones with bracket cursors; the Ripple mode toggle in the toolbar and Mod-held variant.
- `timeline/edit/trim.ts`: `trimEdge(doc, clipId, edge, deltaFrames, { ripple })` with clamps for media bounds, 1-frame minimum, neighbor collision (regular), multi-track ripple limit (ripple), linked partner bounds (stop both unless Alt), keyframe handling policy, transition shortening placeholder (transitions arrive in Batch 36, keep the hook).
- Gesture with ghost edge, delta tooltip (frames and resulting duration), red edge at media bounds with `Media start/end` label, snapping of the dragged edge, auto-scroll.
- Live preview: while trimming, the preview panel shows the new edge frame (scrub-priority frame request).
- `Q` / `W` ripple trim to playhead on targeted tracks (targeting toggles exist as a stub from Batch 10 headers; default all tracks targeted), `E` extend edit; they must be instant (one command each, no gesture).
- Tests for every limit in §6.10 and §6.19.

**Do not build yet:** roll/slip/slide/rate stretch (Batch 14), fade handles (Batch 36), transitions.

**Implementation notes:** `Q/W` are the most used trimming keys in practice; implement them as pure functions over the model with no dependency on the gesture code, and make sure they work during playback (playback continues, the edit applies at the frame when the key was pressed).

**Acceptance:**
- [ ] Dragging an out point shows the last included frame live in the preview; releasing commits one undo step.
- [ ] Ripple trim with Mod shifts all later clips on unlocked tracks and stops at the first cross-track collision; locked tracks never move.
- [ ] Trimming to 1 frame and back works; trimming past media start turns the edge red and clamps.
- [ ] `Q` during playback trims the clip start to the playhead and closes the gap without interrupting playback.
- [ ] Linked video/audio trim together; Alt+drag trims one side and shows the sync badge.

**State after:** fast trimming is done; this is the core cutting workflow.

---

## Batch 14: Trimming II: roll, slip, slide, rate stretch, edit points

**Goal:** The remaining professional trim behaviors, junction hit zones, edit point selection and navigation, with split-view previews.

**Spec refs:** §6.10 (Rolling edit, Slip, Slide, Rate stretch), §6.7 (edit point selection), §6.5 (Up/Down edit points), §6.18 (tool-dependent hits), §5.1 (speed formula).

**Build:**
- Junction zone hit testing and Mod+Alt roll cursor; the Slip (Y), Slide (U) and Rate stretch (R) tools with their cursors and body/edge hit interpretation.
- `timeline/edit/trim.ts` additions: `rollEdit`, `slip`, `slide`, `rateStretch` (speed from duration, keeps in/out) with bounds and tests.
- Previews: roll shows a split preview (A's last frame | B's first frame); slip shows the clip's new first and last frames split; slide shows the neighbors' new edge frames.
- Edit point selection (brackets drawn on the overlay), Up/Down navigation across edit points of unlocked tracks (also markers and in/out when they exist), `Mod+Shift+.` center playhead.
- Speed badge on clips with speed != 1; audio `playbackRate` follows clip speed (from Batch 10).

**Do not build yet:** speed UI in properties (Batch 27), keyframe-aware stretching beyond proportional scaling of keyframe frames.

**Implementation notes:** The split preview is a compositor option (`previewSplit: { leftFrame, rightFrame }`) rendering two draw lists into the left and right halves; reuse it later for transition alignment previews.

**Acceptance:**
- [ ] Roll between two clips keeps total duration; stops at either media bound with the bound side red.
- [ ] Slip shows both new edge frames during the drag; Slide trims neighbors symmetrically.
- [ ] Rate stretch doubles duration to 0.5x speed; audio pitch follows; in/out unchanged.
- [ ] Up/Down jump through all edit points in order across tracks; brackets select an edit point on click with the roll zone.

**State after:** the full Premiere trim vocabulary exists.

---

## Batch 15: Split, delete, gaps, compact

**Goal:** Cutting and cleanup operations: split at playhead, razor tool, delete, ripple delete, gap selection, close gap, close all gaps (compact).

**Spec refs:** §6.11 (all except Lift/Extract and Delete track), §6.7 (gap selection), §6.16 (clip and gap context menus, minimal set), §4 P2.

**Build:**
- `timeline/edit/split.ts`, `delete.ts`, `gaps.ts` (pure, tested): split rules (selection vs targeted tracks vs all), keyframe partition, linked split, transition removal hook; delete leaving gaps; ripple delete with per-gap collision limits and toast; close gap; close all gaps on tracks left to right as one transaction.
- Razor tool: hover cut line, click split, Shift+click all tracks.
- Gap hit testing, selection outline, `Delete`/`G` on a selected gap.
- Toolbar buttons: Split, Delete, Ripple delete, Close gap, Compact; keyboard `Mod+K`, `Mod+Shift+K`, `Delete/Backspace`, `Shift+Delete`, `G`, `Shift+G`.
- First context menus (clip: Cut/Copy/Paste placeholders disabled until Batch 39, Delete, Ripple delete, Split at playhead, Rename, Label color swatches; gap: Close gap, Close all gaps on track) using the `ContextMenu` primitive with command ids.

**Do not build yet:** lift/extract (needs in/out, Batch 19), clipboard, delete track UI.

**Implementation notes:** Compact must be a single `produceWithPatches` pass computing new starts in one sweep per track, then validating cross-track collisions, then committing; never a loop of close-gap commands.

**Acceptance:**
- [ ] `Mod+K` with nothing selected splits every clip under the playhead on targeted tracks; both halves keep properties; Undo restores one clip.
- [ ] Ripple delete of clips on two tracks with different gap sizes closes each gap by its own amount, limited by cross-track collisions, with a toast when limited.
- [ ] Compact on 500 clips with 300 gaps completes in under 50 ms and is one undo step.
- [ ] Razor Shift+click cuts all unlocked tracks at the snapped frame; locked tracks untouched.
- [ ] Clicking a gap selects it; `Delete` closes it.

**State after:** cut, remove, compact: the daily workflow is complete.

---

## Batch 16: Linking, groups, track management

**Goal:** Track headers become real controls; linking and grouping semantics are complete; tracks can be added, removed, reordered, renamed, locked, targeted and resized.

**Spec refs:** §6.12 (all), §6.1 (track header column), §6.4 (link badge, sync badges, hatched locked tracks), §6.16 (track header menu), §6.19 (link offsets, locked tracks).

**Build:**
- Track header drawing with toggles (target, lock, mute, solo, hide, height) with hit testing and hover states from the DS; divider; `+ track` buttons; drag-reorder of tracks (ghost row); double-click rename (inline DOM input positioned over the header); selected track state for the properties panel.
- Linked selection toggle (`Shift+S`), `Mod+L` link/unlink, sync badges and `Move into sync`; groups (`Mod+G`, `Mod+Shift+G`) with group-aware selection/move/delete.
- Locked track behavior across all existing operations (select, move, trim, split, delete, ripple, insert): audit and tests.
- Muted/hidden video tracks skipped by the compositor; solo for audio; targeted tracks used by Q/W, split, close gap.
- Track context menu from §6.16 and the Track section in the properties panel (name, height, toggles).
- Track height presets S/M/L with per-track state and the toolbar cycle button (`Mod+Alt+Up/Down`).

**Do not build yet:** thumbnails/waveforms at M/L (Batch 17).

**Implementation notes:** Track reorder is a document command (z-order changes); heights are session state. Keep the audio tracks growing downward and video tracks upward so the divider is stable.

**Acceptance:**
- [ ] Lock V2: nothing on it can be selected, moved, trimmed or split; ripples skip it and collisions with it limit ripples.
- [ ] Unlink a pair, move the audio by 12 frames, relink: the badge shows `+12`; `Move into sync` realigns.
- [ ] Reorder V1 above V3: the composite changes accordingly; Undo restores.
- [ ] Rename a track inline; rename persists after reload.
- [ ] Target toggles change which tracks `Mod+K` without selection cuts.

**State after:** tracks are fully manageable.

---

## Batch 17: Clip visuals: filmstrips, waveforms, badges, label colors

**Goal:** Clips look like Premiere clips: thumbnail filmstrips at the right LOD, waveforms from the peaks pyramid, badges, label colors, text/solid bodies, LOD rules, all lazily generated and cached.

**Spec refs:** §9.6 (thumbnails), §6.4 (all visuals except fade handles, keyframe lane, rubber band, transitions), §6.17 (thumbnail/peaks drawing, arrival coalescing), §3.4 (IdleQueue), §4 P10.

**Build:**
- `analysis.worker` thumbnail sprite sheets per media and LOD (LOD0 and LOD1 eagerly after import, LOD2 on demand for visible ranges), WebP in `cache/thumbs/`, index JSON, `ImageBitmap` LRU on the main thread, requests driven by the visible clip ranges through the `IdleQueue` (paused during playback and drags).
- Filmstrip drawing per clip honoring in/out/speed, clipped to the body, with placeholder color while loading and coalesced redraws on arrival (max 10/s).
- Waveform drawing from the peaks pyramid with level selection by zoom; gain applied visually (gain itself comes in Batch 37, draw at 0 dB now).
- Label colors (8 DS swatches) in the clip context menu; badges: speed, link, disabled (hatched), `fx` placeholder hidden until Batch 36; text/solid/image bodies.
- Media panel: card thumbnails switch to the sprite sheet source (sets up hover scrub for Batch 20).

**Do not build yet:** hover scrub, keyframe lanes, rubber bands, fade handles.

**Implementation notes:** Thumbnails come from the proxy when it exists (Batch 24 will switch the source automatically; design the request to accept a source LOD). Never decode for thumbnails on the main thread; the analysis worker uses its own `VideoDecodeSession` at a low priority that yields to playback requests.

**Acceptance:**
- [ ] Zooming into a clip reveals denser thumbnails within 1 s on an idle machine; zooming during playback shows placeholders and fills after playback stops.
- [ ] Waveforms match the audio (visual check against a known file) and stay crisp at every zoom.
- [ ] Reopening the project uses cached sheets (no worker decode in stats).
- [ ] 500-clip project still scrolls at 60 fps with thumbnails on.

**State after:** the timeline looks premium.

---

## Batch 18: Timeline navigation polish

**Goal:** The scrollbar with zoom handles, zoom-to-selection, track-area vertical scrolling, hand tool, center playhead, timecode input polish, keyboard navigation completeness.

**Spec refs:** §6.2, §6.5, §6.6, §6.1 (zoom group, timecode field).

**Build:**
- Horizontal scrollbar with draggable zoom handles at both ends (Premiere behavior), vertical scrollbar for tracks, both drawn on the content canvas with hit testing; hand tool (H) and Space+drag / middle-drag panning; `Shift+\` zoom to selection; `Mod+Shift+.` center playhead.
- Timecode field: `mm:ss:ff` / `mm:ss.mmm` format toggle shared with the preview, relative forms, validation, Enter/Esc.
- Keyboard completeness for the timeline scope from §18 (everything not yet bound is bound now, dispatching to existing commands; unimplemented ones show a "coming in batch NN" toast in dev builds).
- Smooth zoom animation (120 ms ease) for keyboard zoom steps (wheel zoom stays immediate).

**Do not build yet:** markers/in-out (next batch).

**Implementation notes:** The scrollbar geometry derives from content end + 25% overscroll; the zoom handle drag changes `pxPerFrame` and `scrollFrame` together so the opposite edge stays fixed.

**Acceptance:**
- [ ] Dragging the right zoom handle zooms in with the left edge fixed; dragging the thumb scrolls.
- [ ] `Shift+\` frames the selection with 10% margin; `\` fits all.
- [ ] Typing `+30` in the timecode field advances 30 frames; `1:05:10` jumps.
- [ ] Every timeline-scope shortcut in §18 either works or shows the dev toast naming its batch.

**State after:** navigating the timeline is effortless.

---

## Batch 19: Markers, in/out range, loop, lift/extract

**Goal:** Timeline markers with labels and colors, in/out range with shading and handles, loop and play-in-to-out, mark clip, lift and extract.

**Spec refs:** §6.13, §6.3 (markers, in/out shading and handles), §6.11 (Lift/Extract), §6.16 (ruler/marker menu), §8 (play in to out), §6.9 (markers and in/out as snap candidates).

**Build:**
- Markers model and commands; ruler drawing; hover tooltip; drag with snapping; inline popover editor (label, 8 colors, delete); keyboard `M`, `Shift+M`, `Mod+Shift+M`; Marker section in the properties panel.
- In/out: `I`, `O`, `Alt+I/O`, `Alt+X`, `Shift+I/O`, `X` mark clip; ruler handles draggable with snapping; shading across the timeline; `Set in/out to selection` menu item.
- Loop toggle and play in to out (`Mod+Shift+Space`); loop range = in/out when set.
- Lift (`;`) and Extract (`'`) on targeted tracks as transactions, tested.
- Markers, in and out added to the `SnapIndex` and to the edit point navigation.

**Do not build yet:** clip markers, export range (Batch 44 reads in/out).

**Acceptance:**
- [ ] Add 5 markers, drag one onto a clip edge (snaps), edit its label, reload: all persist.
- [ ] Set in/out, play in to out loops exactly between them (frame-accurate at the boundaries).
- [ ] Extract removes the range on targeted tracks and ripples; Lift leaves the gap; both are one undo step.
- [ ] `X` sets in/out to the clip under the playhead.

**State after:** range-based workflows work.

---

## Batch 20: Media to timeline: drops, hover scrub, source ranges, append workflow

**Goal:** All the ways media enters the timeline: drag from the Media panel with full insert/overwrite rules, multi-drop, OS file drops, drop onto the canvas, hover-scrub cards with source in/out, and the append-at-playhead workflow.

**Spec refs:** §6.14 (all), §12 (hover-scrub, source in/out, drag out), §6.8 (collision rules reused), §7.2 (drop target only).

**Build:**
- Drag from media cards (native DnD with a custom drag image, or pointer-based drag with a cross-panel gesture; pick pointer-based for control) to timeline tracks with the same ghost/collision/snap logic as moving, including the linked audio ghost and auto-created tracks; multi-item sequential placement; OS file drop onto the timeline (import + insert transaction).
- Hover-scrub on media cards from sprite sheets with the progress line and timecode; `I`/`O`/`Alt+X` while hovering set the source range (session state, range bar on the card); double-click, `,` (insert) and `.` (overwrite) at the playhead with the range; the playhead moves to the end after insert.
- Drop onto the preview canvas: places at the playhead on the top video track (or new) with the transform centered at the drop point.
- Context menu items on media: Insert at playhead, Overwrite at playhead, Add to canvas.

**Do not build yet:** bins/search/filters (Batch 41), relink.

**Implementation notes:** The cross-panel drag must not use React state for the ghost; render the ghost in the timeline overlay when the pointer is over the timeline and as a small DOM element elsewhere.

**Acceptance:**
- [ ] Drag a video with audio onto V2 at a snapped frame: video and linked audio land on V2/A2 (A2 created if missing).
- [ ] Hover-scrub a card, press `I` at 2 s and `O` at 5 s, double-click: a 3 s clip is inserted at the playhead and the playhead moves to its end.
- [ ] Drop three OS files onto the timeline: they import and appear back to back in one undo step.
- [ ] Drop a PNG onto the preview at a point: the image clip is centered there on the top track.

**State after:** assembling a cut from footage is fast.

---

## Batch 21: Preview viewport: zoom, pan, detail, quality modes, overlays, fullscreen

**Goal:** The preview becomes a real monitor: zoom levels anchored at the cursor, panning, real detail when zoomed, quality modes, safe-zone and grid overlays, fullscreen, complete chrome.

**Spec refs:** §7.1, §7.5, §7.6, §7.8, §13, §4 P3.

**Build:**
- Viewport state (zoom, pan) in session; Fit/25/50/100/200/400 and free wheel zoom anchored at the cursor; Space/middle pan; `Mod+0/1/2`; the zoom dropdown.
- Detail on zoom: offscreen render at `min(zoom, cap)` times project size, capped by source resolution and 4096 px, blitted to the canvas; text layers re-raster at the detail scale (hook for Batch 28).
- Quality modes (Auto/Full/Proxy/1/2/1/4) with the Auto rule (proxy during playback and scrub, full after 300 ms pause); proxy itself arrives in Batch 24, so Auto currently selects between full and reduced render size.
- Overlays on the gizmo canvas (created now as a 2D overlay canvas, gizmo drawing comes in Batch 22): safe zones (None/Reels/TikTok/Shorts) with constants in `safeZones.ts`, grid (thirds/3x3/custom), center cross, title/action safe, rulers above 100%, pixel grid above 800%.
- Fullscreen (F): preview fills the window with the chrome as an auto-hiding bar; Esc returns.
- Chrome completion: Loop, Play in/out, Mute, Master volume, Zoom, Fit, Quality, Overlays, Snap mirror, Guides toggle, Fullscreen.

**Do not build yet:** selection on the canvas, gizmo.

**Acceptance:**
- [ ] Zoom to 400% on a 4K source: real pixels are visible (compare against the source), not upscaled 1080p.
- [ ] Wheel zoom keeps the point under the cursor fixed; Fit returns exactly to letterbox.
- [ ] Safe zone overlay for Reels shows the action column and caption area; it never appears in the PNG export.
- [ ] Fullscreen plays at 60 fps and Esc restores the layout exactly.

**State after:** the monitor is complete, minus editing on it.

---

## Batch 22: Canvas selection and transform gizmo

**Goal:** Direct manipulation of layers on the preview: pick, move, scale, rotate, anchor, nudge, multi-select, with the timeline selection shared and the compositor transforms updated live.

**Spec refs:** §7.2, §7.3, §6.7 (shared selection), §4 P2 P3, §5.2 `Transform`.

**Build:**
- Hit testing against transformed, cropped bounds in layer order at the playhead (video/image bbox; text glyph bounds come in Batch 28 and fall back to bbox now); hidden/locked skipping; Alt+click cycling; marquee; Shift toggle; hover outline.
- Gizmo on the overlay canvas: 8 handles, rotation ring zones, anchor marker (Alt), cursors, readouts; gestures for move (Shift axis constraint), scale (uniform/non-uniform/center), rotate (Shift 45° snapping, 100% scale snap flash), anchor move; arrow nudges; multi-selection group box with proportional transforms.
- `transform` commands with coalescing for nudges; one command per gesture; the compositor reads ephemeral transforms during a gesture (gesture-aware evaluate option).
- Context menu on the canvas (§7.2) with the items that exist now (Reset, Bring forward/Send backward via track move, Duplicate placeholder until Batch 39, Delete, Lock track); Fit/Fill/Center/Flip arrive with the properties quick row in Batch 25 but their pure functions are written now in `timeline/edit/transform.ts`.

**Do not build yet:** canvas snapping (next), crop handles (Batch 26), text editing (Batch 29), keyframe-aware edits (Batch 35, leave the hook).

**Acceptance:**
- [ ] Moving a layer renders at 60 fps with zero React commits; releasing creates exactly one undo step.
- [ ] Corner scale keeps aspect; Shift+corner does not; Alt scales around the center; rotation snaps at 45° with Shift.
- [ ] Selecting on the canvas highlights the clip on the timeline and vice versa.
- [ ] Alt+click cycles through three stacked layers.
- [ ] Group box transforms move all members proportionally.

**State after:** layout happens on the canvas.

---

## Batch 23: Canvas snapping, smart guides, proximity measurements

**Goal:** Figma-grade snapping on the canvas: frame geometry, safe zones, other layers, distribution guides, distance readouts and measure mode.

**Spec refs:** §7.4 (all), §7.6 (safe zone edges as candidates), §6.9 (shared `S` toggle semantics).

**Build:**
- `render/preview/snap.ts`: candidate collection (frame center/edges/thirds, safe zone edges when active, visible layers' edges and centers at the playhead, equal spacing) rebuilt only on layer set/transform changes; resolution with 6 px threshold in screen space for position, scale handles and rotation; sticky behavior.
- Guides and readouts on the overlay: accent lines across the frame, layer-to-target spans with px distances, distribution guides, and Alt measure mode (distances to nearest layers and frame edges on four sides).
- Shared `S` toggle and hold-to-invert with the timeline (one global snap state).
- Unit tests for candidate generation and resolution math.

**Do not build yet:** text baseline snapping.

**Acceptance:**
- [ ] Dragging a layer near the frame center snaps on both axes with crossing guides; near another layer's edge it snaps and shows the distance.
- [ ] Three layers in a column: moving the middle one shows equal-spacing guides and snaps to the equal position.
- [ ] Alt (no drag) shows measurements from the selected layer to the frame edges.
- [ ] Snap candidates rebuild only when transforms change (counter in dev stats).

**State after:** precise placement in one gesture.

---

## Batch 24: Proxy workflow

**Goal:** Automatic proxy generation in a worker with cancellation and progress, automatic LOD selection (Auto quality), badges, settings, and thumbnail sourcing from proxies.

**Spec refs:** §9.5, §7.5 (Auto rule), §8 (fallback to proxy on drops), §9.6 (thumbnails from proxy), §12 (proxy badge, context menu items), §11 (Project section proxy settings).

**Build:**
- `proxy.worker`: decode source -> scale (`VideoFrame` `visibleRect`/`createImageBitmap` resize or a GPU blit in a worker, pick the faster that keeps quality) -> `VideoEncoder` H.264 at 540 short edge, 15-frame GOP, 3 Mbps -> `mp4-muxer` streaming to `cache/proxies/<id>.mp4.part` then finalize; one job at a time; pause during playback and export; progress and cancel; resume on reopen.
- `FrameService` LOD routing: `proxy` for scrub and playback in Auto, `full` when paused/export; automatic downgrade when dropped frames exceed 2 frames; per-media availability; the status strip shows `Auto: proxy/full`.
- Thumbnails switch to the proxy source when available (regenerate LOD0/LOD1 lazily).
- Media panel badges (`PX` pending/ready/failed), context menu Generate/Remove proxy, Regenerate thumbnails; Project settings: proxies on/off, threshold rule, short-edge size.

**Do not build yet:** audio in proxies (never), WebM proxies.

**Acceptance:**
- [ ] Importing a 4K60 file generates a proxy in the background while editing continues; progress shows on the card; cancel removes the `.part`.
- [ ] Scrubbing a 4K60 clip uses the proxy (exact frame within 50 ms) and the paused frame switches to full within 300 ms.
- [ ] Reopen with a half-done job: it resumes (or restarts cleanly) without corrupt files.
- [ ] Export (Batch 43 later) and the PNG export now use full resolution regardless of the quality mode.

**State after:** heavy footage feels light.

---

## Batch 25: Properties panel framework and core sections

**Goal:** The context-driven properties panel with scrubbable number fields that do not re-render React, the quick-action row, and the Clip, Transform, Opacity, Track and Project sections bound to real commands.

**Spec refs:** §11 (all except Crop, Speed, Audio, Text, Animation, Keyframes, Transition, Caption style), §3.3 (narrow selectors), §4 P1, §17 (properties quick row).

**Build:**
- Panel framework: section registry keyed by selection kind, collapsible sections with persisted state, mixed-value display for multi-selection, Tab order, keyboard scope `properties`.
- `ui/NumberField` final: label scrubbing (Shift 10x, Alt 0.1x), typing, arrows, Enter/Esc, units, clamps, coalesced commands, direct DOM updates during scrubs, narrow store binding; `ColorField` with the popover picker (hex/RGBA, recent colors, `EyeDropper` when available).
- Quick-action row: Fit, Fill, Center, Flip H, Flip V, Reset, Duplicate (implemented here as a single-clip command placed in the next free spot after the source; Batch 39 extends it), Delete; other chips appear in their batches (buttons present but disabled with tooltips "coming in batch NN" in dev).
- Sections: Clip (name, color, enabled, start/end/duration timecodes editable with ripple-less trims, source in/out), Transform (x, y, scale with lock, rotation, anchor, flips), Opacity, Track, Project (complete, replacing Batch 03's minimal version; resolution/fps changes call the conversion flow placeholder that will be built in Batch 42, for now they apply with scaling of transforms).
- Fit/Fill/Center pure functions wired (from Batch 22).

**Do not build yet:** the other sections.

**Implementation notes:** A field subscribes to exactly one property path of the primary clip; selection change swaps the subscription. React renders the panel when the selection kind or the primary clip id changes, never on value scrubs.

**Acceptance:**
- [ ] Scrubbing `x` on the label moves the layer live at 60 fps with zero React commits; release = one undo step; typing `100` and Enter sets exactly 100.
- [ ] Select 3 clips with different opacities: the field shows `--`; typing a value applies to all three.
- [ ] Fit/Fill on a 16:9 clip produce the expected transforms; Reset restores defaults.
- [ ] Editing the clip end timecode trims the clip (clamped by media and neighbor).

**State after:** precise control exists for everything built so far.

---

## Batch 26: Crop and fit tools

**Goal:** Cropping with canvas handles and fields, aspect-locked crop, crop-to-frame, and the fit/fill math that respects crop.

**Spec refs:** §11 (Crop section, quick row Fit/Fill), §7.3 (crop handles as a gizmo mode), §9.4 (crop UV), §6.19 (16:9 into 9:16).

**Build:**
- Crop gizmo mode (toggle in the properties Crop section header or double-click a video layer with the crop tool chip): 8 crop handles inside the layer, live UV crop, Shift aspect lock, Alt symmetric, snapping of crop edges to frame edges and thirds.
- Crop section fields (left/top/right/bottom with units in px and %), Reset, `Crop to frame` (sets the crop so the visible area equals the project frame at the current transform), aspect lock.
- Fit/Fill/Center math updated to consider the cropped rect; the hit test uses the cropped bounds.
- Compositor: crop in UV with correct handling of rotation metadata and flips.

**Acceptance:**
- [ ] Crop a 16:9 clip to 9:16 with `Crop to frame`, then Fill: it fills the frame exactly with no bars.
- [ ] Dragging a crop handle updates live; fields match; Undo is one step.
- [ ] Crop + rotation 90 + flip H render correctly (compare with a reference).

**State after:** reframing landscape footage takes two clicks.

---

## Batch 27: Speed, duration, freeze frame, punch zoom

**Goal:** Constant speed changes with duration linking, speed chips, freeze frames, and the punch-zoom one-click (as a non-animated preset until keyframes exist).

**Spec refs:** §11 (Speed section, quick row speed chips, Freeze, Punch zoom), §6.10 (Rate stretch), §5.1, §14 (audio resample), §6.16 (Speed..., Freeze frame).

**Build:**
- Speed section: speed % field, duration field linked (change one, the other follows; "ripple" checkbox to shift later clips when duration changes), speed chips 0.5/1/1.5/2 in the quick row, clip speed badge, audio `playbackRate`, keyframe frame scaling hook.
- Freeze frame (`Shift+F`): splits the clip at the playhead and inserts a 2 s frozen clip (an image-like clip referencing the media at a single source time; implement as a media clip with `speed = 0` handled by the compositor and the decoder as a single-frame request) between the halves with ripple; duration editable.
- Punch zoom (`Shift+Z`): splits at the playhead and sets scale 1.2x (settings) on the right half so the cut punches in; when keyframes exist (Batch 35) it becomes an animated zoom instead; implement the static version now with the setting `punchZoom.animated` reserved.
- Reverse: not implemented; the context menu item is absent (do not add a disabled item).

**Acceptance:**
- [ ] Set 2x on a 10 s clip: duration becomes 5 s, audio pitch doubles, later clips ripple when the checkbox is on.
- [ ] Freeze at a frame: playback holds that frame for 2 s with audio silent during the freeze.
- [ ] Punch zoom at a frame produces a visible cut-in; Undo restores.

**State after:** pacing tools are in place.

---

## Batch 28: Text engine

**Goal:** Text layers render in the compositor with full styling, layout and font support, cached rasters at the preview detail scale, and the Text section in the properties panel.

**Spec refs:** §10.1, §11 (Text section), §7.1 (detail scale hook), §4 P11, §5.2 `TextClip`, §7.2 (text glyph hit bounds).

**Build:**
- `render/text`: layout (wrap modes, alignment, vertical anchor, spacing, line height, case), rasterization to `OffscreenCanvas` at `size * rasterScale` with stroke/shadow/background box, texture upload, cache keyed by content+style+scale+box with a byte budget; glyph bounds for hit testing; per-word atlas builder (used by animations later, built now so the cache design is final).
- Fonts: bundled set (6-8 open variable fonts) via `FontFace`; `queryLocalFonts` listing with lazy preview rendering; copying local font files into `<project>/fonts/` when used; missing-font fallback and badge.
- `TextClip` model/commands; compositor integration (text layers as quads with the raster texture, re-raster at the detail scale when zoomed).
- Properties Text section: content textarea, font picker (searchable, sections, live previews), weight, italic, size, fill (solid/gradient), stroke, shadow, background box, alignment, spacing, line height, case, box mode and width.
- Dev command to add a text clip (the one-click buttons arrive next batch).

**Do not build yet:** inline editing, presets, animations, captions.

**Implementation notes:** Rasterize with `ctx.letterSpacing` and `fontKerning`; measure once per line; shadows rasterized in the same pass with padding; background box per line or per block. Keep rasters small: cap at 4096 px on the long side and scale down if needed.

**Acceptance:**
- [ ] A text layer with stroke, shadow and a background box renders identically at Fit and at 400% (sharp, re-rastered).
- [ ] Changing the font size re-rasterizes only that layer (cache stats) and the preview updates within one frame.
- [ ] A system font used in the project is copied into `fonts/` and the project renders with it after reload.
- [ ] Text hit testing on the canvas selects on glyph bounds, not the empty box corners.

**State after:** text exists and looks right.

---

## Batch 29: Text UX: one-click titles and subtitles, inline editing, text tool

**Goal:** The fastest possible text workflow: `T` adds a title and you type; inline editing on the canvas is WYSIWYG; subtitles go to the lower third.

**Spec refs:** §10.2, §7.7, §7.3 (text gizmo behaviors), §6.1 (+ Title, + Subtitle buttons), §18 (T, Shift+T, Enter, Mod+Enter, Esc).

**Build:**
- `+ Title` / `+ Subtitle` commands (track placement rules, default durations including "match clip under playhead", default content, immediate inline edit with content selected); toolbar buttons and keys.
- Inline editing: transparent `contenteditable`/textarea positioned over the text box at the current zoom with matching metrics, caret and selection highlighting drawn through the rasterizer, IME support, Enter newline, Mod+Enter commit, Esc commit-and-exit, click-away commit, live property edits while editing.
- Text gizmo rules: corner handles change font size for auto-size boxes, side handles change width for fixed boxes (reflow), double-click enters editing, Enter with a selected text clip enters editing.
- Placement: there is no separate text tool and no click-to-create on the canvas (one path only): `T` / `Shift+T` / preset chips create the clip, and the user drags it on the canvas to position it. A text clip created while another text clip is selected is placed 40 px below it instead of at the center, so stacked titles do not overlap.
- Default Title and Subtitle styles (hardcoded until Batch 30 makes them presets).

**Acceptance:**
- [ ] Press `T`, type `hello`, press Esc: a 3 s title with `hello` sits centered at the playhead on a free video track; total time under 2 s of user effort.
- [ ] Editing text shows the caret exactly where the glyphs are at Fit and at 200%.
- [ ] Changing the font size in the panel while editing keeps the caret and the typed text.
- [ ] `Shift+T` places a subtitle in the lower third with a background box.

**State after:** text is one keystroke away.

---

## Batch 30: Text presets library

**Goal:** Make and use presets in one click: library tab, create/update/apply, defaults for title/subtitle, favorites as toolbar chips, import/export, bundled starters.

**Spec refs:** §10.3 (all), §12 (Presets tab header), §6.1 (favorite chips), §11 (Save as preset / Update preset in the quick row), §15 (library folder sync).

**Build:**
- Preset model, global store (IndexedDB) and project-local store (`presets/text/*.json`), library folder export/sync (optional folder; writes JSON files; reads on open), import/export JSON.
- Presets tab: cards with live thumbnails rendered by the text engine (cached), search, global/project toggle, hover preview on the selected text clip (ephemeral), right-click menu (default title/subtitle, favorite, rename, duplicate, delete, export), drag a card onto the timeline to create a clip with it.
- Create from selection (inline name field), Update preset, Apply (selection or new clip), apply position option.
- Favorite chips in the timeline toolbar (up to 8, live updated), default Title/Subtitle presets used by Batch 29's commands.
- 8-12 bundled starter presets with distinct, tasteful content styles.

**Acceptance:**
- [ ] Style a title, click `Save as preset`, type a name, Enter: the card appears with a correct thumbnail; favorite it: a chip appears in the toolbar; click the chip: a new title with that style appears at the playhead.
- [ ] `Update preset` writes the selected clip's current style into the preset; other clips that use the preset keep their own style until it is re-applied, and the tooltip on `Update` says exactly that. Verify both.
- [ ] Set a preset as default subtitle; `Shift+T` uses it.
- [ ] Export presets to JSON, delete them, import: identical cards return.

**State after:** text styling is reusable in one click.

---

## Batch 31: Text animations

**Goal:** In/out animation presets for text, per-word and per-character variants, GPU-driven from the word atlas, with chips in the properties panel and preview on click.

**Spec refs:** §10.4, §10.1 (atlas), §4 P11, §9.4 (per-unit quads), §10.3 (presets store animations).

**Build:**
- `TextAnim` model; evaluation per frame producing per-unit transform/opacity (fade, slideUp/Down/Left/Right, pop, typewriter, wordPop, wordFade, lineReveal, blurIn, scaleBounce) with easing and stagger; out animations mirrored.
- Compositor: text layers with animations draw per-unit quads from the atlas; blurIn uses a small separable blur pass on the raster; no per-frame rasterization.
- Properties Animation section: In/Out chip rows, duration fields, stagger, easing; click-to-preview behavior; presets save/apply animations; thumbnails unaffected.
- Timeline: text clips show a small animation badge.

**Acceptance:**
- [ ] A 12-word title with `wordPop` in and `fade` out plays at 60 fps with no rasterization during playback (cache stats constant).
- [ ] Changing the in duration reflects immediately; the animation fits inside the clip (clamped to half the clip duration when needed).
- [ ] A preset with animations applies them to a selected clip and to new clips.

**State after:** titles move without keyframes.

---

## Batch 32: Captions track, captions editor, SRT/VTT

**Goal:** A dedicated caption track with a cue list editor, one caption style with word highlight, import/export of SRT/VTT, and rendering through the text engine.

**Spec refs:** §10.5 (all), §12 (Captions tab), §6.12 (caption track placement), §11 (Caption style section), §6.4 (caption clip body), §17.

**Build:**
- Caption track creation (`+ Caption track`, unique, above video tracks, `CC` header), caption clips with no-overlap clamping on move/trim, split/merge commands, `+ Cue at playhead`.
- Captions tab: cue list (virtualized), inline editing with Enter split, `Mod+Backspace` merge, Tab navigation, Delete, click-to-seek, search; header actions Import/Export SRT/VTT, Style focus, Clear all (Transcribe button disabled until Batch 33).
- `CaptionStyle` (TextStyle + position preset + max width/lines + word highlight settings) in the properties panel when the track or a cue is selected; applying a text preset to the track sets its style.
- Rendering of the active cue with word highlight when word timings exist; raster cache per cue+style.
- SRT/VTT parser/serializer with tests (timestamps to frames and back, multi-line cues, BOM, CRLF).

**Acceptance:**
- [ ] Import a 200-cue SRT: cues appear on the track and in the list; export produces an equivalent file (round-trip test).
- [ ] Editing a cue's text in the list updates the canvas immediately; splitting with Enter creates two cues with proportional timing.
- [ ] Dragging a cue on the timeline cannot overlap its neighbors.
- [ ] Word highlight renders when cues have word timings (use a generated test cue).

**State after:** subtitles are a first-class track.

---

## Batch 33 (optional): Local transcription

**Goal:** Generate captions locally from the timeline audio with word timestamps, with model download management and a review step.

**Spec refs:** §10.6, §14 (offline mixdown), §3.5 (`transcribe.worker`).

**Build:**
- `transcribe.worker` using a browser Whisper implementation (WebGPU backend when available), model selection (tiny/base/small), download with progress and cancel, cache status.
- Audio extraction (in/out or whole, 16 kHz mono) through an `OfflineAudioContext`; segmentation into cues with line length rules; language auto/override; replace-range confirmation; progress toast.
- Captions tab `Transcribe` button enabled.

**Acceptance:**
- [ ] A 60 s clip transcribes to cues with word timings; word highlight works out of the box.
- [ ] Cancel mid-transcription leaves the project unchanged.

**State after:** captions in one click, offline.

---

## Batch 34: Images, solids, shapes, animated images

**Goal:** Non-video layers: images (static and animated), solids and simple shapes with corner radius, gradients, and the `+ Solid` / `+ Image` one-click buttons.

**Spec refs:** §5.2 `SolidClip`, §6.1 (+ Solid, + Image), §9.1 (image formats, animated images), §9.3 (image textures), §11 (Solid properties: fill, shape, size, radius).

**Build:**
- Solid/shape clips: rect, rounded rect, ellipse, line, solid or two-stop gradient fill, size, corner radius; rendered by the solid pipeline (SDF for rounded corners and ellipse edges, anti-aliased).
- Image clips: SVG rasterized at the needed detail scale, animated GIF/WebP mapped to frame lists through `ImageDecoder` with a texture per frame (capped memory, lower fps if needed), `+ Image` opens the picker and places at the playhead on the top track (5 s default).
- Properties section for solids; gizmo support (size handles change `size`, not scale, for solids).
- Timeline bodies for these kinds.

**Acceptance:**
- [ ] `+ Solid` adds a centered rounded rectangle; corner radius and gradient edit live.
- [ ] An animated GIF plays in sync with the timeline at its own frame timing.
- [ ] An SVG logo stays sharp at 400%.

**State after:** overlays and backgrounds are available.

---

## Batch 35: Keyframes

**Goal:** Simple keyframes for transform, opacity and (model only, UI in Batch 37) volume: stopwatch workflow, timeline lane with diamonds, gizmo and field integration, easing, animated punch zoom.

**Spec refs:** §5.2 `Keyframes`, §6.4 (keyframe row), §6.15 (keyframe drags, context menu), §11 (stopwatch, navigator), §7.3 (gizmo keyframe behavior), §6.10 (keyframe policy on trims), and Batch 27's reserved `punchZoom.animated` setting.

**Build:**
- Evaluation (`core/document/keyframes.ts`): per-property sampling with easings (linear, ease in/out/in-out, hold, cubic presets), used by the compositor and the audio scheduler hook.
- Properties: stopwatch per animatable section, create/update at playhead when on, navigator (prev/add-remove/next), easing selector for the keyframe at the playhead, keyframe count badge.
- Timeline: `Show clip keyframes` toggle, per-clip lane with the chosen property (context menu chooser), diamonds drag with snapping (other keyframes, playhead, clip edges; Shift whole seconds), Alt+click add, selection and Delete, copy/paste keyframes (within the clipboard batch later; implement the commands now).
- Gizmo and fields write keyframes when the stopwatch is on; a diamond indicator on the gizmo.
- Split partitions keyframes; trims follow the policy; speed changes scale keyframe frames.
- Punch zoom animated version (`punchZoom.animated` default on): scale keyframes from 1.0 to 1.2 over 6 frames with ease out.

**Acceptance:**
- [ ] Enable the Transform stopwatch, move a layer at frame 0 and at frame 30: it animates between them; the lane shows two diamonds; dragging one retimes.
- [ ] Easing change is visible; hold easing jumps.
- [ ] Split a keyframed clip: both halves animate correctly; Undo merges.
- [ ] Punch zoom now animates.

**State after:** motion where it is needed, nowhere else.

---

## Batch 36: Fades and transitions

**Goal:** Fade handles for video opacity and audio gain on clips, cross-dissolve and dip-to-color transitions with handle logic, default transition, transition blocks on the timeline.

**Spec refs:** §6.15, §6.4 (fade handles, transition blocks, `fx` badge), §6.10 (trims over transitions), §9.4 (dissolve pipeline from Batch 05), §11 (Transition section, quick row chips, Fade in/out), §19 (handle).

**Build:**
- Fade handles on clip corners with drag, drawn curves, `fades` commands; Fade in/out quick actions (apply to video and linked audio), context menu presets.
- Transitions model: stored on the clips as in §5.2 (`transitionOut` on the left clip and `transitionIn` on the right clip share one transition id and are always edited together); kinds: cross-dissolve, dip to black, dip to white; handle computation; max-available behavior and repeated-edge-frame fallback with the striped warning; linked audio crossfade automatically.
- Timeline: transition blocks with edge drags (symmetric, Alt one-sided), double-click opens the Transition section, removal on split/delete, shortening on trims.
- Default transition (`Mod+Shift+D`) at the selected edit point or nearest junction; quick row chips apply to the selected edit point; drag a chip onto a junction.
- Compositor: two-clip evaluation at transition frames with the dissolve pipeline; dip via opacity to a solid.

**Acceptance:**
- [ ] Drag a fade handle: the opacity curve is visible on the clip and the preview fades; Undo one step.
- [ ] `Mod+Shift+D` on a cut with handles creates a 15-frame dissolve; without handles the block shows the warning stripes and still plays.
- [ ] Trimming across a transition shortens it, then removes it when no handle remains.
- [ ] Audio crossfades under a dissolve with no click.

**State after:** cuts can be softened in one click.

---

## Batch 37: Audio editing

**Goal:** Gain in dB with keyframes (rubber band), fades, normalize, detach audio, auto-duck, audio scrubbing.

**Spec refs:** §14 (all remaining), §6.4 (rubber band), §11 (Audio section), §8 (audio scrub), §6.1 (Audio scrub toggle).

**Build:**
- Audio section: gain dB field, mute, fades, Normalize (from peaks), Detach audio (unlink and move to its own track).
- Rubber band: gain line on audio clips at M/L, Mod+click adds a volume keyframe, drags with dB tooltip; scheduler applies gain curves via `setValueCurveAtTime` per chunk including fades and keyframes.
- Auto-duck music (one click on a music clip or track): keyframes at -12 dB with 10-frame ramps wherever audio clips on tracks above are present; parameters in settings.
- Audio scrub toggle: 40 ms grains from the `AudioBuffer`s at the scrub position with a tiny envelope; keyboard stepping also plays a grain when enabled.

**Acceptance:**
- [ ] Rubber band with three keyframes plays with audible ramps; exported later matches.
- [ ] Normalize sets a -1 dBFS peak (check with the meter).
- [ ] Auto-duck on a music track creates correct dips under two voice clips.
- [ ] Scrubbing with audio scrub on makes cut points audible without clicks.

**State after:** audio is mixable without a DAW.

---

## Batch 38: Silence detection and auto-cut

**Goal:** Detect silences in selected clips from peaks, preview candidate cuts on the timeline, apply as splits plus ripple delete in one transaction.

**Spec refs:** §14 (silence detection), §6.11 (ripple delete), §6.4 (overlay segments), §11 (a `Remove silence` quick action for audio-bearing clips).

**Build:**
- `analysis.worker` silence detection over peaks (20 ms windows, threshold dB, min silence, padding).
- UI: `Remove silence` quick action opens an inline parameter row (threshold slider with a dB readout, min silence, padding) with live red hatched segments on the selected clips and a count; `Apply` performs splits and ripple deletes as one undo step; `Cancel` clears.
- Works on linked video/audio pairs (video follows the audio analysis).

**Acceptance:**
- [ ] On a talking-head clip with pauses, the overlay marks the pauses; Apply removes them and the cut plays naturally with padding.
- [ ] Undo restores the original single clip.
- [ ] Analysis of a 10-minute clip completes in under 2 s (peaks-based).

**State after:** dead air is one click away from gone.

---

## Batch 39: Clipboard, duplicate, paste attributes

**Goal:** Cut/copy/paste within and across tracks at the playhead, paste insert, paste attributes (transform/opacity/text style/audio gain), duplicate, keyframe copy/paste, internal clipboard with system clipboard text mirror.

**Spec refs:** §18 (clipboard rows), §6.16 (clip menu items), §11 (Duplicate), §7.2 (canvas context menu), §6.8 (collision rules on paste).

**Build:**
- Internal clipboard (serialized clip subgraphs including linked pairs, keyframes, transitions where both sides are copied) with a JSON mirror on the system clipboard (so clips can be pasted into another project).
- Paste at the playhead on the targeted tracks keeping relative track offsets (overwrite); paste insert (ripple); paste attributes with a small checklist popover (transform, opacity, crop, speed, text style, animations, audio gain, fades).
- Duplicate (`Mod+D`): extend the Batch 25 command to multi-clip selections with links, groups, keyframes and transitions (copies land after the selection on the same tracks, next free spot, no ripple); canvas duplicate places the copy at +20 px on both axes.
- Keyframe copy/paste from the lane selection.
- Enable the placeholders left in the clip menu, canvas menu and quick row.

**Acceptance:**
- [ ] Copy two linked clips, move the playhead, paste: they land at the playhead on the targeted tracks with links intact.
- [ ] Paste attributes from a styled title onto five other titles applies only the checked groups.
- [ ] Paste into a second project (system clipboard JSON) works for clips referencing media present by name (otherwise offline slates).

**State after:** reuse is fast.

---

## Batch 40: Context menus, command ids audit, command palette, shortcut editor

**Goal:** Every action has one command id reachable from buttons, menus, keys and a searchable palette; context menus are complete per §6.16; shortcuts are editable.

**Spec refs:** §6.16 (all menus), §3.6, §18, §17, §11 (settings: shortcuts).

**Build:**
- Audit: all commands registered in one `CommandRegistry` with labels, categories, enabled predicates and icons; buttons/menus/keys resolve through it; dev check that every keymap action exists.
- Context menus complete for clip, gap, track header, ruler/marker, canvas, media card, preset card, cue row.
- Command palette (`Mod+Shift+P`): fuzzy search, shows shortcuts, runs commands, recent first.
- Shortcut editor in settings: rebind, conflict detection within scope, reset to defaults, export/import keymap JSON; tooltips reflect rebinding.
- In-app cheat sheet (`Shift+/`): grouped shortcut list rendered from the live keymap.

**Acceptance:**
- [ ] Every button and menu item in the app dispatches a registered command (dev assertion passes on startup).
- [ ] Rebind split to `Mod+J`: the toolbar tooltip and the palette show the new key; conflict with an existing binding is flagged.
- [ ] The palette finds `Close all gaps` by typing `compact`.

**State after:** the app is fully discoverable and rebinding-safe.

---

## Batch 41: Media panel advanced

**Goal:** Bins, search, filters, sorting, full list view, usage counts, missing media and relinking, removal with clip handling, reference-mode import.

**Spec refs:** §12 (all remaining), §9.1 (reference mode), §6.19 (offline clips).

**Build:**
- Bins strip (one level), move to bin, virtual bins; search; filter chips; sort; list view columns and resizing; usage counts and `unused` state; Reveal path (copy relative path).
- Reference import mode (handles in IndexedDB, permission re-request on open), missing media detection on open, red badges, offline slates on the timeline and in the composite (gray slate with the media name), Relink (single file and folder matching by name and size), `Remove and delete clips` dialog option with the `media/` file deletion checkbox.

**Acceptance:**
- [ ] Import in reference mode, move the source file, reopen: the item is flagged, clips show slates, relink restores everything.
- [ ] Filter `unused` and delete those items from the project in one dialog.
- [ ] Search narrows 200 items instantly; bins persist.

**State after:** media management holds up on real projects.

---

## Batch 42: Project management

**Goal:** Templates, project settings conversions (resolution scale, fps conversion), recent projects polish with thumbnails, read-only mode, history restore UI, settings panel with cache control.

**Spec refs:** §15 (all remaining), §11 (Project section: all settings), §9.7 (clear cache).

**Build:**
- Templates (save/new from); resolution change with `Scale layout`/`Keep` and fps conversion with the rational ratio and lossy warning (and keyframe/caption conversion); recent projects with a thumbnail captured at the playhead on close; read-only mode behaviors; `History` list (restore a backup as the current document, with confirmation); settings panel (autosave interval, proxies, default durations, default transition, punch zoom amount, audio ducking parameters, cache size and clear, library folder, theme if DESIGN_SYSTEMS.md provides variants).

**Acceptance:**
- [ ] Convert a 30 fps project to 60 fps: clip timings are preserved to the frame; captions and keyframes convert; Undo reverts.
- [ ] Restore a history backup: the document switches, autosave resumes, a new history entry is created for the pre-restore state.
- [ ] Clear cache, reopen: proxies/thumbs/peaks regenerate automatically.

**State after:** projects are safe and flexible.

---

## Batch 43: Export engine

**Goal:** Real MP4 export in a worker: offscreen compositor at export size, H.264 (and HEVC/AV1 when supported) encoding with backpressure, offline audio mixdown to AAC, muxing streamed to disk, progress, cancel, pause, editing allowed during export.

**Spec refs:** §16 (pipeline, verification), §9.4 (offscreen path), §14 (offline mixdown), §3.5 (`export.worker`), §4 P14.

**Build:**
- `export.worker`: own WebGPU device and `FrameService` (full LOD only), compositor rendering into an `OffscreenCanvas`, `VideoFrame` per frame with exact rational timestamps, `VideoEncoder` configuration from presets with `isConfigSupported` fallbacks, backpressure (`encodeQueueSize < 4`), keyframe interval <= 2 s, `mp4-muxer` with `fastStart: 'in-memory'` under 2 GB else fragmented, streaming to a `FileSystemWritableFileStream` in `exports/`.
- Offline audio: the Batch 10/37 scheduler against an `OfflineAudioContext` for the range -> `AudioEncoder` AAC-LC -> interleaved muxing.
- Job control: progress (frames, ETA moving average), cancel (temp deleted), pause/resume; texture budget split while exporting; playback forced to proxy during export.
- Minimal temporary UI: Export button runs the Instagram preset on the whole timeline (full UI next batch).

**Acceptance:**
- [ ] A 60 s 1080x1920 30 fps project exports in under 2x realtime on the dev machine; the file plays in Chrome and VLC; `ffprobe` (if available) shows moov first, 30 fps, AAC 48 kHz.
- [ ] Upload to Instagram succeeds without re-encode errors (manual check, record in PROGRESS.md).
- [ ] Audio/video drift over a 10-minute test export under 1 frame.
- [ ] Cancel at 50% leaves no file in `exports/`.
- [ ] Editing (trim, move) during an export works and does not corrupt the export (export reads a snapshot of the document taken at start).

**State after:** finished videos come out of the editor.

---

## Batch 44: Export UX

**Goal:** The Export tab with presets, range, destination, custom settings, queue and log, and the extras (frame, audio, captions, copy frame).

**Spec refs:** §16 (UX, presets, extras, after-export), §17 (Export tab), §2.2 (tab behavior in the properties panel), §6.13 (in/out range from Batch 19).

**Build:**
- Export tab in the properties panel (Esc/close returns), preset chips (Reels, TikTok, Shorts, Custom) editable and saveable, range toggle (whole / in-out), filename template, destination (project `exports/` or picker), codec/resolution/fps/bitrate/keyframe/audio settings for Custom with support detection, estimated file size.
- Queue (sequential jobs), per-job progress cards with pause/cancel, log of the last 20 jobs, after-export toast with path and size, `Export again`.
- Extras: Export frame PNG (project size), Export audio (WAV / M4A), Export captions (SRT/VTT), Copy frame to clipboard.

**Acceptance:**
- [ ] Queue three exports with different presets: they run in order with independent progress; cancel the second: the third still runs.
- [ ] Export frame produces a 1080x1920 PNG identical to the composite at the playhead (no overlays).
- [ ] In/out range export has exactly the right frame count.

**State after:** exporting is a two-click operation with full control when needed.

---

## Batch 45: Performance pass

**Goal:** Measure against the budgets in §4 and fix what misses, with the numbers recorded.

**Spec refs:** §4 (all), §8, §9.3, §6.17, §3.4.

**Build:**
- Dev stats overlay (toggle) with: React commits per second, content/overlay redraws per second, decode latency percentiles, dropped frames, texture pool bytes, open VideoFrames, worker queue depths, main-thread long tasks.
- Benchmarks (dev commands): 500 clips/8 tracks interaction, 20-minute 4K60 scrub on proxy, 60 s export, startup time; results written to `docs/PROGRESS.md` under Batch 45 with before/after.
- Fixes as needed: decoder lookahead tuning, cache pinning, thumbnail request coalescing, draw-list reuse, font measurement caching, subscription narrowing, worker message batching. Any architectural deviation is documented.

**Acceptance:**
- [ ] P1 verified: zero React commits during playback, scrub, clip drag, gizmo drag, field scrub.
- [ ] P14 budgets met or the shortfall is explained with a plan.
- [ ] No main-thread task over 50 ms during import of 10 files, except file copy progress ticks.
- [ ] Memory returns to baseline (±10%) after closing a project (no leaked textures/frames/decoders).

**State after:** fast, measurably.

---

## Batch 46: Visual polish and design-system compliance

**Goal:** Every state has feedback; the UI matches `DESIGN_SYSTEMS.md` exactly; no layout shifts; cursors, tooltips, empty states, toasts and focus rings are consistent.

**Spec refs:** §0 (premium), §2.1, §17 (disabled, never hidden), §6.4, §6.18 (cursors), §7.3 (readouts).

**Build:**
- Audit every button, field, menu, card and canvas-drawn control against the design system (sizes, radii, spacing, type scale, color roles, hover/active/focus/disabled); fix deviations; remove any remaining literal values.
- Cursors for every hit type; tooltips with shortcuts everywhere; empty states (no media, no clips, no presets, no cues) with the one-click action to fix them; toasts (success/info/warning/error) with consistent placement; focus rings for keyboard navigation; loading states (proxy, thumbnails, export).
- Drag feedback polish: ghost opacity, snap line animation (none or 80 ms fade, per DS), edge auto-scroll acceleration curve.
- Resize behavior: no reflow jank when dragging splitters (throttle canvases to one realloc per frame).

**Acceptance:**
- [ ] A pixel pass of each panel against the design system tokens finds no deviation (list checked items in PROGRESS.md).
- [ ] Keyboard-only navigation can reach every control in the properties panel and the toolbars.
- [ ] No layout shift when toggling any state (disabled buttons keep their space).

**State after:** it looks and feels finished.

---

## Batch 47: Stability and tests

**Goal:** Harden the engine and the media paths: broader tests, invariant fuzzing, error boundaries, decode failure handling, memory checks.

**Spec refs:** §5.2 invariants, §6.19, §1.4, §9.2, §15 (crash recovery), §4 P13.

**Build:**
- Tests: extend `timeline/edit` coverage to every operation with locked tracks, links, groups, transitions, keyframes; property-based fuzz (random operation sequences keep invariants; undo returns to the start); SRT/VTT, time math and serialization edge cases.
- Runtime: React error boundaries per panel with a reload-panel action; worker crash recovery (restart the worker, re-request frames); decode error paths (corrupt file, unsupported codec after `isConfigSupported` says yes, HDR content tone-mapped to SDR via `copyExternalImageToTexture` color space handling) with media badges and offline slates; GPU device loss during export (fail the job cleanly).
- Memory: dev assertion that open `VideoFrame`s are zero after idle; `GPUTexture` count stable across 100 open/close project cycles (scripted).

**Acceptance:**
- [ ] 10,000-operation fuzz runs green in CI time (< 60 s).
- [ ] Killing the decode worker from DevTools recovers playback within 2 s.
- [ ] A corrupt MP4 imports as failed with a clear badge; the app never shows a blank screen.
- [ ] HDR iPhone footage shows without washed-out colors (documented approach).

**State after:** trustworthy.

---

## Batch 48 (optional): WebGL2 renderer fallback

**Goal:** A second `Renderer` implementation for machines without WebGPU, feature-complete for the compositor's needs.

**Spec refs:** §3.1 (Renderer interface), §5 pipelines parity, §1.4 (replace the unsupported screen's WebGPU requirement with WebGL2 when this ships).

**Build:** WebGL2 backend (textured quads, dissolve, solids, offscreen targets, `texImage2D` from `VideoFrame`), automatic selection, parity screenshots, export worker parity (OffscreenCanvas WebGL2).

**Acceptance:**
- [ ] Force WebGL2 via a dev flag: all visual acceptance checks from Batches 08, 21, 28, 36 pass with identical screenshots (± compression).

---

## Batch 49 (optional): WebM (VP9/AV1) sources

**Goal:** Demux WebM/Matroska for decode, proxies and thumbnails.

**Spec refs:** §9.1, §9.2.

**Build:** EBML demuxer (small, own implementation or a permissive library noted in PROGRESS.md) producing the same sample index format; codec configuration for VP9/AV1; `decodeAudioData` continues to handle audio.

**Acceptance:**
- [ ] A VP9 WebM screen recording imports, scrubs, plays and exports.

---

## Batch 50: Release checklist

**Goal:** A clean build, in-app help, documentation, and a release tag.

**Spec refs:** §1.4, §17, §18, §15.

**Build:**
- Production build served statically with the required headers (none beyond standard; document if COOP/COEP is needed for anything added); versioned `appVersion` in `project.json`.
- README (setup, browser requirements, folder layout, shortcuts cheat sheet generated from the keymap), `docs/ARCHITECTURE.md` summarizing §3 as implemented (one page), `docs/PROGRESS.md` closed out with a known-issues list.
- Final pass of all `Do not build yet` hooks: every `TODO(batch NN)` is either resolved or moved to a `docs/BACKLOG.md` with context.
- Tag `v1.0.0`.

**Acceptance:**
- [ ] A fresh clone builds and runs with `npm ci && npm run build && npm run preview`.
- [ ] Zero `TODO(batch` comments remain in `src/`.
- [ ] The full common path (import, cut, compact, title, subtitle, export) is recorded as a short screen capture and linked in PROGRESS.md.

**State after:** v1 shipped.

---

## Batch 51: Font library: hundreds of categorized fonts, weight filters, your own fonts

**Goal:** A bundled library of 200-300 open-license fonts sorted by look (Luxury, Bold, Futuristic, Handwritten, ...) with weight filters, a fast font browser with live previews on the canvas, and importing your own font files.

**Spec refs:** §20.1, §10.1, §11 (Text section), §15, §16, §5.2 `TextClip`, §4.

**Build:**
- `scripts/fonts/families.json`: the curated list (at least 200 families, target about 300) with categories and tags per §20.1. `scripts/fonts/fetch-library.mjs` (Node 22 `fetch`, no new dependency): downloads the woff2 Latin and Latin Extended subsets (variable font where available, otherwise each existing static weight and italic) and the license texts, writes `public/fonts/library/` with `catalog.json`, and prints the total size. Run it and commit its output.
- `src/text/fonts/catalog.ts`: lazy catalog loading, search over names, categories and tags, category and weight-band filtering, sorting. Unit tests.
- Font loading: extend the Batch 28 font module with on-demand `FontFace` loading per family, weight and subset (at most 6 in flight, cancellable, cached for the session). Workers that rasterize text, and the export worker, register the same font descriptors before rendering.
- Font browser replacing the Batch 28 picker popover: search, category chips, weight chips, sections (Recent, Favorites, My fonts, Library, On this computer), a virtualized list whose rows are rendered in their own font, favorite stars, keyboard navigation, hover and Up/Down live preview on the selected text clips (ephemeral), commit on click or Enter, Esc restores.
- My fonts: `Add fonts` button and file drops on the font browser and the Presets tab; validation through `FontFace`; a `name` table parser for TTF/OTF/WOFF (unit tests with small fixture fonts) with the file-name fallback; storage in the global IndexedDB store and the library folder; rename, categories and tags, remove.
- Projects: a font record with its source (`library`, `user`, `system`); every used font is copied into `<project>/fonts/`; missing-font fallback and badge for all sources; schema version bump with a migration if the record shape changes.
- `Settings > About > Font licenses`.
- New actions (open font browser, add fonts, toggle favorite) registered in the `CommandRegistry` with palette entries (Batch 40).

**Do not build yet:** the preset bar and the starter pack (Batch 52), caption styles per cue (Batch 53). No online font search or runtime download: the library ships with the app.

**Implementation notes:** Choosing the families is a curation job: pick faces that clearly read as their category at caption sizes, and prefer families with several weights in Luxury, Bold and Futuristic so the weight filter has results. Check every family's license in its metadata before adding it. If a download fails, drop the family and list it in `PROGRESS.md`. Batch 52's starter presets will use library fonts, so include strong caption faces. This batch comes after the quality passes of Batches 45-47, so it carries their rules itself: measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly (log gaps), and extend the property-based tests of Batch 47 to font records.

**Acceptance:**
- [ ] The library has at least 200 families under redistributable licenses, every family in at least one category, and Luxury, Modern, Bold, Futuristic and Handwritten have at least 25 families each. The total size is recorded in `PROGRESS.md` and is at most 40 MB. The app builds and runs with the network off.
- [ ] Category Luxury with weight Bold lists only families that have a bold weight, each row rendered in it. Clicking one sets the family and the weight on the selected text clip in one undo step.
- [ ] Hovering rows or moving with Up/Down previews the font on the canvas without an undo step; Esc restores the original font.
- [ ] Scrolling the whole list holds 60 fps, and only visible rows load their font files (load counter or network panel).
- [ ] Dropping a `.ttf` and a `.woff2` file adds both to My fonts (family names from the `.ttf` and from the `.woff2` file name). They are available in a second project, and a project that uses one still renders with it after the font is removed from My fonts (copy in `fonts/`).
- [ ] An exported MP4 of a project with library, imported and system fonts matches the preview.

**State after:** hundreds of fonts, sorted by look, one click away.

---

## Batch 52: Preset bar above the preview: visual one-click text presets

**Goal:** A strip of visual preset buttons at the top of the preview, each showing exactly how its text looks, that adds or restyles text in one click, plus a starter pack of about 40 presets.

**Spec refs:** §20.2, §10.2, §10.3, §2.1, §7.8, §13, §17, §18, §20.1, §4.

**Build:**
- Preset model: `sampleText?` and set membership (Titles, Subtitles, Captions, user tags), with a schema migration if needed. Unit tests.
- Thumbnail service: preset to `ImageBitmap` through the text engine at the bar's button size and device pixel ratio, cached per preset id and style hash, generated through the idle queue and again when the preset changes; the Presets tab cards switch to it.
- `PresetBar` in the preview panel: the set selector, the scrollable row of visual buttons, `+` (save the selection as a preset into the current set) and `Manage`; the `Presets` toggle in the preview header; visibility and the chosen set persisted in session state; the canvas re-fits when it is toggled.
- Click and hover behavior for each selection kind of §20.2 (text clips, caption track, nothing: create the clip and start inline editing). Cue selections: leave a `TODO(batch 53)` hook.
- `Alt+1`..`Alt+9` in the keymap (global scope), shown in the tooltips and listed in the shortcut editor and the cheat sheet.
- Right-click menu, drag to reorder, wheel and arrow scrolling.
- Remove the favorite chips from the timeline toolbar and update its overflow groups.
- Starter pack: about 40 presets in the Titles, Subtitles and Captions sets (§20.2), using library fonts. Starters from Batch 30 that match a new one keep their ids, so defaults and favorites survive.

**Do not build yet:** styles per caption cue (Batch 53).

**Implementation notes:** The bar must cost the preview nothing: thumbnails are `ImageBitmap`s drawn into the buttons, never rasterized during playback, and hover is handled through direct DOM or canvas state rather than React state per button. Buttons must be tall enough for the style to read; the design system's control heights are for controls, so log the chosen thumbnail size as a design gap. This batch comes after the quality passes of Batches 45-47, so it carries their rules itself: measure the §4 budgets it touches (playback with the bar visible), follow `DESIGN_SYSTEM.md` exactly, and register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] With nothing selected, one click on a bar button creates a text clip at the playhead with exactly that look and starts inline editing; typing replaces the content.
- [ ] With three text clips selected, one click restyles all three in one undo step; hovering another button previews it on the canvas, and moving away restores.
- [ ] `Alt+3` applies the third visible button, and its tooltip shows `Alt+3`.
- [ ] Every button shows the real look of its preset (font, weight, fill, stroke, shadow, box) and updates when the preset is updated.
- [ ] Hiding the bar re-fits the preview without a jump and is remembered after a reload. Playback with the bar visible holds 60 fps with zero React commits.
- [ ] The starter pack has about 40 presets in the Titles, Subtitles and Captions sets, and the timeline toolbar no longer shows favorite chips.

**State after:** the look of any text is one visible click away.

---

## Batch 53: Caption styles per cue: fonts, colors, sizes and positions

**Goal:** Any caption cue can have its own font, color, size and position on top of the track's caption style, set from the properties panel, the preset bar or by dragging it on the canvas, with v1.1 closed out.

**Spec refs:** §20.3, §10.5, §5.2, §11, §7.2, §7.3, §7.4, §7.7, §10.6, §20.2, §4.

**Build:**
- Model: `CaptionClip.styleOverride` and `presetId`, schema version bump with a migration, validation, and the effective-style resolver. Unit tests, including old projects opening unchanged.
- Commands: set and reset cue overrides, copy and paste style; split, merge, move, trim, undo and redo carry the override as §20.3 says. Unit tests for each.
- Properties panel: the `All cues | Selected (n)` scope switch, overridden-field markers, per-field reset and `Reset to track style`.
- Preset bar and Presets tab apply to selected cues (resolve the Batch 52 `TODO(batch 53)`).
- Canvas: the active cue's caption can be selected and dragged per cue with snapping and smart guides; corner handles change its font size; `All cues` scope moves the track position; double-click edits the cue text inline.
- Cue list: Shift and Ctrl multi-select, the style dot, and the context menu items; paste attributes offers `Caption style` for cues.
- Timeline: a small badge on caption clips with an override.
- Rendering: the raster cache keyed by the effective style; per-cue positions and highlight colors in the compositor and the export.
- Property-based tests of Batch 47 extended with cue overrides (random edit sequences keep the document valid; undo returns to the start).
- v1.1 close-out: the README and `docs/user-guide/` are current, `appVersion` is `1.1.0`, zero `TODO(batch` comments remain in `src/`, tag `v1.1.0`.

**Do not build yet:** rich text inside one cue (several fonts or colors within a cue) stays out of scope (§10.1), apart from the word highlight.

**Implementation notes:** Keep the track style as the single default and the override as a sparse set of fields, so changing the track style still changes every field a cue did not override. Dragging a caption is a gesture: ephemeral state while dragging, one command on release, no React commits. This batch comes after the quality passes of Batches 45-47, so it carries their rules itself: measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, and register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] Select two cues, switch to `Selected (2)` and change the font, color and size: only those two cues change, in one undo step, and the others keep the track style.
- [ ] Dragging one cue's caption to the top of the frame snaps to the safe zone and moves only that cue; in `All cues` scope the whole track moves.
- [ ] Applying a Captions preset from the preset bar to selected cues styles them, and `Reset to track style` returns them to the track style.
- [ ] Splitting a styled cue keeps the style on both halves, merging keeps the first cue's style, undo and redo restore exactly, and a project saved before this batch opens unchanged.
- [ ] Word highlight uses each cue's own colors.
- [ ] The exported MP4 shows every cue with its own style and position, identical to the preview.

**State after:** every caption can look and sit exactly as needed; v1.1 shipped.
