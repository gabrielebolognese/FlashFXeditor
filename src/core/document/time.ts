// Time math (spec §5.1, P4). Frames are integers at the project rate, media times integer
// microseconds. Every conversion goes through this module and uses exact integer arithmetic, so
// 29.97 (30000/1001) round-trips without drift. Exact while frame * 1e6 * den < 2^53 (~83 h at 29.97).
import type { Frame, Rational, Us } from "./types.js";

export const US_PER_SECOND = 1_000_000;

export const FPS_30: Rational = { num: 30, den: 1 };

/** floor(n / d) for integers, robust to float rounding of the quotient. d > 0. */
function floorDiv(n: number, d: number): number {
  let q = Math.floor(n / d);
  let r = n - q * d;
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
  }
  return q;
}

function ceilDiv(n: number, d: number): number {
  return -floorDiv(-n, d);
}

/** n / d rounded to the nearest integer, halves away from zero. d > 0. */
function roundDiv(n: number, d: number): number {
  if (n < 0) return -roundDiv(-n, d);
  const q = floorDiv(n, d);
  return 2 * (n - q * d) >= d ? q + 1 : q;
}

export function fpsToNumber(fps: Rational): number {
  return fps.num / fps.den;
}

/** Duration of one frame in microseconds, as a float (for tolerances and source-time math). */
export function usPerFrame(fps: Rational): number {
  return (US_PER_SECOND * fps.den) / fps.num;
}

/** Start time of `frame`, rounded to the nearest microsecond. */
export function frameToUs(frame: Frame, fps: Rational): Us {
  return roundDiv(frame * US_PER_SECOND * fps.den, fps.num);
}

/** Source media time (us) played by `frames` timeline frames at `speed` (§5.1: frames * speed * usPerFrame). */
export function framesToSourceUs(frames: Frame, speed: number, fps: Rational): Us {
  if (speed === 1) return frameToUs(frames, fps);
  return Math.round((frames * speed * US_PER_SECOND * fps.den) / fps.num);
}

/** Nearest frame to the integer time `us`. */
export function usToFrame(us: Us, fps: Rational): Frame {
  return roundDiv(us * fps.num, US_PER_SECOND * fps.den);
}

/** Whole frames that fit in `us` (rounded down): a clip of this many frames never runs past the media. */
export function usToFrameFloor(us: Us, fps: Rational): Frame {
  return floorDiv(us * fps.num, US_PER_SECOND * fps.den);
}

/**
 * Whole frames played in `seconds` of clock time at `speed` (spec §8: floor(elapsed * speed * fps)),
 * the elapsed time taken to the nearest microsecond. `speed` > 0; the caller applies the direction.
 */
export function playedFrames(seconds: number, speed: number, fps: Rational): Frame {
  return usToFrameFloor(Math.max(0, Math.round(seconds * speed * US_PER_SECOND)), fps);
}

/** A count of `timescale` ticks per second (mp4 track times, audio samples) to the nearest microsecond. */
export function ticksToUs(ticks: number, timescale: number): Us {
  return roundDiv(ticks * US_PER_SECOND, timescale);
}

// Timecode. Seconds are wall-clock seconds (frame f is in second floor(f / fps)), so at 29.97 the
// readout never drifts from real time; the frame field counts frames since that second began.

export type TimecodeMode = "frames" | "ms";

/** The wall-clock second that `frame` falls in. */
export function secondOfFrame(frame: Frame, fps: Rational): number {
  return floorDiv(frame * fps.den, fps.num);
}

/** The first frame of wall-clock second `second` (the frame a `ss:00` timecode names). */
export function firstFrameOfSecond(second: number, fps: Rational): Frame {
  return ceilDiv(second * fps.num, fps.den);
}

/** Nearest whole frame count to a duration in seconds. */
export function secondsToFrames(seconds: number, fps: Rational): Frame {
  return usToFrame(Math.round(seconds * US_PER_SECOND), fps);
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

function clock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds / 60) % 60;
  const s = totalSeconds % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** `mm:ss:ff` (frames mode) or `mm:ss.mmm` (ms mode); hours are prepended only when needed. */
