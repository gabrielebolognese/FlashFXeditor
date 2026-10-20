// Locked tracks across every edit (spec §6.12: no edits, no selection; §6.19 ripple with locked tracks).
// Acceptance (Batch 16): lock V2: nothing on it can be selected, moved, trimmed or split; ripples skip
// it. Clips never change tracks in a ripple, so a locked clip can only meet moving content when a move,
// a nudge, Alt+Up/Down or an insert drop targets its track: each of those is refused.
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { isClipLocked, selectableClipIds, selectionPartners } from "../model/queries.js";
import { deleteClips, deletionSet, rippleDelete } from "./delete.js";
import { closeGap, compactGaps, gapAtPlayhead } from "./gaps.js";
import { groupClips, moveIntoSync, toggleLink } from "./links.js";
import { applyMoveRequest, moveToAdjacentLane, nudgeClips, type MoveRequest } from "./move.js";
import { clipsToSplit, splitClips } from "./split.js";
import { deleteTracks } from "./tracks.js";
import { extendToPlayhead, rateStretch, rollEdit, slide, slip, trimEdge, trimToPlayhead } from "./trim.js";

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  // 50 frames of head so in trims, slips and slides have room.
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, in: 50 * 33_333, out: base.out + 50 * 33_333, ...extra };
}

/**
 * V1: a 0..100, b 100..200, c 300..400. V2 (locked): l 50..150 (linked to la on A1, grouped with b),
 * m 250..350. V3: t 120..140. A1: la 50..150, s 160..200.
 */
function project(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(
    ...[makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("v3"), makeTrack("a1", "audio")].map((track) => ({ ...track, targeted: true })),
  );
  const clips: Clip[] = [
    clip("a", "v1", 0, 100),
    clip("b", "v1", 100, 100, { group: "G" }),
    clip("c", "v1", 300, 100),
    clip("l", "v2", 50, 100, { linkGroup: "L", group: "G" }),
    clip("m", "v2", 250, 100),
    clip("t", "v3", 120, 20),
    clip("la", "a1", 50, 100, { linkGroup: "L" }),
    clip("s", "a1", 160, 40),
  ];
  return withClips(p, clips);
}

