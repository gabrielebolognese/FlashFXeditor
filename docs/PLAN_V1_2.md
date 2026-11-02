# Shorts Editor v1.2 plan: editable projects from other tools, and general-purpose editing

Written 2026-11-01 for the FlashFXeditor repo (Shorts Editor v1.1.0, last batch 53, commit bddd2d4), with code to port from FlashFX-v2 (commit fc934bb).

**How this file is used.** It lives at `docs/PLAN_V1_2.md`. A Claude Code session copies Part D into `docs/EDITOR_SPEC.md` (the new §21) and Part E into `docs/BATCHES.md` (Batches 54 to 82), applies Part F, and the unattended runner (`scripts/run-batches.sh`) builds the batches. Parts A to C explain the plan and list every feature; they are not binding. §21 and the batches are, once copied.

- Part A: Goal and the contract with other tools
- Part B: Feature catalogue
- Part C: The fallback contract for generators, and the reels map
- Part D: Spec §21 (append to `docs/EDITOR_SPEC.md`)
- Part E: Batches 54 to 82 (append to `docs/BATCHES.md`)
- Part F: Other edits

---

# Part A: Goal and the contract with other tools

## A.1 Goal

Two goals, one plan:

1. Every video made by another tool opens in the editor as a real project. The first such tool is the Instagram reels autopilot (`instagramReels`: HyperFrames compositions, a Kokoro voice, sound effects, word-by-word captions). Its texts, shapes, images, captions, voice and sounds arrive as separate, timed, animated layers that can be edited and exported again.
2. The editor grows from a fast cutter into a general-purpose short-form editor: shape styles, captions of every common style, full keyframing, compound clips, vector graphics, rich and kinetic text, parenting, 2.5D, more transitions, blend modes, masks, effects, a real mixer, speed ramps, Lottie, templates and more export formats.

## A.2 The contract

