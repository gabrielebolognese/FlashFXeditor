// Transitions (spec §5.2, §6.15, §19 "handle"; Batch 36): the pure model behind the transition blocks,
// the compositor's two-clip frames and the audio crossfades.
// - A transition sits on the cut between two abutting media clips of one track (video and image clips
//   on video tracks, audio clips on audio tracks): the left clip's `transitionOut` and the right clip's
//   `transitionIn` hold the same values. It runs `before` frames before the cut and `after` frames after
//   it; over those frames the left clip plays on past its out point (its tail handle) and the right one
//   starts before its in point (its head handle). Where a handle runs out, the clip's edge frame repeats
//   (`handleTimeUs` clamps to the media), and the block shows warning stripes over those frames.
// - Handles (spec §19): frames of source before `in` (head) and after `out` (tail) at the clip's speed;
//   images and freeze frames hold or loop their picture, so their handles never run out.
// - A new transition takes the frames it asks for, centered on the cut, up to the handles and the
//   clips (the maximum available, one side taking what the other cannot); with no handle at all it
//   keeps its length and repeats edge frames (`fitTransition`).
// - Mix: at the i-th of the transition's d frames the incoming clip weighs (i + 1) / (d + 1), so no
//   frame of the transition shows only one side.
// - `reconcileTransitions` keeps every transition valid after any command (DocumentStore runs it in the
//   command's own producer, so it is part of the same undo step; the trim preview runs it on its
//   proposal): a half whose partner is gone, no longer abutting or not matching is dropped with its
//   partner; pairs copied together get a new id; a side is kept inside its clip (after the clip's other
//   transition); a side that fitted its handle is shortened to what is left of it when an edit (a trim,
//   a roll, a slip, a speed change) takes some, and the transition goes when that handle is used up
//   (spec §6.10: "shortens the transition if needed and removes it if the handle disappears"). A side
//   already repeating frames keeps its length.
import { produce, type Draft } from "immer";
import { framesToSourceUs, usPerFrame } from "./time.js";
import { isFreeze, isMediaClip, TRANSITION_KINDS, type Clip, type Frame, type MediaClip, type Project, type Rational, type Transition, type TransitionKind } from "./types.js";

/** Spec §6.15: the default transition is 15 frames (the Project section's setting comes with Batch 42). */
export const DEFAULT_TRANSITION_FRAMES = 15;
/** `Mod+Shift+D` and the timeline's default kind. TODO(batch 42): the default transition setting. */
export const DEFAULT_TRANSITION_KIND: TransitionKind = "crossDissolve";

export const TRANSITION_LABELS: Readonly<Record<TransitionKind, string>> = { crossDissolve: "Cross dissolve", dipToBlack: "Dip to black", dipToWhite: "Dip to white" };

const KINDS: ReadonlySet<string> = new Set(TRANSITION_KINDS);

export function isTransitionKind(value: unknown): value is TransitionKind {
  return typeof value === "string" && KINDS.has(value);
}

/**
 * Microseconds a source time may pass a media bound and still count as on it: `in` and `out` move by
 * rounded frame times (frameToUs), so a few trims leave them a microsecond off the frame grid (433333 -
 * 266667 = 166666 for frame 5 at 30 fps, whose time is 166667), which would lose the last frame of a
 * handle. Edits clamp to the bound itself (Batch 36).
 */
export const BOUND_SLACK_US = 2;

/** Frames of source before `in`: the most an in point can extend (largest k with in - k frames >= 0, within the slack). */
export function headFrames(clip: MediaClip, fps: Rational): number {
  let k = Math.max(0, Math.floor(clip.in / (usPerFrame(fps) * clip.speed)));
  while (clip.in + framesToSourceUs(-(k + 1), clip.speed, fps) >= -BOUND_SLACK_US) k += 1;
  while (k > 0 && clip.in + framesToSourceUs(-k, clip.speed, fps) < -BOUND_SLACK_US) k -= 1;
  return k;
}

/** Frames of source after `out`: the most a slip can move the source later (largest k with out + k frames <= durationUs, within the slack). */
export function tailFrames(clip: MediaClip, durationUs: number, fps: Rational): number {
  const room = durationUs - clip.out;
  if (room <= -BOUND_SLACK_US) return 0;
  let k = Math.max(0, Math.floor(room / (usPerFrame(fps) * clip.speed)));
  while (clip.out + framesToSourceUs(k + 1, clip.speed, fps) <= durationUs + BOUND_SLACK_US) k += 1;
  while (k > 0 && clip.out + framesToSourceUs(k, clip.speed, fps) > durationUs + BOUND_SLACK_US) k -= 1;
  return k;
}

