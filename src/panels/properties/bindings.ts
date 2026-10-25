// Number field bindings of the layer properties (spec §11, §3.3, P1, P2). A binding reads one property
// path of the selected layer clips (the value they share, or null when mixed) and writes it:
// - typed values: every target set, one command;
// - arrow steps: each target's own value plus the step, consecutive steps one undo step (coalesce key);
// - label scrubs: ephemeral values in `liveEdit` (the preview and the gizmo draw them, the document is
//   untouched, so nothing autosaves and no React component renders), then one command on release.
// Fields re-read on document changes and on live edits (another field's scrub can move this value:
// a locked scale pair, the anchor and the position).
import type { Command } from "../../core/commands/command.js";
import type { ClipId, Project, Transform } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { setOpacities } from "../../timeline/edit/clipProps.js";
import { isLayerClip, setTransforms, type LayerClip } from "../../timeline/edit/transform.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { shared } from "./context.js";
import type { LayerChange, LayerNumberProp } from "./layerProps.js";

export interface BindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
}

/** The layer clips among `ids` (in order). */
function layers(project: Project, ids: readonly ClipId[]): LayerClip[] {
  const out: LayerClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && isLayerClip(clip)) out.push(clip);
  }
  return out;
}

/** `clip` as a live edit shows it. */
function shownClip(clip: LayerClip, live: LiveEdit): LayerClip {
  const transform = live.transforms?.get(clip.id);
  const opacity = live.opacities?.get(clip.id);
  return transform === undefined && opacity === undefined ? clip : { ...clip, transform: transform ?? clip.transform, opacity: opacity ?? clip.opacity };
}

interface Changes {
  transforms: Map<ClipId, Transform>;
  opacities: Map<ClipId, number>;
}

/** The binding of `prop` over the layer clips among `ids` (locked ones are shown but never written). */
export function layerBinding(deps: BindingDeps, prop: LayerNumberProp, ids: readonly ClipId[]): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max ?? Infinity, Math.max(prop.min ?? -Infinity, value)), prop.precision);

  const changesOf = (project: Project, valueOf: (clip: LayerClip) => number): Changes => {
    const changes: Changes = { transforms: new Map(), opacities: new Map() };
    for (const clip of layers(project, ids)) {
      if (isClipLocked(project, clip.id)) continue;
      const change: LayerChange = prop.write(clip, valueOf(clip), project);
      if (change.kind === "transform") changes.transforms.set(clip.id, change.transform);
      else changes.opacities.set(clip.id, change.opacity);
    }
    return changes;
  };

  const commit = (valueOf: (clip: LayerClip) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const changes = changesOf(project, valueOf);
    const options = { label: prop.label, ...(coalesceKey !== undefined && { coalesceKey }) };
    const command: Command | null = changes.transforms.size > 0 ? setTransforms(project, changes.transforms, options) : setOpacities(project, changes.opacities, options);
    if (command) deps.document.dispatch(command);
  };

  const clearLive = () => {
    if (deps.live.getState() !== NO_LIVE_EDIT) deps.live.set(NO_LIVE_EDIT);
  };

  return {
    read() {
      const live = deps.live.getState();
      const values = layers(deps.document.getState(), ids).map((clip) => roundTo(prop.read(shownClip(clip, live)), prop.precision));
      const value = shared(values, (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite", "clips", "settings"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      commit(() => clamp(value));
    },
    change(delta, phase) {
      const valueOf = (clip: LayerClip) => clamp(prop.read(clip) + delta);
      switch (phase) {
        case "scrub": {
          const changes = changesOf(deps.document.getState(), valueOf);
          deps.live.set({ ...NO_LIVE_EDIT, transforms: changes.transforms.size > 0 ? changes.transforms : null, opacities: changes.opacities.size > 0 ? changes.opacities : null });
          return;
        }
        case "step":
          commit(valueOf, `properties.${prop.id}`);
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
