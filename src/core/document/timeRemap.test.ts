import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "./fixtures.js";
import { frameToUs } from "./time.js";
import { blends, clipSourceUs, frameBlendSplit, identityRemap, isReversed, mutedByRemap, rampKeys, RAMP_IDS, refitRemap, remapAdvanceUs, remapSpeeds, remapUs, scaleRemap, type RemapKey } from "./timeRemap.js";
import type { MediaClip, Project } from "./types.js";
import { validateProject } from "./validate.js";

const FPS = { num: 30, den: 1 };
const linear = (frame: number, sourceUs: number): RemapKey => ({ frame, sourceUs, ease: "linear" });

function doc(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  p.media.m = makeMedia("m", "video", 60_000_000);
  return p;
}

const base = (extra: Partial<MediaClip> = {}): MediaClip => ({ ...makeMediaClip(doc(), { id: "c", trackId: "v1", start: 10, duration: 30, mediaId: "m" }), ...extra });

describe("remapUs", () => {
  it("interpolates linearly between keys and holds past the ends", () => {
    const keys = [linear(0, 0), linear(30, 3_000_000)];
    expect(remapUs(keys, 0)).toBe(0);
    expect(remapUs(keys, 15)).toBe(1_500_000);
    expect(remapUs(keys, 30)).toBe(3_000_000);
    expect(remapUs(keys, -5)).toBe(0);
    expect(remapUs(keys, 99)).toBe(3_000_000);
  });

  it("eases a segment with the ease of the key that starts it, and allows freezes and backward segments", () => {
    const keys: RemapKey[] = [{ frame: 0, sourceUs: 0, ease: "easeIn" }, linear(10, 1_000_000), linear(20, 1_000_000), linear(30, 0)];
    expect(remapUs(keys, 5)).toBeLessThan(500_000);
    expect(remapUs(keys, 5)).toBeGreaterThan(0);
    expect(remapUs(keys, 15)).toBe(1_000_000);
    expect(remapUs(keys, 25)).toBe(500_000);
    expect(remapSpeeds(keys, FPS).map((speed) => Math.round(speed * 100) / 100)).toEqual([1 / 0.3333333333, 0, -1 / 0.3333333333].map((speed) => Math.round(speed * 100) / 100));
  });
});

