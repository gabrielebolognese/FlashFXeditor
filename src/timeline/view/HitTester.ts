// Timeline hit testing (spec §6.18). `hit(x, y)` turns a view point into a typed target. Priority:
// fade handles and diamonds > junctions > transition blocks (their ends, then their body, in the top
// band they cover; Batch 36) > trim zones > clip body > gap > track. Real results so far:
// the ruler with its markers (the triangles at its bottom), the in/out handles (in its upper part) and
// the playhead head, track headers (and the "+ track" rows), the junction band on a cut between
// abutting clips, the trim zones of clip edges, clip bodies, gaps (the empty span before a clip on an
// unlocked track), the scrollbars (their thumbs, zoom handles and troughs), the diamonds of a clip's
// keyframe lane (Batch 35: before the trim zones; a point elsewhere in the lane band is a clip hit with
// its `lane` set, for Alt+click), fade handles (Batch 36: a square at each fade's end on the clip's top
// edge), transition blocks and their ends (Batch 36) and empty space; the rubber band is declared for
// Batch 37. The active tool decides what a hit does (the view).
import type { KeyframeSection } from "../../core/document/keyframes.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type Marker, type Project, type Track, type TrackId, type TrackKind } from "../../core/document/types.js";
import type { FadeEdge } from "../edit/fades.js";
import type { TransitionEdge } from "../edit/transitions.js";
import { fadeHandleX, hasFadeHandles } from "./fadesAndTransitions.js";
import type { InOut } from "../model/inOut.js";
import { clipAtFrame, gapAt, neighbors, type Gap } from "../model/queries.js";
import { contains, type HeaderToggle, type Row, type TimelineGeometry } from "./geometry.js";
import { diamondAt, laneFrames, shownLane, type LaneScene } from "./keyframeLane.js";
import { scrollbarAt, type ScrollbarHit, type ScrollbarLayout } from "./scrollbars.js";

export type HitType =
  | "clip"
  // The trim zones (spec §6.4) and the band on a cut between abutting clips (the roll zone, §6.10).
  | "clipEdgeIn"
  | "clipEdgeOut"
  | "junction"
  // Fade handles (Batch 36); keyframe lane diamonds (Batch 35); TODO(batch 37): rubber band.
  | "fadeHandle"
  | "keyframe"
  | "rubberBand"
  // Transition blocks and their ends (Batch 36).
  | "transition"
  | "transitionEdge"
  | "gap"
  | "trackHeader"
  // Target, lock, mute, solo, hide and height of a track header (spec §6.1).
  | "headerToggle"
  | "ruler"
  // A timeline marker (spec §6.3) and the in/out points (§6.13) in the ruler.
  | "marker"
  | "inHandle"
  | "outHandle"
  | "playheadHead"
  // The horizontal and vertical scrollbars (spec §6.1).
  | "scrollbar"
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
  /** `scrollbar`: which bar and which part of it. */
  scrollbar: ScrollbarHit | null;
  /** `marker`: the marker's id. */
  markerId: string | null;
  /** `keyframe`: the key under the point (its frame relative to the clip). */
  keyframe: { section: KeyframeSection; frame: Frame } | null;
  /** A clip hit inside the band of the clip's keyframe lane: the lane's section (Alt+click adds a key). */
  lane: KeyframeSection | null;
  /** `fadeHandle`: which fade of `clipId`. */
  fade: FadeEdge | null;
  /** `transition` / `transitionEdge`: the cut's clips and, on an end, which one; `clipId` is the clip under the point. */
  transition: { left: ClipId; right: ClipId; edge: TransitionEdge | null } | null;
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
  /** Where the scrollbars are (none: no scrollbar hits). */
  scrollbars?(): ScrollbarLayout | null;
  /** The marker triangle's size in CSS px (none: no marker hits). */
  marker?: { width: number; height: number };
  /** The in/out range, and the width of the zone centered on a point that grabs it (none: no handle hits). */
  inOut?(): InOut;
  handleZone?: number;
  /** Keyframe lanes (Batch 35): what they show, whether a clip is selected, a row's lane band, the diamond's size (none: no lane hits). */
  keyframes?: { scene(): LaneScene | null; selected(clipId: ClipId): boolean; band(row: Row): { y: number; height: number }; size: number; inset: number };
  /** Fade handles (Batch 36): their size and the clips' top inset in a row (none: no handle hits). */
  fades?: { size: number; inset: number };
  /** Transition blocks (Batch 36): the band a block covers in a row, the width of the zone on each end (none: no block hits). */
  transitions?: { band(row: Row, track: Track): { y: number; height: number }; edgeZone: number };
}

