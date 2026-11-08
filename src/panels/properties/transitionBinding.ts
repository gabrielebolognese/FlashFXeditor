// Number field binding of a transition's Angle, Softness and Center fields (Batch 71 review, spec §0
// "every drag has a live preview", P2): a label scrub writes the values to `transitionLive` (the preview
// draws the document with them applied, nothing is in the document), the release commits one
// `transition.update` command (one undo step, the linked cut following with Linked selection), a cancel
// drops them. A typed value or an arrow step is one command.
import type { TransitionLive } from "../../app/transitionPreview.js";
import type { Transition } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { transitionAt, updateTransition, type Cut, type TransitionParams } from "../../timeline/edit/transitions.js";
import type { NumberBinding } from "../../ui/NumberField.js";

export interface TransitionBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<TransitionLive | null>;
  linked(): boolean;
}

export function liveTransitionBinding(deps: TransitionBindingDeps, cut: Cut, read: (transition: Transition) => number, write: (value: number, transition: Transition) => TransitionParams): NumberBinding {
  /** The value being scrubbed (field units), or null. */
  let shown: number | null = null;
  const documentValue = (): number | null => {
    const current = transitionAt(deps.document.getState(), cut);
    return current ? read(current) : null;
  };
  const patchFor = (value: number): TransitionParams | null => {
    const current = transitionAt(deps.document.getState(), cut);
    return current ? write(value, current) : null;
  };
  const clearLive = () => {
    shown = null;
    if (deps.live.getState() !== null) deps.live.set(null);
  };
  const commit = (value: number): void => {
    clearLive();
    const patch = patchFor(value);
    if (!patch) return;
    const command = updateTransition(deps.document.getState(), cut, patch, { linked: deps.linked() });
    if (command) deps.document.dispatch(command);
  };
  return {
    read: () => shown ?? documentValue(),
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["clips"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set: commit,
    change(delta, phase) {
      const current = documentValue();
      if (current === null) return;
      if (phase === "step" || phase === "commit") {
        if (delta !== 0) commit(current + delta);
        else clearLive();
      } else if (phase === "scrub") {
        const patch = patchFor(current + delta);
        if (!patch) return;
        shown = current + delta;
        deps.live.set({ cut, patch, linked: deps.linked() });
      } else {
        clearLive();
      }
    },
  };
}
