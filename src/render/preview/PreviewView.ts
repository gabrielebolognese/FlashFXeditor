// The preview canvas (spec §7.1, §7.5, §9.4, §3.4, P3, P8): a framework-free WebGPU canvas in the
// preview panel showing the composite of the timeline at the playhead, letterboxed at Fit (or at the
// session zoom and pan) on the DS background with a 1 px DS border, at devicePixelRatio.
// - It draws only from the FrameScheduler's `preview` flag. The playhead, document changes that can
//   change the frame (timeline, clips, tracks, media, settings, composite), late frames, a resize, a
//   zoom or pan, the quality mode, the theme, the DPR, a new GPU device and a priority change (pause)
//   invalidate it.
// - Each render evaluates the document at the playhead (`Compositor`), resolves media layers to pool
//   textures (`LayerTextures`: playback priority while playing, scrub while the ruler is dragged or an
//   edge trimmed, idle otherwise), warms the cut neighbours (not while playing: the engine's lookahead
//   does), and draws. While a trim runs, `override` gives the document and frame to show instead;
//   with `previewSplit` (rolls, slips, slides, spec §6.10) it shows two frames side by side, each
//   fitted (or at the zoom) in its half of the canvas: two evaluations, one texture pass, one draw.
//   While a canvas gesture or a properties field scrub runs (spec §7.3, §11, P2), `transforms`,
//   `opacities`, `crops` and `texts` give the layers' ephemeral values.
// - Text layers (spec §10.1) are drawn from the text raster cache at the render scale (detail on
//   zoom re-rasterizes them); Export frame waits for their fonts.
//   A pause leaves the playhead where it is, but playback may have held a track's previous layer
//   there (shuttle speeds deliver every n-th frame): the render after it requests the exact frame.
//   When the draw list, the viewport and the render scale equal the last ones drawn, the GPU draw is
//   skipped (§9.4).
// - Detail on zoom (§7.1 BINDING, see detail.ts): each render picks a render scale from the view
//   scale, the source detail of the visible media and the quality mode. Below the view scale (a
//   reduced mode, or a zoom past the source detail) the visible part of the frame is drawn into an
//   offscreen target at that scale (at most 4096 px on its long side) and blitted onto the canvas as
//   one texture layer; at the view scale itself it is drawn straight onto the canvas (the same pixels
//   without the copy). At rest, frames the pool holds smaller than the detail needs are decoded again
//   (`LayerTextures`); `uploadLongEdge` gives the frame service the upload size. Auto goes back to
//   full 300 ms after playback or a scrub (a timer redraws then).
// - Proxies (spec §7.5, §9.5, detail.ts `wantedLod`): each pass asks for the frames of the lod the
//   quality mode wants for what the preview is doing: in Auto proxies while playing or scrubbing, full
//   frames from the moment either ends (the proxy frame shows until the full one is decoded). A scrub
//   or trim that has not moved the frame for AUTO_SETTLE_MS is at rest. `behind` names the media
//   whose playback fell behind (1/2 and 1/4 switch them to their proxy). The status text reads
//   `Auto: proxy` while proxy frames are drawn.
// - `firstShown` reports what the first render of each playhead frame drew, for the playback
//   engine's dropped-frame count.
// - `renderFrame` (Export frame) draws the frame at the playhead from exact full-resolution frames at
//   project size, whatever the quality mode and whatever is on screen.
// - The backing store is resized inside `render`, so a resize never shows a cleared canvas.
import type { ClipId, Crop, Frame, Project, RGBA, TextStyle, Transform } from "../../core/document/types.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { createStore, type Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { PreviewQuality, PreviewSession, SessionState } from "../../core/store/sessionStore.js";
import { cssColorToRgba } from "../../core/theme/cssColor.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { Compositor, type LiveText } from "../compositor/Compositor.js";
import type { Composite, DrawList, Layer, TextureLayer } from "../compositor/drawList.js";
import { DrawListSnapshot } from "../compositor/DrawListSnapshot.js";
import type { FramePriority } from "../../media/workers/protocol.js";
import type { CanvasTarget, OffscreenTarget, Pane, Renderer, TextureHandle, Viewport } from "../gpu/renderer.js";
import { mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import { AUTO_SETTLE_MS, DETAIL_MAX_SIZE, fullScale, qualityLabel, renderScale, sourceDetail, uploadLongEdge, wantedLod, type PreviewActivity } from "./detail.js";
import { LayerTextures, type LayerTexturesDeps, type LayerTexturesStats } from "./LayerTextures.js";
import { deviceSizeInto, frameTransformInto, type Size } from "./viewport.js";

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export interface PreviewViewDeps extends Omit<LayerTexturesDeps, "onChange" | "wantedLod"> {
  renderer: Renderer;
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  layout: Store<LayoutState>;
  session: Store<SessionState>;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** How frames are asked for now: `playback` while playing, `scrub` while the ruler is dragged, else `idle`. */
  priority(): FramePriority;
  /** Calls `listener` when `priority()` may have changed (play, pause, the end of a scrub or a trim). */
  watchPriority(listener: () => void): () => void;
  /**
   * What to show instead of the document at the playhead (a trim's proposed document at its new edge
   * frame, spec §6.10; with `previewSplit`, two frames side by side), or null. The owner invalidates
   * `preview` when it changes.
   */
  override?(): { project: Project; frame: Frame; previewSplit?: { leftFrame: Frame; rightFrame: Frame } | null } | null;
  /** Ephemeral transforms by clip id (the gizmo, spec §7.3; a properties field scrub, §11), or null. The owner invalidates `preview` when they change. */
  transforms?(): ReadonlyMap<ClipId, Transform> | null;
  /** A properties field scrub's ephemeral opacities by clip id (§11), or null. The owner invalidates `preview` when they change. */
  opacities?(): ReadonlyMap<ClipId, number> | null;
  /** Ephemeral crops by clip id (a crop handle drag, §7.3; a Crop field scrub, §11), or null. The owner invalidates `preview` when they change. */
  crops?(): ReadonlyMap<ClipId, Crop> | null;
  /** The project background while the color picker is dragged (§11), or null. The owner invalidates `preview` when it changes. */
  background?(): RGBA | null;
  /** A Text field scrub's ephemeral texts and styles by clip id (§11), or null. The owner invalidates `preview` when they change. */
  texts?(): ReadonlyMap<ClipId, LiveText> | null;
  /** Loads the fonts of `style` for `text` (Export frame); resolves true when it had to wait for them. */
  loadFonts?(style: TextStyle, text: string): Promise<boolean>;
  /** True when playback fell behind on the media this playback (1/2 and 1/4 then play its proxy). */
  behind?(mediaId: string): boolean;
  /** Clock of the Auto settle time (ms); `performance.now` by default. */
  now?(): number;
}

type PaneViewport = Viewport & { transform: MutableMat3; border: { color: RGBA; width: number } };

const newViewport = (): PaneViewport => ({ transform: mutableIdentity(), outside: TRANSPARENT, border: { color: TRANSPARENT, width: 1 } });

type WritableTextureLayer = Omit<TextureLayer, "transform" | "texture"> & { transform: MutableMat3; texture: TextureHandle };

/** What the first render of a playhead frame drew (later renders of the same frame do not change it). */
export interface FirstShown {
  frame: Frame;
  /** Media layers, and those drawn with their exact frame. */
  layers: number;
  exact: number;
}

/** What the last single-frame render did about detail (spec §7.1). */
export interface PreviewDetail {
  /** Device px per project px of the view. */
  view: number;
  /** Source px per project px of the most detailed media layer (at least 1). */
  source: number;
  /** Full-quality and actual render scales. */
  full: number;
  render: number;
  activity: PreviewActivity;
  /** Long edge video frames are uploaded at. */
  upload: number;
  /** The offscreen part of the frame drawn at `render` (device px); 0 x 0 when drawn straight onto the canvas. */
  offscreenWidth: number;
  offscreenHeight: number;
}

export interface PreviewStats {
  /** GPU draws issued. */
  renders: number;
  /** Renders that drew nothing because the frame was identical to the one on screen. */
  skipped: number;
  /** Panel size changes seen (each should cost one render). */
  resizes: number;
  /** Duration of the last evaluate + resolve + draw. */
  ms: number;
  /** Backing store in device px. */
  width: number;
  height: number;
  dpr: number;
  textures: LayerTexturesStats;
  detail: PreviewDetail;
}

/** The project frame on the canvas: project px -> canvas device px, and the canvas size. */
export interface PreviewPlacement {
  transform: Mat3;
  width: number;
  height: number;
  dpr: number;
}

interface Chrome {
  outside: RGBA;
  border: RGBA;
  margin: number;
}

export class PreviewView implements RenderView {
  private canvas: HTMLCanvasElement | null = null;
  private target: CanvasTarget | null = null;
  private cssSize: Size = { width: 0, height: 0 };
  private readonly size: Size = { width: 0, height: 0 };
  private readonly transform = mutableIdentity();
  private chrome: Chrome;
  private readonly compositor = new Compositor();
  private readonly textures: LayerTextures;
  private readonly snapshot = new DrawListSnapshot();
  private readonly viewport: PaneViewport = newViewport();
  private viewportDrawn = false;
  // The split preview: the right frame's compositor and snapshot, the two panes, whether it is on screen.
  private readonly rightCompositor = new Compositor();
  private readonly rightSnapshot = new DrawListSnapshot();
  private readonly panes: [Pane & { viewport: PaneViewport }, Pane & { viewport: PaneViewport }] = [
    { list: EMPTY_LIST, viewport: newViewport(), bounds: { x: 0, y: 0, width: 0, height: 0 } },
    { list: EMPTY_LIST, viewport: newViewport(), bounds: { x: 0, y: 0, width: 0, height: 0 } },
  ];
  private readonly paneTransform = mutableIdentity();
  private splitDrawn = false;
  /** The priority of the last render. */
  private drawnPriority: FramePriority = "idle";
  // Detail renders: the offscreen target, its pane and the list that blits it onto the canvas.
  private offscreen: OffscreenTarget | null = null;
  private readonly offscreenPane: Pane & { viewport: Viewport & { transform: MutableMat3 } } = {
    list: EMPTY_LIST,
    viewport: { transform: mutableIdentity(), outside: TRANSPARENT, border: null },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  };
  private readonly offscreenPanes: readonly Pane[] = [this.offscreenPane];
  private readonly blitLayer: WritableTextureLayer = { kind: "texture", texture: NO_TEXTURE, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false };
  private readonly blitList: DrawList & { layers: Layer[] } = { width: 0, height: 0, background: TRANSPARENT, layers: [this.blitLayer] };
  /** The offscreen render scale and origin drawn last; scale 0 when drawn straight onto the canvas. */
  private readonly drawnOffscreen = { scale: 0, x: 0, y: 0, width: 0, height: 0 };
  /** Auto settle: playback or a scrub last seen + AUTO_SETTLE_MS, and the timer redrawing then. */
  private activeUntil = -Infinity;
  /** The frame shown last and when it last changed (a scrub at rest). */
  private shownFrame: Frame = -1;
  private lastMove = -Infinity;
  /** What this pass resolves frames for: the quality mode and the activity (the lod rule). */
  private passQuality: PreviewQuality = "auto";
  private passActivity: PreviewActivity = "idle";
  /** Evaluates Export frame's composite apart from the view's. */
  private readonly exportCompositor = new Compositor();
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly viewListeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  readonly stats: PreviewStats;
  readonly firstShown: FirstShown = { frame: -1, layers: 0, exact: 0 };
  /** The status strip's quality text (§13), changed only when it reads differently. */
  readonly quality: Store<string> = createStore("Auto: full");

  constructor(private readonly deps: PreviewViewDeps) {
    this.chrome = chromeFromTheme(deps.theme.theme);
    this.textures = new LayerTextures({
      frames: deps.frames,
      images: deps.images,
      pool: deps.pool,
      ...(deps.text && { text: deps.text }),
      onChange: () => deps.scheduler.invalidate("preview"),
      wantedLod: (mediaId) => wantedLod(this.passQuality, this.passActivity, deps.behind?.(mediaId) ?? false),
    });
    this.now = deps.now ?? (() => performance.now());
    this.stats = {
      renders: 0,
      skipped: 0,
      resizes: 0,
      ms: 0,
      width: 0,
      height: 0,
      dpr: 1,
      textures: this.textures.stats,
      detail: { view: 1, source: 1, full: 1, render: 1, activity: "idle", upload: 0, offscreenWidth: 0, offscreenHeight: 0 },
    };
  }

  /** Creates the canvas inside `host` and starts following the playhead, the document, the panel, the view and theme. */
  mount(host: HTMLElement): () => void {
    this.unmount();
    const { renderer, scheduler, layout, session, document, theme } = this.deps;
    const canvas = host.ownerDocument.createElement("canvas");
    canvas.style.display = "block";
    host.append(canvas);
    this.canvas = canvas;
    this.target = renderer.createCanvasTarget(canvas);
    const invalidate = () => scheduler.invalidate("preview");
    this.stops.push(
      scheduler.register("preview", this),
      layout.select(
        (state) => state.panels.preview,
        (size) => {
          this.cssSize = size;
          this.stats.resizes += 1;
          invalidate();
        },
        { fireImmediately: true },
      ),
      session.select((state) => state.playhead, invalidate),
      session.select((state) => state.preview.zoom, invalidate),
      session.select((state) => state.preview.panX, invalidate),
      session.select((state) => state.preview.panY, invalidate),
      session.select((state) => state.preview.quality, invalidate),
      // Back from `playback`, the frame on screen may be a held layer that was never requested; back
      // from a scrub, Auto asks for the full frame at once.
      this.deps.watchPriority(() => {
        if (this.deps.priority() !== this.drawnPriority) invalidate();
      }),
      document.subscribe(invalidate, { affects: ["timeline", "clips", "tracks", "media", "settings", "composite"] }),
      theme.subscribe((next) => {
        this.chrome = chromeFromTheme(next);
        invalidate();
      }),
      renderer.subscribe((event) => {
        // A new device: the canvas was reconfigured (cleared) and the pool emptied. The slots' layers
        // hold textures of the lost device, and a request that failed meanwhile (device not ready)
        // must be asked again: the slots start over.
        if (event === "ready") {
          this.textures.clear();
          this.snapshot.reset();
          this.drawnOffscreen.scale = -1;
        }
        invalidate();
      }),
      watchDevicePixelRatio(host.ownerDocument.defaultView, invalidate),
    );
    invalidate();
    return () => this.unmount();
  }

  render(): void {
    const { canvas, target } = this;
    if (!canvas || !target) return;
    const started = performance.now();
    const { renderer, document, session } = this.deps;
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const size = deviceSizeInto(this.size, this.cssSize, dpr);
    let resized = false;
    if (size.width !== this.stats.width || size.height !== this.stats.height || dpr !== this.stats.dpr) {
      renderer.resize(target, size.width, size.height);
      canvas.style.width = `${this.cssSize.width}px`;
      canvas.style.height = `${this.cssSize.height}px`;
      this.stats.width = size.width;
      this.stats.height = size.height;
      this.stats.dpr = dpr;
      resized = true;
    }

    const override = this.deps.override?.() ?? null;
    const doc = override?.project ?? document.getState();
    const { playhead, preview } = session.getState();
    const frame = override?.frame ?? playhead;
    const priority = this.deps.priority();
    this.drawnPriority = priority;
    if (frame !== this.shownFrame) {
      this.shownFrame = frame;
      this.lastMove = this.now();
    }
    const activity = this.activity(priority);
    this.passQuality = preview.quality;
    this.passActivity = activity;
    const split = override?.previewSplit ?? null;
    if (split) {
      this.renderSplit(doc, split.leftFrame, split.rightFrame, preview, priority, size, dpr, resized, started);
      return;
    }
    const composite = this.compositor.evaluate(
      doc,
      frame,
      override ? null : (this.deps.transforms?.() ?? null),
      override ? null : (this.deps.opacities?.() ?? null),
      override ? null : (this.deps.crops?.() ?? null),
      override ? null : (this.deps.texts?.() ?? null),
    );
    const background = override ? null : (this.deps.background?.() ?? null);
    if (background) composite.background = background;
    const transform = frameTransformInto(this.transform, preview.zoom, composite, size, this.chrome.margin * dpr, preview.panX, preview.panY);
    const scale = this.detailOf(doc, composite, transform[0], preview, activity);
    const list = this.textures.resolve(composite, priority, this.stats.detail.upload, this.textScale(composite, transform, size, scale));
    this.showQuality(preview.quality);
    if (priority !== "playback") this.textures.warm(this.compositor.neighbors(doc, frame));
    const shown = this.firstShown;
    if (!override && shown.frame !== playhead) {
      shown.frame = playhead;
      shown.layers = this.textures.stats.layers;
      shown.exact = this.textures.stats.exact;
    }

    const viewChanged = this.updateViewport(this.viewport, transform, Math.max(1, Math.round(dpr))) || !this.viewportDrawn;
    const listChanged = this.snapshot.update(list);
    const offscreenChanged = this.placeOffscreen(list, transform, size, scale);
    // Back from a split, the screen shows two frames whatever the snapshot holds.
    const wasSplit = this.splitDrawn;
    if (!listChanged && !viewChanged && !resized && !offscreenChanged && !wasSplit) {
      this.stats.skipped += 1;
      this.stats.ms = performance.now() - started;
      return;
    }
    if (this.draw(list, target)) {
      this.stats.renders += 1;
      this.viewportDrawn = true;
      this.splitDrawn = false;
    } else {
      this.snapshot.reset();
      this.drawnOffscreen.scale = -1;
    }
    this.stats.ms = performance.now() - started;
    if (viewChanged || resized || wasSplit) for (const listener of [...this.viewListeners]) listener();
  }

  /**
   * Device px per project px text is rasterized at: the render scale, as the offscreen part will be
   * drawn (its 4096 px cap lowers it, see `placeOffscreen`).
   */
  private textScale(frame: Size, transform: Mat3, size: Size, scale: number): number {
    const view = transform[0];
    if (!(scale < view - 1e-6)) return scale;
    const x0 = Math.max(0, -transform[4] / view);
    const y0 = Math.max(0, -transform[5] / transform[3]);
    const x1 = Math.min(frame.width, (size.width - transform[4]) / view);
    const y1 = Math.min(frame.height, (size.height - transform[5]) / transform[3]);
    const longest = Math.max(x1 - x0, y1 - y0) * scale;
    const limit = Math.min(DETAIL_MAX_SIZE, this.deps.renderer.maxTextureSize) - 2;
    return longest > limit ? scale * (limit / longest) : scale;
  }

  /** Draws `list` onto the canvas: through the offscreen target when one is placed, else directly. */
  private draw(list: DrawList, target: CanvasTarget): boolean {
    const { renderer } = this.deps;
    const offscreen = this.offscreen;
    if (this.drawnOffscreen.scale <= 0 || !offscreen) return renderer.draw(list, target, this.viewport);
    this.offscreenPane.list = list;
    if (!renderer.drawPanes(this.offscreenPanes, offscreen)) return false;
    // The pass may have replaced a texture of a lost device: read it after drawing.
    const texture = offscreen.texture;
    const blit = this.blitLayer;
    blit.texture = texture;
    blit.crop.u1 = this.drawnOffscreen.width / texture.width;
    blit.crop.v1 = this.drawnOffscreen.height / texture.height;
    this.blitList.width = list.width;
    this.blitList.height = list.height;
    return renderer.draw(this.blitList, target, this.viewport);
  }

  /**
   * Places the offscreen render of this frame (spec §7.1): the visible part of the frame at `scale`
   * when it is under the view scale, none otherwise. Returns true when it differs from the last one.
   */
  private placeOffscreen(list: DrawList, transform: Mat3, size: Size, scale: number): boolean {
    const drawn = this.drawnOffscreen;
    const previous = drawn.scale;
    const detail = this.stats.detail;
    const view = transform[0];
    const x0 = Math.max(0, -transform[4] / view);
    const y0 = Math.max(0, -transform[5] / transform[3]);
    const x1 = Math.min(list.width, (size.width - transform[4]) / view);
    const y1 = Math.min(list.height, (size.height - transform[5]) / transform[3]);
    if (!(scale < view - 1e-6) || x1 <= x0 || y1 <= y0) {
      detail.offscreenWidth = 0;
      detail.offscreenHeight = 0;
      drawn.scale = 0;
      return previous !== 0;
    }
    // At most DETAIL_MAX_SIZE (and the device limit) on the long side.
    const limit = Math.min(DETAIL_MAX_SIZE, this.deps.renderer.maxTextureSize);
    let r = scale;
    const longest = Math.max(x1 - x0, y1 - y0) * r;
    if (longest > limit - 2) r *= (limit - 2) / longest;
    const ox = Math.floor(x0 * r);
    const oy = Math.floor(y0 * r);
    const width = Math.max(1, Math.ceil(x1 * r) - ox);
    const height = Math.max(1, Math.ceil(y1 * r) - oy);
    this.ensureOffscreen(width, height);
    const changed = previous !== r || drawn.x !== ox || drawn.y !== oy || drawn.width !== width || drawn.height !== height;
    drawn.scale = r;
    drawn.x = ox;
    drawn.y = oy;
    drawn.width = width;
    drawn.height = height;
    detail.render = r;
    detail.offscreenWidth = width;
    detail.offscreenHeight = height;
    const pane = this.offscreenPane;
    setMat(pane.viewport.transform, r, 0, 0, r, -ox, -oy);
    pane.bounds.width = width;
    pane.bounds.height = height;
    // The blit: the offscreen part back onto its project rectangle.
    setMat(this.blitLayer.transform, width / r, 0, 0, height / r, ox / r, oy / r);
    return changed;
  }

  /** The offscreen target, grown (never shrunk while mounted) to hold `width` x `height`. */
  private ensureOffscreen(width: number, height: number): void {
    const { renderer } = this.deps;
    const current = this.offscreen;
    if (current && current.width >= width && current.height >= height) return;
    // Rounded up, so a wheel zoom does not reallocate on every step.
    const w = Math.min(renderer.maxTextureSize, Math.max(current?.width ?? 0, Math.ceil(width / 256) * 256));
    const h = Math.min(renderer.maxTextureSize, Math.max(current?.height ?? 0, Math.ceil(height / 256) * 256));
    if (current) renderer.resize(current, w, h);
    else this.offscreen = renderer.createOffscreenTarget(w, h);
  }

  /**
   * What the preview is doing for the quality rules: Auto stays reduced AUTO_SETTLE_MS after playback
   * or a scrub (§8); a scrub (or trim) whose frame has not moved for AUTO_SETTLE_MS is at rest (§7.5
   * "full resolution when paused for 300 ms").
   */
  private activity(priority: FramePriority): PreviewActivity {
    const now = this.now();
    if (priority === "playback") {
      this.activeUntil = now + AUTO_SETTLE_MS;
      return "playing";
    }
    if (priority === "scrub") {
      const rest = this.lastMove + AUTO_SETTLE_MS;
      if (now >= rest) return "idle";
      this.activeUntil = rest;
      this.wakeAt(rest - now);
      return "scrubbing";
    }
    if (now >= this.activeUntil) return "idle";
    this.wakeAt(this.activeUntil - now);
    return "settling";
  }

  /** Redraws `ms` from now (the settle or rest time ends), unless a redraw is already timed. */
  private wakeAt(ms: number): void {
    if (this.settleTimer !== null) return;
    this.settleTimer = setTimeout(
      () => {
        this.settleTimer = null;
        this.deps.scheduler.invalidate("preview");
      },
      Math.ceil(ms),
    );
  }

  /** The status strip's text for this pass (after the frames are resolved: proxies drawn or not). */
  private showQuality(mode: PreviewQuality): void {
    const label = qualityLabel(mode, this.stats.detail, this.textures.stats.proxy > 0);
    if (this.quality.getState() !== label) this.quality.set(label);
  }

  /** The render scale of this frame (detail.ts) into `stats.detail`, with the upload size and the status text. */
  private detailOf(doc: Project, composite: Composite, view: number, preview: PreviewSession, activity: PreviewActivity): number {
    const detail = this.stats.detail;
    const source = sourceDetail(composite, (mediaId) => {
      const item = doc.media[mediaId];
      return item?.width && item.height ? { width: item.width, height: item.height } : null;
    });
    const full = fullScale(view, source);
    const render = renderScale(preview.quality, activity, full);
    const { width, height } = doc.settings;
    detail.view = view;
    detail.source = source;
    detail.full = full;
    detail.render = render;
    detail.activity = activity;
    detail.upload = uploadLongEdge(Math.max(width, height), preview.quality, activity, render, this.deps.renderer.maxTextureSize);
    return render;
  }

  /**
   * The split preview (spec §6.10): `leftFrame` and `rightFrame` of `doc` side by side, each frame
   * placed in its half of the canvas as the single view places it in the whole (Fit with the margin,
   * or the zoom and pan, centered), the border around each. Drawn straight onto the canvas.
   */
  private renderSplit(doc: Project, leftFrame: Frame, rightFrame: Frame, preview: PreviewSession, priority: FramePriority, size: Size, dpr: number, resized: boolean, started: number): void {
    const { renderer } = this.deps;
    const target = this.target as CanvasTarget;
    const half = Math.floor(size.width / 2);
    const left = this.compositor.evaluate(doc, leftFrame);
    // Text rasters at the panes' view scale.
    const paneScale = frameTransformInto(this.paneTransform, preview.zoom, left, { width: half, height: size.height }, this.chrome.margin * dpr, preview.panX, preview.panY)[0];
    const lists = this.textures.resolveSplit(left, this.rightCompositor.evaluate(doc, rightFrame), priority, 0, paneScale);
    const borderWidth = Math.max(1, Math.round(dpr));
    const wasSplit = this.splitDrawn;
    let changed = resized || !wasSplit;
    for (let i = 0; i < 2; i++) {
      const pane = this.panes[i as 0 | 1];
      const list = lists[i as 0 | 1];
      pane.list = list;
      pane.bounds.x = i === 0 ? 0 : half;
      pane.bounds.width = i === 0 ? half : size.width - half;
      pane.bounds.height = size.height;
      const transform = frameTransformInto(this.paneTransform, preview.zoom, list, pane.bounds, this.chrome.margin * dpr, preview.panX, preview.panY);
      transform[4] += pane.bounds.x;
      if (this.updateViewport(pane.viewport, transform, borderWidth)) changed = true;
    }
    if (this.snapshot.update(lists[0])) changed = true;
    if (this.rightSnapshot.update(lists[1])) changed = true;
    if (!changed) {
      this.stats.skipped += 1;
      this.stats.ms = performance.now() - started;
      return;
    }
    if (renderer.drawPanes(this.panes, target)) {
      this.stats.renders += 1;
      this.splitDrawn = true;
      // The single view draws again in full when the split ends.
      this.drawnOffscreen.scale = -1;
    } else {
      this.snapshot.reset();
      this.rightSnapshot.reset();
    }
    this.stats.ms = performance.now() - started;
    if (!wasSplit && this.splitDrawn) for (const listener of [...this.viewListeners]) listener();
  }

  /**
   * The frame at the playhead at project size with straight alpha (Export frame): every video layer
   * from its exact full-resolution frame at the video's own size (at most DETAIL_MAX_SIZE; decoded
   * again when the pool holds it smaller or only has its proxy), whatever the quality mode. Overlays
   * are never in it.
   */
  async renderFrame(): Promise<ImageBitmap> {
    const { renderer, document, session } = this.deps;
    const doc = document.getState();
    const frame = session.getState().playhead;
    let composite = this.exportCompositor.evaluate(doc, frame);
    // Text measured with a font that was still loading is laid out again once it is there.
    const loadFonts = this.deps.loadFonts;
    if (loadFonts) {
      const waits = composite.layers.flatMap((layer) => (layer.kind === "text" ? [loadFonts(layer.style, layer.text.value)] : []));
      if ((await Promise.all(waits)).includes(true)) composite = this.exportCompositor.evaluate(doc, frame);
    }
    const { list, release } = await this.textures.resolveExact(composite, Math.min(DETAIL_MAX_SIZE, renderer.maxTextureSize));
    const target = renderer.createOffscreenTarget(list.width, list.height);
    try {
      if (!renderer.draw(list, target)) throw new Error("The GPU device is not ready");
      return await renderer.readBitmap(target);
    } finally {
      renderer.releaseTarget(target);
      release();
    }
  }

  /** Forgets the frames of the closed project (requests, pins, failures). */
  resetFrames(): void {
    this.textures.clear();
    this.snapshot.reset();
    this.firstShown.frame = -1;
    this.deps.scheduler.invalidate("preview");
  }

  /** A media left the project or came back. */
  forgetMedia(mediaId: string): void {
    this.textures.forget(mediaId);
  }

  /** The canvas (the Media panel's drag reads its page rect once per drag), or null when unmounted. */
  get element(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** Long edge video frames are uploaded at (the frame service reads it on each upload): the project's long edge, more for detail on zoom. */
  get uploadLongEdge(): number {
    const upload = this.stats.detail.upload;
    if (upload > 0) return upload;
    const { width, height } = this.deps.document.getState().settings;
    return Math.max(width, height);
  }

  /** The frame on the canvas as the last single-frame render placed it (the overlays draw with it); null before it and while a split shows. */
  get placement(): PreviewPlacement | null {
    if (!this.viewportDrawn || this.splitDrawn || !this.canvas) return null;
    return { transform: this.transform, width: this.stats.width, height: this.stats.height, dpr: this.stats.dpr };
  }

  /** Called after a render that moved the frame, resized the canvas, or started or ended a split (the overlays redraw). */
  subscribePlacement(listener: () => void): () => void {
    this.viewListeners.add(listener);
    return () => {
      this.viewListeners.delete(listener);
    };
  }

  /**
   * The project point (px from the frame's top-left) under canvas point (`x`, `y`) in CSS px, as the
   * last single-frame render placed the frame, pan and zoom included (spec §6.14: media dropped on
   * the canvas land there). Points outside the frame map outside it; null before the first render.
   */
  projectPoint(x: number, y: number): { x: number; y: number } | null {
    const t = this.transform;
    const dpr = this.stats.dpr;
    if (!this.viewportDrawn || !(t[0] > 0) || !(t[3] > 0)) return null;
    return { x: (x * dpr - t[4]) / t[0], y: (y * dpr - t[5]) / t[3] };
  }

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.target) this.deps.renderer.releaseTarget(this.target);
    if (this.offscreen) this.deps.renderer.releaseTarget(this.offscreen);
    this.offscreen = null;
    this.blitLayer.texture = NO_TEXTURE;
    this.drawnOffscreen.scale = 0;
    this.canvas?.remove();
    this.canvas = null;
    this.target = null;
    this.stats.width = 0;
    this.stats.height = 0;
    this.textures.clear();
    this.snapshot.reset();
    this.rightSnapshot.reset();
    this.viewportDrawn = false;
    this.splitDrawn = false;
  }

  /** Writes a viewport of this render; true when it differs from what it held (the one drawn last). */
  private updateViewport(view: PaneViewport, transform: Mat3, borderWidth: number): boolean {
    const { outside, border } = this.chrome;
    let changed = view.outside !== outside || view.border.color !== border || view.border.width !== borderWidth;
    for (let i = 0; i < 6; i++) {
      if (view.transform[i] !== transform[i]) changed = true;
      view.transform[i] = transform[i] as number;
    }
    view.outside = outside;
    view.border.color = border;
    view.border.width = borderWidth;
    return changed;
  }
}

const EMPTY_LIST: DrawList = { width: 0, height: 0, background: TRANSPARENT, layers: [] };

/** The blit layer's texture before the first offscreen render. */
const NO_TEXTURE: TextureHandle = { width: 1, height: 1, mipLevels: 0, bytes: 0, valid: false, destroy: () => undefined };

function chromeFromTheme(theme: Theme): Chrome {
  return {
    outside: cssColorToRgba(theme.color.bgSunken) ?? TRANSPARENT,
    border: cssColorToRgba(theme.color.hairline) ?? TRANSPARENT,
    margin: theme.layout.previewMargin,
  };
}
