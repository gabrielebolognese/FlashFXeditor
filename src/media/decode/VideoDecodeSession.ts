// One video's decoder in decode.worker (spec §9.2, §9.3). Jobs (a frame, or a prefetch range) run one
// at a time, most urgent first; a prefetch yields to any frame request that arrives meanwhile.
// - Seek: feed on from the sync sample before the target (`keyFor`), in decode order (dts), with
//   no flush and no reset. Both measured 3-5x slower decoding of the frames that follow on Chrome's
//   hardware decoders (11 frames of 4K HEVC: ~110 ms fed straight on, 300-600 ms after a flush or a
//   reset). Chunks still in flight from a superseded run are decoded first and land in the ring,
//   tracked apart from the new run's (which may feed the same timestamps). Leading pictures of an open
//   GOP decoded without the GOP before them have wrong references: they are dropped, in the current
//   run and in the superseded ones. Outputs are matched by timestamp (cts in us); frames before the
//   target are decoded but not delivered.
// - Sequential continuation: a target ahead of the decoder in the same run is reached by feeding on,
//   without a seek (frames 0..300 cost one seek). A leading picture of the run's own sync sample
//   cannot be reached that way: it needs a seek to the GOP before.
// - A frame request feeds only what its target needs (`feedUntil`), so the decoder is idle when the
//   next request seeks elsewhere; a prefetch feeds ahead through its range. A decoder that holds frames
//   longer than the content needs (no output for STALL_MS since it last got a chunk or gave a frame,
//   with nothing left in its queue) gets one more chunk each time, for the session.
// - Backpressure: at most MAX_IN_FLIGHT chunks fed and not yet output, and the decoder's
//   `decodeQueueSize` kept below MAX_DECODE_QUEUE.
// - The last RING_SIZE outputs stay in a ring, so short backward steps need no seek. Frame requests
//   get clones; ring frames are closed when they leave the ring or when the decoder closes (P13).
//   Prefetches (playback windows) take their frames out of the ring instead: a hardware decoder
//   whose pictures stay referenced has to allocate new ones on the GPU thread, which made 4K60
//   playback miss vsyncs (Batch 09), and frames played forward are not stepped back to from here
//   (the texture pool keeps the recent ones).
// - A decoder that fails before the session ever decoded a frame (Chrome's isConfigSupported accepts
//   configurations its decoders then refuse, e.g. sizes beyond the hardware) marks the video
//   undecodable: later requests fail at once with UnsupportedCodecError.
// - A scrub far from its keyframe gets the keyframe first, as an approximate frame (P8). A scrub
//   waiting longer than one animation frame also gets the newest decoded frame, at most every
//   APPROXIMATE_INTERVAL_MS across scrubs: a fast drag supersedes each request before it completes,
//   and these frames are what moves on screen meanwhile.
import { keyFor, type SampleIndex } from "../demux/sampleIndex.js";
import { FRAME_PRIORITY_RANK, type FramePriority } from "../workers/protocol.js";

/** Chunks fed and not yet output (spec §9.2 `maxQueue`). */
export const MAX_IN_FLIGHT = 8;
/** Chunks the decoder has not taken yet. */
export const MAX_DECODE_QUEUE = 4;
/** Recent frames kept for backward steps (spec §9.3). */
export const RING_SIZE = 8;
/** A scrub that must decode at least this many frames past its keyframe gets the keyframe first. */
export const APPROXIMATE_MIN_FRAMES = 4;
/** While scrubs wait, the newest decoded frame is sent as an approximate one this often. */
export const APPROXIMATE_INTERVAL_MS = 33;
/** A scrub waits this long before it gets the newest decoded frame (one that completes sooner needs none). */
export const APPROXIMATE_WAIT_MS = 16;
/** No output for this long since the decoder last got a chunk, its queue empty: hold fewer frames and feed one more chunk. */
export const STALL_MS = 100;

/** The video cannot be decoded in this browser (frame requests of such a video fail with it). */
export class UnsupportedCodecError extends Error {
  override name = "UnsupportedCodecError";
}

