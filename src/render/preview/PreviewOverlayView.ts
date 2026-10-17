// The 2D canvas over the preview (spec §7.3, §7.5, §7.6): the overlays of the Overlays menu and the
// canvas selection with the transform gizmo, drawn with the frame placement of the preview's last
// render, never into the composite (Export frame and export never see them).
// - Pixel grid from 800% (a line between project pixels), the grid (thirds, centered squares, N x N),
//   title-safe / action-safe rectangles (dashed), the platform safe zone (masks over the UI areas with
//   their names, the safe rectangle dashed), the center cross, and above 100% px rulers along the top
//   and left canvas edges (labels in project px from the frame's top-left corner).
// - Selection (§7.2, §7.3, from `CanvasEditInput.scene`): a thin --accent-dim outline on the hovered
//   layer, --accent outlines on the selected ones, the gizmo box with its 8 handles (edge handles only
//   on sides long enough on screen; a group box around several layers), the anchor marker while Alt is
//   held, the marquee, the 100% scale snap line on the dragged handle's sides, and the numeric readout
//   near the cursor (the timeline's drag tooltip style). In crop mode (Batch 26) the box gets crop
//   handles (corner brackets and edge bars inside it) and the whole media's box is outlined dashed. A
//   text box (Batch 29) has no top and bottom handles; inline text editing draws the edited box's
//   outline, the caret (--text-caret-width, --accent) and the IME composition underline. A box holding
//   a keyframed layer gets the keyframe diamond up and right of its top-right handle (Batch 35).
// - Smart guides (§7.4, the scene's `guides`): 1 px --accent lines (across the frame for the frame and
//   safe-zone targets, from the dragged box to the layer for a layer), distance spans with end caps
//   and their distance chips (--accent, --on-accent mono caption), equal-spacing gaps, measure mode.
// - It renders with the preview (registered on `preview` after the preview view: a zoom, a pan, a
//   gesture step or a playhead move redraws both in the same frame) and on `gizmo` (overlay settings,
//   theme, selection, hover). It redraws only when the placement, the canvas size, the settings, the
//   theme or the selection geometry changed; playback frames cost a comparison (P3).
// - Hidden while the split preview shows two frames (spec §6.10).
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { PreviewSession, SessionState } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { Point } from "../../timeline/edit/transform.js";
import type { Mat3 } from "../mat3.js";
import type { Quad } from "./canvasLayers.js";
import type { GizmoScene } from "./CanvasEditInput.js";
import { CORNERS, EDGES, edgeHandlesShown, handlePoint, toScreen, type HandleId } from "./gizmo.js";
import { ACTION_SAFE, centeredRect, gridLines, rulerStep, safeZoneOn, ticksIn, TITLE_SAFE } from "./overlays.js";
import type { PreviewPlacement } from "./PreviewView.js";
import type { ZoneRect } from "./safeZones.js";
import { formatDistance, type GuideLine, type Guides, type GuideSpan } from "./snap.js";

