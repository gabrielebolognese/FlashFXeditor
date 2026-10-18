# Shorts Editor

A browser video editor for short vertical videos (Instagram Reels, TikTok, YouTube Shorts). It runs as a
static site in desktop Chrome or Edge: projects are folders on your own disk, media never leaves the
computer, and there is no server. Version 1.0.0.

- User guide: [`docs/user-guide/`](docs/user-guide/README.md)
- Architecture (one page): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Specification: [`docs/EDITOR_SPEC.md`](docs/EDITOR_SPEC.md); build plan and history: [`docs/BATCHES.md`](docs/BATCHES.md), [`docs/PROGRESS.md`](docs/PROGRESS.md) (with the known issues of this release); open work: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- Design system: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
- The common path in one minute (import, cut, compact, title, subtitle, export), recorded on the 1.0.0 build: [`docs/release/v1.0.0-common-path.webm`](docs/release/v1.0.0-common-path.webm)

## Browser requirements

- Desktop Chromium: Chrome or Edge, current stable. Windows is the main platform; macOS and Linux work
  where the APIs below do. The layout needs at least 1600x900 and is designed for 1920x1080 and up.
- A secure context: `https://` or `http://localhost`.
- These APIs, checked at startup (a missing one shows a full-screen list of what is missing; there is
  no degraded mode):
  - a GPU renderer: WebGPU, or WebGL2 where WebGPU is not available (hardware acceleration on);
  - WebCodecs: `VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`, `VideoFrame`, `ImageDecoder`;
  - File System Access: `showDirectoryPicker`, `showSaveFilePicker`;
  - Web Audio, module Web Workers, `OffscreenCanvas`.
- Optional: Local Font Access (`queryLocalFonts`) for system fonts in titles.

## Setup

Requires Node 22.12 or newer.

```bash
npm ci
npm run dev
```

