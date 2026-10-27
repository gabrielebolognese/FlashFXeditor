import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { selectClips, toSnapshot } from "../../core/store/selection.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import { applyMediaDrop, blockLength, commitPlan, dropLabel, planAtPlayhead, planCanvasDrop, requestItems, stageDrop, type DropPlan, type MediaDropItem, type TextDropItem } from "./dropMedia.js";
import type { MoveMode, MoveResult } from "./move.js";

function counter(prefix = "n"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** A project with a 10 s video (with audio), a silent 4 s video, a 2.5 s song and a still. */
function withMedia(project: Project = makeProject()): Project {
  project.media.vid = makeMedia("vid", "video", 10_000_000);
  project.media.mute = { ...makeMedia("mute", "video", 4_000_000), hasAudio: false };
  project.media.song = makeMedia("song", "audio", 2_500_000);
  project.media.still = makeMedia("still", "image", 0);
  return project;
}

const item = (project: Project, id: string, range: MediaDropItem["range"] = null): MediaDropItem => ({ media: project.media[id]!, range });

/** Clips of a track as [mediaId or id, start, duration]. */
function layout(project: Project, name: string): [string, number, number][] {
  const track = project.tracks.find((t) => t.name === name);
  return (track?.clipIds ?? []).map((id) => {
    const clip = project.clips[id] as Clip;
    return ["mediaId" in clip ? `${clip.mediaId}` : id, clip.start, clip.duration];
  });
}

function setup(project: Project) {
  const session = createSessionStore();
  const store = new DocumentStore(project, { session, validate: true, newId: counter("x") });
  return { session, store };
}

/** Dispatches a placement as the controller does (selecting the new clips). */
function apply(store: DocumentStore, result: MoveResult, plan: DropPlan): void {
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  store.dispatch(result.command, { selection: toSnapshot(selectClips(plan.clips.map((clip) => clip.id))) });
}

function place(store: DocumentStore, session: ReturnType<typeof createSessionStore>, ids: string[], mode: MoveMode, newId: () => string): DropPlan {
  const project = store.getState();
  const plan = planAtPlayhead(project, ids.map((id) => item(project, id, null)), session.state.getState().playhead, newId);
  apply(store, commitPlan(project, plan, mode, dropLabel(mode === "insert" ? "Insert" : "Overwrite", ids.length), newId), plan);
  setPlayhead(session, plan.end);
  return plan;
}

describe("stageDrop (a drag from the Media panel)", () => {
  it("puts a video on V2 and its linked audio on A2, creating A2 (acceptance 1)", () => {
    const project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
    const staged = stageDrop(project, [item(project, "vid")], 45, { video: 1, audio: 1 }, counter());
    expect(staged.newTracks.map((t) => [t.kind, t.name])).toEqual([["audio", "A2"]]);
    const [video, audio] = staged.clips as [MediaClip, MediaClip];
    expect(video).toMatchObject({ kind: "video", trackId: "v2", start: 45, duration: 300 });
    expect(audio).toMatchObject({ kind: "audio", trackId: staged.newTracks[0]!.id, start: 45, duration: 300 });
    expect(audio.linkGroup).toBe(video.linkGroup);
    expect(staged.targets.map((t) => [t.kind, t.number, t.track?.id ?? null])).toEqual([
      ["video", 1, "v2"],
      ["audio", 1, null],
    ]);
  });

  it("places several items back to back in order, each on the lanes of its kinds", () => {
    const project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    const items = [item(project, "still"), item(project, "song"), item(project, "vid", { inUs: 2_000_000, outUs: 5_000_000 })];
    expect(blockLength(items, project)).toBe(150 + 75 + 90);
    const staged = stageDrop(project, items, 10, { video: 0, audio: 0 }, counter());
    expect(staged.clips.map((c) => [c.kind, c.trackId, c.start, c.duration])).toEqual([
      ["image", "v1", 10, 150],
      ["audio", "a1", 160, 75],
      ["video", "v1", 235, 90],
      ["audio", "a1", 235, 90],
    ]);
    expect(staged.end).toBe(325);
    expect(staged.newTracks).toEqual([]);
  });

  it("creates every missing lane up to the one dropped on, named in order", () => {
    const project = withMedia();
    const staged = stageDrop(project, [item(project, "vid")], 0, { video: 1, audio: 1 }, counter());
    expect(staged.newTracks.map((t) => t.name)).toEqual(["V1", "V2", "A1", "A2"]);
    expect(staged.clips.map((c) => staged.newTracks.find((t) => t.id === c.trackId)?.name)).toEqual(["V2", "A2"]);
  });
});

describe("applyMediaDrop", () => {
  const base = () => {
    let project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
    project = withClips(project, [
      makeMediaClip(project, { id: "c1", trackId: "v2", start: 0, duration: 100, mediaId: "vid" }),
      makeMediaClip(project, { id: "c2", trackId: "v1", start: 50, duration: 100, mediaId: "vid" }),
    ]);
    return project;
  };

  it("overwrites what the drop covers, creates A2, selects the new clips; one undo step restores everything", () => {
    const project = base();
    const { store, session } = setup(project);
    const request = { items: [{ mediaId: "vid", range: { inUs: null, outUs: 1_000_000 } }], start: 40, lanes: { video: 1, audio: 1 }, mode: "overwrite" as const };
    const { result, plan } = applyMediaDrop(store.getState(), request, counter());
    apply(store, result, plan);
    const state = store.getState();
    expect(validateProject(state)).toEqual([]);
    expect(layout(state, "V2")).toEqual([
      ["vid", 0, 40],
      ["vid", 40, 30],
      ["vid", 70, 30],
    ]);
    expect(layout(state, "A2")).toEqual([["vid", 40, 30]]);
    expect(layout(state, "V1")).toEqual([["vid", 50, 100]]);
    expect(session.selection.getState().clipIds).toEqual(new Set(plan.clips.map((c) => c.id)));
    expect(store.history.getState().undoLabel).toBe("Add clip");
    store.undo();
    expect(store.getState()).toEqual(project);
  });

  it("inserts with Mod (spec §6.8): unlocked tracks open a gap as long as the block, split at the drop frame", () => {
    const { store } = setup(base());
    const { result, plan } = applyMediaDrop(store.getState(), { items: [{ mediaId: "mute", range: null }], start: 60, lanes: { video: 1, audio: 0 }, mode: "insert" }, counter());
    apply(store, result, plan);
    const state = store.getState();
    // c1 [0, 100) on V2 is cut at 60 and its right part moves after the 120-frame block.
    expect(layout(state, "V2")).toEqual([
      ["vid", 0, 60],
      ["mute", 60, 120],
      ["vid", 180, 40],
    ]);
    expect(layout(state, "V1")).toEqual([
      ["vid", 50, 10],
      ["vid", 180, 90],
    ]);
    expect(store.history.getState().undoLabel).toBe("Insert clip");
  });

  it("refuses a drop on a locked track and skips media no longer in the project", () => {
    const project = base();
    project.tracks[1]!.locked = true;
    const { result } = applyMediaDrop(project, { items: [{ mediaId: "vid", range: null }], start: 0, lanes: { video: 1, audio: 0 }, mode: "overwrite" }, counter());
    expect(result).toEqual({ kind: "refused", refusal: { reason: "lockedTarget", trackId: "v2" } });
    expect(requestItems(project, { items: [{ mediaId: "gone", range: null }, { mediaId: "song", range: null }] }).map((i) => (i as MediaDropItem).media.id)).toEqual(["song"]);
  });
});

describe("planAtPlayhead (double-click, `,` and `.`)", () => {
  it("creates V1 and A1 in an empty project and sequences inserts: the playhead goes to each end", () => {
    const { store, session } = setup(withMedia());
    const newId = counter();
    const plans = ["vid", "vid", "vid"].map((id) => place(store, session, [id], "insert", newId));
    expect(plans.map((plan) => [plan.start, plan.end])).toEqual([
      [0, 300],
      [300, 600],
      [600, 900],
    ]);
    expect(session.state.getState().playhead).toBe(900);
    expect(store.getState().tracks.map((t) => [t.name, t.clipIds.length])).toEqual([
      ["V1", 3],
      ["A1", 3],
    ]);
    // The first step also created the tracks: undoing it removes them too.
    store.undo();
    store.undo();
    store.undo();
    expect(store.getState().tracks).toEqual([]);
  });

  it("inserts a 3 s source range at the playhead (acceptance 2)", () => {
    const { store, session } = setup(withMedia());
    setPlayhead(session, 30);
    const project = store.getState();
    const plan = planAtPlayhead(project, [item(project, "vid", { inUs: 2_000_000, outUs: 5_000_000 })], 30, counter());
    apply(store, commitPlan(project, plan, "insert", "Insert clip", counter()), plan);
    expect(plan.end).toBe(120);
    const clips = Object.values(store.getState().clips) as MediaClip[];
    expect(clips.map((c) => [c.kind, c.start, c.duration, c.in, c.out])).toEqual([
      ["video", 30, 90, 2_000_000, 5_000_000],
      ["audio", 30, 90, 2_000_000, 5_000_000],
    ]);
  });

  it("insert ripples what follows on every unlocked track; overwrite replaces it", () => {
    let project = withMedia();
    project.tracks.push({ ...makeTrack("v1"), targeted: true }, { ...makeTrack("a1", "audio"), targeted: true }, { ...makeTrack("a2", "audio"), locked: true });
    project = withClips(project, [
      makeMediaClip(project, { id: "x", trackId: "v1", start: 0, duration: 100, mediaId: "vid" }),
      makeMediaClip(project, { id: "m", trackId: "a1", start: 0, duration: 200, mediaId: "vid", kind: "audio" }),
      makeMediaClip(project, { id: "l", trackId: "a2", start: 80, duration: 20, mediaId: "song", kind: "audio" }),
    ]);
    const inserted = setup(project);
    setPlayhead(inserted.session, 50);
    place(inserted.store, inserted.session, ["mute"], "insert", counter());
    expect(layout(inserted.store.getState(), "V1")).toEqual([
      ["vid", 0, 50],
      ["mute", 50, 120],
      ["vid", 170, 50],
    ]);
    expect(layout(inserted.store.getState(), "A1")).toEqual([
      ["vid", 0, 50],
      ["vid", 170, 150],
    ]);
    // Locked tracks never move.
    expect(layout(inserted.store.getState(), "A2")).toEqual([["song", 80, 20]]);
    expect(inserted.session.state.getState().playhead).toBe(170);

    const overwritten = setup(project);
    setPlayhead(overwritten.session, 50);
    place(overwritten.store, overwritten.session, ["mute"], "overwrite", counter());
    expect(layout(overwritten.store.getState(), "V1")).toEqual([
      ["vid", 0, 50],
      ["mute", 50, 120],
    ]);
    expect(layout(overwritten.store.getState(), "A1")).toEqual([["vid", 0, 200]]);
    expect(overwritten.store.history.getState().undoLabel).toBe("Overwrite clip");
  });

  it("targets the lowest targeted, unlocked track of each kind (else the first unlocked one)", () => {
    const project = withMedia();
    project.tracks.push(makeTrack("v1"), { ...makeTrack("v2"), targeted: true }, { ...makeTrack("a1", "audio"), locked: true, targeted: true }, makeTrack("a2", "audio"));
    const plan = planAtPlayhead(project, [item(project, "vid")], 0, counter());
    expect(plan.clips.map((c) => c.trackId)).toEqual(["v2", "a2"]);
    expect(plan.newTracks).toEqual([]);
  });

  it("skips items without a duration", () => {
    const project = withMedia();
    project.media.empty = makeMedia("empty", "video", 0);
    expect(planAtPlayhead(project, [item(project, "empty")], 0, counter()).clips).toEqual([]);
  });
});

describe("planCanvasDrop (drop on the preview, Add to canvas)", () => {
  it("lands on the top video track when it is free, centered on the drop point (acceptance 4)", () => {
    const project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("v2"));
    project.media.still = { ...project.media.still!, width: 400, height: 200 };
    const plan = planCanvasDrop(project, [item(project, "still")], 30, { x: 900, y: 300 }, counter());
    expect(plan.clips.map((c) => [c.kind, c.trackId, c.start, c.duration])).toEqual([["image", "v2", 30, 150]]);
    // Positions count from the frame center (1080 x 1920): (900 - 540, 300 - 960).
    expect((plan.clips[0] as MediaClip).transform).toMatchObject({ x: 360, y: -660, scale: 2.7, anchor: { x: 0.5, y: 0.5 } });
    expect((planCanvasDrop(project, [item(project, "still")], 0, null, counter()).clips[0] as MediaClip).transform).toMatchObject({ x: 0, y: 0 });
  });

  it("makes a new top track when the top one is taken or locked; never overwrites; sound on the first free audio track", () => {
    let project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio"));
    project = withClips(project, [
      makeMediaClip(project, { id: "t", trackId: "v2", start: 100, duration: 50, mediaId: "vid" }),
      makeMediaClip(project, { id: "m", trackId: "a1", start: 0, duration: 300, mediaId: "vid", kind: "audio" }),
    ]);
    const plan = planCanvasDrop(project, [item(project, "vid")], 0, null, counter());
    expect(plan.newTracks.map((t) => [t.kind, t.name])).toEqual([["video", "V3"]]);
    expect(plan.clips.map((c) => c.trackId)).toEqual([plan.newTracks[0]!.id, "a2"]);
    const { store } = setup(project);
    apply(store, commitPlan(project, plan, "overwrite", "Add to canvas", counter()), plan);
    const state = store.getState();
    expect(state.tracks.map((t) => t.name)).toEqual(["V1", "V2", "V3", "A1", "A2"]);
    expect(layout(state, "V2")).toEqual([["vid", 100, 50]]);
    expect(layout(state, "A1")).toEqual([["vid", 0, 300]]);
    expect(layout(state, "V3")).toEqual([["vid", 0, 300]]);

    const locked = structuredClone(project);
    locked.tracks[1]!.clipIds = [];
    delete locked.clips.t;
    locked.tracks[1]!.locked = true;
    expect(planCanvasDrop(locked, [item(locked, "still")], 0, null, counter()).newTracks.map((t) => t.name)).toEqual(["V3"]);
  });
});

