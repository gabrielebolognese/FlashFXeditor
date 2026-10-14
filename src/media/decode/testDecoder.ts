// Test-only fakes of WebCodecs decoding: frames that count how many are open, and a decoder that
// reorders like a B-frame decoder, can be stepped by hand, drop frames or fail. Not imported by app code.
import type { ChunkInit, DecodedFrame, DecoderCallbacks, DecoderLike } from "./VideoDecodeSession.js";

/** Frames created and not closed yet. */
export const frameCounter = { open: 0 };

export class FakeFrame implements DecodedFrame {
  private closed = false;
  constructor(readonly timestamp: number) {
    frameCounter.open += 1;
  }
  clone(): this {
    if (this.closed) throw new Error("clone of a closed frame");
    return new FakeFrame(this.timestamp) as this;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    frameCounter.open -= 1;
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
}

export class FakeDecoder implements DecoderLike {
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  private queue: ChunkInit[] = [];
  private buffer: number[] = [];
  private keyRequired = true;
  private scheduled = false;
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
    this.state = "configured";
    this.keyRequired = true;
  }

  decode(chunk: ChunkInit): void {
    if (this.state !== "configured") throw new DOMException("not configured", "InvalidStateError");
    if (this.keyRequired && chunk.type !== "key") throw new DOMException("key frame required", "DataError");
    this.keyRequired = false;
    this.queue.push(chunk);
    this.fed.push(chunk);
    this.maxQueue = Math.max(this.maxQueue, this.queue.length);
    this.maxInFlight = Math.max(this.maxInFlight, this.queue.length + this.buffer.length);
    if (this.options.auto !== false) this.schedule();
  }

  step(): void {
    const chunk = this.queue.shift();
    if (!chunk) return;
    this.callbacks.dequeue();
    if (chunk.timestamp === this.options.failAt) {
      this.close();
      this.callbacks.error(new Error("decode failed"));
      return;
    }
    this.buffer.push(chunk.timestamp);
    while (this.buffer.length > (this.options.reorder ?? 0)) this.emit();
  }

  async flush(): Promise<void> {
    this.flushes += 1;
    while (this.queue.length > 0) this.step();
    while (this.buffer.length > 0) this.emit();
    this.keyRequired = true;
  }

  reset(): void {
    this.resets += 1;
    this.queue = [];
    this.buffer = [];
    this.state = "unconfigured";
  }

  close(): void {
    this.queue = [];
    this.buffer = [];
    this.state = "closed";
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.state !== "configured") return;
      this.step();
      if (this.queue.length > 0) this.schedule();
    });
  }

  private emit(): void {
    this.buffer.sort((a, b) => a - b);
    const timestamp = this.buffer.shift() as number;
    if (this.options.drop?.has(timestamp)) return;
    this.outputs += 1;
    this.callbacks.output(new FakeFrame(timestamp));
  }
}
