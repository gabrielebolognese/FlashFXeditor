// Test-only MP4 writer: builds small non-fragmented files (ftyp, moov with full sample tables, mdat)
// so the probe can be tested without binary fixtures. Sample payloads are fake unless given. Also
// used by the dev-server checks to wrap real WebCodecs output. Not imported by app code.

export interface TestSample {
  /** In track timescale ticks. */
  duration: number;
  /** Composition offset (B-frames), ticks. */
  ctsOffset?: number;
  sync?: boolean;
  data?: Uint8Array;
}

export interface TestTrack {
  kind: "video" | "audio";
  /** Sample entry type. */
  codec: "avc1" | "hvc1" | "mp4a";
  timescale: number;
  samples: readonly TestSample[];
  width?: number;
  height?: number;
  /** tkhd matrix, 9 values in 16.16 / 2.30 fixed point. Default: identity. */
  matrix?: readonly number[];
  /** avcC / hvcC payload (no box header). Default: a minimal valid record. */
  description?: Uint8Array;
  channels?: number;
  sampleRate?: number;
  /** An edit list: an optional empty edit (movie ticks), then media from `mediaTime` (track ticks) for `duration` movie ticks (0 = to the end). */
  edit?: { empty?: number; mediaTime: number; duration?: number };
}

export interface TestMp4Options {
  tracks: readonly TestTrack[];
  movieTimescale?: number;
  /** mdat before moov (files that were not "fast-started"). */
  moovAtEnd?: boolean;
  brand?: string;
}

export const IDENTITY_MATRIX: readonly number[] = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
export const ROTATE_90_MATRIX: readonly number[] = [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000];

class Writer {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v >>> 8).u8(v);
  }
  u24(v: number) {
    return this.u8(v >>> 16).u8(v >>> 8).u8(v);
  }
  u32(v: number) {
    return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v);
  }
  fourcc(s: string) {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.u8(0);
    return this;
  }
  raw(data: ArrayLike<number>) {
    for (let i = 0; i < data.length; i++) this.u8(data[i] ?? 0);
    return this;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  const w = new Writer().u32(size).fourcc(type);
  for (const part of parts) w.raw(part);
  return w.done();
}

function fullBox(type: string, version: number, flags: number, body: Uint8Array): Uint8Array {
  return box(type, new Writer().u8(version).u24(flags).done(), body);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const matrixBytes = (m: readonly number[]) => {
  const w = new Writer();
  for (const v of m) w.u32(v >>> 0);
  return w.done();
};

/** Minimal avcC: High profile, level 3.1, one fake SPS and PPS. */
export const DEFAULT_AVCC = Uint8Array.from([1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x1f, 0x01, 0x00, 0x02, 0x68, 0xee]);

/** Minimal hvcC (23 bytes, no parameter set arrays): Main profile, level 5.1. */
export const DEFAULT_HVCC = Uint8Array.from([
  1, 0x01, 0x60, 0x00, 0x00, 0x00, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 153, 0xf0, 0x00, 0xfc, 0xfd, 0xf8, 0xf8, 0x00, 0x00, 0x0f, 0x00,
]);

function visualEntry(track: TestTrack): Uint8Array {
  const config = track.description ?? (track.codec === "hvc1" ? DEFAULT_HVCC : DEFAULT_AVCC);
  const body = new Writer()
    .zeros(6)
    .u16(1) // data_reference_index
    .zeros(16)
    .u16(track.width ?? 0)
    .u16(track.height ?? 0)
    .u32(0x00480000)
    .u32(0x00480000)
    .u32(0)
    .u16(1) // frame_count
    .zeros(32) // compressorname
    .u16(0x0018)
    .u16(0xffff)
    .done();
  return box(track.codec, body, box(track.codec === "hvc1" ? "hvcC" : "avcC", config));
}

/** AAC-LC AudioSpecificConfig for the sample rate and channel count. */
function audioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  const index = Math.max(0, rates.indexOf(sampleRate));
  const bits = (2 << 11) | (index << 7) | (channels << 3);
  return Uint8Array.from([bits >>> 8, bits & 0xff]);
}

function descriptor(tag: number, body: Uint8Array): Uint8Array {
  return concat([Uint8Array.from([tag, body.length]), body]);
}

function audioEntry(track: TestTrack): Uint8Array {
  const channels = track.channels ?? 2;
  const rate = track.sampleRate ?? track.timescale;
  const dsi = descriptor(0x05, audioSpecificConfig(rate, channels));
  const decoderConfig = descriptor(0x04, concat([new Writer().u8(0x40).u8(0x15).u24(0).u32(128000).u32(128000).done(), dsi]));
  const es = descriptor(0x03, concat([new Writer().u16(0).u8(0).done(), decoderConfig, descriptor(0x06, Uint8Array.from([2]))]));
  const body = new Writer().zeros(6).u16(1).zeros(8).u16(channels).u16(16).u16(0).u16(0).u32((rate << 16) >>> 0).done();
  return box("mp4a", body, fullBox("esds", 0, 0, es));
}

const sampleSize = (s: TestSample) => s.data?.length ?? 16;

function runLength<T>(values: readonly T[]): [T, number][] {
  const runs: [T, number][] = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && last[0] === value) last[1] += 1;
    else runs.push([value, 1]);
  }
  return runs;
}

