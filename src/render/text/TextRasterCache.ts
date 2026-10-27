// Text rasters as GPU textures (spec §10.1, P11): the cache that keeps text layers from being drawn
// again unless their content, style or scale bucket changes.
// - Key = content + style + scale bucket (`textScaleBucket`: the wanted scale clamped to 0.25..4 and
//   rounded up to steps of 2^(1/8), so a wheel zoom re-rasterizes about every 9%, never blurrier than
//   asked). Two clips with the same text and style share a raster.
// - One slot per clip remembers the (content, style, bucket) objects it drew last: an unchanged clip
//   is a few identity checks (P11: editing one layer re-rasterizes only that layer).
// - A text whose fonts are still loading keeps drawing its previous raster (or nothing yet); the font
//   load redraws the preview.
// - A clip edited inline (spec §7.7) draws its selection highlight in its raster: such a raster is the
//   slot's own (never shared, destroyed when the slot draws something else).
// - Animated text (spec §10.4) has two more parts per clip, cached the same way, each with its slot:
//   the atlas of its characters, words or lines (one texture, a cell per unit) and its background
//   boxes alone. `warm` makes any part ahead of time (the preview warms the clips about to play, so
//   playback never rasterizes); a warmed part is held by a slot of its own while passes warm it.
// - Entries in use by a slot of this or the last pass are kept; the others are evicted least recently
//   used first once the byte budget is exceeded. A lost device's textures are rasterized again.
// - Stats: entries, bytes, rasterizations (total), the clips rasterized in the last pass and the time
//   it took (the acceptance check reads them).
import type { ClipId, TextContent, TextStyle } from "../../core/document/types.js";
import { applyTextCase, contentKey, styleKey } from "../../text/style.js";
import type { UvRect } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import type { AtlasUnitKind } from "./atlas.js";
import { layoutText, type Rect, type TextLayout } from "./layout.js";
import { currentMeasurer, textFallback, textLayout } from "./layoutCache.js";
import { buildTextAtlas, rasterizeText, type RasterPart, type TextAtlas, type TextHighlight, type TextRaster } from "./raster.js";

/** Raster scale limits (spec §10.1 "clamped 0.25..4"). */
export const MIN_TEXT_SCALE = 0.25;
export const MAX_TEXT_SCALE = 4;
/** Scale steps per doubling. */
const BUCKETS_PER_OCTAVE = 8;
/** Default GPU budget of text rasters. */
export const DEFAULT_TEXT_BUDGET = 128 * 1024 * 1024;

/** What an entry holds: the layer raster, its background boxes alone, or the atlas of its units. */
export type TextPart = RasterPart | AtlasUnitKind;

/** The raster scale for a wanted `scale`: clamped to 0.25..4 and rounded up to a 2^(1/8) step. */
export function textScaleBucket(scale: number): number {
  const clamped = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Number.isFinite(scale) ? scale : 1));
  const step = Math.ceil(Math.log2(clamped) * BUCKETS_PER_OCTAVE - 1e-9);
  return Math.min(MAX_TEXT_SCALE, 2 ** (step / BUCKETS_PER_OCTAVE));
}

export interface TextRasterDeps {
  /** Uploads a raster as a texture (mipmapped when drawn much smaller than rasterized). */
  upload(canvas: OffscreenCanvas, options: { mipmaps: boolean; label: string }): TextureHandle;
  /** Whether the fonts of `style` for `text` are loaded; when not, starts loading them (the owner redraws when they are). */
  fontsReady(style: TextStyle, text: string): boolean;
  /** Waits for the fonts of `style` for `text` (Export frame). */
  loadFonts(style: TextStyle, text: string): Promise<void>;
  rasterize?(layout: TextLayout, style: TextStyle, scale: number, highlight?: TextHighlight | null, part?: RasterPart): TextRaster | null;
  atlas?(layout: TextLayout, style: TextStyle, scale: number, kind: AtlasUnitKind): TextAtlas | null;
  /** The cached layout (`textLayout`). */
  layout?(content: TextContent, style: TextStyle): TextLayout;
  /**
   * A layout measured now, for a new raster: a font that just loaded may not have reached the cached
   * layouts yet (they are dropped when the browser reports the load), and a raster outlives them.
   */
  measure?(content: TextContent, style: TextStyle): TextLayout;
  budget?: number;
}

