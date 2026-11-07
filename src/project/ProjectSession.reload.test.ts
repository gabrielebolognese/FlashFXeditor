import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip } from "../core/commands/basicCommands.js";
import { renameProject } from "../core/commands/projectCommands.js";
import { makeSolidClip } from "../core/document/fixtures.js";
import { createProject as createDocument } from "../core/document/project.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { fromSnapshot } from "../core/store/selection.js";
import { createSessionStore, setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { createAppSettings } from "./appSettings.js";
import { INITIAL_SAVE_STATUS, type SaveStatus } from "./Autosaver.js";
import { memoryKeyValueStore } from "./kv.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { createProject, openProjectFolder } from "./openProject.js";
import { parseProjectFile, serializeProject } from "./projectFile.js";
import { ProjectSession } from "./ProjectSession.js";
import { RecentProjects } from "./recentProjects.js";

function deps() {
  const session = createSessionStore();
  return {
    session,
    documentStore: new DocumentStore(createDocument({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session, validate: true }),
    layout: createLayoutStore(null),
    recent: new RecentProjects(memoryKeyValueStore()),
    settings: createAppSettings(memoryKeyValueStore()),
    saveStatus: createStore<SaveStatus>(INITIAL_SAVE_STATUS),
    appVersion: "test",
  };
}

async function newProject(): Promise<MemoryDir> {
  const dir = createMemoryDir("Reel");
  await createProject(dir, "Reel", { width: 1080, height: 1920, fps: { num: 30, den: 1 } }, { appVersion: "test" });
  return dir;
}

const trackId = (d: ReturnType<typeof deps>) => d.documentStore.getState().tracks[0]!.id;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reloadFromDisk (spec §21.5)", () => {
  it("replaces the document with the file's, keeps the playhead and the clips still there selected, and backs the old document up", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    d.documentStore.dispatch(addClip(makeSolidClip({ id: "keep", trackId: trackId(d), start: 0, duration: 10 })));
    d.documentStore.dispatch(addClip(makeSolidClip({ id: "gone", trackId: trackId(d), start: 20, duration: 10 })));
    await vi.advanceTimersByTimeAsync(1000);
    await s.autosaver.whenIdle();
    setPlayhead(d.session, 77);
    setSelection(d.session, fromSnapshot({ clipIds: ["keep", "gone"], primary: "keep", kind: "clips" }));

    // Another tool writes a version without "gone" and with a new name.
    const disk = parseProjectFile(dir.text("project.json")!);
    const clips = { ...disk.clips };
    delete clips.gone;
    const tracks = disk.tracks.map((t) => ({ ...t, clipIds: t.clipIds.filter((id) => id !== "gone") }));
    await dir.writeText("project.json", serializeProject({ ...disk, name: "By another tool", clips, tracks }, { now: "2026-10-14T10:05:00.000Z", appVersion: "other" }));

    const outcome = await s.reloadFromDisk();
    expect(outcome.result).toBe("reloaded");
    expect(d.documentStore.getState().name).toBe("By another tool");
    expect(Object.keys(d.documentStore.getState().clips)).toEqual(["keep"]);
    expect(d.session.state.getState().playhead).toBe(77);
    const selection = d.session.selection.getState();
    expect(selection.kind === "clips" && [...selection.clipIds]).toEqual(["keep"]);
    expect(d.saveStatus.getState().state).toBe("saved");
    // The document in memory (with "gone") is in history/, so nothing is lost.
    const history = (await dir.dir("history"))!;
    const texts = await Promise.all((await history.list()).map(async (entry) => (await history.readFile(entry.name))!.text));
    expect(texts.some((text) => text.includes('"gone"'))).toBe(true);
    // Nothing is saved over the other tool's file.
    await vi.advanceTimersByTimeAsync(5000);
    expect(parseProjectFile(dir.text("project.json")!).meta.appVersion).toBe("other");
    await s.close();
  });

  it("leaves the document alone when the file no longer parses", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    await dir.writeText("project.json", "{ not json");
    const outcome = await s.reloadFromDisk();
    expect(outcome.result).toBe("unreadable");
    expect(d.documentStore.getState().name).toBe("Reel");
    await s.close();
  });

  it("Keep mine: the next save backs the disk version up to history/ and overwrites it", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    d.documentStore.dispatch(renameProject("Mine"));
    s.autosaver.hold(true);
    await dir.writeText("project.json", serializeProject({ ...parseProjectFile(dir.text("project.json")!), name: "Theirs" }, { now: "2026-10-14T10:05:00.000Z", appVersion: "other" }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Theirs");
    s.autosaver.hold(false);
    await vi.advanceTimersByTimeAsync(1000);
    await s.autosaver.whenIdle();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Mine");
    const history = (await dir.dir("history"))!;
    const texts = await Promise.all((await history.list()).map(async (entry) => (await history.readFile(entry.name))!.text));
    expect(texts.some((text) => text.includes('"Theirs"'))).toBe(true);
    await s.close();
  });

  it("closing with the banner still up saves the work (Keep mine) instead of dropping it", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    d.documentStore.dispatch(renameProject("Unsaved"));
    s.autosaver.hold(true);
    await s.close();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Unsaved");
  });
});
