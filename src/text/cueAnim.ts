// Cue animations (spec §21.8, Batch 59): how a caption box enters at a cue's start and leaves at its end.
// Pure and allocation-free: `cueAnimAt` writes into a state the caller keeps.
// - `fade`: opacity; `pop`: opacity and size (from POP_FROM to 1, back to it when leaving); `slideUp`
//   and `slideDown`: opacity and a move of SLIDE_BOX box heights (slideUp rises into place, and rises
//   away when leaving; slideDown is its mirror).
// - Each animation runs at most half the cue (`cueAnimFrames`), so an in and an out never overlap.
// - The in runs over the cue's first `frames` frames: frame `rel` is at (rel + 1) / frames of its way
//   (a 2-frame fade shows 50% on the first frame and rests on the second; opacity is linear, size and slide ease); the out mirrors it: the cue's
//   last frame is at 50% for 2 frames. A cue frame past both is at rest.
import type { CaptionAnim, CueAnim, Frame } from "../core/document/types.js";

/** The size a pop starts from (content, not UI). */
export const POP_FROM = 0.6;
/** How far a slide travels, in box heights (content, not UI). */
export const SLIDE_BOX = 0.5;

export interface CueAnimState {
  opacity: number;
  scale: number;
  /** Vertical move in box heights (down is positive). */
  dy: number;
  /** Whether any animation is in progress (false: the cue is at rest and the rest of the state is neutral). */
  active: boolean;
}

export const newCueAnimState = (): CueAnimState => ({ opacity: 1, scale: 1, dy: 0, active: false });

/** The frames `anim` runs over a cue of `duration` frames: at most half the cue, whole frames. */
export function cueAnimFrames(anim: CueAnim | undefined, duration: Frame): number {
  if (!anim || !(anim.frames > 0)) return 0;
  return Math.max(0, Math.min(Math.floor(anim.frames), Math.floor(duration / 2)));
}

/** Cubic ease out: the way in settles. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Cubic ease in: the way out accelerates. */
const easeIn = (t: number) => t ** 3;

/** `state` for the frame `rel` frames into a cue of `duration` frames. */
export function cueAnimAt(anim: CaptionAnim | undefined, rel: Frame, duration: Frame, state: CueAnimState): CueAnimState {
  state.opacity = 1;
  state.scale = 1;
  state.dy = 0;
  state.active = false;
  if (!anim) return state;
  const inFrames = cueAnimFrames(anim.in, duration);
  if (anim.in && inFrames > 0 && rel < inFrames) {
    // 1 at rest, 0 at the start of the way.
    apply(state, anim.in.kind, Math.min(1, (rel + 1) / inFrames), 1);
    return state;
  }
  const outFrames = cueAnimFrames(anim.out, duration);
  if (anim.out && outFrames > 0 && rel >= duration - outFrames) {
    apply(state, anim.out.kind, Math.max(0, 1 - (rel - (duration - outFrames)) / outFrames), -1);
  }
  return state;
}

/** `kind` at `p` of the way to rest (1 = rest); `way` 1 enters, -1 leaves (a slide leaves the way it entered from, mirrored). */
function apply(state: CueAnimState, kind: CueAnim["kind"], t: number, way: 1 | -1): void {
  state.active = t < 1;
  // The opacity is linear; the size and the slide ease (out when entering, in when leaving).
  state.opacity = t;
  const p = way === 1 ? easeOut(t) : easeIn(t);
  if (kind === "pop") state.scale = POP_FROM + (1 - POP_FROM) * p;
  else if (kind === "slideUp") state.dy = way === 1 ? SLIDE_BOX * (1 - p) : -SLIDE_BOX * (1 - p);
  else if (kind === "slideDown") state.dy = way === 1 ? -SLIDE_BOX * (1 - p) : SLIDE_BOX * (1 - p);
}
