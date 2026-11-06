// Batch 56 fixtures: stand-ins (Make editable) and the large generated project (spec §21.5), checked by the
// strict validator and the CLI's report of convertible stand-ins.
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectInfo, validateProjectFolder } from "../../../scripts/cli/folder.js";
import { buildCapabilities } from "../capabilities.js";

const rel = (path: string) => join(process.cwd(), path);

describe("fixtures/interop/standins", () => {
  it("is valid and reports which stand-ins can be made editable", async () => {
    const report = await validateProjectFolder(rel("fixtures/interop/standins"));
    expect(report.errors).toEqual([]);
    expect(report.standIns).toEqual({ solid: 3, hologram: 1 });
    expect(report.convertible.map((s) => [s.clipId, s.convertible])).toEqual([
      ["b-solid", true],
      ["b-unknown", false],
      ["b-split-a", true],
      ["b-split-b", true],
    ]);
    expect(report.convertible.find((s) => s.clipId === "b-unknown")?.reason).toContain("hologram");
    const info = await projectInfo(rel("fixtures/interop/standins"));
    expect(info.convertible).toHaveLength(4);
  });

  it("prints the report from the command line", () => {
    const run = spawnSync(process.execPath, [rel("scripts/cli/run.mjs"), "validate", "fixtures/interop/standins", "--json"], { cwd: process.cwd(), encoding: "utf8" });
    const json = JSON.parse(run.stdout) as { ok: boolean; convertible: { clipId: string; convertible: boolean }[] };
    expect(json.ok).toBe(true);
    expect(json.convertible.filter((s) => s.convertible)).toHaveLength(3);
    const text = spawnSync(process.execPath, [rel("scripts/cli/run.mjs"), "validate", "fixtures/interop/standins"], { cwd: process.cwd(), encoding: "utf8" }).stdout;
    expect(text).toContain("can be made editable");
    expect(text).toContain("stays baked");
  }, 60_000);

  it("carries the generator's notes the editor shows read-only", () => {
    expect(readFileSync(rel("fixtures/interop/standins/FALLBACKS.md"), "utf8")).toContain("b-unknown");
    expect(statSync(rel("fixtures/interop/standins/OPEN.txt")).size).toBeGreaterThan(0);
  });
});

describe("fixtures/interop/large", () => {
  it("is valid and holds 40 video tracks, 1,000 clips and 5,000 keyframes, within the 2 MB an area may use", async () => {
    const report = await validateProjectFolder(rel("fixtures/interop/large"));
    expect(report.errors).toEqual([]);
    const project = JSON.parse(readFileSync(rel("fixtures/interop/large/project.json"), "utf8")) as { tracks: { kind: string }[]; clips: Record<string, { keyframes?: { opacity: unknown[] } }> };
    expect(project.tracks.filter((t) => t.kind === "video")).toHaveLength(40);
    expect(Object.keys(project.clips)).toHaveLength(1000);
    expect(Object.values(project.clips).reduce((n, clip) => n + (clip.keyframes?.opacity.length ?? 0), 0)).toBe(5000);
    expect(statSync(rel("fixtures/interop/large/project.json")).size).toBeLessThan(2 * 1024 * 1024);
  });
});

describe("the manifest announces Batch 56", () => {
  it("has the open link, the external reload and the repair on open", () => {
    const manifest = buildCapabilities("test");
    expect(manifest.interop).toMatchObject({ openLink: true, externalReload: true, repairOnOpen: true });
    expect(manifest.lastBatch).toBeGreaterThanOrEqual(56);
  });
});
