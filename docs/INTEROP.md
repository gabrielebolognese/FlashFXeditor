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

#### Fades

Fade lengths at the clip's edges.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `in` | integer (>= 0) | yes | `0` | Fade in. Integer frames at the project frame rate. |
| `out` | integer (>= 0) | yes | `0` | Fade out. Integer frames at the project frame rate. |

#### Keyframe

One keyframe: a value at a frame relative to the clip start. A key's `ease` shapes the segment from it to the next key.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `frame` | integer | yes |  | Relative to the clip start; one key per frame, sorted. Any integer: after a head trim keys before the clip start (negative) or past its end are kept so a trim back restores them. Integer frames at the project frame rate. |
| `value` | number, or number[] (1 to 4 items) | yes |  | The value: a number, or for a color property an array [r, g, b, a] (straight alpha, 0..1, interpolated per channel). |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | yes | `"linear"` | The curve to the next key. |
| `bezier` | number[] (4 items) | no |  | Ease `bezier`: the CSS cubic-bezier(x1, y1, x2, y2); x1 and x2 are 0..1 (Batch 60). |
| `spring` | [KeySpring](#keyspring) | no |  | Ease `spring`: damping and frequency; 0.7 and 4 when absent (Batch 60). |

#### KeySpring

The parameters of a `spring` ease: a damped cosine over the segment that ends exactly on the next key's value.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `damping` | number (>= 0) | yes | `0.7` | Decay over the segment (0 never decays). |
| `frequency` | number (> 0) | yes | `4` | Oscillations over the segment. |

#### Keyframes

Keyframe lists by property id, each sorted by frame.

Value: object of [Keyframe](#keyframe)[] (keys: `transform.x`, `transform.y`, `transform.scale`, `transform.scaleY`, `transform.rotation`, `opacity`, `volume.gainDb`, `transform.anchor.x`, `transform.anchor.y`, `crop.left`, `crop.top`, `crop.right`, `crop.bottom`, `size.w`, `size.h`, `cornerRadius`, `fill`, `stroke.width`, `stroke.color`, `stroke.dashOffset`, `shadow.x`, `shadow.y`, `shadow.blur`, `shadow.spread`, `shadow.color`, `style.fontSize`, `style.letterSpacing`, `style.fill`).

#### Transition

A transition at the cut between two abutting clips: the left clip's `transitionOut` and the right clip's `transitionIn` hold the same values.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Shared by the two clips of the cut. |
| `kind` | `"crossDissolve"` | `"dipToBlack"` | `"dipToWhite"` | yes |  | The look. |
| `before` | integer (>= 0) | yes |  | Frames before the cut. Integer frames at the project frame rate. |
| `after` | integer (>= 0) | yes |  | Frames after the cut. Integer frames at the project frame rate. |

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
| `id` | `"fade"` | `"slideUp"` | `"slideDown"` | `"slideLeft"` | `"slideRight"` | `"pop"` | `"typewriter"` | `"wordPop"` | `"wordFade"` | `"lineReveal"` | `"blurIn"` | `"scaleBounce"` | yes |  | The animation. |
| `duration` | integer (>= 0) | yes |  | The whole animation, every unit's delay included. Integer frames at the project frame rate. |
| `perUnit` | `"char"` | `"word"` | `"line"` | no |  | What moves one by one, instead of the animation's own unit. |
| `stagger` | integer (>= 0) | no |  | Delay between two units; spread over the duration when absent. Integer frames at the project frame rate. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | `"sineIn"` | `"sineOut"` | `"sineInOut"` | `"quadIn"` | `"quadOut"` | `"quadInOut"` | `"cubicIn"` | `"cubicOut"` | `"cubicInOut"` | `"quartIn"` | `"quartOut"` | `"quartInOut"` | `"quintIn"` | `"quintOut"` | `"quintInOut"` | `"expoIn"` | `"expoOut"` | `"expoInOut"` | `"circIn"` | `"circOut"` | `"circInOut"` | `"backIn"` | `"backOut"` | `"backInOut"` | `"elasticIn"` | `"elasticOut"` | `"elasticInOut"` | `"bounceIn"` | `"bounceOut"` | `"bounceInOut"` | `"bezier"` | `"spring"` | no |  | Timing curve; the animation's own when absent. |

#### PresetTextAnim

A preset's animation, timed in milliseconds (presets cross frame rates).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | `"fade"` | `"slideUp"` | `"slideDown"` | `"slideLeft"` | `"slideRight"` | `"pop"` | `"typewriter"` | `"wordPop"` | `"wordFade"` | `"lineReveal"` | `"blurIn"` | `"scaleBounce"` | yes |  | The animation. |
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
| `kind` | `"video"` | `"audio"` | `"image"` | yes |  | Kind. |
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
| `schemaVersion` | integer (>= 1) | yes | `7` | The schema version; this build writes and reads up to the current one. |
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
| `meta` | [ProjectMeta](#projectmeta) | yes |  | Bookkeeping. |

#### Clip

A clip: the `kind` field selects its description.

Told apart by `kind`: `video` is [Clip.video](#clip-video), `audio` is [Clip.audio](#clip-audio), `image` is [Clip.image](#clip-image), `text` is [Clip.text](#clip-text), `solid` is [Clip.solid](#clip-solid), `caption` is [Clip.caption](#clip-caption).

#### ClipBase

The fields every clip has.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string (not empty) | yes |  | Unique id; the key it is stored under. |
| `trackId` | string (not empty) | yes |  | The track listing it. |
| `kind` | `"video"` | `"audio"` | `"image"` | `"text"` | `"solid"` | `"caption"` | yes |  | Kind. |
| `name` | string | yes |  | Display name. |
| `start` | integer (>= 0) | yes |  | First frame on the timeline. Integer frames at the project frame rate. |
| `duration` | integer (>= 1) | yes |  | Length, at least 1. Integer frames at the project frame rate. |
| `color` | `"red"` | `"orange"` | `"green"` | `"teal"` | `"blue"` | `"violet"` | `"pink"` | `"grey"` | no |  | Label color. |
| `linkGroup` | string (not empty) | no |  | Clips sharing it move and trim together. |
| `group` | string (not empty) | no |  | Clips sharing it select together. |
| `enabled` | boolean | yes | `true` | Drawn and heard. |
| `fallbackOf` | [FallbackOf](#fallbackof) | no |  | Set when the clip is a baked stand-in. |

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
| `text` | [TextContent](#textcontent) | yes |  | What it says. |
| `style` | [TextStyle](#textstyle) | yes |  | Its look. |
| `animIn` | [TextAnim](#textanim) | no |  | In animation. |
| `animOut` | [TextAnim](#textanim) | no |  | Out animation. |
| `presetId` | string (not empty) | no |  | The preset it was made from. |
| `transform` | [Transform](#transform) | yes |  | Placement. |
| `opacity` | number (>= 0, <= 1) | yes | `1` | Opacity. |
| `keyframes` | [Keyframes](#keyframes) | no |  | Animated properties. |
| `fades` | [Fades](#fades) | yes | `{"in":0,"out":0}` | Opacity fades. |

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
