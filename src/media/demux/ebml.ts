// EBML, the binary format of Matroska and WebM (RFC 8794), for the WebM demuxer (Batch 49). An
// element is an ID, a payload size and the payload; IDs and sizes are variable-length integers whose
// first byte's leading zero bits give their length. A size of all ones is "unknown": live recordings
// (MediaRecorder, screen recorders) write the Segment and every Cluster that way, and such an element
// ends where an element that cannot be its child begins.
// `WindowReader` serves the demuxer's reads from large windows of the file, so walking every block
// header of a long recording costs a few big reads instead of one read per block.

/** The payload size of an element whose size is unknown. */
export const UNKNOWN_SIZE = -1;

/** Bytes an element header can take: a 4-byte ID and an 8-byte size. */
export const MAX_HEADER_BYTES = 12;

/** Default window: the chunk size of `ByteSource`. */
export const WINDOW_BYTES = 4 * 1024 * 1024;

export interface ElementHeader {
  /** The ID with its length marker, as written in the specifications (0x1A45DFA3). */
  id: number;
  /** Payload bytes, or UNKNOWN_SIZE. */
  size: number;
  /** Bytes of the ID and the size. */
  headerLength: number;
}

/** A file that is not EBML where it should be. */
export class EbmlError extends Error {
  override name = "EbmlError";
}

/** Length (1-8) of the variable-length integer starting with `first`; 0 for a zero byte (invalid). */
export function vintLength(first: number): number {
  return first === 0 ? 0 : Math.clz32(first & 0xff) - 23;
}

/** A variable-length integer without its marker: [value, length]; value UNKNOWN_SIZE when all ones. Null when `bytes` ends inside it. */
export function readVint(bytes: Uint8Array, at: number): [value: number, length: number] | null {
  if (at >= bytes.length) return null;
  const length = vintLength(bytes[at] as number);
  if (length === 0) throw new EbmlError(`Invalid variable-length integer at byte ${at}`);
  if (at + length > bytes.length) return null;
  let value = (bytes[at] as number) & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = bytes[at + i] as number;
    value = value * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  return [allOnes ? UNKNOWN_SIZE : value, length];
}

/** The element header at `at`; null when `bytes` ends inside it. Throws on bytes that cannot be one. */
export function readElementHeader(bytes: Uint8Array, at: number): ElementHeader | null {
  if (at >= bytes.length) return null;
  const idLength = vintLength(bytes[at] as number);
  if (idLength === 0 || idLength > 4) throw new EbmlError(`Invalid element ID at byte ${at}`);
  if (at + idLength > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLength; i++) id = id * 256 + (bytes[at + i] as number);
  const size = readVint(bytes, at + idLength);
  if (!size) return null;
  return { id, size: size[0], headerLength: idLength + size[1] };
}

/** Big-endian unsigned integer of `length` bytes (0-8; past 2^53 it loses precision). */
export function readUint(bytes: Uint8Array, at: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + (bytes[at + i] as number);
  return value;
}

/** Big-endian signed integer of `length` bytes (1-6). */
export function readInt(bytes: Uint8Array, at: number, length: number): number {
  const value = readUint(bytes, at, length);
  const bits = length * 8;
  return value >= 2 ** (bits - 1) ? value - 2 ** bits : value;
}

/** A 4- or 8-byte float (0 for an empty payload). */
export function readFloat(bytes: Uint8Array, at: number, length: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, length);
  if (length === 4) return view.getFloat32(0);
  if (length === 8) return view.getFloat64(0);
  if (length === 0) return 0;
  throw new EbmlError(`Invalid float of ${length} bytes`);
}

/** A string payload (ASCII or UTF-8), up to its first zero byte. */
export function readString(bytes: Uint8Array, at: number, length: number): string {
  const payload = bytes.subarray(at, at + length);
  const zero = payload.indexOf(0);
  return new TextDecoder().decode(zero >= 0 ? payload.subarray(0, zero) : payload);
}

export interface Child {
  id: number;
  /** Payload offset in the bytes. */
  at: number;
  size: number;
}

/** The children of a master element held in memory (`bytes[start, end)`). Unknown sizes and truncated children throw. */
export function* children(bytes: Uint8Array, start = 0, end = bytes.length): Generator<Child> {
  let at = start;
  while (at < end) {
    const header = readElementHeader(bytes.subarray(0, end), at);
    if (!header || header.size === UNKNOWN_SIZE || at + header.headerLength + header.size > end) throw new EbmlError(`Truncated element at byte ${at}`);
    yield { id: header.id, at: at + header.headerLength, size: header.size };
    at += header.headerLength + header.size;
  }
}

/** Ranged reads of a file (a `ByteSource`, or a Blob through `blobReader`). */
export interface RangeReader {
  readonly size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

/** Reads straight from a Blob, past the worker's shared chunk cache (a full scan would evict the chunks decoders are using). */
export function blobReader(blob: Blob): RangeReader {
  return { size: blob.size, read: (offset, length) => blob.slice(offset, offset + length).arrayBuffer() };
}

/**
 * One window of a file at a time. A read outside the window loads a new one starting at its offset
 * (at least `windowBytes`, clamped to the end of the file); everything inside is served from memory.
 */
export class WindowReader {
  private bytes = new Uint8Array(0);
  private start = 0;
  /** Windows loaded (tests and diagnostics). */
  loads = 0;

  constructor(
    private readonly source: RangeReader,
    private readonly signal?: AbortSignal,
    private readonly windowBytes = WINDOW_BYTES,
  ) {}

  get size(): number {
    return this.source.size;
  }

  /** The element header at `offset`; null when the file ends inside it. */
  async header(offset: number): Promise<ElementHeader | null> {
    const bytes = await this.view(offset, MAX_HEADER_BYTES);
    return readElementHeader(bytes, 0);
  }

  /** Bytes [offset, offset + length), clamped to the end of the file: a view into the window, valid until the next read. */
  async view(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.source.size);
    if (offset < this.start || end > this.start + this.bytes.length) await this.load(offset, end - offset);
    return this.bytes.subarray(offset - this.start, end - this.start);
  }

  private async load(offset: number, length: number): Promise<void> {
    this.signal?.throwIfAborted();
    const size = Math.max(0, Math.min(Math.max(length, this.windowBytes), this.source.size - offset));
    this.bytes = new Uint8Array(await this.source.read(offset, size));
    this.start = offset;
    this.loads += 1;
    this.signal?.throwIfAborted();
  }
}
