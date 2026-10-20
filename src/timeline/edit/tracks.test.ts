import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { Compositor } from "../../render/compositor/Compositor.js";
import {
  addTrackNear,
  cycleHeight,
  deleteEmptyTracks,
  deleteTracks,
  hasFlag,
  lockAll,
  muteOthers,
  nextHeightForAll,
  reorderTrack,
  setTrackFlag,
  setTrackHeights,
} from "./tracks.js";

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, ...extra };
}

/** V1, V2, V3 (bottom to top), then A1, A2. */
function project(clips: Clip[] = [], tracks: Track[] = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"), makeTrack("a2", "audio")]): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video", 100_000_000), width: 1080, height: 1920 };
  p.tracks.push(...tracks);
  return withClips(p, clips);
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

const order = (p: Project) => p.tracks.map((track) => track.id);

describe("reorderTrack (spec §6.12)", () => {
  it("moves a video track among the video tracks: V1 above V3 changes the composite; one undo step restores it", () => {
    // Three full-frame clips at frame 0: the top track's is drawn last (on top).
    const p = project([clip("c1", "v1", 0, 10), clip("c2", "v2", 0, 10), clip("c3", "v3", 0, 10)]);
    const compositor = new Compositor();
    const ids = (doc: Project) => compositor.evaluate(doc, 0).layers.map((layer) => (layer.kind === "media" ? layer.clipId : ""));
    expect(ids(p)).toEqual(["c1", "c2", "c3"]);
    const command = reorderTrack(p, "v1", 2);
    expect(command).toMatchObject({ id: "track.reorder", label: "Reorder track" });
    const doc = store(p);
    doc.dispatch(command!);
    expect(order(doc.getState())).toEqual(["v2", "v3", "v1", "a1", "a2"]);
    expect(ids(doc.getState())).toEqual(["c2", "c3", "c1"]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
    expect(ids(doc.getState())).toEqual(["c1", "c2", "c3"]);
  });

  it("keeps each kind in its slots (the divider never moves), clamps the lane and ignores no-ops and caption tracks", () => {
    const p = project([], [makeTrack("v1"), makeTrack("v2"), makeTrack("cc", "caption"), makeTrack("a1", "audio"), makeTrack("a2", "audio"), makeTrack("a3", "audio")]);
    const doc = store(p);
    doc.dispatch(reorderTrack(p, "a3", 0)!);
    expect(order(doc.getState())).toEqual(["v1", "v2", "cc", "a3", "a1", "a2"]);
    doc.dispatch(reorderTrack(doc.getState(), "v2", -4)!);
    expect(order(doc.getState())).toEqual(["v2", "v1", "cc", "a3", "a1", "a2"]);
    expect(reorderTrack(doc.getState(), "v1", 9)).toBeNull();
    expect(reorderTrack(doc.getState(), "cc", 0)).toBeNull();
    expect(reorderTrack(doc.getState(), "missing", 0)).toBeNull();
  });

  it("reorders a locked track too (its clips do not change)", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio")];
    const p = project([clip("c", "v2", 0, 10)], tracks);
    const doc = store(p);
    doc.dispatch(reorderTrack(p, "v2", 0)!);
    expect(order(doc.getState())).toEqual(["v2", "v1", "a1"]);
    expect(doc.getState().clips.c).toBe(p.clips.c);
  });
});

describe("addTrackNear (spec §6.16)", () => {
  it("adds a video track above or below another (lanes count up), an audio track above (toward the divider) or below", () => {
    const p = project();
    const at = (command: ReturnType<typeof addTrackNear>) => {
      const doc = store(p);
      doc.dispatch(command);
      return order(doc.getState()).indexOf("new");
    };
    expect(at(addTrackNear(p, "video", "v2", "above", "new"))).toBe(2);
    expect(at(addTrackNear(p, "video", "v2", "below", "new"))).toBe(1);
    expect(at(addTrackNear(p, "audio", "a2", "above", "new"))).toBe(4);
    expect(at(addTrackNear(p, "audio", "a1", "below", "new"))).toBe(4);
    // Without a track of the kind: where new tracks of it go (top video, bottom audio).
    expect(at(addTrackNear(p, "video", "a1", "above", "new"))).toBe(3);
    expect(at(addTrackNear(p, "audio", null, "above", "new"))).toBe(5);
    const command = addTrackNear(p, "video", "v1", "above", "new");
    expect(command.label).toBe("Add video track");
    const doc = store(p);
    doc.dispatch(command);
    expect(doc.getState().tracks[1]).toMatchObject({ id: "new", name: "V4", targeted: true, locked: false, height: "M" });
  });
});

