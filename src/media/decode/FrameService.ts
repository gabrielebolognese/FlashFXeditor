// Frame requests on the main thread (spec §3.5, §9.3, P5, P8, P13). `getFrame` answers from the
// TexturePool when the frame is cached; otherwise it asks decode.worker and uploads what comes back
// (the VideoFrame is closed right after the upload), under `(mediaId, lod, frameTimeUs)`.
// - Priorities: scrub > playback > idle. A new scrub supersedes the previous scrub of the same media
//   and cancels its prefetches (P8). At most MAX_IN_FLIGHT_PER_MEDIA requests per media go to the
//   worker; the rest wait here, most urgent first.
// - Progressive scrub (P8): the nearest cached frame is shown at once, then the keyframe the worker
//   decodes first when it is closer, then the exact frame.
// - The project supplies the files and the cache/index/ files through a `FrameSource`.
// - Frames are uploaded at most at `uploadSize()` on the long edge (the preview's detail, §7.1). A
//   request with `minLongEdge` decodes a cached frame that is smaller again, and a frame that arrives
//   for a key cached smaller than the current upload size replaces it (the old texture is destroyed;
//   whoever draws it takes the new one from the pool on its next pass).
// - Frame requests that go to the decoder are announced (`onDecodeRequest`) and counted
//   (`decodesInFlight`): background decoders (thumbnail sheets) yield to them.
// - Proxies (spec §9.5): `lodFor` routes a request that wants the proxy to it when the media has one
//   ready (`proxyReady`) and it opened, else to the full file. A proxy that fails to open (file gone,
//   no decoder) is not used again until it is released (removed or made again).
import type { MediaId } from "../../core/document/types.js";
import { percentiles } from "../../core/perf/perfMath.js";
import { fitWithin } from "../../render/gpu/fitWithin.js";
import type { Renderer, TextureHandle } from "../../render/gpu/renderer.js";
import type { Lod, TextureKey, TexturePool } from "../cache/TexturePool.js";
import { mediaTimePosition, positionAt } from "../demux/sampleIndex.js";
import { abortError, FRAME_PRIORITY_RANK, type DeliveredFrame, type FramePriority, type Priority, type VideoInfo, type WorkerDecodeStats } from "../workers/protocol.js";
import type { WorkerPool } from "../workers/WorkerPool.js";

export const MAX_IN_FLIGHT_PER_MEDIA = 4;
/** Latency samples kept for the percentiles. */
const LATENCY_SAMPLES = 128;

/** Worker queue class of each frame priority. */
const WORKER_PRIORITY: Record<FramePriority, Priority> = { scrub: "user", playback: "playback", idle: "prefetch" };

/** Where the open project keeps a media's file and its cached sample index. */
export interface FrameSource {
  file(mediaId: MediaId, lod: Lod): Promise<File | null>;
  /** cache/index/ file, or null. */
  readIndex(mediaId: MediaId, lod: Lod): Promise<Blob | null>;
  /** Stores a newly built index (a read-only project skips it). */
  writeIndex(mediaId: MediaId, lod: Lod, bytes: ArrayBuffer): Promise<void>;
}

export interface FrameResult {
  /** In the pool under `key`; pin the key to keep drawing it. */
  texture: TextureHandle;
  key: TextureKey;
  /** The frame's time (us): the frame shown at the requested time, or a stand-in near it when `approximate`. */
  timeUs: number;
  /** A stand-in (P8), or, for a request's own result, the nearest frame the decoder could produce. */
  approximate: boolean;
}

export interface PrefetchOptions {
  lod?: Lod;
  /** `playback` windows go before `idle` warming (default `idle`). */
  priority?: Exclude<FramePriority, "scrub">;
  /** Every stride-th frame of the range (shuttle speeds). */
  stride?: number;
  signal?: AbortSignal;
  /** Each frame once it is in the pool. */
  onFrame?: (result: FrameResult) => void;
}

