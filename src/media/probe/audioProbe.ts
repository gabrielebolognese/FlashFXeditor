// Audio-only files that are not MP4 (mp3, aac, wav, ogg): duration through decodeAudioData on the
// main thread (Batch 04 asks for exactly this; the browser decodes off-thread). An OfflineAudioContext
// needs no user gesture. The decoded audio goes to `onDecoded`, so the decoded-audio cache (playback,
// peaks) keeps it instead of decoding the file a second time.
// Long files (Batch 47): these formats are decoded whole, about 0.4 MB per second of stereo; a file
// longer than MAX_WHOLE_AUDIO_SECONDS (its duration read from the browser's metadata first) is refused
// with that reason rather than risking the tab's memory. Decoding them in segments is a known issue.
import { ticksToUs } from "../../core/document/time.js";
import { ProbeError, type ProbeResult } from "./types.js";

export interface DecodedAudioInfo {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
}

export type DecodeAudio = (data: ArrayBuffer) => Promise<DecodedAudioInfo>;

export function browserDecodeAudio(): DecodeAudio {
  let context: OfflineAudioContext | null = null;
  return (data) => (context ??= new OfflineAudioContext(1, 1, 48_000)).decodeAudioData(data);
}

/** The longest audio decoded whole: 45 minutes of stereo float at 48 kHz is about 1 GB. */
export const MAX_WHOLE_AUDIO_SECONDS = 45 * 60;

/** A file's duration in seconds from its metadata (no decode), or null when it is not known. */
export type ReadDuration = (file: Blob) => Promise<number | null>;

/** The duration an <audio> element reads from the file's metadata (at most 5 s to find it). */
export function browserAudioDuration(): ReadDuration {
  return (file) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      let settled = false;
      const done = (seconds: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
        resolve(seconds);
      };
      const timer = setTimeout(() => done(null), 5000);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => done(null);
      audio.src = url;
    });
}

export async function probeAudioFile(file: Blob, audioCodec: string, decode: DecodeAudio, onDecoded?: (decoded: DecodedAudioInfo) => void, readDuration?: ReadDuration): Promise<ProbeResult> {
  const seconds = readDuration ? await readDuration(file) : null;
  if (seconds !== null && seconds > MAX_WHOLE_AUDIO_SECONDS) {
    throw new ProbeError(`Audio files over ${MAX_WHOLE_AUDIO_SECONDS / 60} minutes cannot be imported yet (this one is ${Math.round(seconds / 60)} minutes): cut it shorter, or use an MP4 or M4A file`);
  }
  let decoded: DecodedAudioInfo;
  try {
    decoded = await decode(await file.arrayBuffer());
  } catch (error) {
    throw new ProbeError(`The audio cannot be decoded (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!(decoded.length > 0)) throw new ProbeError("The audio is empty");
  onDecoded?.(decoded);
  return {
    kind: "audio",
    durationUs: ticksToUs(decoded.length, decoded.sampleRate),
    hasAudio: true,
    audioCodec,
    // decodeAudioData resamples to the context rate, so the source rate is unknown here.
    audio: { channels: decoded.numberOfChannels, sampleRate: 0 },
  };
}
