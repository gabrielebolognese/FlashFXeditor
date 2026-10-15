import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import type { FrameRange } from "../model/inOut.js";
import { closeExtracted, liftRange, rangeTracks } from "./liftExtract.js";

const FPS = { num: 30, den: 1 };

function track(id: string, kind: Track["kind"] = "video", fields: Partial<Track> = {}): Track {
  return { ...makeTrack(id, kind), targeted: true, ...fields };
}

function media(doc: Project, id: string, trackId: string, start: number, duration: number, kind: MediaClip["kind"] = "video", fields: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(doc, { id, trackId, start, duration, mediaId: "m", kind }), ...fields };
}

function build(tracks: Track[], clips: (doc: Project) => Clip[]): Project {
  let doc = makeProject();
  doc.media.m = makeMedia("m");
  doc.tracks = tracks;
  doc = withClips(doc, clips(doc));
  return doc;
}

function setup(doc: Project) {
  const store = new DocumentStore(doc, { session: createSessionStore(), validate: true });
  let n = 0;
  const newId = () => `new${++n}`;
  /** `[id start-end]` per clip of a track. */
  const layout = (trackId: string) => {
    const project = store.getState();
    return (project.tracks.find((t) => t.id === trackId)?.clipIds ?? []).map((id) => {
      const clip = project.clips[id] as Clip;
      return `${id} ${clip.start}-${clip.start + clip.duration}`;
    });
  };
  const lift = (range: FrameRange) => {
    const command = liftRange(store.getState(), range, newId);
    if (command) store.dispatch(command);
    return command;
  };
  /** As the controller runs it: one transaction, the close computed on the lifted document. */
  const extract = (range: FrameRange) => {
    const tracks = rangeTracks(store.getState());
    return store.transaction("Extract", () => {
      const command = liftRange(store.getState(), range, newId, tracks);
      if (command) store.dispatch(command);
      const close = closeExtracted(store.getState(), range, tracks);
      if (close.command) store.dispatch(close.command);
      return close;
    });
  };
  const steps = () => store.history.getState().undoLabel;
  return { store, layout, lift, extract, steps };
}

describe("Lift", () => {
  it("removes the range on targeted tracks, trimming the clips across its edges, and leaves the gap (one undo step)", () => {
    const doc = build([track("v1"), track("a1", "audio")], (d) => [
      media(d, "a", "v1", 0, 60),
      media(d, "b", "v1", 60, 60),
      media(d, "c", "v1", 120, 60),
      media(d, "x", "a1", 0, 180, "audio"),
    ]);
    const t = setup(doc);
    const before = t.store.getState();
    t.lift({ start: 30, end: 90 });
    expect(t.layout("v1")).toEqual(["a 0-30", "b 90-120", "c 120-180"]);
    expect(t.layout("a1")).toEqual(["x 0-30", "new1 90-180"]);
    // The kept part of b starts 30 frames into its source.
    expect((t.store.getState().clips.b as MediaClip).in).toBe(frameToUs(30, FPS));
    expect((t.store.getState().clips.new1 as MediaClip).in).toBe(frameToUs(90, FPS));
    expect(t.steps()).toBe("Lift");
    t.store.undo();
    expect(t.store.getState()).toStrictEqual(before);
  });

  it("leaves untargeted and locked tracks alone; nothing in the range lifts nothing", () => {
    const doc = build([track("v1"), track("v2", "video", { targeted: false }), track("v3", "video", { locked: true })], (d) => [
      media(d, "a", "v1", 0, 100),
      makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 100 }),
      makeSolidClip({ id: "l", trackId: "v3", start: 0, duration: 100 }),
    ]);
    const t = setup(doc);
    t.lift({ start: 20, end: 40 });
    expect(t.layout("v1")).toEqual(["a 0-20", "new1 40-100"]);
    expect(t.layout("v2")).toEqual(["s 0-100"]);
    expect(t.layout("v3")).toEqual(["l 0-100"]);
    expect(t.lift({ start: 200, end: 300 })).toBeNull();
  });

  it("relinks the right pieces of a linked pair cut together; a lone right piece is unlinked", () => {
    const pair = (d: Project) => [media(d, "v", "v1", 0, 100, "video", { linkGroup: "g" }), media(d, "a", "a1", 0, 100, "audio", { linkGroup: "g" })];
    const both = setup(build([track("v1"), track("a1", "audio")], pair));
    both.lift({ start: 40, end: 60 });
    const clips = both.store.getState().clips;
    expect([clips.v?.linkGroup, clips.a?.linkGroup]).toEqual(["g", "g"]);
    expect(clips.new1?.linkGroup).toBeDefined();
    expect(clips.new1?.linkGroup).toBe(clips.new2?.linkGroup);
    expect(clips.new1?.linkGroup).not.toBe("g");

    const videoOnly = setup(build([track("v1"), track("a1", "audio", { targeted: false })], pair));
    videoOnly.lift({ start: 40, end: 60 });
    const after = videoOnly.store.getState().clips;
    expect(after.v?.linkGroup).toBe("g");
    expect(after.new1?.linkGroup).toBeUndefined();
    expect(videoOnly.layout("a1")).toEqual(["a 0-100"]);
  });
});

