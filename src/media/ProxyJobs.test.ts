import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia, setMediaProxy } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaItem, Project } from "../core/document/types.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { openWritableAt, PROXIES_DIR, proxyPartPath, proxyPath, removeFileAt, renameFileAt, resolveFile, writeFileAt } from "../project/mediaFiles.js";
import { createMemoryDir, type MemoryDir } from "../project/memoryFs.js";
import type { MakeProxyParams, ProxyProgress } from "./proxy/ProxyMaker.js";
import type { ProxySettings } from "./proxy/proxyFormat.js";
import { ProxyJobs, type ProxyFiles } from "./ProxyJobs.js";

const video = (id: string, fields: Partial<MediaItem> = {}): MediaItem => ({
  ...makeMedia(id, "video", 10_000_000),
  width: 3840,
  height: 2160,
  fps: { num: 60, den: 1 },
  ...fields,
});

interface Job {
  params: MakeProxyParams;
  signal: AbortSignal;
  emit: (value: ProxyProgress) => void;
  finish: (frames?: number) => void;
  fail: (error: Error) => void;
}

function setup(options: { media?: MediaItem[]; settings?: Partial<ProxySettings>; root?: MemoryDir; writable?: boolean } = {}) {
  const project: Project = makeProject();
  const root = options.root ?? createMemoryDir();
  const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
  if (options.media) store.dispatch(addMedia(options.media));
  const idle = new IdleQueue(
    () => 0,
    () => undefined,
  );
  const settings = createStore<ProxySettings>({ auto: true, rule: "heavy", shortEdge: 540, ...options.settings });
  const jobs: Job[] = [];
  const pauses: boolean[] = [];
  const request = vi.fn((method: string, params: unknown, opts: { signal?: AbortSignal; onProgress?: (value: ProxyProgress) => void } = {}) => {
    if (method === "pauseProxy") {
      pauses.push((params as { paused: boolean }).paused);
      return Promise.resolve(null);
    }
    if (method !== "makeProxy") return Promise.reject(new Error(method));
    return new Promise((resolve, reject) => {
      const signal = opts.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason));
      jobs.push({
        params: params as MakeProxyParams,
        signal,
        emit: (value) => opts.onProgress?.(value),
        finish: (frames = 10) => resolve({ width: 960, height: 540, codec: "avc1.4d4020", frames, bytes: 4 }),
        fail: reject,
      });
    });
  });
  const files: ProxyFiles = {
    source: async (id) => (store.getState().media[id] ? new File(["source"], `${id}.mp4`) : null),
    sampleIndex: async () => null,
    openPart: (id) => openWritableAt(root, proxyPartPath(id)),
    commit: (id) => renameFileAt(root, proxyPartPath(id), proxyPath(id)),
    removePart: (id) => removeFileAt(root, proxyPartPath(id)),
    remove: async (id) => {
      await removeFileAt(root, proxyPartPath(id));
      await removeFileAt(root, proxyPath(id));
    },
    list: async () => {
      const dir = await root.dir("cache").then((cache) => cache?.dir("proxies"));
      return dir ? (await dir.list()).map((entry) => entry.name) : [];
    },
    removeName: (name) => removeFileAt(root, `${PROXIES_DIR}/${name}`),
  };
  let writable = options.writable ?? true;
  const proxies = new ProxyJobs({
    document: store,
    workers: { request: request as never },
    files,
    settings: () => settings.getState(),
    watchSettings: (listener) => settings.subscribe(listener),
    idle,
    isWritable: () => writable,
  });
  const stop = proxies.attach();
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const proxy = (id: string) => store.getState().media[id]?.proxy;
  const exists = async (path: string) => (await resolveFile(root, path)) !== null;
  return { store, root, idle, settings, jobs, pauses, request, proxies, stop, flush, proxy, exists, setWritable: (value: boolean) => (writable = value) };
}

