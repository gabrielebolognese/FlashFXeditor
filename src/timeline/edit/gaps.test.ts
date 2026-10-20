import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { closeGap, closeGaps, compactGaps, gapAtPlayhead, type CloseResult } from "./gaps.js";

function clip(id: string, trackId: string, start: number, duration: number): MediaClip {
  return makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
}

const TRACKS = () => [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];

/** Every track targeted except `untargeted`. */
function project(clips: Clip[], tracks: Track[] = TRACKS(), untargeted: readonly string[] = []): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(...tracks.map((track) => ({ ...track, targeted: !untargeted.includes(track.id) })));
  return withClips(p, clips);
}

/** Dispatches through a validating store; returns the store (undo checks) and the new document. */
function commit(p: Project, result: CloseResult): { doc: DocumentStore; next: Project } {
  if (!result.command) throw new Error("expected a command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  expect(doc.history.getState().undoLabel).toBe(result.command.label);
  return { doc, next: doc.getState() };
}

const starts = (p: Project, ...ids: string[]) => ids.map((id) => p.clips[id]?.start);

describe("closeGap (spec §6.11, ripple semantics)", () => {
  it("moves the clips after the gap, and the other unlocked tracks with them; one undo step", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("x", "a1", 0, 100), clip("y", "a1", 150, 100), clip("t", "v2", 300, 20)]);
    const result = closeGap(p, { trackId: "v1", start: 100, end: 150 });
    expect(result.closed).toEqual([50]);
    expect(result.limit).toBeNull();
    const { doc, next } = commit(p, result);
    expect(starts(next, "a", "b", "x", "y", "t")).toEqual([0, 100, 0, 100, 250]);
    expect(doc.history.getState().undoLabel).toBe("Close gap");
    doc.undo();
    expect(starts(doc.getState(), "b", "y", "t")).toEqual([150, 150, 300]);
  });

  it("is limited by a clip on another track that would collide, and reports it", () => {
    // a2: a bed spanning the gap's end, then a clip 30 frames after it.
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("m", "a2", 0, 200), clip("n", "a2", 230, 70)]);
    const result = closeGap(p, { trackId: "v1", start: 100, end: 150 });
    expect(result.closed).toEqual([30]);
    expect(result.limit).toEqual({ trackId: "a2", clipId: "n" });
    const { next } = commit(p, result);
    expect(starts(next, "b", "m", "n")).toEqual([120, 0, 200]);
    // No room at all: nothing changes.
    const stuck = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("m", "a2", 0, 200), clip("n", "a2", 200, 70)]);
    const none = closeGap(stuck, { trackId: "v1", start: 100, end: 150 });
    expect(none.command).toBeNull();
    expect(none.closed).toEqual([0]);
    expect(none.limit).toEqual({ trackId: "a2", clipId: "n" });
  });

  it("leaves clips spanning the edit point alone when nothing follows them (a music bed)", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("bed", "a2", 0, 1000)]);
    const { next } = commit(p, closeGap(p, { trackId: "v1", start: 100, end: 150 }));
    expect(starts(next, "b", "bed")).toEqual([100, 0]);
  });

  it("never moves locked tracks, and they never limit (spec §6.19)", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a2", "audio"), locked: true }];
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("m", "a2", 0, 200), clip("n", "a2", 200, 70)], tracks);
    const result = closeGap(p, { trackId: "v1", start: 100, end: 150 });
    expect(result.limit).toBeNull();
    const { next } = commit(p, result);
    expect(starts(next, "b", "m", "n")).toEqual([100, 0, 200]);
    // A gap on a locked track does not close.
    expect(closeGap(p, { trackId: "a2", start: 0, end: 0 }).command).toBeNull();
  });

  it("closes the leading gap from frame 0", () => {
    const p = project([clip("a", "v1", 40, 60)]);
    const { next } = commit(p, closeGap(p, { trackId: "v1", start: 0, end: 40 }));
    expect(starts(next, "a")).toEqual([0]);
  });

  it("does nothing for a gap that no longer exists (the document changed)", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100)]);
    expect(closeGap(p, { trackId: "v1", start: 100, end: 160 }).command).toBeNull();
    expect(closeGap(p, { trackId: "v1", start: 90, end: 150 }).command).toBeNull();
    expect(closeGap(p, { trackId: "nope", start: 100, end: 150 }).command).toBeNull();
  });
});

