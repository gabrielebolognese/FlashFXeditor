import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleIndex, type SampleIndex } from "../demux/sampleIndex.js";
import { FakeDecoder, FakeFrame, frameCounter, type FakeOptions } from "./testDecoder.js";
import { APPROXIMATE_INTERVAL_MS, MAX_DECODE_QUEUE, MAX_IN_FLIGHT, RING_SIZE, STALL_MS, VideoDecodeSession } from "./VideoDecodeSession.js";

const DUR = 1000; // ticks of a 30000 timescale: 33,333 us
const TIMESCALE = 30000;
const us = (frames: number) => Math.round((frames * DUR * 1e6) / TIMESCALE);

/** `count` frames without B-frames, a sync sample every `gop`. */
function linearIndex(count: number, gop = 30): SampleIndex {
  return indexOf(Array.from({ length: count }, (_, i) => ({ cts: i, sync: i % gop === 0 })));
}

/** GOPs of 7 in decode order I0 P3 B1 B2 P6 B4 B5 (needs a reorder depth of 2). */
function bFrameIndex(gops: number): SampleIndex {
  const pattern = [0, 3, 1, 2, 6, 4, 5];
  return indexOf(Array.from({ length: gops * 7 }, (_, i) => ({ cts: Math.floor(i / 7) * 7 + (pattern[i % 7] as number), sync: i % 7 === 0 })));
}

function indexOf(frames: { cts: number; sync: boolean }[]): SampleIndex {
  return createSampleIndex({
    codec: "avc1.64001f",
    description: new Uint8Array([1]),
    codedWidth: 64,
    codedHeight: 64,
    rotation: 0,
    timescale: TIMESCALE,
    offsets: Float64Array.from(frames, (_, i) => i * 10),
    sizes: Uint32Array.from(frames, () => 10),
    dts: Float64Array.from(frames, (_, i) => i * DUR),
    cts: Float64Array.from(frames, (f) => f.cts * DUR),
    durations: Uint32Array.from(frames, () => DUR),
    sync: Uint8Array.from(frames, (f) => (f.sync ? 1 : 0)),
  });
}

function setup(index: SampleIndex, options: FakeOptions = {}, now?: () => number) {
  const decoders: FakeDecoder[] = [];
  const session = new VideoDecodeSession<FakeFrame>(index, {
    createDecoder: (callbacks) => {
      const decoder = new FakeDecoder(callbacks, options);
      decoders.push(decoder);
      return decoder;
    },
    readSample: async (_offset, size) => new ArrayBuffer(size),
    ...(now && { now }),
  });
  const decoder = () => decoders[decoders.length - 1] as FakeDecoder;
  /** Frame at a display position, closed at once; returns its timestamp. */
  const shown = async (position: number, priority: "scrub" | "playback" = "playback", onApproximate?: (frame: FakeFrame) => void) => {
    const frame = await session.frame(position, priority, new AbortController().signal, onApproximate);
    frame.close();
    return frame.timestamp;
  };
  return { session, decoders, decoder, shown };
}

/** Decode index of the first chunk fed after the last reset. */
const firstFedAfter = (decoder: FakeDecoder, count: number) => decoder.fed[count]?.timestamp;