/** The parts of a VideoFrame the session uses (tests use fakes). */
export interface DecodedFrame {
  readonly timestamp: number;
  clone(): this;
  close(): void;
}

export interface ChunkInit {
  type: "key" | "delta";
  timestamp: number;
  duration: number;
  data: ArrayBuffer;
}

/** The parts of a VideoDecoder the session uses; `decode` takes the chunk's fields. */
export interface DecoderLike {
  readonly state: "unconfigured" | "configured" | "closed";
  readonly decodeQueueSize: number;
  configure(config: VideoDecoderConfig): void;
  decode(chunk: ChunkInit): void;
  flush(): Promise<void>;
  reset(): void;
  close(): void;
}

export interface DecoderCallbacks<F> {
  output(frame: F): void;
  error(error: Error): void;
  /** `decodeQueueSize` went down. */
  dequeue(): void;
}

export interface SessionDeps<F extends DecodedFrame> {
  createDecoder(callbacks: DecoderCallbacks<F>): DecoderLike;
  readSample(offset: number, size: number): Promise<ArrayBuffer>;
  /** A job starts while none was running / the last job ended. */
  onActive?(): void;
  onIdle?(): void;
  /** ms clock (tests). */
  now?(): number;
}

export interface SessionStats {
  seeks: number;
  decoded: number;
  /** Decoded frames that left the ring without being delivered. */
  dropped: number;
  ringHits: number;
  stalls: number;
}

interface JobBase {
  priority: FramePriority;
  signal: AbortSignal;
  order: number;
  reject(error: unknown): void;
}

interface FrameJob<F> extends JobBase {
  kind: "frame";
  position: number;
  resolve(frame: F): void;
  onApproximate: ((frame: F) => void) | undefined;
}

interface PrefetchJob<F> extends JobBase {
  kind: "prefetch";
  /** Next display position to deliver, the last one, and the step between delivered positions. */
  next: number;
  to: number;
  stride: number;
  delivered: number;
  onFrame(frame: F): void;
  resolve(count: number): void;
}

type Job<F> = FrameJob<F> | PrefetchJob<F>;

interface RingEntry<F> {
  frame: F;
  delivered: boolean;
}

const rank = (job: JobBase) => FRAME_PRIORITY_RANK[job.priority];

export class VideoDecodeSession<F extends DecodedFrame = VideoFrame> {
  private decoder: DecoderLike | null = null;
  /** Decode index of the next sample to feed; -1 when the decoder needs a seek (new, flushed, reset). */
  private nextFeed = -1;
  /** Timestamps fed and not output yet. */
  private readonly pending = new Set<number>();
  private lastOutputUs = -Infinity;
  /** Time of the sync sample the current run started from: its leading pictures are dropped. */
  private runStartUs = -Infinity;
  /**
   * Frames of superseded runs still in the decoder: timestamp -> one flag per copy, oldest first, true
   * for a leading picture (decoded without its references). Their outputs come before any copy fed
   * later: a leading one is dropped, the others land in the ring, and neither touches the current
   * run's pending frames or last output. One the decoder never outputs (it may skip them) costs a later
   * copy of that frame; a flush or a new decoder clears them.
   */
  private readonly stale = new Map<number, boolean[]>();
  /** When the decoder last got a chunk or produced a frame (stall detection). */
  private lastProgressAt = 0;
  /** When the newest decoded frame was last sent as an approximate one. */
  private lastApproximateAt = -Infinity;
  /** Extra in-flight chunks allowed after stalls (decoders that hold more frames); kept for the session. */
  private extraInFlight = 0;
  private readonly ring: RingEntry<F>[] = [];
  private readonly jobs: Job<F>[] = [];
  private current: Job<F> | null = null;
  private running = false;
  private disposed = false;
  private failure: Error | null = null;
  /** Set when the first decoder failed before any frame came out: the video is not decodable here. */
  private unsupported: UnsupportedCodecError | null = null;
  private everDecoded = false;
  private wakers: ((woken: boolean) => void)[] = [];
  private nextOrder = 0;
  readonly stats: SessionStats = { seeks: 0, decoded: 0, dropped: 0, ringHits: 0, stalls: 0 };

