import { describe, expect, it } from "vitest";
import { makeMedia, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../core/document/fixtures.js";
import { requestItems, planAtPlayhead, stageDrop, commitPlan } from "../timeline/edit/dropMedia.js";
import { makeCompound } from "../timeline/edit/compound.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { selectClips } from "../core/store/selection.js";
import { createSessionStore, setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { validateProject } from "../core/document/validate.js";
import { closeCompound, crumbs, innerFrameAt, openCompound, openProblem } from "./compoundController.js";

let n = 0;
const newId = () => `n${++n}`;

function setup() {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"));
  const project = withClips(p, [makeSolidClip({ id: "s", trackId: "v1", start: 10, duration: 60 }), makeTextClip({ id: "t", trackId: "v2", start: 20, duration: 40 })]);
  const session = createSessionStore();
  const doc = new DocumentStore(project, { session, validate: true, newId });
  const made = makeCompound(project, ["s", "t"], newId);
  if (!made) throw new Error("no compound");
  doc.dispatch(made.command);
  return { doc, session, ...made };
}

describe("open and close compound (spec §21.10, Batch 63)", () => {
  it("opens the compound at the inner frame under the playhead and closes back to where it was", () => {
    const { doc, session, compoundId, sequenceId } = setup();
    setPlayhead(session, 25);
    setSelection(session, selectClips([compoundId], compoundId));
    expect(openCompound(doc, session, compoundId)).toBe(true);
    expect(session.state.getState().scope.path).toEqual([sequenceId]);
    expect(session.state.getState().playhead).toBe(15);
    expect(session.selection.getState().kind).toBe("none");
    expect(doc.getState().tracks.length).toBe(2);
    expect(closeCompound(session)).toBe(true);
    expect(session.state.getState().scope.path).toEqual([]);
    expect(session.state.getState().playhead).toBe(25);
    expect(session.selection.getState().primary).toBe(compoundId);
    expect(closeCompound(session)).toBe(false);
  });

  it("opens nested compounds level by level and the breadcrumb goes back to any of them", () => {
    const { doc, session, compoundId, sequenceId } = setup();
    // Make the compound itself a compound inside a second sequence.
    const again = makeCompound(doc.getRoot(), [compoundId], newId);
    expect(again).not.toBeNull();
    doc.dispatch(again!.command);
    openCompound(doc, session, again!.compoundId);
    openCompound(doc, session, compoundId);
    expect(session.state.getState().scope.path).toEqual([again!.sequenceId, sequenceId]);
    expect(crumbs(doc.getRoot(), session.state.getState().scope.path)).toEqual(["Project", doc.getRoot().sequences[again!.sequenceId]!.name, doc.getRoot().sequences[sequenceId]!.name]);
    closeCompound(session, 1);
    expect(session.state.getState().scope.path).toEqual([again!.sequenceId]);
    expect(session.selection.getState().primary).toBe(compoundId);
    closeCompound(session, 0);
    expect(session.state.getState().scope.path).toEqual([]);
  });

  it("refuses a clip that is not a compound", () => {
    const { doc, session } = setup();
    expect(openProblem(doc.getState(), "nope")).not.toBeNull();
    expect(openCompound(doc, session, null)).toBe(false);
    expect(session.state.getState().scope.path).toEqual([]);
  });

  it("clamps the inner frame to the compound's window", () => {
    const { doc, compoundId } = setup();
    expect(innerFrameAt(doc.getState(), compoundId, 0)).toBe(0);
    expect(innerFrameAt(doc.getState(), compoundId, 500)).toBe(59);
  });
});

describe("a Compounds bin drop (spec §21.10)", () => {
  it("adds an instance of the sequence at the drop point; both instances share it", () => {
    const { doc, sequenceId, compoundId } = setup();
    const project = doc.getState();
    const items = requestItems(project, { items: [{ compound: { sequenceId, name: "", duration: 1 } }] });
    expect(items).toHaveLength(1);
    const plan = stageDrop(project, items, 100, { video: 0, audio: 0 }, newId);
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0]).toMatchObject({ kind: "compound", sequenceId, start: 100, duration: 60 });
    const result = commitPlan(project, plan, "overwrite", "Add compound clip", newId);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") doc.dispatch(result.command);
    const instances = Object.values(doc.getState().clips).filter((clip) => clip.kind === "compound" && clip.sequenceId === sequenceId);
    expect(instances).toHaveLength(2);
    expect(instances.map((clip) => clip.id)).toContain(compoundId);
    expect(validateProject(doc.getRoot())).toEqual([]);
  });

  it("places an instance at the playhead", () => {
    const { doc, sequenceId } = setup();
    const project = doc.getState();
    const items = requestItems(project, { items: [{ compound: { sequenceId, name: "", duration: 1 } }] });
    const plan = planAtPlayhead(project, items, 200, newId);
    expect(plan.clips[0]).toMatchObject({ start: 200, duration: 60 });
  });

  it("refuses a sequence inside itself while it is open, and a sequence that does not exist", () => {
    const { doc, session, sequenceId, compoundId } = setup();
    expect(requestItems(doc.getState(), { items: [{ compound: { sequenceId: "gone", name: "", duration: 1 } }] })).toEqual([]);
    openCompound(doc, session, compoundId);
    expect(requestItems(doc.getState(), { items: [{ compound: { sequenceId, name: "", duration: 1 } }] })).toEqual([]);
  });
});
