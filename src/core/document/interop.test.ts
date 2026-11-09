import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCliPath, projectInfo, validateProjectFolder } from "../../../scripts/cli/folder.js";
import { EXTRA_KEYFRAME_PROPS } from "./keyframes.js";
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
  }, 30_000);

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
    expect(result.project?.schemaVersion).toBe(18);
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

describe("fixtures/interop/keyframes (Batch 60)", () => {
  const KF = "fixtures/interop/keyframes";

  it("is valid and keys every property of spec §21.9 on a clip that has it", async () => {
    const report = await validateProjectFolder(rel(KF));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${KF}/project.json`);
    const keyed = new Set<string>();
    const all = Object.values(project.clips) as { keyframes?: Record<string, { ease: string }[]> }[];
    for (const clip of all) for (const prop of Object.keys(clip.keyframes ?? {})) keyed.add(prop);
    for (const prop of EXTRA_KEYFRAME_PROPS) expect(keyed.has(prop), prop).toBe(true);
    const eases = new Set<string>();
    for (const clip of all) for (const list of Object.values(clip.keyframes ?? {})) for (const key of list) eases.add(key.ease);
    for (const ease of ["hold", "linear", "backOut", "expoInOut", "bezier", "spring", "bounceOut", "cubicInOut"]) expect(eases.has(ease), ease).toBe(true);
    expect(project.clips.hold.keyframes.fill[0].ease).toBe("hold");
    expect(project.clips.fade.keyframes.fill[0].ease).toBe("linear");
  });

  it("opens a schema 6 project with v1 eases unchanged (migration 6 to 7)", () => {
    const old = readProject(`${KF}/project.json`);
    old.schemaVersion = 6;
    old.clips = {
      bg: old.clips.bg,
      label: { ...old.clips.label, keyframes: { opacity: [{ frame: 0, value: 0, ease: "easeInOut" }, { frame: 10, value: 1, ease: "overshoot" }] } },
    };
    old.tracks = old.tracks.filter((track: { id: string }) => ["v1", "v6"].includes(track.id));
    const result = validateStrict(old);
    expect(result.errors).toEqual([]);
    expect(result.project?.schemaVersion).toBe(18);
    expect((result.project?.clips.label as { keyframes?: unknown } | undefined)?.keyframes).toEqual(old.clips.label.keyframes);
  });

  it("refuses a key of a property the clip kind does not have and a color that is not four numbers", () => {
    const project = readProject(`${KF}/project.json`);
    project.clips.label.keyframes = { "size.w": [{ frame: 0, value: 1, ease: "linear" }] };
    expect(validateStrict(project).errors.map((e) => e.message).join("\n")).toMatch(/not a property of a text clip/);
    const bad = readProject(`${KF}/project.json`);
    bad.clips.hold.keyframes.fill[0].value = [1, 0, 0];
    expect(validateStrict(bad).errors.map((e) => e.message).join("\n")).toMatch(/must be a color/);
    const wide = readProject(`${KF}/project.json`);
    wide.clips.hold.keyframes.fill[0].value = [1, 0, 0, 1, 1];
    expect(validateStrict(wide).ok).toBe(false);
  });
});

describe("fixtures/interop/compound (Batch 62)", () => {
  const COMPOUND = "fixtures/interop/compound";

  it("is valid: a card sequence shown twice (one instance windowed), nested into a second sequence, with audio inside", async () => {
    const report = await validateProjectFolder(rel(COMPOUND));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${COMPOUND}/project.json`);
    expect(Object.keys(project.sequences)).toEqual(["card", "badge"]);
    expect(project.clips.a.sequenceId).toBe("card");
    expect(project.clips.b.sequenceId).toBe("card");
    expect(project.clips.b.offset).toBe(10);
    expect(project.clips["badge-card"].sequenceId).toBe("card");
    expect(project.clips["card-audio"].kind).toBe("audio");
    expect(project.clips["card-image"].kind).toBe("image");
  });

  it("refuses a sequence that contains itself, a missing sequence and a clip past the sequence's end", () => {
    const loop = readProject(`${COMPOUND}/project.json`);
    loop.clips["badge-card"].sequenceId = "badge";
    expect(validateStrict(loop).errors.map((e) => e.message).join("\n")).toMatch(/contains itself/);
    const missing = readProject(`${COMPOUND}/project.json`);
    missing.clips.a.sequenceId = "nope";
    expect(validateStrict(missing).ok).toBe(false);
    const late = readProject(`${COMPOUND}/project.json`);
    late.clips["card-bg"].duration = 90;
    expect(validateStrict(late).ok).toBe(false);
  });
});

