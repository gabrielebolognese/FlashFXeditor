// Test-only fakes of WebCodecs decoding: frames that count how many are open, and a decoder that
// reorders like a B-frame decoder, can be stepped by hand, drop frames, fail, take time per frame,
// decode open-GOP leading pictures with wrong references or run out of output pictures. Not imported
// by app code.
import type { ChunkInit, DecodedFrame, DecoderCallbacks, DecoderLike } from "./VideoDecodeSession.js";

/** Frames created and not closed yet. */
export const frameCounter = { open: 0 };

/** A decoder output picture, shared by a frame and its clones: free again once all of them are closed. */
interface Picture {
  refs: number;
  free(): void;
}

export class FakeFrame implements DecodedFrame {
  private closed = false;
  readonly duration: number | null = null;
  constructor(
    readonly timestamp: number,
    /** Decoded without the references it needs (a leading picture fed without the GOP before it). */
    readonly corrupt = false,
    private readonly picture?: Picture,
  ) {
    frameCounter.open += 1;
  }
  clone(): this {
    if (this.closed) throw new Error("clone of a closed frame");
    if (this.picture) this.picture.refs += 1;
    return new FakeFrame(this.timestamp, this.corrupt, this.picture) as this;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    frameCounter.open -= 1;
    if (this.picture && --this.picture.refs === 0) this.picture.free();
  }
  get isClosed(): boolean {
    return this.closed;
  }
}

export interface FakeOptions {
  /** Frames held before output (B-frame reordering). */
  reorder?: number;
  /** Process chunks on their own (microtasks); otherwise call `step()`. */
  auto?: boolean;
  /** Timestamps the decoder never outputs. */
  drop?: ReadonlySet<number>;
  /** Fails when this timestamp is decoded. */
  failAt?: number;
  /** `configure` throws, as Chrome's does for a config `isConfigSupported` accepted but no decoder takes. */
  configureThrows?: boolean;
  /** Chunks are taken at once and each frame comes out this many ms later (timers). */
  latencyMs?: number;
  /**
   * Open GOPs: a leading picture's timestamp -> the timestamp of the frame before its sync sample that
   * it references. It comes out `corrupt` unless that frame was fed in the same unbroken run of chunks
   * (`decodeOrder`: every timestamp of the track in decode order).
   */
  references?: ReadonlyMap<number, number>;
  decodeOrder?: readonly number[];
  /**
   * Output pictures (a hardware decoder's pool): one is in use from its decode, through the reorder hold,
   * until its frame and every clone are closed. With all in use the decoder takes no chunk: they wait in
   * its queue (Chrome's H.264 decoder with B-frames, Batch 74).
   */
  pictures?: number;
}

interface Decoded {
  timestamp: number;
  corrupt: boolean;
}

export class FakeDecoder implements DecoderLike {
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  private queue: { chunk: ChunkInit; corrupt: boolean }[] = [];
  private buffer: Decoded[] = [];
  /** Frames waiting for `latencyMs`, in decode order. */
  private readonly delayed = new Map<ReturnType<typeof setTimeout>, () => void>();
  private keyRequired = true;
  private scheduled = false;
  /** Decode index of the last chunk fed, and of the chunk the current unbroken run started at. */
  private lastFedAt = -2;
  private runFrom = -1;
  /** Output pictures in use (`pictures`). */
  private inUse = 0;
  readonly fed: ChunkInit[] = [];
  outputs = 0;
  maxQueue = 0;
  maxInFlight = 0;
  resets = 0;
  flushes = 0;

  constructor(
    private readonly callbacks: DecoderCallbacks<FakeFrame>,
    private readonly options: FakeOptions,
  ) {}

  get decodeQueueSize(): number {
    return this.queue.length;
  }

  configure(): void {
    if (this.options.configureThrows) throw new DOMException("Unsupported configuration", "NotSupportedError");
    this.state = "configured";
    this.keyRequired = true;
    this.lastFedAt = -2;
  }

