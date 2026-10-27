// Number field bindings of the Animation section (spec §11, §10.4): an in or out animation's duration
// or stagger, shown in seconds and kept in whole frames (the field steps one frame per arrow press and
// per px of scrub). Only the selected text clips that have that animation take part. Typed values set
// every one of them (one command); arrow steps add to each clip's own value (consecutive steps one
// undo step); a label scrub shows its values live (`liveEdit.anims`: the preview at the playhead
// follows, P2, no React render), then one command on release. `onCommit` runs after each command (the
// section replays the animation). A stagger left automatic reads as the delay it plays with.
import type { ClipId, Project, Rational, TextAnim, TextClip } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LiveAnims } from "../../render/compositor/Compositor.js";
import { animAtlas } from "../../render/compositor/Compositor.js";
import { layoutUnits } from "../../render/text/animUnits.js";
import { textLayout } from "../../render/text/layoutCache.js";
import { animLength, isPlayable, MAX_ANIM_SECONDS, MAX_STAGGER_SECONDS, unitStagger } from "../../text/anim.js";
import { setTextAnims, type AnimEdit, type AnimSide } from "../../timeline/edit/textAnim.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { shared } from "./context.js";

export interface AnimBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
  /** After a command (a typed value, a step, a scrub's release). */
  onCommit?(): void;
}

export type AnimField = "duration" | "stagger";

/** Seconds shown: two decimals. */
export const ANIM_PRECISION = 2;

const fpsNumber = (fps: Rational) => fps.num / fps.den;

/** The delay between units a clip's animation plays with, in frames (its stagger, or the automatic one). */
export function shownStagger(clip: TextClip, anim: TextAnim): number {
  if (anim.stagger !== undefined) return anim.stagger;
  const atlas = animAtlas(anim);
  if (atlas === "block") return 0;
  const count = layoutUnits(textLayout(clip.text, clip.style), clip.style, atlas).length;
  return unitStagger(anim, count, animLength(anim, clip.duration));
}

/** The text clips among `ids` with a `side` animation that plays, and it. */
function animated(project: Project, ids: readonly ClipId[], side: AnimSide): [TextClip, TextAnim][] {
  const out: [TextClip, TextAnim][] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "text") continue;
    const anim = clip[side];
    if (isPlayable(anim)) out.push([clip, anim]);
  }
  return out;
}

export function animBinding(deps: AnimBindingDeps, ids: readonly ClipId[], side: AnimSide, field: AnimField): NumberBinding {
  const fps = () => deps.document.getState().settings.fps;
  const limit = () => Math.round((field === "duration" ? MAX_ANIM_SECONDS : MAX_STAGGER_SECONDS) * fpsNumber(fps()));
  const clampFrames = (frames: number) => Math.min(limit(), Math.max(field === "duration" ? 1 : 0, Math.round(frames)));
  const framesOf = (clip: TextClip, anim: TextAnim) => (field === "duration" ? anim.duration : shownStagger(clip, anim));
  const write = (anim: TextAnim, frames: number): TextAnim => ({ ...anim, [field]: clampFrames(frames) });

  const editsOf = (project: Project, framesFor: (clip: TextClip, anim: TextAnim) => number) => {
    const edits = new Map<ClipId, AnimEdit>();
    for (const [clip, anim] of animated(project, ids, side)) if (!isClipLocked(project, clip.id)) edits.set(clip.id, { [side]: write(anim, framesFor(clip, anim)) });
    return edits;
  };

  const commit = (framesFor: (clip: TextClip, anim: TextAnim) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const label = `Change ${side === "animIn" ? "in" : "out"} animation ${field}`;
    const command = setTextAnims(project, editsOf(project, framesFor), { label, ...(coalesceKey !== undefined && { coalesceKey }) });
    if (!command) return;
    deps.document.dispatch(command);
    deps.onCommit?.();
  };

  const clearLive = () => {
    if (deps.live.getState() !== NO_LIVE_EDIT) deps.live.set(NO_LIVE_EDIT);
  };

  const toFrames = (seconds: number) => seconds * fpsNumber(fps());

  return {
    read() {
      const project = deps.document.getState();
      const live = deps.live.getState().anims;
      const rate = fpsNumber(project.settings.fps);
      const values = animated(project, ids, side).map(([clip, anim]) => roundTo(framesOf(clip, live?.get(clip.id)?.[side] ?? anim) / rate, ANIM_PRECISION));
      const value = shared(values, (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite", "text", "clips"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(seconds) {
      commit(() => toFrames(seconds));
    },
    change(delta, phase) {
      const project = deps.document.getState();
      const framesFor = (clip: TextClip, anim: TextAnim) => framesOf(clip, anim) + toFrames(delta);
      switch (phase) {
        case "scrub": {
          const anims = new Map<ClipId, LiveAnims>();
          for (const [id, edit] of editsOf(project, framesFor)) {
            const clip = project.clips[id] as TextClip;
            anims.set(id, { animIn: clip.animIn, animOut: clip.animOut, [side]: edit[side] ?? undefined });
          }
          deps.live.set({ ...NO_LIVE_EDIT, anims: anims.size > 0 ? anims : null });
          return;
        }
        case "step":
          commit(framesFor, `properties.anim.${side}.${field}`);
          return;
        case "commit":
          // The document takes over from the live values in the same frame.
          commit(framesFor);
          clearLive();
          return;
        case "cancel":
          clearLive();
      }
    },
  };
}
