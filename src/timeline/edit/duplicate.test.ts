import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, SolidClip } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { duplicateClips, duplicateLayers, type DuplicateResult } from "./duplicate.js";

function clip(id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId: "v1", start, duration, mediaId: "m" }), ...extra };
}

function audio(id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return clip(id, start, duration, { kind: "audio", trackId: "a1", ...extra });
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

let n = 0;
const newId = () => `copy-${++n}`;

function apply(p: Project, result: DuplicateResult | null): { doc: DocumentStore; copies: Clip[] } {
  if (!result) throw new Error("expected a duplicate");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  return { doc, copies: [...result.placed.values()].map((id) => doc.getState().clips[id] as Clip) };
}

const copyOf = (p: Project, id: string) => apply(p, duplicateClips(p, [id], newId)).copies[0] as Clip;

describe("duplicateClips (spec §11 Duplicate, §18 Mod+D)", () => {
  it("places a lone copy right after the clip when that span is free, keeping its fields; one undo step", () => {
    const p = project([clip("a", 10, 30, { transform: { x: 4, y: 5, scale: 2, rotation: 9, anchor: { x: 0.5, y: 0.5 }, flipH: true, flipV: false }, color: "teal", opacity: 0.5 })]);
    const { doc, copies } = apply(p, duplicateClips(p, ["a"], newId));
    const copy = copies[0] as MediaClip;
    expect(copy).toMatchObject({ trackId: "v1", start: 40, duration: 30, color: "teal", opacity: 0.5, in: (p.clips.a as MediaClip).in, out: (p.clips.a as MediaClip).out });
    expect(copy.transform).toEqual((p.clips.a as MediaClip).transform);
    expect(copy.id).not.toBe("a");
    expect(doc.history.getState().undoLabel).toBe("Duplicate clip");
    doc.undo();
    expect(Object.keys(doc.getState().clips)).toEqual(["a"]);
  });

  it("skips gaps too short for it and lands in the next free spot, else after the last clip", () => {
    const p = project([clip("a", 0, 30), clip("b", 50, 10), clip("c", 70, 40), clip("d", 140, 5)]);
    // 30..50 (20) and 60..70 (10) are too short; 110..140 (30) holds it.
    expect(copyOf(p, "a").start).toBe(110);
    expect(copyOf(p, "d").start).toBe(145);
    expect(copyOf(project([clip("a", 0, 30), clip("b", 30, 10)]), "a").start).toBe(40);
  });

  it("copies a lone member of a link group or group unlinked and ungrouped; locked or missing clips give null", () => {
    const p = project([clip("a", 0, 30, { linkGroup: "L", group: "G" }), audio("x", 0, 30, { linkGroup: "L" })]);
    const copy = copyOf(p, "a");
    expect(copy.linkGroup).toBeUndefined();
    expect(copy.group).toBeUndefined();
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    expect(duplicateClips(locked, ["a"], newId)).toBeNull();
    expect(duplicateClips(p, ["gone"], newId)).toBeNull();
  });

  it("copies a selection of several clips after it on the same tracks, with new links and groups shared by the copies", () => {
    const keyed = { keyframes: { opacity: [{ frame: 0, value: 0, ease: "linear" as const }, { frame: 10, value: 1, ease: "linear" as const }] } };
    const p = project([clip("v", 10, 30, { linkGroup: "L", group: "G", ...keyed }), audio("s", 10, 40, { linkGroup: "L" }), { ...clip("t", 20, 10, { group: "G" }), trackId: "v2" }]);
    const { doc, copies } = apply(p, duplicateClips(p, ["v", "s", "t"], newId));
    const [v, s, t] = copies as [MediaClip, MediaClip, MediaClip];
    // The block is 10..50 (40 frames): the copies keep their offsets from 50 on.
    expect([v.start, s.start, t.start]).toEqual([50, 50, 60]);
    expect([v.trackId, s.trackId, t.trackId]).toEqual(["v1", "a1", "v2"]);
    expect(v.linkGroup).toBeDefined();
    expect(v.linkGroup).toBe(s.linkGroup);
    expect(v.linkGroup).not.toBe("L");
    expect(t.linkGroup).toBeUndefined();
    expect(v.group).toBe(t.group);
    expect(v.group).not.toBe("G");
    expect(v.keyframes).toEqual(keyed.keyframes);
    expect(doc.history.getState().undoLabel).toBe("Duplicate clips");
  });

  it("moves every copy on together to the first offset where all of them fit (no ripple)", () => {
    // After the block (0..30) V1 is free but A1 has a clip at 40..60: the pair lands after it.
    const p = project([clip("v", 0, 30, { linkGroup: "L" }), audio("s", 0, 30, { linkGroup: "L" }), audio("b", 40, 20)]);
    const { doc, copies } = apply(p, duplicateClips(p, ["v", "s"], newId));
    expect(copies.map((copy) => copy.start)).toEqual([60, 60]);
    expect(doc.getState().clips.b).toEqual(p.clips.b);
  });

  it("keeps a transition when both its clips are copied (with a new id), drops a half whose partner stays", () => {
    const t = { id: "T", kind: "crossDissolve" as const, before: 5, after: 5 };
    const p = project([clip("a", 0, 30, { in: 1_000_000, out: 2_000_000, transitionOut: t }), clip("b", 30, 30, { in: 1_000_000, out: 2_000_000, transitionIn: t })]);
    const both = apply(p, duplicateClips(p, ["a", "b"], newId)).copies as [MediaClip, MediaClip];
    expect(both[0].transitionOut?.id).toBeDefined();
    expect(both[0].transitionOut?.id).not.toBe("T");
    expect(both[1].transitionIn).toEqual(both[0].transitionOut);
    const half = copyOf(p, "b") as MediaClip;
    expect(half.transitionIn).toBeUndefined();
    expect(half.transitionOut).toBeUndefined();
  });
});

describe("duplicateLayers (spec §7.2 canvas Duplicate, +20 px)", () => {
  it("puts the copy at the same frames on the free track above, 20 px down and right, unlinked; the audio is not copied", () => {
    const p = project([clip("v", 10, 30, { linkGroup: "L" }), audio("s", 10, 30, { linkGroup: "L" })]);
    const { doc, copies } = apply(p, duplicateLayers(p, ["v", "s"], newId));
    expect(copies).toHaveLength(1);
    const copy = copies[0] as MediaClip;
    expect(copy).toMatchObject({ trackId: "v2", start: 10, duration: 30 });
    expect(copy.transform).toMatchObject({ x: 20, y: 20 });
    expect(copy.linkGroup).toBeUndefined();
    expect(doc.history.getState().undoLabel).toBe("Duplicate layer");
  });

  it("shifts every position key with the copy", () => {
    const keys = { "transform.x": [{ frame: 0, value: 0, ease: "linear" as const }, { frame: 20, value: 100, ease: "linear" as const }], "transform.y": [{ frame: 0, value: -50, ease: "linear" as const }, { frame: 20, value: -50, ease: "linear" as const }] };
    const p = project([clip("v", 0, 30, { keyframes: keys })]);
    const copy = apply(p, duplicateLayers(p, ["v"], newId)).copies[0] as MediaClip;
    expect(copy.keyframes?.["transform.x"]?.map((key) => key.value)).toEqual([20, 120]);
    expect(copy.keyframes?.["transform.y"]?.map((key) => key.value)).toEqual([-30, -30]);
  });

  it("inserts a new video track right above the layer when the one above is taken there; each copy sits above its own layer", () => {
    const solid = (id: string, trackId: string): SolidClip => ({ ...makeSolidClip({ id, trackId, start: 0, duration: 30 }) });
    const p = project([solid("low", "v1"), solid("high", "v2")]);
    const { doc, copies } = apply(p, duplicateLayers(p, ["low", "high"], newId));
    const video = doc.getState().tracks.filter((track) => track.kind === "video").map((track) => track.clipIds);
    const [high, low] = copies as [SolidClip, SolidClip];
    expect(video).toEqual([["low"], [low.id], ["high"], [high.id]]);
    expect(doc.history.getState().undoLabel).toBe("Duplicate layers");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("gives null without a layer on an unlocked video track", () => {
    const p = project([audio("s", 0, 30)]);
    expect(duplicateLayers(p, ["s"], newId)).toBeNull();
  });
});
