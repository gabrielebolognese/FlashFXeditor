// Base values of the keyable look properties (spec §21.9, Batch 61): where each property of
// `EXTRA_KEYFRAME_PROPS` lives on a clip, so the stopwatch can key the value shown, switching it off
// can bake the value back, and a field edit on a keyed property becomes a key (`keyFollow`).
// Pure and framework-free. Colors are RGBA objects on the clip and [r, g, b, a] in a key.
import type { Draft } from "immer";
import { clipRel, EXTRA_KEYFRAME_PROPS, propValidFor, sampleValue, setKey, SHAPE_PROP_PATTERN, withKeys, type KeyframeProp } from "./keyframes.js";
import type { Clip, Frame, Keyframes, Project, RGBA, ShapeClip } from "./types.js";

export type KeyValue = number | number[];
export type KeyValues = Partial<Record<KeyframeProp, KeyValue>>;

const toVector = (color: RGBA): number[] => [color.r, color.g, color.b, color.a];
const toColor = (value: KeyValue): RGBA => {
  const v = Array.isArray(value) ? value : [value, value, value, 1];
  return { r: v[0] ?? 0, g: v[1] ?? 0, b: v[2] ?? 0, a: v[3] ?? 1 };
};
const isColor = (fill: unknown): fill is RGBA => typeof fill === "object" && fill !== null && "r" in fill && "a" in fill;

/** The value `prop` has on `clip` itself (its base, unkeyed), or undefined when the clip has no such field. */
export function readProp(clip: Clip, prop: KeyframeProp): KeyValue | undefined {
  if (!propValidFor(prop, clip.kind)) return undefined;
  switch (prop) {
    case "transform.anchor.x":
      return "transform" in clip ? clip.transform.anchor.x : undefined;
    case "transform.anchor.y":
      return "transform" in clip ? clip.transform.anchor.y : undefined;
    case "crop.left":
    case "crop.top":
    case "crop.right":
    case "crop.bottom":
      return "crop" in clip ? clip.crop[prop.slice(5) as keyof typeof clip.crop] : undefined;
    case "size.w":
      return clip.kind === "solid" ? clip.size.w : undefined;
    case "size.h":
      return clip.kind === "solid" ? clip.size.h : undefined;
    case "cornerRadius":
      return clip.kind === "solid" ? clip.cornerRadius : "crop" in clip ? (clip.cornerRadius ?? 0) : undefined;
    case "fill":
      return clip.kind === "solid" && isColor(clip.fill) ? toVector(clip.fill) : undefined;
    case "stroke.width":
      return clip.kind === "solid" ? clip.stroke?.width : undefined;
    case "stroke.dashOffset":
      return clip.kind === "solid" && clip.stroke ? (clip.stroke.dashOffset ?? 0) : undefined;
    case "stroke.color":
      return clip.kind === "solid" && clip.stroke ? toVector(clip.stroke.color) : undefined;
    case "shadow.x":
    case "shadow.y":
    case "shadow.blur":
    case "shadow.spread":
      return clip.kind === "solid" ? clip.shadow?.[prop.slice(7) as "x" | "y" | "blur" | "spread"] : undefined;
    case "shadow.color":
      return clip.kind === "solid" && clip.shadow ? toVector(clip.shadow.color) : undefined;
    case "style.fontSize":
      return clip.kind === "text" ? clip.style.fontSize : undefined;
    case "style.letterSpacing":
      return clip.kind === "text" ? clip.style.letterSpacing : undefined;
    case "style.fill":
      return clip.kind === "text" && isColor(clip.style.fill) ? toVector(clip.style.fill) : undefined;
    default:
      return clip.kind === "shape" ? readShapeProp(clip, prop) : undefined;
  }
}

/**
 * A shape path's base value (spec §21.12, Batch 65): `paths.<id>.trim.*` (an absent trim is 0, 1, 0),
 * `stroke.*` when the path has a stroke, `fill` when it is a color, `primitive.<param>` when its
 * primitive has the number param.
 */
