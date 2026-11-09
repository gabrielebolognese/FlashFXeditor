// A WebM writer for the export (spec §21.25, Batch 81): VP9 or AV1 video, Opus audio, and the alpha
// stream of a transparent VP9 video. Written here instead of added as `webm-muxer`: that library
// writes the AlphaMode flag but no BlockAdditions, and Chrome's VideoEncoder cannot encode alpha
// ("Alpha encoding is not currently supported"), so the alpha is a second VP9 stream (the alpha plane
// as luma, what libvpx and ffmpeg write) carried next to each color block as a BlockAdditional with
// BlockAddID 1 inside a BlockGroup.
// - Layout: EBML header, Segment (size patched at the end), SeekHead (Info, Tracks, Cues; patched),
//   Info (millisecond timestamps, Duration patched), Tracks, Clusters, Cues (one per Cluster).
// - A Cluster starts at each video key frame and is held in memory until the next one (at most the
//   keyframe interval, 2 s), so its size is known when it is written: everything goes out in file
//   order, then the few patches (Segment size, Duration, SeekHead) as positioned writes.
// - Blocks of a Cluster keep the order they arrive in (the pipeline feeds the audio right behind
//   the video); times are rounded to milliseconds, relative to the Cluster's own.
// - Opus: CodecPrivate is an OpusHead; its pre-skip comes from the encoder's description once it is
//   known (else 312 samples, libopus' look-ahead at 48 kHz).
import type { MuxerLike } from "../pipeline.js";

/** One encoded video frame: the color chunk and, for a transparent export, the alpha stream's chunk bytes. */
export interface WebmVideoPacket {
  timestampUs: number;
  durationUs: number | null;
  key: boolean;
  data: Uint8Array;
  alpha: Uint8Array | null;
}

export interface WebmAudioPacket {
  timestampUs: number;
  durationUs: number | null;
  data: Uint8Array;
}

export interface WebmMuxOptions {
  video: { codec: "vp9" | "av1" | "vp8"; width: number; height: number; fps: number; alpha: boolean };
  audio: { sampleRate: number; channels: number } | null;
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

/** The shortest EBML size for `value`; with `width`, exactly that many bytes (for sizes patched later). */
export function sizeBytes(value: number, width?: number): Uint8Array {
  for (let length = width ?? 1; length <= 8; length++) {
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
  throw new RangeError("EBML size too large");
}

export const el = (id: number, ...payload: Uint8Array[]): Uint8Array => {
  const body = concat(payload);
  return concat([idBytes(id), sizeBytes(body.length), body]);
};

/** An unsigned integer element, in `width` bytes (the shortest when omitted). */
export function uintEl(id: number, value: number, width?: number): Uint8Array {
  const bytes: number[] = [];
  for (let v = value; v > 0 || bytes.length === 0 || (width !== undefined && bytes.length < width); v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return el(id, Uint8Array.from(bytes));
}

const floatEl = (id: number, value: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return el(id, bytes);
};
const strEl = (id: number, value: string): Uint8Array => el(id, new TextEncoder().encode(value));

const ID = {
  ebml: 0x1a45dfa3,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  seek: 0x4dbb,
  seekId: 0x53ab,
  seekPosition: 0x53ac,
  info: 0x1549a966,
  tracks: 0x1654ae6b,
  cluster: 0x1f43b675,
  cues: 0x1c53bb6b,
  timestampScale: 0x2ad7b1,
  duration: 0x4489,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  timestamp: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
  referenceBlock: 0xfb,
  blockAdditions: 0x75a1,
  blockMore: 0xa6,
  blockAddId: 0xee,
  blockAdditional: 0xa5,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackUid: 0x73c5,
  trackType: 0x83,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  defaultDuration: 0x23e383,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  alphaMode: 0x53c0,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  codecDelay: 0x56aa,
  seekPreRoll: 0x56bb,
  cuePoint: 0xbb,
  cueTime: 0xb3,
  cueTrackPositions: 0xb7,
  cueTrack: 0xf7,
  cueClusterPosition: 0xf1,
  void: 0xec,
} as const;

const VIDEO_TRACK = 1;
const AUDIO_TRACK = 2;
const CODEC_IDS = { vp9: "V_VP9", vp8: "V_VP8", av1: "V_AV1" } as const;
/** libopus' look-ahead at 48 kHz (samples), the pre-skip when the encoder gave none. */
const DEFAULT_PRE_SKIP = 312;
/** The millisecond a timestamp (us) lands on. */
const ms = (us: number) => Math.round(us / 1000);

/** The 19-byte OpusHead of `channels` channels (mapping family 0), with `preSkip` samples. */
export function opusHead(channels: number, sampleRate: number, preSkip: number): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode("OpusHead"));
  head[8] = 1;
  head[9] = channels;
  const view = new DataView(head.buffer);
  view.setUint16(10, preSkip, true);
  view.setUint32(12, sampleRate, true);
  view.setInt16(16, 0, true);
  head[18] = 0;
  return head;
}

/** The pre-skip an OpusHead description (the encoder's `decoderConfig.description`) holds, or null. */
export function opusPreSkip(description: ArrayBufferLike | ArrayBufferView | undefined): number | null {
  if (!description) return null;
  const bytes = !ArrayBuffer.isView(description) ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength);
  return bytes.length >= 12 && bytes[0] === 0x4f && bytes[1] === 0x70 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true) : null;
}

