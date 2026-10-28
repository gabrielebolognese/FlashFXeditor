# Writing projects for the Shorts Editor (INTEROP)

This is the contract for any tool that writes a project the editor opens: a folder with a `project.json`, its media and fonts. The format is described in one table (`src/core/document/schema.ts`); the strict validator, the JSON Schema and the field reference below all come from it, so they never disagree.

Every JSON block in this file tagged `json <Type>` is checked by a test with the strict validator (`json Project` as a whole project, the others against the object of that name in the field reference). A block tagged `jsonc` is only an excerpt.

## 1. Workflow for a generator

1. Read the manifest (`capabilities.json` at the repo root, or `npm run cli -- capabilities`): it lists what this build supports. Write `schemaVersion` exactly as listed and use only what the lists name. A key that is `false` or absent is unsupported.
2. Write the folder (section 3).
3. Check it: `npm run cli -- validate <folder>` (exit 0 valid, 1 invalid, 2 usage error; `--json` prints `{ ok, schemaVersion, errors: [{ path, message }], warnings: [{ path, message }], standIns }`). It checks every field against the table, the document invariants (section 5) and the files.
4. Open it in the editor.

Use a copy of the editor at an accepted `batch-NN: review` commit for this, not the working folder of the editor, which can be in the middle of a change.

Other commands: `npm run cli -- info <folder>` (duration, tracks, clips by kind, stand-ins, missing media) and `npm run cli -- schema` (a JSON Schema, draft 2020-12, of `project.json`). `normalize` (filling the fields a generator leaves out) and the media header readers come in a later batch (manifest key `cli.normalize`).

## 2. Manifest

`capabilities.json` is generated from the model constants of the build (`npm run capabilities`), so its lists are the ones the editor uses. The keys this batch turns on:

