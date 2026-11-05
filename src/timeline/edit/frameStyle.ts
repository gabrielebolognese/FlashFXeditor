// Frame styles of solids and pictures (spec §21.7, Batch 58): the corner radius (pictures: one radius;
// solids: one or four), the stroke and the shadow. One command `clip.frameStyle` (one undo step; a
// field's arrow steps coalesce by key) over any mix of solids, videos and images. Locked clips and
// clips of other kinds are skipped, as are clips the patch leaves unchanged. Pure.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Frame, MediaClip, Project, ShadowStyle, SolidClip, StrokeStyle } from "../../core/document/types.js";
import { clipRel } from "../../core/document/keyframes.js";
import { lookAtFrame, showKeyed } from "../../core/document/keyProps.js";
import { isClipLocked } from "../model/queries.js";

/** The clips with a frame style: solids and pictures. */
export type FrameClip = SolidClip | (MediaClip & { kind: "video" | "image" });

export const isFrameClip = (clip: Clip | undefined): clip is FrameClip => clip?.kind === "solid" || clip?.kind === "video" || clip?.kind === "image";

/** A change of frame style; `null` removes the stroke, the shadow or the per-corner radii. */
export interface FramePatch {
  cornerRadius?: number;
  cornerRadii?: [number, number, number, number] | null;
  stroke?: StrokeStyle | null;
  shadow?: ShadowStyle | null;
}

/** What a new stroke starts as: the paper card's 3 px inside border. */
export const DEFAULT_STROKE: StrokeStyle = { width: 3, color: { r: 0, g: 0, b: 0, a: 1 }, align: "inside" };
/** What a new shadow starts as: the paper card's hard 7/7 shadow. */
export const DEFAULT_SHADOW: ShadowStyle = { x: 7, y: 7, blur: 0, spread: 0, color: { r: 0, g: 0, b: 0, a: 1 } };
/** The soft shadow preset. */
export const SOFT_SHADOW: ShadowStyle = { x: 0, y: 12, blur: 32, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.35 } };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The radius of a frame clip (solids: their `cornerRadius`). */
export const frameRadius = (clip: FrameClip): number => (clip.kind === "solid" ? clip.cornerRadius : (clip.cornerRadius ?? 0));

/** The fields of a frame clip a patch writes, whichever its kind. */
interface FrameFields {
  cornerRadius?: number;
  cornerRadii?: number[];
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
}

function apply(clip: Draft<FrameClip>, patch: FramePatch): void {
  const target = clip as unknown as FrameFields;
  if (patch.cornerRadius !== undefined) {
    target.cornerRadius = Math.max(0, Math.round(patch.cornerRadius));
    if (clip.kind === "solid") delete target.cornerRadii;
  }
  if (clip.kind === "solid" && patch.cornerRadii !== undefined) {
    if (patch.cornerRadii) target.cornerRadii = patch.cornerRadii.map((r) => Math.max(0, Math.round(r)));
    else delete target.cornerRadii;
  }
  if (patch.stroke !== undefined) {
    if (patch.stroke) target.stroke = structuredClone(patch.stroke);
    else delete target.stroke;
  }
  if (patch.shadow !== undefined) {
    if (patch.shadow) target.shadow = structuredClone(patch.shadow);
    else delete target.shadow;
  }
}

/** `change` of every frame clip among `ids` as one command, or null when nothing changes. */
export function setFrameStyle(project: Project, ids: readonly ClipId[], change: (clip: FrameClip) => FramePatch | null, options: { label: string; coalesceKey?: string; at?: Frame }): Command | null {
  const writes: [ClipId, FramePatch][] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!isFrameClip(clip) || isClipLocked(project, id)) continue;
    // A clip with keyed look properties is edited as it shows at the playhead (Batch 61).
    const shown = lookAtFrame(clip, options.at);
    const patch = change(shown);
    if (!patch) continue;
    const probe = structuredClone(shown) as FrameClip;
    apply(probe as Draft<FrameClip>, patch);
    if (sameJson(probe, shown)) continue;
    writes.push([id, patch]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.frameStyle",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    // The timeline swatch of a solid shows its fill, not these; the picture and its shadow redraw.
    affects: ["composite"],
    // Only an edit made at a playhead frame starts from the keyed values shown there.
    ...(options.at !== undefined && { keyShown: writes.map(([id]) => id) }),
    run(draft, ctx) {
      for (const [id, patch] of writes) {
        const clip = draft.clips[id] as Draft<FrameClip>;
        if (options.at !== undefined) showKeyed(clip, clipRel(clip, ctx.playhead));
        apply(clip, patch);
      }
    },
  };
}
