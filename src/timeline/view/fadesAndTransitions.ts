// Fades and transition blocks on the timeline (spec §6.4, §6.15; Batch 36): where they sit, shared by
// the drawing passes and the hit tester, and how they are drawn.
// - A fade is drawn over the clip's body (its whole height on S tracks, where the label bar is the
//   clip): the faded part darkened under a wedge (`--timeline-fade-wash`) bounded by the curve (a line
//   for an opacity fade, the equal-power curve for an audio clip, envelope.ts), the curve in a 1 device
//   px `--timeline-fade-line`.
// - Fade handles are squares on the clip's top edge at each fade's end (in the corner at no fade),
//   kept inside the clip; drawn on the hovered or dragged clip (the overlay), hit on every unlocked
//   clip wide enough for a label.
// - A transition block spans its frames across the cut over the top of the clips (the label bar's
//   height, the whole clip on S tracks): a chip with bracket bars at its ends and its kind's glyph;
//   frames that repeat an edge frame (a short handle) are striped.
import { repeatedFrames } from "../../core/document/transitions.js";
import type { Clip, Frame, MediaClip, Project, Track, Transition, TransitionKind } from "../../core/document/types.js";
import type { Theme } from "../../core/theme/theme.js";
import { canFade, fadesOf, type FadeEdge } from "../edit/fades.js";
import { LOD_LABEL_PX } from "./clipLayout.js";
import { drawDiagonalHatch } from "./hatch.js";
import type { Row, TimelineGeometry } from "./geometry.js";
import { drawGlyph, type GlyphName } from "./glyphs.js";

/** The kind glyphs of the blocks. */
export const TRANSITION_GLYPHS: Readonly<Record<TransitionKind, GlyphName>> = { crossDissolve: "blend", dipToBlack: "moon", dipToWhite: "sun" };

const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

/** True when the clip shows fade handles: it fades, and is wide enough for its label. */
export function hasFadeHandles(geometry: TimelineGeometry, clip: Clip): boolean {
  return canFade(clip) && clip.duration * geometry.pxPerFrame >= LOD_LABEL_PX;
}

/** The center x of a clip's `edge` fade handle: at the fade's end, in the corner at no fade, inside the clip. */
export function fadeHandleX(geometry: TimelineGeometry, clip: Clip, edge: FadeEdge, size: number, frames = fadesOf(clip)[edge]): number {
  const x0 = geometry.frameToX(clip.start);
  const x1 = geometry.frameToX(clip.start + clip.duration);
  const half = size / 2;
  const reach = Math.max(half, frames * geometry.pxPerFrame);
  return edge === "in" ? Math.min(x1 - half, x0 + reach) : Math.max(x0 + half, x1 - reach);
}

/** The top of a clip in its row (the handles' top edge). */
export const clipTop = (row: Row, theme: Theme) => row.y + theme.timeline.clipInset;

/** The band a transition block covers in its row: the label bar, or the whole clip on S tracks and the caption track. */
export function blockBand(row: Row, track: Pick<Track, "kind" | "height">, theme: Theme): { y: number; height: number } {
  const tl = theme.timeline;
  const y = row.y + tl.clipInset;
  const full = row.height - 2 * tl.clipInset;
  return { y, height: track.kind === "caption" || track.height === "S" ? full : Math.min(full, tl.labelHeight) };
}

/** A block's x range (CSS px) for a transition of `before` + `after` frames at `cut`. */
export function blockSpan(geometry: TimelineGeometry, transition: Pick<Transition, "before" | "after">, cut: Frame): { x0: number; x1: number } {
  return { x0: geometry.frameToX(cut - transition.before), x1: geometry.frameToX(cut + transition.after) };
}

/**
 * The fade wedges of a clip over [x, x + width] x [y, y + height] (its body): the faded part darkened
 * above the curve, the curve along it. `fades` stand in for the clip's (a handle drag's proposal).
 */
export function drawFades(ctx: CanvasRenderingContext2D, dpr: number, geometry: TimelineGeometry, theme: Theme, clip: Clip, x: number, width: number, y: number, height: number, fades = fadesOf(clip)): void {
  if (fades.in <= 0 && fades.out <= 0) return;
  const audio = clip.kind === "audio";
  const left = Math.max(x, geometry.area.x);
  const right = Math.min(x + width, geometry.area.x + geometry.area.width);
  if (right <= left) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y, right - left, height);
  ctx.clip();
  const bottom = y + height;
  for (const edge of ["in", "out"] as const) {
    const frames = fades[edge];
    if (frames <= 0) continue;
    const length = frames * geometry.pxPerFrame;
    const from = edge === "in" ? x : x + width;
    const to = edge === "in" ? x + length : x + width - length;
    // The curve from silence (bottom) at the clip's edge to full (top) at the fade's end.
    const steps = audio ? Math.max(2, Math.min(32, Math.ceil(length / 4))) : 1;
    const point = (i: number) => {
      const t = i / steps;
      const level = audio ? Math.sin((Math.PI / 2) * t) : t;
      return { px: from + (to - from) * t, py: bottom - level * height };
    };
    ctx.beginPath();
    ctx.moveTo(from, y);
    for (let i = 0; i <= steps; i++) {
      const { px, py } = point(i);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = theme.timeline.fadeWash;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const { px, py } = point(i);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = theme.timeline.fadeLine;
    ctx.lineWidth = 1 / dpr;
    ctx.stroke();
  }
  ctx.restore();
}

