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
import type { MediaItem, Rational } from "../core/document/types.js";
import type { FileHandleLike } from "../project/mediaSources.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import type { ImportMode } from "../project/appSettings.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { copyIntoMedia, MEDIA_DIR, removeFileAt, safeFileName, takenNames, uniqueName } from "../project/mediaFiles.js";
import { browserDecodeAudio, probeAudioFile, type DecodeAudio, type DecodedAudioInfo, type ReadDuration } from "./probe/audioProbe.js";
import { ignoredAlphaNote } from "./probe/alphaHints.js";
import { probeLottie } from "./probe/lottieProbe.js";
import { probeSvg } from "./probe/svgProbe.js";
import type { ProbeResult } from "./probe/types.js";
import { classifyFile, type Container, type FileKind } from "./mediaKinds.js";
import { mediaItemFrom } from "./mediaItem.js";
import { sequenceMediaItem, sequenceName } from "./sequence.js";
import { isAbortError } from "./workers/protocol.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

export type ProbeFile = (file: File, kind: FileKind, signal?: AbortSignal) => Promise<ProbeResult>;

/**
 * The probe for each container. `onDecodedAudio` receives what decodeAudioData made of an audio file
 * (the decoded-audio cache keeps it instead of decoding the file again); `readAudioDuration` lets the
 * audio probe refuse a file too long to decode whole before decoding it.
 */
export function createProbeFile(pool: Pick<WorkerPool, "request">, decodeAudio: DecodeAudio = browserDecodeAudio(), onDecodedAudio?: (file: File, decoded: DecodedAudioInfo) => void, readAudioDuration?: ReadDuration): ProbeFile {
  return (file, kind, signal) => {
    switch (kind.container) {
      case "mp4":
      case "webm":
      case "image":
        return pool.request("probe", { file, container: kind.container, type: kind.mime }, { priority: "user", ...(signal && { signal }) });
      case "audio":
        return probeAudioFile(file, kind.audioCodec ?? "", decodeAudio, onDecodedAudio && ((decoded) => onDecodedAudio(file, decoded)), readAudioDuration);
      case "svg":
        return probeSvg(file);
      case "lottie":
        return probeLottie(file);
    }
  };
}

export { mediaItemFrom };

/** A file to import, with its handle and its path inside a dropped folder when there are ones (reference mode). */
export type ImportSource = File | { file: File; handle?: FileHandleLike | undefined; path?: string | undefined };

const sourceFile = (source: ImportSource): File => (source instanceof File ? source : source.file);

export interface Refusal {
  name: string;
  reason: string;
  /** How the file would have been probed: set when its type is accepted and reading it failed (Batch 47: a failed import). */
  container?: Container;
}

export interface ImportReport {
  added: MediaItem[];
  refused: Refusal[];
  /** Bytes copied into media/. */
  bytes: number;
  /** Items that refer to their files instead of a copy (reference mode). */
  linked: number;
  /** Things to tell the user about files that were added (Batch 64: an alpha channel that plays opaque). */
  notes?: { name: string; message: string; detail: string }[];
}

export interface ImportProgress {
  /** The file being copied, 0-based, of `count`. */
  index: number;
  count: number;
  name: string;
  copiedBytes: number;
  totalBytes: number;
}

/** An image sequence to import as one media item (Batch 64, spec §21.11): the frames in order, copied into media/<name>/. */
export interface SequenceRequest {
  /** The folder the frames came from (names the media item and its folder in media/). */
  folder: string;
  pattern: string;
  first: number;
  files: File[];
  fps: Rational;
}

export interface ImportOptions {
  signal?: AbortSignal;
  /** Sequences imported with the files, in the same undo step. */
  sequences?: readonly SequenceRequest[];
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