function stbl(track: TestTrack, chunkOffset: number): Uint8Array {
  const entry = track.kind === "video" ? visualEntry(track) : audioEntry(track);
  const stsd = fullBox("stsd", 0, 0, concat([new Writer().u32(1).done(), entry]));
  const sttsRuns = runLength(track.samples.map((s) => s.duration));
  const stts = new Writer().u32(sttsRuns.length);
  for (const [delta, count] of sttsRuns) stts.u32(count).u32(delta);
  const parts = [stsd, fullBox("stts", 0, 0, stts.done())];

  if (track.samples.some((s) => s.ctsOffset)) {
    const runs = runLength(track.samples.map((s) => s.ctsOffset ?? 0));
    const ctts = new Writer().u32(runs.length);
    for (const [offset, count] of runs) ctts.u32(count).u32(offset);
    parts.push(fullBox("ctts", 0, 0, ctts.done()));
  }
  if (track.kind === "video" && track.samples.some((s) => !s.sync)) {
    const sync = track.samples.flatMap((s, i) => (s.sync ? [i + 1] : []));
    const stss = new Writer().u32(sync.length);
    for (const n of sync) stss.u32(n);
    parts.push(fullBox("stss", 0, 0, stss.done()));
  }
  parts.push(fullBox("stsc", 0, 0, new Writer().u32(1).u32(1).u32(track.samples.length).u32(1).done()));
  const stsz = new Writer().u32(0).u32(track.samples.length);
  for (const s of track.samples) stsz.u32(sampleSize(s));
  parts.push(fullBox("stsz", 0, 0, stsz.done()));
  parts.push(fullBox("stco", 0, 0, new Writer().u32(1).u32(chunkOffset).done()));
  return box("stbl", ...parts);
}

function trak(track: TestTrack, id: number, movieTimescale: number, chunkOffset: number): Uint8Array {
  const duration = track.samples.reduce((n, s) => n + s.duration, 0);
  const movieDuration = Math.round((duration * movieTimescale) / track.timescale);
  const video = track.kind === "video";
  const tkhd = fullBox(
    "tkhd",
    0,
    3,
    concat([
      new Writer().u32(0).u32(0).u32(id).u32(0).u32(movieDuration).zeros(8).u16(0).u16(0).u16(video ? 0 : 0x0100).u16(0).done(),
      matrixBytes(track.matrix ?? IDENTITY_MATRIX),
      new Writer().u32(((track.width ?? 0) << 16) >>> 0).u32(((track.height ?? 0) << 16) >>> 0).done(),
    ]),
  );
  const mdhd = fullBox("mdhd", 0, 0, new Writer().u32(0).u32(0).u32(track.timescale).u32(duration).u16(0x55c4).u16(0).done());
  const hdlr = fullBox("hdlr", 0, 0, new Writer().u32(0).fourcc(video ? "vide" : "soun").zeros(12).u8(0).done());
  const mediaHeader = video ? fullBox("vmhd", 0, 1, new Writer().zeros(8).done()) : fullBox("smhd", 0, 0, new Writer().zeros(4).done());
  const dinf = box("dinf", fullBox("dref", 0, 0, concat([new Writer().u32(1).done(), fullBox("url ", 0, 1, new Uint8Array(0))])));
  const minf = box("minf", mediaHeader, dinf, stbl(track, chunkOffset));
  const parts = [tkhd];
  if (track.edit) {
    const entries: [number, number][] = [];
    if (track.edit.empty) entries.push([track.edit.empty, -1]);
    entries.push([track.edit.duration ?? 0, track.edit.mediaTime]);
    const elst = new Writer().u32(entries.length);
    for (const [duration, mediaTime] of entries) elst.u32(duration).u32(mediaTime >>> 0).u16(1).u16(0);
    parts.push(box("edts", fullBox("elst", 0, 0, elst.done())));
  }
  return box("trak", ...parts, box("mdia", mdhd, hdlr, minf));
}

function moov(options: TestMp4Options, chunkOffsets: readonly number[]): Uint8Array {
  const timescale = options.movieTimescale ?? 1000;
  const duration = Math.max(0, ...options.tracks.map((t) => Math.round((t.samples.reduce((n, s) => n + s.duration, 0) * timescale) / t.timescale)));
  const mvhd = fullBox(
    "mvhd",
    0,
    0,
    concat([
      new Writer().u32(0).u32(0).u32(timescale).u32(duration).u32(0x00010000).u16(0x0100).zeros(10).done(),
      matrixBytes(IDENTITY_MATRIX),
      new Writer().zeros(24).u32(options.tracks.length + 1).done(),
    ]),
  );
  return box("moov", mvhd, ...options.tracks.map((t, i) => trak(t, i + 1, timescale, chunkOffsets[i] ?? 0)));
}

/** A complete MP4 file. */
export function buildMp4(options: TestMp4Options): Uint8Array {
  const brand = options.brand ?? "isom";
  const ftyp = box("ftyp", new Writer().fourcc(brand).u32(0x200).fourcc(brand).fourcc("mp41").done());
  const payloads = options.tracks.map((t) => concat(t.samples.map((s) => s.data ?? new Uint8Array(sampleSize(s)).fill(0xab))));
  const mdatBody = concat(payloads);
  const mdatSize = 8 + mdatBody.length;
  const moovSize = moov(options, options.tracks.map(() => 0)).length;
  const mdatStart = ftyp.length + (options.moovAtEnd ? 0 : moovSize) + 8;
  const offsets: number[] = [];
  let at = mdatStart;
  for (const payload of payloads) {
    offsets.push(at);
    at += payload.length;
  }
  const mdat = concat([new Writer().u32(mdatSize).fourcc("mdat").done(), mdatBody]);
  const moovBox = moov(options, offsets);
  return options.moovAtEnd ? concat([ftyp, mdat, moovBox]) : concat([ftyp, moovBox, mdat]);
}

/** `count` video samples of `duration` ticks with a keyframe every `gop` samples. */
export function videoSamples(count: number, duration: number | ((i: number) => number), gop = 30): TestSample[] {
  return Array.from({ length: count }, (_, i) => ({ duration: typeof duration === "number" ? duration : duration(i), sync: i % gop === 0 }));
}
