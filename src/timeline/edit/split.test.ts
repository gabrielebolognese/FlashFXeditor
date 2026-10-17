import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { animatedOpacity, animatedTransform } from "../../core/document/keyframes.js";
import { framesToSourceUs, frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { EMPTY_SELECTION, selectClips } from "../../core/store/selection.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { clipsToSplit, selectionAfterSplit, splitClips, splitsAt, type SplitResult } from "./split.js";

const fps = makeProject().settings.fps;

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, ...extra };
}

const TRACKS = () => [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];

function project(clips: Clip[], tracks: Track[] = TRACKS(), untargeted: readonly string[] = []): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(...tracks.map((track) => ({ ...track, targeted: !untargeted.includes(track.id) })));
  return withClips(p, clips);
}

function ids(): () => string {
  let n = 0;
  return () => `n${++n}`;
}

function commit(p: Project, result: SplitResult | null): { doc: DocumentStore; next: Project } {
  if (!result) throw new Error("expected a split");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  expect(doc.history.getState().undoLabel).toBe(result.command.label);
  return { doc, next: doc.getState() };
}

describe("splitClips", () => {
  it("cuts a clip in two with the same properties; the left piece keeps the id; one undo step restores one clip", () => {
    const original = clip("a", "v1", 10, 100, { opacity: 0.5, name: "Shot", color: "teal", volume: { gainDb: -6, muted: false } });
    const p = project([original, clip("b", "v1", 110, 20)]);
    const result = splitClips(p, ["a"], 40, ids());
    expect(result?.command.label).toBe("Split clip");
    expect([...(result?.pieces ?? [])]).toEqual([["a", "n1"]]);
    const { doc, next } = commit(p, result);
    const left = next.clips.a as MediaClip;
    const right = next.clips.n1 as MediaClip;
    expect([left.start, left.duration, right.start, right.duration]).toEqual([10, 30, 40, 70]);
    expect([left.in, left.out]).toEqual([0, frameToUs(30, fps)]);
    expect([right.in, right.out]).toEqual([frameToUs(30, fps), original.out]);
    for (const piece of [left, right]) {
      expect(piece.opacity).toBe(0.5);
      expect(piece.name).toBe("Shot");
      expect(piece.color).toBe("teal");
      expect(piece.volume).toEqual({ gainDb: -6, muted: false });
      expect(piece.transform).toEqual(original.transform);
    }
    expect(next.tracks[0]?.clipIds).toEqual(["a", "n1", "b"]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
    expect(Object.keys(doc.getState().clips).sort()).toEqual(["a", "b"]);
  });

  it("splits nothing on a clip's start or end, outside it, or on a locked track (spec §6.19)", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }];
    const p = project([clip("a", "v1", 10, 100), clip("l", "v2", 0, 200)], tracks);
    expect(splitClips(p, ["a"], 10, ids())).toBeNull();
    expect(splitClips(p, ["a"], 110, ids())).toBeNull();
    expect(splitClips(p, ["a"], 300, ids())).toBeNull();
    expect(splitClips(p, ["l"], 50, ids())).toBeNull();
    expect(splitClips(p, ["missing"], 50, ids())).toBeNull();
    expect(splitsAt(p.clips.a as Clip, 11)).toBe(true);
  });

  it("moves the source at the clip's speed", () => {
    const p = project([clip("a", "v1", 0, 100, { speed: 2, in: 0, out: framesToSourceUs(100, 2, fps) })]);
    const { next } = commit(p, splitClips(p, ["a"], 25, ids()));
    expect((next.clips.n1 as MediaClip).in).toBe(framesToSourceUs(25, 2, fps));
    expect((next.clips.a as MediaClip).out).toBe(framesToSourceUs(25, 2, fps));
    expect((next.clips.n1 as MediaClip).speed).toBe(2);
  });

  it("keeps a keyed clip's motion on both halves (eased keys too); undo merges them back (Batch 35)", () => {
    const keyframes = {
      "transform.x": [
        { frame: 0, value: 0, ease: "easeInOut" as const },
        { frame: 60, value: 600, ease: "hold" as const },
        { frame: 80, value: 100, ease: "linear" as const },
      ],
      opacity: [{ frame: 10, value: 1, ease: "linear" as const }, { frame: 90, value: 0, ease: "linear" as const }],
    };
    const p = project([clip("a", "v1", 0, 100, { keyframes })]);
    for (const cut of [25, 70]) {
      const { doc, next } = commit(p, splitClips(p, ["a"], cut, ids()));
      const left = next.clips.a as MediaClip;
      const right = next.clips.n1 as MediaClip;
      for (let f = 0; f < 100; f++) {
        const piece = f < cut ? left : right;
        expect(animatedTransform(piece, f - piece.start).x).toBeCloseTo(animatedTransform({ transform: left.transform, keyframes }, f).x, 9);
        expect(animatedOpacity(piece, f - piece.start)).toBeCloseTo(animatedOpacity({ opacity: 1, keyframes }, f), 9);
      }
      doc.undo();
      expect(doc.getState()).toEqual(p);
    }
  });

  it("partitions keyframes (the motion kept) and fades, and drops the transitions at the cut", () => {
    const p = project([
      clip("a", "v1", 0, 100, {
        keyframes: { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 20, value: 1, ease: "linear" }, { frame: 80, value: 0.5, ease: "linear" }] },
        fades: { in: 10, out: 15 },
        transitionIn: { kind: "dissolve" },
        transitionOut: { kind: "dissolve" },
      }),
    ]);
    const { next } = commit(p, splitClips(p, ["a"], 50, ids()));
    const left = next.clips.a as MediaClip;
    const right = next.clips.n1 as MediaClip;
    // A key at each new edge with the value there (the segment 20 -> 80 is linear).
    expect(left.keyframes?.opacity?.map((key) => [key.frame, key.value])).toEqual([
      [0, 0],
      [20, 1],
      [49, 1 - (0.5 * 29) / 60],
    ]);
    expect(right.keyframes?.opacity?.map((key) => [key.frame, key.value])).toEqual([
      [0, 0.75],
      [30, 0.5],
    ]);
    expect(left.fades).toEqual({ in: 10, out: 0 });
    expect(right.fades).toEqual({ in: 0, out: 15 });
    expect(left.transitionIn).toEqual({ kind: "dissolve" });
    expect(left.transitionOut).toBeUndefined();
    expect(right.transitionIn).toBeUndefined();
    expect(right.transitionOut).toEqual({ kind: "dissolve" });
  });

  it("splits linked clips together: the right pieces form a new link, the left pieces keep theirs", () => {
    const p = project([clip("v", "v1", 0, 100, { linkGroup: "L" }), clip("a", "a1", 0, 100, { linkGroup: "L" })]);
    const toSplit = clipsToSplit(p, 40, { kind: "clips", clipIds: ["v"] }, { linked: true });
    expect(toSplit).toEqual(["v", "a"]);
    const { next } = commit(p, splitClips(p, toSplit, 40, ids()));
    expect(next.clips.v?.linkGroup).toBe("L");
    expect(next.clips.a?.linkGroup).toBe("L");
    expect(next.clips.n1?.linkGroup).toBe("n3");
    expect(next.clips.n2?.linkGroup).toBe("n3");
  });

  it("with Linked selection off splits one side: its right piece is unlinked", () => {
    const p = project([clip("v", "v1", 0, 100, { linkGroup: "L" }), clip("a", "a1", 0, 100, { linkGroup: "L" })]);
    const toSplit = clipsToSplit(p, 40, { kind: "clips", clipIds: ["v"] }, { linked: false });
    expect(toSplit).toEqual(["v"]);
    const { next } = commit(p, splitClips(p, toSplit, 40, ids()));
    expect(next.clips.v?.linkGroup).toBe("L");
    expect(next.clips.n1?.linkGroup).toBeUndefined();
    expect(next.clips.a?.duration).toBe(100);
  });
});

