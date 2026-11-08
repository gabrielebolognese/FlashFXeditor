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
import { cubicBezier, EASINGS, springProgress, type EasingName } from "./easings.js";
import { EASE_IDS, PENNER_EASES, type EaseId, type Frame, type KeyData, type Keyframes, type Transform } from "./types.js";

/** A key (spec §21.9): a number value, or an array for the vector properties (colors). */
export type Key = KeyData;

/** The properties of the Transform, Opacity and Volume sections (Batches 35 to 37). */
const SECTION_KEYFRAME_PROPS = ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation", "opacity", "volume.gainDb"] as const;
/** The properties added in Batch 60 (spec §21.9): their stopwatches and lanes follow in Batch 61. */
export const EXTRA_KEYFRAME_PROPS = [
  "transform.anchor.x", "transform.anchor.y",
  "crop.left", "crop.top", "crop.right", "crop.bottom",
  "size.w", "size.h", "cornerRadius", "fill",
  "stroke.width", "stroke.color", "stroke.dashOffset",
  "shadow.x", "shadow.y", "shadow.blur", "shadow.spread", "shadow.color",
  "style.fontSize", "style.letterSpacing", "style.fill",
] as const;
/** The properties added in Batch 68 (spec §21.13): the counter's value (the animators' are `ANIMATOR_PROP_PATTERN`). */
export const TEXT_KEYFRAME_PROPS = ["text.counter.value"] as const;
export const KEYFRAME_PROPS = [...SECTION_KEYFRAME_PROPS, ...EXTRA_KEYFRAME_PROPS, ...TEXT_KEYFRAME_PROPS] as const;
export type KeyframeProp = (typeof KEYFRAME_PROPS)[number];
/** The properties of the Transform, Opacity and Volume sections (the ones the panel's stopwatches key). */
export type SectionKeyframeProp = (typeof SECTION_KEYFRAME_PROPS)[number];

/** The vector properties: colors [r, g, b, a] (straight alpha, 0..1, interpolated per channel). */
export const COLOR_PROPS: readonly KeyframeProp[] = ["fill", "stroke.color", "shadow.color", "style.fill"];

export function isColorProp(prop: string): boolean {
  return (COLOR_PROPS as readonly string[]).includes(prop) || (prop.startsWith("paths.") && (prop.endsWith(".stroke.color") || prop.endsWith(".fill"))) || (prop.startsWith("animators.") && prop.endsWith(".props.fill"));
}

/**
 * The keyframe properties of a shape clip's paths (spec §21.12, Batch 65): `paths.<id>.trim.start|end|offset`,
 * `paths.<id>.stroke.width|color|dashOffset`, `paths.<id>.fill` (color fills) and `paths.<id>.primitive.<param>`.
 * Groups: 1 the path id, 2 the field path, 3 the primitive param.
 */
export const SHAPE_PROP_PATTERN = /^paths\.([A-Za-z0-9_-]+)\.(trim\.(?:start|end|offset)|stroke\.(?:width|color|dashOffset)|fill|primitive\.([A-Za-z]+))$/;
/** The same, as the template ids listed in the manifest and INTEROP.md. */
export const SHAPE_KEYFRAME_PROPS = [
  "paths.<id>.trim.start", "paths.<id>.trim.end", "paths.<id>.trim.offset",
  "paths.<id>.stroke.width", "paths.<id>.stroke.color", "paths.<id>.stroke.dashOffset",
  "paths.<id>.fill", "paths.<id>.primitive.<param>",
] as const;

export function isShapeProp(prop: string): boolean {
  return SHAPE_PROP_PATTERN.test(prop);
}

/**
 * The keyframe properties of a text clip's animators (spec §21.13, Batch 68): `animators.<id>.selector.start|end|offset`
 * and `animators.<id>.props.<name>` (`fill` is a color). Groups: 1 the animator id, 2 the field path.
 */
export const ANIMATOR_PROP_PATTERN = /^animators\.([A-Za-z0-9_-]+)\.(selector\.(?:start|end|offset)|props\.(?:x|y|scale|rotation|opacity|blur|tracking|fill))$/;
/** The same, as the template ids listed in the manifest and INTEROP.md. */
export const ANIMATOR_KEYFRAME_PROPS = [
  "animators.<id>.selector.start", "animators.<id>.selector.end", "animators.<id>.selector.offset",
  "animators.<id>.props.x", "animators.<id>.props.y", "animators.<id>.props.scale", "animators.<id>.props.rotation",
  "animators.<id>.props.opacity", "animators.<id>.props.blur", "animators.<id>.props.tracking", "animators.<id>.props.fill",
] as const;

