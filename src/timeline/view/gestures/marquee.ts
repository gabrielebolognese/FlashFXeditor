// The marquee (spec §6.7): a drag on empty track space selects every clip the rectangle touches, not
// only the ones inside it; Shift adds to the selection. Ephemeral: the view draws the rectangle on the
// overlay and the proposed selection on the content canvas, and writes the session once on release.
import type { ClipId, Project, Track } from "../../../core/document/types.js";
import { addToSelection, selectClips, selectionEquals, type Selection } from "../../../core/store/selection.js";
import { clipsOverlapping, trackIndex } from "../../model/queries.js";
import type { Rect, TimelineGeometry } from "../geometry.js";

export interface MarqueeState {
  /** The rectangle in view coordinates, inside the track area. */
  rect: Rect;
  selection: Selection;
}

export class MarqueeGesture {
  private state: MarqueeState | null = null;

  /**
   * The corner where the drag started is kept in content coordinates (a frame and a y relative to
   * the scroll position), so the rectangle stays anchored while the view auto-scrolls.
   */
  constructor(
    private readonly additive: boolean,
    private readonly base: Selection,
    private readonly startFrame: number,
    private readonly startContentY: number,
  ) {}

  get current(): MarqueeState | null {
    return this.state;
  }

  /**
   * The rectangle to the pointer at (x, y) and the clips it touches on unlocked tracks, with their
   * linked partners from `partners`. Returns whether the selection changed.
   */
  update(geometry: TimelineGeometry, project: Project, x: number, y: number, partners: (clipId: ClipId) => readonly ClipId[]): boolean {
    const { area } = geometry;
    const x0 = geometry.frameToX(this.startFrame);
    const y0 = this.startContentY - geometry.scrollY;
    const x1 = Math.min(Math.max(x, area.x), area.x + area.width);
    const y1 = Math.min(Math.max(y, area.y), area.y + area.height);
    const rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };

    const from = geometry.xToFrame(rect.x);
    // A zero-width marquee still touches the clips under its line.
    const to = Math.max(geometry.xToFrame(rect.x + rect.width), from + 1e-6);
    const hits: ClipId[] = [];
    for (const row of geometry.rows) {
      if (row.y >= rect.y + rect.height || row.y + row.height <= rect.y) continue;
      const track = project.tracks[row.index] as Track;
      if (track.locked) continue;
      for (const clip of clipsOverlapping(trackIndex(project, track), from, to)) hits.push(clip.id, ...partners(clip.id));
    }
    const selection = this.additive ? addToSelection(this.base, hits) : selectClips(hits);
    const changed = this.state === null || !selectionEquals(this.state.selection, selection);
    this.state = { rect, selection: changed || !this.state ? selection : this.state.selection };
    return changed;
  }
}
