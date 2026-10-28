// A project folder read over HTTP (spec §21.6): the headless render page reads the project the CLI
// serves on localhost through this `FsDir`. Read-only: every write throws NotAllowedError, permission
// queries answer "granted" for reading only. Paths are relative to `base`; the server answers
//   GET  <base><path>        the bytes (Range requests supported), Last-Modified; 404 when absent
//   GET  <base><path>/?list  a JSON array of { name, kind } for a directory; 404 when absent
import type { FsDir, FsEntry, FsFile, FsWritable, PermissionMode, PermissionStatus } from "../../project/fs.js";

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

const encode = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

function readOnly(what: string): DOMException {
  return new DOMException(`The project folder is read-only here (${what})`, "NotAllowedError");
}

export class HttpDir implements FsDir {
  readonly handle = null;

  constructor(
    /** The folder's URL, ending in "/". */
    private readonly base: string,
    readonly name: string,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {}

  private url(name: string): string {
    return `${this.base}${encode(name)}`;
  }

  private async get(name: string, headers?: Record<string, string>): Promise<Response | null> {
    const response = await this.fetchFn(this.url(name), headers ? { headers } : undefined);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${this.url(name)}`);
    return response;
  }

  async readFile(name: string): Promise<FsFile | null> {
    const response = await this.get(name);
    if (!response) return null;
    return { text: await response.text(), lastModified: Date.parse(response.headers.get("last-modified") ?? "") || 0 };
  }

  async getFile(name: string): Promise<File | null> {
    const response = await this.get(name);
    if (!response) return null;
    const lastModified = Date.parse(response.headers.get("last-modified") ?? "") || 0;
    return new File([await response.blob()], name.split("/").pop() ?? name, { lastModified });
  }

  /** `length` bytes of a file from `start` (a Range request); null when the file is absent. */
  async readRange(name: string, start: number, length: number): Promise<Uint8Array | null> {
    if (length <= 0) return new Uint8Array(0);
    const response = await this.get(name, { range: `bytes=${start}-${start + length - 1}` });
    return response ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  async list(): Promise<FsEntry[]> {
    const response = await this.fetchFn(`${this.base}?list`);
    if (!response.ok) throw new Error(`${response.status} listing ${this.base}`);
    return (await response.json()) as FsEntry[];
  }

  async dir(name: string, options: { create?: boolean } = {}): Promise<FsDir | null> {
    if (options.create) throw readOnly(`create ${name}`);
    const base = `${this.url(name)}/`;
    const response = await this.fetchFn(`${base}?list`);
    return response.ok ? new HttpDir(base, name, this.fetchFn) : null;
  }

  writeText(name: string, text: string): Promise<void> {
    void text;
    return Promise.reject(readOnly(`write ${name}`));
  }
  writeFile(name: string, data: Blob): Promise<void> {
    void data;
    return Promise.reject(readOnly(`write ${name}`));
  }
  openWritable(name: string): Promise<FsWritable> {
    return Promise.reject(readOnly(`write ${name}`));
  }
  rename(from: string, to: string): Promise<void> {
    void to;
    return Promise.reject(readOnly(`rename ${from}`));
  }
  moveTo(name: string, target: FsDir, to: string): Promise<void> {
    void target;
    void to;
    return Promise.reject(readOnly(`move ${name}`));
  }
  remove(name: string): Promise<void> {
    return Promise.reject(readOnly(`remove ${name}`));
  }

  async queryPermission(mode: PermissionMode): Promise<PermissionStatus> {
    return mode === "read" ? "granted" : "denied";
  }
  async requestPermission(mode: PermissionMode): Promise<PermissionStatus> {
    return mode === "read" ? "granted" : "denied";
  }
}
