import { describe, expect, it } from "vitest";
import { heardClips } from "../audio/mixdown.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import type { MediaClip, Project, Track } from "../core/document/types.js";
import { nullTestDb, stemFileName, stemsOf, wavFile } from "./stems.js";

function clipOn(project: Project, id: string, trackId: string, start = 0): MediaClip {
  return makeMediaClip(project, { id, trackId, start, duration: 30, mediaId: "m", kind: "audio" });
}

function build(tracks: Track[], clips: [id: string, track: string][]): Project {
  let project: Project = { ...makeProject(), tracks, media: { m: makeMedia("m", "audio") } };
  project = withClips(project, clips.map(([id, track]) => clipOn(project, id, track)));
  return project;
}

describe("stemsOf", () => {
  it("makes one stem per audible audio track with clips, in track order, each heard alone", () => {
    const project = build([makeTrack("v1"), { ...makeTrack("a1", "audio"), name: "Voice" }, { ...makeTrack("a2", "audio"), name: "Music" }], [["c1", "a1"], ["c2", "a2"]]);
    const stems = stemsOf(project);
    expect(stems.map((s) => s.name)).toEqual(["Voice", "Music"]);
    for (const stem of stems) {
      const heard = heardClips(stem.project, 0, 100);
      expect(heard.map((c) => c.trackId)).toEqual([stem.trackId]);
    }
    // Together they hear exactly what the mixdown hears.
    const all = heardClips(project, 0, 100).map((c) => c.id).sort();
    expect(stems.flatMap((s) => heardClips(s.project, 0, 100).map((c) => c.id)).sort()).toEqual(all);
  });

  it("leaves out muted tracks, tracks silenced by another's solo, and empty tracks", () => {
    const tracks = [makeTrack("v1"), makeTrack("a1", "audio"), { ...makeTrack("a2", "audio"), muted: true }, makeTrack("a3", "audio"), makeTrack("a4", "audio")];
    const project = build(tracks, [["c1", "a1"], ["c2", "a2"], ["c3", "a3"]]);
    expect(stemsOf(project).map((s) => s.trackId)).toEqual(["a1", "a3"]);
    const soloed = { ...project, tracks: project.tracks.map((t) => (t.id === "a3" ? { ...t, solo: true } : t)) };
    expect(stemsOf(soloed).map((s) => s.trackId)).toEqual(["a3"]);
  });

  it("numbers repeated or empty names, and does not touch the project", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), name: "Audio" }, { ...makeTrack("a2", "audio"), name: "audio" }, { ...makeTrack("a3", "audio"), name: "  " }];
    const project = build(tracks, [["c1", "a1"], ["c2", "a2"], ["c3", "a3"]]);
    const before = JSON.stringify(project.tracks);
    expect(stemsOf(project).map((s) => s.name)).toEqual(["Audio", "audio 2", "Audio 3"]);
    expect(JSON.stringify(project.tracks)).toBe(before);
  });

  it("has no stems for a project without audio", () => {
    expect(stemsOf(build([makeTrack("v1"), makeTrack("a1", "audio")], []))).toEqual([]);
  });
});

describe("stemFileName", () => {
  it("numbers the stems so a listing keeps the track order", () => {
    expect(stemFileName(0, "Voice", 3)).toBe("01 Voice.wav");
    expect(stemFileName(11, "Music", 12)).toBe("12 Music.wav");
    expect(stemFileName(2, "x", 120)).toBe("003 x.wav");
  });
});

describe("wavFile", () => {
  it("is a header and 16-bit interleaved PCM, silence past the planes", () => {
    const file = wavFile([Float32Array.of(0, 0.5, -0.5), Float32Array.of(1, -1, 0)], 2, 48000, 4);
    expect(file.length).toBe(44 + 4 * 2 * 2);
    const view = new DataView(file.buffer);
    expect(new TextDecoder().decode(file.slice(0, 4))).toBe("RIFF");
    expect(view.getInt16(44 + 2 * 2, true)).toBe(16384);
    expect(view.getInt16(44 + 2 * 2 + 2, true)).toBe(-32767);
    expect(view.getInt16(44 + 3 * 4, true)).toBe(0);
  });
});

describe("nullTestDb", () => {
  const mix = [Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 7) * 0.5), Float32Array.from({ length: 100 }, (_, i) => Math.cos(i / 5) * 0.4)];
  const split = (gain: number) => mix.map((plane) => plane.map((v) => v * gain));

  it("is -Infinity for stems that add up (to float rounding), and tiny for a rounding error", () => {
    expect(nullTestDb(mix, [split(0.25), split(0.75)])).toBeLessThan(-120);
    expect(nullTestDb(mix, [mix])).toBe(-Infinity);
    const off = split(0.75).map((plane) => plane.map((v, i) => v + (i % 2 ? 1e-5 : -1e-5)));
    expect(nullTestDb(mix, [split(0.25), off])).toBeLessThan(-60);
  });

  it("reports a missing stem as the level of what is missing", () => {
    expect(nullTestDb(mix, [split(0.5)])).toBeGreaterThan(-13);
    expect(nullTestDb(mix, [split(0.5)])).toBeLessThan(0);
  });
});
