// The preview canvas (spec §7.1, §3.4, P3): a framework-free WebGPU canvas in the preview panel. It
// draws the project frame letterboxed at Fit (or at the session zoom) on the DS background with a
// 1 px DS border, at devicePixelRatio, and only from the FrameScheduler's `preview` flag: a resize, a
// zoom, a settings change, new layers or a new GPU device invalidate it, and the next frame draws once.
// The backing store is resized inside `render`, so a resize never shows a cleared canvas.
// TODO(batch 08): the compositor's draw list replaces `setLayers` (and the Batch 05 image harness).
import type { RGBA } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { cssColorToRgba } from "../../core/theme/cssColor.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { DrawList, Layer } from "../compositor/drawList.js";
import type { CanvasTarget, Renderer, Viewport } from "../gpu/renderer.js";
import { deviceSize, frameTransform, type Size } from "./viewport.js";

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export interface PreviewViewDeps {
  renderer: Renderer;
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  layout: Store<LayoutState>;
  session: Store<SessionState>;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
}

export interface PreviewStats {
  /** Draws issued by the scheduler. */
  renders: number;
  /** Panel size changes seen (each should cost one render). */
  resizes: number;
  /** Backing store in device px. */
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
  private layers: readonly Layer[] = [];
  private cssSize: Size = { width: 0, height: 0 };
  private chrome: Chrome;
  private readonly stops: (() => void)[] = [];
  readonly stats: PreviewStats = { renders: 0, resizes: 0, width: 0, height: 0, dpr: 1 };

  constructor(private readonly deps: PreviewViewDeps) {
    this.chrome = chromeFromTheme(deps.theme.theme);
  }

  /** Creates the canvas inside `host` and starts following the panel, zoom, settings and theme. */
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
      session.select((state) => state.preview.zoom, invalidate),
      document.subscribe(invalidate, { affects: ["settings"] }),
      theme.subscribe((next) => {
        this.chrome = chromeFromTheme(next);
        invalidate();
      }),
      renderer.subscribe((event) => {
        if (event === "ready") invalidate();
      }),
      watchDevicePixelRatio(host.ownerDocument.defaultView, invalidate),
    );
    invalidate();
    return () => this.unmount();
  }

  /** The layers drawn into the frame, bottom to top (project px). */
  setLayers(layers: readonly Layer[]): void {
    this.layers = layers;
    this.deps.scheduler.invalidate("preview");
  }

  /** The frame and its layers as the next render would draw them. */
  drawList(): DrawList {
    const { width, height, background } = this.deps.document.getState().settings;
    return { width, height, background, layers: this.layers };
  }

  render(): void {
    const { canvas, target } = this;
    if (!canvas || !target) return;
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const size = deviceSize(this.cssSize, dpr);
    if (size.width !== this.stats.width || size.height !== this.stats.height || dpr !== this.stats.dpr) {
      this.deps.renderer.resize(target, size.width, size.height);
      canvas.style.width = `${this.cssSize.width}px`;
      canvas.style.height = `${this.cssSize.height}px`;
      this.stats.width = size.width;
      this.stats.height = size.height;
      this.stats.dpr = dpr;
    }
    const list = this.drawList();
    const viewport: Viewport = {
      transform: frameTransform(this.deps.session.getState().preview.zoom, list, size, this.chrome.margin * dpr),
      outside: this.chrome.outside,
      border: { color: this.chrome.border, width: Math.max(1, Math.round(dpr)) },
    };
    if (this.deps.renderer.draw(list, target, viewport)) this.stats.renders += 1;
  }

  /** The frame at project size with straight alpha (Export frame). The layers' textures must stay alive meanwhile. */
  async renderFrame(): Promise<ImageBitmap> {
    const { renderer } = this.deps;
    const list = this.drawList();
    const target = renderer.createOffscreenTarget(list.width, list.height);
    try {
      if (!renderer.draw(list, target)) throw new Error("The GPU device is not ready");
      return await renderer.readBitmap(target);
    } finally {
      renderer.releaseTarget(target);
    }
  }

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    if (this.target) this.deps.renderer.releaseTarget(this.target);
    this.canvas?.remove();
    this.canvas = null;
    this.target = null;
    this.stats.width = 0;
    this.stats.height = 0;
  }
}

function chromeFromTheme(theme: Theme): Chrome {
  return {
    outside: cssColorToRgba(theme.color.bgSunken) ?? TRANSPARENT,
    border: cssColorToRgba(theme.color.hairline) ?? TRANSPARENT,
    margin: theme.layout.previewMargin,
  };
}

/** Calls `onChange` whenever devicePixelRatio changes (window moved to another screen, browser zoom). */
function watchDevicePixelRatio(win: Window | null, onChange: () => void): () => void {
  if (!win?.matchMedia) return () => {};
  let query: MediaQueryList | null = null;
  const listen = () => {
    query?.removeEventListener("change", changed);
    query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    query.addEventListener("change", changed);
  };
  const changed = () => {
    listen();
    onChange();
  };
  listen();
  return () => query?.removeEventListener("change", changed);
}
