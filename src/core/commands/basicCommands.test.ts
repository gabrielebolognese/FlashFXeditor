import { defaultCaptionStyle } from "../../text/captions.js";
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addClip, addTrack, removeClips, removeTrack, updateClip, updateTrack } from "./basicCommands.js";

function setup() {
  let project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  project = withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c2", trackId: "v1", start: 60, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c3", trackId: "a1", start: 0, duration: 30, mediaId: "m1", kind: "audio" }),
  ]);
  const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
  return { store, trackIds: () => store.getState().tracks.map((t) => t.id) };
}

describe("track commands", () => {
  it("adds tracks at kind-appropriate default positions", () => {
    const { store, trackIds } = setup();
    store.dispatch(addTrack(makeTrack("v2")));
    store.dispatch(addTrack(makeTrack("cap", "caption")));
    store.dispatch(addTrack(makeTrack("a2", "audio")));
    store.dispatch(addTrack(makeTrack("v3")));
    expect(trackIds()).toEqual(["v1", "v2", "v3", "cap", "a1", "a2"]);
    store.dispatch(addTrack(makeTrack("v0"), 0));
    expect(trackIds()[0]).toBe("v0");
  });

  it("rejects a duplicate track id", () => {
    const { store } = setup();
    expect(() => store.dispatch(addTrack(makeTrack("v1")))).toThrow(/already exists/);
  });

  it("removes a track with its clips and caption data, and undoes it", () => {
    const { store, trackIds } = setup();
    store.dispatch(addTrack(makeTrack("cap", "caption")));
    store.dispatch({ id: "test", label: "Caption data", affects: ["captions"], run: (d) => void (d.captionTracks.cap = { style: defaultCaptionStyle(d.settings) }) });
    store.dispatch(removeTrack("v1"));
    store.dispatch(removeTrack("cap"));
    expect(trackIds()).toEqual(["a1"]);
    expect(Object.keys(store.getState().clips)).toEqual(["c3"]);
    expect(store.getState().captionTracks).toEqual({});
    store.undo();
    store.undo();
    expect(trackIds()).toEqual(["v1", "cap", "a1"]);
    expect(store.getState().tracks[0]?.clipIds).toEqual(["c1", "c2"]);
  });

  it("sets track flags as one undo step, mute and solo flagged for the audio engine", () => {
    const { store } = setup();
    const affects: string[][] = [];
    store.subscribe((_state, _prev, flags) => void affects.push([...flags]));
    store.dispatch(updateTrack("a1", { muted: true }, "Mute track"));
    store.dispatch(updateTrack("a1", { solo: true }, "Solo track"));
    store.dispatch(updateTrack("v1", { name: "Main" }));
    const a1 = store.getState().tracks.find((t) => t.id === "a1");
    expect(a1).toMatchObject({ muted: true, solo: true });
    expect(affects).toEqual([["tracks", "audio"], ["tracks", "audio"], ["tracks"]]);
    expect(store.history.getState().undoLabel).toBe("Edit track");
    store.undo();
    store.undo();
    expect(store.getState().tracks.find((t) => t.id === "a1")?.solo).toBe(false);
    expect(() => store.dispatch(updateTrack("nope", { muted: true }))).toThrow(/does not exist/);
  });

  it("treats removing an unknown track as a no-op", () => {
    const { store } = setup();
    store.dispatch(removeTrack("nope"));
    expect(store.history.getState().canUndo).toBe(false);
  });
});

