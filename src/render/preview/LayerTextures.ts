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
// - `resolveSplit` resolves two composites in one pass (the trim preview's two frames side by side,
//   spec §6.10), each pane with its own slots and draw list. The scrub rule spans both: a media shown
//   in both panes gets one scrub request, so the two never supersede each other.
// The draw lists, the slot structs and their keys are reused between passes: a pass allocates nothing
// unless it requests or pins a new frame.
import type { MediaId, TrackId } from "../../core/document/types.js";
import { imageKey, type TextureKey, type TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameResult, FrameService } from "../../media/decode/FrameService.js";
import type { ImageService } from "../../media/decode/ImageService.js";
import { mediaTimePosition } from "../../media/demux/sampleIndex.js";
import { isAbortError, type FramePriority } from "../../media/workers/protocol.js";
import type { NeighborFrame } from "../compositor/Compositor.js";
import type { Composite, DrawList, Layer, MediaLayer, TextureLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { mutableIdentity, type MutableMat3 } from "../mat3.js";

export interface LayerTexturesDeps {
  frames: Pick<FrameService, "info" | "video" | "getFrame" | "prefetch">;
  images: Pick<ImageService, "get" | "load">;
  pool: Pick<TexturePool, "get" | "has" | "pin">;
  /** A frame arrived after the pass that wanted it: draw again. */
  onChange(): void;
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
}

type WritableTextureLayer = Omit<TextureLayer, "transform"> & { transform: MutableMat3 };

interface Pending {
  key: TextureKey;
  controller: AbortController;
}

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
  unpin: (() => void) | null;
  pass: number;
}

const keyId = (key: TextureKey) => `${key.mediaId}|${key.lod}|${key.timeUs}`;
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
  private readonly scrubbed = new Set<MediaId>();
  private readonly active = new Set<MediaId>();
  private readonly opening = new Set<MediaId>();
  private readonly loadingImages = new Set<MediaId>();
  private readonly warming = new Set<string>();
  private readonly failed = new Set<MediaId>();
  private pass = 0;
  private resolving = false;
  /** Scratch key of the frame a layer wants (copied when it is kept). */
  private readonly wanted = newKey();
  readonly stats: LayerTexturesStats = { layers: 0, exact: 0, standIns: 0, held: 0, missing: 0, pending: 0, warming: 0, failed: 0 };

  constructor(private readonly deps: LayerTexturesDeps) {}

  /** The draw list for `composite` with every media layer resolved to a texture (or held, or left out). */
  resolve(composite: Composite, priority: FramePriority): DrawList {
    this.begin();
    try {
      this.resolveInto(0, composite, priority);
    } finally {
      this.end();
    }
    return this.lists[0];
  }

  /**
   * Two composites resolved in one pass, into two draw lists (the left and right panes of a split
   * preview). Reused like `resolve`'s list: read both before resolving again.
   */
  resolveSplit(left: Composite, right: Composite, priority: FramePriority): readonly [DrawList, DrawList] {
    this.begin();
    try {
      this.resolveInto(0, left, priority);
      this.resolveInto(1, right, priority);
    } finally {
      this.end();
    }
    return this.lists;
  }

  private begin(): void {
    this.pass += 1;
    this.scrubbed.clear();
    this.active.clear();
    const stats = this.stats;
    stats.layers = 0;
    stats.exact = 0;
    stats.standIns = 0;
    stats.held = 0;
    stats.missing = 0;
    this.resolving = true;
  }

  private resolveInto(pane: 0 | 1, composite: Composite, priority: FramePriority): void {
    const list = this.lists[pane];
    list.width = composite.width;
    list.height = composite.height;
    list.background = composite.background;
    list.layers.length = 0;
    const stats = this.stats;
    for (const layer of composite.layers) {
      if (layer.kind === "solid") {
        list.layers.push(layer);
        continue;
      }
      stats.layers += 1;
      this.active.add(layer.mediaId);
      const drawn = this.resolveMedia(this.slot(pane, layer.trackId), layer, priority);
      if (drawn) list.layers.push(drawn);
      else stats.missing += 1;
    }
  }

  /** Releases the slots this pass did not use (a pane not resolved loses them all) and counts what is pending. */
  private end(): void {
    this.resolving = false;
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
      const key = this.videoKey(mediaId, neighbor.timeUs);
      if (!key || this.deps.pool.has(key)) continue;
      const id = keyId(key);
      if (this.warming.has(id)) continue;
      this.warming.add(id);
      const timeUs = key.timeUs;
      this.deps.frames
        .prefetch(mediaId, timeUs, timeUs)
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

  /** The last resolved draw list (of a split, the left one; Export frame draws it). */
  get current(): DrawList {
    return this.lists[0];
  }

  private resolveMedia(slot: Slot, layer: MediaLayer, priority: FramePriority): TextureLayer | null {
    const { mediaId } = layer;
    // Never ready: holding the track's previous layer would show stale content for good.
    if (this.failed.has(mediaId)) return null;
    let key: TextureKey | null;
    let texture: TextureHandle | null;
    if (layer.still) {
      key = imageKey(mediaId);
      texture = this.deps.images.get(mediaId);
      if (!texture) this.loadImage(mediaId);
    } else {
      key = this.videoKey(mediaId, layer.timeUs);
      texture = key ? this.deps.pool.get(key) : null;
    }
    if (texture && key) {
      this.cancel(slot);
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
   * The pool key of the video frame nearest to media time `timeUs` (media time 0 is the first frame),
   * in a scratch key valid until the next call; null until the video is open.
   */
  private videoKey(mediaId: MediaId, timeUs: number): TextureKey | null {
    const info = this.deps.frames.info(mediaId);
    if (!info) {
      this.open(mediaId);
      return null;
    }
    const times = info.frameTimesUs;
    if (!info.decodable || times.length === 0) {
      this.fail(mediaId, `this browser cannot decode ${info.codec}`);
      return null;
    }
    const key = this.wanted;
    key.mediaId = mediaId;
    key.lod = "full";
    key.timeUs = times[mediaTimePosition(times, timeUs)] as number;
    return key;
  }

  private request(slot: Slot, wantedKey: TextureKey, priority: FramePriority): void {
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
    const pending: Pending = { key, controller: new AbortController() };
    slot.pending = pending;
    this.deps.frames
      .getFrame(key.mediaId, key.timeUs, {
        priority: wanted,
        signal: pending.controller.signal,
        onApproximate: (result) => {
          if (slot.pending !== pending) return;
          slot.standIn = result;
          // During `resolve` the pass uses it at once; later it needs a new pass.
          if (!this.resolving) this.deps.onChange();
        },
      })
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

  private open(mediaId: MediaId): void {
    if (this.opening.has(mediaId)) return;
    this.opening.add(mediaId);
    this.deps.frames.video(mediaId).then(
      () => {
        this.opening.delete(mediaId);
        this.deps.onChange();
      },
      (error: unknown) => {
        this.opening.delete(mediaId);
        if (!isAbortError(error)) this.fail(mediaId, error instanceof Error ? error.message : String(error));
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

/** The texture of a slot that has drawn nothing yet. */
const NO_TEXTURE: TextureHandle = { width: 0, height: 0, mipLevels: 0, bytes: 0, valid: false, destroy: () => undefined };
