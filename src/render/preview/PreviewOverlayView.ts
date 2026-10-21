// The 2D canvas over the preview (spec §7.5, §7.6; Batch 22 draws the transform gizmo on it too): the
// overlays of the Overlays menu, drawn with the frame placement of the preview's last render, never
// into the composite (Export frame and export never see them).
// - Pixel grid from 800% (a line between project pixels), the grid (thirds, centered squares, N x N),
//   title-safe / action-safe rectangles (dashed), the platform safe zone (masks over the UI areas with
//   their names, the safe rectangle dashed), the center cross, and above 100% px rulers along the top
//   and left canvas edges (labels in project px from the frame's top-left corner).
// - It renders with the preview (registered on `preview` after the preview view: a zoom or pan moves
//   both in the same frame) and on `gizmo` (overlay settings, theme). It redraws only when the
//   placement, the canvas size, the settings or the theme changed; playback frames cost a comparison.
// - Hidden while the split preview shows two frames (spec §6.10).
// TODO(batch 22): selection outlines and the transform gizmo. TODO(batch 23): smart guides when `guides` is on.
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { PreviewSession, SessionState } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { Mat3 } from "../mat3.js";
import { ACTION_SAFE, centeredRect, gridLines, rulerStep, safeZoneOn, ticksIn, TITLE_SAFE } from "./overlays.js";
import type { PreviewPlacement } from "./PreviewView.js";
import type { ZoneRect } from "./safeZones.js";

export interface PreviewOverlayDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  layout: Store<LayoutState>;
  session: Store<SessionState>;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  preview: { readonly placement: PreviewPlacement | null };
}

/** What the canvas shows; a render that would draw the same draws nothing. */
interface Drawn {
  transform: number[];
  width: number;
  height: number;
  settings: PreviewSession | null;
  theme: Theme | null;
  frameWidth: number;
  frameHeight: number;
  shown: boolean;
}

export class PreviewOverlayView implements RenderView {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: Theme;
  private readonly drawn: Drawn = { transform: [0, 0, 0, 0, 0, 0], width: 0, height: 0, settings: null, theme: null, frameWidth: 0, frameHeight: 0, shown: false };
  private readonly stops: (() => void)[] = [];
  /** Renders that drew (the others compared and returned). */
  draws = 0;

  constructor(private readonly deps: PreviewOverlayDeps) {
    this.theme = deps.theme.theme;
  }

