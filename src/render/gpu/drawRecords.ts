// The CPU side of a draw (spec §9.4), shared by the WebGPU and WebGL2 backends (Batch 48) so both draw
// the same quads: the panes of a draw become pooled records, one per quad, each with its pipeline kind,
// its uniforms (the layer matrix already mapped to target px by its pane's viewport), its textures and
// its scissor (the frame within its pane for the background and the layers, the pane for the border).
// Records are rewritten every draw: no allocation once warm.
// A shaped solid (a box with rounded corners or an ellipse, Batch 34) has its quad grown by one target
// px on each side, its UV past 0..1 with it, so the shader's anti-aliased edge is drawn whole.
// A textured layer with a blur (a text's blurIn, spec §10.4) is blurred by the backend in two passes
// into a pooled texture; `blurRegionInto` says what to read and `showBlurred` points the record at it.
// A vector shape (spec §21.12, Batch 65) is a "path" record: the backend draws its draws (stencil, then
// cover) into a multisampled scratch over `pathRegionInto`, resolves it into a pooled texture and
// `showPath` turns the record into a textured quad of that texture (the shape's group opacity).
// A 2.5D layer (spec §21.15, Batch 70) carries a homography after its matrix: its record's matrix is
// projective (`wRow` holds the bottom row) and the vertex stages output w, so the GPU interpolates UVs
// perspective-correctly. Every step that grows or moves a quad multiplies the whole projective matrix.
// A clip with effects (spec §21.19, Batch 74) is an effect stage: its layers become "stage" records drawn in
// its content box (content px times the stage scale, padded by the effects' reach, without its projection
// and with its opacity divided out) into the stage's picture; the backend runs the effect passes
// (render/effects/effectPlan.ts) and `showEffect` turns the stage's "effect" record into a textured quad of
// the result, laid out by the clip's model and projection and drawn with its opacity. Each stage has a
// signature of what it draws: while it stays the same the backend keeps its last result (P6).
// An adjustment clip (spec §21.20, Batch 76) is an "adjust" record over its pane's frame (role target only):
// the backend copies the target drawn so far, runs the clip's effect passes over that copy (a target-sized
// stage in target px, the frame its box: `AdjustInfo`) and draws the result over the frame mixed with the
// copy by the clip's opacity times its masks' coverage (mask map in the style's stop colors, MASK_MAP.mask).
// Never cached: what is below changes from frame to frame.
import type { GradientFill, RGBA } from "../../core/document/types.js";
import type { ClipId } from "../../core/document/types.js";
import type { AdjustLayer, DrawList, EffectFrame, GroupLayer, Layer, MaskFrame, PathDraw, PathLayer, SolidLayer, UvRect } from "../compositor/drawList.js";
import { stackReach } from "../effects/registry.js";
import { blendCode, isHardwareBlend } from "../../core/effects/blendModes.js";
import { matteCode } from "../../core/effects/trackMatte.js";
import { invertInto, multiplyInto, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import { boxPerimeter } from "../../core/document/fill.js";
import { LAYER_STRIDE, newStyleUniform, packLayer, resetStyleUniform, SHAPE_CODE, type LayerUniform, type WRow } from "./layerUniforms.js";
import { affineTimesHomography, homographyTimesAffine, newHomography, type Homography } from "../projection.js";
import type { Pane, TextureHandle, Viewport } from "./renderer.js";

export type RecordKind = "textured" | "dissolve" | "solid" | "path" | "composite" | "effect" | "adjust";
/** The kinds drawn with the layer pipelines ("path" records become "textured" before the passes; "composite" and "adjust" have their own). */
export type QuadKind = Exclude<RecordKind, "path" | "composite" | "effect" | "adjust">;

/** Where a record draws: the target (0), or a group's picture (spec §21.17): its layers (1) or its matte (2). */
export const ROLE = { target: 0, layers: 1, matte: 2, stage: 3 } as const;

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
  /** A "path" record's shape (its uniform's matrix maps view-box px to target px). */
  path: PathLayer | null;
  /**
   * Blend modes and track mattes (spec §21.17, Batch 72): the group (1, 2, ...) whose picture the record
   * draws into with `role` layers or matte, or 0 with role target. A "composite" record (role target)
   * draws group `group`'s picture over the target: its uniform's `fx.code` is the blend code, `fx.dx` the
   * matte code, its quad the frame.
   */
  group: number;
  role: number;
  /**
   * Effects (spec §21.19, Batch 74): the stage (1, 2, ...) a record with role stage draws into, or the stage
   * an "effect" record shows; 0 otherwise.
   */
  stage: number;
}

/**
 * An effect stage of a build (spec §21.19, Batch 74): the clip's picture in its content box, `width` x
 * `height` stage px (`scale` stage px per content px; the content box spans `rect` in it), its masks
 * (applied first) and its packed effects. `numbers` and `refs` (the first `numberCount` / `refCount`) are
 * its signature: what its records draw, in stage px, with their textures and shapes.
 */
