// Thumbnail sprite sheets of the open project (spec §9.6, §6.17, §3.4, P5, P13). Follows the
// document's videos and owns, per video, its sheet layout and cache/thumbs/<id>/index.json. Work is
// one job at a time, each started from an IdleQueue slice (none during playback or drags), in this
// order:
// 1. the sheets the timeline's last content pass wanted (`want`) and the media cards' first frames;
// 2. the eager levels (LOD0, then LOD1) of each video, after which its `analysis.thumbs` becomes
//    "ready" with no undo step.
// A job loads a sheet the index lists (decoded to an ImageBitmap in analysis.worker), or has the
// worker make it (its own decode session) and writes the WebP and the index. LOD2 is only made for
// sheets the timeline wants. Decodes yield (the hardware decoder is shared): when the IdleQueue pauses
// (playback, drags) or the preview sends a frame to its decoder, the running sheet is cancelled and
// made again later, and a sheet starts only once the preview has had no decode for PREVIEW_QUIET_MS. Bitmaps live in an LRU of
// MAX_SHEETS / MAX_BYTES that closes what it evicts, never the sheets on screen or a card's first
// sheet. Eager sheets nobody shows are written and closed at once.
import { setMediaAnalysis } from "../core/commands/mediaCommands.js";
import type { Command } from "../core/commands/command.js";
import type { MediaId, MediaItem, Project } from "../core/document/types.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { errorMessage } from "../project/errorMessage.js";
import { thumbIndexPath, thumbSheetPath } from "../project/mediaFiles.js";
import type { Lod } from "./cache/TexturePool.js";
import {
  addSheet,
  cellOrigin,
  EAGER_LEVELS,
  emptyThumbIndex,
  firstMissingSheet,
  hasSheet,
  readThumbIndex,
  sameLayout,
  sheetTimes,
  thumbLayout,
  type ThumbIndex,
  type ThumbLayout,
  type ThumbLevel,
} from "./cache/thumbSheets.js";
import { isAbortError } from "./workers/protocol.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

/** Sheets kept in memory at most (spec §9.6: an LRU of 256 sheets)... */
export const MAX_SHEETS = 256;
/** ...and their pixels at most (256 sheets of 16:9 thumbnails would take ~740 MB). */
export const MAX_BYTES = 192 * 1024 * 1024;

/** A sheet decode starts only after the preview has decoded nothing for this long. */
export const PREVIEW_QUIET_MS = 250;
const YIELD_POLL_MS = 50;

/** Errors that make every sheet of a media impossible this session. */
const MEDIA_ERRORS = new Set(["UnsupportedCodecError", "ProbeError", "NotOpenError"]);

export interface SheetKey {
  mediaId: MediaId;
  level: ThumbLevel;
  sheet: number;
}

/** A media card's picture: a region of a bitmap (a sheet's cell, or a whole poster). */
export interface CardImage {
  bitmap: ImageBitmap;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type CardListener = (image: CardImage | null) => void;

export interface ThumbFiles {
  /** The file a media's thumbnails are decoded from, or null when it is missing. */
  source(mediaId: MediaId, lod: Lod): Promise<File | null>;
  /** The video's sample index in cache/index/ (decode.worker writes it), or null. */
  sampleIndex(mediaId: MediaId, lod: Lod): Promise<Blob | null>;
  /** A cache file, or null. */
  read(relPath: string): Promise<Blob | null>;
  /** Writes a cache file (nothing in a read-only project). */
  write(relPath: string, data: Blob): Promise<void>;
}

export interface ThumbnailDeps {
  idle: Pick<IdleQueue, "enqueue" | "onPauseChange">;
  document: { getState(): Project; amend(command: Command): void };
  workers: Pick<WorkerPool, "request">;
  files: ThumbFiles;
  /** The preview's frame decoding (FrameService), which sheet decodes yield to. */
  preview?: { readonly decodesInFlight: number; onDecodeRequest(listener: () => void): () => void };
  now?: () => number;
  /** A sheet arrived in memory (the timeline redraws, coalesced). */
  onArrival?: () => void;
  maxSheets?: number;
  maxBytes?: number;
}

export interface ThumbnailStats {
  /** Sheets made by the worker's decoder this session. */
  decoded: number;
  /** Sheets read from cache/thumbs/. */
  cached: number;
  failed: number;
  /** Sheets in memory and their size. */
  resident: number;
  bytes: number;
}

interface MediaEntry {
  layout: ThumbLayout;
  index: ThumbIndex | null;
  file: File | null;
  /** No sheet can be made this session (missing file, no decoder). */
  broken: boolean;
}

interface Resident {
  key: SheetKey;
  bitmap: ImageBitmap;
  bytes: number;
}

const keyOf = (mediaId: MediaId, level: ThumbLevel, sheet: number) => `${mediaId}/${level}/${sheet}`;
const keyString = (key: SheetKey) => keyOf(key.mediaId, key.level, key.sheet);
/** The source the thumbnails are made from. TODO(batch 24): the proxy when it exists. */
const SOURCE: Lod = "full";

export class ThumbnailStore {
  private readonly entries = new Map<MediaId, MediaEntry>();
  /** Insertion order = least recently used first. */
  private readonly sheets = new Map<string, Resident>();
  private bytes = 0;
  private visible: SheetKey[] = [];
  private visibleKeys = new Set<string>();
  /** Videos whose eager levels are not all known to be written. */
  private readonly eager: MediaId[] = [];
  private readonly failed = new Set<string>();
  private readonly cards = new Map<MediaId, Set<CardListener>>();
  private readonly counters = { decoded: 0, cached: 0, failed: 0 };
  private active: AbortController | null = null;
  private cancelIdle: (() => void) | null = null;
  private idleResolvers: (() => void)[] = [];
  private disposed = false;
  /** True while the worker decodes a sheet (what a preview decode cancels). */
  private making = false;
  private lastPreviewDecode = -Infinity;
  private readonly stops: (() => void)[] = [];

