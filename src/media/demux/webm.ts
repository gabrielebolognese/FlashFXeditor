// WebM/Matroska demuxer (Batch 49, spec §9.1-9.2), run in the media workers. It walks the Segment's
// top-level elements: Info (the timestamp scale), Tracks (the first video and audio tracks) and every
// Cluster, reading block headers only: for the video track each frame's offset, size, time and key
// flag (the sample index, `sampleIndexFromWebm`), for the audio track its packets (`webmAudioPlan`).
// - Live recordings (MediaRecorder, screen recorders) have no Cues and no Duration, and their Segment
//   and Clusters have unknown sizes: a Cluster then ends at the next top-level element. Every Cluster
//   is read whatever the file has, as the Cues list key frames only.
// - Matroska block times are presentation times in file (= decode) order. VP8, VP9 and AV1 never
//   reorder; H.264 with B-frames does, and its decode times are the presentation times sorted.
// - A recording cut short (the last Cluster truncated) ends at its last complete block.
// - Video blocks are never laced in practice; a laced one is refused. Laced audio (Vorbis muxed by
//   mkvmerge) is left to decodeAudioData.
// - The index is built from the blocks, not from Cues or Duration, so it matches the MP4 path: media
//   time 0 is the first frame, the duration runs to the end of the last one.
// - Opus audio decodes in decode.worker like MP4 audio (ranges, placed on media time by the packet
//   times); other audio goes through decodeAudioData, whose output starts at the first audio block:
//   recorders start the audio after the first frame (44 ms in a Chrome screen recording), so
//   `webmAudioLeadUs` tells the main thread where that output belongs.
import type { Rational } from "../../core/document/types.js";
import type { AudioTrackPlan } from "../decode/audioTrack.js";
import { ticksToUs } from "../../core/document/time.js";
import { estimateFps, FPS_SAMPLE_COUNT } from "../probe/fps.js";
import { ProbeError, type ProbeResult } from "../probe/types.js";
import { children, EbmlError, readFloat, readInt, readString, readUint, readVint, UNKNOWN_SIZE, WindowReader, type RangeReader } from "./ebml.js";
import { createSampleIndex, type SampleIndex, type SampleTable } from "./sampleIndex.js";
import { audioCodec, videoCodec } from "./webmCodecs.js";

export const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  FlagEnabled: 0xb9,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  DefaultDuration: 0x23e383,
  ContentEncodings: 0x6d80,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  ReferenceBlock: 0xfb,
  Cues: 0x1c53bb6b,
  Tags: 0x1254c367,
  Chapters: 0x1043a770,
  Attachments: 0x1941a469,
  Void: 0xec,
} as const;

/** Elements that end an unknown-size Cluster (a Segment child or a new file). */
const TOP_LEVEL: ReadonlySet<number> = new Set([ID.SeekHead, ID.Info, ID.Tracks, ID.Cluster, ID.Cues, ID.Tags, ID.Chapters, ID.Attachments, ID.EBML, ID.Segment]);

/** Header, Info and Tracks are small; anything larger is garbage. */
const MAX_MASTER_BYTES = 16 * 1024 * 1024;
/** Bytes of a block header read: track number (up to 8), timestamp (2), flags (1). */
const BLOCK_HEADER_BYTES = 11;
/** Bytes of the first key frame kept for its codec header. */
const KEY_FRAME_BYTES = 16;
const DEFAULT_TIMESTAMP_SCALE = 1_000_000;

export interface WebmTrack {
  number: number;
  codecId: string;
  codecPrivate: Uint8Array | undefined;
  /** ns; 0 when not given. */
  defaultDuration: number;
}

export interface WebmVideoTrack extends WebmTrack {
  width: number;
  height: number;
}

export interface WebmAudioTrack extends WebmTrack {
  channels: number;
  /** Hz, rounded; 0 when not given. */
  sampleRate: number;
}

export interface WebmVideo {
  track: WebmVideoTrack;
  /** Per frame, in file order: payload offset and size, presentation time (ticks), key frame. */
  offsets: number[];
  sizes: number[];
  times: number[];
  keys: boolean[];
  /** BlockDuration of the last frame (ticks), when it has one. */
  lastDuration: number | null;
  /** The start of the first key frame (its codec header). */
  keyFrame: Uint8Array | null;
}

