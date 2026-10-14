import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject } from "../core/commands/projectCommands.js";
import { makeProject } from "../core/document/fixtures.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { Autosaver, type AutosaverOptions } from "./Autosaver.js";
import { ensureFolderLayout } from "./layout.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { parseProjectFile, serializeProject } from "./projectFile.js";

const STAMP = { now: "2026-10-14T09:00:00.000Z", appVersion: "test" };

async function setup(options: Partial<AutosaverOptions> = {}) {
  const dir = createMemoryDir();
  const project = makeProject();
  await ensureFolderLayout(dir);
  await dir.writeText("project.json", serializeProject(project, STAMP));
  dir.fs.log.length = 0;
  const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
  const autosaver = new Autosaver({ dir, getProject: store.getState, appVersion: "test", ...options });
  store.subscribe(() => autosaver.markDirty());
  let edits = 0;
  const edit = () => store.dispatch(renameProject(`Edit ${++edits}`));
  return { dir, store, autosaver, edit };
}

const projectWrites = (dir: MemoryDir) => dir.fs.log.filter((op) => op === "write project.json").length;
const savedName = (dir: MemoryDir) => parseProjectFile(dir.text("project.json")!).name;
const historyFiles = (dir: MemoryDir) => [...(dir.dirs.get("history")?.files.keys() ?? [])].sort();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Autosaver", () => {
  it("saves 1 s after the last change, not before", async () => {
    const { dir, autosaver, edit } = await setup();
    edit();
    expect(autosaver.status.getState().state).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(900);
    edit();
    await vi.advanceTimersByTimeAsync(900);
    expect(projectWrites(dir)).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    await autosaver.whenIdle();
    expect(projectWrites(dir)).toBe(1);
    expect(savedName(dir)).toBe("Edit 2");
    expect(autosaver.status.getState()).toMatchObject({ state: "saved", savedAt: "2026-10-14T10:00:01.900Z", error: null });
  });

  it("saves at most 5 s apart during continuous editing", async () => {
    const { dir, autosaver, edit } = await setup();
    const savesAt: number[] = [];
    for (let t = 0; t < 12_000; t += 250) {
      const before = projectWrites(dir);
      edit();
      await vi.advanceTimersByTimeAsync(250);
      await autosaver.whenIdle();
      if (projectWrites(dir) > before) savesAt.push(t + 250);
    }
    expect(savesAt).toEqual([5000, 10_000]);
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(projectWrites(dir)).toBe(3);
    expect(savedName(dir)).toBe("Edit 48");
  });

  it("writes the tmp, backs up the previous file, writes project.json, then deletes the tmp", async () => {
    const { dir, autosaver, edit } = await setup();
    const previous = dir.text("project.json");
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(dir.fs.log).toEqual([
      "write project.json.tmp",
      "write history/project-20261014-100001.json",
      "write project.json",
      "remove project.json.tmp",
    ]);
    expect(dir.text("history/project-20261014-100001.json")).toBe(previous);
    expect(dir.files.has("project.json.tmp")).toBe(false);
    expect(parseProjectFile(dir.text("project.json")!).meta.modifiedAt).toBe("2026-10-14T10:00:01.000Z");
  });

  it("twenty consecutive saves leave exactly 20 files in history/, and it stays at 20", async () => {
    const { dir, autosaver, edit } = await setup();
    for (let i = 1; i <= 25; i++) {
      edit();
      await vi.advanceTimersByTimeAsync(1000);
      await autosaver.whenIdle();
      if (i === 20) expect(historyFiles(dir)).toHaveLength(20);
    }
    const files = historyFiles(dir);
    expect(files).toHaveLength(20);
    // The newest backup holds the version before the last save.
    expect(parseProjectFile(dir.text(`history/${files.at(-1)}`)!).name).toBe("Edit 24");
    expect(parseProjectFile(dir.text(`history/${files[0]}`)!).name).toBe("Edit 5");
  });

  it("saveNow writes even without changes; saves within one second keep distinct backups", async () => {
    const { dir, autosaver } = await setup();
    await Promise.all([autosaver.saveNow(), autosaver.saveNow(), autosaver.saveNow()]);
    expect(projectWrites(dir)).toBe(3);
    expect(historyFiles(dir)).toEqual(["project-20261014-100000-2.json", "project-20261014-100000-3.json", "project-20261014-100000.json"]);
  });

  it("flush writes only pending changes", async () => {
    const { dir, autosaver, edit } = await setup();
    expect(await autosaver.flush()).toBe(true);
    expect(dir.fs.writes).toBe(0);
    edit();
    expect(await autosaver.flush()).toBe(true);
    expect(projectWrites(dir)).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(projectWrites(dir)).toBe(1);
  });

  it("a failed save sets the error status without throwing; a retry succeeds", async () => {
    const { dir, autosaver, edit } = await setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dir.fs.fail = (op, path) => op === "write" && path === "project.json";
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(autosaver.status.getState()).toMatchObject({ state: "error", error: "Simulated failure: write project.json" });
    expect(autosaver.isDirty).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    expect(await autosaver.flush()).toBe(false);

    dir.fs.fail = null;
    expect(await autosaver.saveNow()).toBe(true);
    expect(autosaver.status.getState()).toMatchObject({ state: "saved", error: null });
    expect(savedName(dir)).toBe("Edit 1");
  });

  it("gives changes made during a save their own save", async () => {
    const { dir, autosaver, edit } = await setup();
    edit();
    const first = autosaver.flush();
    edit(); // the first save is still writing
    expect(autosaver.status.getState().state).toBe("saving");
    await first;
    expect(autosaver.status.getState().state).toBe("unsaved");
    expect(savedName(dir)).toBe("Edit 1");
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(savedName(dir)).toBe("Edit 2");
    expect(autosaver.status.getState().state).toBe("saved");
  });

  it("read-only: attempts no writes; becoming writable saves the pending changes", async () => {
    const { dir, autosaver, edit } = await setup({ readOnly: true });
    expect(autosaver.status.getState()).toMatchObject({ state: "saved", readOnly: true });
    edit();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await autosaver.saveNow()).toBe(false);
    expect(await autosaver.flush()).toBe(false);
    expect(dir.fs.writes).toBe(0);
    expect(autosaver.status.getState()).toMatchObject({ state: "unsaved", readOnly: true });

    autosaver.setReadOnly(false);
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(savedName(dir)).toBe("Edit 1");
    expect(autosaver.status.getState()).toMatchObject({ state: "saved", readOnly: false });
  });

  it("follows the delay setting", async () => {
    const { dir, autosaver, edit } = await setup({ delayMs: 2000 });
    edit();
    await vi.advanceTimersByTimeAsync(1500);
    expect(projectWrites(dir)).toBe(0);
    autosaver.setDelay(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await autosaver.whenIdle();
    expect(projectWrites(dir)).toBe(1);
  });

  it("reports each successful save", async () => {
    const onSaved = vi.fn();
    const { autosaver, edit } = await setup({ onSaved });
    edit();
    await autosaver.flush();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: "Edit 1" }), "2026-10-14T10:00:00.000Z");
  });

  it("stops after dispose", async () => {
    const { dir, autosaver, edit } = await setup();
    edit();
    autosaver.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dir.fs.writes).toBe(0);
  });
});