export function isAnimatorProp(prop: string): boolean {
  return ANIMATOR_PROP_PATTERN.test(prop);
}

/** The clip kinds each new property is valid on (the section properties are valid on any clip with them). */
const PROP_KINDS: Readonly<Record<string, readonly string[]>> = {
  "transform.anchor.x": ["video", "image", "solid", "text", "compound", "shape"],
  "transform.anchor.y": ["video", "image", "solid", "text", "compound", "shape"],
  "crop.left": ["video", "image"],
  "crop.top": ["video", "image"],
  "crop.right": ["video", "image"],
  "crop.bottom": ["video", "image"],
  "size.w": ["solid"],
  "size.h": ["solid"],
  cornerRadius: ["solid", "video", "image"],
  fill: ["solid"],
  "stroke.width": ["solid"],
  "stroke.color": ["solid"],
  "stroke.dashOffset": ["solid"],
  "shadow.x": ["solid"],
  "shadow.y": ["solid"],
  "shadow.blur": ["solid"],
  "shadow.spread": ["solid"],
  "shadow.color": ["solid"],
  "style.fontSize": ["text"],
  "style.letterSpacing": ["text"],
  "style.fill": ["text"],
  "text.counter.value": ["text"],
};

/** Whether keys of `prop` make sense on a clip of `kind`. */
export function propValidFor(prop: string, kind: string): boolean {
  if (prop.startsWith("paths.")) return kind === "shape";
  if (prop.startsWith("animators.")) return kind === "text";
  const kinds = PROP_KINDS[prop];
  return kinds === undefined || kinds.includes(kind);
}

/** The animatable sections (spec §11), in the panel's order. */
export const KEYFRAME_SECTIONS = ["transform", "opacity", "volume", "anchor", "size", "crop", "corners", "fill", "stroke", "shadow", "text", "look"] as const;
export type KeyframeSection = (typeof KEYFRAME_SECTIONS)[number];

export const SECTION_PROPS: Readonly<Record<KeyframeSection, readonly KeyframeProp[]>> = {
  transform: ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation"],
  opacity: ["opacity"],
  volume: ["volume.gainDb"],
  /** The stopwatch groups of Batch 61 (spec §21.9, §11): each sits in the panel's Transform, Crop, Solid, Frame or Text section. */
  anchor: ["transform.anchor.x", "transform.anchor.y"],
  size: ["size.w", "size.h"],
  crop: ["crop.left", "crop.top", "crop.right", "crop.bottom"],
  corners: ["cornerRadius"],
  fill: ["fill"],
  stroke: ["stroke.width", "stroke.color", "stroke.dashOffset"],
  shadow: ["shadow.x", "shadow.y", "shadow.blur", "shadow.spread", "shadow.color"],
  text: ["style.fontSize", "style.letterSpacing", "style.fill"],
  /** Every look property: the lane that shows all of them (no stopwatch). */
  look: EXTRA_KEYFRAME_PROPS,
};

export const SECTION_LABELS: Readonly<Record<KeyframeSection, string>> = {
  transform: "Transform", opacity: "Opacity", volume: "Volume", anchor: "Anchor", size: "Size", crop: "Crop", corners: "Corners",
  fill: "Fill", stroke: "Stroke", shadow: "Shadow", text: "Text", look: "Look",
};

/** The sections with a stopwatch of their own (every one but the all-properties Look lane). */
export const STOPWATCH_SECTIONS: readonly KeyframeSection[] = KEYFRAME_SECTIONS.filter((section) => section !== "look");

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
  if ((EXTRA_KEYFRAME_PROPS as readonly string[]).includes(prop)) return "look";
  if (prop === "text.counter.value") return "text";
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
  ...(Object.fromEntries(PENNER_EASES.map((id) => [id, pennerLabel(id)])) as Record<(typeof PENNER_EASES)[number], string>),
  bezier: "Custom bezier",
  spring: "Spring",
};

