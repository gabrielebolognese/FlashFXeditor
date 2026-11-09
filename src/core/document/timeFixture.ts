// The project of fixtures/interop/time (Batch 78, spec §21.22), 360 x 640 at 30 fps: three video clips of one
// 2 s source (media/clip.mp4, 30 fps; scripts/fixtures/make-time-media.mjs: white bars that move 40 and 32 px per
// frame over testsrc2), one after another so each one is visible alone:
// - "ramp" (frames 0-44): a Hero ramp (fast, slow, fast) over 45 frames of the source from 0.25 s.
// - "back" (frames 45-89): the same range played in reverse.
// - "slow" (frames 90-149): 25 percent speed with frame blending on (15 source frames).
// The expected pictures (expected/*.png): ramp frames 5, 22, 40; back 50, 60, 80; slow 90, 91, 93 and 125, whose
// source times fall between source frames (mix 0.5, 0.75, 0.25 and 0.25), so each shows a double exposure.
// Written by `WRITE_TIME_FIXTURE=1 npx vitest run --project unit src/core/document/timeFixture.test.ts`.
import { makeMedia, makeMediaClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import { clipSourceUs, rampKeys } from "./timeRemap.js";
import type { Clip, MediaClip, Project } from "./types.js";

export const TIME_FROM_US = 250_000;
export const TIME_FRAMES = 45;

export function buildTimeFixture(): Project {
  const project = createProject({
    id: "b2f4a7c1-5d36-4e18-8a90-3c7e1d6f2b45",
    name: "Interop time",
    now: "2026-11-09T12:00:00.000Z",
    appVersion: "1.1.0",
  });
  project.settings = { ...project.settings, width: 360, height: 640 };
  project.meta.generator = {
    name: "interop-fixture",
    version: "1",
    source: "fixtures/interop/time (Batch 78)",
  };
  project.tracks = [
    emptyTrack("v1", "video", "Ramp"),
    emptyTrack("v2", "video", "Reverse"),
    emptyTrack("v3", "video", "Slow"),
  ];
  project.media.src = {
    ...makeMedia("src", "video", 2_000_000),
    name: "clip.mp4",
    width: 270,
    height: 480,
    fps: { num: 30, den: 1 },
    codec: "h264",
    audioCodec: "aac",
    file: { relPath: "media/clip.mp4" },
    addedAt: "2026-11-09T12:00:00.000Z",
  };
  const fps = project.settings.fps;
  const to = TIME_FROM_US + frameToUs(TIME_FRAMES, fps);
  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  const base = (
    id: string,
    trackId: string,
    start: number,
    duration = TIME_FRAMES,
  ): MediaClip => ({
    ...makeMediaClip(project, { id, trackId, start, duration, mediaId: "src" }),
    in: TIME_FROM_US,
    out: to,
  });
  add({
    ...base("ramp", "v1", 0),
    timeRemap: rampKeys("hero", TIME_FRAMES, TIME_FROM_US, to),
  });
  add({ ...base("back", "v2", TIME_FRAMES), reverse: true });
  add({
    ...base("slow", "v3", 2 * TIME_FRAMES, 60),
    out: TIME_FROM_US + frameToUs(15, fps),
    speed: 0.25,
    frameBlend: true,
  });
  return project;
}

/** The expected source time (us) of each clip at the sampled frames (offsets from the clip's first frame). */
export const TIME_SAMPLES: readonly number[] = [0, 7, 15, 22, 30, 38, 44];

export function expectedFrames(project: Project): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const id of ["ramp", "back", "slow"])
    out[id] = TIME_SAMPLES.map((offset) => {
      const clip = project.clips[id] as MediaClip;
      return clipSourceUs(clip, clip.start + offset, project.settings.fps);
    });
  return out;
}
