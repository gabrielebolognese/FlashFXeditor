# Writing projects for the Shorts Editor (INTEROP)

This is the contract for any tool that writes a project the editor opens: a folder with a `project.json`, its media and fonts. The format is described in one table (`src/core/document/schema.ts`); the strict validator, the JSON Schema and the field reference below all come from it, so they never disagree.

Every JSON block in this file tagged `json <Type>` is checked by a test with the strict validator (`json Project` as a whole project, the others against the object of that name in the field reference). A block tagged `jsonc` is only an excerpt.

## 1. Workflow for a generator

1. Read the manifest (`capabilities.json` at the repo root, or `npm run cli -- capabilities`): it lists what this build supports. Write `schemaVersion` exactly as listed and use only what the lists name. A key that is `false` or absent is unsupported.
2. Write the folder (section 3).
3. Check it: `npm run cli -- validate <folder>` (exit 0 valid, 1 invalid, 2 usage error; `--json` prints `{ ok, schemaVersion, errors: [{ path, message }], warnings: [{ path, message }], standIns }`). It checks every field against the table, the document invariants (section 5) and the files.
4. Open it in the editor: from the start screen (Open project), or with a link (section 7.1).

Use a copy of the editor at an accepted `batch-NN: review` commit for this, not the working folder of the editor, which can be in the middle of a change.

Other commands: `npm run cli -- info <folder>` (duration, tracks, clips by kind, stand-ins, missing media and, for each media file, the facts its header gives), `npm run cli -- schema` (a JSON Schema, draft 2020-12, of `project.json`) and `npm run cli -- normalize <folder> [--write]` (completes a sparse project, section 4.1; manifest key `cli.normalize`).

`validate` also reads the header of every media file (MP4, MOV, M4A, WebM, WAV, MP3, Ogg, PNG, JPEG, WebP, GIF, SVG) and compares it with the record: a `durationUs` that differs by more than one frame, or a `width` or `height` that differs, is an error naming both values; a smaller duration difference, another fact that differs, or a file whose header cannot be read is a warning (an unreadable file is left for the app's repair on open).

## 2. Manifest

`capabilities.json` is generated from the model constants of the build (`npm run capabilities`), so its lists are the ones the editor uses. The keys this batch turns on:

```jsonc
{
  "manifestVersion": 1,
  "schemaVersion": 4,
  "cli": { "validate": true, "info": true, "normalize": true, "render": true, "compare": true },
  "interop": { "openLink": true, "externalReload": true, "repairOnOpen": true, "fallbackOf": true, "generatorMeta": true }
}
```

`manifestVersion` changes only when a key changes meaning; new keys do not change it.

## 3. Folder layout

```text
my-project/
  project.json          the document (section 4)
  media/                media files; every media item's file.relPath points inside the folder
  fonts/
    fonts.json          font manifest (section 8)
    <font files>
  FALLBACKS.md          optional, shown read-only in the editor: the list of baked layers
  OPEN.txt              optional, shown read-only in the editor
```

Paths are relative to the project folder, use `/` and never contain `..`.

## 4. The document

`project.json` is plain JSON. Rules that hold everywhere:

- **Time.** Timeline positions and durations are integer frames at the project frame rate (`settings.fps`, a fraction: 30 is `{ "num": 30, "den": 1 }`, 29.97 is `{ "num": 30000, "den": 1001 }`). Times inside media files (`in`, `out`, `durationUs`) are integer microseconds. No floating point times anywhere.
- **Ids** are any unique strings (uuid v4 recommended). A clip, media item or track is stored under its own `id`.
- **Colors** are `{ "r", "g", "b", "a" }` with channels 0 to 1, straight alpha.
- **Positions** are project pixels from the center of the frame, right and down positive.
- **Unknown fields are refused** by `validate`, everywhere except inside `fallbackOf.data`. The editor itself loads more leniently; write only what the table lists.

A minimal valid project:

```json Project
{
  "schemaVersion": 4,
  "id": "0b3f6f6c-6d52-4d4a-9a53-0d1c6a7f3e10",
  "name": "Minimal",
  "settings": { "width": 1080, "height": 1920, "fps": { "num": 30, "den": 1 }, "background": { "r": 0, "g": 0, "b": 0, "a": 1 }, "sampleRate": 48000 },
  "media": {},
  "bins": [],
  "tracks": [
    { "id": "v1", "kind": "video", "name": "V1", "clipIds": ["bar"], "locked": false, "muted": false, "solo": false, "hidden": false, "targeted": true, "height": "M" }
  ],
  "clips": {
    "bar": {
      "id": "bar",
      "trackId": "v1",
      "kind": "solid",
      "name": "Bar",
      "start": 0,
      "duration": 90,
      "enabled": true,
      "fill": { "r": 0.2, "g": 0.4, "b": 0.9, "a": 1 },
      "shape": "rect",
      "size": { "w": 600, "h": 200 },
      "cornerRadius": 0,
      "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0, "y": 0 }, "flipH": false, "flipV": false },
      "opacity": 1
    }
  },
  "markers": [],
  "captionTracks": {},
  "textPresetsLocal": [],
  "meta": { "createdAt": "2026-11-07T08:00:00.000Z", "modifiedAt": "2026-11-07T08:00:00.000Z", "appVersion": "1.1.0" }
}
```

The complete example with every v1.1 clip kind, a caption track with word timings and a library font is `fixtures/interop/basic/`. The projects in `fixtures/interop/broken/` each have one error, for testing a generator's own checks against the validator.

### 4.1 Sparse input and `normalize`

A generator does not have to write every field. `npm run cli -- normalize <folder>` reads a sparse `project.json` and prints the complete project the editor would have made (`--write` writes `project.json` and the fonts into the folder, but only when the result passes the strict `validate`; an invalid result leaves the folder untouched and exits 1). What a sparse project needs:

- **Project:** nothing is required. A missing `schemaVersion` means the current one; an older one is migrated first, exactly as the app opens it. A missing `name` is the folder's name, a missing `id` a stable one made from the name, `meta` times are the time of the run (write `meta.createdAt` and `meta.modifiedAt` to make the output reproducible), `settings` default to 1080x1920 at 30 fps on black.
- **Track:** `id` and `kind`. `name` becomes V1, V2, A1... (a caption track is `CC`, height `S`, as the app makes it) and `clipIds` is rebuilt from the clips that name the track, sorted by start (so the order you write clips in does not matter).
- **Clip:** `id` (it is also the key), `kind`, `trackId`, `start`, `duration` and the content: `mediaId` for video, audio and image clips, `text.value` for text clips, `text` for caption cues, nothing more for solids (a solid you leave bare is what `+ Solid` makes in the project's size: a white rounded rectangle; write `shape`, `fill`, `size` and `cornerRadius` to change it). Everything else is filled: `name` (the media's name, the first line of a text, "Caption", "Solid"), `enabled`, `opacity`, `volume`, `crop`, `fades`, `speed`, `in`, and `out` (the source span the clip plays at its speed, at most the media's length; a still image's length). A video or image clip is placed the way the editor places a dropped file (Fit: contained in the frame, centered), any other clip at the center at scale 1.
- **Media item:** `id`, `kind` and `file.relPath`. `name` is the file name; `durationUs`, `width`, `height`, `rotation`, `fps`, `hasAudio`, `codec`, `audioCodec` and `size` are read from the file; `analysis` starts pending for what the file has (thumbnails for video, peaks for sound) and the app makes them on open; `addedAt` is `meta.createdAt`. A value you write wins over the file's; `validate` then compares the two. A file whose header cannot be read is reported as a note and left for the app's repair on open.
- **Nested styles merge field by field** with the editor's defaults: `"style": { "fontSize": 140, "stroke": { "enabled": true } }` keeps every other text style field and the default stroke width and color. The track style of a caption track merges with the default caption style of the project's size. A color without `a` is opaque.
- **Fonts:** the library fonts the texts and captions use (a text without `fontFamily` uses Inter) are recorded in `fonts/fonts.json` (version 2) and their files copied from the editor's `public/fonts/library/`, the same files and records the app writes. A family that is not in the library is reported: its file cannot be copied.

A field added by a later version of the editor is filled the same way, so a generator written today keeps working as the schema grows.

```jsonc
{
  "schemaVersion": 3,
  "id": "demo",
  "name": "Demo",
  "media": { "m1": { "id": "m1", "kind": "video", "file": { "relPath": "media/clip.mp4" } } },
  "tracks": [{ "id": "v1", "kind": "video" }],
  "clips": {
    "c1": { "id": "c1", "kind": "video", "trackId": "v1", "start": 0, "duration": 60, "mediaId": "m1" },
    "c2": { "id": "c2", "kind": "text", "trackId": "v1", "start": 60, "duration": 30, "text": { "value": "Hello" }, "style": { "fontFamily": "Bebas Neue", "fontSize": 140 } }
  }
}
```

`fixtures/interop/sparse/` holds a project like this one (schema 3, three media files, a text with a library font, a solid and two cues) and `expected/` the result `normalize` gives, which a test compares.

## 5. Tracks and clips

- Track order: video tracks bottom to top, then the caption track (at most one, above every video track), then audio tracks.
- A track lists its clips by id in start order; clips on a track never overlap. Every clip is listed on exactly one track, the one its `trackId` names.
- Video tracks hold `video`, `image`, `text` and `solid` clips; audio tracks `audio` clips; the caption track `caption` cues.
- A media clip's `out - in` equals `duration * speed` frame times, within one frame, and `out` does not pass the media's `durationUs` (a still image has `durationUs` 0 and any `out`).
- A transition's `transitionOut` on the left clip and `transitionIn` on the right clip hold the same values and the clips abut.
- Keyframes are relative to the clip start, sorted, one per frame. A key may lie before the clip start (negative frame) or past its end: a head or tail trim keeps such keys so a trim back restores them. Their property ids are in the manifest (`keyframes.props`).

A text clip:

```json Clip
{
  "id": "title",
  "trackId": "v2",
  "kind": "text",
  "name": "Title",
  "start": 30,
  "duration": 40,
  "enabled": true,
  "text": { "value": "Hello\nworld", "box": { "mode": "auto", "width": 900 } },
  "style": {
    "fontFamily": "Silkscreen",
    "fontWeight": 700,
    "italic": false,
    "fontSize": 96,
    "fill": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "stroke": { "enabled": true, "width": 6, "color": { "r": 0, "g": 0, "b": 0, "a": 1 } },
    "shadow": { "enabled": false, "x": 0, "y": 6, "blur": 16, "color": { "r": 0, "g": 0, "b": 0, "a": 0.6 } },
    "background": { "enabled": false, "color": { "r": 0, "g": 0, "b": 0, "a": 0.7 }, "paddingX": 28, "paddingY": 12, "radius": 16, "mode": "block" },
    "textCase": "none",
    "letterSpacing": 0,
    "lineHeight": 1.2,
    "align": "center",
    "verticalAnchor": "middle"
  },
  "animIn": { "id": "pop", "duration": 8 },
  "transform": { "x": 0, "y": 200, "scale": 1, "rotation": 0, "anchor": { "x": 0, "y": 0 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "fades": { "in": 0, "out": 5 }
}
```

### 5.1 Styles: fills, strokes, shadows and corners (manifest keys `solid.*`, `mediaFrame.*`, `text.background.*`; schema 5)

All of these fields are optional: a project without them draws as before, and `normalize` leaves them out.

- `fill` (solids and text) is an RGBA color, the v1 `{ "from", "to" }` vertical gradient, or a gradient with stops: `type` `linear` or `radial`, `angle` (degrees, 0 runs top to bottom, clockwise; linear), `center` (fractions of the box) and `radius` (a fraction of half the box diagonal; radial), and 2 to 8 `stops` with `at` ascending in 0..1. Between stops colors mix in premultiplied space, as canvas gradients do.
- `stroke` (solids, videos, images): `width` in project px, `color`, `align` `inside` (the fill box stays put and the line grows inward), `center` or `outside`, and an optional `dash` (dash and gap lengths in project px; at most 4 are drawn) with `dashOffset`. Dashes follow the outline from the top middle, clockwise, and the pattern is stretched a little so a whole number of periods fits the outline.
- `shadow` (solids, videos, images): `x`, `y`, `blur` (project px; 0 is a hard edge), `spread`, `color`. The shadow is drawn outside the shape only; a flipped picture keeps its shadow on the same side.
- `cornerRadii` (solids): the radii of the corners top left, top right, bottom right, bottom left; it wins over `cornerRadius` for `rect` and `roundedRect`. Videos and images have one `cornerRadius`; their `stroke` and `shadow` follow the cropped picture.
- Text and caption `background` take `stroke` and `shadow` with the same fields as the text's own (`enabled`, `width`, `color`; `enabled`, `x`, `y`, `blur`, `color`): the border is drawn inside the box edge, the shadow outside it. A caption cue's `styleOverride.text.background.stroke` replaces the track's whole, so `{ "enabled": false, ... }` turns a track's border off for that cue.

A paper card (white fill, 3 px ink stroke inside, hard 7/7 shadow, square corners):

```json Clip
{
  "id": "card",
  "trackId": "v2",
  "kind": "solid",
  "name": "Paper card",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "fill": { "r": 1, "g": 1, "b": 1, "a": 1 },
  "shape": "rect",
  "size": { "w": 440, "h": 260 },
  "cornerRadius": 0,
  "stroke": { "width": 3, "color": { "r": 0.09, "g": 0.09, "b": 0.14, "a": 1 }, "align": "inside" },
  "shadow": { "x": 7, "y": 7, "blur": 0, "spread": 0, "color": { "r": 0.09, "g": 0.09, "b": 0.14, "a": 1 } },
  "transform": { "x": -255, "y": -720, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1
}
```

A dashed outline with a four-stop radial gradient fill and a radius per corner:

```json Clip
{
  "id": "badge",
  "trackId": "v3",
  "kind": "solid",
  "name": "Badge",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "fill": {
    "type": "radial",
    "angle": 0,
    "center": { "x": 0.5, "y": 0.5 },
    "radius": 1,
    "stops": [
      { "at": 0, "color": { "r": 1, "g": 0.95, "b": 0.4, "a": 1 } },
      { "at": 0.35, "color": { "r": 0.95, "g": 0.35, "b": 0.3, "a": 1 } },
      { "at": 0.7, "color": { "r": 0.4, "g": 0.2, "b": 0.7, "a": 1 } },
      { "at": 1, "color": { "r": 0.08, "g": 0.1, "b": 0.3, "a": 1 } }
    ]
  },
  "shape": "roundedRect",
  "size": { "w": 440, "h": 240 },
  "cornerRadius": 28,
  "cornerRadii": [28, 28, 120, 0],
  "stroke": { "width": 6, "color": { "r": 0.09, "g": 0.09, "b": 0.14, "a": 1 }, "align": "center", "dash": [24, 16], "dashOffset": 0 },
  "transform": { "x": 255, "y": -430, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1
}
```

A rounded video with a border and a soft shadow:

```json Clip
{
  "id": "video",
  "trackId": "v1",
  "kind": "video",
  "name": "Rounded video",
  "start": 0,
  "duration": 60,
  "enabled": true,
  "mediaId": "m1",
  "in": 0,
  "out": 2000000,
  "speed": 1,
  "transform": { "x": 0, "y": 330, "scale": 1.1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "crop": { "left": 0, "top": 0, "right": 0, "bottom": 0 },
  "volume": { "gainDb": 0, "muted": true },
  "fades": { "in": 0, "out": 0 },
  "cornerRadius": 40,
  "stroke": { "width": 4, "color": { "r": 0.09, "g": 0.09, "b": 0.14, "a": 1 }, "align": "inside" },
  "shadow": { "x": 0, "y": 14, "blur": 36, "spread": 0, "color": { "r": 0, "g": 0, "b": 0, "a": 0.45 } }
}
```

A caption cue that turns its track's box border off (the track's boxed style keeps its hard shadow):

```json Clip
{
  "id": "q3",
  "trackId": "cc1",
  "kind": "caption",
  "name": "Cue q3",
  "start": 60,
  "duration": 30,
  "enabled": true,
  "text": "No border here",
  "styleOverride": { "text": { "background": { "stroke": { "enabled": false, "width": 3, "color": { "r": 0.09, "g": 0.09, "b": 0.14, "a": 1 } } } } }
}
```

`fixtures/interop/styles/` holds all of these in one project with expected frames (`npm run test:render` renders it on both backends); `scripts/cli/make-styles-fixture.mjs` writes it.

### 5.2 Keyframes v2: eases, springs, colors and the new properties (manifest keys `keyframes.bezier`, `keyframes.spring`, `keyframes.vectorValues`; schema 7)

A key is `{ "frame", "value", "ease" }` plus, for two eases, its parameters. `value` is a number, or for a color property an array `[r, g, b, a]` (straight alpha, 0..1; each channel is interpolated on its own). The `ease` of a key shapes the segment from it to the next key; a value stays put before the first key and after the last. Projects of schema 6 and earlier open unchanged.

