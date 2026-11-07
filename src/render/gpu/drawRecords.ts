// The CPU side of a draw (spec §9.4), shared by the WebGPU and WebGL2 backends (Batch 48) so both draw
// the same quads: the panes of a draw become pooled records, one per quad, each with its pipeline kind,
// its uniforms (the layer matrix already mapped to target px by its pane's viewport), its textures and
// its scissor (the frame within its pane for the background and the layers, the pane for the border).
// Records are rewritten every draw: no allocation once warm.
// A shaped solid (a box with rounded corners or an ellipse, Batch 34) has its quad grown by one target
// px on each side, its UV past 0..1 with it, so the shader's anti-aliased edge is drawn whole.
// A textured layer with a blur (a text's blurIn, spec §10.4) is blurred by the backend in two passes
// into a pooled texture; `blurRegionInto` says what to read and `showBlurred` points the record at it.
import type { RGBA } from "../../core/document/types.js";
import type { DrawList, Layer, SolidLayer, UvRect } from "../compositor/drawList.js";
import { invertInto, multiplyInto, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import { boxPerimeter } from "../../core/document/fill.js";
import { newStyleUniform, resetStyleUniform, SHAPE_CODE, type LayerUniform } from "./layerUniforms.js";
import type { Pane, TextureHandle, Viewport } from "./renderer.js";

export type RecordKind = "textured" | "dissolve" | "solid";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One quad of a draw. */
export interface DrawRecord<T extends TextureHandle> {
  kind: RecordKind;
  uniform: Omit<LayerUniform, "transform" | "mapA" | "mapB"> & { transform: MutableMat3; mapA: MutableMat3; mapB: MutableMat3 };
  /** None for solids, one for textured layers, two for dissolves. */
  texture0: T | null;
  texture1: T | null;
  /** Gaussian sigma in texture px (textured layers; 0: none). */
  blur: number;
  /** Target px it is clipped to: the frame within its pane (document layers), or the pane (the border). */
  scissor: Rect;
}

/** Largest blur (Gaussian sigma, texture px): the kernel reaches 3 sigma (spec §10.4 "cap the blur radius"). */
export const MAX_BLUR_SIGMA = 16;
/** Target px a shaped solid's quad grows by on each side: its anti-aliased edge reaches half a px out. */
const SHAPE_MARGIN = 1;
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

function newRecord<T extends TextureHandle>(): DrawRecord<T> {
  return {
    kind: "solid",
    uniform: {
      transform: mutableIdentity(),
      uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
      color: { r: 0, g: 0, b: 0, a: 0 },
      to: { r: 0, g: 0, b: 0, a: 0 },
      shape: { width: 0, height: 0, radius: 0, code: SHAPE_CODE.quad },
      radii: new Float32Array(4),
      style: newStyleUniform(),
      opacity: 1,
      flipX: false,
      flipY: false,
      mix: 0,
      uv2: { u0: 0, v0: 0, u1: 1, v1: 1 },
      mapA: mutableIdentity(),
      mapB: mutableIdentity(),
      sides: { from: 1, to: 1 },
    },
    texture0: null,
    texture1: null,
    blur: 0,
    scissor: { x: 0, y: 0, width: 0, height: 0 },
  };
}

export class DrawRecords<T extends TextureHandle> {
  /** The records; the first `count` belong to the last `build`. */
  readonly pool: DrawRecord<T>[] = [];
  count = 0;
  private readonly inverse = mutableIdentity();
  private readonly frameBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private readonly frameScissor: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private readonly paneScissor: Rect = { x: 0, y: 0, width: 0, height: 0 };

  /** `usable`: a texture of this backend that is still alive (layers with any other are skipped). */
  constructor(private readonly usable: (texture: TextureHandle) => texture is T) {}

  /** The record at `index` (below `count`). */
  at(index: number): DrawRecord<T> {
    return this.pool[index] as DrawRecord<T>;
  }

  /**
   * Builds the records of `panes` drawn into a `width` x `height` target and returns how many. A pane
   * with no frame or a singular viewport adds nothing; its bounds still clip.
   */
  build(panes: readonly Pane[], width: number, height: number): number {
    this.count = 0;
    for (const pane of panes) {
      const { list, viewport } = pane;
      const bounds = clipRect(this.paneScissor, pane.bounds, width, height);
      if (!bounds || list.width < 1 || list.height < 1 || !invertInto(this.inverse, viewport.transform)) continue;
      const frame = frameRect(this.frameBox, viewport.transform, list.width, list.height);
      const frameScissor = clipRect(this.frameScissor, frame, bounds.x + bounds.width, bounds.y + bounds.height, bounds.x, bounds.y);
      this.paneRecords(list, viewport, frame, frameScissor, bounds);
    }
    return this.count;
  }

  /**
   * The records of one pane: the frame background and the layers (clipped to the frame within the
   * pane: `frameScissor`, none when the frame is out of view), then the border around the frame
   * (clipped to the pane). Matrices map to target px.
   */
  private paneRecords(list: DrawList, view: Viewport, frame: Rect, frameScissor: Rect | null, paneScissor: Rect): void {
    if (frameScissor) {
      const background = this.solidRecord(list.background, frameScissor).uniform.transform;
      multiplyInto(background, view.transform, setMat(background, list.width, 0, 0, list.height, 0, 0));
      for (const layer of list.layers) this.layerRecord(layer, view.transform, frameScissor);
    }
    const border = view.border;
    if (border && border.width > 0 && border.color.a > 0) {
      const w = border.width;
      this.edgeRecord(border.color, frame.x - w, frame.y - w, frame.width + 2 * w, w, paneScissor);
      this.edgeRecord(border.color, frame.x - w, frame.y + frame.height, frame.width + 2 * w, w, paneScissor);
      this.edgeRecord(border.color, frame.x - w, frame.y, w, frame.height, paneScissor);
      this.edgeRecord(border.color, frame.x + frame.width, frame.y, w, frame.height, paneScissor);
    }
  }

  private nextRecord(kind: RecordKind, scissor: Rect): DrawRecord<T> {
    const record = (this.pool[this.count] ??= newRecord<T>());
    this.count += 1;
    record.kind = kind;
    setRect(record.scissor, scissor.x, scissor.y, scissor.width, scissor.height);
    record.texture0 = null;
    record.texture1 = null;
    record.blur = 0;
    const u = record.uniform;
    u.opacity = 1;
    u.flipX = false;
    u.flipY = false;
    u.mix = 0;
    setUv(u.uv, 0, 0, 1, 1);
    setColor(u.color, TRANSPARENT);
    setColor(u.to, TRANSPARENT);
    u.shape.code = SHAPE_CODE.quad;
    u.radii.fill(0);
    resetStyleUniform(u.style);
    return record;
  }

  /** A flat color quad. */
  private solidRecord(color: RGBA, scissor: Rect): DrawRecord<T> {
    const record = this.nextRecord("solid", scissor);
    setColor(record.uniform.color, color);
    setColor(record.uniform.to, color);
    return record;
  }

  /** A solid around the frame: a target-px rectangle. */
  private edgeRecord(color: RGBA, x: number, y: number, width: number, height: number, scissor: Rect): void {
    setMat(this.solidRecord(color, scissor).uniform.transform, width, 0, 0, height, x, y);
  }

  /** Adds the record of a document layer (its matrix mapped to target px by `view`); layers with a missing or dead texture are skipped. */
  private layerRecord(layer: Layer, view: Mat3, scissor: Rect): void {
    switch (layer.kind) {
      case "texture": {
        if (!this.usable(layer.texture)) return;
        const record = this.nextRecord("textured", scissor);
        record.texture0 = layer.texture;
        record.blur = layer.blur ?? 0;
        copyLayer(record, view, layer.transform, layer.opacity);
        setUv(record.uniform.uv, layer.crop.u0, layer.crop.v0, layer.crop.u1, layer.crop.v1);
        record.uniform.flipX = layer.flipX;
        record.uniform.flipY = layer.flipY;
        const frame = layer.shape;
        if (frame && frame.width > 0 && frame.height > 0) {
          const u = record.uniform;
          u.shape.width = frame.width;
          u.shape.height = frame.height;
          u.shape.code = SHAPE_CODE.box;
          for (let i = 0; i < 4; i++) u.radii[i] = frame.radii[i] as number;
        }
        return;
      }
      case "dissolve": {
        const { from, to } = layer;
        if (!this.usable(from.texture) || !this.usable(to.texture)) return;
        // A picture whose quad covers nothing draws nothing.
        if (!covers(from.transform) || !covers(to.transform)) return;
        const record = this.nextRecord("dissolve", scissor);
        const u = record.uniform;
        // Each picture's quad as seen from the layer's: the layer's unit quad onto the picture's (no view: both are in project px).
        sideMap(u.mapA, from.transform, layer.transform);
        sideMap(u.mapB, to.transform, layer.transform);
        record.texture0 = from.texture;
        record.texture1 = to.texture;
        copyLayer(record, view, layer.transform, layer.opacity);
        setUv(u.uv, from.crop.u0, from.crop.v0, from.crop.u1, from.crop.v1);
        setUv(u.uv2, to.crop.u0, to.crop.v0, to.crop.u1, to.crop.v1);
        u.sides.from = from.opacity;
        u.sides.to = to.opacity;
        u.mix = layer.mix;
        return;
      }
      case "solid": {
        const record = this.solidRecord(layer.color, scissor);
        copyLayer(record, view, layer.transform, layer.opacity);
        const u = record.uniform;
        if (layer.to) setColor(u.to, layer.to);
        const shape = layer.shape;
        if (shape && shape.width > 0 && shape.height > 0) {
          u.shape.width = shape.width;
          u.shape.height = shape.height;
          u.shape.radius = shape.radius;
          u.shape.code = shape.kind === "ellipse" ? SHAPE_CODE.ellipse : SHAPE_CODE.box;
          for (let i = 0; i < 4; i++) u.radii[i] = shape.radii ? (shape.radii[i] as number) : shape.radius;
          const style = layer.style;
          const reach = style ? writeStyle(u.style, style, u.radii, shape) : 0;
          // The quad grows by the edge's half px, and by what the stroke and the shadow reach past the shape (layer px -> target px).
          const scale = Math.hypot(u.transform[0], u.transform[1]) / shape.width;
          growQuad(u.transform, u.uv, SHAPE_MARGIN + reach * scale);
        }
        return;
      }
    }
  }
}

/** What a blurred record's two passes read and write (texture px). */
export interface BlurRegion {
  /** The source region: the record's crop in its texture. */
  x: number;
  y: number;
  width: number;
  height: number;
  sigma: number;
  /** Px the blur spreads past the region on each side (3 sigma). */
  reach: number;
}

/** The blur of `record` (a textured record with a blur and a source of some area) into `out`; null when it has none. */
export function blurRegionInto(out: BlurRegion, record: DrawRecord<TextureHandle>): BlurRegion | null {
  const source = record.texture0;
  if (record.kind !== "textured" || record.blur < 0.05 || !source) return null;
  const sigma = Math.min(MAX_BLUR_SIGMA, record.blur);
  const uv = record.uniform.uv;
  const x0 = Math.round(Math.min(uv.u0, uv.u1) * source.width);
  const x1 = Math.round(Math.max(uv.u0, uv.u1) * source.width);
  const y0 = Math.round(Math.min(uv.v0, uv.v1) * source.height);
  const y1 = Math.round(Math.max(uv.v0, uv.v1) * source.height);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.sigma = sigma;
  out.reach = Math.ceil(3 * sigma);
  return out;
}

/**
 * Points `record` at `blurred`, which holds its region blurred with the reach on each side from its
 * top-left: the quad grows by the reach on each side and shows that part. `scratch` is any matrix.
 */
export function showBlurred<T extends TextureHandle>(record: DrawRecord<T>, region: BlurRegion, blurred: T, scratch: MutableMat3): void {
  const { width, height, reach } = region;
  const gx = reach / width;
  const gy = reach / height;
  const m = record.uniform.transform;
  multiplyInto(m, m, setMat(scratch, 1 + 2 * gx, 0, 0, 1 + 2 * gy, -gx, -gy));
  setUv(record.uniform.uv, 0, 0, (width + 2 * reach) / blurred.width, (height + 2 * reach) / blurred.height);
  record.texture0 = blurred;
}

/** Grows the unit quad of `m` (unit quad -> target px) by `margin` target px on each side, the UV past 0..1 with it. */
export function growQuad(m: MutableMat3, uv: UvRect, margin: number): void {
  const width = Math.hypot(m[0], m[1]);
  const height = Math.hypot(m[2], m[3]);
  if (!(width > 1e-6) || !(height > 1e-6)) return;
  const ex = margin / width;
  const ey = margin / height;
  // m * [1 + 2ex, 0; 0, 1 + 2ey] with the quad moved by (-ex, -ey).
  m[4] -= m[0] * ex + m[2] * ey;
  m[5] -= m[1] * ex + m[3] * ey;
  m[0] *= 1 + 2 * ex;
  m[1] *= 1 + 2 * ex;
  m[2] *= 1 + 2 * ey;
  m[3] *= 1 + 2 * ey;
  setUv(uv, -ex, -ey, 1 + ex, 1 + ey);
}

/** A quad with an area (an inverse). */
const covers = (m: Mat3) => {
  const det = m[0] * m[3] - m[1] * m[2];
  return det !== 0 && Number.isFinite(det);
};

/** `out` = inverse(`side`) x `quad`: where a point of the unit quad drawn by `quad` lies on the unit quad of `side` (which `covers`). */
function sideMap(out: MutableMat3, side: Mat3, quad: Mat3): void {
  if (invertInto(out, side)) multiplyInto(out, out, quad);
}

/** The layer's matrix in target px (`view * transform`) and its opacity. */
function copyLayer<T extends TextureHandle>(record: DrawRecord<T>, view: Mat3, transform: Mat3, opacity: number): void {
  multiplyInto(record.uniform.transform, view, transform);
  record.uniform.opacity = opacity;
}

export function setRect(out: Rect, x: number, y: number, width: number, height: number): Rect {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  return out;
}

function setUv(uv: UvRect, u0: number, v0: number, u1: number, v1: number): void {
  uv.u0 = u0;
  uv.v0 = v0;
  uv.u1 = u1;
  uv.v1 = v1;
}

function setColor(out: RGBA, color: RGBA): void {
  out.r = color.r;
  out.g = color.g;
  out.b = color.b;
  out.a = color.a;
}

/** The frame (0, 0, width, height in project px) in target px (the viewport is axis-aligned), into `out`. */
function frameRect(out: Rect, transform: Mat3, width: number, height: number): Rect {
  const ax = transform[4];
  const ay = transform[5];
  const bx = transform[0] * width + transform[2] * height + ax;
  const by = transform[1] * width + transform[3] * height + ay;
  out.x = Math.min(ax, bx);
  out.y = Math.min(ay, by);
  out.width = Math.abs(bx - ax);
  out.height = Math.abs(by - ay);
  return out;
}

/** The integer scissor of `rect` inside (left, top)..(right, bottom), into `out`; null when nothing of it is visible. */
function clipRect(out: Rect, rect: Rect, right: number, bottom: number, left = 0, top = 0): Rect | null {
  const x0 = Math.max(left, Math.floor(rect.x));
  const y0 = Math.max(top, Math.floor(rect.y));
  const x1 = Math.min(right, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(bottom, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
  return out;
}

/** `color` (straight alpha) premultiplied, into `out` (a pass's clear color). */
export function premultipliedInto(out: { r: number; g: number; b: number; a: number }, color: RGBA): void {
  out.r = color.r * color.a;
  out.g = color.g * color.a;
  out.b = color.b * color.a;
  out.a = color.a;
}

/**
 * Writes `style` into `out` (the uniform of a shaped solid) and returns how far, in layer px, the
 * stroke and the shadow reach past the shape's edge (the quad grows by it).
 */
function writeStyle(out: LayerUniform["style"], style: NonNullable<SolidLayer["style"]>, radii: Float32Array, shape: NonNullable<SolidLayer["shape"]>): number {
  let reach = 0;
  const g = style.gradient;
  if (g) {
    out.fillKind = g.type === "radial" ? 2 : 1;
    out.fillAngle = (g.angle * Math.PI) / 180;
    out.fillRadius = g.radius;
    out.fillCx = g.center.x;
    out.fillCy = g.center.y;
    const count = Math.min(8, g.stops.length);
    out.stopCount = count;
    for (let i = 0; i < count; i++) {
      const stop = g.stops[i] as (typeof g.stops)[number];
      out.stopAt[i] = stop.at;
      out.stopColor[4 * i] = stop.color.r;
      out.stopColor[4 * i + 1] = stop.color.g;
      out.stopColor[4 * i + 2] = stop.color.b;
      out.stopColor[4 * i + 3] = stop.color.a;
    }
  }
  const stroke = style.stroke;
  const w = shape.width;
  const h = shape.height;
  out.perimeter = shape.kind === "ellipse" ? ellipsePerimeter(w / 2, h / 2) : boxPerimeter(w, h, [radii[0] as number, radii[1] as number, radii[2] as number, radii[3] as number]);
  if (stroke && stroke.width > 0 && stroke.color.a > 0) {
    out.strokeWidth = stroke.width;
    out.strokeAlign = stroke.align === "inside" ? -1 : stroke.align === "outside" ? 1 : 0;
    setColor(out.strokeColor, stroke.color);
    reach = Math.max(reach, stroke.align === "inside" ? 0 : stroke.align === "outside" ? stroke.width : stroke.width / 2);
    const dash = stroke.dash;
    if (dash && dash.length > 0) {
      // An odd list repeats (as canvas does); at most 4 entries are drawn.
      const list = dash.length % 2 === 1 ? [...dash, ...dash] : dash;
      let period = 0;
      for (let i = 0; i < 4; i++) {
        const v = Math.max(0, list[i] ?? 0);
        out.dash[i] = v;
        period += v;
      }
      if (period > 0) {
        // Evenly around the outline: a whole number of periods.
        out.dashScale = out.perimeter / (Math.max(1, Math.round(out.perimeter / period)) * period);
        out.dashOffset = (stroke.dashOffset ?? 0) * out.dashScale;
      }
    }
  }
  const shadow = style.shadow;
  if (shadow && shadow.color.a > 0) {
    setColor(out.shadowColor, shadow.color);
    out.shadowX = shadow.x;
    out.shadowY = shadow.y;
    out.shadowBlur = Math.max(0, shadow.blur);
    out.shadowSpread = shadow.spread;
    reach = Math.max(reach, Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) * Math.SQRT2 + Math.max(0, shadow.spread) + 1.5 * Math.max(0, shadow.blur) + 1);
  }
  out.part = style.part === "shadow" ? 1 : style.part === "stroke" ? 2 : 0;
  return reach;
}

/** Ramanujan's approximation of an ellipse's perimeter (semi-axes a and b). */
function ellipsePerimeter(a: number, b: number): number {
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b) || 1);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}