describe("closeGaps with gaps on several tracks", () => {
  it("closes each track's gap by its own length; other tracks follow the longest of overlapping gaps", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 200, 50), clip("c", "v2", 0, 100), clip("d", "v2", 150, 50), clip("t", "a1", 220, 10)]);
    const result = closeGaps(p, [
      { trackId: "v1", start: 100, end: 200 },
      { trackId: "v2", start: 100, end: 150 },
    ]);
    expect(result.closed).toEqual([100, 50]);
    const { next } = commit(p, result);
    expect(starts(next, "b", "d", "t")).toEqual([100, 100, 120]);
  });

  it("gaps apart in time: other tracks follow the most any one track closed before them, never the sum", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 120, 300), clip("c", "v2", 0, 300), clip("d", "v2", 330, 50), clip("t", "a1", 150, 10), clip("u", "a1", 400, 10)]);
    const result = closeGaps(p, [
      { trackId: "v1", start: 100, end: 120 },
      { trackId: "v2", start: 300, end: 330 },
    ]);
    const { next } = commit(p, result);
    // v1 and v2 close their own gaps only; a1 follows v1's 20 after its gap, v2's 30 after both.
    expect(starts(next, "b", "d", "t", "u")).toEqual([100, 300, 130, 370]);
  });

  it("keeps a clip after gaps apart in time in sync with the content beside it", () => {
    // v1 and v2 each close 100 (at 100 and at 300); k on a2 started where e and j ended.
    const p = project([
      ...["a", "b", "c", "d", "e"].map((id, i) => clip(id, "v1", i * 100, 100)),
      ...["f", "g", "h", "i", "j"].map((id, i) => clip(id, "v2", i * 100, 100)),
      clip("k", "a2", 500, 100),
    ]);
    const result = closeGaps(
      p,
      [
        { trackId: "v1", start: 100, end: 200 },
        { trackId: "v2", start: 300, end: 400 },
      ],
      { removed: new Set(["b", "i"]) },
    );
    expect(result.closed).toEqual([100, 100]);
    expect(result.limit).toBeNull();
    const { next } = commit(p, result);
    expect(starts(next, "c", "e", "j", "k")).toEqual([100, 300, 300, 400]);
  });

  it("checks collisions against what the clip really moves, not the sum of the gaps", () => {
    // z spans v1's gap end with 160 free frames before k: moving k by 100 fits.
    const layout = (extra: Clip[]) =>
      project([...["a", "b", "c", "d", "e"].map((id, i) => clip(id, "v1", i * 100, 100)), ...["f", "g", "h", "i", "j"].map((id, i) => clip(id, "v2", i * 100, 100)), ...extra]);
    const gaps = [
      { trackId: "v1", start: 100, end: 200 },
      { trackId: "v2", start: 300, end: 400 },
    ];
    const p = layout([clip("z", "a2", 150, 140), clip("k", "a2", 450, 100)]);
    const result = closeGaps(p, gaps, { removed: new Set(["b", "i"]) });
    expect(result.closed).toEqual([100, 100]);
    expect(result.limit).toBeNull();
    expect(starts(commit(p, result).next, "z", "k", "e", "j")).toEqual([150, 350, 300, 300]);
    // k between the gaps with 50 free frames after z: v1 closes 50 and k stops at z's end; v2's gap,
    // with nothing after it on a2, closes fully.
    const q = layout([clip("z", "a2", 150, 140), clip("k", "a2", 340, 50)]);
    const limited = closeGaps(q, gaps, { removed: new Set(["b", "i"]) });
    expect(limited.closed).toEqual([50, 100]);
    expect(limited.limit).toEqual({ trackId: "a2", clipId: "k" });
    expect(starts(commit(q, limited).next, "c", "e", "j", "k")).toEqual([150, 350, 300, 290]);
  });
});

describe("compactGaps (spec §6.11 Close all gaps)", () => {
  it("packs every targeted track from frame 0 in one command; untargeted tracks follow and limit", () => {
    const p = project(
      [clip("a", "v1", 10, 40), clip("b", "v1", 80, 20), clip("c", "v1", 130, 70), clip("x", "a1", 0, 40), clip("y", "a1", 60, 40), clip("t", "v2", 90, 20), clip("u", "v2", 250, 10)],
      TRACKS(),
      ["v2"],
    );
    const result = compactGaps(p);
    expect(result.limit).toBeNull();
    const { doc, next } = commit(p, result);
    expect(doc.history.getState().undoLabel).toBe("Close all gaps");
    expect(starts(next, "a", "b", "c")).toEqual([0, 40, 60]);
    expect(starts(next, "x", "y")).toEqual([0, 40]);
    // v2 (untargeted) moves with the ripple: 40 frames before t, 70 before u.
    expect(starts(next, "t", "u")).toEqual([50, 180]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("moves an untargeted track by the most any one track closed before it, never the sum", () => {
    // v1 closes 100 at 100, v2 100 at 300; b2 and d2 both end at 600, where e starts.
    const p = project(
      [clip("a", "v1", 0, 100), clip("b", "v1", 200, 100), clip("b2", "v1", 300, 300), clip("c", "v2", 0, 300), clip("d", "v2", 400, 100), clip("d2", "v2", 500, 100), clip("e", "a2", 600, 100)],
      TRACKS(),
      ["a2"],
    );
    const result = compactGaps(p);
    expect(result.limit).toBeNull();
    const { next } = commit(p, result);
    expect(starts(next, "b", "b2", "d", "d2", "e")).toEqual([100, 200, 300, 400, 500]);
  });

  it("compacts the given tracks only; nothing to do gives no command", () => {
    const p = project([clip("a", "v1", 10, 40), clip("x", "a1", 20, 40)]);
    const { next } = commit(p, compactGaps(p, ["a1"], { label: "Close all gaps on track" }));
    expect(starts(next, "a", "x")).toEqual([10, 0]);
    expect(compactGaps(next, ["a1"]).command).toBeNull();
    // Locked tracks are skipped.
    const locked = project([clip("a", "v1", 10, 40)], [{ ...makeTrack("v1"), locked: true }]);
    expect(compactGaps(locked).command).toBeNull();
  });
});

describe("gapAtPlayhead (G with no gap selected)", () => {
  const p = (untargeted: string[] = []) =>
    project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 100), clip("c", "v2", 0, 300), clip("x", "a1", 0, 120), clip("y", "a1", 200, 100)], TRACKS(), untargeted);

  it("takes the gap under the playhead, or right after the clip under it, the one ending first", () => {
    expect(gapAtPlayhead(p(), 50)).toEqual({ trackId: "v1", start: 100, end: 150 });
    expect(gapAtPlayhead(p(), 130)).toEqual({ trackId: "v1", start: 100, end: 150 });
    expect(gapAtPlayhead(p(), 160)).toEqual({ trackId: "a1", start: 120, end: 200 });
    expect(gapAtPlayhead(p(), 400)).toBeNull();
  });

  it("looks at targeted tracks only", () => {
    expect(gapAtPlayhead(p(["v1"]), 50)).toEqual({ trackId: "a1", start: 120, end: 200 });
  });
});
