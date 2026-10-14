import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { canChangeFrameRate, clampDimension, renameProject, setBackground, setFrameRate, setResolution } from "./projectCommands.js";

const storeFor = (project = makeProject()) => new DocumentStore(project, { session: createSessionStore(), validate: true });

describe("project commands", () => {
  it("renames with a cleaned name and undoes", () => {
    const store = storeFor();
    store.dispatch(renameProject("  My   short \n"));
    expect(store.getState().name).toBe("My short");
    expect(store.history.getState().undoLabel).toBe("Rename project");
    store.undo();
    expect(store.getState().name).toBe("Test");
  });

  it("ignores an empty name (no undo step)", () => {
    const store = storeFor();
    store.dispatch(renameProject("   "));
    expect(store.getState().name).toBe("Test");
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("caps long names", () => {
    const store = storeFor();
    store.dispatch(renameProject("x".repeat(500)));
    expect(store.getState().name).toHaveLength(120);
  });

  it("sets an even, clamped resolution", () => {
    const store = storeFor();
    store.dispatch(setResolution(1081, 99999));
    expect(store.getState().settings).toMatchObject({ width: 1082, height: 7680 });
    expect(clampDimension(3)).toBe(16);
  });

  it("changes the frame rate of an empty project", () => {
    const store = storeFor();
    store.dispatch(setFrameRate({ num: 30000, den: 1001 }));
    expect(store.getState().settings.fps).toEqual({ num: 30000, den: 1001 });
  });

  it("refuses to change the frame rate once clips exist", () => {
    let project = makeProject();
    project.tracks.push(makeTrack("v1"));
    project = withClips(project, [makeSolidClip({ id: "s1", trackId: "v1", start: 0, duration: 10 })]);
    const store = storeFor(project);
    expect(canChangeFrameRate(store.getState())).toBe(false);
    expect(() => store.dispatch(setFrameRate({ num: 60, den: 1 }))).toThrow(/converting/);
    expect(store.getState().settings.fps).toEqual({ num: 30, den: 1 });
  });

  it("rejects a non-integer frame rate", () => {
    expect(() => setFrameRate({ num: 29.97, den: 1 })).toThrow(/invalid/);
  });

  it("sets the background color", () => {
    const store = storeFor();
    store.dispatch(setBackground({ r: 1, g: 0.5, b: 0, a: 1 }));
    expect(store.getState().settings.background).toEqual({ r: 1, g: 0.5, b: 0, a: 1 });
  });
});
