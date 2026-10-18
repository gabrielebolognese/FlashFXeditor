// Frame rate conversion (spec §15 "changing fps converts all frame values by the rational ratio
// (rounding to nearest, warning if lossy)", Batch 42). Every frame value of the document is multiplied
// by new fps / old fps, an exact fraction of integers, and rounded to the nearest frame (halves away
// from zero), with integer arithmetic only (P4):
// - Clips: both edges of each clip convert as timeline positions, track by track in order, so clips
//   that abutted still abut and a clip keeps its place against the playhead. A clip whose edges round
//   onto one frame keeps 1 frame and pushes the next clips of its track by what it needs (counted as
//   `shifted`). Media clips keep their source in/out (µs) when they still match the new duration
//   (§5.1 within one source frame), else `out` follows the new duration, clamped to the media, and
//   the clip counts as `rounded` (a source range off the new rate's grid: a clip pasted from a project
//   at another rate; Batch 50). A freeze's `out` is one frame after its held time at the new rate (it
//   shows `in` alone), not counted.
// - Inside a clip: keyframes (relative to the clip start) convert as positions on the timeline, so a
//   key stays on its moment; keys landing on one frame merge, the later one winning (`merged`), as a
//   rate stretch does. Fades, transition sides and text animation durations and staggers are lengths;
//   a cue's word timings convert as positions (each keeps at least 1 frame).
// - Markers convert as positions.
// The report counts every value that did not land exactly on a frame of the new rate: a conversion with
// none (30 to 60 fps, or 60 to 30 with even frames) is lossless and changes no timing.
import type { Draft } from "immer";
import { fitFades } from "./fades.js";
import { framesToSourceUs, frameToUs, usPerFrame } from "./time.js";
import type { CaptionClip, Clip, Keyframes, MediaClip, MediaItem, Project, Rational, TextAnim, Transition } from "./types.js";
import { isFreeze, isMediaClip } from "./types.js";

