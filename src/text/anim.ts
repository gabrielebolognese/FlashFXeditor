// Text animations (spec §10.4): what an in or out animation does to a text clip at a frame. Pure; the
// compositor evaluates it every frame (allocation-free), the renderer moves rasters with the result
// (P11: never a new rasterization per frame).
// - Timing: the in animation plays from the clip's first frame (nothing shown on it yet: progress 0),
//   the out animation ends on its last (gone: progress 1), as fades do. Each one plays over at most
//   half the clip (`animLength`), so the two never overlap; the stored duration stays as typed.
// - Units: the whole text (`block`), or its characters, words or lines one after another. The
//   duration is the whole animation: unit i starts `stagger` frames after unit i - 1 and takes
//   `D - (n - 1) * stagger` frames. Without a stagger the units overlap by AUTO_OVERLAP units; a
//   stagger longer than D / n is cut to it. Out animations are mirrored: the last unit leaves first.
// - Each unit's progress goes through the ease, then through the animation's shape: the presence `a`
//   (1 = at rest, 0 = not there) gives the opacity, offset, scale and blur. Out animations keep the
//   direction their name says (slideUp out moves up as it fades), the presence running 1 -> 0.
// - `typewriter` reveals units by count, with no fade; its characters are cut from the drawn lines
//   (render/text/animUnits.ts), so the glyphs stay exactly the static text's.
// - Presets store animations in milliseconds (`PresetTextAnim`: presets cross frame rates); clips in
//   frames.
import { ease, EASE_LABELS } from "../core/document/keyframes.js";
import { frameToUs, usToFrame } from "../core/document/time.js";
import { TEXT_ANIM_IDS, type EaseId, type Frame, type PresetTextAnim, type Rational, type TextAnim, type TextAnimId, type TextAnimUnit } from "../core/document/types.js";

/**
 * The easing curves text animations offer (spec §10.4 `ease`): the first four of the shared list
 * (`EASE_IDS`, curves in core/document/keyframes.ts `ease`, Batch 35).
 */
export const TEXT_EASES = ["linear", "easeIn", "easeOut", "easeInOut"] as const satisfies readonly EaseId[];
export type TextEase = (typeof TEXT_EASES)[number];
export { ease, EASE_LABELS };

export type AnimUnitKind = "block" | TextAnimUnit;
export type AnimPhase = "in" | "out";

interface AnimInfo {
  /** The chip's label. */
  label: string;
  unit: AnimUnitKind;
  /** The in animation's ease (an out animation runs the mirrored one: ease out becomes ease in). */
  ease: TextEase;
  /** Its length when first chosen. */
  seconds: number;
}

export const TEXT_ANIMS: Record<TextAnimId, AnimInfo> = {
  fade: { label: "Fade", unit: "block", ease: "easeOut", seconds: 0.5 },
  slideUp: { label: "Slide up", unit: "block", ease: "easeOut", seconds: 0.5 },
  slideDown: { label: "Slide down", unit: "block", ease: "easeOut", seconds: 0.5 },
  slideLeft: { label: "Slide left", unit: "block", ease: "easeOut", seconds: 0.5 },
  slideRight: { label: "Slide right", unit: "block", ease: "easeOut", seconds: 0.5 },
  pop: { label: "Pop", unit: "block", ease: "linear", seconds: 0.4 },
  typewriter: { label: "Typewriter", unit: "char", ease: "linear", seconds: 1 },
  wordPop: { label: "Word pop", unit: "word", ease: "linear", seconds: 0.8 },
  wordFade: { label: "Word fade", unit: "word", ease: "easeOut", seconds: 0.8 },
  lineReveal: { label: "Line reveal", unit: "line", ease: "easeOut", seconds: 0.6 },
  blurIn: { label: "Blur", unit: "block", ease: "easeOut", seconds: 0.6 },
  scaleBounce: { label: "Bounce", unit: "block", ease: "linear", seconds: 0.8 },
};


