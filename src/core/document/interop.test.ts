import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCliPath, projectInfo, validateProjectFolder } from "../../../scripts/cli/folder.js";
import { fieldReference, FIELDS_BEGIN_START, FIELDS_END } from "./interopDoc.js";
import { fuzzRun, random, randomProject } from "../../timeline/edit/fuzzKit.js";
import { applyTrim, trimEdge } from "../../timeline/edit/trim.js";
import type { Project } from "./types.js";
import { createProject } from "./project.js";
import { FIELD_TABLE } from "./schema.js";
import { strictIssues, validateStrict } from "./strict.js";

const rel = (path: string) => join(process.cwd(), path);
const readText = (path: string) => readFileSync(rel(path), "utf8").replace(/\r\n/g, "\n");
const readProject = (path: string) => JSON.parse(readText(path)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASIC = "fixtures/interop/basic";

describe("fixtures/interop/styles (Batch 58)", () => {
  const STYLES = "fixtures/interop/styles";

  it("is valid and holds every style: stroke, shadow, radii, dashes, a four-stop radial, a gradient text, a framed video and a boxed caption track with one border-less cue", async () => {
    const report = await validateProjectFolder(rel(STYLES));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.schemaVersion).toBe(5);
    const project = readProject(`${STYLES}/project.json`);
    const clips = project.clips;
    expect(clips.card).toMatchObject({ shape: "rect", stroke: { width: 3, align: "inside" }, shadow: { x: 7, y: 7, blur: 0 } });
    expect(clips.pill.cornerRadius).toBeGreaterThan(clips.pill.size.h / 2);
    expect(clips.dashed.stroke.dash).toEqual([24, 16]);
    expect(clips.radial.fill.stops).toHaveLength(4);
    expect(clips.gradtext.style.fill.type).toBe("linear");
    expect(clips.video).toMatchObject({ cornerRadius: 40, stroke: { width: 4 }, shadow: { blur: 36 } });
    expect(project.captionTracks.cc1.style.text.background).toMatchObject({ stroke: { enabled: true, width: 3 }, shadow: { enabled: true, x: 7, y: 7, blur: 0 } });
    expect(clips.q3.styleOverride.text.background.stroke.enabled).toBe(false);
    expect(clips.q1.styleOverride).toBeUndefined();
  });
});

describe("fixtures/interop/basic", () => {
  it("is valid and holds every v1.1 clip kind, a caption track with word timings, a library font and a stand-in", async () => {
    const report = await validateProjectFolder(rel(BASIC));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.schemaVersion).toBe(4);
    expect(report.standIns).toEqual({ shape: 1 });
    const project = readProject(`${BASIC}/project.json`);
    const kinds = new Set(Object.values(project.clips).map((clip) => (clip as { kind: string }).kind));
    expect([...kinds].sort()).toEqual(["audio", "caption", "image", "solid", "text", "video"]);
    expect(Object.values(project.clips).some((clip) => (clip as { words?: unknown[] }).words?.length)).toBe(true);
    expect(project.meta.generator.name).toBe("interop-fixture");
    expect(readProject(`${BASIC}/fonts/fonts.json`).faces[0].source).toBe("library");
  });

  it("is described by `info`", async () => {
    const info = await projectInfo(rel(BASIC));
    expect(info.clipsByKind).toEqual({ video: 1, image: 1, solid: 2, text: 1, caption: 2, audio: 1 });
    expect(info.standIns).toEqual({ shape: 1 });
    expect(info.missingMedia).toEqual([]);
    expect(info.durationFrames).toBe(90);
    expect(info.generator?.name).toBe("interop-fixture");
  });
});

const BROKEN: Record<string, string> = {
  "clip-past-media-end": "clips.c-video",
  "overlapping-clips": "tracks.0",
  "missing-media-file": "media.m3.file.relPath",
  "caption-below-video": "tracks.1",
  "bad-font-file": "fonts/fonts.json.faces.0.file",
  "fractional-frame": "clips.c-text.start",
  "opacity-string": "clips.c-solid.opacity",
  "transform-without-anchor": "clips.c-video.transform.anchor",
  "unknown-clip-field": "clips.c-video.glow",
};

describe("fixtures/interop/broken (one error each, named with its JSON path)", () => {
  for (const [name, path] of Object.entries(BROKEN)) {
    it(name, async () => {
      const report = await validateProjectFolder(rel(`fixtures/interop/broken/${name}`));
      expect(report.ok).toBe(false);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]?.path).toBe(path);
    });
  }
});