  constructor(
    readonly index: SampleIndex,
    private readonly deps: SessionDeps<F>,
  ) {}

  /** The decoder configuration of this track. */
  get config(): VideoDecoderConfig {
    const { codec, codedWidth, codedHeight, description } = this.index;
    return { codec, codedWidth, codedHeight, optimizeForLatency: true, ...(description.length > 0 && { description }) };
  }

  /** True while it holds a decoder. */
  get live(): boolean {
    return this.decoder !== null;
  }

  /** True while jobs run or wait. */
  get busy(): boolean {
    return this.running || this.jobs.length > 0;
  }

  /** Jobs waiting for the decoder (dev stats: the worker's queue depth). */
  get queued(): number {
    return this.jobs.length;
  }

  /** Frames held by the ring. */
  get openFrames(): number {
    return this.ring.length;
  }

  /** The frame at display position `position` (a clone the caller closes). */
  frame(position: number, priority: FramePriority, signal: AbortSignal, onApproximate?: (frame: F) => void): Promise<F> {
    return new Promise<F>((resolve, reject) => {
      this.enqueue({ kind: "frame", position, priority, signal, order: this.nextOrder++, resolve, reject, onApproximate });
    });
  }

  /**
   * Delivers the frames at display positions from, from + stride, ... up to `to`, in order (every frame
   * in between is decoded too). Resolves with how many were delivered. Playback windows run at
   * `playback` priority, ahead of idle warming.
   */
  prefetch(from: number, to: number, signal: AbortSignal, onFrame: (frame: F) => void, options: { priority?: FramePriority; stride?: number } = {}): Promise<number> {
    const stride = Math.max(1, Math.floor(options.stride ?? 1));
    return new Promise<number>((resolve, reject) => {
      this.enqueue({ kind: "prefetch", next: from, to, stride, delivered: 0, priority: options.priority ?? "idle", signal, order: this.nextOrder++, resolve, reject, onFrame });
    });
  }

  /**
   * Closes the ring's frames and keeps the decoder and its run: a hardware decoder whose pictures the
   * app holds has to allocate new ones (and stalls when it cannot), so idle sessions give theirs back.
   */
  releaseRing(): void {
    for (const entry of this.ring.splice(0)) this.release(entry);
  }

  /** Frees the decoder and the ring (idle for too long, or making room for another media). Jobs stay possible. */
  closeDecoder(): void {
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = null;
    this.nextFeed = -1;
    this.pending.clear();
    this.stale.clear();
    for (const entry of this.ring.splice(0)) this.release(entry);
  }

  /** Rejects every job and frees everything. */
  dispose(): void {
    this.disposed = true;
    const closed = new DOMException("The video was closed", "AbortError");
    for (const job of this.jobs.splice(0)) job.reject(closed);
    this.current?.reject(closed);
    this.closeDecoder();
    this.wake();
  }

  private enqueue(job: Job<F>): void {
    if (this.disposed) {
      job.reject(new DOMException("The video was closed", "AbortError"));
      return;
    }
    if (job.signal.aborted) {
      job.reject(job.signal.reason);
      return;
    }
    job.signal.addEventListener(
      "abort",
      () => {
        const at = this.jobs.indexOf(job);
        if (at !== -1) this.jobs.splice(at, 1);
        job.reject(job.signal.reason);
        this.wake();
      },
      { once: true },
    );
    this.insert(job);
    void this.run();
  }

  /** By priority, then arrival. */
  private insert(job: Job<F>): void {
    let at = this.jobs.length;
    while (at > 0) {
      const before = this.jobs[at - 1] as Job<F>;
      if (rank(before) < rank(job) || (rank(before) === rank(job) && before.order < job.order)) break;
      at--;
    }
    this.jobs.splice(at, 0, job);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.deps.onActive?.();
    try {
      for (let job = this.jobs.shift(); job; job = this.jobs.shift()) {
        if (job.signal.aborted) continue;
        this.current = job;
        try {
          if (job.kind === "frame") await this.runFrame(job);
          else await this.runPrefetch(job);
        } catch (error) {
          job.reject(error);
        } finally {
          this.current = null;
        }
      }
    } finally {
      this.running = false;
      if (!this.disposed) this.deps.onIdle?.();
    }
  }

