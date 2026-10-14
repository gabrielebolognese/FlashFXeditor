// The videos open in decode.worker (spec §3.5, §9.2, P13): one VideoDecodeSession per media and lod,
// with its sample index (loaded from cache/index/ when it still matches the file, else built from
// the file's moov and handed back for caching) and its byte source. A decoder is closed after
// IDLE_MS without requests, and at most MAX_LIVE_DECODERS are open at once (the least recently used
// idle one is closed to make room). The index stays, so a later request only creates a decoder. A
// video closed while it opens is dropped when the open ends.
import type { Lod } from "../cache/TexturePool.js";
import { ByteSource } from "../bytes/ByteSource.js";
import { frameAt, sampleIndexFromMp4, type SampleIndex } from "../demux/sampleIndex.js";
import { readSampleIndex, writeSampleIndex } from "../demux/sampleIndexFile.js";
import { readMp4 } from "../probe/mp4Probe.js";
import { ProbeError } from "../probe/types.js";
import { abortError, type FramePriority, type OpenVideoResult, type VideoInfo, type WorkerDecodeStats } from "../workers/protocol.js";
import { UnsupportedCodecError, VideoDecodeSession, type DecodedFrame, type DecoderCallbacks, type DecoderLike } from "./VideoDecodeSession.js";

export { UnsupportedCodecError };

/** A decoder with no request for this long is closed (P13). */
export const IDLE_MS = 10_000;
/** Open decoders at most (hardware decoders are a limited resource). */
export const MAX_LIVE_DECODERS = 6;

export interface DecodeSessionsDeps<F extends DecodedFrame> {
  createDecoder(callbacks: DecoderCallbacks<F>): DecoderLike;
  isConfigSupported(config: VideoDecoderConfig): Promise<boolean>;
  idleMs?: number;
  maxLiveDecoders?: number;
}

interface Entry<F extends DecodedFrame> {
  session: VideoDecodeSession<F>;
  source: ByteSource;
  info: VideoInfo;
  lastUsed: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/** A frame for the main thread (`DeliveredFrame` in the worker, where F is VideoFrame). */
export interface Delivered<F> {
  frame: F;
  timeUs: number;
  approximate: boolean;
}

export interface OpenParams {
  mediaId: string;
  lod: Lod;
  file: File;
  cachedIndex: Blob | null;
}

/** A frame was requested for a video that was not opened (or was closed). */
export class NotOpenError extends Error {
  override name = "NotOpenError";
}

const keyOf = (mediaId: string, lod: Lod) => `${mediaId}|${lod}`;
/** Session counters summed into the worker stats (closed sessions included). */
const SUMMED = ["seeks", "decoded", "dropped", "ringHits", "stalls"] as const;

export class DecodeSessions<F extends DecodedFrame = VideoFrame> {
  private readonly entries = new Map<string, Entry<F>>();
  /** Opens under way; `close` marks those of its media. */
  private readonly opening = new Set<{ mediaId: string; lod: Lod; closed: boolean }>();
  private readonly closedStats = { seeks: 0, decoded: 0, dropped: 0, ringHits: 0, stalls: 0 };
  private indexParsed = 0;
  private indexFromCache = 0;
  private idleCloses = 0;
  private clock = 0;

  constructor(private readonly deps: DecodeSessionsDeps<F>) {}

  async open({ mediaId, lod, file, cachedIndex }: OpenParams, signal?: AbortSignal): Promise<OpenVideoResult> {
    const opening = { mediaId, lod, closed: false };
    this.opening.add(opening);
    try {
      return await this.load({ mediaId, lod, file, cachedIndex }, opening, signal);
    } finally {
      this.opening.delete(opening);
    }
  }

  /**
   * The frame shown at `timeUs`. A scrub far from its keyframe emits the keyframe first. A frame the
   * decoder could not produce comes back as the nearest one it did, marked approximate.
   */
  async requestFrame(params: { mediaId: string; lod: Lod; timeUs: number; priority: FramePriority }, signal: AbortSignal, emit: (value: Delivered<F>) => void): Promise<Delivered<F>> {
    const entry = this.entry(params.mediaId, params.lod);
    const { index } = entry.session;
    const position = frameAt(index, params.timeUs);
    const frame = await entry.session.frame(position, params.priority, signal, (approximate) => emit({ frame: approximate, timeUs: approximate.timestamp, approximate: true }));
    return { frame, timeUs: frame.timestamp, approximate: frame.timestamp !== index.displayTimesUs[position] };
  }

  /** Emits each frame shown in [fromUs, toUs]. */
  async prefetch(params: { mediaId: string; lod: Lod; fromUs: number; toUs: number }, signal: AbortSignal, emit: (value: Delivered<F>) => void): Promise<{ frames: number }> {
    const entry = this.entry(params.mediaId, params.lod);
    const { index } = entry.session;
    const frames = await entry.session.prefetch(frameAt(index, params.fromUs), frameAt(index, params.toUs), signal, (frame) => emit({ frame, timeUs: frame.timestamp, approximate: false }));
    return { frames };
  }

