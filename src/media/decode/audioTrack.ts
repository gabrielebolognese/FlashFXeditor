// Audio of MP4/MOV files (spec §14), decoded in decode.worker with WebCodecs `AudioDecoder` from the
// track's sample table: only the audio samples are read, so a 4K video never has to fit in memory,
// and any range decodes on its own (the 60 s segments of long media).
// - Media time 0 is the time of the video's first frame in the movie (the video convention, Batch 08),
//   or movie time 0 without video. The audio track's edit list places it in the movie: its media time
//   skips the encoder priming (AAC: 1024-2112 samples, up to ~48 ms) and a leading empty edit delays
//   it. Without this, phone audio would play up to 1.5 frames late.
// - Each decode feeds PREROLL_SAMPLES packets before the range (AAC needs the previous frame for its
//   overlap-add) and places every output by its timestamp; what falls outside the range is dropped.
// - Output is planar float, at most 2 channels: more are mixed down with the Web Audio "speakers"
//   rules (quad, 5.1); mono stays mono.
import type { Mp4File, Mp4Video } from "../probe/mp4Probe.js";

/** Packets fed before the first one a range needs. */
export const PREROLL_SAMPLES = 2;
/** Packets waiting in the decoder before feeding pauses. */
const MAX_QUEUE = 32;

export interface AudioTrackPlan {
  codec: string;
  /** Declared rate and channel count (the decoder configuration). */
  sampleRate: number;
  channels: number;
  description: Uint8Array | undefined;
  timescale: number;
  /** Per packet, in decode order (audio: cts = dts). */
  offsets: Float64Array;
  sizes: Uint32Array;
  cts: Float64Array;
  durations: Float64Array;
  /** Track seconds at media time 0 (negative when the track starts after it). */
  trackStart: number;
  /** Media seconds where the audio ends. */
  duration: number;
}

/** Movie seconds of a video's first frame. */
export function videoOrigin(video: Pick<Mp4Video, "samples" | "timescale" | "edit">): number {
  let first = Infinity;
  for (const sample of video.samples) if (sample.cts < first) first = sample.cts;
  if (!Number.isFinite(first)) first = 0;
  return (first - video.edit.mediaTime) / video.timescale + video.edit.leadSeconds;
}

/** What the decoder needs to read the audio of a parsed file; null without an audio track. */
export function audioPlan(file: Mp4File): AudioTrackPlan | null {
  const audio = file.audio;
  if (!audio || audio.samples.length === 0 || audio.timescale <= 0) return null;
  const origin = file.video ? videoOrigin(file.video) : 0;
  const ts = audio.timescale;
  const n = audio.samples.length;
  const offsets = new Float64Array(n);
  const sizes = new Uint32Array(n);
  const cts = new Float64Array(n);
  const durations = new Float64Array(n);
  let trackEnd = 0;
  audio.samples.forEach((sample, i) => {
    offsets[i] = sample.offset;
    sizes[i] = sample.size;
    cts[i] = sample.cts;
    durations[i] = sample.duration;
    trackEnd = Math.max(trackEnd, (sample.cts + sample.duration) / ts);
  });
  const trackStart = origin - audio.edit.leadSeconds + audio.edit.mediaTime / ts;
  let duration = trackEnd - trackStart;
  if (audio.edit.segmentSeconds !== null) duration = Math.min(duration, audio.edit.leadSeconds + audio.edit.segmentSeconds - origin);
  return {
    codec: audio.codec,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    description: audio.description,
    timescale: ts,
    offsets,
    sizes,
    cts,
    durations,
    trackStart,
    duration: Math.max(0, duration),
  };
}

/** Packets [first, last] to feed for media seconds [from, to), preroll included; null when none. */
export function packetRange(plan: AudioTrackPlan, from: number, to: number): { first: number; last: number } | null {
  const ts = plan.timescale;
  const start = (plan.trackStart + from) * ts;
  const end = (plan.trackStart + to) * ts;
  const n = plan.cts.length;
  // First packet ending after the start (cts is increasing for audio).
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((plan.cts[mid] as number) + (plan.durations[mid] as number) <= start) lo = mid + 1;
    else hi = mid;
  }
  const first = lo;
  lo = first;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((plan.cts[mid] as number) < end) lo = mid + 1;
    else hi = mid;
  }
  const last = lo - 1;
  if (first >= n || last < first) return null;
  return { first: Math.max(0, first - PREROLL_SAMPLES), last };
}

// --- Decoding --------------------------------------------------------------------------------------

/** The parts of AudioData the decode uses (tests use fakes). */
export interface AudioDataLike {
  readonly timestamp: number;
  readonly numberOfFrames: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  copyTo(destination: Float32Array, options: { planeIndex: number; format: "f32-planar" }): void;
  close(): void;
}

export interface AudioDecoderLike {
  readonly decodeQueueSize: number;
  configure(config: AudioDecoderConfig): void;
  decode(chunk: EncodedAudioChunk): void;
  flush(): Promise<void>;
  close(): void;
}

export interface AudioDecodeDeps {
  createDecoder(init: { output(data: AudioDataLike): void; error(error: DOMException): void }): AudioDecoderLike;
  createChunk(init: EncodedAudioChunkInit): EncodedAudioChunk;
  read(offset: number, size: number): Promise<ArrayBuffer>;
}

export function browserAudioDecodeDeps(read: AudioDecodeDeps["read"]): AudioDecodeDeps {
  return {
    createDecoder: (init) => new AudioDecoder(init as AudioDecoderInit),
    createChunk: (init) => new EncodedAudioChunk(init),
    read,
  };
}

export function decoderConfig(plan: AudioTrackPlan): AudioDecoderConfig {
  return {
    codec: plan.codec,
    sampleRate: plan.sampleRate,
    numberOfChannels: plan.channels,
    ...(plan.description && { description: plan.description }),
  };
}

