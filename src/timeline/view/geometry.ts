// Timeline geometry (spec §6.2, §6.17): where the ruler, the header column, the track rows, the
// video/audio divider and the "+ track" rows are, and the frame <-> x mapping. Immutable; the view
// builds a new one when the size, zoom, scroll or tracks change. All values are CSS px in view
// coordinates (0,0 = top-left of the canvas).
//
// Vertical layout: the divider rests at a fixed point of the track area. Video tracks (and the
// caption track above them) stack upward from it, audio tracks downward, so adding a track never
// moves the divider. `scrollY` shifts everything; 0 is the resting position and it may be negative
// (scrolled up to see high video tracks).
import type { Frame, Track, TrackId, TrackKind } from "../../core/document/types.js";
import type { LaneKind } from "../model/queries.js";

export interface TimelineMetrics {
  headerWidth: number;
  rulerHeight: number;
  dividerHeight: number;
  addRowHeight: number;
  trackHeight: Record<Track["height"], number>;
  /** Header column padding, and the height of a header's first line (icon, name, toggles). */
  headerPad: number;
  headerLine: number;
  toggleSize: number;
  toggleGap: number;
}

/** The toggles of a track header (audio tracks: mute and solo; the rest come with Batch 16). */
export type HeaderToggle = "mute" | "solo";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Row {
  trackId: TrackId;
  kind: TrackKind;
  /** Index in `project.tracks`. */
  index: number;
  /** Lane number within its kind (V1 = 0 upward, A1 = 0 downward; 0 for the caption track). */
  lane: number;
  y: number;
  height: number;
}

export interface GeometryInput {
  width: number;
  height: number;
  tracks: readonly Track[];
  pxPerFrame: number;
  scrollFrame: number;
  scrollY: number;
  metrics: TimelineMetrics;
}

/** Where the divider rests, as a fraction of the track area height. */
export const DIVIDER_ANCHOR = 0.5;

export function rowHeight(track: Pick<Track, "kind" | "height">, metrics: TimelineMetrics): number {
  // The caption track is always S (spec §6.2).
  return metrics.trackHeight[track.kind === "caption" ? "S" : track.height];
}

export class TimelineGeometry {
  readonly width: number;
  readonly height: number;
  readonly headerWidth: number;
  readonly rulerHeight: number;
  readonly pxPerFrame: number;
  readonly scrollFrame: number;
  readonly scrollY: number;
  /** Below the ruler, right of the header column. */
  readonly area: Rect;
  /** Track rows, top to bottom on screen. */
  readonly rows: readonly Row[];
  /** The band between video and audio tracks, full width. */
  readonly divider: Rect;
  /** The "+ track" rows above the top video track and below the bottom audio track, full width. */
  readonly addVideo: Rect;
  readonly addAudio: Rect;
  /** Allowed `scrollY` values; 0 (the resting position) is always inside. */
  readonly scrollYRange: { min: number; max: number };
  /** Video and audio rows in lane order (V1 first, A1 first). */
  readonly laneRows: Readonly<Record<LaneKind, readonly Row[]>>;
  private readonly byTrack: ReadonlyMap<TrackId, Row>;
  private readonly metrics: TimelineMetrics;