describe("the command line (npm run cli)", { timeout: 30_000 }, () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, [rel("scripts/cli/run.mjs"), ...args], { cwd: process.cwd(), encoding: "utf8" });

  it("capabilities prints capabilities.json", () => {
    const result = cli("capabilities");
    expect(result.status).toBe(0);
    expect(result.stdout.replace(/\r\n/g, "\n")).toBe(readText("capabilities.json"));
  });

  it("validate exits 0 for a valid folder, 1 for an invalid one, 2 for a usage error; --json prints the report", () => {
    expect(cli("validate", BASIC).status).toBe(0);
    const bad = cli("validate", "fixtures/interop/broken/opacity-string", "--json");
    expect(bad.status).toBe(1);
    const report = JSON.parse(bad.stdout) as { ok: boolean; errors: { path: string }[]; standIns: object };
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.path).toBe("clips.c-solid.opacity");
    expect(cli("validate").status).toBe(2);
    expect(cli("frobnicate").status).toBe(2);
    expect(cli("validate", BASIC, "--bogus").status).toBe(2);
  });

  it("info and schema work", () => {
    expect(cli("info", BASIC).stdout).toContain("stand-ins: 1 shape");
    const schema = JSON.parse(cli("schema").stdout) as { $schema: string; $defs: object };
    expect(schema.$schema).toContain("2020-12");
    expect(Object.keys(schema.$defs)).toContain("Clip.video");
  });
});

describe("paths on Windows", () => {
  it("reads C:\\x, C:/x and /c/x alike", () => {
    expect(normalizeCliPath("/c/Users/x", "win32")).toBe("C:/Users/x");
    expect(normalizeCliPath("C:\\Users\\x", "win32")).toBe("C:\\Users\\x");
    expect(normalizeCliPath("C:/Users/x", "win32")).toBe("C:/Users/x");
    expect(normalizeCliPath("/c/Users/x", "linux")).toBe("/c/Users/x");
  });
});

describe("validateStrict", () => {
  it("accepts the documents the app itself writes (createProject, randomProject seeds with trimmed keyframes)", () => {
    const fresh = createProject({ id: "p1", name: "x", now: "2026-01-01T00:00:00.000Z", appVersion: "1" });
    expect(validateStrict(JSON.parse(JSON.stringify(fresh))).errors).toEqual([]);
    for (let seed = 1; seed <= 40; seed++) {
      const result = validateStrict(JSON.parse(JSON.stringify(randomProject(random(seed)))));
      expect(result.errors, `seed ${seed}`).toEqual([]);
    }
  });

  it("accepts the documents left by runs of edit operations (trimmed cues, pasted offline media, trimmed keys)", () => {
    const strictCheck = (_before: Project, after: Project) => validateStrict(JSON.parse(JSON.stringify(after))).errors.map((issue) => `${issue.path}: ${issue.message}`);
    for (let seed = 1; seed <= 12; seed++) fuzzRun({ seed, steps: 150, projectOptions: { captions: true }, check: strictCheck });
  }, 60_000);

  it("accepts a cue trimmed in past its first words (their frames go negative and are kept for a trim back)", () => {
    const project = readProject(`${BASIC}/project.json`) as unknown as Project;
    const trimmed = applyTrim(project, trimEdge(project, "q1", "in", 15, { ripple: false }));
    const words = (trimmed.clips["q1"] as { words?: { start: number; end: number }[] }).words ?? [];
    expect(words[0]?.start).toBeLessThan(0);
    expect(validateStrict(JSON.parse(JSON.stringify(trimmed))).errors).toEqual([]);
  });

  const basic = () => readProject(`${BASIC}/project.json`);

  it("opens a project saved before this batch (schema 3, no generator or stand-in) unchanged", () => {
    const old = basic();
    old.schemaVersion = 3;
    delete old.meta.generator;
    delete old.clips["c-standin"].fallbackOf;
    const result = validateStrict(old);
    expect(result.errors).toEqual([]);
    expect(result.project?.schemaVersion).toBe(6);
    expect(result.project?.clips["c-video"]).toEqual(old.clips["c-video"]);
  });

  it("refuses a project of a newer schema", () => {
    const future = basic();
    future.schemaVersion = 99;
    expect(validateStrict(future).errors[0]?.path).toBe("schemaVersion");
  });

  it("checks the outer shape of fallbackOf and requires data.kind to equal kind; data itself is free", () => {
    const withBlock = (block: unknown) => {
      const p = basic();
      p.clips["c-standin"].fallbackOf = block;
      return validateStrict(p).errors;
    };
    expect(withBlock({ kind: "shape", reason: "x", schemaVersion: 4, data: { kind: "shape", anything: { goes: [1, 2, { x: 1.5 }] } } })).toEqual([]);
    expect(withBlock({ kind: "shape", reason: "x", schemaVersion: 4, data: { kind: "lottie" } }).map((e) => e.message).join()).toContain("fallbackOf.data.kind");
    expect(withBlock({ kind: "shape", reason: "x", schemaVersion: 4, headTrim: -1, data: { kind: "shape" } })[0]?.path).toBe("clips.c-standin.fallbackOf.headTrim");
    expect(withBlock({ kind: "shape", reason: "x", schemaVersion: 4, headTrim: 1.5, data: { kind: "shape" } })[0]?.path).toBe("clips.c-standin.fallbackOf.headTrim");
    expect(withBlock({ kind: "shape", schemaVersion: 4, data: { kind: "shape" } })[0]?.path).toBe("clips.c-standin.fallbackOf.reason");
    expect(withBlock({ kind: "shape", reason: "x", schemaVersion: 4, data: "no" })[0]?.path).toBe("clips.c-standin.fallbackOf.data");
  });

  it("checks meta.generator", () => {
    const p = basic();
    p.meta.generator = { version: "1" };
    expect(validateStrict(p).errors[0]?.path).toBe("meta.generator.name");
    p.meta.generator = { name: "x", extra: 1 };
    expect(validateStrict(p).errors[0]?.path).toBe("meta.generator.extra");
  });

  it("describes a value against a named object", () => {
    expect(strictIssues("Crop", { left: 0, top: 0, right: 0, bottom: 2 })[0]?.path).toBe("bottom");
    expect(strictIssues("Crop", { left: 0, top: 0, right: 0, bottom: 0 })).toEqual([]);
  });
});