export interface StageInfo {
  clipId: ClipId;
  width: number;
  height: number;
  scale: number;
  rect: [number, number, number, number];
  effects: EffectFrame;
  mask: MaskFrame | null;
  numbers: Float64Array;
  numberCount: number;
  refs: unknown[];
  refCount: number;
}

/**
 * An adjustment of a build (spec §21.20, Batch 76): a stage the size of the target (`width` x `height`, target
 * px), the pane's frame spanning `rect` in it, `scale` target px per project px, and the clip's packed effects.
 */
export interface AdjustInfo {
  clipId: ClipId;
  width: number;
  height: number;
  scale: number;
  rect: [number, number, number, number];
  effects: EffectFrame;
  mask: MaskFrame | null;
}

/** What a stage's cached result is kept by (StageInfo's signature, or a copy of it). */
export type StageSignature = Pick<StageInfo, "numbers" | "numberCount" | "refs" | "refCount">;

/** The largest side of a stage picture (stage px): a larger one is drawn at a lower scale. */
export const MAX_STAGE_SIZE = 4096;
/** Stage px the effects of a stage may pad it by on each side at most. */
const MAX_STAGE_REACH = 1024;
/** Stage px per content px: the scale shown, in quarter octaves (a slowly growing clip keeps its stage), within these. */
const MIN_STAGE_SCALE = 1 / 16;
const MAX_STAGE_SCALE = 4;

/** The stage scale for a clip shown at `shown` target px per content px. */
export function stageScale(shown: number): number {
  if (!(shown > 0) || !Number.isFinite(shown)) return 1;
  const quantized = 2 ** (Math.ceil(Math.log2(shown) * 4 - 1e-6) / 4);
  return Math.min(MAX_STAGE_SCALE, Math.max(MIN_STAGE_SCALE, quantized));
}

/** Whether two stage signatures are the same (numbers within a rounding tolerance, references identical). */
export function sameSignature(a: StageSignature, b: StageSignature): boolean {
  if (a.numberCount !== b.numberCount || a.refCount !== b.refCount) return false;
  for (let i = 0; i < a.refCount; i++) if (a.refs[i] !== b.refs[i]) return false;
  for (let i = 0; i < a.numberCount; i++) {
    const x = a.numbers[i] as number;
    const y = b.numbers[i] as number;
    if (x !== y && !(Math.abs(x - y) <= 1e-4 * Math.max(1, Math.abs(x)))) return false;
  }
  return true;
}

/** An empty signature (a cache entry's). */
export function newSignature(): StageSignature {
  return { numbers: new Float64Array(256), numberCount: 0, refs: [], refCount: 0 };
}

/** Copies the signature `from` into `to` (growing its buffer when needed). */
export function copySignature(to: StageSignature, from: StageSignature): void {
  if (to.numbers.length < from.numberCount) to.numbers = new Float64Array(Math.max(from.numberCount, 2 * to.numbers.length));
  to.numbers.set(from.numbers.subarray(0, from.numberCount));
  to.numberCount = from.numberCount;
  for (let i = 0; i < from.refCount; i++) to.refs[i] = from.refs[i];
  to.refs.length = from.refCount;
  to.refCount = from.refCount;
}

/**
 * The groups of a build (spec §21.17): per group, whether its composite reads the backdrop and whether it
 * has a matte; the masks (spec §21.18, Batch 73) of its clip and of its matte clip, whose coverage the
 * composite multiplies the picture and the matte picture by.
 */
export interface GroupInfo {
  backdrop: boolean;
  matte: boolean;
  mask: MaskFrame | null;
  matteMask: MaskFrame | null;
}

/**
 * Where a composite record keeps its mask maps (spec §21.18): in its style's stop colors (a composite has
 * no gradient). Floats 0-11 hold the rows (as vec4, the 4th unused) of the clip's mask map, 12-23 the
 * matte clip's, 24 and 25 whether each is on. A mask map takes a target px (x, y, 1) to the content box's
 * unit square (x / w, y / h after the divide by the third row).
 */
export const MASK_MAP = { mask: 0, matteMask: 12, flags: 24 } as const;

/** A record's uniform, writable. */
export type RecordUniform = DrawRecord<TextureHandle>["uniform"];

/** Largest blur (Gaussian sigma, texture px): the kernel reaches 3 sigma (spec §10.4 "cap the blur radius"). */
export const MAX_BLUR_SIGMA = 16;
/** Target px a shaped solid's quad grows by on each side: its anti-aliased edge reaches half a px out. */
const SHAPE_MARGIN = 1;
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

/** A uniform at rest (a plain fill). */
export function newRecordUniform(): RecordUniform {
  return {
    transform: mutableIdentity(),
    wRow: [0, 0, 1],
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
    fx: { code: 0, dx: 0, dy: 0, softness: 0, cx: 0.5, cy: 0.5 },
  };
}

