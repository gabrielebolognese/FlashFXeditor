// Keyframes (spec §5.2 `Keyframes`, §6.4, §6.10, §6.15, §7.3, §11; Batch 35): evaluation and the pure
// key list edits the commands are made of. Pure and framework-free; sampling allocates nothing (the
// compositor runs it every playback frame).
// - Properties: the transform's x, y, scale, scaleY and rotation, the opacity and the clip gain in dB
//   (`volume.gainDb`: the rubber band's keys, Batch 37). A clip's `keyframes` holds a list per
//   property it animates; a property without keys keeps the clip's own (base) value.
// - Sections (spec §11 "stopwatch per animatable section"): transform, opacity, volume. A section's
//   keys share their frames: the stopwatch and every edit write a key for each property of the
//   section at the playhead, so "a Transform keyframe at frame f" is one thing in the panel, on the
//   lane and on the gizmo.
// - Frames are relative to the clip start (integers, P4). Before the first key a property holds the
//   first value, after the last the last one; between two keys the left key's ease shapes the move
//   (hold: the value jumps at the next key). Keys outside the clip's range stay (a trim back shows
//   them again, spec §6.10) and still shape the motion inside it.
// - Splits (`sliceKeyframes`): a new edge gets a key with the value there when that keeps the motion
//   exactly (inside a linear or hold segment, or past the last key); inside an eased segment the one
//   key beyond the edge is kept instead, so both pieces animate exactly as before.
// - Speed changes and rate stretches (`retimeKeyframes`) scale the frames; keys landing on one frame
//   merge (the later one wins), eases and holds stay.
import { ease as bezierEase, type CubicBezier } from "../theme/easing.js";
import { EASE_IDS, type EaseId, type Frame, type Keyframes, type Transform } from "./types.js";

export interface Key {
  frame: Frame;
  value: number;
  ease: EaseId;
}

export const KEYFRAME_PROPS = ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation", "opacity", "volume.gainDb"] as const;
export type KeyframeProp = (typeof KEYFRAME_PROPS)[number];

/** The animatable sections (spec §11), in the panel's order. */
export const KEYFRAME_SECTIONS = ["transform", "opacity", "volume"] as const;
export type KeyframeSection = (typeof KEYFRAME_SECTIONS)[number];

export const SECTION_PROPS: Readonly<Record<KeyframeSection, readonly KeyframeProp[]>> = {
  transform: ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation"],
  opacity: ["opacity"],
  volume: ["volume.gainDb"],
};

export const SECTION_LABELS: Readonly<Record<KeyframeSection, string>> = { transform: "Transform", opacity: "Opacity", volume: "Volume" };

export function isKeyframeProp(value: unknown): value is KeyframeProp {
  return typeof value === "string" && (KEYFRAME_PROPS as readonly string[]).includes(value);
}

export function isKeyframeSection(value: unknown): value is KeyframeSection {
  return typeof value === "string" && (KEYFRAME_SECTIONS as readonly string[]).includes(value);
}

export function isEaseId(value: unknown): value is EaseId {
  return typeof value === "string" && (EASE_IDS as readonly string[]).includes(value);
}

export function sectionOf(prop: KeyframeProp): KeyframeSection {
  return prop === "opacity" ? "opacity" : prop === "volume.gainDb" ? "volume" : "transform";
}

// --- Eases ---------------------------------------------------------------------------------------

export const EASE_LABELS: Readonly<Record<EaseId, string>> = {
  linear: "Linear",
  easeIn: "Ease in",
  easeOut: "Ease out",
  easeInOut: "Ease in-out",
  hold: "Hold",
  smooth: "Smooth",
  snap: "Snap",
  overshoot: "Overshoot",
};

