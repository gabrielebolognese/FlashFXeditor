import { afterEach, describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { MediaClip } from "../../core/document/types.js";
import { BUILT_IN_EDIT_DEFAULTS, defaultFrames, setEditDefaults } from "./editDefaults.js";
import { naturalDuration } from "./insertMedia.js";
import { addSolid } from "./solid.js";
import { titleDuration } from "./text.js";
import { addTransition } from "./transitions.js";

const fps = { num: 30, den: 1 };
let n = 0;
const newId = () => `id-${++n}`;

afterEach(() => setEditDefaults(BUILT_IN_EDIT_DEFAULTS));

describe("edit defaults (spec §11 default durations, §6.15 default transition; Batch 42 settings)", () => {
  it("turns milliseconds into whole frames, at least one", () => {
    expect(defaultFrames(5000, fps)).toBe(150);
    expect(defaultFrames(1001, { num: 30000, den: 1001 })).toBe(30);
    expect(defaultFrames(1, fps)).toBe(1);
  });

  it("gives stills, titles and solids the set lengths", () => {
    const project = makeProject();
    project.tracks.push(makeTrack("v1"));
    expect(naturalDuration(makeMedia("i", "image", 0), fps)).toBe(150);
    expect(titleDuration(project, 0, false)).toBe(90);
    setEditDefaults({ stillMs: 2000, titleMs: 1500, solidMs: 500 });
    expect(naturalDuration(makeMedia("i", "image", 0), fps)).toBe(60);
    expect(titleDuration(project, 0, false)).toBe(45);
    const { command, clipId } = addSolid(project, 10, newId);
    const draft = structuredClone(project);
    command.run(draft, { selection: { clipIds: [], trackIds: [], primary: null }, playhead: 10, newId } as never);
    expect(draft.clips[clipId]?.duration).toBe(15);
  });

  it("gives a new transition the set number of frames", () => {
    let project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push(makeTrack("v1"));
    const left: MediaClip = { ...makeMediaClip(project, { id: "a", trackId: "v1", start: 0, duration: 60, mediaId: "m" }), in: frameToUs(100, fps), out: frameToUs(160, fps) };
    const right: MediaClip = { ...makeMediaClip(project, { id: "b", trackId: "v1", start: 60, duration: 60, mediaId: "m" }), in: frameToUs(300, fps), out: frameToUs(360, fps) };
    project = withClips(project, [left, right]);
    setEditDefaults({ transitionFrames: 20 });
    const result = addTransition(project, { left: "a", right: "b" }, "crossDissolve", { newId });
    const draft = structuredClone(project);
    result?.command.run(draft, { selection: { clipIds: [], trackIds: [], primary: null }, playhead: 0, newId } as never);
    const transition = (draft.clips.a as MediaClip).transitionOut;
    expect(transition ? transition.before + transition.after : 0).toBe(20);
  });
});
