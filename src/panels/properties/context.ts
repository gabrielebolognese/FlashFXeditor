// What the properties panel shows (spec §11 "context-driven"): its sections by the selection kind and
// the primary item. A marker selection (its own session channel, Batch 19) comes first; a clip
// selection lists the clips that exist, its primary, the layer clips among them (video, image, solid,
// text: the ones with a picture to transform), the media layers (video, image: the ones with a crop),
// the timed media (video, audio: the ones with a speed; freeze frames have a duration there) and the
// text clips (the Text section, Batch 28: right after Clip, the section a text clip is edited in;
// then their Animation section, Batch 31) and the solids (the Solid section, Batch 34: after the text
// ones). Cues are selected as clips; a selection with cues, or with the caption track, shows the
// Caption style section (Batch 32: the track's style, spec §10.5). A selected transition (Batch 36) shows
// its Transition section; a selected edit point shows the quick row's transition chips (and the
// Transition section of the transition on that cut, if any). The Audio section (Batch 37) edits the
// audio clips among the clips and those linked to the video clips among them; a video with sound to
// detach shows it too (its Detach audio button).
// React renders the panel only when this context changes (`contextKey`), never on value changes
// (spec §11 implementation note, P1).
import type { Clip, ClipId, Project, TrackId } from "../../core/document/types.js";
import { selectedTrackIds, type Selection } from "../../core/store/selection.js";
import { transitionAt, type Cut } from "../../timeline/edit/transitions.js";
import { isCropClip } from "../../timeline/edit/crop.js";
import { isLayerClip } from "../../timeline/edit/transform.js";
import { audioTargets, canDetach } from "../../timeline/edit/volume.js";

/** The registered sections, top to bottom in their order of appearance. */
export type SectionId = "clip" | "text" | "animation" | "solid" | "captionStyle" | "transform" | "crop" | "opacity" | "speed" | "audio" | "transition" | "track" | "marker" | "project";

export type PropertiesContext =
  | { kind: "none" }
  | { kind: "marker"; markerId: string }
  /** A selected transition (Batch 36): its cut. */
  | { kind: "transition"; cut: Cut }
  /** A selected edit point (Batch 36: the quick row's transition chips apply there); `transition`: the cut has one. */
  | { kind: "editPoint"; cut: Cut; transition: boolean }
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
      /** The solids: what Solid edits. */
      solidIds: readonly ClipId[];
      /** The audio clips among them and those linked to the video clips among them: what Audio edits (Batch 37). */
      audioIds: readonly ClipId[];
      /** The video clips whose sound Detach audio can detach. */
      detachIds: readonly ClipId[];
      /** The caption track when cues are among them (the Caption style section). */
      captionTrackId: TrackId | null;
      /** The cues among them (the Caption style section's Selected scope, spec §20.3). */
      cueIds: readonly ClipId[];
    }
  /** The session's `cue` selection kind (spec §3.3); cues are selected as clips, so nothing makes it. */
  | { kind: "cue" };

const NONE: PropertiesContext = { kind: "none" };

/** The session's other selection channels the panel follows (Batch 36): the selected transition and edit point. */
export interface SelectedCuts {
  transition: Cut | null;
  editPoint: Cut | null;
}

const NO_CUTS: SelectedCuts = { transition: null, editPoint: null };

export function propertiesContext(selection: Selection, markerId: string | null, project: Project, cuts: SelectedCuts = NO_CUTS): PropertiesContext {
  if (markerId !== null) return { kind: "marker", markerId };
  if (cuts.transition && transitionAt(project, cuts.transition)) return { kind: "transition", cut: cuts.transition };
  if (cuts.editPoint && selection.kind === "none") return { kind: "editPoint", cut: cuts.editPoint, transition: transitionAt(project, cuts.editPoint) !== null };
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
      const solidIds = clipIds.filter((id) => project.clips[id]?.kind === "solid");
      const cueIds = clipIds.filter((id) => project.clips[id]?.kind === "caption");
      const cue = cueIds.length > 0 ? project.clips[cueIds[0] as ClipId] : undefined;
      const audioIds = audioTargets(project, clipIds);
      const detachIds = clipIds.filter((id) => canDetach(project, id));
      return { kind: "clips", clipIds, primary, layerIds, layerPrimary, mediaIds, speedIds, textIds, solidIds, audioIds, detachIds, captionTrackId: cue?.trackId ?? null, cueIds };
    }
  }
}

/** A string that changes exactly when the context may change: the selection kind, ids, primary, the marker, the transition and the edit point. */
export function contextKey(selection: Selection, markerId: string | null, cuts: SelectedCuts = NO_CUTS): string {
  if (markerId !== null) return `marker:${markerId}`;
  if (cuts.transition) return `transition:${cuts.transition.left}|${cuts.transition.right}`;
  if (cuts.editPoint && selection.kind === "none") return `editPoint:${cuts.editPoint.left}|${cuts.editPoint.right}`;
  const ids = selection.kind === "track" ? selectedTrackIds(selection) : [...selection.clipIds];
  return `${selection.kind}:${selection.primary ?? ""}:${ids.join(",")}`;
}

/** The sections of a context, top to bottom (the section registry keyed by selection kind). */
export function sectionIds(context: PropertiesContext): SectionId[] {
  switch (context.kind) {
    case "none":
      return ["project"];
    case "marker":
      return ["marker"];
    case "transition":
      return ["transition"];
    case "editPoint":
      return context.transition ? ["transition"] : [];
    case "track":
      return context.captionTrackId ? ["track", "captionStyle"] : ["track"];
    case "cue":
      return [];
    case "clips": {
      const ids: SectionId[] = ["clip"];
      if (context.textIds.length > 0) ids.push("text", "animation");
      if (context.solidIds.length > 0) ids.push("solid");
      if (context.captionTrackId) ids.push("captionStyle");
      if (context.layerIds.length > 0) ids.push("transform");
      if (context.mediaIds.length > 0) ids.push("crop");
      if (context.layerIds.length > 0) ids.push("opacity");
      if (context.speedIds.length > 0) ids.push("speed");
      if (context.audioIds.length > 0 || context.detachIds.length > 0) ids.push("audio");
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
