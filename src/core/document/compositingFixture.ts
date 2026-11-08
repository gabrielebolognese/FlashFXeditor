// The project of fixtures/interop/compositing (Batch 72, spec §21.17), 360 x 640 at 30 fps, in
// 10-frame segments, each checked at its middle frame (`COMPOSITING_FIXTURE_FRAMES`):
// - 0 to 129, the test chart: color bars (V1) under a gray ramp with a color band, opaque at the top and
//   half transparent at the bottom (V2), one segment per blend mode in `BLEND_MODES` order.
// - 130: a multiply texture over paper. 140: two screen light leaks over the video (one mirrored, at 70%).
// - 150: the video inside a text matte (alpha), the title matte-only, over a dark solid.
// - 160: the video through an inverted luma matte (a radial white disc, matte-only) over the color bars.
// Media: generated pictures (scripts/fixtures/make-compositing-images.mjs) and the basic fixture's clip.mp4.
// Shared by the fixture test (which checks the committed project.json against this build) and the
// writer (`WRITE_COMPOSITING_FIXTURE=1 npx vitest run src/core/document/compositingFixture.test.ts`).
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { makeMedia, makeMediaClip, makeSolidClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import { BLEND_MODES, type BlendMode, type Clip, type MediaClip, type MediaItem, type Project, type TextClip, type TrackMatte } from "./types.js";

export const COMPOSITING_FIXTURE_SIZE = { width: 360, height: 640 } as const;
export const SEGMENT = 10;
/** The segments after the chart's 13. */
export const MULTIPLY_SEGMENT = BLEND_MODES.length;
export const SCREEN_SEGMENT = MULTIPLY_SEGMENT + 1;
export const TEXT_MATTE_SEGMENT = MULTIPLY_SEGMENT + 2;
export const LUMA_MATTE_SEGMENT = MULTIPLY_SEGMENT + 3;
const SEGMENTS = LUMA_MATTE_SEGMENT + 1;
export const COMPOSITING_FIXTURE_FRAMES: readonly number[] = Array.from({ length: SEGMENTS }, (_, i) => i * SEGMENT + SEGMENT / 2);

const IMAGES = ["bars", "ramp", "paper", "texture", "leak", "radial"] as const;
type ImageId = (typeof IMAGES)[number];

export function buildCompositingFixture(): Project {
  const project = createProject({ id: "c7e4b1d2-9a35-4f68-8b0e-2d61f5a3c972", name: "Interop compositing", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...COMPOSITING_FIXTURE_SIZE, background: { r: 0.07, g: 0.07, b: 0.09, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/compositing (Batch 72)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2"), emptyTrack("v3", "video", "V3")];
  for (const id of IMAGES) {
    const item = makeMedia(id, "image", 0);
    project.media[id] = { ...item, name: `${id}.png`, file: { relPath: `media/${id}.png` }, codec: "png", width: COMPOSITING_FIXTURE_SIZE.width, height: COMPOSITING_FIXTURE_SIZE.height, hasAudio: false };
  }
  const video: MediaItem = { ...makeMedia("video", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761, addedAt: "2026-11-08T12:00:00.000Z" };
  project.media.video = video;
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  const image = (id: string, trackId: string, mediaId: ImageId, segment: number, segments: number, extra: Partial<MediaClip> = {}): void => {
    const duration = segments * SEGMENT;
    add({ ...makeMediaClip(project, { id, trackId, start: segment * SEGMENT, duration, mediaId, kind: "image" }), out: frameToUs(duration, fps), ...extra });
  };
  const movie = (id: string, trackId: string, segment: number, extra: Partial<MediaClip> = {}): void => {
    add({ ...makeMediaClip(project, { id, trackId, start: segment * SEGMENT, duration: SEGMENT, mediaId: "video" }), in: 0, out: frameToUs(SEGMENT, fps), ...extra });
  };
  const blendOf = (mode: BlendMode): Partial<MediaClip> => (mode === "normal" ? {} : { blend: mode });

  // The chart: one blend mode per segment.
  image("chart-bars", "v1", "bars", 0, BLEND_MODES.length);
  BLEND_MODES.forEach((mode, i) => image(`chart-${mode}`, "v2", "ramp", i, 1, blendOf(mode)));
  // Multiply over paper; two screen leaks over the video.
  image("paper", "v1", "paper", MULTIPLY_SEGMENT, 1);
  image("texture", "v2", "texture", MULTIPLY_SEGMENT, 1, { blend: "multiply" });
  movie("leak-video", "v1", SCREEN_SEGMENT);
  image("leak", "v2", "leak", SCREEN_SEGMENT, 1, { blend: "screen" });
  image("leak-mirrored", "v3", "leak", SCREEN_SEGMENT, 1, { blend: "screen", opacity: 0.7, transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: true, flipV: true } });
  // The video inside a text matte.
  add({ ...makeSolidClip({ id: "matte-bg", trackId: "v1", start: TEXT_MATTE_SEGMENT * SEGMENT, duration: SEGMENT }), fill: { r: 0.1, g: 0.12, b: 0.22, a: 1 }, size: { w: 360, h: 640 } });
  const textMatte: TrackMatte = { clipId: "title", mode: "alpha" };
  movie("text-video", "v2", TEXT_MATTE_SEGMENT, { matte: textMatte });
  const title: TextClip = {
    kind: "text",
    id: "title",
    trackId: "v3",
    name: "Title",
    start: TEXT_MATTE_SEGMENT * SEGMENT,
    duration: SEGMENT,
    enabled: true,
    matteOnly: true,
    text: textContent("BIG\nTYPE", { mode: "auto", width: 240 }),
    style: { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 96, lineHeight: 1 },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    fades: { in: 0, out: 0 },
  };
  add(title);
  // The video through an inverted luma matte.
  image("luma-bars", "v1", "bars", LUMA_MATTE_SEGMENT, 1);
  movie("luma-video", "v2", LUMA_MATTE_SEGMENT, { matte: { clipId: "luma-matte", mode: "lumaInverted" } });
  image("luma-matte", "v3", "radial", LUMA_MATTE_SEGMENT, 1, { matteOnly: true });
  return project;
}
