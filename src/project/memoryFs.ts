// In-memory FsDir for the project tests. Logs every write attempt (before checking permission, so
// "no writes attempted" is testable), can fail chosen operations, and stamps files with a
// monotonic clock so "newer" comparisons are deterministic. Not imported by app code.
import type { FsDir, FsEntry, FsFile, FsWritable, PermissionMode, PermissionStatus, WriteFileOptions } from "./fs.js";

export type MemoryOp = "write" | "remove" | "mkdir";

export class MemoryFs {
  /** Every write-side operation attempted, as "op path", in order. */
  readonly log: string[] = [];
  readonly permissions: Record<PermissionMode, PermissionStatus> = { read: "granted", readwrite: "granted" };
  /** What `requestPermission` resolves to per mode (the user's answer). Default: unchanged state. */
  answers: Partial<Record<PermissionMode, PermissionStatus>> = {};
  readonly requests: PermissionMode[] = [];
  /** Return true to make an operation throw. */
  fail: ((op: MemoryOp, path: string) => boolean) | null = null;
  clock = 1_000;

  /** Write-side operations attempted so far. */
  get writes(): number {
    return this.log.length;
  }

  attempt(op: MemoryOp, path: string): void {
    this.log.push(`${op} ${path}`);
    if (this.permissions.readwrite !== "granted") throw new DOMException(`No write permission for ${path}`, "NotAllowedError");
    if (this.fail?.(op, path)) throw new DOMException(`Simulated failure: ${op} ${path}`, "InvalidStateError");
  }

  checkRead(path: string): void {
    if (this.permissions.read !== "granted" && this.permissions.readwrite !== "granted") {
      throw new DOMException(`No read permission for ${path}`, "NotAllowedError");
    }
  }
}

export class MemoryDir implements FsDir {
  readonly files = new Map<string, FsFile>();
  /** Binary files written with writeFile. */
  readonly blobs = new Map<string, { data: Blob; lastModified: number }>();
  readonly dirs = new Map<string, MemoryDir>();

  constructor(
    readonly name: string,
    readonly fs: MemoryFs,
    readonly path: string,
  ) {}

  get handle(): unknown {
    return this;
  }

  child(name: string): string {
    return this.path ? `${this.path}/${name}` : name;
  }

  async readFile(name: string): Promise<FsFile | null> {
    this.fs.checkRead(this.child(name));
    const file = this.files.get(name);
    return file ? { ...file } : null;
  }

  async writeText(name: string, text: string): Promise<void> {
    this.fs.attempt("write", this.child(name));
    this.blobs.delete(name);
    this.files.set(name, { text, lastModified: ++this.fs.clock });
  }

  async getFile(name: string): Promise<File | null> {
    this.fs.checkRead(this.child(name));
    const blob = this.blobs.get(name);
    if (blob) return new File([blob.data], name, { lastModified: blob.lastModified });
    const file = this.files.get(name);
    return file ? new File([file.text], name, { lastModified: file.lastModified }) : null;
  }

  async writeFile(name: string, data: Blob, options: WriteFileOptions = {}): Promise<void> {
    options.signal?.throwIfAborted();
    this.fs.attempt("write", this.child(name));
    // Half the bytes, then the rest: progress callers see more than one step.
    const half = Math.floor(data.size / 2);
    if (half > 0) options.onProgress?.(half);
    await Promise.resolve();
    options.signal?.throwIfAborted();
    this.files.delete(name);
    this.blobs.set(name, { data, lastModified: ++this.fs.clock });
    options.onProgress?.(data.size);
  }

  /** Files opened with `openWritable` and not closed or aborted yet. */
  readonly writing = new Set<string>();

