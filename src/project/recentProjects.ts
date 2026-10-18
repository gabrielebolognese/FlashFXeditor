// Recent projects (spec §15): newest first, persisted in IndexedDB with the directory handle so a
// click can reopen the folder after a permission prompt, and a thumbnail of the frame at the playhead
// captured when the project closes (Batch 42).
import { createStore, type Store } from "../core/store/createStore.js";
import type { KeyValueStore } from "./kv.js";

export const RECENT_LIMIT = 12;
const KEY = "recent-projects.v1";

export interface RecentProject {
  /** Project id (project.json `id`). */
  id: string;
  name: string;
  /** Folder name: FSA exposes no full paths. */
  pathHint: string;
  /** ISO time of the last save. */
  modified: string;
  /** The frame at the playhead when the project last closed (an image, RECENT_THUMB_HEIGHT px tall), or null. */
  thumbnail: Blob | null;
  /** "1080×1920 · 30 fps", or "" for entries stored before Batch 42. */
  format: string;
  /** FileSystemDirectoryHandle. */
  handle: unknown;
}

function isEntry(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<RecentProject>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.pathHint === "string" && typeof entry.modified === "string" && entry.handle != null;
}

/** Older entries get the fields added since (no thumbnail, no format). */
function normalize(entry: RecentProject): RecentProject {
  const thumbnail = typeof Blob !== "undefined" && entry.thumbnail instanceof Blob ? entry.thumbnail : null;
  return { ...entry, thumbnail, format: typeof entry.format === "string" ? entry.format : "" };
}

/** The pixel height recent-project thumbnails are captured at (the start screen's well at 2x). */
export const RECENT_THUMB_HEIGHT = 192;

export class RecentProjects {
  readonly list: Store<readonly RecentProject[]> = createStore<readonly RecentProject[]>([]);
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async load(): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      this.list.set(Array.isArray(stored) ? stored.filter(isEntry).map(normalize).slice(0, RECENT_LIMIT) : []);
    } catch (error) {
      console.warn("[recent] could not read recent projects", error);
    }
  }

  /** Adds or moves the project to the top; it keeps its thumbnail (and format, when none is given). */
  touch(entry: Omit<RecentProject, "thumbnail" | "format"> & { format?: string }): Promise<void> {
    const old = this.list.getState().find((e) => e.id === entry.id);
    const next = [{ ...entry, thumbnail: old?.thumbnail ?? null, format: entry.format ?? old?.format ?? "" }, ...this.list.getState().filter((e) => e.id !== entry.id)].slice(0, RECENT_LIMIT);
    this.list.set(next);
    return this.persist();
  }

  /** Updates an entry in place (rename, save time). Unknown ids are ignored. */
  update(id: string, patch: Partial<Pick<RecentProject, "name" | "modified" | "format" | "thumbnail">>): Promise<void> {
    const current = this.list.getState();
    const index = current.findIndex((e) => e.id === id);
    const entry = current[index];
    if (!entry || Object.entries(patch).every(([key, value]) => entry[key as keyof RecentProject] === value)) return this.writing;
    this.list.set(current.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    return this.persist();
  }

  remove(id: string): Promise<void> {
    const current = this.list.getState();
    if (!current.some((e) => e.id === id)) return this.writing;
    this.list.set(current.filter((e) => e.id !== id));
    return this.persist();
  }

  // Writes are chained so they land in order; each writes the latest list.
  private persist(): Promise<void> {
    this.writing = this.writing.then(async () => {
      try {
        await this.kv.set(KEY, this.list.getState());
      } catch (error) {
        console.warn("[recent] could not store recent projects", error);
      }
    });
    return this.writing;
  }
}
