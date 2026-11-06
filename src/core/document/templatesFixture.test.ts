import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillTemplates } from "./templateFill.js";
import { buildTemplatesFixture, TEMPLATE_VALUES } from "./templatesFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const DIR = "fixtures/interop/templates";
const FILE = `${DIR}/project.json`;
const VALUES = `${DIR}/values.json`;

// The writer only runs when asked, so a normal run never rewrites files other tests read in parallel.
it.skipIf(!process.env.WRITE_TEMPLATES_FIXTURE)("writes the templates interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildTemplatesFixture(true), null, 2)}\n`);
  writeFileSync(VALUES, `${JSON.stringify(TEMPLATE_VALUES, null, 2)}\n`);
});

describe("fixtures/interop/templates (Batch 80)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;

  it("is the project this build writes, and values.json is the file `fill` reads", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildTemplatesFixture(true))));
    expect(JSON.parse(readFileSync(VALUES, "utf8"))).toEqual(TEMPLATE_VALUES);
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("`fill` on the project without values gives the committed project, and again changes nothing", () => {
    const blank = JSON.parse(JSON.stringify(buildTemplatesFixture(false))) as Project;
    const values = JSON.parse(readFileSync(VALUES, "utf8")) as unknown;
    const first = fillTemplates(blank, values);
    expect(first.errors).toEqual([]);
    expect(first.applied).toHaveLength(8);
    expect(first.project).toEqual(read());
    expect(fillTemplates(first.project, values).project).toEqual(read());
  });

  it("three instances show one sequence", () => {
    const project = read();
    expect(Object.keys(project.sequences)).toEqual(["paper-card"]);
    const shown = Object.values(project.clips).filter((clip) => clip.kind === "compound");
    expect(shown.map((clip) => clip.kind === "compound" && clip.sequenceId)).toEqual(["paper-card", "paper-card", "paper-card"]);
  });
});
