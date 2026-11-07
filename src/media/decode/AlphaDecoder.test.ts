import { describe, expect, it } from "vitest";
import { alphaPlaneOf, createAlphaDecoder, PairedFrame, type AlphaSource } from "./AlphaDecoder.js";
import type { DecodedFrame, DecoderCallbacks, DecoderLike } from "./VideoDecodeSession.js";

class Fake implements DecodedFrame {
  closed = false;
  constructor(readonly timestamp: number) {}
  clone(): this {
    return new Fake(this.timestamp) as this;
  }
  close() {
    this.closed = true;
  }
}

/** A decoder that keeps what it is fed and gives frames out when told. */
function manual() {
  let callbacks!: DecoderCallbacks<Fake>;
  const fed: number[] = [];
  const decoders: DecoderLike[] = [];
  const outs: Array<(ts: number) => void> = [];
  const make = (cb: DecoderCallbacks<Fake>) => {
    callbacks = cb;
    const decoder: DecoderLike = { state: "configured", decodeQueueSize: 0, configure() {}, decode: (chunk) => void fed.push(chunk.timestamp), flush: async () => {}, reset() {}, close() {} };
    decoders.push(decoder);
    outs.push((ts) => callbacks.output(new Fake(ts)));
    const mine = cb;
    outs[outs.length - 1] = (ts) => mine.output(new Fake(ts));
    return decoder;
  };
  return { make, outs, fed };
}

const chunk = (timestamp: number, alpha?: number) => ({ type: "key" as const, timestamp, duration: 33, data: new ArrayBuffer(4), ...(alpha !== undefined && { alpha: new ArrayBuffer(alpha) }) });

describe("createAlphaDecoder", () => {
  it("pairs the color and alpha frames of one timestamp whichever arrives first", () => {
    const m = manual();
    const out: PairedFrame<Fake>[] = [];
    const decoder = createAlphaDecoder<Fake>(m.make, { output: (f) => out.push(f), error() {}, dequeue() {} });
    decoder.configure({ codec: "vp09.00.10.08" });
    decoder.decode(chunk(0, 5));
    decoder.decode(chunk(33, 5));
    const [color, alpha] = m.outs as [(ts: number) => void, (ts: number) => void];
    alpha(0);
    expect(out).toHaveLength(0);
    color(0);
    color(33);
    expect(out.map((f) => f.timestamp)).toEqual([0]);
    alpha(33);
    expect(out.map((f) => f.timestamp)).toEqual([0, 33]);
    expect(out.every((f) => f.alpha !== null)).toBe(true);
  });

  it("gives a frame fed without alpha out opaque, at once", () => {
    const m = manual();
    const out: PairedFrame<Fake>[] = [];
    const decoder = createAlphaDecoder<Fake>(m.make, { output: (f) => out.push(f), error() {}, dequeue() {} });
    decoder.decode(chunk(0));
    (m.outs[0] as (ts: number) => void)(0);
    expect(out).toHaveLength(1);
    expect(out[0]?.alpha).toBeNull();
    expect(m.fed).toEqual([0]);
  });

  it("flush delivers unpaired colors opaque and closes unpaired alphas", async () => {
    const m = manual();
    const out: PairedFrame<Fake>[] = [];
    const decoder = createAlphaDecoder<Fake>(m.make, { output: (f) => out.push(f), error() {}, dequeue() {} });
    decoder.decode(chunk(0, 5));
    decoder.decode(chunk(33, 5));
    (m.outs[0] as (ts: number) => void)(0);
    const lone = new Fake(33);
    // An alpha frame for a timestamp that has no color frame.
    (m.outs[1] as (ts: number) => void)(33);
    await decoder.flush();
    expect(out.map((f) => [f.timestamp, f.alpha])).toEqual([[0, null]]);
    expect(lone.closed).toBe(false);
  });

  it("closing a pair closes both frames", () => {
    const color = new Fake(1);
    const alpha = new Fake(1);
    new PairedFrame(color, alpha).close();
    expect([color.closed, alpha.closed]).toEqual([true, true]);
  });
});

function planar(format: string, w: number, h: number, fill: (x: number, y: number) => number, stride: number): AlphaSource {
  return {
    timestamp: 0,
    format,
    codedWidth: w,
    codedHeight: h,
    visibleRect: { width: w, height: h },
    clone() {
      return this;
    },
    close() {},
    allocationSize: () => stride * h * 2,
    async copyTo(dest) {
      const bytes = new Uint8Array(dest as ArrayBuffer);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bytes[y * stride + x] = fill(x, y);
      return [{ offset: 0, stride }];
    },
  } as AlphaSource;
}

describe("alphaPlaneOf", () => {
  it("copies the raw luma of a planar frame without its row padding", async () => {
    const plane = await alphaPlaneOf(planar("I420", 3, 2, (x, y) => 10 * y + x + 16, 8));
    expect(plane && Array.from(new Uint8Array(plane.data))).toEqual([16, 17, 18, 26, 27, 28]);
    expect([plane?.width, plane?.height]).toEqual([3, 2]);
  });

  it("returns null for a format with no readable luma", async () => {
    expect(await alphaPlaneOf(planar("I420P10", 2, 2, () => 0, 4))).toBeNull();
  });
});
