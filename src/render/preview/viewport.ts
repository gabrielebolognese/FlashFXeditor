// Preview viewport math (spec §7.1): where the project frame sits on the canvas. Fit letterboxes the
// frame inside the panel with a margin; a numeric zoom is project px per device px (100% = 1:1 pixels)
// and keeps the frame centered. All sizes here are device px except the frame (project px).
// TODO(batch 21): pan, wheel zoom anchored at the cursor, Mod+0/1/2.
import { setMat, type MutableMat3 } from "../mat3.js";

export type PreviewZoom = number | "fit";

export interface Size {
  width: number;
  height: number;
}

/** The zoom choices of the preview header (§7.1), Fit first. */
export const ZOOM_CHOICES: readonly PreviewZoom[] = ["fit", 0.25, 0.5, 1, 2, 4];

/** Writes into `out` project px -> target px with the frame centered at `zoom`. Fit edges land on whole device pixels. */
export function frameTransformInto(out: MutableMat3, zoom: PreviewZoom, frame: Size, target: Size, margin: number): MutableMat3 {
  if (frame.width <= 0 || frame.height <= 0) return setMat(out, 1, 0, 0, 1, 0, 0);
  let width: number;
  let height: number;
  if (zoom === "fit") {
    // A panel too small for the margin uses it all.
    const room = target.width > 2 * margin && target.height > 2 * margin ? margin : 0;
    const scale = Math.min((target.width - 2 * room) / frame.width, (target.height - 2 * room) / frame.height);
    width = Math.max(1, Math.round(frame.width * scale));
    height = Math.max(1, Math.round(frame.height * scale));
  } else {
    width = frame.width * zoom;
    height = frame.height * zoom;
  }
  const x = Math.round((target.width - width) / 2);
  const y = Math.round((target.height - height) / 2);
  return setMat(out, width / frame.width, 0, 0, height / frame.height, x, y);
}

/** Writes into `out` the backing-store size of a canvas laid out at `css` px on a `dpr` screen. */
export function deviceSizeInto(out: Size, css: Size, dpr: number): Size {
  out.width = Math.max(1, Math.round(css.width * dpr));
  out.height = Math.max(1, Math.round(css.height * dpr));
  return out;
}

export function zoomLabel(zoom: PreviewZoom): string {
  return zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`;
}
