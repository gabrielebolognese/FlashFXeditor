import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { animatedTransform } from "./keyframes.js";
import { buildRigFixture } from "./rigFixture.js";
import { RigResolver } from "./rig.js";
import { validateStrict } from "./strict.js";
import type { Clip, Project, Transform } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/rig/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_RIG_FIXTURE)("writes the rig interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildRigFixture(), null, 2)}\n`);
});

describe("fixtures/interop/rig (Batch 69)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildRigFixture())));
  });

  it("is strictly valid and the app accepts it", () => {
    const committed = read();
    expect(validateStrict(committed).errors).toEqual([]);
    expect(validateProject(committed)).toEqual([]);
  });

  it("uses a null with five children, a text parented to a card and a curved path with auto-orient", () => {
    const clips = Object.values(read().clips) as (Clip & { keyframes?: Record<string, { spatialIn?: unknown; spatialOut?: unknown }[]> })[];
    expect(clips.filter((clip) => clip.parentId === "rig")).toHaveLength(5);
    expect(clips.find((clip) => clip.kind === "null")?.id).toBe("rig");
    expect(clips.find((clip) => clip.kind === "text")?.parentId).toBe("card");
    const arrow = clips.find((clip) => clip.id === "arrow");
    expect(arrow?.autoOrient).toBe(true);
    const keys = arrow?.keyframes?.["transform.position"] ?? [];
    expect(keys.some((k) => k.spatialIn)).toBe(true);
    expect(keys.some((k) => k.spatialOut)).toBe(true);
  });

  it("turns the five dots around the null and the label with the card", () => {
    const project = read();
    const resolver = new RigResolver();
    const world = (id: string, frame: number): Transform => {
      resolver.begin(project, frame, null);
      const clip = project.clips[id] as Clip & { transform: Transform };
      return resolver.resolve(clip, animatedTransform(clip, frame - clip.start, { ...clip.transform }), {} as Transform);
    };
    // At the start the dots lie along +x from the null; a quarter turn later along +y.
    expect(world("dot0", 0).x).toBeCloseTo(-220 + 60);
    expect(world("dot4", 59).x).toBeCloseTo(-220, 0);
    expect(world("dot4", 59).y).toBeCloseTo(-170 + 180, 0);
    expect(world("label", 0)).toMatchObject({ x: 200, y: -100 });
    expect(world("label", 59).rotation).toBeCloseTo(45);
  });
});