export interface WebmAudio {
  track: WebmAudioTrack;
  /** Per block, in file order: payload offset and size, time (ticks). */
  offsets: number[];
  sizes: number[];
  times: number[];
  /** Some block holds several frames (lacing). */
  laced: boolean;
  /** First block time and end of the last block (ticks). */
  start: number;
  end: number;
}

export interface WebmFile {
  docType: string;
  /** Block time ticks per second. */
  timescale: number;
  video: WebmVideo | null;
  audio: WebmAudio | null;
}

export const WEBM_UNREADABLE = "Not a readable WebM file: it is damaged or is not a video";

/** A plain reason for the user; the parser's own words go to the console (Batch 47's convention). */
function unreadable(detail: string): ProbeError {
  console.info(`[probe] webm: ${detail}`);
  return new ProbeError(WEBM_UNREADABLE);
}

/** Block times in ticks per second: 1e9 / TimestampScale, or microseconds when that is not whole. */
function timeBase(scale: number): { timescale: number; toTicks: (raw: number) => number } {
  const perSecond = 1e9 / scale;
  if (Number.isInteger(perSecond) && perSecond <= 0xffffffff) return { timescale: perSecond, toTicks: (raw) => raw };
  return { timescale: 1_000_000, toTicks: (raw) => Math.round((raw * scale) / 1000) };
}

function parseTrack(bytes: Uint8Array, at: number, size: number): { type: number; enabled: boolean; encoded: boolean; video: WebmVideoTrack; audio: WebmAudioTrack } {
  let type = 0;
  let enabled = true;
  let encoded = false;
  const base: WebmTrack = { number: 0, codecId: "", codecPrivate: undefined, defaultDuration: 0 };
  let width = 0;
  let height = 0;
  let channels = 1;
  let sampleRate = 0;
  for (const child of children(bytes, at, at + size)) {
    switch (child.id) {
      case ID.TrackNumber:
        base.number = readUint(bytes, child.at, child.size);
        break;
      case ID.TrackType:
        type = readUint(bytes, child.at, child.size);
        break;
      case ID.FlagEnabled:
        enabled = readUint(bytes, child.at, child.size) !== 0;
        break;
      case ID.CodecID:
        base.codecId = readString(bytes, child.at, child.size);
        break;
      case ID.CodecPrivate:
        base.codecPrivate = bytes.slice(child.at, child.at + child.size);
        break;
      case ID.DefaultDuration:
        base.defaultDuration = readUint(bytes, child.at, child.size);
        break;
      case ID.ContentEncodings:
        encoded = true;
        break;
      case ID.Video:
        for (const v of children(bytes, child.at, child.at + child.size)) {
          if (v.id === ID.PixelWidth) width = readUint(bytes, v.at, v.size);
          else if (v.id === ID.PixelHeight) height = readUint(bytes, v.at, v.size);
        }
        break;
      case ID.Audio:
        for (const a of children(bytes, child.at, child.at + child.size)) {
          if (a.id === ID.Channels) channels = readUint(bytes, a.at, a.size);
          else if (a.id === ID.SamplingFrequency) sampleRate = Math.round(readFloat(bytes, a.at, a.size));
        }
        break;
    }
  }
  return { type, enabled, encoded, video: { ...base, width, height }, audio: { ...base, channels, sampleRate } };
}

/** The demuxer's state while it walks the clusters. */
class Scan {
  video: WebmVideo | null = null;
  audio: WebmAudio | null = null;
  timestampScale = DEFAULT_TIMESTAMP_SCALE;
  docType = "";
  tracksSeen = false;
  private audioLast = -Infinity;
  private audioDelta = 0;
  private toTicks: (raw: number) => number = (raw) => raw;

  constructor(private readonly reader: WindowReader) {}

  setScale(scale: number): void {
    this.timestampScale = scale;
    this.toTicks = timeBase(scale).toTicks;
  }

  async masterBytes(offset: number, size: number): Promise<Uint8Array> {
    if (size === UNKNOWN_SIZE || size > MAX_MASTER_BYTES) throw unreadable(`header element of ${size} bytes`);
    const bytes = await this.reader.view(offset, size);
    if (bytes.length < size) throw unreadable("file ends in its header");
    return bytes.slice();
  }