describe("text preset drops", () => {
  const textItem = (duration = 90): TextDropItem => ({ text: { name: "Bold", duration, fields: { value: "Title", presetId: "p1", box: { mode: "fixed", width: 600 } } } });

  it("lays a text clip on the video lane, after the media before it", () => {
    const project = withMedia();
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    const items = [item(project, "song"), textItem(30)];
    expect(blockLength(items, project)).toBe(75 + 30);
    const staged = stageDrop(project, items, 10, { video: 1, audio: 0 }, counter());
    expect(staged.newTracks.map((t) => [t.kind, t.name])).toEqual([["video", "V2"]]);
    const text = staged.clips[1] as Clip;
    expect(text).toMatchObject({ kind: "text", start: 85, duration: 30, trackId: staged.newTracks[0]!.id, presetId: "p1", text: { value: "Title", box: { mode: "fixed", width: 600 } } });
    expect(staged.end).toBe(115);
  });

  it("drops through a request: one command, overwriting what is under it", () => {
    let project = withMedia();
    project.tracks.push(makeTrack("v1"));
    project = withClips(project, [makeMediaClip(project, { id: "c", trackId: "v1", mediaId: "mute", start: 0, duration: 120 })]);
    const request = { items: [textItem(60)], start: 30, lanes: { video: 0, audio: 0 }, mode: "overwrite" as const };
    expect(requestItems(project, request)).toEqual([textItem(60)]);
    const { result, plan } = applyMediaDrop(project, request, counter());
    expect(plan.clips.map((c) => [c.kind, c.trackId, c.start, c.duration])).toEqual([["text", "v1", 30, 60]]);
    const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
    store.dispatch((result as Extract<MoveResult, { kind: "ok" }>).command);
    expect(validateProject(store.getState())).toEqual([]);
    expect(layout(store.getState(), "V1").map(([, start, duration]) => [start, duration])).toEqual([
      [0, 30],
      [30, 60],
      [90, 30],
    ]);
  });
});
