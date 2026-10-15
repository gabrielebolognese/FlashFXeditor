// The one message protocol of the media workers (spec §3.5): typed methods, request ids, priorities
// and cancellation. The main thread talks to workers only through WorkerPool; workers serve requests
// through WorkerHost. Results carry transferables (ImageBitmap, VideoFrame, ArrayBuffer) only. A
// request may also post `progress` values before its result (frames of a prefetch, the approximate
// frame of a scrub).
import type { Lod } from "../cache/TexturePool.js";
import type { ThumbSheetParams, ThumbSheetResult } from "../decode/thumbSheet.js";
import type { SourceStamp } from "../demux/sampleIndexFile.js";
import type { ProbeResult } from "../probe/types.js";
import type { Rotation } from "../probe/rotation.js";

/** Scheduling classes, most urgent first. A worker starts queued requests in this order. */
export type Priority = "user" | "playback" | "prefetch" | "background";

export const PRIORITY_RANK: Record<Priority, number> = { user: 0, playback: 1, prefetch: 2, background: 3 };

// TODO(batch 24): "proxy", TODO(batch 43): "export".
export type WorkerKind = "decode" | "analysis";

export interface PosterResult {
  bitmap: ImageBitmap;
  /** The same image as WebP, for cache/thumbs/. */
  blob: Blob;
}

/** Containers a worker can probe. Audio-only formats and SVG are probed on the main thread. */
export type WorkerContainer = "mp4" | "image";

/** Frame request classes (spec §3.5, P8), most urgent first. */
export type FramePriority = "scrub" | "playback" | "idle";

export const FRAME_PRIORITY_RANK: Record<FramePriority, number> = { scrub: 0, playback: 1, idle: 2 };

/** A video opened for frame requests. */
export interface VideoInfo {
  /** Frame times in display order: integer us of the container cts (edit lists not applied). */
  frameTimesUs: Float64Array;
  codec: string;
  codedWidth: number;
  codedHeight: number;
  /** Clockwise quarter turns to show the frame upright (applied in the layer transform, §9.3). */
  rotation: Rotation;
  /** False when this browser has no decoder for the codec (`VideoDecoder.isConfigSupported`). */
  decodable: boolean;
  /** True when the sample index was loaded from cache/index/ instead of parsing the file. */
  indexFromCache: boolean;
}

export interface OpenVideoResult {
  info: VideoInfo;
  /** A newly built sample index for cache/index/; null when it was loaded from there. */
  index: ArrayBuffer | null;
}

/** A decoded frame posted to the main thread, which uploads and closes it at once (P5, P13). */
export interface DeliveredFrame {
  frame: VideoFrame;
  /** The frame's time (us), a value of `VideoInfo.frameTimesUs`. */
  timeUs: number;
  /**
   * Not the frame at the requested time: a stand-in while the exact frame decodes (P8), or, as a
   * request's result, the nearest frame the decoder could produce.
   */
  approximate: boolean;
}

/** Decode statistics of the worker (dev stats). */
export interface WorkerDecodeStats {
  /** Sessions with a sample index (one per media and lod opened). */
  sessions: number;
  /** Sessions holding a VideoDecoder. */
  liveDecoders: number;
  /** VideoFrames the worker holds (backward-step rings). */
  openFrames: number;
  seeks: number;
  decoded: number;
  /** Decoded frames never delivered (before a seek target, or cancelled). */
  dropped: number;
  ringHits: number;
  /** Waits that ended with one more chunk fed (decoders holding frames longer than the content needs). */
  stalls: number;
  indexParsed: number;
  indexFromCache: number;
  idleCloses: number;
}
export interface PrefetchParams {
  mediaId: string;
  lod: Lod;
  fromUs: number;
  toUs: number;
  /** `playback` windows go before `idle` warming in the media's decoder (default `idle`). */
  priority?: Exclude<FramePriority, "scrub">;
  /** Deliver every stride-th frame (shuttle speeds); the frames between are decoded but not sent. */
  stride?: number;
}

/** The audio track of an MP4/MOV opened for decoding (decode/audioTrack.ts). */
export interface AudioInfo {
  /** False when this browser has no AudioDecoder for the codec (decodeAudioData is the fallback). */
  supported: boolean;
  codec: string;
  /** The decoder's output rate and channel count after the mixdown (1 or 2). */
  sampleRate: number;
  channels: number;
  /** Sample frames from media time 0 to the end of the audio. */
  frames: number;
}

/** Planar float PCM, one buffer per channel (transferred). */
export interface PcmResult {
  sampleRate: number;
  channels: ArrayBuffer[];
}

