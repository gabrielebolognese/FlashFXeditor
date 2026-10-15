// Peaks jobs (spec §9.6, §14): every audio-bearing media gets a peaks file in cache/peaks/, built once
// and reused. A job reuses a file stamped with the current source; otherwise it decodes the media's
// audio segment by segment (the decoded buffers stay in the audio cache for playback), sends each
// segment's PCM to analysis.worker for its level 0, has the worker build the pyramid file, and writes
// it. The media's `analysis.peaks` then becomes "ready" with no undo step (`DocumentStore.amend`).
// Jobs run one at a time, each started from an idle callback, so none starts during playback. The
// peaks a job reads or builds stay in memory for the timeline's waveforms (spec §6.17; a pyramid is
// ~1.5 KB per second of stereo audio): `get`, with `onLoaded` when they arrive. Media the timeline
// shows go to the front of the queue (`prioritize`).
import { setMediaAnalysis } from "../core/commands/mediaCommands.js";
import type { MediaId, MediaItem, Project } from "../core/document/types.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import type { Command } from "../core/commands/command.js";
import type { DecodedAudio } from "../audio/decode/DecodedAudio.js";
import { joinLevels, readPeaksFile, type Peaks } from "./cache/peaks.js";
import type { SourceStamp } from "./demux/sampleIndexFile.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

/** Sample frames copied per slice from an AudioBuffer (decodeAudioData audio) for the worker. */
const COPY_SLICE = 1 << 20;

export const hasAudio = (item: MediaItem) => item.kind === "audio" || (item.kind === "video" && item.hasAudio);

export interface PeaksJobDeps {
  idle: Pick<IdleQueue, "enqueue">;
  document: { getState(): Project; amend(command: Command): void };
  audio: Pick<DecodedAudio, "open" | "load" | "layout">;
  workers: Pick<WorkerPool, "request">;
  /** The source file's stamp; null when the file is missing. */
  stamp(mediaId: MediaId): Promise<SourceStamp | null>;
  /** cache/peaks/<id>.bin, or null. */
  read(mediaId: MediaId): Promise<ArrayBuffer | null>;
  /** Writes cache/peaks/<id>.bin (nothing in a read-only project). */
  write(mediaId: MediaId, bytes: ArrayBuffer): Promise<void>;
  yieldToMain?: () => Promise<void>;
  /** Peaks of a media are in memory (`get`). */
  onLoaded?: (mediaId: MediaId) => void;
}

export class PeaksJobs {
  /** Media whose peaks file is known good in this session. */
  readonly done = new Set<MediaId>();
  /** The peaks of the media in `done`. */
  private readonly loaded = new Map<MediaId, Peaks>();
  private readonly queue: MediaId[] = [];
  /** The media of the job running. */
  private active: MediaId | null = null;
  private disposed = false;
  private cancelIdle: (() => void) | null = null;

  constructor(private readonly deps: PeaksJobDeps) {}

  /** Makes sure the media has its peaks file and a "ready" status. Idempotent. */
  request(mediaId: MediaId): void {
    if (this.done.has(mediaId)) {
      this.markReady(mediaId);
      return;
    }
    if (this.active === mediaId || this.queue.includes(mediaId)) return;
    this.queue.push(mediaId);
    this.pump();
  }

  /** Media waiting for their job (tests, diagnostics). */
  get waiting(): readonly MediaId[] {
    return this.queue;
  }

  /** The peaks of a media, once its job read or built them. */
  get(mediaId: MediaId): Peaks | null {
    return this.loaded.get(mediaId) ?? null;
  }

  /** Media whose peaks are in memory (dev stats). */
  get loadedCount(): number {
    return this.loaded.size;
  }

  /** Moves queued media (those the timeline shows) to the front of the queue, in the given order. */
  prioritize(mediaIds: readonly MediaId[]): void {
    const wanted = mediaIds.filter((id) => this.queue.includes(id));
    if (wanted.length === 0 || wanted.every((id, i) => this.queue[i] === id)) return;
    const rest = this.queue.filter((id) => !wanted.includes(id));
    this.queue.splice(0, this.queue.length, ...wanted, ...rest);
  }

