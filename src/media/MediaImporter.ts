// Import flow (spec §9.1, Batch 04): classify -> refuse unknown types -> probe (worker, or the main
// thread for decodeAudioData formats and SVG) -> copy into media/ one file at a time -> one `media.add`
// for the whole batch. Imports run one after another so two batches never pick the same file name.
// An aborted import (project closed) removes what it copied and adds nothing.
// Reference mode (Batch 41, the `importMode` setting): a file that comes with its handle (the picker,
// a drop) is not copied: its handle is kept in IndexedDB (`storeHandle`, keyed by the new media id)
// and the item refers to it (`{ handleKey, pathHint }`, the hint being the dropped path or the file
// name). Files without a handle (pasted images) are copied as in copy mode. Every item records its
// source size (relinking a folder matches by name and size).
import { addMedia } from "../core/commands/mediaCommands.js";
import type { MediaItem } from "../core/document/types.js";
import type { FileHandleLike } from "../project/mediaSources.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import type { ImportMode } from "../project/appSettings.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { copyIntoMedia, MEDIA_DIR, removeFileAt, takenNames } from "../project/mediaFiles.js";
import { browserDecodeAudio, probeAudioFile, type DecodeAudio, type DecodedAudioInfo } from "./probe/audioProbe.js";
import { probeSvg } from "./probe/svgProbe.js";
import type { ProbeResult } from "./probe/types.js";
import { classifyFile, type FileKind } from "./mediaKinds.js";
import { isAbortError } from "./workers/protocol.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

export type ProbeFile = (file: File, kind: FileKind, signal?: AbortSignal) => Promise<ProbeResult>;

/**
 * The probe for each container. `onDecodedAudio` receives what decodeAudioData made of an audio file
 * (the decoded-audio cache keeps it instead of decoding the file again).
 */
export function createProbeFile(pool: Pick<WorkerPool, "request">, decodeAudio: DecodeAudio = browserDecodeAudio(), onDecodedAudio?: (file: File, decoded: DecodedAudioInfo) => void): ProbeFile {
  return (file, kind, signal) => {
    switch (kind.container) {
      case "mp4":
      case "image":
        return pool.request("probe", { file, container: kind.container, type: kind.mime }, { priority: "user", ...(signal && { signal }) });
      case "audio":
        return probeAudioFile(file, kind.audioCodec ?? "", decodeAudio, onDecodedAudio && ((decoded) => onDecodedAudio(file, decoded)));
      case "svg":
        return probeSvg(file);
    }
  };
}

/**
 * The document record of a probed, copied (or linked) file. Analysis that applies to the kind starts
 * pending (§9.1): thumbnails for video, peaks for anything with audio.
 */
export function mediaItemFrom(probe: ProbeResult, fields: { id: string; name: string; file: MediaItem["file"]; addedAt: string; size?: number }): MediaItem {
  const item: MediaItem = {
    id: fields.id,
    kind: probe.kind,
    name: fields.name,
    file: { ...fields.file },
    durationUs: probe.durationUs,
    hasAudio: probe.hasAudio,
    analysis: { thumbs: probe.kind === "video" ? "pending" : "none", peaks: probe.hasAudio ? "pending" : "none" },
    addedAt: fields.addedAt,
  };
  if (fields.size !== undefined) item.size = fields.size;
  if (probe.width !== undefined) item.width = probe.width;
  if (probe.height !== undefined) item.height = probe.height;
  if (probe.rotation !== undefined && probe.kind === "video") item.rotation = probe.rotation;
  if (probe.fps) item.fps = { ...probe.fps };
  if (probe.codec) item.codec = probe.codec;
  if (probe.audioCodec) item.audioCodec = probe.audioCodec;
  return item;
}

/** A file to import, with its handle and its path inside a dropped folder when there are ones (reference mode). */
export type ImportSource = File | { file: File; handle?: FileHandleLike | undefined; path?: string | undefined };

const sourceFile = (source: ImportSource): File => (source instanceof File ? source : source.file);

export interface Refusal {
  name: string;
  reason: string;
}

export interface ImportReport {
  added: MediaItem[];
  refused: Refusal[];
  /** Bytes copied into media/. */
  bytes: number;
  /** Items that refer to their files instead of a copy (reference mode). */
  linked: number;
}

export interface ImportProgress {
  /** The file being copied, 0-based, of `count`. */
  index: number;
  count: number;
  name: string;
  copiedBytes: number;
  totalBytes: number;
}

export interface ImportOptions {
  signal?: AbortSignal;
  /** Called before copying with the total, then as bytes land. */
  onProgress?: (progress: ImportProgress) => void;
  /**
   * Places the new items (files dropped on the timeline, spec §6.14): called with them right after
   * they are added, inside one transaction labeled `placeLabel`, so the import and its clips are one
   * undo step. It reads the document from the store and dispatches its own commands.
   */
  place?: (items: readonly MediaItem[]) => void;
  placeLabel?: string;
}

