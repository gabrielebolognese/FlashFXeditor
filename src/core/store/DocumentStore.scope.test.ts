import { describe, expect, it } from "vitest";
import { makeMedia, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../document/fixtures.js";
import type { Project } from "../document/types.js";
import { validateProject } from "../document/validate.js";
import { makeCompound } from "../../timeline/edit/compound.js";
import { DocumentStore } from "./DocumentStore.js";
import { createSessionStore, NO_SCOPE, type SessionStore } from "./sessionStore.js";

let n = 0;
const newId = () => `n${++n}`;

function opened(): { doc: DocumentStore; session: SessionStore; sequenceId: string; compoundId: string } {
  const p: Project = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"));
  const project = withClips(p, [makeSolidClip({ id: "s", trackId: "v1", start: 10, duration: 60 }), makeTextClip({ id: "t", trackId: "v2", start: 20, duration: 40 })]);
  const session = createSessionStore();
  const doc = new DocumentStore(project, { session, validate: true, newId });
  const made = makeCompound(project, ["s", "t"], newId);
  if (!made) throw new Error("no compound");
  doc.dispatch(made.command);
  return { doc, session, sequenceId: made.sequenceId, compoundId: made.compoundId };
}

const open = (session: SessionStore, id: string) => session.state.set((s) => ({ ...s, scope: { path: [id], returns: [0], opened: [] } }));

describe("DocumentStore scope (a compound opened for editing, spec §21.10)", () => {
  it("shows the sequence as the project while open and the project again after", () => {
    const { doc, session, sequenceId } = opened();
    const root = doc.getRoot();
    expect(doc.getState()).toBe(root);
    open(session, sequenceId);
    const view = doc.getState();
    expect(view.tracks).toBe(root.sequences[sequenceId]?.tracks);
    expect(view.settings.width).toBe(root.sequences[sequenceId]?.size.w);
    expect(doc.getRoot()).toBe(root);
    expect(doc.scopeId()).toBe(sequenceId);
    session.state.set((s) => ({ ...s, scope: NO_SCOPE }));
    expect(doc.getState()).toBe(root);
  });

  it("notifies every subscriber with every flag when a compound opens or closes", () => {
    const { doc, session, sequenceId } = opened();
    const seen: Array<{ tracks: number; affects: number }> = [];
    doc.subscribe((state, _prev, affects) => seen.push({ tracks: state.tracks.length, affects: affects.size }), { affects: ["audio"] });
    open(session, sequenceId);
    session.state.set((s) => ({ ...s, scope: NO_SCOPE }));
    expect(seen.length).toBe(2);
    expect(seen[0]?.tracks).toBe(2);
    expect(seen[0]?.affects).toBeGreaterThan(5);
  });

  it("runs commands on the sequence, leaves the project's tracks alone, grows the sequence and undoes as one step", () => {
    const { doc, session, sequenceId } = opened();
    const rootBefore = doc.getRoot();
    open(session, sequenceId);
    doc.dispatch({
      id: "test.move",
      label: "move",
      affects: ["clips"],
      run(draft) {
        const clip = draft.clips.s;
        if (clip) clip.start = 100;
        draft.tracks.push({ ...makeTrack("vx"), name: "Extra" });
      },
    });
    const root = doc.getRoot();
    expect(root.tracks).toBe(rootBefore.tracks);
    expect(root.sequences[sequenceId]?.tracks.map((t) => t.id)).toContain("vx");
    expect(root.sequences[sequenceId]?.duration).toBe(160);
    expect(root.settings).toEqual(rootBefore.settings);
    expect(validateProject(root)).toEqual([]);
    expect(doc.getState().tracks.map((t) => t.id)).toContain("vx");
    expect(doc.undo()).toBe(true);
    expect(doc.getRoot().sequences[sequenceId]?.tracks.length).toBe(rootBefore.sequences[sequenceId]?.tracks.length);
    expect(doc.getRoot().clips.s?.start).toBe(0);
    expect(doc.redo()).toBe(true);
    expect(doc.getRoot().clips.s?.start).toBe(100);
  });

  it("refuses an edit that would put a caption track inside the sequence and leaves the document alone", () => {
    const { doc, session, sequenceId } = opened();
    open(session, sequenceId);
    const before = doc.getRoot();
    expect(() =>
      doc.dispatch({ id: "test.cc", label: "cc", affects: ["tracks"], run: (draft) => void draft.tracks.push({ ...makeTrack("cc"), kind: "caption" }) }),
    ).toThrow(/Captions/);
    expect(doc.getRoot()).toBe(before);
  });

  it("undo and redo work from the project after the compound was closed", () => {
    const { doc, session, sequenceId } = opened();
    open(session, sequenceId);
    doc.dispatch({ id: "test.edit", label: "edit", affects: ["clips"], run: (draft) => void (draft.clips.t && (draft.clips.t.start = 5)) });
    session.state.set((s) => ({ ...s, scope: NO_SCOPE }));
    expect(doc.getState().tracks.map((t) => t.id)).toEqual(["v1", "v2"]);
    doc.undo();
    expect(doc.getRoot().clips.t?.start).toBe(10);
    doc.redo();
    expect(doc.getRoot().clips.t?.start).toBe(5);
  });

  it("falls back to the project when the open sequence is gone (undo of the make)", () => {
    const { doc, session, sequenceId } = opened();
    open(session, sequenceId);
    session.state.set((s) => ({ ...s, scope: NO_SCOPE }));
    doc.undo();
    open(session, sequenceId);
    expect(doc.scopeId()).toBeNull();
    expect(doc.getState()).toBe(doc.getRoot());
  });
});
