// Autosave (spec §15, BINDING): debounced after the last change, at most `maxWaitMs` apart during
// continuous editing, one save in flight at a time. Failures never throw to callers: they set the
// status (shown by the app bar dot) and log.
import type { Project } from "../core/document/types.js";
import { createStore, type Store } from "../core/store/createStore.js";
import { errorMessage } from "./errorMessage.js";
import type { FsDir } from "./fs.js";
import { serializeProject } from "./projectFile.js";
import { PROJECT_FILE } from "./layout.js";
import { saveProjectFile } from "./saveProject.js";

export const AUTOSAVE_DELAY_MS = 1000;
export const AUTOSAVE_MAX_WAIT_MS = 5000;

export type SaveState = "saved" | "saving" | "unsaved" | "error";

export interface SaveStatus {
  state: SaveState;
  /** ISO time of the last successful save in this session. */
  savedAt: string | null;
  error: string | null;
  /** No write permission: changes stay in memory and nothing is written. */
  readOnly: boolean;
}

export const INITIAL_SAVE_STATUS: SaveStatus = { state: "saved", savedAt: null, error: null, readOnly: false };

/** What the file system says of project.json: compared to see whether another tool wrote it (spec §21.5). */
export interface FileStamp {
  lastModified: number;
  size: number;
}

export interface AutosaverOptions {
  dir: FsDir;
  getProject: () => Project;
  appVersion: string;
  /** Shared status store (the app bar reads one store across projects). */
  status?: Store<SaveStatus>;
  delayMs?: number;
  readOnly?: boolean;
  historyLimit?: number;
  now?: () => Date;
  onSaved?: (project: Project, savedAt: string) => void;
}

export class Autosaver {
  readonly status: Store<SaveStatus>;

  private readonly options: AutosaverOptions;
  private delayMs: number;
  private readOnly: boolean;
  private dirty = false;
  private firstDirtyAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<boolean> | null = null;
  private disposed = false;
  private held = false;
  private written: FileStamp | null = null;

  constructor(options: AutosaverOptions) {
    this.options = options;
    this.delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
    this.readOnly = options.readOnly ?? false;
    this.status = options.status ?? createStore<SaveStatus>(INITIAL_SAVE_STATUS);
    this.status.set({ ...INITIAL_SAVE_STATUS, readOnly: this.readOnly });
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  /** The stamp project.json had right after this session's last write (null before the first one). */
  get lastWritten(): FileStamp | null {
    return this.written;
  }

  /**
   * While held nothing is written (the banner of an external change waits for Reload or Keep mine);
   * releasing schedules the save of what is unsaved.
   */
  hold(held: boolean): void {
    if (this.held === held) return;
    this.held = held;
    if (held) this.cancelTimer();
    else if (this.dirty && !this.readOnly) this.schedule();
  }

  /** The document was just replaced by what is on disk (a reload): nothing is unsaved. */
  markClean(): void {
    this.dirty = false;
    this.firstDirtyAt = null;
    this.cancelTimer();
    if (!this.inFlight) this.setStatus({ state: "saved" });
  }

  /** Records a document change and schedules a save. Cheap: safe to call on every commit. */
  markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (!this.inFlight) this.setStatus({ state: "unsaved" });
    if (!this.readOnly) this.schedule();
  }

  /** Debounce delay; the max wait during continuous editing is never shorter than it. */
  setDelay(ms: number): void {
    this.delayMs = ms;
    if (this.timer !== undefined) this.schedule();
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.setStatus({ readOnly });
    if (readOnly) this.cancelTimer();
    else if (this.dirty) this.schedule();
  }

  /** Writes now even when nothing changed (Mod+S, retry). Resolves false when the save failed. */
  saveNow(): Promise<boolean> {
    return this.run(true);
  }

  /** Writes now only if there are unsaved changes (closing, tab hidden). */
  flush(): Promise<boolean> {
    return this.run(false);
  }

  /** Resolves once no save is in flight. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private get maxWaitMs(): number {
    return Math.max(AUTOSAVE_MAX_WAIT_MS, this.delayMs);
  }

  private schedule(): void {
    const now = Date.now();
    this.firstDirtyAt ??= now;
    const wait = Math.max(0, Math.min(this.delayMs, this.firstDirtyAt + this.maxWaitMs - now));
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run(false);
    }, wait);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async run(force: boolean): Promise<boolean> {
    this.cancelTimer();
    while (this.inFlight) await this.inFlight;
    if (this.readOnly || this.disposed || this.held) return false;
    if (!this.dirty && !force) return this.status.getState().state !== "error";
    this.inFlight = this.write();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async write(): Promise<boolean> {
    const project = this.options.getProject();
    this.dirty = false;
    this.firstDirtyAt = null;
    this.setStatus({ state: "saving" });
    const now = this.options.now?.() ?? new Date();
    const savedAt = now.toISOString();
    try {
      const text = serializeProject(project, { now: savedAt, appVersion: this.options.appVersion });
      await saveProjectFile(this.options.dir, text, { now, ...(this.options.historyLimit !== undefined && { historyLimit: this.options.historyLimit }) });
      this.written = await this.stampOf();
    } catch (error) {
      this.dirty = true;
      console.error("[autosave] save failed", error);
      this.setStatus({ state: "error", error: errorMessage(error) });
      return false;
    }
    this.setStatus({ state: this.dirty ? "unsaved" : "saved", savedAt, error: null });
    // Changes made while writing get their own save.
    if (this.dirty && !this.readOnly && !this.disposed) this.schedule();
    try {
      this.options.onSaved?.(project, savedAt);
    } catch (error) {
      console.error("[autosave] onSaved failed", error);
    }
    return true;
  }

  private async stampOf(): Promise<FileStamp | null> {
    try {
      const file = await this.options.dir.getFile(PROJECT_FILE);
      return file ? { lastModified: file.lastModified, size: file.size } : null;
    } catch {
      return null;
    }
  }

  private setStatus(patch: Partial<SaveStatus>): void {
    this.status.set((current) => {
      const next = { ...current, ...patch };
      return (Object.keys(patch) as (keyof SaveStatus)[]).every((key) => current[key] === next[key]) ? current : next;
    });
  }
}
