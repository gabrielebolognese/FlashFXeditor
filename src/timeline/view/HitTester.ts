// Timeline hit testing (spec §6.18). `hit(x, y)` turns a view point into a typed target. Priority:
// handles and diamonds > edges/junctions > transitions > clip body > gap > track. Real results so far:
// the ruler, the playhead head, track headers (and the "+ track" rows), the trim zones of clip edges,
// clip bodies and empty space; the other types are declared for the batches that draw them.
import type { ClipId, Frame, Project, TrackId, TrackKind } from "../../core/document/types.js";
import { clipAtFrame } from "../model/queries.js";
import { contains, type HeaderToggle, type TimelineGeometry } from "./geometry.js";

export type HitType =
  | "clip"
  // The trim zones (spec §6.4); TODO(batch 14): the roll zone on junctions.
  | "clipEdgeIn"
  | "clipEdgeOut"
  | "junction"
  // TODO(batch 36): fade handles; TODO(batch 35): keyframes; TODO(batch 37): rubber band.
  | "fadeHandle"
  | "keyframe"
  | "rubberBand"
  // TODO(batch 36): transition blocks.
  | "transition"
  | "transitionEdge"
  // TODO(batch 15): gaps.
  | "gap"
  | "trackHeader"
  // Mute and solo of audio tracks; TODO(batch 16): the other header toggles.
  | "headerToggle"
  | "ruler"
  // TODO(batch 19): markers and in/out handles.
  | "marker"
  | "inHandle"
  | "outHandle"
  | "playheadHead"
  | "empty";

export interface HitResult {
  type: HitType;
  /** Frame under the point (fractional, may be outside the content). */
  frame: number;
  trackId: TrackId | null;
  clipId: ClipId | null;
  /** `trackHeader` on a "+ track" row: the kind of track it adds. */
  addTrack: TrackKind | null;
  /** `headerToggle`: which one. */
  toggle: HeaderToggle | null;
}

export interface HitSource {
  geometry(): TimelineGeometry;
  project(): Project;
  playhead(): Frame;
  /** Width of the playhead head in CSS px (its hit zone is a little wider). */
  playheadHeadWidth: number;
  /** Width of the trim zone inside each clip edge, CSS px (spec §6.4: 8 px). */
  trimZone: number;
}

/** Extra CSS px on each side of the playhead head that still grab it. */
const HEAD_SLOP = 2;

export class HitTester {
  constructor(private readonly source: HitSource) {}

  hit(x: number, y: number): HitResult {
    const geometry = this.source.geometry();
    const frame = geometry.xToFrame(x);
    const result: HitResult = { type: "empty", frame, trackId: null, clipId: null, addTrack: null, toggle: null };
    if (x < 0 || y < 0 || x >= geometry.width || y >= geometry.height) return result;

    if (y < geometry.rulerHeight) {
      if (x < geometry.headerWidth) return result;
      const headX = geometry.frameToX(this.source.playhead());
      result.type = Math.abs(x - headX) <= this.source.playheadHeadWidth / 2 + HEAD_SLOP ? "playheadHead" : "ruler";
      return result;
    }

    const row = geometry.rowAt(y);
    if (x < geometry.headerWidth) {
      if (row) {
        result.type = "trackHeader";
        result.trackId = row.trackId;
        const toggles = geometry.headerToggles(row);
        for (const toggle of ["mute", "solo"] as const) {
          if (toggles && contains(toggles[toggle], x, y)) {
            result.type = "headerToggle";
            result.toggle = toggle;
          }
        }
      } else if (contains(geometry.addVideo, x, y) || contains(geometry.addAudio, x, y)) {
        result.type = "trackHeader";
        result.addTrack = contains(geometry.addVideo, x, y) ? "video" : "audio";
      }
      return result;
    }

    if (!row) return result;
    result.trackId = row.trackId;
    const project = this.source.project();
    const clip = clipAtFrame(project, row.trackId, Math.floor(frame));
    if (!clip) return result;
    result.type = "clip";
    result.clipId = clip.id;
    // Trim zones (spec §6.4, §6.10): the outer 8 px inside each edge, so where two clips abut the
    // left side of the junction is the left clip's out point and the right side the right clip's in
    // point. A narrow clip keeps its middle third for moves. Clips on locked tracks take no edits.
    if (project.tracks[row.index]?.locked) return result;
    const x0 = geometry.frameToX(clip.start);
    const x1 = geometry.frameToX(clip.start + clip.duration);
    const zone = Math.min(this.source.trimZone, (x1 - x0) / 3);
    if (x < x0 + zone) result.type = "clipEdgeIn";
    else if (x >= x1 - zone) result.type = "clipEdgeOut";
    return result;
  }
}