interface Block {
  track: number;
  timeMs: number;
  /** A SimpleBlock's key flag; a BlockGroup is a key frame when it has no reference. */
  key: boolean;
  data: Uint8Array;
  alpha: Uint8Array | null;
  durationMs: number | null;
}

export class WebmMuxer implements MuxerLike<WebmVideoPacket, WebmAudioPacket> {
  private position = 0;
  private started = false;
  private finalized = false;
  private cluster: Block[] = [];
  private clusterMs = 0;
  /** Segment payload start (the Cues' and SeekHead's positions count from here). */
  private segmentStart = 0;
  private segmentSizeAt = 0;
  private durationAt = 0;
  private seekAt = 0;
  private infoPos = 0;
  private tracksPos = 0;
  private cues: { timeMs: number; position: number }[] = [];
  private lastVideoMs = -Infinity;
  private endMs = 0;
  private preSkip: number | null = null;

  constructor(
    private readonly options: WebmMuxOptions,
    private readonly onData: (data: Uint8Array, position: number) => void,
  ) {}

  /** The pre-skip of the first audio chunk's description (call before the first Cluster is written). */
  setAudioDescription(description: ArrayBufferLike | ArrayBufferView | undefined): void {
    this.preSkip ??= opusPreSkip(description);
  }

  addVideo(packet: WebmVideoPacket): void {
    if (this.finalized) throw new Error("The WebM muxer is finished");
    const timeMs = ms(packet.timestampUs);
    // A new Cluster at each key frame (the one before it is complete).
    if (packet.key && this.cluster.length > 0) this.flushCluster();
    if (this.cluster.length === 0) this.clusterMs = timeMs;
    const durationMs = packet.durationUs === null ? null : ms(packet.durationUs);
    this.cluster.push({ track: VIDEO_TRACK, timeMs, key: packet.key, data: packet.data, alpha: this.options.video.alpha ? (packet.alpha ?? new Uint8Array(0)) : null, durationMs });
    this.lastVideoMs = timeMs;
    this.endMs = Math.max(this.endMs, ms(packet.timestampUs + (packet.durationUs ?? 0)));
  }

