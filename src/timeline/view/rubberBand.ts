// The rubber band of an audio clip (spec §6.4, Batch 37): a gain line across the clip body on M/L audio
// tracks, through the clip's volume keys. Shared by the content pass (resting lines), the overlay (a
// hovered or dragged line, redrawn over the content's) and the hit tester.
// - Scale: the gain's amplitude on a cube-root curve (a DAW fader's feel: fine steps near 0 dB, the
//   whole -60 dB..+12 dB range of spec §14 inside the body), -60 dB at the bottom of the body (less
//   `--space-0`, the waveform's margin), +12 dB at its top; 0 dB sits at about 60%.
// - The line follows the keyed gain (`gainDbAt`, sampled every LINE_STEP_PX and at each key); keys are
//   the keyframe lane's diamonds, kept inside the clip like the lane's (`diamondX`).
import { gainDbAt } from "../../core/document/keyframes.js";
import type { Clip, Frame, MediaClip, Track } from "../../core/document/types.js";
import type { Theme } from "../../core/theme/theme.js";
import { clampGain, MAX_GAIN_DB, MIN_GAIN_DB, volumeKeys } from "../edit/volume.js";
import type { Row, TimelineGeometry } from "./geometry.js";
import { diamondInset, diamondX } from "./keyframeLane.js";

const dbToGain = (db: number) => 10 ** (db / 20);
const AMP_MAX = dbToGain(MAX_GAIN_DB);
const UNIT_MIN = Math.cbrt(dbToGain(MIN_GAIN_DB) / AMP_MAX);
/** The line is sampled this often between keys (CSS px). */
const LINE_STEP_PX = 2;

/** Where a gain sits on the band, 0 (bottom, -60 dB) to 1 (top, +12 dB). */
export function gainToUnit(db: number): number {
  return (Math.cbrt(dbToGain(clampGain(db)) / AMP_MAX) - UNIT_MIN) / (1 - UNIT_MIN);
}

/** The gain at a point of the band (0 bottom .. 1 top), clamped to the range. */
export function unitToGain(unit: number): number {
  const u = UNIT_MIN + Math.min(1, Math.max(0, unit)) * (1 - UNIT_MIN);
  return clampGain(20 * Math.log10(u ** 3 * AMP_MAX));
}

/** The band's vertical extent in a row (CSS px). */
export interface BandBox {
  top: number;
  bottom: number;
}

/** The band of an audio clip in `row`, or null: audio tracks at M/L only (S tracks have no body). */
export function bandBox(row: Row, track: Pick<Track, "kind" | "height">, theme: Theme): BandBox | null {
  if (track.kind !== "audio" || track.height === "S") return null;
  const tl = theme.timeline;
  const bodyTop = row.y + tl.clipInset + tl.labelHeight;
  const bodyBottom = row.y + row.height - tl.clipInset;
  const top = bodyTop + theme.space[0];
  const bottom = bodyBottom - theme.space[0];
  return bottom - top > 2 ? { top, bottom } : null;
}

export const gainY = (box: BandBox, db: number) => box.bottom - gainToUnit(db) * (box.bottom - box.top);
export const yGain = (box: BandBox, y: number) => unitToGain((box.bottom - y) / (box.bottom - box.top));

/** The y of the line at CSS x over `clip` (its keyed gain at that fractional frame). */
export function lineY(geometry: TimelineGeometry, clip: MediaClip, box: BandBox, x: number): number {
  return gainY(box, gainDbAt(clip, geometry.xToFrame(x) - clip.start));
}

/** What a band hit found: a key (frame relative to the clip), or the line between keys. */
export interface BandHit {
  key: Frame | null;
}

/** The key or the line of `clip`'s band under CSS (x, y), or null. Keys first (within the diamond and 2 px), then the line within the zone. */
export function bandAt(geometry: TimelineGeometry, theme: Theme, clip: MediaClip, box: BandBox, x: number, y: number): BandHit | null {
  const zone = theme.timeline.rubberBandZone;
  if (y < box.top - zone || y > box.bottom + zone) return null;
  const half = theme.timeline.keyframeSize / 2 + 2;
  const inset = diamondInset(theme);
  let best: Frame | null = null;
  let bestDistance = Infinity;
  for (const key of volumeKeys(clip)) {
    if (key.frame < 0 || key.frame >= clip.duration) continue;
    const dx = Math.abs(diamondX(geometry, clip, key.frame, inset) - x);
    const dy = Math.abs(gainY(box, key.value) - y);
    if (dx <= half && dy <= half && dx + dy < bestDistance) {
      best = key.frame;
      bestDistance = dx + dy;
    }
  }
  if (best !== null) return { key: best };
  return Math.abs(lineY(geometry, clip, box, x) - y) <= zone ? { key: null } : null;
}

/** How a band is drawn. */
export interface BandDraw {
  /** The line is hovered or dragged (drawn in the accent). */
  hot: boolean;
  /** Selected keys (accent), dragged keys (accent hover). */
  selected: ReadonlySet<Frame>;
  dragged?: ReadonlySet<Frame>;
}

const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

/**
 * Draws `clip`'s rubber band between CSS `left` and `right` (the visible part of the clip): the line
 * over its outline, then a diamond per key inside the clip (`keys`: false at narrow LODs).
 */
export function drawBand(ctx: CanvasRenderingContext2D, dpr: number, geometry: TimelineGeometry, theme: Theme, clip: Clip, box: BandBox, left: number, right: number, draw: BandDraw, keys = true): void {
  if (right <= left || clip.kind !== "audio") return;
  const tl = theme.timeline;
  const { color } = theme;
  const width = Math.max(1, Math.round(tl.rubberBandWidth * dpr)) / dpr;
  const points = volumeKeys(clip);
  ctx.beginPath();
  if (points.length === 0) {
    const y = snap(gainY(box, clip.volume.gainDb), dpr) + (Math.round(width * dpr) % 2 ? 0.5 / dpr : 0);
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  } else {
    const xs: number[] = [];
    for (let x = left; x < right; x += LINE_STEP_PX) xs.push(x);
    xs.push(right);
    for (const key of points) {
      const x = geometry.frameToX(clip.start + key.frame);
      if (x > left && x < right) xs.push(x);
    }
    xs.sort((a, b) => a - b);
    xs.forEach((x, i) => {
      const y = lineY(geometry, clip, box, x);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.lineJoin = "round";
  ctx.strokeStyle = tl.rubberBandOutline;
  ctx.lineWidth = width + 2 / dpr;
  ctx.stroke();
  ctx.strokeStyle = draw.hot ? color.accent : tl.rubberBand;
  ctx.lineWidth = width;
  ctx.stroke();
  if (!keys) return;
  const half = tl.keyframeSize / 2;
  const inset = diamondInset(theme);
  ctx.lineWidth = 1 / dpr;
  for (const key of points) {
    if (key.frame < 0 || key.frame >= clip.duration) continue;
    const x = snap(diamondX(geometry, clip, key.frame, inset), dpr);
    if (x < left - half || x > right + half) continue;
    const y = snap(gainY(box, key.value), dpr);
    ctx.fillStyle = draw.dragged?.has(key.frame) ? color.accentHover : draw.selected.has(key.frame) ? color.accent : color.textPrimary;
    ctx.strokeStyle = color.bgSunken;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
