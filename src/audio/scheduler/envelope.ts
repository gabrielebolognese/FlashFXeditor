// The gain envelope of an audio clip (spec §14, §6.15; Batch 36): its fades and the crossfades of its
// transitions, as a factor of timeline seconds that the scheduler writes on each voice's fade GainNode
// (`setValueCurveAtTime` per region where it moves, spec §14 "automated with setValueCurveAtTime per
// scheduled chunk"). Equal power: a fade in rises as sin(πt/2), a fade out falls as cos(πt/2), and the
// two clips of a crossfade sum to a constant power (sin² + cos² = 1), so a cut of correlated or
// uncorrelated sound keeps its loudness and never clicks (both curves are continuous and start or end
// at 0). Outside the regions the factor is 1 (0 before a fade in starts, after a fade out ends).
// Sound has no repeated edge frames: where a handle is short (`limits`, the timeline seconds the
// clip's audio exists), a crossfade's ramp is fitted into the audio there is (the outgoing clip is
// silent by its media end, the incoming one starts from silence at its media start), at least
// MIN_RAMP_SECONDS long, so a voice never stops or starts mid-ramp.
// TODO(batch 37): the clip's keyed gain (`gainDbAt`) and the rubber band join these curves.
import type { MediaClip } from "../../core/document/types.js";

/** Curve points per second (Web Audio interpolates linearly between them). */
export const CURVE_RATE = 200;
/** The shortest crossfade ramp (the scheduler's 10 ms start and stop ramps). */
export const MIN_RAMP_SECONDS = 0.01;

export interface EnvelopeRegion {
  /** Timeline seconds; the factor moves inside [start, end) and holds outside. */
  start: number;
  end: number;
}

/** Timeline seconds the clip's audio exists in (its media's start and end, at its speed). */
export interface AudioLimits {
  start: number;
  end: number;
}

type Enveloped = Pick<MediaClip, "start" | "duration" | "fades" | "transitionIn" | "transitionOut">;

const NO_LIMITS: AudioLimits = { start: -Infinity, end: Infinity };

const rise = (t: number) => Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, t)));

/** The ramp in of a clip's transition in, within its audio; null without one. */
function rampIn(clip: Enveloped, fps: number, limits: AudioLimits): EnvelopeRegion | null {
  const into = clip.transitionIn;
  if (!into || into.before + into.after <= 0) return null;
  const start = Math.max(clip.start / fps - into.before / fps, limits.start);
  return { start, end: Math.max(clip.start / fps + into.after / fps, start + MIN_RAMP_SECONDS) };
}

/** The ramp out of a clip's transition out, within its audio; null without one. */
function rampOut(clip: Enveloped, fps: number, limits: AudioLimits): EnvelopeRegion | null {
  const out = clip.transitionOut;
  if (!out || out.before + out.after <= 0) return null;
  const cut = (clip.start + clip.duration) / fps;
  const end = Math.min(cut + out.after / fps, limits.end);
  return { start: Math.min(cut - out.before / fps, end - MIN_RAMP_SECONDS), end };
}

/** The factor at timeline second `s` (`fps`: the project's frames per second). */
export function envelopeAt(clip: Enveloped, fps: number, s: number, limits: AudioLimits = NO_LIMITS): number {
  const start = clip.start / fps;
  const end = (clip.start + clip.duration) / fps;
  let factor = 1;
  if (clip.fades.in > 0) factor *= rise((s - start) / (clip.fades.in / fps));
  if (clip.fades.out > 0) factor *= rise((end - s) / (clip.fades.out / fps));
  const into = rampIn(clip, fps, limits);
  if (into) factor *= rise((s - into.start) / (into.end - into.start));
  const out = rampOut(clip, fps, limits);
  if (out) factor *= rise(1 - (s - out.start) / (out.end - out.start));
  return factor;
}

/** Where the factor moves, merged and in order (a fade overlapping a crossfade is one region). */
export function envelopeRegions(clip: Enveloped, fps: number, limits: AudioLimits = NO_LIMITS): EnvelopeRegion[] {
  const start = clip.start / fps;
  const end = (clip.start + clip.duration) / fps;
  const regions: EnvelopeRegion[] = [];
  const into = rampIn(clip, fps, limits);
  const out = rampOut(clip, fps, limits);
  if (into) regions.push(into);
  if (clip.fades.in > 0) regions.push({ start, end: start + clip.fades.in / fps });
  if (clip.fades.out > 0) regions.push({ start: end - clip.fades.out / fps, end });
  if (out) regions.push(out);
  regions.sort((a, b) => a.start - b.start);
  const merged: EnvelopeRegion[] = [];
  for (const region of regions) {
    const last = merged[merged.length - 1];
    if (last && region.start <= last.end) last.end = Math.max(last.end, region.end);
    else merged.push({ ...region });
  }
  return merged;
}

/** The factor sampled over [from, to] (timeline seconds), both ends included, at CURVE_RATE (2 points at least). */
export function envelopeCurve(clip: Enveloped, fps: number, from: number, to: number, limits: AudioLimits = NO_LIMITS): Float32Array {
  const count = Math.max(2, Math.ceil((to - from) * CURVE_RATE) + 1);
  const curve = new Float32Array(count);
  for (let i = 0; i < count; i++) curve[i] = envelopeAt(clip, fps, from + ((to - from) * i) / (count - 1), limits);
  return curve;
}