export interface FrameRequestOptions {
  lod?: Lod;
  priority?: FramePriority;
  signal?: AbortSignal;
  /** Stand-ins until the exact frame is ready (P8): the nearest cached frame, then a closer keyframe. */
  onApproximate?: (result: FrameResult) => void;
  /** A cached frame with a shorter long edge is decoded again at the current upload size (detail on zoom, §7.1). */
  minLongEdge?: number;
  /** Uploads frames at least this long on the long edge, whatever `uploadSize` says (Export frame at full resolution). */
  uploadAtLeast?: number;
}

export interface FrameServiceStats {
  requests: number;
  poolHits: number;
  workerRequests: number;
  /** Scrubs replaced by a newer one, and prefetches cancelled by a scrub. */
  superseded: number;
  failed: number;
  framesReceived: number;
  /** Frames received and not closed yet: 0 whenever the main thread is idle (P13). */
  openFrames: number;
  /** ms from the request to the first frame shown (approximate or exact), and to the exact frame, over the last 128 requests. */
  approxLastMs: number | null;
  approxP50Ms: number | null;
  approxP95Ms: number | null;
  approxP99Ms: number | null;
  exactLastMs: number | null;
  exactP50Ms: number | null;
  exactP95Ms: number | null;
  exactP99Ms: number | null;
  indexFromCache: number;
  indexParsed: number;
}

/** The video cannot be decoded in this browser. */
export class UnsupportedCodecError extends Error {
  override name = "UnsupportedCodecError";
}

export interface FrameServiceDeps {
  workers: Pick<WorkerPool, "request">;
  renderer: Pick<Renderer, "ready" | "uploadVideoFrame">;
  pool: Pick<TexturePool, "get" | "put" | "nearest" | "deleteMedia">;
  /** Long edge frames are scaled down to on upload (the project's long edge); none when undefined. */
  uploadSize?: () => number | undefined;
  /** True when the media's proxy is ready to use (the document says so). */
  proxyReady?: (mediaId: MediaId) => boolean;
  now?: () => number;
}

interface Waiter {
  rank: number;
  start: () => void;
}

/** Requests of one media at one lod. */
interface Lane {
  active: number;
  waiting: Waiter[];
  scrub: AbortController | null;
  prefetches: Set<AbortController>;
  all: Set<AbortController>;
}

const keyOf = (mediaId: MediaId, lod: Lod) => `${mediaId}|${lod}`;
const supersededError = () => new DOMException("Superseded by a newer request", "AbortError");


export class FrameService {
  private source: FrameSource | null = null;
  /** Bumped on attach/detach: opens from a previous project are dropped. */
  private generation = 0;
  private readonly videos = new Map<string, Promise<VideoInfo>>();
  /** Cancels the open of a video until it settles (`release`). */
  private readonly opening = new Map<string, AbortController>();
  private readonly infos = new Map<string, VideoInfo>();
  private readonly lanes = new Map<string, Lane>();
  private readonly listeners = new Set<() => void>();
  private readonly decodeListeners = new Set<() => void>();
  /** Media whose proxy failed to open: their requests go to the full file. */
  private readonly brokenProxies = new Set<MediaId>();
  private decoding = 0;
  private readonly approxSamples: number[] = [];
  private readonly exactSamples: number[] = [];
  private readonly counters = { requests: 0, poolHits: 0, workerRequests: 0, superseded: 0, failed: 0, framesReceived: 0, openFrames: 0, indexFromCache: 0, indexParsed: 0 };
  private approxLastMs: number | null = null;
  private exactLastMs: number | null = null;

  constructor(private readonly deps: FrameServiceDeps) {}

  /** Serves the media of a project until the returned function is called (which closes them all). */
  attach(source: FrameSource): () => void {
    this.detach();
    this.source = source;
    this.generation += 1;
    const generation = this.generation;
    return () => {
      if (this.generation === generation) this.detach();
    };
  }