const SQRT1_2 = Math.SQRT1_2;

/** Planes mixed down to at most 2 (Web Audio "speakers" rules for quad and 5.1). */
export function downmix(planes: readonly Float32Array[]): Float32Array[] {
  if (planes.length <= 2) return [...planes];
  const length = planes[0]?.length ?? 0;
  const silent = new Float32Array(length);
  const plane = (index: number) => planes[index] ?? silent;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  if (planes.length === 4) {
    // Quad: L R SL SR.
    const [l, r, sl, sr] = [plane(0), plane(1), plane(2), plane(3)];
    for (let i = 0; i < length; i++) {
      left[i] = 0.5 * ((l[i] as number) + (sl[i] as number));
      right[i] = 0.5 * ((r[i] as number) + (sr[i] as number));
    }
    return [left, right];
  }
  // 5.1: L R C LFE SL SR (the LFE is dropped); 3 or 5 channels: L R C (SL SR missing).
  const surround = planes.length >= 6;
  const [l, r, c, sl, sr] = [plane(0), plane(1), plane(2), surround ? plane(4) : silent, surround ? plane(5) : silent];
  for (let i = 0; i < length; i++) {
    left[i] = (l[i] as number) + SQRT1_2 * ((c[i] as number) + (sl[i] as number));
    right[i] = (r[i] as number) + SQRT1_2 * ((c[i] as number) + (sr[i] as number));
  }
  return [left, right];
}

export interface DecodedRange {
  sampleRate: number;
  /** Planar, 1 or 2 channels, `to - from` frames each. */
  channels: Float32Array[];
}

/**
 * Decodes sample frames [from, to) of media time at `rate` (the decoder's output rate) into planar
 * float. Frames no packet covers (a leading empty edit) stay silent.
 */
export async function decodeAudioRange(plan: AudioTrackPlan, range: { from: number; to: number; rate: number }, deps: AudioDecodeDeps, signal?: AbortSignal): Promise<DecodedRange> {
  const { from, to, rate } = range;
  const length = Math.max(0, to - from);
  // Written by the decoder callbacks.
  const state: { planes: Float32Array[] | null; scratch: Float32Array; failure: unknown } = { planes: null, scratch: new Float32Array(0), failure: null };
  const output = (data: AudioDataLike) => {
    try {
      if (data.sampleRate !== rate) throw new Error(`The audio decoder output ${data.sampleRate} Hz, expected ${rate} Hz`);
      const count = data.numberOfChannels;
      const planes = (state.planes ??= Array.from({ length: count }, () => new Float32Array(length)));
      const at = Math.round((data.timestamp / 1e6 - plan.trackStart) * rate) - from;
      const begin = Math.max(0, -at);
      const end = Math.min(data.numberOfFrames, length - at);
      if (end > begin) {
        if (state.scratch.length < data.numberOfFrames) state.scratch = new Float32Array(data.numberOfFrames);
        for (let c = 0; c < Math.min(count, planes.length); c++) {
          data.copyTo(state.scratch, { planeIndex: c, format: "f32-planar" });
          (planes[c] as Float32Array).set(state.scratch.subarray(begin, end), at + begin);
        }
      }
    } catch (error) {
      state.failure ??= error;
    } finally {
      data.close();
    }
  };
  const decoder = deps.createDecoder({ output, error: (error) => (state.failure ??= error) });
  try {
    decoder.configure(decoderConfig(plan));
    const packets = packetRange(plan, from / rate, to / rate);
    if (packets) {
      for (let i = packets.first; i <= packets.last; i++) {
        signal?.throwIfAborted();
        if (state.failure) throw state.failure;
        const data = await deps.read(plan.offsets[i] as number, plan.sizes[i] as number);
        decoder.decode(
          deps.createChunk({
            type: "key",
            timestamp: Math.round(((plan.cts[i] as number) / plan.timescale) * 1e6),
            duration: Math.round(((plan.durations[i] as number) / plan.timescale) * 1e6),
            data,
          }),
        );
        while (decoder.decodeQueueSize > MAX_QUEUE) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await decoder.flush();
    }
    if (state.failure) throw state.failure;
  } finally {
    try {
      decoder.close();
    } catch {
      // Already closed after an error.
    }
  }
  signal?.throwIfAborted();
  return { sampleRate: rate, channels: downmix(state.planes ?? [new Float32Array(length)]) };
}

/** The decoder's real output rate and channel count (HE-AAC outputs twice its declared rate): decodes the first packets. */
export async function probeAudioOutput(plan: AudioTrackPlan, deps: AudioDecodeDeps): Promise<{ sampleRate: number; channels: number }> {
  const state: { found: { sampleRate: number; channels: number } | null; failure: unknown } = { found: null, failure: null };
  const decoder = deps.createDecoder({
    output: (data) => {
      state.found ??= { sampleRate: data.sampleRate, channels: data.numberOfChannels };
      data.close();
    },
    error: (error) => (state.failure ??= error),
  });
  try {
    decoder.configure(decoderConfig(plan));
    const count = Math.min(plan.cts.length, PREROLL_SAMPLES + 2);
    for (let i = 0; i < count; i++) {
      const data = await deps.read(plan.offsets[i] as number, plan.sizes[i] as number);
      decoder.decode(deps.createChunk({ type: "key", timestamp: Math.round(((plan.cts[i] as number) / plan.timescale) * 1e6), data }));
    }
    await decoder.flush();
  } finally {
    try {
      decoder.close();
    } catch {
      // Already closed after an error.
    }
  }
  if (state.failure) throw state.failure;
  return state.found ?? { sampleRate: plan.sampleRate, channels: plan.channels };
}
