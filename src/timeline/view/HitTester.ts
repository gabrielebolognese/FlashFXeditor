// Timeline hit testing (spec §6.18). `hit(x, y)` turns a view point into a typed target. Priority:
// handles and diamonds > edges/junctions > transitions > clip body > gap > track. Real results so far:
// the ruler, the playhead head, track headers (and the "+ track" rows), the junction band on a cut
// between abutting clips, the trim zones of clip edges, clip bodies, gaps (the empty span before a
// clip on an unlocked track) and empty space; the other types are declared for the batches that draw
// them. The active tool decides what a hit does (the view).
import type { ClipId, Frame, Project, TrackId, TrackKind } from "../../core/document/types.js";
import { clipAtFrame, gapAt, neighbors, type Gap } from "../model/queries.js";
import { contains, type HeaderToggle, type TimelineGeometry } from "./geometry.js";

export type HitType =
  | "clip"
  // The trim zones (spec §6.4) and the band on a cut between abutting clips (the roll zone, §6.10).
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
  | "gap"
  | "trackHeader"
  // Target, lock, mute, solo, hide and height of a track header (spec §6.1).
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
  /** `junction`: the cut and the clips on both sides; `clipId` is the one on the pointer's side. */
  junction: Junction | null;
  /** `gap`: the empty span under the point (spec §6.7). */
  gap: Gap | null;
}

/** A cut between two abutting clips on a track (spec §6.10: the roll zone). */
export interface Junction {
  left: ClipId;
  right: ClipId;
  frame: Frame;
}

export interface HitSource {
  geometry(): TimelineGeometry;
  project(): Project;
  playhead(): Frame;
  /** Width of the playhead head in CSS px (its hit zone is a little wider). */
  playheadHeadWidth: number;
  /** Width of the trim zone inside each clip edge, CSS px (spec §6.4: 8 px). */
  trimZone: number;
  /** Width of the band centered on a cut between abutting clips, CSS px (spec §6.10: 6 px). */
  junctionZone: number;
}

/** Extra CSS px on each side of the playhead head that still grab it. */
const HEAD_SLOP = 2;

export class HitTester {
  constructor(private readonly source: HitSource) {}

  hit(x: number, y: number): HitResult {
    const geometry = this.source.geometry();
    const frame = geometry.xToFrame(x);
    const result: HitResult = { type: "empty", frame, trackId: null, clipId: null, addTrack: null, toggle: null, junction: null, gap: null };
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
        const toggle = geometry.headerToggles(row).find((entry) => contains(entry.rect, x, y));
        if (toggle) {
          result.type = "headerToggle";
          result.toggle = toggle.toggle;
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
    if (!clip) {
      // A gap: before a clip, after the previous one (or frame 0). Gaps on locked tracks take no edits.
      const gap = project.tracks[row.index]?.locked ? null : gapAt(project, row.trackId, Math.floor(frame));
      if (gap) {
        result.type = "gap";
        result.gap = gap;
      }
      return result;
    }
    result.type = "clip";
    result.clipId = clip.id;
    // Trim zones (spec §6.4, §6.10): the outer 8 px inside each edge, so where two clips abut the
    // left side of the cut is the left clip's out point and the right side the right clip's in point.
    // The 6 px band centered on such a cut is the junction (the roll zone, edit point clicks); its
    // halves stay inside each clip's trim zone. A narrow clip keeps its middle third for moves.
    // Clips on locked tracks take no edits.
    if (project.tracks[row.index]?.locked) return result;
    const x0 = geometry.frameToX(clip.start);
    const x1 = geometry.frameToX(clip.start + clip.duration);
    const zone = Math.min(this.source.trimZone, (x1 - x0) / 3);
    const half = Math.min(this.source.junctionZone / 2, zone);
    if (x < x0 + zone) {
      result.type = "clipEdgeIn";
      const prev = x < x0 + half ? neighbors(project, clip.id).prev : null;
      if (prev && prev.start + prev.duration === clip.start) {
        result.type = "junction";
        result.junction = { left: prev.id, right: clip.id, frame: clip.start };
      }
    } else if (x >= x1 - zone) {
      result.type = "clipEdgeOut";
      const next = x >= x1 - half ? neighbors(project, clip.id).next : null;
      if (next && next.start === clip.start + clip.duration) {
        result.type = "junction";
        result.junction = { left: clip.id, right: next.id, frame: next.start };
      }
    }
    return result;
  }
}
