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
//   at once and decoded again once at that size; the bigger texture replaces it in the pool. An SVG is
//   rasterized again at the size it is drawn at (`vectorLongEdge`) when its raster is under it, or more
//   than twice as big (sampled down, a big raster blurs), at rest too.
// - Images (Batch 34): a still's one texture, or an animation's frame at the layer's media time
//   (ImageService `frameKey`); a frame not uploaded yet holds the track's previous layer while the
//   animation loads.
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
// - A cross dissolve (Batch 36) resolves its two media layers on their own slots (the incoming clip's
//   is `trackId + TRANSITION_SLOT`) into one `dissolve` layer over the frame; with one side not drawable
//   yet, the other is drawn alone. Export frame resolves both sides exactly.
// The draw lists, the slot structs and their keys are reused between passes: a pass allocates nothing
// unless it requests or pins a new frame (or rasterizes a text).
import type { MatteMode, MediaId, ShadowStyle, StrokeStyle, TextStyle, TrackId } from "../../core/document/types.js";
import { imageKey, type Lod, type TextureKey, type TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameResult, FrameService } from "../../media/decode/FrameService.js";
import type { ImageService } from "../../media/decode/ImageService.js";
import type { LottieFrames } from "../../media/decode/LottieFrames.js";
import { mediaTimePosition } from "../../media/demux/sampleIndex.js";
import { isAbortError, isWorkerCrash, type FramePriority } from "../../media/workers/protocol.js";
import { newUnitState, type UnitState } from "../../text/anim.js";
import type { NeighborFrame, UpcomingText } from "../compositor/Compositor.js";
import { transitionFx, type TransitionFx } from "../../core/document/transitions.js";
import { type CaptionHighlightFrame, type Composite, type CompoundCompositeLayer, type DissolveLayer, type DrawList, type EffectFrame, type GroupCompositeLayer, type GroupLayer, type Layer, type MaskFrame, type MediaLayer, type PictureShape, type SolidGeometry, type SolidLayer, type SolidStyle, type TextAnimFrame, type TextGlyphDraw, type TextCompositeLayer, type TextureLayer, type TransitionCompositeLayer, type UvRect } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { multiplyInto, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import type { Homography } from "../projection.js";
import type { Rect } from "../text/layout.js";
import type { ResolvedText, ResolvedUnit, TextRasterCache } from "../text/TextRasterCache.js";
import type { CompoundTargets } from "./CompoundTargets.js";
import { newPathLayer, ShapeGeometryCache, type ShapeGeometryStats, type WritablePathLayer } from "../shapes/ShapeGeometryCache.js";
import { exportLongEdge, layerDetail, vectorLongEdge } from "./detail.js";

/** After a decode worker crash the frame service already asked twice: a new pass asks again this much later (Batch 47). */
export const CRASH_RETRY_MS = 500;

export interface LayerTexturesDeps {
  frames: Pick<FrameService, "info" | "video" | "getFrame" | "prefetch" | "lodFor">;
  images: Pick<ImageService, "get" | "load" | "frameKey" | "vectorSize" | "refine"> & { lottie?: Pick<LottieFrames, "setEdge" | "edgeOf" | "frame" | "size"> };
  pool: Pick<TexturePool, "get" | "has" | "pin">;
  /** A frame arrived after the pass that wanted it: draw again. */
  onChange(): void;
  /** The lod this pass asks a media's frames for (the quality mode's rule); full when absent. */
  wantedLod?(mediaId: MediaId): Lod;
  /** Text rasters (spec §10.1); text layers draw nothing without it. */
  text?: Pick<TextRasterCache, "begin" | "end" | "resolve" | "exact" | "resolveAtlas" | "resolveBackground" | "warm">;
  /** A media cannot be shown (its file is missing or cannot be decoded): it is drawn as an offline slate (Batch 41). */
  onFail?(mediaId: MediaId, reason: string): void;
  /** Where compound clips (spec §21.10) draw their sequences; compound layers draw nothing without it. */
  compounds?: CompoundTargets;
  /** Shape geometry (spec §21.12, shared by the resolvers of a view); one of its own when absent. */
  shapes?: ShapeGeometryCache;
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
/** An SVG raster more than this many times the size it is drawn at is made again smaller. */
const VECTOR_OVERSIZE = 2;

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
  /** The rounded corners `shown` draws with (reused). */
  shapeValue?: PictureShape;
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
  /** Per pane, the dissolves of a pass (reused in order). */
  private readonly dissolveLayers: [WritableDissolveLayer[], WritableDissolveLayer[]] = [[], []];
  private dissolveCount = 0;
  /** The active word's move (a scale highlight). */
  private readonly highlightState = newUnitState();
  /** The atlases of a highlighted cue's paints in a pass (reused). */
  private readonly paintAtlases: (ResolvedText | null)[] = [];
  /** Device px per project px of this pass (text rasters follow it). */
  private textScale = 1;
  private readonly scrubbed = new Set<MediaId>();
  private readonly active = new Set<MediaId>();
  /** Videos opening, as `mediaId|lod`. */
  private readonly opening = new Set<string>();
  private readonly loadingImages = new Set<MediaId>();
  /** SVGs being rasterized again for detail. */
  private readonly refining = new Set<MediaId>();
  private readonly warming = new Set<string>();
  private readonly failed = new Set<MediaId>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pass = 0;
  private resolving = false;
  /** Scratch keys of the frame a layer wants and of the other lod's frame at that time (copied when kept). */
  private readonly wanted = newKey();
  private readonly alternate = newKey();
  readonly stats: LayerTexturesStats = { layers: 0, exact: 0, standIns: 0, held: 0, missing: 0, pending: 0, warming: 0, failed: 0, proxy: 0, texts: 0 };

  /** The resolvers of the compound clips shown (by clip path), and the compound layers of a pass (reused in order). */
  private readonly children = new Map<string, { textures: LayerTextures; pass: number }>();
  private readonly compoundLayers: [WritableTextureLayer[], WritableTextureLayer[]] = [[], []];
  private compoundCount = 0;
  private renderScale = 1;

  /** `path`: set on the resolver of a compound clip, which the outermost resolver drives (text and target passes are the root's). */
  /** Shape layers of each pane (reused in order) and the shape geometry cache. */
  private readonly pathLayers: [WritablePathLayer[], WritablePathLayer[]] = [[], []];
  private pathCount = 0;
  /** Group layers of each pane (blend modes and track mattes, spec §21.17; reused in order). */
  private readonly groupLayers: [WritableGroupLayer[], WritableGroupLayer[]] = [[], []];
  private groupCount = 0;
  private readonly shapes: ShapeGeometryCache;

  constructor(private readonly deps: LayerTexturesDeps, private readonly path: string | null = null) {
    this.shapes = deps.shapes ?? new ShapeGeometryCache({ onReady: () => deps.onChange() });
  }

  /** The shape geometry counters (spec §21.12: geometry is rebuilt only when a path or its style changes). */
  get shapeStats(): ShapeGeometryStats {
    return this.shapes.stats();
  }

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
    this.renderScale = renderScale;
    if (this.path === null) {
      this.deps.text?.begin();
      this.deps.compounds?.begin();
    }
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
    this.dissolveCount = 0;
    this.compoundCount = 0;
    this.pathCount = 0;
    this.groupCount = 0;
    this.resolveLayers(pane, list, composite.layers, composite, priority);
  }

  /** The draw layers of `layers` (a composite's, or a group's), pushed onto `list`. */
  private resolveLayers(pane: 0 | 1, list: WritableList, layers: Composite["layers"], composite: Composite, priority: FramePriority): void {
    for (const layer of layers) {
      const start = list.layers.length;
      this.resolveOne(pane, list, layer, composite, priority);
      // The 2.5D projection of the clip (spec §21.15) on every layer it drew (a dissolve sets its own).
      if (layer.kind !== "dissolve") project(list.layers, start, layer.persp);
    }
  }

  /**
   * A clip with a blend mode or a track matte (spec §21.17): its layers and its matte clip's resolved into
   * a pooled group layer; null when none of its layers can be drawn.
   */
  private resolveGroup(pane: 0 | 1, layer: GroupCompositeLayer, composite: Composite, priority: FramePriority): GroupLayer | null {
    const pool = this.groupLayers[pane];
    const out = (pool[this.groupCount] ??= newGroupLayer());
    out.list.layers.length = 0;
    out.matteList.layers.length = 0;
    this.resolveLayers(pane, out.list, layer.layers, composite, priority);
    if (out.list.layers.length === 0) return null;
    this.groupCount += 1;
    out.blend = layer.blend;
    out.mask = layer.mask;
    out.effects = layer.effects;
    out.matte = null;
    if (layer.matte) {
      this.resolveLayers(pane, out.matteList, layer.matte.layers, composite, priority);
      out.matteValue.mode = layer.matte.mode;
      out.matteValue.mask = layer.matte.mask;
      out.matte = out.matteValue;
    }
    return out;
  }

  /** The draw layers of one composite layer, pushed onto `list`. */
  private resolveOne(pane: 0 | 1, list: WritableList, layer: Composite["layers"][number], composite: Composite, priority: FramePriority): void {
    const stats = this.stats;
    if (layer.kind === "group") {
      const drawn = this.resolveGroup(pane, layer, composite, priority);
      if (drawn) list.layers.push(drawn);
      return;
    }
    if (layer.kind === "shape") {
      const pool = this.pathLayers[pane];
      const out = (pool[this.pathCount] ??= newPathLayer());
      if (this.shapes.resolve(layer, this.renderScale, false, out)) {
        this.pathCount += 1;
        list.layers.push(out);
      }
      return;
    }
    if (layer.kind === "compound") {
      const drawn = this.resolveCompound(pane, layer, priority);
      if (drawn) list.layers.push(drawn);
      return;
    }
    if (layer.kind === "solid" || layer.kind === "adjust") {
      list.layers.push(layer);
      return;
    }
    if (layer.kind === "text") {
      if (this.resolveText(pane, list.layers, layer)) stats.texts += 1;
      return;
    }
    if (layer.kind === "dissolve") {
      this.resolveDissolve(pane, list, layer, composite, priority);
      return;
    }
    const drawn = this.resolveLayer(pane, layer, priority);
    if (drawn) list.layers.push(drawn);
  }

  /** The resolver of the compound clip `clipId` of this scope (made on first use). */
  private child(clipId: string): LayerTextures {
    const key = this.path === null ? clipId : `${this.path}/${clipId}`;
    let entry = this.children.get(key);
    if (!entry) {
      const text = this.deps.text;
      // The scope's own text cache, without its pass calls (the root's cover the whole pass).
      const quiet: LayerTexturesDeps["text"] | undefined = text && {
        begin() {},
        end() {},
        resolve: (...args) => text.resolve(...args),
        exact: (...args) => text.exact(...args),
        resolveAtlas: (...args) => text.resolveAtlas(...args),
        resolveBackground: (...args) => text.resolveBackground(...args),
        warm: (...args) => text.warm(...args),
      };
      const deps: LayerTexturesDeps = { ...this.deps, shapes: this.shapes };
      if (quiet) deps.text = quiet;
      entry = { textures: new LayerTextures(deps, key), pass: 0 };
      this.children.set(key, entry);
    }
    entry.pass = this.pass;
    return entry.textures;
  }

  /** A compound clip: its sequence resolved by its own resolver, drawn into its texture (unchanged: kept), shown as one layer. */
  private resolveCompound(pane: 0 | 1, layer: CompoundCompositeLayer, priority: FramePriority): TextureLayer | null {
    // TODO(batch 74): effects run on the compound target here (masks apply through the group path).
    const targets = this.deps.compounds;
    if (!targets) return null;
    const scale = this.renderScale * layer.scale;
    const size = targets.sizeFor(layer.width, layer.height, scale);
    const child = this.child(layer.clipId);
    const inner = child.resolve(layer.inner, priority, 0, size.width / Math.max(1, layer.width));
    const texture = targets.render(child.path as string, inner, size.width, size.height);
    if (!texture) return null;
    const pool = this.compoundLayers[pane];
    const out = (pool[this.compoundCount] ??= newTextureLayer());
    this.compoundCount += 1;
    out.texture = texture;
    setMat(out.transform, ...(layer.model as unknown as [number, number, number, number, number, number]));
    out.opacity = layer.opacity;
    return out;
  }

  /** One media layer on its track's slot (counted in the stats), or null when nothing of it can be drawn. */
  private resolveLayer(pane: 0 | 1, layer: MediaLayer, priority: FramePriority): TextureLayer | null {
    const stats = this.stats;
    stats.layers += 1;
    this.active.add(layer.mediaId);
    const slot = this.slot(pane, layer.trackId);
    const drawn = this.resolveMedia(slot, layer, priority);
    if (drawn) {
      if (slot.pinnedKey.lod === "proxy" && !layer.still) stats.proxy += 1;
    } else stats.missing += 1;
    return drawn;
  }

  /** A cross dissolve (Batch 36): both clips on their slots mixed over the frame, or the one that can be drawn. */
  private resolveDissolve(pane: 0 | 1, list: WritableList, layer: TransitionCompositeLayer, composite: Composite, priority: FramePriority): void {
    const from = this.resolveLayer(pane, layer.from, priority);
    const to = this.resolveLayer(pane, layer.to, priority);
    if (from && to) {
      const pool = this.dissolveLayers[pane];
      const dissolve = (pool[this.dissolveCount] ??= newDissolveLayer());
      this.dissolveCount += 1;
      pushDissolve(list.layers, dissolve, from, to, layer, composite);
    } else if (from || to) {
      const side = (from ?? to) as TextureLayer;
      list.layers.push(side);
      project(list.layers, list.layers.length - 1, (from ? layer.from : layer.to).persp);
    }
  }

  /** Draws text `layer` into `layers` (its raster, or its animated units). False when it drew nothing. */
  private resolveText(pane: 0 | 1, layers: Layer[], layer: TextCompositeLayer): boolean {
    const text = this.deps.text;
    if (!text) return false;
    const scale = this.textScale * layer.scale;
    if (layer.karaoke) return this.resolveKaraoke(pane, layers, layer, layer.karaoke, scale);
    const anim = layer.anim;
    if (anim?.sweep) this.pushSweep(pane, layers, layer.model, anim.sweep, layer.opacity);
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
    // Glyph atlas (counter, decode) and tint atlas (animator fill), Batch 68.
    const glyphFrame = anim.glyphs;
    const glyphs = glyphFrame ? text.resolveAtlas(layer.clipId + glyphFrame.slot, glyphFrame.text, layer.style, scale, "char") : null;
    const gcells = glyphs?.units ?? null;
    if (anim.atlas === "glyphs") {
      if (!glyphFrame || !gcells || !glyphs) return false;
      const count = Math.min(glyphFrame.draws.length, anim.units.length);
      for (let i = 0; i < count; i++) {
        const state = anim.units[i] as UnitState;
        const draw = glyphFrame.draws[i] as TextGlyphDraw;
        const cell = gcells[draw.glyph] as ResolvedUnit | undefined;
        if (cell && state.opacity > 0) this.pushText(pane, layers, layer.model, glyphs, cell.crop, cell.rect, movedState(this.swapState, state, draw), layer.opacity * state.opacity);
      }
      return true;
    }
    const atlas = text.resolveAtlas(layer.clipId, layer.text, layer.style, scale, anim.atlas);
    const cells = atlas?.units;
    if (!atlas || !cells) return false;
    const tint = anim.tint ? text.resolveAtlas(layer.clipId + anim.tint.slot, layer.text, anim.tint.style, scale, anim.atlas) : null;
    const tcells = tint?.units ?? null;
    const count = Math.min(cells.length, anim.units.length);
    for (let i = 0; i < count; i++) {
      const state = anim.units[i] as UnitState;
      if (!(state.opacity > 0)) continue;
      const draw = glyphFrame?.draws[i];
      const swapped = draw !== undefined && draw.glyph >= 0 ? (gcells?.[draw.glyph] as ResolvedUnit | undefined) : undefined;
      if (swapped && glyphs && draw) {
        this.pushText(pane, layers, layer.model, glyphs, swapped.crop, swapped.rect, movedState(this.swapState, state, draw), layer.opacity * state.opacity);
        continue;
      }
      const cell = cells[i] as ResolvedUnit;
      this.pushText(pane, layers, layer.model, atlas, cell.crop, cell.rect, state, layer.opacity * state.opacity);
      const over = tcells?.[i];
      if (tint && over && state.tint > 0) this.pushText(pane, layers, layer.model, tint, over.crop, over.rect, state, layer.opacity * state.opacity * state.tint);
    }
    return true;
  }

  /** Draws a cue with its active word highlighted (spec §10.5). False when it drew nothing. */
  private resolveKaraoke(pane: 0 | 1, layers: Layer[], layer: TextCompositeLayer, karaoke: CaptionHighlightFrame, scale: number): boolean {
    const text = this.deps.text;
    if (!text) return false;
    const wordBoxes = karaoke.wordBoxes;
    if (layer.style.background.enabled && !wordBoxes) {
      const boxes = text.resolveBackground(layer.clipId, layer.text, layer.style, scale);
      if (boxes) this.pushText(pane, layers, layer.model, boxes, boxes.crop, boxes.rect, null, layer.opacity);
    }
    const atlas = text.resolveAtlas(layer.clipId, layer.text, layer.style, scale, "word");
    const cells = atlas?.units;
    if (!atlas || !cells) return false;
    const playing = karaoke.to > karaoke.from;
    const active = playing ? text.resolveAtlas(layer.clipId + karaoke.slot, layer.text, karaoke.style, scale, "word") : null;
    // The other looks of the words (progressive, reveal, word colors, emphasis), each from its own atlas.
    const paints = karaoke.paints;
    const looks = this.paintAtlases;
    looks.length = 0;
    if (paints) {
      for (let k = 0; k < paints.length; k++) {
        const paint = paints[k] as { slot: string; style: TextStyle };
        looks.push(k === 0 ? atlas : text.resolveAtlas(layer.clipId + paint.slot, layer.text, paint.style, scale, "word"));
      }
    }
    if (wordBoxes) this.pushWordBoxes(pane, layers, layer.model, wordBoxes, layer.opacity);
    for (let i = 0; i < cells.length; i++) {
      // The active word comes from the highlight atlas (or, while it is being made, this one).
      if (playing && i >= karaoke.from && i < karaoke.to && active?.units) continue;
      const k = paints ? (karaoke.unitPaint[i] ?? 0) : 0;
      if (k < 0) continue;
      // A look still being made shows the cue's own.
      const made = looks[k];
      const source = made?.units ? made : atlas;
      const cell = (source.units as ResolvedUnit[])[i] as ResolvedUnit;
      this.pushText(pane, layers, layer.model, source, cell.crop, cell.rect, null, layer.opacity);
    }
    const hot = active?.units;
    if (!active || !hot) return true;
    if (karaoke.box) this.pushBox(pane, layers, layer.model, karaoke.box.rect, karaoke.box.color, karaoke.box.radius, layer.opacity);
    const state = highlightMove(this.highlightState, karaoke);
    for (let i = karaoke.from; i < Math.min(karaoke.to, hot.length); i++) {
      const cell = hot[i] as ResolvedUnit;
      this.pushText(pane, layers, layer.model, active, cell.crop, cell.rect, state, layer.opacity);
    }
    return true;
  }

  /** The highlight sweep boxes (Batch 68): a pooled solid per word that has grown. */
  private pushSweep(pane: 0 | 1, layers: Layer[], model: Mat3, sweep: NonNullable<TextAnimFrame["sweep"]>, opacity: number): void {
    for (let i = 0; i < sweep.count; i++) {
      const rect = sweep.rects[i];
      if (rect && rect.width >= 0.5) this.pushBox(pane, layers, model, rect, sweep.color, Math.min(rect.height / 4, rect.width / 2), opacity);
    }
  }

  /** Scratch state of a glyph drawn in a unit place. */
  private readonly swapState = newUnitState();

  /** Adds a pooled solid layer filling `rect` (content px of `model`) with `color`, its corners rounded by `radius`. */
  private pushBox(pane: 0 | 1, layers: Layer[], model: Mat3, rect: Rect, color: SolidLayer["color"], radius: number, opacity: number, style: TextStyle["background"] | null = null): void {
    const out = (this.boxLayers[pane][this.boxCount] ??= newSolidLayer());
    this.boxCount += 1;
    writeBox(out, model, rect, color, radius, opacity, style);
    layers.push(out);
  }

  /** The `word` background mode's boxes (Batch 59): a solid behind each shown word, the active one in the highlight color. */
  private pushWordBoxes(pane: 0 | 1, layers: Layer[], model: Mat3, boxes: NonNullable<CaptionHighlightFrame["wordBoxes"]>, opacity: number): void {
    const style = boxes.style;
    for (const word of boxes.shown) {
      const rect = boxes.rects[word];
      if (rect) this.pushBox(pane, layers, model, rect, word === boxes.active ? boxes.activeColor : style.color, Math.min(style.radius, rect.width / 2, rect.height / 2), opacity, style);
    }
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
    if (this.path === null) {
      this.deps.text?.end();
      for (const [key, child] of this.children) {
        if (child.pass === this.pass) continue;
        child.textures.clear();
        this.children.delete(key);
      }
      this.deps.compounds?.end();
    }
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
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.opening.clear();
    this.loadingImages.clear();
    this.refining.clear();
    for (const list of this.lists) list.layers.length = 0;
    for (const child of this.children.values()) child.textures.clear();
    this.children.clear();
    if (this.path === null) this.deps.compounds?.clear();
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
  async resolveExact(composite: Composite, maxLongEdge: number, renderScale = 1): Promise<{ list: DrawList; release: () => void }> {
    const unpins: (() => void)[] = [];
    const release = () => {
      for (const unpin of unpins.splice(0)) unpin();
    };
    const layers: Layer[] = [];
    try {
      await this.exactLayers(composite.layers, layers, composite, maxLongEdge, renderScale, unpins);
    } catch (error) {
      release();
      throw error;
    }
    return { list: { width: composite.width, height: composite.height, background: composite.background, layers }, release };
  }

  /** The exact draw layers of `source` (a composite's, or a group's), pushed onto `layers`. */
  private async exactLayers(source: Composite["layers"], layers: Layer[], composite: Composite, maxLongEdge: number, renderScale: number, unpins: (() => void)[]): Promise<void> {
    // Copied before waiting: the composite's layers are reused by the next evaluation.
    for (const layer of [...source]) {
      const start = layers.length;
      const persp = layer.kind === "dissolve" ? null : copyPersp(layer.persp);
      await this.exactOne(layer, layers, composite, maxLongEdge, renderScale, unpins);
      if (layer.kind !== "dissolve") project(layers, start, persp);
    }
  }

  /** The exact draw layers of one composite layer, pushed onto `layers`. */
  private async exactOne(layer: Composite["layers"][number], layers: Layer[], composite: Composite, maxLongEdge: number, renderScale: number, unpins: (() => void)[]): Promise<void> {
    if (layer.kind === "group") {
      // Blend mode and track matte (spec §21.17): the clip's layers and its matte's, exactly.
      const { blend, matte } = layer;
      const mask = layer.mask ? copyMaskFrame(layer.mask) : null;
      const effects = layer.effects ? copyEffectFrame(layer.effects) : null;
      const matteMask = matte?.mask ? copyMaskFrame(matte.mask) : null;
      const mode = matte?.mode ?? null;
      const matteLayers = matte ? [...matte.layers] : null;
      const inner: Layer[] = [];
      await this.exactLayers(layer.layers, inner, composite, maxLongEdge, renderScale, unpins);
      if (inner.length === 0) return;
      let resolvedMatte: GroupLayer["matte"] = null;
      if (mode && matteLayers) {
        const keyed: Layer[] = [];
        await this.exactLayers(matteLayers, keyed, composite, maxLongEdge, renderScale, unpins);
        resolvedMatte = { mode, layers: keyed, mask: matteMask };
      }
      layers.push({ kind: "group", transform: mutableIdentity(), opacity: 1, persp: null, blend, mask, effects, layers: inner, matte: resolvedMatte });
      return;
    }
    if (layer.kind === "shape") {
      // Export draws at project size: one device px per project px (compounds pass their own scale).
      const out = newPathLayer();
      if (this.shapes.resolve(layer, renderScale, true, out)) layers.push(out);
      return;
    }
    if (layer.kind === "compound") {
      const drawn = await this.exactCompound(layer, maxLongEdge, unpins);
      if (drawn) layers.push(drawn);
      return;
    }
    if (layer.kind === "solid") {
      layers.push(layer);
      return;
    }
    if (layer.kind === "adjust") {
      // An adjustment clip (spec §21.20): its blocks copied (the compositor reuses them for the next frame).
      layers.push({ kind: "adjust", clipId: layer.clipId, transform: mutableIdentity(), opacity: layer.opacity, persp: null, effects: copyEffectFrame(layer.effects), mask: layer.mask ? copyMaskFrame(layer.mask) : null });
      return;
    }
    if (layer.kind === "text") {
      await this.exactText(layer, layers, unpins);
      return;
    }
    if (layer.kind === "dissolve") {
      const sides = { from: copyPersp(layer.from.persp), to: copyPersp(layer.to.persp) };
      const mix = layer.mix;
      const from = await this.exactMedia(layer.from, maxLongEdge, unpins);
      const to = await this.exactMedia(layer.to, maxLongEdge, unpins);
      if (from && to) pushDissolve(layers, newDissolveLayer(), from, to, { mix, fx: layer.fx, from: { persp: sides.from }, to: { persp: sides.to } }, composite);
      else if (from || to) {
        layers.push((from ?? to) as TextureLayer);
        project(layers, layers.length - 1, from ? sides.from : sides.to);
      }
      return;
    }
    const drawn = await this.exactMedia(layer, maxLongEdge, unpins);
    if (drawn) layers.push(drawn);
  }

  /** A compound clip for Export frame: its sequence resolved exactly (by its own resolver) and drawn into a texture held until `unpins` run. */
  private async exactCompound(layer: CompoundCompositeLayer, maxLongEdge: number, unpins: (() => void)[]): Promise<TextureLayer | null> {
    const targets = this.deps.compounds;
    if (!targets) return null;
    // Copied before waiting: the composite's layers are reused by the next evaluation.
    const model = [...layer.model] as unknown as Mat3;
    const { opacity, width, height, scale } = layer;
    const size = targets.sizeFor(width, height, scale);
    const inner = await this.child(layer.clipId).resolveExact(layer.inner, maxLongEdge, size.width / Math.max(1, width));
    try {
      const made = targets.renderOnce(inner.list, size.width, size.height);
      if (!made) return null;
      unpins.push(made.release);
      return { kind: "texture", texture: made.texture, transform: model, opacity, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false, shape: null };
    } finally {
      inner.release();
    }
  }

  /** A media layer at its exact full-resolution frame (Export frame, see `resolveExact`), pinned until `unpins` run; null when it cannot be shown. */
  private async exactMedia(layer: MediaLayer, maxLongEdge: number, unpins: (() => void)[]): Promise<TextureLayer | null> {
    const { mediaId } = layer;
    let key: TextureKey;
    let texture: TextureHandle | null;
    if (layer.lottie) {
      // A Lottie frame (Batch 79): rendered at the exact time and at the detail the frame shows it at.
      const lottie = this.deps.images.lottie;
      const size = lottie?.size(mediaId);
      if (!lottie || !size) return null;
      const edge = vectorLongEdge(layer, size.width, size.height, 1);
      // The first render of a run also starts the renderer (the WASM module): one retry keeps an export from losing its first frame to a slow start.
      const attempt = () => lottie.frame(mediaId, layer.timeUs, edge).catch(() => null);
      const found = (await attempt()) ?? (await attempt());
      if (!found) return null;
      key = found.key;
      texture = found.texture;
    } else if (layer.still) {
      // The frame at its time (an animation's frames all loaded), an SVG as sharp as the frame shows it.
      await this.deps.images.load(mediaId).catch(() => null);
      const vector = this.deps.images.vectorSize(mediaId);
      const want = vector ? vectorLongEdge(layer, vector.width, vector.height, 1) : 0;
      const shown = this.deps.images.get(mediaId);
      if (vector && (!shown || Math.max(shown.width, shown.height) < want * DETAIL_TOLERANCE)) await this.deps.images.refine(mediaId, want).catch(() => null);
      const found = this.deps.images.frameKey(mediaId, layer.timeUs);
      key = found ? { ...found } : imageKey(mediaId);
      texture = found ? this.deps.pool.get(found) : null;
    } else {
      const info = this.deps.frames.info(mediaId) ?? (await this.deps.frames.video(mediaId).catch(() => null));
      if (!info?.decodable || info.frameTimesUs.length === 0) return null;
      const timeUs = info.frameTimesUs[mediaTimePosition(info.frameTimesUs, layer.timeUs)] as number;
      const longEdge = exportLongEdge(Math.max(info.codedWidth, info.codedHeight), layerDetail(layer, info.codedWidth, info.codedHeight), maxLongEdge);
      let result: FrameResult;
      try {
        result = await this.deps.frames.getFrame(mediaId, timeUs, { lod: "full", priority: "playback", minLongEdge: Math.floor(longEdge * DETAIL_TOLERANCE), uploadAtLeast: longEdge });
      } catch (error) {
        // The decoder refused the media partway (Batch 47): it becomes offline (a slate), as in the preview.
        if ((error as { name?: unknown }).name !== "UnsupportedCodecError") throw error;
        this.fail(mediaId, (error as Error).message);
        return null;
      }
      key = result.key;
      texture = result.texture;
    }
    if (!texture?.valid) return null;
    unpins.push(this.deps.pool.pin(key));
    // Copied: the composite's layers are reused by its next evaluation.
    return { kind: "texture", texture, transform: [...layer.transform] as unknown as Mat3, opacity: layer.opacity, crop: { ...layer.crop }, flipX: false, flipY: false, shape: layer.shape ? { width: layer.shape.width, height: layer.shape.height, radii: [...layer.shape.radii] as PictureShape["radii"] } : null };
  }

  /** Text `layer` at its exact scale (Export frame), animated as the preview draws it. */
  private async exactText(layer: TextCompositeLayer, layers: Layer[], unpins: (() => void)[]): Promise<void> {
    const text = this.deps.text;
    if (!text) return;
    // Copied before waiting: the composite's layers are reused by the next evaluation.
    const model = [...layer.model] as unknown as Mat3;
    const { opacity, style, scale } = layer;
    const content = layer.text;
    const anim: TextAnimFrame | null = layer.anim && {
      atlas: layer.anim.atlas,
      background: layer.anim.background,
      units: layer.anim.units.map((unit) => ({ ...unit })),
      tint: layer.anim.tint ? { ...layer.anim.tint } : null,
      glyphs: layer.anim.glyphs ? { ...layer.anim.glyphs, draws: layer.anim.glyphs.draws.map((draw) => ({ ...draw })) } : null,
      sweep: layer.anim.sweep ? { color: { ...layer.anim.sweep.color }, rects: layer.anim.sweep.rects.slice(0, layer.anim.sweep.count).map((rect) => ({ ...rect })), count: layer.anim.sweep.count } : null,
    };
    const push = (resolved: ResolvedText, crop: UvRect, rect: Rect, state: UnitState | null, alpha: number) => {
      const out = newTextureLayer();
      if (writeTextQuad(out, model, resolved.texture, crop, rect, resolved.scale, state, alpha)) layers.push(out);
    };
    if (layer.karaoke) {
      const karaoke = {
        ...layer.karaoke,
        box: layer.karaoke.box && { rect: { ...layer.karaoke.box.rect }, color: { ...layer.karaoke.box.color }, radius: layer.karaoke.box.radius },
        unitPaint: [...layer.karaoke.unitPaint],
        wordBoxes: layer.karaoke.wordBoxes && { ...layer.karaoke.wordBoxes, shown: [...layer.karaoke.wordBoxes.shown], activeColor: { ...layer.karaoke.wordBoxes.activeColor } },
      };
      if (style.background.enabled && !karaoke.wordBoxes) {
        const boxes = await text.exact(content, style, scale, "backgrounds");
        if (boxes) {
          unpins.push(boxes.release);
          push(boxes, boxes.crop, boxes.rect, null, opacity);
        }
      }
      const atlas = await text.exact(content, style, scale, "word");
      const playing = karaoke.to > karaoke.from;
      const active = playing ? await text.exact(content, karaoke.style, scale, "word") : null;
      // The other looks of the words, each from its own atlas.
      const looks: (ResolvedText | null)[] = [atlas];
      const paints = karaoke.paints;
      if (paints) for (let k = 1; k < paints.length; k++) looks.push(await text.exact(content, (paints[k] as { style: TextStyle }).style, scale, "word"));
      for (const part of [atlas, active, ...looks.slice(1)]) if (part && "release" in part) unpins.push((part as { release: () => void }).release);
      if (!atlas?.units || (playing && !active?.units)) return;
      if (karaoke.wordBoxes) {
        const boxes = karaoke.wordBoxes;
        for (const word of boxes.shown) {
          const rect = boxes.rects[word];
          if (!rect) continue;
          const box = newSolidLayer();
          writeBox(box, model, rect, word === boxes.active ? boxes.activeColor : boxes.style.color, Math.min(boxes.style.radius, rect.width / 2, rect.height / 2), opacity, boxes.style);
          layers.push(box);
        }
      }
      atlas.units.forEach((cell, i) => {
        if (playing && i >= karaoke.from && i < karaoke.to) return;
        const k = paints ? (karaoke.unitPaint[i] ?? 0) : 0;
        if (k < 0) return;
        const made = looks[k];
        const source = made?.units ? made : atlas;
        const unit = (source.units as ResolvedUnit[])[i] as ResolvedUnit;
        push(source, unit.crop, unit.rect, null, opacity);
      });
      if (karaoke.box) {
        const box = newSolidLayer();
        writeBox(box, model, karaoke.box.rect, karaoke.box.color, karaoke.box.radius, opacity);
        layers.push(box);
      }
      if (active?.units) {
        const state = highlightMove(newUnitState(), karaoke);
        active.units.slice(karaoke.from, karaoke.to).forEach((cell) => push(active, cell.crop, cell.rect, state, opacity));
      }
      return;
    }
    if (anim?.sweep) {
      for (let i = 0; i < anim.sweep.count; i++) {
        const rect = anim.sweep.rects[i];
        if (!rect || rect.width < 0.5) continue;
        const box = newSolidLayer();
        writeBox(box, model, rect, anim.sweep.color, Math.min(rect.height / 4, rect.width / 2), opacity);
        layers.push(box);
      }
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
    const glyphFrame = anim.glyphs;
    const glyphs = glyphFrame ? await text.exact(glyphFrame.text, style, scale, "char") : null;
    if (glyphs) unpins.push(glyphs.release);
    const gcells = glyphs?.units ?? null;
    const moved = newUnitState();
    if (anim.atlas === "glyphs") {
      if (!glyphFrame || !glyphs || !gcells) return;
      const count = Math.min(glyphFrame.draws.length, anim.units.length);
      for (let i = 0; i < count; i++) {
        const state = anim.units[i] as UnitState;
        const draw = glyphFrame.draws[i] as TextGlyphDraw;
        const cell = gcells[draw.glyph] as ResolvedUnit | undefined;
        if (cell && state.opacity > 0) push(glyphs, cell.crop, cell.rect, movedState(moved, state, draw), opacity * state.opacity);
      }
      return;
    }
    const atlas = await text.exact(content, style, scale, anim.atlas);
    if (!atlas?.units) return;
    unpins.push(atlas.release);
    const cells = atlas.units;
    const tint = anim.tint ? await text.exact(content, anim.tint.style, scale, anim.atlas) : null;
    if (tint) unpins.push(tint.release);
    const tcells = tint?.units ?? null;
    const count = Math.min(cells.length, anim.units.length);
    for (let i = 0; i < count; i++) {
      const state = anim.units[i] as UnitState;
      if (!(state.opacity > 0)) continue;
      const draw = glyphFrame?.draws[i];
      const swapped = draw !== undefined && draw.glyph >= 0 ? (gcells?.[draw.glyph] as ResolvedUnit | undefined) : undefined;
      if (swapped && glyphs && draw) {
        push(glyphs, swapped.crop, swapped.rect, movedState(moved, state, draw), opacity * state.opacity);
        continue;
      }
      const cell = cells[i] as ResolvedUnit;
      push(atlas, cell.crop, cell.rect, state, opacity * state.opacity);
      const over = tcells?.[i];
      if (tint && over && state.tint > 0) push(tint, over.crop, over.rect, state, opacity * state.opacity * state.tint);
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
      if (layer.lottie) this.lottieDetail(layer);
      key = this.deps.images.frameKey(mediaId, layer.timeUs, layer.lottie ? layer.clipId : undefined);
      texture = key ? this.deps.pool.get(key) : null;
      if (!texture) this.loadImage(mediaId);
      else if (priority === "idle" && !layer.lottie) this.refineVector(layer, texture, this.textScale);
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
          // A crashed decode worker (twice in a row): nothing is wrong with the media, ask again soon.
          else if (isWorkerCrash(error)) this.retryLater();
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
        if (isWorkerCrash(error)) this.retryLater();
        // A proxy that does not open: the frame service routes the media to its full file.
        else if (lod === "proxy") this.deps.onChange();
        else this.fail(mediaId, error instanceof Error ? error.message : String(error));
      },
    );
  }

  /**
   * An SVG drawn bigger than its raster holds (spec §7.1), or much smaller: rasterized again at the size
   * it is drawn at render scale `scale`.
   */
  private refineVector(layer: MediaLayer, texture: TextureHandle, scale: number): void {
    const { mediaId } = layer;
    const size = this.deps.images.vectorSize(mediaId);
    if (!size || this.refining.has(mediaId)) return;
    const want = vectorLongEdge(layer, size.width, size.height, scale);
    const have = Math.max(texture.width, texture.height);
    if (have >= want * DETAIL_TOLERANCE && have <= want * VECTOR_OVERSIZE) return;
    this.refining.add(mediaId);
    this.deps.images.refine(mediaId, want).then(
      (refined) => {
        this.refining.delete(mediaId);
        if (refined && refined !== texture) this.deps.onChange();
      },
      () => this.refining.delete(mediaId),
    );
  }

  /** A Lottie layer drawn bigger than its frames hold, or much smaller: its next frames are rendered at the size it is drawn at (Batch 79). */
  private lottieDetail(layer: MediaLayer): void {
    const { mediaId } = layer;
    const lottie = this.deps.images.lottie;
    const size = lottie?.size(mediaId);
    if (!lottie || !size) return;
    const want = vectorLongEdge(layer, size.width, size.height, this.textScale);
    const have = lottie.edgeOf(mediaId);
    if (have >= want * DETAIL_TOLERANCE && have <= want * VECTOR_OVERSIZE) return;
    lottie.setEdge(mediaId, want);
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

  private retryLater(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.deps.onChange();
    }, CRASH_RETRY_MS);
  }

  private fail(mediaId: MediaId, reason: string): void {
    if (this.failed.has(mediaId)) return;
    this.failed.add(mediaId);
    this.stats.failed = this.failed.size;
    // Offline and undecodable media render as a labeled gray slate (§6.19): the compositor draws it.
    console.warn(`[preview] cannot show media ${mediaId}: ${reason}`);
    this.deps.onFail?.(mediaId, reason);
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
    // The picture's rounded corners (Batch 58), in the slot's own object (no per-frame allocation).
    const frame = layer.shape;
    if (frame) {
      const value = (slot.shapeValue ??= { width: 0, height: 0, radii: [0, 0, 0, 0] });
      value.width = frame.width;
      value.height = frame.height;
      for (let i = 0; i < 4; i++) value.radii[i] = frame.radii[i] as number;
      shown.shape = value;
    } else shown.shape = null;
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

/** A pooled group layer: its layers and its matte's live in their own lists (the list's array is the layer's). */
type WritableGroupLayer = Omit<GroupLayer, "layers" | "matte"> & {
  layers: Layer[];
  matte: GroupLayer["matte"];
  matteValue: { mode: MatteMode; layers: Layer[]; mask: MaskFrame | null };
  list: WritableList;
  matteList: WritableList;
};

function newGroupLayer(): WritableGroupLayer {
  const list = newList();
  const matteList = newList();
  return { kind: "group", transform: mutableIdentity(), opacity: 1, persp: null, blend: "normal", mask: null, effects: null, layers: list.layers, matte: null, matteValue: { mode: "alpha", layers: matteList.layers, mask: null }, list, matteList };
}

/** A copy of a mask frame (export holds its layers across awaits; the compositor reuses its frames). */
function copyMaskFrame(mask: MaskFrame): MaskFrame {
  return { ...mask, data: mask.data.slice(0, mask.length), model: [...mask.model] as unknown as MaskFrame["model"], persp: mask.persp ? ([...mask.persp] as unknown as MaskFrame["persp"]) : null };
}

/** A copy of an effect frame (export holds its layers across awaits; the compositor reuses its frames). */
function copyEffectFrame(effects: EffectFrame): EffectFrame {
  return { ...effects, data: effects.data.slice(0, effects.length), model: [...effects.model] as unknown as EffectFrame["model"], persp: effects.persp ? ([...effects.persp] as unknown as EffectFrame["persp"]) : null };
}

function newTextureLayer(): WritableTextureLayer {
  return { kind: "texture", texture: NO_TEXTURE, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false, blur: 0 };
}

type WritableSolidLayer = Omit<SolidLayer, "transform" | "shape"> & { transform: MutableMat3; shape: SolidGeometry; styleValue?: SolidStyle; strokeValue?: StrokeStyle; shadowValue?: ShadowStyle };

type WritableDissolveLayer = Omit<DissolveLayer, "transform"> & { transform: MutableMat3 };

function newDissolveLayer(): WritableDissolveLayer {
  return { kind: "dissolve", transform: mutableIdentity(), opacity: 1, from: newTextureLayer(), to: newTextureLayer(), mix: 0, fx: transitionFx({ kind: "crossDissolve" }) };
}

/** `out` mixing `from` and `to` (as each would draw alone) by `mix`, over the `width` x `height` frame. */
function writeDissolve(out: WritableDissolveLayer, from: TextureLayer, to: TextureLayer, mix: number, width: number, height: number, fx: TransitionFx): DissolveLayer {
  out.fx = fx;
  setMat(out.transform, width, 0, 0, height, 0, 0);
  out.opacity = 1;
  out.from = from;
  out.to = to;
  out.mix = mix;
  out.persp = null;
  return out;
}

/** Sets the 2.5D projection of the layers from `start` on (spec §21.15). */
function project(layers: Layer[], start: number, persp: Homography | null | undefined): void {
  for (let i = start; i < layers.length; i++) (layers[i] as { persp?: Homography | null }).persp = persp ?? null;
}

function copyPersp(persp: Homography | null | undefined): Homography | null {
  return persp ? ([...persp] as Homography) : null;
}

const samePersp = (a: Homography | null | undefined, b: Homography | null | undefined) => (a ?? null) === (b ?? null) || (!!a && !!b && a.every((value, i) => value === b[i]));

/**
 * A cross dissolve: one dissolve layer when both sides share their 2.5D projection (flat, or one clip cut in
 * two); otherwise each side drawn alone in its own projection, faded by the mix (spec §21.15, Batch 70 deviation).
 */
function pushDissolve(layers: Layer[], out: WritableDissolveLayer, from: TextureLayer, to: TextureLayer, layer: { mix: number; fx: TransitionFx; from: { persp?: Homography | null }; to: { persp?: Homography | null } }, composite: Composite): void {
  if (samePersp(layer.from.persp, layer.to.persp)) {
    layers.push(writeDissolve(out, from, to, layer.mix, composite.width, composite.height, layer.fx));
    project(layers, layers.length - 1, layer.from.persp);
    return;
  }
  const a = { ...from, opacity: from.opacity * (1 - layer.mix), persp: layer.from.persp ?? null };
  const b = { ...to, opacity: to.opacity * layer.mix, persp: layer.to.persp ?? null };
  layers.push(a, b);
}

function newSolidLayer(): WritableSolidLayer {
  return { kind: "solid", transform: mutableIdentity(), opacity: 1, color: { r: 0, g: 0, b: 0, a: 0 }, shape: { kind: "box", width: 0, height: 0, radius: 0 } };
}

/** `out` as a box over `rect` (content px of `model`) in `color`, its corners rounded by `radius` (anti-aliased). */
function writeBox(out: WritableSolidLayer, model: Mat3, rect: Rect, color: SolidLayer["color"], radius: number, opacity: number, box: TextStyle["background"] | null = null): void {
  multiplyInto(out.transform, model, setMat(out.transform, rect.width, 0, 0, rect.height, rect.x, rect.y));
  out.color = color;
  out.opacity = opacity;
  out.shape.width = rect.width;
  out.shape.height = rect.height;
  out.shape.radius = radius;
  // A text box's border (inside its edge) and shadow, as its raster draws them.
  const stroke = box?.stroke;
  const shadow = box?.shadow;
  const border = stroke !== undefined && stroke.enabled && stroke.width > 0 && stroke.color.a > 0 ? stroke : null;
  const drop = shadow !== undefined && shadow.enabled && shadow.color.a > 0 ? shadow : null;
  if (!border && !drop) {
    out.style = null;
    return;
  }
  const style = (out.styleValue ??= { gradient: null, stroke: null, shadow: null, part: "all" });
  if (border) {
    const value = (out.strokeValue ??= { width: 0, color: border.color, align: "inside" });
    value.width = border.width;
    value.color = border.color;
    style.stroke = value;
  } else style.stroke = null;
  if (drop) {
    const value = (out.shadowValue ??= { x: 0, y: 0, blur: 0, spread: 0, color: drop.color });
    value.x = drop.x;
    value.y = drop.y;
    value.blur = drop.blur;
    value.color = drop.color;
    style.shadow = value;
  } else style.shadow = null;
  out.style = style;
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

/** `out` as `state` for a glyph drawn in a unit place: moved by the draw shift, turning and scaling about the unit middle. */
function movedState(out: UnitState, state: UnitState, draw: TextGlyphDraw): UnitState {
  Object.assign(out, state);
  out.x = state.x + draw.dx;
  out.y = state.y + draw.dy;
  out.ox = state.ox - draw.dx;
  out.oy = state.oy - draw.dy;
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
  if (state && !state.masked && (state.scale !== 1 || state.x !== 0 || state.y !== 0 || state.rotation !== 0)) {
    const s = state.scale;
    if (state.rotation === 0) multiplyInto(m, setMat(unitMove, s, 0, 0, s, state.ox * (1 - s) + state.x, state.oy * (1 - s) + state.y), m);
    else {
      // Scale and rotate about the unit middle, then move.
      const r = state.rotation * (Math.PI / 180);
      const c = Math.cos(r) * s;
      const n = Math.sin(r) * s;
      multiplyInto(m, setMat(unitMove, c, n, -n, c, state.ox - (c * state.ox - n * state.oy) + state.x, state.oy - (n * state.ox + c * state.oy) + state.y), m);
    }
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
