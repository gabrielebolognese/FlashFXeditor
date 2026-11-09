import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { GroupCompositeLayer, MaskFrame } from "../../render/compositor/drawList.js";
import { maskStackCoverage } from "../masks/maskCoverage.js";
import { maskPathPoints } from "../masks/maskPath.js";
import { buildMasksFixture, FEATHER_SEGMENT, INTERSECT_SEGMENT, INVERT_SEGMENT, MASK_SEGMENT, MASKS_FIXTURE_FRAMES, MATTE_SEGMENT, MORPH_FROM, MORPH_SEGMENT, MORPH_TO, REVEAL_SEGMENT, SUBTRACT_SEGMENT } from "./masksFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/masks/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_MASKS_FIXTURE)("writes the masks interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildMasksFixture(), null, 2)}\n`);
});

describe("fixtures/interop/masks (Batch 73)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;
  const compositor = new Compositor();
  const maskAt = (project: Project, frame: number, layer = 0): MaskFrame => {
    const group = compositor.evaluate(project, frame).layers[layer] as GroupCompositeLayer;
    expect(group.kind).toBe("group");
    return group.mask as MaskFrame;
  };
  const coverage = (m: MaskFrame, x: number, y: number) => maskStackCoverage(m.data.subarray(0, m.length), x, y);

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildMasksFixture())));
    expect(MASKS_FIXTURE_FRAMES).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85]);
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("feather 40 ramps across the ellipse's edge; subtract cuts, intersect keeps the overlap, invert flips", () => {
    const project = read();
    const at = (segment: number) => segment * MASK_SEGMENT + 5;
    const feather = maskAt(project, at(FEATHER_SEGMENT));
    expect([feather.width, feather.height]).toEqual([270, 480]);
    expect(coverage(feather, 135, 240)).toBe(1);
    // On the edge: half; 40 px out: none.
    expect(coverage(feather, 235, 240)).toBeCloseTo(0.5, 2);
    expect(coverage(feather, 275, 240)).toBe(0);
    const subtract = maskAt(project, at(SUBTRACT_SEGMENT));
    expect(coverage(subtract, 60, 140)).toBe(1);
    expect(coverage(subtract, 180, 320)).toBe(0);
    expect(coverage(subtract, 10, 10)).toBe(0);
    const intersect = maskAt(project, at(INTERSECT_SEGMENT));
    expect(coverage(intersect, 180, 320)).toBe(1);
    expect(coverage(intersect, 40, 320)).toBe(0);
    expect(coverage(intersect, 320, 320)).toBe(0);
    const invert = maskAt(project, at(INVERT_SEGMENT));
    expect(coverage(invert, 180, 320)).toBe(0);
    expect(coverage(invert, 10, 10)).toBe(1);
  });

  it("the title is revealed from the left; the path morphs between its keys", () => {
    const project = read();
    // A frame's mask is reused by the next evaluation: sample it first.
    const half = maskAt(project, REVEAL_SEGMENT * MASK_SEGMENT + 5);
    const x = Math.min(half.width, 360) * 0.6;
    expect(coverage(half, 5, 10)).toBe(1);
    expect(coverage(half, x, 10)).toBe(0);
    expect(coverage(maskAt(project, REVEAL_SEGMENT * MASK_SEGMENT + 15), x, 10)).toBe(1);
    const clip = project.clips.morph as { keyframes?: Record<string, { value: number[] }[]> };
    expect(clip.keyframes?.["masks.p.path"]?.map((k) => k.value.length)).toEqual([8, 8]);
    expect(maskPathPoints(`M${MORPH_TO.join(" ")}`)?.length ?? 8).toBe(MORPH_FROM.length);
    // The square's corner is in early on, out once it is mostly a diamond.
    expect(coverage(maskAt(project, MORPH_SEGMENT * MASK_SEGMENT + 5), 115, 215)).toBe(1);
    expect(coverage(maskAt(project, MORPH_SEGMENT * MASK_SEGMENT + 15), 115, 215)).toBe(0);
  });

  it("a masked matte source keys through its masks, and the matted clip's own mask applies first", () => {
    const project = read();
    const group = compositor.evaluate(project, MATTE_SEGMENT * MASK_SEGMENT + 5).layers[0] as GroupCompositeLayer;
    expect(group.mask?.clipId).toBe("matte-video");
    expect(group.matte?.mode).toBe("alpha");
    expect(group.matte?.mask?.clipId).toBe("matte");
  });
});