```jsonc
{
  "manifestVersion": 1,
  "schemaVersion": 4,
  "cli": { "validate": true, "info": true },
  "interop": { "fallbackOf": true, "generatorMeta": true }
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

## 7. Generator metadata and stand-ins

`meta.generator` names the tool that wrote the project; the editor shows it in the Project section of the properties panel and never changes it.

```json ProjectGenerator
{ "name": "reels-autopilot", "version": "2.3.0", "source": "script-0412.json", "url": "https://example.com/autopilot" }
```

A **stand-in** is a clip the generator baked because it could not write what it wanted natively (a layer type the editor does not have yet): an image, video or solid that looks right, carrying the native clip in `fallbackOf`. The editor stores the block as it is and never migrates, normalizes or interprets `fallbackOf.data` (a later version converts the stand-in into the native clip).

- `kind` is the kind of the native clip (any kind, present or future) and equals `data.kind`.
- `data` is the native clip in the editor's own JSON, possibly sparse, timed as the stand-in was when written: `id`, `trackId`, `start` and `duration` are left out and come from the stand-in. For a compound clip `data.sequence` holds its sequence and `data.clips` its inner clips; media it needs are in `data.media`, records whose files are inside the project folder.
- `schemaVersion` is the schema version `data` follows.
- `headTrim` (frames, default 0) is how far the stand-in's first frame has moved into the clip it stands for. The editor adds to it when the stand-in is split (the right half), trimmed at its head or slipped, so a conversion starts the native clip at the same moment. Copy, paste, undo and redo keep the block.

```json FallbackOf
{ "kind": "shape", "reason": "A vector shape baked to a solid", "schemaVersion": 4, "headTrim": 5, "data": { "kind": "shape", "name": "Star", "transform": { "x": 0, "y": 0 } } }
```

Conventions for generated projects (the editor needs none of them): label colors for baked layers (violet sprite, orange overlay, red plate), bins by kind (Audio, Images, Sprites, Overlays, Plates), labeled markers at scene starts, and the optional `FALLBACKS.md` and `OPEN.txt` files shown read-only in the Project section.

Generator fallback levels, from best to worst: a **sprite** (a baked image or short video of one layer, label color violet), an **overlay** (the layer with its effects baked over transparent, orange), a **plate** (the whole frame baked, red). Use the lowest level that keeps the look.

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
| `a` | number (>= 0, <= 1) | yes |  | Alpha. |

#### Gradient

A vertical two-stop gradient, `from` at the top of the box it fills to `to` at the bottom.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `from` | [RGBA](#rgba) | yes |  | Top color. |
| `to` | [RGBA](#rgba) | yes |  | Bottom color. |

#### Transform

Where a layer sits. x and y are project pixels from the project center (right and down are positive); scale 1 is the native size.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `x` | number | yes | `0` | Horizontal offset, project px. |
| `y` | number | yes | `0` | Vertical offset, project px. |
| `scale` | number (> 0) | yes | `1` | Scale (the horizontal one when `scaleY` is present). |
| `scaleY` | number (> 0) | no |  | Vertical scale when it differs from `scale`. |
| `rotation` | number | yes | `0` | Degrees, clockwise. |
| `anchor` | [Anchor](#anchor) | yes | `{"x":0,"y":0}` | The point the layer turns and scales around, fractions of its size from its center. |
| `flipH` | boolean | yes | `false` | Mirrored left to right. |
| `flipV` | boolean | yes | `false` | Mirrored top to bottom. |

#### Anchor

A point as fractions of a layer's size from its center.

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
| `value` | number | yes |  | The value. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | yes |  | The curve to the next key. |

#### Keyframes

Keyframe lists by property id, each sorted by frame.

Value: object of [Keyframe](#keyframe)[] (keys: `transform.x`, `transform.y`, `transform.scale`, `transform.scaleY`, `transform.rotation`, `opacity`, `volume.gainDb`).

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
| `mode` | `"line"` | `"block"` | yes | `"block"` | One box per line or one for the block. |

#### TextStyle

The look of a text clip. Sizes are project px; `lineHeight` multiplies the size.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `fontFamily` | string (not empty) | yes |  | A family name; a missing family draws with the UI font. |
| `fontWeight` | integer (>= 1, <= 1000) | yes | `700` | 1..1000 (variable fonts take any value in their range). |
| `italic` | boolean | yes | `false` | Italic face. |
| `fontSize` | number (> 0) | yes | `96` | Size, project px. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | yes | `{"r":1,"g":1,"b":1,"a":1}` | A color or a vertical two-stop gradient. |
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
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | no |  | Timing curve; the animation's own when absent. |

#### PresetTextAnim

A preset's animation, timed in milliseconds (presets cross frame rates).

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | `"fade"` | `"slideUp"` | `"slideDown"` | `"slideLeft"` | `"slideRight"` | `"pop"` | `"typewriter"` | `"wordPop"` | `"wordFade"` | `"lineReveal"` | `"blurIn"` | `"scaleBounce"` | yes |  | The animation. |
| `durationMs` | number (>= 0) | yes |  | Whole animation, ms. |
| `perUnit` | `"char"` | `"word"` | `"line"` | no |  | What moves one by one. |
| `staggerMs` | number (>= 0) | no |  | Delay between units, ms. |
| `ease` | `"linear"` | `"easeIn"` | `"easeOut"` | `"easeInOut"` | `"hold"` | `"smooth"` | `"snap"` | `"overshoot"` | no |  | Timing curve. |

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
| `tags` | string[] | yes |  | Its user sets. |
| `favorite` | boolean | yes |  | Starred. |
| `createdAt` | string | yes |  | ISO time. |
| `updatedAt` | string | yes |  | ISO time. |

#### CaptionHighlight

How the word being spoken stands out when a cue has word timings.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `"none"` | `"color"` | `"background"` | `"scale"` | `"colorAndScale"` | yes |  | The effect. |
| `color` | [RGBA](#rgba) | yes |  | The active word's fill (color modes) or its box (background). |
| `inactiveColor` | [RGBA](#rgba) | yes |  | The fill of the other words while a cue has word timings. |

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

#### CaptionTextOverride

The text style fields a cue can set over its track's; the parts of the stroke, shadow and background one by one.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `fontFamily` | string (not empty) | no |  | Family. |
| `fontWeight` | integer (>= 1, <= 1000) | no |  | Weight. |
| `italic` | boolean | no |  | Italic. |
| `fontSize` | number (> 0) | no |  | Size. |
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | no |  | Fill. |
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
| `mode` | `"line"` | `"block"` | no | `"block"` | One box per line or one for the block. |

#### CaptionHighlightOverride

Any parts of `CaptionHighlight`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `"none"` | `"color"` | `"background"` | `"scale"` | `"colorAndScale"` | no |  | The effect. |
| `color` | [RGBA](#rgba) | no |  | The active word's fill (color modes) or its box (background). |
| `inactiveColor` | [RGBA](#rgba) | no |  | The fill of the other words while a cue has word timings. |

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
| `schemaVersion` | integer (>= 1) | yes | `4` | The schema version; this build writes and reads up to the current one. |
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
| `fill` | [RGBA](#rgba) | [Gradient](#gradient) | yes |  | A color or a vertical two-stop gradient. |
| `shape` | `"rect"` | `"roundedRect"` | `"ellipse"` | `"line"` | yes |  | The shape. |
| `size` | [Size](#size) | yes |  | Width and height at scale 1, project px. |
| `cornerRadius` | number (>= 0) | yes | `0` | Corner radius, project px (at most half the shorter side; rounds a line's ends). |
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
