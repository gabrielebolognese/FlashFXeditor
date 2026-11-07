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
  /** A VP8/VP9 WebM with an alpha channel the decoder reads (Batch 64, spec §21.11). */
  alpha?: true;
  /** The codec of an alpha channel this app cannot decode (AV1, HEVC): the file imports opaque and the importer says why. */
  alphaIgnored?: string;
  /** Animated images: frame durations in us. Not persisted: the preview decodes the frames again (ImageService, Batch 34). */
  frameDurationsUs?: number[];
}

/** A file that cannot be imported: not a media file, damaged, or without usable tracks. */
export class ProbeError extends Error {
  override name = "ProbeError";
}
