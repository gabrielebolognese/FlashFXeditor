// Decoded-audio segments (spec §14): media up to 10 minutes decode into one buffer; longer media
// decode in segments of about 60 s, on demand. Segment boundaries are whole multiples of 1024 sample
// frames (an AAC frame, and a multiple of the 256-sample peaks bucket), so segments join without a gap
// and their peaks buckets line up.

/** Media longer than this decode in segments (spec §14). */
export const WHOLE_MAX_SECONDS = 600;
export const SEGMENT_SECONDS = 60;
const ALIGN = 1024;

export interface SegmentLayout {
  /** Sample frames per second of the decoded audio. */
  sampleRate: number;
  /** Sample frames from media time 0 to the end of the audio. */
  frames: number;
  /** Sample frames per segment (the last one may be shorter). */
  segmentFrames: number;
  count: number;
}

/** `whole`: one segment whatever the length (audio decoded by decodeAudioData, which cannot decode a range). */
export function segmentLayout(sampleRate: number, frames: number, options: { whole?: boolean } = {}): SegmentLayout {
  const total = Math.max(0, Math.floor(frames));
  const whole = options.whole === true || total <= WHOLE_MAX_SECONDS * sampleRate;
  const segmentFrames = whole ? Math.max(1, total) : ALIGN * Math.max(1, Math.round((SEGMENT_SECONDS * sampleRate) / ALIGN));
  return { sampleRate, frames: total, segmentFrames, count: Math.max(1, Math.ceil(total / segmentFrames)) };
}

/** Sample frames [from, to) of segment `index`. */
export function segmentRange(layout: SegmentLayout, index: number): { from: number; to: number } {
  const from = index * layout.segmentFrames;
  return { from, to: Math.min(layout.frames, from + layout.segmentFrames) };
}

/** The segment holding media time `seconds` (clamped to the existing ones). */
export function segmentAt(layout: SegmentLayout, seconds: number): number {
  const frame = Math.floor(seconds * layout.sampleRate);
  return Math.min(layout.count - 1, Math.max(0, Math.floor(frame / layout.segmentFrames)));
}

/** Start of segment `index` in media seconds. */
export function segmentStartSeconds(layout: SegmentLayout, index: number): number {
  return (index * layout.segmentFrames) / layout.sampleRate;
}

/** Segments overlapping media seconds [from, to). */
export function segmentsIn(layout: SegmentLayout, from: number, to: number): number[] {
  if (to <= from) return [];
  const first = segmentAt(layout, from);
  const last = segmentAt(layout, Math.max(from, to - 1 / layout.sampleRate));
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}
