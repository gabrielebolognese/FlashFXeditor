// The decoded-audio memory cache (spec §14): AudioBuffers by media and segment, least recently used
// first out once the bytes pass the budget (512 MB). The entry just stored is never evicted, so one
// buffer larger than the budget still plays. Buffers stay on the main thread.
import type { MediaId } from "../../core/document/types.js";

export const DEFAULT_AUDIO_BUDGET = 512 * 1024 * 1024;

/** The parts of an AudioBuffer the cache measures. */
export interface SizedBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
}

export const bufferBytes = (buffer: SizedBuffer) => buffer.length * buffer.numberOfChannels * 4;

export interface AudioCacheStats {
  entries: number;
  bytes: number;
  budget: number;
  evictions: number;
}

const keyOf = (mediaId: MediaId, segment: number) => `${mediaId}#${segment}`;

export class AudioBufferCache<B extends SizedBuffer = AudioBuffer> {
  readonly stats: AudioCacheStats;
  /** Insertion order = recency order (oldest first). */
  private readonly entries = new Map<string, { mediaId: MediaId; buffer: B }>();

  constructor(budget = DEFAULT_AUDIO_BUDGET) {
    this.stats = { entries: 0, bytes: 0, budget, evictions: 0 };
  }

  get(mediaId: MediaId, segment: number): B | null {
    const key = keyOf(mediaId, segment);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.buffer;
  }

  has(mediaId: MediaId, segment: number): boolean {
    return this.entries.has(keyOf(mediaId, segment));
  }

  set(mediaId: MediaId, segment: number, buffer: B): void {
    const key = keyOf(mediaId, segment);
    this.remove(key);
    this.entries.set(key, { mediaId, buffer });
    this.stats.bytes += bufferBytes(buffer);
    for (const oldest of this.entries.keys()) {
      if (this.stats.bytes <= this.stats.budget || oldest === key) break;
      this.remove(oldest);
      this.stats.evictions += 1;
    }
    this.stats.entries = this.entries.size;
  }

  /** Drops every segment of a media (removed from the project). */
  release(mediaId: MediaId): void {
    for (const [key, entry] of this.entries) if (entry.mediaId === mediaId) this.remove(key);
    this.stats.entries = this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.stats.bytes = 0;
    this.stats.entries = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.stats.bytes -= bufferBytes(entry.buffer);
  }
}
