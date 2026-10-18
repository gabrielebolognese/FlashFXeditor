import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject } from "../core/commands/projectCommands.js";
import { createMemoryDir } from "../project/memoryFs.js";
import { createProject } from "../project/openProject.js";
import { parseProjectFile } from "../project/projectFile.js";
import { appView, closeProject, retryOpen } from "./projectController.js";
import { documentStore, workerPool } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks: same singletons, memory-backed.
vi.mock("./services.js", async () => {
  const { CommandRegistry } = await import("../core/commands/CommandRegistry.js");
  const { createProject: createDocument } = await import("../core/document/project.js");
  const { FocusScopeTracker } = await import("../core/keyboard/focusScope.js");
  const { createStore } = await import("../core/store/createStore.js");
  const { DocumentStore } = await import("../core/store/DocumentStore.js");
  const { createLayoutStore } = await import("../core/store/layoutStore.js");
  const { createSessionStore } = await import("../core/store/sessionStore.js");
  const { createAppSettings } = await import("../project/appSettings.js");
  const { INITIAL_SAVE_STATUS } = await import("../project/Autosaver.js");
  const { memoryKeyValueStore } = await import("../project/kv.js");
  const { RecentProjects } = await import("../project/recentProjects.js");
  const { TemplateStore } = await import("../project/templates.js");
  const { IdleQueue } = await import("../core/scheduler/IdleQueue.js");
  const { FrameScheduler } = await import("../core/scheduler/FrameScheduler.js");
  const { ThemeBridge } = await import("../core/theme/theme.js");
  const { AudioClock } = await import("../audio/AudioClock.js");
  const { FontLibrary } = await import("../render/text/FontLibrary.js");
  const sessionStore = createSessionStore();
  return {
    actions: new CommandRegistry(),
    appSettings: createAppSettings(memoryKeyValueStore()),
    appVersion: "test",
    audioClock: new AudioClock(),
    documentStore: new DocumentStore(createDocument({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    focusScopes: new FocusScopeTracker(),
    fontLibrary: new FontLibrary(null),
    idleQueue: new IdleQueue(
      () => 0,
      () => undefined,
    ),
    keyValueStore: memoryKeyValueStore(),
    layoutStore: createLayoutStore(null),
    recentProjects: new RecentProjects(memoryKeyValueStore()),
    saveStatus: createStore(INITIAL_SAVE_STATUS),
    scheduler: new FrameScheduler(
      () => 0,
      () => undefined,
    ),
    sessionStore,
    templateStore: new TemplateStore(memoryKeyValueStore()),
    themeBridge: new ThemeBridge(document.documentElement, () => () => "0"),
    workerPool: { request: () => new Promise(() => undefined), stop: vi.fn(), running: [], inFlightByKind: () => ({}) },
  };
});

beforeEach(() => {
  // Autosave timers never fire on their own: only an explicit flush can write.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("projectController", () => {
  it("saves the open project before reading its folder again", async () => {
    const dir = createMemoryDir("Reel");
    await createProject(dir, "Reel", { width: 1080, height: 1920, fps: { num: 30, den: 1 } }, { appVersion: "test" });
    await retryOpen(dir);
    expect(appView.getState().project?.folder).toBe("Reel");

    documentStore.dispatch(renameProject("Renamed"));
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Reel");

    // Reopen the same folder before the autosave delay has elapsed.
    await retryOpen(dir);
    expect(appView.getState().dialog).toBeNull();
    expect(documentStore.getState().name).toBe("Renamed");
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Renamed");
  });

  it("stops the project's workers and leaves an empty document when the project closes", async () => {
    const dir = createMemoryDir("Close");
    await createProject(dir, "Close", { width: 1080, height: 1920, fps: { num: 30, den: 1 } }, { appVersion: "test" });
    await retryOpen(dir);
    const stop = vi.mocked(workerPool.stop);
    stop.mockClear();
    documentStore.dispatch(renameProject("Edited"));
    await closeProject();
    expect(stop.mock.calls.map(([kind]) => kind).sort()).toEqual(["analysis", "decode", "proxy"]);
    expect(appView.getState().project).toBeNull();
    expect(documentStore.getState().name).toBe("Untitled project");
    expect(documentStore.history.getState().canUndo).toBe(false);
    // Saved on the way out.
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Edited");
  });
});
