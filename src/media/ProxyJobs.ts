// The proxies of the open project (spec §9.5, §12, §3.4). The document's `proxy.status` is the queue:
// - Videos with no proxy decision yet get one from the settings: "pending" when automatic proxies are
//   on and the rule picks them (the import, an older project, a rule changed), else nothing. Generate
//   proxy marks a video pending; Remove proxy marks it "none" (never made again on its own) and
//   deletes its files. Status changes go through `amend`: no undo step.
// - One job at a time, oldest pending video first: proxy.worker makes the file and streams its bytes,
//   written at their positions into cache/proxies/<id>.mp4.part; once complete the .part is renamed
//   to <id>.mp4 and the proxy becomes "ready" with its size. A failure marks it "failed" (not tried
//   again this session); a cancel (Remove proxy, the media removed, the project closed) aborts the
//   write and deletes the .part.
// - Paused while the IdleQueue is (playback, timeline drags) and while an export runs (Batch 43: the
//   app's `idle` pauser joins both): the worker stops feeding its decoder, and no job starts.
// - On open, .part files (and the browser's .crswap swap files) of interrupted jobs are deleted, and
//   their pending videos start over from the beginning (an MP4 cannot be continued); ready proxies
//   whose file is gone are made again.
// - A video whose file changed (a relink, its undo or redo, Batch 41: `filesChanged`) is tried again;
//   when the file holds other content its proxy (ready, failed or being made) is made again from it.
// - `progress` gives the running job's share done (the cards draw it without React, P1).
import { setMediaProxy } from "../core/commands/mediaCommands.js";
import type { Affect, Command } from "../core/commands/command.js";
import { fpsToNumber } from "../core/document/time.js";
import type { MediaId, MediaItem, Project } from "../core/document/types.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createStore, type Store } from "../core/store/createStore.js";
import type { FsWritable } from "../project/fs.js";
import { errorMessage } from "../project/errorMessage.js";
import { PROXIES_DIR, proxyPath } from "../project/mediaFiles.js";
import { proxySize, wantsProxy, type ProxySettings } from "./proxy/proxyFormat.js";
import { isAbortError } from "./workers/protocol.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

export interface ProxyFiles {
  /** The source file of a media, or null when it is missing. */
  source(mediaId: MediaId): Promise<File | null>;
  /** Its sample index in cache/index/, or null. */
  sampleIndex(mediaId: MediaId): Promise<Blob | null>;
  /** Creates cache/proxies/<id>.mp4.part for positional writes. */
  openPart(mediaId: MediaId): Promise<FsWritable>;
  /** Renames the finished .part to cache/proxies/<id>.mp4. */
  commit(mediaId: MediaId): Promise<void>;
  removePart(mediaId: MediaId): Promise<void>;
  /** Deletes the .part and the proxy. */
  remove(mediaId: MediaId): Promise<void>;
  /** Names of the files in cache/proxies/ (none when the folder is missing). */
  list(): Promise<string[]>;
  /** Deletes a file of cache/proxies/ by name. */
  removeName(name: string): Promise<void>;
}

export interface ProxyJobsDeps {
  document: {
    getState(): Project;
    amend(command: Command): void;
    subscribe(listener: () => void, options: { affects: readonly Affect[] }): () => void;
  };
  workers: Pick<WorkerPool, "request">;
  files: ProxyFiles;
  settings(): ProxySettings;
  /** Calls `listener` when the settings change. */
  watchSettings(listener: () => void): () => void;
  idle: Pick<IdleQueue, "isPaused" | "onPauseChange">;
  isWritable(): boolean;
}

export interface ProxyProgress {
  /** The video whose proxy is being made, or null. */
  mediaId: MediaId | null;
  /** 0..1 */
  fraction: number;
}

interface Running {
  mediaId: MediaId;
  controller: AbortController;
}

/** Files of interrupted jobs: the part file and the browser's swap file of a writable stream. */
const LEFTOVER = /\.(part|crswap)$/;

const isVideo = (item: MediaItem | undefined): item is MediaItem => item?.kind === "video" && Boolean(item.width && item.height);

