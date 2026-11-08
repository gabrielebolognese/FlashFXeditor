import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { GroupCompositeLayer } from "../../render/compositor/drawList.js";
import { buildCompositingFixture, COMPOSITING_FIXTURE_FRAMES, LUMA_MATTE_SEGMENT, SEGMENT, TEXT_MATTE_SEGMENT } from "./compositingFixture.js";
import { validateStrict } from "./strict.js";
import { BLEND_MODES, type Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/compositing/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_COMPOSITING_FIXTURE)("writes the compositing interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildCompositingFixture(), null, 2)}\n`);
});

describe("fixtures/interop/compositing (Batch 72)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildCompositingFixture())));
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("checks every blend mode on the chart and both mattes, the matte clips not drawn by themselves", () => {
    const project = read();
    const compositor = new Compositor();
    BLEND_MODES.forEach((mode, i) => {
      const layers = compositor.evaluate(project, COMPOSITING_FIXTURE_FRAMES[i] as number).layers;
      expect(layers).toHaveLength(2);
      const top = layers[1] as GroupCompositeLayer;
      expect(mode === "normal" ? top.kind : top.blend).toBe(mode === "normal" ? "media" : mode);
    });
    const text = compositor.evaluate(project, TEXT_MATTE_SEGMENT * SEGMENT + 5).layers;
    expect(text.map((l) => l.kind)).toEqual(["solid", "group"]);
    expect((text[1] as GroupCompositeLayer).matte?.mode).toBe("alpha");
    expect((text[1] as GroupCompositeLayer).matte?.layers.every((l) => l.kind === "text")).toBe(true);
    const luma = compositor.evaluate(project, LUMA_MATTE_SEGMENT * SEGMENT + 5).layers;
    expect(luma.map((l) => l.kind)).toEqual(["media", "group"]);
    expect((luma[1] as GroupCompositeLayer).matte?.mode).toBe("lumaInverted");
  });
});