describe("docs/INTEROP.md (spec §21.4)", () => {
  const doc = readText("docs/INTEROP.md");
  const blocks = [...doc.matchAll(/^```(json[^\n]*)\n([\s\S]*?)^```/gm)].map((m) => ({ info: (m[1] as string).trim(), body: m[2] as string }));

  it("has a generated field reference that is up to date (run `npm run docs:interop`)", () => {
    const begin = doc.indexOf(FIELDS_BEGIN_START);
    const end = doc.indexOf(FIELDS_END);
    expect(begin).toBeGreaterThan(0);
    expect(doc.slice(begin, end + FIELDS_END.length)).toBe(fieldReference());
  });

  it("validates every JSON example with the strict validator", () => {
    const tagged = blocks.filter((block) => block.info !== "jsonc");
    expect(tagged.length).toBeGreaterThanOrEqual(6);
    for (const { info, body } of tagged) {
      const type = info.replace(/^json\s*/, "");
      expect(type, "a json block needs a type: json <Type> (or jsonc for an excerpt)").not.toBe("");
      const value: unknown = JSON.parse(body);
      if (type === "Project") expect(validateStrict(value).errors, "Project example").toEqual([]);
      else {
        expect(FIELD_TABLE[type], `unknown type ${type}`).toBeDefined();
        expect(strictIssues(type, value), `${type} example`).toEqual([]);
      }
    }
  });

  it("mentions every command and the manifest keys of this batch", () => {
    for (const word of ["validate", "info", "schema", "capabilities", "fallbackOf", "generatorMeta", "headTrim"]) expect(doc).toContain(word);
  });
});

describe("fixtures/interop/captions-v2 (Batch 59)", () => {
  const V2 = "fixtures/interop/captions-v2";

  it("is valid and uses every Captions v2 field: progressive and reveal, emphasis, a word color, cue animations, word boxes", async () => {
    const report = await validateProjectFolder(rel(V2));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${V2}/project.json`);
    const style = project.captionTracks.cc1.style;
    expect(style.highlight).toMatchObject({ mode: "progressive", emphasisColor: { r: 1 } });
    expect(style.anim).toEqual({ in: { kind: "fade", frames: 2 }, out: { kind: "fade", frames: 2 } });
    expect(style.text.background.mode).toBe("word");
    expect(project.clips.q1.words[2].emphasis).toBe(true);
    expect(project.clips.q2.words[3].color).toBeDefined();
    expect(project.clips.q2.styleOverride).toMatchObject({ highlight: { mode: "reveal" }, anim: { out: { kind: "pop", frames: 2 } } });
  });
});
