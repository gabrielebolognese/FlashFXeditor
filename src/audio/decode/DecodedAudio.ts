// Decoded audio per media (spec §14): AudioBuffers on the main thread, in the 512 MB LRU, by segment.
// - MP4/MOV/M4A audio decodes in decode.worker (WebCodecs, `openAudio`/`decodeAudio`): only the audio
//   samples are read, a range decodes on its own, so media over 10 minutes load in ~60 s segments on
//   demand. The PCM is copied into an AudioBuffer in slices (no long main-thread task) and handed to
//   the caller once, so the peaks job can transfer it on to analysis.worker without another copy.
// - Other audio files (mp3, aac, wav, ogg) and MP4 audio without a WebCodecs decoder use
//   `decodeAudioData` on the whole file, at 48 kHz (one segment). The import probe already decodes
//   these once; its buffer is reused (`put`).
// - At most 2 channels (spec §14): MP4 audio is mixed down in the worker, decodeAudioData output here.
import type { MediaId, Project } from "../../core/document/types.js";
import { downmix } from "../../media/decode/audioTrack.js";
import { classifyFile } from "../../media/mediaKinds.js";
import type { AudioInfo, Priority } from "../../media/workers/protocol.js";
import type { WorkerPool } from "../../media/workers/WorkerPool.js";
import { AudioBufferCache } from "./AudioBufferCache.js";
import { segmentLayout, segmentRange, type SegmentLayout } from "./segments.js";

/** Sample frames copied per slice when filling an AudioBuffer from worker PCM. */
const FILL_SLICE = 1 << 20;
/** Larger files are not read whole into memory for decodeAudioData. */
const MAX_WHOLE_FILE_BYTES = 1024 * 1024 * 1024;

export type AudioPriority = "playback" | "background";

export interface LoadedSegment {
  buffer: AudioBuffer;
  /**
   * The worker's PCM when this load decoded it (null for cache hits and decodeAudioData). The receiver
   * may transfer these buffers: the AudioBuffer holds its own copy.
   */
  pcm: Float32Array<ArrayBuffer>[] | null;
}

export interface DecodedAudioDeps {
  workers: Pick<WorkerPool, "request">;
  document: { getState(): Project };
  /** The media's source file; null when it is missing. */
  file(mediaId: MediaId): Promise<File | null>;
  /** decodeAudioData at 48 kHz (main thread, needs no user gesture). */
  decodeFile(bytes: ArrayBuffer): Promise<AudioBuffer>;
  createBuffer(options: AudioBufferOptions): AudioBuffer;
  /** Yields to the event loop between fill slices. */
  yieldToMain?: () => Promise<void>;
  cache?: AudioBufferCache;
}

interface MediaAudio {
  layout: SegmentLayout;
  /** True: decode.worker decodes ranges; false: decodeAudioData on the whole file. */
  worker: boolean;
}

const keyOf = (mediaId: MediaId, index: number) => `${mediaId}#${index}`;

export class DecodedAudio {
  readonly cache: AudioBufferCache;
  private readonly media = new Map<MediaId, MediaAudio>();
  private readonly opening = new Map<MediaId, Promise<MediaAudio>>();
  private readonly loading = new Map<string, Promise<LoadedSegment>>();
  /** Media whose audio failed to open or decode (no retry until `reset`/`release`). */
  private readonly failed = new Set<MediaId>();
  private generation = 0;

  constructor(private readonly deps: DecodedAudioDeps) {
    this.cache = deps.cache ?? new AudioBufferCache();
  }

  /** The segment layout once the media's audio is open; null before. */
  layout(mediaId: MediaId): SegmentLayout | null {
    return this.media.get(mediaId)?.layout ?? null;
  }

  /** A loaded segment (touches the LRU); null when it is not in memory. */
  segment(mediaId: MediaId, index: number): AudioBuffer | null {
    return this.cache.get(mediaId, index);
  }

  hasFailed(mediaId: MediaId): boolean {
    return this.failed.has(mediaId);
  }

  /** Opens the media's audio (once). */
  open(mediaId: MediaId): Promise<SegmentLayout> {
    const known = this.media.get(mediaId);
    if (known) return Promise.resolve(known.layout);
    let opening = this.opening.get(mediaId);
    if (!opening) {
      const generation = this.generation;
      opening = this.openMedia(mediaId).then((audio) => {
        if (generation === this.generation) this.media.set(mediaId, audio);
        return audio;
      });
      this.opening.set(mediaId, opening);
      const settle = () => {
        if (this.opening.get(mediaId) === opening) this.opening.delete(mediaId);
      };
      opening.then(settle, (error: unknown) => {
        settle();
        this.fail(mediaId, error);
      });
    }
    return opening.then((audio) => audio.layout);
  }

  /** Loads a segment (deduplicated while in flight). */
  load(mediaId: MediaId, index: number, priority: AudioPriority = "playback"): Promise<LoadedSegment> {
    const cached = this.cache.get(mediaId, index);
    if (cached) return Promise.resolve({ buffer: cached, pcm: null });
    const key = keyOf(mediaId, index);
    let loading = this.loading.get(key);
    if (!loading) {
      const generation = this.generation;
      loading = this.open(mediaId)
        .then(() => this.decode(mediaId, index, priority === "playback" ? "playback" : "background"))
        .then((loaded) => {
          if (generation === this.generation && this.media.has(mediaId)) this.cache.set(mediaId, index, loaded.buffer);
          return loaded;
        });
      this.loading.set(key, loading);
      const settle = () => {
        if (this.loading.get(key) === loading) this.loading.delete(key);
      };
      loading.then(settle, (error: unknown) => {
        settle();
        this.fail(mediaId, error);
      });
    }
    return loading;
  }