/** The handle of a clip on one side (spec §19): frames it can show before its start (`head`) or after its end (`tail`). */
export function handleOf(project: Pick<Project, "media" | "settings">, clip: Clip, side: "head" | "tail"): number {
  if (!isMediaClip(clip)) return 0;
  // A still holds its picture, an animated image loops, a freeze frame holds its time.
  if (clip.kind === "image" || isFreeze(clip)) return Infinity;
  const { fps } = project.settings;
  if (side === "head") return headFrames(clip, fps);
  return tailFrames(clip, project.media[clip.mediaId]?.durationUs ?? clip.out, fps);
}

/** Two clips a transition can join (their cut aside): media clips of one track, both audio or both pictures. */
export function canTransition(left: Clip, right: Clip): boolean {
  if (!isMediaClip(left) || !isMediaClip(right) || left.trackId !== right.trackId) return false;
  return (left.kind === "audio") === (right.kind === "audio");
}

export const transitionLength = (transition: Pick<Transition, "before" | "after">) => transition.before + transition.after;

/** The first frame of the transition at `cut` and its end (exclusive). */
export function transitionSpan(transition: Pick<Transition, "before" | "after">, cut: Frame): { start: Frame; end: Frame } {
  return { start: cut - transition.before, end: cut + transition.after };
}

/** How much of the incoming clip shows at `frame` of the transition at `cut` (spec §9.4 mix): (i + 1) / (d + 1) at its i-th frame. */
export function transitionMix(transition: Pick<Transition, "before" | "after">, cut: Frame, frame: Frame): number {
  const length = transitionLength(transition);
  const i = frame - (cut - transition.before);
  return Math.min(1, Math.max(0, (i + 1) / (length + 1)));
}

/** The first frame a clip shows (its start, or earlier under a transition in). */
export const extendedStart = (clip: Clip): Frame => clip.start - (isMediaClip(clip) ? (clip.transitionIn?.before ?? 0) : 0);
/** The frame after the last one a clip shows (its end, or later under a transition out). */
export const extendedEnd = (clip: Clip): Frame => clip.start + clip.duration + (isMediaClip(clip) ? (clip.transitionOut?.after ?? 0) : 0);

/**
 * Media time (us, 0 = the first frame) a video or audio clip shows at `frame`, inside its span or out
 * of it under a transition (its handles), kept within the media: past a handle the edge frame repeats.
 */
export function handleTimeUs(clip: Pick<MediaClip, "start" | "in" | "speed">, frame: Frame, fps: Rational, durationUs: number): number {
  const time = clip.in + framesToSourceUs(frame - clip.start, clip.speed, fps);
  return Math.min(Math.max(0, time), Math.max(0, durationUs - 1));
}

/** Frames of each side of a transition the handles cannot fill (repeated edge frames: the warning stripes). */
export function repeatedFrames(project: Pick<Project, "media" | "settings">, left: Clip, right: Clip, transition: Pick<Transition, "before" | "after">): { before: number; after: number } {
  return {
    before: Math.max(0, transition.before - handleOf(project, right, "head")),
    after: Math.max(0, transition.after - handleOf(project, left, "tail")),
  };
}

/** Frames a transition may take of each clip: the left clip's span after its own transition in, the right clip's before its transition out. */
export function transitionRoom(left: Clip, right: Clip): { before: number; after: number } {
  const leftIn = isMediaClip(left) ? (left.transitionIn?.after ?? 0) : 0;
  const rightOut = isMediaClip(right) ? (right.transitionOut?.before ?? 0) : 0;
  return { before: Math.max(0, left.duration - leftIn), after: Math.max(0, right.duration - rightOut) };
}

/**
 * The sides of a new transition of `length` frames at the cut between `left` and `right` (spec §6.15):
 * centered (the extra frame of an odd length after the cut) and limited by the handles and the clips;
 * a side short of frames gives them to the other one. With no handle on either side, the length stays
 * (within the clips) and edge frames repeat (`repeated`). Null when the clips leave no room at all.
 */
