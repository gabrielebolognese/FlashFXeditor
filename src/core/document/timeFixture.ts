// The project of fixtures/interop/time (Batch 78, spec §21.22), 360 x 640 at 30 fps: three video clips of one
// 10 s source (media/clip.mp4, not shipped: the fixture states the expected source times, not pixels):
// - "ramp": a Hero ramp (fast, slow, fast) over 60 frames of the source from 5 s.
// - "back": the same range played in reverse.
// - "slow": 25 percent speed with frame blending on.
// Written by `WRITE_TIME_FIXTURE=1 npx vitest run --project unit src/core/document/timeFixture.test.ts`.
import { makeMedia, makeMediaClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import { clipSourceUs, rampKeys } from "./timeRemap.js";
import type { Clip, MediaClip, Project } from "./types.js";

export const TIME_FROM_US = 5_000_000;
export const TIME_FRAMES = 60;

export function buildTimeFixture(): Project {
  const project = createProject({ id: "b2f4a7c1-5d36-4e18-8a90-3c7e1d6f2b45", name: "Interop time", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 360, height: 640 };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/time (Batch 78)" };
  project.tracks = [emptyTrack("v1", "video", "Ramp"), emptyTrack("v2", "video", "Reverse"), emptyTrack("v3", "video", "Slow")];
  project.media.src = { ...makeMedia("src", "video", 10_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, addedAt: "2026-11-09T12:00:00.000Z" };
  const fps = project.settings.fps;
  const to = TIME_FROM_US + frameToUs(TIME_FRAMES, fps);
  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  const base = (id: string, trackId: string): MediaClip => ({ ...makeMediaClip(project, { id, trackId, start: 0, duration: TIME_FRAMES, mediaId: "src" }), in: TIME_FROM_US, out: to });
  add({ ...base("ramp", "v1"), timeRemap: rampKeys("hero", TIME_FRAMES, TIME_FROM_US, to) });
  add({ ...base("back", "v2"), reverse: true });
  add({ ...base("slow", "v3"), out: TIME_FROM_US + frameToUs(15, fps), speed: 0.25, frameBlend: true });
  return project;
}

/** The expected source time (us) of each clip at the sampled frames. */
export const TIME_SAMPLES: readonly number[] = [0, 9, 18, 30, 42, 51, 59];

export function expectedFrames(project: Project): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const id of ["ramp", "back", "slow"]) out[id] = TIME_SAMPLES.map((frame) => clipSourceUs(project.clips[id] as MediaClip, frame, project.settings.fps));
  return out;
}
