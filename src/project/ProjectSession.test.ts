import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip } from "../core/commands/basicCommands.js";
import { renameProject } from "../core/commands/projectCommands.js";
import { makeSolidClip } from "../core/document/fixtures.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { fromSnapshot } from "../core/store/selection.js";
import { createSessionStore, setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { createProject as createDocument } from "../core/document/project.js";
import { createAppSettings } from "./appSettings.js";
import { INITIAL_SAVE_STATUS, type SaveStatus } from "./Autosaver.js";
import { memoryKeyValueStore } from "./kv.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { createProject, openProjectFolder } from "./openProject.js";
import { parseProjectFile, serializeProject } from "./projectFile.js";
import { ProjectSession } from "./ProjectSession.js";
import { RecentProjects } from "./recentProjects.js";
import { parseSessionFile } from "./sessionFile.js";

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
  dir.fs.log.length = 0;
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

describe("ProjectSession", () => {
  it("loads the project and its session, and records it in recent projects", async () => {
    const dir = await newProject();
    const d = deps();
    const project = parseProjectFile(dir.text("project.json")!);
    await dir.writeText(
      "session.json",
      JSON.stringify({ version: 1, state: { playhead: 42, snap: false }, selection: { clipIds: ["gone"], primary: "gone", kind: "clips" }, layout: { left: 0.6, top: 0.4, media: 0.45 } }),
    );
    const s = new ProjectSession(await openProjectFolder(dir), d);
    expect(d.documentStore.getState()).toEqual(project);
    expect(d.session.state.getState()).toMatchObject({ playhead: 42, snap: false });
    expect(d.session.selection.getState().kind).toBe("none"); // the clip does not exist
    expect(d.layout.getState().ratios).toEqual({ left: 0.6, top: 0.4, media: 0.45 });
    expect(d.recent.list.getState()[0]).toMatchObject({ id: project.id, name: "Reel", pathHint: "Reel", handle: dir });
    expect(d.saveStatus.getState()).toMatchObject({ state: "saved", readOnly: false });
    await s.close();
  });

  it("rename: project.json is updated after 1 s and the recent entry follows", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    d.documentStore.dispatch(renameProject("Final cut"));
    expect(d.recent.list.getState()[0]?.name).toBe("Final cut");
    expect(d.saveStatus.getState().state).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(1000);
    await s.autosaver.whenIdle();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Final cut");
    expect(d.recent.list.getState()[0]?.modified).toBe("2026-10-14T10:00:01.000Z");
    expect(d.saveStatus.getState().state).toBe("saved");
    await s.close();
  });

  it("saves session.json every 10 s when changed, and on close", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    const sessionWrites = () => dir.fs.log.filter((op) => op === "write session.json").length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sessionWrites()).toBe(0);
    setPlayhead(d.session, 90);
    d.layout.setRatios({ left: 0.7, top: 0.5, media: 0.5 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sessionWrites()).toBe(1);
    expect(parseSessionFile(dir.text("session.json")!)).toMatchObject({ state: { playhead: 90 }, layout: { left: 0.7 } });
    d.documentStore.dispatch(addClip(makeSolidClip({ id: "s1", trackId: trackId(d), start: 0, duration: 10 })));
    setSelection(d.session, fromSnapshot({ clipIds: ["s1"], primary: "s1", kind: "clips" }));
    await s.close();
    expect(sessionWrites()).toBe(2);
    expect(parseSessionFile(dir.text("session.json")!).selection.clipIds).toEqual(["s1"]);
    expect(Object.keys(parseProjectFile(dir.text("project.json")!).clips)).toEqual(["s1"]);
    // Detached: later changes write nothing.
    const writes = dir.fs.writes;
    setPlayhead(d.session, 5);
    d.documentStore.dispatch(renameProject("After close"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(dir.fs.writes).toBe(writes);
  });

  it("flushes when the tab is hidden", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), { ...d, doc: document });
    d.documentStore.dispatch(renameProject("Hidden"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await s.autosaver.whenIdle();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Hidden");
    await s.close();
  });

  it("read-only: edits stay in memory, nothing is written; allowing access saves them", async () => {
    const dir = await newProject();
    dir.fs.permissions.readwrite = "prompt";
    dir.fs.answers.readwrite = "denied";
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    expect(s.readOnly).toBe(true);
    expect(d.saveStatus.getState().readOnly).toBe(true);
    d.documentStore.dispatch(renameProject("Local only"));
    setPlayhead(d.session, 10);
    await vi.advanceTimersByTimeAsync(30_000);
    await s.flush();
    expect(await s.saveNow()).toBe(false);
    expect(dir.fs.writes).toBe(0);

    dir.fs.answers.readwrite = "granted";
    expect(await s.requestWriteAccess()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await s.autosaver.whenIdle();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Local only");
    expect(d.saveStatus.getState()).toMatchObject({ state: "saved", readOnly: false });
    await s.close();
  });

  it("restores a recovery file and saves it, keeping the replaced version in history", async () => {
    const dir = await newProject();
    const saved = parseProjectFile(dir.text("project.json")!);
    await dir.writeText("project.json.tmp", serializeProject({ ...saved, name: "Recovered" }, { now: "2026-10-14T09:59:00.000Z", appVersion: "test" }));
    const opened = await openProjectFolder(dir);
    const d = deps();
    const s = new ProjectSession(opened, d);
    s.restoreRecovery(opened.recovery!);
    expect(d.documentStore.getState().name).toBe("Recovered");
    expect(d.documentStore.history.getState().canUndo).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await s.autosaver.whenIdle();
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Recovered");
    expect(dir.files.has("project.json.tmp")).toBe(false);
    const history = [...dir.dirs.get("history")!.files.values()];
    expect(history.map((f) => parseProjectFile(f.text).name)).toEqual(["Reel"]);
    await s.close();
  });

  it("discarding a recovery deletes the tmp", async () => {
    const dir = await newProject();
    const saved = parseProjectFile(dir.text("project.json")!);
    await dir.writeText("project.json.tmp", serializeProject({ ...saved, name: "Recovered" }, { now: "x", appVersion: "test" }));
    const s = new ProjectSession(await openProjectFolder(dir), deps());
    await s.discardRecovery();
    expect(dir.files.has("project.json.tmp")).toBe(false);
    await s.close();
  });
});
