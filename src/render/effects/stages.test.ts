import { describe, expect, it } from "vitest";
import { newEffect } from "../../core/effects/effectParams.js";
import { EFFECT_BLOCK, packEffects } from "../../core/effects/effectEval.js";
import type { Effect } from "../../core/document/types.js";
import { FULL_UV, type DrawList, type EffectFrame, type Layer } from "../compositor/drawList.js";
import { applyToPoint, rectTransform, type Mat3 } from "../mat3.js";
import { DrawRecords, MAX_STAGE_SIZE, retargetStages, ROLE, sameSignature, stageScale } from "../gpu/drawRecords.js";
import type { Pane, TextureHandle } from "../gpu/renderer.js";
import { EffectPlan, FX_BUFFER } from "./effectPlan.js";
import { blurTaps, EFFECT_REGISTRY, FX_PROGRAM, FX_SLOT, outlineSteps, stackReach } from "./registry.js";
import { StageJobs } from "./stageJobs.js";
import { lutLibrary } from "./lutLibrary.js";

class FakeTexture implements TextureHandle {
  valid = true;
  readonly mipLevels = 1;
  readonly bytes = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  destroy(): void {
    this.valid = false;
  }
}
const usable = (texture: TextureHandle): texture is FakeTexture => texture instanceof FakeTexture && texture.valid;

function packed(effects: Effect[]): { data: Float32Array; length: number } {
  const data = new Float32Array(EFFECT_BLOCK * effects.length);
  return { data, length: packEffects({ effects }, 0, data) };
}

function frame(effects: Effect[], model: Mat3, width: number, height: number, opacity = 1, version = 1): EffectFrame {
  const { data, length } = packed(effects);
  return { clipId: "clip", data, length, version, width, height, model, persp: null, opacity };
}

function group(texture: FakeTexture, effects: EffectFrame, opacity = 1, blend: "normal" | "multiply" = "normal"): Layer {
  return {
    kind: "group",
    transform: effects.model,
    opacity: 1,
    blend,
    mask: null,
    effects,
    layers: [{ kind: "texture", texture, transform: rectTransform(effects.model[4], effects.model[5], effects.width * effects.model[0], effects.height * effects.model[3]), opacity, crop: FULL_UV, flipX: false, flipY: false }],
    matte: null,
  };
}

const list = (layers: Layer[]): DrawList => ({ width: 1080, height: 1920, background: { r: 0, g: 0, b: 0, a: 1 }, layers });
const pt = (m: Mat3, x: number, y: number): number[] => {
  const q = applyToPoint(m, x, y);
  return [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000];
};
const pane = (drawList: DrawList, scale: number): Pane => ({ list: drawList, viewport: { transform: [scale, 0, 0, scale, 0, 0], outside: { r: 0, g: 0, b: 0, a: 1 }, border: null }, bounds: { x: 0, y: 0, width: 1080 * scale, height: 1920 * scale } });

