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

export interface TimelineMetrics {
  headerWidth: number;
  rulerHeight: number;
  dividerHeight: number;
  addRowHeight: number;
  trackHeight: Record<Track["height"], number>;
}

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
  private readonly byTrack: ReadonlyMap<TrackId, Row>;

  constructor(input: GeometryInput) {
    const { metrics } = input;
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
    input.tracks.forEach((track, index) => {
      const height = rowHeight(track, metrics);
      if (track.kind === "audio") {
        below.push({ trackId: track.id, kind: track.kind, index, y: bottom, height });
        bottom += height;
      } else {
        // Array order is bottom to top: each one goes above the previous.
        top -= height;
        above.push({ trackId: track.id, kind: track.kind, index, y: top, height });
      }
    });
    above.reverse();
    this.rows = [...above, ...below];
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