export class ProxyJobs {
  readonly progress: Store<ProxyProgress> = createStore<ProxyProgress>({ mediaId: null, fraction: 0 });
  private running: Running | null = null;
  /** Videos whose proxy failed this session. */
  private readonly failed = new Set<MediaId>();
  /** Videos whose file now holds other content: their proxy is made again at the next sync. */
  private readonly remake = new Set<MediaId>();
  private started = false;
  private disposed = false;
  private syncQueued = false;
  private readonly stops: (() => void)[] = [];
  private idleResolvers: (() => void)[] = [];

  constructor(private readonly deps: ProxyJobsDeps) {}

  /** Cleans up interrupted jobs, then follows the document, the settings and the pauses. */
  attach(): () => void {
    const { document, idle } = this.deps;
    this.stops.push(
      document.subscribe(() => this.queueSync(), { affects: ["media"] }),
      this.deps.watchSettings(() => this.queueSync()),
      idle.onPauseChange((paused) => {
        if (this.running) this.sendPause(paused);
        if (!paused) this.queueSync();
      }),
    );
    void this.start();
    return () => this.dispose();
  }

  /** Marks videos pending (Generate proxy); those with a ready or running proxy are left as they are. False in a read-only project. */
  generate(ids: readonly MediaId[]): boolean {
    if (!this.deps.isWritable()) return false;
    for (const id of ids) {
      const item = this.deps.document.getState().media[id];
      if (!isVideo(item) || item.proxy?.status === "pending" || item.proxy?.status === "ready") continue;
      this.failed.delete(id);
      this.markPending(item);
    }
    this.queueSync();
    return true;
  }

  /** Playback fell behind on a video with no proxy decision (Auto quality): make one. */
  generateIfUndecided(id: MediaId): void {
    const item = this.deps.document.getState().media[id];
    if (isVideo(item) && !item.proxy && this.deps.isWritable()) this.generate([id]);
  }

  /** Remove proxy: cancels a job, deletes the files, marks it "none". False in a read-only project. */
  remove(ids: readonly MediaId[]): boolean {
    if (!this.deps.isWritable()) return false;
    for (const id of ids) {
      const item = this.deps.document.getState().media[id];
      if (!item?.proxy || item.proxy.status === "none") continue;
      if (this.running?.mediaId === id) this.running.controller.abort();
      this.deps.document.amend(setMediaProxy(id, { ...item.proxy, status: "none" }));
      this.deps.files.remove(id).catch((error: unknown) => console.warn(`[proxy] could not delete the proxy of ${id}: ${errorMessage(error)}`));
    }
    return true;
  }

  /**
   * These videos' files changed (a relink, its undo or redo): a failure of the other file is
   * forgotten, and the proxies of the `replaced` ones (the file holds other content now) are made
   * again: a ready or failed one becomes pending, a running job starts over; "none" stays.
   */
  filesChanged(ids: readonly MediaId[], replaced: readonly MediaId[]): void {
    for (const id of ids) this.failed.delete(id);
    for (const id of replaced) {
      this.failed.delete(id);
      this.remake.add(id);
      if (this.running?.mediaId === id) this.running.controller.abort();
    }
    this.queueSync();
  }