export interface PreviewOverlayDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  layout: Store<LayoutState>;
  session: Store<SessionState>;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  preview: { readonly placement: PreviewPlacement | null };
  /** The canvas selection and gizmo to draw (spec §7.2, §7.3). */
  gizmo?: { scene(): GizmoScene };
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
  /** The gizmo scene drawn last, flattened (numbers and the readout text) for the comparison. */
  private sceneNumbers: number[] = [];
  private nextNumbers: number[] = [];
  private sceneText = "";
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
    const scene = placement ? (this.deps.gizmo?.scene() ?? null) : null;
    const sceneChanged = this.sceneChanged(scene);
    if (!this.changed(placement, settings, frameWidth, frameHeight) && !sceneChanged) return;
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
    if (scene) this.drawGizmo(ctx, placement, scene);
  }

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.drawn.settings = null;
    this.drawn.shown = false;
    this.sceneNumbers.length = 0;
    this.sceneText = "";
  }

  /** Flattens `scene` and compares it with the one drawn last (keeping the new one). */
  private sceneChanged(scene: GizmoScene | null): boolean {
    const out = this.nextNumbers;
    out.length = 0;
    let text = "";
    if (scene) {
      const quad = (q: Quad | null) => {
        if (!q) out.push(0);
        else for (const p of q) out.push(p.x, p.y);
      };
      quad(scene.hover);
      out.push(scene.outlines.length);
      for (const q of scene.outlines) quad(q);
      quad(scene.box);
      out.push(scene.group ? 1 : 0);
      if (scene.anchor) out.push(1, scene.anchor.x, scene.anchor.y);
      else out.push(0);
      if (scene.marquee) out.push(1, scene.marquee.x0, scene.marquee.y0, scene.marquee.x1, scene.marquee.y1);
      else out.push(0);
      if (scene.snap) out.push(1, CORNERS.indexOf(scene.snap.handle), EDGES.indexOf(scene.snap.handle), scene.snap.x ? 1 : 0, scene.snap.y ? 1 : 0);
      else out.push(0);
      if (scene.readout) {
        out.push(1, scene.readout.x, scene.readout.y);
        text = scene.readout.text;
      } else out.push(0);
      if (scene.guides) {
        out.push(1, scene.guides.lines.length, scene.guides.spans.length);
        for (const line of scene.guides.lines) out.push(line.vertical ? 1 : 0, line.at, line.from, line.to);
        for (const span of scene.guides.spans) out.push(span.vertical ? 1 : 0, span.at, span.from, span.to, span.distance);
      }
      out.push(scene.crop ? 1 : 0);
      if (scene.crop) quad(scene.crop.media); else out.push(0);
      out.push(scene.textBox ? 1 : 0);
      out.push(scene.keyframe ? (scene.keyframe.on ? 2 : 1) : 0);
      const editing = scene.text;
      if (editing) {
        out.push(1);
        if (editing.caret) out.push(1, editing.caret[0].x, editing.caret[0].y, editing.caret[1].x, editing.caret[1].y);
        else out.push(0);
        out.push(editing.underline.length);
        for (const [a, b] of editing.underline) out.push(a.x, a.y, b.x, b.y);
      } else out.push(0);
    } else out.push(-1);
    const previous = this.sceneNumbers;
    let changed = text !== this.sceneText || previous.length !== out.length;
    for (let i = 0; !changed && i < out.length; i++) if (previous[i] !== out[i]) changed = true;
    this.sceneNumbers = out;
    this.nextNumbers = previous;
    this.sceneText = text;
    return changed;
  }

  /** The canvas selection and the gizmo (spec §7.2, §7.3), in device px. */
  private drawGizmo(ctx: CanvasRenderingContext2D, placement: PreviewPlacement, scene: GizmoScene): void {
    const { transform: t, dpr } = placement;
    const { color, gizmo } = this.theme;
    const line = Math.max(1, Math.round(gizmo.lineWidth * dpr));
    const at = (p: Point) => toScreen(t, p);
    const path = (quad: Quad) => {
      ctx.beginPath();
      quad.forEach((p, i) => {
        const s = at(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    };
    ctx.save();
    ctx.lineWidth = line;
    if (scene.hover) {
      ctx.strokeStyle = color.accentDim;
      path(scene.hover);
      ctx.stroke();
    }
    if (scene.marquee) {
      const a = at({ x: Math.min(scene.marquee.x0, scene.marquee.x1), y: Math.min(scene.marquee.y0, scene.marquee.y1) });
      const b = at({ x: Math.max(scene.marquee.x0, scene.marquee.x1), y: Math.max(scene.marquee.y0, scene.marquee.y1) });
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      const w = Math.round(b.x) - x;
      const h = Math.round(b.y) - y;
      ctx.fillStyle = color.accentWash;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color.accentDim;
      ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line);
    }
    ctx.strokeStyle = color.accent;
    for (const quad of scene.outlines) {
      path(quad);
      ctx.stroke();
    }
    if (scene.guides) this.drawGuides(ctx, t, dpr, scene.guides);
    const box = scene.box;
    if (box && scene.crop) this.drawCrop(ctx, t, dpr, box, scene.crop.media);
    else if (box) {
      if (scene.group) {
        path(box);
        ctx.stroke();
      }
      if (scene.snap) this.drawSnapLine(ctx, t, box, scene.snap, dpr);
      // Square handles on screen: the corners always, the edge handles on sides long enough.
      const shown = edgeHandlesShown(box, t, gizmo.minEdge * dpr);
      const size = Math.round(gizmo.handleSize * dpr);
      const handles: HandleId[] = [...CORNERS, ...EDGES.filter((h) => (h === "n" || h === "s" ? shown.horizontal && !scene.textBox : shown.vertical))];
      ctx.fillStyle = color.textPrimary;
      ctx.strokeStyle = color.accent;
      for (const handle of handles) {
        const p = at(handlePoint(box, handle));
        const x = Math.round(p.x - size / 2);
        const y = Math.round(p.y - size / 2);
        ctx.fillRect(x, y, size, size);
        ctx.strokeRect(x + line / 2, y + line / 2, size - line, size - line);
      }
      if (scene.keyframe) this.drawKeyframeMark(ctx, at(handlePoint(box, "ne")), scene.keyframe.on, line, dpr);
    }
    if (scene.anchor) this.drawAnchor(ctx, at(scene.anchor), dpr, line);
    if (scene.text) {
      // Inline text editing (§7.7): the caret and the IME composition underline, in --accent.
      ctx.strokeStyle = color.accent;
      ctx.lineCap = "butt";
      if (scene.text.caret) {
        ctx.lineWidth = Math.max(1, Math.round(gizmo.caretWidth * dpr));
        const [a, b] = scene.text.caret;
        const p = at(a);
        const q = at(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.lineWidth = line;
      for (const [a, b] of scene.text.underline) {
        const p = at(a);
        const q = at(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (scene.guides && scene.guides.spans.length > 0) this.drawDistances(ctx, placement, scene.guides.spans);
    if (scene.readout) this.drawReadout(ctx, placement, scene.readout);
  }

  /**
   * The keyframe diamond (spec §7.3, Batch 35) up and right of the box's top-right handle: --accent,
   * filled on a key at the playhead, outlined otherwise (the lane's diamond size).
   */
  private drawKeyframeMark(ctx: CanvasRenderingContext2D, corner: Point, on: boolean, line: number, dpr: number): void {
    const { color, gizmo, timeline } = this.theme;
    const half = Math.round((timeline.keyframeSize * dpr) / 2);
    const offset = Math.round(gizmo.handleSize * dpr) + half;
    const cx = Math.round(corner.x + offset);
    const cy = Math.round(corner.y - offset);
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.lineWidth = line;
    ctx.strokeStyle = color.accent;
    if (on) {
      ctx.fillStyle = color.accent;
      ctx.fill();
    }
    ctx.stroke();
  }

  /** Smart guides (§7.4) in device px: --accent lines, and distance spans with end caps across them. */
  private drawGuides(ctx: CanvasRenderingContext2D, t: Mat3, dpr: number, guides: Guides): void {
    const { color, gizmo } = this.theme;
    const width = Math.max(1, Math.round(gizmo.guideWidth * dpr));
    const cap = (gizmo.guideCap * dpr) / 2;
    // Crisp lines: centered on device pixels.
    const crisp = (v: number) => Math.round(v) + width / 2;
    const segment = (guide: GuideLine, caps: boolean) => {
      if (guide.vertical) {
        const x = crisp(t[0] * guide.at + t[4]);
        const y0 = t[3] * guide.from + t[5];
        const y1 = t[3] * guide.to + t[5];
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        if (caps) {
          for (const y of [crisp(y0), crisp(y1)]) {
            ctx.moveTo(x - cap, y);
            ctx.lineTo(x + cap, y);
          }
        }
      } else {
        const y = crisp(t[3] * guide.at + t[5]);
        const x0 = t[0] * guide.from + t[4];
        const x1 = t[0] * guide.to + t[4];
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        if (caps) {
          for (const x of [crisp(x0), crisp(x1)]) {
            ctx.moveTo(x, y - cap);
            ctx.lineTo(x, y + cap);
          }
        }
      }
    };
    ctx.save();
    ctx.strokeStyle = color.accent;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const guide of guides.lines) segment(guide, false);
    for (const guide of guides.spans) segment(guide, true);
    ctx.stroke();
    ctx.restore();
  }

  /** The distance chips (§7.4 proximity readout) centered on their spans: --accent, --on-accent mono caption, radius-sm. */
  private drawDistances(ctx: CanvasRenderingContext2D, placement: PreviewPlacement, spans: readonly GuideSpan[]): void {
    const { transform: t, dpr } = placement;
    const theme = this.theme;
    const { space, color } = theme;
    const caption = theme.type.caption;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${caption.weight} ${caption.size}px ${theme.font.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const h = caption.line + 2 * space[0];
    for (const span of spans) {
      const text = formatDistance(span.distance);
      const w = Math.ceil(ctx.measureText(text).width) + 2 * space[1];
      // The span's middle in CSS px.
      const mid = (span.from + span.to) / 2;
      const cx = (span.vertical ? t[0] * span.at + t[4] : t[0] * mid + t[4]) / dpr;
      const cy = (span.vertical ? t[3] * mid + t[5] : t[3] * span.at + t[5]) / dpr;
      const x = snap(cx - w / 2);
      const y = snap(cy - h / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, theme.radius.sm);
      ctx.fillStyle = color.accent;
      ctx.fill();
      ctx.fillStyle = color.onAccent;
      ctx.fillText(text, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  /**
   * Crop mode (Batch 26): the whole media's box dashed in --accent-dim, then the crop handles inside the
   * visible box: L brackets on the corners and bars on the edge midpoints (edges only on sides long
   * enough), a --text-primary stroke over a --bg-sunken outline, turned with the layer.
   */
  private drawCrop(ctx: CanvasRenderingContext2D, t: Mat3, dpr: number, box: Quad, media: Quad): void {
    const { color, gizmo, preview } = this.theme;
    const line = Math.max(1, Math.round(gizmo.lineWidth * dpr));
    const s = box.map((p) => toScreen(t, p)) as [Point, Point, Point, Point];
    ctx.save();
    ctx.lineWidth = line;
    ctx.strokeStyle = color.accentDim;
    ctx.setLineDash([preview.dash * dpr, preview.dash * dpr]);
    ctx.beginPath();
    media.forEach((p, i) => {
      const m = toScreen(t, p);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // Unit vectors along the box sides on screen (top: tl -> tr, left: tl -> bl).
    const unit = (a: Point, b: Point) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      return length > 0 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length, length } : { x: 0, y: 0, length: 0 };
    };
    const across = unit(s[0], s[1]);
    const down = unit(s[0], s[3]);
    const width = Math.max(1, Math.round(gizmo.cropHandleWidth * dpr));
    // Arms stay within a third of the side on screen, so the handles never meet.
    const armX = Math.min(gizmo.cropHandleLength * dpr, across.length / 3);
    const armY = Math.min(gizmo.cropHandleLength * dpr, down.length / 3);
    const shown = edgeHandlesShown(box, t, gizmo.minEdge * dpr);
    const inset = width / 2;
    const paths: Point[][] = [];
    // Corners: from the box corner along both sides into the box; signs point inward.
    const corners: [Point, number, number][] = [
      [s[0], 1, 1],
      [s[1], -1, 1],
      [s[2], -1, -1],
      [s[3], 1, -1],
    ];
    for (const [p, sx, sy] of corners) {
      const o = { x: p.x + (across.x * sx + down.x * sy) * inset, y: p.y + (across.y * sx + down.y * sy) * inset };
      paths.push([
        { x: o.x + across.x * sx * armX, y: o.y + across.y * sx * armX },
        o,
        { x: o.x + down.x * sy * armY, y: o.y + down.y * sy * armY },
      ]);
    }
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // Edge bars: centered on the side's midpoint, inset into the box.
    const bar = (m: Point, along: { x: number; y: number }, inward: { x: number; y: number }, arm: number) => {
      const o = { x: m.x + inward.x * inset, y: m.y + inward.y * inset };
      paths.push([
        { x: o.x - (along.x * arm) / 2, y: o.y - (along.y * arm) / 2 },
        { x: o.x + (along.x * arm) / 2, y: o.y + (along.y * arm) / 2 },
      ]);
    };
    if (shown.horizontal) {
      bar(mid(s[0], s[1]), across, down, armX);
      bar(mid(s[3], s[2]), across, { x: -down.x, y: -down.y }, armX);
    }
    if (shown.vertical) {
      bar(mid(s[0], s[3]), down, across, armY);
      bar(mid(s[1], s[2]), down, { x: -across.x, y: -across.y }, armY);
    }
    const stroke = (lineWidth: number, style: string) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = style;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.beginPath();
      for (const path of paths) {
        path.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
      }
      ctx.stroke();
    };
    stroke(width + 2 * line, color.bgSunken);
    stroke(width, color.textPrimary);
    ctx.restore();
  }

  /** The 100% scale snap (§7.3): the box sides through the dragged handle, on the snapped axes, in --accent. */
  private drawSnapLine(ctx: CanvasRenderingContext2D, t: Mat3, box: Quad, snap: NonNullable<GizmoScene["snap"]>, dpr: number): void {
    const [tl, tr, br, bl] = box;
    const sides: Record<"n" | "e" | "s" | "w", [Point, Point]> = { n: [tl, tr], e: [tr, br], s: [br, bl], w: [bl, tl] };
    const { handle } = snap;
    const xSide: "e" | "w" | null = handle.includes("e") ? "e" : handle.includes("w") ? "w" : null;
    const ySide: "n" | "s" | null = handle.includes("n") ? "n" : handle.includes("s") ? "s" : null;
    ctx.save();
    ctx.strokeStyle = this.theme.color.accent;
    ctx.lineWidth = Math.max(1, Math.round(this.theme.gizmo.snapWidth * dpr));
    ctx.beginPath();
    for (const name of [snap.x ? xSide : null, snap.y ? ySide : null]) {
      if (!name) continue;
      const [a, b] = sides[name];
      const sa = toScreen(t, a);
      const sb = toScreen(t, b);
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The anchor marker: a ring with a cross in primary text over a sunken outline. */
  private drawAnchor(ctx: CanvasRenderingContext2D, p: Point, dpr: number, line: number): void {
    const { color, gizmo } = this.theme;
    const r = (gizmo.anchorSize * dpr) / 2;
    const x = Math.round(p.x) + line / 2;
    const y = Math.round(p.y) + line / 2;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(x + r / 2, y);
      ctx.arc(x, y, r / 2, 0, Math.PI * 2);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
    };
    ctx.strokeStyle = color.bgSunken;
    ctx.lineWidth = line * 3;
    shape();
    ctx.stroke();
    ctx.strokeStyle = color.textPrimary;
    ctx.lineWidth = line;
    shape();
    ctx.stroke();
  }

  /** The readout near the cursor (§7.3) in the timeline's drag tooltip style: --surface-4, hairline, radius-sm, caption mono, up and right of the pointer. */
  private drawReadout(ctx: CanvasRenderingContext2D, placement: PreviewPlacement, readout: NonNullable<GizmoScene["readout"]>): void {
    const { dpr, width, height } = placement;
    const theme = this.theme;
    const { space, color } = theme;
    const caption = theme.type.caption;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${caption.weight} ${caption.size}px ${theme.font.mono}`;
    const w = Math.ceil(ctx.measureText(readout.text).width) + 2 * space[2];
    const h = caption.line + 2 * space[1];
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const x = snap(Math.max(0, Math.min(readout.x + space[3], width / dpr - w)));
    let y = readout.y - space[3] - h;
    if (y < 0) y = readout.y + space[5];
    y = snap(Math.max(0, Math.min(y, height / dpr - h)));
    const hair = 1 / dpr;
    ctx.beginPath();
    ctx.roundRect(x + hair / 2, y + hair / 2, w - hair, h - hair, theme.radius.sm);
    ctx.fillStyle = color.surface4;
    ctx.fill();
    ctx.strokeStyle = color.hairline;
    ctx.lineWidth = hair;
    ctx.stroke();
    ctx.fillStyle = color.textPrimary;
    ctx.textBaseline = "middle";
    ctx.fillText(readout.text, x + space[2], y + h / 2);
    ctx.restore();
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
