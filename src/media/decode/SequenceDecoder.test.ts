import { describe, expect, it } from "vitest";
import { createSequenceDecoder } from "./SequenceDecoder.js";

class F {
  closed = false;
  constructor(readonly timestamp: number) {}
  clone() {
    return new F(this.timestamp);
  }
  close() {
    this.closed = true;
  }
}

function setup() {
  const pending = new Map<number, { resolve(f: F): void; reject(e: Error): void }>();
  const made: F[] = [];
  const out: F[] = [];
  const errors: Error[] = [];
  let dequeues = 0;
  const decoder = createSequenceDecoder<F>(
    { output: (f) => out.push(f), error: (e) => errors.push(e), dequeue: () => void dequeues++ },
    {
      frameFrom: (_data, timestamp) =>
        new Promise<F>((resolve, reject) => {
          pending.set(timestamp, { resolve: (f) => (made.push(f), resolve(f)), reject });
        }),
    },
  );
  const chunk = (timestamp: number) => ({ type: "key" as const, timestamp, duration: 1, data: new ArrayBuffer(1) });
  return { decoder, pending, out, errors, made, chunk, dequeues: () => dequeues };
}

describe("createSequenceDecoder", () => {
  it("gives frames out in feed order even when a later one finishes first", async () => {
    const s = setup();
    s.decoder.configure({ codec: "x" });
    s.decoder.decode(s.chunk(0));
    s.decoder.decode(s.chunk(1));
    expect(s.decoder.decodeQueueSize).toBe(2);
    s.pending.get(1)?.resolve(new F(1));
    await Promise.resolve();
    expect(s.out).toHaveLength(0);
    s.pending.get(0)?.resolve(new F(0));
    await s.decoder.flush();
    expect(s.out.map((f) => f.timestamp)).toEqual([0, 1]);
    expect(s.decoder.decodeQueueSize).toBe(0);
    expect(s.dequeues()).toBe(2);
  });

  it("closes frames that finish after a reset, and reports a failed decode", async () => {
    const s = setup();
    s.decoder.configure({ codec: "x" });
    s.decoder.decode(s.chunk(0));
    s.decoder.reset();
    s.pending.get(0)?.resolve(new F(0));
    await s.decoder.flush();
    expect(s.out).toHaveLength(0);
    expect(s.made[0]?.closed).toBe(true);
    s.decoder.configure({ codec: "x" });
    s.decoder.decode(s.chunk(5));
    s.pending.get(5)?.reject(new Error("bad png"));
    await s.decoder.flush();
    expect(s.errors.map((e) => e.message)).toEqual(["bad png"]);
  });

  it("refuses frames before it is configured", () => {
    expect(() => setup().decoder.decode(setup().chunk(0))).toThrow();
  });
});
