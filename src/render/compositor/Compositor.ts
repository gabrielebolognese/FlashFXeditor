// The compositor (spec §9.4, §5.1): evaluates the document at a frame into a `Composite`, bottom to
// top. For each visible video track it takes the clip at the frame (binary search, P10) and computes
// what the layer shows: the media frame (source time with speed), one matrix mapping the unit quad
// onto project pixels, opacity with fades, and the crop as a texture rectangle.
// - The matrix composes, applied first to last: the crop rectangle in texture space, the rotation
//   metadata (the texture stays as coded, §9.3), the flips, the display size, then the clip
//   transform (anchor, scale/scaleY, rotation clockwise in degrees, position from the frame center).
// - Crop fractions apply to the media as shown (upright and flipped): `left` always cuts the visible
//   left side.
// - Media time 0 is the first frame: `timeUs` is relative to it, whatever cts the container starts at.
// - Text layers (spec §10.1) carry their text and style and the matrix of their layout box (anchor,
//   scale, rotation, position; flips mirror the text inside its box); the preview draws them from the
//   text raster cache at its render scale. Their detail (raster px per project px they can show) lets
//   a zoom re-rasterize them (§7.1).
// - Gesture-aware (spec P2): during a canvas gesture or a properties field scrub `transforms`,
//   `opacities`, `crops` and `texts` give the clips' ephemeral values, used instead of the document's
//   until it commits.
// Layer structs and arrays are reused between frames; evaluating allocates nothing once warm.
// TODO(batch 32): the caption track's current cue. TODO(batch 34): solid shapes other than rect,
// gradient fills, corner radius. TODO(batch 35): keyframes. TODO(batch 31): text animations.
// TODO(batch 36): transitions (two contributing clips and a mix amount).
import { isRgba } from "../../core/document/color.js";
import { framesToSourceUs, secondsToFrames } from "../../core/document/time.js";
import type { Clip, ClipId, Crop, Frame, MediaClip, MediaId, Project, RGBA, SolidClip, TextClip, TextContent, TextStyle, Transform } from "../../core/document/types.js";
import { clipInIndex, lastClipStartingBy, trackIndex } from "../../timeline/model/queries.js";
import { multiplyInto, mutableIdentity, setMat, type MutableMat3 } from "../mat3.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { textLayout } from "../text/layoutCache.js";
import { TEXT_RASTER_MAX } from "../text/raster.js";
import { MAX_TEXT_SCALE } from "../text/TextRasterCache.js";
import type { Composite, CompositeLayer, MediaLayer, SolidLayer, TextCompositeLayer } from "./drawList.js";

/** How far from the playhead the clips next to it count as cut neighbours (seconds). */
export const NEIGHBOR_SECONDS = 2;

type WritableMediaLayer = Omit<MediaLayer, "transform"> & { transform: MutableMat3 };
type WritableSolidLayer = Omit<SolidLayer, "transform" | "color"> & { transform: MutableMat3; color: RGBA };
type WritableTextLayer = Omit<TextCompositeLayer, "model"> & { model: MutableMat3 };

/** A text clip's ephemeral content and style (a Text field scrub, spec §11, P2). */
export interface LiveText {
  text: TextContent;
  style: TextStyle;
}

/** A frame of a clip next to the playhead (the one a cut would show first). */
export interface NeighborFrame {
  mediaId: MediaId;
  still: boolean;
  timeUs: number;
}

interface WritableComposite extends Composite {
  layers: CompositeLayer[];
}

const DEG = Math.PI / 180;

/** Scratch result of `sinCos` (evaluating runs every playback frame: no allocation). */
const trig = { sin: 0, cos: 1 };