  constructor(input: GeometryInput) {
    const { metrics } = input;
    this.metrics = metrics;
    this.width = input.width;
    this.height = input.height;
    this.headerWidth = Math.min(metrics.headerWidth, input.width);
    this.rulerHeight = Math.min(metrics.rulerHeight, input.height);
    this.pxPerFrame = input.pxPerFrame;
    this.scrollFrame = input.scrollFrame;
    this.scrollY = input.scrollY;
    this.area = {
      x: this.headerWidth,
      y: this.rulerHeight,
      width: Math.max(0, input.width - this.headerWidth),
      height: Math.max(0, input.height - this.rulerHeight),
    };

    const anchor = Math.round(this.area.height * DIVIDER_ANCHOR);
    const origin = this.area.y + anchor - input.scrollY;
    const above: Row[] = [];
    const below: Row[] = [];
    let top = origin;
    let bottom = origin + metrics.dividerHeight;
    const laneRows: Record<LaneKind, Row[]> = { video: [], audio: [] };
    input.tracks.forEach((track, index) => {
      const height = rowHeight(track, metrics);
      if (track.kind === "audio") {
        const row = { trackId: track.id, kind: track.kind, index, lane: laneRows.audio.length, y: bottom, height };
        below.push(row);
        laneRows.audio.push(row);
        bottom += height;
      } else {
        // Array order is bottom to top: each one goes above the previous.
        top -= height;
        const row = { trackId: track.id, kind: track.kind, index, lane: track.kind === "video" ? laneRows.video.length : 0, y: top, height };
        above.push(row);
        if (track.kind === "video") laneRows.video.push(row);
      }
    });
    above.reverse();
    this.rows = [...above, ...below];
    this.laneRows = laneRows;
    this.byTrack = new Map(this.rows.map((row) => [row.trackId, row]));

    this.divider = { x: 0, y: origin, width: input.width, height: metrics.dividerHeight };
    this.addVideo = { x: 0, y: top - metrics.addRowHeight, width: input.width, height: metrics.addRowHeight };
    this.addAudio = { x: 0, y: bottom, width: input.width, height: metrics.addRowHeight };

    // In divider-relative content coordinates: the content spans [contentTop, contentBottom].
    const contentTop = top - metrics.addRowHeight - origin;
    const contentBottom = bottom + metrics.addRowHeight - origin;
    this.scrollYRange = {
      min: Math.min(0, contentTop + anchor),
      max: Math.max(0, contentBottom + anchor - this.area.height),
    };
  }

  frameToX(frame: number): number {
    return this.headerWidth + (frame - this.scrollFrame) * this.pxPerFrame;
  }

  xToFrame(x: number): number {
    return this.scrollFrame + (x - this.headerWidth) / this.pxPerFrame;
  }

  /** Frames visible in the track area: [from, to). */
  get visibleFrames(): { from: number; to: number } {
    return { from: this.scrollFrame, to: this.scrollFrame + this.area.width / this.pxPerFrame };
  }

  isFrameVisible(frame: Frame): boolean {
    const { from, to } = this.visibleFrames;
    return frame >= from && frame <= to;
  }

  /**
   * The mute and solo toggles of an audio track's header, right-aligned on its first line; null for
   * other tracks. TODO(batch 16): target, lock and hide toggles, video mute.
   */
  headerToggles(row: Row): Record<HeaderToggle, Rect> | null {
    if (row.kind !== "audio") return null;
    const { headerPad, headerLine, toggleSize, toggleGap } = this.metrics;
    const y = row.y + (Math.min(row.height, headerLine) - toggleSize) / 2;
    const solo = { x: this.headerWidth - headerPad - toggleSize, y, width: toggleSize, height: toggleSize };
    const mute = { x: solo.x - toggleGap - toggleSize, y, width: toggleSize, height: toggleSize };
    return { mute, solo };
  }

  /**
   * The lane under view y for a clip of `kind` being dragged (spec §6.8): the row's lane over a row of
   * that kind, one past the last lane beyond the outermost row (above the top video track, below the
   * bottom audio track: a new track), lane 0 anywhere else (the other kind's side).
   */
  laneAt(kind: LaneKind, y: number): number {
    const rows = this.laneRows[kind];
    const outer = rows[rows.length - 1];
    if (!outer) return 0;
    if (kind === "video" ? y < outer.y : y >= outer.y + outer.height) return rows.length;
    const row = this.rowAt(y);
    return row && row.kind === kind ? row.lane : 0;
  }

  /** The vertical band of a lane: its row, or for a lane past the last one a row of `newHeight` stacked beyond it. */
  laneBand(kind: LaneKind, lane: number, newHeight: number): { y: number; height: number } | null {
    const rows = this.laneRows[kind];
    const row = rows[lane];
    if (row) return { y: row.y, height: row.height };
    const outer = rows[rows.length - 1];
    if (!outer || lane < 0) return null;
    const beyond = lane - rows.length;
    return kind === "video" ? { y: outer.y - (beyond + 1) * newHeight, height: newHeight } : { y: outer.y + outer.height + beyond * newHeight, height: newHeight };
  }

  rowOf(trackId: TrackId): Row | null {
    return this.byTrack.get(trackId) ?? null;
  }

  /** The row at view y (any x), or null. Binary search over the sorted rows. */
  rowAt(y: number): Row | null {
    let lo = 0;
    let hi = this.rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.rows[mid] as Row).y <= y) lo = mid + 1;
      else hi = mid;
    }
    const row = this.rows[lo - 1];
    return row && y < row.y + row.height ? row : null;
  }
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