function newRecord<T extends TextureHandle>(): DrawRecord<T> {
  return {
    kind: "solid",
    uniform: newRecordUniform(),
    texture0: null,
    texture1: null,
    blur: 0,
    scissor: { x: 0, y: 0, width: 0, height: 0 },
    path: null,
    group: 0,
    role: ROLE.target,
    stage: 0,
  };
}

export class DrawRecords<T extends TextureHandle> {
  /** The records; the first `count` belong to the last `build`. */
  readonly pool: DrawRecord<T>[] = [];
  count = 0;
  /** The groups of the last `build` (spec §21.17): group g is `groups[g - 1]`; the first `groupCount` are current. */
  readonly groups: GroupInfo[] = [];
  groupCount = 0;
  /** The effect stages of the last `build` (spec §21.19): stage e is `stages[e - 1]`; the first `stageCount` are current. */
  readonly stages: StageInfo[] = [];
  stageCount = 0;
  /** The adjustments of the last `build` (spec §21.20): an "adjust" record's `stage` s is `adjusts[s - 1]`; the first `adjustCount` are current. */
  readonly adjusts: AdjustInfo[] = [];
  adjustCount = 0;
  private targetWidth = 0;
  private targetHeight = 0;
  /** Where the records being added draw (a group's picture while its layers are added). */
  private group = 0;
  private role: number = ROLE.target;
  /** The stage whose records are being added (0: none), and what their opacities are multiplied by (its clip's opacity divided out). */
  private stage = 0;
  private opacityScale = 1;
  private readonly stageView = mutableIdentity();
  private readonly stageModel = mutableIdentity();
  private readonly stageScissor: Rect = { x: 0, y: 0, width: MAX_STAGE_SIZE, height: MAX_STAGE_SIZE };
  private readonly packScratch = new Float32Array(LAYER_STRIDE / 4);
  /** The list of the pane being built (its frame size gives a composite its quad). */
  private list: DrawList | null = null;
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
    this.groupCount = 0;
    this.stageCount = 0;
    this.adjustCount = 0;
    this.targetWidth = width;
    this.targetHeight = height;
    this.group = 0;
    this.role = ROLE.target;
    this.stage = 0;
    this.opacityScale = 1;
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
    this.list = list;
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
    record.path = null;
    record.group = this.group;
    record.role = this.role;
    record.stage = this.stage;
    const u = record.uniform;
    setFlat(u.wRow);
    u.opacity = 1;
    u.flipX = false;
    u.flipY = false;
    u.mix = 0;
    setUv(u.uv, 0, 0, 1, 1);
    setColor(u.color, TRANSPARENT);
    setColor(u.to, TRANSPARENT);
    u.shape.code = SHAPE_CODE.quad;
    (u.fx as { code: number }).code = 0;
    u.radii.fill(0);
    resetStyleUniform(u.style);
    return record;
  }

  /**
   * A clip with a blend mode or a track matte (spec §21.17): its layers' records into the group's picture,
   * its matte's into the matte picture, then the composite record that draws the picture over the target
   * (over the frame quad). Nothing when none of its layers adds a record.
   */
  private groupRecords(layer: GroupLayer, view: Mat3, scissor: Rect): void {
    // Effects (spec §21.19): a normal clip with no matte draws its effect picture straight onto the target.
    if (layer.effects && layer.blend === "normal" && !layer.matte) {
      this.stageRecords(layer, layer.effects, view, scissor);
      return;
    }
    const index = this.groupCount + 1;
    const before = this.count;
    this.group = index;
    this.role = ROLE.layers;
    if (layer.effects) this.stageRecords(layer, layer.effects, view, scissor);
    else for (const inner of layer.layers) this.layerRecord(inner, view, scissor);
    const drawn = this.count > before;
    let matte = false;
    if (drawn && layer.matte) {
      matte = true;
      this.role = ROLE.matte;
      for (const inner of layer.matte.layers) this.layerRecord(inner, view, scissor);
    }
    this.group = 0;
    this.role = ROLE.target;
    if (!drawn) return;
    this.groupCount = index;
    const info = (this.groups[index - 1] ??= { backdrop: false, matte: false, mask: null, matteMask: null });
    info.backdrop = !isHardwareBlend(layer.blend);
    info.matte = matte;
    // With effects the masks were applied in the stage (before the effects).
    info.mask = layer.effects ? null : layer.mask;
    info.matteMask = matte ? (layer.matte?.mask ?? null) : null;
    const record = this.nextRecord("composite", scissor);
    record.group = index;
    const list = this.list as DrawList;
    const u = record.uniform;
    multiplyInto(u.transform, view, setMat(u.transform, list.width, 0, 0, list.height, 0, 0));
    const fx = u.fx as { code: number; dx: number };
    fx.code = blendCode(layer.blend);
    fx.dx = matte && layer.matte ? matteCode(layer.matte.mode) : 0;
    const maps = u.style.stopColor;
    maps.fill(0);
    if (info.mask && !writeMaskMap(maps, MASK_MAP.mask, view, info.mask)) info.mask = null;
    if (info.matteMask && !writeMaskMap(maps, MASK_MAP.matteMask, view, info.matteMask)) info.matteMask = null;
    maps[MASK_MAP.flags] = info.mask ? 1 : 0;
    maps[MASK_MAP.flags + 1] = info.matteMask ? 1 : 0;
  }

  /**
   * An effect stage (spec §21.19, Batch 74): the clip's layers as stage records in its content box (scaled to
   * the size it is shown at, without its projection, its opacity divided out), the box grown to hold what they
   * draw and the effects' reach, then the "effect" record that shows the stage's result through the clip's
   * model and projection with its opacity, where records are being added (the target or a group's picture).
   */
  private stageRecords(layer: GroupLayer, effects: EffectFrame, view: Mat3, scissor: Rect): void {
    const model = effects.model;
    if (!(effects.width > 0) || !(effects.height > 0) || !(effects.opacity > 0) || !invertInto(this.stageModel, model)) return;
    // Stage px per content px: the area scale the clip is shown at (its projection left out).
    const shown = multiplyInto(this.stageView, view, model);
    const scale = stageScale(Math.sqrt(Math.abs(shown[0] * shown[3] - shown[1] * shown[2])));
    // Project px -> stage px, the content box's top-left at 0 (moved once the box is known).
    const stageView = multiplyInto(this.stageView, setMat(this.stageView, scale, 0, 0, scale, 0, 0), this.stageModel);
    const index = this.stageCount + 1;
    const before = this.count;
    const outerRole = this.role;
    const outerGroup = this.group;
    this.stage = index;
    this.role = ROLE.stage;
    this.group = 0;
    this.opacityScale = 1 / effects.opacity;
    for (const inner of layer.layers) if (inner.kind !== "group") this.layerRecord(inner, stageView, this.stageScissor);
    this.stage = 0;
    this.role = outerRole;
    this.group = outerGroup;
    this.opacityScale = 1;
    if (this.count === before) return;
    // The box: the content box and what the records draw (a stroke or a shadow past it, at most half the
    // box's size past it), grown by the effects' reach and rounded out to whole px.
    const cw = effects.width * scale;
    const ch = effects.height * scale;
    const slack = 0.5 * Math.max(cw, ch);
    const box = this.box;
    let x0 = 0;
    let y0 = 0;
    let x1 = cw;
    let y1 = ch;
    for (let i = before; i < this.count; i++) {
      if (!recordBox(box, this.pool[i] as DrawRecord<T>)) continue;
      x0 = Math.min(x0, Math.max(box[0], -slack));
      y0 = Math.min(y0, Math.max(box[1], -slack));
      x1 = Math.max(x1, Math.min(box[2], cw + slack));
      y1 = Math.max(y1, Math.min(box[3], ch + slack));
    }
    const reach = Math.min(MAX_STAGE_REACH, stackReach(effects.data, effects.length) * scale);
    x0 = Math.floor(x0 - reach);
    y0 = Math.floor(y0 - reach);
    x1 = Math.ceil(x1 + reach);
    y1 = Math.ceil(y1 + reach);
    // Too large: the stage is drawn smaller (its records scaled about the content box's top-left).
    const fit = Math.min(1, MAX_STAGE_SIZE / (x1 - x0), MAX_STAGE_SIZE / (y1 - y0));
    if (fit < 1) {
      x0 = Math.floor(x0 * fit);
      y0 = Math.floor(y0 * fit);
      x1 = Math.ceil(x1 * fit);
      y1 = Math.ceil(y1 * fit);
    }
    const s = scale * fit;
    const width = Math.max(1, Math.min(MAX_STAGE_SIZE, x1 - x0));
    const height = Math.max(1, Math.min(MAX_STAGE_SIZE, y1 - y0));
    const move = setMat(this.stageModel, fit, 0, 0, fit, -x0, -y0);
    for (let i = before; i < this.count; i++) {
      const record = this.pool[i] as DrawRecord<T>;
      multiplyInto(record.uniform.transform, move, record.uniform.transform);
      setRect(record.scissor, 0, 0, width, height);
    }
    this.stageCount = index;
    const info = (this.stages[index - 1] ??= { clipId: "", width: 0, height: 0, scale: 1, rect: [0, 0, 0, 0], effects, mask: null, ...newSignature() });
    info.clipId = effects.clipId;
    info.width = width;
    info.height = height;
    info.scale = s;
    info.rect[0] = -x0;
    info.rect[1] = -y0;
    info.rect[2] = effects.width * s - x0;
    info.rect[3] = effects.height * s - y0;
    info.effects = effects;
    info.mask = layer.mask;
    this.writeSignature(info, before);
    // The record showing the result: the unit quad -> the stage box in content px -> the clip's model (and projection) -> target px.
    const record = this.nextRecord("effect", scissor);
    record.stage = index;
    const local = setMat(this.stageModel, width / s, 0, 0, height / s, x0 / s, y0 / s);
    copyLayer(record, view, effects, multiplyInto(this.stageView, model, local), effects.opacity);
  }

  private readonly box: [number, number, number, number] = [0, 0, 0, 0];

  /**
   * An adjustment (spec §21.20, Batch 76): its info (the target-sized stage, the frame's box in it, the view's
   * scale) and its "adjust" record over the frame with its opacity and the mask map of its masks.
   */
  private adjustRecord(layer: AdjustLayer, view: Mat3, scissor: Rect): void {
    const list = this.list as DrawList;
    const effects = layer.effects;
    const scale = Math.sqrt(Math.abs(view[0] * view[3] - view[1] * view[2]));
    if (!(layer.opacity > 0) || !(scale > 0) || effects.length === 0 || this.targetWidth < 1 || this.targetHeight < 1) return;
    const index = this.adjustCount + 1;
    this.adjustCount = index;
    const info = (this.adjusts[index - 1] ??= { clipId: "", width: 0, height: 0, scale: 1, rect: [0, 0, 0, 0], effects, mask: null });
    info.clipId = layer.clipId;
    info.width = this.targetWidth;
    info.height = this.targetHeight;
    info.scale = scale;
    const frame = frameRect(this.adjustBox, view, list.width, list.height);
    info.rect[0] = frame.x;
    info.rect[1] = frame.y;
    info.rect[2] = frame.x + frame.width;
    info.rect[3] = frame.y + frame.height;
    info.effects = effects;
    info.mask = layer.mask;
    const record = this.nextRecord("adjust", scissor);
    record.stage = index;
    const u = record.uniform;
    multiplyInto(u.transform, view, setMat(u.transform, list.width, 0, 0, list.height, 0, 0));
    u.opacity = layer.opacity;
    const maps = u.style.stopColor;
    maps.fill(0);
    if (layer.mask && writeMaskMap(maps, MASK_MAP.mask, view, layer.mask)) maps[MASK_MAP.flags] = 1;
    else info.mask = null;
  }

  private readonly adjustBox: Rect = { x: 0, y: 0, width: 0, height: 0 };

  /** The signature of stage `info` (its records from `first` on): its size, scale, box, effects and mask versions, and every record. */
  private writeSignature(info: StageInfo, first: number): void {
    const stride = LAYER_STRIDE / 4;
    let need = 8;
    for (let i = first; i < this.count; i++) need += 2 + stride + 4 * ((this.pool[i] as DrawRecord<T>).path?.draws.length ?? 0);
    if (info.numbers.length < need) info.numbers = new Float64Array(Math.max(need, 2 * info.numbers.length));
    const numbers = info.numbers;
    const refs = info.refs;
    let n = 0;
    let r = 0;
    numbers[n++] = info.width;
    numbers[n++] = info.height;
    numbers[n++] = info.scale;
    numbers[n++] = info.rect[0];
    numbers[n++] = info.rect[1];
    numbers[n++] = info.effects.version;
    numbers[n++] = info.mask ? info.mask.version : 0;
    numbers[n++] = this.count - first;
    const scratch = this.packScratch;
    for (let i = first; i < this.count; i++) {
      const record = this.pool[i] as DrawRecord<T>;
      numbers[n++] = KIND_CODE[record.kind];
      numbers[n++] = record.blur;
      packLayer(scratch, 0, record.uniform);
      for (let k = 0; k < stride; k++) numbers[n++] = scratch[k] as number;
      refs[r++] = record.texture0;
      refs[r++] = record.texture1;
      const path = record.path;
      if (path) {
        // A shape's geometry: the shape cache returns the same arrays while a path is unchanged.
        refs[r++] = path.draws.length;
        for (const draw of path.draws) {
          refs[r++] = draw.triangles;
          refs[r++] = draw.clip;
          refs[r++] = draw.gradient;
          numbers[n++] = draw.color.r;
          numbers[n++] = draw.color.g;
          numbers[n++] = draw.color.b;
          numbers[n++] = draw.color.a;
        }
      }
    }
    info.numberCount = n;
    info.refCount = r;
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
      case "adjust":
        // Over the target only (an adjustment is never inside a group; a stage never holds one).
        if (this.group === 0 && this.stage === 0 && this.role === ROLE.target) this.adjustRecord(layer, view, scissor);
        return;
      case "group": {
        // Groups do not nest (a matte's own blend and matte are not drawn): an inner group draws plainly.
        if (this.group !== 0 || this.stage !== 0) {
          for (const inner of layer.layers) this.layerRecord(inner, view, scissor);
          return;
        }
        this.groupRecords(layer, view, scissor);
        return;
      }
      case "texture": {
        if (!this.usable(layer.texture)) return;
        const record = this.nextRecord("textured", scissor);
        record.texture0 = layer.texture;
        record.blur = layer.blur ?? 0;
        copyLayer(record, view, this.stage ? NO_PERSP : layer, layer.transform, layer.opacity * this.opacityScale);
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
        copyLayer(record, view, this.stage ? NO_PERSP : layer, layer.transform, layer.opacity * this.opacityScale);
        setUv(u.uv, from.crop.u0, from.crop.v0, from.crop.u1, from.crop.v1);
        setUv(u.uv2, to.crop.u0, to.crop.v0, to.crop.u1, to.crop.v1);
        u.sides.from = from.opacity;
        u.sides.to = to.opacity;
        u.mix = layer.mix;
        // Transitions v2 (Batch 71): the kind and its parameters; the frame size gives the shader its aspect.
        const fx = u.fx as { code: number; dx: number; dy: number; softness: number; cx: number; cy: number };
        const source = layer.fx;
        fx.code = source?.code ?? 0;
        fx.dx = source?.dx ?? 0;
        fx.dy = source?.dy ?? 0;
        fx.softness = source?.softness ?? 0;
        fx.cx = source?.cx ?? 0.5;
        fx.cy = source?.cy ?? 0.5;
        u.shape.width = layer.transform[0];
        u.shape.height = layer.transform[3];
        return;
      }
      case "path": {
        if (layer.draws.length === 0 || layer.opacity <= 0) return;
        const record = this.nextRecord("path", scissor);
        record.path = layer;
        copyLayer(record, view, this.stage ? NO_PERSP : layer, layer.transform, layer.opacity * this.opacityScale);
        return;
      }
      case "solid": {
        const record = this.solidRecord(layer.color, scissor);
        copyLayer(record, view, this.stage ? NO_PERSP : layer, layer.transform, layer.opacity * this.opacityScale);
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
          growQuad(u.transform, u.uv, SHAPE_MARGIN + reach * scale, u.wRow);
        }
        return;
      }
    }
  }
}

