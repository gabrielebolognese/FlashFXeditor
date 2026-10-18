// Test-only WebM/Matroska writer (Batch 49): small files in the layouts the demuxer meets, so it can be
// tested without binary fixtures. Live recordings (MediaRecorder, screen recorders): unknown-size
// Segment and Clusters, no Cues, no Duration. Muxed files (ffmpeg, mkvmerge): known sizes, a SeekHead,
// Duration, Cues, BlockGroups and Void elements. Frame payloads are fake unless given. Not imported by
// app code.

export interface TestWebmTrack {
  number: number;
  type: "video" | "audio";
  codecId: string;
  codecPrivate?: Uint8Array;
  width?: number;
  height?: number;
  channels?: number;
  sampleRate?: number;
  /** ns. */
  defaultDuration?: number;
  /** Adds a ContentEncodings element (compressed or encrypted frames). */
  encoded?: boolean;
  enabled?: boolean;
}

export interface TestBlock {
  track: number;
  /** Absolute, in TimestampScale units (ms by default). */
  time: number;
  key?: boolean;
  data?: Uint8Array;
  /** Written as a BlockGroup: a ReferenceBlock unless `key`, and BlockDuration when given. */
  group?: { duration?: number };
  /** Xiph lacing flag (with a fake lace count). */
  laced?: boolean;
}

