// Baked stand-ins (spec §21.4, Batch 54): `fallbackOf` survives every edit, and `headTrim` follows the
// edits that move the clip's first frame within what it stands for.
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import { shiftHeadTrim } from "../../core/document/fallback.js";
import type { Clip, FallbackOf, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { copyClips, parseClipboard, pasteClips, serializeClipboard } from "./clipboard.js";
import { splitClips } from "./split.js";
import { slip, trimEdge } from "./trim.js";

const BLOCK = (headTrim?: number): FallbackOf => ({ kind: "compound", reason: "baked", schemaVersion: 4, ...(headTrim !== undefined && { headTrim }), data: { kind: "compound", sequence: { clips: [{ id: "x", start: 1 }] }, nested: { deep: [1, 2, 3] } } });

function standIn(headTrim?: number): MediaClip {
  const p = makeProject();
  return { ...makeMediaClip(p, { id: "s", trackId: "v1", start: 100, duration: 100, mediaId: "m" }), in: 3_000_000, out: 3_000_000 + frameToUs(100, p.settings.fps), fallbackOf: BLOCK(headTrim) };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push({ ...makeTrack("v1"), targeted: true });
  return withClips(p, clips);
}

const open = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const block = (p: Project, id: string) => p.clips[id]?.fallbackOf;
let n = 0;
const newId = () => `n${++n}`;

describe("shiftHeadTrim", () => {
  it("adds to headTrim, never below 0, and leaves other clips alone", () => {
    const clip = standIn(4) as Clip;
    shiftHeadTrim(clip, 6);
    expect(clip.fallbackOf?.headTrim).toBe(10);
    shiftHeadTrim(clip, -25);
    expect(clip.fallbackOf && "headTrim" in clip.fallbackOf).toBe(false);
    const plain = { ...standIn(), fallbackOf: undefined } as unknown as Clip;
    delete plain.fallbackOf;
    shiftHeadTrim(plain, 5);
    expect(plain.fallbackOf).toBeUndefined();
  });
});

describe("splitting a stand-in", () => {
  it("gives the right half a headTrim equal to the split offset and both halves the block; undo and redo keep it", () => {
    const p = project([standIn()]);
    const result = splitClips(p, ["s"], 130, newId);
    const doc = open(p);
    doc.dispatch(result?.command as NonNullable<typeof result>["command"]);
    const next = doc.getState();
    const rightId = result?.pieces.get("s") as string;
    expect(block(next, "s")).toEqual(BLOCK());
    expect(block(next, rightId)).toEqual({ ...BLOCK(), headTrim: 30 });
    doc.undo();
    expect(doc.getState()).toEqual(p);
    expect(block(doc.getState(), "s")).toEqual(BLOCK());
    doc.redo();
    expect(block(doc.getState(), rightId)?.headTrim).toBe(30);
  });

  it("adds the offset to a headTrim the clip already has, split after split", () => {
    const p = project([standIn(7)]);
    const first = splitClips(p, ["s"], 120, newId);
    const doc = open(p);
    doc.dispatch(first?.command as NonNullable<typeof first>["command"]);
    const rightId = first?.pieces.get("s") as string;
    expect(block(doc.getState(), rightId)?.headTrim).toBe(27);
    expect(block(doc.getState(), "s")?.headTrim).toBe(7);
    const second = splitClips(doc.getState(), [rightId], 150, newId);
    doc.dispatch(second?.command as NonNullable<typeof second>["command"]);
    expect(block(doc.getState(), second?.pieces.get(rightId) as string)?.headTrim).toBe(57);
  });

  it("splits a stand-in that is not a media clip the same way", () => {
    const p = makeProject();
    p.tracks.push({ ...makeTrack("v1"), targeted: true });
    const text: Clip = { ...makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 60 }), fallbackOf: BLOCK(2) };
    const doc = open(withClips(p, [text]));
    const result = splitClips(doc.getState(), ["t"], 20, newId);
    doc.dispatch(result?.command as NonNullable<typeof result>["command"]);
    expect(block(doc.getState(), result?.pieces.get("t") as string)?.headTrim).toBe(22);
  });
});

describe("trimming and slipping a stand-in", () => {
  it("a head trim adds to headTrim; a tail trim leaves it", () => {
    const p = project([standIn(5)]);
    const doc = open(p);
    doc.dispatch(trimEdge(p, "s", "in", 25, { ripple: false }).command as never);
    expect(block(doc.getState(), "s")?.headTrim).toBe(30);
    doc.undo();
    expect(block(doc.getState(), "s")?.headTrim).toBe(5);
    doc.dispatch(trimEdge(p, "s", "out", -20, { ripple: false }).command as never);
    expect(block(doc.getState(), "s")).toEqual(BLOCK(5));
  });

  it("a head trim that grows the clip again takes it back, never below 0", () => {
    const p = project([standIn(5)]);
    const doc = open(p);
    doc.dispatch(trimEdge(p, "s", "in", -40, { ripple: false }).command as never);
    expect(block(doc.getState(), "s")).toEqual(BLOCK());
  });

  it("a slip adds the slip to headTrim", () => {
    const p = project([standIn()]);
    const doc = open(p);
    doc.dispatch(slip(p, "s", 12).command as never);
    expect(block(doc.getState(), "s")?.headTrim).toBe(12);
    doc.dispatch(slip(doc.getState(), "s", -5).command as never);
    expect(block(doc.getState(), "s")?.headTrim).toBe(7);
  });
});

describe("copying a stand-in", () => {
  it("keeps the whole block through copy, the system clipboard text and paste, and through undo and redo", () => {
    const p = project([standIn(9)]);
    const payload = copyClips(p, ["s"], null, { linked: true });
    const parsed = parseClipboard(serializeClipboard(payload as NonNullable<typeof payload>));
    expect(parsed?.kind).toBe("clips");
    const result = pasteClips(p, parsed as NonNullable<typeof payload>, { at: 400, mode: "overwrite", newId });
    if (result.kind !== "ok") throw new Error(`refused: ${result.reason}`);
    const doc = open(p);
    doc.dispatch(result.command);
    const pasted = Object.values(doc.getState().clips).find((clip) => clip.id !== "s") as Clip;
    expect(pasted.fallbackOf).toEqual(BLOCK(9));
    doc.undo();
    expect(Object.keys(doc.getState().clips)).toEqual(["s"]);
    doc.redo();
    expect((Object.values(doc.getState().clips).find((clip) => clip.id !== "s") as Clip).fallbackOf).toEqual(BLOCK(9));
  });
});
