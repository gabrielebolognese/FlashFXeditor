import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { gainDbAt } from "../../core/document/keyframes.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { PEAKS_BUCKET, type Peaks } from "../../media/cache/peaks.js";
import {
  audioTargets,
  autoDuck,
  bandEdit,
  canDetach,
  clampKeyShift,
  clipPeak,
  duckDips,
  detachAudio,
  normalizeClips,
  segmentKeys,
  setGains,
  setMuted,
  toggleMuted,
  volumeKeys,
} from "./volume.js";

function project(clips: Clip[], extraTracks: Project["tracks"] = []): Project {
  const p = makeProject();
  p.media.v = makeMedia("v", "video");
  p.media.a = makeMedia("a", "audio");
  p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"), makeTrack("a2", "audio"), ...extraTracks);
  return withClips(p, clips);
}

const audio = (id: string, start: number, duration: number, fields: Partial<MediaClip> = {}): MediaClip => ({
  ...makeMediaClip(makeProject(), { id, trackId: "a1", start, duration, mediaId: "a", kind: "audio" }),
  ...fields,
});
const video = (id: string, start: number, duration: number, fields: Partial<MediaClip> = {}): MediaClip => ({
  ...makeMediaClip(makeProject(), { id, trackId: "v1", start, duration, mediaId: "v", kind: "video" }),
  ...fields,
});
const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const get = (s: DocumentStore, id: string) => s.getState().clips[id] as MediaClip;
const key = (frame: number, value: number) => ({ frame, value, ease: "linear" as const });

/** Level-0 peaks of 48 kHz mono audio whose bucket b peaks at `levels(b)` (full scale 0..1). */
function peaks(seconds: number, level: (bucket: number) => number): Peaks {
  const frames = seconds * 48_000;
  const buckets = Math.ceil(frames / PEAKS_BUCKET);
  const data = new Int8Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const q = Math.ceil(level(b) * 127);
    data[2 * b] = -q;
    data[2 * b + 1] = q;
  }
  return { sampleRate: 48_000, frames, channels: 1, levels: [data] };
}

describe("audio targets and gain (Batch 37)", () => {
  it("edits audio clips, and the audio linked to selected video clips", () => {
    const p = project([video("v", 0, 30, { linkGroup: "g" }), audio("a", 0, 30, { linkGroup: "g" }), audio("b", 40, 30)]);
    expect(audioTargets(p, ["v"])).toEqual(["a"]);
    expect(audioTargets(p, ["v", "a", "b"])).toEqual(["a", "b"]);
    p.tracks[1] = { ...(p.tracks[1] as Project["tracks"][number]), locked: true };
    expect(audioTargets(p, ["v", "b"])).toEqual([]);
  });

  it("sets the gain within -60..+12 dB in one step; keyed clips get a key at the playhead", () => {
    const s = store(project([audio("a", 0, 60), audio("b", 100, 60, { keyframes: { "volume.gainDb": [key(0, 0), key(59, -12)] } })]));
    s.dispatch(setGains(s.getState(), new Map([["a", 20]]))!);
    expect(get(s, "a").volume.gainDb).toBe(12);
    s.dispatch(setGains(s.getState(), new Map([["a", -6], ["b", -3]]), { at: 130 })!);
    expect(get(s, "a").volume.gainDb).toBe(-6);
    expect(get(s, "b").volume.gainDb).toBe(0);
    expect(volumeKeys(get(s, "b"))).toEqual([key(0, 0), key(30, -3), key(59, -12)]);
    expect(setGains(s.getState(), new Map([["a", -6]]))).toBeNull();
    s.undo();
    expect(get(s, "a").volume.gainDb).toBe(12);
  });

  it("mutes and unmutes (a toggle on the selection)", () => {
    const s = store(project([audio("a", 0, 30), audio("b", 40, 30, { volume: { gainDb: 0, muted: true } })]));
    const mute = toggleMuted(s.getState(), ["a", "b"])!;
    expect(mute.label).toBe("Mute clip");
    s.dispatch(mute);
    expect(get(s, "a").volume.muted && get(s, "b").volume.muted).toBe(true);
    s.dispatch(toggleMuted(s.getState(), ["a", "b"])!);
    expect(get(s, "a").volume.muted || get(s, "b").volume.muted).toBe(false);
    expect(setMuted(s.getState(), ["a"], false)).toBeNull();
  });
});

