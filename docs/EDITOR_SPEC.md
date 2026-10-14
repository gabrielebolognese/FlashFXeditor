# Shorts Editor: Master Specification

Working name: **Shorts Editor** (rename freely; nothing in this document depends on the name).

This is the product and architecture reference for a browser-based editor built for ONE purpose: editing my own short-form vertical videos (Instagram Reels, TikTok, YouTube Shorts) as fast as possible. It is a cutting, layout and text tool with a premium, Premiere-grade timeline. It is not a motion graphics tool and not a color grading tool.

Companion documents:

- `DESIGN_SYSTEMS.md` (repo root): the ONLY source of truth for colors, typography, spacing, radii, icon size, button size, control heights, shadows, theme. Every UI decision about appearance defers to it. If it is silent on something, use the functional defaults written here and note the gap in `docs/PROGRESS.md`.
- `docs/BATCHES.md`: the ordered implementation plan. Work is done one batch at a time through the `/next-batch` command.
- `docs/PROGRESS.md`: what is done, what deviated, what is pending (created by the command setup).

Section numbers in this document are stable and are referenced from `BATCHES.md` as `Spec §6.9` etc. Do not renumber sections.

---

## 0. How to read this document (for Claude Code)

- Everything marked **BINDING** is a rule, not a suggestion. Deviating requires a note in `docs/PROGRESS.md` explaining why.
- "One click" means: the action is reachable from a visible button with no dropdown, no sub-panel, no modal, no confirmation. Dropdowns are allowed only for choosing among many values (fonts, presets lists, export presets), never for reaching an action.
- "Premium" means: nothing lags, nothing jumps, every drag has a live preview, every snap is visible, every state has hover and active feedback, keyboard works everywhere, nothing requires a page reload.
- Scope discipline: build exactly what the current batch asks. Leave hooks (interfaces, TODOs with batch numbers) for future batches instead of partial implementations of future features.

---

## 1. Product definition

### 1.1 Goal

Edit a raw phone recording (or several) into a finished vertical short in minutes: cut the bad parts, compact the clips, add titles and subtitles from presets, place things on the canvas precisely, export an upload-ready MP4. Everything else is secondary.

### 1.2 Principles (in priority order)

1. **Speed of the common path**: import, cut, trim, compact, add text, export. Each of these is measured in clicks and keystrokes and kept minimal.
2. **Instant feedback**: scrubbing shows frames immediately, trims show the new edge frame while dragging, moving on the canvas is 60 fps, text edits re-render within one frame.
3. **Direct manipulation**: things are edited where they are seen (clips on the timeline, layers on the canvas, text on the canvas) and the properties panel is the precise-value fallback, not the main path.
4. **No hidden UI**: the most used actions are visible buttons, not menu items. Small buttons, many of them, grouped sensibly.
5. **Robustness**: projects live in a real folder on disk, autosave always, undo always, media never gets "lost".

### 1.3 Non-goals (BINDING: do not build these unless a batch explicitly asks)

- Color grading, LUTs, curves, scopes.
- Effects beyond: transform, opacity, crop, speed, fades, cross-dissolve, dip to color, simple drop shadow / stroke / background on text and images.
- Nested sequences, multicam, 3D, camera, masks, tracking, blend modes, adjustment layers.
- Collaboration, cloud sync, accounts, analytics, plugins, scripting.
- Mobile layouts, touch-first UI, Safari/Firefox support.
- AI generation of any kind (optional local transcription for captions is the single exception, and it is an optional batch).

### 1.4 Target platform

- Desktop Chromium (Chrome / Edge, current stable). Required APIs: WebGPU, WebCodecs (VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, VideoFrame, ImageDecoder), File System Access API (`showDirectoryPicker`, `showSaveFilePicker`), Web Audio, Web Workers with transferables, OffscreenCanvas, `requestVideoFrameCallback`.
- Windows is the primary machine. Minimum useful display: 1600x900. Designed for 1920x1080 and up.
- No server. The app is a static site (Vite build) opened locally or from a static host. All media stays on the user's disk.
- Unsupported browser: show a single full-screen message listing the missing APIs. No degraded mode.

---

## 2. Reference layout (BINDING)

The layout comes from the reference mockup and is fixed. Description of the mockup (1280x720 frame, four colored regions with labels):

- **MEDIA** (red): top-left region, roughly 34% of the width and 50% of the height.
- **EDIT PROPERTIES** (blue): top-middle region, right of MEDIA, roughly 35% of the width and 50% of the height. Together MEDIA and EDIT PROPERTIES fill the top half of the left ~68% of the window.
- **PREVIEW VERTICAL** (green): the entire right column, roughly 32% of the width, full window height. It is tall and narrow on purpose: the content is 9:16, so the preview is portrait.
- **TIMELINE** (yellow): the bottom half of the left ~68%, spanning under both MEDIA and EDIT PROPERTIES. It is the widest panel.

Resulting structure:

```
+------------------+------------------+--------------+
|      MEDIA       | EDIT PROPERTIES  |              |
|                  |                  |   PREVIEW    |
+------------------+------------------+   VERTICAL   |
|              TIMELINE               |              |
|                                     |              |
+-------------------------------------+--------------+
```

### 2.1 Layout rules

- Three resizable splitters: (a) vertical splitter between the left group and PREVIEW; (b) horizontal splitter between the top row (MEDIA + EDIT PROPERTIES) and TIMELINE; (c) vertical splitter between MEDIA and EDIT PROPERTIES. Splitter positions persist per project and globally (last used).
- Defaults: left group 68%, preview 32%; top row 50% / timeline 50%; MEDIA 49% / EDIT PROPERTIES 51% of the top row.
- Minimum sizes: MEDIA 280px wide, EDIT PROPERTIES 320px wide, PREVIEW 300px wide, TIMELINE 220px tall, top row 220px tall.
- Above the four panels: a slim **app bar** (height from DESIGN_SYSTEMS.md): project name (editable), save status dot, undo/redo, project fps/resolution badge, "Export" button, settings gear. No menus. The app bar is the only element outside the four panels.
- Panels never float, never undock, never tab into each other (except the tabs that live inside a panel, defined per panel below). This keeps the layout predictable and makes shortcuts per panel unambiguous.
- Each panel has a header strip (title or tabs on the left, panel-specific one-click buttons on the right). Headers are the home of most one-click actions (see §17).
- Everything is resize-aware via `ResizeObserver`. Canvases (timeline, preview) re-allocate backing stores at `devicePixelRatio` on resize, throttled to one reallocation per animation frame.

### 2.2 Panel contents at a glance

- **MEDIA**: tabs `Media | Presets | Captions`. Media grid/list with hover-scrub previews, import, bins, search, proxy state. Presets = text preset library. Captions = cue list editor for the caption track.
- **EDIT PROPERTIES**: context panel for the current selection (clip, text, caption cue, track, nothing = project settings) with a quick-action row at the top. Also hosts the `Export` tab when the Export button is pressed (the tab appears and gets focus; closing returns to properties).
- **PREVIEW VERTICAL**: the program monitor. Composited frame at the playhead, direct manipulation of layers, transport controls, timecode, zoom, quality, safe zones, audio meter.
- **TIMELINE**: toolbar strip (tools, toggles, one-click edit actions, one-click add actions, zoom), track headers, ruler, tracks, scrollbars.

---

## 3. Architecture

### 3.1 Stack (BINDING unless a batch says otherwise)

- Language: TypeScript, `strict: true`, ES2022 target. Vite for dev/build. Vitest for unit tests of the engine (no UI tests required).
- UI chrome: React 18+ for panels, toolbars, inputs, lists, dialogs. React is used for **chrome only**. The timeline, the preview canvas, the gizmo overlay and the text rasterizer are framework-free TypeScript classes rendering to `<canvas>` elements. React mounts them once and never re-renders them.
- Styling: plain CSS (CSS Modules or a single BEM stylesheet, pick one and stay consistent). All values come from CSS custom properties generated from `DESIGN_SYSTEMS.md`. No CSS-in-JS runtime, no Tailwind, no UI component library. Icons: the set named in `DESIGN_SYSTEMS.md`; if none is named, use `lucide-react` with tree-shaken imports.
- Rendering: WebGPU compositor (WGSL). A `Renderer` interface isolates the backend so a WebGL2 backend can be added later (optional batch) without touching callers.
- Media: WebCodecs for decode/encode. `mp4box.js` for MP4/MOV demux and sample indexing. `mp4-muxer` for MP4 muxing on export. Web Audio for playback and offline mixdown. `idb-keyval` (or a 40-line IndexedDB wrapper) for persisted handles and global settings. Immer with `produceWithPatches` for document commands (patches drive undo). Nothing else without a note in PROGRESS.md. No lodash, no moment, no state-management framework, no CSS frameworks.
- Fonts for content: a curated bundled set (variable fonts, open licenses) plus the Local Font Access API (`queryLocalFonts`) for system fonts. UI font: whatever DESIGN_SYSTEMS.md says.

### 3.2 Module map

```
src/
  app/            React shell: layout, splitters, app bar, panel frames, dialogs
  core/
    document/     types, schema, validation, migrations, time math
    commands/     command definitions (do), undo stack (patches), transactions
    store/        document store, selection store, viewport stores, subscriptions
    scheduler/    frame scheduler, invalidation flags, idle task queue
    keyboard/     keymap, focus scopes, dispatcher, shortcut editor data
    theme/        reads CSS variables into a typed Theme object for canvases
  media/
    bytes/        ByteSource (File.slice based), range reader
    demux/        mp4box wrapper, sample index builder, cache serialization
    decode/       VideoDecodeSession (worker side), AudioDecoding, ImageDecoding
    workers/      worker entry points, message protocol, worker pool
    cache/        frame cache, texture pool, thumbnail sprites, peaks pyramid
    proxy/        proxy generation pipeline
    probe/        metadata extraction (dimensions, fps, rotation, duration, codecs)
  render/
    gpu/          WebGPU device, pipelines, texture upload, layer draw, offscreen render
    compositor/   evaluates the document at a frame -> draw list -> Renderer
    text/         text layout + rasterization to textures, glyph/line atlas cache
    preview/      preview viewport (fit/zoom/pan), overlays, gizmo, guides
  timeline/
    model/        timeline queries (clips at time, edit points, gaps, neighbors)
    edit/         pure editing operations (move, trim, ripple, roll, slip, slide, split, close gaps)
    snap/         snap candidate collection and resolution
    view/         canvas renderer (content layer + overlay layer), hit testing, gestures, tools
    toolbar/      React toolbar
  audio/          AudioContext graph, scheduler, meters, offline mixdown, scrub grains
  text/           text styles, presets library, animation presets, captions model, SRT/VTT
  project/        folder access, project file, autosave, backups, recent projects, cache dir
  export/         export jobs, encoder pipeline, muxer, presets, queue
  panels/         React panels: media, properties, preview chrome, captions, presets, export
  ui/             small shared React controls (NumberField with scrub, ColorField, Select, Toggle, IconButton, Tooltip, ContextMenu)
```

### 3.3 State model (BINDING)

There are four kinds of state and they must not be mixed:

1. **Document** (`Project`): the persistent, undoable truth. Immutable object graph updated only through commands. Serialized to `project.json`. Contains no derived or UI data.
2. **Session state**: not undoable, persisted per project but harmless to lose: selection, playhead, in/out, timeline zoom/scroll, preview zoom/pan, panel sizes, active tool, toggles (snap, link, ripple), track heights.
3. **Ephemeral state**: lives only during an interaction: the current drag gesture (ghost positions, snap result, trim preview), hover state, marquee rectangle, scrub state. Stored in plain mutable objects owned by the view that runs the gesture. Never in React state, never in the document.
4. **Derived caches**: thumbnails, peaks, frame cache, texture pool, text rasters, layout measurements. Rebuildable; invalidated by document changes through explicit keys.

