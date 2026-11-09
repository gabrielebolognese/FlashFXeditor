// The draw list (spec §9.4): what `Renderer.draw` draws for one frame. Layers are in project pixel
// space, bottom to top. Backend-neutral: textures are opaque `TextureHandle`s.
// `Compositor.evaluate` produces a `Composite`: the same list with media layers still naming their
// frame (media and time) and text layers their text instead of a texture. The preview resolves them
// to pool textures and text rasters, and skips the redraw when the resolved list equals the one it
// drew last (`DrawListSnapshot`).
import type { BlendMode, ClipId, Fill, FillRule, GradientFill, MediaId, MatteMode, PathStroke, PathTrim, RGBA, ShadowStyle, StrokeStyle, TextContent, TextStyle, TrackId } from "../../core/document/types.js";
import type { TransitionFx } from "../../core/document/transitions.js";
import type { Bounds, PathSource } from "../../core/shapes/geometry.js";
import type { UnitState } from "../../text/anim.js";
import type { Homography } from "../projection.js";
import type { Mat3 } from "../mat3.js";
import type { TextureHandle } from "../gpu/renderer.js";
import type { AtlasUnitKind } from "../text/atlas.js";
import type { Rect } from "../text/layout.js";
import type { TextHighlight } from "../text/raster.js";

/** A region of a texture in UV space (0..1), left/top to right/bottom. */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const FULL_UV: UvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

interface LayerBase {
  /** Maps the unit quad (0..1, 0..1) into project pixels. */
  transform: Mat3;
  /** 0..1, multiplied into the (premultiplied) output. */
  opacity: number;
  /** The 2.5D projection applied after `transform` (spec §21.15, `render/projection.ts`); absent or null: flat. */
  persp?: Homography | null;
}

/** A picture cut to a rounded rectangle (spec §21.7): its size in the layer's own px and the radii tl, tr, br, bl. */
export interface PictureShape {
  width: number;
  height: number;
  radii: [number, number, number, number];
}

export interface TextureLayer extends LayerBase {
  kind: "texture";
  /** Rounded corners of the picture; absent or null: the plain quad. */
  shape?: PictureShape | null;
  texture: TextureHandle;
  /** The part of the texture shown on the quad (crop). */
  crop: UvRect;
  flipX: boolean;
  flipY: boolean;
  /** Gaussian blur (sigma) in texture px, the quad grown to hold it (a text blur, spec §10.4); 0 or absent: none. */
  blur?: number;
}

/** One picture of a dissolve: a texture with the quad, crop and opacity it would be drawn with alone (a `TextureLayer`'s). */
export interface DissolveSide {
  texture: TextureHandle;
  /** Maps the unit quad (0..1, 0..1) into project pixels. */
  transform: Mat3;
  crop: UvRect;
  opacity: number;
}

/**
 * Two pictures mixed by `mix` (0 = from, 1 = to) over the quad `transform` (the frame): the cross
 * dissolve (spec §9.4, Batch 36). Each side keeps its own geometry: a point shows `from` weighted by
 * 1 - mix plus `to` weighted by mix, each where it covers the point, so two clips of different sizes
 * dissolve as they would draw.
 */
export interface DissolveLayer extends LayerBase {
  kind: "dissolve";
  from: DissolveSide;
  to: DissolveSide;
  mix: number;
  /** The transition kind and its parameters (Batch 71, spec §21.16); absent = the plain mix. */
  fx?: TransitionFx;
}

/**
 * The shape a solid layer is drawn as (spec §5.2 solids, Batch 34): a box with rounded corners or an
 * ellipse filling the unit quad, `width` x `height` px of the layer's own space (the anti-aliased edge
 * is found in those px), `radius` px corners (boxes; at most half the shorter side).
 */
export interface SolidGeometry {
  kind: "box" | "ellipse";
  width: number;
  height: number;
  radius: number;
  /** Radii tl, tr, br, bl (layer px); when absent `radius` is used four times. */
  radii?: [number, number, number, number] | null;
}

/**
 * What a shaped solid has besides its color (spec §21.7, Batch 58): a gradient with stops (instead of
 * `color` / `to`), an outline, a shadow. `part` draws only the shadow or only the stroke of a layer (the
 * shadow below and the frame above a picture).
 */
export interface SolidStyle {
  gradient: GradientFill | null;
  stroke: StrokeStyle | null;
  shadow: ShadowStyle | null;
  part: "all" | "shadow" | "stroke";
}

