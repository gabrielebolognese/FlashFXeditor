// session.json saving (spec §15): every 10 s when something changed, and on demand (tab hidden,
// closing). Session state is harmless to lose, so failures are only logged.
import type { FsDir } from "./fs.js";
import { SESSION_FILE } from "./layout.js";
import { serializeSession, type SessionFileData } from "./sessionFile.js";

export const SESSION_SAVE_INTERVAL_MS = 10_000;

export interface SessionSaverOptions {
  dir: FsDir;
  collect: () => SessionFileData;
  intervalMs?: number;
  readOnly?: boolean;
}

export class SessionSaver {
  private readonly options: SessionSaverOptions;
  private readonly interval: ReturnType<typeof setInterval>;
  private readOnly: boolean;
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(options: SessionSaverOptions) {
    this.options = options;
    this.readOnly = options.readOnly ?? false;
    this.interval = setInterval(() => void this.flush(), options.intervalMs ?? SESSION_SAVE_INTERVAL_MS);
  }

  /** Cheap enough to call on every playhead move. */
  markDirty(): void {
    this.dirty = true;
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
  }

  async flush(): Promise<void> {
    while (this.inFlight) await this.inFlight;
    if (!this.dirty || this.readOnly || this.disposed) return;
    this.dirty = false;
    this.inFlight = this.options.dir.writeText(SESSION_FILE, serializeSession(this.options.collect())).catch((error: unknown) => {
      this.dirty = true;
      console.warn("[session] save failed", error);
    });
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.interval);
  }
}
