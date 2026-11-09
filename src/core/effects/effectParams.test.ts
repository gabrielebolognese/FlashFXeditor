import { describe, expect, it } from "vitest";
import { setKey } from "../document/keyframes.js";
import { EFFECT_TYPES, type Effect } from "../document/types.js";
import { EFFECT_BLOCK, effectCode, effectTypeOf, effectValueAt, hasActiveEffects, packEffects, paramOffset } from "./effectEval.js";
import { clampParam, EFFECT_DEFS, effectIssues, effectParamDef, effectPropIssue, isEffectProp, newEffect } from "./effectParams.js";

describe("effect parameters (spec §21.19, Batch 74)", () => {
  it("gives every type its defaults, each valid", () => {
    for (const type of EFFECT_TYPES) {
      const effect = newEffect(type, "fx1");
      expect(Object.keys(effect.params).sort()).toEqual(EFFECT_DEFS[type].params.map((p) => p.name).sort());
      expect(effectIssues([effect], "clip")).toEqual([]);
      expect(effectTypeOf(effectCode(type))).toBe(type);
    }
  });

  it("reports wrong effects: ids, types, unknown parameters, out of range values", () => {
    const blur = newEffect("gaussianBlur", "a");
    expect(effectIssues("x", "c")).toEqual(["c: effects must be a list"]);
    expect(effectIssues([blur, { ...blur }], "c")).toEqual(['c: effects[1]: id "a" is used twice']);
    expect(effectIssues([{ ...blur, id: "a b" }], "c")[0]).toContain("id must be");
    expect(effectIssues([{ ...blur, type: "sepia" }], "c")[0]).toContain("type must be one of");
    expect(effectIssues([{ ...blur, params: { size: 3 } }], "c")).toEqual(['c: effects[0]: gaussianBlur has no parameter "size"']);
    expect(effectIssues([{ ...blur, params: { radius: 600 } }], "c")).toEqual(["c: effects[0]: params.radius must be in 0..500"]);
    expect(effectIssues([{ ...blur, params: { repeatEdges: 2 } }], "c")).toEqual(["c: effects[0]: params.repeatEdges must be 0 or 1"]);
    expect(effectIssues([{ ...newEffect("outline", "o"), params: { color: [1, 2, 0, 1] } }], "c")).toEqual(["c: effects[0]: params.color must have channels in 0..1"]);
    expect(effectIssues([{ ...newEffect("glow", "g"), params: { mode: "middle" } }], "c")).toEqual(["c: effects[0]: params.mode must be one of outer, inner"]);
  });

  it("clamps values into their range and keys only keyframeable parameters", () => {
    expect(clampParam(effectParamDef("gaussianBlur", "radius")!, 900)).toBe(500);
    expect(clampParam(effectParamDef("outline", "color")!, [2, -1, 0.5, 1])).toEqual([1, 0, 0.5, 1]);
    const effects = [newEffect("glow", "g")];
    expect(isEffectProp("effects.g.intensity")).toBe(true);
    expect(effectPropIssue("effects.g.intensity", effects)).toBeNull();
    expect(effectPropIssue("effects.g.mode", effects)).toBe("glow mode cannot be keyed");
    expect(effectPropIssue("effects.x.radius", effects)).toBe('the clip has no effect "x"');
  });

  it("samples keys and packs enabled effects only, in order", () => {
    const glow = newEffect("glow", "g");
    const blur: Effect = { ...newEffect("gaussianBlur", "b"), enabled: false };
    const keyframes = { "effects.g.intensity": setKey(setKey([], 0, 0), 10, 1), "effects.g.color": setKey(setKey([], 0, [1, 0, 0, 1]), 10, [0, 0, 1, 1]) };
    expect(effectValueAt(glow, keyframes, effectParamDef("glow", "intensity")!, 5)).toBeCloseTo(0.5, 5);
    expect(effectValueAt(glow, keyframes, effectParamDef("glow", "color")!, 5)).toEqual([0.5, 0, 0.5, 1]);
    expect(effectValueAt(glow, undefined, effectParamDef("glow", "radius")!, 5)).toBe(20);
    const clip = { effects: [blur, glow], keyframes };
    expect(hasActiveEffects(clip)).toBe(true);
    expect(hasActiveEffects({ effects: [blur] })).toBe(false);
    const out = new Float32Array(2 * EFFECT_BLOCK);
    expect(packEffects(clip, 10, out)).toBe(EFFECT_BLOCK);
    expect(out[0]).toBe(effectCode("glow"));
    expect(out[paramOffset("glow", "intensity")]).toBe(1);
  });
});