describe("clip commands", () => {
  it("adds a clip in start order without freezing the caller's object", () => {
    const { store } = setup();
    const clip = makeSolidClip({ id: "s1", trackId: "v1", start: 40, duration: 10 });
    store.dispatch(addClip(clip));
    expect(store.getState().tracks[0]?.clipIds).toEqual(["c1", "s1", "c2"]);
    expect(store.getState().clips.s1).toEqual(clip);
    expect(Object.isFrozen(clip.transform)).toBe(false);
  });

  it("rejects adding to a missing track or with a used id", () => {
    const { store } = setup();
    expect(() => store.dispatch(addClip(makeSolidClip({ id: "s1", trackId: "nope", start: 0, duration: 1 })))).toThrow(/track nope/);
    expect(() => store.dispatch(addClip(makeSolidClip({ id: "c1", trackId: "v1", start: 200, duration: 1 })))).toThrow(/clip c1 already/);
  });

  it("removes clips from their tracks", () => {
    const { store } = setup();
    const command = removeClips(["c1", "c3", "missing"]);
    expect(command.label).toBe("Delete clips");
    store.dispatch(command);
    expect(store.getState().tracks.map((t) => t.clipIds)).toEqual([["c2"], []]);
    expect(Object.keys(store.getState().clips)).toEqual(["c2"]);
    expect(removeClips(["c1"]).label).toBe("Delete clip");
  });

  it("updates fields and re-sorts when the start changes", () => {
    const { store } = setup();
    store.dispatch(updateClip("c1", { start: 100, name: "Moved" }));
    expect(store.getState().tracks[0]?.clipIds).toEqual(["c2", "c1"]);
    expect(store.getState().clips.c1).toMatchObject({ start: 100, name: "Moved" });
  });

  it("moves a clip between tracks", () => {
    const { store } = setup();
    store.dispatch(addTrack(makeTrack("v2")));
    store.dispatch(updateClip("c2", { trackId: "v2", start: 5 }));
    expect(store.getState().tracks.map((t) => t.clipIds)).toEqual([["c1"], ["c2"], ["c3"]]);
    expect(() => store.dispatch(updateClip("c2", { trackId: "nope" }))).toThrow(/track nope/);
  });

  it("removes an optional field when set to undefined", () => {
    const { store } = setup();
    store.dispatch(updateClip("c1", { color: "red" }));
    expect(store.getState().clips.c1?.color).toBe("red");
    store.dispatch(updateClip("c1", { color: undefined }));
    expect("color" in store.getState().clips.c1!).toBe(false);
  });

  it("declares affects and coalesce keys", () => {
    expect(updateClip("c1", { name: "x" }).affects).toEqual(["clips"]);
    expect(updateClip("c1", { duration: 3 }).affects).toEqual(["clips", "timeline"]);
    expect(updateClip("c1", { opacity: 0.5 }, { coalesceKey: "opacity:c1", label: "Opacity" })).toMatchObject({
      coalesceKey: "opacity:c1",
      label: "Opacity",
    });
    expect("coalesceKey" in updateClip("c1", { name: "x" })).toBe(false);
  });

  it("flags frame-only fields as composite, so the timeline does not redraw for them", () => {
    expect(updateClip("c1", { opacity: 0.5 }).affects).toEqual(["composite"]);
    expect(updateClip("c1", { transform: { x: 1, y: 2, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false }, crop: { left: 0.1, top: 0, right: 0, bottom: 0 } }).affects).toEqual(["composite"]);
    expect(updateClip("c1", { opacity: 0.5, name: "x" }).affects).toEqual(["composite", "clips"]);
    expect(updateClip("c1", { opacity: 0.5, start: 3 }).affects).toEqual(["composite", "clips", "timeline"]);
    expect(updateClip("c1", {}).affects).toEqual(["clips"]);
    // Undo carries the same flags.
    const { store } = setup();
    const seen: string[][] = [];
    store.subscribe((_state, _prev, affects) => seen.push([...affects]));
    store.dispatch(updateClip("c1", { opacity: 0.25 }));
    store.undo();
    expect(seen).toEqual([["composite"], ["composite"]]);
    expect(store.getState().clips.c1).toMatchObject({ opacity: 1 });
  });

  it("throws for an unknown clip", () => {
    const { store } = setup();
    expect(() => store.dispatch(updateClip("nope", { name: "x" }))).toThrow(/clip nope does not exist/);
  });
});