/** Extra CSS px on each side of the playhead head (and around a marker) that still grab it. */
const HEAD_SLOP = 2;

/** First index of a marker at or after `frame` (markers are sorted by frame). */
function firstMarkerFrom(markers: readonly Marker[], frame: number): number {
  let lo = 0;
  let hi = markers.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((markers[mid] as Marker).frame < frame) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class HitTester {
  constructor(private readonly source: HitSource) {}

  hit(x: number, y: number): HitResult {
    const geometry = this.source.geometry();
    const frame = geometry.xToFrame(x);
    const result: HitResult = { type: "empty", frame, trackId: null, clipId: null, addTrack: null, toggle: null, junction: null, gap: null, scrollbar: null, markerId: null, keyframe: null, lane: null, fade: null, transition: null };
    if (x < 0 || y < 0 || x >= geometry.width || y >= geometry.height) return result;

    const { area } = geometry;
    const scrollbars = this.source.scrollbars?.();
    const bar = scrollbars ? scrollbarAt(scrollbars, x, y) : null;
    if (bar) {
      result.type = "scrollbar";
      result.scrollbar = bar;
      return result;
    }
    // The corners beside the scrollbars (under the header column, over the vertical bar) hold nothing.
    if (y >= area.y + area.height || x >= area.x + area.width) return result;

    if (y < geometry.rulerHeight) {
      if (x < geometry.headerWidth) return result;
      // Markers (the ruler's bottom) and the in/out handles (above them) come before the playhead head.
      const marker = this.markerAt(geometry, x, y);
      if (marker) {
        result.type = "marker";
        result.markerId = marker.id;
        return result;
      }
      const handle = this.handleAt(geometry, x, y);
      if (handle) {
        result.type = handle;
        return result;
      }
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
    if (this.fadeAt(result, project, clip, row, geometry, x, y)) return result;
    if (this.laneAt(result, project, row, geometry, x, y)) return result;
    return this.clipZones(result, project, row, geometry, x, y);
  }

  /** A fade handle of the clip under the point (unlocked tracks): the nearer one when both are in reach. */
  private fadeAt(result: HitResult, project: Project, clip: Clip, row: Row, geometry: TimelineGeometry, x: number, y: number): boolean {
    const fades = this.source.fades;
    if (!fades || project.tracks[row.index]?.locked || !hasFadeHandles(geometry, clip)) return false;
    const top = row.y + fades.inset;
    if (y < top - HEAD_SLOP || y > top + fades.size + HEAD_SLOP) return false;
    const reach = fades.size / 2 + HEAD_SLOP;
    const dIn = Math.abs(x - fadeHandleX(geometry, clip, "in", fades.size));
    const dOut = Math.abs(x - fadeHandleX(geometry, clip, "out", fades.size));
    if (Math.min(dIn, dOut) > reach) return false;
    result.type = "fadeHandle";
    result.fade = dIn <= dOut ? "in" : "out";
    return true;
  }

  /** A transition block (or one of its ends) over the clip under the point, in the band the block covers. */
  private transitionAt(result: HitResult, project: Project, row: Row, geometry: TimelineGeometry, x: number, y: number): boolean {
    const blocks = this.source.transitions;
    const clip = project.clips[result.clipId as ClipId];
    const track = project.tracks[row.index];
    if (!blocks || !clip || !track || !isMediaClip(clip) || !(clip.transitionIn || clip.transitionOut)) return false;
    const band = blocks.band(row, track);
    if (y < band.y || y >= band.y + band.height) return false;
    const half = blocks.edgeZone / 2;
    const { prev, next } = neighbors(project, clip.id);
    const pairs: [Clip | null, Clip | null][] = [
      [prev, clip],
      [clip, next],
    ];
    for (const [left, right] of pairs) {
      if (!left || !right || !isMediaClip(left) || !isMediaClip(right)) continue;
      const transition = left.transitionOut;
      if (!transition || transition.id !== right.transitionIn?.id) continue;
      const x0 = geometry.frameToX(right.start - transition.before);
      const x1 = geometry.frameToX(right.start + transition.after);
      if (x < x0 - half || x >= x1 + half) continue;
      const toStart = Math.abs(x - x0);
      const toEnd = Math.abs(x - x1);
      const edge = Math.min(toStart, toEnd) <= half ? (toStart < toEnd ? "start" : "end") : null;
      result.type = edge ? "transitionEdge" : "transition";
      result.transition = { left: left.id, right: right.id, edge };
      return true;
    }
    return false;
  }

  /** A point in the clip's keyframe lane band: a diamond (true: the hit is final), else the lane noted on the clip hit. Unlocked tracks only. */
  private laneAt(result: HitResult, project: Project, row: Row, geometry: TimelineGeometry, x: number, y: number): boolean {
    const lanes = this.source.keyframes;
    const clip = project.clips[result.clipId as ClipId];
    const track = project.tracks[row.index];
    if (!lanes || !clip || !track || track.locked) return false;
    const section = shownLane(lanes.scene(), clip, track, lanes.selected(clip.id));
    if (!section) return false;
    const band = lanes.band(row);
    if (y < band.y || y >= band.y + band.height) return false;
    result.lane = section;
    const frame = diamondAt(geometry, clip, laneFrames(clip, section), x, lanes.size, HEAD_SLOP, lanes.inset);
    if (frame === null) return false;
    result.type = "keyframe";
    result.keyframe = { section, frame };
    return true;
  }

  /** The marker under a ruler point: within its triangle's width (and the slop) in the band at the ruler's bottom; the nearest, the later one on a tie (drawn on top). */
  private markerAt(geometry: TimelineGeometry, x: number, y: number): Marker | null {
    const size = this.source.marker;
    if (!size || y < geometry.rulerHeight - size.height - HEAD_SLOP) return null;
    const markers = this.source.project().markers;
    const reach = size.width / 2 + HEAD_SLOP;
    let best: Marker | null = null;
    let bestDistance = Infinity;
    for (let i = firstMarkerFrom(markers, geometry.xToFrame(x - reach)); i < markers.length; i++) {
      const marker = markers[i] as Marker;
      const distance = Math.abs(geometry.frameToX(marker.frame) - x);
      if (distance > reach) {
        if (geometry.frameToX(marker.frame) > x) break;
        continue;
      }
      if (distance <= bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** The in or out handle under a ruler point above the marker band: within half the handle zone of the point, the nearer one. */
  private handleAt(geometry: TimelineGeometry, x: number, y: number): "inHandle" | "outHandle" | null {
    const range = this.source.inOut?.();
    const zone = this.source.handleZone ?? 0;
    const markerHeight = this.source.marker?.height ?? 0;
    if (!range || zone <= 0 || y >= geometry.rulerHeight - markerHeight - HEAD_SLOP) return null;
    const half = zone / 2;
    const inDistance = range.inPoint !== null ? Math.abs(geometry.frameToX(range.inPoint) - x) : Infinity;
    const outDistance = range.outPoint !== null ? Math.abs(geometry.frameToX(range.outPoint) - x) : Infinity;
    if (Math.min(inDistance, outDistance) > half) return null;
    if (inDistance === outDistance) return range.outPoint !== null && x >= geometry.frameToX(range.outPoint) ? "outHandle" : "inHandle";
    return inDistance < outDistance ? "inHandle" : "outHandle";
  }

  /** A clip hit becomes a junction, a transition block or a trim zone near its edges (unlocked tracks only). */
  private clipZones(result: HitResult, project: Project, row: Row, geometry: TimelineGeometry, x: number, y: number): HitResult {
    const rowIndex = row.index;
    const clip = project.clips[result.clipId as ClipId];
    if (!clip) return result;
    // Trim zones (spec §6.4, §6.10): the outer 8 px inside each edge, so where two clips abut the
    // left side of the cut is the left clip's out point and the right side the right clip's in point.
    // The 6 px band centered on such a cut is the junction (the roll zone, edit point clicks); its
    // halves stay inside each clip's trim zone. A narrow clip keeps its middle third for moves.
    // Clips on locked tracks take no edits.
    if (project.tracks[rowIndex]?.locked) return result;
    const x0 = geometry.frameToX(clip.start);
    const x1 = geometry.frameToX(clip.start + clip.duration);
    const zone = Math.min(this.source.trimZone, (x1 - x0) / 3);
    const half = Math.min(this.source.junctionZone / 2, zone);
    const prev = x < x0 + half ? neighbors(project, clip.id).prev : null;
    if (prev && prev.start + prev.duration === clip.start) {
      result.type = "junction";
      result.junction = { left: prev.id, right: clip.id, frame: clip.start };
      return result;
    }
    const next = x >= x1 - half ? neighbors(project, clip.id).next : null;
    if (next && next.start === clip.start + clip.duration) {
      result.type = "junction";
      result.junction = { left: clip.id, right: next.id, frame: next.start };
      return result;
    }
    // A transition block's band (Batch 36) belongs to the block, trim zones included.
    if (this.transitionAt(result, project, row, geometry, x, y)) return result;
    if (x < x0 + zone) result.type = "clipEdgeIn";
    else if (x >= x1 - zone) result.type = "clipEdgeOut";
    return result;
  }
}