/** Record kinds as numbers (stage signatures). */
const KIND_CODE: Readonly<Record<RecordKind, number>> = { textured: 1, dissolve: 2, solid: 3, path: 4, composite: 5, effect: 6, adjust: 7 };

/** A layer drawn flat (a stage's records: the clip's projection applies to the stage's result). */
const NO_PERSP: { persp: null } = { persp: null };

const UNIT_BOX: readonly [number, number, number, number] = [0, 0, 1, 1];

/** The box (x0, y0, x1, y1, px of its matrix) a flat record draws into `out` (a path's draws' box, a blur's reach); false when none. */
function recordBox(out: [number, number, number, number], record: DrawRecord<TextureHandle>): boolean {
  const m = record.uniform.transform;
  const [bx0, by0, bx1, by1] = record.kind === "path" && record.path ? record.path.bounds : UNIT_BOX;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? bx1 : bx0;
    const y = i & 2 ? by1 : by0;
    const tx = m[0] * x + m[2] * y + m[4];
    const ty = m[1] * x + m[3] * y + m[5];
    minX = Math.min(minX, tx);
    maxX = Math.max(maxX, tx);
    minY = Math.min(minY, ty);
    maxY = Math.max(maxY, ty);
  }
  let grow = record.kind === "path" ? PATH_MARGIN : 0;
  // A blurred text grows by 3 sigma (texture px, about its matrix's px).
  if (record.blur > 0) grow += Math.ceil(3 * Math.min(MAX_BLUR_SIGMA, record.blur));
  out[0] = minX - grow;
  out[1] = minY - grow;
  out[2] = maxX + grow;
  out[3] = maxY + grow;
  return Number.isFinite(minX + minY + maxX + maxY);
}