function pennerLabel(id: string): string {
  const match = /^(sine|quad|cubic|quart|quint|expo|circ|back|elastic|bounce)(In|Out|InOut)$/.exec(id) as RegExpExecArray;
  const family = match[1] as string;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${match[2] === "InOut" ? "in-out" : (match[2] as string).toLowerCase()}`;
}

/** The ease selector's groups (spec §21.9; a plain grouped list until Batch 61's popover). */
export const EASE_GROUPS: readonly { label: string; eases: readonly EaseId[] }[] = [
  { label: "Basic", eases: ["linear", "easeIn", "easeOut", "easeInOut", "hold", "smooth", "snap", "overshoot"] },
  ...(["sine", "quad", "cubic", "quart", "quint", "expo", "circ", "back", "elastic", "bounce"] as const).map((family) => ({
    label: family.charAt(0).toUpperCase() + family.slice(1),
    eases: PENNER_EASES.filter((id) => id.startsWith(family)) as readonly EaseId[],
  })),
  { label: "Custom", eases: ["bezier", "spring"] },
];

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
  if (x <= 0) return 0;
  if (x >= 1) return 1;
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
    case "bezier":
      return x;
    case "spring":
      return springProgress(x);
    default: {
      const penner = EASINGS[curve as EasingName];
      if (penner) return penner(x);
      const points = BEZIERS[curve];
      return points ? bezierEase(points, x) : x;
    }
  }
}

/** The curve of a `bezier` key without its own points: the CSS `ease`. */
const DEFAULT_BEZIER: readonly [number, number, number, number] = [0.25, 0.1, 0.25, 1];

/** Progress of the segment that starts at `key` at `t`: its ease, with its own bezier or spring parameters. */
export function keyEase(key: Key, t: number): number {
  if (key.ease === "bezier") {
    const [x1, y1, x2, y2] = key.bezier ?? DEFAULT_BEZIER;
    const x = clamp01(t);
    return x <= 0 ? 0 : x >= 1 ? 1 : cubicBezier(x, x1, y1, x2, y2);
  }
  if (key.ease === "spring") return springProgress(clamp01(t), key.spring?.damping ?? 0.7, key.spring?.frequency ?? 4);
  return ease(key.ease, t);
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
  if (at < 0) return scalar((keys[0] as Key).value);
  const left = keys[at] as Key;
  const right = keys[at + 1];
  if (!right || rel === left.frame) return scalar(left.value);
  const t = (rel - left.frame) / (right.frame - left.frame);
  const from = scalar(left.value);
  return from + (scalar(right.value) - from) * keyEase(left, t);
}

/** A key value read as a number (the first component of a vector). */
export function scalar(value: number | number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

/**
 * The vector value of a sorted, non-empty key list at `rel`, written into `out` (per component; a hold
 * segment jumps at the next key). The same array comes back.
 */
export function sampleVector(keys: readonly Key[], rel: number, out: number[]): number[] {
  const at = keyIndexAt(keys, rel);
  const left = (at < 0 ? keys[0] : keys[at]) as Key;
  const right = at < 0 ? undefined : keys[at + 1];
  const a = Array.isArray(left.value) ? left.value : [left.value];
  out.length = a.length;
  if (!right || rel === left.frame) {
    for (let i = 0; i < a.length; i++) out[i] = a[i] as number;
    return out;
  }
  const b = Array.isArray(right.value) ? right.value : [right.value];
  const progress = keyEase(left, (rel - left.frame) / (right.frame - left.frame));
  for (let i = 0; i < a.length; i++) out[i] = (a[i] as number) + (((b[i] ?? a[i]) as number) - (a[i] as number)) * progress;
  return out;
}

/** A key list's value at `rel` as it is stored: a number, or a new array for a vector property. */
export function sampleValue(keys: readonly Key[], rel: number): number | number[] {
  return Array.isArray((keys[0] as Key).value) ? sampleVector(keys, rel, []) : sampleKeys(keys, rel);
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

/** Whether the transform moves over time: keys in the Transform section or on the anchor (spec §21.9). */
export function hasTransformKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  return hasSectionKeys(keyframes, "transform") || (keyframes["transform.anchor.x"]?.length ?? 0) > 0 || (keyframes["transform.anchor.y"]?.length ?? 0) > 0;
}

/** The anchor objects animated transforms own (written per frame; never the clip's own). */
const ownAnchors = new WeakSet<object>();

/**
 * The transform of `clip` at `rel` frames from its start: its own when the Transform section has no
 * keys (the same object), else the animated one written into `out` (a new object when absent).
 * The anchor and the flips are not animated (the anchor object is shared with the clip's).
 */
export function animatedTransform(clip: Keyed, rel: number, out?: Transform): Transform {
  const keyframes = clip.keyframes;
  if (!hasTransformKeys(keyframes)) return clip.transform;
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
  const anchorX = keyframes?.["transform.anchor.x"];
  const anchorY = keyframes?.["transform.anchor.y"];
  if ((anchorX && anchorX.length > 0) || (anchorY && anchorY.length > 0)) {
    // A keyed anchor: written into an object this scratch owns, so the clip's own is never touched.
    let anchor = target.anchor;
    if (!ownAnchors.has(anchor)) {
      anchor = { x: base.anchor.x, y: base.anchor.y };
      ownAnchors.add(anchor);
      target.anchor = anchor;
    }
    anchor.x = anchorX && anchorX.length > 0 ? sampleKeys(anchorX, rel) : base.anchor.x;
    anchor.y = anchorY && anchorY.length > 0 ? sampleKeys(anchorY, rel) : base.anchor.y;
  } else target.anchor = base.anchor;
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
  const transform = hasTransformKeys(keyframes);
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
    default:
      // The look sections' values come from the clip's own fields (timeline/edit/keyframes.ts `valuesAt`).
      return {};
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
    for (const prop of ["transform.scale", "transform.scaleY"] as const) for (const key of keyframes[prop] ?? []) cached = Math.max(cached, Math.abs(scalar(key.value)));
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
  if (keys && keys.length > 0) next[prop] = keys.map((key) => ({ ...key }));
  else delete next[prop];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * `keys` with a key at `frame` set to `value`: an existing key keeps its ease (or takes `ease`); a new
 * one takes `ease`, else the ease of the segment it lands in (the key before it), else linear.
 */
export function setKey(keys: readonly Key[], frame: Frame, value: number | number[], ease?: EaseId, params?: Pick<Key, "bezier" | "spring">): Key[] {
  const at = keyIndexAt(keys, frame);
  const next = keys.slice();
  const current = keys[at];
  if (current && current.frame === frame) {
    // A value edit keeps the key's own bezier/spring points; a new ease (or explicit params) replaces them.
    const key: Key = { frame, value, ease: ease ?? current.ease };
    const source = params ?? (key.ease === current.ease ? current : undefined);
    if (source?.bezier && key.ease === "bezier") key.bezier = [...source.bezier];
    if (source?.spring && key.ease === "spring") key.spring = { ...source.spring };
    next[at] = key;
  } else {
    const key: Key = { frame, value, ease: ease ?? (current && keys[at + 1] ? current.ease : "linear") };
    if (params?.bezier && key.ease === "bezier") key.bezier = [...params.bezier];
    if (params?.spring && key.ease === "spring") key.spring = { ...params.spring };
    next.splice(at + 1, 0, key);
  }
  return next;
}

/** `keyframes` with a key for every property of `values` at `rel` (`setKey` rules). */
export function writeKeys(keyframes: Keyframes | undefined, rel: Frame, values: Partial<Record<KeyframeProp, number | number[]>>, ease?: EaseId): Keyframes | undefined {
  let next = keyframes;
  for (const prop of KEYFRAME_PROPS) {
    const value = values[prop];
    if (value === undefined || !(Array.isArray(value) ? value.every(Number.isFinite) : Number.isFinite(value))) continue;
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
export function setSectionEase(keyframes: Keyframes | undefined, section: KeyframeSection, frames: ReadonlySet<Frame>, ease: EaseId, params?: EaseParams): Keyframes | undefined {
  let next = keyframes;
  for (const prop of SECTION_PROPS[section]) {
    const keys = next?.[prop];
    if (!keys || !keys.some((key) => frames.has(key.frame))) continue;
    next = withKeys(
      next,
      prop,
      keys.map((key) => (frames.has(key.frame) ? withEase(key, ease, params) : key)),
    );
  }
  return next;
}

/** The parameters of a `bezier` or `spring` ease (spec §21.9). */
export type EaseParams = Pick<Key, "bezier" | "spring">;

/** `key` with `ease`: a bezier or spring ease takes `params` (else keeps its own points when the ease does not change), any other drops them. */
export function withEase(key: Key, ease: EaseId, params?: EaseParams): Key {
  const next: Key = { frame: key.frame, value: key.value, ease };
  const source = params ?? (key.ease === ease ? key : undefined);
  if (ease === "bezier" && source?.bezier) next.bezier = [...source.bezier];
  if (ease === "spring" && source?.spring) next.spring = { ...source.spring };
  return next;
}

/** The first key of `section` at `rel` (its first property's that has one), or null: the ease popover's current curve. */
export function sectionKeyAt(keyframes: Keyframes | undefined, section: KeyframeSection, rel: Frame): Key | null {
  if (!keyframes) return null;
  for (const prop of SECTION_PROPS[section]) {
    const key = keyframes[prop]?.find((candidate) => candidate.frame === rel);
    if (key) return key;
  }
  return null;
}

/**
 * `keyframes` with `section`'s keys at `frames` reversed in time: the keys keep their values and
 * mirror their frames inside the selection's span (first <-> last), the eases of the segments reverse
 * with them (a segment's curve is mirrored: In <-> Out, a bezier (x1, y1, x2, y2) becomes
 * (1 - x2, 1 - y2, 1 - x1, 1 - y1)), spring and hold segments keep their kind. (Spec §21.9 Reverse keys.)
 */
export function reverseSectionKeys(keyframes: Keyframes | undefined, section: KeyframeSection, frames: ReadonlySet<Frame>): Keyframes | undefined {
  if (frames.size < 2) return keyframes;
  const ordered = [...frames].sort((a, b) => a - b);
  const first = ordered[0] as number;
  const last = ordered[ordered.length - 1] as number;
  let next = keyframes;
  for (const prop of SECTION_PROPS[section]) {
    const keys = next?.[prop];
    if (!keys) continue;
    const picked = keys.filter((key) => frames.has(key.frame));
    if (picked.length < 2) continue;
    // The segment from picked[i] to picked[i + 1] (with picked[i]'s ease) now runs from the mirrored
    // picked[i + 1] to the mirrored picked[i]: the mirrored key of picked[i + 1] carries picked[i]'s ease, mirrored.
    const mirrored = picked.map((key, i) => {
      const segment = i > 0 ? picked[i - 1] : undefined;
      const base: Key = { frame: first + last - key.frame, value: key.value, ease: "linear" };
      if (segment) Object.assign(base, mirrorEase(segment));
      return base;
    });
    mirrored.sort((a, b) => a.frame - b.frame);
    // The last picked key (now first after mirroring the order) keeps the ease it had if it was the end of the span.
    const tail = mirrored[mirrored.length - 1];
    const original = picked[picked.length - 1] as Key;
    if (tail) Object.assign(tail, { ease: original.ease, ...(original.bezier ? { bezier: [...original.bezier] } : {}), ...(original.spring ? { spring: { ...original.spring } } : {}) });
    const kept = keys.filter((key) => !frames.has(key.frame));
    next = withKeys(next, prop, [...kept, ...mirrored].sort((a, b) => a.frame - b.frame));
  }
  return next;
}

const MIRRORED: Readonly<Partial<Record<EaseId, EaseId>>> = {
  easeIn: "easeOut", easeOut: "easeIn",
  ...Object.fromEntries(PENNER_EASES.flatMap((id) => (id.endsWith("InOut") ? [] : [[id, id.endsWith("In") ? `${id.slice(0, -2)}Out` : `${id.slice(0, -3)}In`]]))),
};

/** The ease fields of the segment `key` starts, as that segment plays backwards. */
function mirrorEase(key: Key): Pick<Key, "ease" | "bezier" | "spring"> {
  if (key.ease === "bezier") {
    const [x1, y1, x2, y2] = key.bezier ?? DEFAULT_BEZIER;
    return { ease: "bezier", bezier: [1 - x2, 1 - y2, 1 - x1, 1 - y1] };
  }
  if (key.ease === "spring") return { ease: "spring", ...(key.spring ? { spring: { ...key.spring } } : {}) };
  return { ease: MIRRORED[key.ease] ?? key.ease };
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
      if (cuttable(left.ease)) out.set(at, { frame: at, value: sampleValue(keys, at), ease: left.ease });
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
    result[prop] = fn ? keys.map((key) => ({ ...key, value: fn(scalar(key.value)) })) : keys.map((key) => ({ ...key }));
  }
  return result;
}

// --- Validation ----------------------------------------------------------------------------------

function validBezier(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n)) && value[0] >= 0 && value[0] <= 1 && value[2] >= 0 && value[2] <= 1;
}

/** What a shape clip lacks for keys of the path property `prop` (its path, a stroke, a color fill, the primitive's param); null when it has it. */
export function shapePropIssue(prop: string, paths: unknown): string | null {
  const match = SHAPE_PROP_PATTERN.exec(prop);
  if (!match) return "not a path property";
  const list = Array.isArray(paths) ? (paths as { id?: unknown; fill?: unknown; stroke?: unknown; trim?: unknown; primitive?: { kind?: unknown } & Record<string, unknown> }[]) : [];
  const path = list.find((candidate) => candidate?.id === match[1]);
  if (!path) return `the shape has no path "${match[1]}"`;
  const field = match[2] as string;
  if (field.startsWith("stroke.") && !path.stroke) return "the path has no stroke";
  if (field === "fill" && !isColorFill(path.fill)) return "the path's fill is not a plain color";
  if (match[3] !== undefined && typeof path.primitive?.[match[3]] !== "number") return `the path has no primitive with "${match[3]}"`;
  return null;
}

/** What a text clip lacks for keys of the animator property `prop` (its animator); null when it has it. */
export function animatorPropIssue(prop: string, animators: unknown): string | null {
  const match = ANIMATOR_PROP_PATTERN.exec(prop);
  if (!match) return "not an animator property";
  const list = Array.isArray(animators) ? (animators as { id?: unknown }[]) : [];
  if (!list.some((candidate) => candidate?.id === match[1])) return `the text has no animator "${match[1]}"`;
  return null;
}

/** Whether a solid's `fill` is a plain color (the only fill `fill` keys can animate). */
export function isColorFill(fill: unknown): boolean {
  return typeof fill === "object" && fill !== null && "r" in fill;
}

/** What is wrong with a clip's keyframes (spec §5.2 invariants, Batch 35): known properties, sorted integer frames, finite values, known eases, no empty list. */
export function keyframeIssues(keyframes: Keyframes, clip?: { kind: string; fill?: unknown; paths?: unknown; animators?: unknown }): string[] {
  const issues: string[] = [];
  for (const [prop, keys] of Object.entries(keyframes)) {
    if (isAnimatorProp(prop)) {
      if (clip && clip.kind !== "text") issues.push(`keyframes.${prop}: not a property of a ${clip.kind} clip`);
      else if (clip) {
        const issue = animatorPropIssue(prop, clip.animators);
        if (issue) issues.push(`keyframes.${prop}: ${issue}`);
      }
    } else if (isShapeProp(prop)) {
      if (clip && clip.kind !== "shape") issues.push(`keyframes.${prop}: not a property of a ${clip.kind} clip`);
      else if (clip) {
        const issue = shapePropIssue(prop, clip.paths);
        if (issue) issues.push(`keyframes.${prop}: ${issue}`);
      }
    } else if (!isKeyframeProp(prop)) issues.push(`keyframes: unknown property "${prop}"`);
    else if (clip && !propValidFor(prop, clip.kind)) issues.push(`keyframes.${prop}: not a property of a ${clip.kind} clip`);
    else if (clip && prop === "fill" && clip.kind === "solid" && !isColorFill(clip.fill)) issues.push("keyframes.fill: the solid's fill is not a plain color");
    const vector = isColorProp(prop);
    if (!Array.isArray(keys) || keys.length === 0) {
      issues.push(`keyframes.${prop}: an empty list`);
      continue;
    }
    let previous = -Infinity;
    for (const key of keys) {
      if (!Number.isInteger(key.frame)) issues.push(`keyframes.${prop}: frame ${key.frame} must be an integer`);
      if (!(key.frame > previous)) issues.push(`keyframes.${prop}: frame ${key.frame} must come after ${previous}`);
      if (vector) {
        if (!Array.isArray(key.value) || key.value.length !== 4 || !key.value.every((channel) => Number.isFinite(channel))) issues.push(`keyframes.${prop}: value at frame ${key.frame} must be a color [r, g, b, a]`);
      } else if (typeof key.value !== "number" || !Number.isFinite(key.value)) issues.push(`keyframes.${prop}: value ${String(key.value)} at frame ${key.frame} must be a finite number`);
      if (!isEaseId(key.ease)) issues.push(`keyframes.${prop}: unknown ease "${String(key.ease)}" at frame ${key.frame}`);
      if (key.bezier !== undefined && !validBezier(key.bezier)) issues.push(`keyframes.${prop}: the bezier at frame ${key.frame} needs four finite numbers with x1 and x2 in 0..1`);
      if (key.spring !== undefined && !(Number.isFinite(key.spring.damping) && key.spring.damping >= 0 && Number.isFinite(key.spring.frequency) && key.spring.frequency > 0)) issues.push(`keyframes.${prop}: the spring at frame ${key.frame} needs damping >= 0 and frequency > 0`);
      previous = key.frame;
    }
  }
  return issues;
}
