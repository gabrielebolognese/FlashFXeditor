// A store-only zip writer (spec §21.25, Batch 81: Export as zip, no dependency). Entries are written
// one after the other with their CRC and sizes known up front (the CRC is read in a first pass over the
// file, the bytes streamed in a second), so there are no data descriptors: Windows Explorer, macOS
// Archive Utility, `tar` and `unzip` all read it.
// - Method 0 (stored), UTF-8 names (general purpose flag bit 11), DOS time and date, version 2.0.
// - Classic zip limits: 4 GiB per file and in all, 65535 entries. Past them `ZipWriter` throws a
//   `ZipTooLargeError` (zip64 is not written), which the caller turns into a message.
// - The sink gets the bytes in file order (a positional or appending writer).

export class ZipTooLargeError extends Error {
  override name = "ZipTooLargeError";
}

const MAX_32 = 0xffff_ffff;
const MAX_ENTRIES = 0xffff;

let table: Uint32Array | null = null;

/** CRC-32 (IEEE) of `data`, continuing from `crc` (the value a previous call returned; 0 to start). */
export function crc32(data: Uint8Array, crc = 0): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = (table[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return ~c >>> 0;
}

/** The MS-DOS time and date words of `date` (local time, 2 s resolution, 1980..2107). */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** What `ZipWriter` takes for one file: a Blob (read twice) or bytes. */
export type ZipSource = Blob | Uint8Array;

/** Bytes (a typed array, from this realm or another) rather than a Blob. */
const isBytes = (source: ZipSource): source is Uint8Array => ArrayBuffer.isView(source);

interface Central {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const encoder = new TextEncoder();
/** Bytes read from a Blob at a time. */
export const ZIP_READ_BYTES = 4 << 20;

/** The blob's bytes in pieces of ZIP_READ_BYTES (slices: memory stays flat for any size). */
async function* pieces(blob: Blob, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < blob.size; at += ZIP_READ_BYTES) {
    signal?.throwIfAborted();
    yield new Uint8Array(await blob.slice(at, at + ZIP_READ_BYTES).arrayBuffer());
  }
  signal?.throwIfAborted();
}

export class ZipWriter {
  private offset = 0;
  private readonly entries: Central[] = [];
  private done = false;

  /** `write` receives the zip's bytes in order. */
  constructor(private readonly write: (data: Uint8Array) => void | Promise<void>) {}

  /** Bytes written so far. */
  get bytes(): number {
    return this.offset;
  }

  get count(): number {
    return this.entries.length;
  }

  private async put(data: Uint8Array): Promise<void> {
    await this.write(data);
    this.offset += data.length;
  }

  /** Adds a file at `path` (`/` separated, no leading slash); `modified` is its stamp (now by default). */
  async addFile(path: string, source: ZipSource, modified: Date = new Date(), signal?: AbortSignal): Promise<void> {
    if (this.done) throw new Error("The zip is finished");
    if (this.entries.length >= MAX_ENTRIES) throw new ZipTooLargeError("A zip holds at most 65535 files");
    const size = isBytes(source) ? source.length : source.size;
    if (size > MAX_32 || this.offset + size > MAX_32 - 1_000_000) throw new ZipTooLargeError("A zip holds at most 4 GB");
    const nameBytes = encoder.encode(path.replace(/^\/+/, ""));
    // Pass 1: the CRC.
    let crc = 0;
    if (isBytes(source)) crc = crc32(source);
    else for await (const piece of pieces(source, signal)) crc = crc32(piece, crc);
    const { time, date } = dosDateTime(modified);
    const entry: Central = { nameBytes, crc, size, offset: this.offset, time, date };
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint16(8, 0, true); // stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    await this.put(header);
    // Pass 2: the bytes.
    if (isBytes(source)) await this.put(source);
    else {
      let written = 0;
      for await (const piece of pieces(source, signal)) {
        written += piece.length;
        await this.put(piece);
      }
      if (written !== size) throw new Error(`${path} changed size while it was zipped`);
    }
    this.entries.push(entry);
  }

  /** Writes the central directory and the end record. */
  async finish(): Promise<void> {
    if (this.done) return;
    this.done = true;
    const start = this.offset;
    for (const entry of this.entries) {
      const record = new Uint8Array(46 + entry.nameBytes.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true); // made by: MS-DOS, 2.0
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint32(42, entry.offset, true);
      record.set(entry.nameBytes, 46);
      await this.put(record);
    }
    const size = this.offset - start;
    if (this.offset > MAX_32) throw new ZipTooLargeError("A zip holds at most 4 GB");
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, size, true);
    view.setUint32(16, start, true);
    await this.put(end);
  }
}
