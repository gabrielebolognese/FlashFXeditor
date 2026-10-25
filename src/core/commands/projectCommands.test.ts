import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import type { SolidClip } from "../document/types.js";
import { canChangeFrameRate, clampDimension, renameProject, scaledTransform, setBackground, setFrameRate, setResolution } from "./projectCommands.js";

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

  it("scales the layout with the frame (spec §15 Scale layout): positions per axis, scale by the smaller ratio; one undo step", () => {
    const solid = (id: string, fields: Partial<SolidClip["transform"]>): SolidClip => {
      const clip = makeSolidClip({ id, trackId: "v1", start: id === "a" ? 0 : 10, duration: 10 });
      return { ...clip, transform: { ...clip.transform, ...fields } };
    };
    const project = withClips(
      (() => {
        const p = makeProject();
        p.tracks.push({ ...makeTrack("v1"), locked: true });
        return p;
      })(),
      [solid("a", { x: 100, y: -200, scale: 2 }), solid("b", { x: -50, y: 40, scale: 1, scaleY: 3 })],
    );
    const store = storeFor(project);
    store.dispatch(setResolution(2160, 3840, { scaleLayout: true }));
    expect((store.getState().clips.a as SolidClip).transform).toMatchObject({ x: 200, y: -400, scale: 4 });
    // 9:16 to 1:1: x keeps, y and the scale follow the height.
    store.dispatch(setResolution(2160, 2160, { scaleLayout: true }));
    const b = (store.getState().clips.b as SolidClip).transform;
    expect([b.x, b.y, b.scale, b.scaleY]).toEqual([-100, 45, 1.125, 3.375]);
    expect(store.history.getState().undoLabel).toBe("Change resolution");
    store.undo();
    store.undo();
    expect((store.getState().clips.a as SolidClip).transform).toMatchObject({ x: 100, y: -200, scale: 2 });
    // Keep (no option): transforms untouched.
    store.dispatch(setResolution(720, 1280));
    expect((store.getState().clips.a as SolidClip).transform).toMatchObject({ x: 100, y: -200, scale: 2 });
    expect(scaledTransform(solid("c", {}).transform, { width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toEqual(solid("c", {}).transform);
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