function readShapeProp(clip: ShapeClip, prop: string): KeyValue | undefined {
  const match = SHAPE_PROP_PATTERN.exec(prop);
  const path = match ? clip.paths.find((p) => p.id === match[1]) : undefined;
  if (!match || !path) return undefined;
  const field = match[2] as string;
  if (field.startsWith("trim.")) return (path.trim ?? { start: 0, end: 1, offset: 0 })[field.slice(5) as "start" | "end" | "offset"];
  if (field === "fill") return isColor(path.fill) ? toVector(path.fill) : undefined;
  if (field.startsWith("primitive.")) {
    const value = (path.primitive as Record<string, unknown> | undefined)?.[field.slice(10)];
    return typeof value === "number" ? value : undefined;
  }
  const stroke = path.stroke;
  if (!stroke) return undefined;
  if (field === "stroke.width") return stroke.width;
  if (field === "stroke.dashOffset") return stroke.dashOffset ?? 0;
  return toVector(stroke.color);
}

function writeShapeProp(clip: Draft<ShapeClip>, prop: string, value: KeyValue): boolean {
  const match = SHAPE_PROP_PATTERN.exec(prop);
  const path = match ? clip.paths.find((p) => p.id === match[1]) : undefined;
  if (!match || !path) return false;
  const field = match[2] as string;
  const n = Array.isArray(value) ? (value[0] ?? 0) : value;
  if (field.startsWith("trim.")) {
    path.trim ??= { start: 0, end: 1, offset: 0 };
    const key = field.slice(5) as "start" | "end" | "offset";
    path.trim[key] = key === "offset" ? n : Math.min(1, Math.max(0, n));
  } else if (field === "fill") path.fill = toColor(value);
  else if (field.startsWith("primitive.")) (path.primitive as unknown as Record<string, number>)[field.slice(10)] = n;
  else if (path.stroke) {
    if (field === "stroke.width") path.stroke.width = Math.max(0, n);
    else if (field === "stroke.dashOffset") path.stroke.dashOffset = n;
    else path.stroke.color = toColor(value);
  }
  return true;
}

/** Sets the base value of `prop` on a draft clip; false when the clip has no such field. */
export function writeProp(clip: Draft<Clip>, prop: KeyframeProp, value: KeyValue): boolean {
  if (readProp(clip as Clip, prop) === undefined) return false;
  const n = Array.isArray(value) ? (value[0] ?? 0) : value;
  switch (prop) {
    case "transform.anchor.x":
      if ("transform" in clip) clip.transform.anchor.x = n;
      return true;
    case "transform.anchor.y":
      if ("transform" in clip) clip.transform.anchor.y = n;
      return true;
    case "crop.left":
    case "crop.top":
    case "crop.right":
    case "crop.bottom":
      if ("crop" in clip) clip.crop[prop.slice(5) as "left" | "top" | "right" | "bottom"] = n;
      return true;
    case "size.w":
    case "size.h":
      if (clip.kind === "solid") clip.size[prop === "size.w" ? "w" : "h"] = n;
      return true;
    case "cornerRadius":
      if (clip.kind === "solid") clip.cornerRadius = n;
      else if ("crop" in clip) clip.cornerRadius = n;
      return true;
    case "fill":
      if (clip.kind === "solid") clip.fill = toColor(value);
      return true;
    case "stroke.width":
      if (clip.kind === "solid" && clip.stroke) clip.stroke.width = n;
      return true;
    case "stroke.dashOffset":
      if (clip.kind === "solid" && clip.stroke) clip.stroke.dashOffset = n;
      return true;
    case "stroke.color":
      if (clip.kind === "solid" && clip.stroke) clip.stroke.color = toColor(value);
      return true;
    case "shadow.x":
    case "shadow.y":
    case "shadow.blur":
    case "shadow.spread":
      if (clip.kind === "solid" && clip.shadow) clip.shadow[prop.slice(7) as "x" | "y" | "blur" | "spread"] = n;
      return true;
    case "shadow.color":
      if (clip.kind === "solid" && clip.shadow) clip.shadow.color = toColor(value);
      return true;
    case "style.fontSize":
      if (clip.kind === "text") clip.style.fontSize = n;
      return true;
    case "style.letterSpacing":
      if (clip.kind === "text") clip.style.letterSpacing = n;
      return true;
    case "style.fill":
      if (clip.kind === "text") clip.style.fill = toColor(value);
      return true;
    default:
      return clip.kind === "shape" ? writeShapeProp(clip, prop, value) : false;
  }
}

