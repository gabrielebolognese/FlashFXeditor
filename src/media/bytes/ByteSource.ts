// Byte access to media files (spec §9.2). Reads ranges of a File (or any Blob) through
// `slice().arrayBuffer()`, in 4 MB chunks kept in an LRU shared by every source of the worker
// (64 MB), so demuxers can read small ranges without hitting the disk each time. Workers receive the
// File itself (structured-cloneable) and read ranges here.

export const CHUNK_SIZE = 4 * 1024 * 1024;
export const CACHE_BYTES = 64 * 1024 * 1024;

/** LRU of chunk buffers by key, bounded by total bytes. */
export class ChunkCache {
  private readonly entries = new Map<string, ArrayBuffer>();
  private bytes = 0;

  constructor(readonly maxBytes = CACHE_BYTES) {}

  get size(): number {
    return this.bytes;
  }

  get(key: string): ArrayBuffer | undefined {
    const value = this.entries.get(key);
    if (value) {
      // Re-insert: Map order is the recency order.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: ArrayBuffer): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.byteLength;
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.bytes += value.byteLength;
    for (const [oldKey, old] of this.entries) {
      if (this.bytes <= this.maxBytes || oldKey === key) break;
      this.entries.delete(oldKey);
      this.bytes -= old.byteLength;
    }
  }

  /** Drops every chunk whose key starts with `prefix` (a source going away). */
  deletePrefix(prefix: string): void {
    for (const [key, value] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      this.entries.delete(key);
      this.bytes -= value.byteLength;
    }
  }
}

const sharedCache = new ChunkCache();
let nextSourceId = 1;

export class ByteSource {
  readonly size: number;
  private readonly prefix = `${nextSourceId++}:`;
  private readonly pending = new Map<number, Promise<ArrayBuffer>>();
  /** Chunks read from the blob so far (for tests and diagnostics). */
  chunkReads = 0;

  constructor(
    private readonly blob: Blob,
    private readonly cache: ChunkCache = sharedCache,
    private readonly chunkSize = CHUNK_SIZE,
  ) {
    this.size = blob.size;
  }

  /** Bytes [offset, offset + length), clamped to the end of the file. Always a fresh copy. */
  async read(offset: number, length: number): Promise<ArrayBuffer> {
    const start = Math.max(0, Math.min(offset, this.size));
    const end = Math.max(start, Math.min(offset + length, this.size));
    const out = new Uint8Array(end - start);
    const first = Math.floor(start / this.chunkSize);
    const last = Math.floor((end - 1) / this.chunkSize);
    const chunks = end > start ? await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => this.chunk(first + i))) : [];
    chunks.forEach((chunk, i) => {
      const chunkStart = (first + i) * this.chunkSize;
      const from = Math.max(start, chunkStart) - chunkStart;
      const to = Math.min(end, chunkStart + chunk.byteLength) - chunkStart;
      out.set(new Uint8Array(chunk, from, to - from), Math.max(start, chunkStart) - start);
    });
    return out.buffer;
  }

  /** Forgets this source's cached chunks. */
  release(): void {
    this.cache.deletePrefix(this.prefix);
  }

  private chunk(index: number): Promise<ArrayBuffer> {
    const key = this.prefix + index;
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.pending.get(index);
    if (inFlight) return inFlight;
    const start = index * this.chunkSize;
    this.chunkReads += 1;
    const read = this.blob
      .slice(start, Math.min(start + this.chunkSize, this.size))
      .arrayBuffer()
      .then((buffer) => {
        this.cache.set(key, buffer);
        return buffer;
      })
      .finally(() => this.pending.delete(index));
    this.pending.set(index, read);
    return read;
  }
}