  /** Opens a video (once) and gives its frame times, codec and rotation. */
  video(mediaId: MediaId, lod: Lod = "full"): Promise<VideoInfo> {
    const key = keyOf(mediaId, lod);
    let video = this.videos.get(key);
    if (!video) {
      const controller = new AbortController();
      video = this.open(mediaId, lod, controller.signal);
      this.videos.set(key, video);
      this.opening.set(key, controller);
      video.then(
        (info) => {
          if (this.videos.get(key) !== video) return;
          this.infos.set(key, info);
          if (lod === "proxy" && !info.decodable) this.breakProxy(mediaId, `this browser cannot decode ${info.codec}`);
        },
        (error: unknown) => {
          if (this.videos.get(key) !== video) return;
          this.videos.delete(key);
          if (lod === "proxy" && !isNamed(error, "AbortError")) this.breakProxy(mediaId, error instanceof Error ? error.message : String(error));
        },
      ).finally(() => {
        if (this.opening.get(key) === controller) this.opening.delete(key);
      });
    }
    return video;
  }

  /**
   * The lod a request that wants `wanted` gets (spec §9.5 "per-media availability"): the proxy only
   * when the media has one ready that did not fail to open.
   */
  lodFor(mediaId: MediaId, wanted: Lod): Lod {
    return wanted === "proxy" && this.hasProxy(mediaId) ? "proxy" : "full";
  }

  /** True when requests for the media's proxy go to it. */
  hasProxy(mediaId: MediaId): boolean {
    return this.deps.proxyReady?.(mediaId) === true && !this.brokenProxies.has(mediaId);
  }

  /** The info of an opened video, synchronously; null before `video` resolved. */
  info(mediaId: MediaId, lod: Lod = "full"): VideoInfo | null {
    return this.infos.get(keyOf(mediaId, lod)) ?? null;
  }

  /**
   * Writes into `out` the pool key of the frame nearest to media time `mediaTimeUs` of an opened video
   * (media time 0 is the first frame: the container's first cts may come after 0, edit lists are not
   * applied), and returns its display position. -1 when the video is not open or has no frames.
   */
  frameKeyInto(out: TextureKey, mediaId: MediaId, mediaTimeUs: number, lod: Lod = "full"): number {
    const info = this.infos.get(keyOf(mediaId, lod));
    const times = info?.frameTimesUs;
    if (!times || times.length === 0) return -1;
    const position = mediaTimePosition(times, mediaTimeUs);
    out.mediaId = mediaId;
    out.lod = lod;
    out.timeUs = times[position] as number;
    return position;
  }

