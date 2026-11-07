// Reload on external change (spec §21.5, Batch 56). The File System Access API cannot watch files, so the
// app asks: one `getFile()` (no read of the content) when the window gets focus or becomes visible and every
// 5 s while the window is visible and nothing is busy (a gesture, a save, an export). A stamp (last modified
// and size) the app did not write itself is an external change. Pure timing and comparison: what to do about
// a change is the caller's (app/externalController.ts).
import type { FileStamp } from "./Autosaver.js";
import type { FsDir } from "./fs.js";
import { PROJECT_FILE } from "./layout.js";

export const EXTERNAL_CHECK_MS = 5000;

export interface ExternalWatcherOptions {
  dir: FsDir;
  /** The stamp of the project.json the session opened or last wrote (the autosaver's `lastWritten` once it has one). */
  written: () => FileStamp | null;
  /** True while a gesture, a save or an export runs: a check waits for the next tick. */
  busy: () => boolean;
  /** project.json changed under the app: the new stamp. Called once per change. */
  onChange: (stamp: FileStamp) => void;
  intervalMs?: number;
  /** Where focus and visibility are watched; omitted in tests that call `check` themselves. */
  win?: Window;
  doc?: Document;
}

const same = (a: FileStamp | null, b: FileStamp | null): boolean => (a === null || b === null ? a === b : a.lastModified === b.lastModified && a.size === b.size);

export class ExternalWatcher {
  private known: FileStamp | null = null;
  private seenWritten: FileStamp | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private checking = false;
  private stopped = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly options: ExternalWatcherOptions) {}

  /** Reads the first stamp and starts the timer and the focus listeners. */
  async start(): Promise<void> {
    this.known = (await this.stamp()) ?? this.known;
    if (this.stopped) return;
    const { win, doc } = this.options;
    this.timer = setInterval(() => {
      if (!doc || doc.visibilityState === "visible") void this.check();
    }, this.options.intervalMs ?? EXTERNAL_CHECK_MS);
    if (win) {
      const onFocus = () => void this.check();
      win.addEventListener("focus", onFocus);
      this.cleanups.push(() => win.removeEventListener("focus", onFocus));
    }
    if (doc) {
      const onVisible = () => {
        if (doc.visibilityState === "visible") void this.check();
      };
      doc.addEventListener("visibilitychange", onVisible);
      this.cleanups.push(() => doc.removeEventListener("visibilitychange", onVisible));
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  /** The file as it is now counts as seen (after a reload, or Keep mine). */
  accept(stamp: FileStamp | null): void {
    this.known = stamp;
  }

  /** One check. Resolves true when it reported a change. */
  async check(): Promise<boolean> {
    if (this.stopped || this.checking || this.options.busy()) return false;
    this.checking = true;
    try {
      const stamp = await this.stamp();
      // A save can start while the file is being read: its write is not an external change.
      if (this.stopped || stamp === null || this.options.busy()) return false;
      const written = this.options.written();
      if (written !== null && !same(written, this.seenWritten)) {
        this.seenWritten = written;
        this.known = written;
      }
      if (same(stamp, this.known)) return false;
      this.known = stamp;
      this.options.onChange(stamp);
      return true;
    } finally {
      this.checking = false;
    }
  }

  private async stamp(): Promise<FileStamp | null> {
    try {
      const file = await this.options.dir.getFile(PROJECT_FILE);
      return file ? { lastModified: file.lastModified, size: file.size } : null;
    } catch {
      return null;
    }
  }
}