export function fitTransition(project: Pick<Project, "media" | "settings">, left: Clip, right: Clip, length: Frame): { before: Frame; after: Frame; repeated: boolean } | null {
  const want = Math.max(1, Math.round(length));
  const room = transitionRoom(left, right);
  const head = Math.min(room.before, handleOf(project, right, "head"));
  const tail = Math.min(room.after, handleOf(project, left, "tail"));
  let before = Math.min(Math.floor(want / 2), head);
  let after = Math.min(want - before, tail);
  before = Math.min(want - after, head);
  if (before + after > 0) return { before, after, repeated: false };
  before = Math.min(Math.floor(want / 2), room.before);
  after = Math.min(want - before, room.after);
  before = Math.min(want - after, room.before);
  return before + after > 0 ? { before, after, repeated: true } : null;
}

/** How a transition sits on its cut (spec §11 Transition "alignment"): centered, starting at the cut, ending at it, or a one-sided drag's own split. */
export type TransitionAlignment = "center" | "start" | "end" | "custom";

export function alignmentOf(transition: Pick<Transition, "before" | "after">): TransitionAlignment {
  const { before, after } = transition;
  if (before === 0) return "start";
  if (after === 0) return "end";
  return before === Math.floor((before + after) / 2) ? "center" : "custom";
}

/** The sides of a transition of `length` frames aligned as asked (center: the extra frame of an odd length after the cut). */
export function alignedSides(length: Frame, alignment: Exclude<TransitionAlignment, "custom">): { before: Frame; after: Frame } {
  if (alignment === "start") return { before: 0, after: length };
  if (alignment === "end") return { before: length, after: 0 };
  const before = Math.floor(length / 2);
  return { before, after: length - before };
}

/** Same id, kind and sides. */
export function sameTransition(a: Transition | undefined, b: Transition | undefined): boolean {
  if (a === b) return true;
  return a !== undefined && b !== undefined && a.id === b.id && a.kind === b.kind && a.before === b.before && a.after === b.after;
}

// --- Keeping transitions valid ------------------------------------------------------------------

const withTransitions = new WeakMap<Project["clips"], boolean>();

/** True when some clip of the project has a transition (cached per clips record). */
export function hasTransitions(project: Pick<Project, "clips">): boolean {
  let known = withTransitions.get(project.clips);
  if (known === undefined) {
    known = false;
    for (const id in project.clips) {
      const clip = project.clips[id];
      if (clip && isMediaClip(clip) && (clip.transitionIn || clip.transitionOut)) {
        known = true;
        break;
      }
    }
    withTransitions.set(project.clips, known);
  }
  return known;
}

/** The handles of each transition of `base` (by id): what its sides could use before the command. */
function baseHandles(base: Project): Map<string, { head: number; tail: number }> {
  const handles = new Map<string, { head: number; tail: number }>();
  for (const id in base.clips) {
    const clip = base.clips[id];
    if (!clip || !isMediaClip(clip)) continue;
    if (clip.transitionOut) {
      const entry = handles.get(clip.transitionOut.id) ?? { head: Infinity, tail: Infinity };
      entry.tail = handleOf(base, clip, "tail");
      handles.set(clip.transitionOut.id, entry);
    }
    if (clip.transitionIn) {
      const entry = handles.get(clip.transitionIn.id) ?? { head: Infinity, tail: Infinity };
      entry.head = handleOf(base, clip, "head");
      handles.set(clip.transitionIn.id, entry);
    }
  }
  return handles;
}

/** A side after an edit: shortened to the handle left when it fitted the handle before; null when that handle is used up. */
function sideAfterEdit(side: Frame, before: number, after: number): Frame | null {
  if (side <= 0 || side > before || after >= side) return side;
  return after <= 0 ? null : after;
}

/**
 * Keeps every transition of `draft` valid after a command that started from `base` (see the header).
 * Writes only what changes (no patch when nothing does). `newId` names pairs copied together.
 */
