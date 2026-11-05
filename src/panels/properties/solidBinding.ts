// Number field bindings of the Solid section (spec §11, §3.3, P1, P2, Batch 34): like the text
// bindings (textBinding.ts), over the selected solids. Typed values set every solid (one command);
// arrow steps add to each solid's own value (consecutive steps one undo step); a label scrub shows its
// values live (`liveEdit.solids`: the preview and the gizmo draw them, no React component renders),
// then one command on release.
import { clipRel } from "../../core/document/keyframes.js";
import { clipLookAt, hasLookKeys } from "../../core/document/keyProps.js";
import type { ClipId, Frame, Project, SolidClip } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { editedLook, setSolids, type SolidEdit, type SolidLook } from "../../timeline/edit/solid.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { shared } from "./context.js";
import type { SolidNumberProp } from "./solidProps.js";

export interface SolidBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
  /** The playhead: a solid with keyed look properties shows (and steps from) its values there (Batch 61). */
  playhead?: { get(): Frame; subscribe(listener: () => void): () => void };
}

/** The solids among `ids` (in order). */
export function solidClipsOf(project: Project, ids: readonly ClipId[]): SolidClip[] {
  const out: SolidClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "solid") out.push(clip);
  }
  return out;
}

/** `clip` as a live edit shows it. */
function shownClip(clip: SolidClip, live: LiveEdit, at: Frame | null): SolidClip {
  const keyed = at === null ? clip : clipLookAt(clip, clipRel(clip, at));
  const look = live.solids?.get(clip.id);
  if (!look) return keyed;
  // The look replaces the clip's look whole (as the compositor draws it): keys it lacks are gone.
  const shown: SolidClip = { ...keyed, ...look };
  for (const key of ["cornerRadii", "stroke", "shadow"] as const) if (!look[key]) delete shown[key];
  return shown;
}

export function solidBinding(deps: SolidBindingDeps, prop: SolidNumberProp, ids: readonly ClipId[]): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);

  const editsOf = (project: Project, valueOf: (clip: SolidClip) => number) => {
    const edits = new Map<ClipId, SolidEdit>();
    for (const clip of solidClipsOf(project, ids)) if (!isClipLocked(project, clip.id)) edits.set(clip.id, prop.write(clip, valueOf(clip)));
    return edits;
  };

  const commit = (valueOf: (clip: SolidClip) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const command = setSolids(project, editsOf(project, valueOf), { label: prop.label, ...(coalesceKey !== undefined && { coalesceKey }) });
    if (command) deps.document.dispatch(command);
  };

  const clearLive = () => {
    if (deps.live.getState() !== NO_LIVE_EDIT) deps.live.set(NO_LIVE_EDIT);
  };

  return {
    read() {
      const live = deps.live.getState();
      const values = solidClipsOf(deps.document.getState(), ids).map((clip) => prop.read(shownClip(clip, live, deps.playhead?.get() ?? null)));
      if (values.includes(null)) return null;
      const value = shared(values.map((v) => roundTo(v ?? 0, prop.precision)), (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite", "clips"] }), deps.live.subscribe(() => listener())];
      // Keyed look properties change along the timeline: re-read when the playhead moves (DOM only, P1).
      if (deps.playhead) stops.push(deps.playhead.subscribe(() => solidClipsOf(deps.document.getState(), ids).some((clip) => hasLookKeys(clip.keyframes)) && listener()));
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      commit(() => clamp(value));
    },
    change(delta, phase) {
      const project = deps.document.getState();
      const at = deps.playhead?.get() ?? null;
      const valueOf = (clip: SolidClip) => {
        const shown = at === null ? clip : clipLookAt(clip, clipRel(clip, at));
        return clamp((prop.read(shown) ?? prop.start?.(shown) ?? 0) + delta);
      };
      switch (phase) {
        case "scrub": {
          const solids = new Map<ClipId, SolidLook>();
          for (const [id, edit] of editsOf(project, valueOf)) solids.set(id, editedLook(project.clips[id] as SolidClip, edit));
          deps.live.set({ ...NO_LIVE_EDIT, solids: solids.size > 0 ? solids : null });
          return;
        }
        case "step":
          commit(valueOf, `properties.solid.${prop.id}`);
          return;
        case "commit":
          // The document takes over from the live values in the same frame.
          commit(valueOf);
          clearLive();
          return;
        case "cancel":
          clearLive();
      }
    },
  };
}