describe("normalize (Batch 37)", () => {
  const fps = { num: 30, den: 1 };

  it("finds the clip's peak in its source range, the keyed gain applied", () => {
    // 0.25 everywhere, 0.5 in bucket 300 (at 1.6 s).
    const pk = peaks(10, (b) => (b === 300 ? 0.5 : 0.25));
    const clip = audio("a", 0, 60);
    expect(clipPeak(pk, clip, fps)).toBeCloseTo(Math.ceil(0.5 * 127) / 127, 9);
    // A source range past the loud bucket.
    expect(clipPeak(pk, { ...clip, in: 2_000_000, out: 4_000_000 }, fps)).toBeCloseTo(Math.ceil(0.25 * 127) / 127, 9);
    // Keyed: -12 dB around the loud bucket's time (frame 48 of 60) makes the rest the loudest.
    const keyed = { ...clip, keyframes: { "volume.gainDb": [key(0, 0), key(45, 0), key(46, -12), key(50, -12), key(51, 0)] } };
    expect(clipPeak(pk, keyed, fps)).toBeCloseTo(Math.ceil(0.25 * 127) / 127, 9);
  });

  it("refines the peak from the exact samples of the candidate buckets", () => {
    const pk = peaks(10, (b) => (b === 300 ? 0.5 : 0.25));
    const reads: number[] = [];
    const exact = (_media: string, from: number, to: number) => {
      reads.push(Math.floor(from / PEAKS_BUCKET));
      expect(to - from).toBeLessThanOrEqual(PEAKS_BUCKET);
      return 0.4975;
    };
    expect(clipPeak(pk, audio("a", 0, 60), fps, exact)).toBe(0.4975);
    expect(reads).toEqual([300]);
  });

  it("sets the gain so the peak hits -1 dBFS, shifts keys for a keyed clip, reports silence", () => {
    const pk = peaks(10, () => 0.5);
    const peak = Math.ceil(0.5 * 127) / 127;
    const p = project([audio("a", 0, 60), audio("b", 100, 60, { keyframes: { "volume.gainDb": [key(0, 0), key(30, -6)] } }), audio("c", 200, 30, { mediaId: "q" })]);
    p.media.q = makeMedia("q", "audio");
    const s = store(p);
    const result = normalizeClips(s.getState(), ["a", "b", "c"], (id) => (id === "a" ? pk : null));
    expect(result.missing).toEqual(["c"]);
    s.dispatch(result.command!);
    expect(get(s, "a").volume.gainDb).toBeCloseTo(-1 - 20 * Math.log10(peak), 9);
    // b's loudest point is at its 0 dB key: both keys move by the same amount.
    const delta = -1 - 20 * Math.log10(peak);
    // (Its first bucket's center is a hair past the key: within 0.05 dB.)
    expect(volumeKeys(get(s, "b")).map((k) => k.value)).toEqual([expect.closeTo(delta, 1), expect.closeTo(-6 + delta, 1)]);
    const silent = normalizeClips(s.getState(), ["a"], () => peaks(10, () => 0));
    expect(silent.silent).toEqual(["a"]);
    expect(silent.command).toBeNull();
  });
});

describe("rubber band edits (Batch 37)", () => {
  it("drags the gain of a clip without keys", () => {
    const s = store(project([audio("a", 0, 60)]));
    s.dispatch(bandEdit(s.getState(), "a", { kind: "gain", gainDb: -9.5 })!);
    expect(get(s, "a").volume.gainDb).toBe(-9.5);
  });

  it("picks the keys of the segment under the pointer", () => {
    const keys = [key(10, 0), key(20, -6), key(40, 0)];
    expect(segmentKeys(keys, 5)).toEqual([10]);
    expect(segmentKeys(keys, 15)).toEqual([10, 20]);
    expect(segmentKeys(keys, 30.5)).toEqual([20, 40]);
    expect(segmentKeys(keys, 50)).toEqual([40]);
    expect(segmentKeys([], 5)).toEqual([]);
  });

  it("moves a segment's keys in value, one key in time between its neighbours", () => {
    const s = store(project([audio("a", 0, 60, { keyframes: { "volume.gainDb": [key(10, 0), key(20, -6), key(40, 0)] } })]));
    s.dispatch(bandEdit(s.getState(), "a", { kind: "keys", frames: [10, 20], deltaDb: -3, deltaFrames: 5 })!);
    // Two keys: values only.
    expect(volumeKeys(get(s, "a"))).toEqual([key(10, -3), key(20, -9), key(40, 0)]);
    s.dispatch(bandEdit(s.getState(), "a", { kind: "keys", frames: [20], deltaDb: 100, deltaFrames: 50 })!);
    expect(volumeKeys(get(s, "a"))).toEqual([key(10, -3), key(39, 12), key(40, 0)]);
    expect(bandEdit(s.getState(), "a", { kind: "keys", frames: [7], deltaDb: 1, deltaFrames: 0 })).toBeNull();
  });

  it("never moves a key past the clip's end onto or before the key before it (Batch 47 fuzz)", () => {
    // A trim keeps keys past the clip's end: 30 frames long, keys at 29 and 40 (and 35 and 40).
    for (const frames of [[10, 29, 40], [10, 35, 40]]) {
      const keys = frames.map((frame) => key(frame, -6));
      const s = store(project([audio("a", 0, 30, { keyframes: { "volume.gainDb": keys } })]));
      expect(clampKeyShift({ duration: 30 }, keys, 40, -20)).toBe(0);
      s.dispatch(bandEdit(s.getState(), "a", { kind: "keys", frames: [40], deltaDb: 3, deltaFrames: -20 })!);
      expect(volumeKeys(get(s, "a"))).toEqual([key(frames[0] as number, -6), key(frames[1] as number, -6), key(40, -3)]);
    }
  });
});