export function formatTimecode(frame: Frame, fps: Rational, mode: TimecodeMode = "frames"): string {
  const sign = frame < 0 ? "-" : "";
  const f = Math.abs(frame);
  if (mode === "ms") {
    const ms = Math.floor(frameToUs(f, fps) / 1000);
    return `${sign}${clock(Math.floor(ms / 1000))}.${pad(ms % 1000, 3)}`;
  }
  const second = secondOfFrame(f, fps);
  return `${sign}${clock(second)}:${pad(f - firstFrameOfSecond(second, fps))}`;
}

const DIGITS = /^\d*$/;

function toInt(field: string): number {
  return field === "" ? 0 : Number(field);
}

/** Frames mode: `:` and `.` both separate right-aligned fields [[[hh:]mm:]ss:]ff; empty fields are 0. */
function parseFrameClock(body: string, fps: Rational): Frame | null {
  const fields = body.split(/[:.]/);
  if (fields.length > 4 || !fields.every((field) => DIGITS.test(field))) return null;
  const [ff = 0, ss = 0, mm = 0, hh = 0] = fields.reverse().map(toInt);
  return firstFrameOfSecond(hh * 3600 + mm * 60 + ss, fps) + ff;
}

/** Ms mode: [[hh:]mm:]ss[.fraction]; the fraction is decimal seconds. */
function parseMsClock(body: string, fps: Rational): Frame | null {
  const [clockPart = "", fraction = "", ...rest] = body.split(".");
  const fields = clockPart.split(":");
  if (rest.length > 0 || fields.length > 3 || !DIGITS.test(fraction) || !fields.every((field) => DIGITS.test(field))) {
    return null;
  }
  const [ss = 0, mm = 0, hh = 0] = fields.reverse().map(toInt);
  const fractionUs = fraction === "" ? 0 : Math.round(Number(`0.${fraction}`) * US_PER_SECOND);
  return usToFrame((hh * 3600 + mm * 60 + ss) * US_PER_SECOND + fractionUs, fps);
}

/**
 * Parses a typed timecode into an absolute frame (>= 0), or null when invalid.
 * Plain digits are frames. A leading `+`/`-` is relative to `current`: `+30` and `-15` move by
 * frames, `+2.` moves by 2 seconds (`+1.15` = 1 s 15 f in frames mode, 1.15 s in ms mode).
 */
export function parseTimecode(
  text: string,
  fps: Rational,
  options: { mode?: TimecodeMode; current?: Frame } = {},
): Frame | null {
  const trimmed = text.trim();
  const sign = trimmed.startsWith("+") ? 1 : trimmed.startsWith("-") ? -1 : 0;
  const body = (sign === 0 ? trimmed : trimmed.slice(1)).trim();
  if (body === "" || body === "." || body === ":") return null;

  const frames = /^\d+$/.test(body)
    ? Number(body)
    : options.mode === "ms"
      ? parseMsClock(body, fps)
      : parseFrameClock(body, fps);
  if (frames === null || !Number.isSafeInteger(frames)) return null;
  if (sign === 0) return frames;
  return Math.max(0, (options.current ?? 0) + sign * frames);
}

/**
 * A media duration for badges and lists: `mm:ss` (hours only when needed), or `mm:ss.mmm` when
 * `precise`. Badges round to the nearest second; anything longer than zero shows at least 1 s.
 */
export function formatDurationUs(us: Us, precise = false): string {
  const total = Math.max(0, Math.round(us));
  if (precise) {
    const ms = Math.floor(total / 1000);
    return `${clock(Math.floor(ms / 1000))}.${pad(ms % 1000, 3)}`;
  }
  const seconds = roundDiv(total, US_PER_SECOND);
  return clock(total > 0 ? Math.max(1, seconds) : 0);
}

/** A clip speed for badges and tooltips (spec §6.4: `2x`): at most two decimals, no trailing zeros (`0.5x`, `1.33x`). */
export function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}x`;
}
