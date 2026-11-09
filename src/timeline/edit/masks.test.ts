import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Keyframes, Mask, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { maskPathPoints } from "../../core/masks/maskPath.js";
import { masksAt } from "../../core/masks/maskEval.js";
import { addMask, applyMaskPreset, commitMaskGesture, defaultMask, deleteMaskPoint, insertMaskPoint, maskContentSize, maskFieldKeyed, nextMaskId, removeAllMasks, removeMask, reorderMask, setMaskField, setMaskFlags, setMaskStopwatch, toggleMaskKey, type SizeOf } from "./masks.js";

function doc(): Project {
  const p = makeProject();
  p.media.m1 = { ...makeMedia("m1", "video"), width: 1920, height: 1080, rotation: 90 };
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio")];
  p.sequences.seq = { id: "seq", name: "seq", size: { w: 720, h: 1280 }, duration: 60, background: null, tracks: [makeTrack("in-1")] };
  const next = withClips(p, [
    makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 60, mediaId: "m1" }),
    makeTextClip({ id: "t", trackId: "v2", start: 0, duration: 30, value: "Title" }),
    makeSolidClip({ id: "s", trackId: "v3", start: 0, duration: 30 }),
    makeCompoundClip({ id: "c", trackId: "v3", start: 30, duration: 30, sequenceId: "seq" }),
    makeMediaClip(p, { id: "a", trackId: "a1", start: 0, duration: 30, mediaId: "m1", kind: "audio" }),
  ]);
  expect(validateProject(next)).toEqual([]);
  return next;
}

const sizeOf = (p: Project): SizeOf => (clip) => maskContentSize(p, clip) ?? (clip.kind === "text" ? { w: 400, h: 120 } : null);