function apply(p: Project, command: { run: unknown } | null | undefined): Project {
  if (!command) throw new Error("no command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(command as Parameters<DocumentStore["dispatch"]>[0]);
  return doc.getState();
}

let ids = 0;
const newId = () => `n${++ids}`;
const v2 = (p: Project) => ({ l: p.clips.l, m: p.clips.m, ids: p.tracks[1]?.clipIds });

describe("locked track V2 (spec §6.12)", () => {
  it("is never selected: select all, linked partners and groups leave its clips out", () => {
    const p = project();
    expect(isClipLocked(p, "l")).toBe(true);
    expect(selectableClipIds(p)).toEqual(["a", "b", "c", "t", "la", "s"]);
    expect(selectionPartners(p, "la", true)).toEqual([]);
    expect(selectionPartners(p, "b", true)).toEqual([]);
  });

  it("is never moved: drags off or onto it, nudges and Alt+Up/Down are refused", () => {
    const p = project();
    const move = (request: Partial<MoveRequest>) => applyMoveRequest(p, { clipIds: ["a"], primary: "a", deltaFrames: 0, laneDelta: { video: 0, audio: 0 }, mode: "overwrite", duplicate: false, ...request }, newId);
    expect(move({ clipIds: ["l"], deltaFrames: 10 })).toEqual({ kind: "refused", refusal: { reason: "lockedSource", trackId: "v2" } });
    expect(move({ laneDelta: { video: 1, audio: 0 } })).toEqual({ kind: "refused", refusal: { reason: "lockedTarget", trackId: "v2" } });
    // Insert drops (Mod) onto it too.
    expect(move({ laneDelta: { video: 1, audio: 0 }, mode: "insert" })).toEqual({ kind: "refused", refusal: { reason: "lockedTarget", trackId: "v2" } });
    expect(nudgeClips(p, ["m"], 5, newId).kind).toBe("refused");
    expect(moveToAdjacentLane(p, ["a"], "up", "video", newId)).toMatchObject({ kind: "refused", refusal: { trackId: "v2" } });
    expect(moveIntoSync({ ...p, clips: { ...p.clips, l: { ...(p.clips.l as MediaClip), start: 40 } } }, "l", newId)).toBeNull();
  });

  it("is never trimmed, rolled, slipped, slid or stretched", () => {
    const p = project();
    for (const result of [
      trimEdge(p, "l", "out", -10, { ripple: false }),
      trimEdge(p, "m", "in", 10, { ripple: true }),
      rollEdit(p, "l", "m", 5),
      slip(p, "l", 5),
      slide(p, "m", -5),
      rateStretch(p, "l", "out", 20),
    ]) {
      expect(result.command).toBeNull();
    }
    expect(extendToPlayhead(p, "m", 300)).toBeNull();
    // A linked partner on it does not trim with its unlocked side.
    const trimmed = apply(p, trimEdge(p, "la", "out", -20, { ripple: false }).command);
    expect(trimmed.clips.la?.duration).toBe(80);
    expect(v2(trimmed)).toEqual(v2(p));
  });

  it("is never split or deleted; linking, grouping and deleting the track leave it alone", () => {
    const p = project();
    expect(clipsToSplit(p, 130, { kind: "all" })).toEqual(["b", "t", "la"]);
    expect(clipsToSplit(p, 130, { kind: "targeted" })).toEqual(["b", "t", "la"]);
    expect(clipsToSplit(p, 130, { kind: "clips", clipIds: ["l", "la"] })).toEqual(["la"]);
    expect(splitClips(p, ["l"], 130, newId)).toBeNull();
    expect(deletionSet(p, ["l", "la", "b"])).toEqual(["la", "b"]);
    expect(deleteClips(p, ["m"])).toBeNull();
    expect(toggleLink(p, ["l"], newId)).toEqual({ kind: "refused", reason: "nothing" });
    expect(groupClips(p, ["m", "c"], newId)).toBeNull();
    expect(deleteTracks(p, ["v2"])).toMatchObject({ command: null, locked: { id: "v2" } });
  });

  it("is skipped by every ripple: ripple trim, ripple delete, close gap, compact and Q/W", () => {
    const p = project();
    // Ripple trim of a's out by -30: b, c, t and s would shift. On A1, la spans the edit point and s
    // after it can only move 10: the unlocked A1 limits the ripple; V2 neither moves nor limits.
    const limited = trimEdge(p, "a", "out", -30, { ripple: true });
    expect(limited.delta).toBe(-10);
    expect(limited.limit).toMatchObject({ reason: "ripple", trackId: "a1" });
    const rippled = apply(p, limited.command);
    expect([rippled.clips.b?.start, rippled.clips.c?.start, rippled.clips.t?.start, rippled.clips.s?.start]).toEqual([90, 290, 110, 150]);
    expect(v2(rippled)).toEqual(v2(p));
    // Locked, A1 no longer limits (nor moves): the ripple goes the whole way.
    const lockedA1 = { ...p, tracks: p.tracks.map((track) => (track.id === "a1" ? { ...track, locked: true } : track)) };
    const full = trimEdge(lockedA1, "a", "out", -30, { ripple: true });
    expect([full.delta, full.limit]).toEqual([-30, null]);
    expect(apply(lockedA1, full.command).clips.s).toBe(p.clips.s);
    // Ripple delete of b: c moves left; V2 neither moves nor limits (m spans the gap's end).
    const deleted = rippleDelete(p, ["b"]);
    expect(deleted?.limit).toBeNull();
    const afterDelete = apply(p, deleted?.command);
    expect(afterDelete.clips.c?.start).toBe(200);
    expect(v2(afterDelete)).toEqual(v2(p));
    // Its own gaps are never closed: Close gap there and Compact skip it.
    expect(closeGap(p, { trackId: "v2", start: 0, end: 50 }).command).toBeNull();
    const compacted = apply(p, compactGaps(p).command);
    expect(compacted.clips.c?.start).toBe(200);
    expect(v2(compacted)).toEqual(v2(p));
    expect(gapAtPlayhead(p, 20)?.trackId).not.toBe("v2");
    // W at 170: b and s end at 200 (the earliest end under the playhead on targeted unlocked tracks)
    // and lose 30 frames; c ripples to 270 past the locked m, which stays at 250.
    const w = trimToPlayhead(p, 170, "end");
    const afterW = apply(p, w?.result.command);
    expect([afterW.clips.b?.duration, afterW.clips.s?.duration, afterW.clips.c?.start]).toEqual([70, 10, 270]);
    expect(v2(afterW)).toEqual(v2(p));
  });
});