  /** A media left the project: its peaks go, and a later return (undo) runs its job again. */
  forget(mediaId: MediaId): void {
    this.loaded.delete(mediaId);
    this.done.delete(mediaId);
    const at = this.queue.indexOf(mediaId);
    if (at !== -1) this.queue.splice(at, 1);
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.loaded.clear();
    this.cancelIdle?.();
    this.cancelIdle = null;
  }

  private pump(): void {
    if (this.active !== null || this.disposed || this.queue.length === 0 || this.cancelIdle) return;
    this.cancelIdle = this.deps.idle.enqueue(() => {
      this.cancelIdle = null;
      const mediaId = this.queue.shift();
      if (mediaId === undefined || this.disposed) return;
      this.active = mediaId;
      this.run(mediaId)
        .catch((error: unknown) => console.warn(`[peaks] no peaks for ${mediaId}`, error))
        .finally(() => {
          this.active = null;
          this.pump();
        });
    });
  }

  private exists(mediaId: MediaId): MediaItem | null {
    const item = this.deps.document.getState().media[mediaId];
    return item && hasAudio(item) && !this.disposed ? item : null;
  }

  private markReady(mediaId: MediaId): void {
    if (this.deps.document.getState().media[mediaId]?.analysis.peaks === "pending") this.deps.document.amend(setMediaAnalysis(mediaId, { peaks: "ready" }));
  }

  private async run(mediaId: MediaId): Promise<void> {
    if (!this.exists(mediaId)) return;
    const { deps } = this;
    const stamp = await deps.stamp(mediaId);
    if (!stamp) throw new Error("the media file is missing");
    const existing = await deps.read(mediaId);
    const cached = existing && readPeaksFile(existing, stamp);
    if (cached) {
      this.finish(mediaId, cached);
      return;
    }
    let count = (await deps.audio.open(mediaId)).count;
    const parts: Int8Array[] = [];
    let frames = 0;
    let sampleRate = 0;
    let channels = 1;
    for (let segment = 0; segment < count; segment++) {
      if (!this.exists(mediaId)) return;
      const { buffer, pcm } = await deps.audio.load(mediaId, segment, "background");
      const data = pcm ?? (await this.copyChannels(buffer));
      const level0 = await deps.workers.request("peaksLevel0", { channels: data.map((channel) => channel.buffer) }, { priority: "background", transfer: data.map((channel) => channel.buffer) });
      parts.push(new Int8Array(level0));
      frames += buffer.length;
      sampleRate = buffer.sampleRate;
      channels = buffer.numberOfChannels;
      // decodeAudioData audio learns its real layout on the first load.
      count = deps.audio.layout(mediaId)?.count ?? count;
    }
    const level0 = joinLevels(parts);
    const file = await deps.workers.request("peaksFile", { level0: level0.buffer as ArrayBuffer, sampleRate, frames, channels, stamp }, { priority: "background", transfer: [level0.buffer as ArrayBuffer] });
    if (!this.exists(mediaId)) return;
    await deps.write(mediaId, file);
    const peaks = readPeaksFile(file, stamp);
    if (peaks) this.finish(mediaId, peaks);
  }

  private finish(mediaId: MediaId, peaks: Peaks): void {
    if (!this.exists(mediaId)) return;
    this.done.add(mediaId);
    this.loaded.set(mediaId, peaks);
    this.markReady(mediaId);
    this.deps.onLoaded?.(mediaId);
  }

  /** A transferable copy of a buffer's channels, in slices (no long main-thread task). */
  private async copyChannels(buffer: AudioBuffer): Promise<Float32Array<ArrayBuffer>[]> {
    const out = Array.from({ length: buffer.numberOfChannels }, () => new Float32Array(buffer.length));
    for (let at = 0; at < buffer.length; at += COPY_SLICE) {
      const end = Math.min(buffer.length, at + COPY_SLICE);
      out.forEach((channel, c) => buffer.copyFromChannel(channel.subarray(at, end), c, at));
      if (end < buffer.length) await (this.deps.yieldToMain?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
    return out;
  }
}