describe("clipsToSplit (spec §6.11)", () => {
  const p = () =>
    project(
      [clip("x", "v1", 0, 100), clip("y", "v2", 20, 100), clip("z", "v3", 0, 100), clip("w", "a1", 60, 100)],
      [makeTrack("v1"), makeTrack("v2"), { ...makeTrack("v3"), locked: true }, makeTrack("a1", "audio")],
      ["v2"],
    );

  it("with nothing selected: every clip under the frame on targeted unlocked tracks", () => {
    expect(clipsToSplit(p(), 50, { kind: "targeted" })).toEqual(["x"]);
    expect(clipsToSplit(p(), 70, { kind: "targeted" })).toEqual(["x", "w"]);
  });

  it("all tracks: every unlocked track regardless of targeting", () => {
    expect(clipsToSplit(p(), 70, { kind: "all" })).toEqual(["x", "y", "w"]);
  });

  it("the selection: only the selected clips under the frame", () => {
    expect(clipsToSplit(p(), 50, { kind: "clips", clipIds: ["y", "w", "z"] })).toEqual(["y"]);
  });
});

describe("selectionAfterSplit", () => {
  it("keeps both pieces of selected clips selected, the primary on the right piece", () => {
    const pieces = new Map([
      ["a", "a2"],
      ["b", "b2"],
      ["p", "p2"],
    ]);
    const after = selectionAfterSplit(selectClips(["a", "b", "c"], "a"), pieces);
    expect([...after.clipIds].sort()).toEqual(["a", "a2", "b", "b2", "c"]);
    expect(after.primary).toBe("a2");
    // A partner split only because it is linked stays unselected; an unsplit primary stays.
    expect(after.clipIds.has("p2")).toBe(false);
    expect(selectionAfterSplit(selectClips(["c"]), pieces).primary).toBe("c");
    expect(selectionAfterSplit(EMPTY_SELECTION, pieces)).toBe(EMPTY_SELECTION);
  });
});
