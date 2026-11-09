import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { AdjustLayer, EffectFrame, GroupCompositeLayer } from "../../render/compositor/drawList.js";
import { EFFECT_BLOCK, effectCode } from "../effects/effectEval.js";
import { EFFECT_SEGMENT } from "./effectsFixture.js";
import { ADJUST_SEGMENT, buildEffects3Fixture, BW_SEGMENT, EFFECTS3_FIXTURE_FRAMES, TWO_EFFECT_SEGMENT } from "./effectsFixture3.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/effects-3/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_EFFECTS3_FIXTURE)("writes the effects-3 interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildEffects3Fixture(), null, 2)}\n`);
});

describe("fixtures/interop/effects-3 (Batch 76)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;
  const compositor = new Compositor();
  const layersAt = (project: Project, frame: number) => compositor.evaluate(project, frame).layers;
  const codes = (e: EffectFrame) => Array.from({ length: e.length / EFFECT_BLOCK }, (_, i) => e.data[i * EFFECT_BLOCK]);
  const middle = (segment: number) => segment * EFFECT_SEGMENT + EFFECT_SEGMENT / 2;

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildEffects3Fixture())));
    expect(EFFECTS3_FIXTURE_FRAMES).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 185]);
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("every effect frame draws its subject through one Effects III effect", () => {
    const project = read();
    const types = new Set<number>();
    for (const frame of EFFECTS3_FIXTURE_FRAMES.filter((f) => f < middle(ADJUST_SEGMENT))) {
      const layers = layersAt(project, frame);
      const group = layers[layers.length - 1] as GroupCompositeLayer;
      expect(group.kind).toBe("group");
      const effects = group.effects as EffectFrame;
      expect(effects.length).toBe(EFFECT_BLOCK);
      types.add(codes(effects)[0] as number);
    }
    expect([...types].sort((a, b) => a - b)).toEqual(["rgbSplit", "pixelate", "mirror", "wave", "glitch", "posterize", "invert"].map((t) => effectCode(t as never)).sort((a, b) => a - b));
  });

  it("the black and white adjustment applies during its range only, through its mask; the second one has two effects at half opacity", () => {
    const project = read();
    const kinds = (frame: number) => layersAt(project, frame).map((l) => l.kind);
    expect(kinds(middle(ADJUST_SEGMENT))).not.toContain("adjust");
    expect(kinds(middle(ADJUST_SEGMENT + 2))).not.toContain("adjust");
    const bw = layersAt(project, middle(BW_SEGMENT)).at(-1) as AdjustLayer;
    expect(bw.kind).toBe("adjust");
    expect(bw.opacity).toBe(1);
    expect(bw.mask?.length).toBeGreaterThan(0);
    expect(codes(bw.effects)).toEqual([effectCode("colorAdjust")]);
    const two = layersAt(project, middle(TWO_EFFECT_SEGMENT)).at(-1) as AdjustLayer;
    expect(two.kind).toBe("adjust");
    expect(two.opacity).toBe(0.5);
    expect(two.mask).toBeNull();
    expect(codes(two.effects)).toEqual([effectCode("pixelate"), effectCode("posterize")]);
  });
});