/** Control points (x1, y1, x2, y2) of the cubic-bezier presets. */
const BEZIERS: Readonly<Partial<Record<EaseId, CubicBezier>>> = {
  smooth: [0.25, 0.1, 0.25, 1],
  snap: [0.2, 0, 0, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
};

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

/** Progress of `curve` at `t` (0..1, clamped): 0 at the start, 1 at the end (overshoot passes 1 on its way). Hold stays 0. */
export function ease(curve: EaseId, t: number): number {
  const x = clamp01(t);
  switch (curve) {
    case "linear":
      return x;
    case "easeIn":
      return x * x * x;
    case "easeOut":
      return 1 - (1 - x) ** 3;
    case "easeInOut":
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case "hold":
      return x >= 1 ? 1 : 0;
    default: {
      const points = BEZIERS[curve];
      return points ? bezierEase(points, x) : x;
    }
  }
}

/** Whether a segment with `curve` can be cut at any frame by a key with the value there, keeping the motion (linear, hold). */
const cuttable = (curve: EaseId) => curve === "linear" || curve === "hold";

// --- Sampling ------------------------------------------------------------------------------------

/** Index of the last key at or before `rel` (-1 when `rel` is before the first). */
export function keyIndexAt(keys: readonly Key[], rel: number): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((keys[mid] as Key).frame <= rel) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** The value of a sorted, non-empty key list at `rel` (frames from the clip start, fractional allowed). */
export function sampleKeys(keys: readonly Key[], rel: number): number {
  const at = keyIndexAt(keys, rel);
  if (at < 0) return (keys[0] as Key).value;
  const left = keys[at] as Key;
  const right = keys[at + 1];
  if (!right || rel === left.frame) return left.value;
  const t = (rel - left.frame) / (right.frame - left.frame);
  return left.value + (right.value - left.value) * ease(left.ease, t);
}

/** `prop` at `rel`: its keys' value, else `base`. */
export function propValue(keyframes: Keyframes | undefined, prop: KeyframeProp, rel: number, base: number): number {
  const keys = keyframes?.[prop];
  return keys && keys.length > 0 ? sampleKeys(keys, rel) : base;
}

/** Whether any property of `section` has keys. */
export function hasSectionKeys(keyframes: Keyframes | undefined, section: KeyframeSection): boolean {
  if (!keyframes) return false;
  for (const prop of SECTION_PROPS[section]) if ((keyframes[prop]?.length ?? 0) > 0) return true;
  return false;
}

/** Whether `keyframes` has any key at all. */
export function hasAnyKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  for (const prop in keyframes) if ((keyframes[prop]?.length ?? 0) > 0) return true;
  return false;
}

interface Keyed {
  transform: Transform;
  keyframes?: Keyframes | undefined;
}

/**
 * The transform of `clip` at `rel` frames from its start: its own when the Transform section has no
 * keys (the same object), else the animated one written into `out` (a new object when absent).
 * The anchor and the flips are not animated (the anchor object is shared with the clip's).
 */
export function animatedTransform(clip: Keyed, rel: number, out?: Transform): Transform {
  const keyframes = clip.keyframes;
  if (!hasSectionKeys(keyframes, "transform")) return clip.transform;
  const base = clip.transform;
  const target: Transform = out ?? { ...base };
  target.x = propValue(keyframes, "transform.x", rel, base.x);
  target.y = propValue(keyframes, "transform.y", rel, base.y);
  target.scale = propValue(keyframes, "transform.scale", rel, base.scale);
  const scaleY = keyframes?.["transform.scaleY"];
  if (scaleY && scaleY.length > 0) target.scaleY = sampleKeys(scaleY, rel);
  else if (base.scaleY !== undefined) target.scaleY = base.scaleY;
  else delete target.scaleY;
  target.rotation = propValue(keyframes, "transform.rotation", rel, base.rotation);
  target.anchor = base.anchor;
  target.flipH = base.flipH;
  target.flipV = base.flipV;
  return target;
}

/** The opacity of `clip` at `rel` (its own when it has no opacity keys). */
export function animatedOpacity(clip: { opacity: number; keyframes?: Keyframes | undefined }, rel: number): number {
  return propValue(clip.keyframes, "opacity", rel, clip.opacity);
}

/**
 * The clip gain in dB at `rel` (spec §14; fractional frames allowed): the audio scheduler's keyed gain
 * curves (audio/scheduler/envelope.ts), the rubber band, the waveform and the Audio section read it.
 */
export function gainDbAt(clip: { volume: { gainDb: number }; keyframes?: Keyframes | undefined }, rel: number): number {
  return propValue(clip.keyframes, "volume.gainDb", rel, clip.volume.gainDb);
}

/** `frame` (a timeline frame) as a frame of the clip, kept inside it: where an edit at the playhead writes. */
export function clipRel(clip: { start: Frame; duration: Frame }, frame: Frame): Frame {
  return Math.min(Math.max(0, Math.round(frame) - clip.start), clip.duration - 1);
}

