# FlashFXeditor (Shorts Editor)

Shorts Editor is a browser video editor for short vertical videos (Instagram Reels, TikTok, YouTube Shorts; 9:16 by default, with other frame sizes and rates supported). It runs as a static site in desktop Chrome or Edge: projects are folders on your own disk, media never leaves the computer, and there is no server. It is for creators who want a local-first timeline editor, and for developers of other tools who want to write projects that the editor opens, validates and renders: the repository also ships a Node command line with a capability manifest, a strict validator and a headless renderer.

The package is named `shorts-editor`, version 1.2.0 (project schema 24).

## Features

**Editing and timeline**
- Multi-track timeline with video, audio and caption tracks, drawn on canvas; select, razor, hand, slip, slide and rate stretch tools.
- Split, ripple delete, ripple trim to playhead, extend edit, close gaps, lift and extract an in/out range, nudge, duplicate, paste insert and paste attributes.
- Snapping, markers, in/out points, links and groups, and compound clips (nested sequences) that can be opened and closed.
- Undo and redo for every document change; a command palette and remappable keyboard shortcuts.
- Remove silence, freeze frame and punch zoom at the playhead.

**Clips and compositing**
- Clip kinds: video, audio, image, Lottie (`.json`, `.lottie`), text, solid, caption, compound, vector shape, null and adjustment.
- Transform with crop, 2.5D rotation and depth, parenting, and motion paths with auto-orient.
- Keyframes on transform, opacity, volume, crop, size, corner radius, fill, stroke, shadow and text properties, with a wide set of eases.
- 13 blend modes, alpha and luma track mattes, masks (add, subtract, intersect, with feather and path keyframes), adjustment clips.
- 21 effects: Gaussian and directional blur, glow, drop shadow, outline, color adjust, vignette, sharpen, grain, chroma key, luma key, LUT, RGB split, pixelate, mirror, wave, glitch, posterize, invert, denoise and color correct.
- 13 transitions: cross dissolve, dip to black, dip to white, slide, push, wipe, iris, zoom in, zoom out, whip, blur dissolve, glitch and flash.
- Vector shapes with primitives (rectangle, ellipse, polygon, star, arrow, arc, line), trim paths and SVG import.

**Text and captions**
- Titles with color and gradient fills, stroke, shadow, line, block and word boxes, styled spans, counters and range animators.
- 21 text animations by character, word or line; text presets and a preset bar with thumbnails.
- Captions with word timing, seven highlight modes, per-cue style overrides, emphasis words and cue animations; SRT and VTT support.
- Optional local transcription with Whisper models (transformers.js on ONNX Runtime, in a worker); the models are downloaded from huggingface.co on first use.
- A bundled font library of 330 families (about 32 MB, each file loaded only when it is shown or used), plus your own fonts and, where the browser allows it, installed system fonts.

**Media and time**
- Imports MP4, MOV, M4V and WebM video; MP3, M4A, AAC, WAV and Ogg audio; PNG, JPEG, WebP, GIF and SVG images, including animated GIF and WebP, alpha video and image sequences.
- Proxies, thumbnails and waveforms generated in workers; bins, search, offline media and relinking.
- Speed from 0.25x to 4x, freeze, reverse, time remap and frame blending.

**Audio**
- Clip and track gain (-60 to +12 dB), pan, fades with linear, equal power and exponential curves, a loudness target, beat markers, audio scrubbing and meters.

**Templates**
- A compound clip can become a template with text, color, number, media, font and toggle parameters; each instance has its own values.
- Seven ready-made projects in `templates/`: montage, kinetic typography, documentary, overlay stack, podcast, format edge cases and a tour of every 1.2 feature.

**Export**
- MP4, WebM (optionally transparent), PNG sequence and GIF; H.264, HEVC, AV1 and VP9 video codecs through WebCodecs.
- Export presets and a queue, audio stems (one WAV per audio track), collect linked media, and project zip.

**Projects**
- A project is a plain folder with `project.json`, autosave, crash recovery and the last 20 saves in `history/`.
- Watched project folders, an inbox for projects written by other tools, and `/?open=<path>` links.

**Interoperability and command line**
- `capabilities.json`: a manifest of everything the editor supports, generated from the code.
- CLI commands to validate, inspect, normalize, render and compare projects, fill template parameters, print the JSON Schema of `project.json`, and measure and apply denoise and color correction (also over local HTTP).
- Conformance fixtures in `fixtures/interop/`, rendered on both GPU backends by `npm run test:render`.

## Getting started

### Prerequisites

