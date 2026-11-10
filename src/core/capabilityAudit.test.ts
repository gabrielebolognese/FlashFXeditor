import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCapabilities } from "./capabilities.js";
import { auditCapabilities, Corpus, manifestLeaves, RULES } from "./capabilityAudit.js";

const root = process.cwd();
const appVersion = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
const manifest = buildCapabilities(appVersion);
const fixtures = join(root, "fixtures", "interop");
const readProject = (name: string) => JSON.parse(readFileSync(join(fixtures, name, "project.json"), "utf8")) as Record<string, unknown>;
const all = readdirSync(fixtures).filter((name) => name !== "broken" && existsSync(join(fixtures, name, "project.json")));
const fileExists = (path: string) => existsSync(join(root, path));
const corpusOf = (names: string[]) => new Corpus(names.map(readProject));

describe("capability audit (Batch 82)", () => {
  it("every true manifest key has a fixture field or a test that uses it", () => {
    expect(auditCapabilities(manifest, corpusOf(all), fileExists)).toEqual([]);
  });

  it("the full fixture alone uses every value of every list and every flag a project file can show", () => {
    // Only the rules answered by a project file count here (tests cover the rest).
    const full = corpusOf(["full"]);
    const problems = auditCapabilities(manifest, full, () => true);
    expect(problems).toEqual([]);
  });

  it("a key announced without evidence fails", () => {
    const loose = structuredClone(manifest) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    loose.invented = { feature: true };
    loose.time.sparkle = true;
    expect(auditCapabilities(loose as typeof manifest, corpusOf(all), fileExists)).toEqual([
      "time.sparkle: announced without a rule (no fixture field or test covers it)",
      "invented.feature: announced without a rule (no fixture field or test covers it)",
    ]);
  });

  it("a rule whose evidence is gone fails, and a list value no fixture uses fails", () => {
    expect(auditCapabilities(manifest, corpusOf(all), () => false).length).toBeGreaterThan(5);
    const extended = structuredClone(manifest) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    extended.transitions.push("teleport");
    extended.effects.push("sepia");
    expect(auditCapabilities(extended as typeof manifest, corpusOf(all), fileExists)).toEqual(['transitions: no fixture uses "teleport"', 'effects: no fixture uses "sepia"']);
  });

  it("a flag a fixture does not use fails when the evidence is removed", () => {
    const withoutMatte = corpusOf(all.filter((name) => name !== "compositing" && name !== "full" && name !== "masks"));
    expect(auditCapabilities(manifest, withoutMatte, fileExists).some((p) => p.startsWith("compositing.trackMatte"))).toBe(true);
  });

  it("has no rule for a key the manifest lacks, and every leaf of this manifest has one", () => {
    const leaves = manifestLeaves(manifest).map((leaf) => leaf.path);
    expect(leaves.filter((path) => !(path in RULES))).toEqual([]);
    expect(Object.keys(RULES).filter((path) => !leaves.includes(path) && !path.startsWith("project."))).toEqual([]);
  });
});
