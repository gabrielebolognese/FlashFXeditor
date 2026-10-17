// Solids and shapes (spec §5.2 `SolidClip`, §6.1 `+ Solid`, §11 Solid section, Batch 34): new solids
// and edits of their look (shape, fill, size, corner radius).
// - `addSolid` (`+ Solid`): a white rounded rectangle centered on the frame, sized from the frame's
//   short side, at the playhead on the topmost video track when it is free there (unlocked, shown),
//   else on a new video track above the others; SOLID_SECONDS long. One command `clip.addSolid`.
// - `setSolids` writes new looks (and the transforms a size handle drag moves, spec §7.3) as one command
//   `clip.solid` (one undo step; a field's arrow steps coalesce by key). Clips that are gone, locked,
//   not solids or unchanged are skipped.
// - `withShape`: a line is a thin bar, so a box or an ellipse turned into a line gets the line's
//   thickness, and a line turned into another shape gets half its length as height.
// - `drawnRadius`: the corner radius the shape is drawn with: at most half the shorter side (a line's
//   ends round by it), none for rects and ellipses.
// Pure.
import type { Draft } from "immer";
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { secondsToFrames } from "../../core/document/time.js";
import type { ClipId, Frame, Project, SolidClip, SolidShape, Track, Transform } from "../../core/document/types.js";
import { clipsInRange, isClipLocked } from "../model/queries.js";
import { IDENTITY_TRANSFORM, normalizeTransform, sameTransform } from "./transform.js";

/** The length of a new solid (spec §6.14 gives images 5 s; solids take the same). */
export const SOLID_SECONDS = 5;

/** What the Solid section edits: the solid's own look, apart from its transform. */
export type SolidLook = Pick<SolidClip, "shape" | "fill" | "size" | "cornerRadius">;

/** A solid's edit: a new look (any of its fields) and the transform that goes with it (a size handle drag). */
export type SolidEdit = Partial<SolidLook> & { transform?: Transform };

/** Field limits of the Solid section (project px). */
export const SOLID_LIMITS = {
  size: { min: 1, max: 16384 },
  radius: { min: 0, max: 8192 },
} as const;

/** `+ Solid`'s size and radius as fractions of the frame's short side (a 648 x 324 card, 54 px corners, at 1080). */
const DEFAULT_WIDTH = 0.6;
const DEFAULT_HEIGHT = 0.3;
const DEFAULT_RADIUS = 0.05;
/** A line's thickness as a fraction of the short side (8 px at 1080). */
const LINE_THICKNESS = 1 / 135;

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

const shortSide = (frame: { width: number; height: number }) => Math.min(frame.width, frame.height);

/** A solid's look. */
export function solidLook(clip: SolidClip): SolidLook {
  return { shape: clip.shape, fill: clip.fill, size: clip.size, cornerRadius: clip.cornerRadius };
}

/** The look of `+ Solid` in a frame: a white rounded rectangle. */
export function defaultSolid(frame: { width: number; height: number }): SolidLook {
  const side = shortSide(frame);
  return {
    shape: "roundedRect",
    fill: { ...WHITE },
    size: { w: Math.max(1, Math.round(DEFAULT_WIDTH * side)), h: Math.max(1, Math.round(DEFAULT_HEIGHT * side)) },
    cornerRadius: Math.round(DEFAULT_RADIUS * side),
  };
}

/** The thickness a box turned into a line gets in a frame. */
export function lineThickness(frame: { width: number; height: number }): number {
  return Math.max(1, Math.round(LINE_THICKNESS * shortSide(frame)));
}

/** `look` as `shape`: a line gets its thickness, a line that becomes a box half its length as height. */
export function withShape(look: SolidLook, shape: SolidShape, frame: { width: number; height: number }): SolidLook {
  if (shape === look.shape) return look;
  if (shape === "line") return { ...look, shape, size: { w: look.size.w, h: Math.min(look.size.h, lineThickness(frame)) } };
  if (look.shape === "line") return { ...look, shape, size: { w: look.size.w, h: Math.max(look.size.h, Math.round(look.size.w / 2)) } };
  return { ...look, shape };
}

/** The corner radius `look` is drawn with: rounded rects and line ends, at most half the shorter side. */
export function drawnRadius(look: Pick<SolidLook, "shape" | "size" | "cornerRadius">): number {
  if (look.shape !== "roundedRect" && look.shape !== "line") return 0;
  return Math.max(0, Math.min(look.cornerRadius, look.size.w / 2, look.size.h / 2));
}