/** Exact sine/cosine for quarter turns, so 90° rotations land on whole pixels. Read the result before the next call. */
function sinCos(degrees: number): Readonly<typeof trig> {
  const turns = ((degrees % 360) + 360) % 360;
  if (turns % 90 === 0) {
    trig.sin = turns === 90 ? 1 : turns === 270 ? -1 : 0;
    trig.cos = turns === 0 ? 1 : turns === 180 ? -1 : 0;
  } else {
    trig.sin = Math.sin(degrees * DEG);
    trig.cos = Math.cos(degrees * DEG);
  }
  return trig;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Opacity factor of the clip's fades at `frame`: 0 on the first frame of a fade-in and the last of a fade-out. */
export function fadeFactor(clip: Pick<MediaClip, "start" | "duration" | "fades">, frame: Frame): number {
  const k = frame - clip.start;
  let factor = 1;
  if (clip.fades.in > 0) factor = Math.min(factor, k / clip.fades.in);
  if (clip.fades.out > 0) factor = Math.min(factor, (clip.duration - 1 - k) / clip.fades.out);
  return clamp01(factor);
}

/** Media time (us, 0 = first frame) a media clip shows at timeline `frame` (§5.1), inside [in, out). */
export function sourceTimeUs(clip: Pick<MediaClip, "start" | "in" | "out" | "speed">, frame: Frame, fps: Project["settings"]["fps"]): number {
  const time = clip.in + framesToSourceUs(frame - clip.start, clip.speed, fps);
  return Math.min(Math.max(clip.in, time), Math.max(clip.in, clip.out - 1));
}

/**
 * The clip transform for content of `width` x `height` local px: anchor (fractions of the content),
 * scale, rotation, then position relative to the center of a `frameWidth` x `frameHeight` frame.
 */
export function writeModel(out: MutableMat3, transform: Transform, width: number, height: number, frameWidth: number, frameHeight: number): MutableMat3 {
  const { sin, cos } = sinCos(transform.rotation);
  const sx = transform.scale;
  const sy = transform.scaleY ?? transform.scale;
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const ax = transform.anchor.x * width;
  const ay = transform.anchor.y * height;
  return setMat(out, a, b, c, d, frameWidth / 2 + transform.x - a * ax - c * ay, frameHeight / 2 + transform.y - b * ax - d * ay);
}

export class Compositor {
  private readonly out: WritableComposite = { width: 0, height: 0, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [] };
  private readonly mediaPool: WritableMediaLayer[] = [];
  private readonly solidPool: WritableSolidLayer[] = [];
  private readonly textPool: WritableTextLayer[] = [];
  private readonly neighborPool: NeighborFrame[] = [];
  private readonly neighborList: NeighborFrame[] = [];
  private readonly step = mutableIdentity();

  /**
   * The document at `frame`, bottom track first, with `transforms` (a canvas gesture's or a field
   * scrub's), `opacities` (a field scrub's), `crops` (a crop handle drag's or a field scrub's) and
   * `texts` (a Text field scrub's) replacing the clips' own. The result and its layers are reused by
   * the next call: read it before evaluating again.
   */
  evaluate(
    doc: Project,
    frame: Frame,
    transforms: ReadonlyMap<ClipId, Transform> | null = null,
    opacities: ReadonlyMap<ClipId, number> | null = null,
    crops: ReadonlyMap<ClipId, Crop> | null = null,
    texts: ReadonlyMap<ClipId, LiveText> | null = null,
  ): Composite {
    const out = this.out;
    const { width, height, background } = doc.settings;
    out.width = width;
    out.height = height;
    out.background = background;
    out.layers.length = 0;
    let media = 0;
    let solids = 0;
    let textLayers = 0;
    for (const track of doc.tracks) {
      // TODO(batch 32): caption tracks draw their cue above the video tracks.
      // Muted and hidden video tracks are not in the composite (spec §6.12).
      if (track.kind !== "video" || track.hidden || track.muted) continue;
      const clip = clipInIndex(trackIndex(doc, track), frame);
      if (!clip?.enabled) continue;
      if (clip.kind === "video" || clip.kind === "image") {
        const layer = (this.mediaPool[media] ??= newMediaLayer());
        if (this.writeMedia(layer, doc, clip, frame, transforms?.get(clip.id) ?? clip.transform, opacities?.get(clip.id) ?? clip.opacity, crops?.get(clip.id) ?? clip.crop)) {
          out.layers.push(layer);
          media += 1;
        }
      } else if (clip.kind === "solid") {
        const layer = (this.solidPool[solids] ??= newSolidLayer());
        if (this.writeSolid(layer, doc, clip, transforms?.get(clip.id) ?? clip.transform, opacities?.get(clip.id) ?? clip.opacity)) {
          out.layers.push(layer);
          solids += 1;
        }
      } else if (clip.kind === "text") {
        const layer = (this.textPool[textLayers] ??= newTextLayer());
        if (this.writeText(layer, doc, clip, frame, transforms?.get(clip.id) ?? clip.transform, opacities?.get(clip.id) ?? clip.opacity, texts?.get(clip.id) ?? clip)) {
          out.layers.push(layer);
          textLayers += 1;
        }
      }
    }
    return out;
  }

  /**
   * The edge frames of the media clips just before and after `frame` on each visible video track
   * (within NEIGHBOR_SECONDS): the frames a scrub across the next cut shows first. Reused like `evaluate`.
   */
  neighbors(doc: Project, frame: Frame): readonly NeighborFrame[] {
    this.neighborList.length = 0;
    const reach = secondsToFrames(NEIGHBOR_SECONDS, doc.settings.fps);
    for (const track of doc.tracks) {
      if (track.kind !== "video" || track.hidden || track.muted) continue;
      const index = trackIndex(doc, track);
      const at = lastClipStartingBy(index, frame);
      const current = index.clips[at];
      const covers = current !== undefined && frame < current.start + current.duration;
      const prev = covers ? index.clips[at - 1] : current;
      const next = index.clips[at + 1];
      if (prev) this.addNeighbor(doc, prev, prev.start + prev.duration - 1, frame, reach);
      if (next) this.addNeighbor(doc, next, next.start, frame, reach);
    }
    return this.neighborList;
  }

  private addNeighbor(doc: Project, clip: Clip, at: Frame, frame: Frame, reach: Frame): void {
    if (!clip.enabled || (clip.kind !== "video" && clip.kind !== "image") || Math.abs(at - frame) > reach) return;
    const list = this.neighborList;
    const neighbor = (this.neighborPool[list.length] ??= { mediaId: "", still: false, timeUs: 0 });
    neighbor.mediaId = clip.mediaId;
    neighbor.still = clip.kind === "image";
    neighbor.timeUs = neighbor.still ? 0 : sourceTimeUs(clip, at, doc.settings.fps);
    list.push(neighbor);
  }

  private writeMedia(layer: WritableMediaLayer, doc: Project, clip: MediaClip, frame: Frame, transform: Transform, opacity: number, shownCrop: Crop): boolean {
    const item = doc.media[clip.mediaId];
    if (!item?.width || !item.height) return false;
    const rotation = item.rotation ?? 0;
    const quarter = rotation === 90 || rotation === 270;
    const shownWidth = quarter ? item.height : item.width;
    const shownHeight = quarter ? item.width : item.height;
    const { flipH, flipV } = transform;

    // The visible part of the shown (upright, flipped) media, then where it lies in the texture.
    const left = clamp01(shownCrop.left);
    const right = 1 - clamp01(shownCrop.right);
    const top = clamp01(shownCrop.top);
    const bottom = 1 - clamp01(shownCrop.bottom);
    if (right <= left || bottom <= top) return false;
    const pl = flipH ? 1 - right : left;
    const ph = flipH ? 1 - left : right;
    const ql = flipV ? 1 - bottom : top;
    const qh = flipV ? 1 - top : bottom;
    const crop = layer.crop;
    switch (rotation) {
      case 90:
        // Upright (p, q) = (1 - t, s).
        crop.u0 = ql;
        crop.u1 = qh;
        crop.v0 = 1 - ph;
        crop.v1 = 1 - pl;
        break;
      case 180:
        crop.u0 = 1 - ph;
        crop.u1 = 1 - pl;
        crop.v0 = 1 - qh;
        crop.v1 = 1 - ql;
        break;
      case 270:
        // Upright (p, q) = (t, 1 - s).
        crop.u0 = 1 - qh;
        crop.u1 = 1 - ql;
        crop.v0 = pl;
        crop.v1 = ph;
        break;
      default:
        crop.u0 = pl;
        crop.u1 = ph;
        crop.v0 = ql;
        crop.v1 = qh;
    }

    // Unit quad -> crop rectangle in texture UV -> upright UV -> flipped -> shown px -> project px.
    const m = setMat(layer.transform, crop.u1 - crop.u0, 0, 0, crop.v1 - crop.v0, crop.u0, crop.v0);
    const step = this.step;
    if (rotation === 90) multiplyInto(m, setMat(step, 0, 1, -1, 0, 1, 0), m);
    else if (rotation === 180) multiplyInto(m, setMat(step, -1, 0, 0, -1, 1, 1), m);
    else if (rotation === 270) multiplyInto(m, setMat(step, 0, -1, 1, 0, 0, 1), m);
    if (flipH || flipV) multiplyInto(m, setMat(step, flipH ? -1 : 1, 0, 0, flipV ? -1 : 1, flipH ? 1 : 0, flipV ? 1 : 0), m);
    multiplyInto(m, setMat(step, shownWidth, 0, 0, shownHeight, 0, 0), m);
    multiplyInto(m, writeModel(step, transform, shownWidth, shownHeight, doc.settings.width, doc.settings.height), m);

    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.mediaId = clip.mediaId;
    layer.still = clip.kind === "image";
    layer.timeUs = layer.still ? 0 : sourceTimeUs(clip, frame, doc.settings.fps);
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    return true;
  }

  private writeText(layer: WritableTextLayer, doc: Project, clip: TextClip, frame: Frame, transform: Transform, opacity: number, shown: LiveText): boolean {
    const layout = textLayout(shown.text, shown.style);
    const raster = layout.raster;
    if (!raster) return false;
    const m = writeModel(layer.model, transform, layout.width, layout.height, doc.settings.width, doc.settings.height);
    // Flips mirror the text inside its box.
    if (transform.flipH || transform.flipV) multiplyInto(m, m, setMat(this.step, transform.flipH ? -1 : 1, 0, 0, transform.flipV ? -1 : 1, transform.flipH ? layout.width : 0, transform.flipV ? layout.height : 0));
    const scale = Math.max(Math.abs(transform.scale), Math.abs(transform.scaleY ?? transform.scale));
    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.text = shown.text;
    layer.style = shown.style;
    layer.scale = scale;
    layer.detail = scale > 0 ? Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height)) / scale : 0;
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    return scale > 0;
  }

  private writeSolid(layer: WritableSolidLayer, doc: Project, clip: SolidClip, transform: Transform, opacity: number): boolean {
    const fill = clip.fill;
    // TODO(batch 34): rounded rects, ellipses, lines and gradient fills.
    if (clip.shape !== "rect" || !isRgba(fill) || clip.size.w <= 0 || clip.size.h <= 0) return false;
    const m = writeModel(layer.transform, transform, clip.size.w, clip.size.h, doc.settings.width, doc.settings.height);
    multiplyInto(m, m, setMat(this.step, clip.size.w, 0, 0, clip.size.h, 0, 0));
    layer.color.r = fill.r;
    layer.color.g = fill.g;
    layer.color.b = fill.b;
    layer.color.a = fill.a;
    layer.opacity = clamp01(opacity);
    return true;
  }
}

function newMediaLayer(): WritableMediaLayer {
  return { kind: "media", trackId: "", clipId: "", mediaId: "", still: false, timeUs: 0, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 } };
}

function newTextLayer(): WritableTextLayer {
  return { kind: "text", trackId: "", clipId: "", model: mutableIdentity(), opacity: 1, text: textContent(""), style: DEFAULT_TEXT_STYLE, scale: 1, detail: 1 };
}

function newSolidLayer(): WritableSolidLayer {
  return { kind: "solid", transform: mutableIdentity(), opacity: 1, color: { r: 0, g: 0, b: 0, a: 1 } };
}