  /** Starts loading a segment that is not in memory; never throws (failures are remembered). */
  request(mediaId: MediaId, index: number, priority: AudioPriority = "playback"): void {
    if (this.failed.has(mediaId) || this.cache.has(mediaId, index) || this.loading.has(keyOf(mediaId, index))) return;
    this.load(mediaId, index, priority).catch(() => undefined);
  }

  /** Stores a buffer decoded elsewhere (the import probe's decodeAudioData) as the media's whole audio. */
  put(mediaId: MediaId, decoded: AudioBuffer): void {
    const buffer = this.atMostStereo(decoded);
    this.media.set(mediaId, { layout: segmentLayout(buffer.sampleRate, buffer.length, { whole: true }), worker: false });
    this.cache.set(mediaId, 0, buffer);
  }

  /** The media left the project. */
  release(mediaId: MediaId): void {
    this.cache.release(mediaId);
    this.media.delete(mediaId);
    this.failed.delete(mediaId);
    this.deps.workers.request("closeAudio", { mediaId }).catch(() => undefined);
  }

  /** The project closed: forget everything (loads in flight are dropped when they land). */
  reset(): void {
    this.generation += 1;
    this.cache.clear();
    this.media.clear();
    this.opening.clear();
    this.loading.clear();
    this.failed.clear();
  }

  private fail(mediaId: MediaId, error: unknown): void {
    if (this.failed.has(mediaId)) return;
    this.failed.add(mediaId);
    console.warn(`[audio] cannot decode the audio of ${mediaId}`, error);
  }

  private async openMedia(mediaId: MediaId): Promise<MediaAudio> {
    const item = this.deps.document.getState().media[mediaId];
    if (!item || !(item.kind === "audio" || (item.kind === "video" && item.hasAudio))) throw new Error("The media has no audio");
    const name = "relPath" in item.file ? item.file.relPath : item.file.pathHint;
    if (classifyFile(name, "")?.container === "mp4") {
      const file = await this.requireFile(mediaId);
      const info: AudioInfo = await this.deps.workers.request("openAudio", { mediaId, file }, { priority: "user" });
      if (info.supported) return { layout: segmentLayout(info.sampleRate, info.frames), worker: true };
      console.info(`[audio] no WebCodecs decoder for ${info.codec || "the audio"} of ${mediaId}; decoding the whole file`);
    }
    return { layout: segmentLayout(48_000, 0, { whole: true }), worker: false };
  }

  private async decode(mediaId: MediaId, index: number, priority: Priority): Promise<LoadedSegment> {
    const audio = this.media.get(mediaId);
    if (!audio) throw new Error("The media's audio is not open");
    const file = await this.requireFile(mediaId);
    if (!audio.worker) {
      if (file.size > MAX_WHOLE_FILE_BYTES) throw new Error("The file is too large to decode its audio whole");
      const buffer = this.atMostStereo(await this.deps.decodeFile(await file.arrayBuffer()));
      // The real length is known now.
      audio.layout = segmentLayout(buffer.sampleRate, buffer.length, { whole: true });
      return { buffer, pcm: null };
    }
    const { from, to } = segmentRange(audio.layout, index);
    const result = await this.deps.workers.request("decodeAudio", { mediaId, file, from, to }, { priority });
    const pcm = result.channels.map((channel) => new Float32Array(channel));
    const length = pcm[0]?.length ?? 0;
    const buffer = this.deps.createBuffer({ length: Math.max(1, length), numberOfChannels: Math.max(1, pcm.length), sampleRate: result.sampleRate });
    await this.fill(buffer, pcm);
    return { buffer, pcm };
  }

  /** Copies PCM into a buffer in slices, yielding between them. */
  private async fill(buffer: AudioBuffer, pcm: readonly Float32Array<ArrayBuffer>[]): Promise<void> {
    const length = pcm[0]?.length ?? 0;
    for (let at = 0; at < length; at += FILL_SLICE) {
      const end = Math.min(length, at + FILL_SLICE);
      pcm.forEach((channel, c) => buffer.copyToChannel(channel.subarray(at, end), c, at));
      if (end < length) await (this.deps.yieldToMain?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
  }

  /** decodeAudioData keeps the source channels: more than 2 are mixed down like the worker's. */
  private atMostStereo(buffer: AudioBuffer): AudioBuffer {
    if (buffer.numberOfChannels <= 2) return buffer;
    const planes = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const out = this.deps.createBuffer({ length: buffer.length, numberOfChannels: 2, sampleRate: buffer.sampleRate });
    downmix(planes).forEach((plane, c) => out.copyToChannel(plane as Float32Array<ArrayBuffer>, c));
    return out;
  }

  private async requireFile(mediaId: MediaId): Promise<File> {
    const file = await this.deps.file(mediaId);
    if (!file) throw new Error("The media file is missing");
    return file;
  }
}