  /**
   * Copies a sequence's frames into media/<name>/ and makes its media item. The first and the last frame are
   * probed: all frames must have one size. Null (and a refusal) when it cannot be imported.
   */
  private async copySequence(request: SequenceRequest, taken: Set<string>, refused: Refusal[], copied: string[], signal?: AbortSignal): Promise<{ item: MediaItem; bytes: number } | null> {
    const { dir } = this.deps;
    const name = sequenceName(request);
    const fail = (reason: string) => {
      refused.push({ name, reason });
      return null;
    };
    const first = request.files[0] as File;
    const last = request.files[request.files.length - 1] as File;
    const kind = classifyFile(first.name, first.type);
    if (!kind) return fail("unsupported file type");
    let probe: ProbeResult;
    try {
      probe = await this.deps.probe(first, kind, signal);
      const end = request.files.length > 1 ? await this.deps.probe(last, kind, signal) : probe;
      if (end.width !== probe.width || end.height !== probe.height) return fail(`its frames are not all the same size (${probe.width}x${probe.height} and ${end.width}x${end.height})`);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return fail(errorMessage(error));
    }
    const folderName = uniqueName(taken, safeFileName(name));
    const target = await subdir(dir, `${MEDIA_DIR}/${folderName}`);
    const folderPath = `${MEDIA_DIR}/${folderName}`;
    let bytes = 0;
    let written = 0;
    try {
      for (const [i, file] of request.files.entries()) {
        signal?.throwIfAborted();
        await target.writeFile(file.name, file, signal ? { signal } : {});
        copied.push(`${folderPath}/${file.name}`);
        written += 1;
        bytes += file.size;
        if (i % 16 === 0) await Promise.resolve();
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      // The frames already copied go again.
      await Promise.all(copied.splice(copied.length - written).map((relPath) => removeFileAt(dir, relPath).catch(() => undefined)));
      return fail(`could not copy it into media/ (${errorMessage(error)})`);
    }
    const sequence = { dir: folderPath, pattern: request.pattern, first: request.first, count: request.files.length, fps: { ...request.fps } };
    const item = sequenceMediaItem({ id: this.newId(), name, addedAt: this.now(), sequence, width: probe.width ?? 0, height: probe.height ?? 0, codec: probe.codec ?? "png", size: bytes });
    return { item, bytes };
  }

  private async run(files: readonly ImportSource[], { signal, onProgress, place, placeLabel, sequences = [] }: ImportOptions): Promise<ImportReport> {
    const refused: Refusal[] = [];
    const accepted: { source: ImportSource; file: File; kind: FileKind }[] = [];
    for (const source of files) {
      const file = sourceFile(source);
      const kind = classifyFile(file.name, file.type);
      if (kind) accepted.push({ source, file, kind });
      else refused.push({ name: file.name, reason: "unsupported file type" });
    }
    if (accepted.length === 0 && sequences.length === 0) return { added: [], refused, bytes: 0, linked: 0 };
    signal?.throwIfAborted();

    const probed = await mapLimit(accepted, PROBE_CONCURRENCY, async ({ source, file, kind }) => {
      try {
        return { source, file, container: kind.container, probe: await this.deps.probe(file, kind, signal) };
      } catch (error) {
        if (isAbortError(error)) throw error;
        refused.push({ name: file.name, reason: errorMessage(error), container: kind.container });
        return null;
      }
    });
    const ready = probed.filter((entry) => entry !== null);
    signal?.throwIfAborted();
    if (ready.length === 0 && sequences.length === 0) return { added: [], refused, bytes: 0, linked: 0 };

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
      for (const [index, { source, file, container, probe }] of ready.entries()) {
        const id = this.newId();
        const fields = { id, name: file.name, addedAt: this.now(), size: file.size };
        const handle = handleOf(source);
        if (handle && storeHandle) {
          try {
            await storeHandle(id, handle);
          } catch (error) {
            refused.push({ name: file.name, reason: `could not keep a link to it (${errorMessage(error)})`, container });
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
          refused.push({ name: file.name, reason: `could not copy it into media/ (${errorMessage(error)})`, container });
          continue;
        }
        copied.push(relPath);
        bytes += file.size;
        items.push(mediaItemFrom(probe, { ...fields, file: { relPath } }));
        sources.push(file);
      }
      for (const request of sequences) {
        const made = await this.copySequence(request, taken, refused, copied, signal);
        if (!made) continue;
        bytes += made.bytes;
        items.push(made.item);
        sources.push(request.files[0] as File);
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
    const added = new Set(items.map((item) => item.name));
    const notes = ready.flatMap(({ file, probe }) => (probe.alphaIgnored && added.has(file.name) ? [{ name: file.name, message: `${file.name} imports without transparency`, detail: ignoredAlphaNote(probe.alphaIgnored) }] : []));
    return { added: items, refused, bytes, linked, ...(notes.length > 0 && { notes }) };
  }
}