/** An atlas cell: the content px its unit covers and where it is in the texture. */
export interface ResolvedUnit {
  rect: Rect;
  crop: UvRect;
}

/** A text drawn: its texture, the part of it the raster uses, and the content px it covers. */
export interface ResolvedText {
  texture: TextureHandle;
  crop: UvRect;
  rect: Rect;
  /** Texture px per content px. */
  scale: number;
  /** An atlas's cells, in reading order (null for a raster). */
  units: readonly ResolvedUnit[] | null;
}

export interface TextRasterStats {
  /** Cached rasters and their GPU bytes. */
  rasters: number;
  bytes: number;
  /** Rasterizations since the start. */
  rasterizations: number;
  /** Clips rasterized in the last pass, and that pass's raster time (ms). */
  lastRasterized: ClipId[];
  lastMs: number;
  /** Text layers of the last pass, and those waiting for a font. */
  layers: number;
  waiting: number;
}

interface Entry extends ResolvedText {
  key: string;
  family: string;
  bytes: number;
  /** Slots drawing it. */
  refs: number;
  lastPass: number;
  /** A highlighted raster: its slot's own, not in the cache. */
  own: boolean;
}

interface Slot {
  text: TextContent;
  style: TextStyle;
  highlight: TextHighlight | null;
  bucket: number;
  entry: Entry | null;
  pass: number;
}

export class TextRasterCache {
  private readonly entries = new Map<string, Entry>();
  /** By clip (its raster), or by purpose, part and clip (`${purpose}${part}|${clipId}`). */
  private readonly slots = new Map<string, Slot>();
  private pass = 0;
  private bytes = 0;
  private budget: number;
  readonly stats: TextRasterStats = { rasters: 0, bytes: 0, rasterizations: 0, lastRasterized: [], lastMs: 0, layers: 0, waiting: 0 };

  constructor(private readonly deps: TextRasterDeps) {
    this.budget = deps.budget ?? DEFAULT_TEXT_BUDGET;
  }

  /** Starts a pass (a preview render). */
  begin(): void {
    this.pass += 1;
    this.stats.lastRasterized.length = 0;
    this.stats.lastMs = 0;
    this.stats.layers = 0;
    this.stats.waiting = 0;
  }

  /**
   * The raster of clip `clipId` showing `text` in `style` at `scale` px per content px (bucketed), with
   * the selection `highlight` while it is edited inline, or null when it draws nothing (empty) or
   * nothing yet (its fonts are loading).
   */
  resolve(clipId: ClipId, text: TextContent, style: TextStyle, scale: number, highlight: TextHighlight | null = null): ResolvedText | null {
    this.stats.layers += 1;
    return this.part(clipId, "all", "", text, style, scale, highlight).entry;
  }

  /** The atlas of clip `clipId`'s characters, words or lines (an animated text, spec §10.4), as `resolve` gives its raster. */
  resolveAtlas(clipId: ClipId, text: TextContent, style: TextStyle, scale: number, kind: AtlasUnitKind): ResolvedText | null {
    this.stats.layers += 1;
    return this.part(clipId, kind, "", text, style, scale, null).entry;
  }

  /** The background boxes alone of clip `clipId` (drawn under its animated units); null without any. */
  resolveBackground(clipId: ClipId, text: TextContent, style: TextStyle, scale: number): ResolvedText | null {
    return this.part(clipId, "backgrounds", "", text, style, scale, null).entry;
  }

  /**
   * Makes `part` of clip `clipId` ahead of time, as a resolve of that part would (a slot of its own
   * keeps it while passes warm it). True when it rasterized something now.
   */
  warm(clipId: ClipId, part: TextPart, text: TextContent, style: TextStyle, scale: number): boolean {
    return this.part(clipId, part, "warm:", text, style, scale, null).rasterized;
  }

  /** Ends a pass: forgets the slots of clips not drawn in it, then keeps the cache within its budget. */
  end(): void {
    for (const [key, slot] of this.slots) {
      if (slot.pass === this.pass) continue;
      if (slot.entry) this.release(slot.entry);
      this.slots.delete(key);
    }
    this.evict();
    this.stats.rasters = this.entries.size;
    this.stats.bytes = this.bytes;
  }