/**
 * Scales every stage record (the first `count` of `records`) from its stage's px to the target's: the backends
 * draw a stage with the target's view into the stage's picture (its viewport), so a stage px x must sit where
 * the target's view puts x * target / stage. Run after the path and blur records are drawn, before the
 * uniforms are written.
 */
export function retargetStages<T extends TextureHandle>(records: DrawRecords<T>, count: number, width: number, height: number): void {
  if (records.stageCount === 0) return;
  for (let i = 0; i < count; i++) {
    const record = records.at(i);
    if (record.role !== ROLE.stage) continue;
    const stage = records.stages[record.stage - 1];
    if (!stage) continue;
    const sx = width / stage.width;
    const sy = height / stage.height;
    const m = record.uniform.transform;
    m[0] *= sx;
    m[2] *= sx;
    m[4] *= sx;
    m[1] *= sy;
    m[3] *= sy;
    m[5] *= sy;
  }
}

/** Points an "effect" record at `texture`, which holds its stage's result from its top-left: a textured quad. */
export function showEffect<T extends TextureHandle>(record: DrawRecord<T>, stage: StageInfo, texture: T): void {
  record.kind = "textured";
  record.texture0 = texture;
  setUv(record.uniform.uv, 0, 0, stage.width / texture.width, stage.height / texture.height);
}

