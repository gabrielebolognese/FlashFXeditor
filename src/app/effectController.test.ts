import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../core/document/fixtures.js";
import type { Clip, ClipId, Effect, Project } from "../core/document/types.js";
import { selectClips } from "../core/store/selection.js";
import { setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { loadLutForSelection } from "./effectController.js";
import { documentStore, sessionStore } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks.
vi.mock("./services.js", async () => {
  const { CommandRegistry } = await import("../core/commands/CommandRegistry.js");
  const { createProject } = await import("../core/document/project.js");
  const { DocumentStore } = await import("../core/store/DocumentStore.js");
  const { createSessionStore } = await import("../core/store/sessionStore.js");
  const sessionStore = createSessionStore();
  return {
    actions: new CommandRegistry(),
    documentStore: new DocumentStore(createProject({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    sessionStore,
    lookStore: {},
  };
});
// The picker returns a file at once and the import copies nothing: the path is all the edit needs.
vi.mock("./filePickers.js", () => ({ pickFile: () => Promise.resolve(new File(["LUT_3D_SIZE 2"], "warm.cube")) }));
vi.mock("./lutController.js", () => ({ importLut: () => Promise.resolve({ path: "luts/warm.cube" }), ensureLuts: () => Promise.resolve(), lutText: () => null }));

const lutEffect = (file: string): Effect => ({ id: "fx1", type: "lut", enabled: true, params: { file, intensity: 1 } });

function project(): Project {
  const p = makeProject();
  p.media.m1 = { ...makeMedia("m1", "video"), width: 1920, height: 1080 };
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3")];
  const a = { ...makeMediaClip(p, { id: "a", trackId: "v1", start: 0, duration: 60, mediaId: "m1" }), effects: [lutEffect("luts/old-a.cube")] };
  const b = { ...makeSolidClip({ id: "b", trackId: "v2", start: 0, duration: 30 }), effects: [lutEffect("luts/old-b.cube")] };
  const c = makeSolidClip({ id: "c", trackId: "v3", start: 0, duration: 30 });
  return withClips(p, [a, b, c] as Clip[]);
}

const effects = (id: string) => (documentStore.getState().clips[id as ClipId] as Clip & { effects?: Effect[] }).effects ?? [];
const files = () => ["a", "b", "c"].map((id) => effects(id).find((e) => e.type === "lut")?.params.file ?? null);

beforeEach(() => {
  documentStore.load(project());
  setPlayhead(sessionStore, 0);
  setSelection(sessionStore, selectClips(["a", "b", "c"] as ClipId[]));
});

describe("Load LUT on the selection (spec §21.19, §3 one command per action, Batch 75)", () => {
  it("grades every selected clip in one undo step, and one undo restores all three", async () => {
    expect(files()).toEqual(["luts/old-a.cube", "luts/old-b.cube", null]);
    expect(documentStore.history.getState().canUndo).toBe(false);
    expect(await loadLutForSelection()).toBe(true);
    expect(files()).toEqual(["luts/warm.cube", "luts/warm.cube", "luts/warm.cube"]);
    expect(effects("c")).toHaveLength(1);
    expect(documentStore.history.getState().undoLabel).toBe("Load LUT");
    expect(documentStore.undo()).toBe(true);
    expect(files()).toEqual(["luts/old-a.cube", "luts/old-b.cube", null]);
    expect(effects("c")).toEqual([]);
    expect(documentStore.history.getState().canUndo).toBe(false);
  });
});