const SHAPE_NAMES: Record<SolidShape, string> = { rect: "Rectangle", roundedRect: "Rounded rectangle", ellipse: "Ellipse", line: "Line" };

/** The name of a shape (the Solid section's chips, the timeline's default clip name). */
export const shapeName = (shape: SolidShape): string => SHAPE_NAMES[shape];

export function newSolidClip(fields: { id: ClipId; trackId: string; start: Frame; duration: Frame; look: SolidLook; transform?: Transform }): SolidClip {
  const look = structuredClone(fields.look);
  return {
    id: fields.id,
    trackId: fields.trackId,
    kind: "solid",
    name: "Solid",
    start: fields.start,
    duration: fields.duration,
    enabled: true,
    ...look,
    transform: structuredClone(fields.transform ?? IDENTITY_TRANSFORM),
    opacity: 1,
  };
}

/**
 * `+ Solid` (spec §6.1): the default solid at the playhead, centered, SOLID_SECONDS long, on the
 * topmost video track when it is free there (unlocked, shown), else on a new video track above the
 * others. One command ("Add solid"); the new clip's id.
 */
export function addSolid(project: Project, playhead: Frame, newId: () => string, look: SolidLook = defaultSolid(project.settings)): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(playhead));
  const length = secondsToFrames(SOLID_SECONDS, project.settings.fps);
  const top = project.tracks.filter((track) => track.kind === "video").at(-1);
  const free = top && !top.locked && !top.hidden && clipsInRange(project, top.id, start, start + length).length === 0 ? top : null;
  const newTrack = free ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = (free ?? (newTrack as Track)).id;
  const clip = newSolidClip({ id: newId(), trackId, start, duration: length, look });
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addSolid",
      label: "Add solid",
      affects: ["clips", "timeline", "composite", ...(newTrack ? (["tracks"] as const) : [])],
      run(draft, ctx) {
        trackCommand?.run(draft, ctx);
        draft.clips[clip.id] = structuredClone(clip);
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`clip.addSolid: track ${trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
      },
    },
  };
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const validSize = (size: SolidLook["size"]) => Number.isFinite(size.w) && Number.isFinite(size.h) && size.w > 0 && size.h > 0;

/** `look` with its sizes and radius rounded to whole px inside SOLID_LIMITS. */
function cleanLook(look: SolidLook): SolidLook {
  const { size, radius } = SOLID_LIMITS;
  const px = (value: number, limits: { min: number; max: number }) => Math.min(limits.max, Math.max(limits.min, Math.round(value)));
  return { ...look, size: { w: px(look.size.w, size), h: px(look.size.h, size) }, cornerRadius: px(look.cornerRadius, radius) };
}

/**
 * `edits` (new looks and transforms by clip id) as one command `clip.solid`, or null when nothing
 * changes. Sizes and the radius are whole px within SOLID_LIMITS.
 */
export function setSolids(project: Project, edits: ReadonlyMap<ClipId, SolidEdit>, options: { label: string; coalesceKey?: string }): Command | null {
  const writes: [ClipId, SolidLook, Transform][] = [];
  let timeline = false;
  for (const [id, edit] of edits) {
    const clip = project.clips[id];
    if (clip?.kind !== "solid" || isClipLocked(project, id)) continue;
    const { transform: moved, ...patch } = edit;
    const merged = { ...solidLook(clip), ...patch };
    if (!validSize(merged.size) || !Number.isFinite(merged.cornerRadius)) continue;
    const look = cleanLook(merged);
    const transform = moved ? normalizeTransform(moved) : clip.transform;
    if (sameJson(solidLook(clip), look) && sameTransform(clip.transform, transform)) continue;
    // The timeline's swatch shows the shape and the fill.
    if (look.shape !== clip.shape || !sameJson(look.fill, clip.fill)) timeline = true;
    writes.push([id, look, transform]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.solid",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: timeline ? ["composite", "clips"] : ["composite"],
    run(draft) {
      for (const [id, look, transform] of writes) {
        const clip = draft.clips[id] as Draft<SolidClip>;
        clip.shape = look.shape;
        clip.fill = structuredClone(look.fill);
        clip.size = { ...look.size };
        clip.cornerRadius = look.cornerRadius;
        clip.transform = structuredClone(transform);
      }
    },
  };
}
