# Shorts Editor architecture (v1.0.0)

One page on spec §3 as it was built. The binding rules are in `docs/EDITOR_SPEC.md` §3 and §4; the
decisions that differ from the spec, each with its reason, are in `docs/PROGRESS.md` (Global deviations).

## Stack

TypeScript (strict, ES2022, ESM), Vite, Vitest (jsdom) for the engine tests, React 18 for panel chrome only,
CSS Modules on the design tokens of `src/styles/tokens.css` (the only file with color literals; lint
enforces it), `lucide-react` icons. Runtime dependencies: Immer (commands and undo), mp4box (MP4/MOV
demux), mp4-muxer (export), idb-keyval (settings, handles), transformers.js with ONNX Runtime (optional
local transcription, in its worker). WebM is read by the app's own EBML demuxer (`media/demux/webm.ts`).

## The four kinds of state (§3.3)

| State | Where | Rules |
| --- | --- | --- |
| Document | `core/store/DocumentStore.ts` holds the immutable `Project` (`core/document/types.ts`) | Changed only by commands `(draft, ctx) => void` run through Immer `produceWithPatches`; the inverse patches are the undo step (`core/commands/UndoStack.ts`). Commands carry a `label`, a `coalesceKey` (300 ms merge for scrubs and nudges) and `affects` flags. Transactions group commands into one step. Frames are integers at the project rate, media times integer µs; conversions only in `core/document/time.ts` (P4). `validateProject` checks the document in tests and on load. |
| Session | `core/store/sessionStore.ts`, `layoutStore.ts` | Selection, playhead, in/out, zoom and scroll, panel sizes, tools and toggles. Not undoable; `session.json` every 10 s and when the tab hides. |
| Ephemeral | The view that runs the gesture (timeline gestures, gizmo, field scrubs in `app/liveEdit.ts`) | Plain mutable objects, never React state. A gesture commits one command on release (P2). |
| Derived caches | Texture pool, frame rings, thumbnail sheets, peaks, text rasters, layout caches | Rebuildable, keyed explicitly, invalidated by `affects`; disk copies under `<project>/cache/`. |

React reads stores through `useSyncExternalStore` with narrow selectors (`core/store/useStoreSelector.ts`).
The timeline, the preview, the compositor and the audio engine subscribe directly.

## Rendering (§3.4, §6.17, §9.4)

- One `FrameScheduler` (`core/scheduler/FrameScheduler.ts`) wraps `requestAnimationFrame`: views call
  `invalidate(flag)`, each dirty view renders at most once per frame; the playback engine is a ticker at
  the start of the frame. Idle work (thumbnails, peaks, font preloads) runs in `IdleQueue` slices that
  pause while playing or dragging.
- The timeline (`timeline/view/`) is framework-free with two canvases: content (ruler, clips, thumbnails,
  waveforms, markers) and overlay (playhead, hover, ghosts, snap lines, trims). Playback redraws the
  overlay only (P3); drawing is virtualized by binary search per track (P10).
- The preview (`render/preview/PreviewView.ts`) draws the composite of the timeline at the playhead. The
  `Compositor` (`render/compositor/`) evaluates the document at a frame into a draw list (layers,
  matrices, opacity, crops, transitions, text, captions), and a `Renderer` draws it. Two backends behind
  one interface (`render/gpu/`): WebGPU (WGSL), and WebGL2 when WebGPU is missing (Batch 48), chosen once
  at startup (`?renderer=webgl2` forces it); the CPU side of a draw is shared (`drawRecords.ts`).
- A 2D overlay canvas over the preview holds the gizmo, guides, safe zones and inline text editing.
- Text (`render/text/`): layout and Canvas2D rasterization to textures, cached by content, style and scale
  bucket (P11); animated text draws per word or line from an atlas and moves on the GPU.
