// Number field bindings of the Text section (spec §11, §3.3, P1, P2): like the layer bindings
// (bindings.ts), over the selected text clips. Typed values set every clip (one command); arrow steps
// add to each clip's own value (consecutive steps one undo step); a label scrub shows its values live
// (`liveEdit.texts`, and the moved boxes in `liveEdit.transforms`: each box keeps its anchored point),
// so the preview re-rasterizes only the scrubbed layers and no React component renders, then one
// command on release.
import type { ClipId, Project, TextClip, Transform } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LiveText } from "../../render/compositor/Compositor.js";
import { setTexts, textEdit, type TextEdit } from "../../timeline/edit/text.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { shared } from "./context.js";
import type { TextNumberProp } from "./textProps.js";

export interface TextBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
}

/** The text clips among `ids` (in order). */
export function textClipsOf(project: Project, ids: readonly ClipId[]): TextClip[] {
  const out: TextClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "text") out.push(clip);
  }
  return out;
}

/** `clip` as a live edit shows it. */
function shownClip(clip: TextClip, live: LiveEdit): TextClip {
  const text = live.texts?.get(clip.id);
  return text ? { ...clip, text: text.text, style: text.style } : clip;
}

export function textBinding(deps: TextBindingDeps, prop: TextNumberProp, ids: readonly ClipId[]): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);

  const editsOf = (project: Project, valueOf: (clip: TextClip) => number) => {
    const edits = new Map<ClipId, Partial<TextEdit>>();
    for (const clip of textClipsOf(project, ids)) if (!isClipLocked(project, clip.id)) edits.set(clip.id, prop.write(clip, valueOf(clip)));
    return edits;
  };

  const commit = (valueOf: (clip: TextClip) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const command = setTexts(project, editsOf(project, valueOf), { label: prop.label, ...(coalesceKey !== undefined && { coalesceKey }) });
    if (command) deps.document.dispatch(command);
  };

  const clearLive = () => {
    if (deps.live.getState() !== NO_LIVE_EDIT) deps.live.set(NO_LIVE_EDIT);
  };

  return {
    read() {
      const live = deps.live.getState();
      const values = textClipsOf(deps.document.getState(), ids).map((clip) => roundTo(prop.read(shownClip(clip, live)), prop.precision));
      const value = shared(values, (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite", "text", "clips"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      commit(() => clamp(value));
    },
    change(delta, phase) {
      const project = deps.document.getState();
      const valueOf = (clip: TextClip) => clamp(prop.read(clip) + delta);
      switch (phase) {
        case "scrub": {
          const texts = new Map<ClipId, LiveText>();
          const transforms = new Map<ClipId, Transform>();
          for (const [id, edit] of editsOf(project, valueOf)) {
            const clip = project.clips[id] as TextClip;
            const next = textEdit(project, clip, edit);
            texts.set(id, { text: next.text, style: next.style });
            if (next.transform !== clip.transform) transforms.set(id, next.transform);
          }
          deps.live.set({ ...NO_LIVE_EDIT, texts: texts.size > 0 ? texts : null, transforms: transforms.size > 0 ? transforms : null });
          return;
        }
        case "step":
          commit(valueOf, `properties.text.${prop.id}`);
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
