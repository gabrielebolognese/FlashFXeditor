// What a probe learns about a media file (spec §9.1). It becomes a MediaItem on import.
import type { Rational } from "../../core/document/types.js";
import type { Rotation } from "./rotation.js";

export type MediaKind = "video" | "audio" | "image";

export interface ProbeResult {
  kind: MediaKind;
  /** 0 for still images. */
  durationUs: number;
  /** Coded size, before `rotation`. */
  width?: number;
  height?: number;
  rotation?: Rotation;
  fps?: Rational;
  hasAudio: boolean;
  codec?: string;
  audioCodec?: string;
  /** sampleRate is 0 when the container does not say (decodeAudioData resamples). */
  audio?: { channels: number; sampleRate: number };
  /** Animated images: frame durations in us. Not persisted: the preview decodes the frames again (ImageService, Batch 34). */
  frameDurationsUs?: number[];
}

/** A file that cannot be imported: not a media file, damaged, or without usable tracks. */
export class ProbeError extends Error {
  override name = "ProbeError";
}