describe("clipSourceUs (spec §21.22)", () => {
  it("is the constant speed without a curve, clamped inside [in, out)", () => {
    const clip = base({ in: 1_000_000, out: 3_000_000, speed: 2, duration: 30 });
    expect(clipSourceUs(clip, 10, FPS)).toBe(1_000_000);
    expect(clipSourceUs(clip, 25, FPS)).toBe(2_000_000);
    expect(clipSourceUs(clip, 40, FPS)).toBe(2_999_999);
  });

  it("an identity curve shows exactly the frames of the constant speed", () => {
    const clip = base({ in: 2_000_000, out: 2_000_000 + frameToUs(30, FPS) * 2, speed: 2 });
    const remapped = { ...clip, timeRemap: identityRemap(clip, FPS) };
    for (let frame = clip.start; frame < clip.start + clip.duration; frame += 3) expect(Math.abs(clipSourceUs(remapped, frame, FPS) - clipSourceUs(clip, frame, FPS))).toBeLessThanOrEqual(1);
  });

  it("a Hero ramp (fast, slow, fast) shows the expected source frames at sampled timeline frames", () => {
    const duration = 60;
    const from = 5_000_000;
    const to = from + frameToUs(60, FPS);
    const keys = rampKeys("hero", duration, from, to);
    const clip = base({ start: 100, duration, in: from, out: to, timeRemap: keys });
    // Fast (1.47x) for 18 frames, slow (0.3x) for 24, fast again for 18; the source range is covered once.
    const at = (frame: number) => Math.round(clipSourceUs(clip, 100 + frame, FPS) / 1000);
    // 44 percent of the range in the first 18 frames (1.47x), 12 percent in the next 24 (0.3x), 44 percent in the last 18.
    expect([0, 18, 30, 42, 60].map(at)).toEqual([5000, 5880, 6000, 6120, 7000]);
    // Eased: the first segment is ahead of its straight line, the last one behind it.
    expect(at(9)).toBeGreaterThan(5440);
    expect(at(51)).toBeLessThan(6560);
    // Slow in the middle, fast at both ends.
    const speeds = [0, 5, 29, 55].map((frame) => (clipSourceUs(clip, 100 + frame + 1, FPS) - clipSourceUs(clip, 100 + frame, FPS)) / frameToUs(1, FPS));
    expect(speeds[0] as number).toBeGreaterThan(0);
    expect(speeds[1] as number).toBeGreaterThan(1);
    expect(speeds[2] as number).toBeLessThan(0.5);
    expect(speeds[3] as number).toBeGreaterThan(1);
    expect(clipSourceUs(clip, 100 + duration, FPS)).toBe(to);
  });

  it("every ramp covers its source range once, from the first frame to the last, without going backward", () => {
    for (const id of RAMP_IDS) {
      const keys = rampKeys(id, 45, 1_000_000, 4_000_000);
      expect(keys[0]?.frame).toBe(0);
      expect(keys[keys.length - 1]?.frame).toBe(45);
      expect(remapUs(keys, 0)).toBe(1_000_000);
      expect(remapUs(keys, 45)).toBe(4_000_000);
      let last = -1;
      for (let frame = 0; frame <= 45; frame++) {
        const us = remapUs(keys, frame);
        expect(us).toBeGreaterThanOrEqual(last);
        last = us;
      }
    }
  });

  it("reverse mirrors the constant speed: the first frame shows the last source frame", () => {
    const clip = base({ in: 1_000_000, out: 2_000_000, speed: 1, duration: 30, reverse: true });
    expect(clipSourceUs(clip, 10, FPS)).toBe(1_999_999);
    expect(clipSourceUs(clip, 25, FPS)).toBe(1_999_999 - frameToUs(15, FPS));
    expect(clipSourceUs(clip, 39, FPS)).toBe(1_000_000 + 1_000_000 - 1 - frameToUs(29, FPS));
    expect(clipSourceUs(clip, 500, FPS)).toBe(1_000_000);
    expect(remapAdvanceUs(clip, 12, FPS)).toBeLessThan(0);
  });

  it("a curve wins over reverse", () => {
    const clip = base({ reverse: true, timeRemap: [linear(0, 0), linear(30, 1_000_000)] });
    expect(isReversed(clip)).toBe(false);
    expect(clipSourceUs(clip, 40, FPS)).toBe(1_000_000);
  });
});

describe("frame blending (spec §21.22)", () => {
  it("at 25 percent speed mixes the two source frames around the time, and shows an exact frame alone", () => {
    const frameUs = 1_000_000 / 30;
    const per = remapAdvanceUs(base({ speed: 0.25 }), 10, FPS);
    expect(blends(per, frameUs)).toBe(true);
    // Timeline frames 0..3 at 0.25x: source frames 0, 0.25, 0.5, 0.75.
    const mixes = [0, 1, 2, 3, 4].map((k) => frameBlendSplit(k * 0.25 * frameUs, frameUs, 60_000_000).mix);
    expect(mixes[0]).toBe(0);
    expect(mixes[1]).toBeCloseTo(0.25, 2);
    expect(mixes[2]).toBeCloseTo(0.5, 2);
    expect(mixes[3]).toBeCloseTo(0.75, 2);
    expect(mixes[4]).toBeCloseTo(0, 3);
    const split = frameBlendSplit(2.5 * frameUs, frameUs, 60_000_000);
    expect(split.aUs).toBe(Math.round(2 * frameUs));
    expect(split.bUs).toBe(Math.round(3 * frameUs));
  });

  it("does not blend at normal or faster speeds, nor past the last frame", () => {
    const frameUs = 1_000_000 / 30;
    expect(blends(frameUs, frameUs)).toBe(false);
    expect(blends(frameUs * 2, frameUs)).toBe(false);
    expect(blends(0, frameUs)).toBe(false);
    expect(frameBlendSplit(10 * frameUs + 5, frameUs, Math.round(10 * frameUs)).mix).toBe(0);
  });
});

