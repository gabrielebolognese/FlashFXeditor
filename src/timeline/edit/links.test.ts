import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { linkOffset, selectionPartners } from "../model/queries.js";
import { deletionSet } from "./delete.js";
import { groupClips, moveIntoSync, toggleLink, ungroupClips } from "./links.js";
import { nudgeClips } from "./move.js";

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, ...extra };
}

function project(clips: Clip[], tracks: Track[] = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(...tracks);
  return withClips(p, clips);
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

let ids = 0;
const newId = () => `id${++ids}`;

/** A video and its own audio, linked, at 100..200 (source 0..100 frames). */
const pair = () => project([clip("v", "v1", 100, 100, { linkGroup: "L" }), clip("a", "a1", 100, 100, { linkGroup: "L" })]);

describe("toggleLink (spec §6.12 Mod+L)", () => {
  it("acceptance: unlink a pair, move the audio by 12 frames, relink: the badge shows +12; Move into sync realigns", () => {
    const doc = store(pair());
    const unlink = toggleLink(doc.getState(), ["v", "a"], newId);
    expect(unlink.kind).toBe("unlink");
    if (unlink.kind === "refused") return;
    doc.dispatch(unlink.command);
    expect([doc.getState().clips.v?.linkGroup, doc.getState().clips.a?.linkGroup]).toEqual([undefined, undefined]);
    const moved = nudgeClips(doc.getState(), ["a"], 12, newId);
    if (moved.kind !== "ok") throw new Error("move");
    doc.dispatch(moved.command);
    const relink = toggleLink(doc.getState(), ["v", "a"], newId);
    expect(relink).toMatchObject({ kind: "link", command: { id: "clip.link", label: "Link clips" } });
    if (relink.kind === "refused") return;
    doc.dispatch(relink.command);
    expect(linkOffset(doc.getState(), "a")).toBe(12);
    expect(linkOffset(doc.getState(), "v")).toBe(-12);
    const sync = moveIntoSync(doc.getState(), "a", newId);
    expect(sync?.kind).toBe("ok");
    if (sync?.kind !== "ok") return;
    expect(sync.command.label).toBe("Move into sync");
    doc.dispatch(sync.command);
    expect(doc.getState().clips.a?.start).toBe(100);
    expect([linkOffset(doc.getState(), "a"), linkOffset(doc.getState(), "v")]).toEqual([0, 0]);
    // One undo step each.
    doc.undo();
    expect(doc.getState().clips.a?.start).toBe(112);
  });

  it("unlinks every member of the link groups the selection touches (one side selected is enough)", () => {
    const p = project([clip("v", "v1", 0, 10, { linkGroup: "L" }), clip("a", "a1", 0, 10, { linkGroup: "L" }), clip("a2", "a2", 0, 10, { linkGroup: "L" }), clip("w", "v2", 0, 10, { linkGroup: "K" })]);
    const result = toggleLink(p, ["v"], newId);
    if (result.kind === "refused") throw new Error("refused");
    const doc = store(p);
    doc.dispatch(result.command);
    expect(["v", "a", "a2", "w"].map((id) => doc.getState().clips[id]?.linkGroup)).toEqual([undefined, undefined, undefined, "K"]);
  });

  it("links an audio clip with a clip of a video track, one per track; refuses anything else", () => {
    const solid = makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 10 });
    const p = project([clip("v", "v1", 0, 10), clip("a", "a1", 0, 10), clip("b", "a1", 20, 10), clip("w", "v2", 20, 10), solid]);
    expect(toggleLink(p, [], newId)).toEqual({ kind: "refused", reason: "nothing" });
    expect(toggleLink(p, ["v", "w"], newId)).toEqual({ kind: "refused", reason: "needsPair" });
    expect(toggleLink(p, ["a", "b", "v"], newId)).toEqual({ kind: "refused", reason: "needsPair" });
    expect(toggleLink(p, ["v", "a"], newId).kind).toBe("link");
    // A solid (a clip of a video track) links with audio too.
    expect(toggleLink(p, ["s", "a"], newId).kind).toBe("link");
  });

  it("never changes clips on locked tracks", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), locked: true }];
    const p = project([clip("v", "v1", 0, 10, { linkGroup: "L" }), clip("a", "a1", 0, 10, { linkGroup: "L" })], tracks);
    const result = toggleLink(p, ["v", "a"], newId);
    if (result.kind === "refused") throw new Error("refused");
    const doc = store(p);
    doc.dispatch(result.command);
    expect([doc.getState().clips.v?.linkGroup, doc.getState().clips.a?.linkGroup]).toEqual([undefined, "L"]);
    expect(toggleLink(doc.getState(), ["a"], newId)).toEqual({ kind: "refused", reason: "nothing" });
  });
});