- Fonts (`render/text/FontLibrary.ts`, Batch 51): the font library (`public/fonts/library/`, its catalog
  read on the first font browser open), My fonts (IndexedDB), the project's copies (`<project>/fonts/`)
  and installed fonts. Library and My fonts files load on demand through `FontLoadQueue` (6 at a time,
  cancellable); text that needs a face gets it at once, while font browser rows get theirs in idle-time
  batches, since each face added to the document's font set restyles the page. The export worker adds
  the same faces (the copies, library URLs, My fonts bytes) before its first frame.
- Theme bridge (`core/theme/theme.ts`): the CSS custom properties read into a typed `Theme` for canvases,
  again when `data-theme` changes.

## Media, workers and memory (§3.5, §9, P5-P8, P13)

- `media/workers/`: one typed protocol (`protocol.ts`) and a `WorkerPool` (request ids, priorities,
  cancellation, crash detection with a watchdog since Batch 47). Workers: `decode` (demux, sample index,
  `VideoDecoder` sessions, MP4/WebM audio decode), `analysis` (thumbnail sheets, peaks, silence),
  `proxy` (decode, scale, encode proxies into `cache/proxies/`), `export` (its own GPU device,
  compositor, decoders through an in-thread loopback, `VideoEncoder`/`AudioEncoder`, mp4-muxer) and
  `transcribe` (Whisper; loaded on first use).
- The main thread uploads frames to the GPU and closes them at once (`media/decode/FrameService.ts`,
  playback windows ahead of the playhead, P7 decoder warm-up, progressive scrub refinement P8); textures come from
  a budgeted LRU pool (`media/cache/TexturePool.ts`, P6). Proxies (Auto quality) play 4K sources
  smoothly; the full frame is drawn when the playhead rests.
- Audio (`audio/`): MP4 audio decodes in the decode worker into `AudioBuffer`s by segment; other formats
  through `decodeAudioData`. `AudioMixer` (voices, track gains, mix bus, monitor, meters),
  `AudioScheduler` (clips played in sync with `AudioClock`, the master clock of playback), scrub grains,
  and an offline mixdown for export and transcription.
- Playback (`playback/PlaybackEngine.ts`): moves the session playhead from the audio clock, feeds the
  decoders ahead, counts dropped frames; React only sees `playing`.

## Keyboard and commands (§3.6, §18)

`core/keyboard/keymap.ts` is the single source of default keys (data); user overrides live in the app
settings. One `KeyDispatcher` on `window` resolves keys against the focus scope (`global`, `timeline`,
`preview`, `media`, `properties`, `textEditing`, `dialog`); text inputs own their keys. Keys, buttons,
context menus and the command palette all run command ids through the `CommandRegistry`
(`core/commands/CommandRegistry.ts`); labels, icons and categories are data in `app/commandCatalog.ts`.
The README's cheat sheet is generated from the same data (`app/shortcutDoc.ts`).

## App shell and persistence (§2, §15)

- `app/`: the React shell (app bar, splitters, panel frames, dialogs, toasts) and the controllers that
  connect stores, views and workers (`install*Controller` in `main.tsx`). `panels/` and `ui/` hold the
  React panels and shared controls.
- `project/`: the File System Access folder behind a small `FsDir` interface (in memory in tests), the project
  file with schema migrations, autosave (`project.json.tmp`, then `project.json`, the previous version
  into `history/`, 20 kept), crash recovery, permissions and read-only mode, templates, recent projects
  and settings in IndexedDB.
- `export/`: jobs, presets, the queue and the pipeline the export worker runs.

## Startup and build

`main.tsx` checks the required APIs (`app/compat.ts`) and a GPU backend, else shows the unsupported
screen; then it starts the services and mounts React once. Heavy modules (export pipeline, transcription,
local font listing) are dynamic imports or worker chunks (P12). `vite build` writes a static site to
`dist/`, with `licenses.txt` from `scripts/licenses.ts`; hosting needs no special headers (README).
