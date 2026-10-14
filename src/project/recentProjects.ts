// Recent projects (spec §15): newest first, persisted in IndexedDB with the directory handle so a
// click can reopen the folder after a permission prompt.
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
  /** TODO(batch 42): thumbnail captured at the playhead on close. */
  thumbnail: null;
  /** FileSystemDirectoryHandle. */
  handle: unknown;
}

function isEntry(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<RecentProject>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.pathHint === "string" && typeof entry.modified === "string" && entry.handle != null;
}

export class RecentProjects {
  readonly list: Store<readonly RecentProject[]> = createStore<readonly RecentProject[]>([]);
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async load(): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      this.list.set(Array.isArray(stored) ? stored.filter(isEntry).slice(0, RECENT_LIMIT) : []);
    } catch (error) {
      console.warn("[recent] could not read recent projects", error);
    }
  }

  /** Adds or moves the project to the top. */
  touch(entry: Omit<RecentProject, "thumbnail">): Promise<void> {
    const next = [{ ...entry, thumbnail: null }, ...this.list.getState().filter((e) => e.id !== entry.id)].slice(0, RECENT_LIMIT);
    this.list.set(next);
    return this.persist();
  }

  /** Updates an entry in place (rename, save time). Unknown ids are ignored. */
  update(id: string, patch: Partial<Pick<RecentProject, "name" | "modified">>): Promise<void> {
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
