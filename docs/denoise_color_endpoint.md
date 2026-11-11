# Denoise and color correction endpoint

For apps that build or edit Shorts Editor projects (`project.json` in a project folder) and want clean,
balanced footage without choosing any values themselves.

One call measures every video and image clip of a project, then writes two ordinary effects on each clip:

- **`denoise`**: removes grain. Its strength follows the noise the clip actually has.
- **`colorCorrect`**: white balance, exposure, levels, brightness, contrast, clarity, sharpening and
  saturation. The values differ per clip, and the clips are **matched to each other**: a clip that is
  brighter, darker or warmer than the others is moved to the group's middle.

The effects stay editable in the editor (Properties, Effects) and render like any other effect. Nothing is
baked into the media.

There are three ways to call it. All do the same work.

| Way | Use it when |
| --- | --- |
| CLI: `enhance <dir>` | your app already shells out to the editor's CLI (`normalize`, `validate`, `render`) |
| HTTP: `POST /enhance` | your app prefers a local HTTP call, or runs many jobs |
| By hand: write the effects into `project.json` | you want fixed values and no measuring |

## Requirements

- Node 22.12 or later, Chrome or Edge installed (the measuring runs in headless Chrome, like `render`).
- The editor built once: `npm run build` and `npm run build:cli`.
- The project folder holds `project.json` at schema 24 and its media files. For a sparse or older
  project, run `normalize <dir> --write` first.

## 1. CLI

```
node dist-cli/project-cli.mjs enhance <project folder> [options]
```

(`npm run cli -- enhance <project folder>` builds the CLI first when the sources changed.)

| Option | Meaning | Default |
| --- | --- | --- |
| `--preset <id>` | the look (see Presets) | `balanced` |
| `--only denoise` or `--only color` | write only one of the two effects | both |
| `--no-match` | solve each clip on its own, do not match the clips | match |
| `--match <0..1>` | how far the clips are moved towards each other | `1` |
| `--clips <id,id>` | only these clip ids (they are matched among themselves) | every video and image clip |
| `--dry-run` | measure and report, write nothing | write |
| `--json` | print the report as JSON on stdout | text |

Exit codes: `0` written (or planned with `--dry-run`), `1` failed or nothing to enhance, `2` wrong usage.

The usual order in a pipeline:

```
node dist-cli/project-cli.mjs normalize my-project --write
node dist-cli/project-cli.mjs enhance   my-project --preset balanced --json
node dist-cli/project-cli.mjs validate  my-project
node dist-cli/project-cli.mjs render    my-project --out out/video.mp4
```

Run `enhance` after the clips are in place and before `render`. Running it again updates the same two
effects instead of adding new ones.

`node dist-cli/project-cli.mjs enhance-presets` prints the presets as JSON.

## 2. HTTP

Start the server once (it stays up until Ctrl+C):

```
node dist-cli/project-cli.mjs enhance-server --port 5320
```

It listens on `127.0.0.1` only (`--host` changes that). Ports 5300 and 5310 are refused: they belong to
other tools on this machine. Jobs run one at a time; a second request waits for the first.

### `GET /health`

```json
{ "ok": true, "name": "shorts-editor-enhance", "version": "1.2.0", "schemaVersion": 24 }
```

### `GET /presets`

```json
{ "default": "balanced", "presets": [{ "id": "balanced", "name": "Balanced", "description": "...", "default": true, "denoise": { "...": "..." }, "color": { "...": "..." } }] }
```

### `POST /enhance`

The body is JSON. Only `project` is required.