  addAudio(packet: WebmAudioPacket): void {
    if (this.finalized) throw new Error("The WebM muxer is finished");
    if (!this.options.audio) throw new Error("The WebM has no audio track");
    const timeMs = ms(packet.timestampUs);
    if (this.cluster.length === 0) this.clusterMs = timeMs;
    this.cluster.push({ track: AUDIO_TRACK, timeMs, key: true, data: packet.data, alpha: null, durationMs: null });
    this.endMs = Math.max(this.endMs, ms(packet.timestampUs + (packet.durationUs ?? 0)));
  }

  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;
    this.flushCluster();
    this.start();
    const cuesPos = this.position - this.segmentStart;
    const cues = el(ID.cues, ...this.cues.map((cue) => el(ID.cuePoint, uintEl(ID.cueTime, cue.timeMs), el(ID.cueTrackPositions, uintEl(ID.cueTrack, VIDEO_TRACK), uintEl(ID.cueClusterPosition, cue.position - this.segmentStart)))));
    this.write(cues);
    // Patches: Duration, the SeekHead's positions, the Segment's size.
    const duration = new Uint8Array(8);
    new DataView(duration.buffer).setFloat64(0, this.endMs);
    this.onData(duration, this.durationAt);
    this.onData(this.seekHead(cuesPos), this.seekAt);
    this.onData(sizeBytes(this.position - this.segmentStart, 8), this.segmentSizeAt);
  }

  private write(data: Uint8Array): void {
    this.onData(data, this.position);
    this.position += data.length;
  }

  /** SeekHead of fixed size: the three entries' positions as 8-byte integers. */
  private seekHead(cuesPos: number): Uint8Array {
    const entry = (id: number, position: number) => el(ID.seek, el(ID.seekId, idBytes(id)), uintEl(ID.seekPosition, position, 8));
    return el(ID.seekHead, entry(ID.info, this.infoPos), entry(ID.tracks, this.tracksPos), entry(ID.cues, cuesPos));
  }

  /** The EBML header, the Segment start, the SeekHead (patched at the end), Info and Tracks: written with the first Cluster. */
  private start(): void {
    if (this.started) return;
    this.started = true;
    const { video, audio } = this.options;
    this.write(el(ID.ebml, uintEl(0x4286, 1), uintEl(0x42f7, 1), uintEl(0x42f2, 4), uintEl(0x42f3, 8), strEl(0x4282, "webm"), uintEl(0x4287, 4), uintEl(0x4285, 2)));
    this.write(idBytes(ID.segment));
    this.segmentSizeAt = this.position;
    this.write(sizeBytes(0, 8));
    this.segmentStart = this.position;
    this.seekAt = this.position;
    // Placeholder of the SeekHead's size (a patch writes the real one over it).
    const placeholder = this.seekHead(0);
    this.write(placeholder);
    this.infoPos = this.position - this.segmentStart;
    const durationEl = floatEl(ID.duration, 0);
    const infoBody = [uintEl(ID.timestampScale, 1_000_000), durationEl, strEl(ID.muxingApp, "shorts-editor"), strEl(ID.writingApp, "shorts-editor")];
    const info = el(ID.info, ...infoBody);
    // Duration's 8 payload bytes are the last of its element, then the two strings follow.
    this.durationAt = this.position + info.length - (strEl(ID.muxingApp, "shorts-editor").length + strEl(ID.writingApp, "shorts-editor").length) - 8;
    this.write(info);
    this.tracksPos = this.position - this.segmentStart;
    const videoTrack = el(
      ID.trackEntry,
      uintEl(ID.trackNumber, VIDEO_TRACK),
      uintEl(ID.trackUid, VIDEO_TRACK),
      uintEl(ID.trackType, 1),
      strEl(ID.codecId, CODEC_IDS[video.codec]),
      uintEl(ID.defaultDuration, Math.round(1_000_000_000 / video.fps)),
      el(ID.video, uintEl(ID.pixelWidth, video.width), uintEl(ID.pixelHeight, video.height), ...(video.alpha ? [uintEl(ID.alphaMode, 1)] : [])),
    );
    const entries = [videoTrack];
    if (audio) {
      const preSkip = this.preSkip ?? DEFAULT_PRE_SKIP;
      entries.push(
        el(
          ID.trackEntry,
          uintEl(ID.trackNumber, AUDIO_TRACK),
          uintEl(ID.trackUid, AUDIO_TRACK),
          uintEl(ID.trackType, 2),
          strEl(ID.codecId, "A_OPUS"),
          el(ID.codecPrivate, opusHead(audio.channels, audio.sampleRate, preSkip)),
          // CodecDelay (ns) and SeekPreRoll (80 ms) as Opus in Matroska asks.
          uintEl(ID.codecDelay, Math.round((preSkip * 1_000_000_000) / 48000)),
          uintEl(ID.seekPreRoll, 80_000_000),
          el(ID.audio, floatEl(ID.samplingFrequency, audio.sampleRate), uintEl(ID.channels, audio.channels)),
        ),
      );
    }
    this.write(el(ID.tracks, ...entries));
  }

  private flushCluster(): void {
    if (this.cluster.length === 0) return;
    this.start();
    const blocks = this.cluster;
    this.cluster = [];
    const parts: Uint8Array[] = [uintEl(ID.timestamp, this.clusterMs)];
    for (const block of blocks) parts.push(this.blockEl(block));
    const cluster = el(ID.cluster, ...parts);
    if (blocks.some((b) => b.track === VIDEO_TRACK && b.key)) this.cues.push({ timeMs: this.clusterMs, position: this.position });
    this.write(cluster);
  }

  private blockEl(block: Block): Uint8Array {
    const header = new Uint8Array(4);
    header[0] = 0x80 | block.track;
    const rel = block.timeMs - this.clusterMs;
    if (rel < -32768 || rel > 32767) throw new RangeError("A WebM block is more than 32 s from its Cluster");
    new DataView(header.buffer).setInt16(1, rel);
    if (block.alpha === null) {
      header[3] = block.key ? 0x80 : 0;
      return el(ID.simpleBlock, header, block.data);
    }
    const group = [el(ID.block, header, block.data)];
    group.push(el(ID.blockAdditions, el(ID.blockMore, uintEl(ID.blockAddId, 1), el(ID.blockAdditional, block.alpha))));
    if (block.durationMs !== null) group.push(uintEl(ID.blockDuration, block.durationMs));
    // A delta frame names a block it refers to (any earlier one will do for a player).
    if (!block.key) group.push(el(ID.referenceBlock, Uint8Array.of(0xff)));
    return el(ID.blockGroup, ...group);
  }
}