  /** Creates the overlay canvas over the preview canvas in `host` (call after the preview view mounted). */
  mount(host: HTMLElement): () => void {
    this.unmount();
    const { scheduler, layout, session, theme } = this.deps;
    const canvas = host.ownerDocument.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.display = "block";
    host.append(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const invalidate = () => scheduler.invalidate("gizmo");
    this.stops.push(
      scheduler.register("preview", this),
      scheduler.register("gizmo", this),
      layout.select(
        (state) => state.panels.preview,
        (size) => {
          canvas.style.width = `${size.width}px`;
          canvas.style.height = `${size.height}px`;
        },
        { fireImmediately: true },
      ),
      session.select((state) => state.preview, invalidate),
      theme.subscribe((next) => {
        this.theme = next;
        invalidate();
      }),
      watchDevicePixelRatio(host.ownerDocument.defaultView, invalidate),
    );
    invalidate();
    return () => this.unmount();
  }

  /** The overlay canvas (pointer input for the viewport and, from Batch 22, the gizmo), or null. */
  get element(): HTMLCanvasElement | null {
    return this.canvas;
  }

  render(): void {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;
    const placement = this.deps.preview.placement;
    const settings = this.deps.session.getState().preview;
    const { width: frameWidth, height: frameHeight } = this.deps.document.getState().settings;
    const drawn = this.drawn;
    const shown = placement !== null;
    if (!this.changed(placement, settings, frameWidth, frameHeight)) return;
    drawn.shown = shown;
    drawn.settings = settings;
    drawn.theme = this.theme;
    drawn.frameWidth = frameWidth;
    drawn.frameHeight = frameHeight;
    if (placement) {
      for (let i = 0; i < 6; i++) drawn.transform[i] = placement.transform[i] as number;
      drawn.width = placement.width;
      drawn.height = placement.height;
      if (canvas.width !== placement.width) canvas.width = placement.width;
      if (canvas.height !== placement.height) canvas.height = placement.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.draws += 1;
    if (!placement) return;
    this.draw(ctx, placement, settings, { width: frameWidth, height: frameHeight });
  }

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.drawn.settings = null;
    this.drawn.shown = false;
  }

  private changed(placement: PreviewPlacement | null, settings: PreviewSession, frameWidth: number, frameHeight: number): boolean {
    const drawn = this.drawn;
    if (drawn.settings !== settings || drawn.theme !== this.theme || drawn.shown !== (placement !== null) || drawn.frameWidth !== frameWidth || drawn.frameHeight !== frameHeight) return true;
    if (!placement) return false;
    if (drawn.width !== placement.width || drawn.height !== placement.height) return true;
    for (let i = 0; i < 6; i++) if (drawn.transform[i] !== placement.transform[i]) return true;
    return false;
  }

  private draw(ctx: CanvasRenderingContext2D, placement: PreviewPlacement, settings: PreviewSession, frame: { width: number; height: number }): void {
    const { transform: t, dpr } = placement;
    const theme = this.theme;
    const line = Math.max(1, Math.round(dpr));
    const scale = t[0];
    // The frame on the canvas, in device px.
    const left = t[4];
    const top = t[5];
    const right = t[0] * frame.width + t[4];
    const bottom = t[3] * frame.height + t[5];
    const x = (px: number) => t[0] * px + t[4];
    const y = (py: number) => t[3] * py + t[5];
    // Crisp lines: centered on device pixels.
    const cx = (px: number) => Math.round(x(px)) + line / 2;
    const cy = (py: number) => Math.round(y(py)) + line / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    ctx.lineWidth = line;

    // Pixel grid (§7.5): from 800% on, one line between project pixels in view.
    if (settings.pixelGrid && scale >= 8) {
      const x0 = Math.max(0, Math.floor(-t[4] / t[0]));
      const x1 = Math.min(frame.width, Math.ceil((placement.width - t[4]) / t[0]));
      const y0 = Math.max(0, Math.floor(-t[5] / t[3]));
      const y1 = Math.min(frame.height, Math.ceil((placement.height - t[5]) / t[3]));
      ctx.strokeStyle = theme.preview.pixelGrid;
      ctx.beginPath();
      for (let px = x0; px <= x1; px++) {
        ctx.moveTo(cx(px), top);
        ctx.lineTo(cx(px), bottom);
      }
      for (let py = y0; py <= y1; py++) {
        ctx.moveTo(left, cy(py));
        ctx.lineTo(right, cy(py));
      }
      ctx.stroke();
    }

    // Grid (§7.6).
    const grid = gridLines(settings.grid, settings.gridDivisions, frame);
    if (grid.xs.length > 0 || grid.ys.length > 0) {
      ctx.strokeStyle = theme.preview.grid;
      ctx.beginPath();
      for (const px of grid.xs) {
        ctx.moveTo(cx(px), top);
        ctx.lineTo(cx(px), bottom);
      }
      for (const py of grid.ys) {
        ctx.moveTo(left, cy(py));
        ctx.lineTo(right, cy(py));
      }
      ctx.stroke();
    }

    const dash = theme.preview.dash * dpr;
    const dashed = (rect: ZoneRect, color: string) => {
      ctx.strokeStyle = color;
      ctx.setLineDash([dash, dash]);
      ctx.beginPath();
      ctx.rect(cx(rect.x), cy(rect.y), Math.round(x(rect.x + rect.width)) - Math.round(x(rect.x)), Math.round(y(rect.y + rect.height)) - Math.round(y(rect.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Title-safe and action-safe (§7.6: 80% / 90%).
    if (settings.safeMargins) {
      dashed(centeredRect(frame, ACTION_SAFE), theme.preview.grid);
      dashed(centeredRect(frame, TITLE_SAFE), theme.preview.guide);
    }

    // Platform safe zone (§7.6): masks with their names, the safe rectangle dashed.
    const zone = safeZoneOn(settings.safeZone, frame);
    if (zone) {
      ctx.fillStyle = theme.preview.mask;
      for (const region of zone.regions) {
        const rx = Math.round(x(region.x));
        const ry = Math.round(y(region.y));
        ctx.fillRect(rx, ry, Math.round(x(region.x + region.width)) - rx, Math.round(y(region.y + region.height)) - ry);
      }
      dashed(zone.safe, theme.preview.guide);
      const caption = theme.type.caption;
      const size = caption.size * dpr;
      ctx.font = `${caption.weight} ${size}px ${theme.font.ui}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = theme.color.textSecondary;
      const pad = theme.space[2] * dpr;
      for (const region of zone.regions) {
        const width = region.width * t[0];
        const height = region.height * t[3];
        const text = region.label;
        if (height < caption.line * dpr + 2 * pad || width < ctx.measureText(text).width + 2 * pad) continue;
        ctx.fillText(text, Math.round(x(region.x) + pad), Math.round(y(region.y) + pad));
      }
    }

    // Center cross (§7.6): a fixed screen size at the frame center.
    if (settings.centerCross) {
      const arm = (theme.preview.crossSize * dpr) / 2;
      const mx = cx(frame.width / 2);
      const my = cy(frame.height / 2);
      ctx.strokeStyle = theme.preview.guide;
      ctx.beginPath();
      ctx.moveTo(mx - arm, my);
      ctx.lineTo(mx + arm, my);
      ctx.moveTo(mx, my - arm);
      ctx.lineTo(mx, my + arm);
      ctx.stroke();
    }
    ctx.restore();

    // Rulers (§7.5): above 100%, along the canvas top and left edges.
    if (settings.rulers && scale > 1) this.drawRulers(ctx, placement, t, frame);
  }

  private drawRulers(ctx: CanvasRenderingContext2D, placement: PreviewPlacement, t: Mat3, frame: { width: number; height: number }): void {
    const theme = this.theme;
    const { dpr, width, height } = placement;
    const size = Math.round(theme.preview.rulerSize * dpr);
    const line = Math.max(1, Math.round(dpr));
    const minor = Math.round(theme.preview.rulerTick * dpr);
    const badge = theme.type.overline;
    ctx.save();
    ctx.fillStyle = theme.color.surface1;
    ctx.fillRect(0, 0, width, size);
    ctx.fillRect(0, 0, size, height);
    ctx.fillStyle = theme.color.hairline;
    ctx.fillRect(0, size - line, width, line);
    ctx.fillRect(size - line, 0, line, height);
    ctx.font = `${badge.weight} ${badge.size * dpr}px ${theme.font.mono}`;
    ctx.textBaseline = "top";
    const pad = theme.space[0] * dpr;
    // Majors at least the widest label (the frame's long edge) plus --space-3 apart, as on the timeline ruler.
    const step = rulerStep(t[0], ctx.measureText(String(Math.max(frame.width, frame.height))).width + theme.space[3] * dpr);

    // Top ruler: project x.
    const fromX = (size - t[4]) / t[0];
    const toX = (width - t[4]) / t[0];
    ctx.fillStyle = theme.color.border;
    for (const px of ticksIn(Math.max(0, fromX), Math.min(frame.width, toX), step.minor)) {
      const major = Math.abs(px / step.major - Math.round(px / step.major)) < 1e-6;
      const tx = Math.round(t[0] * px + t[4]);
      ctx.fillRect(tx, major ? 0 : size - minor, line, major ? size : minor);
    }
    ctx.fillStyle = theme.color.textTertiary;
    for (const px of ticksIn(Math.max(0, fromX), Math.min(frame.width, toX), step.major)) ctx.fillText(String(px), Math.round(t[0] * px + t[4]) + line + pad, pad);

    // Left ruler: project y, labels turned to read upwards.
    const fromY = (size - t[5]) / t[3];
    const toY = (height - t[5]) / t[3];
    ctx.fillStyle = theme.color.border;
    for (const py of ticksIn(Math.max(0, fromY), Math.min(frame.height, toY), step.minor)) {
      const major = Math.abs(py / step.major - Math.round(py / step.major)) < 1e-6;
      const ty = Math.round(t[3] * py + t[5]);
      ctx.fillRect(major ? 0 : size - minor, ty, major ? size : minor, line);
    }
    ctx.fillStyle = theme.color.textTertiary;
    for (const py of ticksIn(Math.max(0, fromY), Math.min(frame.height, toY), step.major)) {
      ctx.save();
      ctx.translate(pad, Math.round(t[3] * py + t[5]) - line - pad);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(py), 0, 0);
      ctx.restore();
    }
    // The corner where the rulers meet.
    ctx.fillStyle = theme.color.surface1;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }
}