- Node.js 22.12 or newer (`engines` in `package.json`) and npm.
- Desktop Chromium: Chrome or Edge, current stable. Windows is the main platform; macOS and Linux work where the APIs below do. The layout needs at least 1600x900 and is designed for 1920x1080 and up.
- A secure context: `https://` or `http://localhost`.
- These browser APIs, checked at startup (a missing one shows a full-screen list of what is missing; there is no degraded mode):
  - a GPU renderer: WebGPU, or WebGL2 where WebGPU is not available (hardware acceleration on);
  - WebCodecs: `VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`, `VideoFrame`, `ImageDecoder`;
  - File System Access: `showDirectoryPicker`, `showSaveFilePicker`;
  - Web Audio, module Web Workers, `OffscreenCanvas`.
- Optional: Local Font Access (`queryLocalFonts`) for system fonts in titles.

### Download

```bash
git clone https://github.com/gabrielebolognese/FlashFXeditor.git
cd FlashFXeditor
```

The repository is large (about 350 MB): it includes the font library, the template projects with their media, and the interop fixtures. `git clone --depth 1` skips the history.

### Install and run

```bash
npm ci
npm run dev
```

The dev server prints its address (http://localhost:5173 by default). Open it in Chrome or Edge.

### Configuration

None is required. The editor reads no environment variables; `.env.example` holds only a commented placeholder. The headless renderer of the CLI looks for an installed Chrome, Chromium or Edge and accepts `CHROME_PATH` to point at one.

## Build and deploy

```bash
npm ci && npm run build && npm run preview
```

`npm run build` writes a static site to `dist/`; `npm run preview` serves it (http://localhost:4173). Any static file host can serve `dist/`:

- **Headers:** none beyond the standard ones. The app is not cross-origin isolated and does not need `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`: nothing uses `SharedArrayBuffer`, and transcription runs ONNX Runtime on WebGPU or single-threaded WebAssembly. Setting COEP `require-corp` would also require CORP headers on the model downloads, so leave it off.
- **HTTPS:** WebGPU, WebCodecs and the File System Access API need a secure context.
- **MIME types:** `.js` as `text/javascript` (the workers are module workers), `.wasm` as `application/wasm`, `.woff2` as `font/woff2`, `.txt` as `text/plain`.
- **Caching:** files under `assets/` have content hashes and can be cached forever (`immutable`); serve `index.html` with `no-cache` so a new release is picked up.
- **Path:** the build expects the site root of an origin. For a sub-path, build with `npx vite build --base=/sub/path/`.
- **Network:** everything the editor needs ships in `dist/`, the font library included (`fonts/library/`). Only the optional Whisper transcription models are downloaded from huggingface.co on first use, then kept in the browser's cache. A Content-Security-Policy, if you add one, must allow `wasm-unsafe-eval` and those downloads.
- **Licenses of bundled code and fonts:** `dist/licenses.txt` lists every bundled package and font with its license (Settings > About > View licenses); each library font's full license text is in `fonts/library/LICENSES/`.

The command line is built separately: `npm run build:cli` bundles it for Node into `dist-cli/project-cli.mjs`.

## Usage

### In the browser

1. Open the editor and choose **New project** (pick an empty folder, a frame size and a frame rate) or **Open project** (pick an existing project folder, for example `templates/03-ww2-documentary`).
2. Import media (`Ctrl+I`, or drop files on the Media panel), add clips to the timeline, cut and arrange them, add titles (`T`) and subtitles (`Shift+T`).
3. Export with `Ctrl+E`.

Inside the editor, `?` lists the shortcuts with your own keys, and `Ctrl+P` or `F1` finds any command by name. The full instructions are in the [user guide](docs/user-guide/README.md).

Opening a template writes `cache/`, `history/` and `session.json` into its folder (ignored by git) and saves your edits into its `project.json`; `git checkout -- templates/<name>/project.json` restores it. See [`templates/README.md`](templates/README.md).

### npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serves the production build (http://localhost:4173) |
| `npm run typecheck` | Type check without emitting |
| `npm run lint` | ESLint (with the color-literal rule) and the CSS color and token checks |
| `npm test` | Vitest: the unit tests, then the timing tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check` | typecheck + lint + test + build |
| `npm run build:cli` | Bundles the project CLI into `dist-cli/project-cli.mjs` |
| `npm run cli -- <command>` | Rebuilds the CLI when its sources changed, then runs it |
| `npm run capabilities` | Rewrites `capabilities.json` from the code |
| `npm run test:render` | Renders the interop fixtures on WebGPU and WebGL2 and compares the frames (needs a GPU, Chrome and a built `dist/`) |
| `npm run docs:interop` | Rewrites the field reference of `docs/INTEROP.md` |
| `npm run docs:shortcuts` | Rewrites the shortcuts section of this README from the keymap |
| `npm run clean` | Removes `dist/` |
| `node scripts/fonts/fetch-library.mjs` | Downloads the font library again (its output is committed, so this is only needed to update it) |

### Project CLI

Run with `npm run cli -- <command>` or, after `npm run build:cli`, `node dist-cli/project-cli.mjs <command>`.

| Command | What it does |
| --- | --- |
| `capabilities [--write]` | Prints the capability manifest (`--write` writes `capabilities.json`) |
| `validate <dir> [--json]` | Strict check of a project folder; exit 0 valid, 1 invalid, 2 usage error |
| `info <dir> [--json]` | Duration, tracks, clips by kind, stand-ins, media and what their headers say |
| `normalize <dir> [--write]` | Completes a sparse project (migration, defaults, media headers, library fonts) |
| `schema` | Prints the JSON Schema of `project.json` |
| `fill <dir> <values.json>` | Sets the template parameters of compound instances and writes `project.json` |
| `render <dir> --out <file> [--format mp4\|webm\|png\|gif] [--transparent] [--range <from>:<to>] [--preset <id>] [--backend webgpu\|webgl2]` | Headless render with the editor's own compositor and encoders |
| `render <dir> --frames <f1,f2,...> --png <outdir>` | Renders single frames to PNG |
| `compare <a> <b> [--ssim <min>] [--psnr <min>] [--region x,y,w,h] [--diff <dir>] [--json]` | Compares two videos or PNG folders frame by frame |
| `enhance <dir> [--preset <id>] [--only denoise\|color] [--dry-run] [--json]` | Measures the video and image clips and writes denoise and color correct effects into `project.json` |
| `enhance-presets` | Prints the enhance presets as JSON |
| `enhance-server [--port <n>] [--host <name>]` | The same over local HTTP: `GET /health`, `GET /presets`, `POST /enhance` (default port 5320) |

### Project folder layout

A project is a folder you pick. The editor writes:

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

## Project structure

```
src/
  app/        React shell, controllers wiring the stores to the views, the command catalog
  core/       document types, validation and time math; commands and undo; stores; frame scheduler;
              keyboard (keymap, focus scopes); theme bridge; the capability manifest
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
              cli/ (the project CLI and headless renderer), fixtures/ (fixture generators),
              fonts/ (the font library's list, families.json, and its downloader)
public/fonts/library/   the font library: one folder per family (woff2, latin and latin-ext), LICENSES/,
                        catalog.json
templates/    seven ready-made projects with their media, and _build/ (the Python scripts that made them)
fixtures/interop/       conformance projects for the interop contract, with expected frames
docs/         specification, architecture, interop contract, progress log and the user guide
capabilities.json       the generated capability manifest
```

### Font library

`public/fonts/library/` is checked in, so a fresh clone builds and runs with no network. It is made by `node scripts/fonts/fetch-library.mjs` from `scripts/fonts/families.json` (the hand-curated families, their looks and tags): Google Fonts families through Fontsource, kept only under the SIL Open Font License, Apache 2.0 or the Ubuntu Font Licence. A rerun fetches the versions `catalog.json` records (`--update` takes the latest) and reproduces the folder; it prints the total size (cap 40 MB).

## Tech stack

- TypeScript (strict, ES2022, ESM), Vite, Vitest with jsdom, ESLint.
- React 18 for the panel chrome only; the timeline, preview, compositor and audio engine are framework-free. CSS Modules on the design tokens of `src/styles/tokens.css`; `lucide-react` icons.
- Rendering on WebGPU (WGSL) with a WebGL2 backend behind the same interface; WebCodecs for decode and encode; Web Audio; module Web Workers; File System Access API.
- Runtime libraries: Immer (commands and undo), mp4box (MP4/MOV demux), mp4-muxer and gifenc (export), idb-keyval (settings and folder handles), `@lottiefiles/dotlottie-web` (Lottie clips), `@huggingface/transformers` (optional local transcription). WebM is read by the app's own EBML demuxer.

## Further documentation

- User guide: [`docs/user-guide/`](docs/user-guide/README.md), with [What's new](docs/user-guide/whats-new.md) and [Troubleshooting](docs/user-guide/troubleshooting.md)
- Architecture (one page): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Specification: [`docs/EDITOR_SPEC.md`](docs/EDITOR_SPEC.md)
- Build plan and history: [`docs/BATCHES.md`](docs/BATCHES.md), [`docs/PLAN_V1_2.md`](docs/PLAN_V1_2.md), [`docs/PROGRESS.md`](docs/PROGRESS.md) (with the known issues of each release); open work: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- Writing projects from another tool: [`docs/INTEROP.md`](docs/INTEROP.md)
- Denoise and automatic color correction from another app (CLI and HTTP): [`docs/denoise_color_endpoint.md`](docs/denoise_color_endpoint.md)
- Templates: [`templates/README.md`](templates/README.md); rebuilding them: [`templates/_build/README.md`](templates/_build/README.md)
- Design system: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
- The common path in one minute (import, cut, compact, title, subtitle, export), recorded on the 1.0.0 build: [`docs/release/v1.0.0-common-path.webm`](docs/release/v1.0.0-common-path.webm)

## Status

Version 1.2.0, a personal project in active development. It was built in numbered batches (82 completed, tracked in `docs/PROGRESS.md`); the CLI's `enhance` commands are marked v1.3 in the source. Desktop Chrome and Edge only: no Firefox, Safari or mobile, by design. Known limits are listed in `docs/PROGRESS.md` and in the user guide's Troubleshooting page; among them, a project has one caption track, HDR video is shown and exported in standard colors, `.mkv` files are refused, and MP3, AAC, WAV and Ogg files over 45 minutes cannot be imported. The tutorial videos referenced in the user guide are not recorded yet. This repository links no hosted instance and contains no license file.

## Keyboard shortcuts

The default keys. Every key can be changed in Settings > Shortcuts; inside the editor, `?` opens this list with your own keys, and `Ctrl+P` (`⌘P`) or `F1` finds any command by name.

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
| Split at playhead | `Ctrl+S` | `⌘S` | Everywhere |
| Split all tracks at playhead | `Ctrl+Shift+K` | `⌘⇧K` | Everywhere |
| Delete | `Delete`, `Backspace` | `Delete`, `Backspace` | Timeline, Preview, Media |
| Ripple delete | `Shift+Delete`, `Shift+Backspace` | `⇧Delete`, `⇧Backspace` | Timeline, Preview |
| Ripple trim start to playhead | `Q` | `Q` | Everywhere |
| Ripple trim end to playhead | `W` | `W` | Everywhere |
| Extend edit to playhead | `E` | `E` | Timeline |
| Close gap | `G` | `G` | Timeline |
| Close all gaps | `Ctrl+Alt+P`, `Shift+G` | `⌘⌥P`, `⇧G` | Timeline, Preview |
| Close the gaps of the last delete | `Ctrl+Shift+P` | `⌘⇧P` | Everywhere |
| Lift in/out range | `;` | `;` | Timeline |
| Extract in/out range | `'` | `'` | Timeline |
| Freeze frame at playhead | `Shift+F` | `⇧F` | Everywhere |
| Punch zoom at playhead | `Shift+Z` | `⇧Z` | Everywhere |
| Duplicate | `Ctrl+D` | `⌘D` | Timeline, Preview |
| Add default transition | `Ctrl+Shift+D` | `⌘⇧D` | Timeline |
| Group | `Ctrl+G` | `⌘G` | Timeline |
| Ungroup | `Ctrl+Shift+G` | `⌘⇧G` | Timeline |
| Make compound clip | `Ctrl+Alt+G` | `⌘⌥G` | Timeline |
| Open compound clip | `Ctrl+Alt+O` | `⌘⌥O` | Timeline |
| Close compound clip | `Ctrl+Alt+U` | `⌘⌥U` | Timeline, Preview |
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
| Bold | `Ctrl+B` | `⌘B` | Text editing |
| Italic | `Ctrl+I` | `⌘I` | Text editing |
| Underline | `Ctrl+U` | `⌘U` | Text editing |

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
| Mask mode (toggle) | `Alt+M` | `⌥M` | Timeline, Preview |
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
| Save now | `Ctrl+Alt+S` | `⌘⌥S` | Everywhere |

### Export

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Export… | `Ctrl+E` | `⌘E` | Everywhere |

### App

| Command | Windows, Linux | macOS | Where |
| --- | --- | --- | --- |
| Command palette | `Ctrl+P`, `F1` | `⌘P`, `F1` | Everywhere |
| Keyboard shortcuts | `Shift+/`, `?` | `⇧/`, `?` | Everywhere |
| Cancel gesture / close | `Escape` | `Escape` | Everywhere |

<!-- shortcuts:end -->