describe("effect registry and plan (spec §21.19)", () => {
  it("blurs reach their radius with sigma radius / 2 and at most 32 taps a side", () => {
    expect(blurTaps(10)).toEqual({ sigma: 5, taps: 10, step: 1 });
    expect(blurTaps(200).taps).toBe(32);
    expect(blurTaps(200).step).toBeCloseTo(6.25);
    expect(blurTaps(0).taps).toBe(0);
  });

  it("sums the reach of a stack (repeat edges and inner glows add none)", () => {
    const blur = newEffect("gaussianBlur", "a");
    const shadow = newEffect("dropShadow", "b");
    const inner = { ...newEffect("glow", "c"), params: { ...newEffect("glow", "c").params, mode: "inner" } };
    const repeat = { ...blur, id: "d", params: { radius: 30, repeatEdges: 1 } };
    const { data, length } = packed([blur, shadow, inner, repeat]);
    expect(stackReach(data, length)).toBe(10 + 12 + 16);
  });

  it("plans two passes per blur, ping-ponging scratch buffers, the last into the output", () => {
    const { data, length } = packed([newEffect("gaussianBlur", "a"), newEffect("outline", "b")]);
    const plan = new EffectPlan();
    const count = plan.build({ width: 100, height: 50, rect: [10, 10, 90, 40], scale: 2, data, length, masked: true });
    expect(count).toBe(5);
    expect(plan.uniform(0)[FX_SLOT.size + 2]).toBe(FX_PROGRAM.mask);
    expect(plan.orig[0]).toBe(FX_BUFFER.coverage);
    expect([1, 2, 3, 4].map((i) => plan.uniform(i)[FX_SLOT.size + 2])).toEqual([FX_PROGRAM.blur, FX_PROGRAM.blur, FX_PROGRAM.dilate, FX_PROGRAM.outline]);
    // Radii scale with the stage: 10 content px at scale 2 = 20 stage px, sigma 10; the 6 px outline is 12 stage px, two steps of 6.
    expect(plan.uniform(1)[FX_SLOT.a + 2]).toBe(10);
    expect([plan.uniform(3)[FX_SLOT.a], plan.uniform(4)[FX_SLOT.a]]).toEqual([6, 6]);
    for (let i = 0; i < count; i++) expect(plan.dst[i]).not.toBe(plan.src[i]);
    for (let i = 1; i < count; i++) expect(plan.src[i]).toBe(plan.dst[i - 1]);
    expect(plan.dst[count - 1]).toBe(FX_BUFFER.out);
    expect(Array.from(plan.uniform(2).subarray(FX_SLOT.rect, FX_SLOT.rect + 4))).toEqual([10, 10, 90, 40]);
  });

  it("dilates a wide outline in small steps that never overwrite the effect's input", () => {
    expect(outlineSteps(6)).toEqual({ steps: 1, radius: 6, rings: 4 });
    expect(outlineSteps(60)).toMatchObject({ steps: 10, radius: 6 });
    expect(outlineSteps(800)).toMatchObject({ steps: 16, radius: 50, rings: 12 });
    expect(outlineSteps(0).rings).toBe(0);
    const { data, length } = packed([newEffect("gaussianBlur", "a"), { ...newEffect("outline", "b"), params: { width: 30, color: [1, 0, 0, 1] } }]);
    const plan = new EffectPlan();
    const count = plan.build({ width: 200, height: 200, rect: [40, 40, 160, 160], scale: 1, data, length, masked: false });
    // blur across, blur down (the outline's input), 4 dilate steps, the outline.
    expect(count).toBe(7);
    const input = plan.dst[1];
    for (let i = 2; i < count; i++) {
      expect(plan.dst[i]).not.toBe(input);
      expect(plan.src[i]).toBe(plan.dst[i - 1]);
    }
    expect(plan.orig[count - 1]).toBe(input);
    expect(plan.uniform(count - 1)[FX_SLOT.size + 2]).toBe(FX_PROGRAM.outline);
  });

  it("gives a glow and a shadow a composite pass that reads the effect's input", () => {
    const { data, length } = packed([newEffect("gaussianBlur", "a"), newEffect("glow", "b")]);
    const plan = new EffectPlan();
    plan.build({ width: 64, height: 64, rect: [0, 0, 64, 64], scale: 1, data, length, masked: false });
    // blur across, blur down (its result is the glow's input), glow extract, glow composite (orig = the input).
    expect(plan.count).toBe(4);
    expect(plan.orig[3]).toBe(plan.dst[1]);
    expect(plan.src[3]).toBe(plan.dst[2]);
    expect(new Set([plan.src[3], plan.orig[3], plan.dst[3]]).size).toBe(3);
  });

  it("gives a LUT pass the LUT as its second texture, and skips a LUT that is not loaded (Batch 75)", () => {
    const effects: Effect[] = [newEffect("colorAdjust", "a"), { ...newEffect("lut", "b"), params: { file: "luts/x.cube", intensity: 0.5 } }];
    const data = new Float32Array(EFFECT_BLOCK * 2);
    const length = packEffects({ effects }, 0, data, () => 9);
    const plan = new EffectPlan();
    const atlas = { size: 2, width: 4, height: 2, rgba: new Uint8Array(32), domainMin: [0, 0, 0] as const, domainMax: [1, 1, 1] as const };
    lutLibrary.clear();
    expect(plan.build({ width: 64, height: 64, rect: [0, 0, 64, 64], scale: 1, data, length, masked: false })).toBe(1);
    const handle = lutLibrary.set("luts/x.cube", atlas);
    packEffects({ effects }, 0, data, lutLibrary.handleOf);
    expect(plan.build({ width: 64, height: 64, rect: [0, 0, 64, 64], scale: 1, data, length, masked: false })).toBe(2);
    expect(plan.uniform(0)[FX_SLOT.size + 2]).toBe(FX_PROGRAM.colorAdjust);
    expect(plan.lut[0]).toBe(0);
    expect(plan.uniform(1)[FX_SLOT.size + 2]).toBe(FX_PROGRAM.lut);
    expect(plan.orig[1]).toBe(FX_BUFFER.lut);
    expect(plan.lut[1]).toBe(handle);
    expect(plan.uniform(1)[FX_SLOT.a]).toBe(0.5);
    expect(plan.uniform(1)[FX_SLOT.a + 1]).toBe(2);
    expect(plan.dst[1]).toBe(FX_BUFFER.out);
    lutLibrary.clear();
  });

  it("scales the sharpen radius and grain size with the stage, and passes the grain frame (Batch 75)", () => {
    const effects: Effect[] = [{ ...newEffect("sharpen", "a"), params: { amount: 2, radius: 4 } }, { ...newEffect("grain", "b"), params: { amount: 0.2, size: 3, animated: 1 } }];
    const data = new Float32Array(EFFECT_BLOCK * 2);
    const length = packEffects({ effects }, 12, data);
    const plan = new EffectPlan();
    expect(plan.build({ width: 64, height: 64, rect: [0, 0, 64, 64], scale: 0.5, data, length, masked: false })).toBe(2);
    expect(Array.from(plan.uniform(0).slice(FX_SLOT.a, FX_SLOT.a + 2))).toEqual([2, 2]);
    expect(Array.from(plan.uniform(1).slice(FX_SLOT.a, FX_SLOT.a + 3))).toEqual([0.20000000298023224, 1.5, 12]);
  });

  it("has a render definition for every type", () => {
    for (const [type, def] of Object.entries(EFFECT_REGISTRY)) expect(def.type).toBe(type);
  });
});

