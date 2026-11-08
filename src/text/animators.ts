// Range-selector animators (spec §21.13, Batch 68): what a text clip's animators do to each unit of its
// text at a frame. Pure and allocation-free per frame: the compositor passes the geometry of the atlas
// it draws from (which character, word or line each atlas unit belongs to) and gets a `UnitState` per
// unit, drawn by the same quads as the in and out animations (P11: transforms, opacity, blur and tint on
// the GPU, nothing rasterized per frame).
// - Amount: each animator's selector gives every unit of its own unit kind a weight 0..1
//   (`text/rangeSelector.ts`); a finer atlas unit (a character of a word) takes its unit's weight.
// - Props at weight w: x, y, rotation and blur add `prop * w`; scale and opacity move toward their value
//   (`1 + (prop - 1) * w`), multiplying across animators; tracking spreads the units of a line apart by
//   `tracking * w` each (a centered line stays centered); fill is the color a unit's tint moves toward.
//   The clip tints toward the first animator that has a fill (one tint color per clip).
// - Keys: `animators.<id>.selector.start|end|offset` and `animators.<id>.props.<name>`.
import { ANIMATOR_PROP_PATTERN, sampleValue, scalar } from "../core/document/keyframes.js";
import type { Keyframes, RGBA, SelectorOrder, SelectorShape, TextAnimator, TextAnimUnit } from "../core/document/types.js";
import { SELECTOR_ORDERS, SELECTOR_SHAPES } from "../core/document/types.js";
import { selectorWeights } from "./rangeSelector.js";
import { newUnitState, resetUnitState, type UnitState } from "./anim.js";


/** An animator with the defaults of a new one: every character, ramping up, an offset to key. */
export function newAnimator(id: string): TextAnimator {
  return { id, unit: "char", selector: { start: 0, end: 1, offset: 0, shape: "rampUp", ease: 0, order: "forward", seed: 1 }, props: { y: 40, opacity: 0 } };
}

/** The next animator id not used by `animators` (`a1`, `a2`, ...). */
export function nextAnimatorId(animators: readonly TextAnimator[] | undefined): string {
  const used = new Set((animators ?? []).map((a) => a.id));
  for (let n = 1; ; n++) if (!used.has(`a${n}`)) return `a${n}`;
}

/** What the atlas a text is drawn from holds, for the animators' units. */
export interface AnimatorGeometry {
  /** Units of the atlas drawn. */
  count: number;
  /** Per atlas unit: its line (units of a line are consecutive). */
  line: ArrayLike<number>;
  /** How many units each kind has, and per atlas unit which unit of that kind it belongs to. */
  counts: Readonly<Record<TextAnimUnit, number>>;
  index: Readonly<Record<TextAnimUnit, ArrayLike<number>>>;
  /** Alignment of the lines: 0 left, 0.5 center, 1 right (tracking keeps a centered line centered). */
  align: number;
}

/** The values of an animator at a frame (keys applied). */
interface Resolved {
  selector: { start: number; end: number; offset: number; shape: SelectorShape; ease: number; order: SelectorOrder; seed: number };
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
  tracking: number;
  fill: readonly number[] | null;
}

const resolved: Resolved = { selector: { start: 0, end: 1, offset: 0, shape: "rampUp", ease: 0, order: "forward", seed: 1 }, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, tracking: 0, fill: null };

function keyed(keyframes: Keyframes | undefined, prop: string, rel: number, base: number): number {
  const keys = keyframes?.[prop];
  return keys && keys.length > 0 ? scalar(sampleValue(keys, rel)) : base;
}

function keyedColor(keyframes: Keyframes | undefined, prop: string, rel: number, base: RGBA | undefined): readonly number[] | null {
  const keys = keyframes?.[prop];
  if (keys && keys.length > 0) {
    const value = sampleValue(keys, rel);
    return Array.isArray(value) ? value : [value, value, value, 1];
  }
  return base ? [base.r, base.g, base.b, base.a] : null;
}

const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/** `animator` at `rel` frames from the clip's start, into `out`. */
export function resolveAnimator(animator: TextAnimator, keyframes: Keyframes | undefined, rel: number, out: Resolved = resolved): Resolved {
  const s = animator.selector;
  const id = animator.id;
  const sel = out.selector;
  sel.start = finite(keyed(keyframes, `animators.${id}.selector.start`, rel, s.start), 0);
  sel.end = finite(keyed(keyframes, `animators.${id}.selector.end`, rel, s.end), 1);
  sel.offset = finite(keyed(keyframes, `animators.${id}.selector.offset`, rel, s.offset), 0);
  sel.shape = (SELECTOR_SHAPES as readonly string[]).includes(s.shape) ? s.shape : "rampUp";
  sel.ease = finite(s.ease, 0);
  sel.order = (SELECTOR_ORDERS as readonly string[]).includes(s.order) ? s.order : "forward";
  sel.seed = finite(s.seed, 1);
  const p = animator.props;
  out.x = finite(keyed(keyframes, `animators.${id}.props.x`, rel, p.x ?? 0), 0);
  out.y = finite(keyed(keyframes, `animators.${id}.props.y`, rel, p.y ?? 0), 0);
  out.scale = finite(keyed(keyframes, `animators.${id}.props.scale`, rel, p.scale ?? 1), 1);
  out.rotation = finite(keyed(keyframes, `animators.${id}.props.rotation`, rel, p.rotation ?? 0), 0);
  out.opacity = finite(keyed(keyframes, `animators.${id}.props.opacity`, rel, p.opacity ?? 1), 1);
  out.blur = Math.max(0, finite(keyed(keyframes, `animators.${id}.props.blur`, rel, p.blur ?? 0), 0));
  out.tracking = finite(keyed(keyframes, `animators.${id}.props.tracking`, rel, p.tracking ?? 0), 0);
  out.fill = keyedColor(keyframes, `animators.${id}.props.fill`, rel, p.fill);
  return out;
}

