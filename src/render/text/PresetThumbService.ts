// Preset thumbnails as bitmaps (spec §20.2: "cached per preset id, style hash and device pixel ratio,
// generated lazily in idle time and again when the preset changes"), for the preset bar's buttons and
// the Presets tab's cards. `get` answers from the cache or queues the bitmap in the IdleQueue (which
// pauses while playing and dragging, so a thumbnail is never rasterized during playback) and returns
// null (a made thumbnail with nothing to draw is `{ bitmap: null }`); listeners hear when bitmaps
// arrive, and the painter keeps a canvas's old pixels until then.
// A preset whose fonts are not loaded yet waits (the font library loads them) and is made when its
// family reports a change; a family that changes (a face loaded, the catalog read, a project font
// added) has its bitmaps made again, the old ones shown until the new ones land. The cache is a small
// LRU; evicted and replaced bitmaps are closed (P13).
import type { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import type { TextPreset } from "../../core/document/types.js";
import { presetLookKey, presetSampleText } from "../../text/presets.js";

/** Bitmaps kept: the bar's buttons and a Presets tab full of cards, at two sizes each. */
export const MAX_THUMBNAILS = 192;
/** Font waits before a thumbnail draws anyway (with the fallback: a font file that never loads). */
const MAX_WAITS = 4;

export interface PresetThumbDeps {
  idle: Pick<IdleQueue, "enqueue">;
  /** Whether the faces `preset` needs to draw `text` are loaded; when not, starts loading them. */
  fontsReady(preset: TextPreset, text: string): boolean;
  /** The bitmap of `preset` at `width` x `height` device px (less `margin` each side), or null. */
  render(preset: TextPreset, width: number, height: number, margin: number): ImageBitmap | null;
  /** Font changes, by family (lower case); returns a stop function. */
  subscribeFonts(listener: (families: ReadonlySet<string>) => void): () => void;
}

interface Entry {
  key: string;
  family: string;
  preset: TextPreset;
  width: number;
  height: number;
  margin: number;
  bitmap: ImageBitmap | null;
  /** Made once at least (`bitmap` null then: nothing to draw). */
  made: boolean;
  /** Its idle task's cancel, while one is queued. */
  cancel: (() => void) | null;
  /** No bitmap to show yet, or drawn with fonts that changed since: made (again) when its task runs. */
  stale: boolean;
  /** Times its task found the fonts still loading (it is made again when its family reports a change). */
  waits: number;
}

export class PresetThumbService {
  /** Most recently used last. */
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly stopFonts: () => void;
  /** Bitmaps made and font waits since the start (the acceptance checks read them). */
  readonly stats = { made: 0, waits: 0 };

  constructor(private readonly deps: PresetThumbDeps) {
    this.stopFonts = deps.subscribeFonts((families) => this.fontsChanged(families));
  }

  /** The cache key of `preset` at a size: its id, its look and the size (device px). */
  static key(preset: TextPreset, width: number, height: number, margin: number): string {
    return `${preset.id}|${presetLookKey(preset)}|${width}x${height}|${margin}`;
  }

  /** `preset`'s bitmap at `width` x `height` device px, or null (queued: listeners hear when it lands). */
  get(preset: TextPreset, width: number, height: number, margin: number): { bitmap: ImageBitmap | null } | null {
    const key = PresetThumbService.key(preset, width, height, margin);
    const known = this.entries.get(key);
    if (known) {
      this.entries.delete(key);
      this.entries.set(key, known);
      // The preset object changed but not its look (renamed, favorited): the newest one is drawn next time.
      known.preset = preset;
      return known.made ? { bitmap: known.bitmap } : null;
    }
    const entry: Entry = { key, family: preset.style.fontFamily.toLowerCase(), preset, width, height, margin, bitmap: null, made: false, cancel: null, stale: true, waits: 0 };
    this.entries.set(key, entry);
    this.queue(entry);
    this.evict();
    return null;
  }

  /** Calls `listener` after bitmaps arrive (once per idle task that made any). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get size(): number {
    return this.entries.size;
  }

  dispose(): void {
    this.stopFonts();
    for (const entry of this.entries.values()) this.drop(entry);
    this.entries.clear();
    this.listeners.clear();
  }

  private queue(entry: Entry): void {
    if (entry.cancel) return;
    entry.cancel = this.deps.idle.enqueue(() => {
      entry.cancel = null;
      if (this.entries.get(entry.key) !== entry || !entry.stale) return;
      if (!this.deps.fontsReady(entry.preset, presetSampleText(entry.preset)) && entry.waits < MAX_WAITS) {
        entry.waits += 1;
        this.stats.waits += 1;
        return;
      }
      entry.stale = false;
      const bitmap = this.deps.render(entry.preset, entry.width, entry.height, entry.margin);
      entry.bitmap?.close();
      entry.bitmap = bitmap;
      entry.made = true;
      this.stats.made += 1;
      for (const listener of [...this.listeners]) listener();
    });
  }

  private fontsChanged(families: ReadonlySet<string>): void {
    for (const entry of this.entries.values()) {
      if (!families.has(entry.family)) continue;
      entry.stale = true;
      this.queue(entry);
    }
  }

  private evict(): void {
    while (this.entries.size > MAX_THUMBNAILS) {
      const oldest = this.entries.values().next().value as Entry;
      this.entries.delete(oldest.key);
      this.drop(oldest);
    }
  }

  private drop(entry: Entry): void {
    entry.cancel?.();
    entry.cancel = null;
    entry.bitmap?.close();
    entry.bitmap = null;
  }
}
