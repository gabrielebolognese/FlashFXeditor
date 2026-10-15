import { describe, expect, it } from "vitest";
import { makeProject } from "../document/fixtures.js";
import type { Marker } from "../document/types.js";
import { validateProject } from "../document/validate.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addMarker, removeMarker, updateMarker } from "./markerCommands.js";

const marker = (id: string, frame: number, fields: Partial<Marker> = {}): Marker => ({ id, frame, color: "green", label: "", ...fields });

function setup() {
  const store = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
  const frames = () => store.getState().markers.map((m) => `${m.id}@${m.frame}`);
  return { store, frames };
}

describe("marker commands", () => {
  it("adds markers in frame order, equal frames in the order added", () => {
    const { store, frames } = setup();
    store.dispatch(addMarker(marker("a", 90)));
    store.dispatch(addMarker(marker("b", 30)));
    store.dispatch(addMarker(marker("c", 90)));
    store.dispatch(addMarker(marker("d", 0)));
    expect(frames()).toEqual(["d@0", "b@30", "a@90", "c@90"]);
    expect(() => store.dispatch(addMarker(marker("a", 5)))).toThrow(/already exists/);
  });

  it("moves an edited marker to its sorted place and names the undo step by what changed", () => {
    const { store, frames } = setup();
    for (const [id, frame] of [["a", 10], ["b", 20], ["c", 30]] as const) store.dispatch(addMarker(marker(id, frame)));
    store.dispatch(updateMarker("a", { frame: 25 }));
    expect(frames()).toEqual(["b@20", "a@25", "c@30"]);
    expect(store.history.getState().undoLabel).toBe("Move marker");
    store.dispatch(updateMarker("c", { frame: 0 }));
    expect(frames()).toEqual(["c@0", "b@20", "a@25"]);
    store.dispatch(updateMarker("b", { label: "Drop" }));
    expect(store.history.getState().undoLabel).toBe("Rename marker");
    store.dispatch(updateMarker("b", { color: "red" }));
    expect(store.history.getState().undoLabel).toBe("Color marker");
    expect(store.getState().markers.find((m) => m.id === "b")).toMatchObject({ label: "Drop", color: "red", frame: 20 });
    store.undo();
    store.undo();
    store.undo();
    expect(frames()).toEqual(["b@20", "a@25", "c@30"]);
  });

  it("removes a marker in one undo step; an unknown id changes nothing", () => {
    const { store, frames } = setup();
    store.dispatch(addMarker(marker("a", 10)));
    store.dispatch(removeMarker("a"));
    expect(frames()).toEqual([]);
    store.undo();
    expect(frames()).toEqual(["a@10"]);
    const before = store.getState();
    store.dispatch(removeMarker("zzz"));
    expect(store.getState().markers).toEqual(before.markers);
  });
});

describe("marker invariants", () => {
  it("reports unsorted, duplicate, fractional and unknown-color markers", () => {
    const project = makeProject();
    project.markers = [marker("a", 20), marker("a", 10), { ...marker("b", 1.5) }, { ...marker("c", 30), color: "gold" as Marker["color"] }];
    const issues = validateProject(project).join("\n");
    expect(issues).toMatch(/marker a: listed more than once/);
    expect(issues).toMatch(/marker a: .*belongs before/);
    expect(issues).toMatch(/marker b: .*integer/);
    expect(issues).toMatch(/marker c: color gold/);
  });
});
