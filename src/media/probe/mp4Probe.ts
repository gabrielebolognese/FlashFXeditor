// MP4/MOV probe (spec §9.1), run in decode.worker. Feeds mp4box with ranged reads until the moov is
// parsed: files with the moov at the end are handled by jumping to the offset mp4box asks for, so the
// mdat is never read. Gives codec strings, the decoder description (avcC/hvcC/av1C/vpcC), coded
// size, rotation from the tkhd matrix, durations, the frame rate from sample deltas, and the audio
// codec, channels and rate. The sample table feeds the poster frame and the decode engine's sample
// index (demux/sampleIndex.ts, persisted in cache/index/). The audio track's sample table, AAC
// configuration and the edit lists feed the audio decoder (decode/audioTrack.ts).
import { createFile, DataStream, Endianness, MP4BoxBuffer, type Movie, type Sample, type Track } from "mp4box";
import type { Rational } from "../../core/document/types.js";
import { ticksToUs } from "../../core/document/time.js";
import type { ByteSource } from "../bytes/ByteSource.js";
import { estimateFps, FPS_SAMPLE_COUNT } from "./fps.js";
import { rotationFromMatrix, type Rotation } from "./rotation.js";
import { ProbeError, type ProbeResult } from "./types.js";

const READ_SIZE = 1024 * 1024;
/** A moov is never this fragmented; stops parsing garbage that keeps asking for more. */
const MAX_READS = 4096;

/** Where a track's edit list starts it in the movie (no edit list: media time 0 at movie time 0). */
export interface EditStart {
  /** Empty edits before the first media: the track starts this late in the movie (s). */
  leadSeconds: number;
  /** Media time of the first edit, in track ticks (AAC priming, B-frame composition offset). */
  mediaTime: number;
  /** Length of the first edit (s); null without an edit list or when the edit runs to the end. */
  segmentSeconds: number | null;
}

export interface Mp4Video {
  trackId: number;
  codec: string;
  codedWidth: number;
  codedHeight: number;
  rotation: Rotation;
  timescale: number;
  durationUs: number;
  fps: Rational | null;
  /** Decoder configuration record without its box header; undefined for codecs without one. */
  description: Uint8Array | undefined;
  /** Decode order. */
  samples: readonly Sample[];
  edit: EditStart;
}

export interface Mp4Audio {
  trackId: number;
  codec: string;
  channels: number;
  sampleRate: number;
  durationUs: number;
  timescale: number;
  /** AudioSpecificConfig (AAC) from the esds; undefined for codecs without one. */
  description: Uint8Array | undefined;
  /** Decode order. */
  samples: readonly Sample[];
  edit: EditStart;
}

export interface Mp4File {
  video: Mp4Video | null;
  audio: Mp4Audio | null;
}

interface EditEntry {
  segment_duration: number;
  media_time: number;
}

interface EsDescriptor {
  findDescriptor(tag: number): EsDescriptor | undefined;
  data?: Uint8Array;
}

interface AudioEntry {
  esds?: { esd?: EsDescriptor };
  wave?: { esds?: { esd?: EsDescriptor } };
}

const DECODER_CONFIG_TAG = 0x04;
const DECODER_SPECIFIC_TAG = 0x05;

/** The first edit of `entries` (empty edits are a leading delay). */
export function editStart(entries: readonly EditEntry[] | undefined, movieTimescale: number): EditStart {
  let lead = 0;
  for (const entry of entries ?? []) {
    if (entry.media_time === -1) {
      lead += entry.segment_duration;
      continue;
    }
    return { leadSeconds: lead / movieTimescale, mediaTime: entry.media_time, segmentSeconds: entry.segment_duration > 0 ? entry.segment_duration / movieTimescale : null };
  }
  return { leadSeconds: lead / movieTimescale, mediaTime: 0, segmentSeconds: null };
}

interface ConfigBox {
  write(stream: DataStream): void;
}

interface CodecEntry {
  avcC?: ConfigBox;
  hvcC?: ConfigBox;
  av1C?: ConfigBox;
  vpcC?: ConfigBox;
}

function trackDurationUs(track: Track): number {
  return ticksToUs(track.samples_duration > 0 ? track.samples_duration : track.duration, track.timescale);
}

/**
 * A file the parser gave up on (Batch 47: shown on its failed import): a plain reason for the user, the
 * parser's own words (box types read from garbage) on the console only.
 */
function unreadable(detail: string): ProbeError {
  console.info(`[probe] mp4box: ${detail}`);
  return new ProbeError("Not a readable MP4/MOV file: it is damaged or is not a video");
}

