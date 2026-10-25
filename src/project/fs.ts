// The only door to the File System Access API. Project code talks to `FsDir`; the app wraps real
// directory handles with `fromHandle`, tests use the in-memory implementation in memoryFs.ts.

export type PermissionMode = "read" | "readwrite";
export type PermissionStatus = "granted" | "denied" | "prompt";

export interface FsFile {
  text: string;
  /** ms since epoch, from the file system. */
  lastModified: number;
}

export interface FsEntry {
  name: string;
  kind: "file" | "directory";
}

export interface WriteFileOptions {
  /** Called with the bytes written so far, as chunks land. */
  onProgress?: (written: number) => void;
  /** Aborts the write; the partial file is discarded by the browser (the stream is aborted). */
  signal?: AbortSignal;
}

/** A file being written in place: positional writes, committed by `close` (spec §9.5: the proxy muxer). */
export interface FsWritable {
  /** Writes `data` at byte `position` (the file grows as needed). */
  write(data: Uint8Array, position: number): Promise<void>;
  /** Commits what was written. */
  close(): Promise<void>;
  /** Discards what was written since the file was opened. */
  abort(): Promise<void>;
}

export interface FsDir {
  readonly name: string;
  /** What to persist in IndexedDB to reopen this folder later (a FileSystemDirectoryHandle). */
  readonly handle: unknown;
  /** null when the file does not exist. */
  readFile(name: string): Promise<FsFile | null>;
  /** Creates or replaces a file: opens one writable stream, writes, closes (aborts on failure). */
  writeText(name: string, text: string): Promise<void>;
  /** The file for reading bytes (media, cached posters); null when it does not exist. */
  getFile(name: string): Promise<File | null>;
  /** Creates or replaces a file by streaming a blob into it (large media copies). */
  writeFile(name: string, data: Blob, options?: WriteFileOptions): Promise<void>;
  /** Creates (or empties) a file and opens it for positional writes. */
  openWritable(name: string): Promise<FsWritable>;
  /** Renames a file in this directory, replacing `to`: a move where the browser has one, else a copy and a removal. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes a file; a missing file is not an error. */
  remove(name: string): Promise<void>;
  list(): Promise<FsEntry[]>;
  /** A subdirectory; null when it does not exist and `create` is false. */
  dir(name: string, options?: { create?: boolean }): Promise<FsDir | null>;
  queryPermission(mode: PermissionMode): Promise<PermissionStatus>;
  /** Needs a user gesture in the browser; may throw without one. */
  requestPermission(mode: PermissionMode): Promise<PermissionStatus>;
}

// Chromium-only parts of the API that lib.dom does not declare.
interface MovableHandle {
  move?(name: string): Promise<void>;
}

interface PermissionedHandle {
  queryPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionStatus>;
  requestPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionStatus>;
}

/** NotFoundError, or TypeMismatchError (a directory where a file was expected, or the reverse). */
function isMissing(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError");
}

class NativeDir implements FsDir {
  constructor(readonly handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async readFile(name: string): Promise<FsFile | null> {
    try {
      const file = await (await this.handle.getFileHandle(name)).getFile();
      return { text: await file.text(), lastModified: file.lastModified };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async writeText(name: string, text: string): Promise<void> {
    const fileHandle = await this.handle.getFileHandle(name, { create: true });
    const stream = await fileHandle.createWritable();
    try {
      await stream.write(text);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => undefined);
      throw error;
    }
  }

  async getFile(name: string): Promise<File | null> {
    try {
      return await (await this.handle.getFileHandle(name)).getFile();
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async writeFile(name: string, data: Blob, options: WriteFileOptions = {}): Promise<void> {
    const { onProgress, signal } = options;
    signal?.throwIfAborted();
    const fileHandle = await this.handle.getFileHandle(name, { create: true });
    const stream = await fileHandle.createWritable();
    let written = 0;
    const count = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        written += chunk.byteLength;
        onProgress?.(written);
        controller.enqueue(chunk);
      },
    });
    // pipeTo closes the file stream on success and aborts it (discarding the data) on failure.
    await data.stream().pipeThrough(count).pipeTo(stream, signal ? { signal } : {});
  }

  async openWritable(name: string): Promise<FsWritable> {
    const fileHandle = await this.handle.getFileHandle(name, { create: true });
    const stream = await fileHandle.createWritable({ keepExistingData: false });
    return {
      write: (data, position) => stream.write({ type: "write", position, data: data as Uint8Array<ArrayBuffer> }),
      close: () => stream.close(),
      abort: () => stream.abort(),
    };
  }

  async rename(from: string, to: string): Promise<void> {
    const source = await this.handle.getFileHandle(from);
    const movable = source as unknown as MovableHandle;
    if (typeof movable.move === "function") {
      try {
        await movable.move(to);
        return;
      } catch (error) {
        // Some folders refuse moves: copy instead.
        if (!(error instanceof DOMException)) throw error;
      }
    }
    await this.writeFile(to, await source.getFile());
    await this.remove(from);
  }

  async remove(name: string): Promise<void> {
    try {
      await this.handle.removeEntry(name);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async list(): Promise<FsEntry[]> {
    const entries: FsEntry[] = [];
    for await (const [name, entry] of this.handle.entries()) entries.push({ name, kind: entry.kind });
    return entries;
  }

  async dir(name: string, options: { create?: boolean } = {}): Promise<FsDir | null> {
    try {
      return new NativeDir(await this.handle.getDirectoryHandle(name, { create: options.create ?? false }));
    } catch (error) {
      if (isMissing(error) && !options.create) return null;
      throw error;
    }
  }

  async queryPermission(mode: PermissionMode): Promise<PermissionStatus> {
    const handle = this.handle as PermissionedHandle;
    return handle.queryPermission ? handle.queryPermission({ mode }) : "granted";
  }

  async requestPermission(mode: PermissionMode): Promise<PermissionStatus> {
    const handle = this.handle as PermissionedHandle;
    return handle.requestPermission ? handle.requestPermission({ mode }) : "granted";
  }
}

export function fromHandle(handle: FileSystemDirectoryHandle): FsDir {
  return new NativeDir(handle);
}

export function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return typeof FileSystemDirectoryHandle !== "undefined" && value instanceof FileSystemDirectoryHandle;
}