  async openWritable(name: string): Promise<FsWritable> {
    this.fs.attempt("write", this.child(name));
    // The browser creates the (empty) file at once and keeps the data in a swap file until `close`.
    if (!this.blobs.has(name)) this.blobs.set(name, { data: new Blob([]), lastModified: ++this.fs.clock });
    this.writing.add(name);
    let bytes = new Uint8Array(0);
    let length = 0;
    let open = true;
    const check = () => {
      if (!open) throw new DOMException("The stream is closed", "InvalidStateError");
    };
    return {
      write: async (data, position) => {
        check();
        this.fs.attempt("write", this.child(name));
        const end = position + data.byteLength;
        if (end > bytes.byteLength) {
          const grown = new Uint8Array(Math.max(end, bytes.byteLength * 2));
          grown.set(bytes.subarray(0, length));
          bytes = grown;
        }
        bytes.set(data, position);
        length = Math.max(length, end);
      },
      close: async () => {
        check();
        open = false;
        this.writing.delete(name);
        this.files.delete(name);
        this.blobs.set(name, { data: new Blob([bytes.slice(0, length)]), lastModified: ++this.fs.clock });
      },
      abort: async () => {
        open = false;
        this.writing.delete(name);
      },
    };
  }

  async rename(from: string, to: string): Promise<void> {
    this.fs.attempt("write", this.child(to));
    const blob = this.blobs.get(from);
    const file = this.files.get(from);
    if (!blob && !file) throw new DOMException(`${from} does not exist`, "NotFoundError");
    this.files.delete(to);
    this.blobs.delete(to);
    if (blob) this.blobs.set(to, blob);
    if (file) this.files.set(to, file);
    this.files.delete(from);
    this.blobs.delete(from);
  }

  async moveTo(name: string, target: FsDir, to: string): Promise<void> {
    const blob = this.blobs.get(name);
    const file = this.files.get(name);
    if (!blob && !file) throw new DOMException(`${name} does not exist`, "NotFoundError");
    if (!(target instanceof MemoryDir)) throw new TypeError("A memory file moves into a memory directory only");
    target.fs.attempt("write", target.child(to));
    target.files.delete(to);
    target.blobs.delete(to);
    if (blob) target.blobs.set(to, blob);
    if (file) target.files.set(to, file);
    this.files.delete(name);
    this.blobs.delete(name);
  }

  async remove(name: string): Promise<void> {
    this.fs.attempt("remove", this.child(name));
    this.files.delete(name);
    this.blobs.delete(name);
  }

  async list(): Promise<FsEntry[]> {
    this.fs.checkRead(this.path || ".");
    return [
      ...[...this.files.keys(), ...this.blobs.keys()].map((name) => ({ name, kind: "file" as const })),
      ...[...this.dirs.keys()].map((name) => ({ name, kind: "directory" as const })),
    ];
  }

  async dir(name: string, options: { create?: boolean } = {}): Promise<MemoryDir | null> {
    const existing = this.dirs.get(name);
    if (existing) return existing;
    if (!options.create) return null;
    this.fs.attempt("mkdir", this.child(name));
    const created = new MemoryDir(name, this.fs, this.child(name));
    this.dirs.set(name, created);
    return created;
  }

  async queryPermission(mode: PermissionMode): Promise<PermissionStatus> {
    return this.fs.permissions[mode];
  }

  async requestPermission(mode: PermissionMode): Promise<PermissionStatus> {
    this.fs.requests.push(mode);
    const answer = this.fs.answers[mode];
    if (answer) this.fs.permissions[mode] = answer;
    return this.fs.permissions[mode];
  }

  /** Every file and directory below this one, as sorted relative paths (directories end in "/"). */
  tree(): string[] {
    const out: string[] = [];
    for (const name of [...this.files.keys(), ...this.blobs.keys()]) out.push(name);
    for (const [name, dir] of this.dirs) {
      out.push(`${name}/`);
      for (const inner of dir.tree()) out.push(`${name}/${inner}`);
    }
    return out.sort();
  }

  /** Test helper: text of a file at a relative path, or undefined. */
  text(path: string): string | undefined {
    const parts = path.split("/");
    const file = parts.pop() ?? "";
    const dir = parts.reduce<MemoryDir | undefined>((current, part) => current?.dirs.get(part), this);
    return dir?.files.get(file)?.text;
  }
}

export function createMemoryDir(name = "My Project"): MemoryDir {
  return new MemoryDir(name, new MemoryFs(), "");
}
