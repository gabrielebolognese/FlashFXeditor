// The one message protocol of the media workers (spec §3.5): typed methods, request ids, priorities
// and cancellation. The main thread talks to workers only through WorkerPool; workers serve requests
// through WorkerHost. Results carry transferables (ImageBitmap, VideoFrame, ArrayBuffer) only. A
// request may also post `progress` values before its result (frames of a prefetch, the approximate
// frame of a scrub).
import type { Lod } from "../cache/TexturePool.js";
import type { ProbeResult } from "../probe/types.js";
import type { Rotation } from "../probe/rotation.js";

/** Scheduling classes, most urgent first. A worker starts queued requests in this order. */
export type Priority = "user" | "playback" | "prefetch" | "background";

export const PRIORITY_RANK: Record<Priority, number> = { user: 0, playback: 1, prefetch: 2, background: 3 };

// TODO(batch 10): "analysis" (peaks), TODO(batch 24): "proxy", TODO(batch 43): "export".
export type WorkerKind = "decode";

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
export interface WorkerMethods {
  /** Metadata of a media file. */
  probe: { params: { file: Blob; container: WorkerContainer; type: string }; result: ProbeResult };
  /** A poster frame: the first frame of a video, or the image itself, at most `maxSize` px. */
  poster: { params: { file: Blob; kind: "video" | "image"; maxSize: number }; result: PosterResult };
  /** Decodes an image file (cached posters) into a bitmap of at most `maxSize` px. */
  decodeImage: { params: { blob: Blob; maxSize: number }; result: ImageBitmap };
  /** Loads (cachedIndex) or builds the sample index of a video and checks that it can be decoded. */
  openVideo: { params: { mediaId: string; lod: Lod; file: File; cachedIndex: Blob | null }; result: OpenVideoResult };
  /** The frame shown at `timeUs`. Scrubs far from a keyframe post the keyframe first as progress. */
  requestFrame: { params: { mediaId: string; lod: Lod; timeUs: number; priority: FramePriority }; result: DeliveredFrame; progress: DeliveredFrame };
  /** Decodes the frames shown in [fromUs, toUs] and posts each one as progress. */
  prefetch: { params: { mediaId: string; lod: Lod; fromUs: number; toUs: number }; result: { frames: number }; progress: DeliveredFrame };
  /** Closes the sessions of a media (removed from the project, or the project closed). */
  closeVideo: { params: { mediaId: string }; result: null };
  decodeStats: { params: Record<string, never>; result: WorkerDecodeStats };
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

/** Transferables in a result: the value itself or its direct properties. */
export function transferablesOf(value: unknown): Transferable[] {
  if (isTransferable(value)) return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).filter(isTransferable);
}

/** Frees the bitmaps and frames of a result nobody will receive (spec P13). */
export function closeTransferables(value: unknown): void {
  for (const item of transferablesOf(value)) {
    if ("close" in item && typeof item.close === "function") item.close();
  }
}
