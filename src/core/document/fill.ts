// Fills (spec §21.7, Batch 58): a color, the v1 vertical two-stop gradient, or a gradient with stops.
// Pure helpers shared by the compositor, the text raster, the timeline thumbnails and the properties panel.
import type { Fill, Gradient, GradientFill, GradientStop, RGBA } from "./types.js";
import { MAX_GRADIENT_STOPS } from "./types.js";

export function isGradientFill(fill: Fill): fill is GradientFill {
  return typeof fill === "object" && fill !== null && "stops" in fill;
}

export function isTwoStop(fill: Fill): fill is Gradient {
  return typeof fill === "object" && fill !== null && "from" in fill;
}

export function isColorFill(fill: Fill): fill is RGBA {
  return !isGradientFill(fill) && !isTwoStop(fill);
}

/** The first color of a fill: what a swatch or a thumbnail shows where a gradient cannot. */
export function fillFirstColor(fill: Fill): RGBA {
  if (isGradientFill(fill)) return fill.stops[0]?.color ?? { r: 0, g: 0, b: 0, a: 1 };
  if (isTwoStop(fill)) return fill.from;
  return fill;
}

export function linearFill(from: RGBA, to: RGBA, angle = 0): GradientFill {
  return { type: "linear", angle, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: from }, { at: 1, color: to }] };
}

export function radialFill(from: RGBA, to: RGBA): GradientFill {
  return { type: "radial", angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: from }, { at: 1, color: to }] };
}

/** Every fill as one with stops: a color is two equal stops, the v1 gradient a linear one at angle 0. */
export function fillAsStops(fill: Fill): GradientFill {
  if (isGradientFill(fill)) return fill;
  if (isTwoStop(fill)) return linearFill(fill.from, fill.to);
  return linearFill(fill, fill);
}

/** The stops sorted by position, clamped to 0..1 and to 8 stops (a project written elsewhere may not be tidy). */
export function cleanStops(stops: readonly GradientStop[]): GradientStop[] {
  const out = stops.slice(0, MAX_GRADIENT_STOPS).map((stop) => ({ at: Math.min(1, Math.max(0, Number.isFinite(stop.at) ? stop.at : 0)), color: stop.color }));
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** The color of `stops` (ascending `at`) at `t`, interpolated in premultiplied alpha as the shaders do. */
export function colorAt(stops: readonly GradientStop[], t: number): RGBA {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return { r: 0, g: 0, b: 0, a: 0 };
  if (t <= first.at) return first.color;
  if (t >= last.at) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i] as GradientStop;
    if (t <= b.at) {
      const a = stops[i - 1] as GradientStop;
      const span = b.at - a.at;
      const k = span > 1e-9 ? (t - a.at) / span : 1;
      const alpha = a.color.a + (b.color.a - a.color.a) * k;
      if (alpha <= 1e-9) return { r: 0, g: 0, b: 0, a: 0 };
      const mix = (x: number, y: number) => (x * a.color.a + (y * b.color.a - x * a.color.a) * k) / alpha;
      return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: alpha };
    }
  }
  return last.color;
}

/** The four corner radii (tl tr br bl) of a box `w` x `h`: `radii` when given, else `radius` four times; each at most half the shorter side. */
export function cornerRadiiOf(w: number, h: number, radius: number, radii?: readonly number[]): [number, number, number, number] {
  const limit = Math.max(0, Math.min(w, h) / 2);
  const pick = (i: number) => Math.min(limit, Math.max(0, radii ? (radii[i] ?? 0) : radius));
  return [pick(0), pick(1), pick(2), pick(3)];
}

/** The perimeter of a rounded box, project px. */
export function boxPerimeter(w: number, h: number, radii: readonly [number, number, number, number]): number {
  const sum = radii[0] + radii[1] + radii[2] + radii[3];
  return 2 * (w + h) - 2 * sum + (Math.PI / 2) * sum;
}

export type FillMode = "solid" | "linear" | "radial";

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** Which of the three fill kinds the properties panel offers `fill` is. */
export function fillMode(fill: Fill): FillMode {
  return isColorFill(fill) ? "solid" : isGradientFill(fill) && fill.type === "radial" ? "radial" : "linear";
}

/** The last color of a fill (a color: itself). */
export function fillLastColor(fill: Fill): RGBA {
  return fillAsStops(fill).stops.at(-1)?.color ?? fillFirstColor(fill);
}

/** `fill` with its first (or only) color `color`; a gradient keeps its other stops. */
export function fillWithFirst(fill: Fill, color: RGBA): Fill {
  if (isColorFill(fill)) return color;
  if (isTwoStop(fill)) return { ...fill, from: color };
  return { ...fill, stops: fill.stops.map((stop, i) => (i === 0 ? { ...stop, color } : stop)) };
}

/** `fill` with its last color `color`; a color becomes a linear run from itself to `color`. */
export function fillWithLast(fill: Fill, color: RGBA): Fill {
  if (isColorFill(fill)) return linearFill(fill, color);
  if (isTwoStop(fill)) return { ...fill, to: color };
  return { ...fill, stops: fill.stops.map((stop, i, all) => (i === all.length - 1 ? { ...stop, color } : stop)) };
}

/** `fill` as `mode`: the colors and stops stay; a color becomes a run to `other` (black). */
export function fillAsMode(fill: Fill, mode: FillMode, other: RGBA = BLACK): Fill {
  if (mode === "solid") return isColorFill(fill) ? fill : fillFirstColor(fill);
  if (isColorFill(fill)) return mode === "linear" ? linearFill(fill, other) : radialFill(fill, other);
  if (isTwoStop(fill)) return mode === "linear" ? fill : radialFill(fill.from, fill.to);
  return fill.type === mode ? fill : { ...fill, type: mode };
}