describe("moveIntoSync (spec §6.19)", () => {
  it("moves only the clicked clip by its offset, overwriting what it lands on; null when in sync", () => {
    const p = project([clip("v", "v1", 100, 100, { linkGroup: "L" }), clip("a", "a1", 90, 100, { linkGroup: "L" }), clip("n", "a1", 190, 50)]);
    expect(linkOffset(p, "a")).toBe(-10);
    const result = moveIntoSync(p, "a", newId);
    if (result?.kind !== "ok") throw new Error("move");
    const doc = store(p);
    doc.dispatch(result.command);
    const next = doc.getState();
    expect([next.clips.v?.start, next.clips.a?.start]).toEqual([100, 100]);
    // n (190..240) lost its first 10 frames to the moved audio.
    expect([next.clips.n?.start, next.clips.n?.duration]).toEqual([200, 40]);
    expect(moveIntoSync(next, "a", newId)).toBeNull();
    expect(moveIntoSync(next, "n", newId)).toBeNull();
  });

  it("does nothing for a clip on a locked track", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), locked: true }];
    const p = project([clip("v", "v1", 100, 100, { linkGroup: "L" }), clip("a", "a1", 90, 100, { linkGroup: "L" })], tracks);
    expect(linkOffset(p, "a")).toBe(-10);
    expect(moveIntoSync(p, "a", newId)).toBeNull();
  });
});

describe("groups (spec §6.12 Mod+G / Mod+Shift+G)", () => {
  const loose = () => project([clip("x", "v1", 0, 10), clip("y", "v2", 20, 10), clip("z", "a1", 40, 10, { linkGroup: "L" }), clip("zv", "v1", 40, 10, { linkGroup: "L" }), clip("w", "a2", 60, 10)]);

  it("groups the selection (and the groups it touches) into one new group; selecting a member selects the group", () => {
    const doc = store(loose());
    expect(groupClips(doc.getState(), ["x"], newId)).toBeNull();
    doc.dispatch(groupClips(doc.getState(), ["x", "y"], newId)!);
    const g = doc.getState().clips.x?.group;
    expect(g).toBeDefined();
    expect(doc.getState().clips.y?.group).toBe(g);
    // Already one group: nothing to do.
    expect(groupClips(doc.getState(), ["x", "y"], newId)).toBeNull();
    // Selecting x selects y; with Linked selection on, z brings its video partner along.
    expect(selectionPartners(doc.getState(), "x", true)).toEqual(["y"]);
    doc.dispatch(groupClips(doc.getState(), ["y", "z"], newId)!);
    const merged = doc.getState().clips.x?.group;
    expect(["x", "y", "z"].map((id) => doc.getState().clips[id]?.group)).toEqual([merged, merged, merged]);
    expect(merged).not.toBe(g);
    expect(new Set(selectionPartners(doc.getState(), "x", true))).toEqual(new Set(["y", "z", "zv"]));
    expect(new Set(selectionPartners(doc.getState(), "x", false))).toEqual(new Set(["y", "z"]));
  });

  it("deletes the whole group with a member; ungroups every member of the touched groups", () => {
    const doc = store(loose());
    doc.dispatch(groupClips(doc.getState(), ["x", "y", "w"], newId)!);
    expect(new Set(deletionSet(doc.getState(), ["w"]))).toEqual(new Set(["w", "x", "y"]));
    expect(ungroupClips(doc.getState(), ["zv"])).toBeNull();
    doc.dispatch(ungroupClips(doc.getState(), ["y"])!);
    expect(["x", "y", "w"].map((id) => doc.getState().clips[id]?.group)).toEqual([undefined, undefined, undefined]);
    expect(deletionSet(doc.getState(), ["w"])).toEqual(["w"]);
  });

  it("leaves members on locked tracks out of the group and the selection", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio"), makeTrack("a2", "audio")];
    const p = project([clip("x", "v1", 0, 10, { group: "G" }), clip("y", "v2", 20, 10, { group: "G" }), clip("w", "a2", 60, 10)], tracks);
    expect(selectionPartners(p, "x", true)).toEqual([]);
    expect(deletionSet(p, ["x"])).toEqual(["x"]);
    const doc = store(p);
    doc.dispatch(groupClips(p, ["x", "y", "w"], newId)!);
    expect(doc.getState().clips.y?.group).toBe("G");
    expect(doc.getState().clips.w?.group).toBe(doc.getState().clips.x?.group);
  });
});
