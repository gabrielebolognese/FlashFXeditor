// Where the open project's media files come from (spec §9.1, §12, Batch 41), and which media are
// offline. A copied item (`{ relPath }`) is a file in the project folder; a linked item (reference
// import mode, `{ handleKey, pathHint }`) is a FileSystemFileHandle kept in IndexedDB under
// `media-handle:<handleKey>`, readable once the browser grants read permission again (asked for on
// open, `requestAccess`, which needs a user gesture). An empty `handleKey` (an offline item pasted from
// another project, Batch 39) resolves nowhere.
// Offline states, kept in `status` (media absent from it are online):
// - `missing`: the file is not there (deleted from media/, moved or renamed on disk, no handle);
// - `permission`: a linked file the browser has not granted read access to yet;
// - `failed`: the file is there but cannot be shown (an undecodable codec: the preview reports it).
// `checkAll` finds them on open; every later `file()` that fails marks its media too. `attach` follows
// the document: new media and media whose file changed (a relink, its undo or redo) are checked again,
// and media that leave the project lose their status at once. Framework-free.
import type { Affect } from "../core/commands/command.js";
import type { Store } from "../core/store/createStore.js";
import type { MediaId, MediaItem, Project } from "../core/document/types.js";
import type { FsDir, PermissionStatus } from "./fs.js";
import type { KeyValueStore } from "./kv.js";
import { resolveFile } from "./mediaFiles.js";

export type MediaStatus = "missing" | "permission" | "failed";

/** The browser's FileSystemFileHandle as used here (fakes in tests). */
export interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionStatus>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionStatus>;
}

const HANDLE_PREFIX = "media-handle:";

/** The IndexedDB key of a linked file's handle. */
export const handleStoreKey = (handleKey: string): string => `${HANDLE_PREFIX}${handleKey}`;

/** Whether two records of a media name the same file (the same copy, or the same stored handle). */
export function sameFile(a: MediaItem["file"], b: MediaItem["file"]): boolean {
  return "relPath" in a ? "relPath" in b && a.relPath === b.relPath : "handleKey" in b && a.handleKey === b.handleKey;
}

