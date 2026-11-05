import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import type { CompoundClip, MediaClip, Project, Sequence } from "../core/document/types.js";
import { flattenAudio } from "./compoundAudio.js";

function build(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"));
  const audio = { ...makeMediaClip(p, { id: "au", trackId: "ia", start: 10, duration: 60, mediaId: "m" }), kind: "audio" } as MediaClip;
  const sequence: Sequence = { id: "seq", name: "Seq", size: { w: 1080, h: 1920 }, duration: 100, background: null, tracks: [makeTrack("ia", "audio")] };
  sequence.tracks[0]!.clipIds.push("au");
  p.sequences.seq = sequence;
  p.clips.au = audio;
  return withClips(p, [makeCompoundClip({ id: "c", trackId: "v1", start: 100, duration: 40, offset: 30, sequenceId: "seq" })]);
}

describe("flattenAudio (spec §21.10)", () => {
  it("returns a project without compounds as it is", () => {
    const p = makeProject();
    expect(flattenAudio(p)).toBe(p);
  });

  it("places the inner audio inside the compound's window at its place, with the compound's volume", () => {
    const p = build();
    (p.clips.c as CompoundClip).volume = { gainDb: -6, muted: false };
    const flat = flattenAudio(p);
    expect(flattenAudio(p)).toBe(flat);
    const clip = flat.clips["c/au"] as MediaClip;
    // Inner frames 30..70 show at 100..140; the clip's in-point moves by the 20 frames its start was cut.
    expect(clip).toMatchObject({ start: 100, duration: 40, trackId: "c/ia" });
    expect(clip.in).toBe((p.clips.au as MediaClip).in + Math.round((20 / 30) * 1e6));
    expect(clip.volume.gainDb).toBe((p.clips.au as MediaClip).volume.gainDb - 6);
    expect(flat.tracks.find((track) => track.id === "c/ia")?.clipIds).toEqual(["c/au"]);
    expect(p.tracks.some((track) => track.id === "c/ia")).toBe(false);
  });

  it("leaves out a muted compound track and clips outside the window", () => {
    const p = build();
    (p.clips.c as CompoundClip).offset = 80;
    expect(flattenAudio(p).clips["c/au"]).toBeUndefined();
    const q = build();
    q.tracks.find((track) => track.id === "v1")!.muted = true;
    expect(flattenAudio(q).clips["c/au"]).toBeUndefined();
  });
});