beforeEach(() => {
  frameCounter.open = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VideoDecodeSession", () => {
  it("decodes frames 0..300 in order with a single seek", async () => {
    const index = linearIndex(301);
    const { session, shown } = setup(index);
    for (let p = 0; p <= 300; p++) expect(await shown(p)).toBe(us(p));
    expect(session.stats.seeks).toBe(1);
    expect(session.stats.ringHits).toBe(0);
    expect(frameCounter.open).toBe(session.openFrames);
    expect(session.openFrames).toBeLessThanOrEqual(RING_SIZE);
  });

  it("matches B-frame outputs by timestamp and feeds in decode order", async () => {
    const index = bFrameIndex(3);
    const { session, decoder, shown } = setup(index, { reorder: 2 });
    for (let p = 0; p < 21; p++) expect(await shown(p)).toBe(us(p));
    expect(session.stats.seeks).toBe(1);
    // Fed in dts order: the timestamps of decode indices 0, 1, 2... (cts 0, 3, 1, 2, 6...).
    expect(decoder().fed.slice(0, 7).map((c) => c.timestamp)).toEqual([0, 3, 1, 2, 6, 4, 5].map(us));
    expect(decoder().fed.map((c) => c.type).filter((t) => t === "key")).toHaveLength(3);
  });

  it("seeks to the keyframe before the target and drops the frames before it", async () => {
    const index = linearIndex(120);
    const { session, decoder, shown } = setup(index);
    expect(await shown(70)).toBe(us(70));
    expect(session.stats.seeks).toBe(1);
    expect(decoder().fed[0]).toMatchObject({ type: "key", timestamp: us(60) });
    // Frames 60..69 were decoded but not delivered; the ones pushed out of the ring count as dropped.
    expect(session.stats.decoded).toBeGreaterThanOrEqual(11);
    expect(session.stats.dropped).toBeGreaterThanOrEqual(10 - RING_SIZE + 1);
  });

  it("steps back through the ring without a seek, and seeks beyond it", async () => {
    const { session, decoder, shown } = setup(linearIndex(120));
    await shown(40);
    expect(await shown(39)).toBe(us(39));
    expect(await shown(35)).toBe(us(35));
    expect(session.stats.ringHits).toBe(2);
    expect(session.stats.seeks).toBe(1);
    const before = decoder().fed.length;
    expect(await shown(31)).toBe(us(31));
    expect(session.stats.seeks).toBe(2);
    expect(firstFedAfter(decoder(), before)).toBe(us(30));
  });

  it("continues forward inside the run and seeks for a later GOP", async () => {
    const { session, decoder, shown } = setup(linearIndex(120));
    await shown(2);
    expect(await shown(25)).toBe(us(25));
    expect(session.stats.seeks).toBe(1);
    const before = decoder().fed.length;
    expect(await shown(95)).toBe(us(95));
    expect(session.stats.seeks).toBe(2);
    expect(firstFedAfter(decoder(), before)).toBe(us(90));
  });

  it("delivers the keyframe first for a scrub far from it", async () => {
    const { shown } = setup(linearIndex(60));
    const approximate: number[] = [];
    const collect = (frame: FakeFrame) => {
      approximate.push(frame.timestamp);
      frame.close();
    };
    expect(await shown(25, "scrub", collect)).toBe(us(25));
    expect(approximate).toEqual([us(0)]);
    // Close to its keyframe, or not a scrub: no approximate frame.
    expect(await shown(32, "scrub", collect)).toBe(us(32));
    expect(await shown(55, "playback", collect)).toBe(us(55));
    expect(approximate).toEqual([us(0)]);
    expect(frameCounter.open).toBeLessThanOrEqual(RING_SIZE);
  });

  it("seeks without a flush or a reset; frames still in flight land in the ring", async () => {
    const { session, decoders, decoder } = setup(linearIndex(120), { auto: false });
    const signal = new AbortController().signal;
    /** Steps the decoder by hand until the request resolves. */
    const pump = async (request: Promise<FakeFrame>) => {
      let result: FakeFrame | null = null;
      void request.then((frame) => (result = frame));
      for (let i = 0; i < 400 && !result; i++) {
        decoder().step();
        for (let j = 0; j < 4; j++) await Promise.resolve();
      }
      const frame = result as FakeFrame | null;
      frame?.close();
      return frame?.timestamp;
    };
    // A scrub toward frame 20 is superseded while frames 2..5 are still in the decoder.
    const superseded = new AbortController();
    void session.frame(20, "scrub", superseded.signal).catch(() => undefined);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    for (let i = 0; i < 2; i++) {
      decoder().step();
      for (let j = 0; j < 8; j++) await Promise.resolve();
    }
    expect(decoder().decodeQueueSize).toBe(MAX_DECODE_QUEUE);
    superseded.abort();
    expect(await pump(session.frame(33, "scrub", signal))).toBe(us(33));
    expect(session.stats.seeks).toBe(2);
    expect(decoders).toHaveLength(1);
    expect(decoder().resets).toBe(0);
    expect(decoder().flushes).toBe(0);
    expect(decoder().fed.filter((c) => c.type === "key").map((c) => c.timestamp)).toEqual([us(0), us(30)]);
    // Frame 4 was in flight at the seek: decoded before the new run, it is in the ring.
    const frame = await session.frame(4, "playback", signal);
    frame.close();
    expect(frame.timestamp).toBe(us(4));
    expect(session.stats).toMatchObject({ seeks: 2, ringHits: 1 });
  });

  it("sends the newest decoded frame now and then while scrubs wait", async () => {
    let clock = 0;
    const { session, decoder } = setup(linearIndex(60), { auto: false }, () => clock);
    const approximate: number[] = [];
    const done = session.frame(50, "scrub", new AbortController().signal, (frame) => {
      approximate.push(frame.timestamp);
      frame.close();
    });
    const steps = async (count: number) => {
      for (let i = 0; i < count; i++) {
        decoder().step();
        for (let j = 0; j < 4; j++) await Promise.resolve();
      }
    };
    // The keyframe (30) at once, then nothing until the interval has passed.
    await steps(6);
    expect(approximate).toEqual([us(30)]);
    clock += APPROXIMATE_INTERVAL_MS;
    await steps(1);
    expect(approximate).toHaveLength(2);
    const second = approximate[1] as number;
    expect(second).toBeGreaterThanOrEqual(us(35));
    clock += APPROXIMATE_INTERVAL_MS;
    await steps(40);
    (await done).close();
    // Later stand-ins move toward the target and never reach it.
    expect(approximate.length).toBeGreaterThanOrEqual(3);
    expect(approximate[2]).toBeGreaterThan(second);
    expect(approximate.every((t) => t < us(50))).toBe(true);
  });

  it("keeps sending stand-ins during a drag whose scrubs supersede each other", async () => {
    let clock = 0;
    const { session, decoder } = setup(linearIndex(120), { auto: false }, () => clock);
    const stand: number[] = [];
    const collect = (frame: FakeFrame) => {
      stand.push(frame.timestamp);
      frame.close();
    };
    const step = async () => {
      decoder().step();
      for (let j = 0; j < 6; j++) await Promise.resolve();
    };
    // A fast forward drag: a new scrub every animation frame, each cancelling the previous one
    // before the decoder reaches it.
    let controller = new AbortController();
    for (let target = 50; target <= 86; target += 4) {
      controller.abort();
      controller = new AbortController();
      void session.frame(target, "scrub", controller.signal, collect).then(
        (frame) => frame.close(),
        () => undefined,
      );
      await step();
      clock += 16;
      await step();
    }
    controller.abort();
    // The keyframe of the first scrub, then the newest decoded frame about every other move.
    expect(stand[0]).toBe(us(30));
    expect(stand.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < stand.length; i++) expect(stand[i]).toBeGreaterThan(stand[i - 1] as number);
    // One seek per GOP: targets past 60 jump ahead to that keyframe instead of decoding through.
    expect(session.stats.seeks).toBe(2);
  });

  it("keeps the decoder queue and the frames in flight bounded", async () => {
    const { session, decoder } = setup(linearIndex(60), { auto: false });
    const done = session.frame(29, "playback", new AbortController().signal);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(decoder().decodeQueueSize).toBe(MAX_DECODE_QUEUE);
    for (let i = 0; i < 200 && decoder().outputs < 30; i++) {
      decoder().step();
      for (let j = 0; j < 5; j++) await Promise.resolve();
    }
    (await done).close();
    expect(decoder().maxQueue).toBeLessThanOrEqual(MAX_DECODE_QUEUE);
    expect(decoder().maxInFlight).toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  it("flushes at the end of the track, then seeks again", async () => {
    const index = bFrameIndex(2);
    const { session, decoder, shown } = setup(index, { reorder: 2 });
    expect(await shown(13)).toBe(us(13));
    expect(await shown(12)).toBe(us(12)); // in the ring
    const before = decoder().fed.length;
    expect(await shown(3)).toBe(us(3));
    expect(session.stats.seeks).toBe(2);
    expect(firstFedAfter(decoder(), before)).toBe(us(0));
  });

  it("cancels a request, keeps working, and leaks no frames", async () => {
    const { session, shown } = setup(linearIndex(90));
    const controller = new AbortController();
    const cancelled = session.frame(80, "scrub", controller.signal, (frame) => frame.close());
    controller.abort(new DOMException("superseded", "AbortError"));
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(await shown(45)).toBe(us(45));
    expect(frameCounter.open).toBe(session.openFrames);
  });

  it("runs a scrub before a prefetch that is under way, which then completes in order", async () => {
    const { session, shown } = setup(linearIndex(200));
    const delivered: number[] = [];
    const prefetch = session.prefetch(0, 99, new AbortController().signal, (frame) => {
      delivered.push(frame.timestamp);
      frame.close();
    });
    await Promise.resolve();
    await Promise.resolve();
    const scrub = shown(150, "scrub");
    expect(await scrub).toBe(us(150));
    expect(delivered.length).toBeLessThan(100);
    expect(await prefetch).toBe(100);
    expect(delivered).toEqual(Array.from({ length: 100 }, (_, p) => us(p)));
  });

  it("delivers every stride-th frame of a prefetch and decodes the ones between", async () => {
    const { session, decoder } = setup(linearIndex(60));
    const delivered: number[] = [];
    const count = await session.prefetch(2, 20, new AbortController().signal, (frame) => {
      delivered.push(frame.timestamp);
      frame.close();
    }, { stride: 4, priority: "playback" });
    expect(count).toBe(5);
    expect(delivered).toEqual([2, 6, 10, 14, 18].map(us));
    expect(decoder().fed.length).toBeGreaterThanOrEqual(19);
    expect(session.stats.seeks).toBe(1);
    expect(frameCounter.open).toBe(session.openFrames);
  });

  it("runs a playback window before idle warming queued ahead of it", async () => {
    const { session } = setup(linearIndex(300));
    const order: string[] = [];
    const busy = session.prefetch(0, 2, new AbortController().signal, (frame) => frame.close());
    const warm = session.prefetch(200, 202, new AbortController().signal, (frame) => frame.close()).then(() => order.push("warm"));
    const window = session.prefetch(10, 12, new AbortController().signal, (frame) => frame.close(), { priority: "playback" }).then(() => order.push("window"));
    await Promise.all([busy, warm, window]);
    expect(order).toEqual(["window", "warm"]);
  });

  it("closes the ring with the decoder and starts a new one on demand", async () => {
    const { session, decoders, shown } = setup(linearIndex(60));
    await shown(10);
    expect(frameCounter.open).toBeGreaterThan(0);
    session.closeDecoder();
    expect(frameCounter.open).toBe(0);
    expect(session.live).toBe(false);
    expect(decoders[0]?.state).toBe("closed");
    expect(await shown(11)).toBe(us(11));
    expect(decoders).toHaveLength(2);
    expect(session.stats.seeks).toBe(2);
  });

  it("rejects queued and running jobs on dispose", async () => {
    const { session } = setup(linearIndex(60), { auto: false });
    const running = session.frame(20, "playback", new AbortController().signal);
    const queued = session.frame(40, "playback", new AbortController().signal);
    await Promise.resolve();
    session.dispose();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(frameCounter.open).toBe(0);
  });

  it("marks the video undecodable when the decoder fails before any frame came out", async () => {
    const { decoders, shown } = setup(linearIndex(60), { failAt: us(0) });
    await expect(shown(3)).rejects.toMatchObject({ name: "UnsupportedCodecError", message: expect.stringContaining("avc1.64001f") });
    // Later requests fail at once, without a new decoder.
    await expect(shown(40)).rejects.toMatchObject({ name: "UnsupportedCodecError" });
    expect(decoders).toHaveLength(1);
  });

  it("fails the request on a decoder error, then recovers with a new decoder", async () => {
    const { decoders, shown } = setup(linearIndex(60), { failAt: us(5) });
    await expect(shown(8)).rejects.toThrow("decode failed");
    // The fake fails at the same frame again; a request elsewhere works.
    expect(await shown(40)).toBe(us(40));
    expect(decoders).toHaveLength(2);
  });

  it("drops the leading pictures of an open GOP decoded without the GOP before them", async () => {
    // I0 P2 B1 | CRA4 RASL3 P5: frame 5 starts from the CRA; the RASL frame (3) comes out without its references.
    const index = indexOf([
      { cts: 0, sync: true },
      { cts: 2, sync: false },
      { cts: 1, sync: false },
      { cts: 4, sync: true },
      { cts: 3, sync: false },
      { cts: 5, sync: false },
    ]);
    const { session, shown } = setup(index, { reorder: 1 });
    expect(await shown(5)).toBe(us(5));
    const dropped = session.stats.dropped;
    // Frame 3 (a leading picture) was decoded but not kept: asking for it decodes from the GOP before.
    expect(await shown(3)).toBe(us(3));
    expect(session.stats.ringHits).toBe(0);
    expect(session.stats.seeks).toBe(2);
    expect(dropped).toBeGreaterThanOrEqual(1);
  });

  it("seeks from the GOP before for a leading picture in flight, and drops the copy decoded without it", async () => {
    // I0 P2 B1 | CRA4 RASL3 P5 P6 ... P11: RASL3 references P2.
    const index = indexOf([
      { cts: 0, sync: true },
      { cts: 2, sync: false },
      { cts: 1, sync: false },
      { cts: 4, sync: true },
      { cts: 3, sync: false },
      ...Array.from({ length: 7 }, (_, i) => ({ cts: 5 + i, sync: false })),
    ]);
    const { session, decoder } = setup(index, { reorder: 1, auto: false, decodeOrder: Array.from(index.timesUs), references: new Map([[us(3), us(2)]]) });
    // A backward drag: a scrub to frame 5 starts a run at the CRA and is superseded while its chunks
    // (CRA4, RASL3, P5) are still in the decoder; the next move lands on RASL3.
    const superseded = new AbortController();
    void session.frame(5, "scrub", superseded.signal).catch(() => undefined);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(decoder().fed.map((c) => c.timestamp)).toEqual([us(4), us(3), us(5)]);
    superseded.abort();
    let result: FakeFrame | null = null;
    void session.frame(3, "scrub", new AbortController().signal, (frame) => frame.close()).then((frame) => (result = frame));
    for (let i = 0; i < 100 && !result; i++) {
      decoder().step();
      for (let j = 0; j < 6; j++) await Promise.resolve();
    }
    const frame = result as FakeFrame | null;
    frame?.close();
    expect(frame?.timestamp).toBe(us(3));
    expect(frame?.corrupt).toBe(false);
    expect(session.stats.seeks).toBe(2);
    expect(decoder().fed.filter((c) => c.type === "key").map((c) => c.timestamp)).toEqual([us(4), us(0), us(4)]);
  });

  it("keeps the frames of a superseded run apart from the new run's copies of the same timestamps", async () => {
    // I0 P2 B1 | CRA4 RASL3 P7 B5 B6 | I8 P9 P10 P11: RASL3 references P2.
    const index = indexOf([
      { cts: 0, sync: true },
      { cts: 2, sync: false },
      { cts: 1, sync: false },
      { cts: 4, sync: true },
      { cts: 3, sync: false },
      { cts: 7, sync: false },
      { cts: 5, sync: false },
      { cts: 6, sync: false },
      ...Array.from({ length: 4 }, (_, i) => ({ cts: 8 + i, sync: i === 0 })),
    ]);
    const { session, decoder } = setup(index, { reorder: 1, auto: false, decodeOrder: Array.from(index.timesUs), references: new Map([[us(3), us(2)]]) });
    const settle = async () => {
      for (let j = 0; j < 8; j++) await Promise.resolve();
    };
    const pump = async (request: Promise<FakeFrame>) => {
      let result: FakeFrame | null = null;
      void request.then((frame) => (result = frame));
      for (let i = 0; i < 100 && !result; i++) {
        decoder().step();
        await settle();
      }
      return result as FakeFrame | null;
    };
    // A playback window from frame 4 takes its frames out of the ring; it is cancelled after 4 and 5,
    // with P7 and B6 still in the decoder.
    const window = new AbortController();
    const delivered: number[] = [];
    void session
      .prefetch(4, 6, window.signal, (frame) => {
        delivered.push(frame.timestamp);
        frame.close();
      })
      .catch(() => undefined);
    await settle();
    for (let i = 0; i < 20 && delivered.length < 2; i++) {
      decoder().step();
      await settle();
    }
    expect(delivered).toEqual([us(4), us(5)]);
    window.abort();
    // Frame 5 again: no longer in the ring, so a new run starts at CRA4 and feeds 7 while the
    // superseded run's 7 is still to come out. That output must not count as the new run's.
    const five = await pump(session.frame(5, "playback", new AbortController().signal));
    five?.close();
    expect(five?.timestamp).toBe(us(5));
    expect(session.stats.seeks).toBe(2);
    // The new run's RASL3 (decoded without P2) was dropped, not kept as frame 3.
    const three = await pump(session.frame(3, "playback", new AbortController().signal));
    three?.close();
    expect(three?.timestamp).toBe(us(3));
    expect(three?.corrupt).toBe(false);
    expect(session.stats.seeks).toBe(3);
    session.dispose();
    expect(frameCounter.open).toBe(0);
  });

  it("counts no stall while the decoder works on chunks it was just given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    // A decoder that takes chunks at once and outputs each frame 17 ms later (a 4K keyframe, a new decoder).
    const { session, decoder } = setup(linearIndex(240), { latencyMs: 17 }, () => Date.now());
    const lastFed = () => Math.max(...decoder().fed.map((c) => c.timestamp));
    const frame = async (position: number, priority: "scrub" | "playback") => {
      // Scrubs always come with a stand-in callback (DecodeSessions passes one), so they wait in short slices.
      const request = session.frame(position, priority, new AbortController().signal, (stand) => stand.close());
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await request;
      result.close();
      return result.timestamp;
    };
    expect(await frame(10, "scrub")).toBe(us(10));
    expect(lastFed()).toBe(us(10));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await frame(50, "scrub")).toBe(us(50));
    expect(lastFed()).toBe(us(50));
    // No chunk fed past the target, so the next seek waits for nothing extra.
    expect(await frame(200, "playback")).toBe(us(200));
    expect(lastFed()).toBe(us(200));
    expect(session.stats).toMatchObject({ stalls: 0, seeks: 3 });
  });

  it("shows the nearest frame when the decoder drops the target", async () => {
    const { shown } = setup(linearIndex(60), { drop: new Set([us(12)]) });
    // 11 or 13: the stall that feeds 13 also frees the ring.
    expect([us(11), us(13)]).toContain(await shown(12));
  });

  it("feeds more to a decoder that holds frames longer than the content needs, and remembers it", async () => {
    vi.useFakeTimers();
    const holds = MAX_IN_FLIGHT + 2;
    const { session, shown } = setup(linearIndex(60), { reorder: holds });
    const result = shown(0);
    await vi.advanceTimersByTimeAsync(STALL_MS * (holds + 2));
    expect(await result).toBe(us(0));
    expect(session.stats.stalls).toBe(holds);
    // The next frames need no new stall.
    const next = shown(1);
    await vi.advanceTimersByTimeAsync(STALL_MS);
    expect(await next).toBe(us(1));
    expect(session.stats.stalls).toBe(holds);
  });
});
