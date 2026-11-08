// Ported from FlashFX-v2 src/core/camera3d.ts @ a91c675, adapted.
// The fixed 2.5D camera of the editor (spec §21.15, Batch 70): the viewer sits `distance` px in front of
// the frame center looking at it, so a layer at z = 0 with no X or Y rotation projects to exactly its 2D
// place (the parity property of the FlashFX-v2 verify:camera3d harness), and painter's order for depth
// sorting. Left out (spec §21.15 "Out"): moving cameras, lens presets and depth of field.
import { lookAt, multiply, multiplyAll, perspective, rotateX, rotateY, rotateZ, transformPoint, translate, type Mat4, type Vec2, type Vec3 } from "./mat4.js";

/** The raster space is y down: "up" is -y, so a flat card maps to ndc = (2x / W - 1, 1 - 2y / H). */
const COMP_UP: Vec3 = [0, -1, 0];

export const deg2rad = (d: number): number => (d * Math.PI) / 180;

/** A camera resolved to matrices. */
export interface ResolvedCamera {
  /** World -> camera space. */
  view: Mat4;
  /** Camera -> clip space (WebGPU depth 0..1). */
  projection: Mat4;
  /** projection * view. */
  viewProjection: Mat4;
  eye: Vec3;
  target: Vec3;
  /** Vertical field of view, radians. */
  fovY: number;
  /** The viewing distance, px (a card at z = 0 keeps its 2D size). */
  zoom: number;
  aspect: number;
}

/** Vertical field of view (radians) for a viewing distance `zoom` (px) framing a frame `compH` px tall. */
export function fovYForZoom(zoom: number, compH: number): number {
  return 2 * Math.atan(compH / 2 / Math.max(1e-6, zoom));
}

export function cameraFromParams(params: { eye: Vec3; target: Vec3; zoom: number; compW: number; compH: number }): ResolvedCamera {
  const { eye, target, zoom, compW, compH } = params;
  const aspect = compW / Math.max(1e-6, compH);
  const fovY = fovYForZoom(zoom, compH);
  const near = Math.max(1, zoom * 0.001);
  const far = zoom * 1000 + compH * 100;
  const view = lookAt(eye, target, COMP_UP);
  const projection = perspective(fovY, aspect, near, far);
  return { view, projection, viewProjection: multiply(projection, view), eye, target, fovY, zoom, aspect };
}

/** The editor's camera: centered, `distance` px in front of the frame (the project's or the sequence's perspective). */
export function frameCamera(compW: number, compH: number, distance: number): ResolvedCamera {
  const cx = compW / 2;
  const cy = compH / 2;
  return cameraFromParams({ eye: [cx, cy, -distance], target: [cx, cy, 0], zoom: distance, compW, compH });
}

/** A3D = T(pos) * T(pivot) * Rz * Ry * Rx * T(-pivot) (degrees): with rotX = rotY = pos.z = 0 the flat 2D map. */
export function cardMatrix(pos: Vec3, pivot: Vec2, rotDegXYZ: Vec3): Mat4 {
  const r = multiplyAll(rotateZ(deg2rad(rotDegXYZ[2])), rotateY(deg2rad(rotDegXYZ[1])), rotateX(deg2rad(rotDegXYZ[0])));
  return multiplyAll(translate(pos[0], pos[1], pos[2]), translate(pivot[0], pivot[1], 0), r, translate(-pivot[0], -pivot[1], 0));
}

/** The matrix a card's points go through: the camera after `cardMatrix` (P * V * A3D). */
export function cardMVP(camera: ResolvedCamera, pos: Vec3, pivot: Vec2, rotDegXYZ: Vec3): Mat4 {
  return multiply(camera.viewProjection, cardMatrix(pos, pivot, rotDegXYZ));
}

/** Camera-space depth of a layer's origin: points in front are negative, farther points more negative. */
export function cameraSpaceDepth(camera: ResolvedCamera, worldMatrix: Mat4): number {
  const w = transformPoint(worldMatrix, 0, 0, 0);
  const iw = w[3] || 1;
  return transformPoint(camera.view, w[0] / iw, w[1] / iw, w[2] / iw)[2];
}

export interface DepthSortItem {
  is3D: boolean;
  depth: number;
}

/**
 * Painter's order (a permutation of the indices): runs of consecutive 3D items sorted far to near
 * (ascending camera-space depth, stable); 2D items pin the order and split the runs.
 */
export function painterOrder(items: readonly DepthSortItem[]): number[] {
  const out: number[] = [];
  let run: number[] = [];
  const flush = () => {
    run.sort((a, b) => (items[a] as DepthSortItem).depth - (items[b] as DepthSortItem).depth);
    for (const index of run) out.push(index);
    run = [];
  };
  for (let i = 0; i < items.length; i++) {
    if ((items[i] as DepthSortItem).is3D) run.push(i);
    else {
      flush();
      out.push(i);
    }
  }
  flush();
  return out;
}
