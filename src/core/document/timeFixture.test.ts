import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTimeFixture, expectedFrames, TIME_FROM_US } from "./timeFixture.js";
import { validateStrict } from "./strict.js";
import type { MediaClip, Project } from "./types.js";
import { validateProject } from "./validate.js";

const DIR = "fixtures/interop/time";

it.skipIf(!process.env.WRITE_TIME_FIXTURE)("writes the time interop fixture", () => {
  mkdirSync(`${DIR}/expected`, { recursive: true });
  const project = buildTimeFixture();
  writeFileSync(`${DIR}/project.json`, `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(`${DIR}/expected/source-times.json`, `${JSON.stringify(expectedFrames(project), null, 2)}\n`);
});

describe("fixtures/interop/time (Batch 78)", () => {
  const read = (): Project => JSON.parse(readFileSync(`${DIR}/project.json`, "utf8")) as Project;

  it("is the project this build writes, strictly valid", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildTimeFixture())));
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("has a Hero curve, a reversed clip and a blended slow clip", () => {
    const project = read();
    expect((project.clips.ramp as MediaClip).timeRemap?.length).toBe(4);
    expect((project.clips.back as MediaClip).reverse).toBe(true);
    expect((project.clips.slow as MediaClip).frameBlend).toBe(true);
  });

  it("the expected source times match what the evaluator gives", () => {
    const expected = JSON.parse(readFileSync(`${DIR}/expected/source-times.json`, "utf8")) as Record<string, number[]>;
    expect(expected).toEqual(expectedFrames(read()));
    expect(expected.ramp?.[0]).toBe(TIME_FROM_US);
    // The reverse clip starts at its end and goes down; the ramp only goes up.
    expect(expected.back?.[0]).toBeGreaterThan(expected.back?.[6] ?? 0);
    expect(expected.ramp?.[6]).toBeGreaterThan(expected.ramp?.[0] ?? 0);
  });
});
