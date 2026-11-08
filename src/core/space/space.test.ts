// The checks of FlashFX-v2 scripts/verify-mat4.mjs and scripts/verify-camera3d.mjs @ a91c675 (the parts this
// editor ported: no camera layers, lens presets or depth of field), as Vitest tests.
import { describe, expect, it } from "vitest";
import { cameraSpaceDepth, cardMatrix, cardMVP, frameCamera, painterOrder } from "./camera3d.js";
import { composeModel, identity, lookAt, multiply, multiplyAll, perspective, rotateX, rotateY, rotateZ, scale, transformPoint, translate, type Mat4 } from "./mat4.js";

const near = (a: readonly number[], b: readonly number[], e = 1e-9) => a.every((x, i) => Math.abs(x - (b[i] as number)) <= e);

describe("mat4 (verify-mat4)", () => {
  it("identity is neutral and multiply is associative", () => {
    const a = translate(3, -2, 5);
    expect(near(multiply(identity(), a), a)).toBe(true);
    expect(near(multiply(a, identity()), a)).toBe(true);
    const b = rotateZ(0.6);
    const c = scale(2, 3, 4);
    expect(near(multiply(multiply(a, b), c), multiply(a, multiply(b, c)), 1e-8)).toBe(true);
  });

  it("translate, scale and the axis rotations move points the right way", () => {
    expect(near(transformPoint(translate(1, 2, 3), 0, 0, 0), [1, 2, 3, 1])).toBe(true);
    expect(near(transformPoint(scale(2, 3, 4), 1, 1, 1), [2, 3, 4, 1])).toBe(true);
    expect(near(transformPoint(rotateZ(Math.PI / 2), 1, 0, 0), [0, 1, 0, 1])).toBe(true);
    expect(near(transformPoint(rotateX(Math.PI / 2), 0, 1, 0), [0, 0, 1, 1])).toBe(true);
    expect(near(transformPoint(rotateY(Math.PI / 2), 0, 0, 1), [1, 0, 0, 1])).toBe(true);
  });

  it("lookAt puts the eye at the origin and the target on -z; perspective foreshortens", () => {
    const v = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    expect(near(transformPoint(v, 0, 0, 10).slice(0, 3), [0, 0, 0], 1e-8)).toBe(true);
    expect(transformPoint(v, 0, 0, 0)[2]).toBeLessThan(0);
    const p = perspective(Math.PI / 3, 16 / 9, 0.1, 1000);
    const a = transformPoint(p, 1, 0, -1);
    const b = transformPoint(p, 1, 0, -2);
    expect(a[3]).toBeCloseTo(1, 9);
    expect(b[3]).toBeCloseTo(2, 9);
    expect(Math.abs(a[0] / a[3])).toBeGreaterThan(Math.abs(b[0] / b[3]));
  });

  it("composeModel: identity for the neutral TRS, the anchor maps to the position", () => {
    expect(near(composeModel([0, 0, 0], [0, 0, 0], [1, 1, 1], [0, 0, 0]), identity(), 1e-12)).toBe(true);
    const model = composeModel([100, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1], [10, 0, 0]);
    expect(near(transformPoint(model, 10, 0, 0).slice(0, 3), [100, 0, 0], 1e-8)).toBe(true);
    expect(near(multiplyAll(translate(1, 0, 0), translate(2, 0, 0)), translate(3, 0, 0), 1e-12)).toBe(true);
  });
});

/** Clip space -> frame px (y down). */
function toPx(m: Mat4, x: number, y: number, w: number, h: number): [number, number] {
  const p = transformPoint(m, x, y, 0);
  return [((p[0] / p[3] + 1) * w) / 2, ((1 - p[1] / p[3]) * h) / 2];
}

describe("camera3d (verify-camera3d)", () => {
  const W = 1080;
  const H = 1920;

  it("a flat card at z = 0 maps exactly to its 2D place, for any viewing distance", () => {
    for (const distance of [400, 1600, 5000]) {
      const camera = frameCamera(W, H, distance);
      for (const [x, y] of [[0, 0], [W, 0], [W, H], [123, 456]] as const) {
        const [px, py] = toPx(camera.viewProjection, x, y, W, H);
        expect(px).toBeCloseTo(x, 6);
        expect(py).toBeCloseTo(y, 6);
      }
    }
  });

  it("cardMVP with no 3D is the 2D map; an X rotation foreshortens; +z projects smaller", () => {
    const camera = frameCamera(W, H, 1600);
    const flat = cardMVP(camera, [0, 0, 0], [540, 960], [0, 0, 0]);
    expect(toPx(flat, 100, 200, W, H)[0]).toBeCloseTo(100, 6);
    const tilted = cardMatrix([0, 0, 0], [540, 960], [40, 0, 0]);
    expect(transformPoint(tilted, 540, 760, 0)[2]).not.toBeCloseTo(transformPoint(tilted, 540, 1160, 0)[2], 3);
    const far = cardMVP(camera, [0, 0, 800], [540, 960], [0, 0, 0]);
    const [x] = toPx(far, 1040, 960, W, H);
    expect(x - 540).toBeLessThan(500);
  });

  it("cameraSpaceDepth: a farther card is more negative", () => {
    const camera = frameCamera(W, H, 1600);
    expect(cameraSpaceDepth(camera, translate(0, 0, 500))).toBeLessThan(cameraSpaceDepth(camera, translate(0, 0, 0)));
  });

  it("painterOrder sorts 3D runs far to near, 2D items pin, ties keep their order", () => {
    expect(painterOrder([{ is3D: true, depth: -1 }, { is3D: true, depth: -9 }, { is3D: true, depth: -5 }])).toEqual([1, 2, 0]);
    expect(painterOrder([{ is3D: true, depth: -1 }, { is3D: false, depth: 0 }, { is3D: true, depth: -9 }, { is3D: true, depth: -2 }])).toEqual([0, 1, 2, 3]);
    expect(painterOrder([{ is3D: true, depth: -3 }, { is3D: true, depth: -3 }, { is3D: false, depth: 0 }])).toEqual([0, 1, 2]);
  });
});
