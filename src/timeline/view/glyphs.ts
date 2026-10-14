// Static icon glyphs for the timeline canvases: lucide icons (the DS icon set, ISC license), their
// 24x24 path data copied from lucide-react 1.57 (rects and circles written as paths), stroked like
// the React icons (round caps and joins, stroke 2 at 24 px).
import type { ClipKind, TrackKind } from "../../core/document/types.js";

const ROUNDED_SQUARE = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z";

const PATHS = {
  film: [ROUNDED_SQUARE, "M7 3v18", "M3 7.5h4", "M3 12h18", "M3 16.5h4", "M17 3v18", "M17 7.5h4", "M17 16.5h4"],
  audioLines: ["M2 10v3", "M6 6v11", "M10 3v18", "M14 8v7", "M18 5v13", "M22 10v3"],
  image: [ROUNDED_SQUARE, "M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"],
  type: ["M12 4v16", "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", "M9 20h6"],
  square: [ROUNDED_SQUARE],
  captions: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M7 15h4M15 15h2M7 11h2M13 11h4"],
  plus: ["M5 12h14", "M12 5v14"],
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