  tracks(bytes: Uint8Array): void {
    this.tracksSeen = true;
    for (const child of children(bytes)) {
      if (child.id !== ID.TrackEntry) continue;
      const track = parseTrack(bytes, child.at, child.size);
      if (!track.enabled) continue;
      if (track.type === 1 && !this.video) {
        if (track.encoded) throw new ProbeError("The video track of this WebM file is compressed or encrypted");
        this.video = { track: track.video, offsets: [], sizes: [], times: [], keys: [], lastDuration: null, keyFrame: null };
      } else if (track.type === 2 && !this.audio) {
        this.audio = { track: track.audio, offsets: [], sizes: [], times: [], laced: false, start: Infinity, end: -Infinity };
      }
    }
  }

  /** Walks a Cluster; returns where the next top-level element starts, or null at the end of the file. */
  async cluster(offset: number, headerLength: number, size: number, end: number): Promise<number | null> {
    const stop = size === UNKNOWN_SIZE ? end : Math.min(end, offset + headerLength + size);
    let clusterTime = 0;
    let at = offset + headerLength;
    while (at < stop) {
      const header = await this.reader.header(at);
      if (!header) return null;
      if (size === UNKNOWN_SIZE && TOP_LEVEL.has(header.id)) return at;
      const data = at + header.headerLength;
      if (header.size === UNKNOWN_SIZE) throw unreadable(`unknown-size element ${header.id.toString(16)} in a cluster`);
      // A recording cut short: its last block is incomplete.
      if (data + header.size > this.reader.size) return null;
      if (header.id === ID.Timestamp) clusterTime = readUint(await this.reader.view(data, header.size), 0, header.size);
      else if (header.id === ID.SimpleBlock) await this.block(data, header.size, clusterTime, null, null);
      else if (header.id === ID.BlockGroup) await this.blockGroup(data, header.size, clusterTime);
      at = data + header.size;
    }
    return stop >= this.reader.size ? null : stop;
  }

  private async blockGroup(offset: number, size: number, clusterTime: number): Promise<void> {
    let block: { at: number; size: number } | null = null;
    let duration: number | null = null;
    let referenced = false;
    for (let at = offset; at < offset + size; ) {
      const header = await this.reader.header(at);
      if (!header || header.size === UNKNOWN_SIZE) throw unreadable("damaged block group");
      const data = at + header.headerLength;
      if (header.id === ID.Block) block = { at: data, size: header.size };
      else if (header.id === ID.BlockDuration) duration = readUint(await this.reader.view(data, header.size), 0, header.size);
      else if (header.id === ID.ReferenceBlock) referenced = true;
      at = data + header.size;
    }
    if (block) await this.block(block.at, block.size, clusterTime, !referenced, duration);
  }

  /** `groupKey`: a Block's key state (it references no other frame); null for a SimpleBlock, whose flags say. */
  private async block(offset: number, size: number, clusterTime: number, groupKey: boolean | null, duration: number | null): Promise<void> {
    const head = await this.reader.view(offset, Math.min(size, BLOCK_HEADER_BYTES));
    const track = readVint(head, 0);
    if (!track || track[0] === UNKNOWN_SIZE || head.length < track[1] + 3) throw unreadable("damaged block header");
    const [number, length] = track;
    const time = this.toTicks(clusterTime + readInt(head, length, 2));
    const flags = head[length + 2] as number;
    const headerBytes = length + 3;
    const { video, audio } = this;
    if (video && number === video.track.number) {
      if (flags & 0x06) throw new ProbeError("This WebM file stores several video frames per block (lacing), which is not supported");
      video.offsets.push(offset + headerBytes);
      video.sizes.push(size - headerBytes);
      video.times.push(time);
      const isKey = groupKey ?? (flags & 0x80) !== 0;
      video.keys.push(isKey);
      video.lastDuration = duration === null ? null : this.toTicks(duration);
      if (isKey && !video.keyFrame) video.keyFrame = (await this.reader.view(offset + headerBytes, Math.min(size - headerBytes, KEY_FRAME_BYTES))).slice();
    } else if (audio && number === audio.track.number) {
      audio.offsets.push(offset + headerBytes);
      audio.sizes.push(size - headerBytes);
      audio.times.push(time);
      if (flags & 0x06) audio.laced = true;
      if (time > this.audioLast && Number.isFinite(this.audioLast)) this.audioDelta = time - this.audioLast;
      this.audioLast = Math.max(this.audioLast, time);
      audio.start = Math.min(audio.start, time);
      const length = duration !== null ? this.toTicks(duration) : audio.track.defaultDuration > 0 ? this.toTicks(Math.round(audio.track.defaultDuration / this.timestampScale)) : this.audioDelta;
      audio.end = Math.max(audio.end, time + length);
    }
  }
}

