import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { nestingProblem } from "../../core/document/sequences.js";
import type { Clip, CompoundClip, MediaClip, Project, Sequence, SolidClip } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { breakApart, breakApartProblem, makeCompound, makeCompoundProblem, makeUnique, makeUniqueProblem } from "./compound.js";
import { planSlip, planTrim, resolveTrim } from "./trim.js";

let n = 0;
const newId = () => `n${++n}`;

function base(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return p;
}

const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const card = (): Project =>
  withClips(base(), [
    makeSolidClip({ id: "s", trackId: "v1", start: 10, duration: 60 }),
    makeTextClip({ id: "t", trackId: "v2", start: 20, duration: 40 }),
    { ...makeMediaClip(base(), { id: "i", trackId: "v2", start: 60, duration: 10, mediaId: "m" }), kind: "image" } as MediaClip,
    { ...makeMediaClip(base(), { id: "au", trackId: "a1", start: 10, duration: 60, mediaId: "m" }), kind: "audio" } as MediaClip,
  ]);

function addClip(doc: DocumentStore, clip: Clip): void {
  doc.dispatch({
    id: "test.add",
    label: "add",
    affects: ["clips"],
    run(draft) {
      draft.clips[clip.id] = clip as never;
      draft.tracks.find((track) => track.id === clip.trackId)?.clipIds.push(clip.id);
    },
  });
}

describe("Make compound (spec §21.10)", () => {
  it("moves the clips into a sequence the size of the project and puts one compound on the lowest video track; undo restores them", () => {
    const p = card();
    const doc = store(p);
    const made = makeCompound(p, ["s", "t", "i"], newId);
    expect(made).not.toBeNull();
    doc.dispatch(made!.command);
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    const compound = after.clips[made!.compoundId] as CompoundClip;
    expect(compound).toMatchObject({ kind: "compound", trackId: "v1", start: 10, duration: 60, offset: 0 });
    const sequence = after.sequences[made!.sequenceId] as Sequence;
    expect(sequence).toMatchObject({ size: { w: 1080, h: 1920 }, duration: 60, background: null });
    expect(sequence.tracks.map((track) => track.name)).toEqual(["V1", "V2"]);
    expect((after.clips.s as SolidClip).start).toBe(0);
    expect((after.clips.t as Clip).start).toBe(10);
    expect(after.tracks.find((track) => track.id === "v1")?.clipIds).toEqual([compound.id]);
    expect(after.tracks.find((track) => track.id === "v2")?.clipIds).toEqual([]);
    doc.undo();
    expect(doc.getState()).toStrictEqual(p);
  });

  it("takes audio clips along, and gives the reason when nothing visual is selected or other clips are in the way", () => {
    const p = withClips(card(), [makeSolidClip({ id: "x", trackId: "v1", start: 30, duration: 5 })]);
    expect(makeCompoundProblem(p, ["s", "i"])).toMatch(/between/);
    expect(makeCompoundProblem(p, ["au"])).toMatch(/picture/);
    expect(makeCompoundProblem(p, [])).toMatch(/Select/);
    const q = card();
    const made = makeCompound(q, ["s", "au"], newId)!;
    const doc = store(q);
    doc.dispatch(made.command);
    expect((doc.getState().sequences[made.sequenceId] as Sequence).tracks.map((track) => track.kind)).toEqual(["video", "audio"]);
  });

  it("nests: a compound made from compounds is valid, and a cycle is refused", () => {
    const p = card();
    const doc = store(p);
    const inner = makeCompound(p, ["s", "t"], newId)!;
    doc.dispatch(inner.command);
    const outer = makeCompound(doc.getState(), [inner.compoundId, "i"], newId)!;
    doc.dispatch(outer.command);
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    expect(nestingProblem(after, outer.sequenceId, inner.sequenceId)).toBeNull();
    expect(nestingProblem(after, inner.sequenceId, outer.sequenceId)).toMatch(/itself/);
    expect(nestingProblem(after, outer.sequenceId, outer.sequenceId)).toMatch(/itself/);
    const cyclic = structuredClone(after);
    const seq = cyclic.sequences[inner.sequenceId] as Sequence;
    cyclic.clips.loop = makeCompoundClip({ id: "loop", trackId: (seq.tracks[0] as { id: string }).id, start: 0, duration: 1, sequenceId: outer.sequenceId });
    seq.tracks[0]?.clipIds.push("loop");
    expect(validateProject(cyclic).join("\n")).toMatch(/contains itself/);
  });

  it("refuses more than 8 levels of nesting", () => {
    const p = card();
    const doc = store(p);
    let made = makeCompound(p, ["s", "t"], newId)!;
    doc.dispatch(made.command);
    for (let level = 2; level <= 8; level++) {
      made = makeCompound(doc.getState(), [made.compoundId], newId)!;
      doc.dispatch(made.command);
    }
    expect(validateProject(doc.getState())).toEqual([]);
    expect(makeCompoundProblem(doc.getState(), [made.compoundId])).toMatch(/at most 8/);
  });
});

