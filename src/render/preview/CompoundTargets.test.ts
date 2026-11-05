import { describe, expect, it } from "vitest";
import type { DrawList } from "../compositor/drawList.js";
import type { OffscreenTarget, TextureHandle } from "../gpu/renderer.js";
import { CompoundTargets, type CompoundGpu } from "./CompoundTargets.js";

function fakeGpu() {
  const made: OffscreenTarget[] = [];
  const released: OffscreenTarget[] = [];
  const drawn: { list: DrawList; target: OffscreenTarget }[] = [];
  const gpu: CompoundGpu = {
    maxTextureSize: 8192,
    createOffscreenTarget(width, height) {
      const texture: TextureHandle = { width, height, mipLevels: 1, bytes: width * height * 4, valid: true, destroy() {} };
      const target: OffscreenTarget = { kind: "offscreen", width, height, texture };
      made.push(target);
      return target;
    },
    releaseTarget: (target) => void released.push(target as OffscreenTarget),
    draw: (list, target) => (drawn.push({ list, target: target as OffscreenTarget }), true),
  };
  return { gpu, made, released, drawn };
}

const list = (r: number): DrawList => ({ width: 10, height: 10, background: { r, g: 0, b: 0, a: 1 }, layers: [] });

describe("CompoundTargets (spec §21.10, P3)", () => {
  it("draws a static compound once, and again, into the other target, when its list changes", () => {
    const { gpu, drawn } = fakeGpu();
    const targets = new CompoundTargets(gpu);
    const pass = (l: DrawList) => {
      targets.begin();
      const texture = targets.render("c", l, 10, 10);
      targets.end();
      return texture;
    };
    const first = pass(list(0));
    expect(pass(list(0))).toBe(first);
    expect(pass(list(0))).toBe(first);
    expect(targets.stats.renders).toBe(1);
    expect(targets.stats.kept).toBe(1);
    const second = pass(list(0.5));
    expect(second).not.toBe(first);
    expect(targets.stats.renders).toBe(2);
    expect(drawn).toHaveLength(2);
    expect(pass(list(0.9))).toBe(first);
    expect(targets.stats.bytes).toBe(2 * 10 * 10 * 4);
  });

  it("releases the targets of a compound that is not drawn in a pass, and of clear()", () => {
    const { gpu, released } = fakeGpu();
    const targets = new CompoundTargets(gpu);
    targets.begin();
    targets.render("a", list(0), 10, 10);
    targets.render("b", list(0), 10, 10);
    targets.end();
    targets.begin();
    targets.render("a", list(0), 10, 10);
    targets.end();
    expect(released).toHaveLength(1);
    targets.clear();
    expect(released).toHaveLength(2);
    expect(targets.stats.bytes).toBe(0);
  });

  it("tells its owner the bytes it holds after each pass and when cleared (the pool reserves them: P6)", () => {
    const { gpu } = fakeGpu();
    const heard: number[] = [];
    const targets = new CompoundTargets(gpu, (bytes) => heard.push(bytes));
    targets.begin();
    targets.render("a", list(0), 10, 10);
    targets.end();
    targets.begin();
    targets.end();
    targets.clear();
    expect(heard).toEqual([400, 0, 0]);
  });

  it("clamps the texture size to the limit and keeps the aspect", () => {
    const { gpu } = fakeGpu();
    const targets = new CompoundTargets(gpu);
    expect(targets.sizeFor(1080, 1920, 1)).toEqual({ width: 1080, height: 1920 });
    expect(targets.sizeFor(1080, 1920, 4)).toEqual({ width: 2304, height: 4096 });
    expect(targets.sizeFor(1080, 1920, 0.5)).toEqual({ width: 540, height: 960 });
  });

  it("draws again when the target size changes", () => {
    const { gpu, released } = fakeGpu();
    const targets = new CompoundTargets(gpu);
    targets.begin();
    targets.render("c", list(0), 10, 10);
    targets.end();
    targets.begin();
    const texture = targets.render("c", list(0), 20, 20);
    targets.end();
    expect(texture?.width).toBe(20);
    expect(released).toHaveLength(1);
  });
});
