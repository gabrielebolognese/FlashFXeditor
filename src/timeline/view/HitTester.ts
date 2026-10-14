// Timeline hit testing (spec §6.18). `hit(x, y)` turns a view point into a typed target. Priority:
// handles and diamonds > edges/junctions > transitions > clip body > gap > track. This batch gives
// real results for the ruler, the playhead head, track headers (and the "+ track" rows), clip bodies
// and empty space; the other types are declared for the batches that draw them.
import type { ClipId, Frame, Project, TrackId, TrackKind } from "../../core/document/types.js";
import { clipAtFrame } from "../model/queries.js";
import { contains, type TimelineGeometry } from "./geometry.js";

export type HitType =
  | "clip"
  // TODO(batch 13): trim edges and junctions.
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
  // TODO(batch 16): header toggles.
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
}

export interface HitSource {
  geometry(): TimelineGeometry;
  project(): Project;
  playhead(): Frame;
  /** Width of the playhead head in CSS px (its hit zone is a little wider). */
  playheadHeadWidth: number;
}

/** Extra CSS px on each side of the playhead head that still grab it. */
const HEAD_SLOP = 2;

export class HitTester {
  constructor(private readonly source: HitSource) {}

  hit(x: number, y: number): HitResult {
    const geometry = this.source.geometry();
    const frame = geometry.xToFrame(x);
    const result: HitResult = { type: "empty", frame, trackId: null, clipId: null, addTrack: null };
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
      } else if (contains(geometry.addVideo, x, y) || contains(geometry.addAudio, x, y)) {
        result.type = "trackHeader";
        result.addTrack = contains(geometry.addVideo, x, y) ? "video" : "audio";
      }
      return result;
    }

    if (!row) return result;
    result.trackId = row.trackId;
    const clip = clipAtFrame(this.source.project(), row.trackId, Math.floor(frame));
    if (clip) {
      result.type = "clip";
      result.clipId = clip.id;
    }
    return result;
  }
}
