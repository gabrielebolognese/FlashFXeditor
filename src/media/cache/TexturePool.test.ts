import { describe, expect, it, vi } from "vitest";
import type { TextureHandle } from "../../render/gpu/renderer.js";
import { imageKey, TexturePool, type TextureKey } from "./TexturePool.js";

const MB = 1024 * 1024;

function texture(bytes: number) {
  const handle = {
    width: 1,
    height: 1,
    mipLevels: 1,
    bytes,
    valid: true,
    destroyed: 0,
    destroy() {
      handle.destroyed += 1;
      handle.valid = false;
    },
  };
  return handle satisfies TextureHandle;
}

const frame = (mediaId: string, timeUs: number): TextureKey => ({ mediaId, lod: "full", timeUs });

describe("TexturePool", () => {
  it("stores and returns textures by (mediaId, lod, timeUs)", () => {
    const pool = new TexturePool(100 * MB);
    const a = texture(MB);
    pool.put(frame("m1", 0), a);
    expect(pool.get(frame("m1", 0))).toBe(a);
    expect(pool.get(frame("m1", 1))).toBeNull();
    expect(pool.get({ mediaId: "m1", lod: "proxy", timeUs: 0 })).toBeNull();
    expect(pool.stats).toMatchObject({ count: 1, bytes: MB });
  });

  it("evicts the least recently used textures to fit the budget and destroys them", () => {
    const pool = new TexturePool(64 * MB);
    const a = texture(30 * MB);
    const b = texture(30 * MB);
    const c = texture(30 * MB);
    pool.put(imageKey("a"), a);
    pool.put(imageKey("b"), b);
    pool.get(imageKey("a")); // a is now more recent than b
    pool.put(imageKey("c"), c);
    expect(pool.has(imageKey("b"))).toBe(false);
    expect(b.destroyed).toBe(1);
    expect(pool.has(imageKey("a"))).toBe(true);
    expect(pool.has(imageKey("c"))).toBe(true);
    expect(pool.stats).toMatchObject({ count: 2, bytes: 60 * MB, evictions: 1 });
  });

  it("keeps a texture larger than the budget it was just added for", () => {
    const pool = new TexturePool(64 * MB);
    const small = texture(10 * MB);
    const big = texture(80 * MB);
    pool.put(imageKey("small"), small);
    pool.put(imageKey("big"), big);
    expect(pool.get(imageKey("big"))).toBe(big);
    expect(small.destroyed).toBe(1);
    expect(pool.stats.bytes).toBe(80 * MB);
  });

  it("never evicts pinned textures, and evicts them once unpinned when over budget", () => {
    const pool = new TexturePool(64 * MB);
    const a = texture(40 * MB);
    const b = texture(40 * MB);
    const unpin = pool.pin(imageKey("a"));
    pool.put(imageKey("a"), a);
    pool.put(imageKey("b"), b);
    expect(a.destroyed).toBe(0);
    expect(pool.stats).toMatchObject({ count: 2, pinned: 1, bytes: 80 * MB });
    unpin();
    unpin(); // twice is harmless
    expect(a.destroyed).toBe(1);
    expect(pool.stats).toMatchObject({ count: 1, pinned: 0, bytes: 40 * MB });
  });

  it("counts pins", () => {
    const pool = new TexturePool(MB);
    const first = pool.pin(imageKey("a"));
    const second = pool.pin(imageKey("a"));
    first();
    expect(pool.isPinned(imageKey("a"))).toBe(true);
    second();
    expect(pool.isPinned(imageKey("a"))).toBe(false);
  });

  it("evicts when the budget shrinks", () => {
    const pool = new TexturePool(768 * MB);
    for (let i = 0; i < 5; i += 1) pool.put(imageKey(`m${i}`), texture(30 * MB));
    pool.setBudget(64 * MB);
    expect(pool.stats).toMatchObject({ count: 2, bytes: 60 * MB, budget: 64 * MB, evictions: 3 });
    expect(pool.has(imageKey("m3"))).toBe(true);
    expect(pool.has(imageKey("m4"))).toBe(true);
  });

  it("replaces an entry and destroys the previous texture", () => {
    const pool = new TexturePool(100 * MB);
    const a = texture(MB);
    const b = texture(2 * MB);
    pool.put(imageKey("a"), a);
    pool.put(imageKey("a"), b);
    expect(a.destroyed).toBe(1);
    expect(pool.stats).toMatchObject({ count: 1, bytes: 2 * MB });
  });

  it("drops stale textures (lost device) on get", () => {
    const pool = new TexturePool(100 * MB);
    const a = texture(MB);
    pool.put(frame("m", 0), a);
    a.valid = false;
    expect(pool.get(frame("m", 0))).toBeNull();
    expect(pool.stats.count).toBe(0);
  });

  it("deletes by key, by media and everything", () => {
    const pool = new TexturePool(100 * MB);
    const textures = [texture(MB), texture(MB), texture(MB), texture(MB)];
    pool.put(frame("m1", 0), textures[0]!);
    pool.put(frame("m1", 33_333), textures[1]!);
    pool.put(frame("m2", 0), textures[2]!);
    pool.put(imageKey("m3"), textures[3]!);
    const proxyTexture = texture(MB);
    pool.put({ mediaId: "m1", lod: "proxy", timeUs: 0 }, proxyTexture);
    expect(pool.deleteMedia("m1", "proxy")).toBe(1);
    expect(proxyTexture.destroyed).toBe(1);
    expect(pool.delete(frame("m2", 0))).toBe(true);
    expect(pool.delete(frame("m2", 0))).toBe(false);
    expect(pool.deleteMedia("m1")).toBe(2);
    expect(pool.stats.count).toBe(1);
    pool.clear();
    expect(pool.stats).toMatchObject({ count: 0, bytes: 0 });
    expect(textures.every((t) => t.destroyed === 1)).toBe(true);
  });

  it("notifies listeners on changes", () => {
    const pool = new TexturePool(100 * MB);
    const listener = vi.fn();
    const stop = pool.subscribe(listener);
    pool.put(imageKey("a"), texture(MB));
    pool.delete(imageKey("a"));
    pool.setBudget(MB);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    pool.put(imageKey("a"), texture(MB));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
