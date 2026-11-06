// Time remapping, reverse and frame blending (spec §21.22, Batch 78). Pure functions: the source time a
// media clip shows at a timeline frame (through a remap curve, a reverse, or the constant speed), the
// speed graph of a curve, the one-click ramps and the frame-blend split. The retiming idea (a plain
// frame -> source time curve that every other path evaluates) follows FlashFX-v2 `src/core/timeRemap.ts`.

import { ease } from "./keyframes.js";
import { framesToSourceUs, usPerFrame } from "./time.js";
import type { EaseId, Frame, MediaClip, Rational, Us } from "./types.js";

export interface RemapKey {
  frame: Frame;
  sourceUs: Us;
  ease: EaseId;
}

/** The clip fields a source-time lookup reads. */
export type RemapSource = Pick<MediaClip, "start" | "in" | "out" | "speed"> & Partial<Pick<MediaClip, "timeRemap" | "reverse" | "duration">>;

export const RAMP_IDS = ["rampIn", "rampOut", "hero", "bullet"] as const;
export type RampId = (typeof RAMP_IDS)[number];

export const RAMP_LABELS: Record<RampId, string> = { rampIn: "Ramp in", rampOut: "Ramp out", hero: "Hero", bullet: "Bullet" };

/**
 * Source time (us) at clip-relative `frame` through the keys: eased inside a segment (the ease of the key that
 * starts it), held past the ends. Not clamped to the media: callers clamp (a freeze or a backward segment is a
 * plain curve).
 */
export function remapUs(keys: readonly RemapKey[], frame: number): number {
  const n = keys.length;
  const first = keys[0] as RemapKey;
  if (n === 1 || frame <= first.frame) return first.sourceUs;
  const last = keys[n - 1] as RemapKey;
  if (frame >= last.frame) return last.sourceUs;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((keys[mid] as RemapKey).frame <= frame) lo = mid;
    else hi = mid;
  }
  const a = keys[lo] as RemapKey;
  const b = keys[hi] as RemapKey;
  const t = (frame - a.frame) / (b.frame - a.frame);
  return Math.round(a.sourceUs + (b.sourceUs - a.sourceUs) * ease(a.ease, t));
}

/**
 * The media time (us, 0 = first frame) a clip shows at timeline `frame`, inside [in, out) (§5.1): the remap curve
 * when there is one (it replaces the speed; `reverse` is ignored: a backward curve is the same thing), else the
 * constant speed, mirrored when `reverse` is set (the first frame shows the last source frame).
 */
export function clipSourceUs(clip: RemapSource, frame: Frame, fps: Rational): Us {
  if (clip.timeRemap && clip.timeRemap.length > 0) return Math.max(0, remapUs(clip.timeRemap, frame - clip.start));
  const advance = framesToSourceUs(frame - clip.start, clip.speed, fps);
  if (clip.reverse === true) return Math.min(Math.max(clip.in, clip.out - 1 - advance), Math.max(clip.in, clip.out - 1));
  return Math.min(Math.max(clip.in, clip.in + advance), Math.max(clip.in, clip.out - 1));
}

/** Source microseconds the picture advances per timeline frame at clip-relative `frame` (signed: negative = backward). */
export function remapAdvanceUs(clip: RemapSource, frame: Frame, fps: Rational): number {
  const at = frame - clip.start;
  if (clip.timeRemap && clip.timeRemap.length > 0) return remapUs(clip.timeRemap, at + 1) - remapUs(clip.timeRemap, at);
  const step = clip.speed * usPerFrame(fps);
  return clip.reverse === true ? -step : step;
}

/** Speed (1 = real time, negative = backward) of each segment of a curve, for the lane's graph. */
export function remapSpeeds(keys: readonly RemapKey[], fps: Rational): number[] {
  const per = usPerFrame(fps);
  const out: number[] = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i] as RemapKey;
    const b = keys[i + 1] as RemapKey;
    out.push((b.sourceUs - a.sourceUs) / ((b.frame - a.frame) * per));
  }
  return out;
}

