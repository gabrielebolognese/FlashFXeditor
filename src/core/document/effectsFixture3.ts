// The project of fixtures/interop/effects-3 (Batch 76, spec §21.19, §21.20), 360 x 640 at 30 fps, in 10-frame
// segments, each checked at its middle frame (`EFFECTS3_FIXTURE_FRAMES`). A purple backdrop (a solid on V1)
// runs under everything; the subjects are on V2:
// - 5, 15: RGB split on chart.png: default; distance 30 at 45°.
// - 25, 35: pixelate on the chart scaled 1.5: default (16 px); size 40.
// - 45, 55: mirror on the video: default (left half kept); top half kept, line at 0.3.
// - 65, 75: wave on the chart: default (moving); vertical, amplitude 40, wavelength 80, still.
// - 85, 95: one glitch clip on the chart over both segments: default (12 patterns a second, so 85 and 95 differ).
// - 105: glitch amount 1, band 16, shift 120, split 20, seed 7, one pattern.
// - 115, 125: posterize on the video: default (6 levels); 3 levels on the chart.
// - 135, 145: invert on the chart: default; amount 0.5.
// - 155 ... 185: the chart scaled 1.5 over the backdrop; on V3 an adjustment clip at saturation -100 inside an
//   ellipse mask during 160..169 only (155 and 175 stay in color), then an adjustment with two effects
//   (pixelate 24, posterize 3) at opacity 0.5 during 180..189.
// Media: chart.png and clip.mp4 (copies of effects-2's). Shared by the fixture test (which checks the
// committed project.json against this build) and the writer
// (`WRITE_EFFECTS3_FIXTURE=1 npx vitest run src/core/document/effectsFixture3.test.ts`).
import { makeMedia, makeMediaClip, makeSolidClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { AdjustmentClip, Clip, Effect, Mask, MediaClip, MediaItem, Project } from "./types.js";
import { EFFECT_SEGMENT, EFFECTS_FIXTURE_SIZE, fixtureEffect } from "./effectsFixture.js";

export const RGB_SEGMENT = 0;
export const PIXELATE_SEGMENT = 2;
export const MIRROR_SEGMENT = 4;
export const WAVE_SEGMENT = 6;
export const GLITCH_SEGMENT = 8;
export const POSTERIZE_SEGMENT = 11;
export const INVERT_SEGMENT = 13;
/** Before, during and after the black and white adjustment (segments 15, 16, 17), then the two-effect one (18). */
export const ADJUST_SEGMENT = 15;
export const BW_SEGMENT = ADJUST_SEGMENT + 1;
export const TWO_EFFECT_SEGMENT = ADJUST_SEGMENT + 3;
const SEGMENTS = TWO_EFFECT_SEGMENT + 1;
export const EFFECTS3_FIXTURE_FRAMES: readonly number[] = Array.from({ length: SEGMENTS }, (_, i) => i * EFFECT_SEGMENT + EFFECT_SEGMENT / 2);
/** The black and white area: an ellipse in project px. */
export const BW_ELLIPSE = { x: 60, y: 160, w: 240, h: 320 } as const;

export function buildEffects3Fixture(): Project {
  const project = createProject({ id: "7c3f9d52-ae8b-4a47-91f3-8b2d5e0a4f96", name: "Interop effects-3", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...EFFECTS_FIXTURE_SIZE, background: { r: 0.16, g: 0.18, b: 0.24, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/effects-3 (Batch 76)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2"), emptyTrack("v3", "video", "V3")];
  const added = "2026-11-09T12:00:00.000Z";
  const video: MediaItem = { ...makeMedia("video", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761, addedAt: added };
  const chart: MediaItem = { ...makeMedia("chart", "image", 0), name: "chart.png", file: { relPath: "media/chart.png" }, codec: "png", width: 240, height: 240, hasAudio: false, size: 35741, addedAt: added };
  project.media.video = video;
  project.media.chart = chart;
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  add({ ...makeSolidClip({ id: "backdrop", trackId: "v1", start: 0, duration: SEGMENTS * EFFECT_SEGMENT }), fill: { r: 0.42, g: 0.2, b: 0.55, a: 1 }, size: { w: EFFECTS_FIXTURE_SIZE.width, h: EFFECTS_FIXTURE_SIZE.height } });
  const image = (id: string, segment: number, effects: Effect[], extra: Partial<MediaClip> = {}, segments = 1): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v2", start: segment * EFFECT_SEGMENT, duration: segments * EFFECT_SEGMENT, mediaId: "chart", kind: "image" }), effects, ...extra });
  };
  const movie = (id: string, segment: number, effects: Effect[]): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v2", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, mediaId: "video" }), in: 0, out: frameToUs(EFFECT_SEGMENT, fps), effects });
  };
  const adjustment = (id: string, segment: number, effects: Effect[], opacity: number, masks?: Mask[]): void => {
    const clip: AdjustmentClip = { id, trackId: "v3", kind: "adjustment", name: "Adjustment", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, enabled: true, effects, opacity };
    if (masks) clip.masks = masks;
    add(clip);
  };
  const scaled = { transform: { x: 0, y: 0, scale: 1.5, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } };

  image("rgb-default", RGB_SEGMENT, [fixtureEffect("fx1", "rgbSplit")]);
  image("rgb-extreme", RGB_SEGMENT + 1, [fixtureEffect("fx1", "rgbSplit", { distance: 30, angle: 45 })]);
  image("pixelate-default", PIXELATE_SEGMENT, [fixtureEffect("fx1", "pixelate")], scaled);
  image("pixelate-extreme", PIXELATE_SEGMENT + 1, [fixtureEffect("fx1", "pixelate", { size: 40 })], scaled);
  movie("mirror-default", MIRROR_SEGMENT, [fixtureEffect("fx1", "mirror")]);
  movie("mirror-top", MIRROR_SEGMENT + 1, [fixtureEffect("fx1", "mirror", { side: "top", center: 0.3 })]);
  image("wave-default", WAVE_SEGMENT, [fixtureEffect("fx1", "wave")]);
  image("wave-vertical", WAVE_SEGMENT + 1, [fixtureEffect("fx1", "wave", { direction: "vertical", amplitude: 40, wavelength: 80, speed: 0 })]);
  image("glitch-default", GLITCH_SEGMENT, [fixtureEffect("fx1", "glitch")], {}, 2);
  image("glitch-extreme", GLITCH_SEGMENT + 2, [fixtureEffect("fx1", "glitch", { amount: 1, band: 16, shift: 120, split: 20, seed: 7, rate: 0 })]);
  movie("posterize-default", POSTERIZE_SEGMENT, [fixtureEffect("fx1", "posterize")]);
  image("posterize-3", POSTERIZE_SEGMENT + 1, [fixtureEffect("fx1", "posterize", { levels: 3 })]);
  image("invert-default", INVERT_SEGMENT, [fixtureEffect("fx1", "invert")]);
  image("invert-half", INVERT_SEGMENT + 1, [fixtureEffect("fx1", "invert", { amount: 0.5 })]);
  // Under the adjustments: the chart over the backdrop for four segments.
  image("subject", ADJUST_SEGMENT, [], scaled, 4);
  const spot: Mask = { id: "spot", shape: { kind: "ellipse", ...BW_ELLIPSE }, mode: "add", feather: 20, expansion: 0, opacity: 1, inverted: false };
  adjustment("bw", BW_SEGMENT, [fixtureEffect("fx1", "colorAdjust", { saturation: -100 })], 1, [spot]);
  adjustment("two", TWO_EFFECT_SEGMENT, [fixtureEffect("fx1", "pixelate", { size: 24 }), fixtureEffect("fx2", "posterize", { levels: 3 })], 0.5);
  return project;
}