  constructor(private readonly deps: ThumbnailDeps) {
    this.stops.push(
      deps.idle.onPauseChange((paused) => {
        if (paused) this.active?.abort();
      }),
    );
    const { preview } = deps;
    if (preview) {
      this.stops.push(
        preview.onDecodeRequest(() => {
          this.lastPreviewDecode = this.now();
          if (this.making) this.active?.abort();
        }),
      );
    }
  }

  get stats(): ThumbnailStats {
    return { ...this.counters, resident: this.sheets.size, bytes: this.bytes };
  }

  /** The layout of a video's sheets, or null (not a video, or not in the project). */
  layout(mediaId: MediaId): ThumbLayout | null {
    return this.entries.get(mediaId)?.layout ?? null;
  }

  /** A sheet in memory, or null. */
  sheet(mediaId: MediaId, level: ThumbLevel, sheet: number): ImageBitmap | null {
    return this.sheets.get(keyOf(mediaId, level, sheet))?.bitmap ?? null;
  }

  /** The sheets the timeline shows (its last content pass): kept in memory and loaded first. */
  want(keys: readonly SheetKey[]): void {
    this.visible = [...keys];
    this.visibleKeys = new Set(keys.map(keyString));
    for (const key of this.visibleKeys) {
      const resident = this.sheets.get(key);
      if (!resident) continue;
      this.sheets.delete(key);
      this.sheets.set(key, resident);
    }
    this.pump();
  }

  /** Calls `listener` with a video's first frame now if it is in memory, and whenever it appears or goes. */
  observeCard(mediaId: MediaId, listener: CardListener): () => void {
    let set = this.cards.get(mediaId);
    if (!set) this.cards.set(mediaId, (set = new Set()));
    set.add(listener);
    const image = this.cardImage(mediaId);
    if (image) listener(image);
    this.pump();
    return () => {
      set.delete(listener);
      if (set.size === 0) this.cards.delete(mediaId);
    };
  }

  /** Follows the document's media (AnalysisScheduler calls it). */
  sync(media: Record<MediaId, MediaItem>): void {
    for (const id of [...this.entries.keys()]) if (!Object.hasOwn(media, id)) this.drop(id);
    for (const item of Object.values(media)) {
      const layout = thumbLayout(item);
      if (!layout) continue;
      const entry = this.entries.get(item.id);
      if (entry && sameLayout(entry.layout, layout)) continue;
      if (entry) this.drop(item.id);
      this.entries.set(item.id, { layout, index: null, file: null, broken: false });
      this.eager.push(item.id);
    }
    this.pump();
  }

  /** Resolves when no job runs or waits (tests, diagnostics). */
  whenIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  dispose(): void {
    this.disposed = true;
    this.active?.abort();
    this.cancelIdle?.();
    this.cancelIdle = null;
    for (const stop of this.stops.splice(0)) stop();
    for (const id of [...this.entries.keys()]) this.drop(id);
    this.cards.clear();
    this.resolveIdle();
  }

  private get busy(): boolean {
    return this.active !== null || this.cancelIdle !== null;
  }

