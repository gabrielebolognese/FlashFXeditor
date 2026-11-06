// The project of fixtures/interop/lottie (Batch 79, spec §21.23), 360 x 640 at 60 fps, in 60-frame segments, each
// checked at one frame (`LOTTIE_FIXTURE_FRAMES`). A dark backdrop (a solid on V1) runs under everything; the
// animations are on V2 (original CC0 files in animations/, written by scripts/build-lottie-fixtures.mjs):
// - segment 0: spinner.json (240 x 240, 60 fps, 120 frames), looping, as it is.
// - segment 1: the spinner with its orange replaced by green and its blue by yellow, at speed 2 (so one turn in the segment).
// - segment 2: bounce.json (320 x 200), not looping; the clip (60 frames) shows the first two thirds of its 90 frames.
// - segment 3: the bounce ball's red replaced by violet, scaled 1.1.
// - segment 4: pulse.lottie (an archive, 200 x 200, 30 fps) scaled to 300 percent (stays sharp), looping.
// Shared by the fixture test (which checks the committed project.json against this build) and the writer
// (`WRITE_LOTTIE_FIXTURE=1 npx vitest run src/core/document/lottieFixture.test.ts`).
import { makeMedia, makeMediaClip, makeSolidClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { Clip, MediaClip, MediaItem, Project, RGBA } from "./types.js";

export const LOTTIE_SEGMENT = 60;
export const LOTTIE_FIXTURE_SIZE = { width: 360, height: 640 } as const;
/** One frame per segment, checked in the expected folder. */
export const LOTTIE_FIXTURE_FRAMES: readonly number[] = [20, 80, 140, 200, 260];
const SEGMENTS = 5;

const rgba = (r: number, g: number, b: number): RGBA => ({ r, g, b, a: 1 });

export function buildLottieFixture(): Project {
  const project = createProject({ id: "2d8c5e17-9b34-4f60-a1d2-6e03c7b94f58", name: "Interop lottie", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...LOTTIE_FIXTURE_SIZE, fps: { num: 60, den: 1 }, background: rgba(0.08, 0.09, 0.12) };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/lottie (Batch 79)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2")];
  const added = "2026-11-09T12:00:00.000Z";
  const animation = (id: string, file: string, codec: "lottie" | "dotlottie", width: number, height: number, frames: number, fps: number, size: number): MediaItem => ({
    ...makeMedia(id, "lottie", Math.round((frames / fps) * 1e6)),
    name: file,
    file: { relPath: `animations/${file}` },
    width,
    height,
    fps: { num: fps, den: 1 },
    codec,
    hasAudio: false,
    size,
    addedAt: added,
  });
  project.media.spinner = animation("spinner", "spinner.json", "lottie", 240, 240, 120, 60, 1385);
  project.media.bounce = animation("bounce", "bounce.json", "lottie", 320, 200, 90, 60, 1476);
  project.media.pulse = animation("pulse", "pulse.lottie", "dotlottie", 200, 200, 60, 30, 658);
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  add({ ...makeSolidClip({ id: "backdrop", trackId: "v1", start: 0, duration: SEGMENTS * LOTTIE_SEGMENT }), fill: rgba(0.16, 0.18, 0.28), size: { w: LOTTIE_FIXTURE_SIZE.width, h: LOTTIE_FIXTURE_SIZE.height } });
  const lottie = (id: string, segment: number, mediaId: string, extra: Partial<MediaClip> = {}): void => {
    const clip = makeMediaClip(project, { id, trackId: "v2", start: segment * LOTTIE_SEGMENT, duration: LOTTIE_SEGMENT, mediaId, kind: "lottie" });
    add({ ...clip, in: 0, out: frameToUs(LOTTIE_SEGMENT, fps), ...extra });
  };
  const scaled = (scale: number) => ({ transform: { x: 0, y: 0, scale, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } });
  lottie("spinner-loop", 0, "spinner", { loop: true });
  lottie("spinner-green", 1, "spinner", { loop: true, speed: 2, out: frameToUs(LOTTIE_SEGMENT, fps) * 2, colorOverrides: [{ from: rgba(1, 0.5, 0.1), to: rgba(0.2, 0.8, 0.3) }, { from: rgba(0.1, 0.5, 1), to: rgba(1, 0.9, 0.2) }] });
  lottie("bounce-plain", 2, "bounce", scaled(1.1));
  lottie("bounce-violet", 3, "bounce", { ...scaled(1.1), colorOverrides: [{ from: rgba(0.95, 0.2, 0.3), to: rgba(0.55, 0.3, 0.95) }] });
  lottie("pulse-big", 4, "pulse", { ...scaled(3), loop: true });
  return project;
}