- **Capability manifest** (`capabilities.json` at the repo root, §21.2): what the current build supports, generated from the source and exhaustive. A generator reads it before writing a project and uses nothing it does not list.
- **Field table and INTEROP.md** (§21.3, §21.4): one table describes every field of `project.json` (type, range, required or optional, default); the strict validator, the JSON Schema, the defaults of `normalize` and the field reference in `docs/INTEROP.md` all come from it.
- **Project CLI** (§21.3, §21.6): `validate` (strict), `normalize` (sparse input completed with the app's own defaults), `info`, `schema`, and from Batch 57 `render` and `compare`, so a generator checks its output with the editor's own code and pictures.
- **Fallback levels** (Part C): what a generator does with anything the manifest lacks: native, sprite, overlay, plate. The project always opens and always looks like the original video.
- **Baked stand-ins** (§21.4, §21.5): a baked layer can carry the native clip it stands for (`fallbackOf`). When a later editor version supports that clip, `Make editable` swaps it in place, so old projects improve without being generated again.
- **Gaps loop**: generators log every fallback by manifest key (the reels autopilot writes `logs/editor-gaps.md`). That log is the to-do list for batches after 82.
- **Stable versions for generators**: a generator should use a copy of the editor at a commit whose latest batch passed review (a `batch-NN: review` commit with `- review: accepted`), never the working folder the runner is changing (INTEROP.md says so).

## A.3 Porting from FlashFX-v2

FlashFX-v2 (github.com/gabrielebolognese/FlashFX-v2, same owner) already implements much of this in a WebGPU motion-graphics engine. Its pure modules port with little change: easing curves, keyframe segment easing, motion paths, text range selectors and animator presets, blend modes, track mattes, masks, the effect registry and its WGSL passes, adjustment compositing, time remapping, beat detection, path tessellation, a Lottie subset renderer and a headless WebGPU harness. Each batch names its files. The editor's architecture stays binding: ported code is adapted to the editor's document, time model, scheduler and two backends (WebGPU and WebGL2), never copied with FlashFX's store or types.

---

# Part B: Feature catalogue

Status: `v1.1` = already in the editor; a number = the batch that adds it; `later` = listed for completeness, not scheduled. Port = the FlashFX-v2 source (paths from its repo root).

## B.1 Interop and automation

| Feature | Status | Port |
|---|---|---|
| Capability manifest `capabilities.json` | 54 | |
| Field table of `project.json`; strict CLI validate, info, schema | 54 | |
| INTEROP.md with tested examples | 54 | |
| Generator metadata, baked stand-ins (`fallbackOf`) in the model | 54 | |
| `normalize`: sparse projects completed with the app's defaults; media headers read in Node | 55 | |
| Open a project from a link (`?open=`) inside a projects folder | 56 | |
| Reload when `project.json` changes on disk (Claude can edit an open project) | 56 | |
| Repair media mismatches on open | 56 | |
| Make editable: stand-in to native clip, one or all | 56 | |
| Headless render to MP4 or PNG frames; frame compare (SSIM, PSNR) | 57 | `scripts/lib/headless-gpu.mjs` |
| Template parameters filled from JSON (`fill`) | 80 | |
| In-app scripting, plugins | out of scope | `src/expressions/` |

## B.2 Media

| Feature | Status | Port |
|---|---|---|
| MP4, MOV, M4V (H.264, HEVC, AV1); WebM (VP9, AV1) | v1.1 | |
| MP3, M4A, AAC, WAV, OGG | v1.1 | |
| PNG, JPEG, WebP, GIF, SVG; animated GIF and WebP (2048 px, 128 MB texture budget) | v1.1 | |
| Alpha video: VP8 and VP9 WebM with alpha | 64 | |
| Image sequences (PNG, WebP) | 64 | |
| SVG as editable vector shapes | 66 | |
| Lottie (`.json`, `.lottie`) | 79 | `src/engine/lottieRenderer.ts` |
| ProRes, MKV, HDR output | later | |

## B.3 Shapes and graphics

| Feature | Status | Port |
|---|---|---|
| Rect, rounded rect, ellipse and line solids; two-stop vertical gradient | v1.1 | |
| Multi-stop linear and radial gradients | 58 | `src/core/fillSampler.ts` |
| Strokes (inside, center, outside; dashes), hard and soft shadows with spread, per-corner radii | 58 | `src/engine/renderer.ts` (RECT_SHADER) |
| Rounded, bordered, shadowed pictures (video and image frames) | 58 | |
| Vector paths, polygons, stars, arrows, arcs; caps, joins, dashes | 65 | `src/engine/pathTessellation.ts`, `src/core/strokeOutline.ts`, `src/core/pathOps.ts` |
| Trim paths (lines drawing on, gauges) | 65 | |
| `+ Shape` tools and the Shape section | 66 | |
| Path point editing on the canvas, boolean operations, shape modifiers | later | `src/core/pathVertexOps.ts`, `src/core/shapeModifiers.ts` |

## B.4 Text

| Feature | Status | Port |
|---|---|---|
| Font library (330 families), user and system fonts; fill, gradient, stroke, shadow, background box | v1.1 | |
| 12 in and out animations by character, word or line | v1.1 | |
| Text box border and shadow; multi-stop gradient fills | 58 | |
| Styled spans (color, weight, italic, underline, strike, highlight per range) | 67 | |
| Number counters | 68 | |
| Range-selector animators (any property per unit, shapes, random order) | 68 | `src/text/rangeSelector.ts`, `src/core/textAnimator.ts` |
| Presets: type on, decode, tumble, cascade, rise by line, pop by character, highlight sweep | 68 | `src/core/textAnimatorPresets.ts`, `src/core/textDecode.ts` |
| Text on a path, outlines, explode | later | `src/core/textPath.ts`, `src/core/textOutline.ts`, `src/core/textExplode.ts` |

## B.5 Captions

| Feature | Status | Port |
|---|---|---|
| Caption track, per-track and per-cue styles, karaoke highlight (color, background, scale) | v1.1 | |
| SRT and VTT import and export, local transcription | v1.1 | |
| Progressive highlight (spoken words stay colored) and reveal (upcoming words hidden) | 59 | |
| Emphasis words (own color from the cue's start), per-word colors | 59 | |
| Cue in and out animations (fade, pop, slide) | 59 | |
| Box per word; caption box border and hard shadow | 59, 58 | |
| Import word timings from JSON, with explicit chunks and emphasis words | 59 | |
| Caption translation, several languages burned in | later | |

## B.6 Animation

| Feature | Status | Port |
|---|---|---|
| Keyframes on position, scale, rotation, opacity, gain; 8 eases | v1.1 | |
| 30 Penner eases, custom cubic-bezier, spring (engine) | 60 | `src/core/easings.ts`, `src/core/keyframeEase.ts` |
| Color and point keyframes; keys on crop, size, corners, fill, stroke, shadow, anchor, text size, spacing and color (engine) | 60 | |
| Ease popover, curve editor, stopwatches on the new fields; copy, paste and reverse keys | 61 | |
| Parenting and null controllers | 69 | `src/core/sceneGraph.ts` |
| Motion paths with tangents, auto-orient | 69 | `src/core/positionPath.ts`, `src/core/motionPath.ts` |
| 3D rotation (X, Y), depth, perspective | 70 | `src/core/camera3d.ts`, `src/core/mat4.ts` |
| Expressions, wiggle, loops, physics, audio-reactive properties | later | `src/expressions/`, `src/physics/`, `src/core/audioReactive/` |

## B.7 Compositing and effects

| Feature | Status | Port |
|---|---|---|
| Compound clips: model, rendering, make and break | 62 | `src/core/precomp.ts`, `src/core/precompose.ts` |
| Compound clips: editing inside, breadcrumb, Compounds bin | 63 | |
| 13 blend modes | 72 | `src/core/effects/blendModes.ts` |
| Track mattes (alpha, luma, inverted) | 72 | `src/core/trackMatte.ts`, `src/engine/renderer.ts` (MATTE_SHADER) |
| Masks (rect, ellipse, path; feather, expansion, modes; animated) | 73 | `src/core/maskPath.ts`, `src/core/maskCoverage.ts`, `src/engine/maskWgsl.ts` |
| Effect stack; Gaussian and directional blur, glow, alpha shadow, alpha outline | 74 | `src/core/effects/effectRegistry.ts`, `src/engine/renderer.ts` (GLOW_SHADER, BLUR_EFFECT_SHADER, SHADOW_SHADER) |
| Color adjust, vignette, sharpen, grain, chroma key, luma key, LUTs; saved looks | 75 | `src/core/effects/hsl.ts`, `vignette.ts`, `lut.ts`, `src/engine/chroma-key/` |
| Adjustment clips; RGB split, pixelate, mirror, wave, glitch, posterize, invert | 76 | `src/core/effects/adjustmentComposite.ts`, `glitchGpu.ts` |
| Curves, color wheels, scopes, motion tracking, stabilization, particles, cloner | later | `src/core/effects/curves.ts`, `src/core/tracking/`, `src/particles/`, `src/cloner/` |

## B.8 Transitions

| Feature | Status | Port |
|---|---|---|
| Cross dissolve, dip to black, dip to white | v1.1 | |
| Slide, push, wipe, iris, zoom in and out, whip, blur dissolve, glitch, flash; direction, softness, easing | 71 | `src/core/effects/glitchGpu.ts`, `src/core/effects/blurFxPack.ts` |

## B.9 Audio and time

| Feature | Status | Port |
|---|---|---|
| Clip gain, fades, auto-duck, silence removal, meters | v1.1 | |
| Track gain and pan, clip pan, LUFS meters, export loudness target with a true-peak limiter | 77 | `src/codec/audioMixer.ts` |
| Beat markers, fade curves | 77 | `src/core/beatDetection.ts` |
| Speed 0.25x to 4x, freeze frames | v1.1 | |
| Speed ramps (time remap curves), reverse, frame blending | 78 | `src/core/timeRemap.ts` |
| Optical-flow slow motion | later | `src/core/opticalFlow.ts` |

## B.10 Reuse and output

| Feature | Status | Port |
|---|---|---|
| Text presets, preset bar, project templates | v1.1 | |
| Templates: compound clips with parameters, a library, instances | 80 | |
| MP4 (H.264, HEVC, AV1), frame PNG, audio, SRT and VTT export | v1.1 | |
| WebM with alpha, PNG sequences, GIF, stems, collect project, zip | 81 | |

## B.11 Still out of scope after v1.2

Collaboration, cloud sync, accounts, analytics, plugins and in-app scripting, mobile and touch layouts, Safari and Firefox, AI generation (local transcription stays the exception), multicam, 3D models, moving cameras and lights, full color grading (curves, wheels, scopes).

---

# Part C: The fallback contract, and the reels map

## C.1 Levels

For each element of the source video, a generator picks the most editable level the manifest allows:

1. **Native**: the editor's own clip (text, solid, image, video, caption, and with later batches shape, compound, null, lottie) with keyframes. Fully editable.
2. **Sprite**: the element's look baked once into a transparent PNG at rest, placed and animated natively with keyframes. Timing and motion stay editable, the look does not. Label color violet.
3. **Overlay**: a look that changes continuously in a way the editor cannot key (a counter, a line drawing itself, a 3D object), baked into transparent animated media (alpha WebM, an image sequence, or animated WebP within the texture budget). Timing and place stay editable. Orange.
4. **Plate**: the last resort. The layers at and below that element are baked into an opaque video segment. Timing stays editable. Red.

Rules:

- **Fidelity**: an untouched project renders like the source video. When `cli.render` exists, the generator checks it with `compare`.
- **Instant look changes** (a cell turning coral, a checkmark appearing) stay native: the clip is split at each change and every segment is static.
- **Z-order**: sprites and overlays are transparent, so native layers keep their exact order around them; anything below a plate goes into the plate.
- **Groups**: compound clips when available; otherwise parenting; otherwise flattened (children get world-space keys; a group with partial opacity over overlapping children becomes one sprite).
- **Stand-ins**: a sprite or overlay that has a native equivalent carries `fallbackOf` (from Batch 54), so it can be made editable later (from Batch 56).
- **Log**: every non-native element goes to the project's `FALLBACKS.md` and to the generator's gaps log, with the manifest key that was missing.

## C.2 The reels map (paper-cards style)

| Reel element | Native via | Until then |
|---|---|---|
| Paper background with its dot grid | image clip (v1.1) | |
| Voice, sound effects with their gains, trims and fades | audio clips (v1.1); loudness target (77) | the master gain folded into clip gains |
| Card titles, body text, labels, tag text | text clips with keys (v1.1) | sprite when a style is not representable |
| Cards, tags, pills, chips, mono boxes (3 px ink stroke, 7 px hard shadow) | solid stroke and shadow (58) | sprite |
| A card moving with its content (hero tilt, stamp slam, DM card slide) | compound clip (62) or parenting (69) | flattened, world-space keys |
| GSAP eases of entrances | Penner eases (60) | dense linear keys |
| Progress tracker cells changing color | color keys with hold (60) | split segments (native) |
| Captions: boxed, gray to ink as spoken, coral emphasis word, 2-frame swaps | captions v2 (59) and box border and shadow (58) | per-word-state sprites, plus the native caption track hidden |
| Giant numbers counting up | counter text (68) | overlay for the count, native text after it |
| Bars growing, strike-throughs | scale keys (v1.1), size keys (60) | overlay when a stroked shape grows by layout |
| Gauges, checkmarks drawing on, arrows | vector shapes and trim paths (65) | overlay |
| Static line icons (SVG) | SVG image clip (v1.1); shapes (66) | |
| Colored or bold words inside card text | styled spans (67) | sprite |
| Comment field typing the keyword | typewriter animation when its timing matches (v1.1); animators (68) | overlay |
| Deck of cards flying in 3D perspective | 2.5D layers (70) in a compound | overlay |
| 3D logo, spinning mark (Three.js) | alpha video (64) | animated WebP overlay chunked to the texture budget, else plate |
| Motion transitions between scenes | captured as keys; transitions v2 (71) | overlay for shader-like frames |
| FlashFX lockup, DM avatar, brand marks | image clips (v1.1) | |

---

# Part D: Spec §21 (append to `docs/EDITOR_SPEC.md`)

Copy everything between the two marker lines, without the markers, to the end of `docs/EDITOR_SPEC.md`, after a blank line, a `---` line and a blank line (the way §20 is separated).

<!-- BEGIN SPEC 21 -->
## 21. Extensions for v1.2: interop and general-purpose editing (Batches 54-82)

These sections extend the spec after v1.1. Where they change an earlier section, they say so and win over it from their batch onward; earlier batches keep following the earlier text. The rules of §0, §3 and §4 apply unchanged: every new picture goes through the one compositor and renderer shared by preview and export, every new property is a document field changed only by commands, time stays in integer frames and microseconds, and media work stays in workers.

Amends §1.3 (non-goals), for the batches named here: compound clips (nested sequences, §21.10), masks (§21.18), track mattes and blend modes (§21.17), adjustment clips (§21.20), effects beyond the v1 list including basic color adjustment and LUTs (§21.19), 2.5D layer rotation with perspective (§21.15) and a project command line (§21.3, §21.6) are in scope. Still out: collaboration, cloud sync, accounts, analytics, plugins and in-app scripting, mobile, Safari and Firefox, AI generation (transcription stays the exception), multicam, 3D models, moving cameras and lights, motion tracking, and full color grading (curves, wheels, scopes). Amends §10.1: styled spans inside text clips are in scope from Batch 67 (§21.13).

### 21.1 Rules for every v1.2 batch

- **Capabilities.** `src/core/capabilities.ts` is the single source of the manifest (§21.2): its lists come from the model constants, its flags from one `FEATURES` object. A batch that adds a capability updates it in the same commit and regenerates `capabilities.json` with `npm run capabilities`, setting `lastBatch` to its number. A unit test fails when the file is stale or a list differs from its constant.
- **Field table.** Every field a batch adds goes into the field table (`src/core/document/schema.ts`, §21.3) with its type, range, whether it is required, and its default, in the same commit as the model change.
- **INTEROP.md.** Each batch adds to `docs/INTEROP.md` (§21.4) the JSON of every field and clip kind it introduces, its defaults, the manifest key that announces it and a minimal example. A doc test validates every JSON example block in it with the strict validator (§21.3).
- **Fixtures.** Each batch adds `fixtures/interop/<area>/`: a small project folder (`project.json` and tiny media, at most 2 MB per area) that uses every field the batch adds; a unit test validates it. From Batch 57 on, the batch's acceptance renders it with `npm run cli -- render` on both backends and compares it with committed expected frames in `fixtures/interop/<area>/expected/` (SSIM at least 0.98 on WebGPU against the expected frames, at least 0.97 between WebGL2 and WebGPU). Expected frames are committed only after the session has looked at them.
- **Schema.** Every model change bumps `SCHEMA_VERSION` with a migration (older projects open unchanged), validates the new fields in the app as v1 validates its fields, and extends the property-based tests of Batch 47. The strict CLI validator refuses unknown fields everywhere (§21.3); the app keeps loading as leniently as it does today.
- **Both backends.** Every new draw path exists in the WebGPU and the WebGL2 renderer (`shaders.ts`, `glShaders.ts`) with matching output. Export uses the same compositor, and every batch's acceptance includes an export that matches the preview.
- **Post-v1 quality rules.** Measure the §4 budgets the batch touches and record the numbers in `PROGRESS.md`; follow `DESIGN_SYSTEM.md` exactly (log gaps); register every action in the `CommandRegistry` with palette entries and, where natural, keys (free keys only, checked in `keymap.ts`, listed in the shortcut editor and the cheat sheet); animatable fields get stopwatches as in §11.
- **Porting from FlashFX-v2.** The repository is expected next to this one at `../FlashFX-v2` (if missing: `git clone https://github.com/gabrielebolognese/FlashFX-v2.git ../FlashFX-v2`; read only, never commit there; this plan was written against commit fc934bb). Ported code is adapted: ESM imports ending in `.js`, strict TypeScript, the editor's types and integer time, no FlashFX store, WGSL plus a GLSL twin. Each ported file starts with `// Ported from FlashFX-v2 <path> @ <commit>, adapted.` Where FlashFX-v2 has a `scripts/verify-<name>.mjs` harness for a ported module, its checks become Vitest tests. If the repository cannot be cloned, implement from this section and log a deviation.
- **Other tools on this machine.** Port 5310 and processes started from another folder (for example a stable copy of this editor used by the reels autopilot, and the headless Chrome its CLI renders start) belong to other tools: never stop or use them.
- **Dependencies.** Only the ones §21 names: optionally `earcut` (Batch 65), `@lottiefiles/dotlottie-web` (Batch 79), `gifenc` and optionally `webm-muxer` (Batch 81), each with a line under Dependencies in `PROGRESS.md`.

### 21.2 Capability manifest (Batch 54)

`capabilities.json` at the repo root describes what the current build supports. Lists are exhaustive; a key that is false or absent means unsupported. Keyframe props written with `*` match any id. Generators (§21.4) read the manifest before writing a project, write `schemaVersion` exactly as listed (from Batch 55 they can let `normalize` complete what their JSON does not know), and use only what it lists. `manifestVersion` changes only when a key changes meaning; new keys do not change it. `npm run cli -- capabilities` prints the same JSON.

The manifest of v1.1.0, as it reads before Batch 54 changes it (generators use it when they cannot find the file):

```json
{
  "manifestVersion": 1,
  "app": "shorts-editor",
  "appVersion": "1.1.0",
  "lastBatch": 53,
  "schemaVersion": 3,
  "project": { "file": "project.json", "fontsManifest": "fonts/fonts.json", "fontsManifestVersion": 2, "sampleRate": 48000 },
  "media": {
    "video": ["mp4", "mov", "m4v", "webm"],
    "audio": ["mp3", "m4a", "aac", "wav", "ogg"],
    "image": ["png", "jpg", "jpeg", "webp", "gif", "svg"],
    "animatedImage": { "formats": ["gif", "webp"], "alpha": true, "maxSide": 2048, "textureBudgetBytes": 134217728 },
    "videoAlpha": false,
    "imageSequence": false,
    "lottie": false
  },
  "trackKinds": ["video", "audio", "caption"],
  "clipKinds": ["video", "audio", "image", "text", "solid", "caption"],
  "transform": { "rotation3d": false, "parenting": false, "motionPaths": false, "autoOrient": false },
  "keyframes": {
    "props": ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation", "opacity", "volume.gainDb"],
    "eases": ["linear", "easeIn", "easeOut", "easeInOut", "hold", "smooth", "snap", "overshoot"],
    "bezier": false,
    "spring": false,
    "vectorValues": false
  },
  "solid": { "shapes": ["rect", "roundedRect", "ellipse", "line"], "fills": ["color", "gradient2"], "stroke": false, "shadow": false, "cornerRadii": false },
  "mediaFrame": { "stroke": false, "shadow": false, "cornerRadius": false },
  "text": {
    "fills": ["color", "gradient2"],
    "stroke": true,
    "shadow": true,
    "background": { "modes": ["line", "block"], "stroke": false, "shadow": false },
    "anims": ["fade", "slideUp", "slideDown", "slideLeft", "slideRight", "pop", "typewriter", "wordPop", "wordFade", "lineReveal", "blurIn", "scaleBounce"],
    "animUnits": ["char", "word", "line"],
    "spans": false,
    "counter": false,
    "animators": false
  },
  "captions": {
    "highlightModes": ["none", "color", "background", "scale", "colorAndScale"],
    "perCueStyle": true,
    "wordEmphasis": false,
    "cueAnims": [],
    "boxModes": ["line", "block"],
    "wordsImport": false
  },
  "transitions": ["crossDissolve", "dipToBlack", "dipToWhite"],
  "compositing": { "compound": false, "blendModes": ["normal"], "trackMatte": false, "masks": false, "adjustment": false },
  "vector": { "shapes": false, "trimPaths": false, "svgImport": false },
  "effects": [],
  "audio": { "clipGainDb": [-60, 12], "fades": true, "trackGain": false, "pan": false, "loudness": false },
  "time": { "speedRange": [0.25, 4], "freeze": true, "reverse": false, "remap": false, "frameBlend": false },
  "templates": false,
  "export": { "containers": ["mp4"], "videoCodecs": ["h264", "hevc", "av1"], "alpha": false, "imageSequence": false, "gif": false, "stems": false },
  "cli": { "validate": false, "normalize": false, "info": false, "render": false, "compare": false },
  "interop": { "openLink": false, "externalReload": false, "repairOnOpen": false, "fallbackOf": false, "generatorMeta": false }
}
```

`fills`: `color` = an RGBA fill, `gradient2` = the v1 vertical two-stop `Gradient`, `linear` and `radial` = `GradientFill` (§21.7). `animatedImage.textureBudgetBytes` is the texture memory one animated image may use: frames x width x height x 4 x 4/3 (mip levels); larger animations drop frames (§9.3), so generators stay under it.

Keys each batch turns on or extends (each batch also adds the keyframe props of its own fields; batches not listed change no key):

| Batch | Keys |
|---|---|
| 54 | `schemaVersion` 4; `cli.validate`, `cli.info`; `interop.fallbackOf`, `interop.generatorMeta` |
| 55 | `cli.normalize` |
| 56 | `interop.openLink`, `interop.externalReload`, `interop.repairOnOpen` |
| 57 | `cli.render`, `cli.compare` |
| 58 | `solid.stroke`, `solid.shadow`, `solid.cornerRadii`; `solid.fills` and `text.fills` add `linear`, `radial`; `mediaFrame.stroke`, `mediaFrame.shadow`, `mediaFrame.cornerRadius`; `text.background.stroke`, `text.background.shadow` |
| 59 | `captions.highlightModes` adds `progressive`, `reveal`; `captions.wordEmphasis`; `captions.cueAnims` lists `fade`, `pop`, `slideUp`, `slideDown`; `captions.boxModes` adds `word`; `captions.wordsImport` |
| 60 | `keyframes.eases` adds the 30 Penner names, `bezier` and `spring`; `keyframes.bezier`, `keyframes.spring`, `keyframes.vectorValues`; `keyframes.props` adds the §21.9 props |
| 62 | `clipKinds` adds `compound`; `compositing.compound` |
| 64 | `media.videoAlpha`, `media.imageSequence` |
| 65 | `clipKinds` adds `shape`; `vector.shapes`, `vector.trimPaths` |
| 66 | `vector.svgImport` |
| 67 | `text.spans` |
| 68 | `text.counter`, `text.animators`; `text.anims` adds the §21.13 presets |
| 69 | `clipKinds` adds `null`; `transform.parenting`, `transform.motionPaths`, `transform.autoOrient` |
| 70 | `transform.rotation3d` |
| 71 | `transitions` adds the §21.16 kinds |
| 72 | `compositing.blendModes` lists all 13; `compositing.trackMatte` |
| 73 | `compositing.masks` |
| 74, 75, 76 | `effects` lists each effect type |
| 76 | `clipKinds` adds `adjustment`; `compositing.adjustment` |
| 77 | `audio.trackGain`, `audio.pan`, `audio.loudness` |
| 78 | `time.reverse`, `time.remap`, `time.frameBlend` |
| 79 | `clipKinds` adds `lottie`; `media.lottie` |
| 80 | `templates` |
| 81 | `export.containers` adds `webm`; `export.alpha`, `export.imageSequence`, `export.gif`, `export.stems` |

### 21.3 Field table and project CLI (Batches 54 and 55)

- **Field table** (`src/core/document/schema.ts`, Batch 54): one description of every object in `project.json` (project, settings, media items, bins, tracks, every clip kind, transform, crop, volume, text content and style, caption styles and overrides, keyframes, markers, the font manifest): each field's type, allowed values or range, whether it is required, and where its default comes from (the constants the app uses when it creates the same thing). It drives the strict validator, the JSON Schema, the INTEROP.md field reference and the defaults of `normalize`. A test checks that every type in `types.ts` is covered.
- `npm run cli -- <command> [args]` runs `dist-cli/project-cli.mjs`, built from `scripts/cli/project-cli.ts` by `npm run build:cli` (a Vite SSR build, no new dependency; `npm run cli` rebuilds first when sources changed; `dist-cli/` is gitignored and ignored by ESLint). It imports only modules without DOM access: the document model, the field table, migrations, validation, the app's defaults and Node-side media header readers. Paths may be written `C:\...`, `C:/...` or `/c/...`.
- `capabilities` (Batch 54): prints the manifest.
- `validate <dir> [--json]` (Batch 54): reads `project.json`, migrates it in memory, checks every field against the field table (types, ranges, required fields; unknown fields are refused everywhere except inside `fallbackOf.data`), runs the document invariants of `validate.ts`, and checks that every media `relPath` exists inside the folder and that `fonts/fonts.json` parses and its files exist. Exit 0 valid, 1 invalid, 2 usage error. `--json` prints `{ ok, schemaVersion, errors: [{ path, message }], warnings: [{ path, message }], standIns }`. From Batch 55 it also compares media records with the files' headers (a warning within 1 frame, an error beyond); from Batch 56 it reports which stand-ins are convertible.
- `info <dir>` (Batch 54): duration, tracks, clips by kind, stand-ins by kind, missing media (and, from Batch 55, the probed media facts).
- `schema` (Batch 54): prints a JSON Schema (2020-12) of `project.json` for the current schema version, generated from the field table.
- `normalize <dir> [--write]` (Batch 55): accepts a sparse project (§21.4), migrates an older `schemaVersion` first, then fills every omitted field, at the project, track, clip and media level, with the defaults of the field table, so a generator that does not know a field added by a later batch still produces a valid project. It sorts track clip lists, computes missing media clip `out` points, reads media headers to fill `durationUs`, `width`, `height`, `fps`, `hasAudio`, `codec`, `size` and the analysis states, records the library fonts used by texts and captions in `fonts/fonts.json` and copies their files, then validates strictly. Without `--write` it prints the result.
- Node media headers (Batch 55): MP4, MOV and M4A (mp4box), WebM (EBML header and track entries), WAV, MP3 (frame scan), OGG (last granule position), PNG, JPEG, WebP (still and animated), GIF, SVG (width and height or viewBox). Anything unreadable is left for the app's repair on open (§21.5).
- The library functions `validateProjectFolder`, `normalizeProjectFolder` and `readMediaHeader` are exported for tests and for the INTEROP.md doc test.

### 21.4 External projects: model fields and conventions (Batch 54)

- `Project.meta.generator?: { name: string; version?: string; source?: string; url?: string }`: the tool that wrote the project, shown in the Project section of the properties panel.
- `ClipBase.fallbackOf?: { kind: string; reason: string; schemaVersion: number; headTrim?: number; data: JsonObject }`: the clip is a baked stand-in.
  - `data` is the native clip it stands for, in the editor's own JSON (any clip kind, present or future, possibly sparse), timed as the stand-in was when it was written: `id`, `trackId`, `start` and `duration` are left out and come from the stand-in. For a compound, `data.sequence` holds its sequence and `data.clips` its inner clips; media it needs are in `data.media` (records whose files are inside the project folder). `data.kind` must equal `kind`.
  - `schemaVersion` is the schema version `data` follows; conversion migrates it from there (§21.5).
  - `headTrim` (frames, default 0) is how far the stand-in's first frame has moved into the clip it stands for: the right half of a split, a head trim and a slip add to it, so a conversion starts the native clip at the same moment.
  - The editor stores the block as it is and never migrates, normalizes or interprets `data` except to convert it. Copy, paste, split, trims and undo keep the block.
- Sparse input (for `normalize`): a clip needs `id`, `kind`, `trackId`, `start`, `duration` and its content fields (`mediaId` for media clips, `text` for text and caption clips, `fill` and `size` for solids); a track needs `id` and `kind`; a media item needs `id`, `kind` and `file.relPath`. Everything else may be omitted. Nested style objects merge with the defaults field by field.
- Conventions for generated projects (documented in INTEROP.md; the editor needs nothing special): track order as §5.2 and §10.5 (video tracks bottom to top, then the caption track, then audio tracks); label colors for baked layers (violet sprite, orange overlay, red plate); bins by kind (Audio, Images, Sprites, Overlays, Plates); labeled markers at scene starts; generator files the editor ignores but shows read-only in the Project section when present: `FALLBACKS.md` (the list of baked layers) and `OPEN.txt`.
- `docs/INTEROP.md` is the contract for any tool that writes projects: the folder layout (§9.7); the field reference generated from the field table; ids (any unique strings, uuid v4 recommended); integer frames and microseconds (P4); track and clip invariants (§5.2); captions and word timings; fonts (`fonts/fonts.json` version 2 and the library catalog); the manifest; the CLI; the generator fallback levels (sprite, overlay, plate); stand-ins; the advice to use a copy of the editor at an accepted `batch-NN: review` commit rather than the working folder; and an ease name table for CSS, GSAP and After Effects (filled by Batch 60).

### 21.5 Open links, reload, repair and Make editable (Batch 56)

- **Projects folder.** A directory handle chosen once (start screen `Projects folder` button, Settings > General) and stored in IndexedDB (per origin: it works at the address where it was chosen).
- **Open link.** `/?open=<path>` opens the project folder at `<path>` inside the projects folder (segments joined by `/`). Without a projects folder, the start screen shows `Choose your projects folder to open <path>` (one click opens the picker). With permission in the `prompt` state, one click on `Open <path>` gives `requestPermission` its user gesture. A missing folder or one without `project.json` gives a toast naming the path and the start screen. The opened project joins Recent projects; a project open with unsaved changes is saved first (§15).
- **Reload on external change.** While a project is open and the window is visible, the app checks `project.json` (`lastModified` and size) when the window gets focus and every 5 s while no gesture, save or export is running. A change the app did not write itself: with no unsaved changes the project reloads in place (one step `Reloaded from disk`, not undoable; the previous document goes to `history/`; playhead, zoom and scroll kept; the selection keeps only clips that still exist); with unsaved changes a banner `project.json changed on disk` offers `Reload` and `Keep mine` (the next save backs up the disk version to `history/`, then overwrites it). Changed media files are probed again.
- **Repair on open.** Media whose stored duration, size, frame rate or audio presence disagree with the probe are corrected; clips past a shortened media end are trimmed; analysis marked pending is scheduled. All of it is one step `Repaired on open` (not undoable), with a toast giving the counts and the details in `history/repair-<date>.log`.
- **Make editable.** A clip with `fallbackOf` shows a `baked` badge on the timeline and, in the properties panel header, `Baked stand-in for a <kind> clip: <reason>` with a `Make editable` button. Conversion: take `data` (with `data.sequence`, `data.clips` and `data.media`), complete it with the field table's defaults (probing `data.media` files like an import), migrate it from `fallbackOf.schemaVersion` to the current version (by running the project migrations on a minimal project that holds it), give it the stand-in's id and track and the timing the stand-in had when it was written (`start - headTrim`, `duration + headTrim`), apply the editor's own head trim of `headTrim` frames (keys, in points, offsets and text animations shift as in a normal trim), and validate the project strictly with it in place of the stand-in. The button is enabled when this succeeds; converting is one undo step. Changes made to the stand-in itself (its transform, opacity, keys) are not carried over, and the confirmation says so. `Make all editable` (project menu and command palette) converts every convertible stand-in in one step and reports the rest with their reasons. A project with convertible stand-ins shows, once per open, the toast `N baked layers can be made editable` with the action.
- **Large generated projects.** Up to 40 video tracks, 1,000 clips and 5,000 keyframes open in under 2 s on a warm cache and keep P1, P3 and P10.

### 21.6 Headless render and compare (Batch 57)

- `npm run cli -- render <dir> --out <file.mp4> [--range <from>:<to>] [--preset <id>] [--backend webgpu|webgl2]`, and `--frames <f1,f2,...> --png <outdir>` for single frames.
- How it works: the CLI serves the built app (`dist/`) and the project folder on localhost (a free port, never 5300 or 5310), finds Chrome or Edge (`CHROME_PATH` wins), launches it headless with WebGPU enabled (or forced to WebGL2) with a temporary profile named `shorts-editor-render-<random>` in the system temp folder, and drives it over the DevTools protocol with Node's built-in `WebSocket` and `fetch` (no Puppeteer or Playwright). The page opens `/?render=<token>`, a render-only entry with no panels, no autosave, no IndexedDB writes and no service worker. It reads the project through `HttpDir`, a read-only implementation of the project file-system interface over HTTP (range requests for media bytes), runs the same export job as the Export tab and streams the file back through `HttpSink`; frames go through the same path as `Export frame`. Progress prints as frames done of total; a watchdog stops a render that makes no progress for 60 s; the CLI always removes the Chrome it started and its profile, Ctrl+C included, and never touches other Chrome processes.
- `npm run cli -- compare <a> <b> [--ssim <min>] [--psnr <min>] [--region x,y,w,h] [--diff <dir>] [--json]`: `a` and `b` are videos or PNG folders. Frames are decoded with WebCodecs in the headless page, matched by timestamp and scored with SSIM (luma, 8x8 windows) and PSNR, over the whole frame or a region. It prints the worst frames and exits 1 below the thresholds; `--diff` writes difference images.
- Render mode writes a fixed MP4 creation time, so a project renders to the same bytes on the same machine and backend (record whether this holds).
- `npm run test:render` renders every fixture that has `expected/` frames and compares them; it needs a GPU and is not part of `npm test`. Renders go to `out/` (gitignored and ignored by ESLint).

### 21.7 Shape, frame and box styles (Batch 58)

Amends §5.2 (`SolidClip`, `MediaClip`, `TextStyle`, `TextBackground`).

```ts
type Fill = RGBA | Gradient | GradientFill;            // Gradient: the v1 vertical two-stop
interface GradientFill {
  type: "linear" | "radial";
  angle: number;                                        // linear: degrees, 0 = top to bottom, clockwise
  center: { x: number; y: number };                     // radial: fractions of the box
  radius: number;                                       // radial: fraction of half the box diagonal
  stops: { at: number; color: RGBA }[];                 // 2 to 8 stops, `at` 0..1 ascending
}
interface StrokeStyle { width: number; color: RGBA; align: "inside" | "center" | "outside"; dash?: number[]; dashOffset?: number }
interface ShadowStyle { x: number; y: number; blur: number; spread: number; color: RGBA }   // blur 0 = hard edge

// SolidClip adds:              fill: Fill; stroke?: StrokeStyle; shadow?: ShadowStyle;
//                              cornerRadii?: [number, number, number, number]   // tl tr br bl, wins over cornerRadius
// MediaClip (video, image):    cornerRadius?: number; stroke?: StrokeStyle; shadow?: ShadowStyle   // around the cropped picture
// TextStyle.fill:              Fill
// TextBackground adds:         stroke?: { enabled: boolean; width: number; color: RGBA };
//                              shadow?: { enabled: boolean; x: number; y: number; blur: number; color: RGBA }
```

- Solids draw through one signed-distance shader (box with four radii, ellipse, line) that computes the fill (color, two-stop, linear or radial stops), the stroke (inside, centered on or outside the shape's edge; dashes spaced evenly along the perimeter, rounded corners included) and the shadow (hard when blur is 0, with pixel-exact edges; soft through an analytic Gaussian of the rounded box, without an extra pass), anti-aliased like v1 solids. An absent stroke or shadow on a solid or picture means none.
- Pictures with a radius are clipped to the rounded rectangle; their stroke and shadow follow the same shape. The layout box never changes with the stroke; the gizmo bounds include stroke and shadow.
- Text: gradient fills and the background box's stroke and shadow are drawn into the text raster (cached, P11). The box stroke and shadow carry `enabled`, like `TextStroke` and `TextShadow`, so a caption cue's override (§20.3) can turn off a border its track has. Caption styles get them through their `TextStyle` (§10.5, §20.3).
- Properties panel: `Fill` (Color, Linear, Radial, with a stop bar: click to add, drag to move, Delete to remove), `Stroke` (enable, width, color, align, Solid / Dashed / Dotted / custom dash), `Shadow` (enable, Hard and Soft presets, x, y, blur, spread, color) and `Corners` (one radius or four, linked by a toggle) for solids and pictures; the text and caption `Background` rows gain Border and Shadow.

### 21.8 Captions v2 (Batch 59)

Amends §10.5 and §20.3.

- Highlight modes add `progressive` (spoken words and the active word in `color`, upcoming words in `inactiveColor`) and `reveal` (upcoming words hidden, spoken words in `color`).
- Emphasis: `CaptionHighlight.emphasisColor?: RGBA`; `CaptionWord.emphasis?: boolean` (the word shows the emphasis color from the cue's first frame, over the highlight and inactive colors); `CaptionWord.color?: RGBA` (one word's own fill, over everything).
- Cue animations: `CaptionStyle.anim?: { in?: CueAnim; out?: CueAnim }` with `CueAnim = { kind: "fade" | "pop" | "slideUp" | "slideDown"; frames: number }`, applied to the whole caption box at each cue's start and end (each at most half the cue); cue overrides may set it.
- Box per word: `TextBackground.mode` adds `"word"` for captions, a box behind each word; with the `background` highlight, the active word's box takes the highlight color.
- Import words (Captions tab, `Import words`): JSON as an array of `{ word | text, start, end }` in seconds, or in milliseconds when the keys are `startMs` and `endMs` or `start_ms` and `end_ms`, or when the file has `"unit": "ms"`; Whisper-style `{ segments: [{ words: [...] }] }`; an optional `cues: [{ from: number; to: number; emphasis?: number[] }]` (inclusive word index ranges and emphasis word indexes) fixes cue boundaries and emphasis. Without `cues`, a dialog chunks the words (max words per cue 1 to 12, max characters per line, max lines, breaks at punctuation and at pauses longer than N ms) through `cuesFromWords`. The import creates the caption track if missing and replaces existing cues only after confirmation.
- Rendering keeps P11: word states are drawn from the cue's word atlas, rasterized once per cue and style; nothing is rasterized during playback.

### 21.9 Keyframes v2 (Batches 60 and 61)

Amends §5.2 (`Keyframes`) and §6.15. Batch 60 builds the model, the evaluation and the rendering; Batch 61 the editing UI.

```ts
type EaseId = /* the 8 of v1 */ | PennerEase | "bezier" | "spring";
type PennerEase =
  | "sineIn" | "sineOut" | "sineInOut" | "quadIn" | "quadOut" | "quadInOut"
  | "cubicIn" | "cubicOut" | "cubicInOut" | "quartIn" | "quartOut" | "quartInOut"
  | "quintIn" | "quintOut" | "quintInOut" | "expoIn" | "expoOut" | "expoInOut"
  | "circIn" | "circOut" | "circInOut" | "backIn" | "backOut" | "backInOut"
  | "elasticIn" | "elasticOut" | "elasticInOut" | "bounceIn" | "bounceOut" | "bounceInOut";
interface Key {
  frame: Frame;
  value: number | number[];                           // number[] for vector props
  ease: EaseId;                                       // shapes the segment from this key to the next
  bezier?: [number, number, number, number];          // ease "bezier": CSS cubic-bezier(x1, y1, x2, y2)
  spring?: { damping: number; frequency: number };    // ease "spring": defaults 0.7 and 4
}
```

- Vector values: colors are `[r, g, b, a]` (straight alpha, 0..1, interpolated per channel), points `[x, y]`. A key's value must match its prop (validated).
- New props (the prop id is the field's path; valid only on clips that have the field): `transform.anchor.x`, `transform.anchor.y`; media `crop.left`, `crop.top`, `crop.right`, `crop.bottom`; solids `size.w`, `size.h`, `cornerRadius`, `fill` (vector, when the fill is a color), `stroke.width`, `stroke.color` (vector), `stroke.dashOffset`, `shadow.x`, `shadow.y`, `shadow.blur`, `shadow.spread`, `shadow.color` (vector); pictures `cornerRadius`; text `style.fontSize`, `style.letterSpacing`, `style.fill` (vector, color fills). Later batches add theirs.
- P11 holds: an animated font size draws from a raster at the largest keyed size, scaled; animated letter spacing positions the character atlas; an animated text fill tints a separate fill layer. Text never re-rasterizes during playback.
- UI (Batch 61): the ease selector becomes a searchable popover with groups (Basic, Sine, Quad, Cubic, Quart, Quint, Expo, Circ, Back, Elastic, Bounce, Custom) and a curve thumbnail per ease; `Custom bezier` opens a curve editor (two handles, presets, numeric fields, `Copy as CSS`); `Spring` shows damping and frequency. The new fields get stopwatches and timeline lanes. Keyframe lanes support copying and pasting selected keys (pasted at the playhead with their spacing), `Reverse keys` and `Set ease for selected`. Until then (Batch 60) the existing ease selector lists the new eases in a plain grouped list.
- INTEROP.md gets the ease name table (Batch 60): CSS (`ease`, `ease-in`, `ease-out`, `ease-in-out` as beziers), GSAP (`power1` to `power4` = quad to quint, `sine`, `expo`, `circ`, `back` with overshoot 1.70158, `elastic`, `bounce`, each with `.in`, `.out`, `.inOut`), After Effects (Easy Ease = bezier with 33% influence).

### 21.10 Compound clips (Batches 62 and 63)

Amends §1.3 (nested sequences), §5.2 and §6.12. Batch 62 builds the model, rendering, audio and the make and break commands; Batch 63 editing inside a compound and the Compounds bin.

```ts
// Project adds:
sequences: Record<SequenceId, Sequence>;               // empty in older projects
interface Sequence {
  id: string;
  name: string;
  size: { w: number; h: number };                      // project px
  duration: Frame;
  background: RGBA | null;                             // null = transparent
  tracks: Track[];                                     // inner video and audio tracks, ordered like Project.tracks; no caption track
}
interface CompoundClip extends ClipBase {
  kind: "compound";
  sequenceId: string;
  offset: Frame;                                       // the sequence frame shown at the clip's start
  transform: Transform; opacity: number; keyframes?: Keyframes; fades: { in: Frame; out: Frame };
  volume: Volume;                                      // gain of the inner audio
}
```

- Inner clips live in `Project.clips` (ids unique project-wide) with `trackId` naming an inner track. Several compound clips may share one sequence (instances). Nesting goes up to 8 levels; cycles are refused.
- Time: inner frame = `offset + (frame - start)`. A compound clip cannot run past its sequence's end; trimming changes `offset` and `duration` like a media clip's in and out, and slip works.
- Rendering: the compositor renders the sequence at the inner frame into a pooled texture (the sequence size times the preview detail factor, P6) and draws it as one layer with the clip's transform, opacity and fades. A sequence without animation or video caches its texture until an edit. Inner audio is mixed with the compound's gain.
- Commands (Batch 62): `Make compound` from selected clips (they move into a new sequence the size of the project, keeping their times and places; one compound clip replaces them on the lowest track they used); `Break apart` (only when the compound has no transform, opacity, fades or keys; otherwise disabled with the reason); `Make unique` (copies the sequence for this instance).
- Editing (Batch 63): `Open compound` (double-click or Enter) switches the timeline and the canvas to the sequence with a breadcrumb (`Project > Card 3`; Esc or the breadcrumb closes it); edits inside are normal commands. The media panel lists sequences in a `Compounds` bin, and dragging one adds an instance; compound clips show their sequence's poster.

### 21.11 Alpha video and image sequences (Batch 64)

Amends §9.1 to §9.6.

- Alpha video: WebM with VP8 or VP9 and an alpha channel (the alpha stream in Matroska BlockAdditions, BlockAddID 1, track flag `AlphaMode` 1). The decode worker runs a second `VideoDecoder` for the alpha stream and pairs frames by timestamp; the alpha plane is uploaded as a second texture and multiplied in the compositor, in both backends. The probe sets `MediaItem.alpha?: true`. AV1 and HEVC alpha import as opaque with a toast; ProRes is refused with the conversion command in INTEROP.md (`ffmpeg -i in.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 out.webm`).
- Proxies of alpha media: VP9 with `alpha: "keep"` when `VideoEncoder.isConfigSupported` accepts it; otherwise no proxy (full decode and a `no proxy` badge).
- Image sequences: a folder of numbered PNG or WebP frames of one size imports as one media item: `MediaItem.kind: "image"` with `sequence: { dir: string; pattern: string; first: number; count: number; fps: Rational }` (`dir` relative to the project folder, `pattern` printf-style such as `frame_%05d.png`); duration = count / fps. Picking or dropping such a folder asks once: `Import as image sequence (N frames) at <fps>?`. Frames decode on demand in workers (`createImageBitmap`) into the frame cache with the video keys (P6 to P8); thumbnails come from frames.
- Exports flatten alpha over the project background as before (alpha export: §21.25).

### 21.12 Vector shapes and SVG import (Batches 65 and 66)

Amends §5.2 (a new clip kind) and §9.1 (SVG). Batch 65 builds the model and the renderer; Batch 66 SVG import and the shape tools.

```ts
interface ShapeClip extends ClipBase {
  kind: "shape";
  size: { w: number; h: number };                      // the view box, project px at scale 1
  paths: ShapePath[];                                  // drawn in order
  transform: Transform; opacity: number; keyframes?: Keyframes; fades?: { in: Frame; out: Frame };
}
interface ShapePath {
  id: string;
  d: string;                                           // SVG path data in view-box px, arcs allowed
  fill: Fill | null;
  fillRule: "nonzero" | "evenodd";
  stroke?: StrokeStyle & { cap: "butt" | "round" | "square"; join: "miter" | "round" | "bevel"; miterLimit: number };
  trim?: { start: number; end: number; offset: number };   // fractions of the path length
  primitive?: Primitive;                               // when present, `d` is generated from it
}
type Primitive =
  | { kind: "rect"; w: number; h: number; radius: number }
  | { kind: "ellipse"; w: number; h: number }
  | { kind: "polygon"; sides: number; radius: number; roundness: number }
  | { kind: "star"; points: number; inner: number; outer: number; roundness: number }
  | { kind: "arrow"; length: number; shaft: number; head: number; headLength: number }
  | { kind: "arc"; radius: number; start: number; end: number }       // degrees, 0 = up, clockwise
  | { kind: "line"; length: number };
```

- Keyframe props: `paths.<id>.trim.start`, `paths.<id>.trim.end`, `paths.<id>.trim.offset`, `paths.<id>.stroke.width`, `paths.<id>.stroke.color`, `paths.<id>.stroke.dashOffset`, `paths.<id>.fill` (color fills) and `paths.<id>.primitive.<param>` (number params).
- Rendering (Batch 65): curves flatten to polylines with a tolerance tied to the on-screen scale; fills are exact for both fill rules (stencil-then-cover, preferred, or earcut tessellation as in FlashFX-v2 `src/engine/pathTessellation.ts`; log the choice); strokes are expanded with caps, joins, miter limit, dashes and trims; edges are anti-aliased to match solids. Geometry is cached by path and style, a trim rebuilds only the trimmed stroke, and geometry work above 2 ms moves to a worker. Shape clips move, scale and rotate with the existing gizmo.
- SVG import (Batch 66): `Import as shapes` on an SVG media item (context menu), and as a choice when dropping an SVG: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `g` with transforms (flattened), fill, stroke and opacity attributes and style properties, linear and radial gradients (as `GradientFill`), `viewBox`. Anything else (filters, masks, clip paths, text, images, patterns) keeps the SVG as an image clip, and a toast names what was unsupported.
- Tools (Batch 66): a `+ Shape` dropdown in the timeline toolbar (Rectangle, Ellipse, Polygon, Star, Arrow, Arc, Line) creates a shape at the playhead; a `Shape` section edits each path's fill, stroke and trim (with stopwatches) and the primitive's parameters. Point editing on the canvas stays out (later).

### 21.13 Text v2: styled spans, counters, animators (Batches 67 and 68)

Amends §10.1 (rich text) and §10.4. Batch 67 builds spans; Batch 68 counters, animators and the new presets.

- Spans (Batch 67): `TextClip.spans?: { start: number; end: number; style: TextSpanStyle }[]`, UTF-16 offsets into `text.value`, sorted and not overlapping; `TextSpanStyle = { fill?: Fill; fontFamily?: string; fontWeight?: number; italic?: boolean; underline?: boolean; strike?: boolean; highlight?: RGBA }` (`highlight` is a box behind the span). Edits keep spans on their words (typing inside a span extends it; deleting shrinks or removes it). Inline editing gets a small format bar (Bold, Italic, Color, Highlight, Clear) and `Mod+B`, `Mod+I`. Spans are content: presets never store them, and applying a preset keeps them.
- Counters (Batch 68): `TextClip.counter?: { from: number; to: number; decimals: number; prefix: string; suffix: string; separator: "" | "," | "." | " " | "'"; ease: EaseId }`: the clip shows `prefix + value + suffix`, the value going from `from` to `to` over the clip's duration, or following keys on the prop `text.counter.value` when present; `text.value` holds the final text (for layout bounds). It is drawn from a glyph atlas of the digits, separators, prefix and suffix and never re-rasterized per frame (P11).
- Animators (Batch 68): `TextClip.animators?: TextAnimator[]` with `TextAnimator = { id: string; unit: "char" | "word" | "line"; selector: { start: number; end: number; offset: number; shape: "square" | "rampUp" | "rampDown" | "triangle" | "round" | "smooth"; ease: number; order: "forward" | "reverse" | "random"; seed: number }; props: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number; blur?: number; tracking?: number; fill?: RGBA } }`. Each unit gets an amount 0..1 from the selector (After Effects range-selector semantics, FlashFX-v2 `src/text/rangeSelector.ts`), and each prop applies times that amount (opacity moves toward its value). Keyframe props: `animators.<id>.selector.start`, `.selector.end`, `.selector.offset` and `animators.<id>.props.<name>`.
- Presets (Batch 68): the In and Out chips add `typeOn`, `decode` (characters scramble before settling), `tumbleIn`, `cascadeUp`, `riseByLine`, `popInByChar`, `blurInByChar`, `fadeInByChar` and `highlightSweep` (a span highlight growing across the words); the existing animations are unchanged.
- P11: per-unit transforms, opacity, blur and fill tint run on the GPU from the atlas; `decode` swaps glyphs from a per-text glyph atlas.

### 21.14 Parenting, null clips and motion paths (Batch 69)

- `ClipBase.parentId?: ClipId` on visual clips of video tracks: the clip's transform is in its parent's space (the parent's world transform applies after the clip's own, After Effects semantics); opacity is not inherited. The parent is evaluated at the frame clamped into its own range. Parent and child are in the same sequence; cycles are refused. Setting or clearing a parent keeps the child's world placement at the playhead (its local transform and keys are converted).
- Null clips: `{ kind: "null"; transform: Transform; keyframes?: Keyframes; size: { w: number; h: number } }` on video tracks, never drawn, shown as an outline with a cross on the canvas when selected.
- Motion paths: the vector prop `transform.position` (`[x, y]`), whose keys may carry `spatialIn?: [number, number]` and `spatialOut?: [number, number]` tangents (relative to the key's point). Positions move along the arc-length-parameterized path (FlashFX-v2 `src/core/positionPath.ts`), the ease shaping progress along it. A clip uses either `transform.x` and `transform.y` keys or `transform.position` keys; `Convert to motion path` and back are commands. With the clip selected, the canvas shows the path, its keys and draggable tangent handles (gestures, P2).
- `ClipBase.autoOrient?: boolean`: rotation follows the path's tangent, added to the clip's rotation.
- UI: a Parent field in the Transform section (a clip picker), `+ Null` in the toolbar overflow, and Motion path and Auto-orient toggles in the Transform section.

### 21.15 2.5D layers (Batch 70)

- `Transform.rotationX?` and `Transform.rotationY?` (degrees) and `Transform.z?` (px, positive = farther away); `Project.settings.perspective?: number | null` and `Sequence.perspective?: number | null` (viewing distance in px; null = none; 1600 when a layer first gets a 3D rotation); `Sequence.depthSort?: boolean` (inner layers drawn by depth instead of track order); `ClipBase.backfaceHidden?: boolean`.
- Keyframe props `transform.rotationX`, `transform.rotationY`, `transform.z`.
- Rendering: each layer's quad is projected on the CPU to a homography and drawn with perspective-correct texturing in both backends; hit testing and the gizmo use the projected quad. The gizmo gets X and Y rotation handles and the Transform section the fields.
- Out: moving cameras, lights, depth of field, 3D models.

### 21.16 Transitions v2 (Batch 71)

Amends §6.15.

- `TRANSITION_KINDS` adds `slide` (the incoming clip slides over), `push` (both move), `wipe` (a straight edge with softness), `iris` (a circle from a center), `zoomIn`, `zoomOut` (scale with a dissolve), `whip` (push with a directional blur peaking at the cut), `blurDissolve`, `glitch` and `flash` (to white and back).
- `Transition.direction?: "left" | "right" | "up" | "down"` (slide, push, whip), `angle?: number` and `softness?: number` (wipe), `center?: { x: number; y: number }` (iris, fractions), `ease?: EaseId`. An absent `ease` means the v1 linear mix, so existing transitions play unchanged; the motion kinds (slide, push, whip, zoomIn, zoomOut, wipe, iris) are created with `easeInOut`. Both clips keep the same values (one transition).
- Rendering: the two-picture transition layer takes a kind and its parameters, in both backends. Audio crossfades stay as they are.
- UI: transition chips grouped (Dissolve, Motion, Wipe, Stylized) with hover previews, and direction buttons.

### 21.17 Blend modes and track mattes (Batch 72)

- `ClipBase.blend?: BlendMode` on visual clips: `normal`, `darken`, `multiply`, `colorBurn`, `lighten`, `screen`, `colorDodge`, `add`, `overlay`, `softLight`, `hardLight`, `difference`, `exclusion` (the formulas of FlashFX-v2 `src/core/effects/blendModes.ts`). Modes the GPU blend state can express use it; the others read a copy of the backdrop, made only when such a mode is visible in the frame.
- `ClipBase.matte?: { clipId: ClipId; mode: "alpha" | "alphaInverted" | "luma" | "lumaInverted" }`: the clip shows only where the matte clip (a visual clip of the same sequence) is opaque or bright at that frame; `ClipBase.matteOnly?: boolean` hides a clip used as a matte.
- UI: a Compositing section with a Blend list and a Matte picker.

### 21.18 Masks (Batch 73)

- `ClipBase.masks?: Mask[]` on visual clips, with `Mask = { id: string; shape: { kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; radius?: number } | { kind: "path"; d: string }; mode: "add" | "subtract" | "intersect"; feather: number; expansion: number; opacity: number; inverted: boolean }` in the clip's content px, combined in order into one coverage texture per clip (cached while static).
- Keyframe props `masks.<id>.x`, `.y`, `.w`, `.h`, `.radius`, `.feather`, `.expansion`, `.opacity`, and `masks.<id>.path` (a vector of the path's points) while the point count stays the same.
- Canvas mask mode (a button and a key): drag rectangle and ellipse handles, move, add and delete path points, drag a feather handle; each gesture commits one command (P2). One-click reveals: `Wipe in` and `Circle reveal` presets create mask keys.

### 21.19 Effects (Batches 74 to 76)

- `ClipBase.effects?: Effect[]` on visual clips, with `Effect = { id: string; type: EffectType; enabled: boolean; params: Record<string, number | number[] | string> }`. The order for a layer: content (with crop), masks, effects in order, transform, opacity and fades, blend and matte. A clip with effects renders into a pooled texture in its content space, padded by each effect's reach, then draws with its transform.
- Registry (`src/render/effects/registry.ts`, Batch 74): for each type its params (name, kind, default, range, keyframeable), its passes (WGSL and GLSL), its reach and whether it reads neighboring pixels. Keyframe props `effects.<id>.<param>`.
- Batch 74 types: `gaussianBlur`, `directionalBlur`, `glow` (outer or inner, threshold, color), `dropShadow` (shaped by alpha), `outline` (a stroke shaped by alpha).
- Batch 75 types: `colorAdjust` (brightness, contrast, saturation, exposure, temperature, tint, hue, vibrance), `vignette`, `sharpen`, `grain`, `chromaKey` (color, tolerance, softness, spill), `lumaKey`, `lut` (a `.cube` file copied to `luts/` in the project, param `file`, plus intensity). Looks (Batch 75): an effect stack saved by name in the global store and applied in one click.
- Batch 76 types: `rgbSplit`, `pixelate`, `mirror`, `wave`, `glitch`, `posterize`, `invert`.
- Effects render at the preview detail factor (radii scale with it); static results are cached (P6).

### 21.20 Adjustment clips (Batch 76)

- `{ kind: "adjustment"; effects: Effect[]; opacity: number; keyframes?: Keyframes; fades?: { in: Frame; out: Frame }; masks?: Mask[] }` on video tracks: during its range its effects apply to the composite of every layer below it in the same sequence; masks limit the area and opacity mixes the result with the unaffected picture.

### 21.21 Audio v2 (Batch 77)

Amends §14.

- `Track.gainDb?: number` (-60 to +12) and `Track.pan?: number` (-1 to 1) on audio tracks; `Volume.pan?: number` (-1 to 1) on audio clips, with the keyframe prop `volume.pan`; `fades.curve?: "linear" | "equalPower" | "exponential"` for audio fades.
- Loudness: the meters show momentary, short-term and integrated loudness (ITU-R BS.1770-4) and true peak; `Project.settings.loudness?: { targetLufs: number; truePeakDb: number } | null` (off by default; the Instagram Reels, TikTok and YouTube Shorts export presets set -14 LUFS and -1 dBTP). Exporting with a target measures the offline mixdown, applies one gain and a true-peak limiter (5 ms lookahead), then encodes.
- `Detect beats` on a music clip adds teal markers at its beats (FlashFX-v2 `src/core/beatDetection.ts`); snapping already uses markers.
- A compact mixer popover from the track header: gain fader, pan, mute, solo.

### 21.22 Time remapping and reverse (Batch 78)

Amends §5.2 (`MediaClip`) and §14 (speed).

- `MediaClip.timeRemap?: { frame: Frame; sourceUs: Us; ease: EaseId }[]` on video clips: keys relative to the clip's start (the first at 0, the last at the duration) map timeline frames to source times (freezes and backward segments allowed). When present it replaces `speed` for the picture, and the linked audio is muted (with a badge). One-click ramps: `Ramp in`, `Ramp out`, `Hero` (fast, slow, fast), `Bullet`.
- `MediaClip.reverse?: boolean`: the clip plays its source backward (decoded a GOP at a time and served backward from the frame cache; proxies keep it smooth); its audio plays reversed from the decoded PCM.
- `MediaClip.frameBlend?: boolean`: when the source advances less than one frame per timeline frame, the two nearest source frames are mixed.
- UI: a time remap lane on the clip with the speed graph and draggable keys. The decoder lookahead (P7) follows remapped source times.

### 21.23 Lottie clips (Batch 79)

- Media kind `lottie` (`.json` files with bodymovin keys, sniffed before other JSON, and `.lottie` archives) with duration, size and frame rate from the file. Clip kind `lottie`: the media clip fields (media, in, out, speed, transform, opacity, keys, fades) plus `loop?: boolean` and `colorOverrides?: { from: RGBA; to: RGBA }[]`.
- A worker renders frames at the on-screen scale with `@lottiefiles/dotlottie-web` (MIT, OffscreenCanvas) into the frame cache (P5 to P8). If it cannot run in a worker, port FlashFX-v2 `src/engine/lottieRenderer.ts` and list the unsupported features.

### 21.24 Templates (Batch 80)

- `Sequence.params?: TemplateParam[]` with `TemplateParam = { id: string; label: string; kind: "text" | "color" | "number" | "media" | "font" | "toggle"; targets: { clipId: ClipId; path: string }[]; default: JsonValue; min?: number; max?: number }` (`path` is a field path such as `text.value`, `style.fill`, `fill`, `mediaId` or `enabled`).
- `CompoundClip.params?: Record<string, JsonValue>`: this instance's values, applied when its sequence is evaluated (instances share everything else; render caches key on the values).
- `Expose as parameter` in a field's context menu (inside an open compound); `Save as template` (name, category, thumbnail; media copied) to the global store and the library folder; a Templates section in the Presets tab (search, thumbnails, drag to the timeline to create the sequence and an instance); selecting an instance shows its parameters as simple fields.
- CLI `fill <dir> <values.json>`: sets instance parameters by clip id or name.

### 21.25 Export v2 (Batch 81)

Amends §16.

- WebM (VP9 or AV1, with Opus) through a WebM muxer (`webm-muxer`, MIT, or a small EBML writer in `src/export/webm/`), with a `Transparent background` option (VP9 with `alpha: "keep"` when supported; the project background is not drawn).
- PNG sequence (`<name>_%05d.png`, alpha optional) into a chosen folder.
- GIF (`gifenc`, MIT): frame rate and width options (default 15 fps and 540 px), a palette per export, optional dithering.
- Audio stems: one WAV per audio track over the export range.
- Collect project: copies linked media into `media/` and rewrites the references; `Export as zip` writes a store-only zip of the project folder (own writer, no dependency).
- Presets: Transparent overlay (WebM), GIF preview, PNG sequence. The CLI render accepts `--format mp4|webm|png|gif`.
<!-- END SPEC 21 -->

---

# Part E: Batches 54 to 82 (append to `docs/BATCHES.md`)

Copy everything between the two marker lines, without the markers, to the end of `docs/BATCHES.md`, after a blank line, a `---` line and a blank line (Batch 53 ends without a separator).

<!-- BEGIN BATCHES -->
## Batch 54: Interop I: capability manifest, field table, strict validator, generator fields

**Goal:** Other tools can write projects with confidence: the editor publishes what it supports (`capabilities.json`), describes every field of `project.json` in one table, checks projects strictly from the command line with its own code, documents the format, and stores generator metadata and baked stand-ins.

**Spec refs:** §21.1, §21.2, §21.3, §21.4, §5.2, §9.7, §10.5, §20.1, §20.3, §3.2, §4.

**Build:**
- `src/core/capabilities.ts` (the manifest from the model constants and a `FEATURES` object, with the v1.1 values exactly as §21.2) and `capabilities.json` at the repo root through `npm run capabilities`; a unit test fails when the file is stale or a list differs from its constant.
- The field table `src/core/document/schema.ts` (§21.3) for the whole current document, with a test that every type in `types.ts` is covered.
- Model: `meta.generator?` and `ClipBase.fallbackOf?` (§21.4); `SCHEMA_VERSION` 4 with its migration; in-app validation of both (outer shape, `kind` equal to `data.kind`); copy, paste, split (the right half adds the split offset to `headTrim`), head trims, slips and undo keep `fallbackOf` correct; property-based tests extended.
- Project CLI (§21.3): `scripts/cli/project-cli.ts`, `npm run build:cli`, `npm run cli`; the commands `capabilities`, `validate` (strict, from the field table, plus the invariants of `validate.ts` and the file checks), `info` and `schema`; `dist-cli/` added to `.gitignore` and to the ESLint ignores.
- Restructure only where needed so the field table, the validator, the migrations and the defaults import no DOM code.
- `docs/INTEROP.md` (§21.4): the field reference generated from the table, the prose sections and examples; a doc test validates every JSON example.
- Fixtures: `fixtures/interop/basic/` (every v1.1 clip kind, a caption track with word timings, `fonts/fonts.json` with a library font, small media) and `fixtures/interop/broken/` (copies with one error each).
- Manifest: `schemaVersion` 4; `cli.validate`, `cli.info`, `interop.fallbackOf` and `interop.generatorMeta` true.

**Do not build yet:** `normalize` and the Node media header readers (Batch 55); open links, reload, repair and Make editable (Batch 56); rendering from the CLI (Batch 57); any field of §21.7 onward (their keys stay false).

**Implementation notes:** The field table is the single description of the format: the strict CLI validation, the JSON Schema of `schema`, the INTEROP.md field reference and, from Batch 55, the defaults of `normalize` all come from it, and every later batch adds its fields to it (§21.1). The app's own loading stays as lenient as it is today; only the CLI is strict. `fallbackOf.data` is opaque apart from its `kind`: no migration and no validation inside it, so a stand-in written for a future clip kind survives until that kind exists. Why now: the reels autopilot writes a project for every reel and needs the manifest and a validator it can trust first. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] `npm run cli -- capabilities` prints the manifest; `capabilities.json` is identical, its lists equal the model constants, and `schemaVersion` is 4 with the Batch 54 keys true.
- [ ] `npm run cli -- validate fixtures/interop/basic` exits 0; each project in `fixtures/interop/broken/` exits 1 and names its problem with the JSON path: a clip past its media end, overlapping clips, a missing media file, a caption track below a video track, a bad font file, a frame that is not an integer, `opacity: "1"`, a transform without `anchor`, and an unknown field on a clip.
- [ ] `npm run cli -- schema` describes every field of the table, and a test checks the basic fixture against it.
- [ ] A project saved before this batch opens unchanged; a clip with `fallbackOf` keeps the block through save, reload, copy and paste, undo and redo, and splitting it gives the right half a `headTrim` equal to the split offset.
- [ ] Every JSON example in `docs/INTEROP.md` validates in the doc test, and `npm run check` stays green with `dist-cli/` present.

**State after:** tools that generate projects can ask what the editor supports and check every field they write with the editor's own rules.

---

## Batch 55: Interop II: normalize, sparse projects and Node media headers

**Goal:** A generator writes only what matters (ids, kinds, timing and content) and the editor completes the rest with exactly the defaults the app would use, with media durations, sizes and fonts filled in from the files.

**Spec refs:** §21.3, §21.4, §21.1, §5.2, §9.1, §20.1, §4.

**Build:**
- `normalize` (§21.3) with the sparse rules of §21.4: migration of an older `schemaVersion` first, defaults from the field table, deep merges of nested styles, sorted clip lists, computed media clip `out` points.
- Node media header readers (§21.3) with unit tests on tiny fixture files; `validate` compares media records with the headers; `info` shows the probed facts.
- Font recording: library fonts used by texts and captions go into `fonts/fonts.json` (version 2), with their files copied from `public/fonts/library/`.
- `fixtures/interop/sparse/` (a sparse project at schema 3 with its media, and the expected result) and the sparse-input section of INTEROP.md.
- Manifest: `cli.normalize` true.

**Do not build yet:** open links, reload, repair and Make editable (Batch 56).

**Implementation notes:** `normalize` must produce exactly what the app would have created: every default comes from the constants the app uses (`DEFAULT_TEXT_STYLE`, `defaultCaptionStyle`, the track and clip factories) through the field table, never from copies. Reuse the app's demux code where it runs in Node (mp4box does) and write the rest (WAV, MP3, OGG and image headers) small and pure. A field added by a later batch must be filled even when the input does not know it exists, so generators keep working as the schema grows. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, and register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] `npm run cli -- normalize fixtures/interop/sparse` prints a project equal to the expected result, with durations, sizes, frame rates and audio presence read from the files in Node, and the result passes the strict `validate`.
- [ ] The sparse fixture written at schema 3 comes out at the current schema with every field the newer schema requires.
- [ ] A text clip using a library font gets its `fonts/fonts.json` entry and files; `--write` writes the folder, and the app opens it with the right fonts.
- [ ] A media record whose duration differs from its file by more than a frame makes `validate` fail with both values; a file whose header cannot be read is reported and left for the app's repair on open.

**State after:** generators write short, readable JSON and get complete, valid projects.

---

## Batch 56: Interop III: open links, reload on external change, repair on open, Make editable

**Goal:** Generated projects are one click away and stay in sync: open from a link inside the projects folder, reload when another tool edits `project.json`, repair small media mismatches on open, and turn baked stand-ins into native clips once the editor supports them.

**Spec refs:** §21.5, §21.4, §21.3, §15, §12, §11, §6.4, §4, §21.1.

**Build:**
- The projects folder (start screen button, Settings > General) and the `?open=` flow (§21.5); the opened project joins Recent projects.
- Reload on external change (§21.5): the focus check and the 5 s idle check, the in-place reload with its `history/` backup, the banner with Reload and Keep mine.
- Repair on open (§21.5) with its toast and log file.
- Stand-ins (§21.5): the `baked` badge on timeline clips, the properties header line, `Make editable` (completion with the field table's defaults, migration from `fallbackOf.schemaVersion`, the head trim of `headTrim` with the editor's trim logic, strict validation, one command), `Make all editable` (project menu and palette), the toast on open, the confirmation that edits to the stand-in itself are not carried over; `validate` and `info` report convertible stand-ins.
- Generator metadata and the generator notes (`FALLBACKS.md`, `OPEN.txt`, read-only) in the Project section.
- `fixtures/interop/large/`, written by `scripts/fixtures/make-large.mjs` (40 video tracks, 1,000 clips, 5,000 keys), and its measurements; `fixtures/interop/standins/` (stand-ins whose data is a solid at schema 3, an unknown kind, and a split stand-in).
- `.gitignore`: `fixtures/**/cache/`, `fixtures/**/history/`, `fixtures/**/session.json`, `fixtures/**/exports/`.
- Manifest: `interop.openLink`, `interop.externalReload` and `interop.repairOnOpen` true.

**Do not build yet:** the headless render (Batch 57).

**Implementation notes:** The File System Access API cannot watch files: one `getFile()` per check, only while the window is visible, never during a save; compare with the `lastModified` the app itself wrote last. A reload must never lose work: with unsaved changes it only offers the banner. The conversion must reuse the app's own pieces (the defaults of the field table, the migrations, the trim logic of Batches 13 and 14, the strict validator), never a second implementation. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches (the large fixture), follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47.

**Acceptance:**
- [ ] With the projects folder set to the repo's `fixtures/` folder, `/?open=interop/basic` in a fresh tab opens the project after at most one click.
- [ ] Changing `project.json` on disk while the project is open and saved reloads it within 5 s, keeping the playhead and zoom; with unsaved changes the banner appears, and Reload and Keep mine both behave as §21.5 says.
- [ ] A project whose audio media record says 10.0 s for a 9.5 s file opens with the duration corrected, the clip trimmed, a toast with the counts and the log file written.
- [ ] The stand-in whose data is a sparse solid written at schema 3 becomes that solid with Make editable, in one undo step, at the same place and time; the one whose data names an unknown kind shows the reason and stays; Make all editable reports converted and remaining counts.
- [ ] A stand-in split in two converts, half by half, into the same frames as converting it whole and splitting after.
- [ ] The large fixture opens in under 2 s on a warm cache, plays at 60 fps with zero React commits, and timeline interaction holds 60 fps.

**State after:** a generated project opens from a link, follows edits made on disk, and upgrades its baked layers when the editor learns their kind.

---

## Batch 57: Headless render and compare CLI

**Goal:** Render any project folder to MP4 or PNG frames from the command line with the app's own compositor and encoders, and compare two renders frame by frame, so generators and every later batch can check pictures automatically.

**Spec refs:** §21.6, §21.1, §16, §9.4, §3.5, §4.

**Build:**
- The render-only entry `/?render=<token>`, `HttpDir` (read-only, range requests) and `HttpSink`.
- CLI `render` (§21.6): the local server for `dist/` and the project, Chrome or Edge discovery, the headless launch with WebGPU (or `--backend webgl2`) and a `shorts-editor-render-<random>` profile, the DevTools protocol over Node's `WebSocket`, the export job and frame renders, progress, the watchdog, and cleanup of only its own Chrome after success, failure and Ctrl+C.
- CLI `compare` (§21.6) with SSIM, PSNR, regions, the worst frames, `--diff` images and `--json`.
- Expected frames for `fixtures/interop/basic/` on both backends, and `npm run test:render`.
- `out/` added to `.gitignore` and to the ESLint ignores.
- Manifest: `cli.render` and `cli.compare` true. INTEROP.md: how a generator renders its project and compares it with its own reference video.

**Do not build yet:** new export formats (Batch 81).

**Implementation notes:** Port FlashFX-v2 `scripts/lib/headless-gpu.mjs` (Chrome discovery, the launch flags, the localhost secure context, CDP over Node's WebSocket and fetch) and replace its esbuild bundling with the app's own `dist/`. Record in `PROGRESS.md` the exact Chrome flags that give WebGPU headless on this machine (Batch 53 already drove headless Chrome over CDP). The CLI render and an Export tab render of the same project must match: one compositor, one encoder pipeline. Never use ports 5300 or 5310. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] `npm run cli -- render fixtures/interop/basic --out out/basic.mp4` writes an MP4 that plays in Chrome and VLC and matches an Export tab render of the same project (SSIM at least 0.99 on every frame).
- [ ] `--frames 0,45,89 --png out/frames` writes PNGs identical to Export frame at those frames.
- [ ] `compare` of a file with itself reports SSIM 1.0; against a render where one title moved 8 px it exits 1 and names the frames and the region.
- [ ] `--backend webgl2` renders the fixture with SSIM at least 0.97 against WebGPU.
- [ ] A 60 s 1080x1920 project renders headless in under 2x real time on this machine (or the measured time is recorded as a deviation), and no Chrome process it started remains after success, a failure or Ctrl+C.
- [ ] `npm run test:render` renders and checks every fixture that has expected frames, and `git status` shows nothing new under `out/`.

**State after:** any tool, and every later batch, can render editor projects and check the pictures without opening the app.

---

## Batch 58: Shape, frame and box styles: strokes, shadows, corner radii, gradients

**Goal:** Cards, tags, pills, buttons and framed pictures look exactly as designed: strokes with alignment and dashes, hard and soft shadows, per-corner radii and multi-stop gradients on solids, rounded and bordered pictures, and bordered text and caption boxes.

**Spec refs:** §21.7, §21.1, §5.2, §9.4, §10.1, §10.5, §20.3, §11, §4.

**Build:**
- Model (§21.7): `Fill` with `GradientFill`, `StrokeStyle`, `ShadowStyle`; the solid, picture, text fill and text background fields (the box stroke and shadow with `enabled`); field table entries; schema bump with migration, validation and property tests.
- Renderer: the signed-distance solid shader (box with four radii, ellipse, line) with fills, strokes (inside, center, outside, dashes) and analytic shadows, in both backends; pictures clipped to their rounded rectangle with frame stroke and shadow; the text raster draws gradient fills and the box's stroke and shadow.
- Properties panel: the Fill, Stroke, Shadow and Corners sections for solids and pictures; Border and Shadow rows in the text and caption Background sections, cue overrides included.
- `fixtures/interop/styles/` with expected frames: a paper card (white fill, 3 px ink stroke inside, hard 7/7 ink shadow, square corners), a pill, a dashed outline, a four-stop radial gradient, a rounded video with a border and a soft shadow, a caption track with a white box, a 3 px ink border and a hard shadow, and one cue whose override turns the border off.
- Manifest keys of Batch 58 (§21.2).

**Do not build yet:** keyframes on the new fields (Batches 60 and 61), vector paths (Batch 65), shadows and outlines shaped by the alpha of transparent pictures (effects, Batch 74).

**Implementation notes:** Port FlashFX-v2 `src/engine/renderer.ts` RECT_SHADER (about line 209) for the signed-distance box, stroke and dashes, and `src/core/fillSampler.ts` for gradient stops; write the GLSL twins in `glShaders.ts`. Shadows use an analytic Gaussian of the rounded box (no extra pass); a hard shadow (blur 0) must have pixel-exact edges. Why now: every card, tag, pill and chip of the reels, and their caption box, use a 3 px outline with a hard offset shadow; with this batch they stop being baked. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] The paper card matches its expected frame (SSIM at least 0.99, shadow edges pixel exact) in the preview, an export and the CLI render, on both backends.
- [ ] Switching a solid's stroke from inside to outside keeps its fill box in place; dashes run evenly around rounded corners.
- [ ] The four-stop radial gradient matches its expected frame; text with a linear gradient fill renders the same in preview and export.
- [ ] A rounded video clip (radius 40, 4 px border, soft shadow) plays at 60 fps with zero React commits.
- [ ] Every cue of the bordered caption track renders with its box border and hard shadow, except the cue whose override turns the border off.
- [ ] Older projects open unchanged and `capabilities.json` announces the new keys.

**State after:** the outlined-card look of modern explainer reels is native and editable.

---

## Batch 59: Captions v2: progressive highlight, emphasis words, cue animations, word boxes, words import

**Goal:** Every common word-by-word caption style is native: words that stay colored once spoken or appear as spoken, emphasis words in their own color, animated cue changes, boxes per word, and word timings imported from JSON with their chunks and emphasis words.

**Spec refs:** §21.8, §10.5, §20.3, §10.6, §5.2, §11, §4, §21.1.

**Build:**
- Model (§21.8): the `progressive` and `reveal` modes, `emphasisColor`, `CaptionWord.emphasis` and `color`, `CaptionStyle.anim` (and in overrides), the `word` box mode; field table entries; schema bump with migration, validation and property tests.
- Rendering from the word atlas: spoken, active and upcoming states, emphasis and word colors, word boxes, cue in and out animations (fade, pop, slideUp, slideDown); export parity.
- Captions tab: `Import words` (the §21.8 formats) with the chunking dialog; explicit `cues` and emphasis indexes respected; in the cue editor a row of word chips where a click toggles a word's emphasis.
- Properties panel: Progressive and Reveal highlight chips, Emphasis color, cue animation In and Out chips with frames, the Word box mode.
- Four new Captions starters in the preset bar using these features (paper box progressive, yellow progressive, reveal pop, word boxes).
- `fixtures/interop/captions-v2/` with a `words.json` in the reels format (word, start ms, end ms) plus its chunk list, and expected frames.
- Manifest keys of Batch 59.

**Do not build yet:** styled spans in text clips (Batch 67).

**Implementation notes:** Build on the Batch 52 and 53 caption code: extend the effective-style resolver and the word atlas. Nothing is rasterized during playback (P11): states are tints of pre-rasterized glyph layers or one raster per state made once per cue. Importing the reels autopilot's `words.json` with its chunk list must give exactly its cue boundaries and emphasis words. Why now: the reels' captions (gray words turning ink as spoken, a coral emphasis word, a bordered box swapping in 2 frames) become native. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Progressive: in a four-word cue each word turns from the inactive to the highlight color as it starts and stays colored; Reveal hides upcoming words; both identical in export and the CLI render.
- [ ] An emphasis word shows the emphasis color from the cue's first frame; a word's own color wins over everything.
- [ ] A 2-frame fade in and a pop out render as specified and are clamped on short cues.
- [ ] The Word box mode draws a box per word; with the Background highlight the active word's box takes the highlight color.
- [ ] Importing the fixture's `words.json` with its chunks creates exactly the listed cues with the right emphasis words; without chunks the dialog's rules apply.
- [ ] Playback with progressive captions holds 60 fps with zero React commits and no rasterization (raster counter).

**State after:** captions of any common short-form style are native and editable word by word.

---

## Batch 60: Keyframes v2 I: eases, bezier, spring, color and vector keys in the engine

**Goal:** The document and the renderer support every ease, custom bezier curves, springs, color and point values, and keys on crop, size, corners, fills, strokes, shadows, anchors and text size, spacing and color, so motion from CSS, GSAP or After Effects maps to exact keys.

**Spec refs:** §21.9, §6.15, §5.2, §9.4, §10.4, §4, §21.1.

**Build:**
- Model (§21.9): the new ease ids, `bezier` and `spring` on keys, vector values, the new props with their validation per clip kind; field table entries; schema bump with migration and property tests.
- Evaluation: Penner curves, the cubic-bezier solver, springs, vector interpolation; the compositor reads the animated values of the new props for solids, pictures and text (font size from the largest keyed raster, letter spacing from the character atlas, fill as a tint).
- The existing ease selector lists the new eases (a plain grouped list); timeline lanes show keys of the new props.
- INTEROP.md: the ease name table for CSS, GSAP and After Effects.
- `fixtures/interop/keyframes/` (keys written in JSON on every new prop, color holds and linear color fades, GSAP-like eases) with expected frames at sampled frames.
- Manifest keys of Batch 60.

**Do not build yet:** the ease popover with thumbnails, the curve editor, spring fields, stopwatches on the new fields, copying and pasting keys (Batch 61); motion paths (Batch 69).

**Implementation notes:** Port FlashFX-v2 `src/core/easings.ts` (no imports: copy it as `src/core/document/easings.ts` with the port header) and its `cubicBezier` solver; `src/core/keyframeEase.ts` shows the After Effects influence and speed mapping used by the Easy Ease row of the table. Existing projects keep their eases unchanged. Why now: the reels' motion comes from GSAP eases and instant color state changes, which become exact keys instead of dense baked samples. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Each of the 30 Penner eases matches the FlashFX-v2 curve at 101 sample points (unit test); `bezier` (0.68, -0.55, 0.27, 1.55) matches the CSS curve; a spring segment ends exactly on the next key's value.
- [ ] The fixture's coral-to-ink fill changes at the key with a hold ease and fades smoothly with a linear one, identically in preview, export and the CLI render on both backends.
- [ ] Keys on crop, `size.w`, `cornerRadius`, stroke width, shadow blur, anchor, font size, letter spacing and text fill render as the expected frames, and text is never rasterized during playback (raster counter).
- [ ] Projects saved before this batch keep their eases and play unchanged.

**State after:** any motion from a design tool can be stored as exact keys and rendered.

---

## Batch 61: Keyframes v2 II: ease popover, curve editor and key editing

**Goal:** Every new animation capability is editable by hand: a searchable ease popover with curve thumbnails, a custom bezier curve editor, spring parameters, stopwatches on every new animatable field, and copy, paste and reverse of keys.

**Spec refs:** §21.9, §11, §6.15, §2.1, §4, §21.1.

**Build:**
- The ease popover (groups, curve thumbnails, search), the curve editor (two handles, presets, numeric fields, `Copy as CSS`) and the spring fields.
- Stopwatches and keyframe navigators in the Fill, Stroke, Shadow, Corners, Crop, Anchor and Text sections; their timeline lanes editable like the Batch 35 lanes.
- Copy and paste of selected keys (pasted at the playhead with their spacing), `Reverse keys`, `Set ease for selected`.
- Commands, palette entries and keys registered.

**Do not build yet:** motion path editing (Batch 69).

**Implementation notes:** Curve editor drags are gestures (P2): ephemeral state while dragging, one command on release, no React commits. Batch 60's fixture must still render the same. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] The curve editor edits a custom bezier with a live preview, one undo step per gesture, and `Copy as CSS` gives the matching `cubic-bezier(...)`.
- [ ] Turning on the Fill stopwatch on a solid and changing the color at two frames creates color keys that play back as in Batch 60.
- [ ] Three keys copied and pasted at the playhead on another clip keep their spacing; Reverse keys flips their timing; Set ease for selected changes them in one step.
- [ ] Dragging in the curve editor and scrubbing the new lanes cause zero React commits.

**State after:** motion from any design tool maps to editable keys without baking.

---

## Batch 62: Compound clips I: model, rendering and commands

**Goal:** Clips can be grouped into a compound that moves, scales, fades and is reused as one clip, rendered through one cached texture, with its inner audio mixed: the engine for cards with content, scenes and templates.

**Spec refs:** §21.10, §5.2, §6.12, §9.4, §14, §4, §21.1.

**Build:**
- Model (§21.10): `sequences`, the `compound` clip kind, validation (cycles, depth, inner tracks, time bounds) in the app and the field table; schema bump with migration; property tests (random make, break and edit sequences keep the document valid; undo returns to the start).
- Commands: Make compound, Break apart, Make unique, duplicate instance; trim and slip of compound clips; toolbar and palette entries.
- Compositor: nested evaluation into pooled textures, caching of static sequences; inner audio mixed with the compound's gain; export parity.
- `fixtures/interop/compound/` (a card compound with a solid, a text and an image, used twice, one instance nested in another compound, one with an audio clip) with expected frames.
- Manifest keys of Batch 62.

**Do not build yet:** opening a compound to edit inside, the breadcrumb, the Compounds bin and posters (Batch 63); template parameters (Batch 80); blend modes, masks and effects on compound clips (their batches; leave `TODO(batch NN)` hooks).

**Implementation notes:** Port FlashFX-v2 `src/core/precomp.ts` (evaluation) and `src/core/precompose.ts` (the precompose rules). Pool textures follow the sequence size times the preview detail factor and count against the P6 budget. Until Batch 63, the inside of a compound is changed by breaking it apart or in its JSON. Why now: every reel card moves with its content, and each reel scene becomes one compound. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Make compound on a solid, a text and an image gives one compound clip with an identical picture; moving, rotating or scaling it moves all three; undo restores the three clips.
- [ ] Both fixture instances show the same sequence; the compound nested two levels deep renders identically in preview, export and the CLI render; a cycle is refused.
- [ ] A static compound renders once per edit (render counter), and playback of 10 animated compounds holds 60 fps with zero React commits.
- [ ] The compound holding an audio clip plays it with the compound's gain, in playback and export.
- [ ] Break apart puts the inner clips back at their absolute times when the compound has no transform; otherwise the button explains why it is disabled.

**State after:** grouped, reusable layers render natively.

---

## Batch 63: Compound clips II: editing inside, breadcrumb, Compounds bin

**Goal:** Open a compound and edit inside it like the main timeline, with a breadcrumb back, and reuse compounds from the media panel.

**Spec refs:** §21.10, §6.7, §7.2, §11, §12, §18, §4, §21.1.

**Build:**
- `Open compound` (double-click or Enter): the timeline and the canvas switch to the sequence; edits inside are normal commands; the breadcrumb (`Project > Card 3`), Esc and the breadcrumb close it; session state remembers the open path.
- The Compounds bin in the media panel; dragging a sequence adds an instance; compound posters as timeline thumbnails.
- Keys for open and close (free keys, shortcut editor, cheat sheet).

**Do not build yet:** template parameters (Batch 80).

**Implementation notes:** While a compound is open, the canvas shows the sequence at its own size and playback plays the sequence alone; the parent project is not drawn behind it. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] Opening the fixture's card compound shows its inner tracks with the breadcrumb; editing the text inside updates both instances; Esc returns to the project with the playhead where it was.
- [ ] Dragging a sequence from the Compounds bin adds an instance at the drop point; compound clips show their poster.
- [ ] Playback and scrubbing inside a compound cause zero React commits; undo and redo work across opening and closing.

**State after:** nested designs are native and editable at every level.

---

## Batch 64: Alpha video and image sequences

**Goal:** Transparent animated overlays from any renderer play natively: VP8 and VP9 WebM with alpha, and numbered PNG or WebP image sequences.

**Spec refs:** §21.11, §9.1, §9.2, §9.3, §9.5, §9.6, §4, §21.1.

**Build:**
- WebM alpha (§21.11): BlockAdditions in the WebM demuxer, the second decoder, frame pairing, the alpha texture and its sampling in the compositor (both backends); the probe sets `alpha`.
- Proxies for alpha media per §21.11.
- Image sequences: pattern detection on folders, the import question, the media record (field table included), decoding on demand in workers, frame cache, lookahead and scrub integration, thumbnails.
- INTEROP.md: alpha WebM and image sequence rules with the ffmpeg commands.
- `fixtures/interop/alpha/` (a small VP9 alpha WebM under 300 KB and a 30-frame PNG sequence over a colored solid) with expected frames.
- Manifest keys of Batch 64.

**Do not build yet:** alpha export (Batch 81).

**Implementation notes:** Chrome's `VideoDecoder` decodes VP9 but ignores the alpha stream, which sits in BlockAdditions (BlockAddID 1) as a separate VP9 bitstream: feed it to a second decoder with the same configuration, pair frames by timestamp, and sample the alpha frame's luma as the alpha. Image sequence frames use the video frame cache keys (media id, level of detail, frame time). Why now: the reels' 3D hook objects and end-card marks become transparent clips instead of baked plates. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] A VP9 alpha WebM over a colored background shows its transparency exactly (expected frames), and scrubs and plays at 60 fps at 1080x1920.
- [ ] A 300-frame PNG sequence imports as one media item at the project fps, plays at 60 fps after warmup, scrubs with the P8 behavior, and shows thumbnails.
- [ ] Both render the same in preview, export and the CLI render, on both backends.
- [ ] An AV1 or HEVC file with alpha imports as opaque with a toast explaining why; a ProRes file is refused with the conversion hint.

**State after:** anything a 3D or motion renderer outputs can sit on the timeline as a transparent clip.

---

## Batch 65: Vector shapes I: model and renderer

**Goal:** Native vector graphics in the engine: paths, polygons, stars, arrows and arcs with fills, strokes, caps, joins and dashes, and animated trim paths for lines that draw themselves and gauges.

**Spec refs:** §21.12, §21.7, §21.9, §5.2, §9.4, §4, §21.1.

**Build:**
- Model (§21.12): the `shape` clip kind, paths, primitives, validation of path data in the app and the field table; schema bump with migration and property tests.
- The path parser (the SVG path grammar, arcs converted to cubics), flattening with a screen-scale tolerance, exact fills, stroke geometry (caps, joins, miter limit, dashes, trims), geometry caching and worker offload, the primitive generators.
- Keyframe props of shapes (§21.12).
- Shape clips move, scale and rotate with the existing gizmo.
- `fixtures/interop/shapes/` (written in JSON: a checkmark drawing on, a gauge arc going from 0 to 75 percent, a star, a dashed arrow, nonzero and evenodd fills) with expected frames.
- Manifest keys of Batch 65.

**Do not build yet:** SVG import, the `+ Shape` dropdown and the Shape section (Batch 66); path point editing, boolean operations and shape modifiers (later).

**Implementation notes:** Port from FlashFX-v2 `src/engine/pathTessellation.ts`, `src/core/strokeOutline.ts`, `src/core/pathOps.ts` and the PATH_SHADER of `src/engine/renderer.ts` (about line 2293). Stencil-then-cover is exact for both fill rules and needs no dependency: prefer it; if earcut is used, add it with a Dependencies line. Edges must match the anti-aliasing of solids. Why now: the reels' gauges, arrows, checkmarks and drawn strike-throughs become native. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] The checkmark draws on with its trim end going from 0 to 1 over 10 frames, identically in preview, export and the CLI render on both backends.
- [ ] The gauge arc animates its end from 0 to 270 degrees with round caps; the dashed arrow's dash offset animates; the nonzero and evenodd fills match their expected frames.
- [ ] 50 animated shapes play at 60 fps with zero React commits, and geometry is rebuilt only when a path or style changes (counter).

**State after:** vector graphics render natively and animate with trim paths.

---

## Batch 66: Vector shapes II: SVG import and the shape tools

**Goal:** SVG files become editable shapes, and shapes are created and styled from the toolbar and the properties panel.

**Spec refs:** §21.12, §9.1, §11, §12, §6.1, §4, §21.1.

**Build:**
- SVG import as shapes (the §21.12 subset), with the fallback to an image clip and its message; `Import as shapes` on SVG media and in the drop choice.
- The `+ Shape` toolbar dropdown (Rectangle, Ellipse, Polygon, Star, Arrow, Arc, Line) creating a shape at the playhead.
- The Shape section: per-path fill, stroke and trim with stopwatches; the primitive's parameters.
- `fixtures/interop/svg/` (icon SVGs with paths, transforms and gradients, and one with a filter) with expected frames.
- Manifest key `vector.svgImport`.

**Do not build yet:** path point editing on the canvas (later).

**Implementation notes:** Check each imported icon against the browser's own drawing of the same SVG (rendered as an image in the same headless page). The Shape section follows the patterns of the Batch 34 Solid section. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] Importing each fixture icon gives one shape clip whose render matches the browser's drawing of the SVG (SSIM at least 0.98).
- [ ] The SVG with a filter stays an image clip, with a message naming the filter.
- [ ] `+ Shape` > Star creates a star at the playhead; changing its points and inner radius in the Shape section is one undo step each and previews live.
- [ ] Turning on the trim stopwatch and keying the end draws the shape on in playback and export.

**State after:** icons, arrows, gauges and line art are native, editable vector layers.

---

## Batch 67: Text v2 I: styled spans

**Goal:** Text clips can mix styles inside one clip: a colored, bold, italic, underlined, struck or highlighted word, edited inline.

**Spec refs:** §21.13, §10.1, §7.7, §11, §4, §21.1.

**Build:**
- Model (§21.13, spans): validation in the app and the field table, span maintenance on edits; schema bump with migration and property tests.
- Text engine: layout with style runs, an atlas per run, underline, strike and highlight boxes, cached (P11).
- Inline editing: the format bar (Bold, Italic, Color, Highlight, Clear), `Mod+B`, `Mod+I`.
- `fixtures/interop/spans/` with expected frames.
- Manifest key `text.spans`.

**Do not build yet:** counters, animators and the new presets (Batch 68).

**Implementation notes:** Spans are content: presets never store them, and applying a preset keeps them. Typing inside a span extends it; deleting shrinks or removes it; undo restores exactly. Word animations (`wordPop`, `wordFade`) move each word with its span's style. Why now: colored and bold emphasis words inside reel card text become native. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Typing `SAVE 3 HOURS` and coloring `3 HOURS` coral gives one clip with one span; editing text before the span keeps it on the same words; undo works per edit.
- [ ] Bold, italic, underline, strike and highlight spans render as their expected frames in preview, export and the CLI render.
- [ ] Applying a preset to a clip with spans keeps the spans; `wordPop` still moves each word with its span style.
- [ ] Editing a span-styled title rasterizes only that layer (P11), and playback rasterizes nothing.

**State after:** rich text inside one clip is native.

---

## Batch 68: Text v2 II: number counters and range-selector animators

**Goal:** Numbers that count, per-character, per-word or per-line animation with range selectors, and a larger preset set.

**Spec refs:** §21.13, §10.3, §10.4, §11, §4, §21.1.

**Build:**
- Counters (§21.13): model, glyph-atlas rendering, the Counter fields in the Text section.
- Animators (§21.13): model, evaluation (selector shapes, order, random seed) on the GPU, the Animators section (add, unit, selector fields with stopwatches, props).
- The new In and Out presets of §21.13.
- Field table entries; schema bump with migration and property tests.
- `fixtures/interop/kinetic/` (a counter, an animator reveal, each new preset) with expected frames.
- Manifest keys `text.counter`, `text.animators` and the new `text.anims`.

**Do not build yet:** text on a path (later).

**Implementation notes:** Port FlashFX-v2 `src/text/rangeSelector.ts` (no imports), `src/core/textAnimator.ts` (`splitTextUnits`, `accumulateGlyphDeltas`), `src/core/textAnimatorPresets.ts` and `src/core/textDecode.ts`. P11 is binding: per-unit transforms, opacity, blur and fill tint on the GPU; counters and `decode` use glyph atlases; nothing is rasterized per frame. Why now: the reels' giant counting numbers become native. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] A counter from 0 to 85.6 with one decimal and the suffix `%` over 30 frames with `easeOut` shows the right value at every frame, without rasterizing during playback.
- [ ] An animator with unit char, shape rampUp, offset keyed from 0 to 1 and props y +40 and opacity 0 reveals the characters left to right; random order with a seed stays the same across reloads.
- [ ] Every new preset previews from its chip and matches its expected frames; the animations of older projects are unchanged.
- [ ] Export and the CLI render match the preview.

**State after:** kinetic typography is native.

---

## Batch 69: Parenting, null clips and motion paths

**Goal:** Layers follow a parent or an invisible null controller, and positions move along curved paths edited on the canvas, with auto-orient.

**Spec refs:** §21.14, §21.9, §7.2, §7.3, §11, §5.2, §4, §21.1.

**Build:**
- Model (§21.14): `parentId`, the `null` clip kind, the `transform.position` vector prop with spatial tangents, `autoOrient`; field table entries; schema bump with migration, validation (cycles, same sequence) and property tests.
- Evaluation: world transforms through the parent chain (memoized per frame), parents clamped to their range, arc-length path evaluation, auto-orient.
- Commands: set and clear a parent keeping the world placement, convert x and y keys to a motion path and back.
- Canvas: the path overlay with key points and tangent handles (gestures, P2).
- UI: the Parent picker, Motion path and Auto-orient toggles, `+ Null`.
- `fixtures/interop/rig/` (a null with children, a text parented to a rotating card, a curved motion path) with expected frames.
- Manifest keys of Batch 69.

**Do not build yet:** expressions (later).

**Implementation notes:** Port FlashFX-v2 `src/core/positionPath.ts` (`positionOnSegment`, `segmentArcLength`, `autoSpatialTangents`), `src/core/motionPath.ts`, and the parent resolution of `src/core/sceneGraph.ts`. Evaluate each clip's parent chain once per frame so 100 parented layers stay cheap. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] A text parented to a rotating card follows it exactly; clearing the parent leaves the text where it was at the playhead.
- [ ] Rotating a null with five children rotates them around the null's anchor; nulls never appear in exports.
- [ ] A position animated along a curved path with dragged tangents follows the drawn curve at constant speed with linear eases; auto-orient turns the clip along the tangent.
- [ ] 100 parented animated layers play at 60 fps with zero React commits; export and the CLI render match.

**State after:** hierarchical rigs and curved motion are native.

---

## Batch 70: 2.5D layers: 3D rotation and perspective

**Goal:** Cards that flip, tilt and fly in perspective: X and Y rotation and depth on any visual clip, with perspective per project or compound and optional depth sorting.

**Spec refs:** §21.15, §21.10, §7.3, §9.4, §11, §4, §21.1.

**Build:**
- Model (§21.15): the 3D transform fields, perspective, depth sort, backface; field table entries; schema bump with migration, validation and property tests.
- Rendering: projected quads with perspective-correct texturing in both backends; depth sorting inside compounds; hit testing and the gizmo on the projected quad.
- Gizmo X and Y rotation handles, Transform section fields, keyframe props.
- `fixtures/interop/deck/` (six cards flying into a grid in perspective, their rotations settling to 0) with expected frames.
- Manifest key of Batch 70.

**Do not build yet:** moving cameras, lights, depth of field, 3D models.

**Implementation notes:** Port the projection math of FlashFX-v2 `src/core/camera3d.ts` and `src/core/mat4.ts`; keep the draw list two-dimensional by projecting each quad to a 3x3 homography on the CPU and interpolating UV over w in the shaders. Why now: the reels' deck-of-cards set piece becomes native. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] A card rotated 60 degrees on Y with perspective 1600 matches its expected frame and a CSS reference with the same perspective (SSIM at least 0.98).
- [ ] The deck fixture plays at 60 fps and renders identically in export and the CLI render on both backends.
- [ ] Depth sort orders layers by z inside a compound; with it off, track order wins.
- [ ] Clicking and dragging a rotated card hits its projected shape, not its flat box.

**State after:** perspective motion is native; 2.5D set pieces need no baking.

---

## Batch 71: Transitions v2

**Goal:** The transitions short-form editors expect: slide, push, wipe, iris, zoom, whip, blur dissolve, glitch and flash, with direction, softness and easing.

**Spec refs:** §21.16, §6.15, §9.4, §11, §4, §21.1.

**Build:**
- Model (§21.16): the new kinds and their parameters (an absent `ease` keeps the v1 linear mix); field table entries; schema bump with migration, validation and property tests.
- Transition shader kinds in both backends.
- Grouped chips with hover previews, direction buttons, and the defaults of §21.16; audio crossfades unchanged.
- `fixtures/interop/transitions/` (every kind, checked at its midpoint) with expected frames.
- Manifest keys of Batch 71.

**Do not build yet:** custom transition presets made from effects (later).

**Implementation notes:** Port FlashFX-v2 `src/core/effects/glitchGpu.ts` for the glitch and the directional blur of `src/core/effects/blurFxPack.ts` for the whip (push plus a motion blur along the direction, peaking at the cut). This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Each new kind matches its midpoint expected frame in preview, export and the CLI render, on both backends.
- [ ] A 12-frame push left with `easeInOut` moves both clips by exactly the frame width over the transition; a cross dissolve saved before this batch mixes exactly as before.
- [ ] Changing the direction or softness is one undo step and previews live; playback through 10 transitions holds 60 fps.

**State after:** every common cut style is one click away.

---

## Batch 72: Blend modes and track mattes

**Goal:** Layers blend as in design tools (multiply, screen, overlay and 10 more) and can show through another layer's alpha or luma: video inside text, reveal wipes, light leaks.

**Spec refs:** §21.17, §9.4, §11, §4, §21.1.

**Build:**
- Model (§21.17): `blend`, `matte`, `matteOnly`; field table entries; schema bump with migration, validation and property tests.
- Renderer: blend states for the hardware modes, a backdrop copy for the others (only when such a mode is visible), the matte pass, in both backends.
- The Compositing section.
- `fixtures/interop/compositing/` (a multiply texture over paper, a screen light leak, video inside a text matte, an inverted luma matte) with expected frames.
- Manifest keys of Batch 72.

**Do not build yet:** masks (Batch 73).

**Implementation notes:** Port the formulas of FlashFX-v2 `src/core/effects/blendModes.ts` (and turn `scripts/verify-blend-modes.mjs` into unit tests), `src/core/trackMatte.ts`, and the MATTE_SHADER of `src/engine/renderer.ts` (about line 2825). This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Each of the 13 modes matches its reference formula on a test chart (unit tests of the CPU formulas and an expected frame per mode).
- [ ] Video inside a text matte (alpha) and an inverted luma matte render as expected; a `matteOnly` matte is not drawn.
- [ ] A frame without non-hardware modes makes no backdrop copy (counter); playback with two screen layers over video holds 60 fps.
- [ ] Export and the CLI render match the preview on both backends.

**State after:** the compositing tricks of design tools are native.

---

## Batch 73: Masks

**Goal:** Show only part of a layer: rectangle, ellipse and path masks with feather, expansion, opacity, modes and inversion, animated and edited on the canvas.

**Spec refs:** §21.18, §21.9, §7.2, §7.3, §9.4, §11, §4, §21.1.

**Build:**
- Model (§21.18): masks; field table entries; schema bump with migration, validation and property tests.
- Coverage rendering: masks combined in order, feather, expansion, cached while static, in both backends.
- Keyframe props, including path morphs at equal point counts.
- Canvas mask mode (handles, path points, feather handle) and the Masks section; the `Wipe in` and `Circle reveal` presets.
- `fixtures/interop/masks/` with expected frames.
- Manifest key of Batch 73.

**Do not build yet:** mask tracking (later).

**Implementation notes:** Port FlashFX-v2 `src/core/maskPath.ts`, `src/core/maskCoverage.ts`, `src/engine/maskWgsl.ts` (with a GLSL twin) and the reveal presets of `src/core/maskReveal.ts`. Mask editing is a gesture: ephemeral state while dragging, one command on release, no React commits. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] An ellipse mask with feather 40 on a video matches its expected frame; subtract and intersect combine as specified; invert works.
- [ ] A rectangle mask animating its width reveals a title from left to right; a path mask morphs between two shapes with equal point counts.
- [ ] Editing a mask on the canvas is one undo step per gesture with zero React commits while dragging.
- [ ] Export and the CLI render match on both backends; 20 masked layers play at 60 fps.

**State after:** reveals, spotlights and cutouts are native.

---

## Batch 74: Effects I: effect stack, blur, glow, shadow and outline

**Goal:** An ordered, animatable effect stack on any visual clip, starting with Gaussian and directional blur, glow, and drop shadows and outlines shaped by alpha.

**Spec refs:** §21.19, §21.9, §9.4, §11, §4, §21.1.

**Build:**
- Model (§21.19): effects; validation in the app and the field table; schema bump with migration and property tests.
- The effect registry, the render-to-texture path with padding, and caching of static results (P6).
- Effects `gaussianBlur`, `directionalBlur`, `glow`, `dropShadow` and `outline`, in both backends; keyframe props of their params.
- The Effects section (add menu, drag to reorder, enable toggles, stopwatches).
- `fixtures/interop/effects-1/` with expected frames per effect at default and extreme settings.
- Manifest `effects` list.

**Do not build yet:** color adjustments, stylize effects, keys, LUTs and looks (Batch 75); distortion, glitch and adjustment clips (Batch 76).

**Implementation notes:** Port, as references for parameters and ranges, FlashFX-v2 `src/core/effects/effectRegistry.ts` (the editor uses string types, not FlashFX's numeric ids), and the passes GLOW_SHADER (about line 2445), BLUR_EFFECT_SHADER (about line 2673) and SHADOW_SHADER (about line 2574) of `src/engine/renderer.ts`, plus `src/core/effects/glowParams.ts` and `blurFxPack.ts`. Blurs are separable and run at the preview detail factor. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Each effect matches its expected frames at default and extreme settings, on both backends, in preview, export and the CLI render.
- [ ] A glow on a text with its intensity keyed from 0 to 1 animates smoothly; disabling the effect is one undo step; swapping two effects changes the result as expected.
- [ ] An alpha drop shadow follows the shape of a transparent PNG, not its box; the outline effect draws a 6 px stroke around it.
- [ ] Two blur effects on a 1080x1920 video play at 60 fps on this machine (or the measured fps is recorded with the cost of each effect).

**State after:** the effect stack exists, with the blurs, glows and alpha shadows creators use most.

---

## Batch 75: Effects II: color, stylize, keys, LUTs and looks

**Goal:** Color adjustments, vignette, sharpen and grain, chroma and luma keys, LUT color looks, and saved effect stacks (looks) applied in one click.

**Spec refs:** §21.19, §9.4, §11, §12, §4, §21.1.

**Build:**
- Effects `colorAdjust`, `vignette`, `sharpen`, `grain`, `chromaKey`, `lumaKey` and `lut` (`.cube` import, copied to `luts/`), in both backends.
- Looks: save an effect stack by name in the global store; apply it in one click.
- `fixtures/interop/effects-2/` (each effect, a green screen key, a LUT) with expected frames.
- Manifest `effects` list.

**Do not build yet:** distortion, glitch and adjustment clips (Batch 76); curves, wheels and scopes (out of scope).

**Implementation notes:** Port FlashFX-v2 `src/core/effects/hsl.ts`, `vignette.ts`, `lut.ts`, `src/engine/chroma-key/` and the color cases of `imageShaderSource` in `src/engine/renderer.ts` (about line 2247). This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Each effect matches its expected frames on both backends, in preview, export and the CLI render.
- [ ] The chroma key removes the fixture's green screen with spill suppression (expected frame).
- [ ] A `.cube` LUT imports, applies at intensity 0.5 matching its reference, and is copied into the project.
- [ ] A saved look applies to another clip in one click and is one undo step.

**State after:** color looks and keying are native.

---

## Batch 76: Effects III and adjustment clips: distortion, glitch, stylize

**Goal:** Adjustment clips that apply effects to everything below them, plus RGB split, pixelate, mirror, wave, glitch, posterize and invert.

**Spec refs:** §21.19, §21.20, §9.4, §11, §4, §21.1.

**Build:**
- The `adjustment` clip kind (§21.20) with effects, opacity, fades and masks; validation in the app and the field table; schema bump with migration and property tests.
- Effects `rgbSplit`, `pixelate`, `mirror`, `wave`, `glitch`, `posterize` and `invert`, in both backends.
- `+ Adjustment` in the toolbar overflow.
- `fixtures/interop/effects-3/` (an adjustment clip turning everything below black and white inside an ellipse mask, each new effect) with expected frames.
- Manifest keys of Batch 76.

**Do not build yet:** anything listed as later in Part B of `docs/PLAN_V1_2.md`.

**Implementation notes:** Port FlashFX-v2 `src/core/effects/adjustmentComposite.ts`, `adjustmentCoverage.ts`, `glitchGpu.ts` and `glitchPresets.ts`. The composite below an adjustment clip comes from a pooled texture made only during its range. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] An adjustment clip with saturation 0 turns everything below it black and white during its range only, and only inside its ellipse mask when it has one.
- [ ] Each new effect matches its expected frames on both backends; export and the CLI render match.
- [ ] Playback across an adjustment clip with two effects holds 60 fps on this machine (or the measured fps is recorded).

**State after:** global looks and the stylized effects of short-form edits are native.

---

## Batch 77: Audio v2: track mixer, pan, loudness normalization, beat markers

**Goal:** Mix like a short-form pro: track gain and pan, clip pan, loudness meters in LUFS, exports normalized to a loudness target with a true-peak limiter, beat markers on music, and fade curves.

**Spec refs:** §21.21, §14, §16, §6.13, §4, §21.1.

**Build:**
- Model (§21.21): track gain and pan, `Volume.pan` with its keyframe prop, `settings.loudness`, fade curves; field table entries; schema bump with migration, validation and property tests.
- Audio graph: track gain and pan nodes, clip pan; the same in the offline mixdown.
- LUFS and true-peak meters (AudioWorklet); export loudness with two passes and the limiter; the Reels, TikTok and Shorts presets set the target.
- Beat detection in the analysis worker, turning into markers.
- The mixer popover in the track header.
- `fixtures/interop/audio/` (a mix at -20 LUFS, a click track at 120 BPM, panned tracks).
- Manifest keys of Batch 77.

**Do not build yet:** audio effects such as EQ, compression and reverb (later).

**Implementation notes:** Port FlashFX-v2 `src/core/beatDetection.ts` and use `src/codec/audioMixer.ts` as a reference for the mixdown. Loudness follows ITU-R BS.1770-4 (K-weighting, 400 ms blocks, gates at -70 LUFS absolute and -10 LU relative); true peak uses 4x oversampling. Meters draw through the scheduler with no React commits. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Exporting the -20 LUFS fixture with a -14 LUFS target gives -14 LUFS (within 0.5 LU) integrated and a true peak at or below -1 dBTP, checked by the app's meter and by a unit test on the PCM.
- [ ] Track gain -6 dB and pan -1 change the mix as expected in playback and export.
- [ ] Detect beats on the 120 BPM click track puts a marker within 1 frame of every beat, and clips snap to them.
- [ ] Meters update at 60 fps with zero React commits.

**State after:** mixes are balanced and upload-ready without leaving the editor.

---

## Batch 78: Time remapping, reverse and frame blending

**Goal:** Speed ramps drawn as curves, one-click ramp presets, reversed clips, and smooth slow motion with frame blending.

**Spec refs:** §21.22, §21.9, §6.10, §8, §9.2, §14, §4, §21.1.

**Build:**
- Model (§21.22): `timeRemap`, `reverse`, `frameBlend`; field table entries; schema bump with migration, validation and property tests.
- Source time evaluation through remap curves; decoder lookahead (P7) on remapped times; reverse playback from the frame cache and proxies; reversed audio from PCM; frame blending in the compositor.
- The remap lane with its speed graph and draggable keys, the ramp presets, the muted-audio badge.
- `fixtures/interop/time/` with expected frames.
- Manifest keys of Batch 78.

**Do not build yet:** optical-flow interpolation (later).

**Implementation notes:** Port FlashFX-v2 `src/core/timeRemap.ts` (no imports). Reverse decoding works a GOP at a time: decode forward into the frame cache, then serve backward; with proxies (keyframe every 15 frames) it stays smooth. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] A Hero ramp (fast, slow, fast) shows the expected source frames at sampled timeline frames (unit test) and plays smoothly on proxy.
- [ ] A reversed 4K clip plays backward at 60 fps on proxy and exports correctly, with its audio reversed.
- [ ] Frame blending at 25 percent speed shows mixed frames (expected frame) and is off by default.
- [ ] Export and the CLI render match the preview.

**State after:** the speed effects of short-form edits are native.

---

## Batch 79: Lottie clips

**Goal:** Lottie animations (stickers, animated icons, emoji) import as clips that stay sharp at any size, retime, loop and change colors.

**Spec refs:** §21.23, §9.1, §9.3, §12, §4, §21.1.

**Build:**
- The `lottie` media kind (sniffing `.json`, `.lottie` archives) and its probe (size, frame rate, frames).
- The worker renderer feeding the frame cache at the on-screen scale; thumbnails.
- The `lottie` clip kind (in and out, speed, loop, color overrides); field table entries; schema bump with migration, validation and property tests.
- `fixtures/interop/lottie/` (three Lottie files with their licenses) with expected frames.
- Manifest keys of Batch 79.

**Do not build yet:** editing the inside of a Lottie animation beyond color overrides (later).

**Implementation notes:** Add `@lottiefiles/dotlottie-web` (MIT) with a Dependencies line and run it in a worker with OffscreenCanvas; deterministic frame seeking is required for export. If it cannot run in a worker, port FlashFX-v2 `src/engine/lottieRenderer.ts` (a Canvas2D subset) and list what it does not support. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] The three fixture files play at 60 fps, scrub with the P8 behavior, and render identically in export and the CLI render.
- [ ] A color override replaces a color in the animation; loop and speed work; scaled to 300 percent the animation stays sharp.
- [ ] A `.lottie` archive imports; an invalid file is refused with a message.

**State after:** the large library of Lottie motion is usable directly.

---

## Batch 80: Templates: compound clips with parameters

**Goal:** Any compound becomes a reusable template with named parameters (texts, colors, numbers, media, fonts, toggles); instances are inserted in one click, edited in a simple form, and filled from data.

**Spec refs:** §21.24, §21.10, §10.3, §11, §12, §4, §21.1.

**Build:**
- Model (§21.24): sequence parameters and instance values; field table entries; schema bump with migration, validation of targets and property tests.
- Evaluation with each instance's values (render caches keyed on them).
- `Expose as parameter`, the parameter editor, `Save as template`, the template library (global store and library folder, media copied) and the Templates section of the Presets tab.
- CLI `fill`.
- `fixtures/interop/templates/` (a paper card template with title, body and accent color parameters, three instances, a `values.json`) with expected frames.
- Manifest key of Batch 80.

**Do not build yet:** a public template marketplace or sharing service (out of scope).

**Implementation notes:** Instances share one sequence; parameter values override their target fields at evaluation time, never by copying the sequence. A template saved in one project carries its media and fonts into another. Why now: the reels autopilot can map its motion-library components (cards, stamps, DM notifications) to templates, so a reel's card is edited through its fields. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`, and extend the property-based tests of Batch 47 to the new fields.

**Acceptance:**
- [ ] Exposing a card compound's title text and accent color creates a template; two instances with different values show two different cards from one sequence.
- [ ] Editing the template's sequence updates every instance and keeps each instance's values.
- [ ] `npm run cli -- fill fixtures/interop/templates fixtures/interop/templates/values.json` sets the named instances' parameters, and the CLI render matches the expected frames.
- [ ] A template saved in one project inserts into another with its media.

**State after:** designs become reusable components edited through simple fields.

---

## Batch 81: Export v2: WebM with alpha, image sequences, GIF, stems, collect project

**Goal:** Export for every destination: WebM (with transparency), PNG sequences, GIF previews, per-track audio stems, and self-contained project folders or zips.

**Spec refs:** §21.25, §16, §14, §15, §4, §21.1.

**Build:**
- The WebM muxer, VP9 and AV1 with Opus, the `Transparent background` option.
- PNG sequence and GIF writers (`gifenc`) in the export worker, with their options.
- Audio stems.
- Collect project and the store-only zip writer.
- The new presets; the CLI render's `--format`.
- Checks on `fixtures/interop/basic/` and `fixtures/interop/alpha/`.
- Manifest keys of Batch 81.

**Do not build yet:** ProRes or other formats WebCodecs cannot encode.

**Implementation notes:** Add `gifenc` (MIT) with a Dependencies line; for WebM either add `webm-muxer` (MIT, the same author as `mp4-muxer`) or write a minimal EBML writer in `src/export/webm/`, and log the choice. Alpha needs `VideoEncoder` support for `alpha: "keep"`; when it is missing, the option is disabled with the reason. This batch carries the post-v1 rules itself (§21.1): measure the §4 budgets it touches, follow `DESIGN_SYSTEM.md` exactly, register every action in the `CommandRegistry`.

**Acceptance:**
- [ ] A transparent WebM export of a title plays with alpha in Chrome and imports back into the editor (Batch 64) with the same pixels (SSIM at least 0.98).
- [ ] A PNG sequence export writes numbered frames with alpha; a GIF export at 15 fps and 540 px stays within 20 percent of its size estimate.
- [ ] Stems export one WAV per audio track, and their sum equals the mixdown (null test below -60 dB).
- [ ] Collect project copies linked media so the project opens from another folder with nothing missing; the zip opens in Windows Explorer.

**State after:** every output format a creator needs.

---

## Batch 82: v1.2 close-out: full interop fixture, capability audit, documentation, release

**Goal:** Prove the whole contract end to end and ship v1.2.0: one external project that uses every capability, an audit that every manifest key is announced only when tested, current documentation and a tagged release.

**Spec refs:** §21, §0, §4, §16.

**Build:**
- `fixtures/interop/full/`: one project using every clip kind, style, ease, effect, transition, mask, blend mode, matte, compound, template, Lottie clip, alpha medium and caption feature, with expected frames on both backends.
- A capability audit test: every true manifest key maps to at least one fixture field that uses it; a key without coverage fails.
- `docs/INTEROP.md` complete (every shape, example, CLI command and convention, the fallback levels and stand-ins), `docs/user-guide/` current, README updated.
- A performance pass on the full fixture and the P14 budgets; Known issues (v1.2.0) in `PROGRESS.md`; `docs/BACKLOG.md` updated.
- `appVersion` 1.2.0, zero `TODO(batch` comments in `src/`, tag `v1.2.0`.

**Do not build yet:** anything listed as later in `docs/PLAN_V1_2.md` Part B.

**Implementation notes:** This is the release batch: fix what the full fixture reveals rather than adding features. It carries the post-v1 rules itself (§21.1): measure the §4 budgets, follow `DESIGN_SYSTEM.md` exactly, and keep every action registered in the `CommandRegistry`.

**Acceptance:**
- [ ] `npm run cli -- validate fixtures/interop/full` passes, and `npm run test:render` passes every fixture on both backends.
- [ ] The capability audit passes, and setting any key to true without a fixture that uses it makes it fail.
- [ ] Opening, playing and exporting the full fixture meets the P14 budgets (or the deviations are recorded).
- [ ] Every INTEROP.md example validates in the doc test, and the user guide documents every v1.2 feature.
- [ ] `appVersion` is 1.2.0, the tag exists, and no `TODO(batch` comment remains.

**State after:** v1.2 shipped: a general-purpose short-form editor that other tools can target with confidence.
<!-- END BATCHES -->

---

# Part F: Other edits

## F.1 The Phases line of `docs/BATCHES.md`

Replace the whole line that starts with `Phases:` with:

```
Phases: A Foundations (01-06), B Timeline and playback (07-20), C Canvas editing (21-24), D Properties and clip operations (25-27), E Text (28-33), F Graphics, keyframes, transitions, audio (34-38), G Workflow (39-44), H Quality and release (45-50), I Extensions after v1 (51-53: font library, preset bar, caption styles per cue), J Interop (54-57: manifest and strict validator, normalize, open links and stand-ins, headless render), K Native looks (58-68: shape styles, captions v2, keyframes v2, compound clips, alpha media, vector shapes, text v2), L Motion and compositing (69-76: parenting, 2.5D, transitions v2, blend modes and mattes, masks, effects, adjustment clips), M Audio, time, formats and release (77-82: audio v2, time remapping, Lottie, templates, export v2, v1.2 close-out). Batches 33, 48 and 49 are optional and can be skipped with a note.
```

## F.2 A pointer in §1.3 of `docs/EDITOR_SPEC.md`

Add this bullet as the last item of the §1.3 list:

```
- From Batch 54, §21 brings some of these into scope for the batches it names (compound clips, masks, track mattes, blend modes, adjustment clips, effects with basic color adjustment and LUTs, 2.5D layer rotation, a project command line) and lists what stays out.
```

## F.3 A note in `docs/PROGRESS.md`

Add this line at the end of the `## Global deviations` section (fill in the FlashFX-v2 commit found locally):

```
- Plan v1.2 (2026-11-01): `docs/PLAN_V1_2.md` added spec §21 to `docs/EDITOR_SPEC.md` and Batches 54-82 to `docs/BATCHES.md`; §21 amends §1.3 and §10.1 for those batches. Port source: `../FlashFX-v2` at <commit> (the plan was written against fc934bb).
```

## F.4 The runner's default range in `scripts/run-batches.sh`

The runner stops at Batch 50 unless told otherwise, and Batch 53 is already done, so without a change it would end at once. Replace the line `UNTIL=50` with these three lines, so the default is always the last batch in the plan:

```
# Default: the last batch in docs/BATCHES.md.
UNTIL="$(grep -oE '^## Batch [0-9]+' docs/BATCHES.md | tail -1 | grep -oE '[0-9]+$')"
UNTIL=$((10#${UNTIL:-50}))
```

and change the usage comment on line 2 to `# Unattended batch runner. Usage: scripts/run-batches.sh [--until N] (default: the last batch in docs/BATCHES.md)`.

## F.5 Other tools in `CLAUDE.md`

Add this bullet to the `## Workflow` list of `CLAUDE.md`, right after the bullet about port 5300:

```
- Port 5310 and the folder next to this repo named like it with `-stable` added (for example `FlashFXeditor-stable`) belong to the reels autopilot, which serves and runs a stable copy of this editor from there, including headless Chrome renders started by its CLI. Never stop, use or change them; stop only processes your own sessions started.
```
