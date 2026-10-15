import { describe, expect, it } from "vitest";
import { AudioBufferCache, bufferBytes, type SizedBuffer } from "./AudioBufferCache.js";

const buffer = (seconds: number, channels = 2) => ({ length: seconds * 100, numberOfChannels: channels });

describe("AudioBufferCache", () => {
  it("measures buffers as 32-bit samples per channel", () => {
    expect(bufferBytes(buffer(1))).toBe(800);
  });

  it("evicts the least recently used buffers past the budget", () => {
    const cache = new AudioBufferCache<SizedBuffer>(2000);
    const a = buffer(1);
    const b = buffer(1);
    const c = buffer(1);
    cache.set("a", 0, a);
    cache.set("b", 0, b);
    expect(cache.get("a", 0)).toBe(a); // a is now the most recent
    cache.set("c", 0, c);
    expect(cache.get("b", 0)).toBeNull();
    expect(cache.get("a", 0)).toBe(a);
    expect(cache.stats).toMatchObject({ entries: 2, bytes: 1600, evictions: 1 });
  });

  it("keeps the newest buffer even when it alone exceeds the budget", () => {
    const cache = new AudioBufferCache<SizedBuffer>(1000);
    cache.set("a", 0, buffer(1));
    const big = buffer(10);
    cache.set("big", 0, big);
    expect(cache.get("big", 0)).toBe(big);
    expect(cache.has("a", 0)).toBe(false);
  });

  it("replaces a segment, releases a media and clears", () => {
    const cache = new AudioBufferCache<SizedBuffer>();
    cache.set("a", 0, buffer(1));
    cache.set("a", 0, buffer(2));
    cache.set("a", 1, buffer(1));
    cache.set("b", 0, buffer(1));
    expect(cache.stats.bytes).toBe(1600 + 800 + 800);
    cache.release("a");
    expect(cache.has("a", 0) || cache.has("a", 1)).toBe(false);
    expect(cache.stats).toMatchObject({ entries: 1, bytes: 800 });
    cache.clear();
    expect(cache.stats).toMatchObject({ entries: 0, bytes: 0 });
  });
});
