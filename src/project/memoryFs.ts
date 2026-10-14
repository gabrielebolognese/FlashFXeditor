// In-memory FsDir for the project tests. Logs every write attempt (before checking permission, so
// "no writes attempted" is testable), can fail chosen operations, and stamps files with a
// monotonic clock so "newer" comparisons are deterministic. Not imported by app code.
import type { FsDir, FsEntry, FsFile, PermissionMode, PermissionStatus } from "./fs.js";

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
  readonly dirs = new Map<string, MemoryDir>();

  constructor(
    readonly name: string,
    readonly fs: MemoryFs,
    readonly path: string,
  ) {}

  get handle(): unknown {
    return this;
  }

  private child(name: string): string {
    return this.path ? `${this.path}/${name}` : name;
  }

  async readFile(name: string): Promise<FsFile | null> {
    this.fs.checkRead(this.child(name));
    const file = this.files.get(name);
    return file ? { ...file } : null;
  }

  async writeText(name: string, text: string): Promise<void> {
    this.fs.attempt("write", this.child(name));
    this.files.set(name, { text, lastModified: ++this.fs.clock });
  }

  async remove(name: string): Promise<void> {
    this.fs.attempt("remove", this.child(name));
    this.files.delete(name);
  }

  async list(): Promise<FsEntry[]> {
    this.fs.checkRead(this.path || ".");
    return [
      ...[...this.files.keys()].map((name) => ({ name, kind: "file" as const })),
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
    for (const name of this.files.keys()) out.push(name);
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