describe("effect stages in DrawRecords (spec §21.19)", () => {
  it("quantizes the stage scale to quarter octaves", () => {
    expect(stageScale(1)).toBe(1);
    expect(stageScale(0.5)).toBe(0.5);
    expect(stageScale(0.45)).toBeCloseTo(2 ** -1, 6);
    expect(stageScale(0.6)).toBeCloseTo(2 ** -0.5, 6);
    expect(stageScale(100)).toBe(4);
  });

  it("draws the clip's layers into a padded stage and shows the result where the clip is", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(200, 100);
    const effects = frame([newEffect("gaussianBlur", "a")], [1, 0, 0, 1, 300, 400], 200, 100, 0.5);
    const count = records.build([pane(list([group(texture, effects, 0.5)]), 0.5)], 540, 960);
    // background, stage layer, effect record
    expect(count).toBe(3);
    expect(records.stageCount).toBe(1);
    const stage = records.stages[0]!;
    // Shown at 0.5 target px per content px: radius 10 -> 5 stage px of padding.
    expect(stage.scale).toBe(0.5);
    expect([stage.width, stage.height]).toEqual([110, 60]);
    expect(stage.rect).toEqual([5, 5, 105, 55]);
    const layer = records.at(1);
    expect([layer.role, layer.stage, layer.group]).toEqual([ROLE.stage, 1, 0]);
    // Its opacity divided by the clip's; its quad at the content box in stage px.
    expect(layer.uniform.opacity).toBeCloseTo(1);
    expect(pt(layer.uniform.transform, 0, 0)).toEqual([5, 5]);
    expect(pt(layer.uniform.transform, 1, 1)).toEqual([105, 55]);
    const shown = records.at(2);
    expect([shown.kind, shown.stage, shown.role]).toEqual(["effect", 1, ROLE.target]);
    expect(shown.uniform.opacity).toBe(0.5);
    // The stage box (5 stage px = 10 content px of padding) in target px.
    expect([...pt(shown.uniform.transform, 0, 0), ...pt(shown.uniform.transform, 1, 1)]).toEqual([145, 195, 255, 255]);
    // Retargeted: stage px -> the target's px for a stage-sized viewport.
    retargetStages(records, count, 540, 960);
    expect(pt(layer.uniform.transform, 0, 0)).toEqual([Math.round((5 * 540 * 1000) / 110) / 1000, (5 * 960) / 60]);
  });

  it("keeps the same signature for the same frame and changes it with the effects' version or a texture", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(200, 100);
    const effects = frame([newEffect("glow", "a")], [1, 0, 0, 1, 0, 0], 200, 100);
    const build = () => records.build([pane(list([group(texture, effects)]), 1)], 1080, 1920);
    build();
    const jobs = new StageJobs<FakeTexture>();
    const alloc = (current: FakeTexture | null, w: number, h: number) => (current && current.width >= w && current.height >= h ? current : new FakeTexture(w, h));
    jobs.prepare(records, records.count, 1, alloc);
    expect(jobs.jobCount).toBe(1);
    expect(jobs.passCount).toBe(2);
    build();
    jobs.prepare(records, records.count, 2, alloc);
    expect(jobs.jobCount).toBe(0);
    // The effect record now shows the kept texture.
    expect(records.at(2).kind).toBe("textured");
    expect(records.at(2).texture0).toBe(jobs.entries[0]!.texture);
    effects.version = 2;
    build();
    jobs.prepare(records, records.count, 3, alloc);
    expect(jobs.jobCount).toBe(1);
    // Another texture (a new video frame) redraws as well.
    const other = new FakeTexture(200, 100);
    records.build([pane(list([group(other, effects)]), 1)], 1080, 1920);
    jobs.prepare(records, records.count, 4, alloc);
    expect(jobs.jobCount).toBe(1);
    jobs.evict(200, 120, (t) => t.destroy());
    expect(jobs.entries.length).toBe(0);
  });

  it("puts the effect record into the group's picture when the clip also has a blend mode, its masks in the stage", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(20, 20);
    const effects = frame([newEffect("outline", "a")], [1, 0, 0, 1, 0, 0], 20, 20);
    const layer = group(texture, effects, 1, "multiply");
    if (layer.kind === "group") layer.mask = { clipId: "clip", data: new Float32Array(8), length: 8, version: 3, width: 20, height: 20, model: [1, 0, 0, 1, 0, 0], persp: null };
    const count = records.build([pane(list([layer]), 1)], 1080, 1920);
    // background, stage layer, effect record (in group 1), composite
    expect(count).toBe(4);
    expect([records.at(2).kind, records.at(2).group, records.at(2).role]).toEqual(["effect", 1, ROLE.layers]);
    expect(records.groups[0]!.mask).toBeNull();
    expect(records.stages[0]!.mask?.version).toBe(3);
    expect(records.at(3).kind).toBe("composite");
  });

  it("caps the stage at its largest size", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(2000, 4000);
    const effects = frame([newEffect("gaussianBlur", "a")], [1, 0, 0, 1, 0, 0], 2000, 4000);
    records.build([pane(list([group(texture, effects)]), 2)], 2160, 3840);
    const stage = records.stages[0]!;
    expect(Math.max(stage.width, stage.height)).toBeLessThanOrEqual(MAX_STAGE_SIZE);
    expect(stage.scale).toBeLessThan(2);
  });

  it("compares signatures within a rounding tolerance", () => {
    const a = { numbers: Float64Array.from([1, 2, 3]), numberCount: 3, refs: [null], refCount: 1 };
    expect(sameSignature(a, { ...a, numbers: Float64Array.from([1, 2, 3 + 1e-6]) })).toBe(true);
    expect(sameSignature(a, { ...a, numbers: Float64Array.from([1, 2, 3.1]) })).toBe(false);
    expect(sameSignature(a, { ...a, refs: [{}] })).toBe(false);
  });
});
