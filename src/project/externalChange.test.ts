import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver } from "./Autosaver.js";
import { ExternalWatcher } from "./externalChange.js";
import { createMemoryDir } from "./memoryFs.js";
import { createProject } from "../core/document/project.js";

const project = () => createProject({ id: "p", name: "P", now: "2026-11-07T00:00:00.000Z", appVersion: "test" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ExternalWatcher", () => {
  it("reports a change another tool made, once, and nothing for the app's own writes", async () => {
    const dir = createMemoryDir("P");
    await dir.writeText("project.json", "{}");
    const saver = new Autosaver({ dir, getProject: project, appVersion: "t", delayMs: 10 });
    const changes: unknown[] = [];
    const watcher = new ExternalWatcher({ dir, written: () => saver.lastWritten, busy: () => false, onChange: (stamp) => changes.push(stamp) });
    await watcher.start();
    expect(await watcher.check()).toBe(false);

    saver.markDirty();
    await saver.saveNow();
    expect(saver.lastWritten).not.toBeNull();
    expect(await watcher.check()).toBe(false);

    await dir.writeText("project.json", '{"edited":true}');
    expect(await watcher.check()).toBe(true);
    expect(changes).toHaveLength(1);
    expect(await watcher.check()).toBe(false);
    watcher.stop();
  });

  it("waits while busy and checks every 5 s only while the window is visible", async () => {
    const dir = createMemoryDir("P");
    await dir.writeText("project.json", "{}");
    let busy = true;
    let visible = false;
    const doc = Object.defineProperty(new EventTarget(), "visibilityState", { get: () => (visible ? "visible" : "hidden") }) as unknown as Document;
    const onChange = vi.fn();
    const watcher = new ExternalWatcher({ dir, written: () => null, busy: () => busy, onChange, doc });
    await watcher.start();
    await dir.writeText("project.json", "changed");

    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).not.toHaveBeenCalled(); // hidden window
    visible = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).not.toHaveBeenCalled(); // busy (a gesture, a save or an export)
    busy = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("accept() makes the disk version the one seen (Keep mine, after a reload)", async () => {
    const dir = createMemoryDir("P");
    await dir.writeText("project.json", "{}");
    const onChange = vi.fn();
    const watcher = new ExternalWatcher({ dir, written: () => null, busy: () => false, onChange });
    await watcher.start();
    await dir.writeText("project.json", "one");
    const file = await dir.getFile("project.json");
    watcher.accept({ lastModified: file!.lastModified, size: file!.size });
    expect(await watcher.check()).toBe(false);
    await dir.writeText("project.json", "two!");
    expect(await watcher.check()).toBe(true);
    watcher.stop();
  });
});

describe("Autosaver hold", () => {
  it("writes nothing while held and saves what is unsaved once released", async () => {
    const dir = createMemoryDir("P");
    const saver = new Autosaver({ dir, getProject: project, appVersion: "t", delayMs: 10 });
    saver.hold(true);
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(200);
    expect(await dir.readFile("project.json")).toBeNull();
    saver.hold(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await dir.readFile("project.json")).not.toBeNull();
    saver.dispose();
  });
});
