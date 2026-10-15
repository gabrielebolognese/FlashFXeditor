// The layers on the preview canvas at a frame (spec §7.2): what canvas selection, hover and the gizmo
// act on. Framework-free and pure.
// - Video tracks bottom to top (§6.12: video z-order follows track order); on each, the enabled clip
//   at the frame that has a content box (`layerContent`: what the compositor draws it from). Hidden
//   and locked tracks are skipped (§6.12: hidden video is not selectable on the canvas, locked tracks
//   take no edits and no selection); muted ones stay: out of the composite but still editable (§6.12).
// - The picture layers (`pictureLayersAt`) are what the compositor draws instead: hidden and muted
//   tracks skipped, locked ones kept. They are the smart guides' other layers (§7.4 "other visible
//   layers at the playhead"): a locked background or logo is still an alignment reference.
// - Each layer's quad is its visible box after crop and transform, in project px from the frame's
//   top-left (`layerCorners`), with a gesture's ephemeral transform when one is given.
// - Hit testing goes top layer first (§7.2); a marquee takes the layers whose quad intersects it.
import type { ClipId, Frame, Project, Track, TrackId, Transform } from "../../core/document/types.js";
import { clipInIndex, trackIndex } from "../../timeline/model/queries.js";
import { isLayerClip, layerContent, layerCorners, type ContentBox, type Point } from "../../timeline/edit/transform.js";

export type Quad = readonly [Point, Point, Point, Point];

export interface CanvasLayer {
  clipId: ClipId;
  trackId: TrackId;
  /** The transform in effect: a gesture's, else the document's. */
  transform: Transform;
  box: ContentBox;
  /** Visible box corners: content top-left, top-right, bottom-right, bottom-left. */
  quad: Quad;
}

/** Axis-aligned rectangle in project px. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The canvas layers of `project` at `frame`, bottom first: what selection and the gizmo act on. */
export function canvasLayersAt(project: Project, frame: Frame, transforms: ReadonlyMap<ClipId, Transform> | null = null): CanvasLayer[] {
  return layersAt(project, frame, transforms, (track) => !track.hidden && !track.locked);
}

/** The layers in the picture at `frame`, bottom first: the compositor's tracks (locked included, §6.12). */
export function pictureLayersAt(project: Project, frame: Frame, transforms: ReadonlyMap<ClipId, Transform> | null = null): CanvasLayer[] {
  return layersAt(project, frame, transforms, (track) => !track.hidden && !track.muted);
}

function layersAt(project: Project, frame: Frame, transforms: ReadonlyMap<ClipId, Transform> | null, include: (track: Track) => boolean): CanvasLayer[] {
  const layers: CanvasLayer[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "video" || !include(track)) continue;
    const clip = clipInIndex(trackIndex(project, track), frame);
    if (!clip?.enabled || !isLayerClip(clip)) continue;
    const box = layerContent(project, clip);
    if (!box) continue;
    const transform = transforms?.get(clip.id) ?? clip.transform;
    layers.push({ clipId: clip.id, trackId: track.id, transform, box, quad: layerCorners(transform, box, project.settings) });
  }
  return layers;
}

const cross = (a: Point, b: Point, x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);

/** Whether (x, y) lies inside or on the edge of the convex quad. */
export function pointInQuad(quad: Quad, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(quad[i] as Point, quad[(i + 1) % 4] as Point, x, y);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The layers under (x, y), top first (Alt+click cycles through them, §7.2). */
export function layersUnder(layers: readonly CanvasLayer[], x: number, y: number): CanvasLayer[] {
  const hits: CanvasLayer[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as CanvasLayer;
    if (pointInQuad(layer.quad, x, y)) hits.push(layer);
  }
  return hits;
}

/** The extent of `points` on the axis (`ax`, `ay`). */
function project1(points: readonly Point[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Whether the convex quad and the rectangle overlap (separating axes: the rectangle's two, the quad's edge normals). */
export function quadIntersectsRect(quad: Quad, rect: Rect): boolean {
  const corners: Point[] = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ];
  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    if (a.x !== b.x || a.y !== b.y) axes.push([a.y - b.y, b.x - a.x]);
  }
  for (const [ax, ay] of axes) {
    const [q0, q1] = project1(quad, ax, ay);
    const [r0, r1] = project1(corners, ax, ay);
    if (q1 < r0 || r1 < q0) return false;
  }
  return true;
}

/** Marquee selection (§7.2): the layers intersecting `rect`, bottom first. */
export function layersInRect(layers: readonly CanvasLayer[], rect: Rect): CanvasLayer[] {
  const box = { x0: Math.min(rect.x0, rect.x1), y0: Math.min(rect.y0, rect.y1), x1: Math.max(rect.x0, rect.x1), y1: Math.max(rect.y0, rect.y1) };
  return layers.filter((layer) => quadIntersectsRect(layer.quad, box));
}

/** The axis-aligned bounds of the quads (the group box of a multi-selection, §7.3). */
export function quadsBounds(quads: readonly Quad[]): Rect | null {
  if (quads.length === 0) return null;
  const rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const quad of quads) {
    for (const p of quad) {
      rect.x0 = Math.min(rect.x0, p.x);
      rect.y0 = Math.min(rect.y0, p.y);
      rect.x1 = Math.max(rect.x1, p.x);
      rect.y1 = Math.max(rect.y1, p.y);
    }
  }
  return rect;
}
