// What the properties panel shows (spec §11 "context-driven"): its sections by the selection kind and
// the primary item. A marker selection (its own session channel, Batch 19) comes first; a clip
// selection lists the clips that exist, its primary, and the layer clips among them (video, image,
// solid, text: the ones with a picture to transform). React renders the panel only when this context
// changes (`contextKey`), never on value changes (spec §11 implementation note, P1).
import type { ClipId, Project, TrackId } from "../../core/document/types.js";
import { selectedTrackIds, type Selection } from "../../core/store/selection.js";
import { isLayerClip } from "../../timeline/edit/transform.js";

/** The registered sections, top to bottom in their order of appearance. */
export type SectionId = "clip" | "transform" | "opacity" | "track" | "marker" | "project";

export type PropertiesContext =
  | { kind: "none" }
  | { kind: "marker"; markerId: string }
  | { kind: "track"; trackIds: readonly TrackId[] }
  | {
      kind: "clips";
      /** The selected clips that exist, in selection order. */
      clipIds: readonly ClipId[];
      primary: ClipId;
      /** The layer clips among them: what Transform, Opacity and the transform quick actions edit. */
      layerIds: readonly ClipId[];
      /** The primary when it is a layer, else the first layer (the fields read their value from it). */
      layerPrimary: ClipId | null;
    }
  // TODO(batch 32): caption cues (the Caption style section).
  | { kind: "cue" };

const NONE: PropertiesContext = { kind: "none" };

export function propertiesContext(selection: Selection, markerId: string | null, project: Project): PropertiesContext {
  if (markerId !== null) return { kind: "marker", markerId };
  switch (selection.kind) {
    case "none":
      return NONE;
    case "cue":
      return { kind: "cue" };
    case "track": {
      const trackIds = selectedTrackIds(selection).filter((id) => project.tracks.some((track) => track.id === id));
      return trackIds.length > 0 ? { kind: "track", trackIds } : NONE;
    }
    case "clips": {
      const clipIds = [...selection.clipIds].filter((id) => Object.hasOwn(project.clips, id));
      const first = clipIds[0];
      if (first === undefined) return NONE;
      const primary = selection.primary !== null && clipIds.includes(selection.primary) ? selection.primary : first;
      const layerIds = clipIds.filter((id) => {
        const clip = project.clips[id];
        return clip !== undefined && isLayerClip(clip);
      });
      const layerPrimary = layerIds.includes(primary) ? primary : (layerIds[0] ?? null);
      return { kind: "clips", clipIds, primary, layerIds, layerPrimary };
    }
  }
}

/** A string that changes exactly when the context may change: the selection kind, ids, primary and the marker. */
export function contextKey(selection: Selection, markerId: string | null): string {
  if (markerId !== null) return `marker:${markerId}`;
  const ids = selection.kind === "track" ? selectedTrackIds(selection) : [...selection.clipIds];
  return `${selection.kind}:${selection.primary ?? ""}:${ids.join(",")}`;
}

/**
 * The sections of a context, top to bottom (the section registry keyed by selection kind).
 * TODO(batch 26): Crop. TODO(batch 27): Speed. TODO(batch 28): Text. TODO(batch 31): Animation.
 * TODO(batch 36): Transition. TODO(batch 37): Audio. TODO(batch 32): Caption style for cues.
 */
export function sectionIds(context: PropertiesContext): SectionId[] {
  switch (context.kind) {
    case "none":
      return ["project"];
    case "marker":
      return ["marker"];
    case "track":
      return ["track"];
    case "cue":
      return [];
    case "clips":
      return context.layerIds.length > 0 ? ["clip", "transform", "opacity"] : ["clip"];
  }
}

/** The value every item shares and whether they differ (spec §11 mixed values: `--`); null for no items. */
export function shared<T, V>(items: readonly T[], get: (item: T) => V, equals: (a: V, b: V) => boolean = Object.is): { value: V; mixed: boolean } | null {
  const first = items[0];
  if (first === undefined) return null;
  const value = get(first);
  return { value, mixed: items.some((item) => !equals(get(item), value)) };
}
