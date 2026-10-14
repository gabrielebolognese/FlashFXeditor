// The draw list (spec §9.4): what `Renderer.draw` draws for one frame. Layers are in project pixel
// space, bottom to top. Backend-neutral: textures are opaque `TextureHandle`s.
// `Compositor.evaluate` produces a `Composite`: the same list with media layers still naming their
// frame (media and time) instead of a texture. The preview resolves them to pool textures, and skips
// the redraw when the resolved list equals the one it drew last (`DrawListSnapshot`).
import type { ClipId, MediaId, RGBA, TrackId } from "../../core/document/types.js";
import type { Mat3 } from "../mat3.js";
import type { TextureHandle } from "../gpu/renderer.js";

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
}

export interface TextureLayer extends LayerBase {
  kind: "texture";
  texture: TextureHandle;
  /** The part of the texture shown on the quad (crop). */
  crop: UvRect;
  flipX: boolean;
  flipY: boolean;
}

/** Two textures mixed by `mix` (0 = from, 1 = to): the dissolve transition (Batch 36). */
export interface DissolveLayer extends LayerBase {
  kind: "dissolve";
  from: TextureHandle;
  to: TextureHandle;
  mix: number;
  crop: UvRect;
}

/** A flat color quad (solids, dip to color). `color` has straight alpha. */
export interface SolidLayer extends LayerBase {
  kind: "solid";
  color: RGBA;
}

export type Layer = TextureLayer | DissolveLayer | SolidLayer;

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
}

export type CompositeLayer = MediaLayer | SolidLayer;

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