export interface WorkerMethods {
  /** Metadata of a media file. */
  probe: { params: { file: Blob; container: WorkerContainer; type: string }; result: ProbeResult };
  /** An image's poster, at most `maxSize` px (videos show their thumbnail sheets). */
  poster: { params: { file: Blob; kind: "image"; maxSize: number }; result: PosterResult };
  /** Decodes an image file (cached posters) into a bitmap of at most `maxSize` px. */
  decodeImage: { params: { blob: Blob; maxSize: number }; result: ImageBitmap };
  /** Loads (cachedIndex) or builds the sample index of a video and checks that it can be decoded. */
  openVideo: { params: { mediaId: string; lod: Lod; file: File; cachedIndex: Blob | null }; result: OpenVideoResult };
  /** The frame shown at `timeUs`. Scrubs far from a keyframe post the keyframe first as progress. */
  requestFrame: { params: { mediaId: string; lod: Lod; timeUs: number; priority: FramePriority }; result: DeliveredFrame; progress: DeliveredFrame };
  /** Decodes the frames shown in [fromUs, toUs] and posts each one (every `stride`-th) as progress. */
  prefetch: { params: PrefetchParams; result: { frames: number }; progress: DeliveredFrame };
  /** Closes the sessions of a media (removed from the project, or the project closed). */
  closeVideo: { params: { mediaId: string }; result: null };
  decodeStats: { params: Record<string, never>; result: WorkerDecodeStats };
  /** Parses the audio track of an MP4/MOV and finds the decoder's output format. */
  openAudio: { params: { mediaId: string; file: File }; result: AudioInfo };
  /** Decodes sample frames [from, to) of media time (at `AudioInfo.sampleRate`). */
  decodeAudio: { params: { mediaId: string; file: File; from: number; to: number }; result: PcmResult };
  /** Forgets the parsed audio track of a media. */
  closeAudio: { params: { mediaId: string }; result: null };
  /** Peaks level 0 (Int8 min/max per 256 frames per channel) of planar float channels. */
  peaksLevel0: { params: { channels: ArrayBuffer[] }; result: ArrayBuffer };
  /** The cache/peaks/ file of a whole level 0: the pyramid, stamped with the source file. */
  peaksFile: { params: { level0: ArrayBuffer; sampleRate: number; frames: number; channels: number; stamp: SourceStamp }; result: ArrayBuffer };
  /** One thumbnail sprite sheet (spec §9.6), decoded by the analysis worker's own video sessions. */
  thumbSheet: { params: ThumbSheetParams; result: ThumbSheetResult };
  /** A cached sheet (cache/thumbs/) as a bitmap. */
  decodeSheet: { params: { blob: Blob }; result: ImageBitmap };
  /** Forgets the thumbnail sessions of a media. */
  closeThumbs: { params: { mediaId: string }; result: null };
}

export type Method = keyof WorkerMethods;
export type Params<M extends Method> = WorkerMethods[M]["params"];
export type Result<M extends Method> = WorkerMethods[M]["result"];
export type Progress<M extends Method> = WorkerMethods[M] extends { progress: infer P } ? P : never;

export const METHOD_WORKER: Record<Method, WorkerKind> = {
  probe: "decode",
  poster: "decode",
  decodeImage: "decode",
  openVideo: "decode",
  requestFrame: "decode",
  prefetch: "decode",
  closeVideo: "decode",
  decodeStats: "decode",
  openAudio: "decode",
  decodeAudio: "decode",
  closeAudio: "decode",
  peaksLevel0: "analysis",
  peaksFile: "analysis",
  thumbSheet: "analysis",
  decodeSheet: "analysis",
  closeThumbs: "analysis",
};

export type RequestMessage = { [M in Method]: { type: "request"; id: number; method: M; priority: Priority; params: Params<M> } }[Method];
export interface CancelMessage {
  type: "cancel";
  id: number;
}
export type ToWorker = RequestMessage | CancelMessage;

/** Errors cross the boundary as name + message (DOMExceptions do not survive every clone). */
export interface ErrorInfo {
  name: string;
  message: string;
}

export type FromWorker = { type: "result"; id: number; value: unknown } | { type: "progress"; id: number; value: unknown } | { type: "error"; id: number; error: ErrorInfo };

export function toErrorInfo(error: unknown): ErrorInfo {
  if (typeof error === "object" && error !== null) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    return { name: typeof name === "string" ? name : "Error", message: typeof message === "string" ? message : String(error) };
  }
  return { name: "Error", message: String(error) };
}

export function fromErrorInfo(info: ErrorInfo): Error {
  const error = new Error(info.message);
  error.name = info.name;
  return error;
}

export function abortError(): DOMException {
  return new DOMException("The request was cancelled", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function isTransferable(value: unknown): value is Transferable {
  return (
    value instanceof ArrayBuffer ||
    (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) ||
    (typeof VideoFrame !== "undefined" && value instanceof VideoFrame)
  );
}

/** Transferables in a result: the value itself, its direct properties, or the items of an array property (PCM channels). */
export function transferablesOf(value: unknown): Transferable[] {
  if (isTransferable(value)) return [value];
  if (typeof value !== "object" || value === null) return [];
  const found: Transferable[] = [];
  for (const item of Object.values(value) as unknown[]) {
    if (isTransferable(item)) found.push(item);
    else if (Array.isArray(item)) for (const entry of item as unknown[]) if (isTransferable(entry)) found.push(entry);
  }
  return found;
}

/** Frees the bitmaps and frames of a result nobody will receive (spec P13). */
export function closeTransferables(value: unknown): void {
  for (const item of transferablesOf(value)) {
    if ("close" in item && typeof item.close === "function") item.close();
  }
}