/**
 * A color quad (solids, dip to color, highlight boxes). `color` has straight alpha; with `to` it is
 * the top of a vertical gradient that ends in `to` at the bottom of the quad. With `shape` the quad is
 * drawn as that shape with an anti-aliased edge; without, as the hard quad.
 */
export interface SolidLayer extends LayerBase {
  kind: "solid";
  color: RGBA;
  to?: RGBA | null;
  shape?: SolidGeometry | null;
  style?: SolidStyle | null;
}

/**
 * One draw of a path layer (spec §21.12, Batch 65): `triangles` (x, y view-box px per vertex) written to
 * the stencil by `rule`, then `paint` covers `cover` (the triangles' box) where the stencil says inside.
 * `nonzero` / `evenodd`: a fill's fans counted by winding. `union`: stroke triangles, any coverage.
 * `inside` / `outside`: a stroke of twice the width kept inside or outside the fill fans in `clip`.
 */
export interface PathDraw {
  rule: "nonzero" | "evenodd" | "union" | "inside" | "outside";
  triangles: Float32Array;
  /** The fill fans (and their rule) an inside or outside stroke is cut by; null otherwise. */
  clip: Float32Array | null;
  clipRule: FillRule;
  cover: Bounds;
  /** A color (straight alpha), or a gradient laid out in `box` (the path's box, view-box px). */
  color: RGBA;
  gradient: GradientFill | null;
  box: Bounds;
}

/**
 * A vector shape (spec §21.12, Batch 65): its paths' draws in order, in view-box px mapped into project
 * px by `transform` (not the unit quad), with one group opacity. The renderer draws them into a layer
 * texture (stencil then cover, multisampled) over `bounds` and composites that.
 */
export interface PathLayer extends LayerBase {
  kind: "path";
  draws: readonly PathDraw[];
  /** The box of every draw (view-box px). */
  bounds: Bounds;
}

/**
 * A clip's masks at a frame (spec §21.18, Batch 73): the packed block (core/masks/maskCoverage.ts, its
 * first `length` floats) over the clip's content box (`width` x `height` content px laid out by `model`,
 * then `persp` for a 2.5D clip). `version` changes whenever the data does and is unique across
 * compositors: the renderer keeps a clip's coverage texture while it stays the same.
 */
export interface MaskFrame {
  clipId: ClipId;
  data: Float32Array;
  length: number;
  version: number;
  width: number;
  height: number;
  model: Mat3;
  persp: Homography | null;
}

/**
 * A clip drawn with a blend mode, a track matte or masks (spec §21.17, §21.18): its `layers` are drawn on
 * their own into a transparent picture of the frame, kept where its `mask` covers it and where the `matte`
 * layers' picture (itself kept where the matte clip's own `mask` covers it) is opaque or bright (`mode`),
 * and that picture is blended over what is below with `blend`. Its own `transform` is the identity and its
 * `opacity` 1 (the clip's opacity is in its layers). Groups do not nest.
 */
export interface GroupLayer extends LayerBase {
  kind: "group";
  blend: BlendMode;
  mask: MaskFrame | null;
  layers: readonly Layer[];
  matte: { mode: MatteMode; layers: readonly Layer[]; mask: MaskFrame | null } | null;
}

export type Layer = TextureLayer | DissolveLayer | SolidLayer | PathLayer | GroupLayer;

/** A media frame not resolved to a texture yet: what a video or image clip shows at the frame. */
export interface MediaLayer extends LayerBase {
  kind: "media";
  trackId: TrackId;
  clipId: ClipId;
  mediaId: MediaId;
  /** Images have one texture; videos one per frame. */
  still: boolean;
  /** Media time in us (0 = the first frame), for videos. */
  timeUs: number;
  /** The visible part of the texture (crop), in texture UV space. */
  crop: UvRect;
  /** Rounded corners of the picture (spec §21.7). */
  shape?: PictureShape | null;
}

/**
 * A text layer's animation at its frame (spec §10.4). `block`: `units[0]` moves the layer raster.
 * Otherwise each unit of the `atlas` (the text's characters, words or lines, in reading order) is drawn
 * with its own state, over the background boxes at `background` opacity.
 */
