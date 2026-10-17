import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextPreset } from "../core/document/types.js";
import type { FsDir } from "../project/fs.js";
import { createMemoryDir } from "../project/memoryFs.js";
import { projectPresetsDir, readPresetFolder } from "../project/presetFiles.js";
import { formatPresetFile, formatPresetsFile, presetFileName } from "../text/presets.js";
import { DEFAULT_TEXT_STYLE } from "../text/style.js";
import { attachPresets, detachPresets, importPresets, presetLibrary } from "./presetController.js";
import { sessionStore } from "./services.js";

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
    themeBridge: new ThemeBridge(document.documentElement, () => () => "0"),
    workerPool: { request: () => new Promise(() => undefined) },
  };
});

const NOW = "2026-10-16T10:00:00.000Z";
const preset = (id: string): TextPreset => ({
  id,
  name: id.toUpperCase(),
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
});

/** `root` whose folder lookups wait until `open()`: the project's presets are still being read. */
function slowRoot(root: FsDir) {
  let open = () => undefined as void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const dir = new Proxy(root, {
    get(target, prop) {
      if (prop === "dir") {
        return async (name: string, options?: { create?: boolean }) => {
          await gate;
          return target.dir(name, options);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { dir, open };
}

/** The open picker returns a file holding `text`. */
function stubOpenPicker(text: string): void {
  Object.assign(window, { showOpenFilePicker: () => Promise.resolve([{ getFile: () => Promise.resolve({ text: () => Promise.resolve(text) }) }]) });
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
const ids = (presets: readonly TextPreset[]) => presets.map((item) => item.id).sort();

afterEach(() => {
  detachPresets();
  delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
});

describe("project presets", () => {
  it("keeps the presets read from presets/text when one is imported while the folder is read", async () => {
    const root = createMemoryDir();
    const folder = await projectPresetsDir(root, true);
    if (!folder) throw new Error("no folder");
    await folder.writeText(presetFileName("a"), formatPresetFile(preset("a")));
    await folder.writeText(presetFileName("b"), formatPresetFile(preset("b")));
    sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, presetScope: "project" } }));

    const slow = slowRoot(root);
    attachPresets(slow.dir, () => true);
    stubOpenPicker(formatPresetsFile([preset("c")]));
    await importPresets();
    expect(ids(presetLibrary.getState().project)).toEqual(["c"]);

    slow.open();
    await vi.waitFor(() => expect(ids(presetLibrary.getState().project)).toEqual(["a", "b", "c"]));
    await settle();
    expect(ids(presetLibrary.getState().project)).toEqual(["a", "b", "c"]);
    expect(ids((await readPresetFolder(folder, NOW)).presets)).toEqual(["a", "b", "c"]);
  });
});