  /** Closes the sessions of a media (every lod, or one), including those still opening. */
  close(mediaId: string, lod?: Lod): void {
    for (const opening of this.opening) if (opening.mediaId === mediaId && (!lod || opening.lod === lod)) opening.closed = true;
    this.remove(mediaId, lod);
  }

  stats(): WorkerDecodeStats {
    const totals = { ...this.closedStats };
    let liveDecoders = 0;
    let openFrames = 0;
    for (const { session } of this.entries.values()) {
      for (const stat of SUMMED) totals[stat] += session.stats[stat];
      if (session.live) liveDecoders += 1;
      openFrames += session.openFrames;
    }
    return { sessions: this.entries.size, liveDecoders, openFrames, ...totals, indexParsed: this.indexParsed, indexFromCache: this.indexFromCache, idleCloses: this.idleCloses };
  }

  /** Reads or builds the index and registers the session, unless `opening` was closed meanwhile. */
  private async load({ mediaId, lod, file, cachedIndex }: OpenParams, opening: { closed: boolean }, signal?: AbortSignal): Promise<OpenVideoResult> {
    const stamp = { size: file.size, lastModified: file.lastModified };
    let index: SampleIndex | null = cachedIndex ? readSampleIndex(await cachedIndex.arrayBuffer(), stamp) : null;
    const fromCache = index !== null;
    let bytes: ArrayBuffer | null = null;
    const source = new ByteSource(file);
    try {
      if (!index) {
        const { video } = await readMp4(source, signal);
        if (!video || video.samples.length === 0) throw new ProbeError("The file has no video track");
        index = sampleIndexFromMp4(video);
        bytes = writeSampleIndex(index, stamp);
        this.indexParsed += 1;
      } else {
        this.indexFromCache += 1;
      }
      signal?.throwIfAborted();
      const session = this.createSession(index, source);
      const decodable = await this.deps.isConfigSupported(session.config).catch(() => false);
      signal?.throwIfAborted();
      // Closed meanwhile (the media left the project): registering it now would keep it for good.
      if (opening.closed) throw abortError();
      const info: VideoInfo = {
        frameTimesUs: index.displayTimesUs.slice(),
        codec: index.codec,
        codedWidth: index.codedWidth,
        codedHeight: index.codedHeight,
        rotation: index.rotation,
        decodable,
        indexFromCache: fromCache,
      };
      this.remove(mediaId, lod);
      this.entries.set(keyOf(mediaId, lod), { session, source, info, lastUsed: ++this.clock, idleTimer: null });
      return { info, index: bytes };
    } catch (error) {
      source.release();
      throw error;
    }
  }

  private remove(mediaId: string, lod?: Lod): void {
    for (const [key, entry] of [...this.entries]) {
      if (!key.startsWith(`${mediaId}|`) || (lod && key !== keyOf(mediaId, lod))) continue;
      this.entries.delete(key);
      if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
      entry.session.dispose();
      for (const stat of SUMMED) this.closedStats[stat] += entry.session.stats[stat];
      entry.source.release();
    }
  }

  private entry(mediaId: string, lod: Lod): Entry<F> {
    const entry = this.entries.get(keyOf(mediaId, lod));
    if (!entry) throw new NotOpenError(`Video ${mediaId} (${lod}) is not open`);
    if (!entry.info.decodable) throw new UnsupportedCodecError(`This browser cannot decode ${entry.info.codec}`);
    return entry;
  }

  private createSession(index: SampleIndex, source: ByteSource): VideoDecodeSession<F> {
    const session: VideoDecodeSession<F> = new VideoDecodeSession<F>(index, {
      createDecoder: (callbacks) => {
        this.makeRoom(session);
        return this.deps.createDecoder(callbacks);
      },
      readSample: (offset, size) => source.read(offset, size),
      onActive: () => {
        const entry = this.entryOf(session);
        if (!entry) return;
        entry.lastUsed = ++this.clock;
        if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
      },
      onIdle: () => {
        const entry = this.entryOf(session);
        if (!entry) return;
        entry.lastUsed = ++this.clock;
        if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
        entry.idleTimer = setTimeout(() => {
          entry.idleTimer = null;
          if (session.busy || !session.live) return;
          session.closeDecoder();
          this.idleCloses += 1;
        }, this.deps.idleMs ?? IDLE_MS);
      },
    });
    return session;
  }

  private entryOf(session: VideoDecodeSession<F>): Entry<F> | undefined {
    for (const entry of this.entries.values()) if (entry.session === session) return entry;
    return undefined;
  }

  /** Closes least recently used idle decoders until a new one fits under the limit. */
  private makeRoom(forSession: VideoDecodeSession<F>): void {
    const others = [...this.entries.values()].filter((entry) => entry.session.live && entry.session !== forSession);
    let live = others.length;
    const idle = others.filter((entry) => !entry.session.busy).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of idle) {
      if (live < (this.deps.maxLiveDecoders ?? MAX_LIVE_DECODERS)) break;
      entry.session.closeDecoder();
      live -= 1;
    }
  }
}