/** Longest animation and stagger a field takes (seconds). */
export const MAX_ANIM_SECONDS = 10;
export const MAX_STAGGER_SECONDS = 2;
/** Units overlapping while a stagger spreads them over the duration (each unit takes 1 + this many delays). */
export const AUTO_OVERLAP = 1.5;
/** Slides travel this many font sizes. */
export const SLIDE_EM = 0.6;
/** Pop starts at this scale. */
export const POP_FROM = 0.4;
/** Blur (Gaussian sigma) at the start of a blur, in font sizes. */
export const BLUR_EM = 0.2;

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

export function isTextAnimId(value: unknown): value is TextAnimId {
  return typeof value === "string" && (TEXT_ANIM_IDS as readonly string[]).includes(value);
}

function isEase(value: unknown): value is TextEase {
  return typeof value === "string" && (TEXT_EASES as readonly string[]).includes(value);
}

function isUnit(value: unknown): value is TextAnimUnit {
  return value === "char" || value === "word" || value === "line";
}

const isFrames = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= 100_000;

/** Whether `anim` is an animation the engine plays (documents from older builds may hold anything there). */
export function isPlayable(anim: TextAnim | undefined): anim is TextAnim {
  return anim !== undefined && isTextAnimId(anim.id) && isFrames(anim.duration, 1) && (anim.stagger === undefined || isFrames(anim.stagger, 0));
}

/** The units `anim` moves. */
export function animUnit(anim: Pick<TextAnim, "id" | "perUnit">): AnimUnitKind {
  return isUnit(anim.perUnit) ? anim.perUnit : TEXT_ANIMS[anim.id].unit;
}

/** The ease `anim` plays with in `phase`: its own, else the animation's (mirrored for an out). */
export function animEase(anim: Pick<TextAnim, "id" | "ease">, phase: AnimPhase): TextEase {
  if (isEase(anim.ease)) return anim.ease;
  const own = TEXT_ANIMS[anim.id].ease;
  return phase === "out" && own === "easeOut" ? "easeIn" : own;
}

/** Frames `anim` plays over in a clip of `clipDuration` frames: at most half the clip; 0 when it cannot play. */
export function animLength(anim: TextAnim | undefined, clipDuration: Frame): Frame {
  if (!isPlayable(anim)) return 0;
  return Math.min(anim.duration, Math.floor(clipDuration / 2));
}

/** The animation playing at a clip's local frame, and how far it is (0..1). */
export interface ActiveAnim {
  anim: TextAnim;
  phase: AnimPhase;
  /** 0 on the in animation's first frame, 1 on the out animation's last. */
  progress: number;
  length: Frame;
}

/**
 * The animation of `clip` at `local` frames from its start, into `out`; null when it is at rest (or
 * the frame is outside it).
 */
export function activeAnim(clip: { duration: Frame; animIn?: TextAnim | undefined; animOut?: TextAnim | undefined }, local: Frame, out: ActiveAnim): ActiveAnim | null {
  if (local < 0 || local >= clip.duration) return null;
  const lengthIn = animLength(clip.animIn, clip.duration);
  if (lengthIn > 0 && local < lengthIn) {
    out.anim = clip.animIn as TextAnim;
    out.phase = "in";
    out.progress = local / lengthIn;
    out.length = lengthIn;
    return out;
  }
  const lengthOut = animLength(clip.animOut, clip.duration);
  const from = clip.duration - lengthOut;
  if (lengthOut > 0 && local >= from) {
    out.anim = clip.animOut as TextAnim;
    out.phase = "out";
    out.progress = (local - from + 1) / lengthOut;
    out.length = lengthOut;
    return out;
  }
  return null;
}

/** The delay between two of `count` units of an animation `length` frames long (fractional frames). */
export function unitStagger(anim: Pick<TextAnim, "stagger">, count: number, length: number): number {
  if (count <= 1 || length <= 0) return 0;
  if (anim.stagger === undefined) return length / (count + AUTO_OVERLAP);
  return Math.min(Math.max(0, anim.stagger), length / count);
}

/**
 * Unit `index` of `count`'s own progress (0..1) at the animation's `progress`, in playing order (an
 * out animation plays the units last first).
 */
