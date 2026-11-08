import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTransitionsFixture, TRANSITION_FIXTURE_FRAMES, TRANSITION_FIXTURE_KINDS, transitionCut } from "./transitionsFixture.js";
import { transitionMix } from "./transitions.js";
import { validateStrict } from "./strict.js";
import { TRANSITION_KINDS, type MediaClip, type Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/transitions/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_TRANSITIONS_FIXTURE)("writes the transitions interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildTransitionsFixture(), null, 2)}\n`);
});

describe("fixtures/interop/transitions (Batch 71)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildTransitionsFixture())));
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("has one transition of every kind, each checked at its midpoint (mix 0.5)", () => {
    const project = read();
    expect(TRANSITION_FIXTURE_KINDS.map((entry) => entry.kind).sort()).toEqual([...TRANSITION_KINDS].sort());
    TRANSITION_FIXTURE_KINDS.forEach((entry, i) => {
      const out = (project.clips[`c${i + 1}`] as MediaClip).transitionOut;
      expect(out?.kind).toBe(entry.kind);
      expect(transitionMix(out as NonNullable<typeof out>, transitionCut(i), TRANSITION_FIXTURE_FRAMES[i] as number)).toBeCloseTo(0.5, 12);
    });
  });
});
