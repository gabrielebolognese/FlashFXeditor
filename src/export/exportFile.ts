// The file an export writes (spec §16, §9.7). Its bytes land at their positions in
// cache/export-temp/<id>.mp4 as the worker produces them (one write after another); `finish` commits
// the file and moves it to exports/ under a free name; `discard` (a cancel, a failure) aborts the
// write and deletes the temp file, so nothing of an unfinished export reaches exports/. The first
// failed write is kept: later writes are skipped, `finish` throws it and `onError` hears it at once.
import type { FsDir, FsWritable } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { takenNames, uniqueName } from "../project/mediaFiles.js";

export const EXPORT_TEMP_DIR = "cache/export-temp";
export const EXPORTS_DIR = "exports";

export class ExportFile {
  private writes: Promise<void> = Promise.resolve();
  private error: unknown = null;
  private written = 0;
  private open = true;

  private constructor(
    private readonly root: FsDir,
    private readonly temp: FsDir,
    private readonly name: string,
    private readonly writable: FsWritable,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** Creates cache/export-temp/<id>.mp4 for positional writes. */
  static async create(root: FsDir, id: string, onError: (error: unknown) => void = () => undefined): Promise<ExportFile> {
    const temp = await subdir(root, EXPORT_TEMP_DIR);
    const name = `${id}.mp4`;
    return new ExportFile(root, temp, name, await temp.openWritable(name), onError);
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
        await this.writable.write(data, position);
      } catch (error) {
        this.error = error;
        this.onError(error);
      }
    });
  }

  /** Waits for the writes, commits the file and moves it to exports/ as `fileName` (or a free variant of it); returns the name it got. */
  async finish(fileName: string): Promise<string> {
    await this.writes;
    if (this.error !== null) throw this.error;
    this.open = false;
    await this.writable.close();
    const exportsDir = await subdir(this.root, EXPORTS_DIR);
    const name = uniqueName(await takenNames(exportsDir), fileName);
    try {
      await this.temp.moveTo(this.name, exportsDir, name);
    } catch (error) {
      await this.temp.remove(this.name).catch(() => undefined);
      throw error;
    }
    return name;
  }

  /** Stops writing and deletes the temp file. */
  async discard(): Promise<void> {
    const wasOpen = this.open;
    this.open = false;
    await this.writes;
    if (wasOpen) await this.writable.abort().catch(() => undefined);
    await this.temp.remove(this.name).catch(() => undefined);
  }
}

/** Deletes the temp files of exports that never finished (the tab closed meanwhile). */
export async function clearExportTemp(root: FsDir): Promise<void> {
  const cache = await root.dir("cache");
  const temp = cache ? await cache.dir("export-temp") : null;
  if (!temp) return;
  for (const entry of await temp.list()) if (entry.kind === "file") await temp.remove(entry.name).catch(() => undefined);
}