export function unitProgress(anim: Pick<TextAnim, "stagger">, phase: AnimPhase, progress: number, index: number, count: number, length: number): number {
  if (count <= 1) return clamp01(progress);
  const order = phase === "out" ? count - 1 - index : index;
  const stagger = unitStagger(anim, count, length);
  const own = length - (count - 1) * stagger;
  return clamp01((progress * length - order * stagger) / own);
}

/** How many of `count` units a typewriter shows at `progress` (by count: no fade). */
export function typedCount(phase: AnimPhase, progress: number, count: number): number {
  const typed = Math.min(count, Math.floor(clamp01(progress) * count + 1e-9));
  return phase === "in" ? typed : count - typed;
}

/** What an animation does to one unit (or the whole text) at a frame, in content px. */
export interface UnitState {
  /** Offset. */
  x: number;
  y: number;
  /** Scale about (`ox`, `oy`), the unit's middle. */
  scale: number;
  ox: number;
  oy: number;
  opacity: number;
  /** Gaussian blur (sigma), content px. */
  blur: number;
  /** Shown only inside its place at rest (line reveal: it slides out of a mask). */
  masked: boolean;
  /** Shown only left of this x (typewriter characters); Infinity: whole. */
  cut: number;
}

export function newUnitState(): UnitState {
  return { x: 0, y: 0, scale: 1, ox: 0, oy: 0, opacity: 1, blur: 0, masked: false, cut: Infinity };
}

/** At rest: no offset, scale, blur or cut, opaque. */
export function resetUnitState(out: UnitState): UnitState {
  out.x = 0;
  out.y = 0;
  out.scale = 1;
  out.opacity = 1;
  out.blur = 0;
  out.masked = false;
  out.cut = Infinity;
  return out;
}

