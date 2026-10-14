import { describe, expect, it } from "vitest";
import { ByteSource, ChunkCache } from "./ByteSource.js";

const blobOf = (length: number) => new Blob([Uint8Array.from({ length }, (_, i) => i % 251)]);
const bytes = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)];
const expected = (offset: number, length: number) => Array.from({ length }, (_, i) => (offset + i) % 251);

describe("ByteSource", () => {
  it("reads ranges inside one chunk and across chunks", async () => {
    const source = new ByteSource(blobOf(1000), new ChunkCache(), 64);
    expect(source.size).toBe(1000);
    expect(bytes(await source.read(10, 20))).toEqual(expected(10, 20));
    expect(bytes(await source.read(60, 140))).toEqual(expected(60, 140));
    expect(bytes(await source.read(0, 1000))).toEqual(expected(0, 1000));
  });

  it("clamps to the end of the file", async () => {
    const source = new ByteSource(blobOf(100), new ChunkCache(), 64);
    expect(bytes(await source.read(90, 50))).toEqual(expected(90, 10));
    expect((await source.read(200, 10)).byteLength).toBe(0);
    expect(bytes(await source.read(-5, 10))).toEqual(expected(0, 5));
  });

  it("serves repeated reads from the cache and shares in-flight chunk reads", async () => {
    const source = new ByteSource(blobOf(1000), new ChunkCache(), 100);
    await Promise.all([source.read(0, 10), source.read(20, 10), source.read(50, 100)]);
    expect(source.chunkReads).toBe(2);
    await source.read(0, 200);
    expect(source.chunkReads).toBe(2);
  });

  it("returns copies that callers may keep or transfer", async () => {
    const source = new ByteSource(blobOf(100), new ChunkCache(), 64);
    const first = new Uint8Array(await source.read(0, 4));
    first[0] = 99;
    expect(bytes(await source.read(0, 4))).toEqual(expected(0, 4));
  });

  it("release forgets the source's chunks", async () => {
    const cache = new ChunkCache();
    const source = new ByteSource(blobOf(300), cache, 100);
    await source.read(0, 300);
    expect(cache.size).toBe(300);
    source.release();
    expect(cache.size).toBe(0);
  });
});

describe("ChunkCache", () => {
  it("evicts the least recently used chunks beyond the byte budget", () => {
    const cache = new ChunkCache(300);
    cache.set("a", new ArrayBuffer(100));
    cache.set("b", new ArrayBuffer(100));
    cache.set("c", new ArrayBuffer(100));
    cache.get("a");
    cache.set("d", new ArrayBuffer(100));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.size).toBe(300);
  });

  it("keeps a single chunk larger than the budget until the next insert", () => {
    const cache = new ChunkCache(50);
    cache.set("big", new ArrayBuffer(100));
    expect(cache.get("big")).toBeDefined();
    cache.set("small", new ArrayBuffer(10));
    expect(cache.get("big")).toBeUndefined();
    expect(cache.size).toBe(10);
  });

  it("is shared across sources with distinct keys", async () => {
    const cache = new ChunkCache(64 * 4);
    const a = new ByteSource(blobOf(128), cache, 64);
    const b = new ByteSource(new Blob([new Uint8Array(128).fill(7)]), cache, 64);
    await a.read(0, 128);
    await b.read(0, 128);
    expect(bytes(await a.read(0, 2))).toEqual([0, 1]);
    expect(bytes(await b.read(0, 2))).toEqual([7, 7]);
    expect(a.chunkReads + b.chunkReads).toBe(4);
  });
});