describe("ProxyJobs", () => {
  it("marks the videos the rule picks pending with no undo step, one decision each", async () => {
    const t = setup({ media: [video("uhd"), video("hd", { width: 1920, height: 1080, fps: { num: 30, den: 1 } }), makeMedia("song", "audio")] });
    await t.flush();
    expect(t.proxy("uhd")).toEqual({ relPath: "cache/proxies/uhd.mp4", width: 960, height: 540, status: "pending" });
    expect(t.proxy("hd")).toBeUndefined();
    expect(t.proxy("song")).toBeUndefined();
    expect(t.store.history.getState().undoLabel).toBe("Import 3 media files");
    // A rule change decides again for videos with no decision yet.
    t.settings.set({ auto: true, rule: "all", shortEdge: 360 });
    await t.flush();
    expect(t.proxy("hd")).toMatchObject({ width: 640, height: 360, status: "pending" });
  });

  it("makes nothing on its own when automatic proxies are off", async () => {
    const t = setup({ media: [video("uhd")], settings: { auto: false } });
    await t.flush();
    expect(t.proxy("uhd")).toBeUndefined();
    expect(t.jobs).toEqual([]);
  });

  it("runs one job at a time, writes the bytes at their positions, renames the part file and marks it ready", async () => {
    const t = setup({ media: [video("a", { addedAt: "2026-01-01T00:00:01.000Z" }), video("b", { addedAt: "2026-01-01T00:00:02.000Z" })] });
    await t.flush();
    expect(t.jobs).toHaveLength(1);
    const job = t.jobs[0] as Job;
    expect(job.params).toMatchObject({ mediaId: "a", shortEdge: 540, fps: 60 });
    expect(await t.exists(proxyPartPath("a"))).toBe(true);
    job.emit({ kind: "data", position: 0, bytes: new Uint8Array([0, 0, 0, 0]).buffer });
    job.emit({ kind: "progress", done: 5, total: 10 });
    expect(t.proxies.progress.getState()).toEqual({ mediaId: "a", fraction: 0.5 });
    job.emit({ kind: "data", position: 2, bytes: new Uint8Array([7, 8]).buffer });
    job.emit({ kind: "data", position: 0, bytes: new Uint8Array([1]).buffer });
    job.finish();
    await t.flush();
    expect(t.proxy("a")).toEqual({ relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "ready" });
    expect(await t.exists(proxyPartPath("a"))).toBe(false);
    const file = (await resolveFile(t.root, proxyPath("a"))) as File;
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 0, 7, 8]);
    expect(t.jobs).toHaveLength(2);
    expect(t.jobs[1]?.params.mediaId).toBe("b");
    expect(t.proxies.progress.getState().mediaId).toBe("b");
  });

  it("pauses the running job while the IdleQueue is paused and starts none meanwhile", async () => {
    const t = setup({ media: [video("a")] });
    await t.flush();
    expect(t.pauses).toEqual([false]);
    t.idle.pause("playback");
    t.idle.resume("playback");
    expect(t.pauses).toEqual([false, true, false]);
    t.idle.pause("gesture");
    t.jobs[0]?.finish();
    t.store.dispatch(addMedia([video("b")]));
    await t.flush();
    expect(t.proxy("a")?.status).toBe("ready");
    expect(t.proxy("b")?.status).toBe("pending");
    expect(t.jobs).toHaveLength(1);
    t.idle.resume("gesture");
    await t.flush();
    expect(t.jobs).toHaveLength(2);
  });

  it("Remove proxy cancels the job, deletes the part file and is never made again on its own", async () => {
    const t = setup({ media: [video("a")] });
    await t.flush();
    const job = t.jobs[0] as Job;
    job.emit({ kind: "data", position: 0, bytes: new Uint8Array([1, 2]).buffer });
    expect(t.proxies.remove(["a"])).toBe(true);
    await t.flush();
    expect(job.signal.aborted).toBe(true);
    expect(t.proxy("a")?.status).toBe("none");
    expect(await t.exists(proxyPartPath("a"))).toBe(false);
    expect(await t.exists(proxyPath("a"))).toBe(false);
    expect(t.root.writing.size).toBe(0);
    t.settings.set({ auto: true, rule: "all", shortEdge: 540 });
    await t.flush();
    expect(t.jobs).toHaveLength(1);
    // Generate proxy brings it back.
    t.proxies.generate(["a"]);
    await t.flush();
    expect(t.jobs).toHaveLength(2);
  });

  it("Generate proxy leaves a ready proxy alone and makes the others", async () => {
    const t = setup({ media: [video("a", { addedAt: "2026-01-01T00:00:01.000Z" }), video("b", { addedAt: "2026-01-01T00:00:02.000Z" })], settings: { auto: false } });
    await t.flush();
    t.proxies.generate(["a"]);
    await t.flush();
    t.jobs[0]?.finish();
    await t.flush();
    expect(t.proxy("a")?.status).toBe("ready");
    t.store.amend(setMediaProxy("b", { relPath: "cache/proxies/b.mp4", width: 960, height: 540, status: "none" }));
    expect(t.proxies.generate(["a", "b"])).toBe(true);
    expect(t.proxy("a")?.status).toBe("ready");
    expect(t.proxy("b")?.status).toBe("pending");
    await t.flush();
    expect(t.jobs.map((job) => job.params.mediaId)).toEqual(["a", "b"]);
    t.jobs[1]?.finish();
    await t.flush();
    expect(t.proxy("b")?.status).toBe("ready");
    expect(t.jobs).toHaveLength(2);
  });

  it("removes a ready proxy's file", async () => {
    const t = setup({ media: [video("a")] });
    await t.flush();
    t.jobs[0]?.finish();
    await t.flush();
    expect(await t.exists(proxyPath("a"))).toBe(true);
    t.proxies.remove(["a"]);
    await t.flush();
    expect(await t.exists(proxyPath("a"))).toBe(false);
  });

  it("cancels the job of a media that leaves the project", async () => {
    const t = setup({ media: [video("a")] });
    await t.flush();
    t.store.dispatch(removeMedia(["a"]));
    await t.flush();
    expect(t.jobs[0]?.signal.aborted).toBe(true);
    expect(await t.exists(proxyPartPath("a"))).toBe(false);
  });

  it("marks a failed proxy failed, deletes its part file and does not try it again this session", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const t = setup({ media: [video("a")] });
    await t.flush();
    t.jobs[0]?.fail(new Error("decoder died"));
    await t.flush();
    expect(t.proxy("a")?.status).toBe("failed");
    expect(await t.exists(proxyPartPath("a"))).toBe(false);
    expect(t.jobs).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("makes a proxy again when its file holds other content (a relink undone or redone); a failure is forgotten on any file change", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ready = { relPath: "cache/proxies/r.mp4", width: 960, height: 540, status: "ready" as const };
    const root = createMemoryDir();
    await writeFileAt(root, proxyPath("r"), new Blob(["r"]));
    await writeFileAt(root, proxyPath("same"), new Blob(["same"]));
    const t = setup({ root, media: [video("r", { proxy: ready }), video("f"), video("n", { proxy: { ...ready, relPath: "cache/proxies/n.mp4", status: "none" } }), video("same", { proxy: { ...ready, relPath: "cache/proxies/same.mp4" } })] });
    await t.flush();
    expect(t.jobs.map((job) => job.params.mediaId)).toEqual(["f"]);
    t.jobs[0]?.fail(new Error("the media file is missing"));
    await t.flush();
    expect(t.proxy("f")?.status).toBe("failed");
    expect(t.jobs).toHaveLength(1);
    // Same content: a ready proxy stays; the failed one is tried again once its proxy is decided again.
    t.proxies.filesChanged(["same", "f"], []);
    await t.flush();
    expect(t.proxy("same")?.status).toBe("ready");
    expect(t.proxy("f")?.status).toBe("failed");
    expect(t.proxies.generate(["f"])).toBe(true);
    await t.flush();
    expect(t.jobs).toHaveLength(2);
    expect(t.jobs[1]?.params.mediaId).toBe("f");
    // Other content: ready becomes pending, "none" stays, the running job is cancelled and queued again.
    t.proxies.filesChanged(["r", "n", "f"], ["r", "n", "f"]);
    await t.flush();
    expect(t.jobs[1]?.signal.aborted).toBe(true);
    expect(t.proxy("r")?.status).toBe("pending");
    expect(t.proxy("n")?.status).toBe("none");
    expect(t.proxy("f")?.status).toBe("pending");
    expect(t.jobs).toHaveLength(3);
    expect(t.jobs[2]?.params.mediaId).toBe("r");
    expect(t.store.history.getState().undoLabel).toBe("Import 4 media files");
    warn.mockRestore();
  });

  it("on open, deletes the files of interrupted jobs, restarts pending ones and remakes ready proxies whose file is gone", async () => {
    const root = createMemoryDir();
    await writeFileAt(root, proxyPartPath("a"), new Blob(["half"]));
    await writeFileAt(root, `${proxyPartPath("a")}.crswap`, new Blob(["swap"]));
    await writeFileAt(root, proxyPath("c"), new Blob(["done"]));
    const pending = { relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "pending" as const };
    const t = setup({
      root,
      media: [
        video("a", { proxy: pending, addedAt: "2026-01-01T00:00:01.000Z" }),
        video("b", { proxy: { ...pending, relPath: "cache/proxies/b.mp4", status: "ready" }, addedAt: "2026-01-01T00:00:02.000Z" }),
        video("c", { proxy: { ...pending, relPath: "cache/proxies/c.mp4", status: "ready" } }),
      ],
    });
    await t.flush();
    expect(root.tree().filter((path) => path.startsWith("cache/proxies/") && !path.endsWith("/"))).toEqual(["cache/proxies/a.mp4.part", "cache/proxies/c.mp4"]);
    expect(t.proxy("b")?.status).toBe("pending");
    expect(t.proxy("c")?.status).toBe("ready");
    expect(t.jobs.map((job) => job.params.mediaId)).toEqual(["a"]);
    // The restarted job writes from the beginning into a fresh part file.
    expect((await resolveFile(root, proxyPartPath("a")))?.size).toBe(0);
  });

  it("does nothing in a read-only project", async () => {
    const t = setup({ media: [video("a", { proxy: { relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "pending" } }), video("b")], writable: false });
    await t.flush();
    expect(t.jobs).toEqual([]);
    expect(t.proxy("b")).toBeUndefined();
    expect(t.proxies.generate(["b"])).toBe(false);
    expect(t.proxies.remove(["a"])).toBe(false);
  });

  it("queues a proxy for a video playback fell behind on, only when it has no decision", async () => {
    const t = setup({ media: [video("hd", { width: 1920, height: 1080, fps: { num: 30, den: 1 } }), video("gone", { width: 1920, height: 1080, fps: { num: 30, den: 1 } })] });
    await t.flush();
    t.store.amend(setMediaProxy("gone", { relPath: "cache/proxies/gone.mp4", width: 960, height: 540, status: "none" }));
    t.proxies.generateIfUndecided("hd");
    t.proxies.generateIfUndecided("gone");
    await t.flush();
    expect(t.proxy("hd")?.status).toBe("pending");
    expect(t.proxy("gone")?.status).toBe("none");
  });

  it("stops the running job when disposed", async () => {
    const t = setup({ media: [video("a")] });
    await t.flush();
    t.stop();
    await t.flush();
    expect(t.jobs[0]?.signal.aborted).toBe(true);
    expect(t.proxy("a")?.status).toBe("pending");
  });
});
