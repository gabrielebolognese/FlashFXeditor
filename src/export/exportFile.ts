// The file an export writes (spec §16, §9.7). Its bytes land at their positions as the worker
// produces them (one write after another), in one of two places:
// - the project's exports/ (the default destination): a temp file cache/export-temp/<id>.<ext> that
//   `finish` commits and moves to exports/ under a free name;
// - a file picked with the save picker (Batch 44's destination): written in place through the
//   picker's handle (the browser keeps the old content until the write is committed).
// `discard` (a cancel, a failure) aborts the write and deletes the temp or picked file, so nothing of
// an unfinished export is left. The first failed write is kept: later writes are skipped, `finish`
// throws it and `onError` hears it at once. `saveExport` writes a small finished file (a frame, a
// subtitle file) to either place.
import type { FsDir, FsWritable } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { takenNames, uniqueName } from "../project/mediaFiles.js";

export const EXPORT_TEMP_DIR = "cache/export-temp";
export const EXPORTS_DIR = "exports";

/** A file picked as the destination (a FileSystemFileHandle, `pickedFile`). */
export interface PickedFile {
  readonly name: string;
  openWritable(): Promise<FsWritable>;
  /** After an aborted write: deletes the file the picker made (a file that existed is kept as it was). */
  remove(): Promise<void>;
}

/** Where the writes go and how the finished file is committed or dropped. */
interface Target {
  writable: FsWritable;
  /** Puts the closed file in its place; returns its name. */
  commit(fileName: string): Promise<string>;
  drop(): Promise<void>;
}

export class ExportFile {
  private writes: Promise<void> = Promise.resolve();
  private error: unknown = null;
  private written = 0;
  private open = true;

  private constructor(
    private readonly target: Target,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** Creates cache/export-temp/<id>.<ext> for positional writes; `finish` moves it into exports/. */
  static async create(root: FsDir, id: string, onError: (error: unknown) => void = () => undefined, ext = "mp4"): Promise<ExportFile> {
    const temp = await subdir(root, EXPORT_TEMP_DIR);
    const name = `${id}.${ext}`;
    const writable = await temp.openWritable(name);
    return new ExportFile(
      {
        writable,
        async commit(fileName) {
          const exportsDir = await subdir(root, EXPORTS_DIR);
          const free = uniqueName(await takenNames(exportsDir), fileName);
          try {
            await temp.moveTo(name, exportsDir, free);
          } catch (error) {
            await temp.remove(name).catch(() => undefined);
            throw error;
          }
          return free;
        },
        drop: () => temp.remove(name).catch(() => undefined),
      },
      onError,
    );
  }

  /** Writes straight into a picked file; `finish` commits it under its own name. */
  static async toPicked(file: PickedFile, onError: (error: unknown) => void = () => undefined): Promise<ExportFile> {
    return new ExportFile({ writable: await file.openWritable(), commit: async () => file.name, drop: () => file.remove().catch(() => undefined) }, onError);
  }

  /** The file's length so far (the furthest byte queued). */
  get bytes(): number {
    return this.written;
  }

  /** Queues `data` at `position`. */
  write(data: Uint8Array, position: number): void {
    this.written = Math.max(this.written, position + data.byteLength);
    this.writes = this.writes.then(async () => {
      if (this.error !== null || !this.open) return;
      try {
        await this.target.writable.write(data, position);
      } catch (error) {
        this.error = error;
        this.onError(error);
      }
    });
  }

  /** Waits for the writes and commits the file (into exports/ as `fileName` or a free variant of it); returns the name it got. */
  async finish(fileName: string): Promise<string> {
    await this.writes;
    if (this.error !== null) throw this.error;
    this.open = false;
    await this.target.writable.close();
    return this.target.commit(fileName);
  }

  /** Stops writing and deletes the file. */
  async discard(): Promise<void> {
    const wasOpen = this.open;
    this.open = false;
    await this.writes;
    if (wasOpen) await this.target.writable.abort().catch(() => undefined);
    await this.target.drop();
  }
}

/** Writes a finished small file to exports/ (a free variant of `fileName`) or to the picked file; returns its name. */
export async function saveExport(destination: { root: FsDir } | { picked: PickedFile }, fileName: string, data: Blob): Promise<string> {
  if ("picked" in destination) {
    const writable = await destination.picked.openWritable();
    try {
      await writable.write(new Uint8Array(await data.arrayBuffer()), 0);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return destination.picked.name;
  }
  const exportsDir = await subdir(destination.root, EXPORTS_DIR);
  const name = uniqueName(await takenNames(exportsDir), fileName);
  await exportsDir.writeFile(name, data);
  return name;
}

// Chromium's FileSystemHandle.remove (not in lib.dom).
interface RemovableHandle {
  remove?(): Promise<void>;
}

/** A picker's file handle as a PickedFile. */
export function pickedFile(handle: FileSystemFileHandle): PickedFile {
  return {
    name: handle.name,
    async openWritable() {
      const stream = await handle.createWritable({ keepExistingData: false });
      return {
        write: (data, position) => stream.write({ type: "write", position, data: data as Uint8Array<ArrayBuffer> }),
        close: () => stream.close(),
        abort: () => stream.abort(),
      };
    },
    async remove() {
      // The picker made an empty file for a new name; a file that existed keeps its old content (the
      // aborted write never replaced it) and stays.
      if ((await handle.getFile()).size === 0) await (handle as unknown as RemovableHandle).remove?.();
    },
  };
}

/** Deletes the temp files of exports that never finished (the tab closed meanwhile). */
export async function clearExportTemp(root: FsDir): Promise<void> {
  const cache = await root.dir("cache");
  const temp = cache ? await cache.dir("export-temp") : null;
  if (!temp) return;
  for (const entry of await temp.list()) if (entry.kind === "file") await temp.remove(entry.name).catch(() => undefined);
}
