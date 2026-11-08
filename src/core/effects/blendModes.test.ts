// Vitest twin of FlashFX-v2 scripts/verify-blend-modes.mjs @ a91c675 (the reference math of the 13 blend
// modes), plus the premultiplied composite the shaders return and the editor's hardware routing.
import { describe, expect, it } from "vitest";
import { BLEND_MODE_META, BLEND_MODES, blendChannel as bc, blendCode, blendRGB, compositeBlend, isHardwareBlend } from "./blendModes.js";

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("blend mode reference math (verify-blend-modes)", () => {
  it("normal = source (identity over backdrop)", () => {
    near(bc(0.3, 0.7, "normal"), 0.7);
    near(bc(0.0, 1.0, "normal"), 1.0);
  });

  it("multiply / screen are complementary and match known values", () => {
    near(bc(0.5, 0.5, "multiply"), 0.25);
    near(bc(0.5, 0.5, "screen"), 0.75);
    near(bc(0.2, 0.8, "screen"), 1 - 0.8 * 0.2);
    near(bc(1, 0.4, "multiply"), 0.4);
    near(bc(0, 0.4, "screen"), 0.4);
  });

  it("darken / lighten pick min / max", () => {
    near(bc(0.3, 0.7, "darken"), 0.3);
    near(bc(0.3, 0.7, "lighten"), 0.7);
  });

  it("overlay = hardLight with args swapped; both match the piecewise form", () => {
    near(bc(0.25, 0.6, "overlay"), 0.3);
    near(bc(0.25, 0.6, "hardLight"), 0.4);
    near(bc(0.7, 0.2, "overlay"), bc(0.2, 0.7, "hardLight"));
  });

  it("difference / exclusion", () => {
    near(bc(0.8, 0.3, "difference"), 0.5);
    near(bc(0.5, 0.5, "exclusion"), 0.5);
    near(bc(1, 1, "difference"), 0);
  });

  it("colorDodge / colorBurn edge cases clamp correctly", () => {
    near(bc(0.5, 1, "colorDodge"), 1);
    near(bc(0, 0.9, "colorDodge"), 0);
    near(bc(0.5, 0, "colorBurn"), 0);
    near(bc(1, 0.5, "colorBurn"), 1);
    near(bc(0.5, 0.5, "colorDodge"), 1);
    // Adapted (W3C order): the backdrop is tested first.
    near(bc(0, 1, "colorDodge"), 0);
    near(bc(1, 0, "colorBurn"), 1);
  });

  it("add is linear dodge, clamped to 1", () => {
    near(bc(0.6, 0.6, "add"), 1);
    near(bc(0.3, 0.4, "add"), 0.7);
  });

  it("softLight is continuous at cs=0.5 (equals backdrop)", () => {
    near(bc(0.4, 0.5, "softLight"), 0.4, 1e-9);
    near(bc(0.9, 0.5, "softLight"), 0.9, 1e-9);
  });

  it("every channel result stays within [0,1] over a grid", () => {
    for (const mode of BLEND_MODES) {
      for (let cb = 0; cb <= 1.0001; cb += 0.1) {
        for (let cs = 0; cs <= 1.0001; cs += 0.1) {
          const v = bc(cb, cs, mode);
          expect(v >= -1e-9 && v <= 1 + 1e-9, `${mode}(${cb.toFixed(1)},${cs.toFixed(1)})=${v}`).toBe(true);
        }
      }
    }
  });

  it("blendRGB applies per channel", () => {
    const out = blendRGB([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "multiply");
    near(out[0], 0.1);
    near(out[1], 0.25);
    near(out[2], 0.4);
  });

  it("metadata: 13 modes, each labelled; hardware set is exactly normal/screen/add (adapted)", () => {
    expect(BLEND_MODES.length).toBe(13);
    for (const m of BLEND_MODES) expect(BLEND_MODE_META[m].label.length).toBeGreaterThan(0);
    expect(BLEND_MODES.filter((m) => isHardwareBlend(m)).sort()).toEqual(["add", "normal", "screen"]);
    expect(isHardwareBlend("overlay")).toBe(false);
    expect(isHardwareBlend("softLight")).toBe(false);
    expect(isHardwareBlend("darken")).toBe(false);
  });
});

describe("compositeBlend (the premultiplied composite of the shaders)", () => {
  it("over an opaque backdrop an opaque source gives B(cb, cs) exactly", () => {
    for (const mode of BLEND_MODES) {
      const out = compositeBlend([0.3, 0.6, 0.9, 1], [0.8, 0.2, 0.5, 1], mode);
      near(out[0], bc(0.3, 0.8, mode));
      near(out[1], bc(0.6, 0.2, mode));
      near(out[2], bc(0.9, 0.5, mode));
      near(out[3], 1);
    }
  });

  it("a transparent source leaves the backdrop; a transparent backdrop shows the source", () => {
    for (const mode of BLEND_MODES) {
      expect(compositeBlend([0.2, 0.3, 0.4, 1], [0, 0, 0, 0], mode)).toEqual([0.2, 0.3, 0.4, 1]);
      const shown = compositeBlend([0, 0, 0, 0], [0.25, 0.1, 0.05, 0.5], mode);
      shown.forEach((v, i) => near(v, [0.25, 0.1, 0.05, 0.5][i] as number));
    }
  });

  it("normal is source-over; the hardware blend states equal the formula for any alpha", () => {
    const b = [0.1, 0.4, 0.3, 0.8] as const;
    const s = [0.2, 0.05, 0.3, 0.5] as const;
    // normal: one, one - src alpha
    compositeBlend(b, s, "normal").forEach((v, i) => near(v, (s[i] as number) + (b[i] as number) * (1 - s[3])));
    // screen: one, one - src color (alpha: one, one - src alpha)
    compositeBlend(b, s, "screen").slice(0, 3).forEach((v, i) => near(v, (s[i] as number) + (b[i] as number) * (1 - (s[i] as number))));
    // add: one, one (no saturation here)
    compositeBlend(b, s, "add").slice(0, 3).forEach((v, i) => near(v, (s[i] as number) + (b[i] as number)));
    // add saturates like the hardware: half-transparent white over 0.6 gray gives 1, not 0.8.
    near(compositeBlend([0.6, 0.6, 0.6, 1], [0.5, 0.5, 0.5, 0.5], "add")[0], 1);
  });

  it("blend codes are the indices of BLEND_MODES (normal 0)", () => {
    expect(blendCode(undefined)).toBe(0);
    expect(blendCode("normal")).toBe(0);
    expect(blendCode("exclusion")).toBe(12);
    BLEND_MODES.forEach((m, i) => expect(blendCode(m)).toBe(i));
  });
});