/** Parses the movie header. Throws ProbeError when the file is not a readable MP4/MOV. */
export async function readMp4(source: ByteSource, signal?: AbortSignal): Promise<Mp4File> {
  const file = createFile();
  let movie: Movie | null = null;
  let parseError: string | null = null;
  file.onReady = (info) => {
    movie = info;
  };
  file.onError = (module, message) => {
    parseError = `${module}: ${message}`;
  };

  let offset = 0;
  for (let reads = 0; !movie && offset < source.size && reads < MAX_READS; reads++) {
    signal?.throwIfAborted();
    const length = Math.min(READ_SIZE, source.size - offset);
    const buffer = MP4BoxBuffer.fromArrayBuffer(await source.read(offset, length), offset);
    let next: number;
    try {
      next = file.appendBuffer(buffer, offset + length >= source.size);
    } catch (error) {
      throw unreadable(error instanceof Error ? error.message : String(error));
    }
    if (parseError) throw unreadable(parseError);
    offset = next > offset ? next : offset + length;
  }
  if (!movie) file.flush();
  const info = movie as Movie | null;
  if (!info) throw new ProbeError("Not a readable MP4/MOV file: no movie header found");

  const videoTrack = info.videoTracks[0];
  const audioTrack = info.audioTracks[0];
  const edits = (trak: { edts?: { elst?: { entries: EditEntry[] } } }) => editStart(trak.edts?.elst?.entries, info.timescale);
  let video: Mp4Video | null = null;
  if (videoTrack) {
    const trak = file.getTrackById(videoTrack.id);
    const samples = trak.samples ?? [];
    const entry = trak.mdia.minf.stbl.stsd.entries[0] as unknown as CodecEntry | undefined;
    const config = entry?.avcC ?? entry?.hvcC ?? entry?.av1C ?? entry?.vpcC;
    let description: Uint8Array | undefined;
    if (config) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      config.write(stream);
      description = new Uint8Array(stream.buffer, 8).slice();
    }
    video = {
      trackId: videoTrack.id,
      codec: videoTrack.codec,
      codedWidth: videoTrack.video?.width ?? videoTrack.track_width,
      codedHeight: videoTrack.video?.height ?? videoTrack.track_height,
      rotation: rotationFromMatrix(videoTrack.matrix),
      timescale: videoTrack.timescale,
      durationUs: trackDurationUs(videoTrack),
      fps: estimateFps(
        samples.slice(0, FPS_SAMPLE_COUNT).map((s) => s.cts),
        videoTrack.timescale,
      ),
      description,
      samples,
      edit: edits(trak),
    };
  }
  let audio: Mp4Audio | null = null;
  if (audioTrack) {
    const trak = file.getTrackById(audioTrack.id);
    const entry = trak.mdia.minf.stbl.stsd.entries[0] as unknown as AudioEntry | undefined;
    const esd = entry?.esds?.esd ?? entry?.wave?.esds?.esd;
    const specific = esd?.findDescriptor(DECODER_CONFIG_TAG)?.findDescriptor(DECODER_SPECIFIC_TAG)?.data;
    audio = {
      trackId: audioTrack.id,
      codec: audioTrack.codec,
      channels: audioTrack.audio?.channel_count ?? 0,
      sampleRate: audioTrack.audio?.sample_rate ?? 0,
      durationUs: trackDurationUs(audioTrack),
      timescale: audioTrack.timescale,
      description: specific && specific.length > 0 ? specific.slice() : undefined,
      samples: trak.samples ?? [],
      edit: edits(trak),
    };
  }
  return { video, audio };
}

/** The probe result of a parsed MP4: video when it has a video track, else audio. */
export function mp4ProbeResult({ video, audio }: Mp4File): ProbeResult {
  const audioFields = audio ? { audioCodec: audio.codec, audio: { channels: audio.channels, sampleRate: audio.sampleRate } } : {};
  if (video) {
    if (video.samples.length === 0) throw new ProbeError("The video track has no samples");
    return {
      kind: "video",
      durationUs: video.durationUs,
      width: video.codedWidth,
      height: video.codedHeight,
      rotation: video.rotation,
      ...(video.fps && { fps: video.fps }),
      hasAudio: audio !== null,
      codec: video.codec,
      ...audioFields,
    };
  }
  if (audio) return { kind: "audio", durationUs: audio.durationUs, hasAudio: true, ...audioFields };
  throw new ProbeError("The file has no video or audio track");
}

export async function probeMp4(source: ByteSource, signal?: AbortSignal): Promise<ProbeResult> {
  try {
    return mp4ProbeResult(await readMp4(source, signal));
  } finally {
    source.release();
  }
}
