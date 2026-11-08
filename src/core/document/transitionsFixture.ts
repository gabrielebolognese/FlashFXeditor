// The project of fixtures/interop/transitions (Batch 71, spec §21.16): fourteen still pictures on one
// track, alternating between two images (media/a.png warm, media/b.png cool), joined by thirteen
// transitions, one per kind, each 11 frames (6 before the cut, 5 after) so that the frame before the
// cut is exactly the midpoint (mix 0.5; easeInOut(0.5) = 0.5 too). The expected frames are those
// midpoints: `TRANSITION_FIXTURE_FRAMES`.
// Shared by the fixture test (which checks the committed project.json against this build) and the
// script that writes it (`WRITE_TRANSITIONS_FIXTURE=1 npx vitest run src/core/document/transitionsFixture.test.ts`).
import { makeMedia, makeMediaClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import { transitionDefaults } from "./transitions.js";
import type { MediaClip, Project, Transition, TransitionKind } from "./types.js";

export const TRANSITION_FIXTURE_SIZE = { width: 360, height: 640 } as const;
export const TRANSITION_CLIP_FRAMES = 30;

/** One transition of each kind, in the order of the track, with the parameters the fixture checks. */
export const TRANSITION_FIXTURE_KINDS: readonly { kind: TransitionKind; params: Partial<Transition> }[] = [
  { kind: "crossDissolve", params: {} },
  { kind: "dipToBlack", params: {} },
  { kind: "dipToWhite", params: {} },
  { kind: "slide", params: { direction: "right" } },
  { kind: "push", params: { direction: "up" } },
  { kind: "wipe", params: { angle: 30, softness: 0.2 } },
  { kind: "iris", params: { center: { x: 0.3, y: 0.6 }, softness: 0.15 } },
  { kind: "zoomIn", params: {} },
  { kind: "zoomOut", params: {} },
  { kind: "whip", params: { direction: "left" } },
  { kind: "blurDissolve", params: {} },
  { kind: "glitch", params: {} },
  { kind: "flash", params: {} },
];

/** The cut of transition `i` and its midpoint frame (the frame before the cut: 6 of 12 steps). */
export const transitionCut = (i: number): number => TRANSITION_CLIP_FRAMES * (i + 1);
export const TRANSITION_FIXTURE_FRAMES: readonly number[] = TRANSITION_FIXTURE_KINDS.map((_, i) => transitionCut(i) - 1);

export function buildTransitionsFixture(): Project {
  const project = createProject({ id: "5d2a8c46-7b13-4e90-a6f1-3c8e2b7d9041", name: "Interop transitions", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...TRANSITION_FIXTURE_SIZE, background: { r: 0.07, g: 0.07, b: 0.09, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/transitions (Batch 71)" };
  project.tracks = [emptyTrack("v1", "video", "V1")];
  for (const id of ["a", "b"]) {
    const item = makeMedia(id, "image", 0);
    project.media[id] = { ...item, name: `${id}.png`, file: { relPath: `media/${id}.png` }, codec: "png", width: TRANSITION_FIXTURE_SIZE.width, height: TRANSITION_FIXTURE_SIZE.height, hasAudio: false };
  }
  const track = project.tracks[0] as Project["tracks"][number];
  const count = TRANSITION_FIXTURE_KINDS.length + 1;
  for (let k = 0; k < count; k++) {
    const clip: MediaClip = {
      ...makeMediaClip(project, { id: `c${k + 1}`, trackId: "v1", start: k * TRANSITION_CLIP_FRAMES, duration: TRANSITION_CLIP_FRAMES, mediaId: k % 2 === 0 ? "a" : "b", kind: "image" }),
      out: frameToUs(TRANSITION_CLIP_FRAMES, project.settings.fps),
    };
    track.clipIds.push(clip.id);
    project.clips[clip.id] = clip;
  }
  TRANSITION_FIXTURE_KINDS.forEach(({ kind, params }, i) => {
    const transition: Transition = { id: `t${i + 1}`, kind, before: 6, after: 5, ...transitionDefaults(kind), ...params };
    (project.clips[`c${i + 1}`] as MediaClip).transitionOut = transition;
    (project.clips[`c${i + 2}`] as MediaClip).transitionIn = { ...transition };
  });
  return project;
}