/** A fade handle centered at `cx` on the clip's top edge `top`: the keyframe diamond's look as a square. */
export function drawFadeHandle(ctx: CanvasRenderingContext2D, dpr: number, theme: Theme, cx: number, top: number, active: boolean): void {
  const size = theme.timeline.fadeHandleSize;
  const x = snap(cx - size / 2, dpr);
  const y = snap(top, dpr);
  ctx.fillStyle = theme.color.bgSunken;
  ctx.fillRect(x - 1 / dpr, y - 1 / dpr, size + 2 / dpr, size + 2 / dpr);
  ctx.fillStyle = active ? theme.color.accent : theme.color.textPrimary;
  ctx.fillRect(x, y, size, size);
}

/** What a block looks like besides its frames: selected, an end hovered or dragged. */
export interface BlockState {
  selected: boolean;
  /** The end under the pointer or being dragged, or the whole block hovered (`body`). */
  hot: "start" | "end" | "body" | null;
  dragged: boolean;
}

const NO_STATE: BlockState = { selected: false, hot: null, dragged: false };

/**
 * The block of the transition `transition` between `left` and `right` (spec §6.4) in `row`, with its
 * stripes over repeated edge frames.
 */
export function drawTransitionBlock(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  geometry: TimelineGeometry,
  theme: Theme,
  project: Pick<Project, "media" | "settings">,
  row: Row,
  track: Pick<Track, "kind" | "height">,
  left: MediaClip,
  right: MediaClip,
  transition: Transition,
  state: BlockState = NO_STATE,
): void {
  const tl = theme.timeline;
  const cut = right.start;
  const span = blockSpan(geometry, transition, cut);
  const x0 = snap(span.x0, dpr);
  const x1 = Math.max(x0 + 2 / dpr, snap(span.x1, dpr));
  const band = blockBand(row, track, theme);
  const y = snap(band.y, dpr);
  const height = snap(band.y + band.height, dpr) - y;
  const width = x1 - x0;
  const radius = Math.min(theme.radius.sm, width / 2, height / 2);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y, width, height, radius);
  ctx.fillStyle = tl.transitionFill;
  ctx.fill();
  ctx.clip();
  // Stripes over the frames that repeat an edge frame: the far ends of each side.
  const repeated = repeatedFrames(project, left, right, transition);
  if (repeated.before > 0) drawDiagonalHatch(ctx, dpr, x0, geometry.frameToX(cut - transition.before + repeated.before), y, height, tl.transitionWarning, tl.hatchGap);
  if (repeated.after > 0) drawDiagonalHatch(ctx, dpr, geometry.frameToX(cut + transition.after - repeated.after), x1, y, height, tl.transitionWarning, tl.hatchGap);
  if (state.selected) {
    ctx.fillStyle = theme.color.accentWash;
    ctx.fillRect(x0, y, width, height);
  }
  // The bracket bars at its ends.
  const bar = Math.max(1 / dpr, snap(tl.transitionEdgeWidth, dpr));
  const barColor = (end: "start" | "end") => (state.hot === end || state.hot === "body" ? (state.dragged ? theme.color.accent : theme.color.textPrimary) : theme.color.textSecondary);
  ctx.fillStyle = barColor("start");
  ctx.fillRect(x0, y, bar, height);
  ctx.fillStyle = barColor("end");
  ctx.fillRect(x1 - bar, y, bar, height);
  const icon = theme.icon.small;
  if (width >= icon + 2 * (bar + theme.space[0])) drawGlyph(ctx, TRANSITION_GLYPHS[transition.kind], (x0 + x1) / 2 - icon / 2, y + height / 2 - icon / 2, icon, theme.color.textPrimary);
  ctx.restore();
  ctx.lineWidth = 1 / dpr;
  ctx.strokeStyle = state.selected ? theme.color.accent : theme.color.hairline;
  ctx.beginPath();
  ctx.roundRect(x0 + 0.5 / dpr, y + 0.5 / dpr, Math.max(0, width - 1 / dpr), Math.max(0, height - 1 / dpr), Math.max(0, radius - 0.5 / dpr));
  ctx.stroke();
}
