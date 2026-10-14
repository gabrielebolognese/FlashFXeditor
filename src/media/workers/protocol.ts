// The one message protocol of the media workers (spec §3.5): typed methods, request ids, priorities
// and cancellation. The main thread talks to workers only through WorkerPool; workers serve requests
// through WorkerHost. Results carry transferables (ImageBitmap, VideoFrame, ArrayBuffer) only.
import type { ProbeResult } from "../probe/types.js";

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

export interface WorkerMethods {
  /** Metadata of a media file. */
  probe: { params: { file: Blob; container: WorkerContainer; type: string }; result: ProbeResult };
  /** A poster frame: the first frame of a video, or the image itself, at most `maxSize` px. */
  poster: { params: { file: Blob; kind: "video" | "image"; maxSize: number }; result: PosterResult };
  /** Decodes an image file (cached posters) into a bitmap of at most `maxSize` px. */
  decodeImage: { params: { blob: Blob; maxSize: number }; result: ImageBitmap };
  // TODO(batch 06): requestFrame(mediaId, timeUs, priority, lod) and prefetch(mediaId, fromUs, toUs).
}

export type Method = keyof WorkerMethods;
export type Params<M extends Method> = WorkerMethods[M]["params"];
export type Result<M extends Method> = WorkerMethods[M]["result"];

export const METHOD_WORKER: Record<Method, WorkerKind> = { probe: "decode", poster: "decode", decodeImage: "decode" };

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

export type FromWorker = { type: "result"; id: number; value: unknown } | { type: "error"; id: number; error: ErrorInfo };

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