/** Speed (1 = real time) of the curve at clip-relative `frame`, measured over one frame. */
export function remapSpeedAt(keys: readonly RemapKey[], frame: number, fps: Rational): number {
  return (remapUs(keys, frame + 1) - remapUs(keys, frame)) / usPerFrame(fps);
}

/** The straight line a clip's constant speed draws: what enabling Time remap starts from (it changes nothing). */
export function identityRemap(clip: Pick<MediaClip, "in" | "out" | "speed" | "reverse"> & { duration: Frame }, fps: Rational): RemapKey[] {
  const span = framesToSourceUs(clip.duration, clip.speed, fps);
  const from = clip.reverse === true ? clip.out : clip.in;
  const to = clip.reverse === true ? clip.out - span : clip.in + span;
  return [
    { frame: 0, sourceUs: from, ease: "linear" },
    { frame: clip.duration, sourceUs: Math.max(0, to), ease: "linear" },
  ];
}

/**
 * The one-click ramps over a clip of `duration` frames playing the source range [from, to] (us). The source range is
 * always covered exactly once, only the speed changes:
 * - `rampIn`: slow to fast (starts at a quarter speed, eases in); `rampOut`: fast to slow.
 * - `hero`: fast, slow, fast (the middle fifth plays a fifth of the speed of the rest).
 * - `bullet`: a quick approach, a long slow-motion hold, a quick exit (the middle half crawls).
 */
export function rampKeys(id: RampId, duration: Frame, from: Us, to: Us): RemapKey[] {
  const d = Math.max(1, duration);
  const at = (f: number) => Math.round(f * d);
  // Too short for a shape: the straight line.
  if (d < 4) {
    return [
      { frame: 0, sourceUs: from, ease: "linear" },
      { frame: d, sourceUs: to, ease: "linear" },
    ];
  }
  const src = (p: number) => Math.round(from + (to - from) * p);
  switch (id) {
    case "rampIn":
      return [
        { frame: 0, sourceUs: src(0), ease: "easeIn" },
        { frame: d, sourceUs: src(1), ease: "linear" },
      ];
    case "rampOut":
      return [
        { frame: 0, sourceUs: src(0), ease: "easeOut" },
        { frame: d, sourceUs: src(1), ease: "linear" },
      ];
    case "hero": {
      // Source share 0.4 in the first 0.4 of the time would be 1x; fast = more source per frame, slow = less.
      const a = Math.min(d - 2, Math.max(1, at(0.3)));
      const b = Math.max(a + 1, Math.min(d - 1, at(0.7)));
      return dedupe([
        { frame: 0, sourceUs: src(0), ease: "easeOut" },
        { frame: a, sourceUs: src(0.44), ease: "linear" },
        { frame: b, sourceUs: src(0.56), ease: "easeIn" },
        { frame: d, sourceUs: src(1), ease: "linear" },
      ]);
    }
    case "bullet": {
      const a = Math.min(d - 2, Math.max(1, at(0.2)));
      const b = Math.max(a + 1, Math.min(d - 1, at(0.8)));
      return dedupe([
        { frame: 0, sourceUs: src(0), ease: "easeOut" },
        { frame: a, sourceUs: src(0.4), ease: "linear" },
        { frame: b, sourceUs: src(0.6), ease: "easeIn" },
        { frame: d, sourceUs: src(1), ease: "linear" },
      ]);
    }
  }
}

function dedupe(keys: RemapKey[]): RemapKey[] {
  const out: RemapKey[] = [];
  for (const key of keys) if (out.length === 0 || key.frame > (out[out.length - 1] as RemapKey).frame) out.push(key);
  return out;
}

/**
 * The same curve after the clip's span changed: `head` frames removed from its start (negative: added), now `duration`
 * frames long. The new ends are evaluated on the old curve, the keys inside kept (shifted), so the picture of every
 * remaining frame is unchanged.
 */
export function refitRemap(keys: readonly RemapKey[], head: number, duration: Frame): RemapKey[] {
  const out: RemapKey[] = [{ frame: 0, sourceUs: remapUs(keys, head), ease: easeAt(keys, head) }];
  for (const key of keys) {
    const frame = key.frame - head;
    if (frame > 0 && frame < duration) out.push({ frame, sourceUs: key.sourceUs, ease: key.ease });
  }
  out.push({ frame: Math.max(1, duration), sourceUs: remapUs(keys, head + duration), ease: "linear" });
  return out;
}

