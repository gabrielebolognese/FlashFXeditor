import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { EffectFrame, GroupCompositeLayer } from "../../render/compositor/drawList.js";
import { EFFECT_BLOCK, effectCode } from "../effects/effectEval.js";
import { projectEffectFiles } from "../effects/effectParams.js";
import { parseCube } from "../effects/lut.js";
import { buildEffects2Fixture, EFFECTS2_FIXTURE_FRAMES, FIXTURE_LUT, LOOK_SEGMENT } from "./effectsFixture2.js";
import { EFFECT_SEGMENT } from "./effectsFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const DIR = "fixtures/interop/effects-2";
const FILE = `${DIR}/project.json`;

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_EFFECTS2_FIXTURE)("writes the effects-2 interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildEffects2Fixture(), null, 2)}\n`);
});

describe("fixtures/interop/effects-2 (Batch 75)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;
  const compositor = new Compositor();
  /** The effects of the subject (the top layer; the backdrop has none). */
  const effectsAt = (project: Project, frame: number): EffectFrame => {
    const layers = compositor.evaluate(project, frame).layers;
    const group = layers[layers.length - 1] as GroupCompositeLayer;
    expect(group.kind).toBe("group");
    return group.effects as EffectFrame;
  };
  const codes = (e: EffectFrame) => Array.from({ length: e.length / EFFECT_BLOCK }, (_, i) => e.data[i * EFFECT_BLOCK]);

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildEffects2Fixture())));
    expect(EFFECTS2_FIXTURE_FRAMES).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145]);
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("names one LUT, which is in its luts/ folder and parses", () => {
    expect(projectEffectFiles(read().clips)).toEqual([FIXTURE_LUT]);
    expect(parseCube(readFileSync(`${DIR}/${FIXTURE_LUT}`, "utf8"))?.size).toBe(17);
  });

  it("every frame draws its subject through an effect stack; the look keeps its order", () => {
    const project = read();
    for (const frame of EFFECTS2_FIXTURE_FRAMES) expect(effectsAt(project, frame).length).toBeGreaterThan(0);
    expect(codes(effectsAt(project, LOOK_SEGMENT * EFFECT_SEGMENT + 5))).toEqual([effectCode("chromaKey"), effectCode("colorAdjust"), effectCode("lut")]);
  });
});