describe("Break apart", () => {
  it("puts the inner clips back at their absolute times on project tracks, and removes the sequence", () => {
    const p = card();
    const doc = store(p);
    const made = makeCompound(p, ["s", "t", "i", "au"], newId)!;
    doc.dispatch(made.command);
    const moved = doc.getState();
    expect(breakApartProblem(moved, made.compoundId)).toBeNull();
    doc.dispatch(breakApart(moved, made.compoundId, newId)!);
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    expect(Object.keys(after.sequences)).toEqual([]);
    expect(Object.values(after.clips).map((clip) => [clip.id, clip.trackId, clip.start, clip.duration])).toEqual(
      expect.arrayContaining([
        ["s", "v1", 10, 60],
        ["t", "v2", 20, 40],
        ["i", "v2", 60, 10],
        ["au", "a1", 10, 60],
      ]),
    );
    doc.undo();
    expect(doc.getState()).toStrictEqual(moved);
  });

  it("is disabled with a reason when the compound is transformed, faded, keyed, quieter or its sequence differs in size", () => {
    const p = card();
    const doc = store(p);
    const made = makeCompound(p, ["s", "t"], newId)!;
    doc.dispatch(made.command);
    const state = doc.getState();
    const edit = (fields: Partial<CompoundClip>): Project => ({ ...state, clips: { ...state.clips, [made.compoundId]: { ...(state.clips[made.compoundId] as CompoundClip), ...fields } } });
    expect(breakApartProblem(edit({ transform: { x: 5, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } }), made.compoundId)).toMatch(/a transform/);
    expect(breakApartProblem(edit({ opacity: 0.5 }), made.compoundId)).toMatch(/an opacity/);
    expect(breakApartProblem(edit({ fades: { in: 3, out: 0 } }), made.compoundId)).toMatch(/fades/);
    expect(breakApartProblem(edit({ volume: { gainDb: -6, muted: false } }), made.compoundId)).toMatch(/volume/);
    expect(breakApart(edit({ opacity: 0.5 }), made.compoundId, newId)).toBeNull();
    const sized: Project = { ...state, sequences: { ...state.sequences, [made.sequenceId]: { ...(state.sequences[made.sequenceId] as Sequence), size: { w: 100, h: 100 } } } };
    expect(breakApartProblem(sized, made.compoundId)).toMatch(/size/);
  });

  it("copies the clips when another instance still uses the sequence", () => {
    const p = card();
    const doc = store(p);
    const made = makeCompound(p, ["s", "t"], newId)!;
    doc.dispatch(made.command);
    addClip(doc, makeCompoundClip({ id: "twin", trackId: "v1", start: 100, duration: 60, sequenceId: made.sequenceId }));
    doc.dispatch(breakApart(doc.getState(), made.compoundId, newId)!);
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    expect(after.sequences[made.sequenceId]).toBeDefined();
    expect(Object.values(after.clips).filter((clip) => clip.kind === "solid")).toHaveLength(2);
    doc.undo();
    expect(Object.values(doc.getState().clips).filter((clip) => clip.kind === "solid")).toHaveLength(1);
  });
});

describe("Make unique", () => {
  it("is disabled for a sequence used once; with two instances it copies the sequence for one of them", () => {
    const p = card();
    const doc = store(p);
    const made = makeCompound(p, ["s", "t"], newId)!;
    doc.dispatch(made.command);
    expect(makeUniqueProblem(doc.getState(), made.compoundId)).toMatch(/not shared/);
    addClip(doc, makeCompoundClip({ id: "twin", trackId: "v1", start: 100, duration: 60, sequenceId: made.sequenceId }));
    doc.dispatch(makeUnique(doc.getState(), "twin", newId)!);
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    expect(Object.keys(after.sequences)).toHaveLength(2);
    expect((after.clips.twin as CompoundClip).sequenceId).not.toBe(made.sequenceId);
    expect((after.clips[made.compoundId] as CompoundClip).sequenceId).toBe(made.sequenceId);
    expect(Object.values(after.clips).filter((clip) => clip.kind === "solid")).toHaveLength(2);
  });
});

describe("trim and slip of compound clips", () => {
  it("cannot trim or slip past the sequence; an in trim moves offset", () => {
    const p0 = card();
    const doc = store(p0);
    const made = makeCompound(p0, ["s", "t"], newId)!;
    doc.dispatch(made.command);
    const id = made.compoundId;
    const full = doc.getState();
    expect(planTrim(full, [id], "out", { ripple: false, linked: false }).hi.value).toBe(0);
    expect(planTrim(full, [id], "in", { ripple: false, linked: false }).lo.value).toBeCloseTo(0);
    doc.dispatch({ id: "test", label: "x", affects: ["clips"], run: (d) => void ((d.clips[id] as CompoundClip).duration = 40) });
    const shorter = doc.getState();
    expect(planTrim(shorter, [id], "out", { ripple: false, linked: false }).hi.value).toBe(20);
    const slip = planSlip(shorter, id);
    expect([slip.lo.value + 0, slip.hi.value]).toEqual([0, 20]);
    const result = resolveTrim(planTrim(shorter, [id], "in", { ripple: false, linked: false }), 10);
    doc.dispatch(result.command!);
    expect(doc.getState().clips[id]).toMatchObject({ start: 20, duration: 30, offset: 10 });
    expect(validateProject(doc.getState())).toEqual([]);
  });
});