  private pump(): void {
    if (this.disposed || this.busy) return;
    if (!this.nextWanted() && this.eager.length === 0) {
      this.resolveIdle();
      return;
    }
    this.cancelIdle = this.deps.idle.enqueue(() => {
      this.cancelIdle = null;
      const controller = new AbortController();
      this.active = controller;
      this.step(controller.signal)
        .catch((error: unknown) => {
          if (!isAbortError(error) && !controller.signal.aborted) console.warn("[thumbs] job failed", error);
        })
        .finally(() => {
          if (this.active === controller) this.active = null;
          this.pump();
        });
    });
  }

  private resolveIdle(): void {
    for (const resolve of this.idleResolvers.splice(0)) resolve();
  }

  /** A wanted sheet not in memory: the timeline's first, then the cards' first sheets. */
  private nextWanted(): SheetKey | null {
    for (const key of this.visible) if (this.needs(key)) return key;
    for (const mediaId of this.cards.keys()) {
      const key: SheetKey = { mediaId, level: 0, sheet: 0 };
      if (this.needs(key)) return key;
    }
    return null;
  }

  private needs(key: SheetKey): boolean {
    const entry = this.entries.get(key.mediaId);
    if (!entry || entry.broken) return false;
    const k = keyString(key);
    return !this.sheets.has(k) && !this.failed.has(k) && key.sheet >= 0 && key.sheet < entry.layout.levels[key.level].sheets;
  }

  private async step(signal: AbortSignal): Promise<void> {
    const wanted = this.nextWanted();
    if (wanted) {
      await this.produce(wanted, signal);
      return;
    }
    const mediaId = this.eager[0];
    if (mediaId === undefined) return;
    const entry = this.entries.get(mediaId);
    if (!entry || entry.broken) {
      this.eager.shift();
      return;
    }
    const index = await this.ensureIndex(mediaId, entry, signal);
    // A sheet that failed is not tried again this session.
    const missing = firstMissingSheet(index, EAGER_LEVELS, (level, sheet) => this.failed.has(keyOf(mediaId, level, sheet)));
    if (!missing) {
      if (this.eager[0] === mediaId) this.eager.shift();
      this.markReady(mediaId);
      return;
    }
    await this.produce({ mediaId, ...missing }, signal);
  }

  /** Loads or makes one sheet; keeps it in memory when it is wanted. */
  private async produce(key: SheetKey, signal: AbortSignal): Promise<void> {
    const entry = this.entries.get(key.mediaId);
    if (!entry) return;
    const k = keyString(key);
    try {
      const index = await this.ensureIndex(key.mediaId, entry, signal);
      const bitmap = (hasSheet(index, key.level, key.sheet) ? await this.load(key, signal) : null) ?? (await this.make(key, entry, index, signal));
      this.keep(key, bitmap);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error;
      this.counters.failed += 1;
      if (error instanceof Error && MEDIA_ERRORS.has(error.name)) entry.broken = true;
      else this.failed.add(k);
      console.warn(`[thumbs] no sheet ${k}: ${errorMessage(error)}`);
    }
  }

  private async ensureIndex(mediaId: MediaId, entry: MediaEntry, signal: AbortSignal): Promise<ThumbIndex> {
    if (entry.index && entry.file) return entry.index;
    const file = await this.deps.files.source(mediaId, SOURCE);
    signal.throwIfAborted();
    if (!file) {
      entry.broken = true;
      throw new Error("the media file is missing");
    }
    const stamp = { size: file.size, lastModified: file.lastModified };
    const blob = await this.deps.files.read(thumbIndexPath(mediaId)).catch(() => null);
    const text = blob ? await blob.text().catch(() => null) : null;
    signal.throwIfAborted();
    entry.file = file;
    entry.index = (text && readThumbIndex(text, entry.layout, SOURCE, stamp)) || emptyThumbIndex(entry.layout, SOURCE, stamp);
    return entry.index;
  }

  /** A sheet the index lists, from cache/thumbs/; null when its file is gone or damaged. */
  private async load(key: SheetKey, signal: AbortSignal): Promise<ImageBitmap | null> {
    const blob = await this.deps.files.read(thumbSheetPath(key.mediaId, key.level, key.sheet)).catch(() => null);
    signal.throwIfAborted();
    if (!blob || blob.size === 0) return null;
    try {
      const bitmap = await this.deps.workers.request("decodeSheet", { blob }, { priority: "background", signal });
      this.counters.cached += 1;
      return bitmap;
    } catch (error) {
      if (isAbortError(error)) throw error;
      return null;
    }
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }

  /** Waits until the preview has decoded nothing for PREVIEW_QUIET_MS. */
  private async yieldToPreview(signal: AbortSignal): Promise<void> {
    const { preview } = this.deps;
    while (preview && (preview.decodesInFlight > 0 || this.now() - this.lastPreviewDecode < PREVIEW_QUIET_MS)) {
      await new Promise((resolve) => setTimeout(resolve, YIELD_POLL_MS));
      signal.throwIfAborted();
    }
  }