/** Walks a WebM/Matroska file. Throws ProbeError when it is not a readable one. */
export async function readWebm(source: RangeReader, signal?: AbortSignal, windowBytes?: number): Promise<WebmFile> {
  const reader = new WindowReader(source, signal, windowBytes);
  const scan = new Scan(reader);
  try {
    const ebml = await reader.header(0);
    if (!ebml || ebml.id !== ID.EBML) throw unreadable("no EBML header");
    const head = await scan.masterBytes(ebml.headerLength, ebml.size);
    for (const child of children(head)) if (child.id === ID.DocType) scan.docType = readString(head, child.at, child.size);
    if (scan.docType !== "webm" && scan.docType !== "matroska") throw unreadable(`document type "${scan.docType}"`);
    // The Segment, after anything the header is followed by (Void).
    let at = ebml.headerLength + ebml.size;
    let segment = await reader.header(at);
    while (segment && segment.id !== ID.Segment && segment.size !== UNKNOWN_SIZE) {
      at += segment.headerLength + segment.size;
      segment = await reader.header(at);
    }
    if (!segment || segment.id !== ID.Segment) throw unreadable("no segment");
    const end = segment.size === UNKNOWN_SIZE ? reader.size : Math.min(reader.size, at + segment.headerLength + segment.size);
    let next: number | null = at + segment.headerLength;
    while (next !== null && next < end) {
      const offset: number = next;
      const header = await reader.header(offset);
      if (!header) break;
      const data = offset + header.headerLength;
      if (header.id === ID.Cluster) {
        if (!scan.tracksSeen) throw unreadable("a cluster before the tracks");
        next = await scan.cluster(offset, header.headerLength, header.size, end);
        continue;
      }
      if (header.id === ID.EBML || header.id === ID.Segment) break; // a second file appended: ignore it
      if (header.size === UNKNOWN_SIZE) throw unreadable(`unknown-size element ${header.id.toString(16)}`);
      if (header.id === ID.Info) {
        const bytes = await scan.masterBytes(data, header.size);
        for (const child of children(bytes)) if (child.id === ID.TimestampScale) scan.setScale(readUint(bytes, child.at, child.size) || DEFAULT_TIMESTAMP_SCALE);
      } else if (header.id === ID.Tracks) {
        scan.tracks(await scan.masterBytes(data, header.size));
      }
      next = data + header.size;
    }
  } catch (error) {
    if (error instanceof EbmlError) throw unreadable(error.message);
    throw error;
  }
  const { timescale } = timeBase(scan.timestampScale);
  const audio = scan.audio && scan.audio.times.length > 0 ? scan.audio : null;
  return { docType: scan.docType, timescale, video: scan.video, audio };
}

/** The video track as a sample table (spec §9.2 format), with its frame rate and duration. */
export function webmVideoTable(file: WebmFile): { table: SampleTable; fps: Rational | null; durationUs: number } {
  const video = file.video;
  if (!video || video.times.length === 0) throw new ProbeError("The video track has no frames");
  if (!(video.track.width > 0 && video.track.height > 0)) throw unreadable("no frame size");
  const { timescale } = file;
  const count = video.times.length;
  const fps = estimateFps(video.times.slice(0, FPS_SAMPLE_COUNT), timescale);
  const { codec, description } = videoCodec(video.track, video.keyFrame, fps && fps.num / fps.den);
  const cts = Float64Array.from(video.times);
  // Decode times: the presentation times in ascending order (the same unless H.264 reorders frames).
  const dts = Float64Array.from(video.times).sort();
  // Each frame lasts until the next one shown; the last one its BlockDuration, the track's default or the delta before it.
  const order = Uint32Array.from({ length: count }, (_, i) => i).sort((a, b) => (cts[a] as number) - (cts[b] as number) || a - b);
  const durations = new Uint32Array(count);
  let delta = 0;
  for (let p = 0; p + 1 < count; p++) {
    const d = (cts[order[p + 1] as number] as number) - (cts[order[p] as number] as number);
    durations[order[p] as number] = d;
    if (d > 0) delta = d;
  }
  const first = order[0] as number;
  const last = order[count - 1] as number;
  durations[last] = video.lastDuration ?? (video.track.defaultDuration > 0 ? Math.round((video.track.defaultDuration * timescale) / 1e9) : delta);
  const table: SampleTable = {
    codec,
    description: description ?? new Uint8Array(0),
    codedWidth: video.track.width,
    codedHeight: video.track.height,
    rotation: 0,
    timescale,
    offsets: Float64Array.from(video.offsets),
    sizes: Uint32Array.from(video.sizes),
    dts,
    cts,
    durations,
    sync: Uint8Array.from(video.keys, (key) => (key ? 1 : 0)),
  };
  const durationUs = ticksToUs((cts[last] as number) + (durations[last] as number) - (cts[first] as number), timescale);
  return { table, fps, durationUs };
}

