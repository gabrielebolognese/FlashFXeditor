// The preview canvas (spec §7.1, §9.4, §3.4, P3, P8): a framework-free WebGPU canvas in the preview
// panel showing the composite of the timeline at the playhead, letterboxed at Fit (or at the session
// zoom) on the DS background with a 1 px DS border, at devicePixelRatio.
// - It draws only from the FrameScheduler's `preview` flag. The playhead, document changes that can
//   change the frame (timeline, clips, tracks, media, settings, composite), late frames, a resize, a
//   zoom, the theme, the DPR and a new GPU device invalidate it.
// - Each render evaluates the document at the playhead (`Compositor`), resolves media layers to pool
//   textures (`LayerTextures`: playback priority while playing, scrub while the ruler is dragged, idle
//   otherwise), warms the cut neighbours (not while playing: the engine's lookahead does), and draws.
//   When the draw list and the viewport equal the last ones drawn, the GPU draw is skipped (§9.4).
// - `firstShown` reports what the first render of each playhead frame drew, for the playback
//   engine's dropped-frame count.
// - The backing store is resized inside `render`, so a resize never shows a cleared canvas.
import type { Frame, RGBA } from "../../core/document/types.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { cssColorToRgba } from "../../core/theme/cssColor.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { Compositor } from "../compositor/Compositor.js";
import type { DrawList } from "../compositor/drawList.js";
import { DrawListSnapshot } from "../compositor/DrawListSnapshot.js";
import type { FramePriority } from "../../media/workers/protocol.js";
import type { CanvasTarget, Renderer, Viewport } from "../gpu/renderer.js";
import { mutableIdentity, type Mat3, type MutableMat3 } from "../mat3.js";
import { LayerTextures, type LayerTexturesDeps, type LayerTexturesStats } from "./LayerTextures.js";
import { deviceSizeInto, frameTransformInto, type Size } from "./viewport.js";

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export interface PreviewViewDeps extends Omit<LayerTexturesDeps, "onChange"> {
  renderer: Renderer;
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  layout: Store<LayoutState>;
  session: Store<SessionState>;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** How frames are asked for now: `playback` while playing, `scrub` while the ruler is dragged, else `idle`. */
  priority(): FramePriority;
}

/** What the first render of a playhead frame drew (later renders of the same frame do not change it). */
export interface FirstShown {
  frame: Frame;
  /** Media layers, and those drawn with their exact frame. */
  layers: number;
  exact: number;
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
  private readonly viewport: Viewport & { transform: MutableMat3 } = { transform: mutableIdentity(), outside: TRANSPARENT, border: { color: TRANSPARENT, width: 1 } };
  private viewportDrawn = false;
  private readonly stops: (() => void)[] = [];
  readonly stats: PreviewStats;
  readonly firstShown: FirstShown = { frame: -1, layers: 0, exact: 0 };

  constructor(private readonly deps: PreviewViewDeps) {
    this.chrome = chromeFromTheme(deps.theme.theme);
    this.textures = new LayerTextures({ frames: deps.frames, images: deps.images, pool: deps.pool, onChange: () => deps.scheduler.invalidate("preview") });
    this.stats = { renders: 0, skipped: 0, resizes: 0, ms: 0, width: 0, height: 0, dpr: 1, textures: this.textures.stats };
  }

  /** Creates the canvas inside `host` and starts following the playhead, the document, the panel, zoom and theme. */
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

    const doc = document.getState();
    const { playhead, preview } = session.getState();
    const priority = this.deps.priority();
    const list = this.textures.resolve(this.compositor.evaluate(doc, playhead), priority);
    if (priority !== "playback") this.textures.warm(this.compositor.neighbors(doc, playhead));
    const shown = this.firstShown;
    if (shown.frame !== playhead) {
      shown.frame = playhead;
      shown.layers = this.textures.stats.layers;
      shown.exact = this.textures.stats.exact;
    }

    const viewChanged = this.updateViewport(frameTransformInto(this.transform, preview.zoom, list, size, this.chrome.margin * dpr), Math.max(1, Math.round(dpr)));
    const listChanged = this.snapshot.update(list);
    if (!listChanged && !viewChanged && !resized) {
      this.stats.skipped += 1;
      this.stats.ms = performance.now() - started;
      return;
    }
    if (renderer.draw(list, target, this.viewport)) {
      this.stats.renders += 1;
      this.viewportDrawn = true;
    } else {
      this.snapshot.reset();
    }
    this.stats.ms = performance.now() - started;
  }

  /** The frame at project size with straight alpha (Export frame), as last drawn. */
  async renderFrame(): Promise<ImageBitmap> {
    const { renderer } = this.deps;
    const list: DrawList = this.textures.current;
    const target = renderer.createOffscreenTarget(list.width, list.height);
    try {
      if (!renderer.draw(list, target)) throw new Error("The GPU device is not ready");
      return await renderer.readBitmap(target);
    } finally {
      renderer.releaseTarget(target);
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

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    if (this.target) this.deps.renderer.releaseTarget(this.target);
    this.canvas?.remove();
    this.canvas = null;
    this.target = null;
    this.stats.width = 0;
    this.stats.height = 0;
    this.textures.clear();
    this.snapshot.reset();
    this.viewportDrawn = false;
  }

  /** Writes the viewport of this render; true when it differs from the one drawn last. */
  private updateViewport(transform: Mat3, borderWidth: number): boolean {
    const view = this.viewport;
    const { outside, border } = this.chrome;
    let changed = !this.viewportDrawn || view.outside !== outside || view.border?.color !== border || view.border.width !== borderWidth;
    for (let i = 0; i < 6; i++) {
      if (view.transform[i] !== transform[i]) changed = true;
      view.transform[i] = transform[i] as number;
    }
    view.outside = outside;
    if (view.border) {
      view.border.color = border;
      view.border.width = borderWidth;
    }
    return changed;
  }
}

function chromeFromTheme(theme: Theme): Chrome {
  return {
    outside: cssColorToRgba(theme.color.bgSunken) ?? TRANSPARENT,
    border: cssColorToRgba(theme.color.hairline) ?? TRANSPARENT,
    margin: theme.layout.previewMargin,
  };
}