export interface TextAnimFrame {
  /** `glyphs` (Batch 68): the units are `glyphs.draws`, drawn from the glyph atlas (a counter's characters). */
  atlas: "block" | AtlasUnitKind | "glyphs";
  units: readonly UnitState[];
  background: number;
  /** Animator fill (Batch 68): each unit is drawn again from the atlas of `style` (slot `clipId + slot`) at its `tint` opacity. */
  tint?: { style: TextStyle; slot: string } | null;
  /**
   * The glyph atlas of a counter or a decode (Batch 68): `text` holds the characters (laid out in the layer's
   * style, atlas of characters, slot `clipId + slot`); `draws[i]` says what unit i draws: the glyph `glyph`
   * (an atlas unit, < 0: the layer's own atlas), moved by `dx`, `dy` (glyph space to the unit's place; the unit
   * state's `ox`, `oy` are in the unit's place).
   */
  glyphs?: { text: TextContent; slot: string; draws: readonly TextGlyphDraw[] } | null;
  /** Boxes growing behind the words (highlight sweep, Batch 68): content px rects, widths already times their amount. */
  sweep?: { color: RGBA; rects: readonly Rect[]; count: number } | null;
}

export interface TextGlyphDraw {
  glyph: number;
  dx: number;
  dy: number;
}

/**
 * A cue's word highlight at its frame (spec §10.5): the cue's words are drawn from its word atlas (the
 * layer's style: the inactive words' look) except units [from, to), the active word, which come from
 * the atlas of `style` (its slot keyed `clipId + HIGHLIGHT_SLOT`), grown by `scale` about (ox, oy)
 * over a `box` in its color when the mode has one.
 */
export interface CaptionHighlightFrame {
  style: TextStyle;
  /** The raster slot suffix of the active word's atlas (`HIGHLIGHT_SLOT` unless a word color or emphasis changes it). */
  slot: string;
  /** The active word's units [from, to); empty (from = to) between words. */
  from: number;
  to: number;
  scale: number;
  ox: number;
  oy: number;
  /** The background mode's box: a pill (`radius` half its height) behind the active word. */
  box: { rect: { x: number; y: number; width: number; height: number }; color: RGBA; radius: number } | null;
  /**
   * The other words' states (Batch 59: progressive and reveal modes, word colors, emphasis): `paints`
   * are the looks of the word atlas (`paints[0]` is the layer's own, its slot the cue's), `unitPaint[i]`
   * the paint of atlas unit i (-1: hidden). Null: every unit but the active word's is the layer's own.
   */
  paints: readonly { slot: string; style: TextStyle }[] | null;
  unitPaint: readonly number[];
  /** `word` background mode: a box behind each shown word (a solid layer each, with the box style's outline and shadow). */
  wordBoxes: CaptionWordBoxes | null;
}

/** The boxes behind the words of a cue (spec §21.8, `word` background mode). */
export interface CaptionWordBoxes {
  /** Per cue word: its box (content px), null for a word the text does not show. */
  rects: readonly ({ x: number; y: number; width: number; height: number } | null)[];
  /** The words whose box shows now (the reveal mode hides the boxes of upcoming words). */
  shown: readonly number[];
  /** The word whose box takes `activeColor` (the background highlight), or -1. */
  active: number;
  activeColor: RGBA;
  style: TextStyle["background"];
}

/** The raster cache slot suffix of a cue's active-word atlas. */
export const HIGHLIGHT_SLOT = "#highlight";

/**
 * A text clip (or a cue) at the frame (spec §10.1), not rasterized yet: the preview resolves it to a
 * raster of the text cache at its render scale, drawn over the raster's rect (`model` x the rect).
 */
export interface TextCompositeLayer {
  kind: "text";
  trackId: TrackId;
  clipId: ClipId;
  /** Maps the layer's content px (its layout box, flips included) into project pixels. */
  model: Mat3;
  /** The 2.5D projection applied after `model` (spec §21.15); absent or null: flat. */
  persp?: Homography | null;
  /** Its layout box, content px (what `model` lays out). */
  width?: number;
  height?: number;
  opacity: number;
  text: TextContent;
  style: TextStyle;
  /** The layer's own scale (its larger axis): rasters are drawn at the render scale times it. */
  scale: number;
  /** Raster px per project px it can show at most (the raster scale cap over `scale`): its "source detail" (§7.1). */
  detail: number;
  /** The selection highlight while it is edited inline (spec §7.7), drawn in its raster; else null. */
  highlight: TextHighlight | null;
  /** Its animation at the frame; null at rest. */
  anim: TextAnimFrame | null;
  /** A cue's word highlight at the frame; null for text clips and cues with no active word. */
  karaoke: CaptionHighlightFrame | null;
}

/**
 * A cross dissolve at its frame (spec §9.4, Batch 36): the outgoing and the incoming clip's media
 * layers (the incoming one on its own slot, `trackId + TRANSITION_SLOT`) and how much of the incoming
 * one shows. A dip to a color is no layer of its own: the clip shown and a solid in its quad.
 */
