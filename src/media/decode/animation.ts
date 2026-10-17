// Animated images (spec §9.1, §9.3, Batch 34): GIF and WebP animations as frame lists. Pure.
// - Frame timing follows the browsers: a frame shorter than MIN_FRAME_US shows for DEFAULT_FRAME_US
//   (the GIF convention), so the probe's duration and the decoded frames agree.
// - Each kept frame is one texture. Memory is capped (Build: "capped memory, lower fps if needed"):
//   when the frames' textures do not all fit ANIMATION_BUDGET_BYTES, every k-th frame is kept (the
//   smallest k that fits), each shown until the next kept one, so the animation keeps its length.
// - An image clip plays its animation from its `in` point at the project's frame rate and loops it
//   (`imageTimeUs`): the frame at a timeline frame is the one whose span holds that time.
import { framesToSourceUs } from "../../core/document/time.js";
import type { Frame, Rational, Us } from "../../core/document/types.js";

/** Browsers show frames shorter than 20 ms for 100 ms (GIF convention); so do we. */
export const MIN_FRAME_US = 20_000;
export const DEFAULT_FRAME_US = 100_000;

/** Texture memory one animated image may take (its frames' textures, mip levels included). */
export const ANIMATION_BUDGET_BYTES = 128 * 1024 * 1024;

/** The time a decoded frame is shown, from its own duration (us, or null when the file gives none). */
export function frameDurationUs(duration: number | null | undefined): Us {
  const us = duration ?? 0;
  return us < MIN_FRAME_US ? DEFAULT_FRAME_US : Math.round(us);
}

/** The frames an animation keeps: decoder frame indexes, the media time each starts at, the whole length. */
export interface KeptFrames {
  indexes: number[];
  startsUs: Us[];
  durationUs: Us;
}

/**
 * Every k-th frame of an animation whose frames last `durationsUs`, for the smallest k whose kept
 * frames' textures (`frameBytes` each) fit `budgetBytes`; each kept frame starts where it did.
 */
export function keptFrames(durationsUs: readonly Us[], frameBytes: number, budgetBytes: number = ANIMATION_BUDGET_BYTES): KeptFrames {
  const count = durationsUs.length;
  const fits = frameBytes > 0 ? Math.max(1, Math.floor(budgetBytes / frameBytes)) : count;
  const step = Math.max(1, Math.ceil(count / fits));
  const indexes: number[] = [];
  const startsUs: Us[] = [];
  let time = 0;
  for (let i = 0; i < count; i++) {
    if (i % step === 0) {
      indexes.push(i);
      startsUs.push(time);
    }
    time += durationsUs[i] as number;
  }
  return { indexes, startsUs, durationUs: time };
}

/** The position in `startsUs` (ascending, from 0) of the frame shown at `timeUs`: the last one starting by it. */
export function frameAt(startsUs: readonly Us[], timeUs: Us): number {
  let lo = 0;
  let hi = startsUs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((startsUs[mid] as number) <= timeUs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** `timeUs` inside one loop of an animation `durationUs` long (0 for a still). */
export function loopTimeUs(timeUs: Us, durationUs: Us): Us {
  if (!(durationUs > 0)) return 0;
  return ((timeUs % durationUs) + durationUs) % durationUs;
}

/** The animation time an image clip shows at timeline `frame`: from its `in` point, looped. */
export function imageTimeUs(clip: { start: Frame; in: Us }, frame: Frame, fps: Rational, durationUs: Us): Us {
  return loopTimeUs(clip.in + framesToSourceUs(frame - clip.start, 1, fps), durationUs);
}
