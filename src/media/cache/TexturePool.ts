// GPU texture pool (spec §9.3, P6, P13): the main-thread cache of uploaded frames and images, an LRU
// within a byte budget. Keys are `(mediaId, lod, timeUs)`; a static image has one mipmapped texture
// under `imageKey`. Pinned entries are never evicted. Every texture that leaves the pool (eviction,
// replacement, delete, clear) is destroyed at once.
// TODO(batch 09): the playback engine pins the frames within ±1 s of the playhead (P6).
import type { MediaId } from "../../core/document/types.js";
import type { TextureHandle } from "../../render/gpu/renderer.js";

export type Lod = "full" | "proxy";

export interface TextureKey {
  mediaId: MediaId;
  lod: Lod;
  /** Media time of the frame in integer microseconds; `STILL_US` for a static image. */
  timeUs: number;
}

/** The time of a static image's one texture. */
export const STILL_US = -1;

/** Default budget (P6). */
export const DEFAULT_TEXTURE_BUDGET = 768 * 1024 * 1024;

export const imageKey = (mediaId: MediaId): TextureKey => ({ mediaId, lod: "full", timeUs: STILL_US });

export interface TexturePoolStats {
  count: number;
  bytes: number;
  budget: number;
  pinned: number;
  /** Textures evicted for the budget since the pool was created. */
  evictions: number;
}

interface Entry {
  key: TextureKey;
  texture: TextureHandle;
}

const keyId = (key: TextureKey) => `${key.mediaId}|${key.lod}|${key.timeUs}`;

export class TexturePool {
  /** Least recently used first (Map insertion order; a hit moves the entry to the end). */
  private readonly entries = new Map<string, Entry>();
  /** Pin counts by key id; a pin may precede the texture it protects. */
  private readonly pins = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private bytes = 0;
  private evictions = 0;

  constructor(private budget: number = DEFAULT_TEXTURE_BUDGET) {}

  /** The texture under `key` (marked most recently used), or null. Stale textures (lost device) are dropped. */
  get(key: TextureKey): TextureHandle | null {
    const id = keyId(key);
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (!entry.texture.valid) {
      this.remove(id, entry);
      this.changed();
      return null;
    }
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry.texture;
  }

  has(key: TextureKey): boolean {
    return this.entries.has(keyId(key));
  }

  /** Adds `texture` as the most recently used entry, replacing (and destroying) the previous one. */
  put(key: TextureKey, texture: TextureHandle): void {
    const id = keyId(key);
    const previous = this.entries.get(id);
    if (previous) {
      this.entries.delete(id);
      this.bytes -= previous.texture.bytes;
      if (previous.texture !== texture) previous.texture.destroy();
    }
    this.entries.set(id, { key, texture });
    this.bytes += texture.bytes;
    this.evict(id);
    this.changed();
  }

  delete(key: TextureKey): boolean {
    const id = keyId(key);
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.remove(id, entry);
    this.changed();
    return true;
  }

  /** Drops every texture of a media (removed from the project). Returns how many went. */
  deleteMedia(mediaId: MediaId): number {
    let count = 0;
    for (const [id, entry] of [...this.entries]) {
      if (entry.key.mediaId !== mediaId) continue;
      this.remove(id, entry);
      count += 1;
    }
    if (count > 0) this.changed();
    return count;
  }

  /** Drops everything (project closed, device lost). Pins stay. */
  clear(): void {
    if (this.entries.size === 0) return;
    for (const entry of this.entries.values()) entry.texture.destroy();
    this.entries.clear();
    this.bytes = 0;
    this.changed();
  }

  /** Protects `key` from eviction until the returned function is called (counted; safe to call twice). */
  pin(key: TextureKey): () => void {
    const id = keyId(key);
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.pins.get(id) ?? 1) - 1;
      if (count > 0) this.pins.set(id, count);
      else this.pins.delete(id);
      if (this.bytes > this.budget) {
        this.evict(null);
        this.changed();
      }
    };
  }

  isPinned(key: TextureKey): boolean {
    return this.pins.has(keyId(key));
  }

  setBudget(bytes: number): void {
    this.budget = Math.max(0, bytes);
    this.evict(null);
    this.changed();
  }

  get stats(): TexturePoolStats {
    let pinned = 0;
    for (const id of this.entries.keys()) if (this.pins.has(id)) pinned += 1;
    return { count: this.entries.size, bytes: this.bytes, budget: this.budget, pinned, evictions: this.evictions };
  }

  /** Called after every change (dev stats). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Evicts unpinned entries, oldest first, until the pool fits its budget. `keep` (just added) stays. */
  private evict(keep: string | null): void {
    if (this.bytes <= this.budget) return;
    for (const [id, entry] of [...this.entries]) {
      if (this.bytes <= this.budget) break;
      if (id === keep || this.pins.has(id)) continue;
      this.remove(id, entry);
      this.evictions += 1;
    }
  }

  private remove(id: string, entry: Entry): void {
    this.entries.delete(id);
    this.bytes -= entry.texture.bytes;
    entry.texture.destroy();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
