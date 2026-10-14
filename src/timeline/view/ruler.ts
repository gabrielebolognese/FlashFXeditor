// Ruler ticks and labels (spec §6.3). The major level is the finest one whose labels fit; minor
// ticks subdivide it. Second ticks sit on wall-clock seconds (the frame a `ss:00` timecode names),
// frame ticks count from each second's first frame, so 29.97 never drifts from the timecodes.
// Labels are laid out left to right and a label that would touch the previous one is skipped, so
// they never overlap whatever the zoom; at frame-level zoom, frame numbers fill the space between
// the second labels (whole timecodes once the ticks are far enough apart for them).
import { firstFrameOfSecond, formatTimecode, secondOfFrame } from "../../core/document/time.js";
import type { Rational } from "../../core/document/types.js";

export interface RulerLevel {
  unit: "frames" | "seconds";
  n: number;
}

/** Spec §6.3 levels (1 f to 5 min), then coarser ones so hour-long timelines stay readable at 0.01 px/frame. */
export const RULER_LEVELS: readonly RulerLevel[] = [
  { unit: "frames", n: 1 },
  { unit: "frames", n: 5 },
  { unit: "frames", n: 10 },
  ...[1, 2, 5, 10, 30, 60, 300, 600, 1800, 3600].map((n) => ({ unit: "seconds" as const, n })),
];

export interface RulerInput {
  /** Visible frames [from, to]. */
  from: number;
  to: number;
  frameToX: (frame: number) => number;
  pxPerFrame: number;
  fps: Rational;
  /** Width of a label in CSS px. */
  measure: (text: string) => number;
  /** Minimum free space between two labels. */
  labelGap: number;
  /** Minimum spacing of minor ticks. */
  minorMinPx: number;
}

export interface RulerLabel {
  /** Tick position (the label starts a little to its right). */
  x: number;
  text: string;
  /** A second label (full timecode) or a frame number between seconds. */
  kind: "second" | "frame";
}

export interface RulerLayout {
  level: RulerLevel;
  majors: number[];
  minors: number[];
  labels: RulerLabel[];
}

/** The smallest number of frames between two ticks of a level. */
function minSpacingFrames(level: RulerLevel, fps: Rational): number {
  return level.unit === "frames" ? level.n : Math.floor((level.n * fps.num) / fps.den);
}

/** Frames of the ticks of `level` within [from, to]. */
export function tickFrames(level: RulerLevel, from: number, to: number, fps: Rational): number[] {
  const frames: number[] = [];
  const first = Math.max(0, Math.floor(from));
  const last = Math.ceil(to);
  if (last < first) return frames;
  const firstSecond = secondOfFrame(first, fps);
  const lastSecond = secondOfFrame(last, fps);
  if (level.unit === "seconds") {
    for (let second = Math.floor(firstSecond / level.n) * level.n; second <= lastSecond; second += level.n) {
      const frame = firstFrameOfSecond(second, fps);
      if (frame >= first && frame <= last) frames.push(frame);
    }
    return frames;
  }
  for (let second = firstSecond; second <= lastSecond; second++) {
    const start = firstFrameOfSecond(second, fps);
    const end = firstFrameOfSecond(second + 1, fps);
    for (let frame = start; frame < end; frame += level.n) {
      if (frame >= first && frame <= last) frames.push(frame);
    }
  }
  return frames;
}

/** Frame number within its second, as shown between second labels. */
function frameLabel(frame: number, fps: Rational): string {
  return String(frame - firstFrameOfSecond(secondOfFrame(frame, fps), fps)).padStart(2, "0");
}

/** The major level: the finest whose labels fit (second labels at least every second, frame numbers between). */
export function majorLevel(input: Pick<RulerInput, "to" | "pxPerFrame" | "fps" | "measure" | "labelGap">): RulerLevel {
  const { pxPerFrame, fps, measure, labelGap } = input;
  const secondLabel = measure(formatTimecode(Math.ceil(input.to), fps)) + labelGap;
  const frameNumber = measure("00") + labelGap;
  const secondPx = Math.floor(fps.num / fps.den) * pxPerFrame;
  for (const level of RULER_LEVELS) {
    const spacing = minSpacingFrames(level, fps) * pxPerFrame;
    if (level.unit === "frames" ? spacing >= frameNumber && secondPx >= secondLabel : spacing >= secondLabel) return level;
  }
  return RULER_LEVELS[RULER_LEVELS.length - 1] as RulerLevel;
}

/** The finest level that subdivides `major` with ticks at least `minorMinPx` apart, or null. */
export function minorLevel(major: RulerLevel, pxPerFrame: number, fps: Rational, minorMinPx: number): RulerLevel | null {
  const end = RULER_LEVELS.findIndex((level) => level.unit === major.unit && level.n === major.n);
  for (const level of RULER_LEVELS.slice(0, Math.max(0, end))) {
    // Frame ticks restart every second, so they subdivide any second level; others must divide.
    const divides = (level.unit === "frames" && major.unit === "seconds") || major.n % level.n === 0;
    if (divides && minSpacingFrames(level, fps) * pxPerFrame >= minorMinPx) return level;
  }
  return null;
}

export function layoutRuler(input: RulerInput): RulerLayout {
  const { from, to, frameToX, fps, measure, labelGap } = input;
  const level = majorLevel(input);
  const majorFrames = tickFrames(level, from, to, fps);
  const majors = majorFrames.map(frameToX);

  const minor = minorLevel(level, input.pxPerFrame, fps, input.minorMinPx);
  const majorSet = new Set(majorFrames);
  const minors = minor ? tickFrames(minor, from, to, fps).filter((frame) => !majorSet.has(frame)).map(frameToX) : [];

  // Second labels first (they win), then frame numbers into the gaps between them.
  const isSecondStart = (frame: number) => firstFrameOfSecond(secondOfFrame(frame, fps), fps) === frame;
  const seconds: RulerLabel[] = [];
  let lastEnd = -Infinity;
  for (const frame of majorFrames) {
    if (level.unit === "frames" && !isSecondStart(frame)) continue;
    const x = frameToX(frame);
    const text = formatTimecode(frame, fps);
    if (x < lastEnd + labelGap) continue;
    seconds.push({ x, text, kind: "second" });
    lastEnd = x + measure(text);
  }
  if (level.unit === "seconds") return { level, majors, minors, labels: seconds };

  // Zoomed in far enough for a whole timecode per tick: every tick says where it is, even when no
  // second boundary is in view.
  const fullTimecodes = level.n * input.pxPerFrame >= measure(formatTimecode(Math.ceil(to), fps)) + labelGap;
  const labels: RulerLabel[] = [];
  let previousEnd = -Infinity;
  let next = 0;
  for (const frame of majorFrames) {
    const x = frameToX(frame);
    for (let label = seconds[next]; label && label.x <= x; label = seconds[++next]) {
      labels.push(label);
      previousEnd = label.x + measure(label.text);
    }
    if (isSecondStart(frame)) continue;
    const text = fullTimecodes ? formatTimecode(frame, fps) : frameLabel(frame, fps);
    const end = x + measure(text);
    const following = seconds[next];
    if (x >= previousEnd + labelGap && (!following || end + labelGap <= following.x)) {
      labels.push({ x, text, kind: "frame" });
      previousEnd = end;
    }
  }
  labels.push(...seconds.slice(next));
  return { level, majors, minors, labels };
}