/** The curve after its clip's duration changed from `from` to `to` frames (a stretch): every key's frame scales, colliding keys merge. */
export function scaleRemap(keys: readonly RemapKey[], from: Frame, to: Frame): RemapKey[] {
  const out: RemapKey[] = [];
  for (const [i, key] of keys.entries()) {
    const frame = i === keys.length - 1 ? to : Math.round((key.frame * to) / from);
    if (out.length > 0 && frame <= (out[out.length - 1] as RemapKey).frame) {
      if (i === keys.length - 1) out[out.length - 1] = { ...key, frame };
      continue;
    }
    out.push({ ...key, frame });
  }
  return out;
}

/** True when the clip plays backward by its `reverse` flag (a remap curve ignores it). */
export function isReversed(clip: Partial<Pick<MediaClip, "reverse" | "timeRemap">>): boolean {
  return clip.reverse === true && clip.timeRemap === undefined;
}

function easeAt(keys: readonly RemapKey[], frame: number): EaseId {
  let ease: EaseId = "linear";
  for (const key of keys) {
    if (key.frame > frame) break;
    ease = key.ease;
  }
  return ease;
}

/**
 * Frame blending (spec §21.22): the two source frames around media time `timeUs` on a grid of `frameUs`, and the mix
 * (0..1) toward the second. An exact frame mixes nothing. `last` is the media's last frame time: past it nothing blends.
 */
export function frameBlendSplit(timeUs: Us, frameUs: Us, lastUs: Us): { aUs: Us; bUs: Us; mix: number } {
  if (!(frameUs > 0)) return { aUs: timeUs, bUs: timeUs, mix: 0 };
  // A time within the rounding of a frame (1 us) is that frame.
  const nearest = Math.round(timeUs / frameUs);
  if (Math.abs(timeUs - nearest * frameUs) <= 1) return { aUs: Math.round(nearest * frameUs), bUs: Math.round(nearest * frameUs), mix: 0 };
  const index = Math.floor(timeUs / frameUs);
  const aUs = Math.round(index * frameUs);
  const bUs = Math.min(Math.round((index + 1) * frameUs), Math.max(aUs, Math.floor(lastUs)));
  if (bUs <= aUs) return { aUs, bUs: aUs, mix: 0 };
  return { aUs, bUs, mix: Math.min(1, Math.max(0, (timeUs - aUs) / (bUs - aUs))) };
}

/** True when the picture advances less than one source frame per timeline frame (so blending shows something). */
export function blends(advanceUs: number, frameUs: Us): boolean {
  return frameUs > 0 && Math.abs(advanceUs) < frameUs - 1e-6 && advanceUs !== 0;
}

const groupMemo = new WeakMap<object, ReadonlySet<string>>();

/** True for an audio clip whose link group has a remapped video clip: it is not heard (spec §21.22). */
export function mutedByRemap(clips: Readonly<Record<string, { kind: string; linkGroup?: string; timeRemap?: unknown }>>, clip: { kind: string; linkGroup?: string }): boolean {
  return clip.kind === "audio" && clip.linkGroup !== undefined && remappedGroups(clips).has(clip.linkGroup);
}

/** The ids of the link groups that have a remapped video clip: their audio is muted (spec §21.22). */
export function remappedGroups(clips: Readonly<Record<string, { kind: string; linkGroup?: string; timeRemap?: unknown }>>): ReadonlySet<string> {
  const known = groupMemo.get(clips);
  if (known) return known;
  const groups = new Set<string>();
  for (const id in clips) {
    const clip = clips[id] as { kind: string; linkGroup?: string; timeRemap?: unknown };
    if (clip.kind === "video" && clip.timeRemap !== undefined && clip.linkGroup !== undefined) groups.add(clip.linkGroup);
  }
  groupMemo.set(clips, groups);
  return groups;
}