/**
 * `clip` as it shows at timeline `frame`: its transform and opacity evaluated there (the same object
 * when neither is keyed). For the panel's fields, the gizmo and the one-click transforms.
 */
export function clipAt<C extends Keyed & { opacity: number; start: Frame; duration: Frame }>(clip: C, frame: Frame): C {
  const keyframes = clip.keyframes;
  const transform = hasSectionKeys(keyframes, "transform");
  const opacity = hasSectionKeys(keyframes, "opacity");
  if (!transform && !opacity) return clip;
  const rel = clipRel(clip, frame);
  return { ...clip, transform: transform ? animatedTransform(clip, rel) : clip.transform, opacity: opacity ? animatedOpacity(clip, rel) : clip.opacity };
}

/** The values of `section`'s properties shown at `rel`, from `transform`, `opacity` and the gain (the base when unkeyed). */
export function sectionValues(clip: Keyed & { opacity?: number; volume?: { gainDb: number } }, section: KeyframeSection, rel: number): Partial<Record<KeyframeProp, number>> {
  switch (section) {
    case "transform":
      return transformValues(animatedTransform(clip, rel));
    case "opacity":
      return { opacity: propValue(clip.keyframes, "opacity", rel, clip.opacity ?? 1) };
    case "volume":
      return { "volume.gainDb": propValue(clip.keyframes, "volume.gainDb", rel, clip.volume?.gainDb ?? 0) };
  }
}

/** A transform as the Transform section's key values (scaleY = scale when uniform). */
export function transformValues(transform: Transform): Partial<Record<KeyframeProp, number>> {
  return {
    "transform.x": transform.x,
    "transform.y": transform.y,
    "transform.scale": transform.scale,
    "transform.scaleY": transform.scaleY ?? transform.scale,
    "transform.rotation": transform.rotation,
  };
}

/** The largest |scale| the Transform keys and `transform` reach (text rasters are made at it, P11). Cached per keyframes object. */
const maxScales = new WeakMap<Keyframes, number>();
export function maxKeyedScale(keyframes: Keyframes | undefined, transform: Transform): number {
  const own = Math.max(Math.abs(transform.scale), Math.abs(transform.scaleY ?? transform.scale));
  if (!keyframes) return own;
  let cached = maxScales.get(keyframes);
  if (cached === undefined) {
    cached = 0;
    for (const prop of ["transform.scale", "transform.scaleY"] as const) for (const key of keyframes[prop] ?? []) cached = Math.max(cached, Math.abs(key.value));
    maxScales.set(keyframes, cached);
  }
  return Math.max(own, cached);
}

// --- Section frames ------------------------------------------------------------------------------

/** The frames of `section`'s keys (the union of its properties'), ascending; with `duration`, only those inside [0, duration). */
export function sectionFrames(keyframes: Keyframes | undefined, section: KeyframeSection, duration?: Frame): Frame[] {
  if (!keyframes) return [];
  const frames = new Set<Frame>();
  for (const prop of SECTION_PROPS[section]) for (const key of keyframes[prop] ?? []) if (duration === undefined || (key.frame >= 0 && key.frame < duration)) frames.add(key.frame);
  return [...frames].sort((a, b) => a - b);
}

/** The ease of `section`'s key at `rel` (its first property's that has one), or null when there is none. */
export function sectionEaseAt(keyframes: Keyframes | undefined, section: KeyframeSection, rel: Frame): EaseId | null {
  if (!keyframes) return null;
  for (const prop of SECTION_PROPS[section]) {
    const key = keyframes[prop]?.find((candidate) => candidate.frame === rel);
    if (key) return key.ease;
  }
  return null;
}

// --- Key list edits (pure) -----------------------------------------------------------------------