describe("curve edits", () => {
  const keys = [linear(0, 0), linear(10, 500_000), linear(30, 3_000_000)];

  it("refit keeps the picture of the frames left after a head trim and a tail trim", () => {
    const head = refitRemap(keys, 5, 25);
    expect(head[0]?.frame).toBe(0);
    expect(head[head.length - 1]?.frame).toBe(25);
    for (const frame of [0, 5, 12, 25]) expect(Math.abs(remapUs(head, frame) - remapUs(keys, frame + 5))).toBeLessThanOrEqual(1);
    const tail = refitRemap(keys, 0, 20);
    expect(tail[tail.length - 1]).toMatchObject({ frame: 20, sourceUs: remapUs(keys, 20) });
  });

  it("scales the frames to a new duration and merges keys that land on one frame", () => {
    const scaled = scaleRemap(keys, 30, 60);
    expect(scaled.map((key) => key.frame)).toEqual([0, 20, 60]);
    expect(scaled.map((key) => key.sourceUs)).toEqual([0, 500_000, 3_000_000]);
    const squeezed = scaleRemap([linear(0, 0), linear(1, 10), linear(2, 20), linear(30, 30)], 30, 3);
    expect(squeezed.map((key) => key.frame)).toEqual([0, 3]);
  });
});

describe("validation and audio muting", () => {
  it("accepts a curve whose ends are the clip's ends and refuses the others", () => {
    const project = doc();
    const good = base({ timeRemap: [linear(0, 0), linear(15, 400_000), linear(30, 1_000_000)], out: frameToUs(30, FPS) });
    expect(validateProject(withClips(project, [good]))).toEqual([]);
    const bad = (timeRemap: unknown) => validateProject(withClips(project, [{ ...base({ out: frameToUs(30, FPS) }), timeRemap } as MediaClip])).join("\n");
    expect(bad([linear(0, 0)])).toMatch(/at least two keys/);
    expect(bad([linear(0, 0), linear(20, 5)])).toMatch(/last timeRemap key must be at the clip's duration/);
    expect(bad([linear(2, 0), linear(30, 5)])).toMatch(/first timeRemap key must be at frame 0/);
    expect(bad([linear(0, 0), linear(0, 3), linear(30, 5)])).toMatch(/not after the previous key/);
    expect(bad([linear(0, -5), linear(30, 5)])).toMatch(/sourceUs >= 0/);
  });

  it("refuses a time remap or frame blend on an audio clip, and a reverse on an image", () => {
    const project = doc();
    const audio = { ...makeMediaClip(project, { id: "a", trackId: "a1", start: 0, duration: 30, mediaId: "m", kind: "audio" }) };
    expect(validateProject(withClips(project, [{ ...audio, reverse: true }]))).toEqual([]);
    expect(validateProject(withClips(project, [{ ...audio, frameBlend: true }])).join("\n")).toMatch(/only a video clip blends/);
    expect(validateProject(withClips(project, [{ ...audio, timeRemap: [linear(0, 0), linear(30, 1)] }])).join("\n")).toMatch(/only a video clip has a time remap/);
  });

  it("mutes the audio linked to a remapped video clip", () => {
    const project = doc();
    const video = base({ linkGroup: "g", timeRemap: [linear(0, 0), linear(30, 1_000_000)], out: frameToUs(30, FPS) });
    const audio = { ...makeMediaClip(project, { id: "a", trackId: "a1", start: 10, duration: 30, mediaId: "m", kind: "audio" }), linkGroup: "g" };
    const other = { ...audio, id: "b", linkGroup: "h" };
    const clips = withClips(project, [video, audio, other]).clips;
    expect(mutedByRemap(clips, audio)).toBe(true);
    expect(mutedByRemap(clips, other)).toBe(false);
    expect(mutedByRemap(clips, video)).toBe(false);
  });
});