  /** The frame shown at `timeUs` as a pool texture. Rejects with an AbortError when superseded or aborted. */
  async getFrame(mediaId: MediaId, timeUs: number, options: FrameRequestOptions = {}): Promise<FrameResult> {
    const { lod = "full", priority = "scrub", signal, onApproximate, minLongEdge, uploadAtLeast } = options;
    const started = this.now();
    this.counters.requests += 1;
    const lane = this.lane(mediaId, lod);
    const controller = this.track(lane, signal);
    if (priority === "scrub") {
      if (lane.scrub) {
        this.counters.superseded += 1;
        lane.scrub.abort(supersededError());
      }
      lane.scrub = controller;
      for (const prefetch of lane.prefetches) {
        this.counters.superseded += 1;
        prefetch.abort(supersededError());
      }
    }
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.fetchFrame(mediaId, lod, timeUs, priority, controller.signal, started, onApproximate, minLongEdge, uploadAtLeast);
        } catch (error) {
          // The worker was restarted and lost its sessions: open the video again, once.
          if (attempt > 0 || !isNamed(error, "NotOpenError")) throw error;
          this.forget(mediaId, lod);
        }
      }
    } catch (error) {
      if (!isNamed(error, "AbortError")) this.counters.failed += 1;
      throw error;
    } finally {
      if (lane.scrub === controller) lane.scrub = null;
      this.untrack(lane, controller);
      this.changed();
    }
  }

  /** Decodes the frames shown in [fromUs, toUs] into the pool. Cancelled by a scrub of the same media. */
  async prefetch(mediaId: MediaId, fromUs: number, toUs: number, options: PrefetchOptions = {}): Promise<number> {
    const { lod = "full", priority = "idle", stride = 1, signal, onFrame } = options;
    const lane = this.lane(mediaId, lod);
    const controller = this.track(lane, signal);
    lane.prefetches.add(controller);
    try {
      const info = this.infos.get(keyOf(mediaId, lod)) ?? (await this.video(mediaId, lod));
      if (!info.decodable) throw unsupported(info);
      await this.acquire(lane, priority, controller.signal);
      try {
        this.counters.workerRequests += 1;
        const { frames } = await this.deps.workers.request(
          "prefetch",
          { mediaId, lod, fromUs, toUs, priority, ...(stride > 1 && { stride }) },
          {
            priority: WORKER_PRIORITY[priority],
            signal: controller.signal,
            onProgress: (value) => {
              const result = this.receive(mediaId, lod, value);
              if (result && onFrame && !controller.signal.aborted) onFrame(result);
            },
          },
        );
        return frames;
      } finally {
        this.releaseSlot(lane);
      }
    } finally {
      lane.prefetches.delete(controller);
      this.untrack(lane, controller);
      this.changed();
    }
  }

  /**
   * A media left the project: cancel its requests, close its worker sessions, free its textures. With
   * `lod`, only those of that lod (a proxy removed or made again).
   */
  release(mediaId: MediaId, lod?: Lod): void {
    let known = false;
    const matches = (key: string) => (lod ? key === keyOf(mediaId, lod) : key.startsWith(`${mediaId}|`));
    if (!lod || lod === "proxy") this.brokenProxies.delete(mediaId);
    for (const [key, lane] of [...this.lanes]) {
      if (!matches(key)) continue;
      for (const controller of lane.all) controller.abort(abortError());
      this.lanes.delete(key);
    }
    for (const key of [...this.videos.keys()]) {
      if (!matches(key)) continue;
      known = true;
      this.videos.delete(key);
      this.infos.delete(key);
      // An open still reading the project files never reaches the worker; one at the worker is cancelled there.
      this.opening.get(key)?.abort(abortError());
      this.opening.delete(key);
    }
    if (known) void this.deps.workers.request("closeVideo", { mediaId, ...(lod && { lod }) }, { priority: "user" }).catch(() => undefined);
    this.deps.pool.deleteMedia(mediaId, lod);
  }

  get stats(): FrameServiceStats {
    const [approxP50Ms = null, approxP95Ms = null, approxP99Ms = null] = percentiles(this.approxSamples, [50, 95, 99]);
    const [exactP50Ms = null, exactP95Ms = null, exactP99Ms = null] = percentiles(this.exactSamples, [50, 95, 99]);
    return { ...this.counters, approxLastMs: this.approxLastMs, approxP50Ms, approxP95Ms, approxP99Ms, exactLastMs: this.exactLastMs, exactP50Ms, exactP95Ms, exactP99Ms };
  }

  /** The latency samples kept (ms; benchmarks read them after `resetLatencies`). */
  get latencySamples(): { approx: readonly number[]; exact: readonly number[] } {
    return { approx: this.approxSamples, exact: this.exactSamples };
  }

  /** Every latency as it is measured (the scrub benchmark keeps them all), or null. */
  onLatency: ((kind: "approx" | "exact", ms: number) => void) | null = null;

  /** Forgets the latency samples, so a benchmark measures its own requests only. */
  resetLatencies(): void {
    this.approxSamples.length = 0;
    this.exactSamples.length = 0;
    this.approxLastMs = null;
    this.exactLastMs = null;
  }

  /** The decode worker's own counters (dev stats). */
  workerStats(): Promise<WorkerDecodeStats> {
    return this.deps.workers.request("decodeStats", {}, { priority: "user" });
  }

  /** Called after each request settles (dev stats). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Frame requests waiting for the decoder (not answered from the pool). */
  get decodesInFlight(): number {
    return this.decoding;
  }

  /** Calls `listener` when a frame request goes to the decoder. */
  onDecodeRequest(listener: () => void): () => void {
    this.decodeListeners.add(listener);
    return () => this.decodeListeners.delete(listener);
  }

  private breakProxy(mediaId: MediaId, reason: string): void {
    if (this.brokenProxies.has(mediaId)) return;
    this.brokenProxies.add(mediaId);
    console.warn(`[media] the proxy of ${mediaId} cannot be used (${reason}): using the full file`);
    this.changed();
  }

  private detach(): void {
    const media = new Set([...this.videos.keys(), ...this.lanes.keys()].map((key) => key.slice(0, key.lastIndexOf("|"))));
    for (const mediaId of media) this.release(mediaId);
    this.source = null;
    this.generation += 1;
  }

  private async open(mediaId: MediaId, lod: Lod, signal: AbortSignal): Promise<VideoInfo> {
    const source = this.source;
    const generation = this.generation;
    if (!source) throw new Error("No project is open");
    const [file, cachedIndex] = await Promise.all([source.file(mediaId, lod), source.readIndex(mediaId, lod).catch(() => null)]);
    if (!file) throw new Error("The media file is missing");
    if (generation !== this.generation) throw abortError();
    signal.throwIfAborted();
    const { info, index } = await this.deps.workers.request("openVideo", { mediaId, lod, file, cachedIndex }, { priority: "user", signal });
    if (generation !== this.generation) throw abortError();
    if (info.indexFromCache) this.counters.indexFromCache += 1;
    else this.counters.indexParsed += 1;
    if (index) {
      source.writeIndex(mediaId, lod, index).catch((error: unknown) => console.warn(`[media] could not cache the sample index of ${mediaId}`, error));
    }
    return info;
  }

  private async fetchFrame(
    mediaId: MediaId,
    lod: Lod,
    timeUs: number,
    priority: FramePriority,
    signal: AbortSignal,
    started: number,
    onApproximate?: (result: FrameResult) => void,
    minLongEdge?: number,
    uploadAtLeast?: number,
  ): Promise<FrameResult> {
    // Known videos answer synchronously up to the worker request, so a cached stand-in shows this frame.
    const info = this.infos.get(keyOf(mediaId, lod)) ?? (await this.video(mediaId, lod));
    signal.throwIfAborted();
    if (!info.decodable) throw unsupported(info);
    const frameUs = info.frameTimesUs[positionAt(info.frameTimesUs, timeUs)] as number;
    const key: TextureKey = { mediaId, lod, timeUs: frameUs };
    const cached = this.deps.pool.get(key);
    if (cached && !(minLongEdge !== undefined && Math.max(cached.width, cached.height) < minLongEdge)) {
      this.counters.poolHits += 1;
      return { texture: cached, key, timeUs: frameUs, approximate: false };
    }
    let shownDistance = Infinity;
    const show = (result: FrameResult) => {
      const distance = Math.abs(result.timeUs - frameUs);
      if (!onApproximate || distance >= shownDistance || signal.aborted) return;
      if (shownDistance === Infinity) this.recordApprox(started);
      shownDistance = distance;
      onApproximate({ ...result, approximate: true });
    };
    const near = onApproximate ? this.deps.pool.nearest(mediaId, lod, frameUs) : null;
    if (near) show({ texture: near.texture, key: near.key, timeUs: near.key.timeUs, approximate: true });

    const lane = this.lane(mediaId, lod);
    this.decoding += 1;
    for (const listener of [...this.decodeListeners]) listener();
    try {
      await this.acquire(lane, priority, signal);
    } catch (error) {
      this.decoding -= 1;
      throw error;
    }
    try {
      this.counters.workerRequests += 1;
      const delivered = await this.deps.workers.request(
        "requestFrame",
        { mediaId, lod, timeUs: frameUs, priority },
        {
          priority: WORKER_PRIORITY[priority],
          signal,
          onProgress: (value) => {
            const result = this.receive(mediaId, lod, value, uploadAtLeast);
            if (result) show(result);
          },
        },
      );
      const result = this.receive(mediaId, lod, delivered, uploadAtLeast);
      if (!result) throw new Error("The GPU device is not ready");
      if (shownDistance === Infinity) this.recordApprox(started);
      // The decoder could not produce the frame: its nearest one is no exact-latency sample.
      if (!result.approximate) this.recordExact(started);
      return result;
    } finally {
      this.decoding -= 1;
      this.releaseSlot(lane);
    }
  }

  /** Uploads a frame from the worker into the pool and closes it at once (P5, P13). */
  private receive(mediaId: MediaId, lod: Lod, delivered: DeliveredFrame, uploadAtLeast?: number): FrameResult | null {
    const { frame, timeUs, approximate } = delivered;
    this.counters.framesReceived += 1;
    this.counters.openFrames += 1;
    try {
      const key: TextureKey = { mediaId, lod, timeUs };
      const size = this.deps.uploadSize?.();
      const maxSize = size !== undefined && uploadAtLeast !== undefined ? Math.max(size, uploadAtLeast) : size;
      // A cached texture stays unless it is smaller than this upload would be (detail on zoom).
      const existing = this.deps.pool.get(key);
      if (existing) {
        const wanted = fitWithin(frame.displayWidth, frame.displayHeight, maxSize);
        if (!(Math.max(existing.width, existing.height) < Math.max(wanted.width, wanted.height))) return { texture: existing, key, timeUs, approximate };
      }
      if (!this.deps.renderer.ready) return existing ? { texture: existing, key, timeUs, approximate } : null;
      const texture = this.deps.renderer.uploadVideoFrame(frame, { label: `${mediaId} @${timeUs}us`, ...(maxSize !== undefined && { maxSize }) });
      this.deps.pool.put(key, texture);
      return { texture, key, timeUs, approximate };
    } finally {
      frame.close();
      this.counters.openFrames -= 1;
    }
  }

  private lane(mediaId: MediaId, lod: Lod): Lane {
    const key = keyOf(mediaId, lod);
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { active: 0, waiting: [], scrub: null, prefetches: new Set(), all: new Set() };
      this.lanes.set(key, lane);
    }
    return lane;
  }

  /** A controller for one request, aborted with the caller's signal too. */
  private track(lane: Lane, signal: AbortSignal | undefined): AbortController {
    const controller = new AbortController();
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    lane.all.add(controller);
    return controller;
  }

  private untrack(lane: Lane, controller: AbortController): void {
    lane.all.delete(controller);
  }

  /** Waits for one of the media's worker slots, most urgent request first. */
  private acquire(lane: Lane, priority: FramePriority, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (lane.active < MAX_IN_FLIGHT_PER_MEDIA) {
      lane.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        rank: FRAME_PRIORITY_RANK[priority],
        start: () => {
          signal.removeEventListener("abort", onAbort);
          lane.active += 1;
          resolve();
        },
      };
      const onAbort = () => {
        const at = lane.waiting.indexOf(waiter);
        if (at !== -1) lane.waiting.splice(at, 1);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // By priority, then arrival.
      let at = lane.waiting.length;
      while (at > 0 && (lane.waiting[at - 1] as Waiter).rank > waiter.rank) at--;
      lane.waiting.splice(at, 0, waiter);
    });
  }

  private releaseSlot(lane: Lane): void {
    lane.active -= 1;
    const next = lane.waiting.shift();
    next?.start();
  }

  private forget(mediaId: MediaId, lod: Lod): void {
    this.videos.delete(keyOf(mediaId, lod));
    this.infos.delete(keyOf(mediaId, lod));
  }

  private recordApprox(started: number): void {
    this.approxLastMs = this.now() - started;
    pushSample(this.approxSamples, this.approxLastMs);
    this.onLatency?.("approx", this.approxLastMs);
  }

  private recordExact(started: number): void {
    this.exactLastMs = this.now() - started;
    pushSample(this.exactSamples, this.exactLastMs);
    this.onLatency?.("exact", this.exactLastMs);
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function pushSample(samples: number[], value: number): void {
  samples.push(value);
  if (samples.length > LATENCY_SAMPLES) samples.shift();
}

function unsupported(info: VideoInfo): UnsupportedCodecError {
  return new UnsupportedCodecError(`This browser cannot decode ${info.codec}`);
}

function isNamed(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === name;
}