  private async runFrame(job: FrameJob<F>): Promise<void> {
    if (this.unsupported) throw this.unsupported;
    const d = this.index.displayOrder[job.position] as number;
    const hit = this.ringEntry(this.index.timesUs[d] as number);
    if (hit) {
      this.stats.ringHits += 1;
      job.resolve(this.take(hit));
      return;
    }
    const entry = await this.decodeTo(d, job);
    if (entry) job.resolve(this.take(entry));
  }

  private async runPrefetch(job: PrefetchJob<F>): Promise<void> {
    if (this.unsupported) throw this.unsupported;
    while (job.next <= job.to) {
      // A frame request waiting: let it go first, then carry on from here.
      const first = this.jobs[0];
      if (first && rank(first) < rank(job)) {
        this.insert(job);
        return;
      }
      const d = this.index.displayOrder[job.next] as number;
      const entry = this.ringEntry(this.index.timesUs[d] as number) ?? (await this.decodeTo(d, job));
      if (!entry) return;
      job.onFrame(this.handOver(entry));
      job.delivered += 1;
      job.next += job.stride;
    }
    job.resolve(job.delivered);
  }

  /** Decodes until decode index `d` is in the ring. Null when the job was cancelled. */
  private async decodeTo(d: number, job: Job<F>): Promise<RingEntry<F> | null> {
    const { index } = this;
    const timeUs = index.timesUs[d] as number;
    const key = keyFor(index, d);
    if (!this.canContinue(d, key, timeUs)) this.seek(key);
    const approximate = job.kind === "frame" && job.priority === "scrub" ? job.onApproximate : undefined;
    // The keyframe of a seek far from the target, then the newest decoded frame now and then.
    let keyframeUs = approximate && this.nextFeed === key && d - key >= APPROXIMATE_MIN_FRAMES ? (index.timesUs[key] as number) : null;
    const startedAt = this.now();
    let approximateUs = -Infinity;
    // The last decode index this job needs fed.
    const until = index.feedUntil[job.kind === "prefetch" ? (index.displayOrder[job.to] as number) : d] as number;
    for (;;) {
      if (this.disposed || job.signal.aborted) return null;
      if (this.failure) throw this.unsupported ?? this.failure;
      const entry = this.ringEntry(timeUs);
      if (entry) return entry;
      if (approximate) {
        const now = this.now();
        const newest = this.ring[this.ring.length - 1];
        const due = now - startedAt >= APPROXIMATE_WAIT_MS && now - this.lastApproximateAt >= APPROXIMATE_INTERVAL_MS;
        const stand = keyframeUs !== null ? this.ringEntry(keyframeUs) : due ? newest : undefined;
        if (stand && stand.frame.timestamp < timeUs && stand.frame.timestamp > approximateUs) {
          keyframeUs = null;
          this.lastApproximateAt = now;
          approximateUs = stand.frame.timestamp;
          approximate(this.take(stand));
        }
      }
      // The decoder went past the target without showing it (a frame it could not decode).
      if (timeUs < this.lastOutputUs) return this.nearest(timeUs);
      if (this.canFeed(until)) {
        await this.feed();
        continue;
      }
      if (this.nextFeed >= index.count) {
        await this.flushDecoder();
        if (!this.ringEntry(timeUs)) return this.nearest(timeUs);
        continue;
      }
      const woken = await this.waitForChange(job.signal, approximate ? APPROXIMATE_WAIT_MS : STALL_MS);
      if (!woken && this.now() - this.lastProgressAt >= STALL_MS && this.decoder && this.decoder.decodeQueueSize === 0 && this.pending.size > 0) {
        // The decoder waits for more input than we allow, or for its output frames back: give both.
        this.stats.stalls += 1;
        this.extraInFlight += 1;
        for (const entry of this.ring.splice(0)) this.release(entry);
      }
    }
  }