  /** Has the worker decode the sheet's frames; writes the WebP and the index. */
  private async make(key: SheetKey, entry: MediaEntry, index: ThumbIndex, signal: AbortSignal): Promise<ImageBitmap> {
    const { layout } = entry;
    const cachedIndex = await this.deps.files.sampleIndex(key.mediaId, index.source).catch(() => null);
    await this.yieldToPreview(signal);
    this.making = true;
    const made = this.deps.workers.request(
      "thumbSheet",
      {
        mediaId: key.mediaId,
        source: index.source,
        file: entry.file as File,
        cachedIndex,
        timesUs: sheetTimes(layout, key.level, key.sheet),
        width: layout.width,
        height: layout.height,
        columns: layout.columns,
      },
      { priority: "background", signal },
    );
    const { bitmap, blob } = await made.finally(() => (this.making = false));
    this.counters.decoded += 1;
    // Listed even when the writes fail: a sheet whose file is missing is made again when it is shown,
    // and the eager levels never loop on a folder that refuses writes.
    addSheet(index, key.level, key.sheet);
    try {
      await this.deps.files.write(thumbSheetPath(key.mediaId, key.level, key.sheet), blob);
      await this.deps.files.write(thumbIndexPath(key.mediaId), new Blob([JSON.stringify(index)], { type: "application/json" }));
    } catch (error) {
      console.warn(`[thumbs] could not cache ${keyString(key)}: ${errorMessage(error)}`);
    }
    return bitmap;
  }

  private wanted(key: SheetKey): boolean {
    return this.visibleKeys.has(keyString(key)) || (key.level === 0 && key.sheet === 0 && this.cards.has(key.mediaId));
  }

  /** A sheet arrived: into the LRU when it is shown, else closed (it is on disk). */
  private keep(key: SheetKey, bitmap: ImageBitmap): void {
    if (this.disposed || !this.entries.has(key.mediaId) || !this.wanted(key)) {
      bitmap.close();
      return;
    }
    const k = keyString(key);
    const old = this.sheets.get(k);
    if (old) {
      old.bitmap.close();
      this.bytes -= old.bytes;
      this.sheets.delete(k);
    }
    const bytes = bitmap.width * bitmap.height * 4;
    this.sheets.set(k, { key, bitmap, bytes });
    this.bytes += bytes;
    this.evict();
    if (key.level === 0 && key.sheet === 0) this.emitCard(key.mediaId);
    this.deps.onArrival?.();
  }

  private evict(): void {
    const maxSheets = this.deps.maxSheets ?? MAX_SHEETS;
    const maxBytes = this.deps.maxBytes ?? MAX_BYTES;
    for (const [k, resident] of this.sheets) {
      if (this.sheets.size <= maxSheets && this.bytes <= maxBytes) return;
      if (this.wanted(resident.key)) continue;
      resident.bitmap.close();
      this.bytes -= resident.bytes;
      this.sheets.delete(k);
    }
  }

  private cardImage(mediaId: MediaId): CardImage | null {
    const entry = this.entries.get(mediaId);
    const bitmap = this.sheet(mediaId, 0, 0);
    if (!entry || !bitmap || bitmap.width === 0) return null;
    const { x, y } = cellOrigin(entry.layout, 0);
    return { bitmap, sx: x, sy: y, sw: entry.layout.width, sh: entry.layout.height };
  }

  private emitCard(mediaId: MediaId): void {
    const image = this.cardImage(mediaId);
    for (const listener of this.cards.get(mediaId) ?? []) listener(image);
  }

  private markReady(mediaId: MediaId): void {
    if (this.deps.document.getState().media[mediaId]?.analysis.thumbs === "pending") this.deps.document.amend(setMediaAnalysis(mediaId, { thumbs: "ready" }));
  }

  /** A media left the project (or changed size): its sheets are closed and its worker sessions freed. */
  private drop(mediaId: MediaId): void {
    if (!this.entries.delete(mediaId)) return;
    for (const [k, resident] of [...this.sheets]) {
      if (resident.key.mediaId !== mediaId) continue;
      resident.bitmap.close();
      this.bytes -= resident.bytes;
      this.sheets.delete(k);
    }
    for (const k of [...this.failed]) if (k.startsWith(`${mediaId}/`)) this.failed.delete(k);
    const at = this.eager.indexOf(mediaId);
    if (at !== -1) this.eager.splice(at, 1);
    this.emitCard(mediaId);
    this.deps.workers.request("closeThumbs", { mediaId }).catch(() => undefined);
  }
}

export type { ThumbLayout, ThumbLevel };
