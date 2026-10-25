import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { duplicateClip } from "./duplicate.js";

function clip(id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId: "v1", start, duration, mediaId: "m" }), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

let n = 0;
const newId = () => `copy-${++n}`;

function duplicate(p: Project, id: string): { doc: DocumentStore; copy: Clip } {
  const result = duplicateClip(p, id, newId);
  if (!result) throw new Error("expected a duplicate");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  return { doc, copy: doc.getState().clips[result.clipId] as Clip };
}

describe("duplicateClip (spec §11 Duplicate, single clip)", () => {
  it("places the copy right after the clip when that span is free, keeping its fields; one undo step", () => {
    const p = project([clip("a", 10, 30, { transform: { x: 4, y: 5, scale: 2, rotation: 9, anchor: { x: 0.5, y: 0.5 }, flipH: true, flipV: false }, color: "teal", opacity: 0.5 })]);
    const { doc, copy } = duplicate(p, "a");
    expect(copy).toMatchObject({ trackId: "v1", start: 40, duration: 30, color: "teal", opacity: 0.5, in: (p.clips.a as MediaClip).in, out: (p.clips.a as MediaClip).out });
    expect((copy as MediaClip).transform).toEqual((p.clips.a as MediaClip).transform);
    expect(copy.id).not.toBe("a");
    expect(doc.history.getState().undoLabel).toBe("Duplicate clip");
    doc.undo();
    expect(Object.keys(doc.getState().clips)).toEqual(["a"]);
  });

  it("skips gaps too short for it and lands in the next free spot, else after the last clip", () => {
    const p = project([clip("a", 0, 30), clip("b", 50, 10), clip("c", 70, 40), clip("d", 140, 5)]);
    // 30..50 (20) and 60..70 (10) are too short; 110..140 (30) holds it.
    expect(duplicate(p, "a").copy.start).toBe(110);
    expect(duplicate(p, "d").copy.start).toBe(145);
    const tight = project([clip("a", 0, 30), clip("b", 30, 10)]);
    expect(duplicate(tight, "a").copy.start).toBe(40);
  });

  it("copies the clip alone: no link group or group; a clip on a locked track or a missing one gives null", () => {
    const p = project([clip("a", 0, 30, { linkGroup: "L", group: "G" }), { ...clip("x", 0, 30, { linkGroup: "L" }), kind: "audio", trackId: "a1" }]);
    const { copy } = duplicate(p, "a");
    expect(copy.linkGroup).toBeUndefined();
    expect(copy.group).toBeUndefined();
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    expect(duplicateClip(locked, "a", newId)).toBeNull();
    expect(duplicateClip(p, "gone", newId)).toBeNull();
  });
});
