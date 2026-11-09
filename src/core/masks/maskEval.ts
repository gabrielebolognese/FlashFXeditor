// Masks at a frame (spec §21.18, Batch 73): a clip's masks with their `masks.<id>.<field>` keys applied,
// and the base / keyed value of each field (what the Masks section shows and edits).
// - Box fields x, y, w, h, radius (rectangles and ellipses; radius rectangles only), and feather,
//   expansion, opacity on any mask are numbers; `path` is a path mask's points (core/masks/maskPath.ts).
// - Unkeyed masks are returned as they are (no copy): a static clip allocates nothing per frame.
// Pure.
import { MASK_PROP_PATTERN, sampleKeys, sampleVector, type Key } from "../document/keyframes.js";
import type { Frame, Keyframes, Mask } from "../document/types.js";
import { maskPathData, maskPathPoints } from "./maskPath.js";

/** The number fields of a mask. */
export const MASK_NUMBER_FIELDS = ["x", "y", "w", "h", "radius", "feather", "expansion", "opacity"] as const;
export type MaskNumberField = (typeof MASK_NUMBER_FIELDS)[number];
export type MaskField = MaskNumberField | "path";

const BOX_FIELDS: ReadonlySet<string> = new Set(["x", "y", "w", "h", "radius"]);

/** The prop id of a mask field. */
export const maskProp = (id: string, field: MaskField): string => `masks.${id}.${field}`;

/** Whether `field` exists on `mask` (box fields on boxes, radius on rectangles, path on paths). */
export function maskHasField(mask: Mask, field: MaskField): boolean {
  if (field === "path") return mask.shape.kind === "path";
  if (field === "radius") return mask.shape.kind === "rect";
  if (BOX_FIELDS.has(field)) return mask.shape.kind !== "path";
  return true;
}

/** The base value of a number field (undefined when the mask has no such field). */
export function maskBase(mask: Mask, field: MaskNumberField): number | undefined {
  if (!maskHasField(mask, field)) return undefined;
  if (field === "feather" || field === "expansion" || field === "opacity") return mask[field];
  const shape = mask.shape;
  if (shape.kind === "path") return undefined;
  return field === "radius" ? (shape.radius ?? 0) : shape[field as "x" | "y" | "w" | "h"];
}

/** Sets the base value of a number field on a (draft) mask; clamps sizes, feather and opacity. */
export function writeMaskBase(mask: Mask, field: MaskNumberField, value: number): void {
  if (!maskHasField(mask, field) || !Number.isFinite(value)) return;
  if (field === "feather") mask.feather = Math.max(0, value);
  else if (field === "expansion") mask.expansion = value;
  else if (field === "opacity") mask.opacity = Math.min(1, Math.max(0, value));
  else if (mask.shape.kind !== "path") {
    if (field === "radius") mask.shape.radius = Math.max(0, value);
    else mask.shape[field as "x" | "y" | "w" | "h"] = field === "w" || field === "h" ? Math.max(0, value) : value;
  }
}

/** Whether `keyframes` keys any mask field. */
export function hasMaskKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  for (const prop in keyframes) if (prop.startsWith("masks.") && (keyframes[prop]?.length ?? 0) > 0) return true;
  return false;
}

/** The keys of a mask field, or undefined. */
export function maskKeys(keyframes: Keyframes | undefined, id: string, field: MaskField): readonly Key[] | undefined {
  const keys = keyframes?.[maskProp(id, field)];
  return keys && keys.length > 0 ? keys : undefined;
}

/** The value a number field shows `rel` frames into the clip (its keys, else the base). */
export function maskValueAt(mask: Mask, keyframes: Keyframes | undefined, field: MaskNumberField, rel: Frame): number | undefined {
  const keys = maskKeys(keyframes, mask.id, field);
  if (keys && maskHasField(mask, field)) return sampleKeys(keys, rel);
  return maskBase(mask, field);
}

/** The points a path mask shows at `rel` (its keys when their count matches the base path, else the base); null for a box. */
export function maskPointsAt(mask: Mask, keyframes: Keyframes | undefined, rel: Frame): number[] | null {
  if (mask.shape.kind !== "path") return null;
  const base = maskPathPoints(mask.shape.d);
  if (!base) return null;
  const keys = maskKeys(keyframes, mask.id, "path");
  if (!keys) return base;
  const points = sampleVector(keys, rel, []);
  return points.length === base.length ? points : base;
}

/** `mask` as it shows at `rel` (a copy when any of its fields is keyed, else itself). */
export function maskAt(mask: Mask, keyframes: Keyframes | undefined, rel: Frame): Mask {
  let copy: Mask | null = null;
  for (const field of MASK_NUMBER_FIELDS) {
    const keys = maskKeys(keyframes, mask.id, field);
    if (!keys || !maskHasField(mask, field)) continue;
    copy ??= { ...mask, shape: { ...mask.shape } };
    writeMaskBase(copy, field, sampleKeys(keys, rel));
  }
  if (mask.shape.kind === "path" && maskKeys(keyframes, mask.id, "path")) {
    const points = maskPointsAt(mask, keyframes, rel);
    if (points) {
      copy ??= { ...mask, shape: { ...mask.shape } };
      copy.shape = { kind: "path", d: maskPathData(mask.shape.d, points) };
    }
  }
  return copy ?? mask;
}

const NONE: readonly Mask[] = [];

/** The masks of a clip at `rel` frames into it: its own array when none is keyed. */
export function masksAt(clip: { masks?: Mask[] | undefined; keyframes?: Keyframes | undefined }, rel: Frame): readonly Mask[] {
  const masks = clip.masks;
  if (!masks || masks.length === 0) return NONE;
  if (!hasMaskKeys(clip.keyframes)) return masks;
  return masks.map((mask) => maskAt(mask, clip.keyframes, rel));
}

/** Whether the clip has masks. */
export function hasMasks(clip: { masks?: Mask[] | undefined }): boolean {
  return (clip.masks?.length ?? 0) > 0;
}

/** Whether `prop` is a mask prop of mask `id`. */
export function isPropOfMask(prop: string, id: string): boolean {
  const match = MASK_PROP_PATTERN.exec(prop);
  return match !== null && match[1] === id;
}