The dev server prints its address (http://localhost:5173 by default). Open it in Chrome or Edge.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serves the production build (http://localhost:4173) |
| `npm run typecheck` | Type check without emitting |
| `npm run lint` | ESLint (with the color-literal rule) and the CSS color and token checks |
| `npm test` | Vitest: the unit tests, then the timing tests one file at a time |
| `npm run check` | typecheck + lint + test + build |
| `npm run docs:shortcuts` | Rewrites the shortcuts section of this README from the keymap |
| `node scripts/fonts/fetch-library.mjs` | Downloads the font library again (the only step that needs the network; its output is committed, see below) |

## Production build and hosting

```bash
npm ci && npm run build && npm run preview
```

`dist/` is a static site; any static file host serves it:

- **Headers:** none beyond the standard ones. The app is not cross-origin isolated and does not need
  `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`: nothing uses `SharedArrayBuffer`, and
  transcription runs ONNX Runtime on WebGPU or single-threaded WebAssembly. Setting COEP
  `require-corp` would also require CORP headers on the model downloads, so leave it off.
- **HTTPS:** WebGPU, WebCodecs and the File System Access API need a secure context.
- **MIME types:** `.js` as `text/javascript` (the workers are module workers), `.wasm` as
  `application/wasm`, `.woff2` as `font/woff2`, `.txt` as `text/plain`.
- **Caching:** files under `assets/` have content hashes and can be cached forever (`immutable`); serve
  `index.html` with `no-cache` so a new release is picked up.
- **Path:** the build expects the site root of an origin. For a sub-path, build with
  `npx vite build --base=/sub/path/`.
- **Network:** everything the editor needs ships in `dist/`, the font library included
  (`fonts/library/`: 330 families, about 32 MB, each file loaded only when it is shown or used). Only
  the optional Whisper transcription models are downloaded from huggingface.co on first use, then kept
  in the browser's cache. A
  Content-Security-Policy, if you add one, must allow `wasm-unsafe-eval` and those downloads.
- **Licenses:** `dist/licenses.txt` lists every bundled package and font with its license
  (Settings > About > View licenses); each library font's full license text is in
  `fonts/library/LICENSES/`, and Settings > About > Font licenses lists them with their designers.

## Project folder layout

A project is a folder you pick (spec §9.7, §15). The editor writes:

```
<project>/
  project.json          the document (meta.appVersion: the editor version that saved it)
  project.json.tmp      only while a save is in progress (crash recovery)
  session.json          selection, playhead, zoom, panel sizes (not undoable)
  media/                imported files in copy mode
  fonts/                every font the project uses (library, My fonts, system), copied when used;
                        fonts.json records each file's family, weight, style and source
  cache/                disposable: index/ proxies/ thumbs/ peaks/ text/ export-temp/
  history/              the last 20 saves, project-YYYYMMDD-HHMMSS.json
  exports/              default export destination
  presets/text/         project text presets
```

Deleting `cache/` only costs regeneration (Settings > General > Clear cache does it for the open project).

## Source layout

```
src/
  app/        React shell, controllers wiring the stores to the views, the command catalog
  core/       document types, validation and time math; commands and undo; stores; frame scheduler;
              keyboard (keymap, focus scopes); theme bridge
  media/      byte access, MP4 and WebM demux, decode, probes, proxies, analysis, the workers
  render/     GPU (WebGPU and WebGL2 renderers), compositor, text rasterizer, preview view
  playback/   playback engine
  audio/      audio graph, scheduler, meters, scrubbing, offline mixdown
  timeline/   timeline queries, pure edits, snapping, the canvas view, toolbar, menus
  text/       text styles, presets, animations, captions, SRT/VTT
  project/    project folder, project file, autosave, history, templates
  export/     export jobs, pipeline, presets, queue
  panels/     React panels: media, properties, presets, captions, export, settings
  ui/         shared React controls
  styles/     tokens.css (design tokens: the only place for color literals) and base styles
scripts/      lint checks, the license list plugin, the README shortcut generator, the batch runner,
              fonts/ (the font library's list, families.json, and its downloader)
public/fonts/library/   the font library: one folder per family (woff2, latin and latin-ext), LICENSES/,
                        catalog.json
```

## Font library

`public/fonts/library/` is checked in, so a fresh clone builds and runs with no network. It is made by
`node scripts/fonts/fetch-library.mjs` from `scripts/fonts/families.json` (the hand-curated families,
their looks and tags): Google Fonts families through Fontsource, kept only under the SIL Open Font
License, Apache 2.0 or the Ubuntu Font Licence. A rerun fetches the versions `catalog.json` records
(`--update` takes the latest) and reproduces the folder; it prints the total size (cap 40 MB).

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how these fit together.

## Keyboard shortcuts

The default keys (spec §18). Every key can be changed in Settings > Shortcuts; inside the editor,
`?` opens this list with your own keys, and `Ctrl+Shift+P` (`⇧⌘P`) finds any command by name.

<!-- shortcuts:start (generated from src/core/keyboard/keymap.ts by npm run docs:shortcuts) -->

### Transport

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Play / Pause | `Space` | `Space` | Everywhere |
| Shuttle back | `J` | `J` | Everywhere |
| Shuttle pause | `K` | `K` | Everywhere |
| Shuttle forward | `L` | `L` | Everywhere |
| Previous frame | `Left` | `Left` | Everywhere |
| Next frame | `Right` | `Right` | Everywhere |
| Back 5 frames | `Shift+Left` | `⇧Left` | Everywhere |
| Forward 5 frames | `Shift+Right` | `⇧Right` | Everywhere |
| Back 1 second | `Ctrl+Left` | `⌘Left` | Everywhere |
| Forward 1 second | `Ctrl+Right` | `⌘Right` | Everywhere |
| Go to start | `Home` | `Home` | Everywhere |
| Go to end | `End` | `End` | Everywhere |
| Play around the playhead | `Shift+K` | `⇧K` | Everywhere |
| Play in to out | `Ctrl+Shift+Space` | `⌘⇧Space` | Everywhere |
| Loop playback | `Ctrl+Shift+L` | `⌘⇧L` | Everywhere |

### Timeline

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Previous edit point | `Up` | `Up` | Timeline |
| Next edit point | `Down` | `Down` | Timeline |
| Previous marker | `Shift+Up`, `Ctrl+Shift+M` | `⇧Up`, `⌘⇧M` | Timeline |
| Next marker | `Shift+Down`, `Shift+M` | `⇧Down`, `⇧M` | Timeline |
| Zoom in | `=` | `=` | Timeline |
| Zoom out | `-` | `-` | Timeline |
| Zoom to fit | `\` | `\` | Timeline |
| Zoom to selection | `Shift+\` | `⇧\` | Timeline |
| Center playhead | `Ctrl+Shift+.` | `⌘⇧.` | Timeline |
| Taller selected tracks | `Ctrl+Alt+Up` | `⌘⌥Up` | Timeline |
| Shorter selected tracks | `Ctrl+Alt+Down` | `⌘⌥Down` | Timeline |

### Edit

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Split at playhead | `Ctrl+K` | `⌘K` | Everywhere |
| Split all tracks at playhead | `Ctrl+Shift+K` | `⌘⇧K` | Everywhere |
| Delete | `Delete`, `Backspace` | `Delete`, `Backspace` | Timeline, Preview, Media |
| Ripple delete | `Shift+Delete`, `Shift+Backspace` | `⇧Delete`, `⇧Backspace` | Timeline, Preview |
| Ripple trim start to playhead | `Q` | `Q` | Everywhere |
| Ripple trim end to playhead | `W` | `W` | Everywhere |
| Extend edit to playhead | `E` | `E` | Timeline |
| Close gap | `G` | `G` | Timeline |
| Close all gaps | `Shift+G` | `⇧G` | Timeline |
| Lift in/out range | `;` | `;` | Timeline |
| Extract in/out range | `'` | `'` | Timeline |
| Freeze frame at playhead | `Shift+F` | `⇧F` | Everywhere |
| Punch zoom at playhead | `Shift+Z` | `⇧Z` | Everywhere |
| Duplicate | `Ctrl+D` | `⌘D` | Timeline, Preview |
| Add default transition | `Ctrl+Shift+D` | `⌘⇧D` | Timeline |
| Group | `Ctrl+G` | `⌘G` | Timeline |
| Ungroup | `Ctrl+Shift+G` | `⌘⇧G` | Timeline |
| Link / Unlink | `Ctrl+L` | `⌘L` | Timeline |
| Nudge clips 1 frame left | `Alt+Left` | `⌥Left` | Timeline |
| Nudge clips 1 frame right | `Alt+Right` | `⌥Right` | Timeline |
| Nudge clips 5 frames left | `Alt+Shift+Left` | `⌥⇧Left` | Timeline |
| Nudge clips 5 frames right | `Alt+Shift+Right` | `⌥⇧Right` | Timeline |
| Move clips to the track above | `Alt+Up` | `⌥Up` | Timeline |
| Move clips to the track below | `Alt+Down` | `⌥Down` | Timeline |
| Rename | `F2` | `F2` | Timeline, Media |
| Undo | `Ctrl+Z` | `⌘Z` | Everywhere |
| Redo | `Ctrl+Shift+Z`, `Ctrl+Y` | `⌘⇧Z`, `⌘Y` | Everywhere |

### Clipboard

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Cut | `Ctrl+X` | `⌘X` | Timeline, Preview |
| Copy | `Ctrl+C` | `⌘C` | Timeline, Preview |
| Paste | `Ctrl+V` | `⌘V` | Timeline, Preview |
| Paste insert | `Ctrl+Shift+V` | `⌘⇧V` | Timeline, Preview |
| Paste attributes… | `Ctrl+Alt+V` | `⌘⌥V` | Timeline, Preview |

### Selection

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Select all | `Ctrl+A` | `⌘A` | Timeline, Preview, Media |
| Deselect all | `Ctrl+Shift+A` | `⌘⇧A` | Timeline, Preview |

### Markers and range

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Add marker | `M` | `M` | Everywhere |
| Mark in | `I` | `I` | Everywhere |
| Mark out | `O` | `O` | Everywhere |
| Clear in | `Alt+I` | `⌥I` | Everywhere |
| Clear out | `Alt+O` | `⌥O` | Everywhere |
| Clear in and out | `Alt+X` | `⌥X` | Everywhere |
| Go to in | `Shift+I` | `⇧I` | Everywhere |
| Go to out | `Shift+O` | `⇧O` | Everywhere |
| Mark clip | `X` | `X` | Timeline |

### Tools

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Select tool | `V` | `V` | Everywhere |
| Razor tool | `C` | `C` | Everywhere |
| Hand tool | `H` | `H` | Everywhere |
| Slip tool | `Y` | `Y` | Everywhere |
| Slide tool | `U` | `U` | Everywhere |
| Rate stretch tool | `R` | `R` | Everywhere |

### Toggles

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Snap | `S` | `S` | Everywhere |
| Linked selection | `Shift+S` | `⇧S` | Everywhere |
| Audio scrub | `Alt+S` | `⌥S` | Everywhere |

### Add

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Add title | `T` | `T` | Everywhere |
| Add subtitle | `Shift+T` | `⇧T` | Everywhere |

### Text

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Edit text | `Enter` | `Enter` | Timeline, Preview |
| Finish editing text | `Ctrl+Enter` | `⌘Enter` | Text editing |
| Leave text editing | `Escape` | `Escape` | Text editing |

### Presets

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Apply preset bar button 1 | `Alt+1` | `⌥1` | Everywhere |
| Apply preset bar button 2 | `Alt+2` | `⌥2` | Everywhere |
| Apply preset bar button 3 | `Alt+3` | `⌥3` | Everywhere |
| Apply preset bar button 4 | `Alt+4` | `⌥4` | Everywhere |
| Apply preset bar button 5 | `Alt+5` | `⌥5` | Everywhere |
| Apply preset bar button 6 | `Alt+6` | `⌥6` | Everywhere |
| Apply preset bar button 7 | `Alt+7` | `⌥7` | Everywhere |
| Apply preset bar button 8 | `Alt+8` | `⌥8` | Everywhere |
| Apply preset bar button 9 | `Alt+9` | `⌥9` | Everywhere |

### Canvas

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Nudge layers 1 px left | `Left` | `Left` | Preview |
| Nudge layers 10 px left | `Shift+Left` | `⇧Left` | Preview |
| Nudge layers 1 px right | `Right` | `Right` | Preview |
| Nudge layers 10 px right | `Shift+Right` | `⇧Right` | Preview |
| Nudge layers 1 px up | `Up` | `Up` | Preview |
| Nudge layers 10 px up | `Shift+Up` | `⇧Up` | Preview |
| Nudge layers 1 px down | `Down` | `Down` | Preview |
| Nudge layers 10 px down | `Shift+Down` | `⇧Down` | Preview |
| Preview zoom: Fit | `Ctrl+0` | `⌘0` | Preview |
| Preview zoom 100% | `Ctrl+1` | `⌘1` | Preview |
| Preview zoom 200% | `Ctrl+2` | `⌘2` | Preview |

### Preview

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Fullscreen preview | `F` | `F` | Everywhere |

### Media

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Import media | `Ctrl+I` | `⌘I` | Everywhere |
| Insert media at playhead | `,` | `,` | Media |
| Overwrite media at playhead | `.` | `.` | Media |

### Project

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| New project | `Ctrl+Alt+N`, `Ctrl+N` | `⌘⌥N`, `⌘N` | Everywhere |
| Open project | `Ctrl+O` | `⌘O` | Everywhere |
| Save now | `Ctrl+S` | `⌘S` | Everywhere |

### Export

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Export… | `Ctrl+E` | `⌘E` | Everywhere |

### App

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Command palette | `Ctrl+Shift+P` | `⌘⇧P` | Everywhere |
| Keyboard shortcuts | `Shift+/`, `?` | `⇧/`, `?` | Everywhere |
| Cancel gesture / close | `Escape` | `Escape` | Everywhere |

<!-- shortcuts:end -->