const run = (p: Project, command: Command | null): Project => {
  expect(command).not.toBeNull();
  const next = structuredClone(p);
  command?.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

const kf = (p: Project, id: string) => (p.clips[id] as Clip & { keyframes?: Keyframes }).keyframes;
const masks = (p: Project, id: string) => (p.clips[id] as Clip & { masks?: Mask[] }).masks ?? [];

describe("mask edits (spec §21.18, Batch 73)", () => {
  it("content sizes: a rotated video's shown size, a solid's size, a compound's sequence size, none for text", () => {
    const p = doc();
    expect(maskContentSize(p, p.clips.v as Clip)).toEqual({ w: 1080, h: 1920 });
    expect(maskContentSize(p, p.clips.c as Clip)).toEqual({ w: 720, h: 1280 });
    const s = p.clips.s as Clip & { size: { w: number; h: number } };
    expect(maskContentSize(p, s)).toEqual(s.size);
    expect(maskContentSize(p, p.clips.t as Clip)).toBeNull();
  });

  it("adds a mask to every selected visual clip in one step; audio is left out; ids do not clash", () => {
    const p = doc();
    const command = addMask(p, ["v", "t", "a"], "ellipse", sizeOf(p));
    expect(command?.id).toBe("clip.mask.add");
    const next = run(p, command);
    expect(masks(next, "v")[0]?.shape).toEqual({ kind: "ellipse", x: 108, y: 192, w: 864, h: 1536 });
    expect(masks(next, "t")[0]?.id).toBe("mask1");
    expect(masks(next, "a")).toEqual([]);
    const again = run(next, addMask(next, ["v"], "path", sizeOf(next)));
    expect(masks(again, "v").map((m) => m.id)).toEqual(["mask1", "mask2"]);
    expect(maskPathPoints((masks(again, "v")[1]?.shape as { d: string }).d)?.length).toBe(8);
    expect(nextMaskId([{ id: "mask2" } as Mask])).toBe("mask1");
  });

  it("locked clips are left out", () => {
    const p = doc();
    (p.tracks[0] as { locked: boolean }).locked = true;
    expect(addMask(p, ["v"], "rect", sizeOf(p))).toBeNull();
  });

  it("fields write the base until keyed, then keys at the playhead; the stopwatch keys and unkeys", () => {
    let p = doc();
    p = run(p, addMask(p, ["s"], "rect", sizeOf(p)));
    p = run(p, setMaskField(p, "s", "mask1", "feather", 40, 5));
    expect(masks(p, "s")[0]?.feather).toBe(40);
    expect(setMaskField(p, "s", "mask1", "feather", 40, 5)).toBeNull();
    p = run(p, setMaskField(p, "s", "mask1", "opacity", -2, 5));
    expect(masks(p, "s")[0]?.opacity).toBe(0);
    p = run(p, setMaskStopwatch(p, "s", "mask1", "w", true, 0));
    expect(maskFieldKeyed(p.clips.s as never, "mask1", "w")).toBe(true);
    p = run(p, setMaskField(p, "s", "mask1", "w", 10, 20));
    const shown = (frame: number) => masksAt(p.clips.s as never, frame)[0]?.shape as { w: number };
    expect(shown(20).w).toBe(10);
    expect(shown(10).w).toBeGreaterThan(10);
    // The diamond: a key at 10, then removed.
    p = run(p, toggleMaskKey(p, "s", "mask1", "w", 10));
    expect(kf(p, "s")?.["masks.mask1.w"]?.length).toBe(3);
    p = run(p, toggleMaskKey(p, "s", "mask1", "w", 10));
    expect(kf(p, "s")?.["masks.mask1.w"]?.length).toBe(2);
    // Off: the keys go, the value at the playhead stays.
    p = run(p, setMaskStopwatch(p, "s", "mask1", "w", false, 20));
    expect(kf(p, "s")).toBeUndefined();
    expect((masks(p, "s")[0]?.shape as { w: number }).w).toBe(10);
  });

  it("mode, invert, reorder and remove (with the mask's keys)", () => {
    let p = doc();
    p = run(p, addMask(p, ["s"], "rect", sizeOf(p)));
    p = run(p, addMask(p, ["s"], "ellipse", sizeOf(p)));
    p = run(p, setMaskFlags(p, "s", "mask2", { mode: "subtract" }));
    p = run(p, setMaskFlags(p, "s", "mask2", { inverted: true }));
    expect(masks(p, "s")[1]).toMatchObject({ mode: "subtract", inverted: true });
    p = run(p, reorderMask(p, "s", "mask2", -1));
    expect(masks(p, "s").map((m) => m.id)).toEqual(["mask2", "mask1"]);
    expect(reorderMask(p, "s", "mask2", -1)).toBeNull();
    p = run(p, setMaskStopwatch(p, "s", "mask2", "feather", true, 0));
    p = run(p, removeMask(p, "s", "mask2"));
    expect(masks(p, "s").map((m) => m.id)).toEqual(["mask1"]);
    expect(kf(p, "s")).toBeUndefined();
    p = run(p, removeAllMasks(p, ["s", "v"]));
    expect((p.clips.s as { masks?: Mask[] }).masks).toBeUndefined();
  });

  it("a canvas gesture is one command writing what changed (keys where keyed)", () => {
    let p = doc();
    p = run(p, addMask(p, ["s"], "ellipse", sizeOf(p)));
    p = run(p, setMaskStopwatch(p, "s", "mask1", "x", true, 0));
    const before = masksAt(p.clips.s as never, 12);
    const after = structuredClone(before) as Mask[];
    const shape = after[0]?.shape as { x: number; w: number };
    shape.x += 33.333;
    shape.w += 10;
    (after[0] as Mask).feather = 12;
    const command = commitMaskGesture(p, "s", before, after, 12);
    expect(command?.id).toBe("clip.mask.edit");
    p = run(p, command);
    expect(kf(p, "s")?.["masks.mask1.x"]?.map((k) => k.frame)).toEqual([0, 12]);
    expect(masks(p, "s")[0]?.feather).toBe(12);
    expect(commitMaskGesture(p, "s", before, before, 12)).toBeNull();
  });

  it("adding and deleting path points edits the base and every key alike (the morph keeps working)", () => {
    let p = doc();
    p = run(p, addMask(p, ["s"], "path", sizeOf(p)));
    p = run(p, setMaskStopwatch(p, "s", "mask1", "path", true, 0));
    const moved = structuredClone(masksAt(p.clips.s as never, 20)) as Mask[];
    const shape = moved[0]?.shape as { d: string };
    const points = maskPathPoints(shape.d) as number[];
    shape.d = `M${points[0] as number} ${(points[1] as number) + 50}L${points[2]} ${points[3]}L${points[4]} ${points[5]}L${points[6]} ${points[7]}Z`;
    p = run(p, commitMaskGesture(p, "s", masksAt(p.clips.s as never, 20), moved, 20));
    p = run(p, insertMaskPoint(p, "s", "mask1", { sub: 0, seg: 0 }, 0.5));
    const keys = kf(p, "s")?.["masks.mask1.path"] ?? [];
    expect(keys.map((k) => (k.value as number[]).length)).toEqual([10, 10]);
    expect(maskPathPoints((masks(p, "s")[0]?.shape as { d: string }).d)?.length).toBe(10);
    // A morph sample is the right length, so the keyed path is shown.
    expect(maskPathPoints((masksAt(p.clips.s as never, 10)[0]?.shape as { d: string }).d)?.length).toBe(10);
    p = run(p, deleteMaskPoint(p, "s", "mask1", 1));
    expect((kf(p, "s")?.["masks.mask1.path"] ?? []).map((k) => (k.value as number[]).length)).toEqual([8, 8]);
    // Three anchors stay.
    p = run(p, deleteMaskPoint(p, "s", "mask1", 1));
    expect(deleteMaskPoint(p, "s", "mask1", 1)).toBeNull();
  });

  it("Wipe in and Circle reveal add a keyed reveal over the clip's first second", () => {
    let p = doc();
    p = run(p, applyMaskPreset(p, ["t"], "wipeIn", sizeOf(p)));
    const wipe = kf(p, "t")?.["masks.mask1.w"];
    expect(wipe?.map((k) => [k.frame, k.value])).toEqual([[0, 0], [29, 400]]);
    p = run(p, applyMaskPreset(p, ["v"], "circleReveal", sizeOf(p)));
    const circle = masks(p, "v")[0];
    expect(circle?.shape.kind).toBe("ellipse");
    expect(kf(p, "v")?.["masks.mask1.w"]?.[0]?.value).toBe(0);
    const d = Math.round(Math.hypot(1080, 1920) * 100) / 100;
    expect(kf(p, "v")?.["masks.mask1.w"]?.[1]?.value).toBe(d);
  });

  it("the default mask sits in the middle of the box", () => {
    expect(defaultMask("rect", { w: 100, h: 50 }, "m").shape).toEqual({ kind: "rect", x: 10, y: 5, w: 80, h: 40, radius: 0 });
  });
});
