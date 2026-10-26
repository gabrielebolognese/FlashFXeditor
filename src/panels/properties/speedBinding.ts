// The Speed section's speed field (spec §11, Batch 27; §3.3, P1, P2): the speed in % that the selected
// video and audio clips share (a freeze frame reads 0), or null when they differ (`--`). Typed values
// set every clip; arrow steps add to each clip's own speed and coalesce into one undo step; a label
// scrub shows its value in the field only and applies once on release (the document, the timeline and
// the preview change with that one command: no live retiming, so nothing renders while it runs).
import type { ClipId, MediaClip, Project } from "../../core/document/types.js";
import { isFreeze } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { hasSource } from "../../timeline/edit/trim.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";

export interface SpeedBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe">;
  /** Sets the speed of `ids` (a value, or one per clip), one undo step; steps pass a coalesce key. */
  apply(ids: readonly ClipId[], speed: number | ((clip: MediaClip) => number), coalesceKey?: string): void;
}

/** A clip's speed as the field shows it (%, one decimal). */
export const speedPercent = (clip: MediaClip): number => roundTo(clip.speed * 100, 1);

/** The speeds the field shows: video and audio clips, freeze frames as 0. */
function percents(project: Project, ids: readonly ClipId[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && hasSource(clip)) out.push(speedPercent(clip));
    else if (clip && isFreeze(clip)) out.push(0);
  }
  return out;
}

export function speedBinding(deps: SpeedBindingDeps, ids: readonly ClipId[]): NumberBinding {
  return {
    read() {
      const value = shared(percents(deps.document.getState(), ids), (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      return deps.document.subscribe(() => listener(), { affects: ["clips"] });
    },
    set(value) {
      deps.apply(ids, value / 100);
    },
    change(delta, phase) {
      // The field shows a scrub's value itself; the release applies it (cancel: nothing changed).
      if (phase === "scrub" || phase === "cancel" || delta === 0) return;
      deps.apply(ids, (clip) => (speedPercent(clip) + delta) / 100, phase === "step" ? "properties.speed" : undefined);
    },
  };
}
