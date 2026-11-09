import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { EffectFrame, GroupCompositeLayer } from "../../render/compositor/drawList.js";
import { EFFECT_BLOCK, paramOffset } from "../effects/effectEval.js";
import { buildEffectsFixture, DISABLED_SEGMENT, EFFECT_SEGMENT, EFFECTS_FIXTURE_FRAMES, KEYED_GLOW_SEGMENT, STACK_SEGMENT, TURNED_SEGMENT } from "./effectsFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/effects-1/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_EFFECTS_FIXTURE)("writes the effects-1 interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildEffectsFixture(), null, 2)}\n`);
});

describe("fixtures/interop/effects-1 (Batch 74)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;
  const compositor = new Compositor();
  const effectsAt = (project: Project, frame: number): EffectFrame => {
    const group = compositor.evaluate(project, frame).layers[0] as GroupCompositeLayer;
    expect(group.kind).toBe("group");
    return group.effects as EffectFrame;
  };
  /** The packed effect codes, in order. */
  const codes = (e: EffectFrame) => Array.from({ length: e.length / EFFECT_BLOCK }, (_, i) => e.data[i * EFFECT_BLOCK]);

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildEffectsFixture())));
    expect(EFFECTS_FIXTURE_FRAMES).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 155, 165]);
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("every frame draws its clip through an effect stack", () => {
    const project = read();
    for (const frame of EFFECTS_FIXTURE_FRAMES) {
      const effects = effectsAt(project, frame);
      expect(effects.length).toBeGreaterThan(0);
    }
  });

  it("the keyed glow's intensity rises over the clip; the stack's order is kept; a disabled effect is left out", () => {
    const project = read();
    const at = KEYED_GLOW_SEGMENT * EFFECT_SEGMENT;
    const intensity = (frame: number) => effectsAt(project, frame).data[paramOffset("glow", "intensity")] as number;
    const quarter = intensity(at + 5);
    const threeQuarters = intensity(at + 15);
    expect(quarter).toBeGreaterThan(0);
    expect(threeQuarters).toBeGreaterThan(quarter);
    expect(threeQuarters).toBeLessThan(1);
    const stack = codes(effectsAt(project, STACK_SEGMENT * EFFECT_SEGMENT + 5));
    const swapped = codes(effectsAt(project, (STACK_SEGMENT + 1) * EFFECT_SEGMENT + 5));
    expect(stack).toHaveLength(2);
    expect(swapped).toEqual([...stack].reverse());
    const disabled = effectsAt(project, DISABLED_SEGMENT * EFFECT_SEGMENT + 5);
    expect(codes(disabled)).toEqual([codes(effectsAt(project, 95))[0]]);
  });

  it("the turned badge keeps its effects in its own space (the stage is the badge's size, not the frame's)", () => {
    const project = read();
    const effects = effectsAt(project, TURNED_SEGMENT * EFFECT_SEGMENT + 5);
    expect([effects.width, effects.height]).toEqual([240, 240]);
  });
});