const weights: number[] = [];
const tracked: number[] = [];

/** The tint an evaluation ended on (read by the compositor after `evaluateAnimators` returned true). */
export const tintColor: RGBA = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Every animator of a clip at `rel`, accumulated into `states` (one per atlas unit, reset first). The
 * `ox` / `oy` of the states are the caller's. Returns whether any unit is tinted (`tintColor` is the color).
 */
export function evaluateAnimators(animators: readonly TextAnimator[], keyframes: Keyframes | undefined, rel: number, g: AnimatorGeometry, states: UnitState[]): boolean {
  const n = g.count;
  for (let i = 0; i < n; i++) resetUnitState(states[i] as UnitState);
  let tinted = false;
  let haveColor = false;
  for (const animator of animators) {
    const r = resolveAnimator(animator, keyframes, rel);
    const kind = animator.unit;
    const count = g.counts[kind];
    if (!(count > 0)) continue;
    selectorWeights(count, r.selector, weights);
    const index = g.index[kind];
    let tint = false;
    if (r.fill) {
      tint = true;
      if (!haveColor) {
        tintColor.r = r.fill[0] as number;
        tintColor.g = r.fill[1] as number;
        tintColor.b = r.fill[2] as number;
        tintColor.a = r.fill[3] ?? 1;
        haveColor = true;
      }
    }
    for (let i = 0; i < n; i++) {
      const w = weights[index[i] as number] ?? 0;
      if (w === 0) continue;
      const state = states[i] as UnitState;
      state.x += r.x * w;
      state.y += r.y * w;
      state.rotation += r.rotation * w;
      state.blur += r.blur * w;
      if (r.scale !== 1) state.scale *= Math.max(0, 1 + (r.scale - 1) * w);
      if (r.opacity !== 1) state.opacity *= Math.min(1, Math.max(0, 1 + (r.opacity - 1) * w));
      if (tint) {
        state.tint = Math.max(state.tint, w);
        tinted = true;
      }
    }
    if (r.tracking !== 0) {
      // Each unit moves by the tracking of the units before it in its line; a centered line less half its total.
      tracked.length = n;
      for (let i = 0; i < n; i++) tracked[i] = r.tracking * (weights[index[i] as number] ?? 0);
      let start = 0;
      while (start < n) {
        const line = g.line[start];
        let end = start;
        let total = 0;
        while (end < n && g.line[end] === line) total += tracked[end++] as number;
        let before = 0;
        for (let i = start; i < end; i++) {
          (states[i] as UnitState).x += before - g.align * (total - (tracked[end - 1] as number));
          before += tracked[i] as number;
        }
        start = end;
      }
    }
  }
  return tinted;
}

/** `states` grown to `count` (made once, reused). */
export function sizedStates(states: UnitState[], count: number): UnitState[] {
  while (states.length < count) states.push(newUnitState());
  states.length = count;
  return states;
}

// Editing and validation.

export function isAnimatorPropId(prop: string): boolean {
  return ANIMATOR_PROP_PATTERN.test(prop);
}

const isUnit = (value: unknown): value is TextAnimUnit => value === "char" || value === "word" || value === "line";
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** `animators` from a file or an older build, made valid (unknown units and non-numbers dropped, ids unique). */
export function sanitizeAnimators(value: unknown): TextAnimator[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TextAnimator[] = [];
  const seen = new Set<string>();
  for (const raw of value as Record<string, unknown>[]) {
    if (typeof raw !== "object" || raw === null || typeof raw.id !== "string" || raw.id === "" || seen.has(raw.id) || !isUnit(raw.unit)) continue;
    seen.add(raw.id);
    const base = newAnimator(raw.id);
    const s = (raw.selector ?? {}) as Record<string, unknown>;
    const p = (raw.props ?? {}) as Record<string, unknown>;
    const props: TextAnimator["props"] = {};
    for (const name of ["x", "y", "scale", "rotation", "opacity", "blur", "tracking"] as const) if (isNum(p[name])) props[name] = p[name] as number;
    if (typeof p.fill === "object" && p.fill !== null) props.fill = p.fill as RGBA;
    out.push({
      id: raw.id,
      unit: raw.unit,
      selector: {
        start: isNum(s.start) ? s.start : base.selector.start,
        end: isNum(s.end) ? s.end : base.selector.end,
        offset: isNum(s.offset) ? s.offset : 0,
        shape: (SELECTOR_SHAPES as readonly unknown[]).includes(s.shape) ? (s.shape as SelectorShape) : "rampUp",
        ease: isNum(s.ease) ? Math.max(-1, Math.min(1, s.ease)) : 0,
        order: (SELECTOR_ORDERS as readonly unknown[]).includes(s.order) ? (s.order as SelectorOrder) : "forward",
        seed: isNum(s.seed) && s.seed >= 0 ? Math.floor(s.seed) : 1,
      },
      props,
    });
  }
  return out.length > 0 ? out : undefined;
}