/** A gradient fill into a style uniform (at most 8 stops are drawn). */
function writeGradient(out: LayerUniform["style"], g: GradientFill): void {
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

/** Target px a shape's region reaches past its draws' box on each side (the multisampled edge). */
const PATH_MARGIN = 1;

/**
 * The target px a "path" record draws into: its draws' box through its matrix, grown by the edge and
 * rounded out to whole px, clipped to its scissor; null when nothing of it is in view.
 */
export function pathRegionInto(out: Rect, record: DrawRecord<TextureHandle>): Rect | null {
  const layer = record.path;
  if (record.kind !== "path" || !layer) return null;
  const m = record.uniform.transform;
  const w = record.uniform.wRow;
  const [x0, y0, x1, y1] = layer.bounds;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? x1 : x0;
    const y = i & 2 ? y1 : y0;
    // A 2.5D shape: the projected corner (its quad is convex, so the corners bound it).
    const pw = w[0] * x + w[1] * y + w[2];
    if (!(pw > 1e-6)) return null;
    const tx = (m[0] * x + m[2] * y + m[4]) / pw;
    const ty = (m[1] * x + m[3] * y + m[5]) / pw;
    if (tx < minX) minX = tx;
    if (tx > maxX) maxX = tx;
    if (ty < minY) minY = ty;
    if (ty > maxY) maxY = ty;
  }
  if (!Number.isFinite(minX + minY + maxX + maxY)) return null;
  const { scissor } = record;
  const left = Math.max(scissor.x, Math.floor(minX) - PATH_MARGIN);
  const top = Math.max(scissor.y, Math.floor(minY) - PATH_MARGIN);
  const right = Math.min(scissor.x + scissor.width, Math.ceil(maxX) + PATH_MARGIN);
  const bottom = Math.min(scissor.y + scissor.height, Math.ceil(maxY) + PATH_MARGIN);
  if (right - left < 1 || bottom - top < 1) return null;
  return setRect(out, left, top, right - left, bottom - top);
}

