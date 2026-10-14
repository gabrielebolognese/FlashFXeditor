import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import { firstFreeStart, insertCommands, naturalDuration, planMediaInsert, type InsertPlan } from "./insertMedia.js";

const FPS = { num: 30, den: 1 };

function counter(prefix = "n") {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function media(project: Project) {
  project.media.vid = makeMedia("vid", "video", 10_000_000); // 10 s, with audio
  project.media.mute = { ...makeMedia("mute", "video", 4_000_000), hasAudio: false };
  project.media.song = makeMedia("song", "audio", 2_500_000);
  project.media.still = makeMedia("still", "image", 0);
  return project;
}

/** Applies a plan the way the controller does: one transaction, then the playhead to its end. */
function insert(store: DocumentStore, session: ReturnType<typeof createSessionStore>, mediaId: string, newId: () => string): InsertPlan {
  const project = store.getState();
  const plan = planMediaInsert(project, project.media[mediaId]!, session.state.getState().playhead, newId);
  if (!plan) throw new Error("no plan");
  store.transaction("Insert clip", () => {
    for (const command of insertCommands(plan)) store.dispatch(command);
  });
  setPlayhead(session, plan.end);
  return plan;
}

describe("naturalDuration", () => {
  it("uses the whole frames of the media, 5 s for stills, and refuses empty media", () => {
    expect(naturalDuration(makeMedia("a", "video", 10_000_000), FPS)).toBe(300);
    expect(naturalDuration(makeMedia("a", "video", 10_020_000), FPS)).toBe(300);
    expect(naturalDuration(makeMedia("a", "video", 10_000), FPS)).toBe(1);
    expect(naturalDuration(makeMedia("a", "image", 0), FPS)).toBe(150);
    expect(naturalDuration(makeMedia("a", "image", 0), { num: 24, den: 1 })).toBe(120);
    expect(naturalDuration(makeMedia("a", "video", 0), FPS)).toBeNull();
  });
});

describe("planMediaInsert", () => {
  it("creates V1 and A1 in an empty project and links the video and audio clips", () => {
    const project = media(makeProject());
    const plan = planMediaInsert(project, project.media.vid!, 12, counter())!;
    expect(plan.tracks.map((t) => [t.kind, t.name])).toEqual([
      ["video", "V1"],
      ["audio", "A1"],
    ]);
    expect(plan.start).toBe(12);
    expect(plan.end).toBe(312);
    const [video, audio] = plan.clips as [MediaClip, MediaClip];
    expect(video).toMatchObject({ kind: "video", trackId: plan.tracks[0]!.id, start: 12, duration: 300, in: 0, out: 10_000_000, speed: 1, mediaId: "vid", name: "vid.mp4", enabled: true });
    expect(audio).toMatchObject({ kind: "audio", trackId: plan.tracks[1]!.id, start: 12, duration: 300, out: 10_000_000 });
    expect(video.linkGroup).toBeDefined();
    expect(audio.linkGroup).toBe(video.linkGroup);
    expect(video.transform).toMatchObject({ scale: 1, anchor: { x: 0.5, y: 0.5 } });
  });

  it("puts silent video on the video track only, audio on the audio track only, stills for 5 s", () => {
    const project = media(makeProject());
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    const silent = planMediaInsert(project, project.media.mute!, 0, counter())!;
    expect(silent.tracks).toEqual([]);
    expect(silent.clips.map((c) => [c.kind, c.trackId, c.linkGroup])).toEqual([["video", "v1", undefined]]);
    const song = planMediaInsert(project, project.media.song!, 0, counter())!;
    expect(song.clips.map((c) => [c.kind, c.trackId, c.duration, c.out])).toEqual([["audio", "a1", 75, 2_500_000]]);
    const still = planMediaInsert(project, project.media.still!, 0, counter())!;
    expect(still.clips.map((c) => [c.kind, c.trackId, c.duration, c.out])).toEqual([["image", "v1", 150, 5_000_000]]);
  });

  it("targets the lowest targeted, unlocked video track and the first such audio track", () => {
    const project = media(makeProject());
    project.tracks.push({ ...makeTrack("v1"), targeted: false }, { ...makeTrack("v2"), targeted: true }, { ...makeTrack("v3"), targeted: true }, { ...makeTrack("a1", "audio"), locked: true }, makeTrack("a2", "audio"));
    const plan = planMediaInsert(project, project.media.vid!, 0, counter())!;
    expect(plan.clips.map((c) => c.trackId)).toEqual(["v2", "a2"]);
    // No targeted track: the lowest unlocked one.
    project.tracks[1]!.targeted = false;
    project.tracks[2]!.targeted = false;
    expect(planMediaInsert(project, project.media.vid!, 0, counter())!.clips[0]!.trackId).toBe("v1");
  });

  it("never overwrites: moves to the first span free on every target track", () => {
    let project = media(makeProject());
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    project = withClips(project, [
      makeMediaClip(project, { id: "x", trackId: "v1", start: 0, duration: 100, mediaId: "vid" }),
      makeMediaClip(project, { id: "y", trackId: "v1", start: 130, duration: 20, mediaId: "vid" }),
      makeMediaClip(project, { id: "z", trackId: "a1", start: 160, duration: 40, mediaId: "vid", kind: "audio" }),
    ]);
    // A 1 s clip at frame 50: x covers that spot; the 30-frame gap 100..130 fits it exactly.
    const short = { ...makeMedia("short", "video", 1_000_000), hasAudio: false };
    expect(planMediaInsert(project, short, 50, counter())!.start).toBe(100);
    // With audio, 100..130 is free on both tracks.
    expect(planMediaInsert(project, { ...short, hasAudio: true }, 50, counter())!.start).toBe(100);
    // A 2 s clip: 100..160 hits y on v1, 150..210 hits z on a1, so it lands at 200.
    expect(planMediaInsert(project, { ...makeMedia("two", "video", 2_000_000) }, 50, counter())!.start).toBe(200);
    expect(firstFreeStart(project, ["v1"], 0, 1)).toBe(100);
    expect(firstFreeStart(project, ["v1", "a1"], 300, 10)).toBe(300);
  });

  it("refuses media without a duration", () => {
    const project = makeProject();
    expect(planMediaInsert(project, makeMedia("empty", "video", 0), 0, counter())).toBeNull();
  });
});

describe("insert at the playhead", () => {
  it("sequences three linked pairs end to end; undo removes them one pair at a time", () => {
    const project = media(makeProject());
    const session = createSessionStore();
    const store = new DocumentStore(project, { session, newId: counter("s"), validate: true });
    const newId = counter();

    const plans = ["vid", "vid", "vid"].map((id) => insert(store, session, id, newId));
    expect(plans.map((plan) => [plan.start, plan.end])).toEqual([
      [0, 300],
      [300, 600],
      [600, 900],
    ]);
    expect(session.state.getState().playhead).toBe(900);
    const state = store.getState();
    expect(state.tracks.map((t) => [t.name, t.clipIds.length])).toEqual([
      ["V1", 3],
      ["A1", 3],
    ]);
    const groups = Object.values(state.clips).map((clip) => clip.linkGroup);
    expect(new Set(groups).size).toBe(3);
    for (const plan of plans) expect(plan.clips[0]!.linkGroup).toBe(plan.clips[1]!.linkGroup);

    expect(store.undo()).toBe(true);
    expect(Object.keys(store.getState().clips)).toHaveLength(4);
    expect(store.undo()).toBe(true);
    expect(Object.keys(store.getState().clips)).toHaveLength(2);
    expect(store.getState().tracks).toHaveLength(2);
    // The first step also created the tracks: undoing it removes them too.
    expect(store.undo()).toBe(true);
    expect(store.getState().clips).toEqual({});
    expect(store.getState().tracks).toEqual([]);
    expect(store.undo()).toBe(false);
  });

  it("mixes images and video at the playhead, each starting where the last ended", () => {
    const project = media(makeProject());
    const session = createSessionStore();
    const store = new DocumentStore(project, { session, validate: true });
    setPlayhead(session, 30);
    insert(store, session, "still", counter("a"));
    insert(store, session, "song", counter("b"));
    const plan = insert(store, session, "vid", counter("c"));
    // The still sits on V1 at 30..180; the song on A1 at 180..255; the video needs both tracks free from 255.
    expect(plan.start).toBe(255);
    expect(session.state.getState().playhead).toBe(555);
    expect(Object.values(store.getState().clips).map((c) => [c.kind, c.start, c.duration]).sort()).toEqual([
      ["audio", 180, 75],
      ["audio", 255, 300],
      ["image", 30, 150],
      ["video", 255, 300],
    ]);
    expect(frameToUs(150, FPS)).toBe(5_000_000);
  });
});