```json
{
  "project": "C:/work/my-project",
  "preset": "balanced",
  "denoise": true,
  "color": true,
  "match": true,
  "matchStrength": 1,
  "clips": null,
  "dryRun": false
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `project` | string | the project folder (absolute path on the machine the server runs on) |
| `preset` | string | a preset id; `balanced` when absent |
| `denoise` | boolean | write the denoise effect; true when absent |
| `color` | boolean | write the color correct effect; true when absent |
| `match` | boolean | match the clips to each other; true when absent |
| `matchStrength` | number 0..1 | how far the clips are moved towards each other; 1 when absent |
| `clips` | string[] or null | clip ids; every video and image clip when null or absent |
| `dryRun` | boolean | report only, leave `project.json` as it is |

Example:

```
curl -s -X POST http://127.0.0.1:5320/enhance -d "{\"project\":\"C:/work/my-project\"}"
```

```js
const response = await fetch("http://127.0.0.1:5320/enhance", {
  method: "POST",
  body: JSON.stringify({ project: "C:/work/my-project", preset: "balanced" }),
});
const report = await response.json();
if (!report.ok) throw new Error(report.errors.join("; "));
```

```python
import json, urllib.request
body = json.dumps({"project": "C:/work/my-project", "preset": "balanced"}).encode()
report = json.load(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:5320/enhance", data=body, method="POST")))
```

Status codes:

| Status | Meaning |
| --- | --- |
| 200 | done; the report's `ok` is true |
| 400 | the request is wrong (bad JSON, unknown preset, no `project.json` there); nothing ran |
| 422 | the job ran but nothing was written; see `errors` |
| 500 | the job crashed (for example Chrome did not start); see `errors` |

## The report

The CLI with `--json` and `POST /enhance` return the same object:

```json
{
  "ok": true,
  "project": "C:\\work\\my-project",
  "preset": "balanced",
  "written": true,
  "clips": [
    {
      "clipId": "c1",
      "denoise": { "method": "hybrid", "luma": 0.5, "chroma": 0.7, "detail": 0.45, "shadows": 0.5, "noise": 0.0062 },
      "color": { "amount": 1, "exposure": -0.25, "black": 0.03, "white": 0.854, "gamma": 1.5, "contrast": 15, "temperature": -18, "tint": 1, "saturation": 35, "vibrance": 18, "highlights": -15, "shadows": 6, "clarity": 22, "sharpen": 35 },
      "measured": { "brightness": 0.3617, "saturation": 0.074, "noise": 0.0062, "lumaNoise": 0.0062, "chromaNoise": 0.0025, "illuminant": [1, 0.922, 0.83] },
      "predicted": { "brightness": 0.459, "saturation": 0.09 }
    }
  ],
  "skipped": [{ "clipId": "t1", "reason": "a text clip has no picture to measure" }],
  "errors": []
}
```

- `clips[].denoise` and `clips[].color` are exactly the `params` written into the two effects (null for
  the one that was switched off).
- `measured` is what was found in the clip: mean brightness and saturation (0..1), the noise level
  (standard deviation, 0..1), and the color of the scene light (its largest channel is 1; `[1, 0.92, 0.83]`
  is a warm light).
- `predicted` is the mean brightness and saturation the correction gives. After matching, the
  `predicted.brightness` of all clips is nearly the same.
- `skipped` lists clips that were asked for but could not be measured (not a video or image, a missing
  file, a codec Chrome cannot decode). They are left unchanged; the job still succeeds for the others.
- When the written project does not validate, the old `project.json` is put back, `written` is false and
  `errors` holds the validation messages.

## What is written into project.json

On every enhanced clip, at the head of its `effects` list (the denoise first, so the correction works on
the clean picture; effects the clip already has are kept after them):

```json
"effects": [
  { "id": "fx1", "type": "denoise", "enabled": true,
    "params": { "method": "hybrid", "luma": 0.5, "chroma": 0.7, "detail": 0.45, "shadows": 0.5, "noise": 0.0062 } },
  { "id": "fx2", "type": "colorCorrect", "enabled": true,
    "params": { "amount": 1, "exposure": -0.25, "black": 0.03, "white": 0.854, "gamma": 1.5, "contrast": 15,
                "temperature": -18, "tint": 1, "saturation": 35, "vibrance": 18, "highlights": -15, "shadows": 6,
                "clarity": 22, "sharpen": 35 } }
]
```

A clip that already has a `denoise` or `colorCorrect` effect gets that effect updated (and switched on) in
place; its id and its position in the stack stay.

## 3. Writing the effects by hand

Both are normal effects (`docs/INTEROP.md`, effects; `capabilities.json` lists them). An app can write
them itself with fixed values and skip the measuring. Missing parameters take their defaults.

### `denoise`

| Parameter | Range | Default | Meaning |
| --- | --- | --- | --- |
| `method` | `hybrid`, `wavelet`, `nlm`, `bilateral`, `median` | `hybrid` | the filter family (see below) |
| `luma` | 0..1 | 0.5 | how hard brightness grain is removed |
| `chroma` | 0..1 | 0.7 | how hard color blotches are removed |
| `detail` | 0..1 | 0.4 | how much real texture and edge detail is put back |
| `shadows` | 0..1 | 0.5 | extra strength in dark areas, where noise is worst |
| `noise` | 0..0.2 | 0.02 | the noise level the thresholds are built on; `enhance` writes the measured value |

When you write `noise` by hand: about 0.003 is a clean daylight clip, 0.006 a phone clip indoors at
night, 0.02 visibly grainy, 0.05 very noisy.

| Method | What it does | Good for |
| --- | --- | --- |
| `hybrid` | non-local means on the finest grain, then three wavelet levels for coarse blotches, then detail put back along edges | most footage; the default |
| `wavelet` | five edge-avoiding wavelet levels | coarse, blotchy noise; the fastest |
| `nlm` | non-local means twice | fine grain on textured subjects (fabric, hair) |
| `bilateral` | joint bilateral filter twice | light noise where every edge must stay |
| `median` | 3 x 3 median twice, then a color wavelet level | speckle, hot pixels, compression dots |

All numeric parameters can be keyframed (`effects.<id>.<param>`).

### `colorCorrect`

Applied in this order:

| Parameter | Range | Default | Meaning |
| --- | --- | --- | --- |
| `temperature` | -100..100 | 0 | white balance: above 0 warmer, below cooler |
| `tint` | -100..100 | 0 | white balance: above 0 towards magenta, below towards green |
| `exposure` | -3..3 EV | 0 | stops of light |
| `black` | 0..0.5 | 0 | input level that becomes black |
| `white` | 0.5..1 | 1 | input level that becomes white |
| `gamma` | 0.3..3 | 1 | brightness of the middle: above 1 brighter (black and white stay) |
| `shadows` | -100..100 | 0 | lifts or deepens the dark range |
| `highlights` | -100..100 | 0 | lifts or pulls down the bright range |
| `contrast` | -100..100 | 0 | above 0 an S curve, below 0 flatter |
| `clarity` | 0..100 | 0 | local contrast (large structures stand out) |
| `sharpen` | 0..100 | 0 | fine detail; differences the size of grain are left alone |
| `saturation` | -100..100 | 0 | all colors; a boost fades out in deep shadows |
| `vibrance` | -100..100 | 0 | mostly the dull colors |
| `amount` | 0..1 | 1 | mixes the result with the uncorrected picture |

## Presets

`balanced` is the default. Every preset measures the noise and matches the clips; they differ in the
denoise method, the strengths and the look.

| Id | Denoise | Look |
| --- | --- | --- |
| `balanced` | hybrid, medium | neutral white balance, moderate contrast and clarity |
| `clean` | hybrid, strong | soft contrast, lifted shadows (dim footage) |
| `crisp` | non-local means, light | strong clarity and sharpening |
| `punchy` | hybrid, medium | exposure down and brightness up, high contrast, vivid color |
| `natural` | wavelet, light | gentle, close to the source |
| `bright` | wavelet, medium | brighter middle, open shadows |
| `cinematic` | hybrid, medium to strong | deeper blacks, strong contrast, restrained color |
| `detail` | bilateral, light | maximum sharpening |
| `smooth` | hybrid, maximum | skin and walls go smooth, light sharpening |
| `vivid` | median then wavelet | saturated color, strong clarity |

## How the values are chosen

1. **Sampling.** Five frames spread over the part of the media each clip uses (one for an image).
2. **Noise.** In a crop at the size the clip is shown: how much a pixel differs from its four neighbors,
   over the flattest quarter of 16 px blocks (edges and texture are left out), at 1, 2 and 4 px, in
   brightness and in color. That number becomes `denoise.noise`.
3. **Per clip.** White balance from the scene light (near-neutral pixels, or a shades-of-gray estimate when
   there are few). Black point from the darkest 2 percent, white point from the brightest half percent. The
   preset's exposure, then `gamma` solved so the mean brightness lands on the preset's target. Contrast
   scaled back for a clip that is already contrasty. Saturation moved towards the preset's target, but
   never far from the scene's own.
4. **Matching.** Each clip's result is predicted from its histogram. Brightness, saturation and color
   cast of every clip are then moved to the median of the group.

## Limits

- Only video and image clips are measured. Text, shapes, solids, compound, Lottie and adjustment clips are
  skipped (you can still write the effects on them by hand).
- The values are fixed for the whole clip. A clip whose light changes a lot in the middle is corrected for
  its average; split it at the change so each half gets its own values.
- Matching aligns overall brightness, saturation and color cast. It is one white balance per clip, so two
  clips lit by very different lamps come close, not identical.
- The denoise is spatial: it works inside each frame. It does not average across frames, so very heavy
  noise can still shimmer slightly in motion.
- The denoise costs render time: about 300 texture reads per pixel for `hybrid`, 450 for `nlm`, 125 for
  `wavelet`, 100 for `bilateral`.
- Media Chrome cannot decode is skipped with the reason in `skipped`.
