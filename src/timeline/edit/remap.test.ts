import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import { clipSourceUs, remapUs } from "../../core/document/timeRemap.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { applyRamp, clearRemap, enableRemap, frameBlendAll, remappedAll, reversedAll, setFrameBlend, setRemapKeys, setReverse } from "./remap.js";
import { sliceClip } from "./move.js";
import { stretchedClip, trimmedClip } from "./trim.js";

const FPS = { num: 30, den: 1 };

function doc(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  p.media.m = makeMedia("m", "video", 60_000_000);
  const video = { ...makeMediaClip(p, { id: "v", trackId: "v1", start: 30, duration: 60, mediaId: "m" }), in: 5_000_000, out: 5_000_000 + frameToUs(60, FPS), linkGroup: "g" };
  const audio = { ...makeMediaClip(p, { id: "a", trackId: "a1", start: 30, duration: 60, mediaId: "m", kind: "audio" }), in: 5_000_000, out: 5_000_000 + frameToUs(60, FPS), linkGroup: "g" };
  return withClips(p, [video, audio]);
}

const run = (p: Project, command: Command | null): Project => {
  expect(command).not.toBeNull();
  const next = structuredClone(p);
  (command as Command).run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

const clip = (p: Project, id: string) => p.clips[id] as MediaClip;
/** `p` with exactly these clips. */
const only = (p: Project, clips: MediaClip[]): Project => withClips({ ...p, clips: {}, tracks: p.tracks.map((track) => ({ ...track, clipIds: [] })) }, clips);

describe("reverse and frame blend commands (spec §21.22)", () => {
  it("reverses a video clip and the audio linked to it, and plays forward again", () => {
    const p = doc();
    const reversed = run(p, setReverse(p, ["v"], true));
    expect(clip(reversed, "v").reverse).toBe(true);
    expect(clip(reversed, "a").reverse).toBe(true);
    expect(reversedAll(reversed, ["v"])).toBe(true);
    expect(setReverse(reversed, ["v"], true)).toBeNull();
    const forward = run(reversed, setReverse(reversed, ["a"], false));
    expect(clip(forward, "v").reverse).toBeUndefined();
    expect(clip(forward, "a").reverse).toBeUndefined();
  });

  it("leaves a clip on a locked track alone", () => {
    const p = doc();
    (p.tracks[1] as Project["tracks"][number]).locked = true;
    const reversed = run(p, setReverse(p, ["v"], true));
    expect(clip(reversed, "v").reverse).toBe(true);
    expect(clip(reversed, "a").reverse).toBeUndefined();
  });

  it("turns frame blending on and off for video clips only", () => {
    const p = doc();
    expect(setFrameBlend(p, ["a"], true)).toBeNull();
    const on = run(p, setFrameBlend(p, ["v"], true));
    expect(frameBlendAll(on, ["v"])).toBe(true);
    expect(clip(run(on, setFrameBlend(on, ["v"], false)), "v").frameBlend).toBeUndefined();
  });
});

describe("time remap commands (spec §21.22)", () => {
  it("enabling a remap draws the straight line of the speed: nothing changes yet", () => {
    const p = doc();
    const on = run(p, enableRemap(p, ["v", "a"]));
    expect(remappedAll(on, ["v"])).toBe(true);
    expect(clip(on, "a").timeRemap).toBeUndefined();
    for (const frame of [30, 45, 89]) expect(Math.abs(clipSourceUs(clip(on, "v"), frame, FPS) - clipSourceUs(clip(p, "v"), frame, FPS))).toBeLessThanOrEqual(1);
    expect(enableRemap(on, ["v"])).toBeNull();
    expect(clip(run(on, clearRemap(on, ["v"])), "v").timeRemap).toBeUndefined();
  });

  it("a ramp keeps the clip's source range and drops its reverse flag", () => {
    const p = run(doc(), setReverse(doc(), ["v"], true));
    const ramped = run(p, applyRamp(p, ["v"], "hero"));
    const keys = clip(ramped, "v").timeRemap ?? [];
    expect(keys.length).toBe(4);
    expect(clip(ramped, "v").reverse).toBeUndefined();
    // A reversed clip's ramp starts at its out point and ends at its in point.
    expect(remapUs(keys, 0)).toBe(clip(p, "v").out);
    expect(remapUs(keys, 60)).toBe(clip(p, "v").in);
  });

  it("sets keys through one command and refuses keys that do not span the clip", () => {
    const p = run(doc(), enableRemap(doc(), ["v"]));
    const keys = [
      { frame: 0, sourceUs: 5_000_000, ease: "linear" as const },
      { frame: 20, sourceUs: 5_000_000, ease: "linear" as const },
      { frame: 60, sourceUs: 7_000_000, ease: "linear" as const },
    ];
    const set = run(p, setRemapKeys(p, "v", keys));
    expect(clip(set, "v").timeRemap).toEqual(keys);
    expect(setRemapKeys(p, "v", keys.slice(0, 2))).toBeNull();
    expect(setRemapKeys(p, "v", [keys[0] as (typeof keys)[number], { ...(keys[2] as (typeof keys)[number]), frame: 59 }])).toBeNull();
    expect(setRemapKeys(p, "a", keys)).toBeNull();
  });
});

describe("edits keep a curve and a reverse valid", () => {
  it("a split gives each part the picture it had", () => {
    const p = run(doc(), applyRamp(doc(), ["v"], "hero"));
    const whole = clip(p, "v");
    const left = sliceClip(whole, 30, 50, FPS) as MediaClip;
    const right = sliceClip(whole, 50, 90, FPS) as MediaClip;
    expect(validateProject(only(p, [left, { ...right, id: "v2" }, clip(p, "a")]))).toEqual([]);
    for (const frame of [30, 41, 49]) expect(Math.abs(clipSourceUs(left, frame, FPS) - clipSourceUs(whole, frame, FPS))).toBeLessThanOrEqual(1);
    for (const frame of [50, 70, 89]) expect(Math.abs(clipSourceUs(right, frame, FPS) - clipSourceUs(whole, frame, FPS))).toBeLessThanOrEqual(1);
  });

  it("a split of a reversed clip: the first part shows the end of the source", () => {
    const p = run(doc(), setReverse(doc(), ["a"], true));
    const whole = clip(p, "a");
    const left = sliceClip(whole, 30, 60, FPS) as MediaClip;
    const right = sliceClip(whole, 60, 90, FPS) as MediaClip;
    // The first half of the timeline plays the second half of the source range, backward.
    expect(left.out).toBe(whole.out);
    expect(left.in).toBeGreaterThan(whole.in);
    expect(right.in).toBe(whole.in);
    expect(right.out).toBeLessThan(whole.out);
    expect(left.in).toBe(right.out);
    expect(validateProject(only(p, [clip(p, "v"), left, { ...right, id: "a2" }]))).toEqual([]);
  });

  it("trims keep the curve on the picture of the frames left, the ends on the clip's ends", () => {
    const p = run(doc(), applyRamp(doc(), ["v"], "bullet"));
    const whole = clip(p, "v");
    const headTrim = trimmedClip(whole, "in", 12, false, p) as MediaClip;
    expect(headTrim.timeRemap?.[0]?.frame).toBe(0);
    expect(headTrim.timeRemap?.at(-1)?.frame).toBe(headTrim.duration);
    expect(Math.abs(clipSourceUs(headTrim, headTrim.start + 10, FPS) - clipSourceUs(whole, whole.start + 22, FPS))).toBeLessThanOrEqual(1);
    const tailTrim = trimmedClip(whole, "out", -15, false, p) as MediaClip;
    expect(tailTrim.timeRemap?.at(-1)?.frame).toBe(45);
    expect(validateProject(only(p, [{ ...tailTrim }, clip(p, "a")]))).toEqual([]);
  });

  it("trimming a reversed clip moves its out point at the head and its in point at the tail", () => {
    const p = run(doc(), setReverse(doc(), ["a"], true));
    const whole = clip(p, "a");
    const head = trimmedClip(whole, "in", 10, false, p) as MediaClip;
    expect(head.in).toBe(whole.in);
    expect(head.out).toBe(whole.out - frameToUs(10, FPS));
    const tail = trimmedClip(whole, "out", -10, false, p) as MediaClip;
    expect(tail.out).toBe(whole.out);
    expect(tail.in).toBe(whole.in + frameToUs(10, FPS));
    expect(validateProject(only(p, [clip(p, "v"), head]))).toEqual([]);
    expect(validateProject(only(p, [clip(p, "v"), tail]))).toEqual([]);
  });

  it("a rate stretch scales the curve with the duration", () => {
    const p = run(doc(), applyRamp(doc(), ["v"], "hero"));
    const whole = clip(p, "v");
    const stretched = stretchedClip(whole, "stretchOut", 60) as MediaClip;
    expect(stretched.timeRemap?.at(-1)?.frame).toBe(120);
    expect(stretched.timeRemap?.[1]?.frame).toBe((whole.timeRemap?.[1]?.frame ?? 0) * 2);
  });
});
