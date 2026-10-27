// Media layers to pool textures for the preview (spec §9.3, §9.4, P6, P8). One slot per video track
// remembers what that track drew last:
// - The frame a layer wants is its media time snapped to the nearest frame time (§5.1); media time 0
//   is the first frame. A pool hit draws at once.
// - Otherwise the frame is requested: scrub priority while the ruler is dragged, idle otherwise. Only
//   the first layer of a media gets the scrub request in a pass, so two layers of one media do not
//   supersede each other. The stand-in the frame service offers (the nearest cached frame, then a
//   closer keyframe) is drawn meanwhile with the layer's own geometry.
// - While playing (`playback` priority) nothing is requested and no stand-in is used: the playback
//   engine's windows bring the frames, and a frame not decoded yet holds the track's previous layer
//   (no stand-in churn back and forth in time).
// - With nothing of that media ready, the slot draws its last layer as it was (texture, matrix, crop,
//   opacity): a cut never flashes black while the new clip's frame decodes.
// - A request that settles on another frame (the decoder could not produce it) is drawn, but not
//   taken for the wanted frame: it is asked again once the layer wants another frame.
// - What is drawn stays pinned in the pool. Late frames call `onChange` (the view redraws).
// - `warm` prefetches the edge frames of the clips next to the playhead, so a scrub across a cut
//   finds the new clip's frame cached.
// - Detail on zoom (spec §7.1): at rest (`idle` priority) a pass can name the long edge frames should
//   have (`detailLongEdge`). A cached frame well under it (and under the video's own size) is drawn
//   at once and decoded again once at that size; the bigger texture replaces it in the pool.
// - `resolveSplit` resolves two composites in one pass (the trim preview's two frames side by side,
//   spec §6.10), each pane with its own slots and draw list. The scrub rule spans both: a media shown
//   in both panes gets one scrub request, so the two never supersede each other.
// - Proxies (spec §9.5): each media's frames come from the lod `wantedLod` asks for, routed by the
//   frame service (the proxy only when the media has one ready). The other lod's frame at the same
//   time stands in when it is cached: a proxy frame shows while the full one decodes (Auto after a
//   pause or a scrub), and a cached full frame at least as big as the proxy is drawn as exact where
//   the proxy is wanted (a smaller one, e.g. from a 1/4 playback, only stands in). Detail refreshes
//   are for full frames only. `resolveExact` resolves a composite to exact full frames at their own
//   size (Export frame at full resolution, whatever the quality mode).
// - Text layers (spec §10.1, P11) come from the text raster cache at the pass's render scale times the
//   layer's own scale, drawn over the raster's rect; Export frame gets its own raster at project size.
// - Animated text (spec §10.4): a whole-text animation moves (scales, fades, blurs) the layer raster;
//   a per-unit one draws the background boxes, then one quad per atlas cell with its unit's state (a
//   line reveal crops its line to its place, a typewriter cuts a line at its last typed character).
//   The text clips about to show (`upcoming`) are rasterized ahead, all at once while idle and one per
//   pass otherwise, so playing into an animation rasterizes nothing.
// - A cue's word highlight (spec §10.5): the background boxes, then each word from the cue's word atlas
//   (the inactive look) but the active one, then the highlight box (a solid quad, background mode) and
//   the active word from the atlas in the highlight look, grown about its middle (scale modes).
// The draw lists, the slot structs and their keys are reused between passes: a pass allocates nothing
// unless it requests or pins a new frame (or rasterizes a text).
import type { MediaId, TrackId } from "../../core/document/types.js";
import { imageKey, type Lod, type TextureKey, type TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameResult, FrameService } from "../../media/decode/FrameService.js";
import type { ImageService } from "../../media/decode/ImageService.js";
import { mediaTimePosition } from "../../media/demux/sampleIndex.js";
import { isAbortError, type FramePriority } from "../../media/workers/protocol.js";
import { newUnitState, type UnitState } from "../../text/anim.js";
import type { NeighborFrame, UpcomingText } from "../compositor/Compositor.js";
import { HIGHLIGHT_SLOT, type CaptionHighlightFrame, type Composite, type DrawList, type Layer, type MediaLayer, type SolidLayer, type TextAnimFrame, type TextCompositeLayer, type TextureLayer, type UvRect } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { multiplyInto, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import type { Rect } from "../text/layout.js";
import type { ResolvedText, ResolvedUnit, TextRasterCache } from "../text/TextRasterCache.js";
import { exportLongEdge, layerDetail } from "./detail.js";

export interface LayerTexturesDeps {
  frames: Pick<FrameService, "info" | "video" | "getFrame" | "prefetch" | "lodFor">;
  images: Pick<ImageService, "get" | "load">;
  pool: Pick<TexturePool, "get" | "has" | "pin">;
  /** A frame arrived after the pass that wanted it: draw again. */
  onChange(): void;
  /** The lod this pass asks a media's frames for (the quality mode's rule); full when absent. */
  wantedLod?(mediaId: MediaId): Lod;
  /** Text rasters (spec §10.1); text layers draw nothing without it. */
  text?: Pick<TextRasterCache, "begin" | "end" | "resolve" | "exact" | "resolveAtlas" | "resolveBackground" | "warm">;
}

export interface LayerTexturesStats {
  /** Media layers of the last pass, and those drawn with their exact frame. */
  layers: number;
  exact: number;
  /** Drawn with a stand-in of the same media (P8). */
  standIns: number;
  /** Showing the track's previous layer while the new one loads. */
  held: number;
  /** Not drawn: nothing ready and nothing shown before. */
  missing: number;
  /** Frame requests in flight, and neighbour frames being warmed. */
  pending: number;
  warming: number;
  /** Media this browser cannot show (unsupported codec, missing file). */
  failed: number;
  /** Media layers drawn with a proxy frame. */
  proxy: number;
  /** Text layers drawn. */
  texts: number;
}

type WritableTextureLayer = Omit<TextureLayer, "transform"> & { transform: MutableMat3 };

interface Pending {
  key: TextureKey;
  controller: AbortController;
  /** A detail refresh of a frame already drawn from the pool. */
  refresh: boolean;
}

/** A cached frame is decoded again for detail when its long edge is under this share of the wanted one (coded sizes pad, e.g. 1088 for 1080). */
const DETAIL_TOLERANCE = 0.9;

interface Slot {
  pending: Pending | null;
  /** The best stand-in for the pending (or settled) frame. */
  standIn: FrameResult | null;
  /** A frame whose request settled on another frame: not asked again while it is wanted. */
  settled: boolean;
  settledKey: TextureKey;
  /** The layer drawn last; `texture` is null before the first draw. */
  shown: WritableTextureLayer;
  hasShown: boolean;
  /** The key pinned for what is drawn; meaningful while `unpin` is set. */
  pinnedKey: TextureKey;
  /** The last detail refresh: its key and the long edge it asked for (each is asked once). */
  refreshKey: TextureKey;
  refreshedTo: number;
  unpin: (() => void) | null;
  pass: number;
}

const keyId = (key: TextureKey) => `${key.mediaId}|${key.lod}|${key.timeUs}`;
const otherLod = (lod: Lod): Lod => (lod === "full" ? "proxy" : "full");
const sameKey = (a: TextureKey, b: TextureKey) => a.timeUs === b.timeUs && a.mediaId === b.mediaId && a.lod === b.lod;
const newKey = (): TextureKey => ({ mediaId: "", lod: "full", timeUs: 0 });

function copyKey(out: TextureKey, key: TextureKey): TextureKey {
  out.mediaId = key.mediaId;
  out.lod = key.lod;
  out.timeUs = key.timeUs;
  return out;
}

type WritableList = DrawList & { layers: Layer[] };

const newList = (): WritableList => ({ width: 0, height: 0, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [] });

export class LayerTextures {
  /** Per pane (0: the preview, 1: the right half of a split), one slot per video track. */
  private readonly slots: [Map<TrackId, Slot>, Map<TrackId, Slot>] = [new Map(), new Map()];
  private readonly lists: [WritableList, WritableList] = [newList(), newList()];
  /** Per pane, the text layers of a pass (reused in order). */
  private readonly textLayers: [WritableTextureLayer[], WritableTextureLayer[]] = [[], []];
  private textCount = 0;
  /** Per pane, the highlight boxes of a pass (reused in order). */
  private readonly boxLayers: [WritableSolidLayer[], WritableSolidLayer[]] = [[], []];
  private boxCount = 0;
  /** The active word's move (a scale highlight). */
  private readonly highlightState = newUnitState();
  /** Device px per project px of this pass (text rasters follow it). */
  private textScale = 1;
  private readonly scrubbed = new Set<MediaId>();
  private readonly active = new Set<MediaId>();
  /** Videos opening, as `mediaId|lod`. */
  private readonly opening = new Set<string>();
  private readonly loadingImages = new Set<MediaId>();
  private readonly warming = new Set<string>();
  private readonly failed = new Set<MediaId>();
  private pass = 0;
  private resolving = false;
  /** Scratch keys of the frame a layer wants and of the other lod's frame at that time (copied when kept). */
  private readonly wanted = newKey();
  private readonly alternate = newKey();
  readonly stats: LayerTexturesStats = { layers: 0, exact: 0, standIns: 0, held: 0, missing: 0, pending: 0, warming: 0, failed: 0, proxy: 0, texts: 0 };

  constructor(private readonly deps: LayerTexturesDeps) {}

  /** Long edge video frames should have in this pass (idle only; 0: no detail refresh). */
  private detailLongEdge = 0;

  /**
   * The draw list for `composite` with every media layer resolved to a texture (or held, or left out).
   * `detailLongEdge`: at `idle`, cached frames well under it are decoded again (detail on zoom).
   * `renderScale`: device px per project px of the render (text rasters follow it). `upcoming`: text
   * clips about to show, rasterized ahead.
   */
  resolve(composite: Composite, priority: FramePriority, detailLongEdge = 0, renderScale = 1, upcoming: readonly UpcomingText[] = []): DrawList {
    this.begin(priority, detailLongEdge, renderScale);
    try {
      this.resolveInto(0, composite, priority);
      this.warmTexts(upcoming, priority === "idle" ? Infinity : 1);
    } finally {
      this.end();
    }
    return this.lists[0];
  }

  /**
   * Two composites resolved in one pass, into two draw lists (the left and right panes of a split
   * preview). Reused like `resolve`'s list: read both before resolving again.
   */
  resolveSplit(left: Composite, right: Composite, priority: FramePriority, detailLongEdge = 0, renderScale = 1): readonly [DrawList, DrawList] {
    this.begin(priority, detailLongEdge, renderScale);
    try {
      this.resolveInto(0, left, priority);
      this.resolveInto(1, right, priority);
    } finally {
      this.end();
    }
    return this.lists;
  }

  private begin(priority: FramePriority, detailLongEdge: number, renderScale: number): void {
    this.pass += 1;
    this.detailLongEdge = priority === "idle" ? detailLongEdge : 0;
    this.textScale = renderScale;
    this.deps.text?.begin();
    this.scrubbed.clear();
    this.active.clear();
    const stats = this.stats;
    stats.layers = 0;
    stats.exact = 0;
    stats.standIns = 0;
    stats.held = 0;
    stats.missing = 0;
    stats.proxy = 0;
    stats.texts = 0;
    this.resolving = true;
  }

  private resolveInto(pane: 0 | 1, composite: Composite, priority: FramePriority): void {
    const list = this.lists[pane];
    list.width = composite.width;
    list.height = composite.height;
    list.background = composite.background;
    list.layers.length = 0;
    this.textCount = 0;
    this.boxCount = 0;
    const stats = this.stats;
    for (const layer of composite.layers) {
      if (layer.kind === "solid") {
        list.layers.push(layer);
        continue;
      }
      if (layer.kind === "text") {
        if (this.resolveText(pane, list.layers, layer)) stats.texts += 1;
        continue;
      }
      stats.layers += 1;
      this.active.add(layer.mediaId);
      const slot = this.slot(pane, layer.trackId);
      const drawn = this.resolveMedia(slot, layer, priority);
      if (drawn) {
        list.layers.push(drawn);
        if (slot.pinnedKey.lod === "proxy" && !layer.still) stats.proxy += 1;
      } else stats.missing += 1;
    }
  }

  /** Draws text `layer` into `layers` (its raster, or its animated units). False when it drew nothing. */
  private resolveText(pane: 0 | 1, layers: Layer[], layer: TextCompositeLayer): boolean {
    const text = this.deps.text;
    if (!text) return false;
    const scale = this.textScale * layer.scale;
    if (layer.karaoke) return this.resolveKaraoke(pane, layers, layer, layer.karaoke, scale);
    const anim = layer.anim;
    if (!anim || anim.atlas === "block") {
      const resolved = text.resolve(layer.clipId, layer.text, layer.style, scale, layer.highlight);
      if (!resolved) return false;
      const state = anim?.units[0] ?? null;
      const opacity = layer.opacity * (state?.opacity ?? 1);
      if (opacity > 0) this.pushText(pane, layers, layer.model, resolved, resolved.crop, resolved.rect, state, opacity);
      return true;
    }
    if (anim.background > 0 && layer.style.background.enabled) {
      const boxes = text.resolveBackground(layer.clipId, layer.text, layer.style, scale);
      if (boxes) this.pushText(pane, layers, layer.model, boxes, boxes.crop, boxes.rect, null, layer.opacity * anim.background);
    }
    const atlas = text.resolveAtlas(layer.clipId, layer.text, layer.style, scale, anim.atlas);
    const cells = atlas?.units;
    if (!atlas || !cells) return false;
    const count = Math.min(cells.length, anim.units.length);
    for (let i = 0; i < count; i++) {
      const state = anim.units[i] as UnitState;
      const cell = cells[i] as ResolvedUnit;
      if (state.opacity > 0) this.pushText(pane, layers, layer.model, atlas, cell.crop, cell.rect, state, layer.opacity * state.opacity);
    }
    return true;
  }

  /** Draws a cue with its active word highlighted (spec §10.5). False when it drew nothing. */
  private resolveKaraoke(pane: 0 | 1, layers: Layer[], layer: TextCompositeLayer, karaoke: CaptionHighlightFrame, scale: number): boolean {
    const text = this.deps.text;
    if (!text) return false;
    if (layer.style.background.enabled) {
      const boxes = text.resolveBackground(layer.clipId, layer.text, layer.style, scale);
      if (boxes) this.pushText(pane, layers, layer.model, boxes, boxes.crop, boxes.rect, null, layer.opacity);
    }
    const atlas = text.resolveAtlas(layer.clipId, layer.text, layer.style, scale, "word");
    const active = text.resolveAtlas(layer.clipId + HIGHLIGHT_SLOT, layer.text, karaoke.style, scale, "word");
    const cells = atlas?.units;
    if (!atlas || !cells) return false;
    for (let i = 0; i < cells.length; i++) {
      // The active word comes from the highlight atlas (or, while it is being made, this one).
      if (i >= karaoke.from && i < karaoke.to && active?.units) continue;
      const cell = cells[i] as ResolvedUnit;
      this.pushText(pane, layers, layer.model, atlas, cell.crop, cell.rect, null, layer.opacity);
    }
    const hot = active?.units;
    if (!active || !hot) return true;
    if (karaoke.box) this.pushBox(pane, layers, layer.model, karaoke.box.rect, karaoke.box.color, layer.opacity);
    const state = highlightMove(this.highlightState, karaoke);
    for (let i = karaoke.from; i < Math.min(karaoke.to, hot.length); i++) {
      const cell = hot[i] as ResolvedUnit;
      this.pushText(pane, layers, layer.model, active, cell.crop, cell.rect, state, layer.opacity);
    }
    return true;
  }

  /** Adds a pooled solid layer filling `rect` (content px of `model`) with `color`. */
  private pushBox(pane: 0 | 1, layers: Layer[], model: Mat3, rect: Rect, color: SolidLayer["color"], opacity: number): void {
    const out = (this.boxLayers[pane][this.boxCount] ??= newSolidLayer());
    this.boxCount += 1;
    multiplyInto(out.transform, model, setMat(out.transform, rect.width, 0, 0, rect.height, rect.x, rect.y));
    out.color = color;
    out.opacity = opacity;
    layers.push(out);
  }

  /** Adds a pooled texture layer drawing `crop` of `resolved` over `rect`, moved by `state` (`writeTextQuad`). */
  private pushText(pane: 0 | 1, layers: Layer[], model: Mat3, resolved: Pick<ResolvedText, "texture" | "scale">, crop: UvRect, rect: Rect, state: UnitState | null, opacity: number): void {
    const out = (this.textLayers[pane][this.textCount] ??= newTextureLayer());
    if (!writeTextQuad(out, model, resolved.texture, crop, rect, resolved.scale, state, opacity)) return;
    this.textCount += 1;
    layers.push(out);
  }

  /** Rasterizes the parts of `upcoming` texts not cached yet, at most `limit` of them; asks for another pass when some are left. */
  private warmTexts(upcoming: readonly UpcomingText[], limit: number): void {
    const text = this.deps.text;
    if (!text || upcoming.length === 0) return;
    let made = 0;
    for (const item of upcoming) {
      for (const part of item.parts) {
        if (made >= limit) {
          this.deps.onChange();
          return;
        }
        if (text.warm(item.clipId, part, item.text, item.style, this.textScale * item.scale)) made += 1;
      }
    }
  }

  /** Releases the slots this pass did not use (a pane not resolved loses them all) and counts what is pending. */
  private end(): void {
    this.resolving = false;
    this.deps.text?.end();
    const stats = this.stats;
    stats.pending = 0;
    for (const slots of this.slots) {
      for (const [trackId, slot] of slots) {
        if (slot.pass === this.pass) {
          if (slot.pending) stats.pending += 1;
          continue;
        }
        this.release(slot);
        slots.delete(trackId);
      }
    }
    stats.warming = this.warming.size;
    stats.failed = this.failed.size;
  }

  /** Prefetches the neighbour frames that are not cached yet (media drawn by a layer are left alone). */
  warm(neighbors: readonly NeighborFrame[]): void {
    for (const neighbor of neighbors) {
      const { mediaId } = neighbor;
      if (this.failed.has(mediaId) || this.active.has(mediaId)) continue;
      if (neighbor.still) {
        if (!this.deps.images.get(mediaId)) this.loadImage(mediaId);
        continue;
      }
      const lod = this.lodOf(mediaId);
      const key = this.videoKey(mediaId, neighbor.timeUs, lod);
      if (!key || this.deps.pool.has(key)) continue;
      const id = keyId(key);
      if (this.warming.has(id)) continue;
      this.warming.add(id);
      const timeUs = key.timeUs;
      this.deps.frames
        .prefetch(mediaId, timeUs, timeUs, { lod })
        .catch(() => undefined)
        .finally(() => {
          this.warming.delete(id);
          this.stats.warming = this.warming.size;
        });
    }
    this.stats.warming = this.warming.size;
  }

  /** A media left the project or came back: forget that it failed. */
  forget(mediaId: MediaId): void {
    this.failed.delete(mediaId);
  }

  /** Drops every slot, request and pin (project closed). */
  clear(): void {
    for (const slots of this.slots) {
      for (const slot of slots.values()) this.release(slot);
      slots.clear();
    }
    this.failed.clear();
    this.opening.clear();
    this.loadingImages.clear();
    for (const list of this.lists) list.layers.length = 0;
  }

  /** The last resolved draw list (of a split, the left one). */
  get current(): DrawList {
    return this.lists[0];
  }

  /**
   * `composite` with every media layer at its exact full-resolution frame, uploaded at the video's own
   * size, or twice its size on the frame when drawn smaller (`exportLongEdge`, at most `maxLongEdge`):
   * Export frame, whatever the quality mode and whatever the pool holds (spec §9.5). Waits for the
   * frames; `release` lets go of their pins. Media that cannot be shown are left out.
   */
  async resolveExact(composite: Composite, maxLongEdge: number): Promise<{ list: DrawList; release: () => void }> {
    const unpins: (() => void)[] = [];
    const release = () => {
      for (const unpin of unpins.splice(0)) unpin();
    };
    const layers: Layer[] = [];
    try {
      for (const layer of composite.layers) {
        if (layer.kind === "solid") {
          layers.push(layer);
          continue;
        }
        if (layer.kind === "text") {
          await this.exactText(layer, layers, unpins);
          continue;
        }
        const { mediaId } = layer;
        let key: TextureKey;
        let texture: TextureHandle | null;
        if (layer.still) {
          key = imageKey(mediaId);
          texture = this.deps.images.get(mediaId) ?? (await this.deps.images.load(mediaId).catch(() => null));
        } else {
          const info = this.deps.frames.info(mediaId) ?? (await this.deps.frames.video(mediaId).catch(() => null));
          if (!info?.decodable || info.frameTimesUs.length === 0) continue;
          const timeUs = info.frameTimesUs[mediaTimePosition(info.frameTimesUs, layer.timeUs)] as number;
          const longEdge = exportLongEdge(Math.max(info.codedWidth, info.codedHeight), layerDetail(layer, info.codedWidth, info.codedHeight), maxLongEdge);
          const result = await this.deps.frames.getFrame(mediaId, timeUs, { lod: "full", priority: "playback", minLongEdge: Math.floor(longEdge * DETAIL_TOLERANCE), uploadAtLeast: longEdge });
          key = result.key;
          texture = result.texture;
        }
        if (!texture?.valid) continue;
        unpins.push(this.deps.pool.pin(key));
        layers.push({ kind: "texture", texture, transform: layer.transform, opacity: layer.opacity, crop: layer.crop, flipX: false, flipY: false });
      }
    } catch (error) {
      release();
      throw error;
    }
    return { list: { width: composite.width, height: composite.height, background: composite.background, layers }, release };
  }

  /** Text `layer` at its exact scale (Export frame), animated as the preview draws it. */
  private async exactText(layer: TextCompositeLayer, layers: Layer[], unpins: (() => void)[]): Promise<void> {
    const text = this.deps.text;
    if (!text) return;
    // Copied before waiting: the composite's layers are reused by the next evaluation.
    const model = [...layer.model] as unknown as Mat3;
    const { opacity, style, scale } = layer;
    const content = layer.text;
    const anim: TextAnimFrame | null = layer.anim && { atlas: layer.anim.atlas, background: layer.anim.background, units: layer.anim.units.map((unit) => ({ ...unit })) };
    const push = (resolved: ResolvedText, crop: UvRect, rect: Rect, state: UnitState | null, alpha: number) => {
      const out = newTextureLayer();
      if (writeTextQuad(out, model, resolved.texture, crop, rect, resolved.scale, state, alpha)) layers.push(out);
    };
    if (layer.karaoke) {
      const karaoke = { ...layer.karaoke, box: layer.karaoke.box && { rect: { ...layer.karaoke.box.rect }, color: { ...layer.karaoke.box.color } } };
      if (style.background.enabled) {
        const boxes = await text.exact(content, style, scale, "backgrounds");
        if (boxes) {
          unpins.push(boxes.release);
          push(boxes, boxes.crop, boxes.rect, null, opacity);
        }
      }
      const atlas = await text.exact(content, style, scale, "word");
      const active = await text.exact(content, karaoke.style, scale, "word");
      for (const part of [atlas, active]) if (part) unpins.push(part.release);
      if (!atlas?.units || !active?.units) return;
      atlas.units.forEach((cell, i) => {
        if (i < karaoke.from || i >= karaoke.to) push(atlas, cell.crop, cell.rect, null, opacity);
      });
      if (karaoke.box) {
        const box = newSolidLayer();
        multiplyInto(box.transform, model, setMat(box.transform, karaoke.box.rect.width, 0, 0, karaoke.box.rect.height, karaoke.box.rect.x, karaoke.box.rect.y));
        box.color = karaoke.box.color;
        box.opacity = opacity;
        layers.push(box);
      }
      const state = highlightMove(newUnitState(), karaoke);
      active.units.slice(karaoke.from, karaoke.to).forEach((cell) => push(active, cell.crop, cell.rect, state, opacity));
      return;
    }
    if (!anim || anim.atlas === "block") {
      const exact = await text.exact(content, style, scale);
      if (!exact) return;
      unpins.push(exact.release);
      const state = anim?.units[0] ?? null;
      const alpha = opacity * (state?.opacity ?? 1);
      if (alpha > 0) push(exact, exact.crop, exact.rect, state, alpha);
      return;
    }
    if (anim.background > 0 && style.background.enabled) {
      const boxes = await text.exact(content, style, scale, "backgrounds");
      if (boxes) {
        unpins.push(boxes.release);
        push(boxes, boxes.crop, boxes.rect, null, opacity * anim.background);
      }
    }
    const atlas = await text.exact(content, style, scale, anim.atlas);
    if (!atlas?.units) return;
    unpins.push(atlas.release);
    const cells = atlas.units;
    const count = Math.min(cells.length, anim.units.length);
    for (let i = 0; i < count; i++) {
      const state = anim.units[i] as UnitState;
      const cell = cells[i] as ResolvedUnit;
      if (state.opacity > 0) push(atlas, cell.crop, cell.rect, state, opacity * state.opacity);
    }
  }

  /** The lod a media's frames come from in this pass. */
  private lodOf(mediaId: MediaId): Lod {
    const wanted = this.deps.wantedLod?.(mediaId) ?? "full";
    return wanted === "full" ? "full" : this.deps.frames.lodFor(mediaId, wanted);
  }

  private resolveMedia(slot: Slot, layer: MediaLayer, priority: FramePriority): TextureLayer | null {
    const { mediaId } = layer;
    // Never ready: holding the track's previous layer would show stale content for good.
    if (this.failed.has(mediaId)) return null;
    let key: TextureKey | null;
    let texture: TextureHandle | null;
    /** The other lod's frame at the same time, when it is cached. */
    let other: TextureHandle | null = null;
    const lod = layer.still ? "full" : this.lodOf(mediaId);
    if (layer.still) {
      key = imageKey(mediaId);
      texture = this.deps.images.get(mediaId);
      if (!texture) this.loadImage(mediaId);
    } else {
      key = this.videoKey(mediaId, layer.timeUs, lod);
      texture = key ? this.deps.pool.get(key) : null;
      if (!texture) {
        const alternate = this.alternateKey(mediaId, layer.timeUs, otherLod(lod));
        other = alternate ? this.deps.pool.get(alternate) : null;
        // A cached full frame where the proxy is wanted: as good or better, and nothing to decode.
        if (other && lod === "proxy" && Math.max(other.width, other.height) >= this.proxyLongEdge(mediaId)) {
          key = alternate;
          texture = other;
          other = null;
        }
      }
    }
    if (texture && key) {
      if (!layer.still && key.lod === "full" && lod === "full" && this.wantsDetail(slot, texture, mediaId, key)) {
        // The exact frame at less detail: shown while it is decoded again at the wanted size.
        copyKey(slot.refreshKey, key);
        slot.refreshedTo = this.detailLongEdge;
        this.request(slot, key, priority, this.minLongEdge(mediaId));
      } else if (!(slot.pending?.refresh && sameKey(slot.pending.key, key))) {
        this.cancel(slot);
      }
      slot.standIn = null;
      slot.settled = false;
      this.stats.exact += 1;
      return this.show(slot, layer, texture, key);
    }
    if (priority === "playback") {
      // The engine's windows bring the frame: hold the track's previous layer meanwhile.
      if (slot.pending && !(key && sameKey(slot.pending.key, key))) this.cancel(slot);
      slot.standIn = null;
    } else if (key && !layer.still) this.request(slot, key, priority);
    // The proxy frame at this very time while the full one decodes.
    if (other && this.alternate.mediaId === mediaId) {
      this.stats.standIns += 1;
      return this.show(slot, layer, other, this.alternate);
    }
    const standIn = slot.standIn;
    if (standIn && standIn.key.mediaId === mediaId && standIn.texture.valid) {
      this.stats.standIns += 1;
      return this.show(slot, layer, standIn.texture, standIn.key);
    }
    if (slot.hasShown && slot.shown.texture.valid) {
      this.stats.held += 1;
      return slot.shown;
    }
    return null;
  }

  /**
   * The pool key of the `lod` frame nearest to media time `timeUs` (media time 0 is the first frame),
   * in a scratch key valid until the next call; null until the video is open.
   */
  private videoKey(mediaId: MediaId, timeUs: number, lod: Lod): TextureKey | null {
    const info = this.deps.frames.info(mediaId, lod);
    if (!info) {
      this.open(mediaId, lod);
      return null;
    }
    const times = info.frameTimesUs;
    if (!info.decodable || times.length === 0) {
      // A proxy that cannot be decoded is the frame service's to drop (the next pass asks for full).
      if (lod === "full") this.fail(mediaId, `this browser cannot decode ${info.codec}`);
      return null;
    }
    const key = this.wanted;
    key.mediaId = mediaId;
    key.lod = lod;
    key.timeUs = times[mediaTimePosition(times, timeUs)] as number;
    return key;
  }

  /** The long edge of a media's proxy frames (0 before the proxy is open). */
  private proxyLongEdge(mediaId: MediaId): number {
    const info = this.deps.frames.info(mediaId, "proxy");
    return info ? Math.max(info.codedWidth, info.codedHeight) : 0;
  }

  /** Like `videoKey` for the other lod, in its own scratch key, without opening anything. */
  private alternateKey(mediaId: MediaId, timeUs: number, lod: Lod): TextureKey | null {
    const info = this.deps.frames.info(mediaId, lod);
    const times = info?.frameTimesUs;
    if (!info?.decodable || !times || times.length === 0) return null;
    const key = this.alternate;
    key.mediaId = mediaId;
    key.lod = lod;
    key.timeUs = times[mediaTimePosition(times, timeUs)] as number;
    return key;
  }

  /** The long edge a detail refresh asks for: the pass's, at most the video's coded size, with the tolerance. */
  private minLongEdge(mediaId: MediaId): number {
    const info = this.deps.frames.info(mediaId);
    const coded = info ? Math.max(info.codedWidth, info.codedHeight) : Infinity;
    return Math.floor(Math.min(this.detailLongEdge, coded) * DETAIL_TOLERANCE);
  }

  /** A cached frame is short of this pass's detail and was not refreshed to it yet. */
  private wantsDetail(slot: Slot, texture: TextureHandle, mediaId: MediaId, key: TextureKey): boolean {
    if (this.detailLongEdge <= 0 || Math.max(texture.width, texture.height) >= this.minLongEdge(mediaId)) return false;
    if (slot.pending && sameKey(slot.pending.key, key)) return false;
    return !(sameKey(slot.refreshKey, key) && slot.refreshedTo >= this.detailLongEdge);
  }

  /** Asks for a frame (`minLongEdge`: a detail refresh of the cached one: no stand-ins, it is on screen). */
  private request(slot: Slot, wantedKey: TextureKey, priority: FramePriority, minLongEdge?: number): void {
    if ((slot.pending && sameKey(slot.pending.key, wantedKey)) || (slot.settled && sameKey(slot.settledKey, wantedKey))) return;
    this.cancel(slot);
    slot.standIn = null;
    slot.settled = false;
    const key = copyKey(newKey(), wantedKey);
    let wanted = priority;
    if (priority === "scrub") {
      if (this.scrubbed.has(key.mediaId)) wanted = "idle";
      else this.scrubbed.add(key.mediaId);
    }
    const refresh = minLongEdge !== undefined;
    const pending: Pending = { key, controller: new AbortController(), refresh };
    slot.pending = pending;
    const onApproximate = (result: FrameResult) => {
      if (slot.pending !== pending) return;
      slot.standIn = result;
      // During `resolve` the pass uses it at once; later it needs a new pass.
      if (!this.resolving) this.deps.onChange();
    };
    this.deps.frames
      .getFrame(key.mediaId, key.timeUs, { lod: key.lod, priority: wanted, signal: pending.controller.signal, ...(refresh ? { minLongEdge } : { onApproximate }) })
      .then(
        (result) => {
          if (slot.pending !== pending) return;
          slot.pending = null;
          if (result.approximate) {
            slot.standIn = result;
            slot.settled = true;
            copyKey(slot.settledKey, key);
          }
          this.deps.onChange();
        },
        (error: unknown) => {
          if (slot.pending !== pending) return;
          slot.pending = null;
          if (isAbortError(error)) {
            // Superseded by someone else's request: ask again in the next pass.
            if (!pending.controller.signal.aborted) this.deps.onChange();
            return;
          }
          if ((error as { name?: unknown }).name === "UnsupportedCodecError") this.fail(key.mediaId, (error as Error).message);
          else {
            slot.settled = true;
            copyKey(slot.settledKey, key);
            console.warn(`[preview] no frame of ${key.mediaId} at ${key.timeUs} us`, error);
          }
        },
      );
  }

  private open(mediaId: MediaId, lod: Lod): void {
    const id = `${mediaId}|${lod}`;
    if (this.opening.has(id)) return;
    this.opening.add(id);
    this.deps.frames.video(mediaId, lod).then(
      () => {
        this.opening.delete(id);
        this.deps.onChange();
      },
      (error: unknown) => {
        this.opening.delete(id);
        if (isAbortError(error)) return;
        // A proxy that does not open: the frame service routes the media to its full file.
        if (lod === "proxy") this.deps.onChange();
        else this.fail(mediaId, error instanceof Error ? error.message : String(error));
      },
    );
  }

  private loadImage(mediaId: MediaId): void {
    if (this.loadingImages.has(mediaId)) return;
    this.loadingImages.add(mediaId);
    this.deps.images.load(mediaId).then(
      (texture) => {
        this.loadingImages.delete(mediaId);
        if (texture) this.deps.onChange();
      },
      (error: unknown) => {
        this.loadingImages.delete(mediaId);
        if (!isAbortError(error)) this.fail(mediaId, error instanceof Error ? error.message : String(error));
      },
    );
  }

  private fail(mediaId: MediaId, reason: string): void {
    if (this.failed.has(mediaId)) return;
    this.failed.add(mediaId);
    this.stats.failed = this.failed.size;
    // TODO(batch 41): offline and undecodable media render as a labeled gray slate (§6.19).
    console.warn(`[preview] cannot show media ${mediaId}: ${reason}`);
  }

  /** Draws `texture` with the layer's geometry from this slot, pinning it in the pool. */
  private show(slot: Slot, layer: MediaLayer, texture: TextureHandle, key: TextureKey): TextureLayer {
    if (!slot.unpin || !sameKey(slot.pinnedKey, key)) {
      const unpin = this.deps.pool.pin(key);
      slot.unpin?.();
      slot.unpin = unpin;
      copyKey(slot.pinnedKey, key);
    }
    const shown = slot.shown;
    shown.texture = texture;
    for (let i = 0; i < 6; i++) shown.transform[i] = layer.transform[i] as number;
    shown.opacity = layer.opacity;
    shown.crop.u0 = layer.crop.u0;
    shown.crop.v0 = layer.crop.v0;
    shown.crop.u1 = layer.crop.u1;
    shown.crop.v1 = layer.crop.v1;
    slot.hasShown = true;
    return shown;
  }

  private slot(pane: 0 | 1, trackId: TrackId): Slot {
    const slots = this.slots[pane];
    let slot = slots.get(trackId);
    if (!slot) {
      slot = {
        pending: null,
        standIn: null,
        settled: false,
        settledKey: newKey(),
        shown: { kind: "texture", texture: NO_TEXTURE, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false },
        hasShown: false,
        pinnedKey: newKey(),
        refreshKey: newKey(),
        refreshedTo: 0,
        unpin: null,
        pass: 0,
      };
      slots.set(trackId, slot);
    }
    slot.pass = this.pass;
    return slot;
  }

  private cancel(slot: Slot): void {
    slot.pending?.controller.abort();
    slot.pending = null;
  }

  private release(slot: Slot): void {
    this.cancel(slot);
    slot.unpin?.();
    slot.unpin = null;
    slot.standIn = null;
    slot.hasShown = false;
    slot.shown.texture = NO_TEXTURE;
  }
}

function newTextureLayer(): WritableTextureLayer {
  return { kind: "texture", texture: NO_TEXTURE, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false, blur: 0 };
}

type WritableSolidLayer = Omit<SolidLayer, "transform"> & { transform: MutableMat3 };

function newSolidLayer(): WritableSolidLayer {
  return { kind: "solid", transform: mutableIdentity(), opacity: 1, color: { r: 0, g: 0, b: 0, a: 0 } };
}

/** `out` as the active word's move: grown by the highlight's scale about its middle. */
function highlightMove(out: UnitState, karaoke: CaptionHighlightFrame): UnitState {
  out.x = 0;
  out.y = 0;
  out.opacity = 1;
  out.blur = 0;
  out.masked = false;
  out.cut = Infinity;
  out.scale = karaoke.scale;
  out.ox = karaoke.ox;
  out.oy = karaoke.oy;
  return out;
}

/** Scratch matrix of a unit's own move. */
const unitMove = mutableIdentity();

/**
 * `out` drawing a text raster or an atlas cell: the unit quad onto `rect` (content px) showing `crop`
 * of `texture`, moved by an animation `state` (offset, scale about its middle, blur; a mask to its place
 * or a cut at an x), then the layer's `model`. `scale`: texture px per content px. False when nothing
 * of it shows.
 */
function writeTextQuad(out: WritableTextureLayer, model: Mat3, texture: TextureHandle, crop: UvRect, rect: Rect, scale: number, state: UnitState | null, opacity: number): boolean {
  const { x } = rect;
  const { u0 } = crop;
  let { y, width, height } = rect;
  let { v0, u1, v1 } = crop;
  if (state) {
    if (state.masked && state.y !== 0) {
      // Slid by y inside its place: the part still inside shows.
      const dy = state.y;
      if (Math.abs(dy) >= height) return false;
      if (dy > 0) {
        v1 = v0 + ((v1 - v0) * (height - dy)) / height;
        y += dy;
      } else v0 += ((v1 - v0) * -dy) / height;
      height -= Math.abs(dy);
    }
    if (state.cut < x + width) {
      if (state.cut <= x) return false;
      u1 = u0 + ((u1 - u0) * (state.cut - x)) / width;
      width = state.cut - x;
    }
  }
  const m = setMat(out.transform, width, 0, 0, height, x, y);
  if (state && !state.masked && (state.scale !== 1 || state.x !== 0 || state.y !== 0)) {
    const s = state.scale;
    multiplyInto(m, setMat(unitMove, s, 0, 0, s, state.ox * (1 - s) + state.x, state.oy * (1 - s) + state.y), m);
  }
  multiplyInto(m, model, m);
  out.texture = texture;
  out.opacity = opacity;
  out.crop.u0 = u0;
  out.crop.v0 = v0;
  out.crop.u1 = u1;
  out.crop.v1 = v1;
  out.blur = state ? state.blur * scale : 0;
  return true;
}

/** The texture of a slot that has drawn nothing yet. */
const NO_TEXTURE: TextureHandle = { width: 0, height: 0, mipLevels: 0, bytes: 0, valid: false, destroy: () => undefined };
