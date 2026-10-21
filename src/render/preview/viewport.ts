// Preview viewport math (spec §7.1, §7.5): where the project frame sits on the canvas. Fit letterboxes
// the frame inside the panel with a margin and stays centered; a numeric zoom is project px per device
// px (100% = 1:1 pixels) with a pan: the frame point shown at the canvas center, as an offset in
// project px from the frame center (0, 0 = centered), so a panel resize keeps the same point there.
// Zooming around a point (the wheel at the cursor, the menu at the canvas center) keeps the project
// point under it fixed. All sizes here are device px except the frame and the pan (project px).
import { PREVIEW_MAX_ZOOM, PREVIEW_MIN_ZOOM } from "../../core/store/sessionStore.js";
import { setMat, type MutableMat3 } from "../mat3.js";

export type PreviewZoom = number | "fit";

export interface Size {
  width: number;
  height: number;
}

/** The view part of the session (`SessionState.preview`). */
export interface ViewState {
  zoom: PreviewZoom;
  panX: number;
  panY: number;
}

/** The zoom choices of the preview header (§7.1), Fit first. */
export const ZOOM_CHOICES: readonly PreviewZoom[] = ["fit", 0.25, 0.5, 1, 2, 4];

export const MIN_ZOOM = PREVIEW_MIN_ZOOM;
export const MAX_ZOOM = PREVIEW_MAX_ZOOM;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Writes into `out` project px -> target px for the view. Fit edges and zoomed origins land on whole device pixels. */
export function frameTransformInto(out: MutableMat3, zoom: PreviewZoom, frame: Size, target: Size, margin: number, panX = 0, panY = 0): MutableMat3 {
  if (frame.width <= 0 || frame.height <= 0) return setMat(out, 1, 0, 0, 1, 0, 0);
  if (zoom === "fit") {
    // A panel too small for the margin uses it all.
    const room = target.width > 2 * margin && target.height > 2 * margin ? margin : 0;
    const scale = Math.min((target.width - 2 * room) / frame.width, (target.height - 2 * room) / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    return setMat(out, width / frame.width, 0, 0, height / frame.height, Math.round((target.width - width) / 2), Math.round((target.height - height) / 2));
  }
  const x = Math.round(target.width / 2 - (frame.width / 2 + panX) * zoom);
  const y = Math.round(target.height / 2 - (frame.height / 2 + panY) * zoom);
  return setMat(out, zoom, 0, 0, zoom, x, y);
}

/** Keeps the frame point at the canvas center inside the frame (a pan can bring an edge to the center, no further). */
export function clampPan(panX: number, panY: number, frame: Size): { panX: number; panY: number } {
  const x = Math.min(frame.width / 2, Math.max(-frame.width / 2, panX));
  const y = Math.min(frame.height / 2, Math.max(-frame.height / 2, panY));
  return { panX: x === 0 ? 0 : x, panY: y === 0 ? 0 : y };
}

/** Device px per project px of the view (Fit included, as `frameTransformInto` places it). */
export function viewScale(zoom: PreviewZoom, frame: Size, target: Size, margin: number): number {
  if (zoom !== "fit") return zoom;
  if (frame.width <= 0 || frame.height <= 0) return 1;
  const room = target.width > 2 * margin && target.height > 2 * margin ? margin : 0;
  const scale = Math.min((target.width - 2 * room) / frame.width, (target.height - 2 * room) / frame.height);
  return Math.max(1, Math.round(frame.width * scale)) / frame.width;
}

/**
 * The view at `zoom` with the project point under `anchor` (target px) kept there: the wheel at the
 * cursor, the zoom menu and Mod+1/2 at the canvas center. Fit comes back centered.
 */
export function zoomAround(view: ViewState, zoom: PreviewZoom, anchorX: number, anchorY: number, frame: Size, target: Size, margin: number): ViewState {
  if (zoom === "fit") return { zoom: "fit", panX: 0, panY: 0 };
  const next = clampZoom(zoom);
  // The project point under the anchor, then the pan that puts it there at the new scale.
  const { px, py } = pointAt(view, anchorX, anchorY, frame, target, margin);
  const panX = (target.width / 2 - anchorX) / next + px - frame.width / 2;
  const panY = (target.height / 2 - anchorY) / next + py - frame.height / 2;
  return { zoom: next, ...clampPan(panX, panY, frame) };
}

/** The view panned by (`dx`, `dy`) target px (the picture follows the pointer). Fit does not pan. */
export function panBy(view: ViewState, dx: number, dy: number, frame: Size): ViewState {
  if (view.zoom === "fit") return view;
  return { zoom: view.zoom, ...clampPan(view.panX - dx / view.zoom, view.panY - dy / view.zoom, frame) };
}

const scratch: MutableMat3 = [1, 0, 0, 1, 0, 0];

/** The project point at target point (`x`, `y`): Fit as drawn (its axes scale apart), a zoom unrounded (repeated wheel steps do not drift). */
function pointAt(view: ViewState, x: number, y: number, frame: Size, target: Size, margin: number): { px: number; py: number } {
  if (view.zoom === "fit") {
    const m = frameTransformInto(scratch, "fit", frame, target, margin);
    return { px: (x - m[4]) / m[0], py: (y - m[5]) / m[3] };
  }
  const z = view.zoom;
  return { px: (x - target.width / 2) / z + frame.width / 2 + view.panX, py: (y - target.height / 2) / z + frame.height / 2 + view.panY };
}

/** Writes into `out` the backing-store size of a canvas laid out at `css` px on a `dpr` screen. */
export function deviceSizeInto(out: Size, css: Size, dpr: number): Size {
  out.width = Math.max(1, Math.round(css.width * dpr));
  out.height = Math.max(1, Math.round(css.height * dpr));
  return out;
}

/** Menu text of a zoom: `Fit`, `100%`, `137%` (free wheel zooms read to the percent; below 10% one decimal). */
export function zoomLabel(zoom: PreviewZoom): string {
  if (zoom === "fit") return "Fit";
  const percent = zoom * 100;
  return percent < 10 ? `${(Math.round(percent * 10) / 10).toString()}%` : `${Math.round(percent)}%`;
}