- `ease` takes the 8 of v1 (`linear`, `easeIn`, `easeOut`, `easeInOut`, `hold`, `smooth`, `snap`, `overshoot`), the 30 Penner eases (`sine`, `quad`, `cubic`, `quart`, `quint`, `expo`, `circ`, `back`, `elastic` and `bounce`, each with `In`, `Out` and `InOut`: `quadOut`, `bounceInOut`), `bezier` and `spring`. The list is in the manifest (`keyframes.eases`).
- `bezier` (ease `bezier`): `[x1, y1, x2, y2]`, the CSS `cubic-bezier()` of the segment; `x1` and `x2` must lie in 0..1, `y1` and `y2` may go past it (overshoot). Absent: the CSS `ease`, `[0.25, 0.1, 0.25, 1]`.
- `spring` (ease `spring`): `{ "damping", "frequency" }`, a damped cosine over the segment; absent: damping 0.7, frequency 4. The segment always ends exactly on the next key's value.
- `hold` keeps the value until the next key, then jumps: use it for instant state changes, including colors.
- Property ids and the clips they are valid on (the id is the field's path; the manifest lists them in `keyframes.props`):

| Property | Clips | Value |
| --- | --- | --- |
| `transform.x`, `transform.y`, `transform.scale`, `transform.scaleY`, `transform.rotation`, `opacity` | any visual clip | number |
| `transform.anchor.x`, `transform.anchor.y` | video, image, solid, text | number (0..1 of the clip's box) |
| `crop.left`, `crop.top`, `crop.right`, `crop.bottom` | video, image | number (0..1 of the media) |
| `cornerRadius` | solid, video, image | number (project px) |
| `size.w`, `size.h` | solid | number (project px) |
| `fill` | solid whose `fill` is a plain color | color |
| `stroke.width`, `stroke.dashOffset`, `stroke.color` | solid that has a `stroke` | number, number, color |
| `shadow.x`, `shadow.y`, `shadow.blur`, `shadow.spread`, `shadow.color` | solid that has a `shadow` | number, number, number, number, color |
| `style.fontSize`, `style.letterSpacing` | text | number (project px) |
| `style.fill` | text whose `style.fill` is a plain color | color |
| `volume.gainDb` | audio and video | number (dB) |

Rendering notes: a keyed text size is drawn from a raster at the largest keyed size (a fixed-width box wraps at its width scaled with the size); keyed letter spacing moves the characters and leaves the box and its background where the unkeyed spacing puts them, and is not applied while an in or out animation of the text plays; a keyed text fill draws the color of the key before the frame and, over it, the color of the key after it at the fade's progress (exact inside the letters, an approximation on their antialiased edges, and exact only for opaque colors). A key on a property the clip does not have (a `stroke.width` key on a solid without a stroke) is kept and does nothing. Per-corner `cornerRadii` of a solid win over a keyed `cornerRadius`.

```jsonc
{
  "keyframes": {
    "fill": [
      { "frame": 0, "value": [0.96, 0.43, 0.36, 1], "ease": "hold" },
      { "frame": 30, "value": [0.07, 0.07, 0.1, 1], "ease": "linear" }
    ],
    "size.w": [
      { "frame": 0, "value": 400, "ease": "bezier", "bezier": [0.68, -0.55, 0.27, 1.55] },
      { "frame": 20, "value": 800, "ease": "spring", "spring": { "damping": 0.7, "frequency": 4 } },
      { "frame": 44, "value": 400, "ease": "linear" }
    ]
  }
}
```

#### Ease names in CSS, GSAP and After Effects

Motion written in another tool maps to these ease ids. The editor's curves are the same as the tools' for the entries marked exact.

| CSS | GSAP | After Effects | Ease id |
| --- | --- | --- | --- |
| `linear` | `none` | Linear | `linear` (exact) |
| `ease` | | | `smooth`, or `bezier` `[0.25, 0.1, 0.25, 1]` (exact) |
| `ease-in` | | | `bezier` `[0.42, 0, 1, 1]` (exact) |
| `ease-out` | | | `bezier` `[0, 0, 0.58, 1]` (exact) |
| `ease-in-out` | | | `bezier` `[0.42, 0, 0.58, 1]` (exact) |
| `cubic-bezier(a, b, c, d)` | `CustomEase` of one cubic | a keyframe pair with influence and speed | `bezier` `[a, b, c, d]` (exact; AE influence `i` at speed 0 is `x = i / 100`, `y = 0` on the out handle and `x = 1 - i / 100`, `y = 1` on the in handle) |
| | `sine.in`, `sine.out`, `sine.inOut` | | `sineIn`, `sineOut`, `sineInOut` (exact) |
| | `power1.in`, `.out`, `.inOut` | | `quadIn`, `quadOut`, `quadInOut` (exact) |
| | `power2.in`, `.out`, `.inOut` | | `cubicIn`, `cubicOut`, `cubicInOut` (exact) |
| | `power3.in`, `.out`, `.inOut` | | `quartIn`, `quartOut`, `quartInOut` (exact) |
| | `power4.in`, `.out`, `.inOut` | | `quintIn`, `quintOut`, `quintInOut` (exact) |
| | `expo.in`, `.out`, `.inOut` | | `expoIn`, `expoOut`, `expoInOut` (exact) |
| | `circ.in`, `.out`, `.inOut` | | `circIn`, `circOut`, `circInOut` (exact) |
| | `back.in(1.70158)`, `.out(1.70158)`, `.inOut(1.70158)` | | `backIn`, `backOut`, `backInOut` (overshoot 1.70158; for another overshoot use `bezier`) |
| | `elastic.in`, `.out`, `.inOut` | | `elasticIn`, `elasticOut`, `elasticInOut` (the Penner shape; GSAP's amplitude and period options are not available) |
| | `bounce.in`, `.out`, `.inOut` | | `bounceIn`, `bounceOut`, `bounceInOut` (exact) |
| `steps(1, jump-end)` | `steps(1)` | Hold keyframe | `hold` |
| | | Easy Ease (F9) | `bezier` `[0.3333, 0, 0.6667, 1]` (33.33% influence on both sides, speed 0) |
| | | Easy Ease In | `bezier` `[0.1667, 0.1667, 0.6667, 1]` (the in side at 33.33% influence, the out side linear: 16.67% influence at the average speed) |
| | | Easy Ease Out | `bezier` `[0.3333, 0, 0.8333, 0.8333]` |
| | a physics or spring plugin | the overshoot expression | `spring` (match the look by eye: damping and frequency) or a few keys with `backOut` |

### 5.3 Compound clips: sequences shown inside a clip (manifest keys `clipKinds` (adds `compound`), `compositing.compound`; schema 8)

A compound clip shows a *sequence*: a small timeline of its own (video and audio tracks, a size, a duration and an optional background) listed in the project's `sequences`, keyed by id. The sequence's clips are ordinary clips in the project's `clips`, on the sequence's own tracks (`sequences.<id>.tracks`), with times counted from the sequence's frame 0. A sequence is used by any number of compound clips (instances: edit it once, every instance changes), and a sequence may hold compound clips itself (at most 8 levels, never a cycle).

A compound clip is a `compound` clip on a **video** track of the project (or of another sequence): `sequenceId`, `offset` (the sequence frame shown at the clip's first frame, so the clip shows the window `[offset, offset + duration)` of the sequence and `offset + duration` is at most the sequence's `duration`), and the picture fields `transform`, `opacity`, `fades` and `keyframes` of any layer (the transform places the sequence frame, centred, in the project frame: scale 1 is the sequence's own size in pixels), plus `volume` for the audio inside. Clips inside a sequence must end by the sequence's `duration`; sequences take no caption tracks.

```json Clip.compound
{
  "id": "b",
  "trackId": "v2",
  "kind": "compound",
  "name": "Card, second half",
  "start": 60,
  "duration": 50,
  "enabled": true,
  "sequenceId": "card",
  "offset": 10,
  "transform": { "x": 0, "y": 400, "scale": 0.6, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 0.9,
  "fades": { "in": 0, "out": 0 },
  "volume": { "gainDb": 0, "muted": false }
}
```

```json Sequence
{
  "id": "card",
  "name": "Card",
  "size": { "w": 1080, "h": 1080 },
  "duration": 60,
  "background": { "r": 0.1, "g": 0.1, "b": 0.2, "a": 1 },
  "tracks": [
    { "id": "c-v1", "kind": "video", "name": "V1", "clipIds": ["card-bg"], "locked": false, "muted": false, "solo": false, "hidden": false, "targeted": true, "height": "M" }
  ]
}
```

`background` is `null` for a transparent sequence. `fixtures/interop/compound` is a complete project: a card sequence (solid, text and audio) shown twice, one instance windowed with `offset`, and a second sequence that nests the card. Audio inside a compound plays and exports through the compound's `volume`; the compound's fades and a sequence's transitions do not touch its audio in this version.

### 5.4 Alpha video and image sequences (manifest keys `media.videoAlpha`, `media.imageSequence`; schema 9)

Transparent animated overlays from any renderer play natively, in the preview, the export and `cli render`, on both backends.

**Alpha WebM.** A VP8 or VP9 WebM whose blocks carry the alpha stream (Matroska BlockAdditions, BlockAddID 1; ffmpeg also sets the track's AlphaMode element to 1, which the app does not require) imports as a video with `"alpha": true`. The transparency is exact; the clip composites like any layer (opacity, transform, blend). Make one with ffmpeg:

```
ffmpeg -i in.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 -auto-alt-ref 0 out.webm
```

`-auto-alt-ref 0` is required: with hidden alternate-reference frames libvpx writes no alpha for them and the stream cannot be decoded frame by frame. Alpha media gets no proxy (a proxy would lose the transparency); the Media tab shows a "no proxy" chip. A WebM with AV1 alpha, and an MP4 or MOV with HEVC or AV1 alpha, import opaque and the editor tells you so with a toast. ProRes (4444 or not) is refused: convert it to VP9 alpha WebM or to a PNG sequence with the commands here.

**Image sequence.** Numbered PNG or WebP files of one size become one `image` media item with a `sequence` record: `dir` (a folder inside the project, `media/<name>`), `pattern` (`frame_%05d.png`: one `%d` or `%0Nd`, N 1 to 9), `first` (the number of the first frame), `count` and `fps`. The files must be consecutive (`first` to `first + count - 1`) and all have the size in `width` x `height`. The item's `durationUs` is `count` frames at `fps` (integer microseconds) and `file.relPath` is the first frame. A clip of a sequence is an ordinary `image` clip: it plays the frames at the sequence's rate and loops when the clip is longer. Make one with ffmpeg:

```
ffmpeg -i in.mov -vf fps=30 media/smoke/frame_%05d.png
```

Add `-start_number 0` for a sequence that starts at 0. Dropping or importing a folder of numbered frames asks "Import as image sequence (N frames) at 30 fps?"; a generator writes the record itself.

```json MediaItem
{
  "id": "m2",
  "kind": "image",
  "name": "sparks",
  "file": { "relPath": "media/sparks/frame_0001.png" },
  "durationUs": 1000000,
  "hasAudio": false,
  "analysis": { "thumbs": "none", "peaks": "none" },
  "addedAt": "2026-11-07T08:00:00.000Z",
  "width": 270,
  "height": 480,
  "codec": "png",
  "sequence": { "dir": "media/sparks", "pattern": "frame_%04d.png", "first": 1, "count": 30, "fps": { "num": 30, "den": 1 } }
}
```

`fixtures/interop/alpha` is a complete project: a VP9 alpha WebM (`media/overlay.webm`, about 2 KB) and the same 30-frame animation as a PNG sequence (`media/sequence/frame_%04d.png`), both over a blue solid, with expected frames in `expected/`. Alpha export (a transparent output file) is not part of this version.

### 5.5 Vector shapes and trim paths (manifest keys `clipKinds` (adds `shape`), `vector.shapes`, `vector.trimPaths`, `vector.primitives`, `vector.keyframeProps`; schema 10)

A `shape` clip draws vector paths, resolution independent, in the preview, the export and `cli render`, on both backends. It goes on a video track like a solid. `size` is its view box in project px at scale 1: path coordinates are view-box px with y down, and the clip's `transform` (position, scale, rotation, anchor, flips), `opacity`, `fades` and keyframes work as on a solid. Paths draw in order, the first one at the back; each path draws its fill, then its stroke.

A path (`ShapePath`) has:

- `id`: letters, digits, `_` or `-`, unique in the clip (keyframe properties name it).
- `d`: SVG path data (all of `M L H V C S Q T A Z`, relative forms, implicit repeats and compact numbers; arcs are converted to cubics). Bad data is refused with its position.
- `fill`: a color, a gradient (laid out in the path's box, as a solid's in its size), or `null` for none. `fillRule`: `nonzero` or `evenodd`.
- `stroke` (optional): a solid's stroke (`width`, `color`, `align` `center`, `inside` or `outside`, `dash`, `dashOffset`) plus `cap` (`butt`, `round`, `square`), `join` (`miter`, `round`, `bevel`) and `miterLimit` (SVG's: a miter longer than `miterLimit` times the width is beveled). Dashes restart at each subpath; an odd dash list repeats; a zero-length dash with round or square caps draws a dot.
- `trim` (optional): `start` and `end` (fractions 0..1 of the path's whole length, its subpaths in order) and `offset` (turns: 0.25 moves the window a quarter of the length along, wrapping round). Only the stroke is trimmed. `start` after `end` draws the same as swapped.
- `primitive` (optional): a parametric shape centered in the view box, which replaces `d` when drawn (write its path in `d` as well, or `""`). Angles are degrees, 0 at the top, clockwise.

| `kind` | params |
|---|---|
| `rect` | `w`, `h`, `radius` (corner, clamped to half the shorter side) |
| `ellipse` | `w`, `h` |
| `polygon` | `sides` (3..64), `radius`, `roundness` (0..1) |
| `star` | `points` (3..64), `inner`, `outer` (radii), `roundness` (0..1) |
| `arrow` | `length`, `shaft` (width), `head` (width), `headLength`, pointing right |
| `arc` | `radius`, `start`, `end` (an open arc, for strokes) |
| `line` | `length`, horizontal |

Keyframe properties of paths (`<id>` is a path id; the path must exist and have what the key animates): `paths.<id>.trim.start`, `paths.<id>.trim.end`, `paths.<id>.trim.offset`, `paths.<id>.stroke.width`, `paths.<id>.stroke.color` and `paths.<id>.fill` (colors as `[r, g, b, a]`, a color fill only), `paths.<id>.stroke.dashOffset` and `paths.<id>.primitive.<param>` (any number param of its primitive). A trim key needs no `trim` on the path (absent is 0, 1, 0); keyed trims stay within 0..1.

A checkmark that draws on over 10 frames:

```json Clip.shape
{
  "id": "check",
  "trackId": "v2",
  "kind": "shape",
  "name": "Checkmark",
  "start": 0,
  "duration": 60,
  "enabled": true,
  "size": { "w": 300, "h": 250 },
  "paths": [
    {
      "id": "tick",
      "d": "M40 130 L110 200 L260 50",
      "fill": null,
      "fillRule": "nonzero",
      "stroke": { "width": 28, "color": { "r": 0.2, "g": 0.85, "b": 0.45, "a": 1 }, "align": "center", "cap": "round", "join": "round", "miterLimit": 4 },
      "trim": { "start": 0, "end": 1, "offset": 0 }
    }
  ],
  "transform": { "x": -260, "y": -620, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "keyframes": {
    "paths.tick.trim.end": [
      { "frame": 0, "value": 0, "ease": "linear" },
      { "frame": 10, "value": 1, "ease": "linear" }
    ]
  }
}
```

A gauge's value arc (key `paths.value.primitive.end` from 0 to 270 on the clip):

```json ShapePath
{
  "id": "value",
  "d": "",
  "fill": null,
  "fillRule": "nonzero",
  "stroke": { "width": 24, "color": { "r": 1, "g": 0.55, "b": 0.15, "a": 1 }, "align": "center", "cap": "round", "join": "miter", "miterLimit": 4 },
  "primitive": { "kind": "arc", "radius": 120, "start": 0, "end": 270 }
}
```

A pentagram with a hole (`nonzero` fills the middle as well):

```json ShapePath
{
  "id": "p",
  "d": "M150 20 L238 280 L10 115 L290 115 L62 280 Z",
  "fill": { "r": 1, "g": 0.35, "b": 0.6, "a": 1 },
  "fillRule": "evenodd"
}
```

Edges are anti-aliased with 4 samples per pixel. Curves are flattened finely enough for the size they are shown at, so a shape scaled up stays smooth. `fixtures/interop/shapes` is a complete project with all of the above, every primitive, an inside and an outside stroke, a gradient fill and expected frames 0, 5, 10 and 30. Point editing and boolean operations are not part of this version.

**SVG import (manifest key `vector.svgImport`, true).** The app's Import as shapes turns an SVG file into one shape clip: the `viewBox` (else `width` and `height`) becomes `size` and every drawable element one path. A generator that writes projects does the same by writing the `shape` clip itself; the app's import reads this subset: `path`, `rect` (with `rx` and `ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon` and `g`, with `transform` (baked into the path data), `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `fill-rule`, `fill-opacity`, `stroke-opacity` and `opacity` as attributes or `style` declarations, `currentColor`, and `linearGradient` and `radialGradient` fills (as gradient fills laid out in the path's box). Anything else (filters, masks, clip paths, text, images, patterns, `use`, style sheets, gradient strokes) keeps the SVG as an image clip, and a toast names what was not supported. `fixtures/interop/svg` holds icon SVGs and one with a filter, with the shape clips the import makes.

### 5.6 Styled spans: colored, bold, italic, underlined, struck and highlighted words inside one text clip (manifest key `text.spans`; schema 11)

A `text` clip may carry `spans`: runs of its text with a style of their own. A span is `{ start, end, style }` with `start` and `end` UTF-16 offsets into `text.value` (`end` exclusive, so `value.slice(start, end)` is the styled text). The list is sorted by `start`, its spans do not overlap, none is empty and none ends past the text; the strict validator refuses anything else.

`style` changes only what it names, over the clip's `style`:

| Field | Meaning |
| --- | --- |
| `fill` | Text color (a color, or a gradient fill like the clip's own `style.fill`, laid over the whole text block). |
| `fontFamily`, `fontWeight`, `italic` | The font of the run (a family from the font manifest, 1 to 1000, true/false). A bold run is wider, so a line's width and its wrapping count each run in its own font. |
| `underline`, `strike` | A line under, or through, the run in the run's fill. |
| `highlight` | A box behind the run (the height of the font's em box). |

Spans are content, not look: text presets never store them and applying a preset keeps them. Edits of the text move them with their words in the app (typing inside a span, or right after its last character, extends it; deleting shrinks it and removes it once empty). A generator writes the final offsets. `wordPop` and `wordFade` move each word with the style of its span; a word split by a span boundary is drawn in its pieces.

```json TextSpan
{ "start": 5, "end": 12, "style": { "fill": { "r": 1, "g": 0.42, "b": 0.32, "a": 1 }, "fontWeight": 800, "underline": true } }
```

```json Clip
{
  "id": "save",
  "trackId": "v2",
  "kind": "text",
  "name": "SAVE 3 HOURS",
  "start": 0,
  "duration": 60,
  "enabled": true,
  "text": { "value": "SAVE 3 HOURS", "box": { "mode": "auto", "width": 700 } },
  "style": {
    "fontFamily": "Inter",
    "fontWeight": 700,
    "italic": false,
    "fontSize": 72,
    "fill": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "stroke": { "enabled": false, "width": 6, "color": { "r": 0, "g": 0, "b": 0, "a": 1 } },
    "shadow": { "enabled": false, "x": 0, "y": 4, "blur": 12, "color": { "r": 0, "g": 0, "b": 0, "a": 0.5 } },
    "background": { "enabled": false, "color": { "r": 0, "g": 0, "b": 0, "a": 0.6 }, "paddingX": 24, "paddingY": 12, "radius": 12, "mode": "line" },
    "textCase": "none",
    "letterSpacing": 0,
    "lineHeight": 1.2,
    "align": "center",
    "verticalAnchor": "middle"
  },
  "spans": [{ "start": 5, "end": 12, "style": { "fill": { "r": 1, "g": 0.42, "b": 0.32, "a": 1 } } }],
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "fades": { "in": 0, "out": 0 }
}
```

`fixtures/interop/spans` is a complete project with every span field, a `wordPop` title and expected frames 0, 6 and 20.

### 5.7 Number counters and range-selector animators (manifest keys `text.counter`, `text.animators`, `text.anims`, `text.animatorKeyframeProps`; schema 12)

A `text` clip may count a number and may carry `animators`. Both are optional; an older project has neither and renders as before.

**Counter.** `counter` is `{ from, to, decimals, prefix, suffix, separator, ease }`. The clip shows `prefix + number + suffix`, the number going from `from` to `to` over the clip through `ease` (the last frame shows `to` exactly). `decimals` is 0 to 6, `separator` groups thousands (`""`, `","`, `"."`, `" "` or `"'"`; with `"."` the decimal mark is a comma). Keys on `text.counter.value` replace the ease. Write the final text in `text.value` (for `to` 85.6, one decimal, suffix `%`: `85.6%`): the layout and readers of the file use it.

**Animators.** `animators` is a list of `{ id, unit, selector, props }`. `unit` is `char`, `word` or `line`. The selector gives every unit a weight from 0 to 1: `start`, `end` and `offset` are fractions of the units (the range slides by `offset`), `shape` is `square`, `rampUp`, `rampDown`, `triangle`, `round` or `smooth`, `ease` is -1 to 1, `order` is `forward`, `reverse` or `random` (`seed` makes a random order the same on every render). `props` is what moves at weight 1: `x`, `y` (px), `rotation` (degrees), `blur` (px), `tracking` (px), `scale` and `opacity` (the value a unit moves toward) and `fill` (an RGBA tint). Key a field with `animators.<id>.selector.start|end|offset` or `animators.<id>.props.<name>`.

**Presets.** `animIn` and `animOut` also accept `typeOn`, `decode`, `tumbleIn`, `cascadeUp`, `riseByLine`, `popInByChar`, `blurInByChar` and `fadeInByChar`, and `highlightSweep` (a highlight box that grows behind each word).

```jsonc
{
  "id": "stat",
  "kind": "text",
  "text": { "value": "85.6%", "box": { "mode": "auto", "width": 700 } },
  "counter": { "from": 0, "to": 85.6, "decimals": 1, "prefix": "", "suffix": "%", "separator": "", "ease": "easeOut" },
  "animators": [
    { "id": "reveal", "unit": "char", "selector": { "start": 0, "end": 1, "offset": 0, "shape": "rampUp", "ease": 0, "order": "forward", "seed": 1 }, "props": { "y": 40, "opacity": 0 } }
  ]
}
```

`fixtures/interop/kinetic` is a complete project with a counter, every animator field and every new preset, and expected frames 0, 12 and 24.

### 5.8 Parenting, null clips and motion paths (manifest keys `transform.parenting`, `transform.motionPaths`, `transform.autoOrient`, `clipKinds` (adds `null`), `keyframes.props` (adds `transform.position`); schema 13)

**Parent.** `parentId` on a visual clip of a video track (`video`, `image`, `text`, `solid`, `shape`, `compound` or `null`) names another such clip of the same sequence (the project's own tracks, or one sequence's tracks). The clip's `transform` is then in the parent's space: the parent's world transform applies after the clip's own, with the parent's `x` and `y` as the origin (the parent's anchor point), so rotating a parent turns its children around that point. Opacity is not inherited, and neither are flips. The parent is read at the frame clamped into its own range. A clip is never its own ancestor (a cycle is refused). A transform has no skew: with a non-uniform parent scale and a rotated child the editor draws the closest rotation and scales.

**Null.** `{ "kind": "null", ... }` is an invisible controller: `transform`, optional `keyframes`, and `size` (the outline shown when it is selected). It is never drawn or exported, has no fades or opacity, and sits on a video track like any other clip (put it on a track of its own: a track holds one clip at a time).

**Motion path.** The vector key property `transform.position` has `[x, y]` values. A key may carry `spatialIn` and `spatialOut`, tangent offsets `[x, y]` relative to the key's point. A segment between two keys is a cubic bezier through them when either has a tangent (a straight line otherwise); positions move along it by arc length, so a linear ease is a constant speed and the key's `ease` shapes progress along the curve. A clip uses either `transform.x` and `transform.y` keys or `transform.position` keys: when it has position keys, they win.

**Auto-orient.** `autoOrient: true` adds the direction of travel on the path (degrees clockwise from +x, y pointing down) to `transform.rotation`. It has no effect without position keys.

```json Clip.null
{
  "id": "rig",
  "trackId": "v2",
  "kind": "null",
  "name": "Rig",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "size": { "w": 100, "h": 100 },
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "keyframes": {
    "transform.rotation": [
      { "frame": 0, "value": 0, "ease": "linear" },
      { "frame": 89, "value": 90, "ease": "linear" }
    ]
  }
}
```

```json Clip.shape
{
  "id": "badge",
  "trackId": "v1",
  "kind": "shape",
  "name": "Badge",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "parentId": "rig",
  "autoOrient": true,
  "size": { "w": 100, "h": 100 },
  "paths": [{ "id": "p", "d": "M10 10 L90 10 L90 90 L10 90 Z", "fill": { "r": 1, "g": 1, "b": 1, "a": 1 }, "fillRule": "nonzero" }],
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "keyframes": {
    "transform.position": [
      { "frame": 0, "value": [-300, 0], "ease": "linear", "spatialOut": [0, -200] },
      { "frame": 89, "value": [300, 0], "ease": "linear", "spatialIn": [0, -200] }
    ]
  }
}
```

`fixtures/interop/rig` is a complete project with a null and five children, a text parented to a rotating card and a curved motion path with auto-orient, and expected frames 0, 30 and 60.

### 5.9 2.5D layers: 3D rotation and perspective (manifest key `transform.rotation3d`; schema 14)

**Turn and depth.** A `transform` may carry `rotationX` and `rotationY` (degrees) and `z` (px, positive = farther away). The picture turns around the layer's anchor point: `rotationY` turns the right side away from the viewer, `rotationX` the top side, like CSS `rotateY()` and `rotateX()`. `rotation` then turns the tilted layer around the view axis. `z` moves the layer away (or closer, when negative) along the view axis. All three are absent (0) on a flat layer, and all three are keyframe properties (`transform.rotationX`, `transform.rotationY`, `transform.z`).

**Perspective.** `settings.perspective` (and `perspective` on a sequence, for the layers inside a compound) is the viewing distance in px from the frame, the CSS `perspective` with its origin at the frame center. Absent means 1600. `null` means none: a parallel view where a turn foreshortens the layer and `z` does nothing. A sequence never takes the project's distance; absent inside is 1600 too.

**Back side and order.** A layer turned past 90° shows its back (mirrored) unless `backfaceHidden: true`. A layer reaching the viewer's plane (`z` near minus the distance, or a turned edge behind it) is not drawn. Layers are drawn in track order. A sequence with `depthSort: true` draws its layers farthest `z` first (ties keep track order) inside the compound clips that show it. A parent (§5.8) passes its 2D transform on, never its turn: each clip's own `rotationX`, `rotationY` and `z` apply to it alone.

```json Transform
{ "x": 0, "y": 0, "scale": 1.5, "rotation": 0, "rotationX": 0, "rotationY": 60, "z": 200, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false }
```

```json Settings
{ "width": 1080, "height": 1920, "fps": { "num": 30, "den": 1 }, "sampleRate": 48000, "background": { "r": 0, "g": 0, "b": 0, "a": 1 }, "perspective": 1200 }
```

```json Clip.solid
{
  "id": "card",
  "trackId": "v1",
  "kind": "solid",
  "name": "Card",
  "start": 0,
  "duration": 60,
  "enabled": true,
  "backfaceHidden": true,
  "fill": { "r": 1, "g": 0.4, "b": 0.3, "a": 1 },
  "shape": "rect",
  "size": { "w": 400, "h": 560 },
  "cornerRadius": 24,
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "keyframes": {
    "transform.rotationY": [
      { "frame": 0, "value": 180, "ease": "cubicOut" },
      { "frame": 45, "value": 0, "ease": "linear" }
    ],
    "transform.z": [
      { "frame": 0, "value": 2000, "ease": "cubicOut" },
      { "frame": 45, "value": 0, "ease": "linear" }
    ]
  }
}
```

```json Sequence
{ "id": "deck", "name": "Deck", "size": { "w": 1080, "h": 1920 }, "duration": 90, "background": null, "tracks": [], "perspective": null, "depthSort": true }
```

`fixtures/interop/deck` is a complete project with six cards flying into a grid in perspective, their rotations settling to 0, and expected frames 0, 30 and 59. `fixtures/interop/card` is one checkered card turned 60° on Y with perspective 1600: its expected frame matches the same card drawn by Chrome with CSS (`scripts/css-perspective-reference.mjs`).

### 5.10 Transitions v2 (manifest key `transitions`; schema 15)

A transition sits on the cut between two abutting picture clips: the left clip's `transitionOut` and the right clip's `transitionIn` hold the same values. `kind` is one of `crossDissolve`, `dipToBlack`, `dipToWhite` (schema 14 and before) or the new `slide` (the incoming picture slides over the outgoing one), `push` (both move), `wipe` (a straight edge with a soft width), `iris` (a circle grows from a center), `zoomIn`, `zoomOut` (scale with a dissolve), `whip` (a push with a motion blur along the direction, strongest at the cut), `blurDissolve`, `glitch` and `flash` (to white and back). The manifest key `transitions` lists them. An audio crossfade is always `crossDissolve` and ignores the fields below.

| Field | Read by | Meaning |
| --- | --- | --- |
| `direction` | `slide`, `push`, `whip` | `left` (default), `right`, `up`, `down`: the way the pictures travel. |
| `angle` | `wipe` | Degrees: 0 moves the edge from left to right, 90 from top to bottom. Default 0. |
| `softness` | `wipe`, `iris` | The soft width of the edge, 0 to 1 of its travel. Default 0 (hard). |
| `center` | `iris` | `{ "x": 0.5, "y": 0.5 }`, fractions of the frame. Default the middle. |
| `ease` | every video kind | An ease id from section 5.2. **Absent means the linear mix of schema 14 and before**, so a transition saved earlier plays exactly as it did. The editor creates the motion kinds (`slide`, `push`, `whip`, `zoomIn`, `zoomOut`, `wipe`, `iris`) with `easeInOut`. |

At the i-th of the transition's `before + after` frames the progress is `(i + 1) / (before + after + 1)`, passed through `ease`. A 12-frame `push` with `direction: "left"` and `easeInOut` moves the outgoing picture left by exactly the frame width and brings the incoming one in from the right by the same distance over the transition. Both clips of a cut keep the same values: write them to both. Unknown fields are refused by the strict validator; a missing `direction`, `angle`, `softness` or `center` takes its default. Schema 14 projects open unchanged (migration 14 to 15 changes nothing).

`fixtures/interop/transitions` is a complete project: fourteen stills alternating between two pictures, joined by thirteen 11-frame transitions (6 frames before the cut, 5 after), one of every kind. Its expected frames are each transition's midpoint, the frame before the cut (progress exactly 0.5): 29, 59, 89 and so on. `npm run test:render` renders them on both backends.

### 5.11 Blend modes and track mattes (manifest keys `compositing.blendModes`, `compositing.trackMatte`; schema 16)

**Blend modes.** A visual clip (`video`, `image`, `text`, `solid`, `shape`, `compound`) may carry `blend`: how its picture combines with what is below it in its sequence. The modes are `normal` (absent means normal), `darken`, `multiply`, `colorBurn`, `lighten`, `screen`, `colorDodge`, `add`, `overlay`, `softLight`, `hardLight`, `difference` and `exclusion`, the separable blend functions of the W3C Compositing and Blending spec (`add` is linear dodge, clamped at white). The clip's whole picture (all of its text layers, the whole compound) is blended at once, after its transform, opacity and fades, then composited over the backdrop with source-over alpha: where the clip is transparent the backdrop shows unchanged. `screen` and `add` brighten, `multiply` darkens (a paper texture), `difference` inverts under white. The manifest key `compositing.blendModes` lists the modes in the order the editor shows them.

**Track mattes.** `matte: { "clipId": "...", "mode": "..." }` shows the clip only where the matte clip is opaque (`alpha`) or bright (`luma`, Rec. 709 luminance of its premultiplied color), or the opposite (`alphaInverted`, `lumaInverted`), at the same frame. The matte clip is any visual clip on a video track of the same sequence (the root timeline or the compound's), drawn with its own transform, opacity and animation. A matte clip that is not at that frame is an empty matte (`alpha` hides the clip, `alphaInverted` shows all of it). A matte clip that is gone is ignored. A clip cannot be its own matte. `matteOnly: true` on the matte clip hides it: it is drawn only as a matte. Without it the matte clip is drawn too, as any clip.

**Order.** A clip draws: its content, transform, opacity and fades, then its matte, then its blend mode. In a transition the two clips' picture is matted and blended as one, with the `blend` and `matte` of the clip that dominates the frame (the outgoing one in the first half). Blend and matte apply to the clip's projected picture when it is turned in 2.5D (§5.9). A clip used as a matte draws plainly there: its own `blend` and `matte` only apply where it is drawn as a clip.

```json Clip.video
{
  "id": "inside",
  "trackId": "v1",
  "kind": "video",
  "name": "Video inside the title",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "mediaId": "m1",
  "in": 0,
  "out": 3000000,
  "speed": 1,
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "crop": { "left": 0, "top": 0, "right": 0, "bottom": 0 },
  "opacity": 1,
  "volume": { "gainDb": 0, "muted": false },
  "fades": { "in": 0, "out": 0 },
  "blend": "screen",
  "matte": { "clipId": "title", "mode": "alpha" }
}
```

```json TrackMatte
{ "clipId": "title", "mode": "lumaInverted" }
```

The title clip `title` on another video track then carries `"matteOnly": true`. Schema 15 projects open unchanged (migration 15 to 16 changes nothing). `fixtures/interop/compositing` is a complete project: a test chart of the 13 modes (a gradient blended over color bars), a multiply texture over paper, a screen light leak, a video inside a text matte and an inverted luma matte, with an expected frame of each. `npm run test:render` renders them on both backends.

### 5.12 Masks (manifest keys `compositing.masks`, `compositing.maskModes`, `compositing.maskKeyframeProps`; schema 17)

**Masks.** A visual clip (`video`, `image`, `text`, `solid`, `shape`, `compound`) may carry `masks`: a list of shapes that limit where its picture shows. Each mask has a unique `id` within the clip and a `shape`: a box `{ "kind": "rect" | "ellipse", "x", "y", "w", "h", "radius"? }` (top-left corner and size; `radius` rounds a rectangle's corners) or a path `{ "kind": "path", "d": "..." }` (SVG path data: `M`, `L`, `C`, `Q`, `Z` and their relative forms; every subpath is closed; overlaps fill by the nonzero rule). Coordinates are in the clip's **content px**: the media's shown size (after its rotation metadata, before crop) for video and image, `size` for solids and shapes, the sequence size for a compound, and the laid-out text box for text. The mask moves, scales, rotates and tilts with the clip.

**Edges and combining.** `feather` (px, at least 0) softens the edge evenly inside and outside it (a feather of 40 ramps from opaque 40 px inside the outline to clear 40 px outside); `expansion` (px, negative shrinks) grows the shape before feathering; `opacity` (0 to 1) scales the mask's strength; `inverted: true` keeps the outside instead. Masks combine in list order into one coverage: `add` adds to it (capped at 1), `subtract` removes from it, `intersect` keeps only where both are. A list that starts with `subtract` or `intersect` starts from the whole clip. An empty or absent list shows the whole clip.

**Animation.** Keyframe props `masks.<id>.x`, `.y`, `.w`, `.h`, `.radius`, `.feather`, `.expansion`, `.opacity` take numbers; `masks.<id>.path` takes the vector of all the path's point coordinates (`[x0, y0, x1, y1, ...]` in the order they appear in `d`, control points included) and keeps the structure of the base `d`. A path key with another point count than the base path is ignored (the base path shows). The manifest key `compositing.maskKeyframeProps` lists the props.

**Order.** A clip draws: its content (with crop), its masks, its transform, opacity and fades, then its track matte and blend mode (§5.11). A clip used as a track matte keys through its own masks. In a transition the masks of the clip that dominates the frame apply to the transition's picture. Not supported: mask tracking.

```json Clip.solid
{
  "id": "reveal",
  "trackId": "v1",
  "kind": "solid",
  "name": "Soft spotlight",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "fill": { "r": 1, "g": 1, "b": 1, "a": 1 },
  "shape": "rect",
  "size": { "w": 1080, "h": 1920 },
  "cornerRadius": 0,
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "masks": [
    { "id": "spot", "shape": { "kind": "ellipse", "x": 140, "y": 560, "w": 800, "h": 800 }, "mode": "add", "feather": 40, "expansion": 0, "opacity": 1, "inverted": false },
    { "id": "hole", "shape": { "kind": "rect", "x": 440, "y": 860, "w": 200, "h": 200, "radius": 24 }, "mode": "subtract", "feather": 0, "expansion": 0, "opacity": 1, "inverted": false }
  ],
  "keyframes": {
    "masks.spot.w": [
      { "frame": 0, "value": 0, "ease": "linear" },
      { "frame": 29, "value": 800, "ease": "linear" }
    ]
  }
}
```

```json Mask
{ "id": "shape", "shape": { "kind": "path", "d": "M80 220L280 220L280 420L80 420Z" }, "mode": "intersect", "feather": 2, "expansion": -4, "opacity": 0.8, "inverted": true }
```

A morph keys the path's points: `"masks.shape.path": [{ "frame": 0, "value": [80, 220, 280, 220, 280, 420, 80, 420], "ease": "linear" }, { "frame": 29, "value": [180, 170, 330, 320, 180, 470, 30, 320], "ease": "linear" }]`. Schema 16 projects open unchanged (migration 16 to 17 changes nothing). `fixtures/interop/masks` is a complete project: a video inside a feathered ellipse, subtract, intersect and invert on solids, a title revealed by a keyed rectangle, a path morph and a masked matte source, with an expected frame of each. `npm run test:render` renders them on both backends.

### 5.13 Effects I: blur, glow, drop shadow and outline (manifest keys `effects`, `keyframes.effectProps`; schema 18)

**The stack.** A visual clip (`video`, `image`, `text`, `solid`, `shape`, `compound`) may carry `effects`: a list applied **in order** to its picture, each one to the result of the one before (an outline then a drop shadow casts the shadow of the outlined picture; the other way round, the outline also goes round the shadow). Each effect has a unique `id` within the clip, a `type`, `enabled` (`false` keeps it in the list but skips it) and `params`, its parameters by name. A missing parameter takes its default; a parameter that the type does not have, or a value out of its range, is an error. An empty or absent list draws the clip as it is. The manifest key `effects` lists the types this build draws.

**Where they apply.** Effects work in the clip's **content px** (the same space as masks, §5.12): after its crop and masks, before its transform, opacity, fades, track matte and blend mode. So a 20 px blur is 20 content px: it scales, turns and tilts with the clip, and a drop shadow's angle turns with it. An effect may draw outside the clip's box (a glow, a shadow, a wide outline); that part is kept. Colors are `[r, g, b, a]`, straight alpha, each 0 to 1; toggles are `0` or `1`; angles are degrees, 0 pointing right and 90 down.

| Type | Parameter | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| `gaussianBlur` | `radius` | 0 to 500 px | 10 | Blur radius. |
| | `repeatEdges` | toggle | 0 | 1: the clip's edge pixels repeat outward, so the edges stay sharp and nothing bleeds out of the box. |
| `directionalBlur` | `length` | 0 to 500 px | 20 | Length of the motion streak. |
| | `angle` | -360 to 360° | 0 | Direction of the streak. |
| | `repeatEdges` | toggle | 0 | As for the gaussian blur. |
| `glow` | `mode` | `"outer"`, `"inner"` | `"outer"` | Outer: light around and over the picture. Inner: light inside its edges only. |
| | `radius` | 0 to 500 px | 20 | How far the light spreads. |
| | `intensity` | 0 to 5 | 1 | Strength; 0 draws no glow. |
| | `threshold` | 0 to 1 | 0 | Only parts brighter than this glow. |
| | `color` | RGBA | `[1, 1, 1, 1]` | Color of the light. |
| `dropShadow` | `color` | RGBA | `[0, 0, 0, 0.55]` | Shadow color and strength. |
| | `angle` | -360 to 360° | 90 | Direction the shadow falls. |
| | `distance` | 0 to 1000 px | 12 | How far it falls. |
| | `blur` | 0 to 500 px | 16 | Softness. |
| `outline` | `width` | 0 to 200 px | 6 | Stroke width, outside the picture's alpha edge. |
| | `color` | RGBA | `[1, 1, 1, 1]` | Stroke color. |

The drop shadow and the outline follow the picture's **alpha**: on a transparent PNG or a text they take its shape, on an opaque video they follow its box.

**Animation.** Every number and color parameter can be keyed: the keyframe prop is `effects.<id>.<param>` (numbers take numbers, colors take `[r, g, b, a]` vectors). Choices (`mode`) and toggles (`repeatEdges`) cannot. The manifest key `keyframes.effectProps` lists the pattern.

**Order.** A clip draws: its content (with crop), its masks, its effects, its transform, opacity and fades, then its track matte and blend mode (§5.11). In a transition the effects of the clip that dominates the frame apply to the transition's picture. A clip used as a track matte keys through its picture without its effects. The color, stylize, key and LUT types are in §5.14 (schema 19), RGB split, pixelate, mirror, wave, glitch, posterize and invert in §5.15 (schema 20).

```json Clip.solid
{
  "id": "card",
  "trackId": "v1",
  "kind": "solid",
  "name": "Glowing card",
  "start": 0,
  "duration": 60,
  "enabled": true,
  "fill": { "r": 1, "g": 0.6, "b": 0.2, "a": 1 },
  "shape": "rect",
  "size": { "w": 600, "h": 300 },
  "cornerRadius": 40,
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "effects": [
    { "id": "fx1", "type": "outline", "enabled": true, "params": { "width": 6, "color": [1, 1, 1, 1] } },
    { "id": "fx2", "type": "glow", "enabled": true, "params": { "mode": "outer", "radius": 40, "intensity": 1, "threshold": 0, "color": [0.2, 0.85, 1, 1] } },
    { "id": "fx3", "type": "dropShadow", "enabled": false, "params": { "color": [0, 0, 0, 0.55], "angle": 90, "distance": 12, "blur": 16 } }
  ],
  "keyframes": {
    "effects.fx2.intensity": [
      { "frame": 0, "value": 0, "ease": "linear" },
      { "frame": 29, "value": 1, "ease": "linear" }
    ]
  }
}
```

```json Effect
{ "id": "streak", "type": "directionalBlur", "enabled": true, "params": { "length": 120, "angle": 45, "repeatEdges": 1 } }
```

```json Effect
{ "id": "soft", "type": "gaussianBlur", "enabled": true, "params": {} }
```

The second effect takes every default (radius 10, no repeated edges). Schema 17 projects open unchanged (migration 17 to 18 changes nothing). `fixtures/interop/effects-1` is a complete project: each effect at its defaults and at extreme settings, a glow whose intensity is keyed, a stack and the same stack swapped, a disabled effect and a turned, scaled clip with a shadow, with an expected frame of each. `npm run test:render` renders them on both backends.

### 5.14 Effects II: color, stylize, keys and LUTs (manifest key `effects`; schema 19)

Seven more effect types go in the same `effects` list (§5.13), with the same rules: in order, in content px, a missing parameter takes its default, every number can be keyed (`effects.<id>.<param>`). They work on each pixel's color in straight alpha (the vignette on its place in the clip's box, the sharpen and grain on its neighborhood); the keys change only alpha.

| Type | Parameter | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| `colorAdjust` | `exposure` | -5 to 5 EV | 0 | Multiplies the color by 2 to the power of this (applied first). |
| | `temperature` | -100 to 100 % | 0 | Positive warms (red up, blue down by up to 0.2). |
| | `tint` | -100 to 100 % | 0 | Positive toward magenta, negative toward green. |
| | `brightness` | -100 to 100 % | 0 | Adds up to 0.5 to each channel. |
| | `contrast` | -100 to 100 % | 0 | Scales each channel around 0.5 (by 1 + contrast). |
| | `saturation` | -100 to 100 % | 0 | -100 is gray (Rec. 709 luma), 100 doubles the distance to it. |
| | `vibrance` | -100 to 100 % | 0 | Like saturation, stronger on duller colors. |
| | `hue` | -180 to 180° | 0 | Turns the hue (applied last, after clamping to 0..1). |
| `vignette` | `amount` | 0 to 1 | 0.5 | How dark the corners get. |
| | `radius` | 0 to 1.5 | 0.9 | Where the darkening is full, in box units: 1 at the middle of an edge of the clip's box, about 1.41 at a corner (an ellipse following its shape). |
| | `softness` | 0 to 1 | 0.6 | Width of the fade before it (the darkening starts at radius - softness). |
| `sharpen` | `amount` | 0 to 5 | 1 | Unsharp mask strength. |
| | `radius` | 0.5 to 20 px | 1.5 | Size of the detail sharpened. Alpha is kept. |
| `grain` | `amount` | 0 to 1 | 0.2 | Strength of the film grain (added to each channel). |
| | `size` | 0.5 to 20 px | 1.5 | Grain size. |
| | `animated` | toggle | 1 | 1: a new pattern each frame; 0: the same pattern on every frame. |
| `chromaKey` | `color` | RGBA | `[0, 0.694, 0.251, 1]` | The screen color (alpha ignored). |
| | `tolerance` | 0 to 1 | 0.18 | Chroma distance (CbCr) keyed out fully. |
| | `softness` | 0 to 1 | 0.12 | Width of the partly transparent edge beyond the tolerance. |
| | `spill` | 0 to 1 | 0.6 | Spill suppression: the screen's channel (green or blue, whichever dominates the key color) is pulled down to the other two. |
| `lumaKey` | `threshold` | 0 to 1 | 0.1 | Pixels darker than this (Rec. 709 luma) become clear. |
| | `softness` | 0 to 1 | 0.1 | Width of the edge above the threshold. |
| | `invert` | toggle | 0 | 1: keys out the bright parts instead. |
| `lut` | `file` | file | `""` | The `.cube` file, a path in the project's `luts/` folder (`""`: none, the effect draws nothing). Not keyable. |
| | `intensity` | 0 to 1 | 1 | Mix between the original color (0) and the LUT's (1). |

**LUT files.** A LUT is an Adobe/Resolve `.cube` 3D LUT (`LUT_3D_SIZE` 2 to 65, optional `DOMAIN_MIN` and `DOMAIN_MAX`, rows red-fastest) stored in the project's `luts/` folder; the editor copies an imported file there, so the project never depends on its original place. The path is relative to the project folder, with forward slashes, no `..`, no leading dot and no characters that a file name cannot hold. 1D LUTs are not read. The LUT is applied with trilinear interpolation at 8 bits per channel. A missing or unreadable file draws the clip without the effect.

**Keys and alpha.** The chroma key computes alpha from the CbCr distance to the key color and multiplies it into the clip's alpha; the luma key does the same from luma. Effects after a key see the keyed picture (a drop shadow after a chroma key follows the subject).

```json Clip.video
{
  "id": "talent",
  "trackId": "v1",
  "kind": "video",
  "name": "Green screen",
  "start": 0,
  "duration": 90,
  "enabled": true,
  "mediaId": "m1",
  "in": 0,
  "out": 3000000,
  "speed": 1,
  "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "anchor": { "x": 0.5, "y": 0.5 }, "flipH": false, "flipV": false },
  "opacity": 1,
  "crop": { "left": 0, "top": 0, "right": 0, "bottom": 0 },
  "volume": { "gainDb": 0, "muted": false },
  "fades": { "in": 0, "out": 0 },
  "effects": [
    { "id": "key", "type": "chromaKey", "enabled": true, "params": { "color": [0, 0.694, 0.251, 1], "tolerance": 0.18, "softness": 0.12, "spill": 0.6 } },
    { "id": "grade", "type": "colorAdjust", "enabled": true, "params": { "exposure": 0.3, "temperature": 15, "saturation": -10 } },
    { "id": "look", "type": "lut", "enabled": true, "params": { "file": "luts/warm.cube", "intensity": 0.5 } }
  ]
}
```

```json Effect
{ "id": "film", "type": "grain", "enabled": true, "params": { "amount": 0.15, "size": 2, "animated": 1 } }
```

Schema 18 projects open unchanged (migration 18 to 19 changes nothing). **Looks** (an effect stack saved by name) live in the editor's own storage, not in the project: applying one writes its effects into the clip, and its LUT files into `luts/`. `fixtures/interop/effects-2` is a complete project: each Effects II type, a green screen keyed with spill suppression and a LUT at intensity 0.5, with an expected frame of each.

### 5.15 Effects III and adjustment clips (manifest keys `effects`, `compositing.adjustment`; schema 20)

Seven more effect types go in the same `effects` list (§5.13), with the same rules: in order, in content px (the clip's own px, scaled with it), a missing parameter takes its default, every number can be keyed (`effects.<id>.<param>`); choices (`side`, `direction`) and the glitch's `seed` cannot. RGB split, pixelate, mirror, wave and glitch read other pixels of the picture: past the clip's box the picture is transparent (a wave pulls transparency in at the edges).

| Type | Parameter | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| `rgbSplit` | `distance` | 0 to 500 px | 8 | Red is read this far along the angle, blue as far the other way, green in place; alpha is the largest of the three. |
| | `angle` | -360 to 360° | 0 | Direction of the split: red is read along it, so the red copy shows moved the other way (0: red to the left and blue to the right; 90: red up, blue down). |
| `pixelate` | `size` | 1 to 500 px | 16 | Square cells from the box's top-left corner, each the color at its middle. |
| `mirror` | `side` | `left`, `right`, `top`, `bottom` | `left` | The half that is kept; the other half shows its reflection. |
| | `center` | 0 to 1 | 0.5 | Where the line is across the box (0: left or top edge). |
| `wave` | `amplitude` | 0 to 500 px | 20 | How far rows (or columns) move. |
| | `wavelength` | 2 to 4000 px | 200 | Length of one wave, from the box's top (or left). |
| | `direction` | `horizontal`, `vertical` | `horizontal` | Horizontal moves each row sideways; vertical moves each column up and down. |
| | `speed` | -10 to 10 waves/s | 1 | The wave travels this many wavelengths per second of the clip (0: still). |
| `glitch` | `amount` | 0 to 1 | 0.5 | Share of the bands that move. |
| | `band` | 2 to 400 px | 24 | Band height, from the box's top. |
| | `shift` | 0 to 1000 px | 60 | Largest sideways move of a band. |
| | `split` | 0 to 200 px | 8 | RGB split inside the moved bands (red and blue apart by this). |
| | `rate` | 0 to 60 /s | 12 | New patterns per second of the clip (0: one pattern). |
| | `seed` | 0 to 9999, integer | 0 | Picks the patterns; the same seed and time give the same picture. Not keyable. |
| `posterize` | `levels` | 2 to 64 | 6 | Steps per channel (straight color, rounded to the nearest step). |
| `invert` | `amount` | 0 to 1 | 1 | Mix toward the inverted color (1 - c per channel, straight color). |

**Time.** A wave's phase and a glitch's pattern follow the frame within the clip (`(frame - start) / fps`), so a frame renders the same wherever it is drawn. The glitch picks its bands with an integer hash: both backends draw the same bands.

**Adjustment clips.** A clip of kind `adjustment` on a video track has no picture of its own. During its range its `effects` apply to the composite of every layer below it in the same sequence (the tracks under it, already blended, with their masks, effects and mattes); its masks (`masks`, in project px over the frame: the box is the frame, x from the left, y from the top) limit where the result shows and its `opacity` (with keys and fades) mixes the result with the unaffected picture. It has no transform, parent, blend mode or matte, cannot be a track matte, and its keys are only `opacity`, `masks.<id>.*` and `effects.<id>.*`. With no enabled effect it changes nothing. Inside a compound clip it adjusts the layers below it in that sequence only. Adjustment clips on hidden or muted tracks are skipped like any clip; with depth sorting (2.5D) the layers between two adjustments are sorted among themselves and the adjustments keep their track order.

```json Clip.adjustment
{
  "id": "grade",
  "trackId": "v3",
  "kind": "adjustment",
  "name": "Black and white",
  "start": 30,
  "duration": 60,
  "enabled": true,
  "effects": [{ "id": "bw", "type": "colorAdjust", "enabled": true, "params": { "saturation": -100 } }],
  "opacity": 1,
  "masks": [{ "id": "spot", "shape": { "kind": "ellipse", "x": 140, "y": 460, "w": 800, "h": 1000 }, "mode": "add", "feather": 60, "expansion": 0, "opacity": 1, "inverted": false }],
  "fades": { "in": 6, "out": 6 }
}
```

```json Effect
{ "id": "hit", "type": "glitch", "enabled": true, "params": { "amount": 0.35, "band": 32, "shift": 120, "split": 12, "rate": 8, "seed": 42 } }
```

A minimal adjustment clip needs only `id`, `trackId`, `kind`, `start` and `duration`: the name becomes "Adjustment", `effects` an empty list and `opacity` 1. Schema 19 projects open unchanged (migration 19 to 20 changes nothing). `fixtures/interop/effects-3` is a complete project: an adjustment clip turning everything below it black and white inside an ellipse mask (and only during its range), each Effects III type, a glitch whose pattern changes over time and an adjustment with two effects at half opacity, with expected frames.

### 5.16 Audio v2: track mixer, pan, fade curves and loudness (manifest keys `audio.trackGain`, `audio.pan`, `audio.loudness`, `audio.beatMarkers`, `audio.trackGainDb`, `audio.panRange`, `audio.fadeCurves`; schema 21)

Four additions, all optional; a missing field means "as before", so schema 20 projects open unchanged (migration 20 to 21 changes nothing).

- **Track mixer.** An audio track may carry `gainDb` (-60 to 12 dB, default 0) and `pan` (-1 left to 1 right, default 0). They apply to the sum of the track's clips, after each clip's own gain, fades and pan. A value of 0 is not written. Muted and solo tracks stay as they were (`muted`, `solo`).
- **Clip pan.** `volume.pan` (-1 to 1, default 0) places one clip. It can be keyed with the keyframe property `volume.pan` (same keys as `volume.gainDb`: frames from the clip's start, an ease per key). Pan uses an equal-power law: at -1 only the left channel sounds, at 0 both at about 0.707, at 1 only the right.
- **Fade curve.** `fades.curve` is `linear`, `equalPower` (the default, a quarter sine) or `exponential` (`(e^(5t) - 1) / (e^5 - 1)`). It shapes both fades of the clip. Crossfades between neighbours are always equal power.
- **Loudness target.** `settings.loudness` is `{ "targetLufs", "truePeakDb" }` (-40 to 0 LUFS, -20 to 0 dBTP) or null or missing (no normalization). An export applies it to the final mix: the whole mix is measured (ITU-R BS.1770-4 integrated loudness, gates at -70 LUFS and -10 LU), gain is applied to reach the target, and a 5 ms look-ahead limiter keeps the true peak (4x oversampled) under the ceiling. The short-form export presets set -14 LUFS and -1 dBTP.

Beat markers are plain markers (color `teal`, label `Beat`), one per detected beat; there is no special field.

```json Track
{ "id": "a2", "name": "Click", "kind": "audio", "muted": false, "solo": false, "locked": false, "hidden": false, "targeted": false, "height": "M", "clipIds": [], "gainDb": -6, "pan": -1 }
```

```json Volume
{ "gainDb": 0, "muted": false, "pan": -0.5 }
```

```json Fades
{ "in": 9, "out": 0, "curve": "exponential" }
```

```json Loudness
{ "targetLufs": -14, "truePeakDb": -1 }
```

A minimal use is `"pan": 0.3` in an existing clip's `volume`, or `"gainDb": -3` on an audio track. `fixtures/interop/audio` holds a project with all four, a stereo file at -20 LUFS and a 120 BPM click track.

### 5.17 Time remap, reverse and frame blending (manifest key `time`; schema 22)

Three optional fields of video clips (`reverse` also of audio clips); a missing field means "as before", so schema 21 projects open unchanged (migration 21 to 22 changes nothing).

- **`timeRemap`** is a list of keys `{ "frame", "sourceUs", "ease" }`: the source time shown at a clip-relative frame. The first key is at frame 0 and the last at the clip's `duration`; frames strictly increase; `ease` (the ease of the segment that starts at the key) is any keyframe ease id. Between keys the source time is interpolated, so a segment may stand still (equal `sourceUs`: a freeze) or go backward. The curve replaces `speed` for the picture and mutes the audio linked to the clip (same `linkGroup`). `in` and `out` stay the nominal source range.
- **`reverse`** (`true`) plays the clip's source range backward, picture and sound. Ignored when `timeRemap` is set.
- **`frameBlend`** (`true`, video only) mixes the two source frames around the shown time when the clip plays slower than its media's frame rate. Off by default; there is no optical flow.

```json RemapKey
{ "frame": 18, "sourceUs": 5440000, "ease": "easeOut" }
```

`fixtures/interop/time` holds a Hero ramp (fast, slow, fast), a reversed clip and a 25 percent clip with frame blending, with the expected source times in `expected/source-times.json`.

**Lottie clips (manifest keys `lottie`, true, and `media.lottieFormats`: `json`, `lottie`).** A Lottie animation (a bodymovin `.json` file or a `.lottie` archive) is a media of `kind` `"lottie"` and plays as a `lottie` clip on a video track, resolution independent: it is drawn at the size it is shown at, so a clip scaled to 300 percent stays sharp, in the preview, the export and `cli render`, on both backends. The media record carries the animation's own facts: `width` and `height` (its `w` and `h`), `fps` (its frame rate as a ratio), `durationUs` (`(op - ip) / fr`) and `codec` (`lottie` for a `.json`, `dotlottie` for an archive). A file that is not an animation, or has no frames, size or layers, is refused when imported and by `validate`.

- A `lottie` clip has the fields of an image clip (`transform`, `opacity`, `fades`, `blend`, `matte`, `masks`, `effects`, keyframes) plus `in`, `out` and `speed` like a video clip. Like an image, its `out` is not bound by the media length: the clip may be longer than the animation.
- **`loop`** (`true`) repeats the animation from its start while the clip lasts; absent or `false` holds the last frame after the end. The animation time is `(frame - start) * speed / fps + in`, wrapped when `loop` is set. `reverse` and `timeRemap` are not allowed on a Lottie clip.
- **`colorOverrides`** is a list of `{ "from", "to" }` colors (RGBA, channels 0 to 1, the same as Lottie writes them). Every solid fill, stroke and keyed color of the animation equal to `from` (within one 8-bit step) becomes `to`; the first matching row wins. Gradient colors are not replaced. Clips of the same media with the same overrides share their frames.

```json ColorOverride
{ "from": { "r": 1, "g": 0.5, "b": 0.1, "a": 1 }, "to": { "r": 0.2, "g": 0.8, "b": 0.3, "a": 1 } }
```

`fixtures/interop/lottie` holds three animations (`spinner.json`, `bounce.json` and the archive `pulse.lottie`, original and CC0, with `LICENSE.md`) in a 60 fps project: a looping spinner, the spinner with two replaced colors at speed 2, the bounce with and without a replaced color, and the archive scaled to 300 percent, with expected frames in `expected/`. `npm run test:render` renders them on both backends. Schema 22 projects open unchanged (migration 22 to 23 changes nothing). Editing the inside of an animation beyond color overrides is not part of this version.

**Templates: compound clips with parameters (manifest keys `templates`, true, and `templateParamKinds`: `text`, `color`, `number`, `media`, `font`, `toggle`; schema 24).** Any compound clip's sequence can expose named parameters, and every compound clip that shows the sequence carries its own values. The sequence is shared (editing it changes every instance); the values only replace the target fields while the instance is evaluated, so one sequence shows as many different cards as there are instances. Schema 23 projects open unchanged (migration 23 to 24 changes nothing).

- **`sequences.<id>.params`** is a list of parameters: `id` (unique in the sequence), `label` (the name shown and the name `fill` matches, one line, at most 40 characters), `kind` (`text`, `color`, `number`, `media`, `font` or `toggle`), `targets` (a list of `{ "clipId", "path" }`: the fields of clips of this sequence the value is written to) and `default` (a value of the kind). A `number` parameter may have `min` and `max`.
- A `path` is a dotted path into the target clip (`text.value`, `fill`, `size.w`, `enabled`, `style.fontFamily`, `mediaId`). The roots `id`, `trackId`, `kind`, `start`, `duration`, `sequenceId`, `linkId` and `linkGroup` are refused. The field must hold a value of the kind: text for `text` and `font`, an RGBA color (channels 0 to 1) for `color`, a number for `number`, a media id of the project for `media`, a boolean for `toggle`. A target whose clip was deleted, or an optional field the clip does not have, is allowed and sets nothing; a target clip of another sequence is an error.
- **`clips.<id>.params`** (compound clips only) maps parameter ids to values. A missing entry leaves the field as the sequence has it (new instances start from the defaults); an entry that no longer fits the parameter, or names an unknown parameter, is an error for `validate` and is ignored when drawing.
- Caches that depend on a clip's fields (text rasters, textures) are keyed on the values, so instances with equal values share their frames and instances with different values never do.

```json TemplateParam
{ "id": "p1", "label": "Title text", "kind": "text", "targets": [{ "clipId": "card-title", "path": "text.value" }], "default": "Title" }
```

`npm run cli -- fill <folder> <values.json>` writes values into the instances: `values.json` is `{ "<instance clip id or name>": { "<parameter id or label>": <value> } }`, a color may be `"#rrggbb"`, and nothing is written unless every entry is valid (all or nothing; the project is validated again before it is saved).

`fixtures/interop/templates` holds a paper card template (title and body text, an accent color for the bar and the dot, a width and a visibility toggle) with three instances, `values.json` for `fill`, and the expected frames in `expected/`. `fill` on the project without values reproduces the committed project. A template saved in the editor is the sequence tree, its clips, its media files and the fonts of its text, stored in the global store and in the library folder's `templates/` (one folder per template); a public template marketplace is not part of this version.

## 6. Captions and word timings

The caption track's `captionTracks[<track id>].style` styles every cue; a cue's `styleOverride` sets only the fields it changes. A cue is a `caption` clip with `text` (`\n` for line breaks) and optional `words`: `start` and `end` are integer frames relative to the cue's start, `end` after `start`. A word may start before the cue or end after it: an in-trim keeps the words it hides (negative frames), so a trim back shows them again. With word timings the active word is highlighted as the style's `highlight` says.

```json Clip
{
  "id": "q1",
  "trackId": "cc1",
  "kind": "caption",
  "name": "Cue 1",
  "start": 0,
  "duration": 30,
  "enabled": true,
  "text": "Hello there",
  "words": [
    { "text": "Hello", "start": 0, "end": 12 },
    { "text": "there", "start": 12, "end": 30 }
  ],
  "styleOverride": { "text": { "fontSize": 88 }, "highlight": { "mode": "scale" } }
}
```

### 6.1 Captions v2: progressive words, emphasis, cue animations, word boxes (manifest keys `captions.highlightModes`, `captions.wordEmphasis`, `captions.cueAnims`, `captions.boxModes`, `captions.wordsImport`; schema 6)

Every field is optional: a project without them draws as before, and schema 5 projects open unchanged.

- `highlight.mode` also takes `progressive` (each word turns from `inactiveColor` to `color` as it starts and stays) and `reveal` (the words that have not started are hidden; the spoken one shows in `color`, the earlier ones in `inactiveColor`). The same holds in the preview, the export and `cli render`.
- `highlight.emphasisColor`: the color of the emphasis words, from the cue's first frame on. A word with `"emphasis": true` takes it; a word's own `color` wins over everything. A cue override can set `emphasisColor` but not remove the track's.
- `anim` (on a caption style and in a cue's `styleOverride`): `in` and `out`, each `{ "kind": "fade" | "pop" | "slideUp" | "slideDown", "frames": <integer >= 0> }`. `frames` count project frames, are clamped to half the cue, and `0` means none (a cue uses it to drop its track's animation). `fade` is linear in opacity, `pop` grows from 60% (and back), the slides move by half the caption's height.
- `text.background.mode` also takes `word`: one box per word, with the background's padding, radius, stroke and shadow. With the `background` highlight the spoken word's box takes the highlight color.
- Text presets may carry `captionAnim` (the same `in` / `out`), applied with the preset.

`fixtures/interop/captions-v2/` has a project that uses all of this and `words.json`, the word timings the editor's **Import words** reads: an array of `{ "word", "startMs", "endMs" }` (or `{ "words": [...] }`, or Whisper's `segments`), seconds or milliseconds (`"unit"`), with an optional `cues` list of `{ "from", "to", "emphasis": [word indexes] }` that makes exactly those cues; without it the dialog's rules (words per cue, characters per line, lines, breaks at punctuation and pauses) cut the words.

```json Clip
{
  "id": "q2",
  "trackId": "cc1",
  "kind": "caption",
  "name": "Cue q2",
  "start": 50,
  "duration": 40,
  "enabled": true,
  "text": "what happens\nnext today",
  "words": [
    { "text": "what", "start": 0, "end": 6 },
    { "text": "happens", "start": 6, "end": 16, "emphasis": true },
    { "text": "next", "start": 16, "end": 25 },
    { "text": "today", "start": 25, "end": 38, "color": { "r": 0.2, "g": 0.35, "b": 0.95, "a": 1 } }
  ],
  "styleOverride": {
    "highlight": { "mode": "reveal", "emphasisColor": { "r": 1, "g": 0.36, "b": 0.3, "a": 1 } },
    "anim": { "in": { "kind": "slideUp", "frames": 4 }, "out": { "kind": "pop", "frames": 2 } }
  }
}
```

## 7. Generator metadata and stand-ins

`meta.generator` names the tool that wrote the project; the editor shows it in the Project section of the properties panel and never changes it.

```json ProjectGenerator
{ "name": "reels-autopilot", "version": "2.3.0", "source": "script-0412.json", "url": "https://example.com/autopilot" }
```

A **stand-in** is a clip the generator baked because it could not write what it wanted natively (a layer type the editor does not have yet): an image, video or solid that looks right, carrying the native clip in `fallbackOf`. The editor stores the block as it is and never migrates, normalizes or interprets `fallbackOf.data` except to convert the stand-in into the native clip (`Make editable`, section 7.1).

- `kind` is the kind of the native clip (any kind, present or future) and equals `data.kind`.
- `data` is the native clip in the editor's own JSON, possibly sparse, timed as the stand-in was when written: `id`, `trackId`, `start` and `duration` are left out and come from the stand-in. For a compound clip `data.sequence` holds its sequence and `data.clips` its inner clips; media it needs are in `data.media`, records whose files are inside the project folder.
- `schemaVersion` is the schema version `data` follows.
- `headTrim` (frames, default 0) is how far the stand-in's first frame has moved into the clip it stands for. The editor adds to it when the stand-in is split (the right half), trimmed at its head or slipped, so a conversion starts the native clip at the same moment. Copy, paste, undo and redo keep the block.

```json FallbackOf
{ "kind": "shape", "reason": "A vector shape baked to a solid", "schemaVersion": 4, "headTrim": 5, "data": { "kind": "shape", "name": "Star", "transform": { "x": 0, "y": 0 } } }
```

Conventions for generated projects (the editor needs none of them): label colors for baked layers (violet sprite, orange overlay, red plate), bins by kind (Audio, Images, Sprites, Overlays, Plates), labeled markers at scene starts, and the optional `FALLBACKS.md` and `OPEN.txt` files shown read-only in the Project section.

`validate` and `info` say, for each stand-in, whether the editor could make it editable now (`convertible` in the JSON: `clipId`, `name`, `kind`, `convertible`, `reason`). A stand-in whose `data.kind` the editor does not have yet stays baked until it does.

Generator fallback levels, from best to worst: a **sprite** (a baked image or short video of one layer, label color violet), an **overlay** (the layer with its effects baked over transparent, orange), a **plate** (the whole frame baked, red). Use the lowest level that keeps the look.

### 7.1 Opening, updating and converting (manifest keys `interop.openLink`, `interop.externalReload`, `interop.repairOnOpen`)

- **Open link.** The user chooses a *projects folder* once (the start screen's `Projects folder` button, Settings > General); the editor keeps it in the browser, per address. `/?open=<path>` opens the project folder at `<path>` inside it (segments joined by `/`). Print that link when a generator finishes. With no projects folder set, or without permission, the start screen shows one button (`Choose your projects folder to open <path>`, `Open <path>`); a missing folder or one without `project.json` gives a toast naming the path. An opened project joins Recent projects.
- **Edit it again.** While a project is open, the editor looks at `project.json` when its window gets focus and every 5 s while the window is visible and nothing is dragging, saving or exporting. A file it did not write itself reloads in place when the user has no unsaved changes (the document that was open goes to `history/`; playhead, zoom and selection stay). With unsaved changes a banner offers `Reload` and `Keep mine`; the editor writes nothing until the user answers, and a save that follows `Keep mine` copies your version of `project.json` to `history/` first. Write the file in one piece (write a temporary file, then replace `project.json`) so a check never reads half of it.
- **Repair on open.** Media records whose `durationUs`, `width`/`height`, `fps` or `hasAudio` disagree with the file's header by more than one frame are corrected, clips that reach past a shortened media end are trimmed, and a toast gives the counts (details in `history/repair-<date>.log`). `normalize` writes the same facts, so a project it completed needs no repair.
- **Make editable.** A stand-in shows a `baked` badge on its clip and, in the properties panel, `Make editable`. The conversion takes `data` (and `data.media`, whose files are inside the folder), completes it with the field table's defaults, migrates it from `fallbackOf.schemaVersion`, places it at `start - headTrim` for `duration + headTrim` frames and applies a head trim of `headTrim` frames with the editor's own trim, then validates the project strictly. It is one undo step; what was changed on the stand-in itself (transform, opacity, keys) is not carried over. `Make all editable` (palette) converts every convertible stand-in and reports the rest. A sparse stand-in written at an older schema:

```json FallbackOf
{ "kind": "solid", "reason": "A rounded bar baked to a solid", "schemaVersion": 3, "data": { "kind": "solid", "shape": "roundedRect", "fill": { "r": 0.9, "g": 0.2, "b": 0.2 }, "size": { "w": 600, "h": 160 }, "cornerRadius": 40, "opacity": 0.8 } }
```

- **Large projects.** Up to 40 video tracks, 1,000 clips and 5,000 keyframes open in under 2 s on a warm cache (`fixtures/interop/large/`, made by `scripts/fixtures/make-large.mjs`); `fixtures/interop/standins/` has stand-ins to convert.

### 7.2 Render your project and compare it with your reference (manifest keys `cli.render`, `cli.compare`)

A generator can check its own pictures without opening the editor. `render` draws the project folder with the editor's compositor and encoders in headless Chrome or Edge (`CHROME_PATH` wins; WebGPU, or `--backend webgl2`); `compare` scores two renders frame by frame.

```
npm run build                                                  (once: the render serves dist/)
npm run cli -- render <dir> --out out/project.mp4              (MP4 with the Reels preset: --preset reels|tiktok|shorts)
npm run cli -- render <dir> --out out/part.mp4 --range 30:90   (frames 30 to 89)
npm run cli -- render <dir> --frames 0,45,89 --png out/frames  (PNGs named <project name>-frame-<n>.png, as Export frame)
npm run cli -- compare out/project.mp4 reference.mp4 --ssim 0.98 --diff out/diff
npm run cli -- compare out/frames expected-frames --json
```

- `render` exits 0 on success, 1 on a failed render (the reason is printed), 2 on a usage error. Nothing is written into the project folder; the same project renders to the same bytes on the same machine and backend.
- `compare <a> <b>`: each side is a video or a folder of PNGs (`<name>-frame-<n>.png` is frame n). Frames are matched by frame number; a video against a PNG folder compares the frames the folder names. It prints the SSIM (luma, 8x8 windows) and PSNR, the worst frames with the region that differs, and exits 1 when a frame is below `--ssim` (default 0.99) or `--psnr`, or when frames exist on one side only. `--region x,y,w,h` scores only that part, `--diff <dir>` writes difference images (amplified 8x), `--json` prints the report.
- Stand-ins render as their baked layer. A render never asks a question: offline media draw their slate and are listed in the first line.
- To test a generator: render its project, then `compare` the result with the video your own renderer made from the same project. A difference in SSIM of a few thousandths is normal (encoders, text anti-aliasing); a moved or missing layer shows as a region.

## 8. Fonts

Texts and captions name a family in `style.fontFamily`. A project that must look the same on any machine carries the font files in `fonts/` and lists them in `fonts/fonts.json` (version 2; a version 1 file reads as system fonts). Each face's `file` is a file name inside `fonts/` (TrueType, OpenType, WOFF or WOFF2); `source` is `library` (a font of the editor's library, with `origin` the library file `<slug>/<file>`), `user` or `system`.

```json FontManifest
{
  "version": 2,
  "faces": [
    { "family": "Silkscreen", "style": "Bold", "weight": 700, "italic": false, "postscriptName": "Silkscreen-Bold", "file": "silkscreen-latin-700-normal.woff2", "source": "library", "origin": "silkscreen/silkscreen-latin-700-normal.woff2" }
  ]
}
```

`validate` checks that the manifest matches the table and that every file exists and is a font.

## 9. Field reference

Generated from the field table by `npm run docs:interop`.

<!-- fields:begin (generated by `npm run docs:interop` from src/core/document/schema.ts; do not edit) -->

#### Rational

A frame rate as an exact fraction: 30 is 30/1, 29.97 is 30000/1001.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `num` | integer (>= 1) | yes |  | Numerator. |
| `den` | integer (>= 1) | yes |  | Denominator. |

#### RGBA

A color: channels 0..1, straight (not premultiplied) alpha.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `r` | number (>= 0, <= 1) | yes |  | Red. |
| `g` | number (>= 0, <= 1) | yes |  | Green. |
| `b` | number (>= 0, <= 1) | yes |  | Blue. |
| `a` | number (>= 0, <= 1) | yes | `1` | Alpha. |

#### Gradient

A vertical two-stop gradient, `from` at the top of the box it fills to `to` at the bottom.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `from` | [RGBA](#rgba) | yes |  | Top color. |
| `to` | [RGBA](#rgba) | yes |  | Bottom color. |

#### GradientFill

A gradient with 2 to 8 stops, linear or radial (Batch 58).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | `"linear"` | `"radial"` | yes | `"linear"` | Linear or radial. |
| `angle` | number | yes | `0` | Linear: degrees, 0 = top to bottom, clockwise. |
| `center` | [FractionPoint](#fractionpoint) | yes | `{"x":0.5,"y":0.5}` | Radial: the center, fractions of the box. |
| `radius` | number (>= 0) | yes | `1` | Radial: a fraction of half the box diagonal. |
| `stops` | [GradientStop](#gradientstop)[] | yes |  | 2 to 8 stops, `at` ascending. |

#### GradientStop

One color of a gradient.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `at` | number (>= 0, <= 1) | yes |  | Position along the gradient. |
| `color` | [RGBA](#rgba) | yes |  | Color. |

#### FractionPoint

A point as fractions of a box.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | yes |  | Fraction of the width. |
| `y` | number | yes |  | Fraction of the height. |

#### StrokeStyle

The outline of a solid or a picture (Batch 58); absent: none.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `width` | number (>= 0) | yes | `3` | Width, project px. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":1}` | Color. |
| `align` | `"inside"` | `"center"` | `"outside"` | yes | `"inside"` | Inside the edge, centered on it or outside it. |
| `dash` | number (>= 0)[] | no |  | Dash and gap lengths, project px (at most 4 are drawn); absent: a solid line. |
| `dashOffset` | number | no |  | Where the pattern starts along the outline, project px. |

#### ShadowStyle

The shadow of a solid or a picture (Batch 58); absent: none. `blur` 0 is a hard edge.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | yes | `7` | Offset x, project px. |
| `y` | number | yes | `7` | Offset y, project px. |
| `blur` | number (>= 0) | yes | `0` | Blur, project px (0: a hard edge). |
| `spread` | number | yes | `0` | Grows the shadow by this much on every side, project px. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":1}` | Color. |

#### Transform

Where a layer sits. x and y are project pixels from the project center (right and down are positive); scale 1 is the native size.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | yes | `0` | Horizontal offset, project px. |
| `y` | number | yes | `0` | Vertical offset, project px. |
| `scale` | number (> 0) | yes | `1` | Scale (the horizontal one when `scaleY` is present). |
| `scaleY` | number (> 0) | no |  | Vertical scale when it differs from `scale`. |
| `rotation` | number | yes | `0` | Degrees, clockwise. |
| `rotationX` | number | no | `0` | 2.5D (Batch 70): degrees about the layer's horizontal axis through its anchor (the top tips away for positive values). |
| `rotationY` | number | no | `0` | 2.5D (Batch 70): degrees about the layer's vertical axis through its anchor. |
| `z` | number | no | `0` | 2.5D (Batch 70): depth, project px; positive is farther away. |
| `anchor` | [Anchor](#anchor) | yes | `{"x":0.5,"y":0.5}` | The point the layer turns and scales around, fractions of its size from its top-left corner (0.5, 0.5 is the center). |
| `flipH` | boolean | yes | `false` | Mirrored left to right. |
| `flipV` | boolean | yes | `false` | Mirrored top to bottom. |

#### Anchor

A point as fractions of a layer's size from its top-left corner.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | yes |  | Horizontal. |
| `y` | number | yes |  | Vertical. |

#### Crop

The part of the picture cut off each side, fractions 0..1 of the media size.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `left` | number (>= 0, <= 1) | yes | `0` | Left. |
| `top` | number (>= 0, <= 1) | yes | `0` | Top. |
| `right` | number (>= 0, <= 1) | yes | `0` | Right. |
| `bottom` | number (>= 0, <= 1) | yes | `0` | Bottom. |

#### Volume

A clip's sound level.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `gainDb` | number (>= -60, <= 12) | yes | `0` | Gain in dB. |
| `muted` | boolean | yes | `false` | Silenced. |
| `pan` | number (>= -1, <= 1) | no | `0` | Audio clips (Batch 77): -1 (left) to 1 (right). Absent: 0. Keyframe prop `volume.pan`. |

#### Fades

Fade lengths at the clip's edges.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `in` | integer (>= 0) | yes | `0` | Fade in. Integer frames at the project frame rate. |
| `out` | integer (>= 0) | yes | `0` | Fade out. Integer frames at the project frame rate. |
| `curve` | `"linear"` | `"equalPower"` | `"exponential"` | no | `"equalPower"` | Audio fades (Batch 77): the shape. Absent: equalPower. |

#### Loudness

The export loudness target (Batch 77): the mixdown is measured, one gain brings it to the target and a true-peak limiter holds the ceiling.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `targetLufs` | number (>= -40, <= 0) | yes | `-14` | Integrated loudness, LUFS (ITU-R BS.1770-4). |
| `truePeakDb` | number (>= -20, <= 0) | yes | `-1` | True-peak ceiling, dBTP. |

#### Keyframe

One keyframe: a value at a frame relative to the clip start. A key's `ease` shapes the segment from it to the next key.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `frame` | integer | yes |  | Relative to the clip start; one key per frame, sorted. Any integer: after a head trim keys before the clip start (negative) or past its end are kept so a trim back restores them. Integer frames at the project frame rate. |
| `value` | number, or number[] (1 to 4096 items) | yes |  | The value: a number, or for a color property an array [r, g, b, a] (straight alpha, 0..1, interpolated per channel), a point [x, y], or a path mask's points [x0, y0, x1, y1, ...] (Batch 73). |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | yes | `"linear"` | The curve to the next key. |
| `bezier` | number[] (4 items) | no |  | Ease `bezier`: the CSS cubic-bezier(x1, y1, x2, y2); x1 and x2 are 0..1 (Batch 60). |
| `spring` | [KeySpring](#keyspring) | no |  | Ease `spring`: damping and frequency; 0.7 and 4 when absent (Batch 60). |
| `spatialIn` | number[] (2 items) | no |  | `transform.position` keys: the motion path's incoming tangent [x, y], relative to the key's point (Batch 69). |
| `spatialOut` | number[] (2 items) | no |  | `transform.position` keys: the motion path's outgoing tangent [x, y], relative to the key's point (Batch 69). |

#### KeySpring

The parameters of a `spring` ease: a damped cosine over the segment that ends exactly on the next key's value.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `damping` | number (>= 0) | yes | `0.7` | Decay over the segment (0 never decays). |
| `frequency` | number (> 0) | yes | `4` | Oscillations over the segment. |

#### Keyframes

Keyframe lists by property id, each sorted by frame.

Value: object of [Keyframe](#keyframe)[] (keys: `transform.x`, `transform.y`, `transform.scale`, `transform.scaleY`, `transform.rotation`, `opacity`, `volume.gainDb`, `volume.pan`, `transform.anchor.x`, `transform.anchor.y`, `crop.left`, `crop.top`, `crop.right`, `crop.bottom`, `size.w`, `size.h`, `cornerRadius`, `fill`, `stroke.width`, `stroke.color`, `stroke.dashOffset`, `shadow.x`, `shadow.y`, `shadow.blur`, `shadow.spread`, `shadow.color`, `style.fontSize`, `style.letterSpacing`, `style.fill`, `text.counter.value`, `transform.position`, `transform.rotationX`, `transform.rotationY`, `transform.z`, and keys matching `^paths\.([A-Za-z0-9_-]+)\.(trim\.(?:start|end|offset)|stroke\.(?:width|color|dashOffset)|fill|primitive\.([A-Za-z]+))$`, `^animators\.([A-Za-z0-9_-]+)\.(selector\.(?:start|end|offset)|props\.(?:x|y|scale|rotation|opacity|blur|tracking|fill))$`, `^masks\.([A-Za-z0-9_-]+)\.(x|y|w|h|radius|feather|expansion|opacity|path)$`, `^effects\.([A-Za-z0-9_-]+)\.([A-Za-z][A-Za-z0-9]*)$`).

#### Transition

A transition at the cut between two abutting clips: the left clip's `transitionOut` and the right clip's `transitionIn` hold the same values.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Shared by the two clips of the cut. |
| `kind` | `"crossDissolve"` | `"dipToBlack"` | `"dipToWhite"` | `"slide"` | `"push"` | `"wipe"` | `"iris"` | `"zoomIn"` | `"zoomOut"` | `"whip"` | `"blurDissolve"` | `"glitch"` | `"flash"` | yes |  | The look. |
| `before` | integer (>= 0) | yes |  | Frames before the cut. Integer frames at the project frame rate. |
| `after` | integer (>= 0) | yes |  | Frames after the cut. Integer frames at the project frame rate. |
| `direction` | `"left"` | `"right"` | `"up"` | `"down"` | no | `"left"` | Slide, push, whip: the way the picture travels. |
| `angle` | number | no | `0` | Wipe: degrees, 0 = the edge travels left to right, 90 = top to bottom. |
| `softness` | number | no | `0` | Wipe, iris: the soft width of the edge, 0 to 1. |
| `center` | [FractionPoint](#fractionpoint) | no | `{"x":0.5,"y":0.5}` | Iris: the circle's center, fractions of the frame. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | no |  | The progress curve. Absent = the linear mix of schema 14 and before; the motion kinds are created with easeInOut. |

#### RemapKey

A key of a clip's `timeRemap` (Batch 78): the source time the picture shows at a clip-relative frame. The first key is at frame 0, the last at the clip's duration; frames strictly increase.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `frame` | integer (>= 0) | yes |  | Clip-relative frame. Integer frames at the project frame rate. |
| `sourceUs` | integer (>= 0) | yes |  | Source time shown. Integer microseconds. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | yes | `"linear"` | The curve of the segment that starts at this key (linear: a constant speed). |

#### ColorOverride

A color change of a lottie clip (Batch 79): colors of the animation equal to `from` (within one 8-bit step) become `to`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `from` | [RGBA](#rgba) | yes |  | The color to replace (channels 0..1). |
| `to` | [RGBA](#rgba) | yes |  | The color that replaces it (channels 0..1). |

#### TrackMatte

A track matte (Batch 72): the clip shows only where the matte clip is opaque (alpha) or bright (luma) at the frame, or the opposite (inverted).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `clipId` | string (not empty) | yes |  | A visual clip of a video track in the same sequence (not the clip itself). While it is not at the frame the matte is empty: alpha and luma hide the clip, the inverted modes show it whole. |
| `mode` | `"alpha"` | `"alphaInverted"` | `"luma"` | `"lumaInverted"` | yes | `"alpha"` | What of the matte clip is used. |

#### Mask

A mask (Batch 73): the clip shows only where its masks, combined in order, cover it. Values are in the clip's content px (a picture's own px, a solid's size, a text box, a shape's view box, a compound's sequence frame).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique among the clip's masks: letters, digits, `_` or `-` (keyframe ids are `masks.<id>.<field>`). |
| `shape` | [MaskBox](#maskbox) | [MaskPath](#maskpath) | yes |  | A rectangle or ellipse box, or a closed path. |
| `mode` | `"add"` | `"subtract"` | `"intersect"` | yes | `"add"` | How it combines with the masks before it: add (union), subtract, intersect. A first mask that subtracts or intersects starts from the whole clip. |
| `feather` | number (>= 0) | yes | `0` | Edge softness on each side of the outline, content px (0 keeps a one pixel antialiased edge). |
| `expansion` | number | yes | `0` | Grows the shape by this many content px (negative shrinks it). |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Scales the mask's coverage. |
| `inverted` | boolean | yes | `false` | Uses the outside of the shape. |

#### Effect

An effect (Batch 74; color, stylize, keys and LUTs since Batch 75): one step of a visual clip's effect stack, applied in order to its picture in content space (after its masks, before its transform, opacity, blend and matte). The parameters of each type, their ranges and defaults are listed in INTEROP.md §5.13 and §5.14; a missing parameter takes its default.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique among the clip's effects: letters, digits, `_` or `-` (keyframe ids are `effects.<id>.<param>`). |
| `type` | `"gaussianBlur"` | `"directionalBlur"` | `"glow"` | `"dropShadow"` | `"outline"` | `"colorAdjust"` | `"vignette"` | `"sharpen"` | `"grain"` | `"chromaKey"` | `"lumaKey"` | `"lut"` | `"rgbSplit"` | `"pixelate"` | `"mirror"` | `"wave"` | `"glitch"` | `"posterize"` | `"invert"` | yes |  | The effect type. |
| `enabled` | boolean | yes | `true` | Off: the effect is kept but not drawn. |
| `params` | object of number, string, or number[] (1 to 4 items) by id | yes | `{}` | Parameters by name: numbers (toggles are 0 or 1), colors [r, g, b, a] (straight alpha, 0..1), choices (strings) and files (a project path such as `luts/warm.cube`, or "" for none). Only the type's parameters, each in its range. |

#### MaskBox

A rectangle or an ellipse mask shape (Batch 73), content px.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"rect"` | `"ellipse"` | yes |  | Kind. |
| `x` | number | yes |  | Left edge. |
| `y` | number | yes |  | Top edge. |
| `w` | number (>= 0) | yes |  | Width. |
| `h` | number (>= 0) | yes |  | Height. |
| `radius` | number (>= 0) | no | `0` | Rectangles: corner radius (at most half the shorter side). |

#### MaskPath

A path mask shape (Batch 73): SVG path data in content px; every subpath is closed. Its points (every coordinate pair of the parsed M, L, C form in order) are the value of `masks.<id>.path` keys.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"path"` | yes |  | Kind. |
| `d` | string | yes |  | SVG path data (M L H V C S Q T A Z, absolute or relative). |

#### FallbackOf

Marks a clip as a baked stand-in for a clip kind or feature a tool could not write natively. `data` is opaque apart from its `kind`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | string (not empty) | yes |  | The kind of the native clip it stands for (any kind, present or future); equals `data.kind`. |
| `reason` | string | yes |  | Why the stand-in exists. |
| `schemaVersion` | integer (>= 1) | yes |  | The schema version `data` follows. |
| `headTrim` | integer (>= 0) | no | `0` | How far the stand-in's first frame moved into the native clip (split, head trim, slip). Integer frames at the project frame rate. |
| `data` | object (opaque) | yes |  | The native clip in the editor's JSON, without `id`, `trackId`, `start` and `duration`. |

#### TextBox

How a text box is sized.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `"auto"` | `"fixed"` | yes | `"auto"` | `auto` fits the lines; `fixed` wraps words at `width`. |
| `width` | number (> 0) | yes | `900` | Wrap width in project px (used while fixed). |

#### TextContent

What a text clip says.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | string | yes |  | Plain text with `\n` line breaks. |
| `box` | [TextBox](#textbox) | yes |  | Its box. |

#### TextStroke

An outline drawn outside the glyphs.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | yes | `false` | Drawn. |
| `width` | number (>= 0) | yes | `6` | Width, project px. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":1}` | Color. |

#### TextShadow

A drop shadow of the text.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | yes | `false` | Drawn. |
| `x` | number | yes | `0` | Offset x, project px. |
| `y` | number | yes | `6` | Offset y, project px. |
| `blur` | number (>= 0) | yes | `16` | Blur, project px. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":0.6}` | Color. |

#### TextBackground

A box behind each line or the whole text.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | yes | `false` | Drawn. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":0.7}` | Color. |
| `paddingX` | number (>= 0) | yes | `28` | Horizontal padding, project px. |
| `paddingY` | number (>= 0) | yes | `12` | Vertical padding, project px. |
| `radius` | number (>= 0) | yes | `16` | Corner radius, project px. |
| `mode` | `"line"` | `"block"` | `"word"` | yes | `"block"` | One box per line, one for the block, or (captions) one per word. |
| `stroke` | [TextStroke](#textstroke) | no |  | The box's border, drawn inside its edge (Batch 58); absent: none. |
| `shadow` | [TextShadow](#textshadow) | no |  | The box's shadow, drawn outside it (Batch 58); absent: none. |

#### TextStyle

The look of a text clip. Sizes are project px; `lineHeight` multiplies the size.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `fontFamily` | string (not empty) | yes | `"Inter"` | A family name; a missing family draws with the UI font. |
| `fontWeight` | integer (>= 1, <= 1000) | yes | `700` | 1..1000 (variable fonts take any value in their range). |
| `italic` | boolean | yes | `false` | Italic face. |
| `fontSize` | number (> 0) | yes | `96` | Size, project px. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | [GradientFill](#gradientfill) | yes | `{"r":1,"g":1,"b":1,"a":1}` | A color or a vertical two-stop gradient. |
| `stroke` | [TextStroke](#textstroke) | yes |  | Outline. |
| `shadow` | [TextShadow](#textshadow) | yes |  | Shadow. |
| `background` | [TextBackground](#textbackground) | yes |  | Background box. |
| `textCase` | `"none"` | `"upper"` | `"lower"` | `"title"` | yes | `"none"` | Case transform. |
| `letterSpacing` | number | yes | `0` | Extra space between letters, project px. |
| `lineHeight` | number (> 0) | yes | `1.2` | Line height, a multiple of the size. |
| `align` | `"left"` | `"center"` | `"right"` | yes | `"center"` | Horizontal alignment. |
| `verticalAnchor` | `"top"` | `"middle"` | `"bottom"` | yes | `"middle"` | The edge of the box that stays in place when the text grows. |

#### TextAnim

A text clip's in or out animation, played at most over half the clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | `"fade"` | `"slideUp"` | `"slideDown"` | `"slideLeft"` | `"slideRight"` | `"pop"` | `"typewriter"` | `"wordPop"` | `"wordFade"` | `"lineReveal"` | `"blurIn"` | `"scaleBounce"` | `"typeOn"` | `"decode"` | `"tumbleIn"` | `"cascadeUp"` | `"riseByLine"` | `"popInByChar"` | `"blurInByChar"` | `"fadeInByChar"` | `"highlightSweep"` | yes |  | The animation. |
| `duration` | integer (>= 0) | yes |  | The whole animation, every unit's delay included. Integer frames at the project frame rate. |
| `perUnit` | `"char"` | `"word"` | `"line"` | no |  | What moves one by one, instead of the animation's own unit. |
| `stagger` | integer (>= 0) | no |  | Delay between two units; spread over the duration when absent. Integer frames at the project frame rate. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | no |  | Timing curve; the animation's own when absent. |

#### PresetTextAnim

A preset's animation, timed in milliseconds (presets cross frame rates).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | `"fade"` | `"slideUp"` | `"slideDown"` | `"slideLeft"` | `"slideRight"` | `"pop"` | `"typewriter"` | `"wordPop"` | `"wordFade"` | `"lineReveal"` | `"blurIn"` | `"scaleBounce"` | `"typeOn"` | `"decode"` | `"tumbleIn"` | `"cascadeUp"` | `"riseByLine"` | `"popInByChar"` | `"blurInByChar"` | `"fadeInByChar"` | `"highlightSweep"` | yes |  | The animation. |
| `durationMs` | number (>= 0) | yes |  | Whole animation, ms. |
| `perUnit` | `"char"` | `"word"` | `"line"` | no |  | What moves one by one. |
| `staggerMs` | number (>= 0) | no |  | Delay between units, ms. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | no |  | Timing curve. |

#### TextPreset

A text preset. Project presets are files in `presets/text/`; `textPresetsLocal` stays empty.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id. |
| `name` | string | yes |  | Name. |
| `style` | [TextStyle](#textstyle) | yes |  | The look, sized for a frame whose short side is 1080 px. |
| `box` | [TextBox](#textbox) | yes |  | Its box. |
| `animIn` | [PresetTextAnim](#presettextanim) | no |  | In animation. |
| `animOut` | [PresetTextAnim](#presettextanim) | no |  | Out animation. |
| `defaultDuration` | integer (>= 1) | no |  | Length of a clip made from it, ms. |
| `position` | [Anchor](#anchor) | no |  | Where the clip sits, project px from the frame center (applied when `applyPosition`). |
| `applyPosition` | boolean | yes |  | Applying also moves clips to `position`. |
| `sampleText` | string | no |  | What its button shows and a new clip reads. |
| `sets` | `"titles"` | `"subtitles"` | `"captions"`[] | no |  | The bundled sets it is in. |
| `highlight` | [CaptionHighlight](#captionhighlight) | no |  | The word highlight it gives a caption track. |
| `captionAnim` | [CaptionAnim](#captionanim) | no |  | The cue animations it gives a caption track (Batch 59). |
| `tags` | string[] | yes |  | Its user sets. |
| `favorite` | boolean | yes |  | Starred. |
| `createdAt` | string | yes |  | ISO time. |
| `updatedAt` | string | yes |  | ISO time. |

#### CaptionHighlight

How the word being spoken stands out when a cue has word timings.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `"none"` | `"color"` | `"background"` | `"scale"` | `"colorAndScale"` | `"progressive"` | `"reveal"` | yes |  | The effect. |
| `color` | [RGBA](#rgba) | yes |  | The active word's fill (color modes) or its box (background). |
| `inactiveColor` | [RGBA](#rgba) | yes |  | The fill of the other words while a cue has word timings. |
| `emphasisColor` | [RGBA](#rgba) | no |  | The fill of emphasis words from the cue's first frame (Batch 59); absent: the highlight color. |

#### CaptionStyle

The look of a caption track's cues.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `text` | [TextStyle](#textstyle) | yes |  | The text style. |
| `position` | `"bottom"` | `"center"` | `"top"` | `"custom"` | yes | `"bottom"` | Where cues sit: a preset, or `custom` at x and y. |
| `x` | number | yes | `0` | `custom`: the middle of the caption, project px from the frame center. |
| `y` | number | yes | `0` | `custom`: the middle of the caption, project px from the frame center (down is positive). |
| `maxWidth` | number (> 0) | yes |  | Words wrap at this width, project px. |
| `maxLines` | integer (>= 1) | yes |  | A cue with more lines is drawn smaller until it fits. |
| `highlight` | [CaptionHighlight](#captionhighlight) | yes |  | The word highlight. |
| `anim` | [CaptionAnim](#captionanim) | no |  | Cue in and out animations (Batch 59); absent: none. |

#### CueAnim

An animation of a cue's whole caption box at its start or end, at most half the cue long.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"fade"` | `"pop"` | `"slideUp"` | `"slideDown"` | yes |  | The animation. |
| `frames` | integer (>= 0) | yes |  | How long it runs; 0 is none (a cue override of its track's animation). Integer frames at the project frame rate. |

#### CaptionAnim

The animations of a cue's start (`in`) and end (`out`).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `in` | [CueAnim](#cueanim) | no |  | At the cue's start. |
| `out` | [CueAnim](#cueanim) | no |  | At the cue's end. |

#### CaptionTextOverride

The text style fields a cue can set over its track's; the parts of the stroke, shadow and background one by one.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `fontFamily` | string (not empty) | no |  | Family. |
| `fontWeight` | integer (>= 1, <= 1000) | no |  | Weight. |
| `italic` | boolean | no |  | Italic. |
| `fontSize` | number (> 0) | no |  | Size. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | [GradientFill](#gradientfill) | no |  | Fill. |
| `stroke` | [TextStrokeOverride](#textstrokeoverride) | no |  | Parts of the outline. |
| `shadow` | [TextShadowOverride](#textshadowoverride) | no |  | Parts of the shadow. |
| `background` | [TextBackgroundOverride](#textbackgroundoverride) | no |  | Parts of the background box. |
| `textCase` | `"none"` | `"upper"` | `"lower"` | `"title"` | no |  | Case. |
| `letterSpacing` | number | no |  | Letter spacing. |
| `lineHeight` | number (> 0) | no |  | Line height. |
| `align` | `"left"` | `"center"` | `"right"` | no |  | Alignment. |

#### TextStrokeOverride

Any parts of `TextStroke`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | no | `false` | Drawn. |
| `width` | number (>= 0) | no | `6` | Width, project px. |
| `color` | [RGBA](#rgba) | no | `{"r":0,"g":0,"b":0,"a":1}` | Color. |

#### TextShadowOverride

Any parts of `TextShadow`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | no | `false` | Drawn. |
| `x` | number | no | `0` | Offset x, project px. |
| `y` | number | no | `6` | Offset y, project px. |
| `blur` | number (>= 0) | no | `16` | Blur, project px. |
| `color` | [RGBA](#rgba) | no | `{"r":0,"g":0,"b":0,"a":0.6}` | Color. |

#### TextBackgroundOverride

Any parts of `TextBackground`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | no | `false` | Drawn. |
| `color` | [RGBA](#rgba) | no | `{"r":0,"g":0,"b":0,"a":0.7}` | Color. |
| `paddingX` | number (>= 0) | no | `28` | Horizontal padding, project px. |
| `paddingY` | number (>= 0) | no | `12` | Vertical padding, project px. |
| `radius` | number (>= 0) | no | `16` | Corner radius, project px. |
| `mode` | `"line"` | `"block"` | `"word"` | no | `"block"` | One box per line, one for the block, or (captions) one per word. |
| `stroke` | [TextStroke](#textstroke) | no |  | The box's border, drawn inside its edge (Batch 58); absent: none. |
| `shadow` | [TextShadow](#textshadow) | no |  | The box's shadow, drawn outside it (Batch 58); absent: none. |

#### CaptionHighlightOverride

Any parts of `CaptionHighlight`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `"none"` | `"color"` | `"background"` | `"scale"` | `"colorAndScale"` | `"progressive"` | `"reveal"` | no |  | The effect. |
| `color` | [RGBA](#rgba) | no |  | The active word's fill (color modes) or its box (background). |
| `inactiveColor` | [RGBA](#rgba) | no |  | The fill of the other words while a cue has word timings. |
| `emphasisColor` | [RGBA](#rgba) | no |  | The fill of emphasis words from the cue's first frame (Batch 59); absent: the highlight color. |

#### CaptionStyleOverride

A cue's own style over its track's: a sparse set of fields, so a change of the track style still changes every field the cue did not set.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `text` | [CaptionTextOverride](#captiontextoverride) | no |  | Text style fields. |
| `position` | `"bottom"` | `"center"` | `"top"` | `"custom"` | no |  | Position. |
| `x` | number | no |  | x. |
| `y` | number | no |  | y. |
| `maxWidth` | number (> 0) | no |  | Wrap width. |
| `maxLines` | integer (>= 1) | no |  | Line count. |
| `highlight` | [CaptionHighlightOverride](#captionhighlightoverride) | no |  | Highlight parts. |
| `anim` | [CaptionAnim](#captionanim) | no |  | Cue animations. |

#### CaptionTrackData

A caption track's data; its cues are the track's clips.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `style` | [CaptionStyle](#captionstyle) | yes |  | The style of its cues. |

#### CaptionWord

A word of a cue with its timing.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `text` | string | yes |  | The word. |
| `start` | integer | yes |  | Relative to the cue's start, inclusive; may be negative or past the cue's end (an in-trim keeps the words it hides, so a trim back shows them again). Integer frames at the project frame rate. |
| `end` | integer | yes |  | Relative to the cue's start, exclusive; after `start`. Integer frames at the project frame rate. |
| `emphasis` | boolean | no |  | Shows the highlight's emphasis color from the cue's first frame (Batch 59). |
| `color` | [RGBA](#rgba) | no |  | This word's own fill, over every other color (Batch 59). |

#### Settings

The project's frame and time base.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `width` | integer (>= 1) | yes | `1080` | Frame width, px. |
| `height` | integer (>= 1) | yes | `1920` | Frame height, px. |
| `fps` | [Rational](#rational) | yes | `{"num":30,"den":1}` | Frame rate (24, 25, 30, 50 and 60 are the usual ones). |
| `background` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":1}` | Color behind every layer. |
| `sampleRate` | `48000` | yes | `48000` | Audio sample rate. |
| `perspective` | number (> 0) or null | no | `1600` | Viewing distance of the 2.5D layers, px (Batch 70); null: none (a flat projection). Absent: 1600. |
| `loudness` | [Loudness](#loudness) or null | no | `null` | Export loudness target (Batch 77); null or absent: off. |

#### ProjectGenerator

The tool that wrote the project; shown in the Project section of the properties panel.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | string (not empty) | yes |  | Tool name. |
| `version` | string | no |  | Tool version. |
| `source` | string | no |  | Where the input came from. |
| `url` | string | no |  | Tool home page. |

#### ProjectMeta

Bookkeeping the app stamps on save.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `createdAt` | string | yes |  | ISO time. |
| `modifiedAt` | string | yes |  | ISO time. |
| `appVersion` | string | yes |  | The app version that last saved it. |
| `generator` | [ProjectGenerator](#projectgenerator) | no |  | The tool that wrote it. |

#### FileRef

Where a media file is: a path inside the project folder (a generated project always uses `relPath`) or, for a linked file, a browser handle key.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `relPath` | string (not empty) | no |  | Path inside the project folder, `/` separated, no `..`. |
| `handleKey` | string | no |  | Browser file handle key (written by the app for linked files); empty for a pasted file the app cannot resolve, which stays offline until relinked. |
| `pathHint` | string | no |  | Where the linked file was, for the relink dialog. |

#### Proxy

A lower resolution copy the preview plays.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `relPath` | string (not empty) | yes |  | Path inside the project folder. |
| `width` | integer (>= 1) | yes |  | Width, px. |
| `height` | integer (>= 1) | yes |  | Height, px. |
| `status` | `"none"` | `"pending"` | `"ready"` | `"failed"` | yes |  | State. |

#### Analysis

State of the background analysis of a media item.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `thumbs` | `"none"` | `"pending"` | `"ready"` | yes | `"none"` | Thumbnails. |
| `peaks` | `"none"` | `"pending"` | `"ready"` | yes | `"none"` | Audio peaks. |

#### MediaItem

A file of the media bin.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `kind` | `"video"` | `"audio"` | `"image"` | `"lottie"` | yes |  | Kind (`lottie`: a Lottie animation, Batch 79; `codec` is `lottie` or `dotlottie`, `fps` the animation's frame rate, `width` and `height` its size). |
| `name` | string | yes |  | Display name. |
| `file` | [FileRef](#fileref) | yes |  | The file. |
| `durationUs` | integer (>= 0) | yes |  | Length; 0 for a still image. Integer microseconds. |
| `width` | integer (>= 1) | no |  | Picture width, px. |
| `height` | integer (>= 1) | no |  | Picture height, px. |
| `rotation` | `0` | `90` | `180` | `270` | no |  | Display rotation, degrees. |
| `fps` | [Rational](#rational) | no |  | Frame rate of a video. |
| `hasAudio` | boolean | yes | `false` | Has a sound track. |
| `codec` | string | no |  | Video codec label (image: its format). |
| `audioCodec` | string | no |  | Audio codec label. |
| `proxy` | [Proxy](#proxy) | no |  | Its proxy. |
| `analysis` | [Analysis](#analysis) | yes | `{"thumbs":"none","peaks":"none"}` | Analysis state. |
| `binId` | string (not empty) | no |  | The bin it is in; names an entry of `bins`. |
| `addedAt` | string | yes |  | ISO time. |
| `size` | integer (>= 0) | no |  | File size in bytes when imported. |
| `alpha` | boolean | no |  | True for a VP8/VP9 WebM whose alpha channel is decoded (set by the probe; omit it for any other file). |
| `sequence` | [ImageSequence](#imagesequence) | no |  | An image sequence: numbered PNG or WebP frames of one size, played at `fps`. `kind` is `image`, `file.relPath` names the first frame and `durationUs` is count / fps. |

#### ImageSequence

The numbered frames of an image sequence (spec §21.11).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `dir` | string (not empty) | yes |  | The folder of the frames, relative to the project folder, `/` separated, no `..`. |
| `pattern` | string (not empty) | yes |  | printf-style file name of a frame: `%d` or `%0Nd` once, such as `frame_%05d.png`. The extension is `.png` or `.webp`. |
| `first` | integer (>= 0) | yes | `0` | The number of the first frame (the value `%d` takes). |
| `count` | integer (>= 1) | yes |  | How many frames, numbered first .. first + count - 1 without gaps. |
| `fps` | [Rational](#rational) | yes |  | Playback rate of the sequence. |

#### Bin

A media panel folder (flat, one level).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id. |
| `name` | string (not empty) | yes |  | Name. |

#### Track

A lane of clips. Video tracks come first (index 0 is the bottom one), then the caption track, then audio tracks.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id. |
| `kind` | `"video"` | `"audio"` | `"caption"` | yes |  | Kind. |
| `name` | string | yes |  | Name (V1, A1, CC1). |
| `clipIds` | string (not empty)[] | yes |  | Its clips, sorted by start, non-overlapping. |
| `locked` | boolean | yes | `false` | Locked against edits. |
| `muted` | boolean | yes | `false` | Muted. |
| `solo` | boolean | yes | `false` | Soloed. |
| `hidden` | boolean | yes | `false` | Hidden. |
| `targeted` | boolean | yes | `true` | Takes inserts. |
| `height` | `"S"` | `"M"` | `"L"` | yes | `"M"` | Row height. |
| `gainDb` | number (>= -60, <= 12) | no | `0` | Audio tracks (Batch 77): level in dB. Absent: 0. |
| `pan` | number (>= -1, <= 1) | no | `0` | Audio tracks (Batch 77): -1 (left) to 1 (right). Absent: 0. |

#### Marker

A labeled flag on the timeline, sorted by frame.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id. |
| `frame` | integer (>= 0) | yes |  | Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | yes |  | Label color. |
| `label` | string | yes |  | Text. |

#### Project

project.json.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `schemaVersion` | integer (>= 1) | yes | `24` | The schema version; this build writes and reads up to the current one. |
| `id` | string (not empty) | yes |  | Unique id, never changes (uuid v4 recommended). |
| `name` | string | yes |  | Project name. |
| `settings` | [Settings](#settings) | yes |  | Frame and time base. |
| `media` | object of [MediaItem](#mediaitem) by id | yes | `{}` | Media by id. |
| `bins` | [Bin](#bin)[] | yes | `[]` | Media bins in strip order. |
| `tracks` | [Track](#track)[] | yes | `[]` | Tracks in order. |
| `clips` | object of [Clip](#clip) by id | yes | `{}` | All clips by id; tracks list their ids. |
| `markers` | [Marker](#marker)[] | yes | `[]` | Markers sorted by frame. |
| `captionTracks` | object of [CaptionTrackData](#captiontrackdata) by id | yes | `{}` | Style of the caption track, by track id. |
| `textPresetsLocal` | [TextPreset](#textpreset)[] | yes | `[]` | Kept empty. |
| `sequences` | object of [Sequence](#sequence) by id | no | `{}` | Nested sequences by id (Batch 62); what compound clips show. Absent: none. |
| `meta` | [ProjectMeta](#projectmeta) | yes |  | Bookkeeping. |

#### Clip

A clip: the `kind` field selects its description.

Told apart by `kind`: `video` is [Clip.video](#clip-video), `audio` is [Clip.audio](#clip-audio), `image` is [Clip.image](#clip-image), `lottie` is [Clip.lottie](#clip-lottie), `text` is [Clip.text](#clip-text), `solid` is [Clip.solid](#clip-solid), `caption` is [Clip.caption](#clip-caption), `compound` is [Clip.compound](#clip-compound), `shape` is [Clip.shape](#clip-shape), `null` is [Clip.null](#clip-null), `adjustment` is [Clip.adjustment](#clip-adjustment).

#### ClipBase

The fields every clip has.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"video"` | `"audio"` | `"image"` | `"lottie"` | `"text"` | `"solid"` | `"caption"` | `"compound"` | `"shape"` | `"null"` | `"adjustment"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |

#### Clip.video

A video clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"video"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `mediaId` | string (not empty) | yes |  | The media item it plays; a clip whose item was removed stays as an offline clip. |
| `in` | integer (>= 0) | yes |  | Source in point. Integer microseconds. |
| `out` | integer (>= 1) | yes |  | Source out point; `out - in` equals `duration * speed` frame times (within one frame). Integer microseconds. |
| `speed` | number (>= 0, <= 4) | yes | `1` | Playback speed 0.25..4 (0 only for a video freeze frame). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `crop` | [Crop](#crop) | yes |  | Cropping. |
| `cornerRadius` | number (>= 0) | no |  | Rounded corners of the cropped picture, project px (Batch 58). |
| `stroke` | [StrokeStyle](#strokestyle) | no |  | Outline around the cropped picture (Batch 58). |
| `shadow` | [ShadowStyle](#shadowstyle) | no |  | Shadow of the cropped picture (Batch 58). |
| `volume` | [Volume](#volume) | yes |  | Sound level. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity and volume fades. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `timeRemap` | [RemapKey](#remapkey)[] | no |  | Video clips (Batch 78): keys mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. At least two keys. |
| `reverse` | boolean | no | `false` | Video and audio clips (Batch 78): the source plays backward, from `out` to `in`. Ignored when `timeRemap` is set. |
| `frameBlend` | boolean | no | `false` | Video clips (Batch 78): when the source advances less than one frame per timeline frame, the two nearest source frames are mixed. |
| `loop` | boolean | no | `false` | Lottie clips (Batch 79): the animation repeats from its start when the clip is longer; false or absent = it holds its last frame. Other clips: not allowed. |
| `colorOverrides` | [ColorOverride](#coloroverride)[] | no |  | Lottie clips (Batch 79): color replacements applied in order (the first `from` that matches wins). Other clips: not allowed. |
| `transitionIn` | [Transition](#transition) | no |  | Transition at the start. |
| `transitionOut` | [Transition](#transition) | no |  | Transition at the end. |

#### Clip.audio

A audio clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"audio"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `mediaId` | string (not empty) | yes |  | The media item it plays; a clip whose item was removed stays as an offline clip. |
| `in` | integer (>= 0) | yes |  | Source in point. Integer microseconds. |
| `out` | integer (>= 1) | yes |  | Source out point; `out - in` equals `duration * speed` frame times (within one frame). Integer microseconds. |
| `speed` | number (>= 0, <= 4) | yes | `1` | Playback speed 0.25..4 (0 only for a video freeze frame). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `crop` | [Crop](#crop) | yes |  | Cropping. |
| `volume` | [Volume](#volume) | yes |  | Sound level. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Volume fades. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `timeRemap` | [RemapKey](#remapkey)[] | no |  | Video clips (Batch 78): keys mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. At least two keys. |
| `reverse` | boolean | no | `false` | Video and audio clips (Batch 78): the source plays backward, from `out` to `in`. Ignored when `timeRemap` is set. |
| `frameBlend` | boolean | no | `false` | Video clips (Batch 78): when the source advances less than one frame per timeline frame, the two nearest source frames are mixed. |
| `loop` | boolean | no | `false` | Lottie clips (Batch 79): the animation repeats from its start when the clip is longer; false or absent = it holds its last frame. Other clips: not allowed. |
| `colorOverrides` | [ColorOverride](#coloroverride)[] | no |  | Lottie clips (Batch 79): color replacements applied in order (the first `from` that matches wins). Other clips: not allowed. |
| `transitionIn` | [Transition](#transition) | no |  | Transition at the start. |
| `transitionOut` | [Transition](#transition) | no |  | Transition at the end. |

#### Clip.image

A image clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"image"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `mediaId` | string (not empty) | yes |  | The media item it plays; a clip whose item was removed stays as an offline clip. |
| `in` | integer (>= 0) | yes |  | Source in point. Integer microseconds. |
| `out` | integer (>= 1) | yes |  | Source out point; `out - in` equals `duration * speed` frame times (within one frame). Integer microseconds. |
| `speed` | number (>= 0, <= 4) | yes | `1` | Playback speed 0.25..4 (0 only for a video freeze frame). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `crop` | [Crop](#crop) | yes |  | Cropping. |
| `cornerRadius` | number (>= 0) | no |  | Rounded corners of the cropped picture, project px (Batch 58). |
| `stroke` | [StrokeStyle](#strokestyle) | no |  | Outline around the cropped picture (Batch 58). |
| `shadow` | [ShadowStyle](#shadowstyle) | no |  | Shadow of the cropped picture (Batch 58). |
| `volume` | [Volume](#volume) | yes |  | Sound level. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity and volume fades. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `timeRemap` | [RemapKey](#remapkey)[] | no |  | Video clips (Batch 78): keys mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. At least two keys. |
| `reverse` | boolean | no | `false` | Video and audio clips (Batch 78): the source plays backward, from `out` to `in`. Ignored when `timeRemap` is set. |
| `frameBlend` | boolean | no | `false` | Video clips (Batch 78): when the source advances less than one frame per timeline frame, the two nearest source frames are mixed. |
| `loop` | boolean | no | `false` | Lottie clips (Batch 79): the animation repeats from its start when the clip is longer; false or absent = it holds its last frame. Other clips: not allowed. |
| `colorOverrides` | [ColorOverride](#coloroverride)[] | no |  | Lottie clips (Batch 79): color replacements applied in order (the first `from` that matches wins). Other clips: not allowed. |
| `transitionIn` | [Transition](#transition) | no |  | Transition at the start. |
| `transitionOut` | [Transition](#transition) | no |  | Transition at the end. |

#### Clip.lottie

A lottie clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"lottie"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `mediaId` | string (not empty) | yes |  | The media item it plays; a clip whose item was removed stays as an offline clip. |
| `in` | integer (>= 0) | yes |  | Source in point. Integer microseconds. |
| `out` | integer (>= 1) | yes |  | Source out point; `out - in` equals `duration * speed` frame times (within one frame). Integer microseconds. |
| `speed` | number (>= 0, <= 4) | yes | `1` | Playback speed 0.25..4 (0 only for a video freeze frame). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `crop` | [Crop](#crop) | yes |  | Cropping. |
| `cornerRadius` | number (>= 0) | no |  | Rounded corners of the cropped picture, project px (Batch 58). |
| `stroke` | [StrokeStyle](#strokestyle) | no |  | Outline around the cropped picture (Batch 58). |
| `shadow` | [ShadowStyle](#shadowstyle) | no |  | Shadow of the cropped picture (Batch 58). |
| `volume` | [Volume](#volume) | yes |  | Sound level. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity and volume fades. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `timeRemap` | [RemapKey](#remapkey)[] | no |  | Video clips (Batch 78): keys mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. At least two keys. |
| `reverse` | boolean | no | `false` | Video and audio clips (Batch 78): the source plays backward, from `out` to `in`. Ignored when `timeRemap` is set. |
| `frameBlend` | boolean | no | `false` | Video clips (Batch 78): when the source advances less than one frame per timeline frame, the two nearest source frames are mixed. |
| `loop` | boolean | no | `false` | Lottie clips (Batch 79): the animation repeats from its start when the clip is longer; false or absent = it holds its last frame. Other clips: not allowed. |
| `colorOverrides` | [ColorOverride](#coloroverride)[] | no |  | Lottie clips (Batch 79): color replacements applied in order (the first `from` that matches wins). Other clips: not allowed. |
| `transitionIn` | [Transition](#transition) | no |  | Transition at the start. |
| `transitionOut` | [Transition](#transition) | no |  | Transition at the end. |

#### Clip.text

A text clip.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"text"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `text` | [TextContent](#textcontent) | yes |  | What it says. |
| `style` | [TextStyle](#textstyle) | yes |  | Its look. |
| `animIn` | [TextAnim](#textanim) | no |  | In animation. |
| `animOut` | [TextAnim](#textanim) | no |  | Out animation. |
| `presetId` | string (not empty) | no |  | The preset it was made from. |
| `spans` | [TextSpan](#textspan)[] | no |  | Styled runs inside the text, sorted by `start` and not overlapping (Batch 67). Content: presets never store them. |
| `counter` | [TextCounter](#textcounter) | no |  | A number that counts (Batch 68): the clip shows `prefix + value + suffix`; `text.value` holds the final text. |
| `animators` | [TextAnimator](#textanimator)[] | no |  | Range-selector animators (Batch 68). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity fades. |

#### TextCounter

A counting number: the value goes from `from` to `to` over the clip through `ease`, or follows the keys of `text.counter.value`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `from` | number | yes | `0` | Value on the first frame. |
| `to` | number | yes | `100` | Value on the last frame. |
| `decimals` | integer (>= 0, <= 6) | yes | `0` | Digits after the decimal point. |
| `prefix` | string | yes | `""` | Text before the number. |
| `suffix` | string | yes | `""` | Text after the number. |
| `separator` | `""` | `","` | `"."` | `" "` | `"'"` | yes | `""` | Thousands separator (empty: none). |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | yes | `"easeOut"` | Timing curve. |

#### TextAnimator

A per-character, word or line animation: each unit gets an amount 0..1 from the range selector and each prop applies times that amount.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique within the clip; keyframe properties name it (`animators.<id>.*`). |
| `unit` | `"char"` | `"word"` | `"line"` | yes | `"char"` | What the selector counts. |
| `selector` | [AnimatorSelector](#animatorselector) | yes |  | The range selector. |
| `props` | [AnimatorProps](#animatorprops) | yes |  | What the animator does at amount 1. |

#### AnimatorSelector

A range selector with After Effects semantics: a window over the units, shaped by `shape`, moved by `offset`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `start` | number | yes | `0` | Window start, fraction of the units. |
| `end` | number | yes | `1` | Window end, fraction of the units. |
| `offset` | number | yes | `0` | Moves the window; key it from 0 to 1 for a reveal. |
| `shape` | `"square"` | `"rampUp"` | `"rampDown"` | `"triangle"` | `"round"` | `"smooth"` | yes | `"rampUp"` | Falloff inside the window. |
| `ease` | number (>= -1, <= 1) | yes | `0` | Reshapes the ramps (0: none). |
| `order` | `"forward"` | `"reverse"` | `"random"` | yes | `"forward"` | Which unit sits where in the window. |
| `seed` | integer (>= 0) | yes | `1` | Seed of the random order. |

#### AnimatorProps

What an animator does to a unit at amount 1; each is times the unit's amount (opacity moves toward its value, fill toward its color).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | no |  | Offset x, project px. |
| `y` | number | no |  | Offset y, project px. |
| `scale` | number | no |  | Scale at amount 1 (1: unchanged; moves toward it). |
| `rotation` | number | no |  | Degrees. |
| `opacity` | number (>= 0, <= 1) | no |  | Opacity at amount 1. |
| `blur` | number (>= 0) | no |  | Blur, project px. |
| `tracking` | number | no |  | Extra letter spacing, project px. |
| `fill` | [RGBA](#rgba) | no |  | Color at amount 1. |

#### TextSpan

A styled run of a text clip: `[start, end)` in UTF-16 units of `text.value`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `start` | integer (>= 0) | yes |  | First character, UTF-16 offset into `text.value`. |
| `end` | integer (>= 1) | yes |  | After the last character; greater than `start`, at most the length of `text.value`. |
| `style` | [TextSpanStyle](#textspanstyle) | yes |  | What it changes. |

#### TextSpanStyle

What a span changes on its characters; an absent field keeps the clip style's.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | [GradientFill](#gradientfill) | no |  | Text color. |
| `fontFamily` | string (not empty) | no |  | Font family. |
| `fontWeight` | number (>= 1, <= 1000) | no |  | Font weight. |
| `italic` | boolean | no |  | Italic. |
| `underline` | boolean | no |  | A line under the text. |
| `strike` | boolean | no |  | A line through the text. |
| `highlight` | [RGBA](#rgba) | no |  | A box behind the text. |

#### Clip.solid

A solid or shape layer: `size` project px at scale 1.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"solid"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | [GradientFill](#gradientfill) | yes |  | A color or a vertical two-stop gradient. |
| `shape` | `"rect"` | `"roundedRect"` | `"ellipse"` | `"line"` | yes | `"rect"` | The shape. |
| `size` | [Size](#size) | yes |  | Width and height at scale 1, project px. |
| `cornerRadius` | number (>= 0) | yes | `0` | Corner radius, project px (at most half the shorter side; rounds a line's ends). |
| `cornerRadii` | number (>= 0)[] (4 items) | no |  | Radii of the corners tl, tr, br, bl; wins over `cornerRadius` (Batch 58). |
| `stroke` | [StrokeStyle](#strokestyle) | no |  | Outline (Batch 58). |
| `shadow` | [ShadowStyle](#shadowstyle) | no |  | Shadow (Batch 58). |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `fades` | [Fades](#fades) | no |  | Opacity fades. |

#### Clip.compound

A nested sequence shown as one layer (Batch 62): inner frame = `offset + (frame - start)`; `offset + duration` stays within the sequence.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"compound"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `sequenceId` | string (not empty) | yes |  | The sequence it shows (a key of `Project.sequences`); instances may share one. |
| `offset` | integer (>= 0) | yes | `0` | The sequence frame shown at the clip's first frame. Integer frames at the project frame rate. |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity fades. |
| `volume` | [Volume](#volume) | yes |  | Gain of the inner audio. |
| `params` | object of any JSON value by id | no |  | Template parameter values of this instance by parameter id (Batch 80); a missing one leaves the field as the sequence has it. |

#### Clip.shape

A vector graphic (Batch 65): paths drawn in order in a view box of `size` project px at scale 1.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"shape"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `size` | [Size](#size) | yes |  | The view box: width and height at scale 1, project px. |
| `paths` | [ShapePath](#shapepath)[] | yes | `[]` | The paths, bottom to top. |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties, including `paths.<id>.*`. |
| `fades` | [Fades](#fades) | no |  | Opacity fades. |

#### Clip.null

An invisible controller (Batch 69): never drawn or exported, a parent for other layers. `size` is the outline shown when it is selected.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"null"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `size` | [Size](#size) | yes | `{"w":100,"h":100}` | The selection outline: width and height at scale 1, project px. |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties, including `transform.position`. |

#### Clip.adjustment

An adjustment clip (Batch 76): no picture of its own; during its range its effects apply to the composite of every layer below it in the same sequence, its masks (in project px) limit the area and its opacity mixes the result with the unaffected picture. No transform, parent, blend mode or matte.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"adjustment"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | yes | `[]` | The effect stack applied to the picture below, in order; empty = no change. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | How much of the adjusted picture shows over the unaffected one. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties: `opacity`, `masks.<id>.*` and `effects.<id>.*` only. |
| `fades` | [Fades](#fades) | no |  | Opacity fades. |

#### ShapePath

One path of a shape clip (Batch 65). With `primitive`, the path is generated from it and `d` holds the generated data.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique within the clip: letters, digits, `_` and `-` (keyframe ids name it). |
| `d` | string | yes | `""` | SVG path data in view-box px (M L H V C S Q T A Z, absolute and relative); empty: nothing. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | [GradientFill](#gradientfill) or null | yes | `null` | A color, a vertical two-stop gradient or a gradient with stops (laid out in the path's box); null: no fill. |
| `fillRule` | `"nonzero"` | `"evenodd"` | yes | `"nonzero"` | Which points are inside where the path crosses itself. |
| `stroke` | [PathStroke](#pathstroke) | no |  | Outline; absent: none. |
| `trim` | [PathTrim](#pathtrim) | no |  | The drawn part of the stroke; absent: all of it. |
| `primitive` | [Primitive](#primitive) | no |  | The generator of the path; absent: `d` is the path. |

#### PathStroke

The stroke of a path (Batch 65): a StrokeStyle in view-box px with caps, joins and a miter limit. `inside` and `outside` apply to closed paths (open ones are centered).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `width` | number (>= 0) | yes | `4` | Width, view-box px. |
| `color` | [RGBA](#rgba) | yes | `{"r":0,"g":0,"b":0,"a":1}` | Color. |
| `align` | `"inside"` | `"center"` | `"outside"` | yes | `"center"` | Inside the fill, centered on the path or outside it. |
| `dash` | number (>= 0)[] | no |  | Dash and gap lengths, view-box px (an odd list repeats); absent or empty: a solid line. |
| `dashOffset` | number | no |  | Where the pattern starts along each subpath, view-box px. |
| `cap` | `"butt"` | `"round"` | `"square"` | yes | `"butt"` | Ends of open subpaths and dashes. |
| `join` | `"miter"` | `"round"` | `"bevel"` | yes | `"miter"` | Corners. |
| `miterLimit` | number (>= 1) | yes | `4` | Longest miter as a multiple of the width; longer ones are beveled. |

#### PathTrim

The part of a path's stroke that is drawn (Batch 65): fractions of the whole path length (subpaths in order); `offset` shifts both ends and wraps.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `start` | number (>= 0, <= 1) | yes | `0` | Start. |
| `end` | number (>= 0, <= 1) | yes | `1` | End. |
| `offset` | number | yes | `0` | Shift of both ends, fractions of the length. |

#### Primitive

A generated path, centered in the view box (Batch 65); angles in degrees, 0 = up, clockwise.

Told apart by `kind`: `rect` is [Primitive.rect](#primitive-rect), `ellipse` is [Primitive.ellipse](#primitive-ellipse), `polygon` is [Primitive.polygon](#primitive-polygon), `star` is [Primitive.star](#primitive-star), `arrow` is [Primitive.arrow](#primitive-arrow), `arc` is [Primitive.arc](#primitive-arc), `line` is [Primitive.line](#primitive-line).

#### Primitive.rect

A rectangle.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"rect"` | yes |  | Kind. |
| `w` | number (>= 0) | yes |  | Width. |
| `h` | number (>= 0) | yes |  | Height. |
| `radius` | number (>= 0) | yes | `0` | Corner radius (at most half the shorter side). |

#### Primitive.ellipse

An ellipse.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"ellipse"` | yes |  | Kind. |
| `w` | number (>= 0) | yes |  | Width. |
| `h` | number (>= 0) | yes |  | Height. |

#### Primitive.polygon

A regular polygon, its first corner up.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"polygon"` | yes |  | Kind. |
| `sides` | integer (>= 3, <= 64) | yes | `6` | Corners. |
| `radius` | number (>= 0) | yes |  | Center to corner. |
| `roundness` | number (>= 0, <= 1) | yes | `0` | Corner rounding (fraction of half the shorter neighboring edge). |

#### Primitive.star

A star, its first point up.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"star"` | yes |  | Kind. |
| `points` | integer (>= 3, <= 64) | yes | `5` | Points. |
| `inner` | number (>= 0) | yes |  | Center to the inner corners. |
| `outer` | number (>= 0) | yes |  | Center to the points. |
| `roundness` | number (>= 0, <= 1) | yes | `0` | Corner rounding (fraction of half the shorter neighboring edge). |

#### Primitive.arrow

An arrow pointing right (a closed outline).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"arrow"` | yes |  | Kind. |
| `length` | number (>= 0) | yes |  | Tail to tip. |
| `shaft` | number (>= 0) | yes |  | Shaft thickness. |
| `head` | number (>= 0) | yes |  | Head width. |
| `headLength` | number (>= 0) | yes |  | Head length (at most the length). |

#### Primitive.arc

An open circular arc from `start` to `end` (clockwise when `end` is larger); stroke it.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"arc"` | yes |  | Kind. |
| `radius` | number (>= 0) | yes |  | Radius. |
| `start` | number (>= -3600, <= 3600) | yes | `0` | Start angle, degrees. |
| `end` | number (>= -3600, <= 3600) | yes | `270` | End angle, degrees (the sweep is at most a full turn). |

#### Primitive.line

A horizontal line (open); stroke it.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `kind` | `"line"` | yes |  | Kind. |
| `length` | number (>= 0) | yes |  | Length. |

#### Sequence

A nested sequence (Batch 62): its inner clips are in `Project.clips` on its own tracks. Up to 8 levels of nesting; a cycle is invalid.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `name` | string | yes |  | Display name. |
| `size` | [Size](#size) | yes |  | Frame size, project px. |
| `duration` | integer (>= 1) | yes |  | Length. Integer frames at the project frame rate. |
| `background` | [RGBA](#rgba) or null | yes | `null` | Color behind the inner layers; null: transparent. |
| `tracks` | [Track](#track)[] | yes |  | Inner video and audio tracks, ordered like `Project.tracks`; no caption track. |
| `perspective` | number (> 0) or null | no | `1600` | Viewing distance of its 2.5D layers, px (Batch 70); null: none. Absent: 1600. |
| `depthSort` | boolean | no | `false` | Inner layers drawn by depth, farthest first, instead of track order (Batch 70). |
| `params` | [TemplateParam](#templateparam)[] | no |  | Template parameters (Batch 80): fields of inner clips that each instance can set. Absent: none. |

#### TemplateParam

A template parameter (Batch 80): a named field of one or more inner clips of the sequence, set per instance in `Clip.compound.params`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique within the sequence; the key of the instance values. |
| `label` | string | yes |  | Name shown in the instance form. |
| `kind` | `"text"` | `"color"` | `"number"` | `"media"` | `"font"` | `"toggle"` | yes |  | What it holds: `text` (string), `color` (RGBA, channels 0..1), `number`, `media` (a media id), `font` (a font family name) or `toggle` (boolean). |
| `targets` | [TemplateTarget](#templatetarget)[] | yes |  | The inner clip fields it sets; at least one. |
| `default` | any JSON value | yes |  | The value of the field when the parameter was exposed, and the value an instance starts with. |
| `min` | number | no |  | Number parameters: the lowest value. |
| `max` | number | no |  | Number parameters: the highest value. |

#### TemplateTarget

A field a template parameter sets.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `clipId` | string (not empty) | yes |  | An inner clip of the sequence. |
| `path` | string (not empty) | yes |  | Dotted path of the field on that clip, for example `text.value`, `style.fontFamily`, `fill`, `mediaId` or `enabled`; never `id`, `trackId`, `kind`, `start` or `duration`. |

#### Size

A width and a height in project px.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `w` | number (> 0) | yes |  | Width. |
| `h` | number (> 0) | yes |  | Height. |

#### Clip.caption

A caption cue. Its style is its track's with `styleOverride` on top.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"caption"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |
| `parentId` | string (not empty) | no |  | A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles. |
| `autoOrient` | boolean | no |  | Rotation follows the tangent of the `transform.position` motion path (Batch 69). |
| `backfaceHidden` | boolean | no | `false` | 2.5D (Batch 70): not drawn while its back faces the viewer. |
| `blend` | `"normal"` | `"darken"` | `"multiply"` | `"colorBurn"` | `"lighten"` | `"screen"` | `"colorDodge"` | `"add"` | `"overlay"` | `"softLight"` | `"hardLight"` | `"difference"` | `"exclusion"` | no | `"normal"` | Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge). |
| `matte` | [TrackMatte](#trackmatte) | no |  | Visual clips (Batch 72): the clip shows only through another clip's alpha or luma. |
| `matteOnly` | boolean | no | `false` | Visual clips (Batch 72): not drawn on its own; it is another clip's matte. |
| `masks` | [Mask](#mask)[] | no |  | Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows. |
| `effects` | [Effect](#effect)[] | no |  | Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none. |
| `text` | string | yes |  | Plain text with `\n` line breaks. |
| `words` | [CaptionWord](#captionword)[] | no |  | Word timings (karaoke), relative to the cue start. |
| `styleOverride` | [CaptionStyleOverride](#captionstyleoverride) | no |  | The cue's own style. |
| `presetId` | string (not empty) | no |  | The preset it was styled with. |

#### FontManifest

`fonts/fonts.json`: the font files the project carries.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `version` | `1` | `2` | yes | `2` | 2 since Batch 51 (each face's source); version 1 faces were system fonts. |
| `faces` | [FontFace](#fontface)[] | yes |  | The faces. |

#### FontFace

One face of a family, in a file of `fonts/`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `family` | string (not empty) | yes |  | Family name texts refer to. |
| `style` | string | no | `"Regular"` | The face's style name ("Bold Italic"). |
| `weight` | integer (>= 1, <= 1000) | no | `400` | Weight. |
| `italic` | boolean | no | `false` | Italic. |
| `postscriptName` | string | no |  | PostScript name (the file name when absent). |
| `file` | string (not empty) | yes |  | File name inside `fonts/` (no path). |
| `source` | `"library"` | `"user"` | `"system"` | no | `"system"` | Where it came from (version 2). |
| `weightRange` | integer (>= 1, <= 1000)[] (2 items) | no |  | A variable file's weight axis [min, max]. |
| `unicodeRange` | string | no |  | The characters a subset file covers. |
| `origin` | string | no |  | The library file (`<slug>/<file>`) or My fonts id it is a copy of. |

<!-- fields:end -->