  /**
   * `part` of `text` at exactly `scale` (no bucket) after its fonts loaded, apart from the cache
   * (Export frame); `release` destroys it. Null when nothing is drawn.
   */
  async exact(text: TextContent, style: TextStyle, scale: number, part: TextPart = "all"): Promise<(ResolvedText & { release: () => void }) | null> {
    await this.deps.loadFonts(style, applyTextCase(text.value, style.textCase));
    const layout = this.fresh(text, style);
    if (!layout.raster) return null;
    const entry = this.rasterize("", part, layout, style, Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale)), false, null);
    if (!entry) return null;
    return { texture: entry.texture, crop: entry.crop, rect: entry.rect, scale: entry.scale, units: entry.units, release: () => entry.texture.destroy() };
  }

  /** Drops the rasters of `family` (all when absent; any case): its fonts changed. */
  dropFamily(family?: string): void {
    const name = family?.toLowerCase();
    const dropped = (entry: Entry) => name === undefined || entry.family.toLowerCase() === name;
    for (const entry of [...this.entries.values()]) if (dropped(entry)) this.remove(entry);
    for (const slot of this.slots.values()) {
      const entry = slot.entry;
      if (!entry || (entry.own ? !dropped(entry) : this.entries.has(entry.key))) continue;
      if (entry.own) entry.texture.destroy();
      slot.entry = null;
      // Drawn again when next asked for.
      slot.bucket = Number.NaN;
    }
    this.stats.rasters = this.entries.size;
    this.stats.bytes = this.bytes;
  }

  /** Drops everything (project closed, device lost). */
  clear(): void {
    for (const slot of this.slots.values()) if (slot.entry?.own) slot.entry.texture.destroy();
    this.slots.clear();
    for (const entry of [...this.entries.values()]) this.remove(entry);
    this.stats.rasters = 0;
    this.stats.bytes = 0;
  }

  setBudget(bytes: number): void {
    this.budget = bytes;
    this.evict();
  }

  /** `part` of a clip for this pass: the slot's entry when nothing changed, else the cached or a new one. */
  private part(clipId: ClipId, part: TextPart, purpose: string, text: TextContent, style: TextStyle, scale: number, highlight: TextHighlight | null): { entry: Entry | null; rasterized: boolean } {
    const bucket = textScaleBucket(scale);
    // A clip's own raster is keyed by the clip alone (no string built per layer and frame).
    const slotKey = purpose === "" && part === "all" ? clipId : `${purpose}${part}|${clipId}`;
    const slot = this.slots.get(slotKey);
    if (slot) slot.pass = this.pass;
    const held = slot?.entry && slot.entry.texture.valid ? slot.entry : null;
    if (slot && slot.text === text && slot.style === style && slot.highlight === highlight && slot.bucket === bucket && (held || slot.entry === null)) {
      if (held) held.lastPass = this.pass;
      return { entry: held, rasterized: false };
    }
    const layout = (this.deps.layout ?? textLayout)(text, style);
    if (!layout.raster) {
      this.setSlot(slotKey, text, style, highlight, bucket, null);
      return { entry: null, rasterized: false };
    }
    const mipmaps = bucket > scale * 1.5;
    // A highlighted raster is never shared: no key.
    const key = highlight ? "" : `${contentKey(text)}|${styleKey(style)}|${bucket}${mipmaps ? "m" : ""}${part === "all" ? "" : `|${part}`}`;
    let entry = key === "" ? undefined : this.entries.get(key);
    if (entry && !entry.texture.valid) {
      this.remove(entry);
      entry = undefined;
    }
    let rasterized = false;
    if (!entry) {
      if (!this.deps.fontsReady(style, applyTextCase(text.value, style.textCase))) {
        this.stats.waiting += 1;
        // Keep showing what this clip showed (its fonts are loading); the load redraws.
        if (held) held.lastPass = this.pass;
        return { entry: held, rasterized: false };
      }
      const started = performance.now();
      entry = this.rasterize(key, part, this.fresh(text, style), style, bucket, mipmaps, highlight) ?? undefined;
      this.stats.lastMs += performance.now() - started;
      if (!entry) {
        this.setSlot(slotKey, text, style, highlight, bucket, null);
        return { entry: null, rasterized: false };
      }
      rasterized = true;
      this.stats.rasterizations += 1;
      this.stats.lastRasterized.push(clipId);
    }
    entry.lastPass = this.pass;
    this.setSlot(slotKey, text, style, highlight, bucket, entry);
    return { entry, rasterized };
  }

  private fresh(text: TextContent, style: TextStyle): TextLayout {
    if (this.deps.measure) return this.deps.measure(text, style);
    if (this.deps.layout) return this.deps.layout(text, style);
    return layoutText(text, style, currentMeasurer(), textFallback());
  }

  private rasterize(key: string, part: TextPart, layout: TextLayout, style: TextStyle, scale: number, mipmaps: boolean, highlight: TextHighlight | null): Entry | null {
    let made: Omit<Entry, "key" | "family" | "bytes" | "refs" | "lastPass" | "own"> | null = null;
    if (part === "all" || part === "backgrounds") {
      const raster = (this.deps.rasterize ?? rasterizeText)(layout, style, scale, highlight, part);
      if (!raster) return null;
      const texture = this.deps.upload(raster.canvas, { mipmaps, label: "text" });
      const crop = { u0: 0, v0: 0, u1: Math.min(1, (raster.rect.width * raster.scale) / texture.width), v1: Math.min(1, (raster.rect.height * raster.scale) / texture.height) };
      made = { texture, crop, rect: raster.rect, scale: raster.scale, units: null };
    } else {
      const atlas = (this.deps.atlas ?? buildTextAtlas)(layout, style, scale, part);
      if (!atlas) return null;
      const texture = this.deps.upload(atlas.canvas, { mipmaps, label: "text atlas" });
      const w = texture.width;
      const h = texture.height;
      const units = atlas.units.map((unit) => ({ rect: unit.rect, crop: { u0: unit.cell.x / w, v0: unit.cell.y / h, u1: (unit.cell.x + unit.cell.width) / w, v1: (unit.cell.y + unit.cell.height) / h } }));
      made = { texture, crop: { u0: 0, v0: 0, u1: Math.min(1, atlas.width / w), v1: Math.min(1, atlas.height / h) }, rect: layout.raster ?? { x: 0, y: 0, width: 0, height: 0 }, scale: atlas.scale, units };
    }
    const entry: Entry = { ...made, key, family: style.fontFamily, bytes: made.texture.bytes, refs: 0, lastPass: this.pass, own: highlight !== null };
    if (key !== "") {
      this.entries.set(key, entry);
      this.bytes += entry.bytes;
    }
    return entry;
  }

  private setSlot(slotKey: string, text: TextContent, style: TextStyle, highlight: TextHighlight | null, bucket: number, entry: Entry | null): void {
    let slot = this.slots.get(slotKey);
    if (!slot) {
      slot = { text, style, highlight, bucket, entry: null, pass: this.pass };
      this.slots.set(slotKey, slot);
    }
    if (slot.entry !== entry) {
      if (slot.entry) this.release(slot.entry);
      if (entry) entry.refs += 1;
    }
    slot.text = text;
    slot.style = style;
    slot.highlight = highlight;
    slot.bucket = bucket;
    slot.entry = entry;
    slot.pass = this.pass;
  }

  /** A slot stops drawing `entry`: one ref less; a highlighted raster goes. */
  private release(entry: Entry): void {
    entry.refs -= 1;
    if (entry.own) entry.texture.destroy();
  }

  private remove(entry: Entry): void {
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
      this.bytes -= entry.bytes;
    }
    entry.texture.destroy();
  }

  /** Least recently used first, never what this or the last pass drew. */
  private evict(): void {
    if (this.bytes <= this.budget) return;
    const candidates = [...this.entries.values()].filter((entry) => entry.refs <= 0 && entry.lastPass < this.pass - 1).sort((a, b) => a.lastPass - b.lastPass);
    for (const entry of candidates) {
      if (this.bytes <= this.budget) break;
      this.remove(entry);
    }
  }
}