/** `keyframes` with `prop`'s list replaced (removed when empty); undefined when nothing is left. */
export function withKeys(keyframes: Keyframes | undefined, prop: string, keys: readonly Key[] | undefined): Keyframes | undefined {
  const next: Keyframes = { ...keyframes };
  if (keys && keys.length > 0) next[prop] = keys.map((key) => ({ frame: key.frame, value: key.value, ease: key.ease }));
  else delete next[prop];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * `keys` with a key at `frame` set to `value`: an existing key keeps its ease (or takes `ease`); a new
 * one takes `ease`, else the ease of the segment it lands in (the key before it), else linear.
 */
export function setKey(keys: readonly Key[], frame: Frame, value: number, ease?: EaseId): Key[] {
  const at = keyIndexAt(keys, frame);
  const next = keys.slice();
  const current = keys[at];
  if (current && current.frame === frame) next[at] = { frame, value, ease: ease ?? current.ease };
  else next.splice(at + 1, 0, { frame, value, ease: ease ?? (current && keys[at + 1] ? current.ease : "linear") });
  return next;
}

/** `keyframes` with a key for every property of `values` at `rel` (`setKey` rules). */
export function writeKeys(keyframes: Keyframes | undefined, rel: Frame, values: Partial<Record<KeyframeProp, number>>, ease?: EaseId): Keyframes | undefined {
  let next = keyframes;
  for (const prop of KEYFRAME_PROPS) {
    const value = values[prop];
    if (value === undefined || !Number.isFinite(value)) continue;
    next = withKeys(next, prop, setKey(next?.[prop] ?? [], rel, value, ease));
  }
  return next;
}

/** `keyframes` without `section`'s keys at `frames` (all of them when `frames` is null). */
export function removeSectionKeys(keyframes: Keyframes | undefined, section: KeyframeSection, frames: ReadonlySet<Frame> | null): Keyframes | undefined {
  let next = keyframes;
  for (const prop of SECTION_PROPS[section]) {
    const keys = next?.[prop];
    if (!keys) continue;
    next = withKeys(next, prop, frames === null ? undefined : keys.filter((key) => !frames.has(key.frame)));
  }
  return next;
}

/**
 * `keyframes` with `section`'s keys at `frames` moved by `delta` frames; a moved key landing on a key
 * that stays replaces it (spec §6.15 retime). Order is kept (the moved keys keep their own order).
 */
export function moveSectionKeys(keyframes: Keyframes | undefined, section: KeyframeSection, frames: ReadonlySet<Frame>, delta: number): Keyframes | undefined {
  if (delta === 0 || frames.size === 0) return keyframes;
  let next = keyframes;
  for (const prop of SECTION_PROPS[section]) {
    const keys = next?.[prop];
    if (!keys) continue;
    const moved = keys.filter((key) => frames.has(key.frame)).map((key) => ({ ...key, frame: key.frame + delta }));
    if (moved.length === 0) continue;
    const landed = new Set(moved.map((key) => key.frame));
    const kept = keys.filter((key) => !frames.has(key.frame) && !landed.has(key.frame));
    next = withKeys(next, prop, [...kept, ...moved].sort((a, b) => a.frame - b.frame));
  }
  return next;
}

/** `keyframes` with the ease of `section`'s keys at `frames` set to `ease`. */
export function setSectionEase(keyframes: Keyframes | undefined, section: KeyframeSection, frames: ReadonlySet<Frame>, ease: EaseId): Keyframes | undefined {
  let next = keyframes;
  for (const prop of SECTION_PROPS[section]) {
    const keys = next?.[prop];
    if (!keys || !keys.some((key) => frames.has(key.frame))) continue;
    next = withKeys(
      next,
      prop,
      keys.map((key) => (frames.has(key.frame) ? { ...key, ease } : key)),
    );
  }
  return next;
}

/**
 * The keys of the part [`from`, `to`) of a clip (frames relative to the clip, `to` exclusive),
 * re-based to the part's start (spec §6.11, Batch 35). `newIn` / `newOut` tell which edges are new
 * (cut): keys past an edge that did not move are kept, as trims keep them. At a new edge the motion
 * stays exact: a key with the value there inside a linear or hold segment, or past the last key
 * (constant); inside an eased segment the key beyond the edge is kept (outside the part, so not
 * drawn, but still shaping the motion). Undefined when no key is left.
 */
export function sliceKeyframes(keyframes: Keyframes, from: Frame, to: Frame, newIn: boolean, newOut: boolean): Keyframes | undefined {
  const result: Keyframes = {};
  const lower = newIn ? from : -Infinity;
  const upper = newOut ? to : Infinity;
  for (const [prop, keys] of Object.entries(keyframes)) {
    if (keys.length === 0) continue;
    const out = new Map<Frame, Key>();
    for (const key of keys) if (key.frame >= lower && key.frame < upper) out.set(key.frame, { ...key });
    const edge = (at: Frame, side: "in" | "out") => {
      if (keys.some((key) => key.frame === at)) return;
      const index = keyIndexAt(keys, at);
      const left = keys[index];
      const right = keys[index + 1];
      if (!left) {
        // Before the first key: constant at its value. The part needs a key only when none of its own
        // remains (the first key lies past the part).
        if (side === "out" && out.size === 0 && right) out.set(at, { frame: at, value: right.value, ease: "linear" });
        return;
      }
      if (!right) {
        // Past the last key: constant at its value.
        if (side === "in") out.set(at, { frame: at, value: left.value, ease: left.ease });
        return;
      }
      if (cuttable(left.ease)) out.set(at, { frame: at, value: sampleKeys(keys, at), ease: left.ease });
      else if (side === "in") out.set(left.frame, { ...left });
      else out.set(right.frame, { ...right });
    };
    if (newIn) edge(from, "in");
    if (newOut) edge(to - 1, "out");
    if (out.size === 0) continue;
    result[prop] = [...out.values()].sort((a, b) => a.frame - b.frame).map((key) => ({ ...key, frame: key.frame - from }));
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Keys moved by `frames` (earlier when positive; spec §6.10 in trims: keys stay on their source frame). */
export function shiftKeyframes(keyframes: Keyframes, frames: number): Keyframes {
  const result: Keyframes = {};
  for (const [prop, keys] of Object.entries(keyframes)) result[prop] = keys.map((key) => ({ ...key, frame: key.frame - frames }));
  return result;
}

/**
 * Key frames scaled by `ratio` and rounded (a speed change or a rate stretch, Batch 35): keys landing
 * on one frame merge, the later one winning (it holds from there on); eases and holds stay.
 */
export function retimeKeyframes(keyframes: Keyframes, ratio: number): Keyframes {
  const result: Keyframes = {};
  for (const [prop, keys] of Object.entries(keyframes)) {
    const out: Key[] = [];
    for (const key of keys) {
      // `|| 0`: no -0 (a key before the clip's start scaled onto it; JSON writes it as 0).
      const frame = Math.round(key.frame * ratio) || 0;
      const last = out[out.length - 1];
      if (last && last.frame === frame) out[out.length - 1] = { ...key, frame };
      else out.push({ ...key, frame });
    }
    result[prop] = out;
  }
  return result;
}

/** Every key value of `props` mapped by `map` (a resolution change scales positions and scales, spec §15). */
export function mapKeyValues(keyframes: Keyframes, map: Partial<Record<KeyframeProp, (value: number) => number>>): Keyframes {
  const result: Keyframes = {};
  for (const [prop, keys] of Object.entries(keyframes)) {
    const fn = isKeyframeProp(prop) ? map[prop] : undefined;
    result[prop] = fn ? keys.map((key) => ({ ...key, value: fn(key.value) })) : keys.map((key) => ({ ...key }));
  }
  return result;
}

// --- Validation ----------------------------------------------------------------------------------

/** What is wrong with a clip's keyframes (spec §5.2 invariants, Batch 35): known properties, sorted integer frames, finite values, known eases, no empty list. */
export function keyframeIssues(keyframes: Keyframes): string[] {
  const issues: string[] = [];
  for (const [prop, keys] of Object.entries(keyframes)) {
    if (!isKeyframeProp(prop)) issues.push(`keyframes: unknown property "${prop}"`);
    if (!Array.isArray(keys) || keys.length === 0) {
      issues.push(`keyframes.${prop}: an empty list`);
      continue;
    }
    let previous = -Infinity;
    for (const key of keys) {
      if (!Number.isInteger(key.frame)) issues.push(`keyframes.${prop}: frame ${key.frame} must be an integer`);
      if (!(key.frame > previous)) issues.push(`keyframes.${prop}: frame ${key.frame} must come after ${previous}`);
      if (!Number.isFinite(key.value)) issues.push(`keyframes.${prop}: value ${key.value} at frame ${key.frame} must be finite`);
      if (!isEaseId(key.ease)) issues.push(`keyframes.${prop}: unknown ease "${String(key.ease)}" at frame ${key.frame}`);
      previous = key.frame;
    }
  }
  return issues;
}
