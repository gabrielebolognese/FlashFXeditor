import { describe, expect, it } from "vitest";
import { fillTemplates } from "./templateFill.js";
import { buildTemplatesFixture } from "./templatesFixture.js";
import type { CompoundClip } from "./types.js";
import { validateProject } from "./validate.js";

const blank = () => buildTemplatesFixture(false);

describe("fill (spec §21.24)", () => {
  it("sets parameters by instance name and parameter id or label, colors as hex, and leaves the input alone", () => {
    const project = blank();
    const result = fillTemplates(project, { "Card A": { Title: "Hi", accent: `#${"ff8000"}`, "accent width": 100 } });
    expect(result.errors).toEqual([]);
    expect(result.applied).toEqual(["card-a: title", "card-a: accent", "card-a: width"]);
    expect((result.project.clips["card-a"] as CompoundClip).params).toEqual({ title: "Hi", accent: { r: 1, g: 128 / 255, b: 0, a: 1 }, width: 100 });
    expect((project.clips["card-a"] as CompoundClip).params).toBeUndefined();
    expect(validateProject(result.project)).toEqual([]);
  });

  it("names an instance by clip id too, and a name reaches every clip with it", () => {
    const project = blank();
    (project.clips["card-c"] as CompoundClip).name = "Card B";
    const result = fillTemplates(project, { "Card B": { show: false }, "card-a": { show: false } });
    expect(result.applied).toEqual(["card-b: show", "card-c: show", "card-a: show"]);
  });

  it("reports every problem and changes nothing when one value is refused", () => {
    const project = blank();
    const result = fillTemplates(project, { "Card A": { title: 5, nope: 1, width: 9999 }, Ghost: { title: "x" }, "Card B": [] });
    expect(result.project).toBe(project);
    expect(result.applied).toEqual([]);
    expect(result.errors).toHaveLength(5);
    expect(result.errors.join("\n")).toContain('has no parameter "nope"');
    expect(result.errors.join("\n")).toContain('no compound clip with the id or name "Ghost"');
    expect(result.errors.join("\n")).toContain("must be at most 280");
  });

  it("refuses a values file that is not an object", () => {
    expect(fillTemplates(blank(), []).errors).toHaveLength(1);
    expect(fillTemplates(blank(), "x").errors).toHaveLength(1);
  });
});