/** An overshooting ease out (0 -> 1, about 1.1 at 0.7). */
function backOut(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/** 0 -> 1 with two damped bounces past 1. */
function bounce(a: number): number {
  return 1 - Math.cos(2.5 * Math.PI * a) * (1 - a) ** 3;
}

/** The unit's offset direction while it is not at rest: where it comes from (in) or goes to (out). */
function slideDirection(id: TextAnimId, phase: AnimPhase): { x: number; y: number } {
  const sign = phase === "in" ? 1 : -1;
  switch (id) {
    case "slideUp":
      return { x: 0, y: sign };
    case "slideDown":
      return { x: 0, y: -sign };
    case "slideLeft":
      return { x: sign, y: 0 };
    case "slideRight":
      return { x: -sign, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * `out` for a unit of `anim` whose own eased presence is `a` (1 = at rest): the shape of the
 * animation. `em` is the font size and `height` the unit's height (content px; line reveal travels it).
 * `ox` / `oy` and `cut` are the caller's.
 */
export function writeUnitShape(out: UnitState, id: TextAnimId, phase: AnimPhase, a: number, em: number, height: number): UnitState {
  const p = clamp01(a);
  out.x = 0;
  out.y = 0;
  out.scale = 1;
  out.blur = 0;
  out.masked = false;
  out.opacity = p;
  switch (id) {
    case "fade":
    case "wordFade":
      break;
    case "slideUp":
    case "slideDown":
    case "slideLeft":
    case "slideRight": {
      const dir = slideDirection(id, phase);
      out.x = dir.x * (1 - p) * SLIDE_EM * em;
      out.y = dir.y * (1 - p) * SLIDE_EM * em;
      break;
    }
    case "pop":
    case "wordPop":
      out.scale = POP_FROM + (1 - POP_FROM) * backOut(p);
      out.opacity = clamp01(p * 3);
      break;
    case "scaleBounce":
      out.scale = Math.max(0, bounce(p));
      out.opacity = clamp01(p * 4);
      break;
    case "lineReveal":
      // In: up from under its place; out: up and away. The mask hides what is outside its place.
      out.y = (phase === "in" ? 1 : -1) * (1 - p) * height;
      out.masked = true;
      out.opacity = 1;
      break;
    case "blurIn":
      out.blur = (1 - p) * BLUR_EM * em;
      break;
    case "typewriter":
      out.opacity = p > 0 ? 1 : 0;
      break;
  }
  return out;
}

/** A unit's presence (1 = at rest) at its own progress `t`. */
export function presence(anim: Pick<TextAnim, "id" | "ease">, phase: AnimPhase, t: number): number {
  const e = ease(animEase(anim, phase), t);
  return phase === "in" ? e : 1 - e;
}

// Editing.

/** A new animation `id` for a clip at `fps`: the duration (and stagger and ease) of `previous` kept, else the animation's own. */
export function newTextAnim(id: TextAnimId, fps: Rational, previous?: TextAnim | null): TextAnim {
  const anim: TextAnim = { id, duration: isPlayable(previous ?? undefined) ? (previous as TextAnim).duration : Math.max(1, usToFrame(Math.round(TEXT_ANIMS[id].seconds * 1e6), fps)) };
  if (previous?.stagger !== undefined && isFrames(previous.stagger, 0)) anim.stagger = previous.stagger;
  if (isEase(previous?.ease)) anim.ease = previous.ease;
  return anim;
}

/** `anim` from a file or an older build, made valid; null when it names no animation. */
export function sanitizeTextAnim(value: unknown): TextAnim | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isTextAnimId(raw.id)) return null;
  const duration = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? Math.round(raw.duration) : NaN;
  if (!(duration >= 1)) return null;
  const anim: TextAnim = { id: raw.id, duration: Math.min(duration, 100_000) };
  if (isUnit(raw.perUnit)) anim.perUnit = raw.perUnit;
  if (typeof raw.stagger === "number" && Number.isFinite(raw.stagger) && raw.stagger >= 0) anim.stagger = Math.min(Math.round(raw.stagger), 100_000);
  if (isEase(raw.ease)) anim.ease = raw.ease;
  return anim;
}

const framesToMs = (frames: Frame, fps: Rational) => Math.round(frameToUs(frames, fps) / 1000);
const msToFrames = (ms: number, fps: Rational) => usToFrame(Math.round(ms) * 1000, fps);

/** A clip's animation as a preset stores it (milliseconds). */
export function toPresetAnim(anim: TextAnim, fps: Rational): PresetTextAnim {
  return {
    id: anim.id,
    durationMs: framesToMs(anim.duration, fps),
    ...(anim.perUnit !== undefined && { perUnit: anim.perUnit }),
    ...(anim.stagger !== undefined && { staggerMs: framesToMs(anim.stagger, fps) }),
    ...(anim.ease !== undefined && { ease: anim.ease }),
  };
}

/** A preset's animation on a clip at `fps` (whole frames, at least one). */
export function fromPresetAnim(anim: PresetTextAnim, fps: Rational): TextAnim {
  return {
    id: anim.id,
    duration: Math.max(1, msToFrames(anim.durationMs, fps)),
    ...(anim.perUnit !== undefined && { perUnit: anim.perUnit }),
    ...(anim.staggerMs !== undefined && { stagger: Math.max(0, msToFrames(anim.staggerMs, fps)) }),
    ...(anim.ease !== undefined && { ease: anim.ease }),
  };
}

/** A preset animation read from a file, made valid; null when it names no animation. */
export function sanitizePresetAnim(value: unknown): PresetTextAnim | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isTextAnimId(raw.id)) return null;
  const ms = typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? Math.round(raw.durationMs) : NaN;
  if (!(ms >= 1)) return null;
  const anim: PresetTextAnim = { id: raw.id, durationMs: Math.min(ms, MAX_ANIM_SECONDS * 1000) };
  if (isUnit(raw.perUnit)) anim.perUnit = raw.perUnit;
  if (typeof raw.staggerMs === "number" && Number.isFinite(raw.staggerMs) && raw.staggerMs >= 0) anim.staggerMs = Math.min(Math.round(raw.staggerMs), MAX_STAGGER_SECONDS * 1000);
  if (isEase(raw.ease)) anim.ease = raw.ease;
  return anim;
}

/** Whether two clip animations play the same (absent equals absent). */
export function sameAnim(a: TextAnim | undefined, b: TextAnim | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.duration === b.duration && a.perUnit === b.perUnit && a.stagger === b.stagger && a.ease === b.ease;
}
