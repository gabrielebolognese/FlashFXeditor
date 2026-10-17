import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import type { FrameRange } from "../model/inOut.js";
import { closeSilences, cutSilences, REMOVE_SILENCE_LABEL, silencePlan, silenceTargets, sourceRange, spanFrames } from "./silence.js";

const FPS = { num: 30, den: 1 };

function track(id: string, kind: Track["kind"] = "video", fields: Partial<Track> = {}): Track {
  return { ...makeTrack(id, kind), ...fields };
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

const TRACKS = () => [track("v1"), track("v2"), track("a1", "audio"), track("a2", "audio")];

function setup(doc: Project) {
  const store = new DocumentStore(doc, { session: createSessionStore(), validate: true });
  let n = 0;
  const newId = () => `new${++n}`;
  /** `start-end` of each clip of a track (plus its link group with `links`). */
  const layout = (trackId: string, links = false) => {
    const project = store.getState();
    return (project.tracks.find((t) => t.id === trackId)?.clipIds ?? []).map((id) => {
      const clip = project.clips[id] as Clip;
      return `${clip.start}-${clip.start + clip.duration}${links ? ` ${clip.linkGroup ?? "-"}` : ""}`;
    });
  };
  /** Remove silence as the controller runs it: the cut, then the close on the cut document, one transaction. */
  const apply = (ranges: Record<string, readonly FrameRange[]>, ids: string[]) => {
    const project = store.getState();
    const targets = silenceTargets(project, ids);
    const plan = silencePlan(project, targets, (id) => ranges[id] ?? null);
    return store.transaction(REMOVE_SILENCE_LABEL, () => {
      const cut = cutSilences(store.getState(), plan.groups, newId);
      if (cut.command) store.dispatch(cut.command);
      const close = closeSilences(store.getState(), cut.gaps);
      if (close.command) store.dispatch(close.command);
      return { plan, cut, close };
    });
  };
  return { store, layout, apply, undoLabel: () => store.history.getState().undoLabel };
}

describe("spanFrames", () => {
  const doc = makeProject();
  it("rounds a span inward to whole frames of the clip on the timeline", () => {
    const clip = media(doc, "a", "a1", 10, 90, "audio");
    // 1.12 s is frame 33.6 of the clip (44 on the timeline), 1.9 s frame 57 (67).
    expect(spanFrames(clip, [1_120_000, 1_900_000], FPS)).toEqual([{ start: 44, end: 67 }]);
    // At the clip's ends a span reaches its edge exactly; shorter than a frame: nothing.
    expect(spanFrames(clip, [0, 700_000, 2_920_000, clip.out], FPS)).toEqual([
      { start: 10, end: 31 },
      { start: 98, end: 100 },
    ]);
    expect(spanFrames(clip, [1_000_000, 1_020_000], FPS)).toEqual([]);
  });

  it("follows the clip's in point and speed", () => {
    const clip = media(doc, "a", "a1", 0, 30, "audio", { in: 1_000_000, out: 3_000_000, speed: 2 });
    expect(sourceRange(clip)).toEqual({ fromUs: 1_000_000, toUs: 3_000_000, speed: 2 });
    // A clip frame is 66.7 ms of media at 2x.
    expect(spanFrames(clip, [2_000_000, 2_500_000], FPS)).toEqual([{ start: 15, end: 22 }]);
    expect(spanFrames({ ...clip, speed: 0 }, [2_000_000, 2_500_000], FPS)).toEqual([]);
  });
});

describe("silenceTargets", () => {
  it("takes the audio of the selection and leaves out groups with a locked member", () => {
    const doc = build([track("v1"), track("v2", "video", { locked: true }), track("a1", "audio"), track("a2", "audio")], (d) => [
      media(d, "v", "v1", 0, 90, "video", { linkGroup: "L" }),
      media(d, "a", "a1", 0, 90, "audio", { linkGroup: "L" }),
      media(d, "w", "v2", 100, 90, "video", { linkGroup: "M" }),
      media(d, "b", "a2", 100, 90, "audio", { linkGroup: "M" }),
      makeSolidClip({ id: "s", trackId: "v1", start: 200, duration: 30 }),
    ]);
    // A selected video stands for its linked audio.
    expect(silenceTargets(doc, ["v"])).toEqual(["a"]);
    // b's video is on a locked track: cutting only the audio would break sync.
    expect(silenceTargets(doc, ["a", "b", "s"])).toEqual(["a"]);
  });
});

describe("silencePlan", () => {
  it("gives a link group one set of ranges, where every analysed member is silent, cut from every member", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "v", "v1", 0, 120, "video", { linkGroup: "L" }),
      media(d, "a", "a1", 0, 120, "audio", { linkGroup: "L" }),
      media(d, "b", "a2", 0, 120, "audio", { linkGroup: "L" }),
    ]);
    const plan = silencePlan(doc, ["a", "b"], (id) =>
      id === "a"
        ? [
            { start: 10, end: 30 },
            { start: 50, end: 70 },
          ]
        : [{ start: 20, end: 60 }],
    );
    expect(plan.groups).toEqual([
      {
        members: ["v", "a", "b"],
        ranges: [
          { start: 20, end: 30 },
          { start: 50, end: 60 },
        ],
      },
    ]);
    expect(plan.count).toBe(2);
    expect(plan.frames).toBe(20);
    expect(plan.segments.map((s) => `${s.trackId} ${s.start}-${s.end}`)).toEqual(["v1 20-30", "v1 50-60", "a1 20-30", "a1 50-60", "a2 20-30", "a2 50-60"]);
  });

  it("waits for every target's analysis, and cuts only where all members are (J and L cuts)", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "v", "v1", 30, 120, "video", { linkGroup: "L" }),
      media(d, "a", "a1", 0, 150, "audio", { linkGroup: "L" }),
      media(d, "c", "a2", 200, 60, "audio"),
    ]);
    const ranges: Record<string, FrameRange[] | null> = {
      a: [
        { start: 0, end: 20 },
        { start: 60, end: 80 },
        { start: 140, end: 150 },
      ],
      c: null,
    };
    const plan = silencePlan(doc, ["a", "c"], (id) => ranges[id] ?? null);
    // The audio's lead-in before the video and its tail after it stay; c is still being analysed.
    expect(plan.groups).toEqual([
      {
        members: ["v", "a"],
        ranges: [
          { start: 60, end: 80 },
          { start: 140, end: 150 },
        ],
      },
    ]);
    expect(silencePlan(doc, ["a"], () => []).groups).toEqual([]);
  });
});

