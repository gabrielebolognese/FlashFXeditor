// What the properties panel shows (spec §11 "context-driven"): its sections by the selection kind and
// the primary item. A marker selection (its own session channel, Batch 19) comes first; a clip
// selection lists the clips that exist, its primary, the layer clips among them (video, image, solid,
// text: the ones with a picture to transform), the media layers (video, image: the ones with a crop),
// the timed media (video, audio: the ones with a speed; freeze frames have a duration there) and the
// text clips (the Text section, Batch 28: right after Clip, the section a text clip is edited in;
// then their Animation section, Batch 31). Cues are selected as clips; a selection with cues, or with
// the caption track, shows the Caption style section (Batch 32: the track's style, spec §10.5).
// React renders the panel only when this context changes (`contextKey`), never on value changes
// (spec §11 implementation note, P1).
import type { Clip, ClipId, Project, TrackId } from "../../core/document/types.js";
import { selectedTrackIds, type Selection } from "../../core/store/selection.js";
import { isCropClip } from "../../timeline/edit/crop.js";
import { isLayerClip } from "../../timeline/edit/transform.js";

/** The registered sections, top to bottom in their order of appearance. */
export type SectionId = "clip" | "text" | "animation" | "captionStyle" | "transform" | "crop" | "opacity" | "speed" | "track" | "marker" | "project";

export type PropertiesContext =
  | { kind: "none" }
  | { kind: "marker"; markerId: string }
  | {
      kind: "track";
      trackIds: readonly TrackId[];
      /** The caption track when it is among them (its Caption style section). */
      captionTrackId: TrackId | null;
    }
  | {
      kind: "clips";
      /** The selected clips that exist, in selection order. */
      clipIds: readonly ClipId[];
      primary: ClipId;
      /** The layer clips among them: what Transform, Opacity and the transform quick actions edit. */
      layerIds: readonly ClipId[];
      /** The primary when it is a layer, else the first layer (the fields read their value from it). */
      layerPrimary: ClipId | null;
      /** The video and image clips among the layers: what Crop edits. */
      mediaIds: readonly ClipId[];
      /** The video and audio clips: what Speed edits. */
      speedIds: readonly ClipId[];
      /** The text clips: what Text edits. */
      textIds: readonly ClipId[];
      /** The caption track when cues are among them (the Caption style section). */
      captionTrackId: TrackId | null;
    }
  /** The session's `cue` selection kind (spec §3.3); cues are selected as clips, so nothing makes it. */
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
      const captionTrackId = trackIds.find((id) => project.tracks.find((track) => track.id === id)?.kind === "caption") ?? null;
      return trackIds.length > 0 ? { kind: "track", trackIds, captionTrackId } : NONE;
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
      const mediaIds = layerIds.filter((id) => isCropClip(project.clips[id] as Clip));
      const speedIds = clipIds.filter((id) => {
        const kind = project.clips[id]?.kind;
        return kind === "video" || kind === "audio";
      });
      const textIds = clipIds.filter((id) => project.clips[id]?.kind === "text");
      const cue = clipIds.map((id) => project.clips[id]).find((clip) => clip?.kind === "caption");
      return { kind: "clips", clipIds, primary, layerIds, layerPrimary, mediaIds, speedIds, textIds, captionTrackId: cue?.trackId ?? null };
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
 * TODO(batch 36): Transition. TODO(batch 37): Audio.
 */
export function sectionIds(context: PropertiesContext): SectionId[] {
  switch (context.kind) {
    case "none":
      return ["project"];
    case "marker":
      return ["marker"];
    case "track":
      return context.captionTrackId ? ["track", "captionStyle"] : ["track"];
    case "cue":
      return [];
    case "clips": {
      const ids: SectionId[] = ["clip"];
      if (context.textIds.length > 0) ids.push("text", "animation");
      if (context.captionTrackId) ids.push("captionStyle");
      if (context.layerIds.length > 0) ids.push("transform");
      if (context.mediaIds.length > 0) ids.push("crop");
      if (context.layerIds.length > 0) ids.push("opacity");
      if (context.speedIds.length > 0) ids.push("speed");
      return ids;
    }
  }
}

/** The value every item shares and whether they differ (spec §11 mixed values: `--`); null for no items. */
export function shared<T, V>(items: readonly T[], get: (item: T) => V, equals: (a: V, b: V) => boolean = Object.is): { value: V; mixed: boolean } | null {
  const first = items[0];
  if (first === undefined) return null;
  const value = get(first);
  return { value, mixed: items.some((item) => !equals(get(item), value)) };
}