describe("fixtures/interop/alpha (Batch 64)", () => {
  const ALPHA = "fixtures/interop/alpha";

  it("is valid: a VP9 alpha WebM under 300 KB and a 30-frame PNG sequence whose files are all there", async () => {
    const report = await validateProjectFolder(rel(ALPHA));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${ALPHA}/project.json`);
    expect(project.media.m1).toMatchObject({ kind: "video", alpha: true, codec: "vp9" });
    expect(project.media.m1.size).toBeLessThan(300_000);
    const sequence = project.media.m2.sequence;
    expect(sequence).toMatchObject({ count: 30, pattern: "frame_%04d.png", first: 1 });
    for (let n = sequence.first; n < sequence.first + sequence.count; n++) {
      expect(readFileSync(`${ALPHA}/media/sequence/frame_${String(n).padStart(4, "0")}.png`).length).toBeGreaterThan(0);
    }
  });

  it("refuses a sequence with a bad pattern, a count of zero or a folder outside the project", () => {
    for (const patch of [{ pattern: "frame.png" }, { count: 0 }, { dir: "../outside" }]) {
      const project = readProject(`${ALPHA}/project.json`);
      Object.assign(project.media.m2.sequence, patch);
      expect(validateStrict(project).ok, JSON.stringify(patch)).toBe(false);
    }
  });
});

describe("fixtures/interop/shapes (Batch 65)", () => {
  const SHAPES = "fixtures/interop/shapes";

  it("is valid: a checkmark drawing on, a gauge arc 0 to 270 degrees, a star, a dashed arrow, nonzero and evenodd fills and every primitive", async () => {
    const report = await validateProjectFolder(rel(SHAPES));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${SHAPES}/project.json`);
    const clips = project.clips;
    expect(clips.check.keyframes["paths.tick.trim.end"].map((k: { frame: number; value: number }) => [k.frame, k.value])).toEqual([[0, 0], [10, 1]]);
    expect(clips.gauge.paths[1].stroke.cap).toBe("round");
    expect(clips.gauge.keyframes["paths.value.primitive.end"].map((k: { value: number }) => k.value)).toEqual([0, 270]);
    expect(clips.arrow.keyframes["paths.arrow.stroke.dashOffset"]).toHaveLength(2);
    expect(clips.nonzero.paths[0].fillRule).toBe("nonzero");
    expect(clips.evenodd.paths[0].fillRule).toBe("evenodd");
    const kinds = new Set<string>();
    for (const clip of Object.values(clips) as { kind: string; paths?: { primitive?: { kind: string } }[] }[]) for (const path of clip.paths ?? []) if (path.primitive) kinds.add(path.primitive.kind);
    expect([...kinds].sort()).toEqual(["arc", "arrow", "ellipse", "line", "polygon", "rect", "star"]);
    expect(readFileSync(`${SHAPES}/expected/Interop shapes-frame-10.png`).length).toBeGreaterThan(0);
  });

  it("refuses a key on a path that does not exist, a stroke key on a path without a stroke, bad path data and a trim past 1", () => {
    const missing = readProject(`${SHAPES}/project.json`);
    missing.clips.check.keyframes["paths.nope.trim.end"] = missing.clips.check.keyframes["paths.tick.trim.end"];
    expect(validateStrict(missing).ok).toBe(false);
    const unstroked = readProject(`${SHAPES}/project.json`);
    unstroked.clips.nonzero.keyframes = { "paths.p.stroke.width": [{ frame: 0, value: 4, ease: "linear" }] };
    expect(validateStrict(unstroked).ok).toBe(false);
    const bad = readProject(`${SHAPES}/project.json`);
    bad.clips.nonzero.paths[0].d = "M 0 0 L";
    expect(validateStrict(bad).ok).toBe(false);
    const trim = readProject(`${SHAPES}/project.json`);
    trim.clips.check.paths[0].trim.end = 1.5;
    expect(validateStrict(trim).ok).toBe(false);
  });
});

describe("fixtures/interop/svg (Batch 66)", () => {
  const SVG = "fixtures/interop/svg";

  it("is valid: four imported icons, a tick drawing on, a gradient, dashes and an evenodd fill", async () => {
    const report = await validateProjectFolder(rel(SVG));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    const project = readProject(`${SVG}/project.json`);
    expect(Object.keys(project.clips).sort()).toEqual(["arrow", "badge", "check", "gauge"]);
    expect(Object.keys(project.clips.check.keyframes)).toEqual(["paths.check-2.trim.end"]);
    expect(project.clips.gauge.paths[0].fill.type).toBe("linear");
    expect(project.clips.arrow.paths[0].stroke.dash).toEqual([6, 5]);
    expect(project.clips.badge.paths.some((path: { fillRule: string }) => path.fillRule === "evenodd")).toBe(true);
  });
});
