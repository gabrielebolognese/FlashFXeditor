// The number properties of the Solid section (spec §11 "Solid properties: fill, shape, size, radius",
// Batch 34), in project px. Each reads one value of a solid and writes the solid's new look. Pure:
// solidBinding.ts applies them.
import type { SolidClip } from "../../core/document/types.js";
import { SOLID_LIMITS, type SolidEdit } from "../../timeline/edit/solid.js";

export interface SolidNumberProp {
  /** Stable id (the coalesce key of arrow steps). */
  id: string;
  /** Undo history label. */
  label: string;
  precision: number;
  min: number;
  max: number;
  read(clip: SolidClip): number;
  write(clip: SolidClip, value: number): SolidEdit;
}

export const SOLID_WIDTH: SolidNumberProp = {
  id: "solidWidth",
  label: "Change size",
  precision: 0,
  ...SOLID_LIMITS.size,
  read: (clip) => clip.size.w,
  write: (clip, w) => ({ size: { ...clip.size, w } }),
};

export const SOLID_HEIGHT: SolidNumberProp = {
  id: "solidHeight",
  label: "Change size",
  precision: 0,
  ...SOLID_LIMITS.size,
  read: (clip) => clip.size.h,
  write: (clip, h) => ({ size: { ...clip.size, h } }),
};

export const SOLID_RADIUS: SolidNumberProp = {
  id: "solidRadius",
  label: "Change corner radius",
  precision: 0,
  ...SOLID_LIMITS.radius,
  read: (clip) => clip.cornerRadius,
  write: (_clip, cornerRadius) => ({ cornerRadius }),
};