export interface TestWebmOptions {
  docType?: string;
  tracks: readonly TestWebmTrack[];
  /** In file order. */
  blocks: readonly TestBlock[];
  /** Unknown sizes for the Segment and the Clusters. */
  live?: boolean;
  timestampScale?: number;
  /** Blocks per Cluster (default 30). */
  clusterBlocks?: number;
  /** Info Duration, in TimestampScale units. */
  duration?: number;
  cues?: boolean;
  seekHead?: boolean;
  /** Void elements between the top-level elements and inside Clusters. */
  voids?: boolean;
  /** Bytes cut from the end (a recording cut short). */
  truncate?: number;
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

function idBytes(id: number): Uint8Array {
  const bytes: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return Uint8Array.from(bytes);
}

/** The shortest variable-length size for `value`. */
export function sizeBytes(value: number): Uint8Array {
  for (let length = 1; length <= 8; length++) {
    if (value < 2 ** (7 * length) - 1) {
      const bytes = new Uint8Array(length);
      let v = value;
      for (let i = length - 1; i >= 0; i--) {
        bytes[i] = v % 256;
        v = Math.floor(v / 256);
      }
      bytes[0] = (bytes[0] as number) | (0x80 >> (length - 1));
      return bytes;
    }
  }
  throw new RangeError("size too large");
}

const UNKNOWN = Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

export const el = (id: number, ...payload: Uint8Array[]): Uint8Array => {
  const body = concat(payload);
  return concat([idBytes(id), sizeBytes(body.length), body]);
};
const unknownEl = (id: number, ...payload: Uint8Array[]): Uint8Array => concat([idBytes(id), UNKNOWN, ...payload]);
export const uintEl = (id: number, value: number): Uint8Array => {
  const bytes: number[] = [];
  for (let v = value; v > 0 || bytes.length === 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return el(id, Uint8Array.from(bytes));
};
const floatEl = (id: number, value: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return el(id, bytes);
};
const strEl = (id: number, value: string): Uint8Array => el(id, new TextEncoder().encode(value));
const voidEl = (): Uint8Array => el(0xec, new Uint8Array(5));

/** The bytes of a VP9 key frame's uncompressed header start (frame marker to color config), then padding. */
export function vp9KeyFrame(profile: number, bitDepth = 8): Uint8Array {
  const bits: number[] = [1, 0, profile & 1, profile >> 1];
  if (profile === 3) bits.push(0);
  bits.push(0, 0, 1, 0); // show_existing_frame, frame_type KEY, show_frame, error_resilient_mode
  for (const byte of [0x49, 0x83, 0x42]) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  if (profile >= 2) bits.push(bitDepth === 12 ? 1 : 0);
  const out = new Uint8Array(16);
  bits.forEach((bit, i) => {
    out[i >> 3] = (out[i >> 3] as number) | (bit << (7 - (i & 7)));
  });
  return out;
}

/** The fake payload of block `i`: its index in the first bytes, so tests can tell where an offset points. */
export const fakeFrame = (i: number, size = 12): Uint8Array => {
  const data = new Uint8Array(size);
  new DataView(data.buffer).setUint32(0, i + 1);
  return data;
};

function trackEntry(track: TestWebmTrack): Uint8Array {
  const parts = [uintEl(0xd7, track.number), uintEl(0x73c5, track.number), uintEl(0x83, track.type === "video" ? 1 : 2), strEl(0x86, track.codecId)];
  if (track.enabled === false) parts.push(uintEl(0xb9, 0));
  if (track.codecPrivate) parts.push(el(0x63a2, track.codecPrivate));
  if (track.defaultDuration) parts.push(uintEl(0x23e383, track.defaultDuration));
  if (track.encoded) parts.push(el(0x6d80, el(0x6240, uintEl(0x5031, 0))));
  if (track.type === "video") parts.push(el(0xe0, uintEl(0xb0, track.width ?? 640), uintEl(0xba, track.height ?? 360)));
  else parts.push(el(0xe1, floatEl(0xb5, track.sampleRate ?? 48000), uintEl(0x9f, track.channels ?? 2)));
  return el(0xae, ...parts);
}

function blockBytes(block: TestBlock, clusterTime: number, index: number, simple: boolean): Uint8Array {
  const data = block.data ?? fakeFrame(index);
  const header = new Uint8Array(4);
  header[0] = 0x80 | block.track;
  new DataView(header.buffer).setInt16(1, block.time - clusterTime);
  header[3] = (simple && block.key ? 0x80 : 0) | (block.laced ? 0x02 : 0);
  return concat(block.laced ? [header, Uint8Array.of(0), data] : [header, data]);
}

/** A WebM file. */
export function buildWebm(options: TestWebmOptions): Uint8Array {
  const per = options.clusterBlocks ?? 30;
  const live = options.live ?? false;
  const header = el(0x1a45dfa3, uintEl(0x4286, 1), uintEl(0x42f7, 1), uintEl(0x42f2, 4), uintEl(0x42f3, 8), strEl(0x4282, options.docType ?? "webm"), uintEl(0x4287, 4), uintEl(0x4285, 2));
  const infoParts = [uintEl(0x2ad7b1, options.timestampScale ?? 1_000_000), strEl(0x4d80, "test"), strEl(0x5741, "test")];
  if (options.duration !== undefined) infoParts.push(floatEl(0x4489, options.duration));
  const top: Uint8Array[] = [];
  if (options.seekHead) top.push(el(0x114d9b74, el(0x4dbb, el(0x53ab, idBytes(0x1549a966)), uintEl(0x53ac, 0))));
  if (options.voids) top.push(voidEl());
  top.push(el(0x1549a966, ...infoParts), el(0x1654ae6b, ...options.tracks.map(trackEntry)));
  const clusters: Uint8Array[] = [];
  for (let first = 0; first < options.blocks.length; first += per) {
    const blocks = options.blocks.slice(first, first + per);
    const clusterTime = Math.min(...blocks.map((block) => block.time));
    const parts: Uint8Array[] = [uintEl(0xe7, clusterTime)];
    if (options.voids) parts.push(voidEl());
    blocks.forEach((block, i) => {
      if (block.group) {
        const group = [el(0xa1, blockBytes(block, clusterTime, first + i, false))];
        if (block.group.duration !== undefined) group.push(uintEl(0x9b, block.group.duration));
        if (!block.key) group.push(el(0xfb, Uint8Array.of(0xff)));
        parts.push(el(0xa0, ...group));
      } else {
        parts.push(el(0xa3, blockBytes(block, clusterTime, first + i, true)));
      }
    });
    clusters.push(live ? unknownEl(0x1f43b675, ...parts) : el(0x1f43b675, ...parts));
  }
  top.push(...clusters);
  if (options.cues) top.push(el(0x1c53bb6b, el(0xbb, uintEl(0xb3, 0), el(0xb7, uintEl(0xf7, 1), uintEl(0xf1, 0)))));
  if (options.voids) top.push(voidEl());
  const segment = live ? unknownEl(0x18538067, ...top) : el(0x18538067, ...top);
  const file = concat([header, segment]);
  return options.truncate ? file.slice(0, file.length - options.truncate) : file;
}

/** `count` video blocks at `deltas(i)` ms apart, a key frame every `gop`. */
export function videoBlocks(count: number, deltas: number | ((i: number) => number), gop = 30, track = 1): TestBlock[] {
  const delta = typeof deltas === "number" ? () => deltas : deltas;
  let time = 0;
  return Array.from({ length: count }, (_, i) => {
    const block = { track, time, key: i % gop === 0 };
    time += delta(i);
    return block;
  });
}

/** Video blocks with audio blocks (every `audioMs`) interleaved by time, as a muxer writes them. */
export function interleave(video: readonly TestBlock[], audioMs: number, audioTrack = 2): TestBlock[] {
  const end = video.length > 0 ? (video[video.length - 1] as TestBlock).time : 0;
  const audio: TestBlock[] = [];
  for (let time = 0; time <= end; time += audioMs) audio.push({ track: audioTrack, time, key: true });
  return [...video, ...audio].sort((a, b) => a.time - b.time || a.track - b.track);
}
