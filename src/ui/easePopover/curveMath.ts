// Pure helpers of the ease popover and the bezier editor (spec §21.9, Batch 61): the CSS text of a
// cubic-bezier, its parser, the editor's clamp, the presets and the SVG path of an ease curve.

export type Bezier = [number, number, number, number];

/** Vertical range of a bezier's control points: overshoot goes past 0..1 (y free within these). */
export const BEZIER_Y_MIN = -2;
export const BEZIER_Y_MAX = 3;

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** `cubic-bezier(x1, y1, x2, y2)` with each number rounded to 3 decimals, no trailing zeros. */
export function cssBezier(points: Readonly<Bezier>): string {
  return `cubic-bezier(${points.map((value) => String(round3(value) + 0)).join(", ")})`;
}

const PATTERN = /^\s*cubic-bezier\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)\s*;?\s*$/i;

/** The points of a `cubic-bezier(...)` text, or null when it is not one. */
export function parseCssBezier(text: string): Bezier | null {
  const match = PATTERN.exec(text);
  if (!match) return null;
  const points = [1, 2, 3, 4].map((index) => Number(match[index]));
  return points.every(Number.isFinite) ? (points as Bezier) : null;
}

const clamp = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);

/** x1 and x2 in 0..1 (a function of time), y1 and y2 within BEZIER_Y_MIN..BEZIER_Y_MAX. */
export function clampBezier(points: Readonly<Bezier>): Bezier {
  const [x1, y1, x2, y2] = points;
  return [clamp(x1, 0, 1), clamp(y1, BEZIER_Y_MIN, BEZIER_Y_MAX), clamp(x2, 0, 1), clamp(y2, BEZIER_Y_MIN, BEZIER_Y_MAX)];
}

export interface BezierPreset {
  id: string;
  name: string;
  points: Bezier;
}

export const BEZIER_PRESETS: readonly BezierPreset[] = [
  { id: "ease", name: "Ease", points: [0.25, 0.1, 0.25, 1] },
  { id: "ease-in", name: "Ease in", points: [0.42, 0, 1, 1] },
  { id: "ease-out", name: "Ease out", points: [0, 0, 0.58, 1] },
  { id: "ease-in-out", name: "Ease in-out", points: [0.42, 0, 0.58, 1] },
  { id: "back-out", name: "Back out", points: [0.34, 1.56, 0.64, 1] },
  { id: "expo-out", name: "Expo out", points: [0.16, 1, 0.3, 1] },
  { id: "snap", name: "Snap", points: [0.2, 0, 0, 1] },
  { id: "easy-ease", name: "Easy Ease", points: [0.333, 0, 0.667, 1] },
];

/** The CSS `ease` curve: what a bezier key without points uses. */
export const DEFAULT_BEZIER: Readonly<Bezier> = [0.25, 0.1, 0.25, 1];

/** The preset whose points equal `points`, or null. */
export function presetOf(points: Readonly<Bezier>): BezierPreset | null {
  return BEZIER_PRESETS.find((preset) => preset.points.every((value, index) => Math.abs(value - (points[index] ?? NaN)) < 0.0005)) ?? null;
}

/**
 * The SVG path (`d`) of a curve: `sample(t)` for t in 0..1 as progress, drawn in a `width` x `height`
 * box with `pad` around it; progress 0 is the bottom, 1 the top. `steps` segments (40 = 41 samples).
 * `hold` curves (a step) are drawn by the caller with `holdPath`.
 */
export function curvePath(sample: (t: number) => number, width: number, height: number, pad = 0, steps = 40): string {
  const w = width - 2 * pad;
  const h = height - 2 * pad;
  let d = "";
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = pad + t * w;
    const y = pad + (1 - sample(t)) * h;
    d += `${i === 0 ? "M" : "L"}${round2(x)} ${round2(y)}`;
  }
  return d;
}

/** The path of a hold curve: flat at 0, then a jump to 1 at the end. */
export function holdPath(width: number, height: number, pad = 0): string {
  return `M${pad} ${height - pad}L${width - pad} ${height - pad}L${width - pad} ${pad}`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