/** to / from as a reduced fraction of positive integers. */
export interface FrameRatio {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The factor frames at `from` are multiplied by to become frames at `to`. */
export function frameRatio(from: Rational, to: Rational): FrameRatio {
  const num = to.num * from.den;
  const den = to.den * from.num;
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

export const sameFrameRate = (a: Rational, b: Rational): boolean => a.num * b.den === b.num * a.den;

/** What a conversion rounded: values not on a frame of the new rate, merged keys, clips pushed later. */
export interface ConversionReport {
  rounded: number;
  merged: number;
  shifted: number;
}

export const isLossless = (report: ConversionReport): boolean => report.rounded === 0 && report.merged === 0 && report.shifted === 0;

/** Converts frame values by one ratio and counts the inexact ones. */
export class FrameConverter {
  readonly report: ConversionReport = { rounded: 0, merged: 0, shifted: 0 };

  constructor(readonly ratio: FrameRatio) {}

  /** `frame` at the new rate, to the nearest frame (halves away from zero). */
  frame(frame: number): number {
    const n = frame * this.ratio.num;
    const d = this.ratio.den;
    const negative = n < 0;
    const abs = negative ? -n : n;
    let q = Math.floor(abs / d);
    let r = abs - q * d;
    // The float quotient can be one off for large values: fix it with the exact remainder.
    if (r < 0) {
      q -= 1;
      r += d;
    } else if (r >= d) {
      q += 1;
      r -= d;
    }
    if (r !== 0) this.report.rounded += 1;
    const rounded = 2 * r >= d ? q + 1 : q;
    return negative ? -rounded : rounded;
  }

  /** A length (fade, transition side, animation): converted like a frame, never negative. */
  length(frames: number): number {
    return Math.max(0, this.frame(frames));
  }
}

/** Keys at their converted timeline positions (relative to the new start); keys on one frame merge, the later winning. */
function convertKeys(keyframes: Keyframes, conv: FrameConverter, oldStart: number, newStart: number): Keyframes {
  const result: Keyframes = {};
  for (const [prop, keys] of Object.entries(keyframes)) {
    const out: Keyframes[string] = [];
    for (const key of keys) {
      const frame = conv.frame(oldStart + key.frame) - newStart;
      const last = out[out.length - 1];
      if (last && last.frame === frame) {
        out[out.length - 1] = { ...key, frame };
        conv.report.merged += 1;
      } else out.push({ ...key, frame });
    }
    result[prop] = out;
  }
  return result;
}

function convertTransition(transition: Transition, conv: FrameConverter): Transition {
  let before = conv.length(transition.before);
  let after = conv.length(transition.after);
  // A transition is at least a frame long: the longer side keeps it (the store reconciles the room).
  if (before + after === 0) {
    if (transition.before >= transition.after) before = 1;
    else after = 1;
  }
  return { ...transition, before, after };
}

function convertAnim(anim: TextAnim, conv: FrameConverter): TextAnim {
  const next: TextAnim = { ...anim, duration: Math.max(1, conv.length(anim.duration)) };
  if (anim.stagger !== undefined) next.stagger = conv.length(anim.stagger);
  return next;
}

/**
 * A media clip's source range for its new duration: kept while it still matches (§5.1, within one
 * source frame at the new rate), else `out` follows the duration, clamped to the media (the duration
 * then shortened to what the media holds).
 */
function fitSource(clip: MediaClip, to: Rational, media: MediaItem | undefined, conv: FrameConverter): void {
  if (isFreeze(clip)) {
    // One project frame after the held time, within the media (as freeze.ts makes it).
    clip.out = Math.min(clip.in + frameToUs(1, to), media?.durationUs ?? Infinity);
    return;
  }
  const sourceFrame = usPerFrame(to) * clip.speed;
  if (Math.abs(clip.out - clip.in - clip.duration * sourceFrame) <= sourceFrame) return;
  const out = clip.out;
  clip.out = clip.in + framesToSourceUs(clip.duration, clip.speed, to);
  if (media && clip.kind !== "image" && clip.out > media.durationUs) {
    clip.out = media.durationUs;
    clip.duration = Math.max(1, Math.floor((clip.out - clip.in) / sourceFrame));
  }
  if (clip.out !== out) conv.report.rounded += 1;
}

/** The clip's own frame values (keys, fades, transitions, animations, words) after its edges moved. */
function convertInside(clip: Clip, conv: FrameConverter, oldStart: number, to: Rational, media: MediaItem | undefined): void {
  const newStart = clip.start;
  if ("keyframes" in clip && clip.keyframes) clip.keyframes = convertKeys(clip.keyframes, conv, oldStart, newStart);
  if (isMediaClip(clip)) {
    fitSource(clip, to, media, conv);
    if (clip.transitionIn) clip.transitionIn = convertTransition(clip.transitionIn, conv);
    if (clip.transitionOut) clip.transitionOut = convertTransition(clip.transitionOut, conv);
  }
  if ("fades" in clip && clip.fades) clip.fades = fitFades({ in: conv.length(clip.fades.in), out: conv.length(clip.fades.out) }, clip.duration);
  if (clip.kind === "text") {
    if (clip.animIn) clip.animIn = convertAnim(clip.animIn, conv);
    if (clip.animOut) clip.animOut = convertAnim(clip.animOut, conv);
  }
  if (clip.kind === "caption" && clip.words) {
    const cue: CaptionClip = clip;
    cue.words = clip.words.map((word) => {
      const start = conv.frame(oldStart + word.start) - newStart;
      const end = Math.max(start + 1, conv.frame(oldStart + word.end) - newStart);
      return { ...word, start, end };
    });
  }
}

/**
 * Converts runs of clips that must not overlap (a track's clips in start order), in place: edges as
 * positions, a collapsed clip kept 1 frame long, later clips pushed after it.
 */
export function convertClipRuns(runs: readonly (readonly Clip[])[], conv: FrameConverter, to: Rational, mediaOf: (clip: MediaClip) => MediaItem | undefined): void {
  for (const run of runs) {
    let prevEnd = -Infinity;
    for (const clip of run) {
      const oldStart = clip.start;
      const exact = conv.frame(oldStart);
      const start = Math.max(exact, prevEnd);
      const end = Math.max(conv.frame(oldStart + clip.duration), start + 1);
      if (start !== exact) conv.report.shifted += 1;
      clip.start = start;
      clip.duration = end - start;
      convertInside(clip, conv, oldStart, to, isMediaClip(clip) ? mediaOf(clip) : undefined);
      prevEnd = clip.start + clip.duration;
    }
  }
}

/**
 * Every frame value of `project` (an Immer draft or a plain object) converted to `to`, the frame rate
 * set; returns what was rounded. The caller keeps transitions valid (the document store reconciles them).
 */
export function convertProjectFrames(project: Project | Draft<Project>, to: Rational): ConversionReport {
  const draft = project as Project;
  const conv = new FrameConverter(frameRatio(draft.settings.fps, to));
  const runs = draft.tracks.map((track) => track.clipIds.map((id) => draft.clips[id]).filter((clip): clip is Clip => clip !== undefined));
  convertClipRuns(runs, conv, to, (clip) => draft.media[clip.mediaId]);
  for (const marker of draft.markers) marker.frame = Math.max(0, conv.frame(marker.frame));
  draft.settings.fps = { num: to.num, den: to.den };
  return conv.report;
}
