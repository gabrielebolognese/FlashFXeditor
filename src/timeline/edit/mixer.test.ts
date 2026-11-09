import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Command } from "../../core/commands/command.js";
import { validateProject } from "../../core/document/validate.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { clampPan, clampTrackGain, curveOf, setFadeCurve, setLoudnessTarget, setPans, setTrackMix, shownPan, trackMix } from "./mixer.js";

function audioProject(): { project: Project; clip: MediaClip; trackId: string } {
  const p = makeProject();
  p.media.a = makeMedia("a", "audio");
  p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  const clip = makeMediaClip(makeProject(), { id: "c1", trackId: "a1", start: 0, duration: 90, mediaId: "a", kind: "audio" }) as MediaClip;
  return { project: withClips(p, [clip]), clip, trackId: "a1" };
}

const run = (project: Project, command: Command | null) => {
  const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
  if (command) store.dispatch(command);
  return store.getState();
};

describe("track mixer", () => {
  it("sets gain and pan, clamps them, and stores nothing for zero", () => {
    const { project, trackId } = audioProject();
    const a = run(project, setTrackMix(project, [trackId], { gainDb: -6, pan: -1 }));
    expect(a.tracks.find((t) => t.id === trackId)).toMatchObject({ gainDb: -6, pan: -1 });
    expect(trackMix(a.tracks[a.tracks.length - 1]!)).toEqual({ gainDb: -6, pan: -1 });
    const b = run(a, setTrackMix(a, [trackId], { gainDb: 0, pan: 0 }));
    const track = b.tracks.find((t) => t.id === trackId)!;
    expect("gainDb" in track).toBe(false);
    expect("pan" in track).toBe(false);
    expect(clampTrackGain(99)).toBe(12);
    expect(clampPan(-3)).toBe(-1);
    expect(validateProject(a)).toEqual([]);
  });
  it("does nothing on no change or a video track", () => {
    const { project, trackId } = audioProject();
    expect(setTrackMix(project, [trackId], { gainDb: 0, pan: 0 })).toBeNull();
    const video = project.tracks.find((t) => t.kind === "video");
    if (video) expect(setTrackMix(project, [video.id], { gainDb: -3 })).toBeNull();
  });
});

describe("clip pan", () => {
  it("sets the clip pan and removes it at 0", () => {
    const { project } = audioProject();
    const a = run(project, setPans(project, new Map([["c1", -1]])));
    expect((a.clips.c1 as MediaClip).volume.pan).toBe(-1);
    const b = run(a, setPans(a, new Map([["c1", 0]])));
    expect("pan" in (b.clips.c1 as MediaClip).volume).toBe(false);
  });
  it("keys the pan at the playhead when it is keyed", () => {
    const { project } = audioProject();
    const draftClip = project.clips.c1 as { keyframes?: MediaClip["keyframes"] };
    draftClip.keyframes = { "volume.pan": [{ frame: 0, value: -1, ease: "linear" }, { frame: 60, value: 1, ease: "linear" }] };
    const a = run(project, setPans(project, new Map([["c1", 0.5]]), { at: 30 }));
    expect(shownPan(a.clips.c1 as MediaClip, 30)).toBeCloseTo(0.5, 5);
    expect((a.clips.c1 as MediaClip).keyframes?.["volume.pan"]?.length).toBe(3);
    expect(validateProject(a)).toEqual([]);
  });
});

describe("fade curve and loudness target", () => {
  it("sets the curve and stores nothing for the default", () => {
    const { project } = audioProject();
    const a = run(project, setFadeCurve(project, ["c1"], "linear"));
    expect(curveOf(a.clips.c1 as MediaClip)).toBe("linear");
    const b = run(a, setFadeCurve(a, ["c1"], "equalPower"));
    expect("curve" in (b.clips.c1 as MediaClip).fades).toBe(false);
    expect(setFadeCurve(project, ["c1"], "equalPower")).toBeNull();
  });
  it("sets and clears the project target", () => {
    const { project } = audioProject();
    const a = run(project, setLoudnessTarget(project, { targetLufs: -14, truePeakDb: -1 }));
    expect(a.settings.loudness).toEqual({ targetLufs: -14, truePeakDb: -1 });
    expect(validateProject(a)).toEqual([]);
    const b = run(a, setLoudnessTarget(a, null));
    expect(b.settings.loudness).toBeUndefined();
  });
});