describe("deleteTracks / deleteEmptyTracks (spec §6.11)", () => {
  it("deletes tracks with their clips; partners left alone lose their link and group; one undo step", () => {
    const p = project([
      clip("v", "v2", 0, 10, { linkGroup: "L", group: "G" }),
      clip("a", "a1", 0, 10, { linkGroup: "L" }),
      clip("x", "v1", 0, 10, { group: "G" }),
      clip("y", "v3", 0, 10, { group: "G" }),
    ]);
    const result = deleteTracks(p, ["v2"]);
    expect(result.locked).toBeNull();
    expect(result.command).toMatchObject({ id: "track.delete", label: "Delete track" });
    const doc = store(p);
    doc.dispatch(result.command!);
    const next = doc.getState();
    expect(order(next)).toEqual(["v1", "v3", "a1", "a2"]);
    expect(next.clips.v).toBeUndefined();
    expect(next.clips.a?.linkGroup).toBeUndefined();
    // Two members of G remain: still a group.
    expect([next.clips.x?.group, next.clips.y?.group]).toEqual(["G", "G"]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("refuses when a track is locked", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio")];
    const result = deleteTracks(project([], tracks), ["v1", "v2"]);
    expect(result.command).toBeNull();
    expect(result.locked?.id).toBe("v2");
  });

  it("deletes the empty unlocked tracks but keeps one video and one audio track", () => {
    const tracks = [makeTrack("v1"), makeTrack("v2"), { ...makeTrack("v3"), locked: true }, makeTrack("a1", "audio"), makeTrack("a2", "audio")];
    const p = project([clip("c", "v2", 0, 10)], tracks);
    const doc = store(p);
    doc.dispatch(deleteEmptyTracks(p)!);
    // V1 empty goes (V2 has a clip, V3 is locked); A1 stays as the only audio track.
    expect(order(doc.getState())).toEqual(["v2", "v3", "a1"]);
    expect(deleteEmptyTracks(doc.getState())).toBeNull();
    expect(deleteEmptyTracks(project())?.label).toBe("Delete empty tracks");
  });
});

describe("track flags and heights", () => {
  it("sets one flag on the tracks it applies to, with its own command id and label", () => {
    const p = project();
    expect(setTrackFlag(p, ["v1"], "locked", true)).toMatchObject({ id: "track.lock", label: "Lock track", affects: ["tracks"] });
    expect(setTrackFlag(p, ["v1", "v2"], "locked", true)?.label).toBe("Lock tracks");
    expect(setTrackFlag(p, ["a1"], "muted", true)).toMatchObject({ id: "track.mute", label: "Mute track", affects: ["tracks", "audio"] });
    expect(setTrackFlag(p, ["v1"], "targeted", true)).toMatchObject({ id: "track.target", label: "Target track" });
    expect(setTrackFlag(p, ["v1"], "hidden", true)?.id).toBe("track.hide");
    // Solo is for audio tracks, hide for video and caption tracks.
    expect(setTrackFlag(p, ["v1"], "solo", true)).toBeNull();
    expect(setTrackFlag(p, ["a1"], "hidden", true)).toBeNull();
    expect(setTrackFlag(p, ["v1"], "locked", false)).toBeNull();
    expect([hasFlag({ kind: "caption" }, "muted"), hasFlag({ kind: "caption" }, "hidden"), hasFlag({ kind: "audio" }, "solo")]).toEqual([false, true, true]);
    const doc = store(p);
    doc.dispatch(setTrackFlag(p, ["v1", "a1"], "locked", true)!);
    expect(doc.getState().tracks.filter((track) => track.locked).map((track) => track.id)).toEqual(["v1", "a1"]);
  });

  it("mutes every other track of the kind, and locks or unlocks all", () => {
    const p = project();
    const doc = store(p);
    doc.dispatch(muteOthers(p, "a2")!);
    expect(doc.getState().tracks.map((track) => track.muted)).toEqual([false, false, false, true, false]);
    expect(muteOthers(doc.getState(), "a2")).toBeNull();
    doc.dispatch(lockAll(doc.getState())!);
    expect(doc.getState().tracks.every((track) => track.locked)).toBe(true);
    expect(lockAll(doc.getState())?.label).toBe("Unlock all tracks");
  });

  it("cycles height presets and picks the next height for all from the tallest", () => {
    expect([cycleHeight("S", "up"), cycleHeight("M", "up"), cycleHeight("L", "up")]).toEqual(["M", "L", "S"]);
    expect([cycleHeight("S", "down"), cycleHeight("M", "down"), cycleHeight("L", "down")]).toEqual(["L", "S", "M"]);
    const tracks = (...heights: Track["height"][]) => heights.map((height, i) => ({ ...makeTrack(`v${i}`), height }));
    expect(nextHeightForAll(tracks("M", "M"))).toBe("L");
    expect(nextHeightForAll(tracks("S", "L"))).toBe("S");
    expect(nextHeightForAll([])).toBe("M");
  });

  it("sets heights with no undo step (amend); undo and redo of other edits keep them", () => {
    const p = project([], [makeTrack("v1"), makeTrack("v2"), makeTrack("cc", "caption"), makeTrack("a1", "audio")]);
    expect(setTrackHeights(p, ["v1"], "M")).toBeNull();
    expect(setTrackHeights(p, ["cc"], "L")).toBeNull();
    const doc = store(p);
    // A reorder puts whole track objects back on undo: the heights set after it must survive.
    doc.dispatch(reorderTrack(p, "v1", 1)!);
    doc.amend(setTrackHeights(doc.getState(), ["v1", "v2", "cc"], "L")!);
    expect(doc.history.getState().undoLabel).toBe("Reorder track");
    doc.undo();
    expect(order(doc.getState())).toEqual(["v1", "v2", "cc", "a1"]);
    expect(doc.getState().tracks.map((track) => track.height)).toEqual(["L", "L", "M", "M"]);
    expect(Object.isFrozen(doc.getState().tracks[0])).toBe(true);
    doc.redo();
    expect(doc.getState().tracks.map((track) => track.height)).toEqual(["L", "L", "M", "M"]);
  });
});
