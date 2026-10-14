import { describe, expect, it, vi } from "vitest";
import { createAppSettings, DEFAULT_APP_SETTINGS } from "./appSettings.js";
import { memoryKeyValueStore } from "./kv.js";
import { RECENT_LIMIT, RecentProjects, type RecentProject } from "./recentProjects.js";

const entry = (id: string, extra: Partial<RecentProject> = {}) => ({
  id,
  name: `Project ${id}`,
  pathHint: `folder-${id}`,
  modified: "2026-10-14T10:00:00.000Z",
  handle: { folder: id },
  ...extra,
});

describe("RecentProjects", () => {
  it("adds entries newest first and moves a reopened one to the top", async () => {
    const kv = memoryKeyValueStore();
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.touch(entry("a", { name: "Renamed elsewhere" }));
    expect(recent.list.getState().map((e) => [e.id, e.name])).toEqual([
      ["a", "Renamed elsewhere"],
      ["b", "Project b"],
    ]);
    expect(recent.list.getState()[0]?.thumbnail).toBeNull();
    expect(kv.data.get("recent-projects.v1")).toEqual(recent.list.getState());
  });

  it("keeps at most RECENT_LIMIT entries", async () => {
    const recent = new RecentProjects(memoryKeyValueStore());
    for (let i = 0; i < RECENT_LIMIT + 3; i++) await recent.touch(entry(String(i)));
    expect(recent.list.getState()).toHaveLength(RECENT_LIMIT);
    expect(recent.list.getState()[0]?.id).toBe(String(RECENT_LIMIT + 2));
  });

  it("updates the name and modified date in place; unknown ids and no-op patches write nothing", async () => {
    const kv = memoryKeyValueStore();
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.update("a", { name: "New name", modified: "2026-10-15T00:00:00.000Z" });
    expect(recent.list.getState()[1]).toMatchObject({ id: "a", name: "New name", modified: "2026-10-15T00:00:00.000Z" });
    const set = vi.spyOn(kv, "set");
    const before = recent.list.getState();
    await recent.update("zzz", { name: "x" });
    await recent.update("a", { name: "New name" });
    expect(recent.list.getState()).toBe(before);
    expect(set).not.toHaveBeenCalled();
  });

  it("removes an entry", async () => {
    const recent = new RecentProjects(memoryKeyValueStore());
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.remove("a");
    expect(recent.list.getState().map((e) => e.id)).toEqual(["b"]);
  });

  it("loads what was stored, dropping malformed entries", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("recent-projects.v1", [entry("a"), { id: "broken" }, null, entry("b", { handle: null })]);
    const recent = new RecentProjects(kv);
    await recent.load();
    expect(recent.list.getState().map((e) => e.id)).toEqual(["a"]);
  });

  it("survives a storage failure", async () => {
    const kv = memoryKeyValueStore();
    kv.set = () => Promise.reject(new Error("quota"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    expect(recent.list.getState()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("app settings", () => {
  it("loads, updates and persists the autosave delay, rejecting values outside the list", async () => {
    const kv = memoryKeyValueStore();
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toEqual(DEFAULT_APP_SETTINGS);
    await settings.update({ autosaveDelayMs: 5000 });
    expect(kv.data.get("settings.v1")).toEqual({ autosaveDelayMs: 5000, importMode: "copy" });
    await settings.update({ autosaveDelayMs: 1234 });
    expect(settings.getState().autosaveDelayMs).toBe(5000);

    kv.data.set("settings.v1", { autosaveDelayMs: 10_000 });
    const reloaded = createAppSettings(kv);
    await reloaded.load();
    expect(reloaded.getState().autosaveDelayMs).toBe(10_000);
  });

  it("keeps the import mode setting (reference mode is stubbed until Batch 41)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { autosaveDelayMs: 1000, importMode: "reference" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().importMode).toBe("reference");
    await settings.update({ importMode: "link" as never });
    expect(settings.getState().importMode).toBe("reference");
  });
});