export interface MediaImporterDeps {
  dir: FsDir;
  documentStore: DocumentStore;
  probe: ProbeFile;
  importMode?: () => ImportMode;
  /** Keeps a linked file's handle (reference mode); without it every file is copied. */
  storeHandle?: (handleKey: string, handle: FileHandleLike) => Promise<void>;
  newId?: () => string;
  now?: () => string;
  /** Each media item added, with the file it was probed from. */
  onAdded?: (item: MediaItem, file: File) => void;
}

const PROBE_CONCURRENCY = 3;

/** Runs `fn` over `items` with at most `limit` in flight, keeping the order of results. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class MediaImporter {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly newId: () => string;
  private readonly now: () => string;

  constructor(private readonly deps: MediaImporterDeps) {
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Imports after any import still running. */
  importFiles(files: readonly ImportSource[], options: ImportOptions = {}): Promise<ImportReport> {
    return this.exclusive(() => this.run(files, options));
  }

  /** Runs `task` after any import still running, and no import starts before it ends (a relink's copies into media/ pick unique names too). */
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(files: readonly ImportSource[], { signal, onProgress, place, placeLabel }: ImportOptions): Promise<ImportReport> {
    const refused: Refusal[] = [];
    const accepted: { source: ImportSource; file: File; kind: FileKind }[] = [];
    for (const source of files) {
      const file = sourceFile(source);
      const kind = classifyFile(file.name, file.type);
      if (kind) accepted.push({ source, file, kind });
      else refused.push({ name: file.name, reason: "unsupported file type" });
    }
    if (accepted.length === 0) return { added: [], refused, bytes: 0, linked: 0 };
    signal?.throwIfAborted();

    const probed = await mapLimit(accepted, PROBE_CONCURRENCY, async ({ source, file, kind }) => {
      try {
        return { source, file, probe: await this.deps.probe(file, kind, signal) };
      } catch (error) {
        if (isAbortError(error)) throw error;
        refused.push({ name: file.name, reason: errorMessage(error) });
        return null;
      }
    });
    const ready = probed.filter((entry) => entry !== null);
    signal?.throwIfAborted();
    if (ready.length === 0) return { added: [], refused, bytes: 0, linked: 0 };

    const { dir, storeHandle } = this.deps;
    const reference = this.deps.importMode?.() === "reference" && storeHandle !== undefined;
    const handleOf = (source: ImportSource) => (reference && !(source instanceof File) ? (source.handle ?? null) : null);
    const taken = await takenNames(await subdir(dir, MEDIA_DIR));
    const totalBytes = ready.reduce((sum, entry) => sum + (handleOf(entry.source) ? 0 : entry.file.size), 0);
    const items: MediaItem[] = [];
    const sources: File[] = [];
    const copied: string[] = [];
    let bytes = 0;
    let linked = 0;
    try {
      for (const [index, { source, file, probe }] of ready.entries()) {
        const id = this.newId();
        const fields = { id, name: file.name, addedAt: this.now(), size: file.size };
        const handle = handleOf(source);
        if (handle && storeHandle) {
          try {
            await storeHandle(id, handle);
          } catch (error) {
            refused.push({ name: file.name, reason: `could not keep a link to it (${errorMessage(error)})` });
            continue;
          }
          const pathHint = (!(source instanceof File) && source.path) || file.name;
          items.push(mediaItemFrom(probe, { ...fields, file: { handleKey: id, pathHint } }));
          sources.push(file);
          linked += 1;
          continue;
        }
        const report = (written: number) => onProgress?.({ index, count: ready.length, name: file.name, copiedBytes: bytes + written, totalBytes });
        report(0);
        let relPath: string;
        try {
          relPath = await copyIntoMedia(dir, file, file.name, taken, { onProgress: report, ...(signal && { signal }) });
        } catch (error) {
          if (isAbortError(error)) throw error;
          refused.push({ name: file.name, reason: `could not copy it into media/ (${errorMessage(error)})` });
          continue;
        }
        copied.push(relPath);
        bytes += file.size;
        items.push(mediaItemFrom(probe, { ...fields, file: { relPath } }));
        sources.push(file);
      }
      signal?.throwIfAborted();
      const { documentStore } = this.deps;
      if (items.length > 0 && place) {
        documentStore.transaction(placeLabel ?? "Import media", () => {
          documentStore.dispatch(addMedia(items));
          place(items);
        });
      } else if (items.length > 0) {
        documentStore.dispatch(addMedia(items));
      }
      items.forEach((item, i) => this.deps.onAdded?.(item, sources[i] as File));
    } catch (error) {
      await Promise.all(copied.map((relPath) => removeFileAt(dir, relPath).catch(() => undefined)));
      throw error;
    }
    return { added: items, refused, bytes, linked };
  }
}
