// The project of fixtures/interop/effects-2 (Batch 75, spec §21.19), 360 x 640 at 30 fps, in 10-frame
// segments, each checked at its middle frame (`EFFECTS2_FIXTURE_FRAMES`). A purple backdrop (a solid on V1)
// runs under everything, so keyed pixels show it; the subjects are on V2:
// - 5, 15: color adjust on chart.png: exposure 0.5, contrast 30, saturation 40; then temperature 60, tint -30,
//   hue 90, vibrance 50, brightness -20.
// - 25, 35: vignette on the chart scaled 1.5: default; amount 1, radius 0.4, softness 0.3.
// - 45, 55: sharpen on the video: default (amount 1, radius 1.5); amount 5, radius 6.
// - 65, 75: grain on the chart: default (animated); amount 0.6, size 6, not animated.
// - 85, 95: chroma key on greenscreen.png: default (spill suppression 0.6); spill 0 (the green rim stays).
// - 105, 115: luma key on the chart: default (dark parts keyed); threshold 0.5, inverted.
// - 125, 135: the LUT luts/warm.cube on the chart at intensity 0.5, then 1.
// - 145: a green screen look: chroma key, color adjust (exposure 0.3, temperature 20), the LUT at 0.5.
// Media: chart.png, greenscreen.png, luts/warm.cube (scripts/fixtures/make-effects2-media.mjs) and the
// basic fixture's clip.mp4. Shared by the fixture test (which checks the committed project.json against
// this build) and the writer (`WRITE_EFFECTS2_FIXTURE=1 npx vitest run src/core/document/effectsFixture2.test.ts`).
import { makeMedia, makeMediaClip, makeSolidClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { Clip, Effect, MediaClip, MediaItem, Project } from "./types.js";
import { EFFECT_SEGMENT, EFFECTS_FIXTURE_SIZE, fixtureEffect } from "./effectsFixture.js";

export const COLOR_SEGMENT = 0;
export const VIGNETTE_SEGMENT = 2;
export const SHARPEN_SEGMENT = 4;
export const GRAIN_SEGMENT = 6;
export const CHROMA_SEGMENT = 8;
export const LUMA_SEGMENT = 10;
export const LUT_SEGMENT = 12;
export const LOOK_SEGMENT = 14;
const SEGMENTS = LOOK_SEGMENT + 1;
export const EFFECTS2_FIXTURE_FRAMES: readonly number[] = Array.from({ length: SEGMENTS }, (_, i) => i * EFFECT_SEGMENT + EFFECT_SEGMENT / 2);
export const FIXTURE_LUT = "luts/warm.cube";

export function buildEffects2Fixture(): Project {
  const project = createProject({ id: "5b2e8c41-9d7a-4f36-b0e2-7a1c4d9f3e85", name: "Interop effects-2", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...EFFECTS_FIXTURE_SIZE, background: { r: 0.16, g: 0.18, b: 0.24, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/effects-2 (Batch 75)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2")];
  const added = "2026-11-09T12:00:00.000Z";
  const video: MediaItem = { ...makeMedia("video", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761, addedAt: added };
  const chart: MediaItem = { ...makeMedia("chart", "image", 0), name: "chart.png", file: { relPath: "media/chart.png" }, codec: "png", width: 240, height: 240, hasAudio: false, size: 35741, addedAt: added };
  const screen: MediaItem = { ...makeMedia("screen", "image", 0), name: "greenscreen.png", file: { relPath: "media/greenscreen.png" }, codec: "png", width: 240, height: 320, hasAudio: false, size: 18599, addedAt: added };
  project.media.video = video;
  project.media.chart = chart;
  project.media.screen = screen;
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  // The backdrop: a purple solid over the whole frame and the whole timeline.
  add({ ...makeSolidClip({ id: "backdrop", trackId: "v1", start: 0, duration: SEGMENTS * EFFECT_SEGMENT }), fill: { r: 0.42, g: 0.2, b: 0.55, a: 1 }, size: { w: EFFECTS_FIXTURE_SIZE.width, h: EFFECTS_FIXTURE_SIZE.height } });
  const image = (id: string, mediaId: string, segment: number, effects: Effect[], extra: Partial<MediaClip> = {}): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v2", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, mediaId, kind: "image" }), effects, ...extra });
  };
  const movie = (id: string, segment: number, effects: Effect[]): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v2", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, mediaId: "video" }), in: 0, out: frameToUs(EFFECT_SEGMENT, fps), effects });
  };
  const scaled = { transform: { x: 0, y: 0, scale: 1.5, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } };

  image("color-a", "chart", COLOR_SEGMENT, [fixtureEffect("fx1", "colorAdjust", { exposure: 0.5, contrast: 30, saturation: 40 })]);
  image("color-b", "chart", COLOR_SEGMENT + 1, [fixtureEffect("fx1", "colorAdjust", { temperature: 60, tint: -30, hue: 90, vibrance: 50, brightness: -20 })]);
  image("vignette-default", "chart", VIGNETTE_SEGMENT, [fixtureEffect("fx1", "vignette")], scaled);
  image("vignette-extreme", "chart", VIGNETTE_SEGMENT + 1, [fixtureEffect("fx1", "vignette", { amount: 1, radius: 0.4, softness: 0.3 })], scaled);
  movie("sharpen-default", SHARPEN_SEGMENT, [fixtureEffect("fx1", "sharpen")]);
  movie("sharpen-extreme", SHARPEN_SEGMENT + 1, [fixtureEffect("fx1", "sharpen", { amount: 5, radius: 6 })]);
  image("grain-default", "chart", GRAIN_SEGMENT, [fixtureEffect("fx1", "grain")]);
  image("grain-extreme", "chart", GRAIN_SEGMENT + 1, [fixtureEffect("fx1", "grain", { amount: 0.6, size: 6, animated: 0 })]);
  image("chroma-default", "screen", CHROMA_SEGMENT, [fixtureEffect("fx1", "chromaKey")]);
  image("chroma-no-spill", "screen", CHROMA_SEGMENT + 1, [fixtureEffect("fx1", "chromaKey", { spill: 0 })]);
  image("luma-default", "chart", LUMA_SEGMENT, [fixtureEffect("fx1", "lumaKey")]);
  image("luma-inverted", "chart", LUMA_SEGMENT + 1, [fixtureEffect("fx1", "lumaKey", { threshold: 0.5, invert: 1 })]);
  image("lut-half", "chart", LUT_SEGMENT, [fixtureEffect("fx1", "lut", { file: FIXTURE_LUT, intensity: 0.5 })]);
  image("lut-full", "chart", LUT_SEGMENT + 1, [fixtureEffect("fx1", "lut", { file: FIXTURE_LUT })]);
  image("look", "screen", LOOK_SEGMENT, [fixtureEffect("fx1", "chromaKey"), fixtureEffect("fx2", "colorAdjust", { exposure: 0.3, temperature: 20 }), fixtureEffect("fx3", "lut", { file: FIXTURE_LUT, intensity: 0.5 })]);
  return project;
}
