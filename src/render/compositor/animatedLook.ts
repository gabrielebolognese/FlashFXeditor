// The keyed values of a clip's look at a frame (spec §21.9, Batch 60), for the compositor: crop edges,
// a picture's corner radius, and a solid's size, radius, fill, stroke and shadow. Each function returns
// the base object itself when none of its properties has keys, else its scratch object filled for the
// frame, so an unkeyed clip costs one lookup and a keyed one allocates nothing per frame.
import { propValue, sampleVector, type KeyframeProp } from "../../core/document/keyframes.js";
import type { Crop, Keyframes, RGBA, ShadowStyle, SolidClip, StrokeStyle } from "../../core/document/types.js";
import type { SolidLook } from "../../timeline/edit/solid.js";

const has = (keyframes: Keyframes, prop: KeyframeProp): boolean => (keyframes[prop]?.length ?? 0) > 0;

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

const channels: number[] = [0, 0, 0, 1];

/** The color keyed under `prop` at `rel`, written into `out` (channels clamped to 0..1). */
export function sampleColor(keyframes: Keyframes, prop: KeyframeProp, rel: number, out: RGBA): RGBA {
  const keys = keyframes[prop];
  if (!keys || keys.length === 0) return out;
  sampleVector(keys, rel, channels);
  out.r = clamp01(channels[0] ?? 0);
  out.g = clamp01(channels[1] ?? 0);
  out.b = clamp01(channels[2] ?? 0);
  out.a = clamp01(channels[3] ?? 1);
  return out;
}

/** The crop at `rel`: `base` when no edge has keys, else `out` with the keyed edges (the rest from `base`). */
export function animatedCrop(keyframes: Keyframes | undefined, base: Crop, rel: number, out: Crop): Crop {
  if (!keyframes || !(has(keyframes, "crop.left") || has(keyframes, "crop.top") || has(keyframes, "crop.right") || has(keyframes, "crop.bottom"))) return base;
  out.left = propValue(keyframes, "crop.left", rel, base.left);
  out.top = propValue(keyframes, "crop.top", rel, base.top);
  out.right = propValue(keyframes, "crop.right", rel, base.right);
  out.bottom = propValue(keyframes, "crop.bottom", rel, base.bottom);
  return out;
}

/** A picture's corner radius at `rel` (its own when unkeyed). */
export function animatedRadius(keyframes: Keyframes | undefined, base: number, rel: number): number {
  return keyframes && has(keyframes, "cornerRadius") ? Math.max(0, propValue(keyframes, "cornerRadius", rel, base)) : base;
}

/** The scratch objects `animatedSolidLook` writes into (one per compositor). */
export interface SolidScratch {
  look: { -readonly [K in keyof SolidLook]: SolidLook[K] };
  size: { w: number; h: number };
  fill: RGBA;
  stroke: StrokeStyle;
  shadow: ShadowStyle;
}

export function newSolidScratch(): SolidScratch {
  const fill: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  const size = { w: 0, h: 0 };
  return {
    look: { shape: "rect", fill, size, cornerRadius: 0 },
    size,
    fill,
    stroke: { width: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: "center" },
    shadow: { x: 0, y: 0, blur: 0, spread: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
  };
}

const SOLID_PROPS: readonly KeyframeProp[] = [
  "size.w", "size.h", "cornerRadius", "fill", "stroke.width", "stroke.color", "stroke.dashOffset",
  "shadow.x", "shadow.y", "shadow.blur", "shadow.spread", "shadow.color",
];

/** Whether any property `animatedSolidLook` reads has keys. */
export function hasSolidKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  for (const prop of SOLID_PROPS) if (has(keyframes, prop)) return true;
  return false;
}

/**
 * `base` (the solid's look, or a live one) with its keyed size, corner radius, flat fill, stroke and
 * shadow at `rel`: `base` itself when nothing is keyed. A gradient fill, and a stroke or a shadow the
 * solid does not have, are never animated (the keys are kept and ignored). Per-corner radii win over
 * a keyed `cornerRadius`, as they do over the plain one.
 */
export function animatedSolidLook(clip: Pick<SolidClip, "keyframes">, base: SolidLook, rel: number, scratch: SolidScratch): SolidLook {
  const keyframes = clip.keyframes;
  if (!hasSolidKeys(keyframes)) return base;
  const k = keyframes as Keyframes;
  const out = scratch.look;
  out.shape = base.shape;
  scratch.size.w = propValue(k, "size.w", rel, base.size.w);
  scratch.size.h = propValue(k, "size.h", rel, base.size.h);
  out.size = scratch.size;
  out.cornerRadius = Math.max(0, propValue(k, "cornerRadius", rel, base.cornerRadius));
  if (base.cornerRadii) out.cornerRadii = base.cornerRadii;
  else delete out.cornerRadii;
  const fill = base.fill;
  if (has(k, "fill") && "r" in fill) {
    scratch.fill.r = fill.r;
    scratch.fill.g = fill.g;
    scratch.fill.b = fill.b;
    scratch.fill.a = fill.a;
    out.fill = sampleColor(k, "fill", rel, scratch.fill);
  } else out.fill = fill;
  const stroke = base.stroke;
  if (stroke && (has(k, "stroke.width") || has(k, "stroke.color") || has(k, "stroke.dashOffset"))) {
    const next = scratch.stroke;
    next.width = Math.max(0, propValue(k, "stroke.width", rel, stroke.width));
    next.align = stroke.align;
    if (stroke.dash) next.dash = stroke.dash;
    else delete next.dash;
    const dashOffset = propValue(k, "stroke.dashOffset", rel, stroke.dashOffset ?? 0);
    if (stroke.dashOffset !== undefined || has(k, "stroke.dashOffset")) next.dashOffset = dashOffset;
    else delete next.dashOffset;
    next.color.r = stroke.color.r;
    next.color.g = stroke.color.g;
    next.color.b = stroke.color.b;
    next.color.a = stroke.color.a;
    sampleColor(k, "stroke.color", rel, next.color);
    out.stroke = next;
  } else if (stroke) out.stroke = stroke;
  else delete out.stroke;
  const shadow = base.shadow;
  if (shadow && (has(k, "shadow.x") || has(k, "shadow.y") || has(k, "shadow.blur") || has(k, "shadow.spread") || has(k, "shadow.color"))) {
    const next = scratch.shadow;
    next.x = propValue(k, "shadow.x", rel, shadow.x);
    next.y = propValue(k, "shadow.y", rel, shadow.y);
    next.blur = Math.max(0, propValue(k, "shadow.blur", rel, shadow.blur));
    next.spread = propValue(k, "shadow.spread", rel, shadow.spread);
    next.color.r = shadow.color.r;
    next.color.g = shadow.color.g;
    next.color.b = shadow.color.b;
    next.color.a = shadow.color.a;
    sampleColor(k, "shadow.color", rel, next.color);
    out.shadow = next;
  } else if (shadow) out.shadow = shadow;
  else delete out.shadow;
  return out;
}