/** Media time 0 in block ticks: the first frame shown, or the first audio block without video. */
function origin(file: WebmFile): number {
  const { video, audio } = file;
  if (!video || video.times.length === 0) return audio ? audio.start : 0;
  let first = Infinity;
  for (const time of video.times) first = Math.min(first, time);
  return first;
}

/**
 * Where the first sample of decodeAudioData's output plays (the first audio block), in us after media
 * time 0; negative when the audio starts before the first frame, 0 without audio.
 */
export function webmAudioLeadUs(file: WebmFile): number {
  return file.audio ? ticksToUs(file.audio.start, file.timescale) - ticksToUs(origin(file), file.timescale) : 0;
}

/**
 * The audio track for the AudioDecoder of decode.worker (decode/audioTrack.ts): Opus packets, the
 * track's seconds at media time 0, the OpusHead as the description. Null for audio left to
 * decodeAudioData: other codecs (Vorbis), laced blocks, no audio.
 */
export function webmAudioPlan(file: WebmFile): AudioTrackPlan | null {
  const { audio, timescale } = file;
  if (!audio || audio.laced || audio.track.codecId !== "A_OPUS" || timescale <= 0) return null;
  const n = audio.times.length;
  const cts = Float64Array.from(audio.times);
  const durations = new Float64Array(n);
  for (let i = 0; i + 1 < n; i++) durations[i] = Math.max(0, (cts[i + 1] as number) - (cts[i] as number));
  durations[n - 1] = Math.max(0, audio.end - (cts[n - 1] as number));
  const trackStart = origin(file) / timescale;
  return {
    codec: "opus",
    sampleRate: audio.track.sampleRate || 48_000,
    channels: audio.track.channels,
    description: audio.track.codecPrivate,
    timescale,
    offsets: Float64Array.from(audio.offsets),
    sizes: Uint32Array.from(audio.sizes),
    cts,
    durations,
    trackStart,
    duration: Math.max(0, audio.end / timescale - trackStart),
  };
}

/** The sample index of a WebM file's video track. */
export function sampleIndexFromWebm(file: WebmFile): SampleIndex {
  return createSampleIndex(webmVideoTable(file).table);
}

/** The probe result of a parsed WebM: video when it has a video track, else audio (spec §9.1). */
export function webmProbeResult(file: WebmFile): ProbeResult {
  const { audio } = file;
  const audioFields = audio ? { audioCodec: audioCodec(audio.track.codecId), audio: { channels: audio.track.channels, sampleRate: audio.track.sampleRate } } : {};
  if (file.video) {
    const { table, fps, durationUs } = webmVideoTable(file);
    return { kind: "video", durationUs, width: table.codedWidth, height: table.codedHeight, rotation: 0, ...(fps && { fps }), hasAudio: audio !== null, codec: table.codec, ...audioFields };
  }
  if (audio) return { kind: "audio", durationUs: ticksToUs(Math.max(0, audio.end - audio.start), file.timescale), hasAudio: true, ...audioFields };
  throw new ProbeError("The file has no video or audio track");
}

export async function probeWebm(source: RangeReader, signal?: AbortSignal): Promise<ProbeResult> {
  return webmProbeResult(await readWebm(source, signal));
}