const sameValue = (a: KeyValue | undefined, b: KeyValue | undefined): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return false;
};

/** Whether any look property of `keyframes` has keys. */
export function hasLookKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  for (const prop of EXTRA_KEYFRAME_PROPS) if ((keyframes[prop]?.length ?? 0) > 0) return true;
  return false;
}

/**
 * `clip` as it shows `rel` frames from its start: the same object when no look property has keys,
 * else a copy with the keyed values (what the panel's fields show at the playhead).
 */
export function clipLookAt<C extends Clip>(clip: C, rel: Frame): C {
  const keyframes = "keyframes" in clip ? clip.keyframes : undefined;
  if (!hasLookKeys(keyframes)) return clip;
  const copy = structuredClone(clip) as Draft<C>;
  for (const prop of EXTRA_KEYFRAME_PROPS) {
    const keys = keyframes?.[prop];
    if (keys && keys.length > 0) writeProp(copy as Draft<Clip>, prop, sampleValue(keys, rel));
  }
  return copy as C;
}

/** `clip` as it shows at timeline frame `at` (itself without `at` or without keys). */
export function lookAtFrame<C extends Clip>(clip: C, at: Frame | undefined): C {
  return at === undefined ? clip : clipLookAt(clip, clipRel(clip, at));
}

const NO_SHOWN: ReadonlySet<string> = new Set();

/** Sets every keyed look property of the draft `clip` to its value `rel` frames from its start (what a field edit starts from). */
export function showKeyed(clip: Draft<Clip>, rel: Frame): void {
  const keyframes = "keyframes" in clip ? (clip.keyframes as Keyframes | undefined) : undefined;
  if (!hasLookKeys(keyframes)) return;
  for (const prop of EXTRA_KEYFRAME_PROPS) {
    const keys = keyframes?.[prop];
    if (keys && keys.length > 0) writeProp(clip, prop, sampleValue(keys, rel));
  }
}

/**
 * Field edits on keyed properties become keys (spec §11 stopwatch): after a command ran on `draft`
 * (the project `base` before it), every clip that has keys on a look property and whose base value of
 * that property changed gets the base back and a key at the playhead `at` with the new value. Keys
 * stay valid per `propValidFor`. A keyed anchor edit also keeps the position (the base anchor edit
 * moved it to hold the picture still, which keys do not).
 */
export function keyFollow(base: Project, draft: Draft<Project>, at: Frame, shown: ReadonlySet<string> = NO_SHOWN): void {
  for (const id in base.clips) {
    const before = base.clips[id];
    if (!before || !("keyframes" in before) || !hasLookKeys(before.keyframes)) continue;
    const after = draft.clips[id] as Draft<Clip> | undefined;
    if (!after) continue;
    const rel = clipRel(before, at);
    let anchorMoved = false;
    for (const prop of EXTRA_KEYFRAME_PROPS) {
      const keys = before.keyframes?.[prop];
      if (!keys || keys.length === 0) continue;
      const was = readProp(before, prop);
      const now = readProp(after as Clip, prop);
      if (was === undefined || now === undefined) continue;
      // A command that showed the keyed values first (`showKeyed`) edits from them: what differs there is the edit.
      const changed = shown.has(id) ? !sameValue(sampleValue(keys, rel), now) : !sameValue(was, now);
      if (!sameValue(was, now)) writeProp(after, prop, was);
      if (!changed) continue;
      const own = (after as { keyframes?: Keyframes }).keyframes;
      (after as { keyframes?: Keyframes }).keyframes = withKeys(own as Keyframes | undefined, prop, setKey((own?.[prop] as never) ?? keys, rel, now)) as Draft<Keyframes>;
      if (prop.startsWith("transform.anchor")) anchorMoved = true;
    }
    if (anchorMoved && "transform" in before && "transform" in after) {
      const keyed = (prop: string) => (before.keyframes?.[prop]?.length ?? 0) > 0;
      if (!keyed("transform.x")) after.transform.x = before.transform.x;
      if (!keyed("transform.y")) after.transform.y = before.transform.y;
    }
  }
}
