// The lengths new clips and transitions get, and the "keyframes follow source" trim rule (spec §11
// Project section "default durations, default transition duration", §6.15 "Default duration 15 frames
// (settings)", §6.10; Batch 42). They are app settings: the app writes them here at startup and on
// every change (`setEditDefaults`, app/settingsController.ts), and the edits read them where a caller
// gives no length, so the many paths that place a still image, a title, a solid, a freeze frame or a
// transition all follow one value. Tests run with the built-in values.
import { usToFrame } from "../../core/document/time.js";
import { DEFAULT_TRANSITION_FRAMES, DEFAULT_TRANSITION_KIND } from "../../core/document/transitions.js";
import type { Frame, Rational, TransitionKind } from "../../core/document/types.js";

export interface EditDefaults {
  /** A still image dropped or inserted (spec §6.14), in milliseconds. */
  stillMs: number;
  /** `+ Title` / `+ Subtitle` when not matching the clip under the playhead (spec §10.2). */
  titleMs: number;
  /** `+ Solid` (spec §6.1). */
  solidMs: number;
  /** Freeze frame (Batch 27). */
  freezeMs: number;
  /** A new transition, in frames (spec §6.15). */
  transitionFrames: number;
  /** The kind Mod+Shift+D adds (spec §6.15). */
  transitionKind: TransitionKind;
  /** In trims and slips of video and audio clips keep keys on their source frames (spec §6.10, on by default). */
  keyframesFollowSource: boolean;
}

export const BUILT_IN_EDIT_DEFAULTS: Readonly<EditDefaults> = {
  stillMs: 5000,
  titleMs: 3000,
  solidMs: 5000,
  freezeMs: 2000,
  transitionFrames: DEFAULT_TRANSITION_FRAMES,
  transitionKind: DEFAULT_TRANSITION_KIND,
  keyframesFollowSource: true,
};

let current: Readonly<EditDefaults> = BUILT_IN_EDIT_DEFAULTS;

export function editDefaults(): Readonly<EditDefaults> {
  return current;
}

/** Replaces the defaults (the app, from its settings; tests: `setEditDefaults(BUILT_IN_EDIT_DEFAULTS)` to restore). */
export function setEditDefaults(next: Partial<EditDefaults>): void {
  current = { ...current, ...next };
}

/** A default length in milliseconds as whole frames at `fps` (at least 1). */
export function defaultFrames(ms: number, fps: Rational): Frame {
  return Math.max(1, usToFrame(Math.round(ms * 1000), fps));
}