describe("Extract", () => {
  it("removes the range on targeted tracks and ripples what follows, in one undo step", () => {
    const doc = build([track("v1"), track("a1", "audio")], (d) => [
      media(d, "a", "v1", 0, 60),
      media(d, "b", "v1", 60, 60),
      media(d, "c", "v1", 120, 60),
      media(d, "x", "a1", 0, 60, "audio"),
      media(d, "y", "a1", 60, 120, "audio"),
    ]);
    const t = setup(doc);
    const before = t.store.getState();
    const result = t.extract({ start: 30, end: 90 });
    expect(result.limit).toBeNull();
    expect(t.layout("v1")).toEqual(["a 0-30", "b 30-60", "c 60-120"]);
    expect(t.layout("a1")).toEqual(["x 0-30", "y 30-120"]);
    expect(t.steps()).toBe("Extract");
    t.store.undo();
    expect(t.store.getState()).toStrictEqual(before);
    t.store.redo();
    expect(t.layout("v1")).toEqual(["a 0-30", "b 30-60", "c 60-120"]);
  });

  it("closes an empty range too, and untargeted tracks follow the ripple (a clip spanning the range stays)", () => {
    const doc = build([track("v1"), track("v2", "video", { targeted: false }), track("a2", "audio", { targeted: false })], (d) => [
      media(d, "a", "v1", 0, 30),
      media(d, "b", "v1", 90, 30),
      makeSolidClip({ id: "title", trackId: "v2", start: 100, duration: 30 }),
      media(d, "bed", "a2", 0, 300, "audio"),
    ]);
    const t = setup(doc);
    t.extract({ start: 30, end: 90 });
    expect(t.layout("v1")).toEqual(["a 0-30", "b 30-60"]);
    expect(t.layout("v2")).toEqual(["title 40-70"]);
    expect(t.layout("a2")).toEqual(["bed 0-300"]);
  });

  it("stops short where an untargeted clip would collide, and names it", () => {
    const doc = build([track("v1"), track("v2", "video", { targeted: false })], (d) => [
      media(d, "a", "v1", 0, 200),
      makeSolidClip({ id: "first", trackId: "v2", start: 40, duration: 60 }),
      makeSolidClip({ id: "second", trackId: "v2", start: 110, duration: 20 }),
    ]);
    const t = setup(doc);
    const result = t.extract({ start: 50, end: 80 });
    expect(result.limit).toEqual({ trackId: "v2", clipId: "second" });
    expect(result.closed).toEqual([10]);
    expect(t.layout("v1")).toEqual(["a 0-50", "new1 70-190"]);
    expect(t.layout("v2")).toEqual(["first 40-100", "second 100-120"]);
  });

  it("never moves or limits locked tracks", () => {
    const doc = build([track("v1"), track("v2", "video", { locked: true })], (d) => [
      media(d, "a", "v1", 0, 100),
      makeSolidClip({ id: "l1", trackId: "v2", start: 0, duration: 100 }),
      makeSolidClip({ id: "l2", trackId: "v2", start: 100, duration: 20 }),
    ]);
    const t = setup(doc);
    expect(rangeTracks(t.store.getState())).toEqual(["v1"]);
    const result = t.extract({ start: 10, end: 20 });
    expect(result.limit).toBeNull();
    expect(t.layout("v1")).toEqual(["a 0-10", "new1 10-90"]);
    expect(t.layout("v2")).toEqual(["l1 0-100", "l2 100-120"]);
  });
});
