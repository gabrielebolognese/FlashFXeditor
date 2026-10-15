// Audio-only files that are not MP4 (mp3, aac, wav, ogg): duration through decodeAudioData on the
// main thread (Batch 04 asks for exactly this; the browser decodes off-thread). An OfflineAudioContext
// needs no user gesture. The decoded audio goes to `onDecoded`, so the decoded-audio cache (playback,
// peaks) keeps it instead of decoding the file a second time.
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

export async function probeAudioFile(file: Blob, audioCodec: string, decode: DecodeAudio, onDecoded?: (decoded: DecodedAudioInfo) => void): Promise<ProbeResult> {
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
