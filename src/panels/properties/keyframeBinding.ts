// The parts of the keyframe controls (spec §11 navigator and ease selector, Batch 35) that follow the
// playhead: whether the selected clips have a key of a section at the playhead (the add / remove
// button's pressed state) and the ease of those keys (the Ease dropdown's text). They change while
// the playhead moves, so they are written straight into the DOM from store subscriptions, never
// through React (P1: zero commits during playback and scrubbing).
import { EASE_LABELS, sectionEaseAt, type KeyframeSection } from "../../core/document/keyframes.js";
import type { ClipId, EaseId, Frame, Project } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { keyable, keyAt, stopwatchOn } from "../../timeline/edit/keyframes.js";

export interface KeyState {
  /** Every animated clip among the targets has a key of the section at the playhead. */
  onKey: boolean;
  /** The ease those keys share (null: none there, or they differ). */
  ease: EaseId | null;
  /** The keys there have different eases. */
  mixed: boolean;
}

/** The key state of `section` at timeline frame `playhead` over the clips among `ids` (animated ones only). */
export function keyStateAt(project: Project, ids: readonly ClipId[], section: KeyframeSection, playhead: Frame): KeyState {
  let animated = 0;
  let onKey = true;
  let ease: EaseId | null = null;
  let mixed = false;
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !keyable(clip, section) || !stopwatchOn(clip, section)) continue;
    animated += 1;
    if (!keyAt(clip, section, playhead)) {
      onKey = false;
      continue;
    }
    const own = sectionEaseAt(clip.keyframes, section, playhead - clip.start);
    if (own === null) continue;
    if (ease === null && !mixed) ease = own;
    else if (ease !== own) {
      mixed = true;
      ease = null;
    }
  }
  return animated > 0 && onKey ? { onKey: true, ease, mixed } : { onKey: false, ease: null, mixed: false };
}

/** What the controls subscribe to. */
export interface KeyBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe">;
  playhead: { get(): Frame; subscribe(listener: () => void): () => void };
}

function follow(deps: KeyBindingDeps, ids: readonly ClipId[], section: KeyframeSection, write: (state: KeyState) => void): () => void {
  const update = () => write(keyStateAt(deps.document.getState(), ids, section, deps.playhead.get()));
  update();
  const stops = [deps.document.subscribe(update, { affects: ["clips", "composite", "audio"] }), deps.playhead.subscribe(update)];
  return () => {
    for (const stop of stops) stop();
  };
}

/** The add / remove button: pressed (and named "Remove keyframe") on a key at the playhead. */
export function bindKeyButton(button: HTMLElement, deps: KeyBindingDeps, ids: readonly ClipId[], section: KeyframeSection): () => void {
  return follow(deps, ids, section, ({ onKey }) => {
    const pressed = String(onKey);
    if (button.getAttribute("aria-pressed") === pressed) return;
    const label = onKey ? "Remove keyframe" : "Add keyframe";
    button.setAttribute("aria-pressed", pressed);
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip", label);
  });
}

/** The Ease dropdown's text: the ease of the keys at the playhead, `--` when they differ or there is none. */
export function bindEaseLabel(text: HTMLElement, deps: KeyBindingDeps, ids: readonly ClipId[], section: KeyframeSection): () => void {
  return follow(deps, ids, section, ({ onKey, ease }) => {
    const label = onKey && ease ? EASE_LABELS[ease] : "--";
    if (text.textContent !== label) text.textContent = label;
    const dim = String(!onKey);
    if (text.dataset.dim !== dim) text.dataset.dim = dim;
  });
}

/** The selected clips among `ids` that `section` can key (keyframe actions act on them). */
export function keyableIds(project: Project, ids: Iterable<ClipId>, section: KeyframeSection): ClipId[] {
  const out: ClipId[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && keyable(clip, section)) out.push(id);
  }
  return out;
}