export function reconcileTransitions(base: Project, draft: Draft<Project> | Project, newId: () => string): void {
  const project = draft as Project;
  let handles: Map<string, { head: number; tail: number }> | null = null;
  const seen = new Set<string>();
  for (const track of project.tracks) {
    const ids = track.clipIds;
    let prev: MediaClip | null = null;
    for (let i = 0; i < ids.length; i++) {
      const found = project.clips[ids[i] as string];
      if (!found || !isMediaClip(found)) {
        prev = null;
        continue;
      }
      const clip = found;
      // A transition in without its matching transition out on the abutting clip before it goes.
      if (clip.transitionIn && !(prev?.transitionOut && prev.transitionOut.id === clip.transitionIn.id && prev.start + prev.duration === clip.start && canTransition(prev, clip))) {
        delete (clip as Partial<MediaClip>).transitionIn;
      }
      const out = clip.transitionOut;
      if (out) {
        const next = project.clips[ids[i + 1] as string];
        if (!next || !isMediaClip(next) || next.transitionIn?.id !== out.id || next.start !== clip.start + clip.duration || !canTransition(clip, next)) {
          delete (clip as Partial<MediaClip>).transitionOut;
        } else {
          handles ??= baseHandles(base);
          const id = seen.has(out.id) ? newId() : out.id;
          seen.add(id);
          const old = handles.get(out.id);
          let before: Frame | null = out.before;
          let after: Frame | null = out.after;
          if (old) {
            before = sideAfterEdit(out.before, old.head, handleOf(project, next, "head"));
            after = sideAfterEdit(out.after, old.tail, handleOf(project, clip, "tail"));
          }
          const room = transitionRoom(clip, next);
          if (before !== null && after !== null) {
            before = Math.min(before, room.before);
            after = Math.min(after, room.after);
          }
          if (before === null || after === null || before + after <= 0) {
            delete (clip as Partial<MediaClip>).transitionOut;
            delete (next as Partial<MediaClip>).transitionIn;
          } else {
            const value: Transition = { id, kind: out.kind, before, after };
            if (!sameTransition(out, value)) clip.transitionOut = value;
            if (!sameTransition(next.transitionIn, value)) next.transitionIn = { ...value };
          }
        }
      }
      prev = clip;
    }
  }
}

/** `next` with its transitions made valid after the edit from `base` (the trim preview's proposal); `next` itself when nothing changes. */
export function reconciled(base: Project, next: Project): Project {
  if (next === base || !hasTransitions(base)) return next;
  return produce(next, (draft) => reconcileTransitions(base, draft, () => crypto.randomUUID()));
}

// --- Invariants ---------------------------------------------------------------------------------

/** What is wrong with the transitions of a track's clips (validate.ts): shapes, pairing, room. */
export function transitionIssues(project: Project, clips: readonly Clip[], label: (clip: Clip) => string): string[] {
  const issues: string[] = [];
  const shape = (transition: Transition, clip: Clip, side: string) => {
    const name = `${label(clip)}: ${side}`;
    if (typeof transition.id !== "string" || transition.id === "") issues.push(`${name} has no id`);
    if (!isTransitionKind(transition.kind)) issues.push(`${name} kind "${String(transition.kind)}" is not ${TRANSITION_KINDS.join(", ")}`);
    else if (clip.kind === "audio" && transition.kind !== "crossDissolve") issues.push(`${name}: audio transitions are crossfades (crossDissolve)`);
    if (!Number.isInteger(transition.before) || transition.before < 0 || !Number.isInteger(transition.after) || transition.after < 0) issues.push(`${name} sides must be integer frames >= 0`);
    else if (transition.before + transition.after < 1) issues.push(`${name} must be at least 1 frame long`);
  };
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i] as Clip;
    const record = clip as Partial<MediaClip>;
    if (!isMediaClip(clip)) {
      if (record.transitionIn || record.transitionOut) issues.push(`${label(clip)}: a ${clip.kind} clip has no transitions`);
      continue;
    }
    const prev = clips[i - 1];
    const next = clips[i + 1];
    if (clip.transitionIn) {
      shape(clip.transitionIn, clip, "transition in");
      const out = prev && isMediaClip(prev) ? prev.transitionOut : undefined;
      if (!prev || !out || prev.start + prev.duration !== clip.start || !canTransition(prev, clip) || !sameTransition(out, clip.transitionIn)) issues.push(`${label(clip)}: transition in does not match a transition out on an abutting clip before it`);
    }
    if (clip.transitionOut) {
      shape(clip.transitionOut, clip, "transition out");
      const into = next && isMediaClip(next) ? next.transitionIn : undefined;
      if (!next || !into || next.start !== clip.start + clip.duration || !sameTransition(into, clip.transitionOut)) issues.push(`${label(clip)}: transition out does not match a transition in on an abutting clip after it`);
    }
    if ((clip.transitionIn?.after ?? 0) + (clip.transitionOut?.before ?? 0) > clip.duration) issues.push(`${label(clip)}: its transitions take more than its ${clip.duration} frames`);
  }
  return issues;
}