  /**
   * The target is ahead of the decoder in its current run, past the keyframe it needs, and not a
   * leading picture of the run's sync sample (the run is missing the GOP before it).
   */
  private canContinue(d: number, key: number, timeUs: number): boolean {
    return (
      this.decoder !== null &&
      this.nextFeed >= 0 &&
      key <= this.nextFeed &&
      timeUs >= this.runStartUs &&
      (d < this.nextFeed ? this.pending.has(timeUs) : timeUs > this.lastOutputUs)
    );
  }

  /** Starts a run at sync sample `key` on the same decoder (see the header), or on a new one. */
  private seek(key: number): void {
    const decoder = this.decoder ?? this.createDecoder();
    if (decoder.state !== "configured") {
      try {
        decoder.configure(this.config);
      } catch (error) {
        // isConfigSupported said yes, configure says no (Batch 47): undecodable, as an error before any frame.
        this.decoder = null;
        decoder.close();
        if (!this.everDecoded) this.unsupported = new UnsupportedCodecError(`This browser cannot decode ${this.index.codec} (${error instanceof Error ? error.message : String(error)})`);
        throw this.unsupported ?? error;
      }
    }
    for (const t of this.pending) {
      const leading = t < this.runStartUs;
      const copies = this.stale.get(t);
      if (copies) copies.push(leading);
      else this.stale.set(t, [leading]);
    }
    this.pending.clear();
    this.lastOutputUs = -Infinity;
    this.runStartUs = this.index.timesUs[key] as number;
    this.nextFeed = key;
    this.lastProgressAt = this.now();
    this.stats.seeks += 1;
  }

  private createDecoder(): DecoderLike {
    const decoder = this.deps.createDecoder({
      output: (frame) => this.output(decoder, frame),
      error: (error) => {
        if (this.decoder !== decoder) return;
        this.failure = error;
        if (!this.everDecoded) this.unsupported = new UnsupportedCodecError(`This browser cannot decode ${this.index.codec} (${error.message})`);
        // A failed decoder is closed; the next job starts a new one.
        this.decoder = null;
        this.nextFeed = -1;
        this.pending.clear();
        this.stale.clear();
        this.wake();
      },
      dequeue: () => this.wake(),
    });
    this.decoder = decoder;
    this.failure = null;
    return decoder;
  }

  private canFeed(until: number): boolean {
    const decoder = this.decoder;
    return (
      decoder !== null &&
      this.nextFeed >= 0 &&
      this.nextFeed < this.index.count &&
      this.nextFeed <= until + this.extraInFlight &&
      this.pending.size < MAX_IN_FLIGHT + this.extraInFlight &&
      decoder.decodeQueueSize < MAX_DECODE_QUEUE
    );
  }

  private async feed(): Promise<void> {
    const { index } = this;
    const i = this.nextFeed;
    const decoder = this.decoder as DecoderLike;
    const data = await this.deps.readSample(index.offsets[i] as number, index.sizes[i] as number);
    // A seek, close or failure happened while reading: this sample belongs to an old run.
    if (this.decoder !== decoder || this.nextFeed !== i) return;
    const timestamp = index.timesUs[i] as number;
    const duration = Math.round(((index.durations[i] as number) * 1_000_000) / index.timescale);
    try {
      decoder.decode({ type: index.sync[i] || i === index.syncBefore[i] ? "key" : "delta", timestamp, duration, data });
    } catch (error) {
      // A refused chunk leaves the run unusable: the next request seeks.
      this.nextFeed = -1;
      throw error;
    }
    this.pending.add(timestamp);
    this.nextFeed = i + 1;
    this.lastProgressAt = this.now();
  }

  /** End of the track: the decoder hands out the frames it holds. A keyframe is needed after it. */
  private async flushDecoder(): Promise<void> {
    const decoder = this.decoder as DecoderLike;
    this.nextFeed = -1;
    try {
      await decoder.flush();
    } catch (error) {
      // The decoder failed or was closed meanwhile: a failed one is replaced on the next seek.
      if (this.decoder === decoder) {
        this.failure = error instanceof Error ? error : new Error(String(error));
        if (decoder.state !== "closed") decoder.close();
        this.decoder = null;
      }
    }
    this.pending.clear();
    this.stale.clear();
  }