  decode(chunk: ChunkInit): void {
    if (this.state !== "configured") throw new DOMException("not configured", "InvalidStateError");
    if (this.keyRequired && chunk.type !== "key") throw new DOMException("key frame required", "DataError");
    this.keyRequired = false;
    this.queue.push({ chunk, corrupt: this.corrupt(chunk.timestamp) });
    this.fed.push(chunk);
    this.maxQueue = Math.max(this.maxQueue, this.queue.length);
    this.maxInFlight = Math.max(this.maxInFlight, this.queue.length + this.buffer.length + this.delayed.size);
    if (this.options.auto !== false) this.schedule();
  }

  /** Whether every output picture is in use (the next chunk waits). */
  get starved(): boolean {
    return this.options.pictures !== undefined && this.inUse >= this.options.pictures;
  }

  step(force = false): void {
    if (this.starved && !force) return;
    const entry = this.queue.shift();
    if (!entry) return;
    this.callbacks.dequeue();
    const { chunk, corrupt } = entry;
    if (chunk.timestamp === this.options.failAt) {
      this.close();
      this.callbacks.error(new Error("decode failed"));
      return;
    }
    const decoded = () => {
      // Pictures before a sync sample in decode order are shown before it.
      if (chunk.type === "key") while (this.buffer.length > 0) this.emit();
      this.inUse += 1;
      this.buffer.push({ timestamp: chunk.timestamp, corrupt });
      while (this.buffer.length > (this.options.reorder ?? 0)) this.emit();
    };
    if (this.options.latencyMs === undefined) {
      decoded();
      return;
    }
    const timer = setTimeout(() => {
      this.delayed.delete(timer);
      if (this.state === "configured") decoded();
    }, this.options.latencyMs);
    this.delayed.set(timer, decoded);
  }

  async flush(): Promise<void> {
    this.flushes += 1;
    while (this.queue.length > 0) this.step(true);
    for (const [timer, decoded] of [...this.delayed]) {
      clearTimeout(timer);
      this.delayed.delete(timer);
      decoded();
    }
    while (this.buffer.length > 0) this.emit();
    this.keyRequired = true;
  }

  reset(): void {
    this.resets += 1;
    this.clear();
    this.state = "unconfigured";
  }

  close(): void {
    this.clear();
    this.state = "closed";
  }

  private clear(): void {
    this.queue = [];
    this.inUse -= this.buffer.length;
    this.buffer = [];
    for (const timer of this.delayed.keys()) clearTimeout(timer);
    this.delayed.clear();
  }

  /** Whether a chunk fed now decodes without one of its references. */
  private corrupt(timestamp: number): boolean {
    const order = this.options.decodeOrder;
    if (!order) return false;
    const at = order.indexOf(timestamp);
    // A jump in decode order: the decoder's references start over here.
    if (at !== this.lastFedAt + 1) this.runFrom = at;
    this.lastFedAt = at;
    const reference = this.options.references?.get(timestamp);
    return reference !== undefined && order.indexOf(reference) < this.runFrom;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.state !== "configured" || this.starved) return;
      this.step();
      if (this.queue.length > 0) this.schedule();
    });
  }

  private emit(): void {
    // Stable: of two copies of one timestamp (fed in two runs), the earlier comes out first.
    this.buffer.sort((a, b) => a.timestamp - b.timestamp);
    const { timestamp, corrupt } = this.buffer.shift() as Decoded;
    if (this.options.drop?.has(timestamp)) {
      this.inUse -= 1;
      return;
    }
    this.outputs += 1;
    const picture: Picture = {
      refs: 1,
      free: () => {
        this.inUse -= 1;
        // A picture back: chunks waiting in the queue go on.
        if (this.queue.length > 0 && this.options.auto !== false && this.state === "configured") this.schedule();
      },
    };
    this.callbacks.output(new FakeFrame(timestamp, corrupt, picture));
  }
}