  /** Resolves when no job runs and none can start (tests). */
  whenIdle(): Promise<void> {
    if (!this.running && !this.syncQueued && this.started) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const stop of this.stops.splice(0)) stop();
    this.running?.controller.abort();
    this.resolveIdle();
  }

  private async start(): Promise<void> {
    if (this.deps.isWritable()) {
      const names = await this.deps.files.list().catch(() => [] as string[]);
      for (const name of names) {
        if (LEFTOVER.test(name)) await this.deps.files.removeName(name).catch(() => undefined);
      }
      if (this.disposed) return;
      const present = new Set(names);
      for (const item of Object.values(this.deps.document.getState().media)) {
        if (isVideo(item) && item.proxy?.status === "ready" && !present.has(proxyPath(item.id).slice(PROXIES_DIR.length + 1))) this.markPending(item);
      }
    }
    this.started = true;
    this.queueSync();
  }

  private queueSync(): void {
    if (this.syncQueued || this.disposed) return;
    this.syncQueued = true;
    // Never inside a document notification: a status write would notify the listeners again.
    queueMicrotask(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  private sync(): void {
    if (this.disposed || !this.started) return;
    const media = this.deps.document.getState().media;
    const settings = this.deps.settings();
    if (this.deps.isWritable()) {
      for (const id of this.remake) {
        const item = media[id];
        if (isVideo(item) && item.proxy && item.proxy.status !== "none") this.markPending(item);
      }
    }
    this.remake.clear();
    if (settings.auto && this.deps.isWritable()) {
      for (const item of Object.values(media)) if (isVideo(item) && !item.proxy && wantsProxy(item, settings.rule)) this.markPending(item);
    }
    const running = this.running;
    if (running && this.deps.document.getState().media[running.mediaId]?.proxy?.status !== "pending") running.controller.abort();
    if (this.running) return;
    const next = this.deps.isWritable() && !this.deps.idle.isPaused ? this.nextPending() : null;
    if (next) void this.run(next);
    else this.resolveIdle();
  }

  private nextPending(): MediaItem | null {
    const pending = Object.values(this.deps.document.getState().media).filter((item) => isVideo(item) && item.proxy?.status === "pending" && !this.failed.has(item.id));
    pending.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    return pending[0] ?? null;
  }

  private markPending(item: MediaItem): void {
    const size = proxySize(item.width as number, item.height as number, this.deps.settings().shortEdge);
    this.deps.document.amend(setMediaProxy(item.id, { relPath: proxyPath(item.id), ...size, status: "pending" }));
  }

  private sendPause(paused: boolean): void {
    this.deps.workers.request("pauseProxy", { paused }, { priority: "user" }).catch(() => undefined);
  }

  private async run(item: MediaItem): Promise<void> {
    const { files, workers, document } = this.deps;
    const mediaId = item.id;
    const controller = new AbortController();
    const running: Running = { mediaId, controller };
    this.running = running;
    this.progress.set({ mediaId, fraction: 0 });
    let writable: FsWritable | null = null;
    let writes: Promise<void> = Promise.resolve();
    try {
      const [file, cachedIndex] = await Promise.all([files.source(mediaId), files.sampleIndex(mediaId).catch(() => null)]);
      controller.signal.throwIfAborted();
      if (!file) throw new Error("the media file is missing");
      writable = await files.openPart(mediaId);
      controller.signal.throwIfAborted();
      const part = writable;
      this.sendPause(this.deps.idle.isPaused);
      const result = await workers.request(
        "makeProxy",
        { mediaId, file, cachedIndex, shortEdge: this.deps.settings().shortEdge, fps: item.fps ? fpsToNumber(item.fps) : 0 },
        {
          priority: "background",
          signal: controller.signal,
          onProgress: (value) => {
            if (value.kind === "progress") {
              this.progress.set({ mediaId, fraction: value.total > 0 ? Math.min(1, value.done / value.total) : 0 });
              return;
            }
            const bytes = new Uint8Array(value.bytes);
            // In order; a failed write stops the job (its reason is the failure, not a cancel).
            writes = writes.then(() => part.write(bytes, value.position)).catch((error: unknown) => {
              if (!controller.signal.aborted) controller.abort(error);
              throw error;
            });
          },
        },
      );
      await writes;
      controller.signal.throwIfAborted();
      writable = null;
      await part.close();
      await files.commit(mediaId);
      if (this.disposed || document.getState().media[mediaId]?.proxy?.status !== "pending") {
        // Removed while the file was finished.
        await files.remove(mediaId).catch(() => undefined);
        return;
      }
      document.amend(setMediaProxy(mediaId, { relPath: proxyPath(mediaId), width: result.width, height: result.height, status: "ready" }));
    } catch (error) {
      await writes.catch(() => undefined);
      if (writable) await writable.abort().catch(() => undefined);
      await files.removePart(mediaId).catch(() => undefined);
      const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;
      if (!isAbortError(reason)) {
        console.warn(`[proxy] no proxy for ${mediaId}: ${errorMessage(reason)}`);
        this.failed.add(mediaId);
        const current = document.getState().media[mediaId];
        if (!this.disposed && current?.proxy?.status === "pending") document.amend(setMediaProxy(mediaId, { ...current.proxy, status: "failed" }));
      }
    } finally {
      if (this.running === running) this.running = null;
      this.progress.set({ mediaId: null, fraction: 0 });
      this.queueSync();
    }
  }

  private resolveIdle(): void {
    for (const resolve of this.idleResolvers.splice(0)) resolve();
  }
}