describe("Remove silence (cut + close)", () => {
  it("cuts the pauses out of a linked pair and closes them with the ripple, in one undo step", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "v", "v1", 0, 150, "video", { linkGroup: "L" }),
      media(d, "a", "a1", 0, 150, "audio", { linkGroup: "L" }),
      media(d, "v2", "v1", 150, 60, "video", { linkGroup: "L2", in: frameToUs(150, FPS), out: frameToUs(210, FPS) }),
      media(d, "a2", "a1", 150, 60, "audio", { linkGroup: "L2", in: frameToUs(150, FPS), out: frameToUs(210, FPS) }),
      makeSolidClip({ id: "t", trackId: "v2", start: 180, duration: 60 }),
      media(d, "music", "a2", 0, 300, "audio"),
    ]);
    const t = setup(doc);
    const before = t.store.getState();
    const { plan, cut, close } = t.apply(
      {
        a: [
          { start: 30, end: 60 },
          { start: 100, end: 120 },
        ],
      },
      ["v"],
    );
    expect(plan.count).toBe(2);
    expect(plan.frames).toBe(50);
    expect(close.limit).toBeNull();
    // Video and audio lose the same frames and stay in sync; what follows moves left by 50.
    expect(t.layout("v1")).toEqual(["0-30", "30-70", "70-100", "100-160"]);
    expect(t.layout("a1")).toEqual(["0-30", "30-70", "70-100", "100-160"]);
    // The title on V2 follows the ripple; the music spanning the cuts stays.
    expect(t.layout("v2")).toEqual(["130-190"]);
    expect(t.layout("a2")).toEqual(["0-300"]);
    // Each piece plays its own part of the source.
    const after = t.store.getState();
    const [, middle, last] = cut.pieces.get("a") ?? [];
    expect(cut.pieces.get("a")?.[0]).toBe("a");
    expect((after.clips[middle as string] as MediaClip).in).toBe(frameToUs(60, FPS));
    expect((after.clips[last as string] as MediaClip).in).toBe(frameToUs(120, FPS));
    expect((after.clips[last as string] as MediaClip).out).toBe(frameToUs(150, FPS));
    // The pieces between the same cuts are linked to each other (the first keeps the group).
    const links = t.layout("v1", true).map((entry) => entry.split(" ")[1]);
    expect(t.layout("a1", true).map((entry) => entry.split(" ")[1])).toEqual(links);
    expect(links[0]).toBe("L");
    expect(new Set(links).size).toBe(4);
    expect(t.undoLabel()).toBe(REMOVE_SILENCE_LABEL);
    // Undo restores the original single clip.
    t.store.undo();
    expect(t.store.getState()).toStrictEqual(before);
  });

  it("removes a leading and a trailing silence up to the clip's edges, and a silent clip whole", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "c", "a1", 0, 90, "audio"),
      media(d, "d", "a1", 90, 60, "audio", { in: frameToUs(90, FPS), out: frameToUs(150, FPS) }),
      media(d, "e", "a1", 150, 30, "audio", { in: frameToUs(150, FPS), out: frameToUs(180, FPS) }),
    ]);
    const t = setup(doc);
    const { cut } = t.apply(
      {
        c: [
          { start: 0, end: 20 },
          { start: 70, end: 90 },
        ],
        d: [{ start: 90, end: 150 }],
      },
      ["c", "d", "e"],
    );
    expect(t.layout("a1")).toEqual(["0-50", "50-80"]);
    expect(cut.pieces.get("c")).toEqual(["c"]);
    expect(cut.pieces.get("d")).toEqual([]);
    const c = t.store.getState().clips.c as MediaClip;
    expect([c.in, c.out]).toEqual([frameToUs(20, FPS), frameToUs(70, FPS)]);
  });

  it("keeps fades on the outer pieces and partitions volume keys (sliceKeyframes)", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "a", "a1", 0, 90, "audio", {
        fades: { in: 10, out: 10 },
        keyframes: {
          "volume.gainDb": [
            { frame: 0, value: 0, ease: "linear" },
            { frame: 60, value: -12, ease: "linear" },
          ],
        },
      }),
    ]);
    const t = setup(doc);
    const { cut } = t.apply({ a: [{ start: 20, end: 40 }] }, ["a"]);
    const [left, right] = (cut.pieces.get("a") ?? []).map((id) => t.store.getState().clips[id] as MediaClip);
    expect(left?.fades).toEqual({ in: 10, out: 0 });
    expect(right?.fades).toEqual({ in: 0, out: 10 });
    expect(right?.start).toBe(20);
    // The right piece starts at the level the key curve had at frame 40 (-8 dB) and keeps the key at 60.
    expect(right?.keyframes?.["volume.gainDb"]).toEqual([
      { frame: 0, value: -8, ease: "linear" },
      { frame: 20, value: -12, ease: "linear" },
    ]);
  });

  it("keeps a transition at the clip's outer edge and drops none it does not cut through", () => {
    const transition = { id: "x1", kind: "crossDissolve" as const, before: 5, after: 5 };
    const doc = build(TRACKS(), (d) => [
      media(d, "a", "a1", 0, 90, "audio", { transitionOut: transition }),
      media(d, "b", "a1", 90, 60, "audio", { in: frameToUs(90, FPS), out: frameToUs(150, FPS), transitionIn: transition }),
    ]);
    const t = setup(doc);
    const { cut } = t.apply({ a: [{ start: 30, end: 50 }] }, ["a"]);
    const project = t.store.getState();
    const [left, right] = (cut.pieces.get("a") ?? []).map((id) => project.clips[id] as MediaClip);
    expect(t.layout("a1")).toEqual(["0-30", "30-70", "70-130"]);
    expect(left?.transitionOut).toBeUndefined();
    expect(right?.transitionOut).toEqual(transition);
    expect((project.clips.b as MediaClip).transitionIn).toEqual(transition);
  });

  it("keeps a J cut in sync: only the frames both clips cover are cut", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "v", "v1", 30, 120, "video", { linkGroup: "L", in: frameToUs(30, FPS), out: frameToUs(150, FPS) }),
      media(d, "a", "a1", 0, 150, "audio", { linkGroup: "L" }),
    ]);
    const t = setup(doc);
    t.apply(
      {
        a: [
          { start: 10, end: 20 },
          { start: 60, end: 80 },
        ],
      },
      ["a"],
    );
    expect(t.layout("v1", true)).toEqual(["30-60 L", "60-130 new3"]);
    expect(t.layout("a1", true)).toEqual(["0-60 L", "60-130 new3"]);
  });

  it("reports a ripple a passive clip stops short", () => {
    const doc = build(TRACKS(), (d) => [
      media(d, "a", "a1", 0, 100, "audio"),
      media(d, "b", "a1", 100, 50, "audio", { in: frameToUs(100, FPS), out: frameToUs(150, FPS) }),
      // On V1, x spans the cut and y follows it right away: y cannot move left.
      makeSolidClip({ id: "x", trackId: "v1", start: 0, duration: 80 }),
      makeSolidClip({ id: "y", trackId: "v1", start: 80, duration: 40 }),
    ]);
    const t = setup(doc);
    const { close } = t.apply({ a: [{ start: 40, end: 60 }] }, ["a"]);
    expect(close.limit).toEqual({ trackId: "v1", clipId: "y" });
    expect(t.layout("v1")).toEqual(["0-80", "80-120"]);
    // The gap stays open: nothing moved.
    expect(t.layout("a1")).toEqual(["0-40", "60-100", "100-150"]);
  });
});