Store mechanics:

- `DocumentStore` holds the current `Project` and exposes `getState()`, `subscribe(listener, selector?)`, `dispatch(command)`. Commands are functions `(draft, ctx) => void` run through Immer `produceWithPatches`; the inverse patches go onto the undo stack. Commands declare a `label` (for the undo history), a `coalesceKey` (consecutive commands with the same key within 300 ms merge into one undo step, used by scrubbable number fields and nudging) and `affects` (a set of invalidation flags, see §3.4).
- A **transaction** groups several commands into one undo step (e.g. "ripple delete" = delete + shift clips).
- Subscribers receive `(state, prevState, affects)` and bail out cheaply when their flags are not in `affects`.
- React reads the store through `useSyncExternalStore` with narrow selectors (a text field subscribes to one clip's one property). The timeline view, the compositor and the audio engine subscribe directly, not through React.
- Selection is `{ clipIds: Set<ClipId>, primary: ClipId | null, kind: 'clips' | 'track' | 'cue' | 'none' }` and lives in `SessionStore`, with its own subscription channel.

### 3.4 Render scheduler and invalidation (BINDING)

- One `FrameScheduler` wraps `requestAnimationFrame`. Views call `scheduler.invalidate('timelineContent' | 'timelineOverlay' | 'preview' | 'previewOverlay' | 'meters' | ...)`. The scheduler runs at most one frame per rAF, calls each dirty view's `render()` once, clears flags. Nothing renders outside this loop (except React chrome, which renders on its own when its narrow selectors change).
- Invalidation flags carried by commands (`affects`): `timeline`, `clips`, `tracks`, `media`, `text`, `captions`, `markers`, `settings`, `audio`. Views map flags to their own dirty state.
- Idle work (thumbnail generation requests, peaks, proxy status polling, font preloads) runs through an `IdleQueue` that executes in `requestIdleCallback` slices with a deadline, never during playback (the queue pauses while playing or dragging).

### 3.5 Workers

- `decode.worker.ts`: owns `VideoDecodeSession`s (one per media in use), the demuxer and sample index. Receives `requestFrame(mediaId, timeUs, priority, lod)` and `prefetch(mediaId, fromUs, toUs)`; posts `VideoFrame`s (transferred) tagged with request ids. Supports cancellation by priority class (scrub requests cancel pending playback prefetches of the same media).
- `analysis.worker.ts`: thumbnails (sprite sheets), waveform peaks, silence detection. Low priority, chunked, cancellable.
- `proxy.worker.ts`: decode -> scale -> encode proxy files to the cache dir. Runs one job at a time, reports progress.
- `export.worker.ts`: offscreen WebGPU compositor + VideoEncoder + muxer streaming to a `FileSystemWritableFileStream`.
- `transcribe.worker.ts` (optional batch only).
- One typed message protocol module shared by all workers (`media/workers/protocol.ts`), with request ids, priorities and `AbortSignal`-like cancellation.

### 3.6 Keyboard manager and focus scopes (BINDING)

- A single `KeyDispatcher` listens on `window` (`keydown`/`keyup`). It knows the current **focus scope**: `global`, `timeline`, `preview`, `media`, `properties`, `textEditing`, `dialog`. The scope is set by the panel that last received a pointer down or focus. Text inputs always own their keys first (typing never triggers shortcuts).
- Keymaps are data (`keymap.ts`): `{ id: 'edit.split', keys: ['Mod+K'], scope: 'global' | 'timeline' | ..., when?: (ctx) => boolean }`. `Mod` = Ctrl on Windows/Linux, Cmd on macOS.
- Shortcuts dispatch **commands by id** (same ids used by buttons, context menus and the command palette). Every user-facing action has exactly one command id.
- J/K/L and arrow keys use `keydown` repeat suppression and `keyup` handling (holding L accelerates in Premiere style, see §8).
- Browser defaults that conflict (Ctrl+S, Ctrl+O, Ctrl+K, Ctrl+=, Ctrl+-, Space scrolling, Backspace navigation) are `preventDefault`ed only when the scope handles them.

### 3.7 Theme bridge for canvases

- `core/theme/theme.ts` reads the CSS custom properties defined by DESIGN_SYSTEMS.md from `getComputedStyle(document.documentElement)` into a typed `Theme` object once at startup and again whenever the theme changes (a `MutationObserver` on the `data-theme` attribute or whatever DESIGN_SYSTEMS.md prescribes). Canvas renderers read colors, font families and sizes from `Theme`, never from literals.
- A lint rule (`no-restricted-syntax` on hex colors and `rgb(`/`hsl(` in `.ts`/`.tsx` under `src/`, plus a stylelint rule or a grep script for `.css`) fails the build when a color literal appears outside the generated tokens file.

---

## 4. Performance rules (BINDING)

- **P1** React renders are forbidden on: playhead movement, scrolling, zooming, dragging, scrubbing, hover. Verify with React DevTools Profiler: zero commits during 10 s of playback and during a clip drag.
- **P2** Gestures write ephemeral state only. The document receives exactly one command (or one transaction) at gesture end. Live preview during the gesture is drawn by the view from the gesture object.
- **P3** All canvases render only when invalidated, through the single scheduler. The timeline uses two stacked canvases: a **content** canvas (ruler, tracks, clips, thumbnails, waveforms, markers; redrawn on document/zoom/scroll/selection changes) and an **overlay** canvas (playhead, hover highlights, drag ghosts, snap lines, marquee, trim previews; redrawn on every interaction frame). Playback at 60 fps must not redraw the content canvas.
- **P4** Time is integer frames in the document; media times are integer microseconds. No floating point in persisted data. Conversions go through `core/document/time.ts` only.
- **P5** Media work (demux, decode, encode, scaling, analysis) never runs on the main thread. Transferable objects only (`VideoFrame`, `ArrayBuffer`, `ImageBitmap`). The main thread uploads to GPU and closes frames immediately after upload.
- **P6** GPU textures come from a pool with a memory budget (default 768 MB, configurable). Frame cache keys: `(mediaId, lod, frameTimeUs)`. Eviction: LRU with pinning of the frames within ±1 s of the playhead.
- **P7** Decoders are warmed before they are needed: during playback the engine looks 2 s ahead, finds clips that will start, and seeks their decoders to the keyframe preceding their in point so the first frame is ready at the cut. Cut-heavy shorts (a clip every second) must play without dropped frames.
- **P8** Scrubbing uses progressive refinement: show the nearest cached frame immediately, then the exact frame when decoded (target: exact frame within 50 ms on proxy). Scrub requests supersede all pending prefetches.
- **P9** No layout thrash: DOM reads batched before writes; panel sizes come from `ResizeObserver`, never from `getBoundingClientRect` inside render loops.
- **P10** The timeline renderer is virtualized: only tracks and clips intersecting the visible range are drawn; clip lookup is a binary search over start-sorted arrays per track.
- **P11** Text rasters are cached by content+style+scale bucket. Editing text re-rasterizes only the edited layer. Animated text pre-rasterizes per word/line once and animates transforms on the GPU; it never re-rasterizes per frame.
- **P12** Startup under 1.5 s to an interactive empty project on a warm cache. Heavy modules (export pipeline, transcription, font listing) are dynamic imports.
- **P13** Memory of closed resources is explicit: `VideoFrame.close()`, `ImageBitmap.close()`, `GPUTexture.destroy()`, decoder `close()` when a media leaves the lookahead window for more than 10 s.
- **P14** Budgets to test against (see BATCHES.md Batch 44): 500 clips on 8 tracks at 60 fps timeline interaction; 20-minute 4K60 source scrubbing on proxy; export of a 60 s 1080x1920 30 fps project in under 2x realtime on a mid-range GPU.

---

## 5. Data model and time

### 5.1 Time

- `Frame` = integer, counted at the **project frame rate** (`settings.fps`, default 30; allowed 24, 25, 30, 50, 60). All timeline positions and durations are `Frame`.
- `Us` = integer microseconds, used for media sample times (what WebCodecs uses) and for `in`/`out` points inside source media.
- Conversions: `frameToUs(f) = round(f * 1_000_000 / fps)` with exact rational arithmetic for 23.976/29.97 (store fps as a rational `{num, den}`; 30 = 30/1, 29.97 = 30000/1001).
- A clip's source time at timeline frame `t` is `clip.in + (t - clip.start) * speed * usPerFrame` (speed 1 = natural). Source frames are picked by nearest sample `cts` to the requested source time (no frame blending).
- Timecode display: `mm:ss:ff` by default; `mm:ss.mmm` optional (toggle in the preview panel). Hours shown only when needed.

### 5.2 Document (`Project`)

```ts
interface Project {
  schemaVersion: number;
  id: string;                      // uuid, never changes
  name: string;
  settings: { width: number; height: number; fps: Rational; background: RGBA; sampleRate: 48000 };
  media: Record<MediaId, MediaItem>;
  tracks: Track[];                 // ordered: index 0 = bottom video track; audio tracks after video tracks
  clips: Record<ClipId, Clip>;     // all clips by id; tracks hold ordered id arrays
  markers: Marker[];
  captionTracks: Record<TrackId, CaptionTrackData>; // style + cue ids for tracks of kind 'caption'
  textPresetsLocal: TextPreset[];  // project-local presets (global ones live outside the project)
  meta: { createdAt: string; modifiedAt: string; appVersion: string };
}

interface MediaItem {
  id: MediaId; kind: 'video' | 'audio' | 'image';
  name: string; file: { relPath: string } | { handleKey: string; pathHint: string };
  durationUs: number; width?: number; height?: number; rotation?: 0|90|180|270;
  fps?: Rational; hasAudio: boolean; codec?: string; audioCodec?: string;
  proxy?: { relPath: string; width: number; height: number; status: 'none'|'pending'|'ready'|'failed' };
  analysis: { thumbs: 'none'|'pending'|'ready'; peaks: 'none'|'pending'|'ready' };
  binId?: string; addedAt: string;
}

interface Track {
  id: TrackId; kind: 'video' | 'audio' | 'caption';
  name: string; clipIds: ClipId[];           // sorted by start, non-overlapping (invariant)
  locked: boolean; muted: boolean; solo: boolean; hidden: boolean; targeted: boolean;
  height: 'S' | 'M' | 'L';
}

interface ClipBase {
  id: ClipId; trackId: TrackId; kind: 'video' | 'audio' | 'image' | 'text' | 'solid' | 'caption';
  name: string; start: Frame; duration: Frame;   // duration >= 1
  color?: LabelColor; linkGroup?: string; group?: string;
  enabled: boolean;
}
interface MediaClip extends ClipBase { kind: 'video' | 'audio' | 'image';
  mediaId: MediaId; in: Us; out: Us; speed: number; // out - in == duration * speed * usPerFrame (invariant, within 1 frame)
  transform: Transform; opacity: number; crop: Crop; volume: Volume; fades: { in: Frame; out: Frame };
  keyframes?: Keyframes; transitionIn?: Transition; transitionOut?: Transition;
}
interface TextClip extends ClipBase { kind: 'text';
  text: TextContent; style: TextStyle; animIn?: TextAnim; animOut?: TextAnim; presetId?: string;
  transform: Transform; opacity: number; keyframes?: Keyframes; fades: { in: Frame; out: Frame };
}
interface SolidClip extends ClipBase { kind: 'solid'; fill: RGBA | Gradient; shape: 'rect'|'roundedRect'|'ellipse'|'line'; size: {w:number;h:number}; cornerRadius: number; transform: Transform; opacity: number; keyframes?: Keyframes; }
interface CaptionClip extends ClipBase { kind: 'caption'; text: string; words?: { text: string; start: Frame; end: Frame }[]; }

interface Transform { x: number; y: number; scale: number; scaleY?: number; rotation: number; anchor: { x: number; y: number }; flipH: boolean; flipV: boolean }
// x,y in project pixels relative to project center; scale 1 = native media size; rotation degrees.
interface Crop { left: number; top: number; right: number; bottom: number } // fractions 0..1 of media size
interface Volume { gainDb: number; muted: boolean }
interface Keyframes { [prop: string]: { frame: Frame; value: number; ease: EaseId }[] } // frame relative to clip start
interface Marker { id: string; frame: Frame; color: LabelColor; label: string }
```

Invariants (checked by `core/document/validate.ts` in dev builds after every command):

- Clips on a track never overlap, are sorted by `start`, `duration >= 1`.
- Media clips: `in >= 0`, `out <= media.durationUs`, `out > in`.
- Linked clips (same `linkGroup`) have the same `start` and `duration` unless the group was deliberately offset (allowed, flagged with a sync badge).
- Caption tracks contain only caption clips; video tracks contain video/image/text/solid; audio tracks contain audio.
- Every `clipId` in a track exists in `clips` and points back to that track.

### 5.3 Session state (per project, persisted in `session.json`, never undoable)

Playhead frame, in/out, selection, timeline `pxPerFrame` and `scrollFrame`, vertical scroll, track heights, preview zoom/pan, active tool, snap/link/ripple toggles, panel splitter positions, media panel tab and sort, properties panel section collapsed states, loop enabled, audio scrub enabled, safe-zone overlay choice, preview quality.

---

## 6. Timeline specification

This section is the heart of the product. Read it fully before touching anything under `src/timeline`.

### 6.1 Anatomy (left to right, top to bottom)

- **Toolbar strip** (React, top of the panel, one row, wraps never; overflow hides the least important group with a `...` button). Groups, left to right, separated by thin dividers:
  1. Tools: Select (V), Razor (C), Hand (H), Slip (Y), Slide (U), Rate stretch (R).
  2. Toggles: Snap (S), Linked selection, Ripple mode (edits ripple), Show clip keyframes, Audio scrub.
  3. Edit actions: Split at playhead (Mod+K), Delete, Ripple delete (Shift+Del), Close gap (G), Close all gaps / Compact (Shift+G), Add marker (M), Freeze frame (Shift+F), Punch zoom (Shift+Z).
  4. Add actions: `+ Title` (T), `+ Subtitle` (Shift+T), `+ Caption track`, `+ Solid`, `+ Image` (opens file picker directly), favorite text presets as small chips (up to 8, from the Presets tab).
  5. Zoom: zoom out (-), zoom slider, zoom in (=), Fit (\), Zoom to selection (Shift+\), track height cycle.
  6. Right end: timecode of playhead (editable, typing a timecode jumps), total duration.
- **Track header column** (fixed width, canvas-drawn, on the left of the tracks): per track, in one row: kind icon, name (double-click renames), target toggle, lock, mute (audio/video), solo (audio), hide (video). A thin divider separates video tracks from audio tracks. Caption track sits above all video tracks with a `CC` icon.
- **Ruler** (top of the track area, spans the scrollable width): adaptive ticks and labels, in/out range shading, markers (triangles with label on hover), playhead head (a small pentagon) drag target, loop range if enabled.
- **Tracks area**: video tracks top (highest index on top = topmost layer in the composite), audio tracks below the divider. Each track row shows its clips. Empty space above the top video track and below the bottom audio track is a drop zone that creates a new track.
- **Playhead line**: full height vertical line from the ruler through all tracks; color and width from the design system (functional default: 1 px line, 2 px when dragging).
- **Scrollbars**: horizontal scrollbar at the bottom with **zoom handles** at both ends (dragging an end changes zoom while keeping the other end fixed, Premiere style); vertical scrollbar on the right for tracks.
- **Overlay layer** (second canvas on top): hover highlights, snap lines, drag ghosts, trim previews, marquee, insert/overwrite indicators, keyframe handles while dragging, tooltips with timecode deltas during drags.

### 6.2 Coordinate system and zoom

- Horizontal mapping: `x = headerWidth + (frame - scrollFrame) * pxPerFrame`. `pxPerFrame` is a float in session state (range: fit-to-content down to 0.01 px/frame, up to 400 px/frame). `scrollFrame` is a float frame (sub-frame scroll for smooth zoom anchoring); rendering snaps clip edges to device pixels.
- Zoom in/out keys and buttons multiply `pxPerFrame` by 1.25 / 0.8 anchored at the playhead if visible, else at the view center. Wheel zoom (Mod+wheel, or Alt+wheel, both) anchors at the cursor frame: the frame under the cursor stays under the cursor. Pinch gestures on trackpads map to Mod+wheel.
- Plain wheel: vertical scroll of tracks. Shift+wheel: horizontal scroll. Horizontal trackpad scroll (deltaX): horizontal scroll.
- `Fit` (\) sets zoom so the whole content (last clip end + 2 s margin) fits the visible width, min 1 s. `Zoom to selection` (Shift+\) fits the selection bounds with 10% margin.
- Zoom slider in the toolbar maps logarithmically to the range.
- The visible range `[scrollFrame, scrollFrame + visibleWidth / pxPerFrame]` is clamped so the timeline can scroll at most 25% of the viewport past the content end (so the user can drop clips after the end) and never before frame 0.
- **Follow playhead**: during playback, when the playhead leaves the visible range on the right, the view pages forward by one viewport width minus 10% (Premiere behavior), it does not scroll continuously (continuous scrolling makes thumbnails illegible). Manual scroll during playback disables following until the next play.
- Vertical: track rows stack with heights from the `S/M/L` presets (functional defaults 32/56/88 CSS px, override in DESIGN_SYSTEMS.md if defined). The caption track is always `S`. Video tracks grow upward from the divider, audio tracks downward (so the divider stays put when adding tracks).

### 6.3 Ruler

- Tick levels chosen from `pxPerFrame` so labels never overlap: major ticks at 1 frame, 5 frames, 10 frames, 1 s, 2 s, 5 s, 10 s, 30 s, 1 min, 5 min; minor ticks subdivide. Labels in timecode with the format of the preview panel toggle. At frame-level zoom, frame numbers are shown between seconds.
- Clicking or dragging anywhere on the ruler sets the playhead (scrub). The playhead snaps to clip edges and markers when snapping is on **and** the Shift key is held (so plain ruler scrubbing stays free; this is deliberate).
- Markers drawn as small triangles under the ruler baseline; hover shows label and timecode; click selects marker (properties panel shows marker fields); drag moves; right-click context menu (edit label, color, delete).
- In/out range: shading between in and out across ruler and tracks (low-alpha fill from design system); in and out handles draggable on the ruler.

### 6.4 Clip visuals

A clip is a rounded rectangle (radius from DS) with:

- A **label bar** at the top (height ~16 px at M/L sizes, full height at S): icon of kind, name (ellipsized), speed badge (`2x`) when speed != 1, link badge when linked, keyframe icon when it has keyframes, `fx` badge when it has a transition, mute/disabled state (hatched overlay) when `enabled = false` or muted.
- **Body**: video/image clips show a filmstrip (thumbnails tiled left to right at the clip's source time, respecting in/out and speed, drawn at the LOD matching `pxPerFrame`); audio clips show the waveform (min/max peaks, mirrored around the center line, with the clip gain applied visually and the fade curves drawn as transparent wedges); text clips show the text content in the body (first line, label-colored background); solid clips show a swatch; caption clips show the cue text.
- **Fade handles**: small squares at the top corners (video opacity fade) and at the top corners of audio clips (audio fade); drag horizontally to set fade length; the fade is drawn as a diagonal line/curve inside the clip.
- **Trim zones**: the outer 8 px of each edge (inside the clip) is the trim zone; the cursor changes to a bracket cursor (`[` for in point, `]` for out point). When Ripple mode is on, the cursor shows the ripple variant. A 6 px zone exactly on the junction between two adjacent clips with the roll cursor when hovered with Mod+Alt (see §6.10).
- **Selection**: selected clips get the DS selection outline (functional default 1.5 px) and a tinted body; the primary selection has a slightly stronger outline. Hover: subtle lift of the body color.
- **Label colors**: clips default to a per-kind color from the DS; the user can set one of 8 label colors (context menu or properties).
- **Keyframe row**: when `Show clip keyframes` is on and the clip is selected (or the track is `L`), a thin lane at the bottom of the clip draws keyframe diamonds for the chosen property (default: `transform.scale`, chooser in the clip context menu). Diamonds are draggable horizontally; Alt+click adds a keyframe at the clicked frame; selecting a diamond shows its value in the properties panel.
- **Audio rubber band**: on audio tracks at M/L height, a horizontal gain line across the clip; Mod+click adds a volume keyframe; dragging a segment without keyframes drags the whole clip gain; dragging a keyframe changes its value/time. Shown in dB in a tooltip.
- **Transition blocks**: a small bracketed block drawn over the cut spanning the transition duration, draggable at its edges to change duration, double-click to open its properties.
- **Gap**: nothing is drawn, but a hovered gap on a track highlights faintly and can be clicked to select the gap (then `Delete`/`G` closes it).
- **Clip LOD**: below 24 px clip width: no label text, no thumbnails; below 6 px: just a 1 px separator; the body color still shows. Thumbnails only when the track is M/L and the clip is at least 48 px wide.

### 6.5 Playhead

- Positioned at `playheadFrame`. Drawn on the overlay canvas. Dragging the head in the ruler scrubs; dragging the line in the track area is not allowed (prevents accidental scrubs while editing clips).
- Keyboard: Left/Right step 1 frame; Shift+Left/Right 5 frames; Mod+Left/Right 1 s; Home/End; Up/Down jump to previous/next **edit point** (any clip start or end on unlocked tracks, plus markers and in/out); Shift+Up/Down previous/next marker.
- Typing a timecode in the toolbar field (or pressing `Enter` on the field) jumps. Relative input `+30` / `-15` moves by frames; `+2.` moves by 2 seconds.
- The playhead is never allowed before 0; it may go past the content end.

### 6.6 Navigation and scrolling

- Hand tool (H) or Space+drag on an empty area pans in both axes. Middle mouse drag pans.
- Auto-scroll: while dragging anything (clip, trim edge, playhead, marquee, keyframe) near the horizontal edges (within 24 px), the view scrolls in that direction with speed proportional to the overshoot; same vertically for track rows.
- Center playhead (toolbar button, shortcut `Mod+Shift+.`): centers the view on the playhead.
- After `Fit`, scroll positions reset to 0.

### 6.7 Selection

- Click a clip: selects it (and its linked partner when Linked selection is on). Shift+click: toggle add/remove. Mod+click: add without linked partner. Click on empty area: clears selection. Alt+click a linked clip: selects only that clip even with linked selection on.
- Marquee: drag on empty area with Select tool; selects clips intersecting the rectangle (not just fully contained). Shift+marquee adds.
- `Mod+A` selects all clips on unlocked tracks; `Mod+Shift+A` deselects. `Mod+Shift+click` on a track header selects all clips on that track. Clicking a track header targets/untargets it (and selects the track for the properties panel).
- Double-click a clip: opens the clip in the properties panel and, for text/caption clips, starts inline text editing on the canvas.
- Selection in the timeline and on the preview canvas is the same `SessionStore.selection`. Selecting on one highlights on the other.
- Gap selection: clicking a gap between two clips on the same track selects that gap (drawn as a dashed outline); `Delete` or `G` closes it.
- Edit point selection (for roll/ripple): clicking exactly on a junction with the Ripple edit or Rolling edit behavior selects the edit point (brackets drawn in red/orange from DS); the Up/Down keys move between edit points; `Q`/`W` do not need an edit point selection, they always use the playhead.

### 6.8 Moving clips

- Drag with Select tool moves the selection. The ghost (all moving clips drawn semi-transparent at the new position) follows the cursor on the overlay; the document does not change until pointer up.
- Horizontal position snaps (see §6.9). Vertical: the clip moves to the track row under the cursor, keeping the relative track offsets of a multi-track selection; video clips cannot be dropped on audio tracks and vice versa; linked audio follows its video with the same track delta (audio delta applies to audio tracks). Dropping above the top video track or below the bottom audio track creates a new track of that kind (the ghost shows the new track row during the drag).
- Shift during the drag constrains to horizontal only (track locked). Alt+drag duplicates (the originals stay, the ghost becomes copies on drop).
- Collision behavior on drop (BINDING, Premiere semantics): **overwrite**. Clips under the dropped clip are trimmed; a clip fully covered is removed; a clip partially covered on both sides is split into two. Holding Mod on drop switches to **insert**: the dropped clip is inserted at its start frame and everything after it on all unlocked tracks shifts right by its duration (ripple insert). The Ripple mode toggle does not change drop behavior; only Mod does. The overlay shows what will happen: overwritten regions are hatched, insert shows a vertical insert line and an arrow.
- Dragging a clip onto a locked track is refused (ghost turns red, drop cancels). Esc during a drag cancels it.
- The drag tooltip shows `Δ +00:00:12` (frames moved) and, when snapped, the snap target name (`Clip end`, `Playhead`, `Marker 3`).
- Dragging with a 4 px dead zone before the move starts (so clicks never nudge).
- Nudge: with timeline focus, `Alt+Left/Right` moves the selection by 1 frame, `Alt+Shift+Left/Right` by 5 frames (overwrite collisions apply; if a nudge would overlap a locked clip it is refused). `Alt+Up/Down` moves the selection to the adjacent track if free.

### 6.9 Snapping (BINDING)

Snapping applies to: clip move (both start and end edges of the dragged block, plus the original cut points inside a multi-clip block are NOT candidates), trim edges, slip/slide, keyframe drags, marker drags, playhead drag with Shift (see §6.3), transition edge drags, in/out handle drags.

Candidates (on **all** tracks, including locked ones, excluding the clips being dragged):

1. Playhead.
2. Clip starts and ends.
3. Markers.
4. In point, out point.
5. Frame 0.
6. When `Show clip keyframes` is on: keyframes of the dragged clip's visible property (horizontal).

Rules:

- Threshold: 8 CSS px (from DS if defined), measured in screen space, so snapping is zoom-independent.
- Resolution: among candidates within threshold choose the smallest pixel distance; ties resolve by priority order above. Both the leading and trailing edge of the dragged block are tested; the closest wins.
- Snap toggle `S` (toolbar magnet). **Holding `S` while dragging temporarily inverts snapping** (if on, off; if off, on). The key is non-repeating and only acts as a modifier during a drag; a plain press outside a drag toggles the setting.
- Visual: when snapped, a vertical snap line is drawn through the full timeline height at the snap frame on the overlay canvas, in the DS accent color, plus a small label with the target name near the cursor. The dragged ghost "sticks" (does not move) until the cursor leaves the threshold.
- Snapping never produces overlaps on its own; collision resolution happens after snapping with the snapped position.
- Snapping is computed from a precomputed sorted array of candidate frames rebuilt when the document changes (not per mouse move), and queried with binary search.

### 6.10 Trimming (BINDING)

Trim behaviors (Premiere vocabulary):

| Behavior | Trigger | Effect |
|---|---|---|
| Regular trim | Drag a clip edge (trim zone) with Select tool | Changes `in`/`start` or `out`/`duration` of that clip only. Leaves a gap or overwrites nothing. Limited by media bounds and by the neighbor clip (cannot overlap). |
| Ripple trim | Drag edge with Ripple mode on, or hold Mod while dragging an edge | Same edge change, then all clips after the edit point on all unlocked tracks shift by the delta so no gap appears/disappears. Limited by media bounds and by collisions on other tracks (the ripple stops at the maximum delta that keeps every track overlap-free). |
| Rolling edit | Mod+Alt drag on a junction, or drag with Rolling behavior | Moves the cut point between two adjacent clips: A's out and B's in change together; total duration unchanged. Limited by both media bounds. |
| Slip | Slip tool (Y) drag on a clip body (no modifier shortcut: Alt+drag is reserved for duplicate) | Changes `in` and `out` by the same amount; position and duration unchanged. Limited by media bounds. |
| Slide | Slide tool (U) drag on a clip body | Moves the clip in time while trimming the neighbors (previous out, next in) so total duration is unchanged. Limited by neighbor media bounds. |
| Rate stretch | Rate stretch tool (R) drag an edge | Changes `speed` so that the same `in`/`out` range fills the new duration. |
| Trim to playhead | `Q` (ripple trim previous edit point to playhead), `W` (ripple trim next edit point to playhead) | On targeted tracks: the clip under the playhead gets its start (Q) or end (W) moved to the playhead and the gap is rippled closed. If no clip is under the playhead on a targeted track, Q/W do nothing on that track. This is the fastest way to trim and must feel instant. |
| Extend edit | `E` | Extends the nearest edit point of the selected clip to the playhead (regular trim, no ripple). |

Rules common to all trims:

- Live feedback: while trimming, the preview panel shows the **new edge frame** (for an out trim, the last included frame; for an in trim, the first included frame) and, for rolls, a split view with both sides (left half: A's last frame, right half: B's first frame). The timeline overlay shows the ghost edge, the delta tooltip (`-00:00:08` frames and the new clip duration), and snap lines.
- Minimum clip duration 1 frame. Trims clamp instead of refusing.
- Media bounds: when the trim reaches `in = 0` or `out = media.durationUs`, the edge turns red for the drag and the tooltip says `Media start` / `Media end`. For text/solid/image clips there are no bounds.
- Linked clips trim together; if the linked partner hits its bound first, both stop (unless Alt+drag edge trims only one side of the link, which is allowed and produces a sync offset badge).
- Trimming over a transition shortens the transition if needed and removes it if the handle disappears.
- Keyframes inside a clip are anchored to the clip start by default (they move with the clip); in trims shift keyframes so they stay on the same source frame (option in settings: "keyframes follow source" default on for media clips, off for text clips).
- Trim zone hit priority: when two clips abut, the left 8 px belongs to the right clip's in point and the right 8 px to the left clip's out point; the exact junction pixel band (6 px) is the roll zone. Keyboard `Mod+Alt` while hovering switches the cursor to roll.
- All trim math lives in `timeline/edit/trim.ts` as pure functions `(doc, params) -> patch` with unit tests for every limit case (media bound, neighbor collision, linked partner bound, multi-track ripple limit, 1-frame minimum).

### 6.11 Split, delete, gaps, lift/extract

- **Split at playhead** (`Mod+K`, toolbar scissors): if there is a selection, split the selected clips at the playhead (those not under the playhead are ignored). If nothing is selected, split every clip under the playhead on **targeted** unlocked tracks. `Mod+Shift+K` splits all clips under the playhead on all unlocked tracks regardless of targeting. Split produces two clips with the same properties; keyframes are partitioned; transitions at the cut are removed; linked clips split together; both halves stay selected if the original was selected (primary = right half).
- **Razor tool** (C): click on a clip splits at the clicked frame (snapped); Shift+click splits all tracks at that frame. Hovering shows a vertical cut line on the overlay.
- **Delete** (`Delete` / `Backspace`): removes selected clips, leaves gaps. Linked partners are removed together unless Linked selection is off.
- **Ripple delete** (`Shift+Delete` / `Shift+Backspace`): removes selected clips and closes the resulting gaps by shifting later clips on all unlocked tracks. If clips on other tracks would collide, the ripple is limited to the largest safe amount per gap and a toast explains.
- **Close gap** (`G`): closes the selected gap, or, with no gap selected, the gap under the playhead on targeted tracks (if the playhead is on a clip, the gap right after that clip). Ripple semantics.
- **Close all gaps / Compact** (`Shift+G`, toolbar): removes every gap on the selected tracks (or all targeted tracks if none selected), left to right, respecting locks and cross-track collisions. This is the "compact clips" action and must handle 500 clips in one undo step without visible delay.
- **Lift** (`;`): removes the in/out range on targeted tracks, leaves a gap. **Extract** (`'`): same but ripples. Both become one undo step.
- **Delete track**: via track header context menu; refuses if locked; deletes its clips. **Delete empty tracks** command in the same menu.
- Deleting a clip that owns transitions removes them. Deleting selected keyframes (when a keyframe is selected) deletes only the keyframes.

### 6.12 Linking, groups, tracks

- Importing a video with audio onto the timeline creates a video clip and an audio clip sharing a `linkGroup`. Linked clips move, trim, split, delete and select together while Linked selection is on. `Mod+L` toggles link on the selection (unlinks a linked pair; links a selected video+audio pair). Linked but offset clips show `+12` / `-12` frames sync badges; "Move into sync" in the context menu realigns.
- Groups (`Mod+G` / `Mod+Shift+G`): selecting any member selects the group; moving/deleting applies to all; trims apply to the trimmed clip only.
- Track header toggles: **Lock** (no edits, no selection, drawn with diagonal hatch), **Mute** (audio: silent; video: hidden in composite but still editable; the composite ignores muted video tracks), **Solo** (audio only), **Hide** (video: not rendered, not selectable on the canvas), **Target** (used by Q/W, split with no selection, paste, close gap, lift/extract).
- Add track: `+` buttons at the top of the video area and bottom of the audio area; dropping into the empty zones; context menu. Reorder tracks by dragging the header vertically (video z-order follows track order). Rename by double-click. Track heights per track; `Mod+Alt+Up/Down` cycles height of selected tracks; the toolbar button cycles all.
- Track kinds are rigid: no mixing. Solids/text/images live on video tracks. A `caption` track is unique per project (one caption track max in v1), placed above all video tracks, and renders above everything.

### 6.13 Markers, in/out, loop

- `M` adds a timeline marker at the playhead (v1 has timeline markers only, no clip markers). `Shift+M` / `Mod+Shift+M` jump next/previous. Double-click a marker in the ruler to edit label and color inline (small popover). Markers are snap candidates and edit points.
- `I` / `O` set in/out at the playhead; `Alt+I` / `Alt+O` clear; `Alt+X` clears both; `Shift+I` / `Shift+O` go to in/out. `X` marks the clip under the playhead (sets in/out to its bounds). Export can use the in/out range.
- Loop toggle (`Mod+Shift+L`, preview button): playback loops the in/out range, or the whole timeline when no range is set.

### 6.14 Dropping media onto the timeline (insert/overwrite rules)

- From the Media tab: drag a media item to a track row; the ghost shows the clip at its natural duration (images default 5 s, text 3 s) starting at the snapped cursor frame; if the item has audio, a second ghost shows the audio on the matching audio track (auto-created if missing). Drop uses the same overwrite/insert rules as moving (§6.8).
- Double-click a media item (or `,` for insert / `.` for overwrite in Premiere style) places it at the playhead on the first targeted video track; the playhead moves to the end of the inserted clip so repeated double-clicks sequence clips ("append to playhead" workflow, the fastest way to assemble a short).
- Dropping multiple selected media items places them back to back in selection order.
- Dropping a media item onto the **preview canvas** places it at the playhead on the topmost video track (or a new one) at the dropped canvas position (its transform x/y is set to the drop point), useful for logos and overlays.
- Media items with a source in/out range (set in the media hover-scrub, §12) are inserted with that range only.
- Dropping files from the OS onto the timeline imports them then inserts them (one transaction).

### 6.15 Fades, keyframes, transitions on the timeline

- Fade handles (§6.4) set `fades.in/out` for video opacity (video/text/image/solid clips) and audio gain (audio clips). Linked video+audio fades are independent (dragging one does not change the other) except through the "Fade in/out" quick actions in the properties panel which apply to both.
- Transitions: cross-dissolve, dip to black, dip to white. Apply via the properties quick action "Add transition" on an edit point, `Mod+Shift+D` for the default transition at the selected edit point or at the nearest edit point to the playhead, or drag from the properties panel's transition chips onto a cut. Default duration 15 frames (settings). Dragging a transition block edge changes its duration symmetrically (Alt+drag: one-sided). Transitions require handles (media beyond the in/out); when handles are missing, the transition is created with the maximum available and, if zero, with repeated edge frames (clip shows a striped warning on the transition block).
- Keyframes: see §6.4 for the lane. Dragging a diamond snaps to other keyframes of the same lane, the playhead and clip edges. Shift+drag snaps to whole seconds. Keyframe context menu: easing (linear, ease in, ease out, ease in-out, hold), delete, copy/paste keyframes.

### 6.16 Context menus (right-click)

- Clip: Cut/Copy/Paste, Duplicate, Delete, Ripple delete, Split at playhead, Link/Unlink, Group/Ungroup, Enable/Disable, Label color (8 swatches inline), Rename, Speed..., Freeze frame at playhead, Reverse (only if implemented), Reveal in media panel, Show keyframes for (property submenu), Fade in / Fade out presets (0.25 s, 0.5 s, 1 s), Add transition (3 kinds inline), Match project size (Fit / Fill).
- Gap: Close gap, Close all gaps on track.
- Track header: Add video track above/below, Add audio track, Rename, Delete track, Delete empty tracks, Height S/M/L, Select all clips on track, Lock/Unlock all, Mute all others.
- Ruler/marker: Add marker, Edit marker, Delete marker, Clear in/out, Set in/out to selection.
- Context menus are React, positioned by the pointer, dispatch command ids, and close on Esc/outside click. They are the only place where rarely used actions may live.

### 6.17 Rendering architecture (BINDING)

- `TimelineView` owns two `<canvas>` elements inside a positioned container, a `TimelineGeometry` object (header width, ruler height, track rows with y ranges, visible frame range) recomputed on resize/zoom/scroll/track changes, and a `HitTester`.
- **Content canvas** redraws on: document changes affecting tracks/clips/markers/captions, selection changes, zoom/scroll, resize, theme change, thumbnail/peaks arrival (coalesced to at most 10 redraws/s for arrivals). Draw order: track backgrounds, in/out shading, clips (body, filmstrip/waveform clipped to the body rect, label bar, badges, fade curves, keyframe lane, rubber band), transitions, gaps hover (no: hover goes to overlay), markers, ruler, track headers, divider, scrollbars.
- **Overlay canvas** redraws on every scheduler frame while any of these is true: playing, dragging, hovering a clip/edge/handle, scrubbing, marquee active. Draw order: hover highlights, snap lines, ghosts and trim previews, insert/overwrite indicators, playhead, drag tooltip. When idle, the overlay draws only the playhead and does not redraw until something changes.
- Both canvases use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` and integer-aligned rects (`Math.round` on device pixels) for crisp edges. Text uses the DS font; labels are measured once per string+font and cached (`Map<string, number>` with a size cap).
- Thumbnails are drawn with `drawImage` from sprite-sheet `ImageBitmap`s per media and LOD; waveforms from `Float32Array` peak pyramids by picking the level whose bucket size is closest to one CSS pixel at the current zoom. Both are requested lazily for the visible range through the `IdleQueue` and drawn as placeholders (body color) until available.
- Off-screen clips are skipped entirely. The visible clip list per track is produced by binary search on `start` with a lookback of the longest clip on that track (tracked as a per-track max duration).
- The React toolbar subscribes only to the toggles/tool/zoom it displays; it never re-renders on scroll.

### 6.18 Hit testing

- `HitTester.hit(x, y)` returns a typed result: `{ type: 'clip' | 'clipEdgeIn' | 'clipEdgeOut' | 'junction' | 'fadeHandle' | 'keyframe' | 'rubberBand' | 'transition' | 'transitionEdge' | 'gap' | 'trackHeader' | 'headerToggle' | 'ruler' | 'marker' | 'inHandle' | 'outHandle' | 'playheadHead' | 'empty', ... ids and frame }`. Priority: handles and diamonds > edges/junctions > transitions > clip body > gap > track.
- The cursor is set from the hover hit each overlay frame (no DOM writes when unchanged).
- Tools change hit interpretation (Razor: body = cut; Hand: everything = pan; Slip/Slide: body = slip/slide drag; Rate stretch: edges = stretch).

### 6.19 Edge cases (must be handled, tested in `timeline/edit/*.test.ts`)

- Trimming a clip to 1 frame, then extending back.
- Moving a clip onto itself (no-op, no undo entry).
- Overwrite drop that splits a clip into two with keyframes on both halves.
- Ripple with locked tracks (locked tracks do not move; collisions with locked clips limit the ripple).
- Ripple delete of a selection spanning multiple tracks with different gap sizes (each gap closes independently, limited by collisions).
- Split exactly at a clip start/end (no-op).
- Link offsets after Alt-trimming one side; "Move into sync".
- Media shorter than the requested duration after speed change (clamp, warn).
- Deleting the media of a clip from the media panel ("Remove and delete clips" vs "Remove, keep offline clips": offline clips render as a labeled gray slate).
- Dropping a 16:9 source into a 9:16 project: default transform = Fit (letterboxed), one-click Fill available (§11).
- Undo across a selection change (selection is restored to what it was after the undone command).
- Zoom levels where a clip is narrower than 1 px (still selectable through the 1 px separator band with a 3 px tolerance).

---

## 7. Preview canvas and direct manipulation

### 7.1 Viewport

- The preview panel renders the composite of the project frame (`settings.width x height`, default 1080x1920) into a WebGPU canvas sized to the panel at `devicePixelRatio`. The frame is drawn with a `Fit` zoom by default (letterboxed inside the panel with DS background); zoom levels: Fit, 25, 50, 100, 200, 400% and free (wheel). Zoom anchors at the cursor (Mod+wheel / Alt+wheel), plain wheel pans vertically when zoomed, Shift+wheel horizontally. Space+drag and middle mouse pan. `Mod+0` = Fit, `Mod+1` = 100%, `Mod+2` = 200%.
- **Detail on zoom** (BINDING): the compositor renders the frame to an offscreen texture at `min(zoom, sourceDetailCap) x` project resolution (capped at the source media resolution and at 4096 px on the long side) so zooming in shows real detail (full-resolution source pixels, re-rasterized text) instead of upscaled pixels. At Fit and below, it renders at the panel's device size.
- The canvas background outside the frame uses the DS surface color; the frame edge gets a 1 px DS border. Transparent regions of the frame show the project background color (solid, default black).

### 7.2 Selection on the canvas

- Clicking picks the topmost **visible** layer under the cursor at the playhead: hit test in layer order from the top track down, against the transformed and cropped bounds; text layers hit on their glyph bounds (padded by 4 px), images and video on their bounding box. Hidden and locked tracks are skipped. Click on empty space clears selection. Shift+click toggles; marquee on empty space selects intersecting layers.
- Selection is shared with the timeline (§6.7). The selected layer gets the gizmo (§7.3). Hovering a layer shows a thin outline.
- Alt+click cycles through overlapping layers under the cursor (Figma-style deep select).
- Right-click: context menu with Fit, Fill, Center, Flip H/V, Reset transform, Bring forward / Send backward (moves the clip to the adjacent video track, creating one if needed), Duplicate, Delete, Copy/Paste, Lock track.

### 7.3 Transform gizmo

- Bounding box of the layer (after crop and transform) with 8 handles: the 4 corners scale uniformly, the 4 edge handles scale that axis only (writing `scaleY`), Shift+corner scales non-uniformly, Alt scales around the center instead of the opposite corner. A rotation ring sits outside the corners (the cursor becomes a rotate cursor within 16 px outside each corner). An anchor point marker is draggable while holding Alt over it; without Alt, dragging the center area moves the layer.
- Move: drag the body; arrow keys nudge 1 px, Shift+arrow 10 px (canvas focus scope). Shift+drag constrains to the dominant axis. Dragging updates ephemeral state and renders at 60 fps; the command is committed on pointer up (P2).
- Rotation snaps to 0/45/90 multiples within 3° while Shift is held; otherwise free with 0.1° precision. Scale snaps to 100% within 2% when passing through it (a snap line flashes on the handle).
- Numeric readouts near the cursor while dragging: position in px, scale in %, rotation in degrees.
- Multi-selection: a group bounding box with the same handles; transforms apply relative to the group box (positions scale around the box center).
- The gizmo is drawn on an overlay `<canvas>` (2D) on top of the WebGPU canvas; the overlay redraws only when selection/transform/zoom/hover changes (P3).
- Text layers: double-click enters inline editing (§7.7); the gizmo of an auto-sized text box resizes font size with corner handles (keeping layout) and the box width with side handles (reflowing text) when the box is fixed-width.
- Keyframed properties: when a property has keyframes, dragging the gizmo at the playhead updates/creates the keyframe at that frame (the properties panel stopwatch rules in §11 apply); a small diamond indicator appears on the gizbox corner.

### 7.4 Snapping and smart guides on the canvas (BINDING)

Candidates, in priority order:

1. Frame center (both axes), frame edges, horizontal and vertical thirds (toggle "thirds" in the overlay menu).
2. Safe-zone edges when a safe-zone overlay is active (§7.6).
3. Other visible layers at the playhead: their bounding box edges and centers.
4. Equal spacing between three or more layers (distribution guides) when moving the middle one.

Rules:

- Threshold 6 CSS px in screen space (zoom-independent).
- Guides drawn as 1 px lines in the DS accent color across the full frame; when snapping to another layer, the guide spans from the dragged layer to the target and shows the distance in px between them (**proximity readout**). Holding Alt without dragging shows distances from the selected layer to the nearest layers and to the frame edges on all four sides (Figma measure mode).
- Snap applies to position (edges/centers of the dragged box), to scale handles (the dragged edge snaps), and to rotation (Shift). The dragged layer sticks at the snapped position until the cursor leaves the threshold.
- Candidate lists are rebuilt only when the set of visible layers at the playhead or their transforms change, not per pointer move.
- Toggle: the same `S` toggle as the timeline (one global snap state) plus holding `S` to invert during a drag.

### 7.5 Zoom, pan, quality

- Quality modes (preview toolbar): `Auto` (proxy during playback and scrub, full resolution when paused for 300 ms), `Full`, `Proxy`, `1/2` (renders at half size during playback), `1/4`. Auto is the default and must be good enough that the user never changes it.
- Rulers: optional thin rulers in px along the frame edges when zoomed above 100% (toggle in the overlay menu).
- Pixel grid when zoom >= 800% (toggle).

### 7.6 Overlays

- Safe zones: `None`, `Reels` (Instagram UI: right-side action column, bottom caption area, top bar), `TikTok`, `Shorts`. Drawn as semi-transparent masks with a dashed safe rectangle. Measurements are stored in `render/preview/safeZones.ts` and are editable constants.
- Grid: thirds, 3x3 squares, custom N.
- Center cross, frame border, title-safe/action-safe (90/80%).
- Overlays are drawn on the gizmo overlay canvas and never into the export.

### 7.7 Inline text editing

- Double-click a text layer (or press Enter with it selected): an invisible `contenteditable` (or a `<textarea>`) is positioned exactly over the text box with the same font metrics at the current zoom, caret shown, selection highlight drawn by the text rasterizer in the composite so WYSIWYG holds (the DOM element is transparent and only provides caret/keyboard/IME behavior). Esc commits and exits; clicking elsewhere commits. Shift+Enter inserts a line break (Enter also inserts a line break for multi-line titles; Mod+Enter commits).
- While editing, the properties panel text fields stay live (changing the font size updates the layer while the caret stays). Per-character styling is out of scope (v1 styles the whole layer), except per-word highlight in captions.

### 7.8 Preview chrome (toolbar under the canvas)

- Transport: go to start, previous frame, play/pause, next frame, go to end, loop toggle, play in/out, mute.
- Timecode readout (editable), duration, fps badge.
- Zoom dropdown (single click opens, single click selects), Fit button, Quality dropdown, Overlay dropdown (safe zones + grid + guides), Fullscreen (F key: preview fills the window, Esc returns).
- Audio meter (stereo, peak hold, clip indicator) vertical along the right edge of the preview panel; master volume knob next to the mute button.

---

## 8. Playback and scrubbing engine

- `PlaybackEngine` owns a clock, the active decoder sessions, and the audio scheduler. Master clock: `AudioContext.currentTime` when the context is running (always, even for silent projects: the context runs as soon as the user interacts once). `playheadFrame = startFrame + floor((ctxTime - startCtxTime) * speed * fps)`.
- Per animation frame (`requestAnimationFrame`, and `requestVideoFrameCallback` is not needed because frames are scheduled by our own clock): compute the target frame; if it changed, evaluate the composite (§9.4), request frames for every visible media clip at their source time with `priority: 'playback'`, draw with whatever frames are ready (keeping the previous frame for a layer whose frame is not ready: no black flashes, no stalls), update meters, invalidate the timeline overlay (playhead), update the timecode readouts via direct DOM text updates (not React).
- Frame delivery: the decode worker decodes sequentially ahead of the playhead per media (prefetch window 0.5 s, target 15 frames ready), posts frames; the main thread uploads them into the texture pool. If decoding falls behind by more than 2 frames, the engine switches that media to proxy for the rest of this playback (Auto quality) and logs a performance note.
- Lookahead (P7): every 250 ms the engine scans clips starting within 2 s and pre-seeks their decoders; it also releases decoders for media not needed within 10 s.
- Transport semantics: Space toggles play/pause; `K` pauses; `L` plays forward (pressing L repeatedly: 1x, 2x, 4x, 8x); `J` same backward (backward playback decodes GOPs in reverse; audio plays only at 1x in either direction, every other speed mutes audio); `K+L` / `K+J` step one frame; `Shift+K` play around (2 s before to 2 s after the playhead). `Mod+Shift+Space` play in to out.
- Scrubbing: dragging the ruler sets the playhead each pointer move (coalesced to one per animation frame); each change requests `priority: 'scrub'` frames at the proxy LOD with progressive refinement (P8). Audio scrub (toggle): plays 40 ms grains at the scrub position from the decoded audio buffers, pitched 1x, so cuts can be found by ear.
- Hover scrub on clips in the timeline is **off** (Premiere behavior) to avoid accidental decodes; hover scrub exists in the media panel thumbnails only (§12).
- When paused, the engine requests the full-quality frame after 300 ms of inactivity (Auto quality) and re-renders.
- Audio: see §14. Audio and video share the clock; the audio scheduler schedules buffer sources 200 ms ahead in 50 ms chunks (lookahead scheduler pattern). Stopping cancels scheduled sources with a 10 ms gain ramp (no clicks).
- Playback never changes the document. Seeking during playback restarts the audio schedule from the new frame.

---

## 9. Media pipeline

### 9.1 Import and probe

- Sources: toolbar Import button (`showOpenFilePicker`, multiple), drag-and-drop of files/folders into the Media panel or the timeline, paste from clipboard (images). Accepted: `.mp4 .mov .m4v` (H.264, HEVC, AV1), `.webm` (VP9/AV1, when a WebM demuxer is present: optional batch), `.mp3 .m4a .aac .wav .ogg`, `.png .jpg .jpeg .webp .gif .svg`. Unknown types are refused with a toast naming the file.
- Default import mode: **copy** the file into `<project>/media/` (keeps the project self-contained). Setting: **reference** (store a `FileSystemFileHandle` in IndexedDB keyed by media id with `pathHint`; the project asks for re-permission on open).
- Probe (in `decode.worker`): mp4box `onReady` gives tracks, codec strings, `avcC/hvcC/av1C` description, timescales, duration, rotation matrix (`tkhd.matrix` -> 0/90/180/270), fps estimated from the first 120 samples' `cts` deltas (reported as a rational, e.g. 30000/1001). Audio: codec, channels, sample rate. Images: `ImageDecoder` (animated GIF/WebP become `image` with `durationUs` and frame list) or `createImageBitmap`. Audio-only files: `decodeAudioData` for duration + peaks.
- The `MediaItem` is added to the document (one command per import batch) with `analysis` set to pending; the `IdleQueue` schedules thumbnails, peaks and proxy jobs.

### 9.2 Byte access and demux

- `ByteSource`: wraps a `File` (from a handle) and serves `read(offset, length): Promise<ArrayBuffer>` via `file.slice().arrayBuffer()` with a small read-ahead cache (4 MB chunks, LRU 64 MB). Workers receive the `File` object (structured-cloneable) and read ranges themselves.
- Sample index: built once per media by streaming the file through mp4box with `extractionOptions` and collecting `{offset, size, cts, dts, isSync, duration}` per video track; stored as a typed-array blob in `cache/index/<mediaId>.bin` with a header (codec, description bytes, timescale). Subsequent sessions load the index instead of re-parsing (fallback to re-parse if the file changed by size/mtime).
- `VideoDecodeSession` (worker): `VideoDecoder` configured from the description; `seek(targetUs)`: find the sync sample at or before the target (binary search on `cts`... careful: use `dts` order for feeding, `cts` for display), flush, feed from the sync sample, drop outputs before the target, deliver the target; sequential decode continues from the last fed sample. Keeps at most `maxQueue` (8) frames in flight and respects `decoder.decodeQueueSize` to avoid backlog.

### 9.3 Frame cache and textures

- Worker side: a small ring of recent `VideoFrame`s per session (for backward stepping without re-seek, 8 frames).
- Main side: `TexturePool` of `GPUTexture`s (rgba8unorm, `copyExternalImageToTexture` from the `VideoFrame`, then `frame.close()`), keyed `(mediaId, lod, frameTimeUs)`, LRU within the memory budget (P6), with pinning of the window around the playhead. `lod`: `'full' | 'proxy'`. Rotation metadata is applied in the compositor's layer transform, not by rotating pixels.
- Images: one texture per image (mip-mapped) uploaded once; animated images map frame times to their frame list.

### 9.4 Compositor

- `Compositor.evaluate(doc, frame, options)` -> `DrawList`: walks video tracks bottom to top, picks the clip at `frame` per track (binary search), computes source time, transform (with keyframes evaluated), opacity (with fades and keyframes), crop, and for transitions the two contributing clips and the mix amount; text layers resolve to raster textures (§10.1); caption track resolves to the current cue raster; solids to geometry.
- `Renderer.draw(drawList, target)`: one render pass, premultiplied alpha blending, per-layer quad with a transform matrix uniform, crop in UV space, textured by the pool texture (external video) or raster; dissolve as a two-texture mix shader; dip-to-color via opacity to a solid. sRGB output. The same code path renders the preview (to the canvas, at viewport size, with zoom/pan applied) and the export (to an offscreen texture at project size in the export worker).
- Draw lists are compared with the previous frame's: if identical (same frame textures ready, same transforms), the preview is not redrawn (P3).

### 9.5 Proxies

- Generated for every video media on import (setting: on/off, default on when the source is above 1080p on the short edge or above 30 fps; otherwise off because decoding 1080p30 is cheap). Target: short edge 540 px (so 540x960 for portrait, 960x540 for landscape), H.264 Main profile at a level chosen from the size and fps (e.g. `avc1.4d401f` for 960x540 at 30 fps, checked with `VideoEncoder.isConfigSupported`), keyframe every 15 frames, bitrate 3 Mbps, same fps, written to `cache/proxies/<mediaId>.mp4` via `mp4-muxer` streaming. Audio is not included in proxies (audio is decoded from the source).
- The frame request API takes `lod`; the engine chooses `proxy` for scrub and playback (Auto), `full` when paused and for export. Clips show a small `PX` badge in the media panel while the proxy is pending and the timeline uses full decode until it is ready.
- Proxy jobs are cancellable, resumable (the muxer writes to a temp file; completed jobs are atomically renamed by writing the final name and deleting the temp), and run at most one at a time, paused during playback and export.

### 9.6 Thumbnails and waveforms

- Thumbnails: sprite sheets of 160 px tall frames (width by aspect), one sheet per media per LOD: LOD0 = one frame per 2 s, LOD1 = one per 0.5 s, LOD2 = one per 5 frames (only generated for visible ranges on demand). Stored as WebP in `cache/thumbs/<mediaId>/<lod>-<sheetIndex>.webp` plus an index JSON; loaded as `ImageBitmap`s on demand with an in-memory LRU (256 sheets). Decoded from the proxy when present.
- Waveforms: peaks pyramid: level 0 = min/max per 256 samples (~5 ms at 48 k), each level halves resolution; stored as `Int8Array` pairs in `cache/peaks/<mediaId>.bin`; the timeline picks the level closest to 1 bucket per CSS px. Computed in the analysis worker from PCM channel data transferred by the main thread after `decodeAudioData` (§14); the worker never decodes audio itself in v1.

### 9.7 Cache directory

```
<project>/
  project.json          document
  session.json          session state
  media/                copied sources (copy mode)
  cache/
    index/   proxies/   thumbs/   peaks/   text/ (optional rasters)   export-temp/
  history/              rotating backups project-YYYYMMDD-HHMMSS.json (keep 20)
  exports/              default export destination
  presets/text/*.json   project-local presets
```

Cache is disposable: deleting it only costs regeneration. A `Clear cache` button exists in settings.

---

## 10. Text: titles, subtitles, presets, captions

### 10.1 Text engine

- Layout: multi-line, explicit line breaks, word wrap when `box.mode = 'fixed'` (auto-size otherwise), alignment left/center/right, vertical anchor top/middle/bottom, `letterSpacing`, `lineHeight` (multiplier), `textTransform` (none/upper/lower/title), max width in project px.
- Style (`TextStyle`): font family, weight, italic, size (project px), fill (solid or vertical two-stop gradient), stroke (width, color, outside), shadow (x, y, blur, color), background box (color, padding x/y, corner radius, mode: per line / whole block), text case, letter spacing, line height, alignment.
- Rasterization: Canvas2D (`OffscreenCanvas`) draws the laid-out text at `size * rasterScale` where `rasterScale` = the current preview detail factor (clamped 0.25..4) so text stays sharp when zoomed; the result is uploaded as a texture; cache key = hash(content, style, rasterScale, box). Background boxes and shadows are rasterized into the same texture (cheap) with padding accounted for in the layer bounds. For per-word animations the engine rasterizes an **atlas** of words (and lines) once and the compositor draws each word as its own quad with its own transform/opacity.
- Fonts: `FontFace` loading for bundled fonts; `queryLocalFonts()` for system fonts (the list is cached; the picker shows a preview rendered with the real font); a font used in a project is copied into `<project>/fonts/` when it comes from the local font list (so the project opens on another machine). Fallback font when missing: DS body font, and a `missing font` badge on the clip.
- Rich text per character is **out of scope** (BINDING) except caption word highlight.

### 10.2 One-click titles and subtitles

- `+ Title` (`T`): creates a text clip of 3 s at the playhead on the topmost video track (new track if the spot is occupied), centered, using the **default Title preset**, content `Title`, and immediately enters inline editing with the content selected (typing replaces it). One key, start typing. Esc keeps the clip with the typed content.
- `+ Subtitle` (`Shift+T`): same, with the **default Subtitle preset** (smaller, positioned in the lower third, background box), content `Subtitle`.
- Both defaults are chosen in the Presets tab (star icon "use as default title / subtitle"). The favorite chips in the timeline toolbar add a text clip with that preset in one click.
- The text clip's duration defaults to 3 s or, when the playhead is on a video clip, to the remaining duration of that clip (setting: "match clip under playhead", default on). Snapping applies when the user then drags it.

### 10.3 Presets

- `TextPreset = { id, name, style: TextStyle, box, animIn?, animOut?, defaultDuration?, position?: {x,y}, tags, favorite, createdAt }`. Global presets live in IndexedDB (and can be exported/imported as a JSON file, and synced to a user-chosen "library folder"); project-local presets live in `presets/text/`. The Presets tab shows both with a toggle and a search box.
- Preset cards render a live thumbnail using the real text engine (text: the preset name, or `Aa` if the name is long) on the DS card background; hovering a card with a text clip selected shows a non-committed preview on the canvas (ephemeral).
- **Create preset**: with a text clip selected, one click `Save as preset` in the properties panel header: a name field appears inline (prefilled with the font + size), Enter saves. **Update preset**: `Update "Name"` button appears when the selected clip has a `presetId` and its style differs. **Apply**: click a card: applies to all selected text clips (one undo step); with no text clip selected, it creates a new text clip at the playhead with that preset. Right-click card: set as default title/subtitle, favorite (adds a toolbar chip), rename, duplicate, delete, export.
- Applying a preset replaces the style and animations but keeps content, position and duration (option "apply position" per preset).
- Bundled starter presets (8-12): clean title, bold outline title, subtitle box, lower third, caption karaoke, highlight-background, minimal mono, big number, etc. They follow the DS palette only for UI, their own colors are content colors and are free.

### 10.4 Text animations

- `TextAnim = { id: 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'pop' | 'typewriter' | 'wordPop' | 'wordFade' | 'lineReveal' | 'blurIn' | 'scaleBounce', duration: Frame, perUnit?: 'char' | 'word' | 'line', stagger?: Frame, ease?: EaseId }`. In and out animations are independent; out animations run in reverse direction semantics (slideUp out = moves up and fades).
- Implementation on the GPU: per-unit transforms and opacity computed per frame from the atlas; `typewriter` reveals characters by count; `blurIn` is a two-pass separable blur on the raster, cheap because text rasters are small (cap the blur radius).
- UI: the properties panel shows two rows of animation chips (In / Out) with a duration field each; clicking a chip previews it (moves the playhead to the clip start, plays for the animation duration plus 10 frames, then returns the playhead to where it was). Presets store animations.

### 10.5 Captions track

- One caption track per project, kind `caption`, above all video tracks. Cues are caption clips: `text`, optional `words` with timings. Cues never overlap (the model enforces it: moving or trimming a cue is clamped by its neighbors; there is no overwrite and no push on this track).
- Style: one `CaptionStyle` per track = a `TextStyle` + position preset (`bottom`, `center`, `top`, custom y), max width, max lines, and **word highlight** (`none | color | background | scale | colorAndScale`, highlight color, inactive color) applied when word timings exist. Stored in `captionTracks[trackId].style` and editable in the properties panel when the caption track or a cue is selected; applying a text preset to the caption track sets its style.
- Captions tab (Media panel): the cue list: timecode in/out, text (inline editable), word count; click selects the cue and moves the playhead to its start; `Enter` while editing splits the cue at the caret into two cues (timing split proportionally by character count); `Mod+Backspace` at the start merges with the previous cue; `Delete` deletes the cue; `Tab` moves to the next cue. A `+ Cue at playhead` button adds a 2 s cue. Search within cues. Toolbar: Import SRT/VTT, Export SRT/VTT, Style (focuses the properties panel on the caption style), Transcribe (optional batch), Clear all.
- Import SRT/VTT: parse, convert to frames, create cues, create the track if missing. Export: frames to timestamps, one cue per line block, word timings ignored.
- Rendering: the compositor draws the active cue through the text engine with the caption style; word highlight draws the active word from the atlas with the highlight style. Caption rasters are cached per cue + style.

### 10.6 Transcription (optional batch)

- Local only, in `transcribe.worker.ts`, using a browser-runnable Whisper (ONNX via `@huggingface/transformers` with the WebGPU backend), model files cached by the browser (first download is large: show size and progress, allow cancel). Input: the mixed audio of the in/out range (or whole timeline) at 16 kHz mono from an `OfflineAudioContext`. Output: segments with word timestamps -> cues (max 2 lines, max ~32 chars per line, split at punctuation/pauses) into the caption track, replacing cues in the range after confirmation. Language auto-detect with an override.

---

## 11. Properties panel (EDIT PROPERTIES)

- Context-driven: the panel shows sections based on `selection.kind` and the primary selected item. Multi-selection shows shared properties with mixed-value indicators (`--`) and applies edits to all.
- **Quick-action row** (top, always visible for a clip selection, icon buttons with tooltips, one click each): Fit, Fill, Center, Flip H, Flip V, Reset transform, Fade in 0.5 s, Fade out 0.5 s, Freeze frame, Punch zoom, Speed chips (0.5x, 1x, 1.5x, 2x), Mute, Save as preset (text), Add transition (3 chips), Duplicate, Delete.
- **Sections** (collapsible, state persisted): Clip (name, color, enabled, start/end/duration timecodes editable, source in/out for media clips), Transform (x, y, scale, scale lock, rotation, anchor, flips), Crop (left/top/right/bottom, aspect lock, reset, "crop to frame" button), Opacity, Speed (speed %, duration link, reverse if available, freeze), Audio (gain dB, mute, fades, normalize button, detach audio), Text (content, font, weight, size, color, stroke, shadow, background, alignment, spacing, line height, case, box mode/width), Animation (in/out chips and durations), Keyframes (stopwatch per section header, prev/next keyframe arrows, ease selector for the keyframe at the playhead), Transition (kind, duration, alignment), Marker (label, color, frame), Track (name, kind, height, lock/mute/solo/hide), Caption style (when a cue or the caption track is selected), Project (when nothing is selected: name, resolution presets 9:16 1080x1920 / 4:5 / 1:1 / 16:9 and custom, fps, background color, default durations, default transition duration, proxy settings, autosave interval, cache size, clear cache).
- **Number fields** (`ui/NumberField`): drag horizontally on the label to scrub (Shift = 10x, Alt = 0.1x), type to set, arrow keys ±1 (Shift ±10), Enter commits, Esc reverts, units shown, min/max clamps, commands coalesce while scrubbing (one undo step per gesture). The field binds to the store with a narrow selector and updates its DOM text directly during scrubs; React re-renders only on commit.
- **Stopwatch (keyframes)**: each animatable section (Transform, Opacity, Audio gain) has a stopwatch toggle. Off: edits change the base value. On: edits at the playhead create or update a keyframe at that frame; the section shows a keyframe navigator (prev, add/remove at playhead, next) and the keyframe count; the timeline lane follows the section's first property.
- Color fields open a small popover with a DS-styled picker (hex, RGBA, eyedropper from the preview via `EyeDropper` API if available, recent colors). Font field opens a searchable list with live previews and sections: Favorites, Bundled, System, Used in project.
- The panel never contains actions that are reachable in one click elsewhere twice over; it is the precision tool. Everything in it is also reachable by keyboard (Tab order follows visual order).

---

## 12. Media panel

- Tabs: `Media` (default), `Presets` (§10.3), `Captions` (§10.5).
- Media tab header actions: Import (`Mod+I`), New bin, View grid/list, Sort (name, date, duration, kind), Search field, Filter chips (video, audio, image, unused).
- Grid cards: thumbnail (first frame or 1 s in), duration badge, kind icon, proxy badge, "unused" dim state, name (inline rename on F2), usage count on hover. **Hover-scrub**: moving the cursor across the card scrubs through the media using the thumbnail sheet (no decoding): the x position maps to time; a thin progress line shows the position; the timecode shows in the badge. Pressing `I`/`O` while hovering sets a **source in/out** range stored on the media item in session state (shown as a range bar on the card); double-click or drag then inserts only that range; `Alt+X` while hovering clears it. This replaces a source monitor.
- List view: columns name, duration, resolution, fps, codec, audio, proxy, used; sortable; the same hover-scrub on the thumbnail cell.
- Drag out: to the timeline (§6.14), to the preview canvas, to a bin. Multi-select with Shift/Mod; `Delete` removes selected media (dialog: "Remove from project" / "Remove and delete clips", and a checkbox to delete the copied file from `media/`).
- Missing media (reference mode, file moved): red badge, `Relink` button (file picker, matched by name/size when relinking folders), offline clips keep their timing.
- Context menu: Insert at playhead, Overwrite at playhead, Add to canvas, Generate proxy / Remove proxy, Regenerate thumbnails, Reveal in folder (FSA cannot reveal; shows the relative path and copies it), Rename, Move to bin, Remove.
- Bins: flat folders (one level), shown as a left strip of chips inside the Media tab (no tree). Default bins: All, Video, Audio, Images (virtual).

---

## 13. Preview panel chrome

See §7.8. In addition: a tiny status strip under the transport shows the current quality mode (`Auto: proxy`/`full`), dropped frame count for the last playback (resets on play), and the GPU memory of the texture pool (dev toggle). The panel header has: `Fullscreen`, `Safe zones` dropdown, `Zoom` dropdown, `Quality` dropdown, `Snap` (same global toggle, mirrored), `Guides` toggle.

---

## 14. Audio

- Graph: per audio clip (while active) `AudioBufferSourceNode -> GainNode (clip gain + fades + keyframes, automated with setValueCurveAtTime per scheduled chunk) -> track GainNode (mute/solo) -> master GainNode -> AnalyserNode (meters) -> destination`. Video clips' audio uses the same path with the linked audio clip; muted linked audio clips are silent.
- Decoded audio: full PCM `AudioBuffer` per media (48 kHz, max 2 channels) decoded on import by `decodeAudioData` (main thread, async) from the source file; large files (> 10 min) decode in 60 s segments on demand. Kept in a memory cache with a 512 MB budget (LRU by media); peaks (§9.6) are persistent.
- Speed changes: 0.25x to 4x; audio is resampled (pitch changes) by `playbackRate` on the source node; "preserve pitch" is out of scope.
- Clip gain range -60 dB to +12 dB; `Normalize` sets gain so the clip peak hits -1 dBFS (uses peaks). `Auto-duck music` (one click on a music clip): for every segment where other audio clips (voice) are present on tracks above, creates gain keyframes at -12 dB with 10-frame ramps (parameters in settings).
- Meters: stereo peak with 1.5 s hold and a clip indicator (red) that resets on click. `Master volume` only affects monitoring, never the export.
- Export mixdown: the same scheduling code against an `OfflineAudioContext` at 48 kHz for the export range; encoded to AAC-LC 192 kbps (settings: 128/192/256/320).
- Silence detection (`analysis.worker`): per media, from the peaks, windows of 20 ms; `Auto-cut silence` on selected clips with threshold (dB), minimum silence (ms), padding (ms), preview overlay (red hatched segments on the clip) and one-click apply (split + ripple delete in one transaction).

---

## 15. Projects and file system

- **Start screen** (shown when no project is open): `New project` (asks for a folder via `showDirectoryPicker({ mode: 'readwrite' })`, then name, preset 9:16 1080x1920 30 fps default, fps/resolution pickers), `Open project` (folder picker; must contain `project.json`), `Recent projects` list (from IndexedDB: name, path hint, modified date, thumbnail; opening re-requests permission for the stored directory handle), drag a project folder onto the window to open.
- **Autosave** (BINDING): debounced 1 s after the last command, max every 5 s during continuous editing; writes `project.json` through a `FileSystemWritableFileStream` (write to `project.json.tmp` then write the real file, then delete the tmp; since FSA has no rename, keep the previous version in `history/` before overwriting, rotating 20). Session state saves every 10 s when changed and on `visibilitychange`. The app bar dot shows: saved / saving / unsaved / error (hover shows details, click retries).
- **Crash recovery**: on open, if `project.json.tmp` exists and is newer and valid, offer to restore it.
- **Permissions**: directory handles persisted in IndexedDB; `queryPermission`/`requestPermission` on open; if denied, the project opens read-only with a banner.
- **Project settings changes**: changing resolution offers "scale layout" (transforms scaled proportionally) or "keep"; changing fps converts all frame values by the rational ratio (rounding to nearest, warning if lossy).
- **Multiple projects**: one at a time per tab; opening another closes the current after saving.
- **Templates**: `Save as template` stores the current project settings + text presets + track layout (no media) in IndexedDB; `New from template` on the start screen.

---

## 16. Export

- Entry: `Export` button (app bar) and `Mod+E`: the Export tab opens in the properties panel (not a modal) so the user can keep working; `Esc` or the tab close returns to properties.
- Presets: Instagram Reels (1080x1920, 30 fps, H.264 High, 12 Mbps, AAC 192), TikTok (same, 10 Mbps), YouTube Shorts (1080x1920 or 2160x3840 if the project is 4K, 60 fps if the project is 60), Custom (codec: H.264/HEVC/AV1 as supported by `VideoEncoder.isConfigSupported`, resolution scale 100/75/50%, fps, bitrate mode CBR/VBR with target and max, keyframe interval, audio bitrate, hardware acceleration preference). Presets are editable and saveable.
- Range: whole timeline / in-out range. Filename template `{project}-{preset}-{date}.mp4` editable. Destination: `exports/` in the project folder by default, or `showSaveFilePicker`.
- Pipeline (`export.worker`): a WebGPU device in the worker renders each frame through the shared compositor into an `OffscreenCanvas` (WebGPU context) at the export size; `new VideoFrame(offscreenCanvas, { timestamp })` wraps it for the encoder; `VideoEncoder` with `latencyMode: 'quality'`, chunks muxed by `mp4-muxer` directly into a `FileSystemWritableFileStream` (`fastStart: 'fragmented'` or in-memory moov for compatibility with Instagram upload: use `fastStart: 'in-memory'` for files under 2 GB, else fragmented). Audio from the offline mixdown encoded with `AudioEncoder` (AAC) and muxed interleaved. Backpressure: wait for `encodeQueueSize < 4` before rendering the next frame. Progress by frames, ETA by a moving average, cancel at any time (temp file deleted), pause/resume.
- The editor stays usable during export (the export worker has its own decoders and device; the texture pool budget is split 70/30 while exporting). Playback during export is allowed but quality forced to proxy.
- Extras (one click in the Export tab): `Export frame` (PNG of the current frame at project size), `Export audio` (WAV or AAC in M4A), `Export captions` (SRT/VTT), `Copy frame` (clipboard).
- After export: a toast with `Open folder` (shows path) and the file size, plus a 1-click `Export again` with the same settings. An export log (last 20 jobs) lives in the Export tab.
- Verification (BINDING): the exported file must play in Chrome's `<video>`, in VLC, and upload to Instagram without re-encoding failures; keyframe interval must be <= 2 s; the moov atom must be at the front for in-memory fastStart; audio/video drift over 10 minutes under 1 frame.

---

## 17. One-click inventory (where each button lives)

| Location | Buttons (left to right) |
|---|---|
| App bar | Project name, Save status, Undo, Redo, Settings, Export |
| Timeline toolbar | Select, Razor, Hand, Slip, Slide, Rate stretch ‖ Snap, Linked selection, Ripple mode, Show keyframes, Audio scrub ‖ Split, Delete, Ripple delete, Close gap, Compact (close all gaps), Add marker, Freeze frame, Punch zoom ‖ + Title, + Subtitle, + Caption track, + Solid, + Image, favorite preset chips ‖ Zoom -, slider, Zoom +, Fit, Zoom to selection, Track height ‖ Timecode, Duration |
| Track header | Target, Lock, Mute, Solo, Hide, + track (top/bottom) |
| Preview chrome | To start, Prev frame, Play/Pause, Next frame, To end, Loop, Play in/out, Mute, Master volume ‖ Timecode, Duration ‖ Zoom, Fit, Quality, Overlays, Snap, Guides, Fullscreen |
| Properties quick row | Fit, Fill, Center, Flip H, Flip V, Reset, Fade in, Fade out, Freeze, Punch zoom, 0.5x, 1x, 1.5x, 2x, Mute, Save preset, Update preset, Dissolve, Dip black, Dip white, Duplicate, Delete |
| Media header | Import, New bin, Grid/List, Sort, Filters, Search |
| Presets header | New from selection, Import, Export, Global/Project toggle, Search |
| Captions header | + Cue, Import SRT, Export SRT, Style, Transcribe, Clear |
| Export tab | Preset chips, Range toggle, Destination, Export, Export frame, Export audio, Export captions, Copy frame |

Every button: icon + tooltip with the shortcut, DS small size, hover and active states, disabled state when not applicable (never hidden, so the layout never shifts).

---

## 18. Keyboard map (BINDING: single source `core/keyboard/keymap.ts`)

| Action | Keys | Scope |
|---|---|---|
| Play/Pause | Space | global |
| Shuttle back / pause / forward | J / K / L | global |
| Step frame | Left / Right | global (not in text editing) |
| Step 5 frames | Shift+Left / Shift+Right | global |
| Step 1 s | Mod+Left / Mod+Right | global |
| Start / End | Home / End | global |
| Prev / next edit point | Up / Down | timeline |
| Prev / next marker | Shift+Up / Shift+Down | timeline |
| Play around | Shift+K | global |
| Play in to out | Mod+Shift+Space | global |
| Loop toggle | Mod+Shift+L | global |
| Split at playhead | Mod+K | global |
| Split all tracks | Mod+Shift+K | global |
| Delete / Ripple delete | Delete, Backspace / Shift+Delete, Shift+Backspace | timeline, preview |
| Ripple trim prev / next to playhead | Q / W | global |
| Extend edit to playhead | E | timeline |
| Close gap / Close all gaps | G / Shift+G | timeline |
| Lift / Extract | ; / ' | timeline |
| Add marker | M | global |
| In / Out / clear In / clear Out / clear both | I / O / Alt+I / Alt+O / Alt+X | global |
| Go to In / Out | Shift+I / Shift+O | global |
| Mark clip | X | timeline |
| Snap toggle (hold to invert during drag) | S | global |
| Linked selection toggle | Shift+S | global |
| Tools | V, C, H, Y, U, R | global |
| Add Title / Subtitle | T / Shift+T | global |
| Freeze frame / Punch zoom | Shift+F / Shift+Z | global |
| Undo / Redo | Mod+Z / Mod+Shift+Z, Mod+Y | global |
| Cut / Copy / Paste / Paste insert / Paste attributes | Mod+X / Mod+C / Mod+V / Mod+Shift+V / Mod+Alt+V | timeline, preview |
| Duplicate | Mod+D | timeline, preview |
| Default transition | Mod+Shift+D | timeline |
| Select all / Deselect | Mod+A / Mod+Shift+A | timeline, preview |
| Group / Ungroup | Mod+G / Mod+Shift+G | timeline |
| Link / Unlink | Mod+L | timeline |
| Nudge clip 1 / 5 frames | Alt+Left/Right / Alt+Shift+Left/Right | timeline |
| Move clip to adjacent track | Alt+Up / Alt+Down | timeline |
| Zoom in / out / fit / to selection | = / - / \ / Shift+\ | timeline |
| Track height cycle | Mod+Alt+Up / Mod+Alt+Down | timeline |
| Center playhead | Mod+Shift+. | timeline |
| Canvas nudge 1 / 10 px | Arrows / Shift+Arrows | preview |
| Canvas zoom fit / 100% / 200% | Mod+0 / Mod+1 / Mod+2 | preview |
| Edit text | Enter (text clip selected) | preview, timeline |
| Commit / cancel text editing | Mod+Enter, Esc | textEditing |
| Fullscreen preview | F | global |
| Import media | Mod+I | global |
| New / Open / Save now | Mod+N / Mod+O / Mod+S | global |
| Export | Mod+E | global |
| Command palette | Mod+Shift+P | global |
| Rename (clip, media, track) | F2 | timeline, media |
| Cancel gesture / close popover | Esc | global |

Conflicts with browser shortcuts are prevented inside the app window only. The shortcut editor (settings) can rebind any action; the keymap file is the default.

---

## 19. Glossary

- **Edit point**: a clip start or end on an unlocked track.
- **Junction**: the boundary between two adjacent clips with no gap.
- **Handle**: unused source media beyond a clip's in/out (needed by transitions and trims).
- **Ripple**: shifting all later clips on all unlocked tracks to absorb a duration change.
- **Roll**: moving a junction between two clips without changing total duration.
- **Slip**: changing a clip's source range without moving it on the timeline.
- **Slide**: moving a clip on the timeline by trimming its neighbors.
- **Targeted track**: a track whose header target toggle is on; used by playhead-based operations.
- **LOD**: level of detail (proxy vs full decode; thumbnail density).
- **Ghost**: the semi-transparent preview of clips during a drag.
- **Compact**: close all gaps on the targeted tracks.
