// List view column resizing (spec §12 "list view columns and resizing", Batch 41): dragging the right
// edge of a header cell gives that column a width in CSS px (at least `--media-column-min`); the
// columns without one share the rest. While dragging only the list's `--list-columns` property is
// written (no React render, P1); the release stores the width in session state (`mediaPanel.columns`).
// A double-click on the edge gives the column back its share. Batch 46: the edge is a focusable
// separator, Left / Right resize the column from the keyboard (Shift: larger steps).
import { sessionStore } from "../../app/services.js";
import { MEDIA_COLUMNS, type MediaColumn, type SessionState } from "../../core/store/sessionStore.js";

type ColumnWidths = SessionState["mediaPanel"]["columns"];

/** Each column's share of the list's width when it has no width of its own. */
const SHARES: Record<MediaColumn, string> = { name: "3fr", duration: "1.2fr", resolution: "1.2fr", fps: "1.2fr", codec: "1.2fr", audio: "0.8fr", proxy: "0.8fr", used: "0.8fr" };

/** The list's column template: the thumbnail, then each column's width in px or its share of the rest. */
export function listColumns(widths: ColumnWidths): string {
  return ["var(--media-list-thumb-width)", ...MEDIA_COLUMNS.map((key) => (widths[key] !== undefined ? `${widths[key]}px` : `minmax(0, ${SHARES[key]})`))].join(" ");
}

/** The narrowest a column can be (px, `--media-column-min`). */
const minWidth = (list: HTMLElement) => parseFloat(getComputedStyle(list).getPropertyValue("--media-column-min")) || 0;

function setColumns(columns: ColumnWidths): void {
  sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, columns } }));
}

/** A press on a column's edge: resizes it until the release. */
export function pressColumnResizer(event: PointerEvent, column: MediaColumn): void {
  if (event.button !== 0) return;
  const handle = event.target as HTMLElement;
  const cell = handle.closest<HTMLElement>("[data-column]");
  const list = handle.closest<HTMLElement>("[data-media-list]");
  if (!cell || !list) return;
  event.preventDefault();
  // Reads first (P9): the cell's width and the minimum, once.
  const start = cell.getBoundingClientRect().width;
  const min = minWidth(list);
  const widths: ColumnWidths = { ...sessionStore.state.getState().mediaPanel.columns };
  const startX = event.clientX;
  const pointerId = event.pointerId;
  try {
    handle.setPointerCapture(pointerId);
  } catch {
    return;
  }
  list.dataset.resizing = "";
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    widths[column] = Math.round(Math.max(min, start + next.clientX - startX));
    list.style.setProperty("--list-columns", listColumns(widths));
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    delete list.dataset.resizing;
    if (next.type === "pointerup" && widths[column] !== undefined) setColumns(widths);
    else list.style.setProperty("--list-columns", listColumns(sessionStore.state.getState().mediaPanel.columns));
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

/** A Left / Right press on a focused edge (Batch 46) moves it one `--column-resize-step`; with Shift, this many. */
const LARGE_STEPS = 4;

/** The edge's value for assistive tech (its column's width in px and the minimum), written when it takes the focus. */
export function describeColumnWidth(handle: HTMLElement): void {
  const cell = handle.closest<HTMLElement>("[data-column]");
  const list = handle.closest<HTMLElement>("[data-media-list]");
  if (!cell || !list) return;
  handle.setAttribute("aria-valuenow", String(Math.round(cell.getBoundingClientRect().width)));
  handle.setAttribute("aria-valuemin", String(minWidth(list)));
}

/** The keyboard's resize (Batch 46): the column narrows (`direction` -1) or widens by a step, stored at once. */
export function keyResizeColumn(handle: HTMLElement, column: MediaColumn, direction: -1 | 1, large: boolean): void {
  const cell = handle.closest<HTMLElement>("[data-column]");
  const list = handle.closest<HTMLElement>("[data-media-list]");
  if (!cell || !list) return;
  const step = (parseFloat(getComputedStyle(list).getPropertyValue("--column-resize-step")) || 1) * (large ? LARGE_STEPS : 1);
  const width = Math.round(Math.max(minWidth(list), cell.getBoundingClientRect().width + direction * step));
  setColumns({ ...sessionStore.state.getState().mediaPanel.columns, [column]: width });
  handle.setAttribute("aria-valuenow", String(width));
}

/** The column's own width goes: it shares the rest again. */
export function resetColumn(column: MediaColumn): void {
  const columns = { ...sessionStore.state.getState().mediaPanel.columns };
  if (columns[column] === undefined) return;
  delete columns[column];
  setColumns(columns);
}