/**
 * The uniform of one draw of a "path" record into its scratch (`width` x `height` px, the region at its
 * top-left): the matrix maps view-box px to the scratch's clip space (`flipY`: GL framebuffers, whose
 * clip y runs the other way), `uv` holds the cover rectangle, `shape` the gradient's box (x, y, w, h).
 */
export function writePathUniform(out: RecordUniform, record: DrawRecord<TextureHandle>, draw: PathDraw, region: Rect, width: number, height: number, flipY: boolean): void {
  const m = record.uniform.transform;
  const sx = 2 / width;
  const sy = (flipY ? 2 : -2) / height;
  // Target px -> the scratch's clip space, after the record's (projective) matrix.
  writeProjective(out, setMat(pathToClip, sx, 0, 0, sy, -sx * region.x - 1, -sy * region.y + (flipY ? -1 : 1)), m, record.uniform.wRow);
  const [c0, c1, c2, c3] = draw.cover;
  setUv(out.uv, c0, c1, c2, c3);
  setColor(out.color, draw.color);
  const [b0, b1, b2, b3] = draw.box;
  out.shape.width = b0;
  out.shape.height = b1;
  out.shape.radius = b2 - b0;
  out.shape.code = b3 - b1;
  out.opacity = 1;
  resetStyleUniform(out.style);
  if (draw.gradient) writeGradient(out.style, draw.gradient);
}

/** Points a "path" record at `texture`, which holds its region from its top-left: a textured quad over the region. */
export function showPath<T extends TextureHandle>(record: DrawRecord<T>, region: Rect, texture: T): void {
  record.kind = "textured";
  record.path = null;
  record.texture0 = texture;
  const u = record.uniform;
  setMat(u.transform, region.width, 0, 0, region.height, region.x, region.y);
  setFlat(u.wRow);
  setUv(u.uv, 0, 0, region.width / texture.width, region.height / texture.height);
  u.flipX = false;
  u.flipY = false;
  u.shape.code = SHAPE_CODE.quad;
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
  const grow = setMat(scratch, 1 + 2 * gx, 0, 0, 1 + 2 * gy, -gx, -gy);
  rightAffine(record.uniform.wRow, grow);
  multiplyInto(m, m, grow);
  setUv(record.uniform.uv, 0, 0, (width + 2 * reach) / blurred.width, (height + 2 * reach) / blurred.height);
  record.texture0 = blurred;
}