  private output(decoder: DecoderLike, frame: F): void {
    if (this.decoder !== decoder || this.disposed) {
      frame.close();
      return;
    }
    this.stats.decoded += 1;
    this.everDecoded = true;
    this.lastProgressAt = this.now();
    const timestamp = frame.timestamp;
    const copies = this.stale.get(timestamp);
    if (copies) {
      const leading = copies.shift() as boolean;
      if (copies.length === 0) this.stale.delete(timestamp);
      if (leading) {
        // A leading picture of a superseded run, decoded without its references.
        this.stats.dropped += 1;
        frame.close();
        this.wake();
        return;
      }
      // A frame of a superseded run: kept, the current run's bookkeeping stays as it is (a copy of the
      // same timestamp fed by this run is still to come).
    } else if (this.pending.has(timestamp)) {
      // Outputs come in display order: what was fed and shows before this frame will never come.
      for (const t of this.pending) if (t <= timestamp) this.pending.delete(t);
      this.lastOutputUs = timestamp;
      if (timestamp < this.runStartUs) {
        // A leading picture of the GOP the run started at, decoded without its references.
        this.stats.dropped += 1;
        frame.close();
        this.wake();
        return;
      }
    }
    const existing = this.ring.findIndex((entry) => entry.frame.timestamp === timestamp);
    if (existing !== -1) this.release(this.ring.splice(existing, 1)[0] as RingEntry<F>);
    this.ring.push({ frame, delivered: false });
    while (this.ring.length > RING_SIZE) this.release(this.ring.shift() as RingEntry<F>);
    this.wake();
  }

  private ringEntry(timeUs: number): RingEntry<F> | undefined {
    return this.ring.find((entry) => entry.frame.timestamp === timeUs);
  }

  /** The ring frame closest to `timeUs`: the stand-in for a frame the decoder dropped. */
  private nearest(timeUs: number): RingEntry<F> {
    let best: RingEntry<F> | undefined;
    for (const entry of this.ring) {
      if (!best || Math.abs(entry.frame.timestamp - timeUs) < Math.abs(best.frame.timestamp - timeUs)) best = entry;
    }
    if (!best) throw new Error(`The frame at ${timeUs} us could not be decoded`);
    return best;
  }

  private take(entry: RingEntry<F>): F {
    entry.delivered = true;
    return entry.frame.clone();
  }

  /** Takes the frame out of the ring: the caller owns (and closes) the decoder's picture itself. */
  private handOver(entry: RingEntry<F>): F {
    const at = this.ring.indexOf(entry);
    if (at !== -1) this.ring.splice(at, 1);
    return entry.frame;
  }

  private release(entry: RingEntry<F>): void {
    if (!entry.delivered) this.stats.dropped += 1;
    entry.frame.close();
  }

  /** Resolves true on an output, a dequeue, an error or an abort; false after `ms` without one. */
  private waitForChange(signal: AbortSignal, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (woken: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        const at = this.wakers.indexOf(done);
        if (at !== -1) this.wakers.splice(at, 1);
        resolve(woken);
      };
      const onAbort = () => done(true);
      const timer = setTimeout(() => done(false), ms);
      signal.addEventListener("abort", onAbort, { once: true });
      this.wakers.push(done);
    });
  }

  private wake(): void {
    for (const done of [...this.wakers]) done(true);
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }
}

/** A WebCodecs VideoDecoder behind `DecoderLike` (decode.worker). */
export function createVideoDecoder(callbacks: DecoderCallbacks<VideoFrame>): DecoderLike {
  const decoder = new VideoDecoder({ output: (frame) => callbacks.output(frame), error: (error) => callbacks.error(error) });
  decoder.addEventListener("dequeue", () => callbacks.dequeue());
  return {
    get state() {
      return decoder.state;
    },
    get decodeQueueSize() {
      return decoder.decodeQueueSize;
    },
    configure: (config) => decoder.configure(config),
    decode: (chunk) => decoder.decode(new EncodedVideoChunk(chunk)),
    flush: () => decoder.flush(),
    reset: () => decoder.reset(),
    close: () => decoder.close(),
  };
}
