// The LUTs the renderer can draw (spec §21.19, Batch 75): each `.cube` of the open project (`luts/<name>.cube`)
// parsed into its RGBA8 atlas under a handle. The compositor packs a LUT effect's file as its handle (0: not
// loaded, the effect then draws nothing), the renderers upload each handle's atlas once. A file loaded again
// gets a new handle, so the stages that use it redraw. One library per thread: the app's, and the export
// worker's (filled from the export job).
import type { LutAtlas } from "../../core/effects/lut.js";

export interface LutEntry {
  handle: number;
  path: string;
  atlas: LutAtlas;
}

export class LutLibrary {
  private readonly byPath = new Map<string, LutEntry>();
  private readonly byHandle = new Map<number, LutEntry>();
  private readonly listeners = new Set<() => void>();
  private next = 1;

  /** Adds (or replaces) the LUT of `path`; returns its new handle. */
  set(path: string, atlas: LutAtlas): number {
    const old = this.byPath.get(path);
    if (old) this.byHandle.delete(old.handle);
    const entry: LutEntry = { handle: this.next++, path, atlas };
    this.byPath.set(path, entry);
    this.byHandle.set(entry.handle, entry);
    this.emit();
    return entry.handle;
  }

  /** Forgets every LUT (the project closed). */
  clear(): void {
    if (this.byPath.size === 0) return;
    this.byPath.clear();
    this.byHandle.clear();
    this.emit();
  }

  /** The handle of `path`, 0 when it is not loaded (an `EffectFileResolver`). */
  readonly handleOf = (path: string): number => this.byPath.get(path)?.handle ?? 0;

  get(handle: number): LutEntry | undefined {
    return this.byHandle.get(handle);
  }

  entry(path: string): LutEntry | undefined {
    return this.byPath.get(path);
  }

  paths(): string[] {
    return [...this.byPath.keys()];
  }

  /** Calls `listener` after each change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** This thread's LUTs. */
export const lutLibrary = new LutLibrary();