describe("auto-duck (Batch 37)", () => {
  // Music on A2 (frames 0..300), voices on A1 at 60..90 and 150..210.
  const music = (fields: Partial<MediaClip> = {}) => audio("m", 0, 300, { trackId: "a2", ...fields });
  const voices = [audio("v1", 60, 30), audio("v2", 150, 60)];

  it("dips by 12 dB under each voice, with 10-frame ramps before and after", () => {
    const s = store(project([music(), ...voices]));
    const result = autoDuck(s.getState(), ["m"], { depthDb: 12, rampFrames: 10 });
    expect(result.dips).toBe(2);
    s.dispatch(result.command!);
    const clip = get(s, "m");
    expect(volumeKeys(clip)).toEqual([key(50, 0), key(60, -12), key(90, -12), key(100, 0), key(140, 0), key(150, -12), key(210, -12), key(220, 0)]);
    expect(gainDbAt(clip, 0)).toBe(0);
    expect(gainDbAt(clip, 55)).toBe(-6);
    expect(gainDbAt(clip, 75)).toBe(-12);
    expect(gainDbAt(clip, 120)).toBe(0);
    expect(gainDbAt(clip, 299)).toBe(0);
    s.undo();
    expect(get(s, "m").keyframes).toBeUndefined();
  });

  it("keeps the music's own curve under the dip, joins close voices and clamps to the clip", () => {
    const p = project([music({ keyframes: { "volume.gainDb": [key(0, -6), key(299, -6)] } }), audio("v1", 0, 30), audio("v2", 40, 20), audio("v3", 290, 30)]);
    const clip = p.clips.m as MediaClip;
    expect(duckDips(p, clip, 10)).toEqual([
      { start: 0, end: 60 },
      { start: 290, end: 300 },
    ]);
    const s = store(p);
    s.dispatch(autoDuck(p, ["m"], { depthDb: 12, rampFrames: 10 }).command!);
    const ducked = get(s, "m");
    expect(gainDbAt(ducked, 0)).toBe(-18);
    expect(gainDbAt(ducked, 70)).toBe(-6);
    expect(gainDbAt(ducked, 285)).toBe(-12);
    expect(gainDbAt(ducked, 299)).toBe(-18);
  });

  it("ignores muted voice tracks, tracks below and does nothing without voices", () => {
    const p = project([music({ trackId: "a1" }), audio("v1", 60, 30, { trackId: "a2" })]);
    expect(autoDuck(p, ["m"], { depthDb: 12, rampFrames: 10 }).command).toBeNull();
    const q = project([music(), ...voices]);
    q.tracks[1] = { ...(q.tracks[1] as Project["tracks"][number]), muted: true };
    expect(autoDuck(q, ["m"], { depthDb: 12, rampFrames: 10 }).command).toBeNull();
  });
});

describe("detach audio (Batch 37)", () => {
  let n = 0;
  const newId = () => `n${++n}`;

  it("unlinks a video from its audio", () => {
    const s = store(project([video("v", 0, 30, { linkGroup: "g" }), audio("a", 0, 30, { linkGroup: "g" })]));
    expect(canDetach(s.getState(), "v")).toBe(true);
    const result = detachAudio(s.getState(), ["v"], newId);
    expect(result.audio).toEqual(["a"]);
    s.dispatch(result.command!);
    expect(get(s, "v").linkGroup).toBeUndefined();
    expect(get(s, "a").linkGroup).toBeUndefined();
  });

  it("makes an audio clip for a video with sound and none, on a free audio track or a new one", () => {
    const s = store(project([video("v", 0, 30, { in: 1_000_000, out: 2_000_000, volume: { gainDb: -3, muted: false } }), audio("x", 0, 50), audio("y", 10, 20, { trackId: "a2" })]));
    const result = detachAudio(s.getState(), ["v"], newId);
    s.dispatch(result.command!);
    const made = get(s, result.audio[0] as string);
    expect(made).toMatchObject({ kind: "audio", start: 0, duration: 30, in: 1_000_000, out: 2_000_000, mediaId: "v", volume: { gainDb: -3, muted: false } });
    const track = s.getState().tracks.find((t) => t.id === made.trackId);
    expect(track?.kind).toBe("audio");
    expect(track?.name).toBe("A3");
    expect(track?.clipIds).toEqual([made.id]);
    s.undo();
    expect(s.getState().tracks).toHaveLength(3);
  });

  it("has nothing to detach on a video without sound", () => {
    const p = project([video("v", 0, 30)]);
    p.media.v = { ...(p.media.v as Project["media"][string]), hasAudio: false };
    expect(canDetach(p, "v")).toBe(false);
    expect(detachAudio(p, ["v"], newId).command).toBeNull();
  });
});
