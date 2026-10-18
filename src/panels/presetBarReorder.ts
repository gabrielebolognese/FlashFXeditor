// Reordering the preset bar's row (spec §20.2 "dragging a button reorders it", Batch 52). A press on a
// button, then a move past the drag threshold starts the drag: the row keeps the pointer, the marker
// shows the gap, the release says where the preset goes. Direct DOM, one write per move; the positions are
// read once when the drag starts (P9). A press ends wherever it is released: before the drag starts the
// row has no pointer capture, so a release off the row fires none of the row's events. The window's
// release ends the press then, a move with no button held drops a press whose release was missed (outside
// the browser), and the next press clears whatever is left.

const BUTTON = "[data-preset-id]";

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  /** Read once when the drag starts, in the row's content px: the button middles and where each gap's marker goes. */
  layout: { left: number; middles: number[]; gaps: number[] } | null;
  gap: number;
}

export interface PresetBarReorderOptions {
  row: HTMLElement;
  marker: HTMLElement;
  /** The drag threshold in CSS px (sideways). */
  threshold: () => number;
  /** The drag starts: the hover preview ends. */
  onStart: () => void;
}

/** Where a released drag puts its preset: the gap, 0 = before the first button. */
export interface ReorderDrop {
  id: string;
  gap: number;
}

export class PresetBarReorder {
  private drag: Drag | null = null;
  private clickTaken = false;
  private readonly view: Window;

  constructor(private readonly options: PresetBarReorderOptions) {
    this.view = options.row.ownerDocument.defaultView ?? window;
  }

  /** A press or a drag is in progress: the row's moves belong to it, not to the hover preview. */
  get active(): boolean {
    return this.drag !== null;
  }

  /** A press in the row. `id` is the pressed button's preset (null in a gap); only a set that keeps an order is reordered. */
  press(event: PointerEvent, id: string | null, reorderable: boolean): void {
    this.end(false);
    this.clickTaken = false;
    if (event.button !== 0 || !reorderable || id === null) return;
    this.drag = { id, pointerId: event.pointerId, startX: event.clientX, layout: null, gap: -1 };
    this.view.addEventListener("pointerup", this.released, true);
    this.view.addEventListener("pointercancel", this.released, true);
  }

  /** A move over the row. False when no press took it: the caller previews the hovered preset. */
  move(event: PointerEvent): boolean {
    const drag = this.drag;
    if (!drag) return false;
    if (event.pointerId !== drag.pointerId) return true;
    if ((event.buttons & 1) === 0) {
      this.end(false);
      return false;
    }
    const { row, marker } = this.options;
    if (!drag.layout) {
      if (Math.abs(event.clientX - drag.startX) < this.options.threshold()) return true;
      this.options.onStart();
      row.setPointerCapture(event.pointerId);
      const buttons = [...row.querySelectorAll<HTMLElement>(BUTTON)];
      const ends = buttons.map((button) => ({ left: button.offsetLeft, right: button.offsetLeft + button.offsetWidth }));
      drag.layout = {
        left: row.getBoundingClientRect().left,
        middles: ends.map((end) => (end.left + end.right) / 2),
        gaps: [...ends.map((end) => end.left), ends.at(-1)?.right ?? 0],
      };
      row.querySelector<HTMLElement>(`[data-preset-id="${CSS.escape(drag.id)}"]`)?.setAttribute("data-dragging", "");
      marker.hidden = false;
    }
    const x = event.clientX - drag.layout.left + row.scrollLeft;
    const gap = drag.layout.middles.filter((middle) => middle < x).length;
    if (gap === drag.gap) return true;
    drag.gap = gap;
    marker.style.transform = `translateX(${drag.layout.gaps[gap] ?? 0}px)`;
    return true;
  }

  /** The press ends. With `commit` (the row's release), a drag that had started returns its drop; a cancel drops nothing. */
  end(commit: boolean): ReorderDrop | null {
    const drag = this.drag;
    this.drag = null;
    this.view.removeEventListener("pointerup", this.released, true);
    this.view.removeEventListener("pointercancel", this.released, true);
    this.options.row.querySelector("[data-dragging]")?.removeAttribute("data-dragging");
    this.options.marker.hidden = true;
    if (!drag?.layout || !commit) return null;
    // The release of a drag is no click.
    this.clickTaken = true;
    return drag.gap >= 0 ? { id: drag.id, gap: drag.gap } : null;
  }

  /** True once for the click that follows a drag's release (the caller skips it). */
  takeClick(): boolean {
    const taken = this.clickTaken;
    this.clickTaken = false;
    return taken;
  }

  /** The window saw the release first (capture): a press whose drag never started ends here, wherever it lands. A drag has the
   * row's pointer capture, so the row's own release commits it. */
  private readonly released = (event: PointerEvent): void => {
    if (this.drag && !this.drag.layout && event.pointerId === this.drag.pointerId) this.end(false);
  };
}
