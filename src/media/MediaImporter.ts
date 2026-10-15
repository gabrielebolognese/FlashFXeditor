// Import flow (spec §9.1, Batch 04): classify -> refuse unknown types -> probe (worker, or the main
// thread for decodeAudioData formats and SVG) -> copy into media/ one file at a time -> one `media.add`
// for the whole batch. Imports run one after another so two batches never pick the same file name.
// An aborted import (project closed) removes what it copied and adds nothing.
import { addMedia } from "../core/commands/mediaCommands.js";
import type { MediaItem } from "../core/document/types.js";
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
 * The document record of a probed, copied file. Analysis that applies to the kind starts pending
 * (§9.1): thumbnails for video, peaks for anything with audio.
 */
export function mediaItemFrom(probe: ProbeResult, fields: { id: string; name: string; relPath: string; addedAt: string }): MediaItem {
  const item: MediaItem = {
    id: fields.id,
    kind: probe.kind,
    name: fields.name,
    file: { relPath: fields.relPath },
    durationUs: probe.durationUs,
    hasAudio: probe.hasAudio,
    analysis: { thumbs: probe.kind === "video" ? "pending" : "none", peaks: probe.hasAudio ? "pending" : "none" },
    addedAt: fields.addedAt,
  };
  if (probe.width !== undefined) item.width = probe.width;
  if (probe.height !== undefined) item.height = probe.height;
  if (probe.rotation !== undefined && probe.kind === "video") item.rotation = probe.rotation;
  if (probe.fps) item.fps = { ...probe.fps };
  if (probe.codec) item.codec = probe.codec;
  if (probe.audioCodec) item.audioCodec = probe.audioCodec;
  return item;
}

export interface Refusal {
  name: string;
  reason: string;
}

export interface ImportReport {
  added: MediaItem[];
  refused: Refusal[];
  /** Bytes copied into media/. */
  bytes: number;
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
}

export interface MediaImporterDeps {
  dir: FsDir;
  documentStore: DocumentStore;
  probe: ProbeFile;
  importMode?: () => ImportMode;
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
  importFiles(files: readonly File[], options: ImportOptions = {}): Promise<ImportReport> {
    const run = this.chain.then(() => this.run(files, options));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(files: readonly File[], { signal, onProgress }: ImportOptions): Promise<ImportReport> {
    const refused: Refusal[] = [];
    const accepted: { file: File; kind: FileKind }[] = [];
    for (const file of files) {
      const kind = classifyFile(file.name, file.type);
      if (kind) accepted.push({ file, kind });
      else refused.push({ name: file.name, reason: "unsupported file type" });
    }
    if (accepted.length === 0) return { added: [], refused, bytes: 0 };
    signal?.throwIfAborted();

    const probed = await mapLimit(accepted, PROBE_CONCURRENCY, async ({ file, kind }) => {
      try {
        return { file, probe: await this.deps.probe(file, kind, signal) };
      } catch (error) {
        if (isAbortError(error)) throw error;
        refused.push({ name: file.name, reason: errorMessage(error) });
        return null;
      }
    });
    const ready = probed.filter((entry) => entry !== null);
    signal?.throwIfAborted();
    if (ready.length === 0) return { added: [], refused, bytes: 0 };

    if (this.deps.importMode?.() === "reference") {
      // TODO(batch 41): reference mode keeps FileSystemFileHandles in IndexedDB (project/kv.ts) instead of copying.
      console.info("[media] reference import mode is not available yet; copying into media/");
    }

    const { dir } = this.deps;
    const taken = await takenNames(await subdir(dir, MEDIA_DIR));
    const totalBytes = ready.reduce((sum, entry) => sum + entry.file.size, 0);
    const items: MediaItem[] = [];
    const sources: File[] = [];
    const copied: string[] = [];
    let bytes = 0;
    try {
      for (const [index, { file, probe }] of ready.entries()) {
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
        items.push(mediaItemFrom(probe, { id: this.newId(), name: file.name, relPath, addedAt: this.now() }));
        sources.push(file);
      }
      signal?.throwIfAborted();
      if (items.length > 0) this.deps.documentStore.dispatch(addMedia(items));
      items.forEach((item, i) => this.deps.onAdded?.(item, sources[i] as File));
    } catch (error) {
      await Promise.all(copied.map((relPath) => removeFileAt(dir, relPath).catch(() => undefined)));
      throw error;
    }
    return { added: items, refused, bytes };
  }
}
