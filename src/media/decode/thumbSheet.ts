// Thumbnail sprite sheets in analysis.worker (spec §9.6, §3.5): the worker has its own video
// sessions (DecodeSessions over VideoDecodeSession), apart from decode.worker's, and asks them for
// frames at `idle` priority, one sheet at a time. Each frame is drawn upright into its cell of an
// OffscreenCanvas and closed at once (P13); the sheet comes back as an ImageBitmap (transferred) and
// a WebP blob for cache/thumbs/. The main thread cancels a sheet when playback or a drag starts
// (the IdleQueue pauses), so these decodes yield to playback. One live decoder at most, closed after
// a short idle time: hardware decoders are shared with playback.
import type { Lod } from "../cache/TexturePool.js";
import { mediaTimePosition } from "../demux/sampleIndex.js";
import type { VideoInfo } from "../workers/protocol.js";
import { DecodeSessions, UnsupportedCodecError, type DecodeSessionsDeps } from "./DecodeSessions.js";
import { drawUpright, WEBP_QUALITY } from "./poster.js";

/** Live decoders of the thumbnail sessions. */
const MAX_LIVE_DECODERS = 1;
/** A thumbnail decoder with no request for this long is closed. */
const IDLE_MS = 2_000;

export interface ThumbSheetParams {
  mediaId: string;
  /** The file decoded: the source, or its proxy (Batch 24). */
  source: Lod;
  file: File;
  /** cache/index/<id>.bin when present (decode.worker writes it). */
  cachedIndex: Blob | null;
  /** Media times (us) of the sheet's thumbnails, in cell order. */
  timesUs: number[];
  /** One thumbnail, in px (upright). */
  width: number;
  height: number;
  columns: number;
}

export interface ThumbSheetResult {
  bitmap: ImageBitmap;
  blob: Blob;
}

const keyOf = (mediaId: string, source: Lod) => `${mediaId}|${source}`;

export class ThumbSheetMaker {
  private readonly videos: DecodeSessions<VideoFrame>;
  /** Videos open in `videos`, with the file they were opened from. */
  private readonly opened = new Map<string, { file: File; info: VideoInfo }>();

  constructor(deps: Pick<DecodeSessionsDeps<VideoFrame>, "createDecoder" | "isConfigSupported">) {
    this.videos = new DecodeSessions<VideoFrame>({ ...deps, maxLiveDecoders: MAX_LIVE_DECODERS, idleMs: IDLE_MS });
  }

  async sheet(params: ThumbSheetParams, signal: AbortSignal): Promise<ThumbSheetResult> {
    const { mediaId, source, timesUs, width, height, columns } = params;
    const info = await this.open(params, signal);
    const canvas = new OffscreenCanvas(Math.min(timesUs.length, columns) * width, Math.ceil(timesUs.length / columns) * height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context for the thumbnails");
    ctx.imageSmoothingQuality = "high";
    for (const [i, mediaTimeUs] of timesUs.entries()) {
      const timeUs = info.frameTimesUs[mediaTimePosition(info.frameTimesUs, mediaTimeUs)] as number;
      const { frame } = await this.videos.requestFrame({ mediaId, lod: source, timeUs, priority: "idle" }, signal, ({ frame: stand }) => stand.close());
      try {
        drawUpright(ctx, frame, (i % columns) * width, Math.floor(i / columns) * height, width, height, info.rotation);
      } finally {
        frame.close();
      }
    }
    signal.throwIfAborted();
    // The blob first: transferToImageBitmap clears the canvas.
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
    return { bitmap: canvas.transferToImageBitmap(), blob };
  }

  /** Forgets a media's sessions (it left the project, or the project closed). */
  close(mediaId: string): void {
    this.videos.close(mediaId);
    for (const key of [...this.opened.keys()]) if (key.startsWith(`${mediaId}|`)) this.opened.delete(key);
  }

  /** Opens the video once per file (a replaced file opens again). */
  private async open({ mediaId, source, file, cachedIndex }: ThumbSheetParams, signal: AbortSignal): Promise<VideoInfo> {
    const key = keyOf(mediaId, source);
    const known = this.opened.get(key);
    if (known && known.file.size === file.size && known.file.lastModified === file.lastModified) return known.info;
    this.opened.delete(key);
    const { info } = await this.videos.open({ mediaId, lod: source, file, cachedIndex }, signal);
    if (!info.decodable) throw new UnsupportedCodecError(`This browser cannot decode ${info.codec}`);
    this.opened.set(key, { file, info });
    return info;
  }
}
