// The projects folder and open links (spec §21.5, Batch 56). A directory handle chosen once and kept in
// IndexedDB (per origin); `/?open=<path>` opens the project folder at <path> inside it.
import { createStore, type Store } from "../core/store/createStore.js";
import type { FsDir } from "./fs.js";
import type { KeyValueStore } from "./kv.js";
import { PROJECT_FILE } from "./layout.js";

const KEY = "projects-folder.v1";

/** What the UI shows of the stored folder: its name; null when none is set. */
export interface ProjectsFolderInfo {
  name: string;
}

export class ProjectsFolder {
  readonly info: Store<ProjectsFolderInfo | null> = createStore<ProjectsFolderInfo | null>(null);
  private handle: unknown = null;

  constructor(
    private readonly kv: KeyValueStore,
    /** Wraps a stored handle (`fromHandle` in the app); null when it is not a usable directory handle. */
    private readonly wrap: (handle: unknown) => FsDir | null,
  ) {}

  /** The stored folder, or null. */
  async load(): Promise<FsDir | null> {
    try {
      this.handle = (await this.kv.get(KEY)) ?? null;
    } catch (error) {
      console.warn("[projects-folder] could not read the projects folder", error);
      this.handle = null;
    }
    const dir = this.handle === null ? null : this.wrap(this.handle);
    this.info.set(dir ? { name: dir.name } : null);
    return dir;
  }

  /** The stored folder without reading IndexedDB again (after `load`). */
  get dir(): FsDir | null {
    return this.handle === null ? null : this.wrap(this.handle);
  }

  async set(dir: FsDir): Promise<void> {
    this.handle = dir.handle;
    this.info.set({ name: dir.name });
    try {
      await this.kv.set(KEY, dir.handle);
    } catch (error) {
      console.warn("[projects-folder] could not store the projects folder", error);
    }
  }

  async clear(): Promise<void> {
    this.handle = null;
    this.info.set(null);
    try {
      await this.kv.del(KEY);
    } catch (error) {
      console.warn("[projects-folder] could not forget the projects folder", error);
    }
  }
}

/** The `open` parameter of a query string (`?open=interop/basic`), cleaned to segments joined by `/`; null when absent or unusable. */
export function parseOpenLink(search: string): string | null {
  const raw = new URLSearchParams(search).get("open");
  if (raw === null) return null;
  const segments = openSegments(raw);
  return segments && segments.length > 0 ? segments.join("/") : null;
}

/** The segments of a link path: `\` counts as `/`, empty and `.` segments are dropped, `..` makes the path unusable (null). */
export function openSegments(path: string): string[] | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  return parts.some((part) => part === "..") ? null : parts;
}

/** The query string without its `open` parameter (what the address shows once the link is used). */
export function withoutOpenLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("open");
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

export type LinkTarget = { ok: true; dir: FsDir } | { ok: false; reason: "missing" | "noProject" };

/** The project folder at `path` inside `root`: it must exist and hold a project.json. */
export async function resolveLinkTarget(root: FsDir, path: string): Promise<LinkTarget> {
  const segments = openSegments(path);
  if (!segments || segments.length === 0) return { ok: false, reason: "missing" };
  let dir: FsDir | null = root;
  for (const segment of segments) {
    dir = await dir.dir(segment);
    if (!dir) return { ok: false, reason: "missing" };
  }
  const file = await dir.readFile(PROJECT_FILE);
  return file ? { ok: true, dir } : { ok: false, reason: "noProject" };
}
