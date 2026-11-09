import { describe, expect, it } from "vitest";
import { setKey } from "../document/keyframes.js";
import { EFFECT_TYPES, type Effect } from "../document/types.js";
import { EFFECT_BLOCK, effectCode, effectTypeOf, effectValueAt, hasActiveEffects, packEffects, paramOffset } from "./effectEval.js";
import { clampParam, EFFECT_DEFS, effectFilePaths, effectIssues, effectParamDef, effectPropIssue, isEffectProp, isProjectFile, newEffect, projectEffectFiles } from "./effectParams.js";

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

describe("Effects II parameters (spec §21.19, Batch 75)", () => {
  it("defines the color, stylize, key and LUT types", () => {
    for (const type of ["colorAdjust", "vignette", "sharpen", "grain", "chromaKey", "lumaKey", "lut"] as const) expect(EFFECT_TYPES).toContain(type);
    expect(newEffect("chromaKey", "k").params).toEqual({ color: [0, 0.694, 0.251, 1], tolerance: 0.18, softness: 0.12, spill: 0.6 });
    expect(newEffect("lut", "l").params).toEqual({ file: "", intensity: 1 });
    expect(effectParamDef("colorAdjust", "exposure")?.step).toBe(0.01);
  });

  it("takes a LUT file inside luts/ ending in .cube, or none; never keyed", () => {
    const def = effectParamDef("lut", "file");
    expect(def?.kind).toBe("file");
    expect(def?.keyframeable).toBe(false);
    const lut = (file: unknown): Effect => ({ id: "l", type: "lut", enabled: true, params: { file: file as string } });
    for (const ok of ["", "luts/warm.cube", "luts/My Look 2.CUBE"]) expect(effectIssues([lut(ok)], "clip")).toEqual([]);
    for (const bad of ["warm.cube", "media/warm.cube", "luts/warm.png", "luts/a/b.cube", "luts/../b.cube", "luts/.cube", "luts/.hidden.cube", "luts/a:b.cube", 3, [1]]) {
      expect(effectIssues([lut(bad)], "clip").length).toBeGreaterThan(0);
    }
    expect(isProjectFile({ folder: "luts", extension: ".cube" }, "luts/x.cube")).toBe(true);
    expect(isEffectProp("effects.l.intensity")).toBe(true);
    expect(effectPropIssue("effects.l.file", [lut("luts/x.cube")])).not.toBeNull();
  });

  it("lists the files a stack and a project name, once each", () => {
    const effects: Effect[] = [
      { id: "a", type: "lut", enabled: true, params: { file: "luts/a.cube" } },
      { id: "b", type: "lut", enabled: false, params: { file: "luts/b.cube" } },
      { id: "c", type: "lut", enabled: true, params: { file: "" } },
      { id: "d", type: "lut", enabled: true, params: { file: "luts/a.cube" } },
    ];
    expect(effectFilePaths(effects)).toEqual(["luts/a.cube", "luts/b.cube"]);
    expect(projectEffectFiles({ x: { effects }, y: { effects: [{ id: "e", type: "lut", enabled: true, params: { file: "luts/c.cube" } }] }, z: {} })).toEqual(["luts/a.cube", "luts/b.cube", "luts/c.cube"]);
  });

  it("packs a LUT's handle through the resolver and the grain's frame when animated", () => {
    const data = new Float32Array(EFFECT_BLOCK * 3);
    const effects: Effect[] = [
      { id: "l", type: "lut", enabled: true, params: { file: "luts/a.cube", intensity: 0.5 } },
      { id: "g", type: "grain", enabled: true, params: { animated: 1 } },
      { id: "h", type: "grain", enabled: true, params: { animated: 0 } },
    ];
    expect(packEffects({ effects }, 7, data, (path) => (path === "luts/a.cube" ? 4 : 0))).toBe(EFFECT_BLOCK * 3);
    expect(data[paramOffset("lut", "file")]).toBe(4);
    expect(data[paramOffset("lut", "intensity")]).toBe(0.5);
    expect(data[EFFECT_BLOCK + 15]).toBe(7);
    expect(data[EFFECT_BLOCK * 2 + 15]).toBe(0);
    // Without a resolver (or an unknown file) the handle is 0: the pass is skipped.
    packEffects({ effects }, 7, data);
    expect(data[paramOffset("lut", "file")]).toBe(0);
  });
});