export interface TransitionCompositeLayer {
  kind: "dissolve";
  trackId: TrackId;
  from: MediaLayer;
  to: MediaLayer;
  mix: number;
  /** What the picture shader does with the two (Batch 71): the plain mix for a dissolve. */
  fx: TransitionFx;
}

/** The texture slot suffix of a transition's incoming clip (one slot per picture of a track). */
export const TRANSITION_SLOT = "#in";

/**
 * A compound clip at its frame (spec §21.10, Batch 62): the sequence it shows evaluated at the inner
 * frame (`inner`, a composite of its own at the sequence's size), drawn as one layer. The preview and the
 * export render `inner` into a pooled texture and draw it over `model`.
 */
export interface CompoundCompositeLayer {
  kind: "compound";
  trackId: TrackId;
  clipId: ClipId;
  sequenceId: string;
  /** Maps the unit quad (0..1, 0..1) into project pixels: the sequence frame under the clip's transform. */
  model: Mat3;
  /** The 2.5D projection applied after `model` (spec §21.15); absent or null: flat. */
  persp?: Homography | null;
  opacity: number;
  /** The sequence frame's size in its own px. */
  width: number;
  height: number;
  /** The layer's own scale (its larger axis): its texture is the sequence size times it (and the render scale). */
  scale: number;
  /** The sequence at the inner frame; reused by the next evaluation of this layer: read it before evaluating again. */
  inner: Composite;
}

/** One path of a shape layer at its frame (keyed values applied), before its geometry is built. */
export interface ShapePathFrame {
  id: string;
  source: PathSource;
  fill: Fill | null;
  fillRule: FillRule;
  stroke: PathStroke | null;
  trim: PathTrim | null;
}

/**
 * A shape clip at its frame (spec §21.12, Batch 65): its paths with their keyed values. The preview and the
 * export build the geometry (cached by path and style, `render/shapes`) at the render's scale and draw a
 * `PathLayer`.
 */
export interface ShapeCompositeLayer {
  kind: "shape";
  trackId: TrackId;
  clipId: ClipId;
  /** Maps view-box px into project pixels. */
  model: Mat3;
  /** The 2.5D projection applied after `model` (spec §21.15); absent or null: flat. */
  persp?: Homography | null;
  opacity: number;
  /** The view box, px. */
  width: number;
  height: number;
  /** The layer's own scale (its larger axis): curves are flattened for the render scale times it. */
  scale: number;
  paths: readonly ShapePathFrame[];
}

/**
 * A clip with a blend mode, a track matte or masks at its frame (spec §21.17, §21.18): the composite layers
 * the clip drew (`layers`), and those of its matte clip at the frame (`matte.layers`, empty while the
 * matte clip is not at the frame; its media on `trackId + MATTE_SLOT` slots). Resolved to a `GroupLayer`.
 */
export interface GroupCompositeLayer {
  kind: "group";
  trackId: TrackId;
  clipId: ClipId;
  blend: BlendMode;
  /** The clip's masks (spec §21.18); null without. */
  mask: MaskFrame | null;
  layers: readonly PlainCompositeLayer[];
  matte: { mode: MatteMode; layers: readonly PlainCompositeLayer[]; mask: MaskFrame | null } | null;
  /** Always null: the projection of a 2.5D clip is on its layers. */
  persp?: null;
}

/** The texture slot suffix of a matte clip's media (its own slots: the clip may also be drawn on its track). */
export const MATTE_SLOT = "#matte";

/** Every composite layer but a group (what a group holds). */
export type PlainCompositeLayer = MediaLayer | SolidLayer | TextCompositeLayer | TransitionCompositeLayer | CompoundCompositeLayer | ShapeCompositeLayer;

export type CompositeLayer = PlainCompositeLayer | GroupCompositeLayer;

/** The document evaluated at a frame (`Compositor.evaluate`), before texture resolution. */
export interface Composite {
  width: number;
  height: number;
  background: RGBA;
  layers: readonly CompositeLayer[];
}

export interface DrawList {
  /** Project frame size in px. */
  width: number;
  height: number;
  /** Shown where the layers leave the frame transparent (project settings, straight alpha). */
  background: RGBA;
  layers: readonly Layer[];
}

/** Every layer of `layers` with groups opened (their layers, then their matte's; spec §21.17). Allocates: not for playback. */
export function plainLayers(layers: readonly CompositeLayer[]): PlainCompositeLayer[] {
  const out: PlainCompositeLayer[] = [];
  for (const layer of layers) {
    if (layer.kind !== "group") out.push(layer);
    else out.push(...layer.layers, ...(layer.matte?.layers ?? []));
  }
  return out;
}