/** Grows the unit quad of `m` (unit quad -> target px; projective with the bottom row `w`) by `margin` target px on each side, the UV past 0..1 with it. */
export function growQuad(m: MutableMat3, uv: UvRect, margin: number, w?: WRow): void {
  const width = Math.hypot(m[0], m[1]);
  const height = Math.hypot(m[2], m[3]);
  if (!(width > 1e-6) || !(height > 1e-6)) return;
  const ex = margin / width;
  const ey = margin / height;
  // m * [1 + 2ex, 0; 0, 1 + 2ey] with the quad moved by (-ex, -ey).
  if (w) {
    w[2] -= w[0] * ex + w[1] * ey;
    w[0] *= 1 + 2 * ex;
    w[1] *= 1 + 2 * ey;
  }
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

/** The layer's matrix in target px (`view * persp * transform`, projective for a 2.5D layer) and its opacity. */
function copyLayer<T extends TextureHandle>(record: DrawRecord<T>, view: Mat3, layer: { persp?: Homography | null }, transform: Mat3, opacity: number): void {
  const persp = layer.persp;
  if (persp) writeProjective(record.uniform, view, homographyTimesAffine(projective, persp, transform), null);
  else {
    multiplyInto(record.uniform.transform, view, transform);
    setFlat(record.uniform.wRow);
  }
  record.uniform.opacity = opacity;
}

const projective = newHomography();
const maskForward = newHomography();
const maskBox = mutableIdentity();
const IDENTITY_H: Homography = [1, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Writes the mask map of `mask` (spec §21.18) at `offset` of `out`: the inverse of target px <- content box
 * unit square (`view * persp * model * scale(w, h)`), as three vec4 rows. False when it cannot be inverted.
 */
export function writeMaskMap(out: Float32Array, offset: number, view: Mat3, mask: MaskFrame): boolean {
  multiplyInto(maskBox, mask.model, setMat(maskBox, mask.width, 0, 0, mask.height, 0, 0));
  const h = affineTimesHomography(maskForward, view, homographyTimesAffine(maskForward, mask.persp ?? IDENTITY_H, maskBox));
  // Rows of the 3x3 [[a, c, tx], [b, d, ty], [g, h, i]].
  const m00 = h[0], m01 = h[2], m02 = h[4];
  const m10 = h[1], m11 = h[3], m12 = h[5];
  const m20 = h[6], m21 = h[7], m22 = h[8];
  const c00 = m11 * m22 - m12 * m21;
  const c01 = m12 * m20 - m10 * m22;
  const c02 = m10 * m21 - m11 * m20;
  const det = m00 * c00 + m01 * c01 + m02 * c02;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return false;
  const k = 1 / det;
  out[offset] = c00 * k;
  out[offset + 1] = (m02 * m21 - m01 * m22) * k;
  out[offset + 2] = (m01 * m12 - m02 * m11) * k;
  out[offset + 3] = 0;
  out[offset + 4] = c01 * k;
  out[offset + 5] = (m00 * m22 - m02 * m20) * k;
  out[offset + 6] = (m02 * m10 - m00 * m12) * k;
  out[offset + 7] = 0;
  out[offset + 8] = c02 * k;
  out[offset + 9] = (m01 * m20 - m00 * m21) * k;
  out[offset + 10] = (m00 * m11 - m01 * m10) * k;
  out[offset + 11] = 0;
  return true;
}
const pathToClip = mutableIdentity();

/** `out`'s matrix = `left * h` (affine after projective; `h` is a homography, or a matrix `m` with the bottom row `w`). */
function writeProjective(out: { transform: MutableMat3; wRow: WRow }, left: Mat3, h: Homography | Mat3, w: Readonly<WRow> | null): void {
  const full = w ? setHomographyFrom(projective, h, w) : (h as Homography);
  const r = affineTimesHomography(projective, left, full);
  setMat(out.transform, r[0], r[1], r[2], r[3], r[4], r[5]);
  out.wRow[0] = r[6];
  out.wRow[1] = r[7];
  out.wRow[2] = r[8];
}

function setHomographyFrom(out: Homography, m: Homography | Mat3, w: Readonly<WRow>): Homography {
  for (let i = 0; i < 6; i++) out[i] = m[i] as number;
  out[6] = w[0];
  out[7] = w[1];
  out[8] = w[2];
  return out;
}

/** The bottom row of `m * r` for a projective `m` with bottom row `w` and an affine `r`, in place. */
function rightAffine(w: WRow, r: Mat3): void {
  const [g, h, i] = w;
  w[0] = g * r[0] + h * r[1];
  w[1] = g * r[2] + h * r[3];
  w[2] = g * r[4] + h * r[5] + i;
}

function setFlat(w: WRow): void {
  w[0] = 0;
  w[1] = 0;
  w[2] = 1;
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
  if (style.gradient) writeGradient(out, style.gradient);
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
