// Watched folders (project inbox): the folders generators write projects into, chosen once each and kept as
// directory handles in IndexedDB (per address). They replace the single projects folder of Batch 56: on the
// first load that folder becomes the first entry. `/?open=<path>` is tried in each, in order.
import { createStore, type Store } from "../../core/store/createStore.js";
import type { FsDir } from "../fs.js";
import type { KeyValueStore } from "../kv.js";

const KEY = "watched-folders.v1";
/** The single projects folder of before (a bare handle). */
const OLD_KEY = "projects-folder.v1";
export const MAX_LABEL = 40;

interface Stored {
  id: string;
  label: string;
  handle: unknown;
}

/** What the UI shows of a watched folder. */
export interface WatchedFolderInfo {
  id: string;
  /** Shown on cards and usable in `/?open=<label>:<path>`; unique among the folders. */
  label: string;
  /** The folder's own name. */
  name: string;
}

export interface WatchedFolder extends WatchedFolderInfo {
  dir: FsDir;
}

/** `label` cleaned (no `:` or slashes, which a link reads as separators) and made unique among `taken`. */
export function uniqueLabel(label: string, taken: readonly string[]): string {
  const base = label.replace(/[:/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) || "Folder";
  const used = new Set(taken.map((other) => other.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const next = `${base} ${n}`;
    if (!used.has(next.toLowerCase())) return next;
  }
}

export class WatchedFolders {
  readonly list: Store<readonly WatchedFolderInfo[]> = createStore<readonly WatchedFolderInfo[]>([]);
  private stored: Stored[] = [];
  private loading: Promise<void> | null = null;

  constructor(
    private readonly kv: KeyValueStore,
    /** Wraps a stored handle (`fromHandle` in the app); null when it is not a usable directory handle. */
    private readonly wrap: (handle: unknown) => FsDir | null,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** Reads the list once (later calls wait for the same read); the old projects folder is migrated here. */
  load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  private async read(): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      if (Array.isArray(stored)) {
        this.stored = (stored as Partial<Stored>[]).filter((entry): entry is Stored => typeof entry?.id === "string" && typeof entry.label === "string" && this.wrap(entry.handle) !== null);
      } else {
        const old = this.wrap((await this.kv.get(OLD_KEY)) ?? null);
        this.stored = old ? [{ id: this.newId(), label: uniqueLabel(old.name, []), handle: old.handle }] : [];
        if (old) await this.kv.set(KEY, this.stored);
      }
    } catch (error) {
      console.warn("[watched-folders] could not read the watched folders", error);
      this.stored = [];
    }
    this.publish();
  }

  /** The folders in order (after `load`). */
  folders(): WatchedFolder[] {
    const out: WatchedFolder[] = [];
    for (const entry of this.stored) {
      const dir = this.wrap(entry.handle);
      if (dir) out.push({ id: entry.id, label: entry.label, name: dir.name, dir });
    }
    return out;
  }

  /** Adds a folder at the end; a folder already in the list (the same handle) is returned as it is. */
  async add(dir: FsDir, isSame: (a: FsDir, b: FsDir) => Promise<boolean> = async (a, b) => a.handle === b.handle): Promise<WatchedFolderInfo> {
    await this.load();
    for (const folder of this.folders()) if (await isSame(folder.dir, dir)) return folder;
    const entry: Stored = { id: this.newId(), label: uniqueLabel(dir.name, this.stored.map((other) => other.label)), handle: dir.handle };
    this.stored = [...this.stored, entry];
    await this.persist();
    return { id: entry.id, label: entry.label, name: dir.name };
  }

  async remove(id: string): Promise<void> {
    if (!this.stored.some((entry) => entry.id === id)) return;
    this.stored = this.stored.filter((entry) => entry.id !== id);
    await this.persist();
  }

  /** Sets the label of a folder (cleaned, unique); an empty label goes back to the folder's name. */
  async rename(id: string, label: string): Promise<void> {
    const entry = this.stored.find((other) => other.id === id);
    if (!entry) return;
    const others = this.stored.filter((other) => other.id !== id).map((other) => other.label);
    const next = uniqueLabel(label.trim() === "" ? (this.wrap(entry.handle)?.name ?? "") : label, others);
    if (next === entry.label) return;
    this.stored = this.stored.map((other) => (other.id === id ? { ...other, label: next } : other));
    await this.persist();
  }

  private publish(): void {
    this.list.set(this.folders().map(({ id, label, name }) => ({ id, label, name })));
  }

  private async persist(): Promise<void> {
    this.publish();
    try {
      await this.kv.set(KEY, this.stored);
    } catch (error) {
      console.warn("[watched-folders] could not store the watched folders", error);
    }
  }
}
