// Static icon glyphs for the timeline canvases: lucide icons (the DS icon set, ISC license), their
// 24x24 path data copied from lucide-react 1.57 (rects and circles written as paths), stroked like
// the React icons (round caps and joins, stroke 2 at 24 px).
import type { ClipKind, TrackKind } from "../../core/document/types.js";

const ROUNDED_SQUARE = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z";
const LOCK_BODY = "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z";

const PATHS = {
  film: [ROUNDED_SQUARE, "M7 3v18", "M3 7.5h4", "M3 12h18", "M3 16.5h4", "M17 3v18", "M17 7.5h4", "M17 16.5h4"],
  audioLines: ["M2 10v3", "M6 6v11", "M10 3v18", "M14 8v7", "M18 5v13", "M22 10v3"],
  image: [ROUNDED_SQUARE, "M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"],
  type: ["M12 4v16", "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", "M9 20h6"],
  square: [ROUNDED_SQUARE],
  captions: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M7 15h4M15 15h2M7 11h2M13 11h4"],
  plus: ["M5 12h14", "M12 5v14"],
  // Track header toggles (Batch 16): target, lock, hide, height.
  crosshair: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M22 12h-4", "M6 12H2", "M12 6V2", "M12 22v-4"],
  lock: [LOCK_BODY, "M7 11V7a5 5 0 0 1 10 0v4"],
  lockOpen: [LOCK_BODY, "M7 11V7a5 5 0 0 1 9.9-1"],
  eye: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  eyeOff: [
    "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
    "M14.084 14.158a3 3 0 0 1-4.242-4.242",
    "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
    "m2 2 20 20",
  ],
  rows3: [ROUNDED_SQUARE, "M21 9H3", "M21 15H3"],
  // Clip label bar badges (Batch 17): linked, has keyframes; a freeze frame (Batch 27); a missing font (Batch 28).
  triangleAlert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  diamond: ["M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"],
  snowflake: [
    "m10 20-1.25-2.5L6 18",
    "M10 4 8.75 6.5 6 6",
    "m14 20 1.25-2.5L18 18",
    "m14 4 1.25 2.5L18 6",
    "m17 21-3-6h-4",
    "m17 3-3 6 1.5 3",
    "M2 12h6.5L10 9",
    "m20 10-1.5 2 1.5 2",
    "M22 12h-6.5L14 15",
    "m4 10 1.5 2L4 14",
    "m7 21 3-6-1.5-3",
    "m7 3 3 6h4",
  ],
} as const;

export type GlyphName = keyof typeof PATHS;

export const CLIP_GLYPHS: Record<ClipKind, GlyphName> = { video: "film", audio: "audioLines", image: "image", text: "type", solid: "square", caption: "captions" };
export const TRACK_GLYPHS: Record<TrackKind, GlyphName> = { video: "film", audio: "audioLines", caption: "captions" };

const VIEWBOX = 24;
const STROKE = 2;

let cache: Map<GlyphName, Path2D[]> | null = null;

function paths(name: GlyphName): Path2D[] {
  cache ??= new Map();
  let list = cache.get(name);
  if (!list) {
    list = PATHS[name].map((d) => new Path2D(d));
    cache.set(name, list);
  }
  return list;
}

/** Strokes a glyph `size` CSS px square with its top-left at (x, y). */
export function drawGlyph(ctx: CanvasRenderingContext2D, name: GlyphName, x: number, y: number, size: number, color: string): void {
  const scale = size / VIEWBOX;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const path of paths(name)) ctx.stroke(path);
  ctx.restore();
}
