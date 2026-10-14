import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject } from "../core/commands/projectCommands.js";
import { createMemoryDir } from "../project/memoryFs.js";
import { createProject } from "../project/openProject.js";
import { parseProjectFile } from "../project/projectFile.js";
import { appView, retryOpen } from "./projectController.js";
import { documentStore } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks: same singletons, memory-backed.
vi.mock("./services.js", async () => {
  const { ActionRegistry } = await import("../core/commands/ActionRegistry.js");
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
  const { IdleQueue } = await import("../core/scheduler/IdleQueue.js");
  const { FrameScheduler } = await import("../core/scheduler/FrameScheduler.js");
  const sessionStore = createSessionStore();
  return {
    actions: new ActionRegistry(),
    appSettings: createAppSettings(memoryKeyValueStore()),
    appVersion: "test",
    documentStore: new DocumentStore(createDocument({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    focusScopes: new FocusScopeTracker(),
    idleQueue: new IdleQueue(
      () => 0,
      () => undefined,
    ),
    layoutStore: createLayoutStore(null),
    recentProjects: new RecentProjects(memoryKeyValueStore()),
    saveStatus: createStore(INITIAL_SAVE_STATUS),
    scheduler: new FrameScheduler(
      () => 0,
      () => undefined,
    ),
    sessionStore,
    workerPool: { request: () => new Promise(() => undefined) },
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
});