/** What tells two files of a media apart: their bytes (when both are known), length and picture size. */
export interface ContentFields {
  size?: number | undefined;
  durationUs: number;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * Whether two files of a media hold the same content (a relink to a moved or copied file keeps the
 * media's caches; another file makes them again).
 */
export function sameContent(a: ContentFields, b: ContentFields): boolean {
  if (a.durationUs !== b.durationUs || a.width !== b.width || a.height !== b.height) return false;
  return a.size === undefined || b.size === undefined || a.size === b.size;
}

/** The document as `attach` follows it. */
export interface MediaDocument {
  getState(): Pick<Project, "media">;
  subscribe(listener: (state: Pick<Project, "media">, prev: Pick<Project, "media">) => void, options: { affects: readonly Affect[] }): () => void;
}

export interface MediaSourcesDeps {
  dir: FsDir;
  kv: KeyValueStore;
  /** The open project's media records. */
  media: () => Readonly<Record<MediaId, MediaItem>>;
  /** The offline media (absent: online). Written here; the panel, timeline and preview read it. */
  status: Store<ReadonlyMap<MediaId, MediaStatus>>;
}

/** What one media's file resolved to. */
type Lookup = { file: File; status: null } | { file: null; status: MediaStatus };

const isNamed = (error: unknown, ...names: string[]) => error instanceof DOMException && names.includes(error.name);

export class MediaSources {
  /** Handles by `handleKey` (null: none stored), loaded once per open project. */
  private readonly handles = new Map<string, Promise<FileHandleLike | null>>();
  private disposed = false;
  /** Settles once every check started so far has (`whenChecked`). */
  private checked: Promise<void> = Promise.resolve();

  constructor(private readonly deps: MediaSourcesDeps) {}

  /**
   * Follows the document's media (`deps.media` must read the same document): new media (an import,
   * an offline record pasted from another project, an undone removal) and media whose file changed (a
   * relink, its undo or redo) are checked, and media that left the project lose their status at once
   * (no file read tells it for a removed media). Returns a stop function.
   */
  attach(document: MediaDocument): () => void {
    return document.subscribe(
      (state, prev) => {
        const changed = Object.keys(state.media).filter((id) => {
          const before = prev.media[id];
          return !before || !sameFile(before.file, (state.media[id] as MediaItem).file);
        });
        if (Object.keys(prev.media).some((id) => !Object.hasOwn(state.media, id))) this.update(new Map());
        if (changed.length > 0) void this.check(changed);
      },
      { affects: ["media"] },
    );
  }

  /** Resolves once the checks started so far are done (a relink's toast, tests). */
  whenChecked(): Promise<void> {
    return this.checked;
  }

  /** The media's source file, or null when it is offline (its status is updated either way). */
  async file(mediaId: MediaId): Promise<File | null> {
    const item = this.deps.media()[mediaId];
    if (!item) return null;
    const found = await this.lookup(item);
    // A file changed meanwhile (an undo of a relink) is told by its own check.
    const now = this.deps.media()[mediaId];
    if (now && sameFile(now.file, item.file)) this.update(new Map([[mediaId, found.status]]));
    return found.file;
  }

  /** The stored handle of a linked file. */
  handle(handleKey: string): Promise<FileHandleLike | null> {
    if (handleKey === "") return Promise.resolve(null);
    let handle = this.handles.get(handleKey);
    if (!handle) {
      handle = this.deps.kv.get(handleStoreKey(handleKey)).then(
        (value) => (isFileHandle(value) ? value : null),
        () => null,
      );
      this.handles.set(handleKey, handle);
    }
    return handle;
  }

  /** Keeps a linked file's handle (reference import, relink). */
  async storeHandle(handleKey: string, handle: FileHandleLike): Promise<void> {
    await this.deps.kv.set(handleStoreKey(handleKey), handle);
    this.handles.set(handleKey, Promise.resolve(handle));
  }

  /** Checks every media item's file (on open): one status update. */
  async checkAll(): Promise<void> {
    await this.check(Object.keys(this.deps.media()));
  }

  /**
   * Checks these media again (a new or relinked file, an access grant, a file that came back). A
   * media whose file changed again while it was looked up keeps the newer check's result.
   */
  check(ids: readonly MediaId[]): Promise<void> {
    const media = this.deps.media();
    const done = Promise.all(ids.map(async (id) => [id, media[id] ? (await this.lookup(media[id])).status : null] as const)).then((results) => {
      const now = this.deps.media();
      const current = ([id]: readonly [MediaId, unknown]) => {
        const looked = media[id];
        const latest = now[id];
        return !looked || !latest || sameFile(looked.file, latest.file);
      };
      this.update(new Map(results.filter(current)), true);
    });
    this.checked = Promise.all([this.checked, done]).then(
      () => undefined,
      () => undefined,
    );
    return done;
  }

  /** Linked media waiting for the browser's read permission. */
  waitingForAccess(): MediaId[] {
    return [...this.deps.status.getState()].filter(([, status]) => status === "permission").map(([id]) => id);
  }

  /**
   * Asks the browser for read access to the linked files that need it (a user gesture: the open click
   * or the panel's Allow access). Chrome may grant every stored handle at the first prompt. Stops at
   * the first request that throws (no user activation left). Returns how many are still waiting.
   */
  async requestAccess(): Promise<number> {
    const media = this.deps.media();
    for (const id of this.waitingForAccess()) {
      const item = media[id];
      if (!item || "relPath" in item.file) continue;
      const handle = await this.handle(item.file.handleKey);
      if (!handle?.requestPermission) continue;
      try {
        if ((await handle.queryPermission?.({ mode: "read" })) === "granted") continue;
        await handle.requestPermission({ mode: "read" });
      } catch (error) {
        console.info("[media] file access was not requested", error);
        break;
      }
    }
    await this.check(this.waitingForAccess());
    return this.waitingForAccess().length;
  }

  /**
   * The preview could not show the media: drawn as an offline slate. A media already offline keeps its
   * reason (the preview fails on a missing file too).
   */
  markFailed(mediaId: MediaId): void {
    if (this.deps.media()[mediaId] && !this.deps.status.getState().has(mediaId)) this.update(new Map([[mediaId, "failed"]]));
  }

  /** Drops the media's statuses (checked again by the next `file()` or `check`) and those of media that left the project. */
  forget(ids: readonly MediaId[]): void {
    this.update(new Map(ids.map((id) => [id, null])), true);
  }

  dispose(): void {
    this.disposed = true;
    this.handles.clear();
  }

  private async lookup(item: MediaItem): Promise<Lookup> {
    if ("relPath" in item.file) {
      try {
        const file = await resolveFile(this.deps.dir, item.file.relPath);
        return file ? { file, status: null } : { file: null, status: "missing" };
      } catch (error) {
        console.warn(`[media] cannot read ${item.file.relPath}`, error);
        return { file: null, status: "missing" };
      }
    }
    const handle = await this.handle(item.file.handleKey);
    if (!handle) return { file: null, status: "missing" };
    try {
      const permission = (await handle.queryPermission?.({ mode: "read" })) ?? "granted";
      if (permission !== "granted") return { file: null, status: "permission" };
      return { file: await handle.getFile(), status: null };
    } catch (error) {
      if (isNamed(error, "NotAllowedError", "SecurityError")) return { file: null, status: "permission" };
      if (!isNamed(error, "NotFoundError", "NotReadableError", "TypeMismatchError")) console.warn(`[media] cannot read the linked file ${item.file.pathHint}`, error);
      return { file: null, status: "missing" };
    }
  }

  /**
   * Writes statuses (null: online). A file that resolves does not clear `failed` (the decoder's verdict)
   * unless `reset`. Media no longer in the project are dropped. One store update, only on change.
   */
  private update(changes: ReadonlyMap<MediaId, MediaStatus | null>, reset = false): void {
    if (this.disposed) return;
    const media = this.deps.media();
    const current = this.deps.status.getState();
    const next = new Map(current);
    for (const [id, status] of changes) {
      if (status === null) {
        if (reset || next.get(id) !== "failed") next.delete(id);
      } else if (media[id]) {
        next.set(id, status);
      }
    }
    for (const id of next.keys()) if (!Object.hasOwn(media, id)) next.delete(id);
    if (next.size === current.size && [...next].every(([id, status]) => current.get(id) === status)) return;
    this.deps.status.set(next);
  }
}

function isFileHandle(value: unknown): value is FileHandleLike {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "file" && typeof (value as { getFile?: unknown }).getFile === "function";
}
