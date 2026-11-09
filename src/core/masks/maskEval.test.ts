import { describe, expect, it } from "vitest";
import { setKey } from "../document/keyframes.js";
import type { Keyframes, Mask } from "../document/types.js";
import { hasMaskKeys, maskAt, maskBase, maskHasField, masksAt, maskValueAt, maskPointsAt, writeMaskBase } from "./maskEval.js";

const rect: Mask = { id: "r", shape: { kind: "rect", x: 0, y: 0, w: 100, h: 50 }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false };
const path: Mask = { id: "p", shape: { kind: "path", d: "M0 0 L100 0 L100 100 Z" }, mode: "add", feather: 2, expansion: 0, opacity: 1, inverted: false };

describe("masks at a frame", () => {
  it("unkeyed masks are returned as they are", () => {
    const clip = { masks: [rect] };
    expect(masksAt(clip, 10)).toBe(clip.masks);
    expect(masksAt({}, 0)).toEqual([]);
    expect(hasMaskKeys(undefined)).toBe(false);
  });

  it("keyed fields take their keys; others keep the base", () => {
    const keyframes: Keyframes = { "masks.r.w": setKey(setKey([], 0, 0), 10, 100), "masks.r.feather": setKey([], 0, 8) };
    const shown = masksAt({ masks: [rect], keyframes }, 5)[0] as Mask;
    expect(shown.shape).toEqual({ kind: "rect", x: 0, y: 0, w: 50, h: 50 });
    expect(shown.feather).toBe(8);
    expect(rect.shape).toEqual({ kind: "rect", x: 0, y: 0, w: 100, h: 50 });
    expect(maskValueAt(rect, keyframes, "w", 10)).toBe(100);
    expect(maskValueAt(rect, keyframes, "h", 10)).toBe(50);
  });

  it("a keyed path morphs while the point counts match, else shows the base", () => {
    const keyframes: Keyframes = { "masks.p.path": setKey(setKey([], 0, [0, 0, 100, 0, 100, 100]), 10, [0, 0, 50, 0, 50, 50]) };
    expect(maskPointsAt(path, keyframes, 5)).toEqual([0, 0, 75, 0, 75, 75]);
    expect(maskAt(path, keyframes, 10).shape).toEqual({ kind: "path", d: "M0 0L50 0L50 50Z" });
    const wrong: Keyframes = { "masks.p.path": setKey([], 0, [0, 0, 1, 1]) };
    expect(maskPointsAt(path, wrong, 0)).toEqual([0, 0, 100, 0, 100, 100]);
  });

  it("fields exist per shape kind; writes clamp", () => {
    expect(maskHasField(rect, "radius")).toBe(true);
    expect(maskHasField({ ...rect, shape: { kind: "ellipse", x: 0, y: 0, w: 1, h: 1 } }, "radius")).toBe(false);
    expect(maskHasField(path, "x")).toBe(false);
    expect(maskBase(path, "feather")).toBe(2);
    const copy: Mask = structuredClone(rect);
    writeMaskBase(copy, "w", -5);
    writeMaskBase(copy, "opacity", 2);
    writeMaskBase(copy, "feather", -1);
    expect([copy.shape.kind === "rect" && copy.shape.w, copy.opacity, copy.feather]).toEqual([0, 1, 0]);
  });
});
